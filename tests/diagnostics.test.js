'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {redact,buildReport,createLogBuffer,REDACTED}=require('../build/app/diagnostics');

const key='A'.repeat(43),share='b'.repeat(43);
function sample(log=''){
 return {generatedAt:'2026-11-08T12:00:00.000Z',app:{version:'0.7.0',packaged:true,electron:'41.0.0',node:'22.0.0'},
  system:{platform:'win32',arch:'x64',release:'10.0.26300',version:'Windows 11 Pro'},
  hardware:{cpu:'CPU X',logicalCores:16,memoryBytes:32*1024**3},gpu:{name:'RTX 4060',memoryBytes:8*1024**3,source:'registry'},
  engines:[{label:'llama.cpp',supported:true,ready:true,mode:'binary',version:'b12110',detail:'C:\\Users\\Celio\\AppData\\Roaming\\x\\engines\\1'},
   {label:'vLLM',supported:true,ready:false,mode:'docker',version:'0.32.0',detail:'Docker Desktop não encontrado ou parado'},
   {label:'Strata / PolyStrata',supported:false,ready:false,mode:'folder',unsupportedReason:'Só Windows e Linux.'}],
  llama:{backend:'cuda-12.4',release:'b12110',pinned:'b12110'},docker:{checked:true,daemon:false,image:false},
  paths:{userData:'C:\\Users\\Celio\\AppData\\Roaming\\x',modelDirs:[{path:'C:/Users/Celio/Models/GGUF',exists:true},{path:'',exists:false}],apiKeySaved:true},
  models:{total:2,byEngine:{llamacpp:1,vllm:1},selected:{name:'qwen.gguf',engine:'llamacpp',size:4*1024**3,path:'C:\\Users\\Celio\\Models\\GGUF\\qwen.gguf',profile:{context:4096}}},
  access:{host:'192.168.1.5',scope:'LAN',parallel:2},
  run:{server:true,chat:false,benchmark:false,engineBusy:false,active:{engineLabel:'llama.cpp',scope:'LAN',host:'192.168.1.5',port:8080,modelId:'modelo-local',context:4096,parallel:2,sharing:true,container:null}},
  update:{enabled:true,lastCheck:null,checked:true,available:true,version:'0.7.1'},
  log,secrets:[key,share,null],home:'C:\\Users\\Celio'};
}

test('relatório traz versões, motores, pastas e servidor, com a pasta pessoal trocada por ~',()=>{
 const report=buildReport(sample('servidor pronto\n'));
 for(const text of ['v0.7.0','win32 x64','RTX 4060','8.0 GB','llama.cpp b12110: pronto','vLLM 0.32.0: pendente','indisponível nesta plataforma','Só Windows e Linux.','cuda-12.4','serviço ativo não',
  'Modelos 1: ~/Models/GGUF (existe)','Modelos 2: não configurada','Chave de API salva: sim','llamacpp: 1 · vllm: 1','qwen.gguf · motor llamacpp','LAN 192.168.1.5:8080','ID do modelo na API modelo-local','Compartilhamento: ativo','Versão 0.7.1 disponível','servidor pronto'])
  assert.ok(report.includes(text),text);
 assert.doesNotMatch(report,/Celio/);
 assert.ok(report.includes('~\\AppData\\Roaming\\x'));
});

test('chaves, tokens e cabeçalhos são removidos do registro',()=>{
 const log=[`chave ${key}`,`link http://192.168.1.5:8181/#token=${share}`,'Authorization: Bearer abcdefghijklmnop',
  'VLLM_API_KEY=supersecreto123','"api_key": "outrosegredo99"','?token=0123456789abcdef&x=1','HF_TOKEN=hf_abcdefghijklmnopqrstuvwxyz','sk-abcdefghijklmnopqrstuvwxyz','Cookie: llama_share=zzzzzzzzzz',
  'n_tokens = 512','max_tokens: 64'].join('\n');
 const report=buildReport(sample(log));
 for(const secret of [key,share,'abcdefghijklmnop','supersecreto123','outrosegredo99','0123456789abcdef','hf_abcdefghij','sk-abcdefghij','zzzzzzzzzz'])
  assert.ok(!report.includes(secret),secret);
 assert.ok(report.includes(REDACTED));
 // Contagens de tokens do motor não são confundidas com segredos.
 assert.ok(report.includes('n_tokens = 512'));assert.ok(report.includes('max_tokens: 64'));
});

test('registro vazio e limites do buffer',()=>{
 assert.match(buildReport(sample('')),/\(vazio: nenhum servidor/);
 const buffer=createLogBuffer(10);buffer.append('0123456789');buffer.append('abc');assert.equal(buffer.text(),'3456789abc');buffer.clear();assert.equal(buffer.text(),'');
 const long='x'.repeat(20000)+'FIM';const report=buildReport(sample(long));assert.ok(report.includes('FIM'));assert.ok(!report.includes('x'.repeat(12001)));
});

test('redact troca a pasta pessoal nas duas grafias e ignora segredos curtos',()=>{
 assert.equal(redact('C:/Users/Celio/a e C:\\Users\\Celio\\b',{home:'C:\\Users\\Celio'}),'~/a e ~\\b');
 assert.equal(redact('abc',{secrets:['abc']}),'abc');
});

test('redact só troca a pasta pessoal inteira, não um prefixo de outro nome',()=>{
 const home='/home/ana';
 assert.equal(redact('/home/anabela/models e /home/ana/models',{home}),'/home/anabela/models e ~/models');
 assert.equal(redact('pasta: /home/ana\nfim /home/ana',{home}),'pasta: ~\nfim ~');
 assert.equal(redact('"/home/ana" (/home/ana) /home/ana, /home/ana;',{home}),'"~" (~) ~, ~;');
 assert.equal(redact('C:\\Users\\Ana\\x e C:\\Users\\Anabela\\x',{home:'C:\\Users\\ana\\'}),'~\\x e C:\\Users\\Anabela\\x');
});
