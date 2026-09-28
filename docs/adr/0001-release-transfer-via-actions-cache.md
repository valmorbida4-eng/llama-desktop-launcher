# ADR 0001: Transferência dos instaladores para a release

Status: aceito para a v0.2.8 (validar no GitHub Actions)

## Contexto

Os cinco builds da v0.2.7 concluíram, mas o job de release foi impedido de iniciar pelo GitHub Billing. Os artefatos somavam aproximadamente 1,8 GB, acima da franquia de armazenamento de artefatos da conta gratuita em repositórios privados. O GitHub não informou qual limite específico acionou o bloqueio.

## Decisão

Cada job guarda somente seus instaladores finais em um cache com chave vinculada ao ID e à tentativa da execução. O job de release recupera as cinco chaves exatas, rejeita ausência ou nomes duplicados, gera SHA-256 e publica pela ação de release existente. A permissão `contents: write` continua restrita a esse job.

## Consequências

O cache tem cota e política de expiração próprias. Uma entrada ausente faz a publicação falhar sem divulgar um conjunto incompleto de pacotes. A correção evita novos artefatos do workflow, mas não remove os antigos nem garante que um bloqueio atual de Billing seja levantado. A publicação deve ser verificada em uma execução real, depois de resolvido o bloqueio da conta.
