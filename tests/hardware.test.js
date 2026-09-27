'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { detectGpu } = require('../build/app/hardware');

function runnerFor(responses, calls = []) {
  return async (command, args, options) => {
    calls.push({ command, args, options });
    const response = responses[command];
    if (response instanceof Error) throw response;
    if (typeof response === 'function') return response(args, options);
    if (response === undefined) throw new Error('command not found');
    return response;
  };
}

test('prefers nvidia-smi and parses quoted GPU names and MiB', async () => {
  const calls = [];
  const result = await detectGpu({
    platform: 'linux',
    run: runnerFor({ 'nvidia-smi': '"NVIDIA, GeForce RTX 4080", 16376\n' }, calls),
  });
  assert.deepEqual(result, { name: 'NVIDIA, GeForce RTX 4080', memoryBytes: 16376 * 1024 ** 2, source: 'nvidia-smi' });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].args, ['--query-gpu=name,memory.total', '--format=csv,noheader,nounits']);
  assert.ok(calls[0].options.timeoutMs <= 5000);
});

test('Linux Vulkan provides only explicit device-local heap memory', async () => {
  const result = await detectGpu({
    platform: 'linux',
    run: runnerFor({
      'vulkaninfo': 'deviceName = AMD Radeon RX 7800 XT\nmemoryHeaps[0]:\n size = 16368 MiB\n flags: DEVICE_LOCAL\n',
    }),
  });
  assert.deepEqual(result, { name: 'AMD Radeon RX 7800 XT', memoryBytes: 16368 * 1024 ** 2, source: 'vulkaninfo' });
});

test('Linux lspci fallback identifies the GPU without guessing VRAM', async () => {
  const result = await detectGpu({
    platform: 'linux',
    run: runnerFor({
      'lspci': '01:00.0 VGA compatible controller [0300]: NVIDIA Corporation AD104 [GeForce RTX 4070] [10de:2786]\n',
    }),
  });
  assert.deepEqual(result, { name: 'NVIDIA Corporation AD104 [GeForce RTX 4070]', memoryBytes: null, source: 'lspci' });
});

test('Windows falls back to CIM and ignores the overflowing 32-bit AdapterRAM value', async () => {
  let script = '';
  const result = await detectGpu({
    platform: 'win32',
    run: runnerFor({
      'nvidia-smi': new Error('not installed'),
      'powershell.exe': (args) => { script = args.join(' '); return '{"Name":"Intel(R) UHD Graphics","AdapterRAM":4294967295}'; },
    }),
  });
  assert.equal(result.name, 'Intel(R) UHD Graphics');
  assert.equal(result.memoryBytes, null);
  assert.equal(result.source, 'powershell-cim');
  assert.match(script, /Win32_VideoController/);
});

test('macOS parses system_profiler JSON and explicit VRAM', async () => {
  const result = await detectGpu({
    platform: 'darwin',
    run: runnerFor({
      'nvidia-smi': new Error('not installed'),
      'system_profiler': JSON.stringify({ SPDisplaysDataType: [{ sppci_model: 'Apple M3 Max', spdisplays_vram: '40 GB' }] }),
    }),
  });
  assert.deepEqual(result, { name: 'Apple M3 Max', memoryBytes: 40 * 1024 ** 3, source: 'system_profiler' });
});

test('missing tools, invalid output and timeouts safely return null fields', async () => {
  const result = await detectGpu({ platform: 'darwin', run: async (_command, _args, options) => {
    assert.ok(options.timeoutMs <= 5000);
    throw new Error('timed out');
  } });
  assert.deepEqual(result, { name: null, memoryBytes: null, source: null });
});
