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
  assert.match(links.full, /search=f16/);
  assert.doesNotMatch(links.full, /base_model_relation=quantized/);
});
