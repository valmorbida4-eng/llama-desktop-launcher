'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildGuidance, links } = require('../build/app/guidance');

test('sugere modelos antes de existir GGUF e reduz a faixa em hardware limitado', () => {
  const hardware = { memoryBytes: 8 * 1024 ** 3, logicalCores: 4, platform: 'linux', arch: 'x64' };
  const result = buildGuidance({ hardware, availableDiskBytes: 2 * 1024 ** 3 });
  assert.equal(result.suggestions.length, 3);
  assert.match(result.suggestions[0].detail, /0,5B a 3B/);
  assert.match(result.caution, /espaço livre/);
  assert.match(result.prompt, /Nenhum modelo foi instalado/);
  assert.equal(result.hardware.gpuMemoryBytes, null);
});

test('inclui hardware conhecido e ajustes atuais sem afirmar que o modelo foi testado', () => {
  const result = buildGuidance({
    hardware: { memoryBytes: 32 * 1024 ** 3, logicalCores: 16, platform: 'win32', arch: 'x64' },
    gpu: { name: 'GPU de teste', memoryBytes: 8 * 1024 ** 3 },
    model: { name: 'modelo.gguf', size: 4 * 1024 ** 3 },
    settings: { context: 4096, gpuLayers: 'auto' },
  });
  assert.match(result.summary, /GPU de teste/);
  assert.match(result.prompt, /modelo\.gguf/);
  assert.match(result.prompt, /não afirme que testou/);
  assert.match(links.all, /library=gguf/);
  assert.match(links.quantized, /base_model_relation=quantized/);
  assert.match(links.dense, /search=f16/);
  assert.doesNotMatch(links.dense, /base_model_relation=quantized/);
  assert.match(links.full, /search=f16/);
  assert.doesNotMatch(links.full, /base_model_relation=quantized/);
  assert.equal(result.suggestions[0].title, 'Modelos Quantizados');
  assert.equal(result.suggestions[1].title, 'Modelos MoE (Mixture of Experts)');
  assert.equal(result.suggestions[2].title, 'Modelos Densos (sem quantização)');
  assert.ok(result.suggestions.every(s => !!s.buttonText && !!s.kind));
});

test('orientação por motor considera a GPU detectada e oferece os links de modelos', () => {
  const { engineAdvice, engineLinks, gpuVendor } = require('../build/app/guidance');
  const GB = 1024 ** 3;
  assert.equal(gpuVendor('AMD Radeon RX 6600'), 'amd');
  assert.equal(gpuVendor('NVIDIA GeForce RTX 4060'), 'nvidia');
  assert.equal(gpuVendor('Intel(R) Arc(TM) A770'), 'intel');
  assert.equal(gpuVendor('Microsoft Basic Render Driver'), null);

  const amd = Object.fromEntries(engineAdvice({ gpu: { name: 'AMD Radeon RX 6600', memoryBytes: 8 * GB }, platform: 'win32' }).map(item => [item.id, item]));
  assert.match(amd.vllm.detail, /precisa de GPU NVIDIA/);
  assert.match(amd.strata.detail, /12 GB ou mais.*fica abaixo/);
  assert.match(amd.polystrata.detail, /AMD são beta/);
  assert.ok(amd.polystrata.links.some(link => link.kind === 'polystrataAmd'));
  assert.ok(amd.strata.links.some(link => link.kind === 'strataModels'));

  const nvidia = Object.fromEntries(engineAdvice({ gpu: { name: 'NVIDIA GeForce RTX 4090', memoryBytes: 24 * GB }, platform: 'linux' }).map(item => [item.id, item]));
  assert.match(nvidia.vllm.detail, /Compatível.*até cerca de 16 GB/);
  assert.doesNotMatch(nvidia.strata.detail, /fica abaixo/);
  assert.ok(!nvidia.polystrata.links.some(link => link.kind === 'polystrataAmd'));
  assert.match(engineAdvice({ gpu: {}, platform: 'darwin' })[2].detail, /macOS/);

  for (const item of [...Object.values(amd), ...Object.values(nvidia)]) for (const link of item.links) {
    const url = engineLinks[link.kind] || require('../build/app/engines').links[link.kind];
    assert.match(url, /^https:\/\//, link.kind);
  }
});
