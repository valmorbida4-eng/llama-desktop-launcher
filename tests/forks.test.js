'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const params=require('../build/app/params');
const core=require('../build/app/core');
const benchmark=require('../build/app/benchmark');

test('argumentos extras: divididos sem shell, no fim, e sem as opções que o launcher controla',()=>{
  assert.deepEqual(params.splitExtraArgs(`--moe-cache-cpu-overlap 2 -ubd 256 --x "a b" 'c d'`),['--moe-cache-cpu-overlap','2','-ubd','256','--x','a b','c d']);
  assert.deepEqual(params.splitExtraArgs('  '),[]);
  for(const bad of ['--port 9000','--host=0.0.0.0','-m outro.gguf','--api-key x','--allow-unauthenticated-tools','--parallel 4'])
    assert.throws(()=>params.splitExtraArgs(bad),/controlado pelo launcher/,bad);
  assert.throws(()=>params.splitExtraArgs('a\nb'),/controle/);
  const a=params.llamaArgs({flash:'on',extraArgs:'-ubd 256'});
  assert.deepEqual(a.slice(-2),['-ubd','256']);
  assert.ok(!params.llamaArgs({extraArgs:'-ubd 256'},'fit').includes('-ubd'),'o fit não recebe extras');
  assert.ok(!params.llamaArgs({extraArgs:'-ubd 256'},'cli').includes('-ubd'),'a CLI não recebe extras do servidor');
  assert.throws(()=>core.validateSettings({extraArgs:'--port 1'}),/controlado/);
});

test('variáveis de ambiente: só prefixos do motor, NOME=valor separados por ;',()=>{
  assert.deepEqual(params.parseExtraEnv('GGML_CUDA_MOE_TAIL_SKIP=0; GGML_SCHED_PREFETCH_EXPERTS=6;'),{GGML_CUDA_MOE_TAIL_SKIP:'0',GGML_SCHED_PREFETCH_EXPERTS:'6'});
  assert.deepEqual(params.llamaEnv({}),{});
  for(const bad of ['PATH=/tmp','LD_PRELOAD=x.so','GGML_X','=1','ggml_lower=1']) assert.throws(()=>params.parseExtraEnv(bad),/não é permitida/,bad);
  assert.throws(()=>core.validateSettings({extraEnv:'NODE_OPTIONS=--require x'}),/não é permitida/);
  assert.ok(!params.llamaArgs({extraEnv:'GGML_A=1'}).some(x=>/GGML/.test(x)),'variáveis não viram argumentos');
});

test('draft-mtp com cabeça MTP separada (Avalon, tandem.cpp) mesmo sem camadas MTP no GGUF',()=>{
  const head=path.join('m','MTP','mtp-head.gguf');
  const ctx={engine:'llamacpp',info:{expertCount:512,nextnLayers:0,blockCount:48},devices:[{name:'ROCm0'}],draftModels:[{path:head}]};
  const spec=params.FIELDS.find(f=>f.engine==='llamacpp'&&f.key==='specType');
  assert.ok(spec.options(ctx).includes('draft-mtp'));
  assert.ok(!spec.options({...ctx,draftModels:[{path:'small.gguf'}]}).includes('draft-mtp'));
  params.validateParams({specType:'draft-mtp',draftModel:head},ctx);
  assert.throws(()=>params.validateParams({specType:'draft-mtp'},ctx),/camadas MTP/);
});

test('autotuning sem llama-bench (forks): as etapas medem pelo llama-server',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'llama-nobench-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const progress=[];let calls=0;
  const r=await benchmark.tune(dir,{path:'m.gguf'},{},text=>progress.push(text),undefined,{budgetMinutes:5,info:{expertCount:0,blockCount:30},devices:[{name:'Vulkan0'}],hw:{physicalCores:4,logicalCores:8},
    deps:{fit:async()=>null,server:async()=>{calls++;return {promptTps:100,generationTps:10};}}});
  assert.ok(calls>0);assert.equal(r.stopped,'done');
  assert.ok(progress.some(p=>/não inclui llama-bench/.test(p)));
  await assert.rejects(benchmark.tune(dir,{path:'m.gguf'},{},()=>{},undefined,{budgetMinutes:5,info:{},devices:[],hw:{physicalCores:2},deps:{fit:async()=>null}}),/nem llama-server/);
});
