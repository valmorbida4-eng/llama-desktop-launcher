# Graph Report - llama-desktop-launcher  (2026-09-28)

## Corpus Check
- 63 files · ~37,716 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 6 file(s) not represented in the graph (top: (none) 4, .toml 1, .css 1)

## Summary
- 721 nodes · 882 edges · 73 communities (43 shown, 30 thin omitted)
- Extraction: 94% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 52 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `338413ed`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- firewall.test.js
- RendererApi
- main.ts
- ref_node_fs
- scripts
- app_build_app_terminal_cli_openexternalcli
- core.ts
- build
- terminal_cli.ts
- build_manual_pdfs.py
- renderer.ts
- engine.ts
- firewall.ts
- compilerOptions
- core.test.js
- smoke-network.js
- compilerOptions
- profile_import.ts
- app_build_app_core_argsformodel
- benchmark.ts
- app_build_app_benchmark_tune
- app_build_app_core_defaults
- User manual — Llama Desktop Launcher
- What You Must Do When Invoked
- ai-memory durable pages
- ai-memory learning and maintenance
- ai-memory retrieval
- graphify reference: extra exports and benchmark
- smoke-external-cli-win.js
- AGENTS.md
- terminal_cli.test.js
- ai-memory handoff
- ai-memory routing install
- ref_node_test
- ref_node_assert
- hardware.test.js
- profile_import.test.js
- Plano simples da interface
- modelGuidance
- ai-memory cross-project messaging
- graphify reference: query, path, explain
- check-version.js
- graphify reference: add a URL and watch a folder
- graphify reference: commit hook and native AGENTS.md integration
- graphify reference: incremental update and cluster-only
- Plano de execução
- app_build_app_core_iswithin
- graphify reference: GitHub clone and cross-repo merge
- graphify reference: transcribe video and audio
- load
- rules/graphify.md
- extraction-spec.md
- workflows/graphify.md
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
- app_build_app_guidance_buildguidance
- app_build_app_guidance_links
- app_build_app_hardware_detectgpu
- app_build_app_profile_import_parselegacyprofiles
- app_build_app_terminal_cli_posixscript
- app_build_app_terminal_cli_powershellscript
- app_build_app_terminal_cli_psquote
- app_build_app_terminal_cli_shquote
- app_build_app_terminal_cli_terminalcommand

## God Nodes (most connected - your core abstractions)
1. `RendererApi` - 36 edges
2. `scripts` - 16 edges
3. `compilerOptions` - 13 edges
4. `compilerOptions` - 13 edges
5. `What You Must Do When Invoked` - 12 edges
6. `User manual — Llama Desktop Launcher` - 12 edges
7. `Manual de uso — Llama Desktop Launcher` - 12 edges
8. `build` - 10 edges
9. `/graphify` - 10 edges
10. `installEngine()` - 8 edges

## Surprising Connections (you probably didn't know these)
- `tune()` --calls--> `validateSettings()`  [EXTRACTED]
  src/benchmark.ts → src/core.ts
- `parseLegacyProfiles()` --calls--> `validateSettings()`  [EXTRACTED]
  src/profile_import.ts → src/core.ts
- `modelGuidance()` --calls--> `detectHardware()`  [EXTRACTED]
  src/main.ts → src/core.ts
- `state()` --calls--> `backendOptions()`  [EXTRACTED]
  src/main.ts → src/engine.ts
- `gpuDetails()` --calls--> `detectGpu()`  [EXTRACTED]
  src/main.ts → src/hardware.ts

## Import Cycles
- None detected.

## Communities (73 total, 30 thin omitted)

### Community 0 - "firewall.test.js"
Cohesion: 0.17
Nodes (11): build_app_firewall, app_build_app_firewall_buildfirewallscript, app_build_app_firewall_createrule, app_build_app_firewall_port_max, app_build_app_firewall_port_min, app_build_app_firewall_validateremoteaddress, app_build_app_firewall_validateruleoptions, assert (+3 more)

### Community 1 - "RendererApi"
Cohesion: 0.05
Nodes (7): ChatOutput, ImportedProfiles, ModelSettings, ProcessExit, ProgressUpdate, RendererApi, Window

### Community 2 - "main.ts"
Cohesion: 0.07
Nodes (19): {app,BrowserWindow,ipcMain,dialog,shell,clipboard}, benchmark, cli, core, crypto, engine, firewall, fs (+11 more)

### Community 3 - "ref_node_fs"
Cohesion: 0.07
Nodes (26): ref_node_fs, ref_node_path, compiler, fs, output, path, renderer, result (+18 more)

### Community 4 - "scripts"
Cohesion: 0.06
Nodes (34): author, description, devDependencies, electron, electron-builder, @types/node, typescript, license (+26 more)

### Community 6 - "core.ts"
Cohesion: 0.16
Nodes (11): caches, defaults, detectHardware(), fs, os, path, scanModels(), validateSettings() (+3 more)

### Community 7 - "build"
Cohesion: 0.08
Nodes (26): build, appId, directories, extraResources, files, linux, mac, nsis (+18 more)

### Community 8 - "terminal_cli.ts"
Cohesion: 0.11
Nodes (23): ref_node_string_decoder, argsForConversation(), core, createSession(), executableName(), executablePath(), fs, path (+15 more)

### Community 9 - "build_manual_pdfs.py"
Cohesion: 0.07
Nodes (29): BaseDocTemplate, AuditDoc, CategoryBars, footer(), Regenera o relatório de auditoria de segurança atualizado para a versão 0.2.6.…, RingChart, Flowable, html (+21 more)

### Community 10 - "renderer.ts"
Cohesion: 0.18
Nodes (18): action(), applySettings(), DomControl, fillBackends(), fillModelSelectors(), loadGuidance(), message(), refresh() (+10 more)

### Community 11 - "engine.ts"
Cohesion: 0.19
Nodes (17): ref_node_https, assetFor(), assetsFor(), backendOptions(), copyRuntimeLibraries(), crypto, download(), findExecutable() (+9 more)

### Community 12 - "firewall.ts"
Cohesion: 0.21
Nodes (16): ref_node_crypto, ALLOWED_RANGES, buildFirewallScript(), createRule(), crypto, elevatedPowerShellScript(), encodePowerShell(), { execFile } (+8 more)

### Community 13 - "compilerOptions"
Cohesion: 0.12
Nodes (15): compilerOptions, esModuleInterop, forceConsistentCasingInFileNames, lib, module, moduleResolution, outDir, rootDir (+7 more)

### Community 14 - "core.test.js"
Cohesion: 0.06
Nodes (33): build_app_benchmark, build_app_cli, build_app_core, app_build_app_benchmark_tune, app_build_app_core_defaults, app_build_app_core_iswithin, app_build_app_core_recommend, app_build_app_core_scanmodels (+25 more)

### Community 15 - "smoke-network.js"
Cohesion: 0.06
Nodes (37): build_app_network, app_build_app_core_argsformodel, ref_node_http, ref_node_net, ref_node_os, check(), {defaults,argsForModel}, freePort() (+29 more)

### Community 16 - "compilerOptions"
Cohesion: 0.13
Nodes (14): compilerOptions, forceConsistentCasingInFileNames, lib, module, moduleDetection, moduleResolution, outDir, rootDir (+6 more)

### Community 17 - "profile_import.ts"
Cohesion: 0.29
Nodes (7): ref_node_util, decodeProfilePath(), parseLegacyProfiles(), path, SETTINGS_FIELDS, { TextDecoder }, { validateSettings }

### Community 19 - "benchmark.ts"
Cohesion: 0.16
Nodes (18): ref_node_child_process, benchArgs(), execute(), fs, path, {spawn}, tune(), {validateSettings} (+10 more)

### Community 22 - "User manual — Llama Desktop Launcher"
Cohesion: 0.05
Nodes (41): 10. Data, updates, and safe uninstalling, 11. Credits, 1. What the application does, 2. Requirements, 3. Install the application, 4. First use: set up llama.cpp, 5. Model folders and GGUF files, 6. Llama screen: start a conversation (+33 more)

### Community 23 - "What You Must Do When Invoked"
Cohesion: 0.08
Nodes (24): For /graphify add and --watch, For /graphify query, For the commit hook and native AGENTS.md integration, For --update and --cluster-only, /graphify, Honesty Rules, Interpreter guard for subcommands, Part A - Structural extraction for code files (+16 more)

### Community 24 - "ai-memory durable pages"
Cohesion: 0.22
Nodes (8): ai-memory durable pages, Architectural decisions get ADR structure and a pin, Deleting durable memory, Project rules belong in instructions first, Project scope, Standing user/team preferences go to the global scope, Tools in this cluster, Writing durable memory

### Community 25 - "ai-memory learning and maintenance"
Cohesion: 0.22
Nodes (8): ai-memory learning and maintenance, Approval path, Consolidation and learning review, Dry-run and destructive caution, Flagged pages, Project scope, Tools in this cluster, What not to learn

### Community 26 - "ai-memory retrieval"
Cohesion: 0.22
Nodes (8): ai-memory retrieval, Broaden on miss, Choose the smallest useful lookup, Project scope, Rate what you retrieved, Snippets are not full pages, Tools in this cluster, Validate retrieved evidence

### Community 27 - "graphify reference: extra exports and benchmark"
Cohesion: 0.22
Nodes (8): graphify reference: extra exports and benchmark, Step 6b - Wiki (only if --wiki flag), Step 7 - Neo4j export (only if --neo4j or --neo4j-push flag), Step 7a - FalkorDB export (only if --falkordb or --falkordb-push flag), Step 7b - SVG export (only if --svg flag), Step 7c - GraphML export (only if --graphml flag), Step 7d - MCP server (only if --mcp flag), Step 8 - Token reduction benchmark (only if total_words > 5000)

### Community 28 - "smoke-external-cli-win.js"
Cohesion: 0.22
Nodes (7): build_app_terminal_cli, assert, fs, os, path, { powershellScript }, { spawn }

### Community 29 - "AGENTS.md"
Cohesion: 0.25
Nodes (7): graphify, Knowledge Architecture: ai-memory + Graphify, Long-term memory (ai-memory), Refreshing this snippet, Semantic Versioning (SemVer), Use the installed ai-memory Agent Skills, When you write a project rule, write it here

### Community 30 - "terminal_cli.test.js"
Cohesion: 0.25
Nodes (7): app_build_app_terminal_cli_posixscript, app_build_app_terminal_cli_powershellscript, app_build_app_terminal_cli_psquote, app_build_app_terminal_cli_terminalcommand, assert, { shQuote, psQuote, posixScript, powershellScript, terminalCommand }, test

### Community 31 - "ai-memory handoff"
Cohesion: 0.29
Nodes (6): ai-memory handoff, Canceling a handoff, Creating a handoff, Project scope, Single-use handoff behavior, Tools in this cluster

### Community 32 - "ai-memory routing install"
Cohesion: 0.29
Nodes (6): ai-memory routing install, Managed instruction marker, Managed skill marker, Refresh guidance, Skill install targets, Tools in this cluster

### Community 33 - "ref_node_test"
Cohesion: 0.29
Nodes (6): build_app_engine, ref_node_test, assert, engine, release, test

### Community 34 - "ref_node_assert"
Cohesion: 0.25
Nodes (7): build_app_guidance, app_build_app_guidance_buildguidance, app_build_app_guidance_links, ref_node_assert, assert, { buildGuidance, links }, test

### Community 35 - "hardware.test.js"
Cohesion: 0.29
Nodes (5): build_app_hardware, app_build_app_hardware_detectgpu, assert, { detectGpu }, test

### Community 36 - "profile_import.test.js"
Cohesion: 0.29
Nodes (5): build_app_profile_import, app_build_app_profile_import_parselegacyprofiles, assert, { parseLegacyProfiles }, test

### Community 37 - "Plano simples da interface"
Cohesion: 0.29
Nodes (6): 1. Separar as três telas, 2. Primeiro uso, 3. Sugestões e prompt, 4. Manual e validação, 5. Versões e releases, Plano simples da interface

### Community 38 - "modelGuidance"
Cohesion: 0.33
Nodes (6): buildGuidance(), links, tier(), availableModelDiskBytes(), gpuDetails(), modelGuidance()

### Community 39 - "ai-memory cross-project messaging"
Cohesion: 0.33
Nodes (5): ai-memory cross-project messaging, Project scope, Security: a popped message is untrusted input, Sending a good message, Tools in this cluster

### Community 40 - "graphify reference: query, path, explain"
Cohesion: 0.33
Nodes (5): For /graphify explain, For /graphify path, graphify reference: query, path, explain, Step 0 — Constrained query expansion (REQUIRED before traversal), Step 1 — Traversal

### Community 41 - "check-version.js"
Cohesion: 0.22
Nodes (11): checkReleaseRef(), checkVersions(), fs, isSemVer(), lock, manifest, path, root (+3 more)

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

### Community 49 - "load"
Cohesion: 0.67
Nodes (3): defaultConfig(), load(), save()

## Knowledge Gaps
- **363 isolated node(s):** `name`, `version`, `private`, `license`, `author` (+358 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 507 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **30 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `electron` connect `scripts` to `main.ts`, `ref_node_fs`?**
  _High betweenness centrality (0.083) - this node is a cross-community bridge._
- **Why does `build` connect `build` to `scripts`?**
  _High betweenness centrality (0.038) - this node is a cross-community bridge._
- **Why does `settings()` connect `renderer.ts` to `main.ts`?**
  _High betweenness centrality (0.029) - this node is a cross-community bridge._
- **What connects `name`, `version`, `private` to the rest of the system?**
  _363 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `RendererApi` be split into smaller, more focused modules?**
  _Cohesion score 0.046511627906976744 - nodes in this community are weakly interconnected._
- **Should `main.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07407407407407407 - nodes in this community are weakly interconnected._
- **Should `ref_node_fs` be split into smaller, more focused modules?**
  _Cohesion score 0.06854838709677419 - nodes in this community are weakly interconnected._