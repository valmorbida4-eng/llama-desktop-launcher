'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {openCodeCommand}=require('../build/app/client_commands');
const connection={endpoint:'http://192.168.1.5:8080/v1',scope:'LAN',context:4096,parallel:1};
test('comandos OpenCode usam endpoint literal, alias fixo e solicitam chave sem incluí-la',()=>{
 for(const platform of ['bash','powershell']){
  const command=openCodeCommand(connection,platform);
  assert.match(command,/llama-local\/modelo-local/);
  assert.ok(command.includes(connection.endpoint));
  assert.ok(command.includes('{env:LLAMA_API_KEY}'));
  assert.match(command,/"context":4096/);
  assert.match(command,/OPENCODE_CONFIG_CONTENT/);
 }
 assert.match(openCodeCommand(connection,'bash'),/read -rsp/);
 assert.match(openCodeCommand(connection,'powershell'),/-AsSecureString/);
});
test('contexto por sessão é respeitado e acesso local não pede chave',()=>{
 const command=openCodeCommand({...connection,scope:'Local',parallel:2},'bash');
 assert.match(command,/"context":2048/);assert.doesNotMatch(command,/read -rsp/);
 assert.throws(()=>openCodeCommand({...connection,endpoint:'file:///tmp/v1'},'bash'),/Endpoint/);
 assert.throws(()=>openCodeCommand(connection,'cmd'),/Bash/);
});

test('comandos compartilhados levam somente a credencial temporária e não solicitam chave',()=>{
 const token='x'.repeat(43);
 for(const platform of ['bash','powershell']){
  const command=openCodeCommand({...connection,endpoint:'http://192.168.1.5:8181/v1'},platform,token);
  assert.ok(command.includes(token));assert.ok(command.includes('http://192.168.1.5:8181/v1'));
  assert.doesNotMatch(command,/read -rsp|Read-Host/);
 }
 assert.throws(()=>openCodeCommand(connection,'bash',"invalid';command"),/compartilhamento/);
});
