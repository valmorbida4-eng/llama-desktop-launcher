'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const roles = require('../build/app/role_engines');
const { createPlanner } = require('../build/app/admission');

const server = process.platform === 'win32' ? 'llama-server.exe' : 'llama-server';
function engine(root, name, libraries = [], manifest = null) {
  const dir = path.join(root, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, server), '');
  for (const file of libraries) fs.writeFileSync(path.join(dir, file), '');
  if (manifest) roles.writeManifest(dir, manifest);
  return dir;
}
function tempRoot() { return fs.mkdtempSync(path.join(os.tmpdir(), 'role-engines-')); }

test('identifica o backend pelas bibliotecas do motor', () => {
  const root = tempRoot();
  try {
    assert.deepEqual(roles.detectBackends(engine(root, 'a', ['ggml-cuda.dll', 'ggml-cpu-x64.dll']), 'win32'), ['CUDA']);
    assert.deepEqual(roles.detectBackends(engine(root, 'b', ['ggml-vulkan.dll']), 'win32'), ['Vulkan']);
    assert.deepEqual(roles.detectBackends(engine(root, 'c', ['ggml-cuda.dll', 'ggml-vulkan.dll']), 'win32').sort(), ['CUDA', 'Vulkan']);
    assert.deepEqual(roles.detectBackends(engine(root, 'd', ['libggml-hip.so']), 'linux'), ['ROCm']);
    assert.deepEqual(roles.detectBackends(engine(root, 'e', ['ggml-cpu-zen4.dll']), 'win32'), []);
    assert.deepEqual(roles.detectBackends(engine(root, 'f'), 'darwin'), ['Metal']);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('lista os motores instalados com o principal primeiro e ignora pastas sem llama-server', () => {
  const root = tempRoot();
  try {
    const vulkan = engine(root, '1795188385480', ['ggml-vulkan.dll'], { release: 'b12359', backend: 'vulkan' });
    const cuda = engine(root, '1795299000000', ['ggml-cuda.dll']);
    fs.mkdirSync(path.join(root, '1795300000000'));
    fs.mkdirSync(path.join(root, '.llama-desktop-temp'));
    const list = roles.listInstalled(root, cuda, { mainRelease: 'b12400' });
    assert.deepEqual(list.map(e => e.dir), [cuda, vulkan]);
    assert.equal(list[0].main, true);
    assert.match(list[0].label, /^CUDA · b12400 · instalado em \d{4}-\d{2}-\d{2}$/);
    assert.match(list[1].label, /^Vulkan · b12359 · /);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('o motor fora da pasta do launcher (escolhido pelo usuário) entra na lista', () => {
  const root = tempRoot(), outside = tempRoot();
  try {
    engine(root, '1795188385480', ['ggml-vulkan.dll']);
    const external = engine(outside, 'meu-build', ['ggml-cuda.dll', 'ggml-vulkan.dll']);
    const list = roles.listInstalled(root, external);
    assert.equal(list[0].dir, external);
    assert.match(list[0].label, /CUDA \+ Vulkan|Vulkan \+ CUDA/);
    // Com o principal em outro motor, a pasta escolhida continua na lista (extra).
    const vulkan = path.join(root, '1795188385480');
    assert.deepEqual(roles.listInstalled(root, vulkan, { extra: [external, 7, ''] }).map(e => e.dir), [vulkan, external]);
    assert.deepEqual(roles.listInstalled(root, vulkan).map(e => e.dir), [vulkan]);
  } finally { fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(outside, { recursive: true, force: true }); }
});

test('o papel usa o motor escolhido e volta para o do principal quando ele some', () => {
  const root = tempRoot();
  try {
    const main = engine(root, 'main', ['ggml-cuda.dll']), other = engine(root, 'other', ['ggml-vulkan.dll']);
    assert.equal(roles.resolve({ decider: other }, 'decider', main), other);
    assert.equal(roles.resolve({ decider: '' }, 'decider', main), main);
    assert.equal(roles.resolve({}, 'reviewer', main), main);
    fs.rmSync(path.join(other, server));
    assert.equal(roles.resolve({ decider: other }, 'decider', main), main);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('só aceita motores instalados e papéis conhecidos', () => {
  const installed = [{ dir: path.resolve('C:/engines/a') }, { dir: path.resolve('C:/engines/b') }];
  assert.equal(roles.validateChoice('decider', '', installed), '');
  assert.equal(roles.validateChoice('reviewer', path.resolve('C:/engines/b'), installed), installed[1].dir);
  assert.throws(() => roles.validateChoice('decider', path.resolve('C:/engines/x'), installed), /não está mais instalado/);
  assert.throws(() => roles.validateChoice('principal', '', installed), /Papel inválido/);
  assert.throws(() => roles.validateChoice('decider', 42, installed), /Motor inválido/);
  assert.deepEqual(roles.normalizeRoles({ decider: 'x', reviewer: 7, other: 'y' }), { reviewer: '', decider: 'x' });
  assert.deepEqual(roles.normalizeRoles(undefined), { reviewer: '', decider: '' });
});

test('a conta de memória do papel lê os dispositivos do motor dele', async () => {
  const asked = [];
  const planner = createPlanner({ engineDir: () => 'principal', measure: async ({ listed }) => ({ available: 1, devices: listed, processes: [], usage: [] }),
    nvidia: async () => [], listDevices: async dir => { asked.push(dir); return [{ name: dir === 'vulkan' ? 'Vulkan0' : 'CUDA0' }]; } });
  assert.equal((await planner.snapshot([], 'vulkan')).devices[0].name, 'Vulkan0');
  assert.equal((await planner.snapshot()).devices[0].name, 'CUDA0');
  assert.deepEqual(asked, ['vulkan', 'principal']);
});
