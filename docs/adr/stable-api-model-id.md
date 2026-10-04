# ADR: identificador estável para o modelo na API

Status: aceito em 2026-10-03

O launcher serve um único GGUF por vez. A API usa o alias fixo `modelo-local` via `llama-server --alias`, evitando caminhos Windows em clientes Linux e reconfiguração a cada troca de GGUF. A interface mostra esse identificador junto do endpoint. A CLI mantém seus argumentos. Clientes existentes devem migrar o identificador do caminho GGUF para `modelo-local`; a pasta e o perfil reais do modelo continuam selecionados no launcher. Mudar de GGUF exige parar e reiniciar o servidor. O alias não garante contexto ou ferramentas equivalentes entre modelos. A versão 0.4.0 registra a alteração de contrato anterior à versão 1.0.
