'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const pkg=require('../package.json');
test('pacote público inclui somente os guias PDF e a licença como recursos extras',()=>{
 assert.deepEqual(pkg.build.extraResources,[
  {from:'docs/MANUAL-pt-BR.pdf',to:'docs/MANUAL-pt-BR.pdf'},
  {from:'docs/MANUAL-en.pdf',to:'docs/MANUAL-en.pdf'},
  {from:'docs/INTEGRATION-pt-BR.pdf',to:'docs/INTEGRATION-pt-BR.pdf'},
  {from:'docs/INTEGRATION-en.pdf',to:'docs/INTEGRATION-en.pdf'},
  {from:'docs/DIAGNOSTICS-pt-BR.pdf',to:'docs/DIAGNOSTICS-pt-BR.pdf'},
  {from:'docs/DIAGNOSTICS-en.pdf',to:'docs/DIAGNOSTICS-en.pdf'},
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
 // Without an explicit icon Explorer may cache a blank icon while an update replaces the executable.
 assert.match(macro('customInstall'),/CreateShortcut "\$DESKTOP\\Llama Desktop Launcher\.lnk" "\$INSTDIR\\\$\{APP_EXECUTABLE_FILENAME\}" "" "\$INSTDIR\\\$\{APP_EXECUTABLE_FILENAME\}" 0/);
 assert.match(macro('customInstall'),/WinShell::SetLnkAUMI "\$DESKTOP\\Llama Desktop Launcher\.lnk" "\$\{APP_ID\}"/);
});
test('cada guia PDF empacotado existe nos dois idiomas, com o Markdown de origem',()=>{
 const fs=require('node:fs'),path=require('node:path');
 for(const doc of ['MANUAL','INTEGRATION','DIAGNOSTICS'])for(const lang of ['pt-BR','en']){
  for(const ext of ['md','pdf'])assert.ok(fs.existsSync(path.join(__dirname,'..','docs',`${doc}-${lang}.${ext}`)),`${doc}-${lang}.${ext}`);
 }
});
