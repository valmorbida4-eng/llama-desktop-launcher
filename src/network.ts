'use strict';
const os=require('node:os');
const fs=require('node:fs');
const crypto=require('node:crypto');
const http=require('node:http');
const net=require('node:net');

function scopeOf(address) {
  if(address==='127.0.0.1') return 'Local';
  if(net.isIP(address)!==4) return null;
  const [a,b]=address.split('.').map(Number);
  if(a===100&&b>=64&&b<=127) return 'Tailscale';
  if(a===10||(a===172&&b>=16&&b<=31)||(a===192&&b===168)) return 'LAN';
  return null;
}
function accessOptions() {
  const list=[{name:'Somente este computador (127.0.0.1)',host:'127.0.0.1',scope:'Local'}];
  const seen=new Set(['127.0.0.1']);
  for(const [nic,addresses] of Object.entries(os.networkInterfaces()) as [string, import('node:os').NetworkInterfaceInfo[] | undefined][]) for(const info of addresses||[]) {
    if(info.internal||seen.has(info.address)) continue;
    const scope=scopeOf(info.address);if(!scope)continue;seen.add(info.address);
    list.push({name:`${scope==='LAN'?'Rede interna':'Tailscale'} — ${nic} (${info.address})`,host:info.address,scope});
  }
  return list;
}
function validateParallel(value) {const n=Number(value);if(!Number.isInteger(n)||n<1||n>8)throw Error('Sessões simultâneas: escolha de 1 a 8.');return n;}
function ensureKey(file) {
  if(fs.existsSync(file)){const key=fs.readFileSync(file,'utf8').trim();if(!/^[A-Za-z0-9_-]{32,128}$/.test(key))throw Error('Chave de API inválida. Gere uma nova chave.');return key;}
  return rotateKey(file);
}
function rotateKey(file) {const key=crypto.randomBytes(32).toString('base64url');fs.mkdirSync(require('node:path').dirname(file),{recursive:true});fs.writeFileSync(file,key+'\n',{mode:0o600});return key;}
function allowLocalRequest(request,port,sessionToken=null) {
  const host=request.headers.host;
  if(host!==`127.0.0.1:${port}`)return false;
  if(request.headers.origin&&request.headers.origin!==`http://127.0.0.1:${port}`)return false;
  if(request.headers['sec-fetch-site']==='cross-site')return false;
  if(sessionToken){
    let tokenQuery=null;
    try{tokenQuery=new URL(request.url||'/',`http://127.0.0.1:${port}`).searchParams.get('token');}catch{}
    const cookieHeader=request.headers.cookie||'';
    const hasCookie=cookieHeader.split(';').some(c=>c.trim()===`llama_token=${sessionToken}`);
    const authHeader=request.headers.authorization||'';
    const hasAuth=authHeader===`Bearer ${sessionToken}`;
    if(tokenQuery!==sessionToken&&!hasCookie&&!hasAuth) return false;
  }
  return true;
}
function upstreamRequestDetails(request,localPort,authority,key) {
  const url=new URL(request.url||'/',`http://127.0.0.1:${localPort}`);
  url.searchParams.delete('token');
  const headers={...request.headers,host:authority,authorization:`Bearer ${key}`};
  delete headers.connection;
  delete headers.referer;
  if(typeof headers.cookie==='string') {
    const cookies=headers.cookie.split(';').map(cookie=>cookie.trim()).filter(cookie=>cookie&&!cookie.startsWith('llama_token='));
    if(cookies.length) headers.cookie=cookies.join('; ');
    else delete headers.cookie;
  }
  return {path:url.pathname+url.search,headers};
}
function createProxy(targetHost,targetPort,key,localPort,sessionToken=null) {
  if(!['LAN','Tailscale'].includes(scopeOf(targetHost)))throw Error('Destino remoto inválido.');
  const authority=`${targetHost}:${targetPort}`;
  const proxy=http.createServer((req,res)=>{
    if(!allowLocalRequest(req,localPort,sessionToken)){
      res.writeHead(403,{'content-type':'text/plain; charset=utf-8'});
      res.end('Acesso negado: chave ou token de sessão local ausente ou inválido.');
      return;
    }
    let setCookieHeader=null;
    if(sessionToken){
      try{
        if(new URL(req.url||'/',`http://127.0.0.1:${localPort}`).searchParams.get('token')===sessionToken){
          setCookieHeader=`llama_token=${sessionToken}; Path=/; HttpOnly; SameSite=Strict`;
        }
      }catch{}
    }
    const {path,headers}=upstreamRequestDetails(req,localPort,authority,key);
    const upstream=http.request({hostname:targetHost,port:targetPort,method:req.method,path,headers},incoming=>{
      const outgoing={...incoming.headers};delete outgoing['access-control-allow-origin'];delete outgoing['access-control-allow-credentials'];
      if(setCookieHeader) outgoing['set-cookie']=setCookieHeader;
      res.writeHead(incoming.statusCode||502,outgoing);incoming.pipe(res);
    });
    upstream.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end();});req.on('aborted',()=>upstream.destroy());req.pipe(upstream);
  });
  proxy.on('upgrade',(req,client,head)=>{
    if(!allowLocalRequest(req,localPort,sessionToken)){client.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');return;}
    const upstream=net.connect(targetPort,targetHost,()=>{
      const {path,headers}=upstreamRequestDetails(req,localPort,authority,key);
      upstream.write(`${req.method} ${path} HTTP/1.1\r\n`);
      for(const [name,value] of Object.entries(headers))if(!['host','authorization','connection'].includes(name))upstream.write(`${name}: ${value}\r\n`);
      upstream.write(`Host: ${authority}\r\nAuthorization: Bearer ${key}\r\nConnection: Upgrade\r\n\r\n`);
      if(head.length)upstream.write(head);client.pipe(upstream).pipe(client);
    });
    upstream.on('error',()=>client.destroy());client.on('error',()=>upstream.destroy());
  });
  proxy.on('clientError',(_e,socket)=>socket.destroy());
  return new Promise((resolve,reject)=>{proxy.once('error',reject);proxy.listen(localPort,'127.0.0.1',()=>resolve(proxy));});
}
module.exports={scopeOf,accessOptions,validateParallel,ensureKey,rotateKey,allowLocalRequest,upstreamRequestDetails,createProxy};
