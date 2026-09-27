'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {defaults,argsForModel,validateSettings,recommend,isWithin,scanModels}=require('../build/app/core');
const {assetFor}=require('../build/app/engine');
const network=require('../build/app/network');
const cli=require('../build/app/cli');

test('argumentos densos e MoE preservam cada ajuste',()=>{
  const m={path:'/models/a.gguf',projector:'/models/mmproj.gguf'};
  const a=argsForModel(m,{...defaults,cpuMoe:'34',threads:'6',device:'Vulkan0'},'server',8123);
  assert.deepEqual(a.slice(0,4),['-m',m.path,'-fit','on']);
  assert.ok(a.includes('-ncmoe'));assert.ok(a.includes('34'));
  assert.ok(a.includes('--mmproj'));assert.ok(a.includes('Vulkan0'));
  assert.deepEqual(a.slice(-6),['--host','127.0.0.1','--port','8123','--parallel','1']);
});
test('parâmetros inválidos não chegam ao processo',()=>{
  assert.throws(()=>validateSettings({...defaults,ubatch:1024,batch:512}),/Microbatch/);
  assert.throws(()=>validateSettings({...defaults,device:'Vulkan0 --host 0.0.0.0'}),/Dispositivo/);
});
test('acesso remoto exige chave e aceita sessões configuradas',()=>{
  const m={path:'C:/models/model.gguf'};
  assert.throws(()=>argsForModel(m,defaults,'server',8080,{host:'192.168.1.3',parallel:2}),/Chave/);
  const a=argsForModel(m,defaults,'server',8080,{host:'192.168.1.3',parallel:2,keyPath:'C:/key.txt'});
  assert.deepEqual(a.slice(-8),['--host','192.168.1.3','--port','8080','--parallel','2','--api-key-file','C:/key.txt']);
});
test('rede valida sessões e protege a ponte local contra outra origem',()=>{
  assert.equal(network.validateParallel('8'),8);
  assert.throws(()=>network.validateParallel(9),/Sessões/);
  assert.equal(network.scopeOf('100.100.1.2'),'Tailscale');
  assert.equal(network.scopeOf('8.8.8.8'),null);
  assert.equal(network.allowLocalRequest({headers:{host:'127.0.0.1:4567'}},4567),true);
  assert.equal(network.allowLocalRequest({headers:{host:'127.0.0.1:4567',origin:'https://example.org'}},4567),false);
  assert.equal(network.allowLocalRequest({headers:{host:'other.example:4567'}},4567),false);
});
test('CLI mantém perfil do modelo com as opções aceitas pelo motor instalado',()=>{
  const model={path:'C:/models/a.gguf'};
  const args=cli.argsForConversation(model,{...defaults,context:8192,cpuMoe:'12'});
  assert.ok(args.includes('-c'));assert.ok(args.includes('8192'));
  assert.ok(args.includes('-ncmoe'));assert.ok(args.includes('12'));
  assert.equal(args.includes('--conversation'),false);
  assert.equal(args.includes('--interactive-first'),false);
  assert.equal(cli.executableName('win32'),'llama-cli.exe');
  assert.equal(cli.executableName('linux'),'llama-cli');
});
test('recomendação distingue MoE de modelo denso',()=>{
  const hw={memoryBytes:32*1024**3,logicalCores:12,physicalCores:6,gpuMemoryBytes:8*1024**3};
  const moe=recommend({path:'Qwen3-Coder-30B-A3B.gguf',size:18*1024**3},hw);
  const dense=recommend({path:'Dense-14B.gguf',size:9*1024**3},hw);
  assert.equal(moe.cpuMoe,34);assert.equal(dense.cpuMoe,'');assert.equal(moe.cacheK,'q8_0');
});
test('descoberta de GGUF ignora projetor e shards posteriores',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gguf-test-'));
  try{for(const name of ['model-00001-of-00003.gguf','model-00002-of-00003.gguf','model-00003-of-00003.gguf','mmproj-model.gguf'])fs.writeFileSync(path.join(dir,name),'x');const models=scanModels([dir]);assert.equal(models.length,1);assert.ok(models[0].projector);}
  finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('release oficial é selecionada por plataforma',()=>{
  const release={tag_name:'b11193',assets:[{name:'llama-b11193-bin-win-vulkan-x64.zip'},{name:'llama-b11193-bin-ubuntu-vulkan-x64.tar.gz'},{name:'llama-b11193-bin-macos-arm64.tar.gz'}]};
  assert.match(assetFor(release,'win32','x64').name,/win-vulkan/);
  assert.match(assetFor(release,'linux','x64').name,/ubuntu-vulkan/);
  assert.match(assetFor(release,'darwin','arm64').name,/macos/);
});
test('localizações protegidas não confundem caminhos irmãos',()=>{
  const base=path.join(os.tmpdir(),'llama-app');
  assert.equal(isWithin(base,path.join(base,'models')),true);
  assert.equal(isWithin(base,path.join(os.tmpdir(),'llama-app-backup','models')),false);
});
