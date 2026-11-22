'use strict';
// Um início de cada vez. A checagem de memória leva segundos e o modelo só ocupa a memória quando termina
// de carregar: dois inícios juntos enxergariam a mesma memória livre e caberiam os dois "no papel".

// Deixa de esperar quando o sinal é abortado; a promessa original termina sozinha.
function untilAborted<T>(promise: Promise<T>,signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve,reject)=>{
    const abort=()=>reject(signal.reason);
    if(signal.aborted){promise.catch(()=>{});abort();return;}
    signal.addEventListener('abort',abort,{once:true});
    promise.then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort));
  });
}

function createStarts(changed: () => void=()=>{}) {
  const pending=new Map<string,{controller: AbortController; settled: Promise<void>}>();
  let queue: Promise<void>=Promise.resolve();

  // O papel fica pendente já na chamada, antes de qualquer await; a vez na fila vale até a tarefa terminar.
  async function run<T>(role: string,task: (signal: AbortSignal) => Promise<T>): Promise<T> {
    if(pending.has(role))throw Error('Este serviço já está iniciando.');
    const controller=new AbortController(),{signal}=controller,previous=queue;
    let settle: () => void=()=>{};
    const settled=new Promise<void>(resolve=>{settle=resolve;});
    queue=previous.then(()=>settled);
    pending.set(role,{controller,settled});changed();
    try {
      await untilAborted(previous,signal);
      signal.throwIfAborted();
      return await task(signal);
    } catch(error) {
      if(signal.aborted)throw Error('Início cancelado.');
      throw error;
    } finally {pending.delete(role);settle();changed();}
  }
  function cancel(role: string): Promise<void> {
    const start=pending.get(role);
    start?.controller.abort();
    return start?.settled||Promise.resolve();
  }
  return {run,cancel,has:(role: string)=>pending.has(role),any:()=>pending.size>0,
    cancelAll:()=>{for(const start of pending.values())start.controller.abort();}};
}

module.exports={createStarts,untilAborted};
