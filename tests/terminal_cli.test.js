'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { openExternalCli } = require('../build/app/terminal_cli');
const { shQuote, psQuote, posixScript, powershellScript, terminalCommand } = require('../build/app/terminal_cli');

test('caminhos com aspas e metacaracteres ficam literais nos scripts da CLI', () => {
  assert.equal(shQuote("a'b;$(touch unsafe)"), "'a'\\''b;$(touch unsafe)'");
  assert.equal(psQuote("a'b;$(touch unsafe)"), "'a''b;$(touch unsafe)'");
  const posix = posixScript('/model dir', '/engine/llama-cli', ['-m', "modelo';touch unsafe.gguf"]);
  const powershell = powershellScript('C:\\model dir', 'C:\\engine\\llama-cli.exe', ['-m', "modelo';touch unsafe.gguf"]);
  assert.match(posix, /'modelo'\\'';touch unsafe\.gguf'/);
  assert.match(powershell, /'modelo'';touch unsafe\.gguf'/);
});

test('Windows aguarda o bootstrap e propaga stderr antes de informar sucesso', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-launch-test-'));
  fs.writeFileSync(path.join(directory, 'llama-cli.exe'), '');
  let scriptPath;
  try {
    const child = new EventEmitter();
    child.stderr = new EventEmitter();
    const promise = openExternalCli({ engineDir: directory, model: { path: 'model.gguf' }, settings: require('../build/app/core').defaults, platform: 'win32', spawnProcess: (_file, args, options) => {
      assert.equal(options.windowsHide, true);
      assert.deepEqual(options.stdio, ['ignore', 'ignore', 'pipe']);
      const bootstrap = Buffer.from(args.at(-1), 'base64').toString('utf16le');
      scriptPath = bootstrap.match(/-File', '"(.*?)"'/)[1];
      return child;
    } });
    let settled = false;
    promise.then(() => { settled = true; }, () => { settled = true; });
    child.emit('spawn');
    await Promise.resolve();
    assert.equal(settled, false);
    child.emit('exit', 1);
    child.stderr.emit('data', Buffer.from('Falha ao abrir PowerShell'));
    child.emit('close', 1);
    await assert.rejects(promise, /Falha ao abrir PowerShell/);
    assert.equal(fs.existsSync(scriptPath), false);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
    if (scriptPath) fs.rmSync(path.dirname(scriptPath), { recursive: true, force: true });
  }
});

test('CLI externa usa terminal nativo e avisa quando Linux não tem terminal gráfico', () => {
  const windows = terminalCommand('win32', "C:\\model dir\\run's.ps1");
  assert.equal(windows.file, 'powershell.exe');
  assert.equal(windows.waitForExit, true);
  const bootstrap = Buffer.from(windows.args.at(-1), 'base64').toString('utf16le');
  assert.match(bootstrap, /Start-Process/);
  assert.match(bootstrap, /-WindowStyle Normal -ErrorAction Stop/);
  assert.ok(bootstrap.includes('"C:\\model dir\\run\'\'s.ps1"'));
  assert.deepEqual(terminalCommand('darwin', '/tmp/run.command'), {
    file: 'open', args: ['-a', 'Terminal', '/tmp/run.command'],
  });
  assert.throws(() => terminalCommand('linux', '/tmp/run.sh', { PATH: '' }), /terminal gráfico/);
});
