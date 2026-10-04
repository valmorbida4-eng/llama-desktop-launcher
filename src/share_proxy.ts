'use strict';
const http=require('node:http'),net=require('node:net'),crypto=require('node:crypto');
const network=require('./network');
function createShareProxy(host,targetPort,key,port=0){
  if(!['LAN','Tailscale'].includes(network.scopeOf(host)))throw Error('Compartilhamento exige LAN ou Tailscale.');
  let token=crypto.randomBytes(32).toString('base64url');
  let actualPort=port;
  const sockets=new Set<any>();
  const valid=value=>typeof value==='string'&&/^[A-Za-z0-9_-]+$/.test(value)&&value.length===token.length&&crypto.timingSafeEqual(Buffer.from(value),Buffer.from(token));
  const origin=()=>`http://${host}:${actualPort}`;
  function trusted(req){return req.headers.host===`${host}:${actualPort}`&&(!req.headers.origin||req.headers.origin===origin())&&req.headers['sec-fetch-site']!=='cross-site';}
  function authorized(req){
    const bearer=(req.headers.authorization||'').replace(/^Bearer /,'');
    const cookie=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('llama_share='));
    return valid(bearer)||valid(cookie?.slice('llama_share='.length));
  }
  function deny(res,status=403){res.writeHead(status,{'content-type':'text/plain; charset=utf-8','cache-control':'no-store'});res.end('Acesso compartilhado ausente, expirado ou revogado. Copie um novo link no launcher.');}
  function details(req){const d=network.upstreamRequestDetails(req,actualPort,`${host}:${targetPort}`,key);if(d.headers.cookie){const c=d.headers.cookie.split(';').map(x=>x.trim()).filter(x=>!x.startsWith('llama_share='));if(c.length)d.headers.cookie=c.join('; ');else delete d.headers.cookie;}return d;}
  const server=http.createServer((req,res)=>{
    if(!trusted(req)){deny(res);return;}
    if(req.url==='/_share/login'&&req.method==='POST'){
      if(req.headers.origin!==origin()||!(req.headers['content-type']||'').startsWith('application/json')){deny(res);return;}
      let body='',tooLarge=false;
      req.on('data',chunk=>{if(tooLarge)return;body+=chunk;if(body.length>256){tooLarge=true;deny(res,413);}});
      req.on('end',()=>{if(tooLarge)return;let supplied;try{supplied=JSON.parse(body).token;}catch{deny(res,400);return;}if(!valid(supplied)){deny(res);return;}res.writeHead(204,{'set-cookie':`llama_share=${token}; Path=/; HttpOnly; SameSite=Strict`,'cache-control':'no-store','referrer-policy':'no-referrer'});res.end();});return;
    }
    if(!authorized(req)){
      if(req.method==='GET'&&(req.url==='/'||req.url==='/index.html')){
        const nonce=crypto.randomBytes(16).toString('base64');
        res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store','referrer-policy':'no-referrer','content-security-policy':`default-src 'none'; script-src 'nonce-${nonce}'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'`});
        res.end(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Acesso ao modelo local</title><p id="status">Conectando ao modelo local…</p><script nonce="${nonce}">(async()=>{const token=new URLSearchParams(location.hash.slice(1)).get('token');history.replaceState(null,'','/');if(!token){document.getElementById('status').textContent='Acesso expirado ou revogado. Solicite um novo link.';return;}try{const response=await fetch('/_share/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token}),credentials:'same-origin'});if(!response.ok)throw Error();location.replace('/');}catch{document.getElementById('status').textContent='Acesso expirado ou revogado. Solicite um novo link.';}})();</script></html>`);return;
      }
      deny(res);return;
    }
    let d;try{d=details(req);}catch{deny(res,400);return;}
    const upstream=http.request({hostname:host,port:targetPort,method:req.method,path:d.path,headers:d.headers},incoming=>{
      const headers={...incoming.headers,'cache-control':'no-store','referrer-policy':'no-referrer'};delete headers['access-control-allow-origin'];delete headers['access-control-allow-credentials'];delete headers['set-cookie'];
      res.writeHead(incoming.statusCode||502,headers);incoming.pipe(res);
    });upstream.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end();});req.on('aborted',()=>upstream.destroy());res.on('close',()=>upstream.destroy());req.pipe(upstream);
  });
  server.on('connection',socket=>{sockets.add(socket);socket.once('close',()=>sockets.delete(socket));});
  server.on('upgrade',(req,client,head)=>{
    if(!trusted(req)||!authorized(req)){client.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');return;}
    let d;try{d=details(req);}catch{client.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');return;}
    const upstream=net.connect(targetPort,host,()=>{upstream.write(`${req.method} ${d.path} HTTP/1.1\r\n`);for(const [name,value] of Object.entries(d.headers))if(!['host','authorization','connection'].includes(name))upstream.write(`${name}: ${value}\r\n`);upstream.write(`Host: ${host}:${targetPort}\r\nAuthorization: Bearer ${key}\r\nConnection: Upgrade\r\n\r\n`);if(head.length)upstream.write(head);client.pipe(upstream).pipe(client);});client.on('close',()=>upstream.destroy());client.on('error',()=>upstream.destroy());upstream.on('error',()=>client.destroy());
  });
  server.on('clientError',(_e,socket)=>socket.destroy());
  const disconnect=()=>{for(const socket of sockets)socket.destroy();};
  return new Promise<any>((resolve,reject)=>{server.once('error',reject);server.listen(port,host,()=>{actualPort=server.address().port;resolve({port:actualPort,endpoint:origin()+'/v1',link:()=>origin()+'/#token='+token,accessKey:()=>token,revoke:()=>{token=crypto.randomBytes(32).toString('base64url');disconnect();},close:()=>{disconnect();server.close();}});});});
}
module.exports={createShareProxy};
