# ADR: forks compatíveis do llama.cpp (Avalon, tandem.cpp)

Status: aceito em 2026-11-15

## Contexto

O vídeo "llama.cpp 1.0 Is Here — Can It Finally Catch Strata?" (Code Unpacked) cita dois projetos sobre o llama.cpp com números perto ou acima do Strata:

- [Avalon](https://github.com/freriadoc/Avalon) (MIT): fork feito para um modelo, o Qwen3.8-Flash-Next, num GGUF próprio com tipos que o llama.cpp oficial não tem. Sem pacotes prontos; compila no Linux com ROCm ou CUDA; no Windows há uma [adaptação de terceiros](https://github.com/ppkrol/Avalon_windows).
- [tandem.cpp](https://github.com/ewhacc/tandem.cpp) (sem licença declarada): patches sobre um commit fixo do llama.cpp, para qualquer modelo MoE que não cabe na VRAM. Também sem pacotes prontos.

Os dois geram o mesmo `llama-server`, com as opções do llama.cpp e algumas próprias, e em geral sem `llama-bench`.

## Decisão

- O launcher **não baixa, não compila e não redistribui** os forks. O usuário compila e escolhe a pasta em **Escolher pasta existente**, como já fazia com qualquer `llama-server`.
- `src/engine_build.ts` identifica o build com `llama-server --version` (número e commit) e com uma opção que só o fork tem no `--help`: `--moe-cache-cpu-overlap` (Avalon) e `--moe-cache-margin-mib` (tandem.cpp). Nenhuma das duas existe em `common/arg.cpp` do `b12359`. O resultado fica em `settings.json` (`engineBuild`, com a pasta) e aparece no cartão do motor e no relatório de diagnóstico.
- Autotuning sem `llama-bench`: as etapas do `llama-bench` medem com um `llama-server` curto, que é mais lento porque recarrega o modelo.
- Perfil: **Argumentos extras do llama-server**, divididos sem shell, no fim do comando. Ficam de fora as opções que o launcher controla ou que abririam o servidor: modelo, rede, porta, chave, alias, sessões, mmproj, SSL, `--path`, `--tools`, `--agent`, `--allow-unauthenticated-tools`, `--media-allow-private-urls` e CORS.
- Perfil: **Variáveis de ambiente**, só com os prefixos `GGML_`, `LLAMA_`, `AVALON_`, `TANDEM_`, `CUDA_`, `HIP_`, `HSA_` e `ROCR_`. Assim não dá para trocar `PATH`, `LD_PRELOAD` ou `NODE_OPTIONS`. Valem para o servidor, a conversa, o fit e o autotuning; não valem para a CLI no terminal externo.
- `draft-mtp` passa a aceitar uma cabeça MTP separada (`-md` com um GGUF que tem `mtp` no nome), como os dois forks usam.
- Receitas para o Qwen3.8-Flash-Next, tiradas do README de cada fork. Elas só preenchem os campos; o usuário confere e salva.

## Consequências

- Não há garantia de compatibilidade: o fork pode mudar opções sem aviso. O launcher mostra o build e não promete nada além do que o `--help` dele aceita.
- Nenhum fork foi rodado nesta máquina; a detecção e as receitas foram testadas só com saídas simuladas.
