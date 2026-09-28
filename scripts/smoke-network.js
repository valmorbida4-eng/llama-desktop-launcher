'use strict';
// Opt-in local smoke test: npm run smoke:network -- <engine-directory> <model.gguf>
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const net=require('node:net');
const http=require('node:http');
const crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const {defaults,argsForModel}=require('../build/app/core');
const network=require('../build/app/network');
async function freePort(host){return new Promise((resolve,reject)=>{const server=net.createServer();server.once('error',reject);server.listen(0,host,()=>{const port=server.address().port;server.close(()=>resolve(port));});});}
async function check(host,port,key,pathname='/health'){return new Promise((resolve,reject)=>{const headers={Host:`${host}:${port}`};if(key)headers.Authorization=`Bearer ${key}`;const request=http.get({hostname:host,port,path:pathname,headers,timeout:2000},response=>{response.resume();resolve(response.statusCode);});request.once('error',reject);request.once('timeout',()=>request.destroy(Error('HTTP timeout')));});}
async function main(){
  const [engineDir,modelPath]=process.argv.slice(2);
  if(!engineDir||!modelPath||!fs.existsSync(modelPath))throw Error('Uso: node scripts/smoke-network.js <pasta-motor> <modelo.gguf>');
  const access=network.accessOptions().find(item=>item.scope==='Tailscale')||network.accessOptions().find(item=>item.scope==='LAN');
  if(!access)throw Error('Nenhum endereço LAN/Tailscale encontrado.');
  const executable=path.join(engineDir,process.platform==='win32'?'llama-server.exe':'llama-server');
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'llama-net-smoke-'));
  const key=crypto.randomBytes(32).toString('base64url');const keyPath=path.join(temp,'key.txt');fs.writeFileSync(keyPath,key+'\n',{mode:0o600});
  let child,proxy;
  try{
    const port=await freePort(access.host),localPort=await freePort('127.0.0.1');
    const settings={...defaults,gpuLayers:'0',context:1024,batch:128,ubatch:128};
    const args=argsForModel({path:modelPath},settings,'server',port,{host:access.host,parallel:2,keyPath});
    child=spawn(executable,args,{cwd:engineDir,windowsHide:true,stdio:['ignore','ignore','pipe']});
    let tail='';child.stderr.on('data',chunk=>{tail=(tail+String(chunk)).slice(-3000);});
    const deadline=Date.now()+180000;let ready=false;
    while(Date.now()<deadline){if(child.exitCode!==null)throw Error(`Servidor encerrou: ${tail}`);try{if(await check(access.host,port,key)===200){ready=true;break;}}catch{}await new Promise(resolve=>setTimeout(resolve,1000));}
    if(!ready)throw Error(`Timeout autenticado: ${tail}`);
    const denied=await check(access.host,port,null,'/v1/models');
    if(denied===200)throw Error('Servidor aceitou health sem chave.');
    const sessionToken=crypto.randomBytes(24).toString('hex');
    proxy=await network.createProxy(access.host,port,key,localPort,sessionToken);
    const unauthProxy=await check('127.0.0.1',localPort,null,'/v1/models');
    if(unauthProxy!==403)throw Error(`Proxy deveria negar pedido sem token, respondeu ${unauthProxy}`);
    const throughProxy=await check('127.0.0.1',localPort,null,`/v1/models?token=${sessionToken}`);
    if(throughProxy!==200)throw Error(`Proxy respondeu ${throughProxy}`);
    process.stdout.write(`OK rede ${access.scope}: autenticado=200, sem chave=${denied}, proxy sem token=${unauthProxy}, ponte local=200\n`);
  }finally{proxy?.close();child?.kill();fs.rmSync(temp,{recursive:true,force:true});}
}
main().catch(error=>{process.stderr.write(`${error.message}\n`);process.exitCode=1;});
