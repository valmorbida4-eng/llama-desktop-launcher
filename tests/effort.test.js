'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const modelInfo = require('../build/app/model_info');
const params = require('../build/app/params');
const core = require('../build/app/core');
const reviewer = require('../build/app/reviewer');

// Trechos no formato dos templates de cada família.
const TEMPLATES = {
  gptoss: '{%- if reasoning_effort is not defined %}{%- set reasoning_effort = "medium" %}{%- endif %}',
  qwen38: "{%- if enable_thinking is undefined %}{%- set resolved_reasoning_effort = reasoning_effort|default('xhigh') %}{%- if resolved_reasoning_effort not in ('xhigh', 'medium', 'low') %}{{ raise_exception('x') }}{% endif %}{% endif %}",
  gemma: '{%- set enable_thinking = enable_thinking | default(false) -%}',
  fixed: '{{ bos_token }}{{ messages[0].content }}',
};
const info = (name) => modelInfo.ggufInfo({ 'general.architecture': 'x', 'tokenizer.chat_template': TEMPLATES[name] });
const context = (name, extra = {}) => ({ engine: 'llamacpp', info: info(name), ...extra });
const field = (c) => params.schemaFor(c).fields.find((f) => f.key === 'effort');

test('cada template mostra só o esforço que aceita', () => {
  assert.deepEqual(field(context('gptoss')).options, ['low', 'medium', 'high']);
  assert.deepEqual(field(context('qwen38')).options, ['low', 'medium', 'xhigh', 'off']);
  assert.deepEqual(field(context('gemma')).options, ['off']);
  assert.equal(field(context('fixed')).applicable, false);
  assert.deepEqual(field({ engine: 'llamacpp', info: { error: 'ilegível' } }).options, ['low', 'medium', 'high', 'off']);
});

test('um nível que o template recusa não chega ao servidor', () => {
  assert.throws(() => params.validateParams({ effort: 'high' }, context('qwen38')), /Esforço/);
  assert.throws(() => params.validateEffort({ effort: 'low' }, context('gemma')), /Esforço/);
  assert.doesNotThrow(() => params.validateEffort({ effort: 'xhigh' }, context('qwen38')));
  assert.doesNotThrow(() => params.validateEffort({}, context('fixed')));
});

test('o início não recusa, sem o modelo em mãos, um nível válido', () => {
  const args = core.argsForModel({ path: 'q.gguf' }, { effort: 'xhigh' }, 'server', 8080).join(' ');
  assert.ok(args.includes('--reasoning-effort xhigh'));
  assert.throws(() => params.effortArgs({ effort: '--host 0.0.0.0' }), /inválido/);
});

test('motor sem a opção desliga o campo; motor não medido não bloqueia', () => {
  assert.equal(field(context('gptoss', { reasoning: false })).applicable, false);
  assert.match(field(context('gptoss', { reasoning: false })).reason, /atualize/);
  assert.throws(() => params.validateEffort({ effort: 'low' }, context('gptoss', { reasoning: false })), /Esforço/);
  assert.equal(field(context('gptoss', { reasoning: undefined })).applicable, true);
});

test('o esforço vai ao servidor, à conversa e ao revisor, nunca à estimativa', () => {
  assert.deepEqual(params.llamaArgs({ effort: 'off' }), ['--reasoning', 'off']);
  assert.deepEqual(params.llamaArgs({ effort: 'low' }, 'cli'), ['--reasoning-effort', 'low']);
  assert.deepEqual(params.llamaArgs({ effort: 'low' }, 'fit'), []);
  assert.deepEqual(params.llamaArgs({}), []);
  const server = reviewer.serverArgs({ path: 'r.gguf' }, { device: 'Vulkan1' }, 8081, { effort: 'off' }).join(' ');
  assert.ok(server.includes('--reasoning off'));
  assert.ok(!reviewer.memoryArgs({ device: 'Vulkan1' }, { effort: 'off' }).join(' ').includes('reasoning'));
});

test('a mesma opção nos argumentos extras vale mais que o campo', () => {
  for (const extraArgs of ['--reasoning-effort high', '--reasoning on', '-rea on', '--reasoning-effort=high']) {
    assert.deepEqual(params.llamaArgs({ effort: 'low', extraArgs }), params.splitExtraArgs(extraArgs), extraArgs);
  }
  assert.deepEqual(params.llamaArgs({ effort: 'low', extraArgs: '--reasoning-effort high' }, 'cli'), ['--reasoning-effort', 'low'], 'a conversa não usa os extras');
});
