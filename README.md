# Llama Desktop Launcher

**Documentação:**

| Guia | Português (Brasil) | English |
| --- | --- | --- |
| Uso: instalação, motores, perfis, compartilhamento | [Manual de uso](docs/MANUAL-pt-BR.md) | [User manual](docs/MANUAL-en.md) |
| Integração: API, chaves, OpenCode e outros clientes, rede e firewall | [Guia de integração](docs/INTEGRATION-pt-BR.md) | [Integration guide](docs/INTEGRATION-en.md) |
| Diagnóstico: problemas por motor, mensagens, dados e relatório | [Guia de diagnóstico](docs/DIAGNOSTICS-pt-BR.md) | [Diagnostics guide](docs/DIAGNOSTICS-en.md) |

As versões PDF ficam em `docs/`, acompanham o instalador e abrem pelo rodapé do aplicativo.

Aplicativo instalável para executar modelos de linguagem locais no Windows, Linux e macOS, com [llama.cpp](https://github.com/ggml-org/llama.cpp) (GGUF), [vLLM](https://github.com/vllm-project/vllm) (pastas Hugging Face) e [Strata](https://github.com/Niko1221/Strata)/[PolyStrata](https://github.com/simplexai-labs/PolyStrata). Derivado das ideias e dos ajustes do launcher WinForms feito para Célio em `Laucher Ollama.cpp com vulkan`. Este aplicativo **não é o Ollama** e não é um produto oficial da ggml-org, do vLLM ou do Strata.

## Funcionalidades

- **llama.cpp `b12359` (llama.cpp v1.0.0):** baixa o pacote oficial na primeira execução (Vulkan, NVIDIA CUDA, AMD ROCm, Intel SYCL ou CPU no Windows/Linux; Metal no macOS) ou usa uma pasta existente. A escolha depende da GPU, não da marca do processador.
- **vLLM `0.34.0`** para pastas Hugging Face (`config.json` + `.safetensors`, incluindo AWQ e GPTQ). No Linux com GPU NVIDIA, cria um ambiente Python próprio e instala o vLLM com `pip` (ou usa um ambiente com `bin/vllm`). No Windows, roda a imagem oficial `vllm/vllm-openai:v0.34.0` pelo Docker Desktop com WSL2. Não é oferecido no macOS.
- **Forks compatíveis do llama.cpp ([Avalon](https://github.com/freriadoc/Avalon), [tandem.cpp](https://github.com/ewhacc/tandem.cpp)):** não publicam programas prontos: compile o fork (passo a passo no manual, seção 5) e escolha a pasta em **Escolher pasta existente**. O launcher identifica o `llama-server` pelo `--version` e pelo `--help`, mostra qual build está em uso, oferece a receita do fork para o Qwen3.8-Flash-Next e faz o autotuning pelo `llama-server` quando não há `llama-bench`. Argumentos extras e variáveis de ambiente (`GGML_`, `LLAMA_`, `AVALON_`, `TANDEM_`, `CUDA_`, `HIP_`, `HSA_`, `ROCR_`) ficam no perfil.
- **Strata e PolyStrata** no Windows e no Linux: instale pelo instalador oficial deles e escolha a pasta; cada `strata-*.json` vira um modelo. O launcher não roda o instalador deles.
- Até duas pastas de modelos, fora da pasta do aplicativo. Detecta `mmproj` junto do GGUF e pastas do cache do Hugging Face.
- Perfis por modelo com os parâmetros de cada motor: no llama.cpp, GPU e memória (`-ngl`, `-dev`, `-sm`, `-ts`, `-fitt`, `-fitc`, `-nkvo`, `-lm`), especialistas MoE (`-ncmoe`, `--moe-cache-mib`), CPU (`-t`, `-tb`), cache KV (`-ctk`/`-ctv`, `--swa-full`, `-ctxcp`, `-kvu`) e decodificação especulativa (MTP, n-gram ou modelo rascunho); no vLLM, memória, cache KV, paralelismo e especulativa; no Strata, as opções que a versão instalada aceita. Só aparece o que o modelo e o hardware suportam (lido do cabeçalho GGUF, do `config.json` e das GPUs); cada campo tem o estado Auto, com o valor automático calculado pelo `llama-fit-params` quando dá para saber.
- Autotuning com orçamento de tempo, prioridade (geração, prompt longo ou equilíbrio) e cancelamento: `llama-bench` e `llama-server` curto no llama.cpp; servidor completo, opcional, no vLLM.
- Três telas: **Llama** (conversa e servidor), **Modelos** (recomendações pelo hardware e links do Hugging Face e dos outros motores) e **Configurações** (motores, pastas, perfis, importação, atualizações e diagnóstico).
- Conversa integrada com `llama-cli` na janela ou em um terminal separado (só GGUF).
- Servidor compatível com OpenAI em `127.0.0.1`, LAN ou Tailscale; na rede, exige chave de API. Compartilhamento revogável por link ou comando, com credencial temporária.
- Configurações prontas para OpenCode, Aider, Pi, Hermes, Continue, Cline, Codex (experimental) e clientes OpenAI Compatible genéricos.
- No Windows, regra de firewall opcional limitada ao executável do motor, à porta ativa e à faixa privada informada, e botão para remover todas as regras criadas pelo launcher.
- Verificação de atualizações com conferência do `SHA256SUMS.txt`.
- **Revisor:** um segundo modelo GGUF que gera texto, ao lado do principal e do decisor, em `127.0.0.1:8081` com o nome `modelo-revisor`. O launcher mede RAM e VRAM livres, diz se **cabe**, está **no limite** ou **não cabe**, bloqueia o último caso e sugere um trio entre os modelos já baixados que cabem juntos; um decisor muito pequeno, como o Julia-1, é sugerido só na CPU.
- **Perfil por modelo e motor:** na tela **Llama** você escolhe só o modelo e o motor; os parâmetros ficam em **Configurações › 03**, um perfil por modelo e tipo de motor (Vulkan, CUDA, CPU…). Sem perfil salvo para o motor escolhido, vale o ajuste padrão desse motor. Baixar outro motor do mesmo tipo substitui o anterior, e a lista **Motores instalados** abre a pasta de cada um.
- **Motor por papel:** o revisor e o decisor podem usar outro llama.cpp já baixado, escolhido no campo **Motor** de cada card. Exemplo de notebook com RTX e Ryzen: principal no motor CUDA (`CUDA0`) e decisor no motor Vulkan, na GPU integrada (`Vulkan0`). Cada motor baixado fica na própria pasta; baixe o segundo em **Configurações** e volte o principal para o que preferir.
- **Esforço de raciocínio** por modelo, para o principal, a conversa e o revisor: só as opções que o template do modelo aceita.
- **API de controle local** (opcional, desligada por padrão) em `127.0.0.1:8787`: o DepTriagem (antigo DevTools) lista os modelos, inicia e para o servidor principal, o revisor e o decisor e fecha o launcher, com token próprio (`DEPTRIAGEM_LAUNCHER_TOKEN`; `DEVTOOLS_LAUNCHER_TOKEN` segue aceito). Contrato na seção 11 do guia de integração.
- **Relatório de diagnóstico** copiável, com versões, motores, pastas, servidor ativo e o fim do registro do motor, sem chaves nem tokens.

## Obter o aplicativo sem o código-fonte

Os instaladores e o `SHA256SUMS.txt` estão na [página da versão mais recente](https://github.com/valmorbida4-eng/llama-desktop-launcher/releases/latest).

| Plataforma / Distribuição | Arquitetura | Arquivo na release (X.Y.Z = versão) |
| --- | --- | --- |
| **Windows** (10 / 11) | x64 | `Llama.Desktop.Launcher.Setup.X.Y.Z.exe` (instalador NSIS com atalho opcional) |
| **Linux** (Debian, Ubuntu, Mint, Pop!_OS) | x64 / ARM64 | `llama-desktop-launcher_X.Y.Z_amd64.deb` / `_arm64.deb` |
| **Linux** (Fedora, RHEL, openSUSE) | x64 / ARM64 | `llama-desktop-launcher-X.Y.Z.x86_64.rpm` / `.aarch64.rpm` |
| **Linux** (portátil, todas as distros) | x64 / ARM64 | `Llama.Desktop.Launcher-X.Y.Z.AppImage` / `-arm64.AppImage` |
| **macOS** (Apple Silicon) | ARM64 | `Llama.Desktop.Launcher-X.Y.Z-arm64.dmg` |
| **macOS** (Intel) | x64 | `Llama.Desktop.Launcher-X.Y.Z.dmg` |

O instalador não inclui modelos nem motores. Siga o [Manual de uso](docs/MANUAL-pt-BR.md) para o primeiro uso.

## Compilar a partir do código-fonte

O código-fonte usa Node.js 22.12+ e npm. O aplicativo é escrito em TypeScript e compilado para `build/app/` antes de iniciar, testar ou empacotar:

```sh
npm ci
npm run build
npm test
npm run version:check
npm start
```

Para gerar instaladores, use `npm run dist:win` no Windows, `npm run dist:linux` no Linux ou `npm run dist:mac` no macOS. O workflow `.github/workflows/build.yml` prepara builds Windows x64, Linux x64/arm64 e macOS x64/arm64 em runners nativos. Uma tag `v*` gera os checksums `SHA256SUMS.txt` e publica os instaladores na GitHub Release correspondente. O despacho manual apenas valida os builds. Para verificações pontuais de macOS, o workflow `.github/workflows/build-macos-preview.yml` pode ser acionado manualmente.

Os PDFs dos guias são gerados a partir dos Markdown com `python scripts/build_manual_pdfs.py` (requer as dependências de [`requirements.txt`](requirements.txt), hoje só o `reportlab`, e as fontes Arial do Windows). Rode o script sempre que mudar um guia.

O projeto usa [Semantic Versioning](https://semver.org/). `npm run version:check` exige uma versão SemVer válida e igual em `package.json` e `package-lock.json`. Para preparar uma nova versão, use `npm version patch|minor|major --no-git-tag-version`, confira os instaladores e crie a tag `vX.Y.Z`. Antes de `1.0.0`, recursos compatíveis incrementam MINOR e correções incrementam PATCH.

## Desinstalação segura

Feche o aplicativo antes de desinstalar; isso encerra o servidor iniciado por ele. No Windows, use **Configurações > Aplicativos instalados**; o desinstalador remove o aplicativo e os atalhos, mas preserva `settings.json`, os motores em `engines/` e as pastas de modelos. No Linux, remova DEB/RPM pelo gerenciador de pacotes ou apague a AppImage. No macOS, mova o `.app` para o Lixo. Em todos os sistemas, revise os dados do usuário antes de apagá-los à mão. Detalhes no [Manual de uso](docs/MANUAL-pt-BR.md) e no [Guia de diagnóstico](docs/DIAGNOSTICS-pt-BR.md).

## Empacotamento e limites atuais

As versões oficiais de Linux são construídas em Ubuntu; a compatibilidade com outras distribuições depende da glibc e das bibliotecas do sistema. macOS exige Metal para GPU. Os instaladores ainda não têm assinatura Windows nem assinatura/notarização Apple. Não há downloader de modelos integrado: os modelos são baixados pelo navegador. A VRAM só é mostrada quando o sistema fornece um valor confiável. O benchmark mede prompt e geração, não o tempo total de uma conversa. vLLM e Strata/PolyStrata ainda não foram validados em hardware real com um modelo carregado; relate problemas com o relatório de diagnóstico.

## Histórico de versões

- **v0.17.0:** a tela **Llama** fica só com **Modelo** e **Motor** (o motor do principal) e mostra qual perfil vai valer; os ajustes saem dela e ficam em **Configurações › 03**, que ganha o campo **Motor**. Cada modelo guarda um perfil por tipo de motor (`engineProfiles` em `settings.json`): salvar no mesmo tipo substitui só aquele perfil, e sem perfil para o motor escolhido vale o ajuste padrão dele (contexto 4096; o resto automático). Os perfis de versões anteriores passam para o tipo do motor em uso, e o mapa antigo fica guardado. Baixar um motor do mesmo tipo (outro Vulkan, outro CUDA) apaga a pasta do anterior, só entre os baixados pelo launcher; o revisor e o decisor que usavam o antigo passam para o novo. Um motor de outro tipo fica disponível sem trocar o do principal. Em **Configurações › 01**, a lista **Motores instalados** tem **Abrir** em cada um e **Abrir pasta dos motores**. Pastas escolhidas em **Escolher pasta existente** continuam na lista depois de trocar o motor do principal. Iniciar pela tela Llama, pela conversa ou pela CLI não grava mais o perfil.
- **v0.16.0:** campo **Motor** nos cards **Revisor** e **Decisor**: cada um pode usar outro llama.cpp já instalado (ex.: principal no CUDA e decisor no Vulkan da GPU integrada), com a lista de dispositivos e a conta de memória do motor escolhido. Sem escolha, vale o motor do principal, como antes; se o motor escolhido for apagado, o papel volta para o do principal. Trocar o motor de um papel volta o dispositivo salvo dele para Automático (Só CPU continua valendo). **Sugerir trio** pede o mesmo motor nos três papéis. Os motores baixados a partir desta versão guardam o backend e a versão em `launcher-engine.json`; os antigos são reconhecidos pelas bibliotecas da pasta. Correção: a lista de dispositivos de um motor não fica mais vazia até reabrir o launcher quando a primeira consulta não encontra nenhum (GPU de notebook ainda acordando).
- **v0.15.0:** a API de controle acompanha a troca de nome do DevTools para **DepTriagem**: o token vem de `DEPTRIAGEM_LAUNCHER_TOKEN` e, se ela não existir, de `DEVTOOLS_LAUNCHER_TOKEN`, que segue aceito. Porta, rotas e contrato não mudaram. O autor e o mantenedor do pacote passam a ser o login do GitHub, com e-mail noreply.
- **v0.14.0:** card **Revisor**, com um segundo modelo de texto em `127.0.0.1:8081`, checagem de memória antes de iniciar (a VRAM livre vem do sistema, porque o número do llama.cpp ignora os outros processos) e **Sugerir trio**. Com outro modelo do launcher carregado, o principal, a conversa, a CLI e o decisor também passam pela conta, e os inícios acontecem um de cada vez. A API de controle aceita `role:"reviewer"` e devolve `servers.reviewer`. Campo **Esforço** no perfil de cada modelo e no card Revisor, e decisor de até 256 MiB sugerido na CPU. Correções: com a 8080 ocupada o servidor principal usa 8100–8180, sem tomar as portas do revisor e do decisor; o autotuning não roda com o revisor ou o decisor ligado; um motor encerrado por sinal durante a carga é percebido na hora, sem esperar 5 minutos; a desinstalação no Windows não deixa mais guias e arquivos do empacotador para trás. Segurança: o launcher não executa mais programas que estejam na pasta de onde foi aberto (Windows), e a instalação do vLLM não importa mais módulos Python dessa pasta (Linux). Atualize a partir de versões anteriores.
- **v0.13.2:** correção no decisor: se a tela fosse atualizada enquanto o modelo de decisão ainda carregava (por **Atualizar lista** ou por um comando do DevTools), aparecia o erro "Cannot read properties of null (reading 'endpoint')" e o selo ficava "Ativo" sem endereço. Agora o selo mostra **Carregando…** até o modelo ficar pronto, e o endereço da API e o botão **Testar** só aparecem depois disso.
- **v0.13.1:** correção de segurança nas ferramentas de build: o `minimatch` usado pelo electron-builder sobe para a 11.0.9 (GHSA-g3hv-75wg-m249, negação de serviço com padrões glob), via `overrides`; `npm audit` fica sem alertas. O aplicativo instalado não usa essa biblioteca. As dependências Python dos scripts de manutenção ficam em `requirements.txt`.
- **v0.13.0:** tema claro, além do escuro: o botão no canto superior direito alterna entre **Sistema** (segue o Windows), **Claro** e **Escuro**, e a escolha fica salva. A janela deixa de mostrar o menu nativo (Arquivo, Editar, Exibir…), que não tinha função no launcher.
- **v0.12.2:** interface mais enxuta: cada card mostra só o título, e a descrição abre pela seta ao lado dele. Os cards **01 · Motor** e **02 · Pastas** voltam a ficar lado a lado na largura toda. Os campos dentro de rótulos (Decisor, Acesso e sessões) voltam ao tamanho normal de fonte, e o endereço do decisor deixa de ser cortado. O card **08 · API de controle** mostra o endereço ou o erro num campo próprio e a origem do token numa linha separada.
- **v0.12.1:** API de controle local para o DevTools (`GET /v1/control/state`, `POST /v1/control/start`, `stop` e `quit`), ativada em **Configurações > 08 · API de controle**: só loopback, sem CORS, com Bearer dedicado e IDs do catálogo em vez de caminhos; os serviços iniciados por ela escutam só em `127.0.0.1`. O launcher passa a ter uma instância só: abrir pelo atalho com ele aberto traz a janela existente. Veja [o ADR](docs/adr/control-api.md). A tag `v0.12.0` foi criada por engano no código da 0.11.1 e não tem release.
- **v0.10.1:** o cartão do motor explica que o Avalon e o tandem.cpp não têm download (é preciso compilar), com requisitos de cada um; passo a passo "Compilar um fork" nos manuais; PDFs dos manuais regenerados.
- **v0.10.0:** llama.cpp **v1.0.0** (`b12359`, de novo no canal estável). O autotuning mede o cache de especialistas MoE como o `moe-cache-tune.py` do llama.cpp: sem cache, dois tamanhos × frações de CPU 0, 0,5 e 0,95, e depois o modo de carga `dio`; fica a menor fração a até 5% da mais rápida. Com o cache ligado e a fração em Auto, o launcher usa 0,95 com os especialistas em mmap e 0 com eles fixados na memória. Forks compatíveis (Avalon, tandem.cpp): identificação do build, receitas para o Qwen3.8-Flash-Next, autotuning sem `llama-bench`, `draft-mtp` com cabeça MTP separada e campos de argumentos extras e variáveis de ambiente.
- **v0.9.0:** parâmetros por motor e por modelo, com estado Auto e valores automáticos do `llama-fit-params`; detecção de MoE, MTP, SWA e modelos híbridos pelo cabeçalho GGUF e pelo `config.json`; opções do vLLM 0.34.0 e do Strata; autotuning do llama.cpp em etapas (`llama-bench` e `llama-server`) e do vLLM; linha **Em uso** com os valores reais do servidor. Perfis antigos são migrados sem mudar o comportamento. Veja [o ADR](docs/adr/model-parameters-per-engine.md).
- **v0.8.1:** llama.cpp atualizado de `b12110` para `b12211` (build pre-release mais nova); os pacotes NVIDIA CUDA 13.4 passam a CUDA 13.5 no Windows e no Linux. Veja [o ADR da versão do motor](docs/adr/engine-version-pin.md).
- **v0.8.0:** **Configurações > 07 · Firewall do Windows** lista e remove as regras de entrada criadas pelo launcher (`LlamaDesktopLauncher-…`), com uma única autorização de administrador e só quando há regras. Elas continuam depois que o servidor para, e no Strata/PolyStrata liberam o `python.exe` do sistema.
- **v0.7.0:** guias separados de uso, integração e diagnóstico (PT-BR e EN), com PDFs abertos pelo rodapé; botão **Copiar relatório de diagnóstico** em **Configurações > 06 · Diagnóstico**; o registro do motor passa a guardar também as falhas de instalação e de início. Correções: a regra de firewall do Windows funciona com Strata/PolyStrata (Python base do `.venv`), e as configurações copiadas para os clientes usam o ID do modelo do Strata em vez de `modelo-local`. Veja [o ADR do relatório](docs/adr/diagnostic-report.md).
- **v0.6.1:** VRAM acima de 4 GB no Windows lida do registro do driver (o WMI para em 4 GB); links para os modelos do Strata, do PolyStrata e do vLLM na tela **Modelos**.
- **v0.6.0:** motores vLLM e Strata/PolyStrata ao lado do llama.cpp, que passa a `b12110`; correção do workflow **Engine update**. Veja [o ADR dos motores](docs/adr/additional-engines.md).
- **v0.5.2:** atalho da área de trabalho com ícone explícito e o mesmo ID de aplicativo do Menu Iniciar.
- **v0.5.1:** o instalador do Windows guarda a escolha do atalho em instalações silenciosas (`/S`) e atualizações.
- **v0.5.0:** aviso de nova versão e atualização verificada por `SHA256SUMS.txt`. Veja [o ADR](docs/adr/app-update-check.md).
- **v0.4.3:** o workflow semanal **Engine update** propõe novas releases do llama.cpp por PR; a versão fica fixada em `ENGINE_TAG` em `src/engine.ts`.
- **v0.4.2:** versão instalada no cabeçalho; `http-cache-semantics` 4.3.0 (GHSA-ch52-4w7c-c8xp).
- **v0.4.1:** download do motor em pasta temporária junto ao destino, corrigindo o Linux com `/tmp` e `/home` em sistemas de arquivos diferentes.

A revisão dos arquivos publicados e a situação da v0.2.5 estão em [Retirada de versões anteriores](docs/security-release-retirements.md).

## Criadores e créditos

- **llama.cpp:** iniciado por [Georgi Gerganov](https://github.com/ggerganov) e desenvolvido pelos [colaboradores do projeto ggml-org](https://github.com/ggml-org/llama.cpp/blob/master/AUTHORS). Código original sob [licença MIT](https://github.com/ggml-org/llama.cpp/blob/master/LICENSE). Os binários são baixados diretamente das [releases oficiais](https://github.com/ggml-org/llama.cpp/releases/tag/b12359).
- **Avalon:** fork do llama.cpp criado por [freriadoc](https://github.com/freriadoc) e colaboradores do [Avalon](https://github.com/freriadoc/Avalon), sob [licença MIT](https://github.com/freriadoc/Avalon/blob/main/LICENSE); a adaptação para Windows é de [ppkrol](https://github.com/ppkrol/Avalon_windows) (MIT). O launcher não baixa nem redistribui o Avalon: só usa uma pasta compilada pelo usuário.
- **tandem.cpp:** conjunto de patches para o llama.cpp criado por [ewhacc](https://github.com/ewhacc/tandem.cpp). O repositório não declara licença; o launcher não baixa nem redistribui o código, só usa uma pasta compilada pelo usuário.
- **vLLM:** desenvolvido pelo projeto [vllm-project/vllm](https://github.com/vllm-project/vllm) e seus colaboradores, sob [licença Apache 2.0](https://github.com/vllm-project/vllm/blob/main/LICENSE). O launcher instala o pacote oficial `vllm` do PyPI no Linux ou usa a imagem oficial [`vllm/vllm-openai`](https://hub.docker.com/r/vllm/vllm-openai) no Windows; não redistribui código do vLLM.
- **Strata:** criado por [Niko1221](https://github.com/Niko1221) e pelos colaboradores do [Strata](https://github.com/Niko1221/Strata), sob [licença MIT](https://github.com/Niko1221/Strata/blob/main/LICENSE). O launcher apenas inicia uma instalação feita pelo instalador oficial do projeto.
- **PolyStrata:** criado por [VecSzn](https://github.com/VecSzn) e pelos colaboradores do [PolyStrata](https://github.com/simplexai-labs/PolyStrata), baseado no Strata, sob [licença MIT](https://github.com/simplexai-labs/PolyStrata/blob/main/LICENSE) (copyright de Niko1221 e dos colaboradores do Strata, e de VecSzn e dos colaboradores do PolyStrata). O launcher apenas inicia uma instalação feita pelo instalador oficial do projeto.
- **Launcher original para Célio:** interface WinForms, ponte local e auxiliar de firewall criados com Codex para Célio; serviram como base funcional para os ajustes avançados deste aplicativo.
- **Este aplicativo:** desenvolvido para Célio com Codex e disponibilizado sob a [licença MIT](LICENSE), com copyright de Célio. A licença do launcher não altera as licenças do llama.cpp, do vLLM, do Strata, do PolyStrata nem dos modelos.

Os créditos não implicam participação ou endosso dos autores do llama.cpp, do vLLM, do Strata ou do PolyStrata neste launcher.
