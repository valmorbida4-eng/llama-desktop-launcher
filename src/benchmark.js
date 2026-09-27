'use strict';
const {spawn}=require('node:child_process');
const path=require('node:path');
const fs=require('node:fs');
const {validateSettings}=require('./core');
function execute(file,args,timeoutMs=600000,signal) {return new Promise((resolve,reject)=>{const p=spawn(file,args,{cwd:path.dirname(file),windowsHide:true,signal});let stdout='',stderr='';const timer=setTimeout(()=>{p.kill();reject(Error('Teste excedeu o tempo limite de 10 minutos.'));},timeoutMs);p.stdout.on('data',d=>stdout+=d.toString().slice(0,2e6));p.stderr.on('data',d=>stderr+=d.toString().slice(0,5000));p.once('error',e=>{clearTimeout(timer);reject(e);});p.once('exit',code=>{clearTimeout(timer);if(code!==0)reject(Error(`llama-bench falhou: ${stderr.slice(-700)}`));else resolve(stdout);});});}
function benchArgs(model,settings) {const a=['-m',model.path,'-p','128','-n','32','-r','1','-o','json','-b',String(settings.batch||512),'-ub',String(settings.ubatch||256),'-ctk',settings.cacheK,'-ctv',settings.cacheV,'-fa',settings.flash];if(settings.gpuLayers!=='auto'&&settings.gpuLayers!=='all')a.push('-ngl',String(settings.gpuLayers));if(settings.cpuMoe!=='')a.push('-ncmoe',String(settings.cpuMoe));if(settings.threads!=='')a.push('-t',String(settings.threads));if(settings.device!=='')a.push('-dev',settings.device);return a;}
async function tune(engineDir,model,settings,onProgress,signal) {
  validateSettings(settings);const file=path.join(engineDir,process.platform==='win32'?'llama-bench.exe':'llama-bench');if(!fs.existsSync(file))throw Error('Este pacote não inclui llama-bench.');
  const base=Number(settings.ubatch||256),candidates=[...new Set([Math.min(128,Number(settings.batch||512)),base].filter(x=>x>0))];
  const results=[];
  for(let i=0;i<candidates.length;i++) {if(signal?.aborted)throw Error('Teste cancelado.');const candidate={...settings,ubatch:candidates[i]};onProgress?.(`Testando microbatch ${candidates[i]} (${i+1}/${candidates.length})…`);try{const data=JSON.parse(await execute(file,benchArgs(model,candidate),600000,signal));const rows=Array.isArray(data)?data:data.results||[];const prompt=rows.find(r=>r.n_prompt>0&&r.n_gen===0);const generation=rows.find(r=>r.n_gen>0&&r.n_prompt===0);if(!prompt||!generation)throw Error('Resultado de benchmark incompleto.');results.push({ubatch:candidates[i],promptTps:prompt.avg_ts,generationTps:generation.avg_ts,score:generation.avg_ts+prompt.avg_ts/100});}catch(e){if(signal?.aborted)throw Error('Teste cancelado.');results.push({ubatch:candidates[i],error:e.message});}}
  const valid=results.filter(r=>Number.isFinite(r.score));if(!valid.length)throw Error(`Nenhuma configuração passou no teste: ${results.map(r=>r.error).join('; ')}`);valid.sort((a,b)=>b.score-a.score);return {settings:{...settings,ubatch:valid[0].ubatch},results};
}
module.exports={benchArgs,tune};
