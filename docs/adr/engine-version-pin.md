# ADR: versão fixa do motor llama.cpp

Status: aceito em 2026-10-08

O llama.cpp publica uma release a cada merge, sem canal estável, e muda nomes de pacotes e argumentos sem aviso. O launcher baixa uma única release fixada em `ENGINE_TAG` (`src/engine.ts`), hoje `b11514`; os nomes de pacotes e os testes derivam dela. Seguir `latest` entregaria binários não testados e poderia quebrar a instalação ou o servidor no usuário. O workflow `Engine update` verifica semanalmente a release mais recente, confere com `scripts/check-engine-release.js` que todos os backends oferecidos têm pacote, roda os testes e abre um PR que só troca `ENGINE_TAG`. A validação manual do motor, a atualização dos manuais e a nova versão do app acontecem nesse PR antes do merge. Quem quiser outra build usa **Escolher pasta existente**. PRs criados com o `GITHUB_TOKEN` não disparam o CI; o secret opcional `ENGINE_UPDATE_TOKEN` (PAT com `contents` e `pull-requests`) resolve isso, e sem ele basta fechar e reabrir o PR.
