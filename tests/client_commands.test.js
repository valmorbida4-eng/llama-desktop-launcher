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

test('exportações de clientes preservam contexto e usam somente a credencial selecionada',()=>{
 const {clientConfiguration}=require('../build/app/client_commands'),token='t'.repeat(43),c={...connection,parallel:2};
 for(const name of ['opencode','pi','hermes','aider','continue','cline','codex','generic']){
  const output=clientConfiguration(c,name,token);assert.ok(output.includes(c.endpoint));assert.ok(output.includes('modelo-local'));assert.ok(output.includes(token));assert.ok(output.includes('2048')||name==='hermes');
  assert.ok(clientConfiguration(c,name).includes('SUBSTITUA_PELA_CHAVE_DA_API'));
 }
 const pi=JSON.parse(clientConfiguration(c,'pi',token));assert.equal(pi.providers['llama-local'].api,'openai-completions');assert.equal(pi.providers['llama-local'].models[0].maxTokens,1024);
 assert.match(clientConfiguration(c,'codex',token),/EXPERIMENTAL.*Responses API/);
 assert.throws(()=>clientConfiguration(c,'__proto__',token),/Aplicativo/);
});
test('Aider usa suas variáveis e restaura ambiente no PowerShell',()=>{
 const {clientCommand}=require('../build/app/client_commands');
 for(const platform of ['bash','powershell']){
  const output=clientCommand(connection,'aider',platform,'t'.repeat(43));assert.match(output,/aider --model 'openai\/modelo-local'/);assert.match(output,/OPENAI_API_BASE/);assert.match(output,/OPENAI_API_KEY/);assert.doesNotMatch(output,/OPENCODE_CONFIG_CONTENT|LLAMA_API_KEY|opencode --model/);
 }
 assert.match(clientCommand(connection,'aider','powershell'),/finally/);
 assert.throws(()=>clientCommand(connection,'pi','bash'),/configuração/);
});

test('Strata/PolyStrata: comandos e configurações usam o ID publicado pelo motor ativo',()=>{
 const {clientConfiguration,clientCommand}=require('../build/app/client_commands');
 const strata={...connection,modelId:'Qwen3.6-35B-A3B'},token='t'.repeat(43);
 for(const platform of ['bash','powershell']){
  const command=openCodeCommand(strata,platform);
  assert.match(command,/opencode --model 'llama-local\/Qwen3\.6-35B-A3B'/);
  assert.match(command,/"model":"llama-local\/Qwen3\.6-35B-A3B"/);
  assert.doesNotMatch(command,/modelo-local/);
  assert.match(clientCommand(strata,'aider',platform,token),/aider --model 'openai\/Qwen3\.6-35B-A3B'/);
 }
 for(const name of ['opencode','pi','hermes','continue','cline','codex','generic']){
  const output=clientConfiguration(strata,name,token);
  assert.ok(output.includes('Qwen3.6-35B-A3B'),name);assert.doesNotMatch(output,/modelo-local/,name);
 }
 // Sem modelId, continua o alias fixo do llama.cpp e do vLLM.
 assert.match(openCodeCommand({...connection,modelId:null},'bash'),/llama-local\/modelo-local/);
});
test('ID de modelo: recusa só controle, vazio, longo demais ou começo com hífen',()=>{
 for(const modelId of ['-flag','x'.repeat(129),'a\nb','a\u0000b','tab\there','del\u007f'])
  assert.throws(()=>openCodeCommand({...connection,modelId},'bash'),/ID de modelo/);
 for(const modelId of ['Qwen 3.6 Flash',"it's","$(id)",'x'.repeat(128)])
  assert.doesNotThrow(()=>openCodeCommand({...connection,modelId},'bash'));
});

// Roda o comando gerado num shell real com um opencode falso que só devolve a configuração e o
// argumento --model. Se o ID escapasse das aspas, a saída mudaria ou o shell executaria $(id).
const hostile="Qwen 3.6 ‘Flash’ it's $(id) `whoami` ; rm -rf ~ \"x\"";
function runShell(file,args){
 const result=require('node:child_process').spawnSync(file,args,{encoding:'utf8',timeout:30000,windowsHide:true});
 if(result.error&&result.error.code==='ENOENT')return null;
 assert.equal(result.status,0,result.stderr);
 return result.stdout;
}
function checkInert(output){
 const [config,model]=Buffer.from(output.trim(),'base64').toString('utf8').split('\n');
 assert.equal(model,'llama-local/'+hostile);
 const parsed=JSON.parse(config);
 assert.equal(parsed.model,'llama-local/'+hostile);
 assert.ok(Object.hasOwn(parsed.provider['llama-local'].models,hostile));
}
test('ID com aspas, $(id) e espaços fica inerte no Bash',t=>{
 const command=openCodeCommand({...connection,scope:'Local',modelId:hostile},'bash');
 const fake=`opencode(){ printf '%s\\n%s' "$OPENCODE_CONFIG_CONTENT" "$2" | base64 | tr -d '\\n'; }\n`;
 const output=runShell('bash',['-c',fake+command]);
 if(output===null){t.skip('bash indisponível');return;}
 checkInert(output);
});
test('ID com aspas, $(id) e espaços fica inerte no PowerShell',t=>{
 const command=openCodeCommand({...connection,scope:'Local',modelId:hostile},'powershell');
 const fake="function opencode { [Console]::Out.Write([Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($env:OPENCODE_CONFIG_CONTENT + \"`n\" + $args[1]))) }\n";
 const encoded=Buffer.from(fake+command,'utf16le').toString('base64');
 let output=null;
 for(const shell of ['pwsh','powershell.exe']){output=runShell(shell,['-NoProfile','-NonInteractive','-EncodedCommand',encoded]);if(output!==null)break;}
 if(output===null){t.skip('PowerShell indisponível');return;}
 checkInert(output);
});
test('Aider também cita o ID nos dois shells',()=>{
 const {clientCommand}=require('../build/app/client_commands');
 assert.ok(clientCommand({...connection,modelId:"a b'c"},'aider','bash','t'.repeat(43)).includes("aider --model 'openai/a b'\\''c'"));
 assert.ok(clientCommand({...connection,modelId:"a b'c"},'aider','powershell','t'.repeat(43)).includes("aider --model 'openai/a b''c'"));
});
