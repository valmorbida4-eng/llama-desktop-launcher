# Graph Report - llama-desktop-launcher  (2026-10-04)

## Corpus Check
- 82 files · ~46,301 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 7 file(s) not represented in the graph (top: (none) 5, .toml 1, .css 1)

## Summary
- 883 nodes · 1072 edges · 104 communities (55 shown, 49 thin omitted)
- Extraction: 94% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 68 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `dcd45cff`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- firewall.test.js
- RendererApi
- main.ts
- build.js
- scripts
- User manual — Llama Desktop Launcher
- core.ts
- build
- terminal_cli.ts
- build_manual_pdfs.py
- renderer.ts
- engine.ts
- firewall.ts
- compilerOptions
- core.test.js
- network.ts
- compilerOptions
- smoke-network.js
- network.test.js
- hardware.ts
- share_proxy.test.js
- client_commands.ts
- Manual de uso — Llama Desktop Launcher
- What You Must Do When Invoked
- ai-memory durable pages
- smoke-server-buttons.js
- terminal_cli.test.js
- graphify reference: extra exports and benchmark
- smoke-external-cli-win.js
- share_proxy.ts
- smoke-external-cli-linux.js
- client_commands.test.js
- ai-memory routing install
- ref_node_test
- guidance.test.js
- hardware.test.js
- profile_import.test.js
- Plano simples da interface
- ref_node_child_process
- ref_node_fs
- graphify reference: query, path, explain
- ref_node_path
- graphify reference: add a URL and watch a folder
- graphify reference: commit hook and native AGENTS.md integration
- graphify reference: incremental update and cluster-only
- Plano de execução
- app_build_app_network_upstreamrequestdetails
- graphify reference: GitHub clone and cross-repo merge
- graphify reference: transcribe video and audio
- Política de segurança
- rules/graphify.md
- extraction-spec.md
- workflows/graphify.md
- ADR 0001: Transferência dos instaladores para a release
- ADR 0002: Controles do repositório público
- Correção das dependências de build e recursos públicos
- client-integrations.md
- engine-install-staging.md
- server-without-browser.md
- session-sharing.md
- stable-api-model-id.md
- windows-cli-visible-console.md
- app_build_app_benchmark_tune
- app_build_app_core_argsformodel
- app_build_app_core_defaults
- app_build_app_core_iswithin
- app_build_app_core_recommend
- app_build_app_core_scanmodels
- app_build_app_core_validatesettings
- app_build_app_engine_assetfor
- app_build_app_firewall_buildfirewallscript
- app_build_app_firewall_createrule
- app_build_app_firewall_port_max
- app_build_app_firewall_port_min
- app_build_app_firewall_validateremoteaddress
- app_build_app_firewall_validateruleoptions
- reportlab_lib_utils
- app_build_app_guidance_buildguidance
- app_build_app_guidance_links
- app_build_app_hardware_detectgpu
- app_build_app_profile_import_parselegacyprofiles
- app_build_app_terminal_cli_openexternalcli
- app_build_app_terminal_cli_posixscript
- app_build_app_terminal_cli_powershellscript
- app_build_app_terminal_cli_psquote
- app_build_app_terminal_cli_shquote
- app_build_app_terminal_cli_terminalcommand
- build_app_benchmark
- build_app_cli
- build_app_core
- build_app_engine
- build_app_firewall
- build_app_guidance
- build_app_hardware
- build_app_network
- build_app_profile_import
- build_app_terminal_cli
- profile_import.ts
- smoke-ui.js
- benchmark.ts
- modelGuidance
- ref_node_assert
- createShareProxy

## God Nodes (most connected - your core abstractions)
1. `RendererApi` - 41 edges
2. `scripts` - 17 edges
3. `compilerOptions` - 13 edges
4. `compilerOptions` - 13 edges
5. `What You Must Do When Invoked` - 12 edges
6. `User manual — Llama Desktop Launcher` - 12 edges
7. `Manual de uso — Llama Desktop Launcher` - 12 edges
8. `build` - 10 edges
9. `/graphify` - 10 edges
10. `6. Llama screen: start a conversation` - 10 edges

## Surprising Connections (you probably didn't know these)
- `Project scope` --references--> `workspace()`  [INFERRED]
  .agents/skills/ai-memory-durable-pages/SKILL.md → tests/engine-install.test.js
- `Project scope` --references--> `workspace()`  [INFERRED]
  .agents/skills/ai-memory-handoff/SKILL.md → tests/engine-install.test.js
- `Project scope` --references--> `workspace()`  [INFERRED]
  .agents/skills/ai-memory-learning-maintenance/SKILL.md → tests/engine-install.test.js
- `Project scope` --references--> `workspace()`  [INFERRED]
  .agents/skills/ai-memory-messaging/SKILL.md → tests/engine-install.test.js
- `Broaden on miss` --references--> `workspace()`  [INFERRED]
  .agents/skills/ai-memory-retrieval/SKILL.md → tests/engine-install.test.js

## Import Cycles
- None detected.

## Communities (104 total, 49 thin omitted)

### Community 0 - "firewall.test.js"
Cohesion: 0.15
Nodes (12): c_users_celio_onedrive_app_e_projetos_llama_desktop_launcher_build_app_firewall, c_users_celio_onedrive_app_e_projetos_llama_desktop_launcher_build_app_firewall_buildfirewallscript, c_users_celio_onedrive_app_e_projetos_llama_desktop_launcher_build_app_firewall_createrule, c_users_celio_onedrive_app_e_projetos_llama_desktop_launcher_build_app_firewall_createrules, c_users_celio_onedrive_app_e_projetos_llama_desktop_launcher_build_app_firewall_port_max, c_users_celio_onedrive_app_e_projetos_llama_desktop_launcher_build_app_firewall_port_min, c_users_celio_onedrive_app_e_projetos_llama_desktop_launcher_build_app_firewall_validateremoteaddress, c_users_celio_onedrive_app_e_projetos_llama_desktop_launcher_build_app_firewall_validateruleoptions (+4 more)

### Community 1 - "RendererApi"
Cohesion: 0.04
Nodes (7): ChatOutput, ImportedProfiles, ModelSettings, ProcessExit, ProgressUpdate, RendererApi, Window

### Community 2 - "main.ts"
Cohesion: 0.07
Nodes (24): {app,BrowserWindow,ipcMain,dialog,shell,clipboard}, benchmark, cli, clientCommands, core, crypto, defaultConfig(), engine (+16 more)

### Community 3 - "build.js"
Cohesion: 0.22
Nodes (8): compiler, fs, output, path, renderer, result, root, { spawnSync }

### Community 4 - "scripts"
Cohesion: 0.06
Nodes (33): author, description, devDependencies, electron, electron-builder, @types/node, typescript, homepage (+25 more)

### Community 5 - "User manual — Llama Desktop Launcher"
Cohesion: 0.04
Nodes (42): 10. Data, updates, and safe uninstalling, 11. Credits, 1. What the application does, 2. Requirements, 3. Install the application, 4. First use: set up llama.cpp, 5. Model folders and GGUF files, 6. Llama screen: start a conversation (+34 more)

### Community 6 - "core.ts"
Cohesion: 0.15
Nodes (13): ref_node_os, caches, defaults, detectHardware(), fs, os, path, scanModels() (+5 more)

### Community 7 - "build"
Cohesion: 0.08
Nodes (24): build, appId, directories, extraResources, files, linux, mac, nsis (+16 more)

### Community 8 - "terminal_cli.ts"
Cohesion: 0.11
Nodes (23): ref_node_string_decoder, argsForConversation(), core, createSession(), executableName(), executablePath(), fs, path (+15 more)

### Community 9 - "build_manual_pdfs.py"
Cohesion: 0.10
Nodes (21): html, pathlib, re, reportlab_lib, reportlab_lib_enums, reportlab_lib_pagesizes, reportlab_lib_styles, reportlab_pdfbase (+13 more)

### Community 10 - "renderer.ts"
Cohesion: 0.18
Nodes (19): action(), applySettings(), DomControl, fillBackends(), fillModelSelectors(), launchServer(), loadGuidance(), message() (+11 more)

### Community 11 - "engine.ts"
Cohesion: 0.08
Nodes (32): ref_node_https, ref_node_stream, assetFor(), assetsFor(), backendOptions(), copyRuntimeLibraries(), crypto, download() (+24 more)

### Community 12 - "firewall.ts"
Cohesion: 0.24
Nodes (16): ALLOWED_RANGES, buildFirewallScript(), createRule(), createRules(), crypto, elevatedPowerShellScript(), encodePowerShell(), { execFile } (+8 more)

### Community 13 - "compilerOptions"
Cohesion: 0.12
Nodes (15): compilerOptions, esModuleInterop, forceConsistentCasingInFileNames, lib, module, moduleResolution, outDir, rootDir (+7 more)

### Community 14 - "core.test.js"
Cohesion: 0.06
Nodes (35): c_users_celio_onedrive_app_e_projetos_llama_desktop_launcher_build_app_benchmark, c_users_celio_onedrive_app_e_projetos_llama_desktop_launcher_build_app_benchmark_tune, c_users_celio_onedrive_app_e_projetos_llama_desktop_launcher_build_app_cli, c_users_celio_onedrive_app_e_projetos_llama_desktop_launcher_build_app_core, c_users_celio_onedrive_app_e_projetos_llama_desktop_launcher_build_app_core_argsformodel, c_users_celio_onedrive_app_e_projetos_llama_desktop_launcher_build_app_core_defaults, c_users_celio_onedrive_app_e_projetos_llama_desktop_launcher_build_app_core_iswithin, c_users_celio_onedrive_app_e_projetos_llama_desktop_launcher_build_app_core_recommend (+27 more)

### Community 15 - "network.ts"
Cohesion: 0.19
Nodes (11): allowLocalRequest(), createProxy(), crypto, ensureKey(), fs, http, net, os (+3 more)

### Community 16 - "compilerOptions"
Cohesion: 0.13
Nodes (14): compilerOptions, forceConsistentCasingInFileNames, lib, module, moduleDetection, moduleResolution, outDir, rootDir (+6 more)

### Community 17 - "smoke-network.js"
Cohesion: 0.18
Nodes (12): check(), crypto, {defaults,argsForModel}, freePort(), fs, http, main(), net (+4 more)

### Community 18 - "network.test.js"
Cohesion: 0.20
Nodes (7): c_users_celio_onedrive_app_e_projetos_llama_desktop_launcher_build_app_network, c_users_celio_onedrive_app_e_projetos_llama_desktop_launcher_build_app_network_createproxy, c_users_celio_onedrive_app_e_projetos_llama_desktop_launcher_build_app_network_upstreamrequestdetails, assert, net, test, { upstreamRequestDetails, createProxy }

### Community 19 - "hardware.ts"
Cohesion: 0.33
Nodes (10): detectGpu(), { execFile }, NULL_GPU, parseLspci(), parseNvidiaSmi(), parsePowerShell(), parseSystemProfiler(), parseVulkan() (+2 more)

### Community 20 - "share_proxy.test.js"
Cohesion: 0.20
Nodes (8): c_users_celio_onedrive_app_e_projetos_llama_desktop_launcher_build_app_share_proxy, c_users_celio_onedrive_app_e_projetos_llama_desktop_launcher_build_app_share_proxy_createshareproxy, assert, {createShareProxy}, http, net, network, test

### Community 21 - "client_commands.ts"
Cohesion: 0.39
Nodes (8): {apiModelId}, applications, bashQuote(), clientCommand(), clientConfiguration(), openCodeCommand(), psQuote(), src_core_apimodelid

### Community 22 - "Manual de uso — Llama Desktop Launcher"
Cohesion: 0.08
Nodes (26): 10. Dados, atualização e desinstalação segura, 11. Créditos, 1. O que o aplicativo faz, 2. Requisitos, 3. Instalar o aplicativo, 4. Primeiro uso: motor llama.cpp, 5. Pastas e modelos GGUF, 6. Tela Llama: iniciar uma conversa (+18 more)

### Community 23 - "What You Must Do When Invoked"
Cohesion: 0.08
Nodes (24): For /graphify add and --watch, For /graphify query, For the commit hook and native AGENTS.md integration, For --update and --cluster-only, /graphify, Honesty Rules, Interpreter guard for subcommands, Part A - Structural extraction for code files (+16 more)

### Community 24 - "ai-memory durable pages"
Cohesion: 0.04
Nodes (43): graphify, Knowledge Architecture: ai-memory + Graphify, Long-term memory (ai-memory), Refreshing this snippet, Semantic Versioning (SemVer), ai-memory durable pages, Architectural decisions get ADR structure and a pin, Deleting durable memory (+35 more)

### Community 25 - "smoke-server-buttons.js"
Cohesion: 0.10
Nodes (17): electron, {app,BrowserWindow,shell}, assert, engineDir, {EventEmitter}, executable, fs, http (+9 more)

### Community 26 - "terminal_cli.test.js"
Cohesion: 0.15
Nodes (12): c_users_celio_onedrive_app_e_projetos_llama_desktop_launcher_build_app_terminal_cli_posixscript, c_users_celio_onedrive_app_e_projetos_llama_desktop_launcher_build_app_terminal_cli_psquote, c_users_celio_onedrive_app_e_projetos_llama_desktop_launcher_build_app_terminal_cli_terminalcommand, ref_node_events, assert, { EventEmitter }, fs, { openExternalCli } (+4 more)

### Community 27 - "graphify reference: extra exports and benchmark"
Cohesion: 0.22
Nodes (8): graphify reference: extra exports and benchmark, Step 6b - Wiki (only if --wiki flag), Step 7 - Neo4j export (only if --neo4j or --neo4j-push flag), Step 7a - FalkorDB export (only if --falkordb or --falkordb-push flag), Step 7b - SVG export (only if --svg flag), Step 7c - GraphML export (only if --graphml flag), Step 7d - MCP server (only if --mcp flag), Step 8 - Token reduction benchmark (only if total_words > 5000)

### Community 28 - "smoke-external-cli-win.js"
Cohesion: 0.20
Nodes (8): c_users_celio_onedrive_app_e_projetos_llama_desktop_launcher_build_app_terminal_cli, c_users_celio_onedrive_app_e_projetos_llama_desktop_launcher_build_app_terminal_cli_powershellscript, assert, fs, os, path, { powershellScript }, { spawn }

### Community 29 - "share_proxy.ts"
Cohesion: 0.25
Nodes (7): ref_node_crypto, ref_node_http, ref_node_net, crypto, http, net, network

### Community 30 - "smoke-external-cli-linux.js"
Cohesion: 0.20
Nodes (8): c_users_celio_onedrive_app_e_projetos_llama_desktop_launcher_build_app_terminal_cli_openexternalcli, c_users_celio_onedrive_app_e_projetos_llama_desktop_launcher_build_app_terminal_cli_shquote, assert, { defaults }, fs, { openExternalCli, shQuote }, os, path

### Community 31 - "client_commands.test.js"
Cohesion: 0.22
Nodes (8): c_users_celio_onedrive_app_e_projetos_llama_desktop_launcher_build_app_client_commands, c_users_celio_onedrive_app_e_projetos_llama_desktop_launcher_build_app_client_commands_clientcommand, c_users_celio_onedrive_app_e_projetos_llama_desktop_launcher_build_app_client_commands_clientconfiguration, c_users_celio_onedrive_app_e_projetos_llama_desktop_launcher_build_app_client_commands_opencodecommand, assert, connection, {openCodeCommand}, test

### Community 32 - "ai-memory routing install"
Cohesion: 0.29
Nodes (6): ai-memory routing install, Managed instruction marker, Managed skill marker, Refresh guidance, Skill install targets, Tools in this cluster

### Community 33 - "ref_node_test"
Cohesion: 0.29
Nodes (6): c_users_celio_onedrive_app_e_projetos_llama_desktop_launcher_build_app_engine, ref_node_test, assert, engine, release, test

### Community 34 - "guidance.test.js"
Cohesion: 0.29
Nodes (6): c_users_celio_onedrive_app_e_projetos_llama_desktop_launcher_build_app_guidance, c_users_celio_onedrive_app_e_projetos_llama_desktop_launcher_build_app_guidance_buildguidance, c_users_celio_onedrive_app_e_projetos_llama_desktop_launcher_build_app_guidance_links, assert, { buildGuidance, links }, test

### Community 35 - "hardware.test.js"
Cohesion: 0.29
Nodes (5): c_users_celio_onedrive_app_e_projetos_llama_desktop_launcher_build_app_hardware, c_users_celio_onedrive_app_e_projetos_llama_desktop_launcher_build_app_hardware_detectgpu, assert, { detectGpu }, test

### Community 36 - "profile_import.test.js"
Cohesion: 0.29
Nodes (5): c_users_celio_onedrive_app_e_projetos_llama_desktop_launcher_build_app_profile_import, c_users_celio_onedrive_app_e_projetos_llama_desktop_launcher_build_app_profile_import_parselegacyprofiles, assert, { parseLegacyProfiles }, test

### Community 37 - "Plano simples da interface"
Cohesion: 0.29
Nodes (6): 1. Separar as três telas, 2. Primeiro uso, 3. Sugestões e prompt, 4. Manual e validação, 5. Versões e releases, Plano simples da interface

### Community 38 - "ref_node_child_process"
Cohesion: 0.25
Nodes (6): ref_node_child_process, fs, mountpoint, os, path, { spawnSync }

### Community 39 - "ref_node_fs"
Cohesion: 0.29
Nodes (6): ref_node_fs, cwd, file, fs, path, pkg

### Community 40 - "graphify reference: query, path, explain"
Cohesion: 0.33
Nodes (5): For /graphify explain, For /graphify path, graphify reference: query, path, explain, Step 0 — Constrained query expansion (REQUIRED before traversal), Step 1 — Traversal

### Community 41 - "ref_node_path"
Cohesion: 0.20
Nodes (12): ref_node_path, checkReleaseRef(), checkVersions(), fs, isSemVer(), lock, manifest, path (+4 more)

### Community 42 - "graphify reference: add a URL and watch a folder"
Cohesion: 0.50
Nodes (3): For /graphify add, For --watch, graphify reference: add a URL and watch a folder

### Community 43 - "graphify reference: commit hook and native AGENTS.md integration"
Cohesion: 0.50
Nodes (3): For git commit hook, For native AGENTS.md integration, graphify reference: commit hook and native AGENTS.md integration

### Community 44 - "graphify reference: incremental update and cluster-only"
Cohesion: 0.50
Nodes (3): For --cluster-only, For --update (incremental re-extraction), graphify reference: incremental update and cluster-only

### Community 45 - "Plano de execução"
Cohesion: 0.50
Nodes (3): Decisões ainda abertas, Licença, Plano de execução

### Community 49 - "Política de segurança"
Cohesion: 0.29
Nodes (6): Como relatar uma vulnerabilidade, Política de segurança, Reporting a vulnerability, Security Policy, Supported versions, Versões com suporte

### Community 54 - "ADR 0001: Transferência dos instaladores para a release"
Cohesion: 0.40
Nodes (4): ADR 0001: Transferência dos instaladores para a release, Consequências, Contexto, Decisão

### Community 55 - "ADR 0002: Controles do repositório público"
Cohesion: 0.40
Nodes (4): ADR 0002: Controles do repositório público, Consequências, Contexto, Decisão

### Community 56 - "Correção das dependências de build e recursos públicos"
Cohesion: 0.40
Nodes (4): Consequências, Contexto, Correção das dependências de build e recursos públicos, Decisão

### Community 98 - "profile_import.ts"
Cohesion: 0.29
Nodes (7): ref_node_util, decodeProfilePath(), parseLegacyProfiles(), path, SETTINGS_FIELDS, { TextDecoder }, { validateSettings }

### Community 99 - "smoke-ui.js"
Cohesion: 0.25
Nodes (6): {app,BrowserWindow}, fs, os, path, temporary, withModel

### Community 100 - "benchmark.ts"
Cohesion: 0.32
Nodes (7): benchArgs(), execute(), fs, path, {spawn}, tune(), {validateSettings}

### Community 101 - "modelGuidance"
Cohesion: 0.33
Nodes (6): buildGuidance(), links, tier(), availableModelDiskBytes(), gpuDetails(), modelGuidance()

### Community 102 - "ref_node_assert"
Cohesion: 0.40
Nodes (4): ref_node_assert, assert, pkg, test

## Knowledge Gaps
- **457 isolated node(s):** `name`, `version`, `private`, `license`, `author` (+452 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 646 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **49 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `workspace()` connect `ai-memory durable pages` to `engine.ts`?**
  _High betweenness centrality (0.065) - this node is a cross-community bridge._
- **Why does `electron` connect `smoke-server-buttons.js` to `main.ts`, `smoke-ui.js`, `scripts`?**
  _High betweenness centrality (0.051) - this node is a cross-community bridge._
- **Why does `build` connect `build` to `scripts`?**
  _High betweenness centrality (0.032) - this node is a cross-community bridge._
- **What connects `name`, `version`, `private` to the rest of the system?**
  _457 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `RendererApi` be split into smaller, more focused modules?**
  _Cohesion score 0.041666666666666664 - nodes in this community are weakly interconnected._
- **Should `main.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.06653225806451613 - nodes in this community are weakly interconnected._
- **Should `scripts` be split into smaller, more focused modules?**
  _Cohesion score 0.058823529411764705 - nodes in this community are weakly interconnected._