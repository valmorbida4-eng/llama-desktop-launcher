'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createStarts } = require('../build/app/starts');

const tick = () => new Promise((resolve) => setImmediate(resolve));
function gate() { let open; const wait = new Promise((resolve) => { open = resolve; }); return { wait, open }; }

test('um início por vez, e o papel fica pendente já na chamada', async () => {
  const starts = createStarts();
  const first = gate();
  const order = [];
  const chat = starts.run('chat', async () => { order.push('chat'); await first.wait; });
  const reviewer = starts.run('reviewer', async () => { order.push('reviewer'); });
  assert.ok(starts.has('chat') && starts.has('reviewer'));
  await assert.rejects(starts.run('chat', async () => {}), /já está iniciando/);
  await tick();
  assert.deepEqual(order, ['chat'], 'o segundo espera a carga do primeiro');
  first.open();
  await Promise.all([chat, reviewer]);
  assert.deepEqual(order, ['chat', 'reviewer']);
  assert.equal(starts.any(), false);
});

test('cancelar na fila não fura a ordem dos outros', async () => {
  const starts = createStarts();
  const first = gate();
  const order = [];
  const chat = starts.run('chat', async () => { await first.wait; order.push('chat'); });
  const reviewer = starts.run('reviewer', async () => { order.push('reviewer'); });
  const decider = starts.run('decider', async () => { order.push('decider'); });
  const cancelled = assert.rejects(reviewer, /Início cancelado/);
  await starts.cancel('reviewer');
  await cancelled;
  assert.equal(starts.has('reviewer'), false);
  await tick();
  assert.deepEqual(order, [], 'o decisor ainda espera o principal');
  first.open();
  await Promise.all([chat, decider]);
  assert.deepEqual(order, ['chat', 'decider']);
});

test('cancelar durante a tarefa aborta o sinal e libera a fila', async () => {
  const starts = createStarts();
  const running = starts.run('reviewer', (signal) => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(Error('morto')))));
  const failed = assert.rejects(running, /Início cancelado/);
  await tick();
  await starts.cancel('reviewer');
  await failed;
  assert.equal(await starts.run('chat', async () => 'ok'), 'ok');
});

test('uma falha não trava os inícios seguintes', async () => {
  const changes = [];
  const starts = createStarts(() => changes.push(1));
  await assert.rejects(starts.run('chat', async () => { throw Error('não cabe'); }), /não cabe/);
  assert.equal(await starts.run('chat', async () => 7), 7);
  assert.equal(changes.length, 4);
  await starts.cancel('decider');
});
