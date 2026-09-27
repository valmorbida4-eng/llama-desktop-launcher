# Llama Desktop Launcher

**Manuais detalhados:** [Português (Brasil)](docs/MANUAL-pt-BR.md) · [English](docs/MANUAL-en.md). Versões PDF acompanham o aplicativo em `docs/`.

Aplicativo instalável para executar modelos GGUF com [llama.cpp](https://github.com/ggml-org/llama.cpp) no Windows, Linux e macOS. Derivado das ideias e dos ajustes do launcher WinForms feito para Célio em `Laucher Ollama.cpp com vulkan`. Este aplicativo **não é o Ollama** e não é um produto oficial da ggml-org.

## Funcionalidades

- Permite baixar o binário oficial do llama.cpp na primeira execução ou depois, ou usar uma pasta de runtime já existente. A versão testada é `b11193`.
- Usa Vulkan no Windows/Linux e Metal no macOS. Para GPU, drivers compatíveis precisam estar instalados no sistema.
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

## Instalação e uso

O código-fonte usa Node.js 20.19+ (ou 22.12+) e npm:

```sh
npm ci
npm run version:check
npm start
```

Para gerar instaladores, use `npm run dist:win` no Windows, `npm run dist:linux` no Linux ou `npm run dist:mac` no macOS. O workflow `.github/workflows/build.yml` prepara builds Windows x64, Linux x64/arm64 e macOS x64/arm64 em runners nativos ao executar manualmente ou com uma tag `v*`. Ele guarda os arquivos como artefatos da execução; não cria uma publicação/release automaticamente. O instalador Windows foi gerado localmente e o DEB x64 foi gerado e testado na VM Ubuntu `agentes-dev`. Os demais pacotes Linux e macOS dependem de builds e testes nos sistemas de destino.

O projeto usa [Semantic Versioning](https://semver.org/) a partir de `0.1.0`. `npm run version:check` exige uma versão SemVer válida e igual em `package.json` e `package-lock.json`. Para preparar uma nova versão, use `npm version patch|minor|major --no-git-tag-version`, confira os instaladores e crie a tag `vX.Y.Z`. Antes de `1.0.0`, recursos compatíveis incrementam MINOR e correções incrementam PATCH.

Para um teste preliminar em Linux x64, há o arquivo portátil `dist/llama-desktop-launcher-0.1.0-portable-x64.tar.gz`. Extraia com `tar -xzf` e execute `./llama-desktop-launcher-0.1.0/llama-desktop-launcher`. Ele foi montado por compilação cruzada no Windows e ainda não foi aberto em Linux; não equivale aos instaladores AppImage/DEB/RPM.

Para economizar minutos e armazenamento em um repositório privado, `.github/workflows/build-macos-preview.yml` executa manualmente apenas os dois builds macOS (Intel e Apple Silicon), verifica o conteúdo dos DMGs e guarda os artefatos por três dias. A execução ainda depende de enviar este código para um repositório GitHub; nenhum DMG foi gerado neste computador Windows.

No Windows, o instalador NSIS permite escolher a pasta do aplicativo e marcar um atalho da área de trabalho. No Linux, DEB/RPM seguem o gerenciador de pacotes da distribuição; AppImage é uma opção portátil. No macOS, abra o DMG e arraste o aplicativo para a pasta escolhida. As duas localizações de modelos são escolhidas e podem ser alteradas no primeiro uso e depois, dentro do aplicativo. Modelos não são removidos ao desinstalar o app.

## Desinstalação segura

Feche o aplicativo normalmente antes de desinstalar; isso encerra o `llama-server` iniciado por ele. No Windows, o desinstalador pede para fechar o app e permite tentar novamente, sem encerrá-lo à força. Use **Configurações > Aplicativos instalados** do Windows. Ele remove a pasta do aplicativo e os atalhos, mas preserva por padrão `settings.json`, os motores baixados sob `engines/` e as pastas de modelos. No Linux, remova DEB/RPM pelo gerenciador de pacotes; para AppImage, apague o arquivo. No macOS, mova o `.app` para o Lixo. Em todos os sistemas, revise separadamente os dados do usuário antes de apagá-los manualmente. O app impede escolher pastas de modelos dentro da instalação ou de seus dados internos.

No primeiro uso, a tela **Configurações** permite baixar ou selecionar `llama.cpp` e escolher até duas pastas de GGUF. Você pode clicar em **Concluir e ir para Llama** e voltar a **Configurações** a qualquer momento. Use **Modelos** para localizar GGUF e avaliar sugestões; use **Llama** para conversar no terminal integrado, abrir a CLI externa ou iniciar o servidor no navegador. Se já usa o launcher antigo, selecione a pasta `b11193-vulkan` existente e a pasta que contém seus modelos. Depois, em **Configurações**, use **Importar perfis TSV** e selecione `launcher-profiles.tsv`. A importação preserva perfis já existentes e associa apenas os caminhos de modelos encontrados nas pastas configuradas.

## Empacotamento e limites atuais

As versões oficiais de Linux usadas aqui são construídas em Ubuntu; a compatibilidade com outras distribuições depende da glibc e bibliotecas do sistema. macOS exige Metal para GPU. Para distribuir amplamente, serão necessários certificado de assinatura Windows e assinatura/notarização Apple. Nesta versão, o runtime é baixado depois da instalação e os modelos são obtidos pelo usuário. Ainda não há downloader GGUF integrado; a VRAM só é mostrada quando uma ferramenta do sistema fornece um valor confiável. O benchmark mede prompt e geração, não o tempo total de uma conversa. Os links de rede dependem das regras de firewall do sistema e clientes remotos precisam enviar a chave de API. A regra do firewall é opcional e exige ação do usuário.

## Criadores e créditos

- **llama.cpp:** iniciado por [Georgi Gerganov](https://github.com/ggerganov) e desenvolvido pelos [colaboradores do projeto ggml-org](https://github.com/ggml-org/llama.cpp/blob/master/AUTHORS). Código original sob [licença MIT](https://github.com/ggml-org/llama.cpp/blob/master/LICENSE). Os binários são baixados diretamente das [releases oficiais](https://github.com/ggml-org/llama.cpp/releases/tag/b11193); consulte a licença no repositório original.
- **Launcher original para Célio:** interface WinForms, ponte local e auxiliar de firewall criados com Codex para Célio; serviram como base funcional para os ajustes avançados deste aplicativo.
- **Este aplicativo:** desenvolvido para Célio com Codex. O código do launcher permanece sem licença pública definida (`UNLICENSED`) e o pacote npm é privado. Defina os termos de licença antes de publicar ou redistribuir o código.

Os créditos não implicam participação ou endosso dos autores do llama.cpp neste launcher.
