'use strict';

// Checks that an unsigned preview DMG mounts and contains a usable app bundle.
// Usage: node scripts/smoke-macos-dmg.js path/to/installer.dmg
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed: ${result.stderr || result.stdout}`);
  }
  return result.stdout.trim();
}

const dmg = process.argv[2];
if (!dmg || !fs.existsSync(dmg) || !dmg.toLowerCase().endsWith('.dmg')) {
  throw new Error('Informe o caminho de um arquivo DMG existente.');
}

const mountpoint = fs.mkdtempSync(path.join(os.tmpdir(), 'llama-dmg-smoke-'));
let mounted = false;
try {
  run('hdiutil', ['attach', '-quiet', '-readonly', '-nobrowse', '-mountpoint', mountpoint, dmg]);
  mounted = true;

  const apps = fs.readdirSync(mountpoint).filter(name => name.endsWith('.app'));
  if (apps.length !== 1) throw new Error(`Esperado um aplicativo .app no DMG; encontrados: ${apps.length}.`);

  const app = path.join(mountpoint, apps[0]);
  const info = path.join(app, 'Contents', 'Info.plist');
  if (!fs.existsSync(info)) throw new Error('Info.plist ausente no pacote .app.');

  const executable = run('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleExecutable', info]);
  const bundleId = run('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleIdentifier', info]);
  const binary = path.join(app, 'Contents', 'MacOS', executable);
  if (bundleId !== 'br.celio.llamadesktoplauncher') throw new Error(`Bundle ID inesperado: ${bundleId}`);
  if (!fs.statSync(binary).isFile() || !(fs.statSync(binary).mode & 0o111)) {
    throw new Error(`Executável ausente ou sem permissão de execução: ${binary}`);
  }

  process.stdout.write(`OK DMG: ${apps[0]}, bundle ${bundleId}, executável ${executable}\n`);
} finally {
  if (mounted) run('hdiutil', ['detach', mountpoint, '-quiet']);
  fs.rmSync(mountpoint, { recursive: true, force: true });
}
