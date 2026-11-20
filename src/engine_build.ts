'use strict';
// Identifica o llama-server de uma pasta escolhida pelo usuário: llama.cpp oficial ou um fork compatível
// (Avalon, tandem.cpp). Os forks usam as mesmas opções do llama.cpp e acrescentam algumas; o launcher não
// os baixa nem compila, só reconhece a pasta já instalada e oferece receitas e links.
const {spawn}=require('node:child_process');
const fs=require('node:fs');
const path=require('node:path');

// Uma opção que só o fork tem (conferido no README de cada um e ausente em common/arg.cpp do b12359).
const FORKS=Object.freeze([
  {id:'avalon',label:'Avalon',marker:'--moe-cache-cpu-overlap',repo:'https://github.com/freriadoc/Avalon'},
  {id:'tandem',label:'tandem.cpp',marker:'--moe-cache-margin-mib',repo:'https://github.com/ewhacc/tandem.cpp'}
]);
const links=Object.freeze({
  avalon:'https://github.com/freriadoc/Avalon',
  avalonWindows:'https://github.com/ppkrol/Avalon_windows',
  avalonModel:'https://huggingface.co/freriadoc/Qwen3.8-Flash-Next-Avalon-GGUF',
  tandem:'https://github.com/ewhacc/tandem.cpp'
});

function parseVersion(text: string) {
  // Formato antigo: "version: 12110 (cd959bae9)"; novo: "Version: 0.9.0-dev (build 12110, commit cd959bae9)".
  const t=String(text||'');
  const m=/version:\s*(\d+)\s*\(([0-9a-f]{6,40})\)/i.exec(t)||/\(build\s+(\d+),\s*commit\s+([0-9a-f]{6,40})\)/i.exec(t);
  return m?{build:Number(m[1]),commit:m[2]}:{build:null,commit:null};
}
function identifyBuild(versionText: string,helpText: string) {
  const v=parseVersion(versionText);
  const help=String(helpText||'');
  const fork=FORKS.find(f=>help.includes(f.marker));
  return {flavor:fork?fork.id:'llamacpp',label:fork?fork.label:'llama.cpp',build:v.build,commit:v.commit,repo:fork?.repo||null};
}

// Saída de um comando curto (stdout + stderr): --version e --help não carregam modelo.
function capture(file: string,args: string[],timeoutMs=20000): Promise<string> {
  return new Promise(resolve=>{
    let out='',child: any;
    try {child=spawn(file,args,{cwd:path.dirname(file),windowsHide:true,stdio:['ignore','pipe','pipe']});} catch {resolve('');return;}
    const take=(d: any)=>{if(out.length<2e6)out+=String(d);};
    child.stdout?.on('data',take);child.stderr?.on('data',take);
    const timer=setTimeout(()=>{try{child.kill();}catch{}resolve(out);},timeoutMs);
    child.once('error',()=>{clearTimeout(timer);resolve(out);});
    child.once('exit',()=>{clearTimeout(timer);resolve(out);});
  });
}
const exe=(dir: string,name: string,platform=process.platform)=>path.join(dir,platform==='win32'?`${name}.exe`:name);
async function probeBuild(engineDir: string,{run=capture,platform=process.platform}: any={}) {
  const server=exe(engineDir,'llama-server',platform);
  if(!engineDir||!fs.existsSync(server)) return null;
  const [version,help]=await Promise.all([run(server,['--version']),run(server,['--help'])]);
  return {...identifyBuild(version,help),hasBench:fs.existsSync(exe(engineDir,'llama-bench',platform)),
    hasFit:fs.existsSync(exe(engineDir,'llama-fit-params',platform)),checkedAt:new Date().toISOString()};
}
// Texto curto para a interface e o relatório de diagnóstico.
function describeBuild(build: any,pinned: string) {
  if(!build) return null;
  const version=build.build?`build ${build.build}${build.commit?` (${String(build.commit).slice(0,8)})`:''}`:'versão não informada';
  const tested=build.flavor==='llamacpp'&&build.build&&pinned&&`b${build.build}`!==pinned?` · versão testada pelo launcher: ${pinned}`:'';
  const tools=build.hasBench===false?' · sem llama-bench (o autotuning mede pelo llama-server)':'';
  return `${build.label} · ${version}${tested}${tools}`;
}

// Receitas dos forks para o modelo para o qual foram feitos. Devolvem só os campos do perfil que mudam.
// Avalon: README "Run" (Qwen3.8-Flash-Next IQ3_KS hybrid com a cabeça MTP em MTP/).
function findMtpHead(model: any,draftModels: any[]) {
  const dir=path.dirname(String(model?.path||''));
  const candidates=(draftModels||[]).filter(m=>/mtp/i.test(path.basename(m.path)));
  return candidates.find(m=>path.dirname(m.path).startsWith(dir))||candidates[0]||null;
}
function recipeFor(build: any,model: any,draftModels: any[]=[]) {
  const name=path.basename(String(model?.path||''));
  if(!build||!/qwen3\.8-flash-next/i.test(name)) return null;
  const head=findMtpHead(model,draftModels);
  if(build.flavor==='avalon') return {
    title:'Receita do Avalon para o Qwen3.8-Flash-Next',
    note:'Do README do Avalon: KV q8_0/q4_0, lotes de 9536, MTP com 2 tokens. Use 1 sessão simultânea (outras sessões tiram cache KV do cache de especialistas).'+(head?'':' Não achei a cabeça MTP (arquivo com mtp no nome) nas pastas de modelos: a decodificação especulativa ficou desligada.'),
    settings:{flash:'on',cacheK:'q8_0',cacheV:'q4_0',batch:'9536',ubatch:'9536',
      ...(head?{specType:'draft-mtp',draftModel:head.path,draftMax:'2',extraArgs:'-ubd 256 -ctkd q8_0 -ctvd q8_0'}:{})}
  };
  if(build.flavor==='tandem') return {
    title:'Receita do tandem.cpp para o Qwen3.8-Flash-Next',
    note:'Do README do tandem.cpp: todos os especialistas na RAM, cache automático na VRAM livre, carga sem mmap e 1 sessão simultânea. Com menos RAM que o modelo, troque o modo de carga para automático.'+(head?'':' Não achei a cabeça MTP (arquivo com mtp no nome): a decodificação especulativa ficou desligada.'),
    settings:{gpuLayers:'99',loadMode:'none',extraArgs:'-cmoe --moe-cache-mib auto',
      ...(head?{specType:'draft-mtp',draftModel:head.path,draftMax:'3'}:{})}
  };
  return null;
}

module.exports={FORKS,links,parseVersion,identifyBuild,capture,probeBuild,describeBuild,findMtpHead,recipeFor};
