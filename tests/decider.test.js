'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const decider = require('../build/app/decider');
const { ggufInfo } = require('../build/app/model_info');

test('reconhece modelos de decisão pelos metadados <arquitetura>.decision.*', () => {
  assert.equal(decider.decisionType({ 'general.architecture': 'lfm3', 'lfm3.decision.type': 'lfm3-d1-omni', 'lfm3.block_count': 24 }), 'lfm3-d1-omni');
  assert.equal(decider.decisionType({ 'general.architecture': 'modernbert', 'modernbert.decision.labels': ['a', 'b'] }), 'modernbert');
  assert.equal(decider.decisionType({ 'general.architecture': 'gemma4', 'gemma4.block_count': 42 }), null);
  assert.equal(decider.decisionType({}), null);
  assert.equal(ggufInfo({ 'general.architecture': 'lfm3', 'lfm3.decision.type': 'lfm3-d1-omni' }).decision, 'lfm3-d1-omni');
  assert.equal(ggufInfo({ 'general.architecture': 'gemma4' }).decision, null);
});

test('monta o llama-server do decisor com GPU escolhida, CPU ou automático', () => {
  const model = { path: 'C:\\models\\d1.gguf', projector: null };
  const gpu = decider.serverArgs(model, { device: 'Vulkan1', context: '4096', host: '127.0.0.1' }, 8090);
  assert.deepEqual(gpu, ['-m', 'C:\\models\\d1.gguf', '-c', '4096', '-b', '4096', '-ub', '4096', '--alias', 'decisor', '--host', '127.0.0.1', '--port', '8090', '-dev', 'Vulkan1', '-ngl', '99']);
  const cpu = decider.serverArgs(model, { device: 'cpu', context: 2048 }, 8091);
  assert.ok(cpu.join(' ').includes('-dev none -ngl 0'));
  const auto = decider.serverArgs({ ...model, projector: 'C:\\models\\mmproj.gguf' }, {}, 8092);
  assert.ok(!auto.includes('-dev'));
  assert.ok(auto.join(' ').includes('--mmproj C:\\models\\mmproj.gguf'));
});

test('na rede o decisor exige a chave de API', () => {
  const model = { path: '/m/d1.gguf' };
  assert.throws(() => decider.serverArgs(model, { host: '192.168.1.7' }, 8090), /Chave de API/);
  const args = decider.serverArgs(model, { host: '192.168.1.7' }, 8090, '/k/key.txt');
  assert.deepEqual(args.slice(-2), ['--api-key-file', '/k/key.txt']);
});

test('rejeita opções inválidas do decisor', () => {
  assert.throws(() => decider.validateOptions({ device: 'Vulkan1; rm -rf /' }), /Dispositivo/);
  assert.throws(() => decider.validateOptions({ context: '100' }), /Contexto/);
  assert.throws(() => decider.validateOptions({ context: '4096.5' }), /Contexto/);
  assert.throws(() => decider.validateOptions({ host: '8.8.8.8' }), /Endereço/);
  assert.deepEqual(decider.validateOptions({}), { device: '', context: '4096', host: '127.0.0.1' });
  assert.ok(decider.PORTS.last < 8099, 'a porta 8099 fica livre para o servidor de decisões externo');
});

test('o teste da tela vira pergunta choice ou noul do /v1/systemone', () => {
  const choice = decider.testRequest({ state: 'Cobrado duas vezes', question: 'Qual setor?', options: 'financeiro\nsuporte\n\nvendas\nsuporte' });
  assert.deepEqual(choice, { state: 'Cobrado duas vezes', questions: { teste: { type: 'choice', instructions: 'Qual setor?', criteria: { financeiro: null, suporte: null, vendas: null } } } });
  const described = decider.testRequest({ question: 'Qual setor?', options: 'financeiro: cobranças e pagamentos\nsuporte técnico:\nhora: 10:30' });
  assert.deepEqual(described.questions.teste.criteria, { financeiro: 'cobranças e pagamentos', 'suporte técnico': null, hora: '10:30' });
  assert.deepEqual(decider.testRequest({ question: 'Aprovar?', options: '' }).questions.teste, { type: 'noul', instructions: 'Aprovar?' });
  assert.equal(decider.testRequest({ question: 'Aprovar?', options: 'sim\nnão' }).questions.teste.type, 'noul');
  assert.equal(decider.testRequest({ question: 'x' }).state, null);
  assert.throws(() => decider.testRequest({ question: '' }), /pergunta/);
  assert.throws(() => decider.testRequest({ question: 'x', options: 'só uma' }), /duas opções/);
  assert.throws(() => decider.testRequest({ question: 'x', options: Array.from({ length: 11 }, (_, i) => `o${i}`).join('\n') }), /10 opções/);
});

test('resume respostas choice, noul e score', () => {
  const choice = decider.describeAnswer({ answers: { teste: { type: 'choice', choice: 'suporte', probabilities: { financeiro: 0.01, suporte: 0.96, vendas: 0.03 }, confidence: 0.96 } } });
  assert.equal(choice.headline, 'suporte (96.0%)');
  assert.deepEqual(choice.rows.map(r => r[0]), ['suporte', 'vendas', 'financeiro']);
  const noul = decider.describeAnswer({ answers: { teste: { type: 'noul', noul: 0.75 } } });
  assert.equal(noul.headline, 'Sim: 75.0%');
  const score = decider.describeAnswer({ answers: { teste: { type: 'score', score: 3, legend: { 0: '1', 1: '2', 2: '3', 3: '4', 4: '5' }, probabilities: { 0: 0, 1: 0, 2: 0.1, 3: 0.5, 4: 0.4 }, confidence: 0.5 } } });
  assert.equal(score.headline, '4 (50.0%)');
  assert.equal(score.rows[0][0], '4');
  assert.throws(() => decider.describeAnswer({}), /não devolveu/);
});

test('sugestões de modelos de decisão têm links do Hugging Face e padrão de nome', () => {
  assert.ok(decider.MODELS.length >= 4);
  for (const m of decider.MODELS) {
    assert.match(m.url, /^https:\/\/huggingface\.co\/[\w.-]+\/[\w.-]+$/);
    assert.equal(decider.links[m.id], m.url);
    assert.doesNotThrow(() => new RegExp(m.match, 'i'));
  }
  const d1 = decider.MODELS.find(m => m.id === 'd1Omni2b');
  assert.ok(new RegExp(d1.match, 'i').test('LiquidAI-Audio-Text-d1-Omni-2B-Q8_0.gguf'));
  assert.ok(!new RegExp(decider.MODELS.find(m => m.id === 'lev').match, 'i').test('kev-4b.gguf'));
});
