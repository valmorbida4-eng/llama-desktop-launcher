# ADR: API local de controle para o DevTools

Status: aceito em 2026-11-21

O DevTools precisa abrir o launcher pelo atalho do Windows, escolher modelos e ligar ou desligar o servidor principal e o decisor sem a tela. Adicionamos uma API HTTP em `127.0.0.1:8787` (`src/control_api.ts`) com `GET /v1/control/state` e `POST /v1/control/start`, `stop` e `quit`.

- **Desligada por padrão.** Liga só pela caixa em **Configurações > 08 · API de controle**, gravada em `settings.json` (`controlApi`). A variável de ambiente fornece o token, mas não liga a API sozinha: a decisão de abrir a porta fica na tela.
- **Token dedicado**, separado da chave do servidor. Vem de `DEVTOOLS_LAUNCHER_TOKEN` quando a variável existe (o cliente e o launcher leem a mesma variável do usuário) ou de `control-api-token.txt`, gerado com 32 bytes aleatórios. Comparação em tempo constante sobre os hashes.
- **Só loopback, sem CORS.** O servidor escuta em `127.0.0.1`, recusa `Host` diferente de `127.0.0.1:8787`/`localhost:8787` (DNS rebinding) e não envia cabeçalhos CORS, então páginas no navegador não conseguem chamar a API com o Bearer.
- **IDs do catálogo, não caminhos.** O ID é `m_` + 16 hex do SHA-256 do caminho normalizado (minúsculas no Windows): estável entre execuções e sem expor pastas. O pedido de início só escolhe entre os modelos já encontrados nas pastas configuradas.
- **Mesmo ciclo de vida da tela.** Os handlers `launch`, `stop`, `decider-start` e `decider-stop` viraram funções (`startServer`, `stopServer`, `startDecider`, `stopDecider`) usadas pelo IPC e pela API, com a mesma validação de perfil, motor e hardware. A API sempre inicia em `127.0.0.1`, usa o perfil salvo e o decisor salvo e passa `persist:false` para não trocar o endereço, as sessões nem o decisor escolhidos na tela.
- **Respostas síncronas.** `start` responde quando o modelo carregou (ou com o erro do motor) e `stop` quando o processo terminou, para o cliente não precisar consultar o estado em laço. Um segundo `start` do mesmo papel durante o carregamento recebe 409; `stop` interrompe o carregamento.
- **Uma instância só** (`requestSingleInstanceLock`): abrir pelo atalho com o launcher aberto foca a janela existente em vez de criar outra que disputaria a porta 8787 e as portas dos servidores.

É funcionalidade nova compatível: versão 0.12.0 conforme SemVer.
