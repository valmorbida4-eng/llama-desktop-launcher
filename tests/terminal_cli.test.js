'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { shQuote, psQuote, posixScript, powershellScript, terminalCommand } = require('../src/terminal_cli');

test('caminhos com aspas e metacaracteres ficam literais nos scripts da CLI', () => {
  assert.equal(shQuote("a'b;$(touch unsafe)"), "'a'\\''b;$(touch unsafe)'");
  assert.equal(psQuote("a'b;$(touch unsafe)"), "'a''b;$(touch unsafe)'");
  const posix = posixScript('/model dir', '/engine/llama-cli', ['-m', "modelo';touch unsafe.gguf"]);
  const powershell = powershellScript('C:\\model dir', 'C:\\engine\\llama-cli.exe', ['-m', "modelo';touch unsafe.gguf"]);
  assert.match(posix, /'modelo'\\'';touch unsafe\.gguf'/);
  assert.match(powershell, /'modelo'';touch unsafe\.gguf'/);
});

test('CLI externa usa terminal nativo e avisa quando Linux não tem terminal gráfico', () => {
  assert.deepEqual(terminalCommand('win32', 'C:\\run.ps1'), {
    file: 'powershell.exe', args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'C:\\run.ps1'],
  });
  assert.deepEqual(terminalCommand('darwin', '/tmp/run.command'), {
    file: 'open', args: ['-a', 'Terminal', '/tmp/run.command'],
  });
  assert.throws(() => terminalCommand('linux', '/tmp/run.sh', { PATH: '' }), /terminal gráfico/);
});
