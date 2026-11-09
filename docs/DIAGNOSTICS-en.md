# Diagnostics guide — Llama Desktop Launcher

Version 0.9.0 · English

This guide helps you find out why something did not work: where to look, what the app's messages mean, common problems for each engine and platform, and how to build a report when asking for help. For normal use, see the **User manual** (`MANUAL-en`); for clients and the API, the **Integration guide** (`INTEGRATION-en`).

The app interface is in Portuguese, so messages are quoted in Portuguese with their meaning in English.

## 1. Where to start

1. **Read the message** shown below the buttons (red when it is an error). The most common ones are in section 10.
2. **Open the Registro do motor** (engine log) on the **Llama** screen (accordion below the buttons). It shows the engine output and `[launcher]` lines describing what the app tried to do. The last lines before a failure usually give the cause: not enough memory, incompatible file, busy port, missing driver.
3. **Copy the diagnostic report** in **Settings > 06 · Diagnóstico** (section 3) if you will ask for help.

The log lives **in memory only** while the launcher is open: the window shows the last 30,000 characters and the report takes the last 12,000. There is no log file on disk. Copy the report **before** closing the app.

## 2. Where data is stored

| System | App data folder |
| --- | --- |
| Windows | `%APPDATA%\Llama Desktop Launcher` |
| Linux | `~/.config/Llama Desktop Launcher` |
| macOS | `~/Library/Application Support/Llama Desktop Launcher` |

| Item | Location |
| --- | --- |
| Preferences, folders and profiles | `settings.json` in the data folder |
| Permanent API key | `server-api-key.txt` in the data folder (never send it to anyone) |
| Downloaded llama.cpp | `engines/` in the data folder, one subfolder per download |
| vLLM on Linux | `engines/vllm-0.32.0-…` in the data folder (or the environment you chose) |
| vLLM on Windows | The `vllm/vllm-openai:v0.32.0` image in Docker Desktop; `llama-desktop-vllm-…` containers |
| Strata / PolyStrata | The folder where their installer ran |
| Update packages | `updates/` in the data folder |
| Models | The folders chosen in **02 · Pastas** |

Each engine's path is also shown in **Settings**. If `settings.json` is corrupted, the app falls back to the default configuration and overwrites the file. Make a copy before editing it by hand.

## 3. Diagnostic report

In **Settings > 06 · Diagnóstico**, click **Copiar relatório de diagnóstico** (Copy diagnostic report). The text goes to the clipboard and is shown right below the button for you to review.

The report contains:

- launcher, Electron and Node versions, operating system and architecture;
- detected CPU, RAM, GPU and VRAM;
- each engine's state (ready, pending or unavailable), version, mode and path, plus the llama.cpp backend and release and the Docker state on Windows;
- model folders (and whether they exist), model count per engine, the selected model and its profile;
- chosen address and sessions, the running server (engine, port, model ID, context, sharing);
- update check state;
- the last 12,000 characters of the engine log.

Before copying, the app **removes** the permanent API key, the sharing credential, `Bearer` headers, `token=` parameters, variables such as `*_API_KEY` and `*_TOKEN`, Hugging Face tokens (`hf_…`), and replaces your home folder with `~`. Even so, **read the text before sending it**: model names, local network IPs and prompt fragments in the log remain visible.

To ask for help, open a [GitHub issue](https://github.com/valmorbida4-eng/llama-desktop-launcher/issues) with the report, what you did and what you expected. Never post the API key or links with access.

### If the app does not open

Build the report by hand: system and version, launcher version (installer name), how you installed it (EXE, DEB, RPM, AppImage, DMG) and the message shown. On Linux, start it from a terminal (`llama-desktop-launcher` or the AppImage) to see error output. If the problem started after editing `settings.json`, rename the file and open the app again.

## 4. General problems

| Symptom | What to do |
| --- | --- |
| The model list is empty | Check the folders in **02 · Pastas** and click **Atualizar lista**. GGUF files must end in `.gguf`; vLLM needs `config.json` and `.safetensors` in the same folder; Strata needs its installed folder chosen in **01B**. |
| The app always opens in Settings | A ready engine, a model in the folders or a selected model is missing. Select a model on the **Llama** screen or click **Concluir e ir para Llama**. |
| Start buttons are disabled | The selected model's engine is not ready (see the badge in **Settings**) or something is already running. Stop the server, chat or benchmark. |
| “Conversar aqui” and “Abrir CLI” are disabled | They are for GGUF on llama.cpp only. With vLLM or Strata, use **Iniciar servidor** and a client. |
| The model folder is rejected | It cannot be inside the installation or inside the app data folder. |
| GPU or VRAM shows as “não medida” (not measured) | The system did not report a reliable value. Suggestions use RAM only; adjust by hand. |

## 5. llama.cpp

| Symptom | Likely cause and fix |
| --- | --- |
| Engine download fails | No internet, no space, or GitHub blocked. Try again or use **Escolher pasta existente** with an engine downloaded by hand. |
| “A versão … não contém todos os pacotes de …” | The release lacks that backend for your platform. Choose another backend. |
| “Checksum SHA-256 do download não confere” (checksum mismatch) | Corrupted or intercepted download. Try again on another network. |
| “O pacote CUDA não contém as bibliotecas esperadas” / “Pacote baixado sem llama-server” | The release layout changed. Choose another backend or an existing folder and report it. |
| “O motor encerrou antes de ficar pronto.” (engine exited before ready) | Check the end of the engine log. Usually: not enough memory (lower context, batch or GPU layers, or use `q8_0` cache), GGUF incompatible with `b12211`, missing shards or missing driver. |
| “Tempo esgotado ao carregar o modelo.” (load timed out) | llama.cpp has 5 minutes to load. Use a smaller model, a faster disk or less context. |
| The GPU is not used | Check the backend (CUDA for NVIDIA, Vulkan for any GPU), the driver and the **GPU layers** field (`auto` or `all`). The log shows how many layers went to the GPU. |
| CUDA does not load on Windows | Update the NVIDIA driver. If it persists, try the Vulkan backend. |
| “Este pacote não inclui llama-bench.” / benchmark fails | Use an official package with `llama-bench` or more conservative settings. The test is limited to 10 minutes. |
| “Não encontrei um terminal gráfico.” (Linux) | Install a terminal such as `gnome-terminal` or `xterm` to use **Abrir CLI no terminal**. |
| “Este pacote do llama.cpp não inclui llama-fit-params.” | Old or incomplete package. Download the official engine again. Without it, automatic values are not shown, but the server works. |
| Autotuning: attempt with “não coube na memória” (did not fit in memory) or “failed to allocate” | Expected: that combination exceeds the GPU limit and was dropped. The result uses the ones that fit. |
| Autotuning: “Divisão entre GPUs: row” fails | The backend (Vulkan, for example) does not support `-sm row`. The attempt is dropped. |
| Autotuning changes little or nothing | A value replaces the current one only with a gain of at least 2%. With a short budget the search stops before testing everything; the **Medições do autotuning** table shows what was tested. |
| “Este modelo não tem camadas MTP (draft-mtp).” | The GGUF has no NextN/MTP layers. Pick another speculative decoding type or leave it on Auto. |
| “Cache V quantizado exige Flash Attention ligado ou automático.” | Turn Flash Attention on or use an `f16` V cache. |
| “Escolha o modelo rascunho para a decodificação especulativa.” | The `draft-simple` and `draft-eagle3` types need a smaller GGUF of the same family in your model folders. |
| A field appears under “Não se aplicam a este modelo” | The reason is shown below it. If the launcher cannot read the GGUF header, nothing is hidden. |

## 6. vLLM

### Linux (Python environment)

| Symptom | Likely cause and fix |
| --- | --- |
| “Python 3 não encontrado.” | Install `python3` and `python3-venv` (Python 3.10 to 3.13), e.g. `sudo apt install python3 python3-venv`. |
| “python falhou (1): …” during install | `pip` failed; the end of the message and the log show why (network, space, Python version without a wheel). The incomplete folder is deleted; try again. |
| “A pasta precisa conter bin/vllm.” | In **Usar ambiente existente**, choose the environment root (the folder that contains `bin/`). |
| CUDA error or “no GPU” on start | The pip package is NVIDIA-only. Check `nvidia-smi`. For AMD, install vLLM with ROCm from the official docs and point to that environment. |
| GPU out of memory | Lower **Context** (`--max-model-len`) and **Simultaneous sessions** (`--max-num-seqs`), or use a quantized model (AWQ, GPTQ). |

### Windows (Docker Desktop)

| Symptom | Likely cause and fix |
| --- | --- |
| “Docker Desktop não encontrado ou parado.” | Install Docker Desktop with WSL2, open it, wait until it is ready and click **Verificar de novo**. |
| The image pull fails | It needs about 10 GB free on the WSL disk and a stable connection. Try again; `docker pull` resumes. |
| The container does not see the GPU | Enable GPU support in WSL2 following the [Docker documentation](https://docs.docker.com/desktop/features/gpu/) and update the Windows NVIDIA driver. |
| “Os pesos deste modelo são links simbólicos…” (weights are symlinks) | The folder points to files outside it. Use a folder with the real files or the Hugging Face cache layout (`models--org--name/snapshots/<hash>`). |
| “O caminho do modelo não pode conter vírgulas…” (no commas in path) | Rename the folder or move the model to a path without commas. |
| The model asks to download or a file is missing | The container runs offline (`HF_HUB_OFFLINE=1`). Download the complete repository (including the tokenizer) first. |
| A container is left running | Run `docker ps --filter name=llama-desktop-vllm-` and `docker stop NAME`. |
| Network clients cannot connect | The automatic firewall rule does not cover Docker; create the manual rule from the Integration guide. |
| “O número de GPUs (N) precisa dividir as … cabeças de atenção do modelo.” | Choose a tensor parallelism that divides the number of heads (1, 2, 4…). |
| vLLM autotuning: the `fp8` attempt fails | The GPU does not accept an fp8 KV cache; the attempt is dropped. |
| vLLM autotuning takes very long | Each attempt reloads the model and captures CUDA graphs. Choose 20 or 30 minutes, or tune by hand after the initial suggestion. |

vLLM can take several minutes on the first load. The launcher waits up to 30 minutes before showing “Tempo esgotado ao carregar o modelo.”.

## 7. Strata and PolyStrata

| Symptom | Likely cause and fix |
| --- | --- |
| “A pasta precisa ser uma instalação do Strata ou do PolyStrata já configurada…” | Choose the installation root, which contains `serve/server.py` and `.venv`. If `.venv` is missing, run their `START-HERE.bat` or `setup.sh` to the end. |
| The folder is accepted but no model appears | The launcher only reads `strata-*.json` at the folder root and ignores `*.shared-settings.json`, files over 1 MB and invalid JSON. Configure a model with their installer. |
| Simultaneous sessions change nothing | PolyStrata uses the `parallel` value from its own config; change it there. |
| The server exits or never gets ready | Check the log: usually the weights were not downloaded, the GPU is not supported or memory ran out. Test the server with the project's own tools to isolate the problem. |
| “Não foi possível localizar o Python base do Strata / PolyStrata (pyvenv.cfg)…” | The `.venv` does not point to an existing Python. Recreate the environment with their installer or open the port in the firewall manually. |
| The client says the model does not exist | Use the **Modelo API** from the panel (the config's `model_name`), not `modelo-local`. Copy the setup again. |
| A Strata field disabled with “A versão instalada … não aceita --…” | The installed `serve/server.py` lacks that option. Update through the project's installer. |

## 8. Network, keys and firewall

| Symptom | Likely cause and fix |
| --- | --- |
| The LAN or Tailscale address is not listed | Only private IPv4 and Tailscale (`100.64.0.0/10`) addresses are listed. Make sure Tailscale is connected and reopen the launcher. |
| Works on this PC but not on another | Firewall, wrong IP or different network. Test `GET /v1/models` from the other computer (examples in the Integration guide). |
| “Acesso negado: chave ou token de sessão local ausente ou inválido.” | The local bridge page was opened without its token. Use **Abrir no navegador** again. |
| “Acesso compartilhado ausente, expirado ou revogado.” | The shared link is from a previous run or was revoked. Copy a new one. |
| 401 on the direct port | Wrong key, or it was replaced with **Nova chave**. Copy the current key. |
| “A faixa de clientes precisa conter o endereço da rede selecionada.” | Use a range that includes the server IP, such as `192.168.1.0/24` for `192.168.1.5`. |
| “O endereço remoto deve ficar dentro de uma rede LAN privada ou Tailscale.” | The rule only accepts `10/8`, `172.16/12`, `192.168/16` or `100.64/10`. |
| “As regras não foram removidas: a autorização de administrador foi negada…” (rules not removed) | The administrator prompt was denied or closed. Click **Remover regras do launcher** again and accept. |
| The firewall rule is not created | The administrator prompt was denied or closed. Click again and accept. |
| Old rules are still open | `LlamaDesktopLauncher-…` rules stay in Windows after the server stops. For Strata/PolyStrata they allow the system-wide `python.exe`, used by every Python program. Use **Settings > 07 · Firewall do Windows > Remover regras do launcher**, `wf.msc` or, in an administrator PowerShell, `Get-NetFirewallRule -Name 'LlamaDesktopLauncher-*' \| Remove-NetFirewallRule`. |
| “ID de modelo inválido.” when copying | The Strata `model_name` is empty, longer than 128 characters, starts with `-` or contains a line break or another control character. Spaces and symbols are accepted. Fix the name in the `strata-*.json` config. |

## 9. Updates

| Symptom | Likely cause and fix |
| --- | --- |
| “Você já usa a versão mais recente” (you are up to date) but a new one exists | The check runs at startup and once a day. Click **Verificar agora**. |
| The check fails | No access to `api.github.com` (network, proxy or rate limit). Try later or download from the releases page. |
| “Esta versão não tem pacote para este sistema.” | The release has no installer for your platform. Use the release notes to download another format. |
| “SHA256SUMS.txt não lista o pacote…” / “Checksum … não confere” | The package was deleted for safety. Try again; if it repeats, report it. |

## 10. App messages

| Message | Meaning |
| --- | --- |
| “Pare a execução atual antes de iniciar outra.” | A server, chat, benchmark or engine setup is already running. |
| “Instale ou selecione o llama.cpp primeiro.” | The model is GGUF and llama.cpp is not ready. |
| “Prepare o vLLM em Configurações primeiro.” | vLLM is not installed (Linux) or the image is not pulled (Windows). |
| “Escolha a pasta do Strata ou do PolyStrata em Configurações primeiro.” | The model belongs to Strata, but the folder is not set or no longer valid. |
| “… está disponível só para modelos GGUF no llama.cpp.” | Integrated chat, CLI, analysis and automatic values (`llama-fit-params`) exist only for llama.cpp. |
| “O Strata e o PolyStrata não têm autotuning…” | Quantization, context and GPU come from their installer's configuration. |
| “Já existe um teste em execução.” | Wait, or click **Cancelar** in autotuning. |
| “Modelo não encontrado nas pastas configuradas.” | The file moved or the folder changed. Refresh the list. |
| “Escolha um endereço de rede disponível.” | The chosen IP no longer exists (network changed). Choose again. |
| “Pare o servidor antes de gerar outra chave.” | The key cannot change while the server runs. |
| “Inicie o servidor em LAN ou Tailscale para compartilhar.” | Sharing does not exist for local access. |
| “Chave de API inválida. Gere uma nova chave.” | `server-api-key.txt` was modified. Use **Nova chave**. |
| “O vLLM no Docker escuta pelo Docker Desktop…” | The automatic rule does not cover Docker; create the manual rule. |
| “Escolha uma pasta fora da instalação do aplicativo…” | Uninstalling would delete that folder. |

## 11. Before opening an issue

- Update to the latest version and reproduce the problem.
- Reproduce it with the smallest possible model and default settings.
- Copy the diagnostic report right after the failure, before closing the launcher.
- Review the report and remove anything personal.
- Describe the steps, the expected result and what happened.
