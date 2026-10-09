# Plano de execução

1. **Auditar o launcher existente — concluído.** Preservar perfis por modelo, argumentos de GPU, cache, Flash Attention, batch, microbatch e MoE. A interface anterior é WinForms e depende de um runtime Windows externo.
2. **Criar aplicativo multiplataforma — implementado.** Electron com processo principal isolado, interface em português, telas separadas para modelos e configurações, dados em pasta do usuário, até dois locais de GGUF e escolha de runtime existente. Primeiro uso pode ser concluído sem motor/modelo.
3. **Instalar o motor — implementado.** Download sob demanda da release oficial `b11514` (antes `b11193`), com seleção de pacote por sistema e arquitetura; Windows/Linux Vulkan, macOS Metal. Validar digest SHA-256 quando a API do GitHub o fornecer.
4. **Ajustar o hardware — implementado parcialmente.** Preset inicial por RAM, CPU e tamanho/nome do modelo. Com GGUF disponível, `llama-bench` testa dois microbatches e apresenta a opção mais rápida. Leitura automática da VRAM e varredura mais ampla de parâmetros permanecem para próxima versão.
5. **Instaladores — configuração implementada.** Windows NSIS com escolha da pasta do app e atalho opcional; Linux AppImage/DEB/RPM; macOS DMG. Compilação por matriz de GitHub Actions. Os modelos são configurados na primeira execução, pois instaladores de sistema não devem armazenar pesos no diretório do app.
6. **Manuais — concluído.** Instruções detalhadas em português do Brasil e inglês, acessíveis pelo aplicativo e incluídas no instalador.
7. **Validação e entrega — parcial.** Dezoito testes automatizados passaram. A janela Electron abriu com dados temporários; primeira execução, navegação e controles essenciais foram verificados. Com o GGUF Bonsai já presente, o binário `b11193` existente carregou o servidor local (`/health` e `/v1/models`), respondeu no `llama-cli`, mediu dois microbatches no `llama-bench` e aceitou autenticação Tailscale (sem chave: HTTP 401; ponte local: HTTP 200). A instalação/desinstalação no notebook, o download do motor e a criação real da regra de firewall ainda precisam de teste interativo. Binários Linux/macOS requerem execução da matriz nesses sistemas.
8. **Desinstalação segura — implementado.** O NSIS exige fechamento normal do app antes de continuar, preserva dados do usuário por padrão e remove o atalho opcional. O app bloqueia pastas de modelos dentro da instalação e dos dados internos. O procedimento para cada sistema está documentado nos dois manuais.
9. **Paridade com o launcher anterior — implementada para os recursos identificados.** Acesso local/LAN/Tailscale, chave de API, ponte local, links para conexão, sessões simultâneas, conversa por `llama-cli`, criação opcional de regra do Firewall do Windows e importação manual dos perfis TSV foram adicionados. Os fluxos novos ainda requerem teste interativo com GGUF e dispositivos reais.
10. **Outros sistemas — em andamento.** Um tar.gz portátil Linux x64 foi gerado no Windows, teve permissões de execução corrigidas e seu conteúdo foi verificado. AppImage falhou neste host pela falta de privilégio para criar links simbólicos; DEB/RPM exigem URL do projeto e contato do mantenedor. O WSL registrado não inicia porque o VHDX está ausente. DMG só pode ser gerado em macOS. O workflow nativo está preparado, mas este checkout não possui remoto Git; falta definir repositório privado e metadados antes de executar a matriz.

## Licença

O código do launcher está sob licença MIT, com aviso de copyright em `LICENSE`. O motor llama.cpp e cada modelo GGUF conservam suas próprias licenças.

## Decisões ainda abertas

- Nome definitivo (provisório: Llama Desktop Launcher).
- O usuário escolheu navegação no Hugging Face com dois filtros Q4_K_M; implementado.
- Assinatura do instalador Windows e assinatura/notarização no macOS para distribuição pública.
