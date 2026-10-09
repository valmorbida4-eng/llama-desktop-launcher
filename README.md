# Llama Desktop Launcher

**Manuais detalhados:** [Português (Brasil)](docs/MANUAL-pt-BR.md) · [English](docs/MANUAL-en.md). Versões PDF acompanham o aplicativo em `docs/`.

Aplicativo instalável para executar modelos GGUF com [llama.cpp](https://github.com/ggml-org/llama.cpp) no Windows, Linux e macOS. Derivado das ideias e dos ajustes do launcher WinForms feito para Célio em `Laucher Ollama.cpp com vulkan`. Este aplicativo **não é o Ollama** e não é um produto oficial da ggml-org.

## Funcionalidades

- Permite escolher e baixar um pacote oficial do llama.cpp na primeira execução ou depois, ou usar uma pasta de runtime já existente. A versão do motor usada é `b11514`.
- No Windows/Linux, oferece Vulkan, NVIDIA CUDA, AMD ROCm, Intel SYCL e CPU conforme a arquitetura e os pacotes disponíveis; no macOS, Metal. A escolha depende da GPU, não da marca do processador. Para aceleração, drivers e bibliotecas compatíveis precisam estar instalados no sistema.
- Configura até duas pastas de modelos GGUF, independentes da pasta do aplicativo. Detecta `mmproj` no mesmo diretório do modelo.
- Mantém perfis por modelo com GPU layers, dispositivo, contexto, cache K/V, camadas MoE na CPU, Flash Attention, threads, batch e microbatch.
- Apresenta três telas: **Llama** para conversa e servidor, **Modelos** para catálogo local e sugestões, e **Configurações** para motor, pastas e perfis. Sem motor ou modelo selecionado, abre em Configurações.
- Detecta RAM, CPU, GPU e VRAM quando o sistema as informa; sugere faixas de modelos mesmo antes do primeiro download. Com um modelo instalado, oferece um prompt para análise e permite testá-lo no terminal integrado. As respostas são sugestões para revisão, não ajustes automáticos.
- Sugere parâmetros iniciais com base em RAM/CPU/tamanho do GGUF. Após baixar um modelo, permite testar dois microbatches com `llama-bench` e comparar geração de tokens.
- Abre três filtros de modelos no Hugging Face: [MoE Q4_K_M](https://huggingface.co/models?library=gguf&apps=llama.cpp&base_model_relation=quantized&sort=most_params&search=moe+q4_k_m), [GGUF Q4_K_M](https://huggingface.co/models?library=gguf&apps=llama.cpp&base_model_relation=quantized&sort=most_params&search=q4_k_m) e [GGUF F16](https://huggingface.co/models?library=gguf&apps=llama.cpp&sort=most_params&search=f16). Cada modelo tem sua própria licença e restrições.
- Inicia `llama-server` localmente ou em um endereço disponível de LAN/Tailscale. O acesso pela rede exige chave de API; a interface local usa uma ponte autenticada.
- Permite 1 a 8 sessões simultâneas (`--parallel`) e copia os links da API e da interface para conexão.
- Permite conversar via `llama-cli` na janela do aplicativo ou abri-lo em um terminal separado, usando o perfil do modelo selecionado.
- No Windows, oferece criação opcional de regra de firewall limitada ao executável, à porta ativa e à faixa privada informada; o Windows solicita autorização de administrador.

## Obter o aplicativo sem o código-fonte

O código-fonte está no [repositório do projeto](https://github.com/valmorbida4-eng/llama-desktop-launcher). Os instaladores e as somas de verificação (`SHA256SUMS.txt`) estão na [Release correspondente do GitHub](https://github.com/valmorbida4-eng/llama-desktop-launcher/releases).

| Plataforma / Distribuição | Arquitetura | Pacote / Download direto | Descrição |
| --- | --- | --- | --- |
| **Windows** (10 / 11) | x64 | [`Llama Desktop Launcher Setup 0.5.1.exe`](https://github.com/valmorbida4-eng/llama-desktop-launcher/releases/download/v0.5.1/Llama.Desktop.Launcher.Setup.0.5.1.exe) | Instalador oficial NSIS com atalho opcional na área de trabalho. |
| **Linux** (Debian, Ubuntu, Mint, Pop!_OS) | x64 (amd64) | [`llama-desktop-launcher_0.5.1_amd64.deb`](https://github.com/valmorbida4-eng/llama-desktop-launcher/releases/download/v0.5.1/llama-desktop-launcher_0.5.1_amd64.deb) | Pacote nativo `.deb` para instalação via `apt` / `dpkg`. |
| **Linux** (Debian, Ubuntu) | ARM64 (aarch64) | [`llama-desktop-launcher_0.5.1_arm64.deb`](https://github.com/valmorbida4-eng/llama-desktop-launcher/releases/download/v0.5.1/llama-desktop-launcher_0.5.1_arm64.deb) | Pacote nativo `.deb` para placas e servidores ARM64. |
| **Linux** (Fedora, RHEL, openSUSE) | x64 (x86_64) | [`llama-desktop-launcher-0.5.1.x86_64.rpm`](https://github.com/valmorbida4-eng/llama-desktop-launcher/releases/download/v0.5.1/llama-desktop-launcher-0.5.1.x86_64.rpm) | Pacote nativo `.rpm` para instalação via `dnf` / `rpm`. |
| **Linux** (Fedora, RHEL, openSUSE) | ARM64 (aarch64) | [`llama-desktop-launcher-0.5.1.aarch64.rpm`](https://github.com/valmorbida4-eng/llama-desktop-launcher/releases/download/v0.5.1/llama-desktop-launcher-0.5.1.aarch64.rpm) | Pacote nativo `.rpm` para distribuições RPM em ARM64. |
| **Linux** (Portátil / Todas as distros) | x64 | [`Llama Desktop Launcher-0.5.1.AppImage`](https://github.com/valmorbida4-eng/llama-desktop-launcher/releases/download/v0.5.1/Llama.Desktop.Launcher-0.5.1.AppImage) | Executável portátil sem necessidade de instalação root. |
| **Linux** (Portátil / Todas as distros) | ARM64 | [`Llama Desktop Launcher-0.5.1-arm64.AppImage`](https://github.com/valmorbida4-eng/llama-desktop-launcher/releases/download/v0.5.1/Llama.Desktop.Launcher-0.5.1-arm64.AppImage) | Executável portátil para sistemas ARM64. |
| **macOS** (Apple Silicon M1/M2/M3/M4) | ARM64 | [`Llama Desktop Launcher-0.5.1-arm64.dmg`](https://github.com/valmorbida4-eng/llama-desktop-launcher/releases/download/v0.5.1/Llama.Desktop.Launcher-0.5.1-arm64.dmg) | Imagem de disco DMG nativa com aceleração Metal. |
| **macOS** (Intel) | x64 | [`Llama Desktop Launcher-0.5.1.dmg`](https://github.com/valmorbida4-eng/llama-desktop-launcher/releases/download/v0.5.1/Llama.Desktop.Launcher-0.5.1.dmg) | Imagem de disco DMG para Macs com processador Intel. |
| **Verificação de Integridade** | Todas | [`SHA256SUMS.txt`](https://github.com/valmorbida4-eng/llama-desktop-launcher/releases/download/v0.5.1/SHA256SUMS.txt) | Checksums SHA-256 de todos os arquivos da versão 0.5.1. |

Quando houver uma Release com o pacote do seu sistema, baixe o instalador por ela e siga o [manual em português](docs/MANUAL-pt-BR.md) ou [em inglês](docs/MANUAL-en.md). Se houver apenas o código-fonte, será preciso gerar o pacote na plataforma correspondente pelas instruções abaixo. O instalador não inclui modelos GGUF; o motor llama.cpp pode ser baixado pelo aplicativo na primeira execução.

## Instalação e uso

O código-fonte usa Node.js 22.12+ e npm. O aplicativo é escrito em TypeScript e compilado para `build/app/` antes de iniciar, testar ou empacotar:

```sh
npm ci
npm run build
npm test
npm run version:check
npm start
```

Para gerar instaladores, use `npm run dist:win` no Windows, `npm run dist:linux` no Linux ou `npm run dist:mac` no macOS. O workflow `.github/workflows/build.yml` prepara builds Windows x64, Linux x64/arm64 e macOS x64/arm64 em runners nativos. Uma tag `v*` gera os checksums `SHA256SUMS.txt` e publica os instaladores na GitHub Release correspondente. O despacho manual apenas valida os builds.

O projeto usa [Semantic Versioning](https://semver.org/) a partir de `0.1.0`. `npm run version:check` exige uma versão SemVer válida e igual em `package.json` e `package-lock.json`. Para preparar uma nova versão, use `npm version patch|minor|major --no-git-tag-version`, confira os instaladores e crie a tag `vX.Y.Z`. Antes de `1.0.0`, recursos compatíveis incrementam MINOR e correções incrementam PATCH.

O instalador atual é identificado pela versão `0.5.1`. Pacotes e arquivos antigos podem continuar em `dist/`, mas não incluem as correções e recursos desta versão.

Para verificações pontuais de macOS sem executar a matriz completa de plataformas, o workflow `.github/workflows/build-macos-preview.yml` pode ser acionado manualmente para testar e validar os pacotes Intel e Apple Silicon.

No Windows, o instalador NSIS permite escolher a pasta do aplicativo e marcar um atalho da área de trabalho. No Linux, DEB/RPM seguem o gerenciador de pacotes da distribuição; AppImage é uma opção portátil. No macOS, abra o DMG e arraste o aplicativo para a pasta escolhida. As duas localizações de modelos são escolhidas e podem ser alteradas no primeiro uso e depois, dentro do aplicativo. Modelos não são removidos ao desinstalar o app.

## Desinstalação segura

Feche o aplicativo normalmente antes de desinstalar; isso encerra o `llama-server` iniciado por ele. No Windows, o desinstalador pede para fechar o app e permite tentar novamente, sem encerrá-lo à força. Use **Configurações > Aplicativos instalados** do Windows. Ele remove a pasta do aplicativo e os atalhos, mas preserva por padrão `settings.json`, os motores baixados sob `engines/` e as pastas de modelos. No Linux, remova DEB/RPM pelo gerenciador de pacotes; para AppImage, apague o arquivo. No macOS, mova o `.app` para o Lixo. Em todos os sistemas, revise separadamente os dados do usuário antes de apagá-los manualmente. O app impede escolher pastas de modelos dentro da instalação ou de seus dados internos.

No primeiro uso, a tela **Configurações** permite escolher o backend antes de baixar `llama.cpp`, selecionar uma pasta de motor existente e escolher até duas pastas de GGUF. Para uma RTX 4060 no Windows x64, escolha **NVIDIA CUDA 12.4**; o aplicativo baixa também as DLLs CUDA oficiais. O driver NVIDIA precisa ser compatível. Vulkan continua disponível para GPUs AMD, Intel e NVIDIA; ROCm e SYCL exigem hardware e runtime compatíveis. A marca da CPU não determina o backend. Você pode clicar em **Concluir e ir para Llama** e voltar a **Configurações** a qualquer momento. Use **Modelos** para localizar GGUF e avaliar sugestões; use **Llama** para conversar no terminal integrado, abrir a CLI externa ou iniciar o servidor para clientes API ou abrir sua interface no navegador. Se já usa o launcher antigo, selecione a pasta `b11193-vulkan` existente e a pasta que contém seus modelos. Depois, em **Configurações**, use **Importar perfis TSV** e selecione `launcher-profiles.tsv`. A importação preserva perfis já existentes e associa apenas os caminhos de modelos encontrados nas pastas configuradas.

## Empacotamento e limites atuais

As versões oficiais de Linux usadas aqui são construídas em Ubuntu; a compatibilidade com outras distribuições depende da glibc e bibliotecas do sistema. macOS exige Metal para GPU. Para distribuir amplamente, serão necessários certificado de assinatura Windows e assinatura/notarização Apple. Nesta versão, o runtime é baixado depois da instalação e os modelos são obtidos pelo usuário. Ainda não há downloader GGUF integrado; a VRAM só é mostrada quando uma ferramenta do sistema fornece um valor confiável. O benchmark mede prompt e geração, não o tempo total de uma conversa. Os links de rede dependem das regras de firewall do sistema e clientes remotos precisam enviar a chave de API. A regra do firewall é opcional e exige ação do usuário.

## Criadores e créditos

- **llama.cpp:** iniciado por [Georgi Gerganov](https://github.com/ggerganov) e desenvolvido pelos [colaboradores do projeto ggml-org](https://github.com/ggml-org/llama.cpp/blob/master/AUTHORS). Código original sob [licença MIT](https://github.com/ggml-org/llama.cpp/blob/master/LICENSE). Os binários são baixados diretamente das [releases oficiais](https://github.com/ggml-org/llama.cpp/releases/tag/b11514); consulte a licença no repositório original.
- **Launcher original para Célio:** interface WinForms, ponte local e auxiliar de firewall criados com Codex para Célio; serviram como base funcional para os ajustes avançados deste aplicativo.
- **Este aplicativo:** desenvolvido para Célio com Codex e disponibilizado sob a [licença MIT](LICENSE), com copyright de Célio. Os links diretos dependem da publicação dos instaladores como assets da Release correspondente. A licença do launcher não altera as licenças do llama.cpp nem dos modelos GGUF.

Os créditos não implicam participação ou endosso dos autores do llama.cpp neste launcher.


### Iniciar o servidor sem abrir o navegador

Clique em **Iniciar servidor** para carregar o modelo e mostrar o endpoint da API sem abrir o navegador. Após o carregamento, **Abrir no navegador** abre a interface do servidor existente sem recarregar o modelo. Use **Parar servidor** para encerrá-lo. Encerre a conversa integrada ou a CLI externa antes de iniciar um servidor.

Para conectar o OpenCode em outro computador ou VM, selecione um endereço LAN ou Tailscale antes de iniciar. Copie o link da API terminado em `/v1` e a chave; o cliente deve enviar a chave como Bearer token. No cliente, consulte `/v1/models`: o identificador será sempre `modelo-local`, independentemente do GGUF selecionado. Configure esse identificador uma vez no OpenCode e defina `model` como `llama-local/modelo-local` para torná-lo padrão. Para trocar de modelo, pare o servidor, selecione outro GGUF e inicie novamente; conversas existentes não são reiniciadas automaticamente. O endpoint e a chave precisam continuar correspondendo ao servidor ativo. Limites de contexto e suporte a ferramentas dependem do modelo escolhido e dos ajustes do servidor. No OpenCode, configure um provedor compatível com OpenAI com esse endpoint e selecione o modelo. Os arquivos do projeto são editados na máquina que executa o OpenCode; a inferência ocorre no servidor. A conversa da CLI sozinha não oferece ferramentas para editar arquivos. No Windows, a CLI externa abre em uma janela visível do PowerShell.


Use **Copiar comando Bash** (Linux/macOS) ou **Copiar comando PowerShell** (Windows) ao lado do endpoint. Cole no terminal, na pasta do projeto. O comando configura o provedor e modelo para aquela execução via `OPENCODE_CONFIG_CONTENT`, sem editar seu arquivo de configuração. Em acesso LAN/Tailscale, ele solicita a chave com entrada oculta; a chave não é incluída no comando copiado. O OpenCode precisa estar instalado. Copie novamente se mudar o endpoint, contexto ou sessões simultâneas. As demais configurações do OpenCode continuam aplicadas, salvo valores de provedor/modelo sobrescritos pela configuração temporária.


### Compartilhar acesso na rede interna ou Tailscale

Com o servidor ativo em LAN/Tailscale, use **Copiar link com acesso** para abrir a interface no navegador de outro computador sem digitar uma chave. Use **Copiar Bash com acesso** ou **Copiar PowerShell com acesso** para abrir o OpenCode na pasta do projeto sem pedir a chave. Esses comandos incluem uma credencial temporária de compartilhamento; quem recebê-los poderá usar o modelo.

O link e os comandos compartilhados valem somente para a execução atual. **Revogar acesso compartilhado** invalida todos os anteriores e interrompe conexões compartilhadas existentes; copie novos para conceder acesso novamente. Parar o servidor ou fechar o launcher encerra esse acesso; reiniciar gera uma nova credencial. Isso não revoga a chave permanente da API nem clientes que a usam diretamente. No navegador, o token sai da barra de endereço após a autenticação e fica em cookie HttpOnly.

O compartilhamento usa uma porta adicional de 8181 a 8280; a API original usa 8080 a 8180. No Windows, o botão de firewall libera ambas as portas, limitadas ao executável correspondente e à faixa informada. Linux/macOS exigem liberar as duas portas conforme o firewall local. O OpenCode deve estar instalado no cliente. Prefira Tailscale; uma LAN com HTTP não cifra o conteúdo. Se mudar o modelo, contexto, endereço ou sessões, copie os comandos novamente. Acesso compartilhado autoriza uso do modelo, não acesso automático aos arquivos do servidor.


### Conectar outros aplicativos

Em **Conectar aplicativo**, selecione OpenCode, Pi, Hermes, Aider, Continue, Cline, Codex ou Genérico. OpenCode e Aider oferecem comandos Bash/PowerShell: execute na pasta do projeto, com o cliente já instalado. Os demais oferecem **Copiar configuração** e instruções de onde mesclar os dados. O launcher não sobrescreve configurações nem instala clientes.

Para Pi, mescle em `~/.pi/agent/models.json` e selecione `llama-local/modelo-local` em `/model`. No Hermes, mescle o bloco `model` em `config.yaml` e execute `hermes chat`. A documentação atual exige ao menos 64000 tokens por sessão para ferramentas; a configuração exporta o contexto real, sem aumentá-lo artificialmente. No Continue, mescle o bloco `models` na configuração YAML existente. No Cline, escolha OpenAI Compatible e preencha Base URL, API Key e Model ID. Genérico fornece esses campos para outros clientes compatíveis.

**Copiar configuração com acesso** inclui a credencial temporária revogável e o endpoint compartilhado. A configuração direta em rede contém `SUBSTITUA_PELA_CHAVE_DA_API`: preencha com a chave permanente antes de usar. Preserve os providers, modelos e demais ajustes já existentes. Configurações compartilhadas salvas precisam ser atualizadas após revogar ou reiniciar o servidor.

Codex aparece como experimental: a configuração exige Responses API no servidor ou em um adaptador e ainda não foi validada com este motor. Compatibilidade OpenAI não garante suporte a todos os protocolos. Ferramentas, contexto e qualidade de execução dependem do modelo GGUF; suporte a visão não é presumido. O aplicativo trabalha nos arquivos do cliente onde roda.

### APIs de aplicativos

Selecione **Genérico - OpenAI Compatible**. Para acesso temporário, use **Copiar configuração com acesso** e o endpoint compartilhado. Para integração persistente, use **Copiar configuração**, a API direta e a chave de **Copiar chave** no lugar de `SUBSTITUA_PELA_CHAVE_DA_API`. A chave direta permanece entre reinícios até ser trocada; o servidor precisa estar iniciado e o IP/porta podem mudar. Não misture credenciais entre as duas modalidades.

Use Base URL terminada em `/v1`, modelo `modelo-local` e autenticação Bearer. Consulte `/models` antes de chamar `/chat/completions`. Os [manuais](docs/MANUAL-pt-BR.md) incluem passo a passo, exemplos Bash/curl, PowerShell e Python, streaming, limites de contexto e diagnóstico de erros.

Na v0.4.1, o download do motor usa uma pasta temporária junto ao destino final, corrigindo a instalação no Linux quando `/tmp` e `/home` estão em sistemas de arquivos diferentes. O fluxo de download também evita acumular listeners a cada espera de escrita.

Na v0.4.2, o cabeçalho mostra automaticamente a versão instalada em todas as telas. A dependência indireta de build `http-cache-semantics` foi atualizada para 4.3.0, fora da faixa afetada por GHSA-ch52-4w7c-c8xp; o mock HTTPS do teste valida o hostname exato. O motor continua na versão testada `b11193`.

Na v0.4.3, o motor passa para a release `b11514` do llama.cpp. Os nomes dos pacotes e backends oferecidos não mudaram; a versão fica fixada em `ENGINE_TAG` em `src/engine.ts`, e o workflow semanal **Engine update** propõe novas releases por PR.

Na v0.5.0, o aplicativo avisa quando há uma versão nova do launcher. Ao iniciar e uma vez por dia (opção desligável), consulta a release mais recente no GitHub; em **Configurações > 05 · Atualizações** baixa o pacote do sistema, confere com o `SHA256SUMS.txt` e abre o instalador no Windows ou entrega o `.dmg`, a AppImage ou o DEB/RPM verificado para instalação manual. Veja [o ADR](docs/adr/app-update-check.md).

Na v0.5.1, o instalador do Windows guarda a escolha do atalho da área de trabalho. Instalações silenciosas (`/S`) e atualizações mantêm essa escolha; sem escolha anterior, criam o atalho, como a opção marcada do instalador. Antes, a atualização silenciosa removia o atalho.

A revisão dos arquivos publicados e a situação da v0.2.5 estão registradas em [Retirada de versões anteriores](docs/security-release-retirements.md).
