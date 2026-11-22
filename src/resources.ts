'use strict';
// Memória para rodar principal, revisor e decisor juntos. O "free" do --list-devices é o orçamento de um
// processo: não desconta a VRAM que os outros llama-server usam. Por isso a medição vem do sistema
// (contadores do Windows ou nvidia-smi) e a estimativa, do llama-fit-params --fit-print, sem carregar pesos.
// Todos os valores deste módulo estão em MiB.
const {execFile}=require('node:child_process');
const os=require('node:os');

const MIB=1024**2;
// "Não cabe" abaixo da reserva de RAM; "no limite" abaixo das folgas.
const RESERVE=Object.freeze({ram:1024,tightRam:3072,tightVram:512});
const LEVELS=Object.freeze({ok:'Cabe',tight:'No limite',unknown:'Sem medição',no:'Não cabe'});
const DEFAULT_FIT_TARGET=1024;
// Na GPU integrada e na CPU, um revisor maior que isto passa de um minuto por pedido.
const LIGHT_REVIEWER=6144;

interface Row {name: string; model: number; context: number; compute: number}
interface Need {vram: Record<string,number>; shared: Record<string,number>; ram: number; elastic: number; unknown?: string}
interface Device {name: string; description: string; total: number; budget: number; free: number|null; kind: 'dedicated'|'shared'; luid: string|null}
interface Snapshot {available: number|null; devices: Device[]; processes: {id: number; workingSet: number}[]; usage: {id: number; luid: string; dedicated: number}[]}

const gb=(value: number)=>`${(Math.max(0,value)/1024).toFixed(1).replace('.',',')} GB`;

// Saída do --fit-print: "Vulkan0 4810 178 521" e "Host 545 0 36" (modelo, contexto, cálculo).
function parsePrint(text: string): Row[]|null {
  const rows: Row[]=[];
  for(const line of String(text||'').split(/\r?\n/)) {
    const m=/^\s*(\S+)\s+(\d+)\s+(\d+)\s+(\d+)\s*$/.exec(line);
    if(m)rows.push({name:m[1],model:Number(m[2]),context:Number(m[3]),compute:Number(m[4])});
  }
  return rows.length?rows:null;
}

// Só números inteiros entram no script. As classes CIM têm o mesmo nome em qualquer idioma do Windows.
function probeScript(pids: number[]) {
  const ids=pids.filter(id=>Number.isSafeInteger(id)&&id>0).join(',');
  return [
    "$ErrorActionPreference='SilentlyContinue'",
    "$d=@(Get-ChildItem 'HKLM:\\SOFTWARE\\Microsoft\\DirectX' | ForEach-Object { $p=Get-ItemProperty $_.PSPath; if($p.AdapterLuid){ [pscustomobject]@{luid=('{0:X16}' -f [int64]$p.AdapterLuid);name=$p.Description;total=[double]$p.DedicatedVideoMemory} } })",
    "$u=@(Get-CimInstance Win32_PerfFormattedData_GPUPerformanceCounters_GPUAdapterMemory | ForEach-Object { [pscustomobject]@{name=$_.Name;used=[double]$_.DedicatedUsage} })",
    `$ids=@(${ids})`,
    "$w=@();$g=@()",
    "if($ids.Count){$w=@(Get-Process -Id $ids | ForEach-Object { [pscustomobject]@{id=$_.Id;workingSet=[double]$_.WorkingSet64} });$g=@(Get-CimInstance Win32_PerfFormattedData_GPUPerformanceCounters_GPUProcessMemory | ForEach-Object { [pscustomobject]@{name=$_.Name;used=[double]$_.DedicatedUsage} })}",
    "$a=(Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory",
    "[pscustomobject]@{availableKiB=$a;adapters=$d;adapterUsage=$u;processes=$w;processUsage=$g} | ConvertTo-Json -Compress -Depth 4",
  ].join(';');
}
function parseWindows(text: string) {
  let data: any;try{data=JSON.parse(text);}catch{return null;}
  if(!data||typeof data!=='object')return null;
  const list=(v: any)=>Array.isArray(v)?v:v?[v]:[];
  const luidOf=(name: string)=>{const m=/luid_0x([0-9a-f]{8})_0x([0-9a-f]{8})/i.exec(String(name));return m?(m[1]+m[2]).toUpperCase():null;};
  const used=new Map<string,number>();
  for(const item of list(data.adapterUsage)){const id=luidOf(item.name);if(id)used.set(id,(used.get(id)||0)+Number(item.used||0)/MIB);}
  // O registro guarda adaptadores de inicializações anteriores; os contadores só têm os atuais.
  const adapters=list(data.adapters).filter((a: any)=>used.has(a.luid))
    .map((a: any)=>({luid:String(a.luid),name:String(a.name||''),total:Number(a.total||0)/MIB,used:used.get(a.luid) as number}));
  const processes=list(data.processes).map((p: any)=>({id:Number(p.id),workingSet:Number(p.workingSet||0)/MIB}));
  const ids=new Set(processes.map((p: any)=>p.id)),usage: Snapshot['usage']=[];
  for(const item of list(data.processUsage)) {
    const id=Number(/^pid_(\d+)_/.exec(String(item.name))?.[1]),luid=luidOf(item.name);
    if(luid&&ids.has(id))usage.push({id,luid,dedicated:Number(item.used||0)/MIB});
  }
  return {available:Number(data.availableKiB)>0?Number(data.availableKiB)/1024:null,adapters,processes,usage};
}

const sameName=(a: string,b: string)=>a.trim().toLowerCase()===b.trim().toLowerCase();
const INTEGRATED=/\b(?:UHD|Iris|integrated)\b|Radeon(?:\(TM\))?\s+(?:\d+M\s+)?Graphics/i;
function bindDevices(listed: any[],{adapters=[],nvidia=[],platform=process.platform}: any={}): Device[] {
  return listed.map((d: any,index: number)=>{
    // Placas iguais: a k-ésima do llama.cpp é a k-ésima de mesmo nome no sistema.
    const backend=String(d.name).replace(/\d+$/,'');
    const nth=listed.slice(0,index).filter((x: any)=>x.description===d.description&&String(x.name).replace(/\d+$/,'')===backend).length;
    const adapter=adapters.filter((a: any)=>sameName(a.name,d.description)).sort((a: any,b: any)=>a.luid.localeCompare(b.luid))[nth];
    const card=nvidia.filter((g: any)=>sameName(g.name,d.description))[nth];
    const integrated=platform==='darwin'||(adapter?adapter.total<2048&&d.totalMiB>adapter.total*2:INTEGRATED.test(d.description));
    const free=integrated?null:adapter?Math.max(0,adapter.total-adapter.used):card?card.freeBytes/MIB:null;
    return {name:d.name,description:d.description,total:d.totalMiB,budget:d.freeMiB,free,kind:integrated?'shared':'dedicated',luid:adapter?.luid||null};
  });
}

function runPowerShell(script: string): Promise<string> {
  return new Promise((resolve,reject)=>execFile('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],
    {encoding:'utf8',timeout:20000,maxBuffer:4*MIB,windowsHide:true},(error: any,stdout: string)=>error?reject(error):resolve(stdout)));
}
async function measure({listed=[],nvidia=[],pids=[],platform=process.platform,run=runPowerShell}: any={}): Promise<Snapshot> {
  let system: any=null;
  if(platform==='win32')try{system=parseWindows(await run(probeScript(pids)));}catch{}
  // No macOS o freemem ignora o cache recuperável: bloquearia à toa, então fica sem medição.
  const available=system?.available??(platform==='darwin'?null:os.freemem()/MIB);
  return {available,devices:bindDevices(listed,{adapters:system?.adapters||[],nvidia,platform}),processes:system?.processes||[],usage:system?.usage||[]};
}
// A medição como ficaria com esses processos parados; usada para sugerir o trio.
function withoutProcesses(snapshot: Snapshot,pids: number[]): Snapshot|null {
  if(!pids.length)return snapshot;
  if(snapshot.available===null||pids.some(id=>!snapshot.processes.some(p=>p.id===id)))return null;
  return {...snapshot,processes:[],usage:[],
    available:snapshot.available+snapshot.processes.filter(p=>pids.includes(p.id)).reduce((sum,p)=>sum+p.workingSet,0),
    devices:snapshot.devices.map(d=>d.free===null?d:{...d,free:Math.min(d.total,d.free+snapshot.usage.filter(u=>pids.includes(u.id)&&u.luid===d.luid).reduce((sum,u)=>sum+u.dedicated,0))})};
}

function unknownNeed(reason: string): Need {return {vram:{},shared:{},ram:0,elastic:0,unknown:reason};}
// ram: ocupada já na carga (contexto, GPU integrada). elastic: não impede a carga, porque são pesos em mmap
// (cache recuperável) ou cálculo da CPU, que só ocupa RAM conforme o tamanho do pedido (no decisor, com
// microbatch igual ao contexto, chega a 4 GB num pedido cheio e fica perto de zero num curto).
function needOf(rows: Row[]|null,devices: Device[],{file=0,projector=0}: {file?: number; projector?: number}={}): Need {
  if(!rows)return unknownNeed('o motor não informou a estimativa de memória');
  const need: Need={vram:{},shared:{},ram:0,elastic:0};
  let listed=0,projectorDevice: Device|undefined;
  for(const row of rows) {
    listed+=row.model;
    const device=devices.find(d=>d.name===row.name),total=row.model+row.context+row.compute;
    if(!device){need.ram+=row.context;need.elastic+=row.model+row.compute;continue;}
    projectorDevice??=device;
    if(device.kind==='shared'){need.shared[device.name]=total;need.ram+=total;}
    else need.vram[device.name]=total;
  }
  // Na CPU o llama.cpp reempacota parte dos pesos em RAM comum, que o --fit-print não lista.
  need.ram+=Math.max(0,file-listed);
  if(projector) {
    if(projectorDevice?.kind==='dedicated')need.vram[projectorDevice.name]+=projector;
    else need.ram+=projector;
  }
  return need;
}
function assess(needs: Need[],snapshot: Snapshot) {
  const total={ram:0,elastic:0},vram: Record<string,number>={},shared: Record<string,number>={},unknown: string[]=[];
  for(const need of needs) {
    total.ram+=need.ram;total.elastic+=need.elastic;
    if(need.unknown)unknown.push(need.unknown);
    for(const [name,value] of Object.entries(need.vram))vram[name]=(vram[name]||0)+value;
    for(const [name,value] of Object.entries(need.shared))shared[name]=(shared[name]||0)+value;
  }
  const no: string[]=[],tight: string[]=[],detail: string[]=[];
  for(const [name,value] of Object.entries(vram)) {
    const device=snapshot.devices.find(d=>d.name===name),free=device?.free;
    if(free===null||free===undefined){unknown.push(`não foi possível medir a VRAM livre de ${name}`);continue;}
    const text=`VRAM de ${device.description||name}: pede ${gb(value)}, há ${gb(free)} livres`;
    detail.push(text);
    if(value>free)no.push(text);else if(value>free-RESERVE.tightVram)tight.push(text);
  }
  for(const [name,value] of Object.entries(shared)) {
    const device=snapshot.devices.find(d=>d.name===name);
    if(device&&value>device.total)no.push(`${device.description||name}: pede ${gb(value)} e endereça até ${gb(device.total)}`);
  }
  if(snapshot.available===null)unknown.push('não foi possível medir a RAM livre');
  else if(total.ram+total.elastic>0) {
    const free=`há ${gb(snapshot.available)} livres`,text=`RAM: pede até ${gb(total.ram+total.elastic)}, ${free}`;
    detail.push(text);
    if(total.ram>snapshot.available-RESERVE.ram)no.push(`RAM: precisa de ${gb(total.ram)} só para carregar, ${free} (o sistema precisa de ${gb(RESERVE.ram)} de reserva)`);
    else if(total.ram+total.elastic>snapshot.available-RESERVE.tightRam)tight.push(text);
  }
  const level=no.length?'no':unknown.length?'unknown':tight.length?'tight':'ok';
  const lines=level==='no'?no:level==='unknown'?[...new Set(unknown)]:level==='tight'?tight:detail;
  return {level,label:LEVELS[level as keyof typeof LEVELS],text:`${LEVELS[level as keyof typeof LEVELS]}${lines.length?`: ${lines.join(' · ')}`:''}`};
}

// O -fit trabalha sobre o orçamento do processo. Com vizinhos, a margem precisa cobrir a diferença entre esse
// orçamento e a VRAM livre de verdade (mais o projetor, que o -fit não conta) e ainda deixar a folga padrão.
// A margem do perfil vale quando já é maior que isso: foi medida e testada com esse modelo.
function adjustedTarget(settings: any,snapshot: Snapshot,projector=0): number|null {
  if(settings?.gpuLayers&&settings.gpuLayers!=='auto')return null;
  const wanted=String(settings?.device||'').trim();
  const targets=wanted?snapshot.devices.filter(d=>wanted.split(',').includes(d.name)):snapshot.devices.filter(d=>d.kind==='dedicated');
  if(targets.length!==1||targets[0].kind!=='dedicated'||targets[0].free===null)return null;
  const gap=Math.ceil(targets[0].budget-targets[0].free+projector);
  const raw=String(settings?.fitTarget??'').trim(),needed=gap+DEFAULT_FIT_TARGET;
  return gap>0&&needed>(raw?Number(raw):DEFAULT_FIT_TARGET)?needed:null;
}

// Automático do revisor: placa dedicada, integrada e, por último, CPU; folga vale mais que velocidade, menos na CPU.
function chooseDevice<T extends {kind: string; result: {level: string}}>(options: T[]): T|null {
  const order=['ok:dedicated','ok:shared','tight:dedicated','tight:shared','ok:cpu','tight:cpu','unknown:dedicated','unknown:shared','unknown:cpu'];
  for(const wanted of order){const found=options.find(o=>`${o.result.level}:${o.kind}`===wanted);if(found)return found;}
  return options[0]||null;
}

const family=(architecture: string)=>/^[a-z]+/i.exec(architecture||'')?.[0].toLowerCase()||'';
// Preferência: tudo com folga, revisor que responde a tempo, famílias diferentes, maior principal, revisor
// mais rápido e maior, decisor preferido. O tamanho conta em passos de 100 MiB: quantizações iguais empatam.
function suggestTrio({mains,reviewers,deciders,snapshot}: {mains: any[]; reviewers: any[]; deciders: any[]; snapshot: Snapshot}) {
  const speed: Record<string,number>={dedicated:2,shared:1,cpu:0},step=(bytes: number)=>Math.round(bytes/MIB/100);
  let best: any=null;
  for(const main of mains)for(const reviewer of reviewers) {
    if(main.path===reviewer.path)continue;
    for(const decider of deciders.length?deciders:[null]) {
      const result=assess([main.need,reviewer.need,...(decider?[decider.need]:[])],snapshot);
      if(result.level!=='ok'&&result.level!=='tight')continue;
      const different=!!family(main.architecture)&&family(main.architecture)!==family(reviewer.architecture);
      const prompt=reviewer.kind==='dedicated'||reviewer.size<=LIGHT_REVIEWER*MIB;
      const score=[result.level==='ok'?1:0,prompt?1:0,different?1:0,step(main.size),speed[reviewer.kind],step(reviewer.size),-(decider?.rank??0),-main.name.length,-reviewer.name.length];
      const first=best?score.findIndex((value,i)=>value!==best.score[i]):0;
      if(first>=0&&(!best||score[first]>best.score[first]))best={main,reviewer,decider,result,score};
    }
  }
  return best;
}

module.exports={MIB,RESERVE,LEVELS,DEFAULT_FIT_TARGET,LIGHT_REVIEWER,gb,parsePrint,probeScript,parseWindows,bindDevices,measure,withoutProcesses,unknownNeed,needOf,assess,adjustedTarget,chooseDevice,suggestTrio};
