'use strict';
// Liga resources.ts ao motor: mede, estima cada papel com o llama-fit-params e sugere o trio. Não inicia nada.
const path=require('node:path');
const fs=require('node:fs');
const benchmark=require('./benchmark');
const hardware=require('./hardware');
const params=require('./params');
const resources=require('./resources');
const decisions=require('./decider');
const review=require('./reviewer');

// O mesmo padrão da tela para um modelo sem perfil salvo.
const NO_PROFILE=Object.freeze({context:'4096'});

function createPlanner({engineDir,run=benchmark.execute,measure=resources.measure,nvidia=hardware.detectNvidiaGpus,listDevices=benchmark.listDevices}: any) {
  const prints=new Map<string,any>(),unreadable=new Set<string>();
  const stamp=(file: string)=>{try{const s=fs.statSync(file);return `${s.size}:${s.mtimeMs}`;}catch{return '';}};
  const sizeMiB=(file: string|null)=>{if(!file)return 0;try{return fs.statSync(file).size/resources.MIB;}catch{return 0;}};

  async function snapshot(pids: number[]=[]) {
    const [listed,cards]=await Promise.all([listDevices(engineDir()).then((list: any)=>list||[]).catch(()=>[]),nvidia()]);
    return measure({listed,nvidia:cards,pids});
  }
  async function print(model: any,args: string[],{signal,env}: any={}) {
    const dir=engineDir(),identity=[dir,model.path,stamp(model.path)],version=identity.join('|'),key=JSON.stringify([...identity,args,env||{}]);
    if(prints.has(key))return prints.get(key);
    if(unreadable.has(version))return null;
    const file=path.join(dir,process.platform==='win32'?'llama-fit-params.exe':'llama-fit-params');
    let rows=null;
    try{
      const out=await run(file,['-m',model.path,...args,'--fit-print','on'],{timeoutMs:60000,signal,env});
      rows=resources.parsePrint(out.stdout);
    }catch(error){
      if(signal?.aborted)throw error;
      // Com um GGUF que o motor não lê, o fit-params aborta (e o Windows registra uma falha): tenta uma vez só.
      if(/failed to (?:load model|read tensor info)/i.test(String(error?.message)))unreadable.add(version);
      return null;
    }
    if(rows){prints.set(key,rows);if(prints.size>300)prints.delete(prints.keys().next().value);}
    return rows;
  }
  async function need(model: any,args: string[],measured: any,{projector=false,signal,env}: any={}) {
    const rows=await print(model,args,{signal,env});
    return resources.needOf(rows,measured.devices,{file:(model.size||0)/resources.MIB,projector:projector?sizeMiB(model.projector):0});
  }
  // Ajustes do principal sem o que o -fit decide, para repetir o plano dele no --fit-print.
  const fixedArgs=(settings: any)=>params.llamaArgs({...settings,context:'',fitCtx:'',fitTarget:'',gpuLayers:'',tensorSplit:''},'fit');

  // Principal, conversa e CLI com outro modelo do launcher já carregado.
  async function main(model: any,settings: any,measured: any,signal?: AbortSignal) {
    if((model.engine||'llamacpp')!=='llamacpp')return {settings,result:resources.assess([resources.unknownNeed('a estimativa existe só para o llama.cpp')],measured)};
    const target=resources.adjustedTarget(settings,measured,sizeMiB(model.projector));
    const effective=target===null?settings:{...settings,fitTarget:String(target)};
    let plan: string[]|null=null;
    const layers=String(settings.gpuLayers||'');
    if(layers&&layers!=='auto')plan=['-c',String(settings.context||0),'-ngl',layers==='all'?'999':layers,...(settings.tensorSplit?['-ts',String(settings.tensorSplit)]:[])];
    else try{
      const fit=await benchmark.fitParams(engineDir(),model,effective,{run,signal});
      plan=['-c',String(fit.ctx),'-ngl',fit.ngl==='all'?'999':fit.ngl,...(fit.ts?['-ts',fit.ts]:[]),...(fit.ot?['-ot',fit.ot]:[])];
    }catch(error){if(signal?.aborted)throw error;}
    const needed=plan
      ?await need(model,[...fixedArgs(effective),...plan,'-fit','off'],measured,{projector:true,signal,env:params.llamaEnv(effective)})
      :resources.unknownNeed('o llama-fit-params não calculou o ajuste deste modelo');
    return {settings:effective,result:resources.assess([needed],measured)};
  }

  async function decider(model: any,options: any,measured: any,signal?: AbortSignal) {
    return resources.assess([await need(model,[...decisions.memoryArgs(options),'-fit','off'],measured,{projector:true,signal})],measured);
  }

  async function reviewerOptions(model: any,options: any,profile: any,measured: any,signal?: AbortSignal) {
    const wanted=review.validateOptions(options);
    const choices=wanted.device?[wanted.device]:[...measured.devices.map((d: any)=>d.name),'cpu'];
    const out: any[]=[];
    for(const device of choices) {
      const kind=device==='cpu'?'cpu':measured.devices.find((d: any)=>d.name===device)?.kind;
      if(!kind)throw Error(`O motor não encontrou o dispositivo ${device}.`);
      out.push({device,kind,need:await need(model,review.memoryArgs({...wanted,device},profile),measured,{signal})});
    }
    return out;
  }
  async function reviewer(model: any,options: any,profile: any,measured: any,signal?: AbortSignal) {
    const candidates=(await reviewerOptions(model,options,profile,measured,signal)).map((c: any)=>({...c,result:resources.assess([c.need],measured)}));
    const chosen=resources.chooseDevice(candidates);
    return {device:chosen.device,result:chosen.result};
  }

  // Considera parados os processos do launcher e só propõe principal que o -fit põe inteiro na GPU.
  async function trio({models,profiles={},deciderOrder=[],context=review.DEFAULTS.context,pids=[],architecture}: any) {
    const now=await snapshot(pids),measured=resources.withoutProcesses(now,pids);
    if(!measured||measured.available===null)throw Error('Não foi possível medir a memória livre. Pare os modelos em execução e tente de novo.');
    const mains: any[]=[],reviewers: any[]=[],deciders: any[]=[];
    for(const model of models.filter((m: any)=>(m.engine||'llamacpp')==='llamacpp'&&!m.decision)) {
      const profile=profiles[model.path]||NO_PROFILE,base={path:model.path,name:model.name,size:model.size||0,architecture:architecture(model)};
      const layers=String(profile.gpuLayers||'');
      if(!layers||layers==='auto'||layers==='all') {
        const args=[...fixedArgs(profile),'-c',String(profile.context||NO_PROFILE.context),'-ngl','999','-fit','off'];
        const needed=await need(model,args,measured,{env:params.llamaEnv(profile)});
        const margin=profile.fitTarget?Number(profile.fitTarget):resources.DEFAULT_FIT_TARGET;
        const whole=!needed.unknown&&Object.entries(needed.vram).every(([name,value])=>(value as number)<=measured.devices.find((d: any)=>d.name===name).budget-margin);
        if(whole) {
          // Contexto automático cresce até o orçamento do -fit: reserva esse teto.
          if(!profile.context)for(const name of Object.keys(needed.vram))needed.vram[name]=measured.devices.find((d: any)=>d.name===name).budget-margin;
          const projector=sizeMiB(model.projector),first=Object.keys(needed.vram)[0];
          if(first)needed.vram[first]+=projector;else needed.ram+=projector;
          mains.push({...base,need:needed});
        }
      }
      for(const option of await reviewerOptions(model,{device:'',context},profile,measured))if(!option.need.unknown)reviewers.push({...base,...option});
    }
    const decisionModels=models.filter((m: any)=>m.decision).sort((a: any,b: any)=>{
      const rank=(m: any)=>{const at=deciderOrder.indexOf(m.path);return at<0?deciderOrder.length:at;};
      return rank(a)-rank(b)||a.size-b.size;
    });
    // O decisor fica fora da placa do principal: CPU se for muito pequeno; senão GPU integrada, se houver, ou CPU.
    const shared=measured.devices.find((d: any)=>d.kind==='shared')?.name||'cpu';
    for(const [rank,model] of decisionModels.entries()) {
      const small=decisions.runsWellOnCpu(model),deciderDevice=small?'cpu':shared;
      const needed=await need(model,[...decisions.memoryArgs({...decisions.DEFAULTS,device:deciderDevice}),'-fit','off'],measured,{projector:true});
      if(!needed.unknown)deciders.push({path:model.path,name:model.name,device:deciderDevice,small,rank,need:needed});
    }
    const best=resources.suggestTrio({mains,reviewers,deciders,snapshot:measured});
    if(!best)return null;
    // O decisor salvo tem preferência: se não for pequeno, o muito pequeno que cabe no mesmo trio vai como opção.
    let cpuDecider: any=null;
    if(!best.decider?.small)for(const option of deciders.filter(d=>d.small)) {
      const result=resources.assess([best.main.need,best.reviewer.need,option.need],measured);
      if(result.level!=='ok'&&result.level!=='tight')continue;
      cpuDecider={path:option.path,name:option.name,device:option.device,small:true,context:decisions.DEFAULTS.context,result};
      break;
    }
    return {cpuDecider,main:{path:best.main.path,name:best.main.name},
      reviewer:{path:best.reviewer.path,name:best.reviewer.name,device:best.reviewer.device,context},
      decider:best.decider?{path:best.decider.path,name:best.decider.name,device:best.decider.device,small:best.decider.small,context:decisions.DEFAULTS.context}:null,
      result:best.result,running:pids.length>0};
  }

  return {snapshot,main,decider,reviewer,trio};
}

module.exports={createPlanner,NO_PROFILE};
