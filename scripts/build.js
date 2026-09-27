'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'build', 'app');
fs.rmSync(output, { recursive: true, force: true });
const compiler = path.join(root, 'node_modules', 'typescript', 'bin', 'tsc');
const result = spawnSync(process.execPath, [compiler, '--project', path.join(root, 'tsconfig.json')], { cwd: root, stdio: 'inherit' });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
const renderer = spawnSync(process.execPath, [compiler, '--project', path.join(root, 'tsconfig.renderer.json')], { cwd: root, stdio: 'inherit' });
if (renderer.error) throw renderer.error;
if (renderer.status !== 0) process.exit(renderer.status ?? 1);
for (const file of ['index.html', 'style.css']) fs.copyFileSync(path.join(root, 'src', file), path.join(output, file));


