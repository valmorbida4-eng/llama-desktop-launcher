'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const resources = require('../build/app/resources');
const { createPlanner } = require('../build/app/admission');

// Números medidos numa RX 6600 de 8 GB com GPU integrada e 32 GB de RAM.
const RX = { name: 'Vulkan0', description: 'AMD Radeon RX 6600', total: 8176, budget: 7378, free: 6955, kind: 'dedicated', luid: 'AA' };
const IGPU = { name: 'Vulkan1', description: 'AMD Radeon(TM) Graphics', total: 16328, budget: 15511, free: null, kind: 'shared', luid: 'BB' };
const machine = (over = {}) => ({ available: 18000, devices: [RX, IGPU], processes: [], usage: [], ...over });
const need = (over = {}) => ({ vram: {}, shared: {}, ram: 0, elastic: 0, ...over });

test('lê a tabela do --fit-print e ignora o resto da saída', () => {
  assert.deepEqual(resources.parsePrint('log qualquer\nVulkan1 4810 306 131\r\nHost 545 0 10\n'), [
    { name: 'Vulkan1', model: 4810, context: 306, compute: 131 }, { name: 'Host', model: 545, context: 0, compute: 10 },
  ]);
  assert.equal(resources.parsePrint('erro: modelo inválido'), null);
});

test('o script do Windows só recebe PIDs inteiros', () => {
  const script = resources.probeScript([12, -1, 3.5, '9;calc', NaN, 44]);
  assert.ok(script.includes('$ids=@(12,44)'));
  assert.ok(!script.includes('calc'));
});

test('medição do Windows descarta adaptadores antigos do registro e soma o uso por LUID', () => {
  const parsed = resources.parseWindows(JSON.stringify({
    availableKiB: 18 * 1024 * 1024,
    adapters: [{ luid: '0000000000016153', name: 'AMD Radeon RX 6600', total: 8176 * resources.MIB }, { luid: '000000000000AAAA', name: 'AMD Radeon RX 6600', total: 8176 * resources.MIB }],
    adapterUsage: { name: 'luid_0x00000000_0x00016153_phys_0', used: 1221 * resources.MIB },
    processes: { id: 40, workingSet: 5800 * resources.MIB },
    processUsage: [{ name: 'pid_40_luid_0x00000000_0x00016153_phys_0', used: 1000 * resources.MIB }, { name: 'pid_77_luid_0x00000000_0x00016153_phys_0', used: 5 }],
  }));
  assert.equal(parsed.available, 18 * 1024);
  assert.equal(parsed.adapters.length, 1);
  assert.equal(Math.round(parsed.adapters[0].used), 1221);
  assert.deepEqual(parsed.usage, [{ id: 40, luid: '0000000000016153', dedicated: 1000 }]);
  assert.equal(resources.parseWindows('não é JSON'), null);
});

test('a VRAM livre vem do sistema, não do orçamento do llama.cpp', () => {
  const listed = [{ name: 'Vulkan0', description: RX.description, totalMiB: 8176, freeMiB: 5739 }, { name: 'Vulkan1', description: IGPU.description, totalMiB: 16328, freeMiB: 15511 }];
  const adapters = [{ luid: 'AA', name: RX.description, total: 8176, used: 6630 }, { luid: 'BB', name: IGPU.description, total: 492, used: 100 }];
  const [gpu, integrated] = resources.bindDevices(listed, { adapters, platform: 'win32' });
  assert.equal(gpu.free, 1546);
  assert.equal(gpu.budget, 5739);
  assert.equal(gpu.kind, 'dedicated');
  assert.equal(integrated.kind, 'shared');
  assert.equal(integrated.free, null);
  assert.equal(resources.bindDevices(listed, { platform: 'win32' })[0].free, null, 'sem medição não inventa');
});

test('a estimativa separa VRAM, RAM usada na carga e RAM elástica', () => {
  const qwen = resources.needOf([{ name: 'Vulkan1', model: 4810, context: 306, compute: 131 }, { name: 'Host', model: 545, context: 0, compute: 10 }], [RX, IGPU], { file: 5366 });
  assert.deepEqual(qwen, need({ shared: { Vulkan1: 5247 }, ram: 5258, elastic: 555 }));
  const e4b = resources.needOf([{ name: 'Vulkan0', model: 2868, context: 158, compute: 141 }, { name: 'Host', model: 2730, context: 0, compute: 12 }], [RX, IGPU], { file: 5088, projector: 900 });
  assert.deepEqual(e4b.vram, { Vulkan0: 4067 });
  assert.equal(e4b.ram, 0);
  assert.ok(resources.needOf(null, [RX]).unknown);
});

test('cálculo da CPU e pesos em mmap não bloqueiam a carga do decisor', () => {
  const kev = resources.needOf([{ name: 'Vulkan1', model: 4265, context: 178, compute: 664 }, { name: 'Host', model: 644, context: 0, compute: 4604 }], [RX, IGPU], { file: 4276 });
  assert.equal(kev.ram, 5107);
  assert.equal(kev.elastic, 5248);
  assert.equal(resources.assess([kev], machine({ available: 8000 })).level, 'tight');
  assert.equal(resources.assess([kev], machine({ available: 6000 })).level, 'no');
  assert.equal(resources.assess([kev], machine()).level, 'ok');
});

test('classifica cabe, no limite, não cabe e sem medição', () => {
  const level = (n, snapshot = machine()) => resources.assess(n, snapshot).level;
  assert.equal(level([need({ vram: { Vulkan0: 5000 } })]), 'ok');
  assert.equal(level([need({ vram: { Vulkan0: 6600 } })]), 'tight');
  assert.equal(level([need({ vram: { Vulkan0: 7000 } })]), 'no');
  assert.equal(level([need({ vram: { Vulkan0: 4000 } }), need({ vram: { Vulkan0: 4000 } })]), 'no', 'soma os papéis');
  assert.equal(level([need({ shared: { Vulkan1: 17000 }, ram: 17000 })], machine({ available: 30000 })), 'no');
  assert.equal(level([need({ ram: 17500 })]), 'no');
  assert.equal(level([need({ ram: 1000, elastic: 15000 })]), 'tight');
  assert.equal(level([resources.unknownNeed('sem estimativa')]), 'unknown');
  assert.equal(level([need({ ram: 10 })], machine({ available: null })), 'unknown');
  assert.equal(level([need({ vram: { Vulkan0: 7000 } }), resources.unknownNeed('x')]), 'no', 'um não cabe certo vence');
  assert.match(resources.assess([need({ vram: { Vulkan0: 7000 } })], machine()).text, /^Não cabe: VRAM de AMD Radeon RX 6600/);
});

test('a margem do -fit cobre o que os vizinhos usam e respeita uma margem maior do perfil', () => {
  const profile = { device: 'Vulkan0' };
  assert.equal(resources.adjustedTarget(profile, machine()), 424 - 1 + 1024);
  assert.equal(resources.adjustedTarget({ ...profile, fitTarget: '2048' }, machine()), null);
  const busy = machine({ devices: [{ ...RX, free: 1546 }, IGPU] });
  assert.equal(resources.adjustedTarget({ ...profile, fitTarget: '2048' }, busy), 7378 - 1546 + 1024);
  assert.equal(resources.adjustedTarget({ ...profile, gpuLayers: '20' }, busy), null);
  assert.equal(resources.adjustedTarget({ device: 'Vulkan1' }, busy), null);
});

test('dispositivo automático prefere folga e deixa a CPU por último', () => {
  const pick = (levels) => resources.chooseDevice(Object.entries(levels).map(([kind, level]) => ({ kind, result: { level } }))).kind;
  assert.equal(pick({ dedicated: 'ok', shared: 'ok', cpu: 'ok' }), 'dedicated');
  assert.equal(pick({ dedicated: 'tight', shared: 'ok', cpu: 'ok' }), 'shared');
  assert.equal(pick({ dedicated: 'no', shared: 'tight', cpu: 'ok' }), 'shared');
  assert.equal(pick({ dedicated: 'no', shared: 'no', cpu: 'ok' }), 'cpu');
});

test('considerar processos parados devolve a memória deles', () => {
  const now = machine({ available: 10000, devices: [{ ...RX, free: 1500 }, IGPU], processes: [{ id: 4, workingSet: 2000 }], usage: [{ id: 4, luid: 'AA', dedicated: 5000 }] });
  const after = resources.withoutProcesses(now, [4]);
  assert.equal(after.available, 12000);
  assert.equal(after.devices[0].free, 6500);
  assert.equal(resources.withoutProcesses(now, [4, 5]), null);
});

test('o trio evita revisor lento e modelos da mesma família', () => {
  const gib = 1024 ** 3;
  const main = (name, size, architecture, vram) => ({ path: name, name, size: size * gib, architecture, need: need({ vram: { Vulkan0: vram } }) });
  const reviewer = (name, size, architecture, ram) => ({ path: name, name, size: size * gib, architecture, kind: 'shared', device: 'Vulkan1', need: need({ shared: { Vulkan1: ram }, ram }) });
  const best = resources.suggestTrio({
    mains: [main('qwen9', 5.24, 'qwen35', 5247), main('e4b', 4.97, 'gemma4', 4100)],
    reviewers: [reviewer('qwen9', 5.24, 'qwen35', 5258), reviewer('e4b', 4.97, 'gemma4', 3200), reviewer('gptoss', 11.3, 'openai-moe', 11500), reviewer('qwen-irmão', 5.2, 'qwen3', 5000)],
    deciders: [{ path: 'julia', name: 'julia', rank: 0, device: 'Vulkan1', need: need({ ram: 250 }) }],
    snapshot: machine(),
  });
  assert.deepEqual([best.main.name, best.reviewer.name, best.decider.name], ['qwen9', 'e4b', 'julia']);
  const none = resources.suggestTrio({ mains: [main('a', 9, 'x', 9000)], reviewers: [reviewer('b', 1, 'y', 900)], deciders: [], snapshot: machine() });
  assert.equal(none, null);
});

test('o trio põe na CPU só o decisor muito pequeno', async () => {
  const run = async (file, args) => {
    if (args.includes('none')) return { stdout: 'Host 160 60 20\n' };
    const at = args.indexOf('-dev');
    return { stdout: `${at < 0 ? 'Vulkan0' : args[at + 1]} 1200 100 100\nHost 10 0 10\n` };
  };
  const pick = async (size) => {
    const planner = createPlanner({ engineDir: () => os.tmpdir(), run, measure: async () => machine(), nvidia: async () => [], listDevices: async () => [] });
    const models = [{ path: 'p', name: 'p', size: 1200 * resources.MIB }, { path: 'r', name: 'r', size: 1100 * resources.MIB }, { path: 'd', name: 'd', size: size * resources.MIB, decision: 'x' }];
    return (await planner.trio({ models, architecture: (m) => m.path })).decider;
  };
  const tiny = await pick(160);
  assert.deepEqual([tiny.device, tiny.small], ['cpu', true]);
  const bigger = await pick(388);
  assert.deepEqual([bigger.device, bigger.small], ['Vulkan1', false]);
});

test('com um decisor maior salvo, o muito pequeno vai como opção na CPU', async () => {
  const run = async (file, args) => {
    const at = args.indexOf('-dev');
    if (args.includes('none')) return { stdout: 'Host 160 60 20\n' };
    return { stdout: `${at < 0 ? 'Vulkan0' : args[at + 1]} 1200 100 100\nHost 10 0 10\n` };
  };
  const planner = createPlanner({ engineDir: () => os.tmpdir(), run, measure: async () => machine(), nvidia: async () => [], listDevices: async () => [] });
  const file = (id, size, decision) => ({ path: id, name: id, size: size * resources.MIB, decision });
  const found = await planner.trio({ models: [file('p', 1200), file('r', 1100), file('grande', 900, 'x'), file('mini', 160, 'x')], deciderOrder: ['grande'], architecture: (m) => m.path });
  assert.equal(found.decider.path, 'grande');
  assert.deepEqual([found.cpuDecider.path, found.cpuDecider.device], ['mini', 'cpu']);
});

test('um GGUF que o motor não lê é tentado uma vez só', async () => {
  let attempts = 0;
  const run = async () => { attempts++; throw Error('llama-fit-params.exe falhou: E llama_model_load_from_file_impl: failed to load model'); };
  const planner = createPlanner({ engineDir: () => os.tmpdir(), run });
  const checked = await planner.reviewer({ path: path.join(os.tmpdir(), 'ptq1.gguf'), size: 1 }, {}, {}, machine());
  assert.equal(checked.result.level, 'unknown');
  assert.equal(attempts, 1);
});

test('o planejador usa o motor só para estimar', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'planner-'));
  try {
    const model = { path: path.join(dir, 'm.gguf'), name: 'm.gguf', size: 5366 * resources.MIB };
    const calls = [];
    const run = async (file, args) => {
      assert.match(file, /llama-fit-params/);
      calls.push(args.join(' '));
      if (args.includes('none')) return { stdout: 'Host 5355 306 40\n' };
      const device = args[args.indexOf('-dev') + 1];
      return { stdout: `${device} 4810 306 131\nHost 545 0 10\n` };
    };
    const planner = createPlanner({ engineDir: () => dir, run });
    const free = await planner.reviewer(model, {}, { ubatch: '512' }, machine());
    assert.equal(free.device, 'Vulkan0');
    assert.ok(calls[0].includes('-ub 128'), 'a estimativa usa os argumentos do servidor');
    assert.ok(calls.every((c) => c.includes('-fit off') && c.endsWith('--fit-print on')));
    const busy = await planner.reviewer(model, {}, {}, machine({ devices: [{ ...RX, free: 1500 }, IGPU] }));
    assert.equal(busy.device, 'Vulkan1');
    const forced = await planner.reviewer(model, { device: 'Vulkan0' }, {}, machine({ devices: [{ ...RX, free: 1500 }, IGPU] }));
    assert.equal(forced.result.level, 'no');
    await assert.rejects(planner.reviewer(model, { device: 'CUDA3' }, {}, machine()), /não encontrou o dispositivo/);
    const failing = createPlanner({ engineDir: () => dir, run: async () => { throw Error('sem binário'); } });
    assert.equal((await failing.decider(model, { device: 'Vulkan1' }, machine())).level, 'unknown', 'sem estimativa avisa, não bloqueia');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
