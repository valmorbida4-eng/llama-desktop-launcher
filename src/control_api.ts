'use strict';
// API local de controle (DevTools): lista os modelos do catálogo, inicia e para o servidor principal, o
// revisor e o decisor e encerra o launcher. Escuta só em 127.0.0.1:8787, sem CORS, com um Bearer dedicado
// (DEVTOOLS_LAUNCHER_TOKEN). O launcher injeta as ações; este módulo só valida e roteia os pedidos.
const http=require('node:http');
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');

const HOST='127.0.0.1',PORT=8787,VERSION=1;
const TOKEN_ENV='DEVTOOLS_LAUNCHER_TOKEN';
const TOKEN=/^[A-Za-z0-9._~+/=-]{32,256}$/;
const MODEL_ID=/^m_[0-9a-f]{16}$/;
// Papéis de serviço. Um modelo continua sendo só chat ou decider: o revisor usa um modelo chat.
const ROLES=Object.freeze(['chat','decider','reviewer']);
const MAX_BODY=16*1024;
const ROUTES: Record<string,string>={'/v1/control/state':'GET','/v1/control/start':'POST','/v1/control/stop':'POST','/v1/control/quit':'POST'};

class ControlError extends Error {
  status: number;code: string;
  constructor(status: number,code: string,message: string){super(message);this.status=status;this.code=code;}
}

// ID estável do catálogo: hash do caminho normalizado. O cliente nunca envia caminhos.
function modelId(modelPath: string,platform: string=process.platform) {
  const normalized=platform==='win32'?path.win32.normalize(modelPath).toLowerCase():path.posix.normalize(modelPath);
  return 'm_'+crypto.createHash('sha256').update(normalized).digest('hex').slice(0,16);
}
function catalog(models: any[],platform: string=process.platform) {
  const seen=new Set<string>(),list: any[]=[];
  for(const m of models||[]){const id=modelId(m.path,platform);if(seen.has(id))continue;seen.add(id);list.push({id,name:String(m.name||path.basename(m.path)),role:m.decision?'decider':'chat',engine:m.engine||'llamacpp',path:m.path});}
  return list;
}
// Estado no formato do contrato: {version, models, servers:{chat, decider, reviewer}}.
function publicState(models: any[],servers: {chat: any; decider: any; reviewer?: any}) {
  return {version:VERSION,models:models.map(({id,name,role})=>({id,name,role})),servers:{chat:servers.chat||null,decider:servers.decider||null,reviewer:servers.reviewer||null}};
}

function validToken(value: unknown) {return typeof value==='string'&&TOKEN.test(value);}
// O token vem da variável DEVTOOLS_LAUNCHER_TOKEN, quando válida; senão, do arquivo gerado pelo launcher.
function resolveToken(file: string,env: Record<string,string|undefined>=process.env) {
  const fromEnv=env[TOKEN_ENV];
  if(fromEnv!==undefined&&fromEnv!=='') {
    if(validToken(fromEnv.trim()))return {token:fromEnv.trim(),source:'env'};
    return {token:null,source:'env',error:`${TOKEN_ENV} inválido: use de 32 a 256 caracteres sem espaços.`};
  }
  try{const saved=fs.readFileSync(file,'utf8').trim();if(validToken(saved))return {token:saved,source:'file'};}catch{}
  return {token:null,source:'file'};
}
function rotateToken(file: string) {
  const token=crypto.randomBytes(32).toString('base64url');
  fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,token+'\n',{mode:0o600});
  return token;
}
function ensureToken(file: string,env: Record<string,string|undefined>=process.env) {
  const current=resolveToken(file,env);
  if(current.token||current.source==='env')return current;
  return {token:rotateToken(file),source:'file'};
}

function sameSecret(a: string,b: string) {
  const ha=crypto.createHash('sha256').update(a).digest(),hb=crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha,hb);
}
function parseBody(raw: string) {
  if(!raw.trim())return {};
  let body: any;try{body=JSON.parse(raw);}catch{throw new ControlError(400,'invalid_json','Corpo JSON inválido.');}
  if(!body||typeof body!=='object'||Array.isArray(body))throw new ControlError(400,'invalid_body','O corpo precisa ser um objeto JSON.');
  return body;
}
function validRole(role: unknown) {
  if(typeof role!=='string'||!ROLES.includes(role))throw new ControlError(400,'invalid_role','role deve ser "chat", "decider" ou "reviewer".');
  return role;
}
// Valida o pedido de início contra o catálogo: ID desconhecido → 404, papel trocado → 422.
function resolveStart(body: any,models: any[]) {
  const role=validRole(body.role);
  if(typeof body.model_id!=='string'||!MODEL_ID.test(body.model_id))throw new ControlError(400,'invalid_model_id','model_id inválido: use um ID de /v1/control/state.');
  const model=models.find(m=>m.id===body.model_id);
  if(!model)throw new ControlError(404,'model_not_found','Modelo não encontrado no catálogo.');
  if(role==='reviewer') {
    if(model.role!=='chat')throw new ControlError(422,'role_mismatch','O revisor precisa de um modelo que gere texto, não de decisão.');
    if((model.engine||'llamacpp')!=='llamacpp')throw new ControlError(422,'role_mismatch','O revisor aceita só modelos GGUF do llama.cpp.');
    return {role,model};
  }
  if(model.role!==role)throw new ControlError(422,'role_mismatch',role==='chat'?'Este é um modelo de decisão: use role "decider".':'Este modelo não é de decisão: use role "chat".');
  return {role,model};
}

function send(res: any,status: number,payload: any,extra: Record<string,string>={}) {
  const body=JSON.stringify(payload);
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Content-Length':Buffer.byteLength(body),'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...extra});
  res.end(body);
}
// Só mensagens de ControlError saem para o cliente; qualquer outra falha vira um erro interno genérico.
function sendError(res: any,error: any) {
  if(!(error instanceof ControlError)){send(res,500,{error:{code:'internal_error',message:'Erro interno do launcher.'}});return;}
  send(res,error.status,{error:{code:error.code,message:error.message}},error.status===401?{'WWW-Authenticate':'Bearer'}:{});
}
// Falhas do motor ao iniciar levam o motivo (texto do launcher), sem pilha.
function startFailure(error: any) {
  if(error instanceof ControlError)return error;
  return new ControlError(500,'start_failed',typeof error?.message==='string'&&error.message?error.message.slice(0,500):'Falha ao iniciar o serviço.');
}
function readBody(req: any): Promise<string> {
  return new Promise((resolve,reject)=>{
    let size=0;const chunks: Buffer[]=[];
    req.on('data',(c: Buffer)=>{size+=c.length;if(size>MAX_BODY){reject(new ControlError(413,'body_too_large','Corpo grande demais.'));req.resume();return;}chunks.push(c);});
    req.on('end',()=>resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error',reject);
  });
}

// handlers: models() → catálogo; servers() → {chat, decider, reviewer}; start(role, model); stop(role); quit().
// Um início por papel de cada vez: outro início do mesmo papel enquanto o primeiro carrega recebe 409.
function createHandler(options: {token: () => string | null; port?: number; handlers: any}) {
  const port=options.port??PORT,h=options.handlers,busy=new Set<string>();
  const hosts=new Set([`127.0.0.1:${port}`,`localhost:${port}`]);
  const state=()=>publicState(h.models(),h.servers());
  return async(req: any,res: any)=>{
    try {
      // Hosts diferentes indicam DNS rebinding; nenhum cabeçalho CORS é enviado, de propósito.
      if(!hosts.has(String(req.headers.host||'').toLowerCase()))throw new ControlError(403,'forbidden_host','Host não permitido.');
      const token=options.token();
      const auth=String(req.headers.authorization||'');
      const given=auth.startsWith('Bearer ')?auth.slice(7).trim():'';
      if(!token||!given||!sameSecret(given,token))throw new ControlError(401,'unauthorized','Token ausente ou inválido.');
      const url=new URL(req.url||'/',`http://${HOST}`);
      const method=ROUTES[url.pathname];
      if(!method)throw new ControlError(404,'not_found','Rota não encontrada.');
      if(req.method!==method){res.setHeader('Allow',method);throw new ControlError(405,'method_not_allowed',`Use ${method}.`);}
      if(method==='GET'){send(res,200,state());return;}
      const type=String(req.headers['content-type']||'').split(';')[0].trim().toLowerCase();
      const raw=await readBody(req);
      if(raw.trim()&&type!=='application/json')throw new ControlError(415,'unsupported_media_type','Use Content-Type: application/json.');
      const body=parseBody(raw);
      if(url.pathname==='/v1/control/quit'){send(res,202,{quitting:true});res.once('finish',()=>setImmediate(()=>h.quit()));return;}
      if(url.pathname==='/v1/control/stop'){await h.stop(validRole(body.role));send(res,200,state());return;}
      // Parar não espera: interrompe também um início ainda carregando (esse pedido de início recebe erro).
      const target=resolveStart(body,h.models());
      if(busy.has(target.role))throw new ControlError(409,'busy',`Já existe um início em andamento para ${target.role}.`);
      busy.add(target.role);
      try{await h.start(target.role,target.model);}catch(error){throw startFailure(error);}finally{busy.delete(target.role);}
      send(res,200,state());
    } catch(error) {
      if(!res.headersSent)sendError(res,error);
      else res.destroy();
    }
  };
}

function createControlServer(options: {token: () => string | null; port?: number; handlers: any}): Promise<any> {
  const port=options.port??PORT;
  const server=http.createServer(createHandler({...options,port}));
  // Pedidos de início esperam o modelo carregar (até 30 min no vLLM): sem limite de tempo da resposta.
  server.requestTimeout=0;server.headersTimeout=10000;
  return new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,HOST,()=>{server.off('error',reject);resolve(server);});});
}

module.exports={HOST,PORT,VERSION,TOKEN_ENV,ROLES,ControlError,modelId,catalog,publicState,validToken,resolveToken,rotateToken,ensureToken,resolveStart,createHandler,createControlServer};
