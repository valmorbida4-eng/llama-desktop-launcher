'use strict';
// Opt-in local smoke test: npm run smoke:cli -- <engine-directory> <model.gguf>
const fs=require('node:fs');
const {defaults}=require('../build/app/core');
const cli=require('../build/app/cli');

async function main(){
  const [engineDir,modelPath]=process.argv.slice(2);
  if(!engineDir||!modelPath||!fs.existsSync(modelPath))throw Error('Uso: node scripts/smoke-cli.js <pasta-motor> <modelo.gguf>');
  const settings={...defaults,gpuLayers:'0',context:1024,batch:128,ubatch:128};
  let stdout='',stderr='',finished=false;
  const session=cli.createSession({engineDir,model:{path:modelPath},settings,
    onOutput:({stream,text})=>{if(stream==='stdout')stdout=(stdout+text).slice(-10000);else stderr=(stderr+text).slice(-3000);},
    onExit:()=>{finished=true;},onError:error=>{stderr+=error.message;finished=true;}});
  try{
    await session.send('Responda apenas com a palavra OK.');
    const deadline=Date.now()+90000;
    while(Date.now()<deadline){if(finished)break;if(stdout.includes('OK')){process.stdout.write(`OK llama-cli: recebeu saída interativa (${stdout.length} caracteres)\n`);return;}await new Promise(resolve=>setTimeout(resolve,1000));}
    throw Error(`CLI sem resposta esperada. stdout=${JSON.stringify(stdout.slice(-400))}; stderr=${JSON.stringify(stderr.slice(-400))}`);
  }finally{session.stop();}
}
main().catch(error=>{process.stderr.write(`${error.message}\n`);process.exitCode=1;});
