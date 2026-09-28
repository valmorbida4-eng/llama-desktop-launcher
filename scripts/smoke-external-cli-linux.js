'use strict';
// Opt-in local smoke test (Linux only): npm run smoke:external:linux
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { openExternalCli, shQuote } = require('../build/app/terminal_cli');
const { defaults } = require('../build/app/core');

async function main() {
  if (process.platform !== 'linux') throw Error('Execute este smoke test somente no Linux.');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'llama-cli-smoke-'));
  const marker = path.join(directory, 'arguments.txt');
  const executable = path.join(directory, 'llama-cli');
  fs.writeFileSync(executable, `#!/bin/sh\nprintf '%s\\n' "$@" > ${shQuote(marker)}\n`, { mode: 0o700 });
  await openExternalCli({ engineDir: directory, model: { path: '/tmp/modelo com espaços.gguf' }, settings: defaults });
  for (let i = 0; i < 50 && !fs.existsSync(marker); i++) await new Promise(resolve => setTimeout(resolve, 100));
  assert.ok(fs.existsSync(marker), 'O terminal não executou a CLI de teste.');
  const args = fs.readFileSync(marker, 'utf8').trim().split('\n');
  assert.deepEqual(args.slice(0, 2), ['-m', '/tmp/modelo com espaços.gguf']);
  console.log('Terminal gráfico executou a CLI com argumentos preservados.');
  fs.rmSync(directory, { recursive: true, force: true });
}

main().catch(error => { console.error(error); process.exitCode = 1; });
