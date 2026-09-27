'use strict';
const {app,BrowserWindow,ipcMain,dialog,shell,clipboard}=require('electron');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const net=require('node:net');
const http=require('node:http');
const {spawn}=require('node:child_process');
const core=require('./core');
const engine=require('./engine');
const benchmark=require('./benchmark');
const network=require('./network');
const cli=require('./cli');
const terminalCli=require('./terminal_cli');
const firewall=require('./firewall');
const {parseLegacyProfiles}=require('./profile_import');
let win,server=null,proxy=null,active=null,conversation=null,tuneAbort=null,configuration,configPath;

function defaultConfig() {return {modelDirs:[path.join(app.getPath('home'),'Models','GGUF'),''],engineDir:'',profiles:{},firstRun:true,accessHost:'127.0.0.1',parallel:1};}
function save() {fs.mkdirSync(path.dirname(configPath),{recursive:true});fs.writeFileSync(configPath,JSON.stringify(configuration,null,2));}
function load() {configPath=path.join(app.getPath('userData'),'settings.json');try {configuration={...defaultConfig(),...JSON.parse(fs.readFileSync(configPath,'utf8'))};}catch{configuration=defaultConfig();save();}}
function send(channel,data) {if(win&&!win.isDestroyed()) win.webContents.send(channel,data);}
function state() {return {config:configuration,models:core.scanModels(configuration.modelDirs),hardware:core.detectHardware(),platform:process.platform,engineReady:!!(configuration.engineDir&&fs.existsSync(path.join(configuration.engineDir,process.platform==='win32'?'llama-server.exe':'llama-server'))),running:!!server,chatRunning:!!conversation,accessOptions:network.accessOptions(),active};}
function freePort(host='127.0.0.1',first=0,last=0) {return new Promise((resolve,reject)=>{let port=first;const tryNext=()=>{const s=net.createServer();s.once('error',e=>{if(e.code==='EADDRINUSE'&&port<last){port++;tryNext();}else reject(e);});s.listen(port,host,()=>{const found=s.address().port;s.close(()=>resolve(found));});};tryNext();});}
function waitReady(host,port,child,key) {return new Promise((resolve,reject)=>{let count=0,done=false;const finish=(error)=>{if(done)return;done=true;clearInterval(timer);error?reject(error):resolve();};child.once('error',e=>finish(e));const timer=setInterval(()=>{if(child.exitCode!==null){finish(Error('llama-server encerrou antes de ficar pronto.'));return;}http.get({hostname:host,port,path:'/health',headers:key?{Authorization:`Bearer ${key}`}:{},timeout:3000},r=>{r.resume();if(r.statusCode===200)finish();}).on('error',()=>{});if(++count>300)finish(Error('Tempo esgotado ao carregar o modelo.'));},1000);});}
function apiKeyPath(){return path.join(app.getPath('userData'),'server-api-key.txt');}
function addressInRange(address,range){const [networkAddress,prefixText]=range.split('/');const prefix=prefixText===undefined?32:Number(prefixText);const toInt=value=>value.split('.').reduce((number,octet)=>(number*256+Number(octet))>>>0,0);const mask=prefix===0?0:(0xffffffff<<(32-prefix))>>>0;return (toInt(address)&mask)===(toInt(networkAddress)&mask);}
function selectedModel(modelPath) {const model=core.scanModels(configuration.modelDirs).find(m=>m.path===modelPath);if(!model) throw Error('Modelo não encontrado nas pastas configuradas.');return model;}
function createWindow() {win=new BrowserWindow({width:1100,height:850,minWidth:860,minHeight:650,webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:true}});win.loadFile(path.join(__dirname,'index.html'));win.webContents.setWindowOpenHandler(({url})=>{if(url.startsWith('https://')) shell.openExternal(url);return {action:'deny'};});}
app.whenReady().then(()=>{load();createWindow();app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)createWindow();});});
app.on('window-all-closed',()=>{if(process.platform!=='darwin') app.quit();});
app.on('before-quit',()=>{tuneAbort?.abort();proxy?.close();conversation?.stop();if(server)server.kill();});

ipcMain.handle('state',()=>state());
ipcMain.handle('complete-setup',()=>{configuration.firstRun=false;save();return state();});
ipcMain.handle('choose-dir',async(_e,kind,index)=>{if(kind==='engine'&&(server||conversation||tuneAbort))throw Error('Pare a execução atual antes de trocar o motor.');const result=await dialog.showOpenDialog(win,{properties:['openDirectory','createDirectory'],title:kind==='engine'?'Pasta dos binários llama.cpp':'Pasta de modelos GGUF'});if(result.canceled)return state();const dir=result.filePaths[0];const installRoot=app.isPackaged?path.dirname(process.execPath):null;if(installRoot&&core.isWithin(installRoot,dir))throw Error('Escolha uma pasta fora da instalação do aplicativo; ela será removida na desinstalação.');if(kind==='engine'){const executable=path.join(dir,process.platform==='win32'?'llama-server.exe':'llama-server');if(!fs.existsSync(executable))throw Error('A pasta precisa conter llama-server.');configuration.engineDir=dir;}else {if(index!==0&&index!==1)throw Error('Local de modelos inválido.');if(core.isWithin(app.getPath('userData'),dir))throw Error('Escolha uma pasta de modelos fora dos dados internos do aplicativo.');configuration.modelDirs[index]=dir;}save();return state();});
ipcMain.handle('clear-dir',(_e,index)=>{if(index!==1)throw Error('A primeira localização é obrigatória.');configuration.modelDirs[1]='';save();return state();});
ipcMain.handle('install-engine',async()=>{if(server||conversation||tuneAbort)throw Error('Pare a execução atual antes de trocar o motor.');const dir=path.join(app.getPath('userData'),'engines',Date.now().toString());const result=await engine.installEngine(dir,p=>send('progress',p));configuration.engineDir=result.path;configuration.engineVersion=result.release;save();return state();});
ipcMain.handle('save-profile',(_e,modelPath,settings)=>{selectedModel(modelPath);core.validateSettings(settings);configuration.profiles[modelPath]=settings;save();return state();});
ipcMain.handle('import-legacy-profiles',async()=>{
  const result=await dialog.showOpenDialog(win,{title:'Importar perfis do launcher anterior',properties:['openFile'],filters:[{name:'Perfis do launcher (*.tsv)',extensions:['tsv']}]});
  if(result.canceled)return null;
  const file=result.filePaths[0],content=fs.readFileSync(file,'utf8');
  if(Buffer.byteLength(content,'utf8')>10*1024*1024)throw Error('Arquivo de perfis grande demais.');
  const parsed=parseLegacyProfiles(content),models=core.scanModels(configuration.modelDirs);
  const normalize=value=>process.platform==='win32'?path.win32.normalize(value).toLowerCase():path.normalize(value);
  const byPath=new Map(models.map(model=>[normalize(model.path),model.path]));
  let imported=0,missing=0,existing=0;
  for(const profile of parsed.profiles){const current=byPath.get(normalize(profile.path));if(!current){missing++;continue;}if(configuration.profiles[current]){existing++;continue;}configuration.profiles[current]=profile.settings;imported++;}
  if(imported)save();return {imported,missing,existing,invalid:parsed.ignored.length};
});
ipcMain.handle('recommend',(_e,modelPath)=>{const model=selectedModel(modelPath);return core.recommend(model,core.detectHardware());});
ipcMain.handle('tune',async(_e,modelPath,settings)=>{if(server||conversation)throw Error('Pare o servidor ou a conversa antes do teste.');if(tuneAbort)throw Error('Já existe um teste em execução.');const model=selectedModel(modelPath);if(!configuration.engineDir)throw Error('Instale o motor primeiro.');const controller=new AbortController();tuneAbort=controller;try{return await benchmark.tune(configuration.engineDir,model,settings,text=>send('tune-progress',text),controller.signal);}finally{tuneAbort=null;}});
ipcMain.handle('launch',async(_e,modelPath,settings,options={})=>{
  if(server||conversation||tuneAbort)throw Error('Pare a execução atual antes de iniciar outra.');
  const model=selectedModel(modelPath);core.validateSettings(settings);
  const access=network.accessOptions().find(item=>item.host===options.host);
  if(!access)throw Error('Escolha um endereço de rede disponível.');
  const parallel=network.validateParallel(options.parallel);
  const executable=path.join(configuration.engineDir||'',process.platform==='win32'?'llama-server.exe':'llama-server');
  if(!fs.existsSync(executable))throw Error('Instale ou selecione o llama.cpp primeiro.');
  const key=access.scope==='Local'?null:network.ensureKey(apiKeyPath());
  configuration.profiles[modelPath]=settings;configuration.firstRun=false;configuration.accessHost=access.host;configuration.parallel=parallel;save();
  const port=await freePort(access.host,8080,8180);
  const args=core.argsForModel(model,settings,'server',port,{host:access.host,parallel,keyPath:key?apiKeyPath():null});
  const child=spawn(executable,args,{cwd:configuration.engineDir,windowsHide:true,stdio:['ignore','pipe','pipe']});server=child;
  child.stdout.on('data',d=>send('log',String(d).slice(-3000)));
  child.stderr.on('data',d=>send('log',String(d).slice(-3000)));
  child.on('exit',code=>{if(server===child){server=null;proxy?.close();proxy=null;active=null;send('stopped',code);}});
  try {
    await waitReady(access.host,port,child,key);
    let browserUrl=`http://127.0.0.1:${port}/`;
    if(key){const localPort=await freePort();proxy=await network.createProxy(access.host,port,key,localPort);browserUrl=`http://127.0.0.1:${localPort}/`;}
    active={host:access.host,scope:access.scope,port,parallel,executable,browserUrl,endpoint:`http://${access.host}:${port}/v1`,remoteUrl:`http://${access.host}:${port}/`};
    await shell.openExternal(browserUrl);
    return active;
  }catch(e){proxy?.close();proxy=null;child.kill();throw e;}
});
ipcMain.handle('stop',()=>{proxy?.close();proxy=null;server?.kill();return true;});
ipcMain.handle('start-chat',(_e,modelPath,settings)=>{
  if(server||conversation)throw Error('Pare a execução atual antes de iniciar outra.');
  if(tuneAbort)throw Error('Aguarde o fim do teste de desempenho.');
  const model=selectedModel(modelPath);core.validateSettings(settings);
  const session=cli.createSession({engineDir:configuration.engineDir,model,settings,
    onOutput:data=>send('chat-output',data),
    onExit:result=>{if(conversation===session){conversation=null;send('chat-stopped',result);}},
    onError:error=>send('chat-output',{stream:'stderr',text:`\n${error.message}\n`})});
  conversation=session;configuration.profiles[modelPath]=settings;configuration.firstRun=false;save();return true;
});
ipcMain.handle('open-cli-terminal',async(_e,modelPath,settings)=>{
  if(server||conversation||tuneAbort)throw Error('Pare o servidor, a conversa ou o teste antes de abrir o terminal.');
  const model=selectedModel(modelPath);core.validateSettings(settings);
  await terminalCli.openExternalCli({engineDir:configuration.engineDir,model,settings});
  configuration.profiles[modelPath]=settings;configuration.firstRun=false;save();
  return true;
});
ipcMain.handle('send-chat',(_e,value)=>{if(!conversation)throw Error('Inicie uma conversa no terminal primeiro.');return conversation.send(value);});
ipcMain.handle('stop-chat',()=>{conversation?.stop();return true;});
ipcMain.handle('get-key',()=>network.ensureKey(apiKeyPath()));
ipcMain.handle('copy-key',()=>{clipboard.writeText(network.ensureKey(apiKeyPath()));return true;});
ipcMain.handle('rotate-key',()=>{if(server)throw Error('Pare o servidor antes de gerar outra chave.');return network.rotateKey(apiKeyPath());});
ipcMain.handle('copy-endpoint',()=>{if(!active)throw Error('Inicie o servidor primeiro.');clipboard.writeText(active.endpoint);return active.endpoint;});
ipcMain.handle('copy-browser-link',()=>{if(!active)throw Error('Inicie o servidor primeiro.');clipboard.writeText(active.remoteUrl);return active.remoteUrl;});
ipcMain.handle('create-firewall-rule',async(_e,remoteAddress)=>{
  if(process.platform!=='win32'||!active||active.scope==='Local')throw Error('Inicie um servidor LAN ou Tailscale no Windows primeiro.');
  const range=firewall.validateRemoteAddress(remoteAddress);
  if(network.scopeOf(range.split('/')[0])!==active.scope||!addressInRange(active.host,range))throw Error('A faixa de clientes precisa conter o endereço da rede selecionada.');
  return firewall.createRule({program:active.executable,port:active.port,remoteAddress:range});
});
ipcMain.handle('open-hf',async(_e,kind)=>{const urls={moe:'https://huggingface.co/models?library=gguf&apps=llama.cpp&base_model_relation=quantized&sort=most_params&search=moe+q4_k_m',dense:'https://huggingface.co/models?library=gguf&apps=llama.cpp&base_model_relation=quantized&sort=most_params&search=q4_k_m'};const url=urls[kind];if(!url)throw Error('Filtro inválido.');await shell.openExternal(url);return url;});
ipcMain.handle('open-model-dir',async(_e,index)=>{const dir=configuration.modelDirs[index];if(!dir)throw Error('Localização vazia.');fs.mkdirSync(dir,{recursive:true});await shell.openPath(dir);return true;});
ipcMain.handle('open-manual',async(_e,language)=>{if(!['pt-BR','en'].includes(language))throw Error('Idioma inválido.');const base=app.isPackaged?path.join(process.resourcesPath,'docs'):path.join(__dirname,'..','docs');const error=await shell.openPath(path.join(base,`MANUAL-${language}.md`));if(error)throw Error(error);return true;});
