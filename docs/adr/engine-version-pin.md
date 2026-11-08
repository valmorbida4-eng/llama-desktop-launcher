# ADR: versão fixa do motor llama.cpp

Status: aceito em 2026-10-08

O llama.cpp publica uma release a cada merge, sem canal estável, e muda nomes de pacotes e argumentos sem aviso. O launcher baixa uma única release fixada em `ENGINE_TAG` (`src/engine.ts`), hoje `b12211`; os nomes de pacotes e os testes derivam dela. Seguir `latest` entregaria binários não testados e poderia quebrar a instalação ou o servidor no usuário. O workflow `Engine update` verifica semanalmente a release mais recente, confere com `scripts/check-engine-release.js` que todos os backends oferecidos têm pacote, roda os testes e abre um PR que só troca `ENGINE_TAG`. A validação manual do motor, a atualização dos manuais e a nova versão do app acontecem nesse PR antes do merge. Quem quiser outra build usa **Escolher pasta existente**. PRs criados com o `GITHUB_TOKEN` não disparam o CI; o secret opcional `ENGINE_UPDATE_TOKEN` (PAT com `contents` e `pull-requests`) resolve isso, e sem ele basta fechar e reabrir o PR.

## Atualização em 2026-11-08: canal estável semver

A partir de 2026-10 o llama.cpp passou a publicar releases semver (`vX.Y.Z`) marcadas como "Latest", sem binários, e a marcar as builds `bNNNNN` como pre-release. A release semver traz o asset `nightly-tag.txt` com a build `bNNNNN` que ela representa (`v0.9.0` → `b12110`). Como o workflow lia `releases/latest` e exigia `^b[0-9]+$`, ele falhava toda semana desde 2026-10-19. Agora o workflow segue a release estável: lê `nightly-tag.txt` da release `latest` e propõe essa build; se a release `latest` não for semver com esse arquivo, cai para a build `bNNNNN` mais nova da lista de releases (pre-releases inclusas, tags semver ignoradas). `ENGINE_TAG` passou a `b12110`.

## Atualização em 2026-11-08: fixação à frente do canal estável

A pedido do usuário, `ENGINE_TAG` passou de `b12110` (a build da estável `v0.9.0`) para `b12211`, a build pre-release mais nova. Entre as duas, os pacotes NVIDIA CUDA 13.4 passaram a CUDA 13.5 no Windows e no Linux (x64 e arm64); o backend do launcher mudou de `cuda-13.4` para `cuda-13.5`. Quem instalou o pacote CUDA 13.4 continua com ele até baixar o motor de novo. `scripts/check-engine-release.js` confirmou todos os pacotes dos backends oferecidos, e todas as opções que o launcher passa ao `llama-server` e ao `llama-bench` existem em `common/arg.cpp` e `tools/llama-bench/llama-bench.cpp` da `b12211`.

Enquanto a fixação estiver à frente do canal estável, o workflow `Engine update` não propõe nada: ele segue a build da release semver mais nova e só abre PR quando ela passar de `b12211`. A validação manual do motor com um modelo de verdade continua pendente.
