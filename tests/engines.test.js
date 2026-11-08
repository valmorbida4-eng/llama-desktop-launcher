'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {EventEmitter}=require('node:events');
const engines=require('../build/app/engines');
const {defaults,apiModelId}=require('../build/app/core');

function temp(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'engines-test-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;}
function write(file,content=''){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,content);}
function strataInstall(root,platform,{poly=false}={}){
  write(path.join(root,'serve','server.py'));
  write(engines.strataPython(root,platform));
  if(poly)write(path.join(root,'polystrata.py'));
}

test('catálogo oferece vLLM no Linux (venv) e no Windows (Docker), e nenhum motor extra no macOS',()=>{
  const byId=platform=>Object.fromEntries(engines.engineCatalog(platform).map(e=>[e.id,e]));
  assert.deepEqual(engines.engineCatalog('linux').map(e=>e.id),engines.ENGINE_IDS);
  assert.equal(byId('linux').vllm.mode,'venv');assert.equal(byId('win32').vllm.mode,'docker');
  assert.equal(byId('darwin').vllm.supported,false);assert.equal(byId('darwin').strata.supported,false);
  assert.equal(byId('win32').strata.supported,true);assert.equal(byId('linux').strata.supported,true);
  for(const platform of ['win32','linux','darwin']) {
    const all=byId(platform);
    assert.equal(all.llamacpp.supported,true);
    assert.deepEqual(all.llamacpp.features,{chat:true,cli:true,bench:true,tuning:true});
    assert.equal(all.vllm.features.bench,false);assert.equal(all.strata.features.cli,false);
  }
  assert.throws(()=>engines.engineInfo('ollama','linux'),/desconhecido/);
});

test('vLLM é instalado numa versão fixa, num ambiente Python só do launcher',()=>{
  const steps=engines.vllmInstallSteps('/data/vllm');
  assert.deepEqual(steps[0].args,['-m','venv','/data/vllm']);
  assert.equal(steps.at(-1).file,path.join('/data/vllm','bin','python'));
  assert.deepEqual(steps.at(-1).args,['-m','pip','install',`vllm==${engines.VLLM_VERSION}`]);
  assert.equal(engines.VLLM_IMAGE,`vllm/vllm-openai:v${engines.VLLM_VERSION}`);
  assert.match(engines.VLLM_VERSION,/^\d+\.\d+\.\d+$/);
});

test('instalação do vLLM que falha remove a pasta parcial e explica a falta de Python',async t=>{
  const root=temp(t),dir=path.join(root,'vllm');
  const failing=(code,error)=>(file,args)=>{fs.mkdirSync(dir,{recursive:true});const child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();
    setImmediate(()=>{if(error)child.emit('error',error);else{child.stderr.emit('data','pip: sem rede');child.emit('exit',code);}});return child;};
  await assert.rejects(engines.installVllm(dir,{spawnProcess:failing(1)}),/falhou \(1\).*sem rede/);
  assert.equal(fs.existsSync(dir),false);
  await assert.rejects(engines.installVllm(dir,{spawnProcess:failing(null,Object.assign(Error('spawn python3 ENOENT'),{code:'ENOENT'}))}),/Python 3 não encontrado/);
  assert.equal(fs.existsSync(dir),false);
  fs.mkdirSync(dir);
  await assert.rejects(engines.installVllm(dir,{spawnProcess:failing(0)}),/Já existe/);
});

test('modelos do vLLM são pastas Hugging Face com config.json e safetensors',t=>{
  const root=temp(t);
  write(path.join(root,'Qwen3-8B-AWQ','config.json'),'{}');
  write(path.join(root,'Qwen3-8B-AWQ','model-00001-of-00002.safetensors'),'1234');
  write(path.join(root,'Qwen3-8B-AWQ','model-00002-of-00002.safetensors'),'56');
  write(path.join(root,'Qwen3-8B-AWQ','sub','config.json'),'{}');
  write(path.join(root,'Qwen3-8B-AWQ','sub','x.safetensors'),'1');
  write(path.join(root,'so-config','config.json'),'{}');
  write(path.join(root,'gguf','model.gguf'),'x');
  write(path.join(root,'.cache','hub','config.json'),'{}');write(path.join(root,'.cache','hub','a.safetensors'),'1');
  const found=engines.scanHfModels([root,'',path.join(root,'nao-existe')]);
  assert.equal(found.length,1);
  assert.equal(found[0].path,path.resolve(root,'Qwen3-8B-AWQ'));
  assert.equal(found[0].engine,'vllm');assert.equal(found[0].size,6);
  assert.match(found[0].name,/Qwen3-8B-AWQ · vLLM/);
});

test('Strata e PolyStrata são reconhecidos pela pasta instalada e listam as configurações strata-*.json',t=>{
  for(const platform of ['win32','linux']) {
    const root=temp(t);
    assert.equal(engines.detectStrata(root,platform),null);
    write(path.join(root,'serve','server.py'));
    assert.equal(engines.detectStrata(root,platform),null,'sem .venv o instalador ainda não rodou');
    strataInstall(root,platform);
    assert.equal(engines.detectStrata(root,platform).distribution,'Strata');
    write(path.join(root,'polystrata.py'));
    assert.equal(engines.detectStrata(root,platform).distribution,'PolyStrata');
    write(path.join(root,'strata-qwen36-ud-q4_k_xl.json'),JSON.stringify({model_name:'Qwen3.6-35B-A3B',args:['--ctx','65536','--kv','int8']}));
    write(path.join(root,'strata-glm.json'),JSON.stringify({args:['-c','32k']}));
    write(path.join(root,'strata-glm.shared-settings.json'),'{}');
    write(path.join(root,'strata-glm.json.bak'),'{}');
    write(path.join(root,'strata-broken.json'),'{nope');
    write(path.join(root,'outro.json'),'{}');
    const found=engines.scanStrataConfigs(root,platform);
    assert.deepEqual(found.map(m=>m.modelName),['glm','Qwen3.6-35B-A3B']);
    assert.ok(found.every(m=>m.engine==='strata'&&m.distribution==='PolyStrata'));
    assert.deepEqual(found.map(m=>m.context),[32000,65536]);
  }
  assert.deepEqual(engines.scanStrataConfigs('',process.platform),[]);
});

test('vLLM no Linux usa o vllm do ambiente e passa a chave por variável de ambiente',t=>{
  const venv=temp(t);write(engines.vllmExecutable(venv));
  const model={path:'/models/Qwen3-8B-AWQ',engine:'vllm'};
  const local=engines.serverCommand(model,{...defaults,context:8192},{host:'127.0.0.1',port:8080,parallel:2,platform:'linux',vllmDir:venv});
  assert.equal(local.file,engines.vllmExecutable(venv));
  assert.deepEqual(local.args,['serve',model.path,'--host','127.0.0.1','--port','8080','--served-model-name',apiModelId,'--max-model-len','8192','--max-num-seqs','2']);
  assert.deepEqual(local.env,{});
  assert.throws(()=>engines.serverCommand(model,defaults,{host:'192.168.1.5',port:8080,platform:'linux',vllmDir:venv}),/Chave/);
  const lan=engines.serverCommand(model,defaults,{host:'192.168.1.5',port:8080,key:'segredo',platform:'linux',vllmDir:venv});
  assert.deepEqual(lan.env,{VLLM_API_KEY:'segredo'});
  assert.ok(!lan.args.includes('segredo'));
  assert.throws(()=>engines.serverCommand(model,defaults,{host:'127.0.0.1',port:8080,platform:'linux',vllmDir:path.join(venv,'vazio')}),/Instale o vLLM/);
  assert.throws(()=>engines.serverCommand(model,defaults,{host:'127.0.0.1',port:8080,platform:'darwin'}),/macOS/);
  assert.throws(()=>engines.serverCommand(model,{...defaults,context:0},{host:'127.0.0.1',port:8080,platform:'linux',vllmDir:venv}),/Contexto/);
});

test('vLLM no Windows roda a imagem fixa no Docker com o modelo montado só para leitura',()=>{
  const model={path:'C:\\Modelos\\Qwen3 8B AWQ',engine:'vllm'},containerName=engines.VLLM_CONTAINER_PREFIX+'abc123';
  const command=engines.serverCommand(model,{...defaults,context:4096},{host:'192.168.0.10',port:8081,parallel:1,key:'segredo',platform:'win32',containerName});
  assert.equal(command.file,'docker');
  assert.deepEqual(command.args.slice(0,8),['run','--rm','--name',containerName,'--gpus','all','--ipc=host','-p']);
  assert.ok(command.args.includes('192.168.0.10:8081:8000'));
  assert.ok(command.args.includes(`type=bind,source=${model.path},target=/model,readonly`));
  const image=command.args.indexOf(engines.VLLM_IMAGE);
  assert.deepEqual(command.args.slice(image-2,image),['-e','VLLM_API_KEY']);
  assert.deepEqual(command.args.slice(image+1,image+4),['/model','--served-model-name',apiModelId]);
  assert.ok(!command.args.includes('segredo'));assert.deepEqual(command.env,{VLLM_API_KEY:'segredo'});
  assert.throws(()=>engines.serverCommand({...model,path:'C:\\a,b'},defaults,{host:'127.0.0.1',port:8081,platform:'win32',containerName}),/vírgulas/);
  assert.throws(()=>engines.serverCommand(model,defaults,{host:'127.0.0.1',port:8081,platform:'win32',containerName:'x; rm'}),/contêiner/);
  assert.deepEqual(engines.stopCommand({containerName}),{file:'docker',args:['stop','-t','30',containerName]});
  assert.equal(engines.stopCommand({containerName:null}),null);
  assert.throws(()=>engines.stopCommand({containerName:'outro-container'}),/inválido/);
});

test('Strata sobe serve/server.py do próprio .venv com a configuração escolhida',t=>{
  for(const platform of ['win32','linux']) {
    const root=temp(t);strataInstall(root,platform,{poly:true});
    const config=path.join(root,'strata-qwen36.json');write(config,'{}');
    const command=engines.serverCommand({path:config,engine:'strata'},defaults,{host:'127.0.0.1',port:8090,platform,strataDir:root});
    assert.equal(command.file,engines.strataPython(root,platform));
    assert.equal(command.cwd,root);
    assert.deepEqual(command.args,[path.join('serve','server.py'),'--engine','strata','--config',config,'--host','127.0.0.1','--port','8090']);
    const lan=engines.serverCommand({path:config,engine:'strata'},defaults,{host:'100.64.1.2',port:8090,key:'k',platform,strataDir:root});
    assert.deepEqual(lan.env,{STRATA_API_KEY:'k'});
    const outside=path.join(temp(t),'strata-x.json');write(outside,'{}');
    assert.throws(()=>engines.serverCommand({path:outside,engine:'strata'},defaults,{host:'127.0.0.1',port:8090,platform,strataDir:root}),/pasta do Strata/);
    assert.throws(()=>engines.serverCommand({path:config,engine:'strata'},defaults,{host:'127.0.0.1',port:8090,platform,strataDir:temp(t)}),/instalação do Strata/);
  }
  assert.throws(()=>engines.serverCommand({path:'/m.gguf',engine:'llamacpp'},defaults,{host:'127.0.0.1',port:8080}),/llama\.cpp/);
});

test('contexto do Strata é lido dos argumentos da configuração',()=>{
  assert.equal(engines.contextFromArgs(['--ctx','128k']),128000);
  assert.equal(engines.contextFromArgs(['--context','4096']),4096);
  assert.equal(engines.contextFromArgs(['--ctx']),null);
  assert.equal(engines.contextFromArgs(['--ctx','abc']),null);
  assert.equal(engines.contextFromArgs(null),null);
});
