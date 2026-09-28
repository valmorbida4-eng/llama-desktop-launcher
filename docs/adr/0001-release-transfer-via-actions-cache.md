# ADR 0001: Transferência dos instaladores para a release

Status: aceito (validar a publicação em uma execução real)

## Contexto

Os cinco builds da v0.2.7 concluíram, mas o job de release foi impedido de iniciar pelo GitHub Billing. Os artefatos somavam aproximadamente 1,8 GB, acima da franquia de armazenamento de artefatos da conta gratuita em repositórios privados. O GitHub não informou qual limite específico acionou o bloqueio.

## Decisão

Cada job guarda somente seus instaladores finais em um cache com chave vinculada ao ID e à tentativa da execução. O job de release recupera as cinco chaves exatas, rejeita ausência ou nomes duplicados e gera SHA-256. Ele cria um rascunho de release, anexa os instaladores e o checksum, e publica o rascunho somente depois que o upload termina. Em uma nova tentativa, um rascunho existente pode receber os mesmos arquivos novamente; uma release já publicada é recusada sem alteração. Esse fluxo permite ativar a imutabilidade de releases, que é aplicada quando a release é publicada.

As GitHub Actions externas usadas nos workflows são fixadas em SHAs integrais: `actions/checkout` v4.2.2 (`11bd71901bbe5b1630ceea73d27597364c9af683`), `actions/setup-node` v4.4.0 (`49933ea5288caeca8642d1e84afbd3f7d6820020`), `actions/cache` v4.2.4 (`0400d5f644dc74513175e3cd8d07132dd4860809`) e `actions/upload-artifact` v4.6.2 (`ea165f8d65b6e75b540449e92b4886f43607fa02`). Os SHAs foram conferidos diretamente nas referências de tags dos repositórios oficiais dessas ações.

O workflow de CI roda `npm ci`, `npm run version:check` e `npm test` em pull requests direcionados a `main` e em pushes para `main`. Ele concede apenas `contents: read`; o job de release eleva a permissão para `contents: write` somente quando uma tag `v*` aciona a publicação. Pull requests de forks não recebem segredos nem permissões de escrita.

## Consequências

O cache tem cota e política de expiração próprias. Uma entrada ausente faz a publicação falhar sem divulgar um conjunto incompleto de pacotes. A correção evita novos artefatos do workflow de release, mas não remove os antigos nem garante que um bloqueio atual de Billing seja levantado. A publicação deve ser verificada em uma execução real, depois de resolvido o bloqueio da conta. A imutabilidade ainda precisa ser ativada nas configurações do GitHub; a edição local do workflow não altera essa configuração.
