'use strict';
const {app,BrowserWindow,ipcMain,dialog,shell,clipboard}=require('electron');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const net=require('node:net');
const http=require('node:http');
const crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const core=require('./core');
const engine=require('./engine');
const engines=require('./engines');
const benchmark=require('./benchmark');
const network=require('./network');
const cli=require('./cli');
const clientCommands=require('./client_commands');
const sharing=require('./share_proxy');
let shareProxy:any=null;
const terminalCli=require('./terminal_cli');
const guidance=require('./guidance');
const hardware=require('./hardware');
const firewall=require('./firewall');
const updater=require('./updater');
const diagnostics=require('./diagnostics');
const {parseLegacyProfiles}=require('./profile_import');
let win: import('electron').BrowserWindow | null,server: any=null,proxy: any=null,active: any=null,conversation: any=null,tuneAbort: AbortController | null=null,configuration: any,configPath: string;
let gpuProbe;
let docker: any={daemon:false,image:false,checked:false},engineBusy=false,serverContainer: string | null=null;
let updateInfo: any=null,updateBusy=false;
// Fim do registro do motor, guardado aqui para o relatório de diagnóstico (a janela recebe só os pedaços).
const engineLog=diagnostics.createLogBuffer();

function validateSender(event: any) {
  if(!win||win.isDestroyed()||!event?.senderFrame||event.senderFrame!==win.webContents.mainFrame) {
    throw Error('Chamada IPC não autorizada.');
  }
}

function defaultConfig() {return {modelDirs:[path.join(app.getPath('home'),'Models','GGUF'),''],engineDir:'',vllmDir:'',strataDir:'',profiles:{},selectedModelPath:'',firstRun:true,accessHost:'127.0.0.1',parallel:1,updateCheck:true};}
function save() {fs.mkdirSync(path.dirname(configPath),{recursive:true});fs.writeFileSync(configPath,JSON.stringify(configuration,null,2));}
function load() {configPath=path.join(app.getPath('userData'),'settings.json');try {configuration={...defaultConfig(),...JSON.parse(fs.readFileSync(configPath,'utf8'))};}catch{configuration=defaultConfig();save();}}
function send(channel,data) {if(win&&!win.isDestroyed()) win.webContents.send(channel,data);}
function log(text: string) {engineLog.append(text);send('log',text);}
function llamaReady() {return !!(configuration.engineDir&&fs.existsSync(path.join(configuration.engineDir,process.platform==='win32'?'llama-server.exe':'llama-server')));}
function engineReady(id: string) {
  if(id==='llamacpp')return llamaReady();
  if(id==='vllm')return engines.vllmMode()==='venv'?engines.vllmVenvReady(configuration.vllmDir):engines.vllmMode()==='docker'?!!docker.image:false;
  if(id==='strata')return engines.engineInfo('strata').supported&&!!engines.detectStrata(configuration.strataDir);
  return false;
}
function engineStatus() {
  return engines.engineCatalog().map((info: any)=>{
    const strata=info.id==='strata'?engines.detectStrata(configuration.strataDir):null;
    const detail=info.id==='llamacpp'?(configuration.engineDir||''):info.id==='strata'?(strata?`${strata.distribution} · ${configuration.strataDir}`:configuration.strataDir||''):
      info.mode==='venv'?(configuration.vllmDir||''):info.mode==='docker'?(docker.checked?(docker.daemon?(docker.image?`Imagem ${engines.VLLM_IMAGE} pronta`:`Docker pronto; falta baixar ${engines.VLLM_IMAGE}`):'Docker Desktop não encontrado ou parado'):'Verificando Docker…'):'';
    return {...info,ready:info.supported&&engineReady(info.id),detail,version:info.id==='vllm'?engines.VLLM_VERSION:info.id==='llamacpp'?(configuration.engineVersion||engine.ENGINE_TAG):null};
  });
}
function allModels() {
  const supported=new Set(engines.engineCatalog().filter((e: any)=>e.supported).map((e: any)=>e.id));
  // Uma única varredura das pastas para GGUF e pastas Hugging Face.
  const found=core.walkModels(configuration.modelDirs,{hf:supported.has('vllm')});
  const gguf=found.gguf.map((m: any)=>({...m,engine:'llamacpp'})),hf=found.hf;
  const strata=supported.has('strata')&&configuration.strataDir?engines.scanStrataConfigs(configuration.strataDir):[];
  return [...gguf,...hf,...strata];
}
async function refreshDocker() {if(engines.vllmMode()!=='docker')return docker;docker=await engines.dockerStatus();return docker;}
function requireLlama(model: any,action: string) {if(model.engine!=='llamacpp')throw Error(`${action} está disponível só para modelos GGUF no llama.cpp.`);}
function state() {return {appVersion:app.getVersion(),config:configuration,models:allModels(),engines:engineStatus(),hardware:core.detectHardware(),platform:process.platform,backendOptions:engine.backendOptions(),engineReady:llamaReady(),running:!!server,chatRunning:!!conversation,accessOptions:network.accessOptions(),active,update:updateInfo};}
function freePort(host: string='127.0.0.1',first=0,last=0): Promise<number> {return new Promise<number>((resolve,reject)=>{let port=first;const tryNext=()=>{const s=net.createServer();s.once('error',e=>{if(e.code==='EADDRINUSE'&&port<last){port++;tryNext();}else reject(e);});s.listen(port,host,()=>{const found=s.address().port;s.close(()=>resolve(found));});};tryNext();});}
function waitReady(host: string,port: number,child: any,key: string | null,limitSeconds=300): Promise<void> {return new Promise<void>((resolve,reject)=>{let count=0,done=false;const finish=(error?: Error)=>{if(done)return;done=true;clearInterval(timer);error?reject(error):resolve();};child.once('error',(e: Error)=>finish(e));const timer=setInterval(()=>{if(child.exitCode!==null){finish(Error('O motor encerrou antes de ficar pronto.'));return;}http.get({hostname:host,port,path:'/health',headers:key?{Authorization:`Bearer ${key}`}:{},timeout:3000},r=>{r.resume();if(r.statusCode===200)finish();}).on('error',()=>{});if(++count>limitSeconds)finish(Error('Tempo esgotado ao carregar o modelo.'));},1000);});}
function apiKeyPath(){return path.join(app.getPath('userData'),'server-api-key.txt');}
function addressInRange(address: string,range: string){const [networkAddress,prefixText]=range.split('/');const prefix=prefixText===undefined?32:Number(prefixText);const toInt=(value: string)=>value.split('.').reduce((number,octet)=>(number*256+Number(octet))>>>0,0);const mask=prefix===0?0:(0xffffffff<<(32-prefix))>>>0;return (toInt(address)&mask)===(toInt(networkAddress)&mask);}
function selectedModel(modelPath) {const model=allModels().find(m=>m.path===modelPath);if(!model) throw Error('Modelo não encontrado nas pastas configuradas.');return model;}
function availableModelDiskBytes() {for(const configured of configuration.modelDirs){if(!configured)continue;let dir=configured;while(!fs.existsSync(dir)){const parent=path.dirname(dir);if(parent===dir)break;dir=parent;}try{const stat=fs.statfsSync(dir);return Number(stat.bavail)*Number(stat.bsize);}catch{}}return null;}
async function gpuDetails(){gpuProbe ||= hardware.detectGpu().catch(()=>({name:null,memoryBytes:null,source:null}));return gpuProbe;}
async function modelGuidance(model=null,settings=null){return guidance.buildGuidance({hardware:core.detectHardware(),gpu:await gpuDetails(),availableDiskBytes:availableModelDiskBytes(),model,settings});}
function createWindow() {
  win=new BrowserWindow({width:1100,height:850,minWidth:860,minHeight:650,webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  win.loadFile(path.join(__dirname,'index.html'));
  win.webContents.setWindowOpenHandler(({url})=>{if(url.startsWith('https://')||url.startsWith('http://')) shell.openExternal(url);return {action:'deny'};});
  win.webContents.on('will-navigate',(event,url)=>{event.preventDefault();if(url.startsWith('https://')||url.startsWith('http://')) shell.openExternal(url);});
  win.webContents.once('did-finish-load',()=>{const automatic=()=>{if(configuration.updateCheck!==false)checkUpdates().catch(()=>{});};automatic();setInterval(automatic,updater.CHECK_INTERVAL_MS);});
}
async function checkUpdates() {
  const info=await updater.checkForUpdate(app.getVersion());
  updateInfo=info;configuration.lastUpdateCheck=Date.now();save();
  if(info.available) send('update-available',info);
  return info;
}
// Downloads the verified package; Windows runs the installer and quits, other systems hand the file to the user.
async function installUpdate() {
  if(!updateInfo?.available)throw Error('Nenhuma atualização disponível.');
  if(updateBusy)throw Error('A atualização já está em andamento.');
  if(tuneAbort)throw Error('Aguarde o fim do teste de desempenho.');
  updateBusy=true;
  try {
    const file=await updater.downloadUpdate(updateInfo,path.join(app.getPath('userData'),'updates'),percent=>send('update-progress',{percent,label:`Baixando v${updateInfo.version}`}));
    if(process.platform==='win32') {
      if(server||conversation){const answer=await dialog.showMessageBox(win,{type:'question',buttons:['Encerrar e atualizar','Cancelar'],defaultId:0,cancelId:1,message:'O servidor e a conversa ativos serão encerrados para instalar a atualização.'});if(answer.response!==0)return {action:'cancelled',file};}
      spawn(file,[],{detached:true,stdio:'ignore'}).unref();
      setTimeout(()=>app.quit(),500);
      return {action:'installer',file};
    }
    if(process.platform==='darwin'){const error=await shell.openPath(file);if(error)throw Error(error);return {action:'opened',file};}
    if(file.endsWith('.AppImage')) {
      let target=file;
      const current=process.env.APPIMAGE;
      if(current){const beside=path.join(path.dirname(current),path.basename(file));try{if(!fs.existsSync(beside))fs.copyFileSync(file,beside);target=beside;}catch{}}
      fs.chmodSync(target,0o755);shell.showItemInFolder(target);
      return {action:'appimage',file:target};
    }
    shell.showItemInFolder(file);
    return {action:'package',file,command:updater.installHint(file)};
  } finally {updateBusy=false;}
}
app.whenReady().then(()=>{load();createWindow();refreshDocker().then(()=>send('engines-changed',null)).catch(()=>{});app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)createWindow();});});
app.on('window-all-closed',()=>{if(process.platform!=='darwin') app.quit();});
app.on('before-quit',()=>{tuneAbort?.abort();shareProxy?.close();shareProxy=null;proxy?.close();conversation?.stop();stopContainer();if(server)server.kill();});

ipcMain.handle('state',e=>{validateSender(e);return state();});
ipcMain.handle('check-update',e=>{validateSender(e);return checkUpdates();});
ipcMain.handle('install-update',e=>{validateSender(e);return installUpdate();});
ipcMain.handle('set-update-check',(e,enabled)=>{validateSender(e);if(typeof enabled!=='boolean')throw Error('Valor inválido.');configuration.updateCheck=enabled;save();return state();});
ipcMain.handle('select-model',(e,modelPath)=>{validateSender(e);selectedModel(modelPath);configuration.selectedModelPath=modelPath;save();return state();});
ipcMain.handle('complete-setup',e=>{validateSender(e);configuration.firstRun=false;save();return state();});
ipcMain.handle('choose-dir',async(e,kind,index)=>{validateSender(e);if(kind==='engine'&&(server||conversation||tuneAbort))throw Error('Pare a execução atual antes de trocar o motor.');if(!['engine','models','strata','vllm'].includes(kind))throw Error('Tipo de pasta inválido.');if((kind==='strata'||kind==='vllm')&&(server||engineBusy))throw Error('Pare o servidor antes de trocar o motor.');if(kind==='vllm'&&engines.vllmMode()!=='venv')throw Error('No Windows o vLLM roda pelo Docker Desktop; não há pasta para escolher.');if(kind==='strata'&&!engines.engineInfo('strata').supported)throw Error(engines.engineInfo('strata').unsupportedReason);const titles={engine:'Pasta dos binários llama.cpp',models:'Pasta de modelos (GGUF ou Hugging Face)',strata:'Pasta do Strata ou do PolyStrata',vllm:'Ambiente Python com vLLM (contém bin/vllm)'};const result=await dialog.showOpenDialog(win,{properties:['openDirectory','createDirectory'],title:titles[kind]});if(result.canceled)return state();const dir=result.filePaths[0];const installRoot=app.isPackaged?path.dirname(process.execPath):null;if(installRoot&&core.isWithin(installRoot,dir))throw Error('Escolha uma pasta fora da instalação do aplicativo; ela será removida na desinstalação.');if(kind==='engine'){const executable=path.join(dir,process.platform==='win32'?'llama-server.exe':'llama-server');if(!fs.existsSync(executable))throw Error('A pasta precisa conter llama-server.');configuration.engineDir=dir;configuration.engineBackend='external';}else if(kind==='strata'){if(!engines.detectStrata(dir))throw Error('A pasta precisa ser uma instalação do Strata ou do PolyStrata já configurada (serve/server.py e .venv). Rode o instalador deles primeiro.');configuration.strataDir=dir;}else if(kind==='vllm'){if(!engines.vllmVenvReady(dir))throw Error('A pasta precisa conter bin/vllm.');configuration.vllmDir=dir;}else {if(index!==0&&index!==1)throw Error('Local de modelos inválido.');if(core.isWithin(app.getPath('userData'),dir))throw Error('Escolha uma pasta de modelos fora dos dados internos do aplicativo.');configuration.modelDirs[index]=dir;}save();return state();});
ipcMain.handle('clear-dir',(e,index)=>{validateSender(e);if(index!==1)throw Error('A primeira localização é obrigatória.');configuration.modelDirs[1]='';save();return state();});
ipcMain.handle('install-engine',async(e,backend)=>{validateSender(e);if(server||conversation||tuneAbort)throw Error('Pare a execução atual antes de trocar o motor.');if(!engine.backendOptions().some(item=>item.id===backend))throw Error('Backend inválido para este sistema.');const dir=path.join(app.getPath('userData'),'engines',Date.now().toString());let result;try{result=await engine.installEngine(dir,backend,(percent,label)=>send('progress',{percent,label}));}catch(error){log(`
[launcher] Falha ao instalar o llama.cpp (${backend}): ${error.message}
`);throw error;}configuration.engineDir=result.path;configuration.engineVersion=result.release;configuration.engineBackend=result.backend;save();return state();});
ipcMain.handle('refresh-engines',async e=>{validateSender(e);await refreshDocker();return state();});
ipcMain.handle('install-vllm',async e=>{
  validateSender(e);
  if(server||engineBusy)throw Error('Pare o servidor antes de preparar o vLLM.');
  const mode=engines.vllmMode();
  if(!mode)throw Error(engines.engineInfo('vllm').unsupportedReason);
  engineBusy=true;
  const installLog=(text: string)=>log(String(text).slice(-3000));
  try {
    if(mode==='venv') {
      const dir=path.join(app.getPath('userData'),'engines',`vllm-${engines.VLLM_VERSION}-${Date.now()}`);
      const result=await engines.installVllm(dir,{onLog:installLog,onStep:(percent,label)=>send('progress',{percent,label})});
      configuration.vllmDir=result.path;save();
    } else {
      await refreshDocker();
      if(!docker.daemon)throw Error('Docker Desktop não encontrado ou parado. Instale-o com o backend WSL2 e suporte a GPU, abra-o e tente de novo.');
      send('progress',{percent:0,label:`Baixando ${engines.VLLM_IMAGE}`});
      await engines.pullVllmImage(installLog);
      await refreshDocker();
      send('progress',{percent:100,label:'vLLM pronto'});
    }
    return state();
  } catch(error) {log(`
[launcher] Falha ao preparar o vLLM: ${error.message}
`);throw error;} finally {engineBusy=false;}
});
ipcMain.handle('open-engine-link',async(e,kind)=>{validateSender(e);const url=Object.hasOwn(engines.links,kind)?engines.links[kind]:Object.hasOwn(guidance.engineLinks,kind)?guidance.engineLinks[kind]:null;if(!url)throw Error('Link inválido.');await shell.openExternal(url);return url;});
ipcMain.handle('save-profile',(e,modelPath,settings)=>{validateSender(e);selectedModel(modelPath);core.validateSettings(settings);configuration.profiles[modelPath]=settings;save();return state();});
ipcMain.handle('import-legacy-profiles',async(e)=>{
  validateSender(e);
  const result=await dialog.showOpenDialog(win,{title:'Importar perfis do launcher anterior',properties:['openFile'],filters:[{name:'Perfis do launcher (*.tsv)',extensions:['tsv']}]});
  if(result.canceled)return null;
  const file=result.filePaths[0],content=fs.readFileSync(file,'utf8');
  if(Buffer.byteLength(content,'utf8')>10*1024*1024)throw Error('Arquivo de perfis grande demais.');
  const parsed=parseLegacyProfiles(content),models=core.scanModels(configuration.modelDirs);
  const normalize=(value: string)=>process.platform==='win32'?path.win32.normalize(value).toLowerCase():path.normalize(value);
  const byPath=new Map<string,string>(models.map((model: any)=>[normalize(model.path),model.path] as [string,string]));
  let imported=0,missing=0,existing=0;
  for(const profile of parsed.profiles){const current=byPath.get(normalize(profile.path));if(!current){missing++;continue;}if(configuration.profiles[current]){existing++;continue;}configuration.profiles[current]=profile.settings;imported++;}
  if(imported)save();return {imported,missing,existing,invalid:parsed.ignored.length};
});
ipcMain.handle('recommend',async(e,modelPath)=>{validateSender(e);const model=selectedModel(modelPath);requireLlama(model,'A sugestão de ajustes');const gpu=await gpuDetails();return core.recommend(model,{...core.detectHardware(),gpuMemoryBytes:gpu.memoryBytes});});
ipcMain.handle('model-guidance',e=>{validateSender(e);return modelGuidance();});
ipcMain.handle('copy-guidance-prompt',async(e)=>{validateSender(e);const result=await modelGuidance();clipboard.writeText(result.prompt);return result.prompt;});
ipcMain.handle('analyze-with-model',async(e,modelPath,settings)=>{
  validateSender(e);
  if(server||conversation||tuneAbort)throw Error('Pare o servidor, a conversa ou o teste antes da análise.');
  const model=selectedModel(modelPath);requireLlama(model,'A análise pelo modelo');core.validateSettings(settings);
  const {prompt}=await modelGuidance(model,settings);
  const session=cli.createSession({engineDir:configuration.engineDir,model,settings,
    onOutput:data=>send('chat-output',data),
    onExit:result=>{if(conversation===session){conversation=null;send('chat-stopped',result);}},
    onError:error=>send('chat-output',{stream:'stderr',text:`\n${error.message}\n`})});
  conversation=session;
  try{await session.send(prompt);}catch(error){session.stop();conversation=null;throw error;}
  configuration.profiles[modelPath]=settings;configuration.firstRun=false;save();
  return {prompt};
});
ipcMain.handle('tune',async(e,modelPath,settings)=>{validateSender(e);if(server||conversation)throw Error('Pare o servidor ou a conversa antes do teste.');if(tuneAbort)throw Error('Já existe um teste em execução.');const model=selectedModel(modelPath);requireLlama(model,'O teste de desempenho');if(!configuration.engineDir)throw Error('Instale o motor primeiro.');const controller=new AbortController();tuneAbort=controller;try{return await benchmark.tune(configuration.engineDir,model,settings,text=>send('tune-progress',text),controller.signal);}finally{tuneAbort=null;}});
ipcMain.handle('launch',async(e,modelPath,settings,options: {host?: string; parallel?: number; openBrowser?: boolean}={})=>{
  validateSender(e);
  if(server&&active){if(options.openBrowser!==false)await shell.openExternal(active.browserUrl);return active;}
  if(server||conversation||tuneAbort||engineBusy)throw Error('Pare a execução atual antes de iniciar outra.');
  const model=selectedModel(modelPath);core.validateSettings(settings);
  const info=engines.engineInfo(model.engine);
  if(!info.supported)throw Error(info.unsupportedReason);
  const access=network.accessOptions().find(item=>item.host===options.host);
  if(!access)throw Error('Escolha um endereço de rede disponível.');
  const parallel=network.validateParallel(options.parallel);
  if(model.engine==='vllm'&&info.mode==='docker'&&!docker.image)await refreshDocker();
  if(!engineReady(model.engine))throw Error(model.engine==='llamacpp'?'Instale ou selecione o llama.cpp primeiro.':model.engine==='vllm'?'Prepare o vLLM em Configurações primeiro.':'Escolha a pasta do Strata ou do PolyStrata em Configurações primeiro.');
  const key=access.scope==='Local'?null:network.ensureKey(apiKeyPath());
  configuration.profiles[modelPath]=settings;configuration.firstRun=false;configuration.accessHost=access.host;configuration.parallel=parallel;save();
  const port=await freePort(access.host,8080,8180);
  let command: any;
  if(model.engine==='llamacpp') {
    const executable=path.join(configuration.engineDir,process.platform==='win32'?'llama-server.exe':'llama-server');
    command={file:executable,args:core.argsForModel(model,settings,'server',port,{host:access.host,parallel,keyPath:key?apiKeyPath():null}),env:{},cwd:configuration.engineDir};
  } else {
    command=engines.serverCommand(model,settings,{host:access.host,port,parallel,key,vllmDir:configuration.vllmDir,strataDir:configuration.strataDir,
      containerName:engines.VLLM_CONTAINER_PREFIX+crypto.randomBytes(6).toString('hex')});
  }
  const child=spawn(command.file,command.args,{cwd:command.cwd,env:{...process.env,...command.env},windowsHide:true,stdio:['ignore','pipe','pipe']});server=child;
  const containerName=command.containerName||null;serverContainer=containerName;
  log(`
[launcher] Iniciando ${info.label} · ${model.name} · ${access.scope} ${access.host}:${port} · sessões ${parallel}
`);
  child.stdout.on('data',d=>log(String(d).slice(-3000)));
  child.stderr.on('data',d=>log(String(d).slice(-3000)));
  const cleanupServer=(code: any)=>{if(server===child){server=null;serverContainer=null;shareProxy?.close();shareProxy=null;proxy?.close();proxy=null;active=null;send('stopped',code);}};
  child.on('exit',cleanupServer);
  child.on('error',err=>{log(`
[erro ao iniciar ${info.label}: ${err.message}]
`);cleanupServer(err);});
  try {
    // vLLM e Strata carregam mais devagar (compilação de grafos, modelos grandes): até 30 minutos.
    await waitReady(access.host,port,child,key,model.engine==='llamacpp'?300:1800);
    let browserUrl=`http://127.0.0.1:${port}${info.browserPath}`;
    if(key){
      const localPort=await freePort();
      const sessionToken=crypto.randomBytes(24).toString('hex');
      proxy=await network.createProxy(access.host,port,key,localPort,sessionToken);
      browserUrl=`http://127.0.0.1:${localPort}${info.browserPath}?token=${sessionToken}`;
    }
    if(key){const sharePort=await freePort(access.host,8181,8280);shareProxy=await sharing.createShareProxy(access.host,port,key,sharePort);}
    const modelId=model.engine==='strata'?model.modelName:core.apiModelId;
    const context=model.engine==='strata'?(model.context||Number(settings.context)):Number(settings.context);
    // PolyStrata não aceita --parallel: vale o número de sessões da configuração dele.
    const effectiveParallel=command.parallel??(model.engine==='strata'?model.parallel||1:parallel);
    active={engine:model.engine,engineLabel:info.label,containerName,sharingEndpoint:shareProxy?.endpoint||null,context,modelId,host:access.host,scope:access.scope,port,parallel:effectiveParallel,executable:containerName?null:command.file,firewallProgram:containerName?null:(command.firewallProgram===undefined?command.file:command.firewallProgram),browserUrl,endpoint:`http://${access.host}:${port}/v1`,remoteUrl:`http://${access.host}:${port}${info.browserPath}`};
    if(options.openBrowser!==false)await shell.openExternal(browserUrl);
    return active;
  }catch(e){log(`
[launcher] Falha ao iniciar ${info.label}: ${e.message}
`);shareProxy?.close();shareProxy=null;proxy?.close();proxy=null;cleanupServer(null);stopContainer(containerName);try{child.kill();}catch{}throw e;}
});
function stopContainer(name: string | null=serverContainer) {
  if(!name)return;
  try{const command=engines.stopCommand({containerName:name});spawn(command.file,command.args,{windowsHide:true,stdio:'ignore'}).on('error',()=>{});}catch{}
}
ipcMain.handle('stop',e=>{validateSender(e);shareProxy?.close();shareProxy=null;proxy?.close();proxy=null;stopContainer();server?.kill();return true;});
ipcMain.handle('start-chat',(e,modelPath,settings)=>{
  validateSender(e);
  if(server||conversation)throw Error('Pare a execução atual antes de iniciar outra.');
  if(tuneAbort)throw Error('Aguarde o fim do teste de desempenho.');
  const model=selectedModel(modelPath);requireLlama(model,'A conversa integrada');core.validateSettings(settings);
  const session=cli.createSession({engineDir:configuration.engineDir,model,settings,
    onOutput:data=>send('chat-output',data),
    onExit:result=>{if(conversation===session){conversation=null;send('chat-stopped',result);}},
    onError:error=>send('chat-output',{stream:'stderr',text:`\n${error.message}\n`})});
  conversation=session;configuration.profiles[modelPath]=settings;configuration.firstRun=false;save();return true;
});
ipcMain.handle('open-cli-terminal',async(e,modelPath,settings)=>{
  validateSender(e);
  if(server||conversation||tuneAbort)throw Error('Pare o servidor, a conversa ou o teste antes de abrir o terminal.');
  const model=selectedModel(modelPath);requireLlama(model,'A CLI no terminal');core.validateSettings(settings);
  await terminalCli.openExternalCli({engineDir:configuration.engineDir,model,settings});
  configuration.profiles[modelPath]=settings;configuration.firstRun=false;save();
  return true;
});
ipcMain.handle('send-chat',(e,value)=>{validateSender(e);if(!conversation)throw Error('Inicie uma conversa no terminal primeiro.');return conversation.send(value);});
ipcMain.handle('stop-chat',e=>{validateSender(e);conversation?.stop();return true;});
ipcMain.handle('get-key',e=>{validateSender(e);return network.ensureKey(apiKeyPath());});
ipcMain.handle('copy-key',e=>{validateSender(e);clipboard.writeText(network.ensureKey(apiKeyPath()));return true;});
ipcMain.handle('rotate-key',e=>{validateSender(e);if(server)throw Error('Pare o servidor antes de gerar outra chave.');return network.rotateKey(apiKeyPath());});
ipcMain.handle('copy-endpoint',e=>{validateSender(e);if(!active)throw Error('Inicie o servidor primeiro.');clipboard.writeText(active.endpoint);return active.endpoint;});
ipcMain.handle('copy-opencode-command',async(e,platform)=>{validateSender(e);if(!active)throw Error('Inicie o servidor primeiro.');const command=clientCommands.openCodeCommand(active,platform);await clipboard.writeText(command);return true;});
ipcMain.handle('copy-client-setup',async(e,application,format,shared)=>{
 validateSender(e);if(!active)throw Error('Inicie o servidor primeiro.');
 if(typeof shared!=='boolean'||!['bash','powershell','config'].includes(format))throw Error('Formato inválido.');
 if(shared&&!shareProxy)throw Error('Inicie o servidor em LAN ou Tailscale para compartilhar.');
 const connection=shared?{...active,endpoint:shareProxy.endpoint}:active;
 const key=shared?shareProxy.accessKey():null;
 const output=format==='config'?clientCommands.clientConfiguration(connection,application,key):clientCommands.clientCommand(connection,application,format,key);
 await clipboard.writeText(output);return true;
});
ipcMain.handle('copy-shared-link',async(e)=>{validateSender(e);if(!shareProxy)throw Error('Inicie o servidor em LAN ou Tailscale.');await clipboard.writeText(shareProxy.link());return true;});
ipcMain.handle('revoke-shared-access',e=>{validateSender(e);if(!shareProxy)throw Error('Nenhum acesso compartilhado ativo.');shareProxy.revoke();return true;});
ipcMain.handle('copy-shared-command',async(e,platform)=>{validateSender(e);if(!shareProxy||!active)throw Error('Inicie o servidor em LAN ou Tailscale.');const command=clientCommands.openCodeCommand({...active,endpoint:shareProxy.endpoint},platform,shareProxy.accessKey());await clipboard.writeText(command);return true;});
ipcMain.handle('copy-browser-link',e=>{validateSender(e);if(!active)throw Error('Inicie o servidor primeiro.');clipboard.writeText(active.remoteUrl);return active.remoteUrl;});
ipcMain.handle('create-firewall-rule',async(e,remoteAddress)=>{
  validateSender(e);
  if(process.platform!=='win32'||!active||active.scope==='Local')throw Error('Inicie um servidor LAN ou Tailscale no Windows primeiro.');
  if(active.containerName)throw Error('O vLLM no Docker escuta pelo Docker Desktop; libere a porta pelo firewall do Windows manualmente, apenas para a faixa de clientes necessária.');
  if(!active.firewallProgram)throw Error(`Não foi possível localizar o Python base do ${active.engineLabel} (pyvenv.cfg). Libere a porta ${active.port} manualmente no firewall do Windows, apenas para a faixa de clientes necessária.`);
  const range=firewall.validateRemoteAddress(remoteAddress);
  if(network.scopeOf(range.split('/')[0])!==active.scope||!addressInRange(active.host,range))throw Error('A faixa de clientes precisa conter o endereço da rede selecionada.');
  const rules=[{program:active.firewallProgram,port:active.port,remoteAddress:range}];if(shareProxy)rules.push({program:process.execPath,port:shareProxy.port,remoteAddress:range,sharing:true} as any);return firewall.createRules(rules);
});
ipcMain.handle('open-hf',async(e,kind)=>{validateSender(e);const url=guidance.links[kind];if(!url)throw Error('Filtro inválido.');await shell.openExternal(url);return url;});
ipcMain.handle('open-model-example',async(e,url)=>{validateSender(e);if(typeof url!=='string'||!/^https:\/\/huggingface\.co\/Qwen\/Qwen2\.5-(?:0\.5|1\.5|3|7|14)B-Instruct-GGUF$/.test(url))throw Error('Link de modelo inválido.');await shell.openExternal(url);return url;});
ipcMain.handle('open-model-dir',async(e,index)=>{validateSender(e);const dir=configuration.modelDirs[index];if(!dir)throw Error('Localização vazia.');fs.mkdirSync(dir,{recursive:true});await shell.openPath(dir);return true;});
ipcMain.handle('open-manual',async(e,language,doc='MANUAL')=>{validateSender(e);if(!['pt-BR','en'].includes(language))throw Error('Idioma inválido.');if(!['MANUAL','INTEGRATION','DIAGNOSTICS'].includes(doc))throw Error('Documento inválido.');const resourcesPath=(process as NodeJS.Process & {resourcesPath: string}).resourcesPath;const base=app.isPackaged?path.join(resourcesPath,'docs'):path.join(app.getAppPath(),'docs');const error=await shell.openPath(path.join(base,`${doc}-${language}.pdf`));if(error)throw Error(error);return true;});
async function diagnosticData() {
  const s=state(),selected=s.models.find((m: any)=>m.path===configuration.selectedModelPath);
  let apiKey: string|null=null;
  try{if(fs.existsSync(apiKeyPath()))apiKey=fs.readFileSync(apiKeyPath(),'utf8').trim();}catch{}
  const byEngine: Record<string,number>={};for(const m of s.models)byEngine[m.engine]=(byEngine[m.engine]||0)+1;
  return {
    generatedAt:new Date().toISOString(),
    app:{version:app.getVersion(),packaged:app.isPackaged,electron:process.versions.electron,node:process.versions.node},
    system:{platform:process.platform,arch:process.arch,release:os.release(),version:typeof os.version==='function'?os.version():''},
    hardware:s.hardware,gpu:await gpuDetails(),
    engines:s.engines,
    llama:{backend:configuration.engineBackend||'',release:configuration.engineVersion||'',pinned:engine.ENGINE_TAG},
    docker:engines.vllmMode()==='docker'?docker:null,
    paths:{userData:app.getPath('userData'),modelDirs:configuration.modelDirs.map((dir: string)=>({path:dir,exists:!!dir&&fs.existsSync(dir)})),apiKeySaved:!!apiKey},
    models:{total:s.models.length,byEngine,selected:selected?{name:selected.name,engine:selected.engine,size:selected.size,path:selected.path,profile:configuration.profiles[selected.path]||null}:null},
    access:{host:configuration.accessHost,scope:network.scopeOf(configuration.accessHost),parallel:configuration.parallel},
    run:{server:!!server,chat:!!conversation,benchmark:!!tuneAbort,engineBusy,active:active?{engineLabel:active.engineLabel,scope:active.scope,host:active.host,port:active.port,modelId:active.modelId,context:active.context,parallel:active.parallel,sharing:!!active.sharingEndpoint,container:active.containerName}:null},
    update:{enabled:configuration.updateCheck!==false,lastCheck:configuration.lastUpdateCheck?new Date(configuration.lastUpdateCheck).toISOString():null,checked:!!updateInfo,available:!!updateInfo?.available,version:updateInfo?.version||null},
    log:engineLog.text(),
    secrets:[apiKey,shareProxy?.accessKey?.()||null],
    home:app.getPath('home')
  };
}
ipcMain.handle('copy-diagnostic-report',async e=>{validateSender(e);const report=diagnostics.buildReport(await diagnosticData());clipboard.writeText(report);return report;});
