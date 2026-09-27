'use strict';
// Opt-in local smoke test: node scripts/smoke-engine.js <engine-directory> <model.gguf>
const fs=require('node:fs');
const path=require('node:path');
const net=require('node:net');
const http=require('node:http');
const {spawn}=require('node:child_process');
const {defaults,argsForModel}=require('../src/core');

async function freePort(){return new Promise((resolve,reject)=>{const server=net.createServer();server.once('error',reject);server.listen(0,'127.0.0.1',()=>{const port=server.address().port;server.close(()=>resolve(port));});});}
async function check(port,pathname){return new Promise((resolve,reject)=>{const request=http.get({hostname:'127.0.0.1',port,path:pathname,timeout:2000},response=>{response.resume();resolve(response.statusCode);});request.once('error',reject);request.once('timeout',()=>request.destroy(Error('HTTP timeout')));});}
async function main(){
  const [engineDir,modelPath]=process.argv.slice(2);
  if(!engineDir||!modelPath)throw Error('Uso: node scripts/smoke-engine.js <pasta-motor> <modelo.gguf>');
  const executable=path.join(engineDir,process.platform==='win32'?'llama-server.exe':'llama-server');
  if(!fs.existsSync(executable)||!fs.existsSync(modelPath))throw Error('Motor ou modelo não encontrado.');
  const port=await freePort();
  const settings={...defaults,gpuLayers:'0',context:1024,batch:128,ubatch:128};
  const args=argsForModel({path:modelPath},settings,'server',port,{host:'127.0.0.1',parallel:2});
  const child=spawn(executable,args,{cwd:engineDir,windowsHide:true,stdio:['ignore','ignore','pipe']});
  let tail='';child.stderr.on('data',chunk=>{tail=(tail+String(chunk)).slice(-4000);});
  try{
    const deadline=Date.now()+180000;
    while(Date.now()<deadline){if(child.exitCode!==null)throw Error(`Motor encerrou (${child.exitCode}): ${tail}`);try{if(await check(port,'/health')===200){const models=await check(port,'/v1/models');if(models!==200)throw Error(`/v1/models respondeu ${models}`);process.stdout.write(`OK llama-server: health=200, models=200, parallel=2, port=${port}\n`);return;}}catch(error){if(!/ECONNREFUSED|HTTP timeout/.test(error.message))throw error;}await new Promise(resolve=>setTimeout(resolve,1000));}
    throw Error(`Tempo esgotado ao carregar modelo: ${tail}`);
  }finally{child.kill();}
}
main().catch(error=>{process.stderr.write(`${error.message}\n`);process.exitCode=1;});
