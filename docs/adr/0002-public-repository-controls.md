# ADR 0002: Controles do repositório público

Status: aceito em 2026-09-28

## Contexto

O código e os instaladores do Llama Desktop Launcher são distribuídos publicamente. O projeto é mantido inicialmente por uma pessoa, e o processo de release gera pacotes para cinco plataformas.

## Decisão

A branch padrão `main` exige pull request, resolução das conversas e sucesso do check `test` do workflow `CI`. O número de aprovações obrigatórias é zero para não impedir o mantenedor único de integrar mudanças. A regra bloqueia exclusão e force push, sem lista de exceções. As tags `v*` podem ser criadas para novas releases, mas não podem ser alteradas, excluídas ou atualizadas à força.

O GitHub Actions aceita somente ações do próprio repositório e ações criadas pelo GitHub, exigindo referência por SHA completo. O token padrão permanece somente de leitura; o job de release recebe `contents: write` apenas para publicar a release.

Foram ativados: grafo de dependências, alertas de vulnerabilidade e malware do Dependabot, atualizações de segurança agrupadas, CodeQL padrão, alertas e proteção contra segredos em pushes, e relato privado de vulnerabilidades. Releases publicadas após a ativação da imutabilidade não poderão ter tags nem assets modificados.

## Consequências

Mudanças em `main` passam por uma branch e pelo CI. A regra de tags não impede criar uma nova tag de versão. O novo fluxo de release cria um rascunho e só publica depois de anexar os instaladores e checksums; deve ser comprovado na próxima release. A imutabilidade não se aplica retroativamente às releases antigas. Os instaladores Windows e macOS ainda dependem de certificados externos para assinatura; isso não foi incluído nesta decisão.