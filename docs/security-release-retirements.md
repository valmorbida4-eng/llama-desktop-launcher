# Revisão e retirada de arquivos de versões anteriores

Data: 2026-10-04. Repositório: valmorbida4-eng/llama-desktop-launcher.

## Motivo e evidência — v0.2.5

O pacote .deb amd64 publicado inclui resources/docs/security-audit/relatorio-auditoria-seguranca.pdf, um documento de auditoria operacional que não era necessário para uso do aplicativo. O scanner não identificou credenciais nesse PDF. Sua retirada é uma medida para reduzir a divulgação de material interno, não uma afirmação de vazamento de senhas.

A configuração Git da v0.2.5 usa extraResources com a pasta docs inteira, compartilhada pelos alvos Windows, Linux e macOS. A presença do PDF foi verificada diretamente no .deb amd64; sua presença nos demais formatos é inferida dessa configuração comum. O PDF não consta no tree Git da tag.

## Ações concluídas

Foram excluídos inicialmente 20 artefatos do GitHub Actions vinculados às quatro execuções da v0.2.5 listadas abaixo. Com autorização adicional do usuário para retirar publicações antigas, foram excluídos os 58 artefatos restantes do inventário: 78 ao todo, sem artefatos remanescentes na conferência final. Para os demais artefatos, a justificativa é retirar downloads obsoletos; não foi confirmada exposição de credenciais. IDs, nomes e execuções estão em [inventário das exclusões](retired-releases/actions-artifacts-removed-2026-10-04.json). Tags e commits foram preservados.

| Execução | Artefatos excluídos |
| --- | --- |
| 36371673643 | installer-linux-x64 (ID 10949811043), installer-macos-arm64 (ID 10949710441), installer-windows-x64 (ID 10949301769), installer-linux-arm64 (ID 10948829343), installer-macos-x64 (ID 10948529861) |
| 36372860625 | installer-linux-arm64 (ID 10950415613), installer-linux-x64 (ID 10949972496), installer-windows-x64 (ID 10949926555), installer-macos-x64 (ID 10949528695), installer-macos-arm64 (ID 10949493581) |
| 36372955255 | installer-macos-arm64 (ID 10950435241), installer-linux-x64 (ID 10950216937), installer-windows-x64 (ID 10949992533), installer-macos-x64 (ID 10949693138), installer-linux-arm64 (ID 10949424471) |
| 36375656484 | installer-linux-arm64 (ID 10951036318), installer-macos-arm64 (ID 10950986492), installer-windows-x64 (ID 10950927124), installer-linux-x64 (ID 10950084804), installer-macos-x64 (ID 10949849901) |

## Situação da release — retirada concluída

O usuário autorizou explicitamente a retirada definitiva da publicação v0.2.5 em 2026-10-04. A release era imutável: o GitHub rejeitou a exclusão individual de seus assets (HTTP 422), por isso a publicação inteira (ID 397920687) e seus 18 assets foram excluídos. A tag v0.2.5 permaneceu com o mesmo objeto Git; os commits não foram alterados. A publicação não deve ser recriada, e links de download dessa release deixam de funcionar.

A retirada reduz a disponibilidade pública do relatório interno, mas não revoga cópias já baixadas. Não foi confirmada credencial nesse material. As demais releases foram mantidas nesta etapa; a seleção de outras publicações a retirar aguarda definição do usuário.

Os checksums e metadados originais estão em [docs/retired-releases/v0.2.5](retired-releases/v0.2.5/SHA256SUMS.txt) para preservar evidências e permitir comparação futura. Esses hashes são registros históricos, não uma recomendação para instalar a versão retirada.

## Prevenção e limites

Os pacotes atuais incluem somente os dois manuais e a licença como recursos extras. Um teste verifica essa lista explícita. .gitignore sozinho não impede que um arquivo local seja empacotado.

A revisão analisou 44 commits, 23 refs, 12 pacotes .deb amd64 e 25 PDFs. Não houve credencial confirmada. Logs do Actions não foram examinados por erro HTTP 403; demais artefatos e caches foram somente inventariados. Não se afirma ausência de riscos nesses conteúdos ou em cópias já baixadas por terceiros.
