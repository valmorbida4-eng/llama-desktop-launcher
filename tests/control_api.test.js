'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const control = require('../build/app/control_api');

const TOKEN = 'a'.repeat(20) + 'B'.repeat(20);
const MODELS = [
  { path: 'C:\\Models\\gemma.gguf', name: 'gemma', engine: 'llamacpp', decision: null },
  { path: 'C:\\Models\\Kev-4B.gguf', name: 'Kev-4B', engine: 'llamacpp', decision: 'kev' },
];

test('IDs do catálogo são estáveis, sem caminho, e ignoram maiúsculas no Windows', () => {
  const id = control.modelId('C:\\Models\\gemma.gguf', 'win32');
  assert.match(id, /^m_[0-9a-f]{16}$/);
  assert.equal(control.modelId('c:\\models\\GEMMA.gguf', 'win32'), id);
  assert.notEqual(control.modelId('/m/a.gguf', 'linux'), control.modelId('/m/A.gguf', 'linux'));
  const list = control.catalog([...MODELS, MODELS[0]], 'win32');
  assert.equal(list.length, 2);
  assert.deepEqual(list.map((m) => m.role), ['chat', 'decider']);
  const state = control.publicState(list, { chat: null, decider: null });
  assert.deepEqual(Object.keys(state), ['version', 'models', 'servers']);
  assert.equal(state.version, 1);
  assert.deepEqual(state.models[1], { id: list[1].id, name: 'Kev-4B', role: 'decider' });
  assert.ok(!JSON.stringify(state).includes('Models'), 'o estado público não expõe caminhos');
});

test('token vem da variável quando definida, senão do arquivo do launcher', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'control-token-'));
  const file = path.join(dir, 'control-api-token.txt');
  try {
    assert.deepEqual(control.resolveToken(file, { DEVTOOLS_LAUNCHER_TOKEN: TOKEN }), { token: TOKEN, source: 'env' });
    const short = control.resolveToken(file, { DEVTOOLS_LAUNCHER_TOKEN: 'curto' });
    assert.equal(short.token, null);
    assert.match(short.error, /DEVTOOLS_LAUNCHER_TOKEN/);
    assert.deepEqual(control.resolveToken(file, {}), { token: null, source: 'file' });
    const created = control.ensureToken(file, {});
    assert.equal(created.source, 'file');
    assert.ok(control.validToken(created.token));
    assert.equal(control.ensureToken(file, {}).token, created.token);
    assert.notEqual(control.rotateToken(file), created.token);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

function fakeLauncher() {
  const calls = { start: [], stop: [], quit: 0 };
  const servers = { chat: null, decider: null };
  let release = null;
  const handlers = {
    models: () => control.catalog(MODELS),
    servers: () => ({ ...servers }),
    start: async (role, model) => {
      calls.start.push([role, model.path]);
      if (model.name === 'lento') await new Promise((resolve) => { release = resolve; });
      if (model.name === 'falha') throw Error('O motor encerrou antes de ficar pronto.');
      servers[role] = role === 'chat' ? { model_id: model.id, port: 8080, api_model: 'modelo-local' } : { model_id: model.id, port: 8090 };
    },
    stop: async (role) => { calls.stop.push(role); servers[role] = null; },
    quit: () => { calls.quit++; },
  };
  return { calls, handlers, servers, release: () => release?.() };
}

async function withServer(handlers, fn, token = TOKEN) {
  let handler = null;
  const server = http.createServer((req, res) => handler(req, res));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  handler = control.createHandler({ token: () => token, port, handlers });
  const request = (method, url, { body, headers = {}, auth = true, raw } = {}) => new Promise((resolve, reject) => {
    const data = raw ?? (body === undefined ? '' : JSON.stringify(body));
    const req = http.request({ host: '127.0.0.1', port, path: url, method, agent: false,
      headers: { host: `127.0.0.1:${port}`, ...(auth ? { authorization: `Bearer ${TOKEN}` } : {}), ...(data ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } : {}), ...headers } }, (res) => {
      let text = ''; res.setEncoding('utf8'); res.on('data', (c) => { text += c; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, json: text ? JSON.parse(text) : null }));
    });
    req.on('error', reject); req.end(data);
  });
  try { await fn(request, port); } finally { server.close(); }
}

test('exige o Host de loopback e o Bearer dedicado, sem CORS', async () => {
  const { handlers } = fakeLauncher();
  await withServer(handlers, async (request) => {
    assert.equal((await request('GET', '/v1/control/state', { headers: { host: 'evil.example:8787' } })).status, 403);
    const missing = await request('GET', '/v1/control/state', { auth: false });
    assert.equal(missing.status, 401);
    assert.equal(missing.headers['www-authenticate'], 'Bearer');
    assert.equal((await request('GET', '/v1/control/state', { headers: { authorization: 'Bearer ' + 'x'.repeat(40) } })).status, 401);
    assert.equal((await request('OPTIONS', '/v1/control/start', { auth: false, headers: { origin: 'http://evil.example' } })).status, 401);
    const ok = await request('GET', '/v1/control/state', { headers: { origin: 'http://evil.example' } });
    assert.equal(ok.status, 200);
    assert.equal(ok.headers['access-control-allow-origin'], undefined);
    assert.equal(ok.headers['cache-control'], 'no-store');
  });
  await withServer(handlers, async (request) => {
    assert.equal((await request('GET', '/v1/control/state')).status, 401, 'sem token configurado nada passa');
  }, null);
});

test('state segue o contrato e start/stop usam só IDs do catálogo', async () => {
  const { handlers, calls } = fakeLauncher();
  const [chat, decider] = control.catalog(MODELS);
  await withServer(handlers, async (request) => {
    const state = await request('GET', '/v1/control/state');
    assert.deepEqual(state.json, { version: 1, models: [{ id: chat.id, name: 'gemma', role: 'chat' }, { id: decider.id, name: 'Kev-4B', role: 'decider' }], servers: { chat: null, decider: null, reviewer: null } });

    assert.equal((await request('POST', '/v1/control/start', { body: { role: 'chat', model_id: 'C:\\Models\\gemma.gguf' } })).json.error.code, 'invalid_model_id');
    assert.equal((await request('POST', '/v1/control/start', { body: { role: 'chat', model_id: 'm_0000000000000000' } })).status, 404);
    assert.equal((await request('POST', '/v1/control/start', { body: { role: 'chat', model_id: decider.id } })).status, 422);
    assert.equal((await request('POST', '/v1/control/start', { body: { role: 'decider', model_id: chat.id } })).status, 422);
    assert.equal((await request('POST', '/v1/control/start', { body: { role: 'tudo', model_id: chat.id } })).status, 400);
    assert.equal((await request('POST', '/v1/control/start', { raw: '{"role":', headers: {} })).status, 400);
    assert.equal((await request('POST', '/v1/control/start', { body: { role: 'chat', model_id: chat.id }, headers: { 'content-type': 'text/plain' } })).status, 415);
    assert.equal((await request('POST', '/v1/control/start', { raw: JSON.stringify({ role: 'chat', pad: 'x'.repeat(20000) }) })).status, 413);
    assert.equal(calls.start.length, 0);

    const started = await request('POST', '/v1/control/start', { body: { role: 'chat', model_id: chat.id } });
    assert.equal(started.status, 200);
    assert.deepEqual(started.json.servers.chat, { model_id: chat.id, port: 8080, api_model: 'modelo-local' });
    assert.deepEqual(calls.start, [['chat', 'C:\\Models\\gemma.gguf']]);
    const both = await request('POST', '/v1/control/start', { body: { role: 'decider', model_id: decider.id } });
    assert.deepEqual(both.json.servers.decider, { model_id: decider.id, port: 8090 });
    assert.ok(both.json.servers.chat, 'os dois serviços são independentes');

    const stopped = await request('POST', '/v1/control/stop', { body: { role: 'chat' } });
    assert.equal(stopped.status, 200);
    assert.equal(stopped.json.servers.chat, null);
    assert.ok(stopped.json.servers.decider);
    assert.equal((await request('POST', '/v1/control/stop', { body: {} })).status, 400);
    assert.deepEqual(calls.stop, ['chat']);
  });
});

test('reviewer é um serviço: o modelo continua com papel chat', async () => {
  const { handlers, calls } = fakeLauncher();
  const list = control.catalog([...MODELS, { path: 'C:\\Models\\hf', name: 'hf', engine: 'vllm', decision: null }]);
  const [chat, decider, vllm] = list;
  await withServer({ ...handlers, models: () => list, servers: () => ({ chat: null, decider: null, reviewer: calls.start.length ? { model_id: chat.id, port: 8081, api_model: 'modelo-revisor' } : null }) }, async (request) => {
    for (const id of [decider.id, vllm.id]) assert.equal((await request('POST', '/v1/control/start', { body: { role: 'reviewer', model_id: id } })).status, 422);
    assert.equal(calls.start.length, 0);
    const started = await request('POST', '/v1/control/start', { body: { role: 'reviewer', model_id: chat.id } });
    assert.equal(started.status, 200);
    assert.deepEqual(calls.start, [['reviewer', 'C:\\Models\\gemma.gguf']]);
    assert.deepEqual(started.json.servers.reviewer, { model_id: chat.id, port: 8081, api_model: 'modelo-revisor' });
    assert.ok(started.json.models.every((m) => ['chat', 'decider'].includes(m.role) && !('engine' in m)), 'o DevTools rejeita papéis novos em models');
    assert.equal((await request('POST', '/v1/control/stop', { body: { role: 'reviewer' } })).status, 200);
    assert.deepEqual(calls.stop, ['reviewer']);
  });
});

test('memória insuficiente chega ao cliente como 409 com o motivo', async () => {
  const { handlers } = fakeLauncher();
  const [chat] = control.catalog(MODELS);
  await withServer({ ...handlers, start: async () => { throw new control.ControlError(409, 'insufficient_resources', 'Não cabe: VRAM'); } }, async (request) => {
    const refused = await request('POST', '/v1/control/start', { body: { role: 'reviewer', model_id: chat.id } });
    assert.equal(refused.status, 409);
    assert.deepEqual(refused.json.error, { code: 'insufficient_resources', message: 'Não cabe: VRAM' });
  });
});

test('rotas, métodos, conflitos e falhas devolvem o status HTTP certo', async () => {
  const launcher = fakeLauncher();
  const models = [{ path: '/m/lento.gguf', name: 'lento', decision: null }, { path: '/m/falha.gguf', name: 'falha', decision: null }, { path: '/m/ocupado.gguf', name: 'ocupado', decision: null }];
  const handlers = { ...launcher.handlers, models: () => control.catalog(models),
    start: async (role, model) => { if (model.name === 'ocupado') throw new control.ControlError(409, 'conflict', 'Pare-o antes.'); return launcher.handlers.start(role, model); } };
  const [slow, failing, busy] = control.catalog(models);
  await withServer(handlers, async (request) => {
    assert.equal((await request('GET', '/v1/control/nada')).status, 404);
    const wrong = await request('GET', '/v1/control/start');
    assert.equal(wrong.status, 405);
    assert.equal(wrong.headers.allow, 'POST');
    assert.equal((await request('POST', '/v1/control/state', { body: {} })).status, 405);
    const failed = await request('POST', '/v1/control/start', { body: { role: 'chat', model_id: failing.id } });
    assert.equal(failed.status, 500);
    assert.equal(failed.json.error.code, 'start_failed');
    assert.match(failed.json.error.message, /encerrou/);
    assert.ok(!/\bat\s/.test(failed.json.error.message), 'sem pilha na resposta');
    assert.equal((await request('POST', '/v1/control/start', { body: { role: 'chat', model_id: busy.id } })).status, 409);

    const first = request('POST', '/v1/control/start', { body: { role: 'chat', model_id: slow.id } });
    await new Promise((resolve) => setTimeout(resolve, 50));
    const second = await request('POST', '/v1/control/start', { body: { role: 'chat', model_id: slow.id } });
    assert.equal(second.status, 409);
    assert.equal(second.json.error.code, 'busy');
    launcher.release();
    assert.equal((await first).status, 200);
  });
});

test('quit responde 202 antes de encerrar o launcher', async () => {
  const { handlers, calls } = fakeLauncher();
  await withServer(handlers, async (request) => {
    const answer = await request('POST', '/v1/control/quit', { body: {} });
    assert.equal(answer.status, 202);
    assert.deepEqual(answer.json, { quitting: true });
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(calls.quit, 1);
  });
});

test('o servidor da API escuta só no loopback', async () => {
  const { handlers } = fakeLauncher();
  const server = await control.createControlServer({ token: () => TOKEN, port: 0, handlers });
  try {
    assert.equal(server.address().address, '127.0.0.1');
    assert.equal(control.HOST, '127.0.0.1');
    assert.equal(control.PORT, 8787);
  } finally { server.close(); }
});
