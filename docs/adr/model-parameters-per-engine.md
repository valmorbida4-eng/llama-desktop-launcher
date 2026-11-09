# Parâmetros por motor, detecção por modelo e autotuning (proposta para a v0.9.0)

Status: **aprovada com ajustes em 2026-11-08** (seção 5). Fontes conferidas: `common/arg.cpp`, `common/common.h`,
`common/speculative.cpp`, `tools/llama-bench/llama-bench.cpp` e `tools/fit-params/fit-params.cpp` do llama.cpp
**b12211**; `vllm/engine/arg_utils.py`, `vllm/config/cache.py` e `vllm/config/speculative.py` do vLLM **v0.32.0**;
`serve/server.py` atual do Strata (Niko1221) e do PolyStrata (simplexai-labs).

## Correções ao pedido original, achadas nas fontes

| Pedido | O que o b12211 tem de fato | Consequência |
|---|---|---|
| `--no-mmap`, `--mlock` | não existem mais; viraram `-lm/--load-mode {auto,none,mmap,mlock,mmap+mlock,dio}` | um campo "Modo de carga" |
| `--mtp` | só baixa a cabeça MTP do Hugging Face (`llama-download`) | MTP local = `--spec-type draft-mtp`, que usa as camadas NextN do próprio GGUF, sem modelo extra |
| `-fitp/--fit-print` | é da ferramenta `llama-fit-params`, não do `llama-server` | o valor automático vem de `llama-fit-params`, que vem no pacote oficial e imprime `-c N -ngl N [-ts …] [-ot …]` |
| autotuning de `-tb`, `--moe-cache-mib`, especulativa com llama-bench | o llama-bench não tem essas opções | 2ª etapa do autotuning usa um `llama-server` curto e mede pelos `timings` da resposta |

## 1. Esquema de parâmetros por motor

Regra geral: cada campo tem o estado **automático** (o launcher não passa a opção e o motor decide). Quando o
valor automático pode ser conhecido, ele aparece ao lado: `auto · 28 camadas (fit)`.

### llama.cpp (GGUF)

| Grupo | Campo | Opção | Aparece quando | Valor automático mostrado |
|---|---|---|---|---|
| GPU e memória | Camadas na GPU | `-ngl` | há GPU | `llama-fit-params` |
| | Contexto | `-c` | sempre | `llama-fit-params` (limitado ao contexto de treino do GGUF) |
| | Contexto mínimo do fit | `-fitc` | contexto em auto | 4096 |
| | Margem livre por GPU (MiB) | `-fitt` | há GPU | 1024 |
| | Dispositivo | `-dev` | 1+ dispositivo em `--list-devices` | todos |
| | Divisão entre GPUs | `-sm none/layer/row/tensor` | 2+ GPUs | layer |
| | Proporção por GPU | `-ts` | 2+ GPUs | `llama-fit-params` |
| | KV fora da GPU | `-nkvo` | há GPU | desligado |
| | Modo de carga | `-lm` | sempre | auto (mmap) |
| MoE | Camadas de especialistas na CPU | `-ncmoe` | GGUF com `expert_count > 0` | estimado pelo `-ot` do fit |
| | Cache de especialistas na GPU (MiB) | `--moe-cache-mib` | MoE + GPU | 0 (desligado) |
| | Fração das faltas feita na CPU | `--moe-cache-cpu-share` | cache MoE > 0 | 0,00 |
| Modelo denso | Camadas com FFN na CPU | `-ncffn` | sem especialistas + GPU | 0 |
| CPU | Threads de geração | `-t` | sempre | núcleos físicos detectados |
| | Threads de prompt | `-tb` | sempre | igual a `-t` |
| | Batch / microbatch | `-b` / `-ub` | sempre | 2048 / 512 |
| Cache KV e atenção | Cache K / V | `-ctk` / `-ctv` | sempre (V quantizado exige Flash Attention) | f16 |
| | Flash Attention | `-fa` | sempre | auto |
| | Cache SWA completo | `--swa-full` | GGUF com `attention.sliding_window` | desligado |
| | Checkpoints de contexto | `-ctxcp` | servidor + modelo SWA, híbrido ou recorrente | 32 |
| | Reuso de cache por deslocamento | `--cache-reuse` | servidor | 0 |
| | KV unificado | `-kvu` | servidor + 2 ou mais sessões | desligado (o launcher fixa `--parallel`) |
| Especulativa | Tipo | `--spec-type` | sempre: `none`, `ngram-mod`, `ngram-simple`; `draft-mtp` só com `nextn_predict_layers > 0`; `draft-simple` com modelo rascunho | none |
| | Modelo rascunho | `-md` | tipo `draft-simple` (lista dos GGUF encontrados, mesma arquitetura) | — |
| | Tokens por rascunho | `--spec-draft-n-max` | tipo diferente de none | 3 |

Fora do esquema: opções de amostragem, RPC, `-ot` manual e as dezenas de ajustes finos de n-gram. `-fit on`
continua sempre ligado.

### vLLM 0.32.0 (pasta Hugging Face)

| Campo | Opção | Aparece quando | Valor automático mostrado |
|---|---|---|---|
| Contexto | `--max-model-len` | sempre | `max_position_embeddings` do config.json |
| Uso de memória da GPU | `--gpu-memory-utilization` | sempre | 0,90 |
| Tipo do cache KV | `--kv-cache-dtype auto/float16/bfloat16/fp8/fp8_e4m3/fp8_e5m2` | sempre | auto (tipo do modelo) |
| Tokens por lote | `--max-num-batched-tokens` | sempre | o vLLM decide |
| Cache de prefixo | `--enable-prefix-caching` / `--no-enable-prefix-caching` | sempre | ligado |
| GPUs (paralelismo de tensor) | `-tp` | 2+ GPUs; precisa dividir `num_attention_heads` | 1 |
| Paralelismo de especialistas | `--enable-expert-parallel` | modelo MoE e `-tp` > 1 | desligado |
| Pesos na RAM (GiB) | `--cpu-offload-gb` | sempre | 0 |
| Cache KV na RAM (GiB) | `--kv-offloading-size` | sempre | 0 |
| Sem CUDA graphs | `--enforce-eager` | sempre | desligado |
| Precisão | `--dtype` | só modelo sem `quantization_config` | auto |
| Quantização | — (só leitura) | modelo quantizado | `quant_method` do config.json |
| Especulativa | `--speculative-config` montado pelo launcher: `mtp` (só com `num_nextn_predict_layers`/`mtp_num_hidden_layers`) ou `ngram` + nº de tokens | sempre `ngram`; `mtp` quando o config indica | desligada |

Depois que o servidor sobe, o launcher lê do registro do vLLM o tamanho do cache KV e a concorrência máxima e
mostra como "em uso".

### Strata / PolyStrata

Somente leitura, tirado do `strata-*.json`: nome do modelo, contexto, sessões, GPU e os argumentos do motor.
Editáveis só se o `serve/server.py` **instalado** declarar a opção (o launcher procura `add_argument("--x"` no
arquivo, porque o Strata e o PolyStrata mudam rápido):

| Campo | Opção | Hoje |
|---|---|---|
| Sessões simultâneas | `--parallel` | só Strata |
| GPU(s) | `--gpu "0,2"` | Strata e PolyStrata |
| Fila máxima | `--max-queue` | Strata |
| Descarregar após ociosidade (s) | `--idle-unload` | Strata |
| VRAM livre mínima para carregar | `--min-free-vram-mib` | Strata |

## 2. Detecção do que o modelo suporta

- **GGUF**: novo leitor só do cabeçalho (`src/model_info.ts`), sem carregar pesos; lê `general.architecture`,
  `<arch>.block_count`, `expert_count`, `expert_used_count`, `nextn_predict_layers`, `attention.sliding_window`,
  `context_length` e o tipo de quantização. Resultado em cache por caminho + tamanho + data.
- **Hugging Face**: `config.json` (e `text_config`, quando houver): `num_experts`/`num_local_experts`/
  `n_routed_experts`, `num_nextn_predict_layers`/`mtp_num_hidden_layers`, `max_position_embeddings`,
  `quantization_config.quant_method`, `num_attention_heads`, `torch_dtype`.
- **Hardware**: `llama-server --list-devices` (nomes, memória total e livre de cada dispositivo) para o
  llama.cpp; `nvidia-smi --query-gpu=index,name,memory.total,memory.free` para vLLM e Strata.
- **Valores automáticos**: `llama-fit-params` com os ajustes atuais (leva poucos segundos e não ocupa a GPU de
  forma permanente). Depois de iniciar, `/props` do llama-server confirma contexto e sessões.

## 3. Interface

- O painel de ajustes é montado a partir do esquema do motor do modelo escolhido; campos de outros motores não
  aparecem.
- Campos do motor que o modelo não suporta aparecem desativados, com o motivo ("Modelo denso: não tem
  especialistas MoE"), recolhidos em "Não se aplicam a este modelo (N)".
- Cada campo tem a chave **Auto**; ligado, o campo fica cinza e mostra o valor automático conhecido.
- "Calcular valores automáticos" roda o `llama-fit-params`; roda sozinho ao abrir o perfil de um GGUF.
- Perfis antigos: os valores salvos são mantidos como estão (o comportamento não muda); campos novos entram
  como auto. `-ngl auto` salvo vira auto (é o mesmo efeito). O perfil ganha `version: 2`.

## 4. Autotuning

**llama.cpp** (botão "Otimizar automaticamente", com orçamento de 5, 10 ou 20 min e botão Cancelar):

1. `llama-fit-params` define o teto de memória (camadas, contexto, especialistas na CPU).
2. llama-bench, busca coordenada (um parâmetro de cada vez, mantendo o melhor): `-ncmoe` em volta do valor do
   fit (MoE), `-t` (quando há camadas ou especialistas na CPU), `-fa`, `-ub`, `-sm` (2+ GPUs). Configuração que
   não cabe na memória falha no llama-bench e sai da lista.
3. llama-server curto, só para o que o llama-bench não mede: `-tb`, `--moe-cache-mib` (0, 25% e 50% da VRAM livre
   depois da carga) e especulativa (none × draft-mtp × ngram-mod, com 2, 3 e 4 tokens). Mede pelos `timings` da
   resposta (tokens/s e taxa de aceitação do rascunho).
4. Pontuação: tokens/s de geração + tokens/s de prompt ÷ 100 (a mesma de hoje). O resultado preenche os campos;
   salvar o perfil continua sendo escolha sua.

Cache K/V **não** é trocado pelo autotuning por padrão, porque quantizar o cache muda a qualidade; uma caixa
"Permitir cache q8_0" libera esse teste.

**vLLM**: não há autotuning nesta versão. Cada tentativa recarrega o modelo e captura os CUDA graphs (minutos por
candidato, e no Windows dentro do Docker). Em vez disso, "Sugestão inicial" calcula contexto, uso de memória e
`-tp` a partir do config.json e da VRAM, e o painel mostra os valores reais lidos depois do início.

**Strata/PolyStrata**: não dá para otimizar pelo launcher. Quantização, contexto e GPU são decididos pelo
instalador deles e o servidor não tem ferramenta de benchmark.

## 5. Ajustes pedidos na aprovação

- **vLLM**: o launcher calcula e sugere os valores e então pergunta se você quer rodar o autotuning, avisando que
  leva alguns minutos e recarrega o modelo a cada tentativa. O autotuning do vLLM sobe o servidor com cada
  candidato (uso de memória da GPU, tokens por lote, tipo do cache KV e especulativa, quando o modelo suporta) e
  mede tokens/s numa requisição curta. Substitui o item "vLLM" da seção 4.
- **Cache K/V no autotuning do llama.cpp**: pode ser trocado (f16, q8_0, q4_0) sempre que for suportado; só o que
  não é suportado fica bloqueado (V quantizado sem Flash Attention, ou um tipo que o llama-bench recusa neste
  backend). No vLLM vale o mesmo para `--kv-cache-dtype`: o candidato que a GPU não aceita falha e sai da lista.
  Substitui a caixa "Permitir cache q8_0" da seção 4.
- **Não aplicáveis**: recolhidos em "Não se aplicam a este modelo (N)", cada um com o motivo.
- **Prioridade**: o orçamento é escolhido na hora (5, 10 ou 20 min); a prioridade padrão é a velocidade de
  geração, e dá para escolher "geração", "prompt longo" ou "equilíbrio":
  - geração: tokens/s de geração + tokens/s de prompt ÷ 100;
  - prompt longo: tokens/s de prompt + tokens/s de geração ÷ 10;
  - equilíbrio: média geométrica dos dois.
