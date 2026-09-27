'use strict';
// Only for building a disposable DEB in /tmp/llama-desktop-test.* on a Linux VM.
const fs=require('node:fs');
const path=require('node:path');
const cwd=fs.realpathSync(process.cwd());
if(process.platform!=='linux'||!cwd.startsWith('/tmp/llama-desktop-test.'))throw Error('Test metadata may only be prepared inside the isolated Linux VM test directory.');
const file=path.join(cwd,'package.json');
const pkg=JSON.parse(fs.readFileSync(file,'utf8'));
pkg.homepage='https://localhost.invalid/llama-desktop-launcher-test';
pkg.author={name:'Célio',email:'build-test@localhost.invalid'};
pkg.build.linux.maintainer='Llama Desktop Launcher Test <build-test@localhost.invalid>';
fs.writeFileSync(file,JSON.stringify(pkg,null,2)+'\n');
process.stdout.write('Temporary test-only Linux package metadata added.\n');
