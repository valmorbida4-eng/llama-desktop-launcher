'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseLegacyProfiles } = require('../build/app/profile_import');

function row(modelPath, values = ['auto', '8192', 'q8_0', 'q8_0', '', 'on', '', '', '', 'Vulkan0']) {
  return [Buffer.from(modelPath, 'utf8').toString('base64'), ...values].join('\t');
}

test('importa caminho UTF-8 Base64 e mapeia os dez valores do launcher antigo', () => {
  const source = row('C:\\Models\\gemma-4-12b.gguf', [
    'auto', '8192', 'q8_0', 'q8_0', '', 'on', '6', '512', '256', 'Vulkan0',
  ]);

  const result = parseLegacyProfiles(source);

  assert.deepEqual(result.ignored, []);
  assert.equal(result.profiles.length, 1);
  assert.equal(result.profiles[0].path, 'C:\\Models\\gemma-4-12b.gguf');
  assert.deepEqual(result.profiles[0].settings, {
    gpuLayers: 'auto', context: '8192', cacheK: 'q8_0', cacheV: 'q8_0', cpuMoe: '',
    flash: 'on', threads: '6', batch: '512', ubatch: '256', device: 'Vulkan0',
  });
  assert.equal(result.profiles[0].line, 1);
});

test('ignora linhas malformadas, ajustes inválidos e caminhos duplicados com número e motivo', () => {
  const valid = row('C:\\Models\\one.gguf');
  const wrongColumnCount = 'bmFk';
  const invalidSettings = row('/models/bad.gguf', [
    'auto', '4096', 'f16', 'f16', '', 'auto', '', '128', '256', '',
  ]);
  const duplicate = row('c:\\models\\ONE.gguf');
  const source = [valid, wrongColumnCount, invalidSettings, duplicate].join('\r\n');

  const result = parseLegacyProfiles(source);

  assert.equal(result.profiles.length, 1);
  assert.deepEqual(result.ignored.map(item => item.line), [2, 3, 4]);
  assert.match(result.ignored[0].reason, /11 colunas/);
  assert.match(result.ignored[1].reason, /Microbatch/);
  assert.match(result.ignored[2].reason, /duplicado/);
});

test('aceita BOM e ignora linhas vazias sem relatá-las como erros', () => {
  const result = parseLegacyProfiles(`\uFEFF\r\n${row('/models/model.gguf')}\r\n`);

  assert.equal(result.profiles.length, 1);
  assert.equal(result.profiles[0].line, 2);
  assert.deepEqual(result.ignored, []);
});

test('rejeita Base64 inválido, UTF-8 inválido e caminho relativo', () => {
  const values = ['auto', '4096', 'f16', 'f16', '', 'auto', '', '', '', ''];
  const invalidBase64 = ['not base64!', ...values].join('\t');
  const invalidUtf8 = [Buffer.from([0xc3, 0x28]).toString('base64'), ...values].join('\t');
  const relativePath = [Buffer.from('models/model.gguf').toString('base64'), ...values].join('\t');

  const result = parseLegacyProfiles([invalidBase64, invalidUtf8, relativePath].join('\n'));

  assert.deepEqual(result.profiles, []);
  assert.deepEqual(result.ignored.map(item => item.line), [1, 2, 3]);
  assert.match(result.ignored[0].reason, /Base64/);
  assert.match(result.ignored[1].reason, /UTF-8/);
  assert.match(result.ignored[2].reason, /absoluto/);
});

test('exige conteúdo textual', () => {
  assert.throws(() => parseLegacyProfiles(Buffer.from('')), /deve ser texto/);
});
