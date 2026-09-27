'use strict';
// Opt-in local smoke test: npm run smoke:bench -- <engine-directory> <model.gguf>
const fs=require('node:fs');
const {defaults}=require('../build/app/core');
const {tune}=require('../build/app/benchmark');
async function main(){
  const [engineDir,modelPath]=process.argv.slice(2);
  if(!engineDir||!modelPath||!fs.existsSync(modelPath))throw Error('Uso: node scripts/smoke-bench.js <pasta-motor> <modelo.gguf>');
  const settings={...defaults,gpuLayers:'0',context:1024,batch:512,ubatch:256};
  const result=await tune(engineDir,{path:modelPath},settings,()=>{});
  if(!result.results.some(row=>Number.isFinite(row.generationTps)))throw Error('Sem medida de geração.');
  process.stdout.write(`OK llama-bench: microbatch=${result.settings.ubatch}, medições=${result.results.length}\n`);
}
main().catch(error=>{process.stderr.write(`${error.message}\n`);process.exitCode=1;});
