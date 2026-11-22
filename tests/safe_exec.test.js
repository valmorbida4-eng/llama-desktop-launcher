'use strict';
// O launcher não pode executar programas nem módulos que estejam na pasta de onde foi aberto.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.join(__dirname, '..');

test('o processo principal endurece a busca de executáveis antes de carregar qualquer módulo', () => {
  const main = fs.readFileSync(path.join(root, 'build', 'app', 'main.js'), 'utf8');
  const first = main.match(/require\(['"][^'"]+['"]\)[^;\n]*/)[0];
  assert.match(first, /safe_exec['"]\)\.hardenExecutableSearch\(\)/);
});

test('Windows: programa chamado só pelo nome não sai da pasta atual', { skip: process.platform !== 'win32' }, t => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'llama-safe-exec-'));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  const name = 'llama-launcher-teste-busca.exe';
  fs.copyFileSync(path.join(process.env.SystemRoot, 'System32', 'whoami.exe'), path.join(cwd, name));
  // Alguns terminais já definem a variável, o que esconderia a falha.
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.toLowerCase() === 'nodefaultcurrentdirectoryinexepath') delete env[key];
  const launch = harden => spawnSync(process.execPath, ['-e', [
    harden ? `require(${JSON.stringify(path.join(root, 'build', 'app', 'safe_exec.js'))}).hardenExecutableSearch();` : '',
    `const r=require('node:child_process').spawnSync(${JSON.stringify(name)},{stdio:'ignore'});`,
    "process.stdout.write(r.error?String(r.error.code):'executou');",
  ].join('')], { cwd, env, encoding: 'utf8' }).stdout;
  assert.equal(launch(false), 'executou', 'controle: sem a proteção a pasta atual é usada');
  assert.equal(launch(true), 'ENOENT');
});

test('fora do Windows a variável não é criada', () => {
  const env = {};
  require('../build/app/safe_exec').hardenExecutableSearch('linux', env);
  assert.deepEqual(env, {});
});

test('Start-Process usa o PowerShell do sistema, inclusive ao elevar', async () => {
  const decode = args => Buffer.from(args.at(-1), 'base64').toString('utf16le');
  let elevated;
  await require('../build/app/firewall').createRule(
    { program: 'C:\\Engine\\llama-server.exe', port: 8080, remoteAddress: '192.168.1.0/24' },
    { platform: 'win32', run: async (file, args) => { elevated = decode(args); } });
  const terminal = decode(require('../build/app/terminal_cli').terminalCommand('win32', 'C:\\tmp\\run.ps1').args);
  for (const script of [elevated, terminal]) assert.match(script, /Start-Process -FilePath \(Join-Path \$PSHOME 'powershell\.exe'\)/);
});

test('instalação do vLLM não importa módulos da pasta atual', async t => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'llama-safe-python-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const calls = [];
  const spawnProcess = (file, args) => {
    calls.push(args);
    const child = new (require('node:events').EventEmitter)();
    setImmediate(() => child.emit('exit', 0));
    return child;
  };
  // O processo simulado não cria bin/vllm, então a instalação termina com erro depois das três etapas.
  await assert.rejects(require('../build/app/engines').installVllm(path.join(base, 'venv'), { spawnProcess }));
  assert.equal(calls.length, 3);
  for (const args of calls) assert.deepEqual(args.slice(0, 2), ['-I', '-m']);
});
