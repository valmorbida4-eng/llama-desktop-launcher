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

- **llama.cpp `b12211`:** baixa o pacote oficial na primeira execução (Vulkan, NVIDIA CUDA, AMD ROCm, Intel SYCL ou CPU no Windows/Linux; Metal no macOS) ou usa uma pasta existente. A escolha depende da GPU, não da marca do processador.
- **vLLM `0.32.0`** para pastas Hugging Face (`config.json` + `.safetensors`, incluindo AWQ e GPTQ). No Linux com GPU NVIDIA, cria um ambiente Python próprio e instala o vLLM com `pip` (ou usa um ambiente com `bin/vllm`). No Windows, roda a imagem oficial `vllm/vllm-openai:v0.32.0` pelo Docker Desktop com WSL2. Não é oferecido no macOS.
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

Os PDFs dos guias são gerados a partir dos Markdown com `python scripts/build_manual_pdfs.py` (requer `reportlab` e as fontes Arial do Windows). Rode o script sempre que mudar um guia.

O projeto usa [Semantic Versioning](https://semver.org/). `npm run version:check` exige uma versão SemVer válida e igual em `package.json` e `package-lock.json`. Para preparar uma nova versão, use `npm version patch|minor|major --no-git-tag-version`, confira os instaladores e crie a tag `vX.Y.Z`. Antes de `1.0.0`, recursos compatíveis incrementam MINOR e correções incrementam PATCH.

## Desinstalação segura

Feche o aplicativo antes de desinstalar; isso encerra o servidor iniciado por ele. No Windows, use **Configurações > Aplicativos instalados**; o desinstalador remove o aplicativo e os atalhos, mas preserva `settings.json`, os motores em `engines/` e as pastas de modelos. No Linux, remova DEB/RPM pelo gerenciador de pacotes ou apague a AppImage. No macOS, mova o `.app` para o Lixo. Em todos os sistemas, revise os dados do usuário antes de apagá-los à mão. Detalhes no [Manual de uso](docs/MANUAL-pt-BR.md) e no [Guia de diagnóstico](docs/DIAGNOSTICS-pt-BR.md).

## Empacotamento e limites atuais

As versões oficiais de Linux são construídas em Ubuntu; a compatibilidade com outras distribuições depende da glibc e das bibliotecas do sistema. macOS exige Metal para GPU. Os instaladores ainda não têm assinatura Windows nem assinatura/notarização Apple. Não há downloader de modelos integrado: os modelos são baixados pelo navegador. A VRAM só é mostrada quando o sistema fornece um valor confiável. O benchmark mede prompt e geração, não o tempo total de uma conversa. vLLM e Strata/PolyStrata ainda não foram validados em hardware real com um modelo carregado; relate problemas com o relatório de diagnóstico.

## Histórico de versões

- **v0.9.0:** parâmetros por motor e por modelo, com estado Auto e valores automáticos do `llama-fit-params`; detecção de MoE, MTP, SWA e modelos híbridos pelo cabeçalho GGUF e pelo `config.json`; opções do vLLM 0.32.0 e do Strata; autotuning do llama.cpp em etapas (`llama-bench` e `llama-server`) e do vLLM; linha **Em uso** com os valores reais do servidor. Perfis antigos são migrados sem mudar o comportamento. Veja [o ADR](docs/adr/model-parameters-per-engine.md).
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

- **llama.cpp:** iniciado por [Georgi Gerganov](https://github.com/ggerganov) e desenvolvido pelos [colaboradores do projeto ggml-org](https://github.com/ggml-org/llama.cpp/blob/master/AUTHORS). Código original sob [licença MIT](https://github.com/ggml-org/llama.cpp/blob/master/LICENSE). Os binários são baixados diretamente das [releases oficiais](https://github.com/ggml-org/llama.cpp/releases/tag/b12211).
- **vLLM:** desenvolvido pelo projeto [vllm-project/vllm](https://github.com/vllm-project/vllm) e seus colaboradores, sob [licença Apache 2.0](https://github.com/vllm-project/vllm/blob/main/LICENSE). O launcher instala o pacote oficial `vllm` do PyPI no Linux ou usa a imagem oficial [`vllm/vllm-openai`](https://hub.docker.com/r/vllm/vllm-openai) no Windows; não redistribui código do vLLM.
- **Strata:** criado por [Niko1221](https://github.com/Niko1221) e pelos colaboradores do [Strata](https://github.com/Niko1221/Strata), sob [licença MIT](https://github.com/Niko1221/Strata/blob/main/LICENSE). O launcher apenas inicia uma instalação feita pelo instalador oficial do projeto.
- **PolyStrata:** criado por [VecSzn](https://github.com/VecSzn) e pelos colaboradores do [PolyStrata](https://github.com/simplexai-labs/PolyStrata), baseado no Strata, sob [licença MIT](https://github.com/simplexai-labs/PolyStrata/blob/main/LICENSE) (copyright de Niko1221 e dos colaboradores do Strata, e de VecSzn e dos colaboradores do PolyStrata). O launcher apenas inicia uma instalação feita pelo instalador oficial do projeto.
- **Launcher original para Célio:** interface WinForms, ponte local e auxiliar de firewall criados com Codex para Célio; serviram como base funcional para os ajustes avançados deste aplicativo.
- **Este aplicativo:** desenvolvido para Célio com Codex e disponibilizado sob a [licença MIT](LICENSE), com copyright de Célio. A licença do launcher não altera as licenças do llama.cpp, do vLLM, do Strata, do PolyStrata nem dos modelos.

Os créditos não implicam participação ou endosso dos autores do llama.cpp, do vLLM, do Strata ou do PolyStrata neste launcher.
