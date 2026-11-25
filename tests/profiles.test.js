'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const profiles = require('../build/app/profiles');
const roles = require('../build/app/role_engines');

const gguf = 'C:/models/Qwen3-30B-A3B-Q4_K_M.gguf';

test('o tipo do motor junta builds e versões de CUDA do mesmo tipo', () => {
  assert.equal(roles.familyOf('vulkan'), 'vulkan');
  assert.equal(roles.familyOf('cuda-12.4'), 'cuda');
  assert.equal(roles.familyOf('cuda-13.5'), 'cuda');
  assert.equal(roles.familyOf('rocm-10.0'), 'rocm');
  assert.equal(roles.familyOf('sycl-fp16'), 'sycl');
  assert.equal(roles.familyOf('external'), '');
  assert.equal(roles.familyLabel('cuda+vulkan'), 'CUDA + Vulkan');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'engine-key-'));
  try {
    const make = (name, files = [], manifest = null) => {
      const dir = path.join(root, name); fs.mkdirSync(dir);
      for (const file of files) fs.writeFileSync(path.join(dir, file), '');
      if (manifest) roles.writeManifest(dir, manifest);
      return dir;
    };
    assert.equal(roles.engineKey(make('a', ['ggml-vulkan.dll'], { backend: 'cuda-12.4' }), 'win32'), 'cuda', 'o manifesto vale primeiro');
    assert.equal(roles.engineKey(make('b', ['ggml-vulkan.dll']), 'win32'), 'vulkan');
    assert.equal(roles.engineKey(make('c', ['ggml-vulkan.dll', 'ggml-cuda.dll']), 'win32'), 'cuda+vulkan');
    assert.equal(roles.engineKey(make('d', ['ggml-cpu-zen4.dll']), 'win32'), 'cpu');
    assert.equal(roles.engineKey(''), '');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('um download novo substitui só os motores do mesmo tipo baixados pelo launcher', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'engine-replace-'));
  try {
    const root = path.join(base, 'engines'), outside = path.join(base, 'meu-build');
    const make = (dir, files, manifest) => {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, process.platform === 'win32' ? 'llama-server.exe' : 'llama-server'), '');
      for (const file of files) fs.writeFileSync(path.join(dir, file), '');
      if (manifest) roles.writeManifest(dir, manifest);
      return dir;
    };
    const oldVulkan = make(path.join(root, '1795188385480'), ['ggml-vulkan.dll']);
    const cuda = make(path.join(root, '1795199999999'), ['ggml-cuda.dll'], { backend: 'cuda-12.4' });
    const external = make(outside, ['ggml-vulkan.dll']);
    const fresh = make(path.join(root, '1795300000000'), ['ggml-vulkan.dll'], { backend: 'vulkan', release: 'b12400' });
    let linked = null;
    if (process.platform === 'win32') { linked = path.join(root, '1795100000000'); fs.symlinkSync(external, linked, 'junction'); }
    const installed = roles.listInstalled(root, oldVulkan);
    assert.deepEqual(roles.replaceable(installed, fresh, root), [oldVulkan]);
    const cudaFresh = make(path.join(root, '1795400000000'), ['ggml-cuda.dll'], { backend: 'cuda-13.5' });
    assert.deepEqual(roles.replaceable(roles.listInstalled(root, oldVulkan), cudaFresh, root), [cuda], 'CUDA 13.5 substitui o CUDA 12.4');
    assert.ok(!roles.replaceable(roles.listInstalled(root, external), fresh, root).includes(external), 'a pasta escolhida pelo usuário fica');
    if (linked) fs.rmdirSync(linked);
  } finally { fs.rmSync(base, { recursive: true, force: true }); }
});

test('um modelo guarda um perfil por tipo de motor e salvar no mesmo tipo substitui só ele', () => {
  let store = profiles.set(undefined, gguf, 'vulkan', { context: '8192', device: 'Vulkan0', version: 1 });
  store = profiles.set(store, gguf, 'cuda', { context: '16384', device: 'CUDA0' });
  store = profiles.set(store, gguf, 'vulkan', { context: '4096', ubatch: '128' });
  assert.deepEqual(profiles.keys(store, gguf).sort(), ['cuda', 'vulkan']);
  assert.deepEqual(profiles.settingsOf(store, gguf, 'vulkan'), { context: '4096', ubatch: '128' });
  assert.equal(profiles.get(store, gguf, 'vulkan').version, 2);
  assert.deepEqual(profiles.settingsOf(store, gguf, 'cuda'), { context: '16384', device: 'CUDA0' });
  assert.throws(() => profiles.set(store, gguf, '', {}), /motor llama\.cpp/);
});

test('sem perfil salvo para o motor escolhido vale o ajuste padrão desse motor, não o de outro', () => {
  const store = profiles.set({}, gguf, 'vulkan', { context: '8192', device: 'Vulkan1' });
  assert.deepEqual(profiles.settingsOf(store, gguf, 'cuda', 'llamacpp'), { context: '4096' });
  assert.deepEqual(profiles.settingsOf(store, 'C:/models/hf-model', 'vllm', 'vllm'), { context: '4096' });
  assert.deepEqual(profiles.settingsOf(store, 'C:/strata/strata-a.json', 'strata', 'strata'), {});
  const copy = profiles.settingsOf(store, gguf, 'cpu');
  copy.context = '1';
  assert.equal(profiles.DEFAULTS.llamacpp.context, '4096', 'o padrão não é alterado por quem recebe');
});

test('os perfis antigos vão para o tipo do motor em uso, uma vez só', () => {
  const legacy = { [gguf]: { context: 8192, gpuLayers: 'auto' }, 'C:/hf/Qwen-AWQ': { context: '4096', version: 2 }, 'C:/strata/strata-a.json': { version: 2 } };
  const first = profiles.migrate({ profiles: legacy }, 'vulkan');
  assert.equal(first.done, true);
  assert.deepEqual(first.store[gguf], { vulkan: { context: '8192', gpuLayers: '', version: 2 } });
  assert.deepEqual(Object.keys(first.store['C:/hf/Qwen-AWQ']), ['vllm']);
  assert.deepEqual(Object.keys(first.store['C:/strata/strata-a.json']), ['strata']);
  const waiting = profiles.migrate({ profiles: legacy }, '');
  assert.equal(waiting.done, false, 'sem motor, espera para saber o tipo');
  assert.deepEqual(waiting.store, {});
  const again = profiles.migrate({ profiles: legacy, engineProfiles: first.store, profilesMigrated: true }, 'cuda');
  assert.equal(again.done, false);
  assert.deepEqual(Object.keys(again.store[gguf]), ['vulkan']);
  // Quem migrou na v0.17.0 (sem a marca) não ganha cópia dos perfis antigos no tipo do motor atual.
  const fromOld = profiles.migrate({ profiles: legacy, engineProfiles: first.store }, 'cuda');
  assert.deepEqual(Object.keys(fromOld.store[gguf]), ['vulkan']);
});

test('um perfil salvo enquanto a migração espera o motor não impede os perfis antigos de migrar', () => {
  const legacy = { [gguf]: { context: '8192', version: 2 }, 'C:/hf/Qwen-AWQ': { context: '2048', version: 2 } };
  const configuration = { profiles: legacy };
  assert.equal(profiles.migrate(configuration, '').done, false);
  configuration.engineProfiles = profiles.set(configuration.engineProfiles, 'C:/hf/Qwen-AWQ', 'vllm', { context: '16384' });
  const later = profiles.migrate(configuration, 'cuda');
  assert.equal(later.done, true);
  assert.deepEqual(later.store[gguf], { cuda: { context: '8192', version: 2 } });
  assert.equal(later.store['C:/hf/Qwen-AWQ'].vllm.context, '16384', 'o perfil salvo depois não é sobrescrito');
});

test('a sugestão de trio recebe um perfil por modelo, do tipo do principal', () => {
  let store = profiles.set({}, gguf, 'vulkan', { context: '8192' });
  store = profiles.set(store, gguf, 'cuda', { context: '2048' });
  store = profiles.set(store, 'C:/models/outro.gguf', 'cuda', { context: '1024' });
  assert.deepEqual(Object.keys(profiles.flatten(store, 'vulkan')), [gguf]);
  assert.equal(profiles.flatten(store, 'cuda')[gguf].context, '2048');
  assert.deepEqual(profiles.normalize({ a: 'x', b: { vulkan: 3 }, c: { cuda: { context: '1' } } }), { c: { cuda: { context: '1' } } });
});
