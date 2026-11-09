'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const params=require('../build/app/params');
const modelInfo=require('../build/app/model_info');
const core=require('../build/app/core');
const engines=require('../build/app/engines');
const benchmark=require('../build/app/benchmark');
const hardware=require('../build/app/hardware');

function temp(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'params-test-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;}
function write(file,content=''){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,content);}

// GGUF v3 mínimo: só os metadados (o leitor não chega aos tensores).
function gguf(kv){
  const parts=[Buffer.from('GGUF'),u32(3),u64(0),u64(kv.length)];
  for(const [key,type,value] of kv){parts.push(str(key),u32(type));parts.push(encode(type,value));}
  return Buffer.concat(parts);
  function u32(v){const b=Buffer.alloc(4);b.writeUInt32LE(v);return b;}
  function u64(v){const b=Buffer.alloc(8);b.writeBigUInt64LE(BigInt(v));return b;}
  function str(s){const t=Buffer.from(s);return Buffer.concat([u64(t.length),t]);}
  function encode(type,value){
    if(type===4)return u32(value);
    if(type===8)return str(value);
    if(type===9){const [itemType,items]=value;return Buffer.concat([u32(itemType),u64(items.length),...items.map(i=>encode(itemType,i))]);}
    throw Error('tipo de teste');
  }
}
const MOE_GGUF=[['general.architecture',8,'qwen3moe'],['general.name',8,'Teste MoE'],['tokenizer.ggml.tokens',9,[8,['a','b','<s>']]],
  ['qwen3moe.block_count',4,48],['qwen3moe.context_length',4,262144],['qwen3moe.expert_count',4,128],['qwen3moe.expert_used_count',4,8]];
const MTP_GGUF=[['general.architecture',8,'qwen35'],['qwen35.block_count',4,65],['qwen35.context_length',4,262144],['qwen35.nextn_predict_layers',4,1],
  ['qwen35.ssm.state_size',4,128],['qwen35.attention.sliding_window_pattern',9,[4,[1,0,1]]]];
const GEMMA_GGUF=[['general.architecture',8,'gemma4'],['gemma4.block_count',4,42],['gemma4.attention.sliding_window',4,512]];

test('cabeçalho GGUF: MoE, MTP, SWA e híbrido saem dos metadados, sem carregar pesos',t=>{
  const dir=temp(t);
  const moe=path.join(dir,'moe.gguf'),mtp=path.join(dir,'mtp.gguf'),swa=path.join(dir,'swa.gguf');
  fs.writeFileSync(moe,gguf(MOE_GGUF));fs.writeFileSync(mtp,gguf(MTP_GGUF));fs.writeFileSync(swa,gguf(GEMMA_GGUF));
  const a=modelInfo.modelInfo({path:moe,engine:'llamacpp'});
  assert.equal(a.architecture,'qwen3moe');assert.equal(a.expertCount,128);assert.equal(a.expertUsedCount,8);assert.equal(a.blockCount,48);assert.equal(a.contextLength,262144);
  assert.equal(a.nextnLayers,0);assert.equal(a.slidingWindow,0);assert.equal(a.recurrent,false);
  const b=modelInfo.modelInfo({path:mtp,engine:'llamacpp'});
  assert.equal(b.nextnLayers,1);assert.equal(b.recurrent,true);assert.equal(b.expertCount,0);
  assert.equal(modelInfo.modelInfo({path:swa,engine:'llamacpp'}).slidingWindow,512);
  const broken=path.join(dir,'broken.gguf');fs.writeFileSync(broken,'GGUF');
  assert.match(modelInfo.modelInfo({path:broken,engine:'llamacpp'}).error,/truncado/);
  fs.writeFileSync(path.join(dir,'x.gguf'),'nada');
  assert.match(modelInfo.modelInfo({path:path.join(dir,'x.gguf'),engine:'llamacpp'}).error,/GGUF/);
});

test('config.json do Hugging Face: MoE, MTP, quantização e contexto, inclusive em text_config',t=>{
  const info=modelInfo.hfInfo({architectures:['Qwen3NextForCausalLM'],text_config:{num_experts:512,num_nextn_predict_layers:1,max_position_embeddings:262144,num_attention_heads:16},quantization_config:{quant_method:'awq'},torch_dtype:'bfloat16'});
  assert.deepEqual([info.expertCount,info.nextnLayers,info.contextLength,info.attentionHeads,info.quantization,info.dtype],[512,1,262144,16,'awq','bfloat16']);
  const dense=modelInfo.hfInfo({model_type:'llama',max_position_embeddings:8192,num_attention_heads:32});
  assert.equal(dense.expertCount,0);assert.equal(dense.quantization,null);
  const dir=temp(t);write(path.join(dir,'config.json'),JSON.stringify({n_routed_experts:64,mtp_num_hidden_layers:2}));
  const read=modelInfo.modelInfo({path:dir,engine:'vllm'});assert.equal(read.expertCount,64);assert.equal(read.nextnLayers,2);
});

test('Strata: as opções editáveis vêm do serve/server.py instalado',t=>{
  const dir=temp(t);
  write(path.join(dir,'serve','server.py'),'ap.add_argument("--parallel", type=int)\nap.add_argument( "--gpu", help="x")\nap.add_argument("--idle-unload", type=float)\n');
  assert.deepEqual(modelInfo.strataServerOptions(dir).options.sort(),['--gpu','--idle-unload','--parallel']);
  const ctx={engine:'strata',strataOptions:['--gpu'],distribution:'PolyStrata'};
  const schema=params.schemaFor(ctx);
  assert.equal(schema.fields.find(f=>f.key==='strataGpu').applicable,true);
  assert.match(schema.fields.find(f=>f.key==='strataMaxQueue').reason,/PolyStrata não aceita --max-queue/);
  assert.deepEqual(params.strataArgs({strataGpu:'0,1',strataMaxQueue:'5'},['--gpu']),['--gpu','0,1']);
});

test('fit: saída real do llama-fit-params vira camadas, contexto e especialistas na CPU',()=>{
  const sample='llama_fit_params: printing fitted CLI arguments to stdout...\n-c 8192 -ngl 25 -ot "blk\\.11\\.ffn_(gate|up|gate_up|down).*=CPU,blk\\.12\\.ffn_(up|down|gate_up|gate)_(ch|)exps=CPU,blk\\.13\\.ffn_(up|down|gate_up|gate)_(ch|)exps=CPU"\n';
  const fit=params.parseFitOutput(sample,24);
  assert.equal(fit.ctx,8192);assert.equal(fit.ngl,'25');assert.equal(fit.cpuMoe,2);assert.equal(fit.ts,null);
  assert.equal(params.parseFitOutput('-c 4096 -ngl -1\n').ngl,'all');
  assert.equal(params.parseFitOutput('-c 4096 -ngl 49 -ts 3,1 -ot "blk\\.\\d+\\.ffn_(up|down|gate_up|gate)_(ch|)exps=CPU"',48).cpuMoe,48);
  assert.equal(params.parseFitOutput('-c 4096 -ngl 49 -ts 3,1').ts,'3,1');
  assert.equal(params.parseFitOutput('erro qualquer'),null);
});

test('dispositivos do --list-devices e GPUs do nvidia-smi',()=>{
  const devices=params.parseDevices('Available devices:\n  Vulkan0: AMD Radeon RX 6600 (8176 MiB, 7378 MiB free)\n  Vulkan1: AMD Radeon(TM) Graphics (16328 MiB, 15511 MiB free)\n');
  assert.deepEqual(devices.map(d=>[d.name,d.totalMiB,d.freeMiB]),[['Vulkan0',8176,7378],['Vulkan1',16328,15511]]);
  assert.deepEqual(params.parseDevices('  CUDA0; rm -rf (1 MiB, 1 MiB free)'),[]);
  const gpus=hardware.parseNvidiaGpus('0, NVIDIA GeForce RTX 4090, 24564, 23000\n1, NVIDIA GeForce RTX 3090, 24576, 24000\n');
  assert.equal(gpus.length,2);assert.equal(gpus[1].memoryBytes,24576*1024*1024);
});

test('perfil antigo migra sem mudar o comportamento: -ngl auto e -fa auto viram automático',()=>{
  const old={gpuLayers:'auto',device:'',context:'8192',cpuMoe:'',cacheK:'q4_0',cacheV:'q4_0',flash:'auto',threads:'6',batch:512,ubatch:256};
  const next=params.migrateProfile(old);
  assert.equal(next.version,2);assert.equal(next.gpuLayers,'');assert.equal(next.flash,'');
  assert.equal(next.context,'8192');assert.equal(next.cacheK,'q4_0');assert.equal(next.batch,'512');
  assert.equal(params.migrateProfile(next),next);
  const before=core.argsForModel({path:'m.gguf'},old,'cli'),after=core.argsForModel({path:'m.gguf'},next,'cli');
  assert.deepEqual(after,before);
  assert.deepEqual(after,['-m','m.gguf','-fit','on','-c','8192','-t','6','-b','512','-ub','256','-ctk','q4_0','-ctv','q4_0']);
});

test('esquema por modelo: o que não se aplica sai recolhido com o motivo',()=>{
  const dense={engine:'llamacpp',info:{expertCount:0,nextnLayers:0,slidingWindow:0,recurrent:false,blockCount:36},devices:[{name:'CUDA0',totalMiB:8000,freeMiB:7000}],parallel:1,settings:{context:'4096'}};
  const s1=params.schemaFor(dense),by=s=>Object.fromEntries(s.fields.map(f=>[f.key,f]));
  let f=by(s1);
  assert.match(f.cpuMoe.reason,/denso/);assert.equal(f.cpuFfn.applicable,true);
  assert.equal(f.splitMode.reason,'Só com 2 ou mais GPUs.');assert.match(f.swaFull.reason,/SWA/);assert.match(f.ctxCheckpoints.reason,/híbridos/);
  assert.match(f.fitCtx.reason,/automático/);assert.match(f.kvUnified.reason,/2 ou mais/);
  assert.ok(!f.specType.options.includes('draft-mtp'));
  const moe={...dense,info:{expertCount:128,nextnLayers:1,slidingWindow:128,recurrent:false,blockCount:48},devices:[{name:'CUDA0'},{name:'CUDA1'}],parallel:4,settings:{context:'',moeCacheMib:'2048'}};
  f=by(params.schemaFor(moe,{ngl:'49',ctx:32768,cpuMoe:20,ts:'3,1'}));
  assert.equal(f.cpuMoe.applicable,true);assert.match(f.cpuFfn.reason,/MoE/);assert.equal(f.moeCacheCpuShare.applicable,true);
  assert.equal(f.splitMode.applicable,true);assert.equal(f.fitCtx.applicable,true);assert.equal(f.kvUnified.applicable,true);assert.equal(f.swaFull.applicable,true);
  assert.ok(f.specType.options.includes('draft-mtp'));
  assert.deepEqual([f.gpuLayers.auto.value,f.context.auto.value,f.cpuMoe.auto.value,f.tensorSplit.auto.value],['49','32768','20','3,1']);
  const cpu=by(params.schemaFor({...dense,devices:[]}));
  assert.match(cpu.gpuLayers.reason,/Nenhuma GPU/);assert.match(cpu.noKvOffload.reason,/Nenhuma GPU/);
  const unknown=by(params.schemaFor({engine:'llamacpp',info:{error:'x'},devices:null}));
  assert.equal(unknown.cpuMoe.applicable,true,'sem informações do modelo, nada é escondido');
});

test('validação recusa o que o modelo ou o hardware não suporta',()=>{
  const info={expertCount:0,nextnLayers:0};
  assert.throws(()=>core.validateSettings({specType:'draft-mtp'},'llamacpp',{info}),/MTP/);
  assert.throws(()=>core.validateSettings({cacheV:'q8_0',flash:'off'}),/Flash Attention/);
  assert.throws(()=>core.validateSettings({specType:'draft-simple'}),/rascunho/);
  assert.throws(()=>core.validateSettings({specType:'draft-simple',draftModel:'C:/outro.gguf'},'llamacpp',{draftModels:[{path:'C:/a.gguf'}]}),/GGUF das pastas/);
  assert.throws(()=>core.validateSettings({moeCacheCpuShare:'1.5'}),/Fração/);
  assert.throws(()=>core.validateSettings({tensorSplit:'3,1;x'}),/Proporção/);
  assert.throws(()=>core.validateSettings({loadMode:'turbo'}),/Modo de carga/);
  assert.ok(core.validateSettings({specType:'draft-simple',draftModel:'C:/a.gguf',draftMax:'4'},'llamacpp',{draftModels:[{path:'C:/a.gguf'}]}));
  const hf={attentionHeads:12,nextnLayers:0,expertCount:0};
  assert.throws(()=>core.validateSettings({tensorParallel:'8'},'vllm',{info:hf,gpuCount:8}),/dividir as 12 cabeças/);
  assert.throws(()=>core.validateSettings({tensorParallel:'4'},'vllm',{info:hf,gpuCount:2}),/Só há 2/);
  assert.throws(()=>core.validateSettings({vllmSpec:'mtp'},'vllm',{info:hf}),/MTP/);
  assert.throws(()=>core.validateSettings({gpuMemoryUtilization:'1.2'},'vllm'),/Uso de memória/);
  assert.throws(()=>core.validateSettings({kvCacheDtype:'int3'},'vllm'),/cache KV/);
});

test('argumentos do llama.cpp: automático não vai para a linha de comando; servidor e CLI separados',()=>{
  const s={gpuLayers:'',context:'',cpuMoe:'10',moeCacheMib:'2048',moeCacheCpuShare:'0.25',threadsBatch:'12',loadMode:'mlock',noKvOffload:'on',swaFull:'off',
    kvUnified:'off',cacheReuse:'256',ctxCheckpoints:'8',specType:'draft-mtp',draftMax:'3',splitMode:'row',tensorSplit:'3,1',fitTarget:'512',fitCtx:'16384'};
  const server=core.argsForModel({path:'m.gguf'},s,'server',8080);
  const pair=(a,flag)=>a[a.indexOf(flag)+1];
  assert.ok(!server.includes('-ngl')&&!server.includes('-c'));
  assert.equal(pair(server,'-ncmoe'),'10');assert.equal(pair(server,'--moe-cache-mib'),'2048');assert.equal(pair(server,'--moe-cache-cpu-share'),'0.25');
  assert.equal(pair(server,'-tb'),'12');assert.equal(pair(server,'-lm'),'mlock');assert.ok(server.includes('-nkvo'));assert.ok(!server.includes('--swa-full'));
  assert.ok(server.includes('-no-kvu'));assert.equal(pair(server,'--cache-reuse'),'256');assert.equal(pair(server,'--spec-type'),'draft-mtp');
  assert.equal(pair(server,'-sm'),'row');assert.equal(pair(server,'-ts'),'3,1');assert.equal(pair(server,'-fitt'),'512');assert.equal(pair(server,'-fitc'),'16384');
  const cli=core.argsForModel({path:'m.gguf'},s,'cli');
  assert.ok(!cli.includes('--cache-reuse')&&!cli.includes('-no-kvu'),'opções só do servidor ficam fora da CLI');
  assert.ok(cli.includes('--spec-type')&&cli.includes('-ctxcp'));
  const fit=params.llamaArgs(s,'fit');
  assert.ok(!fit.includes('--spec-type')&&!fit.includes('-tb')&&!fit.includes('-lm'),'llama-fit-params recebe só opções comuns de memória');
  assert.ok(!core.argsForModel({path:'m.gguf'},{specType:'none'},'server',1).includes('--spec-type'));
});

test('vLLM e Strata recebem as opções do perfil; contexto vazio fica com o motor',t=>{
  const venv=temp(t);write(engines.vllmExecutable(venv));
  const model={path:'/models/Qwen3-Next-AWQ',engine:'vllm'};
  const s={context:'',gpuMemoryUtilization:'0.85',kvCacheDtype:'fp8',prefixCaching:'off',enforceEager:'on',tensorParallel:'2',expertParallel:'on',cpuOffloadGb:'4',kvOffloadGb:'8',maxNumBatchedTokens:'8192',vllmSpec:'mtp',vllmSpecTokens:'2'};
  const c=engines.serverCommand(model,s,{host:'127.0.0.1',port:8080,parallel:1,platform:'linux',vllmDir:venv});
  const pair=flag=>c.args[c.args.indexOf(flag)+1];
  assert.ok(!c.args.includes('--max-model-len'));
  assert.equal(pair('--gpu-memory-utilization'),'0.85');assert.equal(pair('--kv-cache-dtype'),'fp8');assert.ok(c.args.includes('--no-enable-prefix-caching'));
  assert.ok(c.args.includes('--enforce-eager'));assert.equal(pair('--tensor-parallel-size'),'2');assert.ok(c.args.includes('--enable-expert-parallel'));
  assert.equal(pair('--cpu-offload-gb'),'4');assert.equal(pair('--kv-offloading-size'),'8');assert.equal(pair('--max-num-batched-tokens'),'8192');
  assert.deepEqual(JSON.parse(pair('--speculative-config')),{method:'mtp',num_speculative_tokens:2});
  const ngram=params.vllmArgs({vllmSpec:'ngram'});assert.deepEqual(JSON.parse(ngram[1]),{method:'ngram',num_speculative_tokens:3,prompt_lookup_max:4,prompt_lookup_min:2});
  assert.throws(()=>engines.serverCommand(model,{gpuMemoryUtilization:'2'},{host:'127.0.0.1',port:8080,platform:'linux',vllmDir:venv}),/Uso de memória/);
  for(const platform of ['win32','linux']) {
    const root=temp(t);write(path.join(root,'serve','server.py'),'ap.add_argument("--gpu")\nap.add_argument("--idle-unload")\n');write(engines.strataPython(root,platform));
    const config=path.join(root,'strata-x.json');write(config,'{}');
    const cmd=engines.serverCommand({path:config,engine:'strata'},{strataGpu:'0,2',strataIdleUnload:'600',strataMaxQueue:'4'},{host:'127.0.0.1',port:8090,parallel:1,platform,strataDir:root});
    assert.equal(cmd.args[cmd.args.indexOf('--gpu')+1],'0,2');assert.equal(cmd.args[cmd.args.indexOf('--idle-unload')+1],'600');
    assert.ok(!cmd.args.includes('--max-queue'),'opção que o server.py instalado não declara fica de fora');
  }
});

test('sugestões iniciais usam os metadados do modelo',()=>{
  const hw={memoryBytes:32*1024**3,logicalCores:16,physicalCores:8,gpuMemoryBytes:12*1024**3};
  const mtp=core.recommend({path:'qwen.gguf',size:16*1024**3},hw,{expertCount:0,nextnLayers:1,contextLength:2048});
  assert.equal(mtp.specType,'draft-mtp');assert.equal(mtp.context,2048);
  const moe=core.recommend({path:'nome-sem-pista.gguf',size:12*1024**3},{...hw,gpuMemoryBytes:8*1024**3},{expertCount:64});
  assert.equal(moe.cpuMoe,20,'MoE detectado pelo GGUF, não pelo nome');
  const big=core.recommendVllm({size:40*1024**3},{attentionHeads:32,expertCount:128,nextnLayers:1,contextLength:131072},[{memoryBytes:24*1024**3},{memoryBytes:24*1024**3}]);
  assert.equal(big.tensorParallel,'2');assert.equal(big.expertParallel,'on');assert.equal(big.vllmSpec,'mtp');assert.ok(big.context<=131072);
  const small=core.recommendVllm({size:5*1024**3},{attentionHeads:32,contextLength:32768},[{memoryBytes:24*1024**3}]);
  assert.equal(small.tensorParallel,'');assert.equal(small.context,16384);
});

test('llama-bench recebe os ajustes com a sintaxe dele',()=>{
  const a=benchmark.benchArgs({path:'m.gguf'},{gpuLayers:'',device:'CUDA0,CUDA1',tensorSplit:'3,1',noKvOffload:'on',cacheK:'q8_0',cpuMoe:'4'});
  const pair=flag=>a[a.indexOf(flag)+1];
  assert.equal(pair('-fitt'),'1024');assert.ok(!a.includes('-ngl'));assert.equal(pair('-dev'),'CUDA0/CUDA1');assert.equal(pair('-ts'),'3/1');
  assert.equal(pair('-nkvo'),'1');assert.equal(pair('-ctk'),'q8_0');assert.equal(pair('-ncmoe'),'4');
  assert.equal(benchmark.benchArgs({path:'m'},{gpuLayers:'all'})[benchmark.benchArgs({path:'m'},{gpuLayers:'all'}).indexOf('-ngl')+1],'999');
  assert.deepEqual(benchmark.parseBench(JSON.stringify([{n_prompt:256,n_gen:0,avg_ts:900},{n_prompt:0,n_gen:48,avg_ts:40}])),{promptTps:900,generationTps:40});
});

test('pontuação segue a prioridade escolhida',()=>{
  const fast={promptTps:1000,generationTps:20},gen={promptTps:500,generationTps:30};
  assert.ok(benchmark.scoreOf(gen,'generation')>benchmark.scoreOf(fast,'generation'));
  assert.ok(benchmark.scoreOf(fast,'prompt')>benchmark.scoreOf(gen,'prompt'));
  assert.equal(Math.round(benchmark.scoreOf({promptTps:400,generationTps:25},'balanced')),100);
});

// Medida simulada: mais rápido com menos especialistas na CPU (até não caber), Flash Attention e microbatch 512.
function fakeBench(log){
  return async s=>{
    log.push(s);
    if(Number(s.cpuMoe)<6)throw Error('llama-bench falhou: failed to allocate buffer');
    let g=20,p=500;
    g+=(20-Number(s.cpuMoe||0));if(s.flash==='on'){g+=3;p+=100;}if(s.ubatch==='1024')p+=300;if(s.cacheK==='q8_0')g+=1;if(s.threads==='8')g+=2;
    return {promptTps:p,generationTps:g};
  };
}
test('autotuning do llama.cpp: busca por etapas, descarta o que não cabe e devolve só as chaves testadas',async()=>{
  const log=[],serverLog=[];
  const info={expertCount:64,blockCount:48,nextnLayers:1};
  const result=await benchmark.tune('/nao-usado',{path:'m.gguf'},{context:'8192',gpuLayers:'',batch:'',ubatch:''},()=>{},undefined,{budgetMinutes:5,priority:'generation',info,
    devices:[{name:'CUDA0'}],hw:{physicalCores:8,logicalCores:16},
    deps:{fit:async()=>({ngl:'49',ctx:8192,cpuMoe:8}),bench:fakeBench(log),server:async s=>{serverLog.push(s);return {promptTps:600,generationTps:s.specType==='draft-mtp'?(s.draftMax==='4'?50:45):30,draftAcceptance:0.7};}}});
  assert.equal(result.stopped,'done');
  assert.equal(result.settings.cpuMoe,'6','menos especialistas na CPU, até o limite que cabe');
  assert.equal(result.settings.flash,'on');assert.equal(result.settings.ubatch,'1024');assert.equal(result.settings.cacheK,'q8_0');assert.equal(result.settings.threads,'8');
  assert.equal(result.settings.specType,'draft-mtp');assert.equal(result.settings.draftMax,'4');
  assert.equal(result.settings.gpuLayers,'','camadas na GPU voltam ao automático');assert.equal(result.settings.context,'8192');
  assert.ok(result.results.some(r=>/failed to allocate/.test(r.error||'')),'o que não coube fica registrado');
  assert.ok(log.every(s=>s.gpuLayers==='49'),'o llama-bench usa as camadas do fit');
  assert.ok(serverLog.some(s=>s.specType==='ngram-mod'));
  assert.ok(!log.some(s=>s.flash==='off'&&['q8_0','q4_0'].includes(s.cacheV)),'cache V quantizado sem Flash Attention é bloqueado');
});

test('autotuning: cancelar devolve o melhor até ali; orçamento esgotado para a busca',async()=>{
  const controller=new AbortController();let calls=0;
  const deps={fit:async()=>({ngl:'all',ctx:4096,cpuMoe:0}),bench:async()=>{if(++calls===3)controller.abort();return {promptTps:100,generationTps:10+calls};},server:null};
  const r=await benchmark.tune('/x',{path:'m.gguf'},{},()=>{},controller.signal,{budgetMinutes:5,info:{expertCount:0,blockCount:30},devices:[{name:'Vulkan0'}],hw:{physicalCores:4,logicalCores:8},deps});
  assert.equal(r.stopped,'cancelled');assert.ok(r.best.generationTps>=11);
  await assert.rejects(benchmark.tune('/x',{path:'m.gguf'},{},()=>{},AbortSignal.abort(),{budgetMinutes:5,info:{},devices:[],hw:{physicalCores:4},deps:{fit:async()=>null,bench:async()=>({promptTps:1,generationTps:1})}}),/cancelado/);
  await assert.rejects(benchmark.tune('/x',{path:'m.gguf'},{},()=>{},undefined,{budgetMinutes:500,deps}),/Orçamento/);
  await assert.rejects(benchmark.tune('/x',{path:'m.gguf'},{},()=>{},undefined,{priority:'x',deps}),/Prioridade/);
  await assert.rejects(benchmark.tune('/x',{path:'m.gguf'},{},()=>{},undefined,{budgetMinutes:1,info:{},devices:[],hw:{physicalCores:2},deps:{fit:async()=>null,bench:async()=>{throw Error('modelo inválido');}}}),/não rodou no llama-bench: modelo inválido/);
});

test('autotuning do vLLM: cada candidato é um servidor; fp8 recusado sai da lista',async()=>{
  const seen=[];
  const probe=async s=>{seen.push(s);if(s.kvCacheDtype==='fp8')throw Error('fp8 não suportado nesta GPU');
    return {promptTps:1000,generationTps:40+(s.gpuMemoryUtilization==='0.95'?5:0)+(s.vllmSpec==='mtp'?10:0)};};
  const r=await benchmark.tuneVllm({path:'/m'},{context:'8192'},{probe,info:{nextnLayers:1,attentionHeads:16},gpuCount:1,budgetMinutes:30});
  assert.equal(r.settings.gpuMemoryUtilization,'0.95');assert.equal(r.settings.vllmSpec,'mtp');assert.equal(r.settings.kvCacheDtype,'');assert.equal(r.settings.context,'8192');
  assert.ok(r.results.some(x=>/fp8/.test(x.error||'')));
  const noMtp=[];await benchmark.tuneVllm({path:'/m'},{},{probe:async s=>{noMtp.push(s);return {promptTps:1,generationTps:1};},info:{nextnLayers:0},budgetMinutes:30});
  assert.ok(!noMtp.some(s=>s.vllmSpec==='mtp'));
});

test('valores em uso lidos do registro do motor',()=>{
  const llama=params.parseRuntimeLog('llamacpp','load_tensors: offloaded 25/25 layers to GPU\nllama_context: n_ctx         = 8192\nllama_context: n_ubatch      = 512\nllama_context: flash_attn    = enabled\n');
  assert.deepEqual(llama,{gpuLayers:'25/25',context:'8192',ubatch:'512',flash:'enabled'});
  const vllm=params.parseRuntimeLog('vllm','INFO GPU KV cache size: 123,456 tokens\nINFO Maximum concurrency for 32,768 tokens per request: 3.77x');
  assert.deepEqual(vllm,{kvTokens:'123456',context:'32768',concurrency:'3.77'});
});

test('autotuning: especialistas na CPU sobem de 2 em 2 enquanto a geração melhora',async()=>{
  const seen=[];
  const bench=async s=>{const k=Number(s.cpuMoe||0);seen.push(k);return {promptTps:100,generationTps:k<=14?10+k:24-(k-14)};};
  const r=await benchmark.tune('/x',{path:'m.gguf'},{},()=>{},undefined,{budgetMinutes:5,info:{expertCount:32,blockCount:24},devices:[{name:'Vulkan0'}],hw:{physicalCores:4,logicalCores:8},
    deps:{fit:async()=>({ngl:'25',ctx:4096,cpuMoe:8}),bench,server:null}});
  assert.equal(r.settings.cpuMoe,'14');
  assert.ok(seen.includes(16)&&!seen.includes(18),'para no primeiro passo sem ganho');
});
