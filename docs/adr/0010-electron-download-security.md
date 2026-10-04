# Correção das dependências de build e recursos públicos

## Contexto

GHSA-ch52-4w7c-c8xp afeta http-cache-semantics até 4.2.0 nas ferramentas de desenvolvimento. A versão 4.3.0 foi publicada em 2026-10-04 e está fora da faixa afetada. A v0.2.5 empacotava toda a pasta docs e incluía um relatório interno de auditoria.

## Decisão

Atualizar http-cache-semantics para 4.3.0 no lockfile, mantendo as dependências diretas e sem override de @electron/get. Validar npm ci, auditoria, testes e empacotamento. Manter Node.js 22.12+ exigido pelo projeto.

Preservar a lista explícita de manuais e licença em extraResources. Um teste impede a inclusão indiscriminada de docs ou diretórios locais de auditoria. O mock HTTPS compara o hostname exato. O nonce público de exemplo RFC 6455 tem uma exclusão Gitleaks específica por fingerprint, sem desabilitar a regra global.

## Consequências

A atualização afeta ferramentas de build, não modelos GGUF ou o motor llama.cpp. A versão instalada é mostrada automaticamente no cabeçalho. A retirada concluída dos artefatos antigos, a retirada pendente da release imutável e seus motivos ficam em docs/security-release-retirements.md, preservando tags e histórico Git.
