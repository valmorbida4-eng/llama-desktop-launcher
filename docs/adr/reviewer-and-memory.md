# ADR: revisor e checagem de memória

Status: implementado em 2026-11-22 (0.14.0)

O launcher rodava um modelo de texto e um decisor. O pedido foi um segundo modelo, revisor, desde que a máquina comporte os três.

- **Processo próprio, só em loopback** (`src/reviewer.ts`): portas 8081–8089 (8081 é o padrão do campo Revisor local do DevTools), alias `modelo-revisor`, sem `-fit`. Ou cabe inteiro no dispositivo, ou não inicia. O principal, com a 8080 ocupada, passou para 8100–8180.
- **VRAM livre medida no sistema** (`src/resources.ts`). O "free" do `--list-devices` é o orçamento de um processo: com um modelo de 12B carregado, informou 5,7 GB livres quando havia 1,5. No Windows usamos o registro do DirectX e os contadores de GPU, ligados por LUID; em NVIDIA, o `nvidia-smi`. Sem medição, avisa e não bloqueia.
- **Estimativa pelo motor:** `llama-fit-params --fit-print on`, com os mesmos argumentos do servidor e sem carregar pesos. Nos testes, o revisor na GPU integrada ficou a menos de 5% do real.
- **RAM em duas partes.** A usada já na carga decide "não cabe". Pesos em mmap e cálculo da CPU são elásticos e decidem só "no limite": no Kev-4B, o `--fit-print` indica 4,6 GB de cálculo que ficam quase todos intocados num pedido curto e são usados num pedido que enche o contexto.
- **Principal:** sozinho, inicia como antes. Com vizinhos, a margem do `-fit` sobe até cobrir a diferença entre o orçamento e a VRAM livre, só naquele início; uma margem maior do perfil é mantida.
- **Um início por vez** (`src/starts.ts`): a memória só fica ocupada no fim da carga, e dois inícios simultâneos passariam na mesma conta. Parar cancela o que está na fila.
- **Microbatch de até 128 no Vulkan:** com o modelo inteiro na placa, lotes maiores passam do limite de 2 s do driver da AMD.
- **Trio:** fora da placa dedicada, o revisor preferido tem até 6 GB. Na integrada de teste, o gemma E4B fez um pedido de 1.060 tokens de entrada e 200 de saída em 28–32 s; o Qwen3.5 9B levou 52 s com 1.502 de entrada e 100 de saída. Os dois cabem no prazo do chat local do DevTools (180 s, ajustável); a preferência é pela velocidade.
- **Decisor muito pequeno vai para a CPU:** até 256 MiB de arquivo. Com texto longo, no Ryzen 4650G, o Julia-1 (160 MiB) levou 1,6 s na CPU e 0,9 s na integrada; o d1-Omni 600M, 10 e 4,5 s; o Laya, 17 e 7 s; o Kev-4B, 65 e 34 s (o DevTools desiste do decisor em 30 s). O decisor salvo mantém a preferência; o pequeno entra como opção ao lado dele, porque acerta menos em casos vagos.
- **Esforço vem do template e mora no perfil do modelo:** nível fora da lista quebra todos os pedidos (o Qwen3.8 recusa `high`) ou não faz nada (gemma e Qwen3.5 só ligam e desligam; o gpt-oss só tem níveis). Vira `--reasoning off` ou `--reasoning-effort`, fora da estimativa de memória, porque o `llama-fit-params` não conhece essas opções. O `enable_thinking` do pedido vale mais que o servidor.

Limites conhecidos: a conta é uma foto do momento; a CLI no terminal separado e os subprocessos do vLLM e do Strata não são medidos; a conversa integrada sai da fila antes de terminar de carregar; no macOS a RAM livre fica sem medição. Testado de verdade só no Windows com AMD (RX 6600 e GPU integrada).
