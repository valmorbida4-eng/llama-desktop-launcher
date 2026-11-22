'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const reviewer = require('../build/app/reviewer');
const decider = require('../build/app/decider');

const model = { path: 'C:\\models\\gemma.gguf', engine: 'llamacpp', decision: null };

test('o revisor sobe inteiro no dispositivo, em loopback e sem ajuste automático', () => {
  const args = reviewer.serverArgs(model, { device: 'Vulkan1', context: '8192' }, 8081, { flash: 'off', batch: '512' }).join(' ');
  for (const part of ['-c 8192', '-fit off', '-dev Vulkan1', '-ngl 999', '-b 512', '-fa off', '--parallel 1', '--alias modelo-revisor', '--host 127.0.0.1', '--port 8081']) assert.ok(args.includes(part), part);
  assert.ok(!args.includes('0.0.0.0'));
  assert.ok(reviewer.memoryArgs({ device: 'cpu' }).join(' ').includes('-dev none -ngl 0'));
});

test('no Vulkan o microbatch fica em até 128 para o driver não reiniciar', () => {
  const ubatch = (device, value) => { const a = reviewer.memoryArgs({ device }, value ? { ubatch: value } : {}); const at = a.indexOf('-ub'); return at < 0 ? null : a[at + 1]; };
  assert.equal(ubatch('Vulkan0'), '128');
  assert.equal(ubatch('Vulkan1', '512'), '128');
  assert.equal(ubatch('Vulkan1', '64'), '64');
  assert.equal(ubatch('CUDA0', '512'), '512');
  assert.equal(ubatch('cpu'), null);
});

test('do perfil só entram ajustes que não mudam onde o modelo roda', () => {
  const args = reviewer.memoryArgs({ device: 'Vulkan1' }, { device: 'Vulkan0', gpuLayers: '4', context: '65536', extraArgs: '--host 0.0.0.0', threads: '6' }).join(' ');
  assert.ok(!/Vulkan0|65536|0\.0\.0\.0|-ngl 4\b/.test(args));
  assert.ok(args.includes('-t 6'));
});

test('o revisor recusa modelos de decisão, outros motores e opções inválidas', () => {
  assert.throws(() => reviewer.serverArgs({ ...model, decision: 'kev' }, {}, 8081), /gere texto/);
  assert.throws(() => reviewer.serverArgs({ ...model, engine: 'vllm' }, {}, 8081), /GGUF/);
  assert.throws(() => reviewer.validateOptions({ context: 512 }), /Contexto/);
  assert.throws(() => reviewer.validateOptions({ device: 'cpu --host x' }), /Dispositivo/);
  assert.deepEqual(reviewer.validateOptions({}), { device: '', context: '8192' });
});

test('revisor e decisor têm faixas de porta separadas', () => {
  assert.deepEqual(reviewer.PORTS, { first: 8081, last: 8089 });
  assert.ok(reviewer.PORTS.last < decider.PORTS.first);
});

test('a estimativa do decisor usa a memória dos argumentos do servidor', () => {
  for (const device of ['', 'cpu', 'Vulkan1']) {
    const server = decider.serverArgs({ path: 'd.gguf' }, { device }, 8090).join(' ');
    const memory = decider.memoryArgs({ device });
    assert.ok(server.includes(memory.slice(0, 6).join(' ')));
    assert.ok(server.endsWith(memory.slice(6).join(' ')));
  }
});
