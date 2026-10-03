'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),net=require('node:net');
const network=require('../build/app/network');
const {createShareProxy}=require('../build/app/share_proxy');
async function setup(){
 let last;
 const upstream=http.createServer((req,res)=>{last=req.headers;res.setHeader('content-type','application/json');res.end(JSON.stringify({data:[{id:'modelo-local'}]}));});
 await new Promise(r=>upstream.listen(0,'127.0.0.1',r));
 const original=network.scopeOf;network.scopeOf=host=>host==='127.0.0.1'?'LAN':original(host);
 let share;try{share=await createShareProxy('127.0.0.1',upstream.address().port,'permanent-test-key');}finally{network.scopeOf=original;}
 const origin='http://127.0.0.1:'+share.port;
 const request=(path,headers={},body=null)=>new Promise((resolve,reject)=>{const req=http.request(origin+path,{method:body===null?'GET':'POST',headers,agent:false},res=>{let data='';res.on('data',c=>data+=c);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:data}));});req.on('error',reject);req.end(body);});
 return {share,origin,request,last:()=>last,close:async()=>{share.close();await new Promise(r=>upstream.close(r));}};
}
test('link compartilhado autentica cookie e Bearer sem expor a chave permanente',async()=>{
 const f=await setup();try{
  const token=new URL(f.share.link()).hash.slice('#token='.length);
  assert.equal(new URL(f.share.link()).search,'');assert.notEqual(token,'permanent-test-key');
  const page=await f.request('/');assert.equal(page.status,200);assert.match(page.body,/history.replaceState/);assert.doesNotMatch(page.body,/permanent-test-key/);
  assert.equal((await f.request('/v1/models')).status,403);
  assert.equal((await f.request('/v1/models',{authorization:'Bearer '+'é'.repeat(43)})).status,403);
  const login=await f.request('/_share/login',{origin:f.origin,'content-type':'application/json'},JSON.stringify({token}));
  assert.equal(login.status,204);assert.match(login.headers['set-cookie'][0],/HttpOnly; SameSite=Strict/);
  const cookie=login.headers['set-cookie'][0].split(';')[0];
  assert.equal((await f.request('/v1/models',{cookie})).status,200);
  assert.equal(f.last().authorization,'Bearer permanent-test-key');assert.equal(f.last().cookie,undefined);
  assert.equal((await f.request('/v1/models',{authorization:'Bearer '+token})).status,200);
  assert.equal((await f.request('/v1/models',{authorization:'Bearer '+token,origin:'https://other.invalid'})).status,403);
  assert.equal((await f.request('/_share/login',{origin:'https://other.invalid','content-type':'application/json'},JSON.stringify({token}))).status,403);
  f.share.revoke();assert.notEqual(f.share.accessKey(),token);
  assert.equal((await f.request('/v1/models',{cookie})).status,403);
  assert.equal((await f.request('/v1/models',{authorization:'Bearer '+token})).status,403);
  assert.equal((await f.request('/v1/models',{authorization:'Bearer '+f.share.accessKey()})).status,200);
 }finally{await f.close();}
});
test('revogar desconecta sessões e websocket sem credencial é rejeitado',async()=>{
 const f=await setup();try{
  const socket=net.connect(f.share.port,'127.0.0.1');await new Promise(r=>socket.once('connect',r));
  await new Promise(r=>setTimeout(r,20));const closed=new Promise(r=>socket.once('close',r));f.share.revoke();await closed;
  const result=await new Promise((resolve,reject)=>{const client=net.connect(f.share.port,'127.0.0.1',()=>client.write(`GET /socket HTTP/1.1\r\nHost: 127.0.0.1:${f.share.port}\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n`));let data='';client.on('data',c=>data+=c);client.on('end',()=>{client.destroy();resolve(data);});client.on('error',reject);});assert.match(result,/403 Forbidden/);
 }finally{await f.close();}
});
