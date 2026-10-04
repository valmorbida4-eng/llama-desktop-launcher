# Revisão e retirada de arquivos de versões anteriores

Data: 2026-10-04. Repositório: valmorbida4-eng/llama-desktop-launcher.

## Motivo e evidência — v0.2.5

O pacote .deb amd64 publicado inclui resources/docs/security-audit/relatorio-auditoria-seguranca.pdf, um documento de auditoria operacional que não era necessário para uso do aplicativo. O scanner não identificou credenciais nesse PDF. Sua retirada é uma medida para reduzir a divulgação de material interno, não uma afirmação de vazamento de senhas.

A configuração Git da v0.2.5 usa extraResources com a pasta docs inteira, compartilhada pelos alvos Windows, Linux e macOS. A presença do PDF foi verificada diretamente no .deb amd64; sua presença nos demais formatos é inferida dessa configuração comum. O PDF não consta no tree Git da tag.

## Ações concluídas

Foram excluídos 20 artefatos de instaladores do GitHub Actions vinculados às quatro execuções da v0.2.5 listadas abaixo. Nenhuma outra versão foi excluída. Tags e commits foram preservados. A nota da release recebeu o aviso de retirada pretendida.

| Execução | Artefatos excluídos |
| --- | --- |
| 36371673643 | installer-linux-x64 (ID 10949811043), installer-macos-arm64 (ID 10949710441), installer-windows-x64 (ID 10949301769), installer-linux-arm64 (ID 10948829343), installer-macos-x64 (ID 10948529861) |
| 36372860625 | installer-linux-arm64 (ID 10950415613), installer-linux-x64 (ID 10949972496), installer-windows-x64 (ID 10949926555), installer-macos-x64 (ID 10949528695), installer-macos-arm64 (ID 10949493581) |
| 36372955255 | installer-macos-arm64 (ID 10950435241), installer-linux-x64 (ID 10950216937), installer-windows-x64 (ID 10949992533), installer-macos-x64 (ID 10949693138), installer-linux-arm64 (ID 10949424471) |
| 36375656484 | installer-linux-arm64 (ID 10951036318), installer-macos-arm64 (ID 10950986492), installer-windows-x64 (ID 10950927124), installer-linux-x64 (ID 10950084804), installer-macos-x64 (ID 10949849901) |

## Situação da release — pendente

Os 17 assets de instaladores, blockmaps e metadados de atualização NÃO foram excluídos. A release v0.2.5 é imutável e o GitHub rejeita a exclusão individual dos assets (HTTP 422). A exclusão da publicação inteira, necessária para retirar esses arquivos, foi bloqueada pela revisão automática de aprovação por exigir autorização específica para uma ação irreversível. A release e os 18 assets, incluindo SHA256SUMS.txt, continuam disponíveis até essa decisão.

Os checksums e metadados originais estão em [docs/retired-releases/v0.2.5](retired-releases/v0.2.5/SHA256SUMS.txt) para preservar evidências e permitir comparação futura. Esses hashes são registros históricos, não uma recomendação para instalar a versão retirada.

## Prevenção e limites

Os pacotes atuais incluem somente os dois manuais e a licença como recursos extras. Um teste verifica essa lista explícita. .gitignore sozinho não impede que um arquivo local seja empacotado.

A revisão analisou 44 commits, 23 refs, 12 pacotes .deb amd64 e 25 PDFs. Não houve credencial confirmada. Logs do Actions não foram examinados por erro HTTP 403; demais artefatos e caches foram somente inventariados. Não se afirma ausência de riscos nesses conteúdos ou em cópias já baixadas por terceiros.
