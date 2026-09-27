# User manual — Llama Desktop Launcher

Version 0.1.0 · English

## 1. What the application does

Llama Desktop Launcher installs or locates the [llama.cpp](https://github.com/ggml-org/llama.cpp) engine, finds local GGUF models, and opens the `llama-server` interface in your browser. You can select local-only, LAN, or Tailscale access. Network access requires an API key. Traffic to other computers travels over the selected network.

The app installer **does not include models**. The official engine is downloaded on first use, or you can point the app to an existing installation. The tested engine version is `b11193`.

## 2. Requirements

| System | Package | GPU backend |
| --- | --- | --- |
| Windows x64 | `Llama Desktop Launcher Setup 0.1.0.exe` | Vulkan with a compatible display driver |
| Linux x64/arm64 | AppImage, DEB, or RPM | Vulkan with compatible drivers and libraries |
| macOS Intel/Apple Silicon | DMG | Metal |

Required disk space depends on the model. Allow room for the GGUF, cache, and engine. Large models can require substantially more RAM or VRAM than the file size alone suggests. Without a compatible GPU, inference may run on the CPU and be slow. The official Linux engine package is built on Ubuntu; other distributions may require compatible system libraries. The GitHub Actions matrix is configured for Windows x64, Linux x64/arm64, and macOS Intel/Apple Silicon, but Linux and macOS artifacts are validated only after their jobs run and the packages are opened on their target systems.

## 3. Install the application

### Windows

1. Open `Llama Desktop Launcher Setup 0.1.0.exe`.
2. Choose the application installation folder. This is a per-user installer and does not require using `Program Files`.
3. Select whether to create a desktop shortcut.
4. Finish installation and open the app from the Start menu or desktop shortcut.

### Linux

- **DEB:** install with your Debian/Ubuntu compatible package manager.
- **RPM:** install with your Fedora/RHEL compatible package manager.
- **AppImage:** mark the file executable and run it. AppImage is portable and remains wherever you place it; a package manager does not install it.

DEB and RPM use the standard locations chosen by the distribution and package manager. Model folders are selected inside the application.

For a preliminary Linux x64 test, extract `llama-desktop-launcher-0.1.0-portable-x64.tar.gz` with `tar -xzf` and run `./llama-desktop-launcher-0.1.0/llama-desktop-launcher`. This archive was assembled on Windows and has not yet been run on Linux. It does not add menu entries and does not replace the AppImage/DEB/RPM packages.

### macOS

1. Open the DMG.
2. Drag the app to `Applications`, or another folder where you want to keep it.
3. Open the app from Finder.

Unsigned development builds may require an explicit exception in macOS security settings. Do not disable system protections globally.

## 4. First use: set up llama.cpp

On first launch, the app opens **Configurações / Settings**. You can set up the engine and folders now, or click **Concluir agora, baixar depois / Finish now, download later**. The Settings tab remains available later to download the engine, choose another installation, or change model folders. In **Motor llama.cpp**, choose one of these options:

1. **Baixar motor oficial / Download official engine:** the app downloads release `b11193` directly from `ggml-org/llama.cpp` on GitHub. Windows/Linux use Vulkan; macOS uses Metal. The engine is stored in your user data folder, outside the app installation folder.
2. **Escolher pasta existente / Choose existing folder:** select a folder containing `llama-server` (or `llama-server.exe`). This lets you reuse an existing installation, including the `b11193-vulkan` directory used by the earlier Windows launcher.

Downloading requires internet access. If the release has no package for your CPU architecture, select a compatible engine you built or installed yourself. The app checks SHA-256 when the GitHub release API provides a digest. You can replace a selected engine later by choosing a different existing folder or downloading the official package again.

If you used the previous Windows launcher, first select the folder containing your GGUF files. Under **Configurações > Perfis do launcher anterior / Settings > Previous launcher profiles**, click **Importar perfis TSV / Import TSV profiles** and select `launcher-profiles.tsv` from the old launcher folder. Import matches the model's full path; if you moved the GGUF files, select the original folder or adjust profiles manually. Existing profiles in this app are preserved. The result reports imported, missing, already existing, and invalid profiles.

## 5. Model folders and GGUF files

The **Settings** screen supports **two model locations**. The first defaults to `~/Models/GGUF`; click **Alterar / Change** to select a different folder or drive. The second location is optional and can be added or removed. You can change both later. The **Models** screen scans subfolders for `.gguf` files.

To get a model:

1. Click **MoE Q4_K_M** to open the [MoE model filter](https://huggingface.co/models?library=gguf&apps=llama.cpp&base_model_relation=quantized&sort=most_params&search=moe+q4_k_m), or **GGUF Q4_K_M** to open the [general Q4_K_M filter](https://huggingface.co/models?library=gguf&apps=llama.cpp&base_model_relation=quantized&sort=most_params&search=q4_k_m). Both links include the GGUF library, llama.cpp app, and quantized base-model relation.
2. Choose a repository. Review the **model license**, RAM/VRAM requirements, quantization, and the author's instructions.
3. Download a `.gguf` file into one of your configured model folders. This version opens Hugging Face in your browser; your browser handles the file download.
4. Return to the app and click **Atualizar lista / Refresh list**.

For a multimodal model, keep exactly one `mmproj*.gguf` file beside the model; the app will pair it automatically. For split GGUF models, keep all shards in the same folder. The list displays only the first shard.

**Note:** GGUF is a file format, not a guarantee that every model works with this llama.cpp version. Some repositories may require a newer engine.

## 6. Start a conversation

1. Select a GGUF in **Modelo e desempenho / Model and performance**.
2. Keep the initial settings or click **Aplicar sugestão inicial / Apply initial suggestion**. This fills in the fields without running the model.
3. Click **Abrir no navegador / Open in browser**. The app starts `llama-server`, waits for model loading, and opens its local web UI.
4. When finished, click **Parar servidor / Stop server** in the app.

Large models may take several minutes to load. Expand the engine log near the bottom of the window to inspect messages or errors. Closing the browser tab does not stop the server. Use **Stop server** or quit the app.

## 7. Advanced settings

### Network links and simultaneous sessions

Under **Acesso e sessões / Access and sessions**, select **Somente este computador / This computer only** or a detected LAN/Tailscale address. Choose **1 to 8 simultaneous sessions**. This sets `--parallel` on `llama-server`; sessions share the available context and memory, so start with 1 or 2 for a large model. This setting controls concurrency, while **Context / Contexto** (`-c`) controls the token context size.

For LAN/Tailscale, use **Mostrar chave / Show key**, **Copiar chave / Copy key**, or **Nova chave / New key**. Stop the server before rotating the key. The app opens the local browser interface through an authenticated proxy. **Copiar link da API / Copy API link** gives you the `/v1` endpoint. **Copiar link da interface / Copy interface link** gives you the network web address. Remote API clients must send `Authorization: Bearer YOUR_KEY`; the link alone does not grant access. A remote web client must also support this authentication. Never add the key to the URL or publish it in an open message.

The app does not change firewall rules when starting the server. On Windows, while a LAN/Tailscale server is running, enter the **allowed client address or CIDR range** in **Firewall do Windows / Windows Firewall** and click **Criar regra para a porta ativa / Create rule for active port**. Confirm the Windows administrator prompt. The rule is limited to `llama-server.exe`, the active port, and the entered client range. Check the range before confirming; if the port changes, create another rule. On Linux/macOS, use your distribution's firewall controls. The server selects a free port from 8080 to 8180. Prefer Tailscale or a trusted LAN; direct HTTP on a LAN does not encrypt traffic.

### Conversation with llama-cli

Under **Conversa via llama-cli / Conversation via llama-cli**, select the model and settings above. Click **Conversar aqui / Chat here** to use the app window: enter a message and click **Enviar / Send**. Enter sends; Shift+Enter inserts a new line. Click **Encerrar conversa / End conversation** when finished. Engine output appears in the app and the chat history is not saved.

If you prefer the original program, click **Abrir CLI no terminal / Open CLI in terminal**. The app opens `llama-cli` (`llama-cli.exe` on Windows) in a separate terminal with the selected model and current settings. Use that terminal to chat and close it; **End conversation** controls only the in-app chat. Stop the server or in-app chat before opening the external CLI. Linux needs a graphical terminal installed. The external terminal may remain open after the launcher closes.

Settings are saved per model. Click **Salvar ajustes / Save settings** to store them. **Aplicar sugestão inicial / Apply initial suggestion** fills in the fields using system RAM, CPU thread count, GGUF file size, and model filename. It provides a starting point rather than a guarantee of speed or exact memory usage. The suggestion is saved only when you click **Save settings**, open the model in the browser, or start an in-app conversation.

| Field | llama.cpp flag | Meaning |
| --- | --- | --- |
| GPU layers | `-ngl` | `auto` lets the engine fit layers; `all` attempts full GPU offload; `0` selects CPU. |
| Device | `-dev` | Empty means automatic selection. Use an ID such as `Vulkan0` when several GPUs are present. |
| Context | `-c` | Number of tokens retained in a conversation. Higher values use more memory. |
| MoE layers on CPU | `-ncmoe` | Keeps expert weights for the first N layers in system RAM. Use only with MoE models; empty disables this setting. |
| K / V cache | `-ctk` / `-ctv` | `f16` favors fidelity; `q8_0` uses less memory with a small tradeoff. Test other formats per model. |
| Flash Attention | `-fa` | `auto`, `on`, or `off`; availability depends on backend and model. |
| CPU threads | `-t` | Threads used by CPU portions. Empty uses the engine default. |
| Batch | `-b` | Logical prompt processing batch size. |
| Microbatch | `-ub` | Physical chunk size. It cannot be larger than batch. |

The app also passes `-fit on` so the engine can adapt to available memory. Leave `-ncmoe` empty for dense models. For an MoE too large for VRAM, adjust CPU MoE layers while watching RAM use and throughput.

## 8. Tune with your first model

After downloading your first GGUF and installing the engine:

1. Select the model. If you want suggested values for several fields, click **Aplicar sugestão inicial / Apply initial suggestion**; this does not run the model.
2. To measure the microbatch, stop the server and click **Comparar microbatch / Compare microbatch**. `llama-bench` tests the current value and another value of up to 128, capped by batch. If they match, it runs only one test.
3. Wait for prompt processing and generation results in tokens per second. The app fills in **Microbatch** with the better value and leaves the other fields unchanged.
4. Review the fields and click **Salvar ajustes / Save settings** to keep the result without starting the model.

The benchmark may load the model more than once and can take several minutes. It does not save the profile by itself or optimize context, cache, GPU layers, or MoE layers. You can adjust those fields manually.

## 9. Troubleshooting

| Problem | What to check |
| --- | --- |
| No models listed | Confirm the model folders and `.gguf` extension; click **Refresh list**. |
| Engine download fails | Check internet access, free space, and GitHub access; retry or select an existing engine folder. |
| “Package without llama-server” | The release layout may have changed; select a compatible runtime manually. |
| Server exits during startup | Read the engine log; lower context/batch, try `-ngl auto`, or reduce GPU layers. |
| GPU not used | Update Vulkan drivers on Windows/Linux; on macOS check that you installed a Metal build. Read the engine log. |
| Benchmark fails | Ensure the runtime folder contains `llama-bench`; try more conservative settings. |
| Model fails to load | Check all shards, `b11193` compatibility, model repository instructions, and available memory. |

## 10. Data, updates, and safe uninstalling

Preferences and profiles are stored as `settings.json` in the app's user data folder. The downloaded engine is stored under `engines/` in the same area. Model files stay in the folders you chose. The app does not allow a model folder inside the application installation or its internal user data directory.

Before uninstalling, click **Parar servidor / Stop server** if needed, then close the app normally. On Windows, the uninstaller checks whether the app is still open and asks you to close it; click **Retry** after closing. It does not force the app to quit. Use **Installed apps** in Windows Settings. By default, it removes the app and shortcuts while **preserving models, profiles, and the downloaded engine**. Do not use advanced app-data removal options without inspecting the data folder first.

On Linux, remove DEB/RPM with your package manager, or delete the AppImage file. On macOS, move the `.app` to Trash. User data and GGUF files remain for manual review. If you want to remove them, do so separately after checking the path and backing up `settings.json` if you want to keep profiles. Never delete a model folder simply because it was selected in the app.

## 11. Credits

[llama.cpp](https://github.com/ggml-org/llama.cpp) was started by [Georgi Gerganov](https://github.com/ggerganov) and is maintained by the [ggml-org contributors](https://github.com/ggml-org/llama.cpp/blob/master/AUTHORS) under the [MIT license](https://github.com/ggml-org/llama.cpp/blob/master/LICENSE). This independent launcher was developed for Célio with Codex, based on the earlier WinForms launcher. The launcher source has no public license (`UNLICENSED`), and the npm package is private; define license terms before publishing or redistributing it. The llama.cpp authors do not participate in or endorse this app. Each model has its own license.
