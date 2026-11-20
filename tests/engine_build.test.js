'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const build=require('../build/app/engine_build');

test('identifica llama.cpp oficial, Avalon e tandem.cpp pelo --version e por uma opção exclusiva do --help',()=>{
  const version='version: 12359 (a1b2c3d4)\nbuilt with cc for x86_64';
  assert.deepEqual(build.identifyBuild(version,'-m, --model FNAME\n--moe-cache-mib N'),{flavor:'llamacpp',label:'llama.cpp',build:12359,commit:'a1b2c3d4',repo:null});
  assert.equal(build.identifyBuild(version,'--moe-cache-cpu-overlap N').flavor,'avalon');
  assert.equal(build.identifyBuild('','--moe-cache-margin-mib N').label,'tandem.cpp');
  assert.equal(build.identifyBuild('sem versão','').build,null);
  assert.deepEqual(build.parseVersion('Version: 0.9.0-dev (build 12110, commit cd959bae9)\nbuilt with Clang 20.1.8 for Windows x86_64'),{build:12110,commit:'cd959bae9'});
});

test('descrição: aponta a versão testada só no llama.cpp oficial e a falta do llama-bench',()=>{
  assert.equal(build.describeBuild({flavor:'llamacpp',label:'llama.cpp',build:12359,commit:'a1b2c3d4e5',hasBench:true},'b12359'),'llama.cpp · build 12359 (a1b2c3d4)');
  assert.match(build.describeBuild({flavor:'llamacpp',label:'llama.cpp',build:12000,hasBench:true},'b12359'),/versão testada pelo launcher: b12359/);
  assert.match(build.describeBuild({flavor:'avalon',label:'Avalon',build:null,hasBench:false},'b12359'),/^Avalon · versão não informada · sem llama-bench/);
  assert.equal(build.describeBuild(null,'b12359'),null);
});

test('probeBuild roda --version e --help do llama-server da pasta e registra as ferramentas presentes',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'llama-build-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const name=n=>process.platform==='win32'?`${n}.exe`:n;
  assert.equal(await build.probeBuild(dir,{run:async()=>''}),null,'sem llama-server');
  fs.writeFileSync(path.join(dir,name('llama-server')),'');
  const calls=[];
  const b=await build.probeBuild(dir,{run:async(file,args)=>{calls.push(args[0]);return args[0]==='--version'?'version: 12400 (deadbeef)':'--moe-cache-cpu-overlap';}});
  assert.deepEqual(calls.sort(),['--help','--version']);
  assert.equal(b.flavor,'avalon');assert.equal(b.build,12400);assert.equal(b.hasBench,false);assert.equal(b.hasFit,false);
});

test('receitas: Avalon e tandem.cpp só para o Qwen3.8-Flash-Next, com a cabeça MTP das pastas de modelos',()=>{
  const model={path:path.join('m','Qwen3.8-Flash-Next-Avalon-GGUF','Qwen3.8-Flash-Next-Avalon-IQ3KS-00001-of-00033.gguf')};
  const head={path:path.join('m','Qwen3.8-Flash-Next-Avalon-GGUF','MTP','mtp-Qwen3.8-Flash-Next-shared.gguf')};
  const avalon=build.recipeFor({flavor:'avalon'},model,[{path:path.join('m','outro.gguf')},head]);
  assert.equal(avalon.settings.cacheV,'q4_0');assert.equal(avalon.settings.specType,'draft-mtp');assert.equal(avalon.settings.draftModel,head.path);
  assert.equal(avalon.settings.extraArgs,'-ubd 256 -ctkd q8_0 -ctvd q8_0');
  const semCabeca=build.recipeFor({flavor:'avalon'},model,[]);
  assert.equal(semCabeca.settings.specType,undefined);assert.match(semCabeca.note,/Não achei a cabeça MTP/);
  const tandem=build.recipeFor({flavor:'tandem'},model,[head]);
  assert.equal(tandem.settings.loadMode,'none');assert.equal(tandem.settings.extraArgs,'-cmoe --moe-cache-mib auto');assert.equal(tandem.settings.draftMax,'3');
  assert.equal(build.recipeFor({flavor:'llamacpp'},model,[head]),null,'llama.cpp oficial não tem receita');
  assert.equal(build.recipeFor({flavor:'avalon'},{path:'gpt-oss-120b.gguf'},[]),null,'só o modelo do fork');
});

test('a tela explica que os forks não têm download e só usa links conhecidos',()=>{
  const html=fs.readFileSync(path.join(__dirname,'..','src','index.html'),'utf8');
  assert.match(html,/class="fork-info"/);assert.match(html,/não têm download, é preciso compilar/);
  const used=[...html.matchAll(/data-engine-link="([^"]+)"/g)].map(m=>m[1]);
  assert.ok(used.length>=3);for(const key of used) assert.ok(Object.hasOwn(build.links,key),key);
  for(const doc of ['MANUAL-pt-BR.md','MANUAL-en.md']) assert.match(fs.readFileSync(path.join(__dirname,'..','docs',doc),'utf8'),/#### (Compilar um fork|Build a fork)/,doc);
});
