'use strict';

const GIB = 1024 ** 3;
const links = Object.freeze({
  all: 'https://huggingface.co/models?library=gguf&sort=most_params',
  quantized: 'https://huggingface.co/models?library=gguf&apps=llama.cpp&base_model_relation=quantized&sort=most_params',
  moe: 'https://huggingface.co/models?library=gguf&apps=llama.cpp&sort=most_params&search=moe',
  dense: 'https://huggingface.co/models?library=gguf&apps=llama.cpp&sort=most_params&search=f16',
  full: 'https://huggingface.co/models?library=gguf&apps=llama.cpp&sort=most_params&search=f16',
});

function tier(memoryGiB) {
  if (memoryGiB < 8) return { quantized: '0,5B a 1,5B', full: 'até 0,5B', maxFileGiB: 1, example: 'Qwen2.5 0.5B Instruct', exampleUrl: 'https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF' };
  if (memoryGiB < 12) return { quantized: '0,5B a 3B', full: 'até 1B', maxFileGiB: 3, example: 'Qwen2.5 1.5B Instruct', exampleUrl: 'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF' };
  if (memoryGiB < 24) return { quantized: '3B a 8B', full: 'até 3B', maxFileGiB: 6, example: 'Qwen2.5 3B Instruct', exampleUrl: 'https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF' };
  if (memoryGiB < 48) return { quantized: '7B a 14B', full: 'até 7B', maxFileGiB: 11, example: 'Qwen2.5 7B Instruct', exampleUrl: 'https://huggingface.co/Qwen/Qwen2.5-7B-Instruct-GGUF' };
  return { quantized: '14B a 30B', full: 'até 14B', maxFileGiB: 22, example: 'Qwen2.5 14B Instruct', exampleUrl: 'https://huggingface.co/Qwen/Qwen2.5-14B-Instruct-GGUF' };
}

function buildGuidance({ hardware, gpu = {}, availableDiskBytes = null, model = null, settings = null }: any) {
  if (!hardware || !Number.isFinite(hardware.memoryBytes) || hardware.memoryBytes <= 0) throw Error('Dados de memória indisponíveis.');
  const ramGiB = hardware.memoryBytes / GIB;
  const fit = tier(ramGiB);
  const diskGiB = Number.isFinite(availableDiskBytes) ? availableDiskBytes / GIB : null;
  const gpuName = gpu.name || 'não identificada';
  const vramText = Number.isFinite(gpu.memoryBytes) && gpu.memoryBytes > 0 ? `${(gpu.memoryBytes / GIB).toFixed(1)} GB` : 'não medida';
  const summary = `${ramGiB.toFixed(1)} GB RAM · ${hardware.logicalCores || '?'} threads de CPU · GPU ${gpuName} · VRAM ${vramText}${diskGiB === null ? '' : ` · ${diskGiB.toFixed(1)} GB livres para modelos`}`;
  const caution = diskGiB !== null && diskGiB < fit.maxFileGiB * 1.5 ? 'O espaço livre pode limitar o download; confira o tamanho do GGUF antes de escolher.' : 'Comece com contexto 2048 e uma sessão; aumente depois de medir memória e velocidade.';
  const suggestions = [
    { title: 'Modelos Quantizados', detail: `Inicie com modelos de ${fit.quantized}. Sugerimos a quantização Q4_K_M (até cerca de ${fit.maxFileGiB} GB) pelo equilíbrio de memória, mas você pode optar por Q5 ou Q8 se sua RAM permitir. Exemplo sugerido: ${fit.example}.`, kind: 'quantized', exampleUrl: fit.exampleUrl, exampleName: fit.example, buttonText: 'Buscar quantizados no HF ↗' },
    { title: 'Modelos MoE (Mixture of Experts)', detail: `Modelos com especialistas esparsos. O arquivo total no disco e na RAM precisa comportar todos os especialistas (sugerimos arquivos de até cerca de ${fit.maxFileGiB} GB). Também disponíveis em Q4_K_M, Q5, Q8, etc.`, kind: 'moe', buttonText: 'Buscar MoE no HF ↗' },
    { title: 'Modelos Densos (sem quantização)', detail: `Modelos originais sem quantização (F16/BF16); preservam a fidelidade máxima, mas exigem muito mais RAM e espaço em disco (comece com até ${fit.full}).`, kind: 'dense', buttonText: 'Buscar densos F16 ↗' },
  ];
  const current = model ? `Modelo atual: ${model.name || 'GGUF selecionado'} (${(model.size / GIB).toFixed(2)} GB).` : 'Nenhum modelo foi instalado ainda.';
  const currentSettings = settings ? `Ajustes atuais: ${JSON.stringify(settings)}.` : '';
  const prompt = `Você é um especialista em llama.cpp e modelos GGUF. Analise este computador e sugira configurações e modelos que provavelmente caibam nele.

Hardware: ${summary}. Sistema: ${hardware.platform || 'desconhecido'} (${hardware.arch || 'arquitetura desconhecida'}). ${current} ${currentSettings}

Responda em português do Brasil com: (1) valores sugeridos para contexto, threads, batch, microbatch, camadas GPU, cache K/V, Flash Attention e camadas MoE na CPU, explicando o que depende da VRAM não medida; (2) até três modelos ou famílias GGUF compatíveis, separando modelo quantizado (Q4_K_M/Q5/Q8), MoE e denso sem quantização (F16/BF16); (3) tamanho estimado de arquivo e RAM para cada faixa; (4) riscos e medições que devo fazer. Se citar nomes específicos, peça para verificar repositório, licença e compatibilidade antes do download. Não invente URLs. Trate tudo como estimativa e não afirme que testou o hardware.`;
  return { hardware: { ...hardware, gpuName: gpu.name || null, gpuMemoryBytes: gpu.memoryBytes || null }, availableDiskBytes, summary, suggestions, caution, prompt, links };
}

module.exports = { links, tier, buildGuidance };
