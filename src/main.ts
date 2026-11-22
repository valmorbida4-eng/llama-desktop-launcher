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
const engineBuild=require('./engine_build');
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
const params=require('./params');
const modelInfo=require('./model_info');
const decisions=require('./decider');
const control=require('./control_api');
const review=require('./reviewer');
const {createPlanner}=require('./admission');
const {createStarts,untilAborted}=require('./starts');
// API local de controle (DevTools): desligada por padrão; liga pelas Configurações ou por DEVTOOLS_LAUNCHER_TOKEN.
let controlServer: any=null,controlError: string | null=null;
// Decisor: segundo llama-server, independente do principal, para modelos de decisão (/v1/systemone).
let deciderProcess: any=null,deciderActive: any=null;
const deciderLog=diagnostics.createLogBuffer();
// Revisor: segundo modelo que gera texto, sempre em loopback.
let reviewerProcess: any=null,reviewerActive: any=null;
const reviewerLog=diagnostics.createLogBuffer();
// Papéis com início pendente (checagem de memória, fila ou carga): chat, decider, reviewer e conversation.
const starts=createStarts(()=>send('control-changed',null));
const planner=createPlanner({engineDir:()=>configuration.engineDir});
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
function load() {configPath=path.join(app.getPath('userData'),'settings.json');try {configuration={...defaultConfig(),...JSON.parse(fs.readFileSync(configPath,'utf8'))};}catch{configuration=defaultConfig();save();}migrateProfiles();}
// Perfis anteriores à v0.9.0 ganham version 2 sem mudar os valores salvos (ver params.migrateProfile).
function migrateProfiles() {
  let changed=false;const profiles=configuration.profiles&&typeof configuration.profiles==='object'?configuration.profiles:{};
  for(const [key,profile] of Object.entries(profiles)){const next=params.migrateProfile(profile);if(next!==profile){profiles[key]=next;changed=true;}}
  configuration.profiles=profiles;if(changed)save();
}
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
    return {...info,ready:info.supported&&engineReady(info.id),detail,version:info.id==='vllm'?engines.VLLM_VERSION:info.id==='llamacpp'?(engineBuild.describeBuild(currentBuild(),engine.ENGINE_TAG)||configuration.engineVersion||engine.ENGINE_TAG):null,build:info.id==='llamacpp'?currentBuild():null};
  });
}
function allModels() {
  const supported=new Set(engines.engineCatalog().filter((e: any)=>e.supported).map((e: any)=>e.id));
  // Uma única varredura das pastas para GGUF e pastas Hugging Face.
  const found=core.walkModels(configuration.modelDirs,{hf:supported.has('vllm')});
  // Modelos de decisão (metadados <arquitetura>.decision.*) só rodam no decisor, não no servidor principal.
  const gguf=found.gguf.map((m: any)=>{const model={...m,engine:'llamacpp'};const info=modelInfo.modelInfo(model);return {...model,decision:info&&!info.error?info.decision||null:null};}),hf=found.hf;
  const strata=supported.has('strata')&&configuration.strataDir?engines.scanStrataConfigs(configuration.strataDir):[];
  return [...gguf,...hf,...strata];
}
async function refreshDocker() {if(engines.vllmMode()!=='docker')return docker;docker=await engines.dockerStatus();return docker;}
function requireLlama(model: any,action: string) {if(model.engine!=='llamacpp')throw Error(`${action} está disponível só para modelos GGUF no llama.cpp.`);}
function requireGenerative(model: any) {if(model.decision)throw Error('Este é um modelo de decisão: ele não gera texto. Inicie-o no card Decisor da tela Llama.');}
function modelsLoaded() {return !!(server||conversation||deciderProcess||reviewerProcess);}
function anythingRunning() {return modelsLoaded()||starts.any();}
function serverBusy() {return !!server||starts.has('chat');}
function chatBusy() {return !!conversation||starts.has('conversation');}
function deciderBusy() {return !!deciderProcess||starts.has('decider');}
function reviewerBusy() {return !!reviewerProcess||starts.has('reviewer');}
function reviewerState() {return {running:reviewerBusy(),active:reviewerActive,config:{...review.DEFAULTS,...(configuration.reviewer||{})}};}
function deciderState() {return {running:deciderBusy(),active:deciderActive,config:{...decisions.DEFAULTS,...(configuration.decider||{})},models:decisions.MODELS,cpuMaxBytes:decisions.CPU_MAX_BYTES};}
function state() {return {appVersion:app.getVersion(),controlApi:controlApiState(),config:configuration,models:allModels(),engines:engineStatus(),hardware:core.detectHardware(),platform:process.platform,backendOptions:engine.backendOptions(),engineReady:llamaReady(),running:serverBusy(),chatRunning:chatBusy(),chatReady:!!conversation,accessOptions:network.accessOptions(),active,update:updateInfo,decider:deciderState(),reviewer:reviewerState()};}
function freePort(host: string='127.0.0.1',first=0,last=0): Promise<number> {return new Promise<number>((resolve,reject)=>{let port=first;const tryNext=()=>{const s=net.createServer();s.once('error',e=>{if(e.code==='EADDRINUSE'&&port<last){port++;tryNext();}else reject(e);});s.listen(port,host,()=>{const found=s.address().port;s.close(()=>resolve(found));});};tryNext();});}
// 8081–8089 são do revisor e 8090–8098 do decisor: com a 8080 ocupada, o principal vai para 8100–8180.
async function mainPort(host: string) {
  try{return await freePort(host,8080,8080);}catch(error){if(error.code!=='EADDRINUSE')throw error;}
  return freePort(host,8100,8180);
}
// Um processo morto por sinal fica com exitCode null.
function hasExited(child: any) {return child.exitCode!==null||!!child.signalCode;}
function waitExit(child: any,ms=15000): Promise<void> {
  return new Promise<void>(resolve=>{if(!child||hasExited(child)){resolve();return;}const timer=setTimeout(resolve,ms);child.once('exit',()=>{clearTimeout(timer);resolve();});});
}
function waitReady(host: string,port: number,child: any,key: string | null,limitSeconds=300): Promise<void> {return new Promise<void>((resolve,reject)=>{let count=0,done=false;const finish=(error?: Error)=>{if(done)return;done=true;clearInterval(timer);error?reject(error):resolve();};child.once('error',(e: Error)=>finish(e));const timer=setInterval(()=>{if(hasExited(child)){finish(Error('O motor encerrou antes de ficar pronto.'));return;}http.get({hostname:host,port,path:'/health',headers:key?{Authorization:`Bearer ${key}`}:{},timeout:3000},r=>{r.resume();if(r.statusCode===200)finish();}).on('error',()=>{});if(++count>limitSeconds)finish(Error('Tempo esgotado ao carregar o modelo.'));},1000);});}
// Checagem de memória antes de iniciar: só "não cabe" impede; sem medição o launcher avisa e segue.
async function admit(signal: AbortSignal,check: (measured: any) => Promise<any>) {
  const measured=await untilAborted(planner.snapshot(),signal);
  const admitted=await check(measured);
  signal.throwIfAborted();
  if(admitted.result.level==='no')throw Object.assign(Error(`${admitted.result.text}. Escolha outro dispositivo, um modelo ou contexto menor, ou pare outro modelo.`),{code:'insufficient_resources'});
  return admitted;
}
// Sozinho, o principal inicia como sempre (o -fit ajusta). A conta só entra com outro modelo do launcher carregado.
async function admitMain(model: any,settings: any,signal: AbortSignal) {
  return modelsLoaded()?admit(signal,measured=>planner.main(model,settings,measured,signal)):{settings,result:null};
}
function memoryLine(result: any) {return result?`[launcher] Memória · ${result.text}\n`:'';}
function apiKeyPath(){return path.join(app.getPath('userData'),'server-api-key.txt');}
function addressInRange(address: string,range: string){const [networkAddress,prefixText]=range.split('/');const prefix=prefixText===undefined?32:Number(prefixText);const toInt=(value: string)=>value.split('.').reduce((number,octet)=>(number*256+Number(octet))>>>0,0);const mask=prefix===0?0:(0xffffffff<<(32-prefix))>>>0;return (toInt(address)&mask)===(toInt(networkAddress)&mask);}
function selectedModel(modelPath) {const model=allModels().find(m=>m.path===modelPath);if(!model) throw Error('Modelo não encontrado nas pastas configuradas.');return model;}
function availableModelDiskBytes() {for(const configured of configuration.modelDirs){if(!configured)continue;let dir=configured;while(!fs.existsSync(dir)){const parent=path.dirname(dir);if(parent===dir)break;dir=parent;}try{const stat=fs.statfsSync(dir);return Number(stat.bavail)*Number(stat.bsize);}catch{}}return null;}
let devicesProbe: {dir: string; promise: Promise<any>} | null=null,nvidiaProbe: Promise<any[]> | null=null;
const fitCache=new Map<string, any>();
function llamaDevices() {
  if(!llamaReady())return Promise.resolve(null);
  if(devicesProbe?.dir!==configuration.engineDir)devicesProbe={dir:configuration.engineDir,promise:benchmark.listDevices(configuration.engineDir).catch(()=>null)};
  return devicesProbe.promise;
}
function nvidiaGpus() {nvidiaProbe ||= hardware.detectNvidiaGpus().catch(()=>[]);return nvidiaProbe;}
// Build do llama-server da pasta do motor (oficial, Avalon, tandem.cpp), lido com --version e --help.
function currentBuild() {const b=configuration.engineBuild;return b&&b.dir===configuration.engineDir?b:null;}
let buildProbe: Promise<any> | null=null;
function refreshBuild(force=false) {
  const dir=configuration.engineDir;
  if(!dir||(!force&&currentBuild()?.build&&currentBuild().reasoning!==undefined)) return Promise.resolve(currentBuild());
  buildProbe=engineBuild.probeBuild(dir).then((b: any)=>{if(b&&configuration.engineDir===dir){configuration.engineBuild={...b,dir};save();send('engines-changed',null);}return currentBuild();}).catch(()=>null);
  return buildProbe;
}
function draftModelsFor(model: any) {return allModels().filter((m: any)=>m.engine==='llamacpp'&&m.path!==model.path&&(!model.size||m.size<model.size)).map((m: any)=>({path:m.path,name:m.name}));}
async function paramContext(model: any,settings: any={}) {
  const info=modelInfo.modelInfo(model,{strataDir:configuration.strataDir});
  const base: any={engine:model.engine||'llamacpp',info,settings,parallel:Number(configuration.parallel)||1,hw:core.detectHardware()};
  if(base.engine==='llamacpp'){base.reasoning=currentBuild()?.reasoning;base.devices=await llamaDevices();base.draftModels=draftModelsFor(model);}
  if(base.engine==='vllm'){const gpus=await nvidiaGpus();base.gpuCount=gpus.length||null;}
  if(base.engine==='strata'){base.distribution=model.distribution;base.strataOptions=info?.server?.options||[];}
  return base;
}
// Valida os ajustes contra o motor, o modelo e o hardware antes de salvar ou iniciar.
async function checkSettings(model: any,settings: any) {
  const ctx=await paramContext(model,settings);
  core.validateSettings(settings,ctx.engine,ctx);
  return ctx;
}
function fitKey(model: any,settings: any) {return model.path+'|'+params.llamaArgs(settings,'fit').join(' ');}
async function gpuDetails(){gpuProbe ||= hardware.detectGpu().catch(()=>({name:null,memoryBytes:null,source:null}));return gpuProbe;}
async function modelGuidance(model=null,settings=null){return guidance.buildGuidance({hardware:core.detectHardware(),gpu:await gpuDetails(),availableDiskBytes:availableModelDiskBytes(),model,settings});}
function createWindow() {
  // Sem o menu nativo (Arquivo/Editar/Exibir...): todas as funções estão na própria tela.
  win=new BrowserWindow({width:1100,height:850,minWidth:860,minHeight:650,autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  win.removeMenu();
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
      if(anythingRunning()){const answer=await dialog.showMessageBox(win,{type:'question',buttons:['Encerrar e atualizar','Cancelar'],defaultId:0,cancelId:1,message:'Os modelos em execução (servidor, conversa, revisor e decisor) serão encerrados para instalar a atualização.'});if(answer.response!==0)return {action:'cancelled',file};}
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
// Uma instância só: abrir pelo atalho com o launcher aberto traz a janela existente (e a API de controle dela).
const singleInstance=app.requestSingleInstanceLock();
if(!singleInstance)app.quit();
else app.on('second-instance',()=>{if(win&&!win.isDestroyed()){if(win.isMinimized())win.restore();win.focus();}});
app.whenReady().then(()=>{if(!singleInstance)return;load();createWindow();refreshControlApi().catch(()=>{});refreshBuild().catch(()=>{});refreshDocker().then(()=>send('engines-changed',null)).catch(()=>{});app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)createWindow();});});
app.on('window-all-closed',()=>{if(process.platform!=='darwin') app.quit();});
app.on('before-quit',()=>{starts.cancelAll();reviewerProcess?.kill();controlServer?.close();controlServer=null;tuneAbort?.abort();shareProxy?.close();shareProxy=null;proxy?.close();conversation?.stop();stopContainer();if(server)server.kill();if(deciderProcess)deciderProcess.kill();});

ipcMain.handle('state',e=>{validateSender(e);return state();});
ipcMain.handle('check-update',e=>{validateSender(e);return checkUpdates();});
ipcMain.handle('install-update',e=>{validateSender(e);return installUpdate();});
ipcMain.handle('set-update-check',(e,enabled)=>{validateSender(e);if(typeof enabled!=='boolean')throw Error('Valor inválido.');configuration.updateCheck=enabled;save();return state();});
ipcMain.handle('select-model',(e,modelPath)=>{validateSender(e);selectedModel(modelPath);configuration.selectedModelPath=modelPath;save();return state();});
ipcMain.handle('complete-setup',e=>{validateSender(e);configuration.firstRun=false;save();return state();});
ipcMain.handle('choose-dir',async(e,kind,index)=>{validateSender(e);if(kind==='engine'&&(anythingRunning()||tuneAbort))throw Error('Pare a execução atual antes de trocar o motor.');if(!['engine','models','strata','vllm'].includes(kind))throw Error('Tipo de pasta inválido.');if((kind==='strata'||kind==='vllm')&&(serverBusy()||engineBusy))throw Error('Pare o servidor antes de trocar o motor.');if(kind==='vllm'&&engines.vllmMode()!=='venv')throw Error('No Windows o vLLM roda pelo Docker Desktop; não há pasta para escolher.');if(kind==='strata'&&!engines.engineInfo('strata').supported)throw Error(engines.engineInfo('strata').unsupportedReason);const titles={engine:'Pasta dos binários llama.cpp',models:'Pasta de modelos (GGUF ou Hugging Face)',strata:'Pasta do Strata ou do PolyStrata',vllm:'Ambiente Python com vLLM (contém bin/vllm)'};const result=await dialog.showOpenDialog(win,{properties:['openDirectory','createDirectory'],title:titles[kind]});if(result.canceled)return state();const dir=result.filePaths[0];const installRoot=app.isPackaged?path.dirname(process.execPath):null;if(installRoot&&core.isWithin(installRoot,dir))throw Error('Escolha uma pasta fora da instalação do aplicativo; ela será removida na desinstalação.');if(kind==='engine'){const executable=path.join(dir,process.platform==='win32'?'llama-server.exe':'llama-server');if(!fs.existsSync(executable))throw Error('A pasta precisa conter llama-server.');configuration.engineDir=dir;configuration.engineBackend='external';configuration.engineVersion='';refreshBuild(true);devicesProbe=null;fitCache.clear();}else if(kind==='strata'){if(!engines.detectStrata(dir))throw Error('A pasta precisa ser uma instalação do Strata ou do PolyStrata já configurada (serve/server.py e .venv). Rode o instalador deles primeiro.');configuration.strataDir=dir;}else if(kind==='vllm'){if(!engines.vllmVenvReady(dir))throw Error('A pasta precisa conter bin/vllm.');configuration.vllmDir=dir;}else {if(index!==0&&index!==1)throw Error('Local de modelos inválido.');if(core.isWithin(app.getPath('userData'),dir))throw Error('Escolha uma pasta de modelos fora dos dados internos do aplicativo.');configuration.modelDirs[index]=dir;}save();return state();});
ipcMain.handle('clear-dir',(e,index)=>{validateSender(e);if(index!==1)throw Error('A primeira localização é obrigatória.');configuration.modelDirs[1]='';save();return state();});
ipcMain.handle('install-engine',async(e,backend)=>{validateSender(e);if(anythingRunning()||tuneAbort)throw Error('Pare a execução atual antes de trocar o motor.');if(!engine.backendOptions().some(item=>item.id===backend))throw Error('Backend inválido para este sistema.');const dir=path.join(app.getPath('userData'),'engines',Date.now().toString());let result;try{result=await engine.installEngine(dir,backend,(percent,label)=>send('progress',{percent,label}));}catch(error){log(`
[launcher] Falha ao instalar o llama.cpp (${backend}): ${error.message}
`);throw error;}configuration.engineDir=result.path;configuration.engineVersion=result.release;configuration.engineBackend=result.backend;save();await refreshBuild(true);return state();});
ipcMain.handle('refresh-engines',async e=>{validateSender(e);await refreshDocker();return state();});
ipcMain.handle('install-vllm',async e=>{
  validateSender(e);
  if(serverBusy()||engineBusy)throw Error('Pare o servidor antes de preparar o vLLM.');
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
ipcMain.handle('engine-recipe',async(e,modelPath)=>{validateSender(e);const model=selectedModel(modelPath);if(model.engine!=='llamacpp')return null;return engineBuild.recipeFor(currentBuild()||await refreshBuild(),model,draftModelsFor(model));});
ipcMain.handle('open-engine-link',async(e,kind)=>{validateSender(e);const url=Object.hasOwn(engineBuild.links,kind)?engineBuild.links[kind]:Object.hasOwn(engines.links,kind)?engines.links[kind]:Object.hasOwn(guidance.engineLinks,kind)?guidance.engineLinks[kind]:Object.hasOwn(decisions.links,kind)?decisions.links[kind]:null;if(!url)throw Error('Link inválido.');await shell.openExternal(url);return url;});
ipcMain.handle('save-profile',async(e,modelPath,settings)=>{validateSender(e);const model=selectedModel(modelPath);await checkSettings(model,settings);configuration.profiles[modelPath]={...settings,version:params.PROFILE_VERSION};save();return state();});
ipcMain.handle('parameter-schema',async(e,modelPath,settings)=>{validateSender(e);const model=selectedModel(modelPath);const ctx=await paramContext(model,settings||{});
  const fit=ctx.engine==='llamacpp'?fitCache.get(fitKey(model,settings||{}))||null:null;return params.schemaFor(ctx,fit);});
ipcMain.handle('fit-values',async(e,modelPath,settings)=>{validateSender(e);const model=selectedModel(modelPath);requireLlama(model,'O cálculo dos valores automáticos');
  if(tuneAbort)throw Error('Aguarde o fim do teste de desempenho.');if(!llamaReady())throw Error('Instale o llama.cpp primeiro.');
  const ctx=await checkSettings(model,settings);const fit=await benchmark.fitParams(configuration.engineDir,model,settings,{info:ctx.info});
  fitCache.set(fitKey(model,settings),fit);if(fitCache.size>50)fitCache.delete(fitCache.keys().next().value);return params.schemaFor(ctx,fit);});
ipcMain.handle('cancel-tune',e=>{validateSender(e);tuneAbort?.abort();return true;});
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
  for(const profile of parsed.profiles){const current=byPath.get(normalize(profile.path));if(!current){missing++;continue;}if(configuration.profiles[current]){existing++;continue;}configuration.profiles[current]=params.migrateProfile(profile.settings);imported++;}
  if(imported)save();return {imported,missing,existing,invalid:parsed.ignored.length};
});
ipcMain.handle('recommend',async(e,modelPath)=>{validateSender(e);const model=selectedModel(modelPath);
  const info=modelInfo.modelInfo(model,{strataDir:configuration.strataDir});
  if(model.engine==='vllm')return core.recommendVllm(model,info,await nvidiaGpus());
  requireLlama(model,'A sugestão de ajustes');const gpu=await gpuDetails();return core.recommend(model,{...core.detectHardware(),gpuMemoryBytes:gpu.memoryBytes},info);});
ipcMain.handle('model-guidance',e=>{validateSender(e);return modelGuidance();});
ipcMain.handle('copy-guidance-prompt',async(e)=>{validateSender(e);const result=await modelGuidance();clipboard.writeText(result.prompt);return result.prompt;});
ipcMain.handle('analyze-with-model',async(e,modelPath,settings)=>{
  validateSender(e);
  if(serverBusy()||chatBusy()||tuneAbort)throw Error('Pare o servidor, a conversa ou o teste antes da análise.');
  const model=selectedModel(modelPath);requireLlama(model,'A análise pelo modelo');requireGenerative(model);
  const {prompt,session}=await starts.run('conversation',async(signal: AbortSignal)=>{
    await checkSettings(model,settings);
    const guide=await modelGuidance(model,settings),admitted=await admitMain(model,settings,signal);
    signal.throwIfAborted();
    return {prompt:guide.prompt,session:openConversation(model,admitted)};
  });
  try{await session.send(prompt);}catch(error){session.stop();conversation=null;throw error;}
  configuration.profiles[modelPath]={...settings,version:params.PROFILE_VERSION};configuration.firstRun=false;save();
  return {prompt};
});
ipcMain.handle('tune',async(e,modelPath,settings,options: {budgetMinutes?: number; priority?: string}={})=>{
  validateSender(e);
  // O teste procura o teto da máquina: qualquer modelo ao lado falsearia os números e pode derrubar os dois.
  const requireIdle=()=>{if(anythingRunning()||engineBusy)throw Error('Pare o servidor, a conversa, o revisor e o decisor antes do teste.');if(tuneAbort)throw Error('Já existe um teste em execução.');};
  requireIdle();
  const model=selectedModel(modelPath);requireGenerative(model);
  if(model.engine==='strata')throw Error('O Strata e o PolyStrata não têm autotuning: quantização, contexto e GPU vêm da configuração do instalador deles.');
  const ctx=await checkSettings(model,settings);requireIdle();
  const budgetMinutes=Number(options?.budgetMinutes)||10,priority=String(options?.priority||'generation');
  const controller=new AbortController();tuneAbort=controller;
  const progress=(text: string)=>send('tune-progress',text);
  try{
    if(model.engine==='vllm'){
      if(engines.engineInfo('vllm').mode==='docker'&&!docker.image)await refreshDocker();
      if(!engineReady('vllm'))throw Error('Prepare o vLLM em Configurações primeiro.');
      const probe=async(candidate: any,timeoutMs: number)=>{
        const port=await freePort('127.0.0.1',8300,8400);
        const command=engines.serverCommand(model,candidate,{host:'127.0.0.1',port,parallel:1,key:null,vllmDir:configuration.vllmDir,strataDir:configuration.strataDir,
          containerName:engines.VLLM_CONTAINER_PREFIX+crypto.randomBytes(6).toString('hex')});
        return benchmark.probeServer({command,port,timeoutMs,signal:controller.signal,measure:(p: number)=>benchmark.measureOpenAi(p,controller.signal),stop:()=>stopContainer(command.containerName||null)});
      };
      return await benchmark.tuneVllm(model,settings,{probe,info:ctx.info,gpuCount:ctx.gpuCount,budgetMinutes,priority,onProgress:progress,signal:controller.signal});
    }
    if(!llamaReady())throw Error('Instale o motor primeiro.');
    return await benchmark.tune(configuration.engineDir,model,settings,progress,controller.signal,{budgetMinutes,priority,info:ctx.info,devices:ctx.devices,hw:ctx.hw});
  }finally{tuneAbort=null;}
});
ipcMain.handle('launch',async(e,modelPath,settings,options: {host?: string; parallel?: number; openBrowser?: boolean}={})=>{validateSender(e);return startServer(modelPath,settings,options);});
// persist:false (API de controle) não grava perfil, endereço nem sessões escolhidos na tela.
async function startServer(modelPath: string,settings: any,options: {host?: string; parallel?: number; openBrowser?: boolean; persist?: boolean}={}) {
  if(!(server&&active)) {
    if(serverBusy()||chatBusy()||tuneAbort||engineBusy)throw Error('Pare a execução atual antes de iniciar outra.');
    const model=selectedModel(modelPath);requireGenerative(model);
    await starts.run('chat',(signal: AbortSignal)=>launchMain(model,settings,options,signal));
  }
  const started=active;
  if(!started)throw Error('O servidor parou logo depois de iniciar.');
  if(options.openBrowser!==false)await shell.openExternal(started.browserUrl);
  return started;
}
async function launchMain(model: any,settings: any,options: {host?: string; parallel?: number; persist?: boolean},signal: AbortSignal) {
  const modelPath=model.path;
  await checkSettings(model,settings);
  const info=engines.engineInfo(model.engine);
  if(!info.supported)throw Error(info.unsupportedReason);
  const access=network.accessOptions().find(item=>item.host===options.host);
  if(!access)throw Error('Escolha um endereço de rede disponível.');
  const parallel=network.validateParallel(options.parallel);
  if(model.engine==='vllm'&&info.mode==='docker'&&!docker.image)await refreshDocker();
  if(!engineReady(model.engine))throw Error(model.engine==='llamacpp'?'Instale ou selecione o llama.cpp primeiro.':model.engine==='vllm'?'Prepare o vLLM em Configurações primeiro.':'Escolha a pasta do Strata ou do PolyStrata em Configurações primeiro.');
  const admitted=await admitMain(model,settings,signal);
  const key=access.scope==='Local'?null:network.ensureKey(apiKeyPath());
  const port=await mainPort(access.host);
  signal.throwIfAborted();
  if(options.persist!==false){configuration.profiles[modelPath]={...settings,version:params.PROFILE_VERSION};configuration.firstRun=false;configuration.accessHost=access.host;configuration.parallel=parallel;save();}
  let command: any;
  if(model.engine==='llamacpp') {
    const executable=path.join(configuration.engineDir,process.platform==='win32'?'llama-server.exe':'llama-server');
    command={file:executable,args:core.argsForModel(model,admitted.settings,'server',port,{host:access.host,parallel,keyPath:key?apiKeyPath():null}),env:params.llamaEnv(admitted.settings),cwd:configuration.engineDir};
  } else {
    command=engines.serverCommand(model,settings,{host:access.host,port,parallel,key,vllmDir:configuration.vllmDir,strataDir:configuration.strataDir,
      containerName:engines.VLLM_CONTAINER_PREFIX+crypto.randomBytes(6).toString('hex')});
  }
  const child=spawn(command.file,command.args,{cwd:command.cwd,env:{...process.env,...command.env},windowsHide:true,stdio:['ignore','pipe','pipe']});server=child;
  const containerName=command.containerName||null;serverContainer=containerName;
  // Cada início começa um registro novo: o relatório não mistura a saída de execuções anteriores.
  engineLog.clear();
  log(`
[launcher] Iniciando ${info.label} · ${model.name} · ${access.scope} ${access.host}:${port} · sessões ${parallel}
${memoryLine(admitted.result)}`);
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
    // Valores em uso: registro do motor e, no llama.cpp, o /props (contexto real quando o -fit escolheu).
    const runtime=params.parseRuntimeLog(model.engine,engineLog.text());
    if(model.engine==='llamacpp'){try{const props=await new Promise<any>((resolve,reject)=>{http.get({hostname:access.host,port,path:'/props',headers:key?{Authorization:`Bearer ${key}`}:{},timeout:3000},r=>{let body='';r.on('data',d=>body+=d);r.on('end',()=>{try{resolve(JSON.parse(body));}catch(err){reject(err);}});}).on('error',reject);});
      const n=props?.default_generation_settings?.n_ctx;if(Number.isSafeInteger(n))runtime.context=String(n);if(Number.isSafeInteger(props?.total_slots))runtime.slots=String(props.total_slots);}catch{}}
    const context=model.engine==='strata'?(model.context||Number(settings.context)||null):Number(runtime.context||settings.context)||null;
    // PolyStrata não aceita --parallel: vale o número de sessões da configuração dele.
    const effectiveParallel=command.parallel??(model.engine==='strata'?model.parallel||1:parallel);
    if(signal.aborted||server!==child)throw Error('O motor encerrou antes de ficar pronto.');
    active={modelPath,resources:admitted.result,engine:model.engine,engineLabel:info.label,containerName,sharingEndpoint:shareProxy?.endpoint||null,context,modelId,host:access.host,scope:access.scope,port,parallel:effectiveParallel,runtime,executable:containerName?null:command.file,firewallProgram:containerName?null:(command.firewallProgram===undefined?command.file:command.firewallProgram),browserUrl,endpoint:`http://${access.host}:${port}/v1`,remoteUrl:`http://${access.host}:${port}${info.browserPath}`};
  }catch(e){log(`
[launcher] Falha ao iniciar ${info.label}: ${e.message}
`);shareProxy?.close();shareProxy=null;proxy?.close();proxy=null;cleanupServer(null);stopContainer(containerName);try{child.kill();}catch{}await waitExit(child);throw e;}
}
function stopContainer(name: string | null=serverContainer) {
  if(!name)return;
  try{const command=engines.stopCommand({containerName:name});spawn(command.file,command.args,{windowsHide:true,stdio:'ignore'}).on('error',()=>{});}catch{}
}
function stopServer(): Promise<void> {const pending=starts.cancel('chat');shareProxy?.close();shareProxy=null;proxy?.close();proxy=null;stopContainer();server?.kill();return pending;}
ipcMain.handle('stop',e=>{validateSender(e);stopServer();return true;});
function deciderLogText(text: string) {deciderLog.append(text);send('decider-log',text);}
ipcMain.handle('decider-devices',async e=>{validateSender(e);return (await llamaDevices())||[];});
ipcMain.handle('decider-start',async(e,modelPath,options: any={})=>{validateSender(e);return startDecider(modelPath,options);});
async function startDecider(modelPath: string,options: any={},persist=true) {
  if(deciderBusy())throw Error('O decisor já está em execução.');
  if(tuneAbort)throw Error('Aguarde o fim do teste de desempenho.');
  if(!llamaReady())throw Error('Instale ou selecione o llama.cpp primeiro.');
  const model=selectedModel(modelPath);
  if(model.engine!=='llamacpp'||!model.decision)throw Error('Escolha um modelo de decisão (GGUF com metadados de decisão).');
  const opts=decisions.validateOptions(options);
  const access=network.accessOptions().find((item: any)=>item.host===opts.host);
  if(!access)throw Error('Escolha um endereço de rede disponível.');
  await starts.run('decider',(signal: AbortSignal)=>launchDecider(model,opts,access,persist,signal));
  return state();
}
async function launchDecider(model: any,opts: any,access: any,persist: boolean,signal: AbortSignal) {
  const modelPath=model.path;
  const checked=modelsLoaded()?await admit(signal,async measured=>({result:await planner.decider(model,opts,measured,signal)})):{result:null};
  const key=access.scope==='Local'?null:network.ensureKey(apiKeyPath());
  const port=await freePort(access.host,decisions.PORTS.first,decisions.PORTS.last);
  signal.throwIfAborted();
  const executable=path.join(configuration.engineDir,process.platform==='win32'?'llama-server.exe':'llama-server');
  const args=decisions.serverArgs(model,opts,port,key?apiKeyPath():null);
  if(persist){configuration.decider={modelPath,...opts};save();}
  const child=spawn(executable,args,{cwd:configuration.engineDir,env:process.env,windowsHide:true,stdio:['ignore','pipe','pipe']});deciderProcess=child;
  deciderLog.clear();deciderLogText(`[launcher] Iniciando o decisor · ${model.name} · ${access.scope} ${access.host}:${port}\n${memoryLine(checked.result)}`);
  child.stdout.on('data',(d: Buffer)=>deciderLogText(String(d).slice(-3000)));
  child.stderr.on('data',(d: Buffer)=>deciderLogText(String(d).slice(-3000)));
  const cleanup=(code: any)=>{if(deciderProcess===child){deciderProcess=null;deciderActive=null;send('decider-stopped',code);}};
  child.on('exit',cleanup);
  child.on('error',(err: Error)=>{deciderLogText(`\n[erro ao iniciar o decisor: ${err.message}]\n`);cleanup(err.message);});
  try {
    await waitReady(access.host,port,child,key,180);
    if(signal.aborted||deciderProcess!==child)throw Error('O decisor encerrou antes de ficar pronto.');
    deciderActive={modelPath,resources:checked.result,name:model.name,type:model.decision,host:access.host,scope:access.scope,port,device:opts.device,context:opts.context,
      endpoint:`http://${access.host}:${port}/v1/systemone`};
  } catch(error) {deciderLogText(`\n[launcher] Falha ao iniciar o decisor: ${error.message}\n`);try{child.kill();}catch{}cleanup(null);await waitExit(child);throw error;}
}
function stopDecider(): Promise<void> {const pending=starts.cancel('decider');deciderProcess?.kill();return pending;}
ipcMain.handle('decider-stop',e=>{validateSender(e);stopDecider();return true;});
ipcMain.handle('copy-decider-endpoint',e=>{validateSender(e);if(!deciderActive)throw Error('Inicie o decisor primeiro.');clipboard.writeText(deciderActive.endpoint);return deciderActive.endpoint;});
// Teste da tela: o renderer não acessa a rede (CSP), então o pedido sai daqui, com a chave quando na rede.
ipcMain.handle('decider-test',async(e,input)=>{
  validateSender(e);if(!deciderActive)throw Error('Inicie o decisor primeiro.');
  const body=JSON.stringify(decisions.testRequest(input||{}));
  const key=deciderActive.scope==='Local'?null:network.ensureKey(apiKeyPath());
  const started=Date.now();
  const response: any=await new Promise((resolve,reject)=>{
    const req=http.request({hostname:deciderActive.host,port:deciderActive.port,path:'/v1/systemone',method:'POST',timeout:60000,
      headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body),...(key?{Authorization:`Bearer ${key}`}:{})}},(r: any)=>{
      let text='';r.setEncoding('utf8');r.on('data',(d: string)=>{text+=d;if(text.length>1<<20)req.destroy(Error('Resposta grande demais.'));});
      r.on('end',()=>{let json: any=null;try{json=JSON.parse(text);}catch{}if(r.statusCode!==200)reject(Error(json?.error?.message||`O decisor respondeu ${r.statusCode}.`));else if(!json)reject(Error('Resposta inválida do decisor.'));else resolve(json);});});
    req.on('timeout',()=>req.destroy(Error('O decisor demorou demais para responder.')));req.on('error',reject);req.end(body);
  });
  return {...decisions.describeAnswer(response),ms:Date.now()-started};
});
function reviewerLogText(text: string) {reviewerLog.append(text);send('reviewer-log',text);}
function requireLlamaReady() {if(!llamaReady())throw Error('Instale ou selecione o llama.cpp primeiro.');}
async function startReviewer(modelPath: string,options: any={},persist=true) {
  if(reviewerBusy())throw Error('O revisor já está em execução.');
  if(tuneAbort)throw Error('Aguarde o fim do teste de desempenho.');
  requireLlamaReady();
  const model=selectedModel(modelPath);review.requireModel(model);
  const opts=review.validateOptions(options);
  await starts.run('reviewer',(signal: AbortSignal)=>launchReviewer(model,opts,persist,signal));
  return state();
}
async function launchReviewer(model: any,opts: any,persist: boolean,signal: AbortSignal) {
  const profile=configuration.profiles[model.path]||{};
  params.validateEffort(profile,await paramContext(model,profile));
  const {device,result}=await admit(signal,measured=>planner.reviewer(model,opts,profile,measured,signal));
  const port=await freePort(review.HOST,review.PORTS.first,review.PORTS.last);
  signal.throwIfAborted();
  const executable=path.join(configuration.engineDir,process.platform==='win32'?'llama-server.exe':'llama-server');
  const args=review.serverArgs(model,{...opts,device},port,profile);
  // Guarda o que foi pedido: com Automático, o dispositivo é escolhido de novo a cada início.
  if(persist){configuration.reviewer={modelPath:model.path,...opts};save();}
  const child=spawn(executable,args,{cwd:configuration.engineDir,env:process.env,windowsHide:true,stdio:['ignore','pipe','pipe']});reviewerProcess=child;
  reviewerLog.clear();reviewerLogText(`[launcher] Iniciando o revisor · ${model.name} · ${device} · ${review.HOST}:${port}\n${memoryLine(result)}`);
  child.stdout.on('data',(d: Buffer)=>reviewerLogText(String(d).slice(-3000)));
  child.stderr.on('data',(d: Buffer)=>reviewerLogText(String(d).slice(-3000)));
  const cleanup=(code: any)=>{if(reviewerProcess===child){reviewerProcess=null;reviewerActive=null;send('reviewer-stopped',code);}};
  child.on('exit',cleanup);
  child.on('error',(err: Error)=>{reviewerLogText(`\n[erro ao iniciar o revisor: ${err.message}]\n`);cleanup(err.message);});
  try {
    await waitReady(review.HOST,port,child,null);
    if(signal.aborted||reviewerProcess!==child)throw Error('O revisor encerrou antes de ficar pronto.');
    reviewerActive={modelPath:model.path,name:model.name,host:review.HOST,port,device,context:opts.context,effort:profile.effort||'',modelId:review.ALIAS,resources:result,
      endpoint:`http://${review.HOST}:${port}/v1`};
  } catch(error) {reviewerLogText(`\n[launcher] Falha ao iniciar o revisor: ${error.message}\n`);try{child.kill();}catch{}cleanup(null);await waitExit(child);throw error;}
}
function stopReviewer(): Promise<void> {const pending=starts.cancel('reviewer');reviewerProcess?.kill();return pending;}
ipcMain.handle('reviewer-start',(e,modelPath,options: any={})=>{validateSender(e);return startReviewer(modelPath,options);});
ipcMain.handle('reviewer-stop',e=>{validateSender(e);stopReviewer();return true;});
// A conta do card: não inicia nada.
ipcMain.handle('reviewer-check',async(e,modelPath,options: any={})=>{
  validateSender(e);requireLlamaReady();
  const model=selectedModel(modelPath);review.requireModel(model);
  return planner.reviewer(model,options,configuration.profiles[model.path]||{},await planner.snapshot());
});
ipcMain.handle('copy-reviewer-endpoint',e=>{validateSender(e);if(!reviewerActive)throw Error('Inicie o revisor primeiro.');clipboard.writeText(reviewerActive.endpoint);return reviewerActive.endpoint;});
ipcMain.handle('suggest-trio',async e=>{
  validateSender(e);requireLlamaReady();
  if(tuneAbort||starts.any())throw Error('Aguarde o início ou o teste em andamento.');
  if(conversation||serverContainer)throw Error('Pare a conversa integrada e o vLLM antes de pedir a sugestão: o launcher não mede a memória deles.');
  const pids=[server,deciderProcess,reviewerProcess].map((child: any)=>child?.pid).filter(Boolean);
  const deciderOrder=[deciderActive?.modelPath,configuration.decider?.modelPath].filter(Boolean);
  return planner.trio({models:allModels(),profiles:configuration.profiles,deciderOrder,pids,architecture:(model: any)=>modelInfo.modelInfo(model)?.architecture||''});
});
function openConversation(model: any,admitted: any) {
  const session=cli.createSession({engineDir:configuration.engineDir,model,settings:admitted.settings,
    onOutput:(data: any)=>send('chat-output',data),
    onExit:(result: any)=>{if(conversation===session){conversation=null;send('chat-stopped',result);}},
    onError:(error: Error)=>send('chat-output',{stream:'stderr',text:`\n${error.message}\n`})});
  conversation=session;
  if(admitted.result)send('chat-output',{stream:'stderr',text:memoryLine(admitted.result)});
  return session;
}
ipcMain.handle('start-chat',async(e,modelPath,settings)=>{
  validateSender(e);
  if(serverBusy()||chatBusy())throw Error('Pare a execução atual antes de iniciar outra.');
  if(tuneAbort)throw Error('Aguarde o fim do teste de desempenho.');
  const model=selectedModel(modelPath);requireLlama(model,'A conversa integrada');requireGenerative(model);
  await starts.run('conversation',async(signal: AbortSignal)=>{
    await checkSettings(model,settings);
    const admitted=await admitMain(model,settings,signal);
    signal.throwIfAborted();
    openConversation(model,admitted);
  });
  configuration.profiles[modelPath]={...settings,version:params.PROFILE_VERSION};configuration.firstRun=false;save();return true;
});
ipcMain.handle('open-cli-terminal',async(e,modelPath,settings)=>{
  validateSender(e);
  if(serverBusy()||chatBusy()||tuneAbort)throw Error('Pare o servidor, a conversa ou o teste antes de abrir o terminal.');
  const model=selectedModel(modelPath);requireLlama(model,'A CLI no terminal');requireGenerative(model);
  await starts.run('conversation',async(signal: AbortSignal)=>{
    await checkSettings(model,settings);
    const admitted=await admitMain(model,settings,signal);
    signal.throwIfAborted();
    await terminalCli.openExternalCli({engineDir:configuration.engineDir,model,settings:admitted.settings});
  });
  configuration.profiles[modelPath]={...settings,version:params.PROFILE_VERSION};configuration.firstRun=false;save();
  return true;
});
ipcMain.handle('send-chat',(e,value)=>{validateSender(e);if(!conversation)throw Error('Inicie uma conversa no terminal primeiro.');return conversation.send(value);});
ipcMain.handle('stop-chat',e=>{validateSender(e);starts.cancel('conversation');conversation?.stop();return true;});
ipcMain.handle('get-key',e=>{validateSender(e);return network.ensureKey(apiKeyPath());});
ipcMain.handle('copy-key',e=>{validateSender(e);clipboard.writeText(network.ensureKey(apiKeyPath()));return true;});
ipcMain.handle('rotate-key',e=>{validateSender(e);if(serverBusy()||deciderBusy())throw Error('Pare o servidor e o decisor antes de gerar outra chave.');return network.rotateKey(apiKeyPath());});
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
ipcMain.handle('list-firewall-rules',async e=>{validateSender(e);return firewall.listRules();});
// Remove todas as regras LlamaDesktopLauncher-…; o Windows pede autorização de administrador só se houver alguma.
ipcMain.handle('remove-firewall-rules',async e=>{validateSender(e);return firewall.removeRules();});
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
    llama:{backend:configuration.engineBackend||'',release:configuration.engineVersion||'',pinned:engine.ENGINE_TAG,build:engineBuild.describeBuild(currentBuild(),engine.ENGINE_TAG)},
    docker:engines.vllmMode()==='docker'?docker:null,
    paths:{userData:app.getPath('userData'),modelDirs:configuration.modelDirs.map((dir: string)=>({path:dir,exists:!!dir&&fs.existsSync(dir)})),apiKeySaved:!!apiKey},
    models:{total:s.models.length,byEngine,selected:selected?{name:selected.name,engine:selected.engine,size:selected.size,path:selected.path,profile:configuration.profiles[selected.path]||null}:null},
    access:{host:configuration.accessHost,scope:network.scopeOf(configuration.accessHost),parallel:configuration.parallel},
    decider:deciderActive?{name:deciderActive.name,type:deciderActive.type,scope:deciderActive.scope,port:deciderActive.port,device:deciderActive.device,context:deciderActive.context}:null,
    reviewer:reviewerActive?{name:reviewerActive.name,effort:reviewerActive.effort,port:reviewerActive.port,device:reviewerActive.device,context:reviewerActive.context,memory:reviewerActive.resources?.text||null}:null,
    run:{server:!!server,chat:!!conversation,benchmark:!!tuneAbort,engineBusy,active:active?{engineLabel:active.engineLabel,scope:active.scope,host:active.host,port:active.port,modelId:active.modelId,context:active.context,parallel:active.parallel,sharing:!!active.sharingEndpoint,container:active.containerName}:null},
    update:{enabled:configuration.updateCheck!==false,lastCheck:configuration.lastUpdateCheck?new Date(configuration.lastUpdateCheck).toISOString():null,checked:!!updateInfo,available:!!updateInfo?.available,version:updateInfo?.version||null},
    log:engineLog.text(),
    secrets:[apiKey,shareProxy?.accessKey?.()||null],
    home:app.getPath('home')
  };
}
ipcMain.handle('copy-diagnostic-report',async e=>{validateSender(e);const report=diagnostics.buildReport(await diagnosticData());clipboard.writeText(report);return report;});

// ---- API local de controle (DevTools) ----
// Liga só pela caixa das Configurações. O token vem de DEVTOOLS_LAUNCHER_TOKEN quando definida; senão, de
// control-api-token.txt, gerado pelo launcher. Os três serviços sempre iniciam em 127.0.0.1.
function controlTokenPath() {return path.join(app.getPath('userData'),'control-api-token.txt');}
function controlApiState() {
  const token=configuration?control.resolveToken(controlTokenPath()):{source:'file'};
  return {enabled:configuration?.controlApi===true,running:!!controlServer,address:`http://${control.HOST}:${control.PORT}`,tokenSource:token.source,envVar:control.TOKEN_ENV,error:controlError||token.error||null};
}
async function refreshControlApi() {
  const stop=()=>{if(controlServer){controlServer.close();controlServer.closeAllConnections?.();controlServer=null;}};
  if(configuration.controlApi!==true){stop();controlError=null;return;}
  const token=control.ensureToken(controlTokenPath());
  if(!token.token){stop();controlError=token.error||'Token da API de controle indisponível.';return;}
  if(controlServer){controlError=null;return;}
  try {
    controlServer=await control.createControlServer({token:()=>control.resolveToken(controlTokenPath()).token,
      handlers:{models:()=>control.catalog(allModels()),servers:controlServers,start:controlStart,stop:controlStop,quit:()=>app.quit()}});
    controlError=null;
  } catch(error) {controlError=error.code==='EADDRINUSE'?`A porta ${control.PORT} já está em uso por outro programa.`:String(error.message||error);}
}
function controlServers() {
  return {
    chat:server&&active?{model_id:control.modelId(active.modelPath),port:active.port,api_model:active.modelId,host:active.host}:null,
    decider:deciderProcess&&deciderActive?{model_id:control.modelId(deciderActive.modelPath),port:deciderActive.port,host:deciderActive.host}:null,
    reviewer:reviewerProcess&&reviewerActive?{model_id:control.modelId(reviewerActive.modelPath),port:reviewerActive.port,api_model:reviewerActive.modelId,host:reviewerActive.host}:null,
  };
}
const controlConflict=(message: string)=>new control.ControlError(409,'conflict',message);
// Reaproveita startServer/startDecider/startReviewer (mesma validação e ciclo de vida da tela), sempre em loopback e sem
// gravar escolhas da tela. O mesmo modelo já ativo em 127.0.0.1 devolve sucesso sem reiniciar.
async function controlStart(role: string,model: any) {
  try {
    if(role==='reviewer') {
      if(reviewerActive?.modelPath===model.path)return;
      if(reviewerBusy())throw controlConflict(reviewerActive?'O revisor já está em execução com outro modelo. Pare-o antes.':'O revisor está iniciando.');
      if(tuneAbort)throw controlConflict('Aguarde o fim do teste de desempenho no launcher.');
      if(!llamaReady())throw controlConflict('Instale ou selecione o llama.cpp no launcher primeiro.');
      const saved=configuration.reviewer||{};
      await startReviewer(model.path,{device:saved.device??review.DEFAULTS.device,context:saved.context??review.DEFAULTS.context},false);
    } else if(role==='decider') {
      if(tuneAbort)throw controlConflict('Aguarde o fim do teste de desempenho no launcher.');
      if(deciderBusy()){if(deciderActive?.modelPath===model.path&&deciderActive.host===control.HOST)return;throw controlConflict(deciderActive?'O decisor já está em execução com outro modelo ou na rede. Pare-o antes.':'O decisor está iniciando.');}
      if(!llamaReady())throw controlConflict('Instale ou selecione o llama.cpp no launcher primeiro.');
      const saved=configuration.decider||{};
      await startDecider(model.path,{device:saved.device??decisions.DEFAULTS.device,context:saved.context??decisions.DEFAULTS.context,host:control.HOST},false);
    } else {
      if(serverBusy()){if(active?.modelPath===model.path&&active.host===control.HOST)return;throw controlConflict(active?'O servidor principal já está em execução com outro modelo ou na rede. Pare-o antes.':'O servidor principal está iniciando.');}
      if(chatBusy()||tuneAbort||engineBusy)throw controlConflict('Pare a conversa, o teste de desempenho ou a preparação do motor no launcher antes.');
      if(model.engine==='llamacpp'&&!llamaReady())throw controlConflict('Instale ou selecione o llama.cpp no launcher primeiro.');
      const {version: _version,...settings}=configuration.profiles[model.path]||{};
      await startServer(model.path,settings,{host:control.HOST,parallel:Number(configuration.parallel)||1,openBrowser:false,persist:false});
    }
  } catch(error) {
    if(error instanceof control.ControlError)throw error;
    if(error?.code==='insufficient_resources')throw new control.ControlError(409,error.code,error.message);
    throw new control.ControlError(500,'start_failed',String(error?.message||error));
  } finally {send('control-changed',null);}
}
async function controlStop(role: string) {
  const child=role==='reviewer'?reviewerProcess:role==='decider'?deciderProcess:server;
  const pending=role==='reviewer'?stopReviewer():role==='decider'?stopDecider():stopServer();
  await Promise.all([waitExit(child),Promise.race([pending,new Promise<void>(resolve=>setTimeout(resolve,15000))])]);
  send('control-changed',null);
}
ipcMain.handle('set-control-api',async(e,enabled)=>{validateSender(e);if(typeof enabled!=='boolean')throw Error('Valor inválido.');configuration.controlApi=enabled;save();await refreshControlApi();return state();});
ipcMain.handle('copy-control-token',e=>{validateSender(e);const token=control.ensureToken(controlTokenPath());if(!token.token)throw Error(token.error||'Token indisponível.');clipboard.writeText(token.token);return token.source;});
ipcMain.handle('rotate-control-token',e=>{validateSender(e);if(control.resolveToken(controlTokenPath()).source==='env')throw Error(`O token vem da variável ${control.TOKEN_ENV}; troque o valor dela e reabra o launcher.`);control.rotateToken(controlTokenPath());return state();});
