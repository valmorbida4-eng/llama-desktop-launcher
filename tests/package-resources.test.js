'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const pkg=require('../package.json');
test('pacote público inclui somente manuais e licença como recursos extras',()=>{
 assert.deepEqual(pkg.build.extraResources,[
  {from:'docs/MANUAL-pt-BR.pdf',to:'docs/MANUAL-pt-BR.pdf'},
  {from:'docs/MANUAL-en.pdf',to:'docs/MANUAL-en.pdf'},
  {from:'LICENSE',to:'LICENSE'}
 ]);
});
test('instalador Windows mantém a escolha do atalho em instalações silenciosas e atualizações',()=>{
 const script=require('node:fs').readFileSync(require('node:path').join(__dirname,'..','build','installer.nsh'),'utf8');
 const macro=name=>script.match(new RegExp(String.raw`!macro ${name}\r?\n([\s\S]*?)!macroend`))?.[1]||'';
 // The previous uninstaller deletes the install registry key, so the choice must be read in customInit.
 assert.match(macro('customInit'),/ReadRegStr \$PreviousDesktopShortcut SHELL_CONTEXT "\$\{INSTALL_REGISTRY_KEY\}" DesktopShortcut/);
 assert.match(macro('customInstall'),/\$\{If\} \$\{Silent\}[\s\S]*\$PreviousDesktopShortcut == "false"/);
 assert.match(macro('customInstall'),/WriteRegStr SHELL_CONTEXT "\$\{INSTALL_REGISTRY_KEY\}" DesktopShortcut "true"/);
 assert.match(macro('customUnInstall'),/\$\{AndIfNot\} \$\{isUpdated\}/);
});
