'use strict';
// Perfis por modelo e por tipo de motor: o mesmo GGUF pode ter um perfil para o Vulkan e outro para o CUDA
// (os nomes dos dispositivos e o que cabe na memória mudam de um para o outro). vLLM e Strata usam o próprio nome.
// Formato: configuration.engineProfiles[caminho do modelo][tipo do motor] = ajustes.
// O mapa antigo (configuration.profiles, um perfil por modelo) não é mais gravado: fica só para a migração.
const params=require('./params');

type Store=Record<string, Record<string, any>>;

function isObject(value: any) {return !!value&&typeof value==='object'&&!Array.isArray(value);}
function normalize(store: any): Store {
  const out: Store={};
  if(!isObject(store))return out;
  for(const [modelPath,byEngine] of Object.entries(store)){
    if(!isObject(byEngine))continue;
    const entries=Object.entries(byEngine as Record<string, any>).filter(([key,profile])=>key&&isObject(profile));
    if(entries.length)out[modelPath]=Object.fromEntries(entries);
  }
  return out;
}
// Tipo do motor de um perfil antigo: GGUF era do llama.cpp em uso; strata-*.json do Strata; o resto, pastas do vLLM.
function legacyKind(modelPath: string,mainKey: string) {
  const name=String(modelPath).split(/[\\/]/).pop()||'';
  if(/\.gguf$/i.test(name))return mainKey;
  if(/^strata-.+\.json$/i.test(name))return 'strata';
  return 'vllm';
}
// Copia os perfis antigos para o tipo do motor em uso, uma vez só (profilesMigrated). Espera haver motor: sem ele
// não dá para saber de qual tipo eram os perfis de GGUF. Só copia modelos sem nenhum perfil novo, então um perfil
// salvo antes da migração (ex.: de vLLM, com o motor sumido) não impede os outros de migrar nem é sobrescrito.
function migrate(configuration: any,mainKey: string) {
  const current=normalize(configuration.engineProfiles);
  if(configuration.profilesMigrated===true)return {store:current,done:false};
  const legacy=isObject(configuration.profiles)?configuration.profiles:{};
  const hasGguf=Object.keys(legacy).some(modelPath=>/\.gguf$/i.test(modelPath));
  if(hasGguf&&!mainKey)return {store:current,done:false};
  const store: Store={...current};
  for(const [modelPath,profile] of Object.entries(legacy)){
    if(!isObject(profile)||store[modelPath])continue;
    store[modelPath]={[legacyKind(modelPath,mainKey)]:params.migrateProfile(profile)};
  }
  return {store,done:true};
}
function get(store: any,modelPath: string,key: string) {
  const profile=key?store?.[modelPath]?.[key]:null;
  return isObject(profile)?profile:null;
}
// Ajuste padrão de cada motor, usado quando o modelo ainda não tem perfil salvo para o tipo escolhido.
// Não copia o perfil de outro tipo: dispositivos e o que cabe na memória mudam de um motor para o outro.
const DEFAULTS: Record<string, Record<string, string>>=Object.freeze({llamacpp:{context:'4096'},vllm:{context:'4096'},strata:{}});
function defaultsFor(engine: string) {return {...(DEFAULTS[engine||'llamacpp']||{})};}
// Os ajustes sem o campo version, prontos para validar e montar os argumentos.
function settingsOf(store: any,modelPath: string,key: string,engine='llamacpp') {
  const saved=get(store,modelPath,key);
  if(!saved)return defaultsFor(engine);
  const {version: _version,...settings}=saved;
  return settings;
}
// Salvar no mesmo tipo de motor substitui o perfil anterior desse tipo; os dos outros motores ficam.
function set(store: any,modelPath: string,key: string,settings: any) {
  if(!key)throw Error('Instale ou escolha um motor llama.cpp antes de salvar o perfil.');
  if(!isObject(settings))throw Error('Ajustes ausentes.');
  const {version: _version,...values}=settings;
  const next=normalize(store);
  next[modelPath]={...(next[modelPath]||{}),[key]:{...values,version:params.PROFILE_VERSION}};
  return next;
}
function keys(store: any,modelPath: string) {return Object.keys(normalize(store)[modelPath]||{});}
// Um perfil por modelo, do tipo pedido: o formato que a sugestão de trio e o relatório esperam.
function flatten(store: any,key: string) {
  const out: Record<string, any>={};
  for(const [modelPath,byEngine] of Object.entries(normalize(store)))if(byEngine[key])out[modelPath]=byEngine[key];
  return out;
}

module.exports={DEFAULTS,defaultsFor,normalize,legacyKind,migrate,get,settingsOf,set,keys,flatten};
