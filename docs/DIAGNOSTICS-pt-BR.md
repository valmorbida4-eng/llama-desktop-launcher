# Guia de diagnóstico — Llama Desktop Launcher

Versão 0.9.0 · Português (Brasil)

Este guia ajuda a descobrir por que algo não funcionou: onde olhar, o que significam as mensagens do aplicativo, problemas comuns de cada motor e plataforma, e como montar um relatório para pedir ajuda. Para o uso normal, veja o **Manual de uso** (`MANUAL-pt-BR`); para clientes e API, o **Guia de integração** (`INTEGRATION-pt-BR`).

## 1. Por onde começar

1. **Leia a mensagem** que aparece abaixo dos botões (em vermelho quando é erro). As mais comuns estão na seção 10.
2. **Abra o Registro do motor** na tela **Llama** (acordeão abaixo dos botões). Ele mostra a saída do motor e as linhas `[launcher]` com o que o aplicativo tentou fazer. As últimas linhas antes de uma falha costumam dizer a causa: falta de memória, arquivo incompatível, porta ocupada, driver ausente.
3. **Copie o relatório de diagnóstico** em **Configurações > 06 · Diagnóstico** (seção 3) se for pedir ajuda.

O registro fica **só na memória** enquanto o launcher está aberto: a janela mostra os últimos 30 mil caracteres e o relatório leva os últimos 12 mil. Não há arquivo de log em disco. Copie o relatório **antes** de fechar o aplicativo.

## 2. Onde ficam os dados

| Sistema | Pasta de dados do aplicativo |
| --- | --- |
| Windows | `%APPDATA%\Llama Desktop Launcher` |
| Linux | `~/.config/Llama Desktop Launcher` |
| macOS | `~/Library/Application Support/Llama Desktop Launcher` |

| Item | Onde fica |
| --- | --- |
| Preferências, pastas e perfis | `settings.json` na pasta de dados |
| Chave permanente da API | `server-api-key.txt` na pasta de dados (não envie a ninguém) |
| llama.cpp baixado | `engines/` na pasta de dados, um subdiretório por download |
| vLLM no Linux | `engines/vllm-0.32.0-…` na pasta de dados (ou o ambiente que você escolheu) |
| vLLM no Windows | Imagem `vllm/vllm-openai:v0.32.0` no Docker Desktop; contêineres `llama-desktop-vllm-…` |
| Strata / PolyStrata | A pasta onde o instalador deles foi executado |
| Pacotes de atualização | `updates/` na pasta de dados |
| Modelos | As pastas escolhidas em **02 · Pastas** |

O caminho de cada motor também aparece em **Configurações**. Se o `settings.json` estiver corrompido, o aplicativo volta à configuração padrão e sobrescreve o arquivo. Faça uma cópia antes de editar à mão.

## 3. Relatório de diagnóstico

Em **Configurações > 06 · Diagnóstico**, clique em **Copiar relatório de diagnóstico**. O texto vai para a área de transferência e aparece logo abaixo do botão para você revisar.

O relatório traz:

- versão do launcher, do Electron e do Node, sistema operacional e arquitetura;
- CPU, RAM, GPU e VRAM detectadas;
- estado de cada motor (pronto, pendente ou indisponível), versão, modo e caminho, além do backend e da release do llama.cpp e do estado do Docker no Windows;
- pastas de modelos (e se existem), quantidade de modelos por motor, modelo selecionado e o perfil dele;
- endereço e sessões escolhidos, servidor ativo (motor, porta, ID do modelo, contexto, compartilhamento);
- estado da verificação de atualizações;
- os últimos 12 mil caracteres do Registro do motor.

Antes de copiar, o aplicativo **remove** a chave permanente da API, a credencial de compartilhamento, cabeçalhos `Bearer`, parâmetros `token=`, variáveis como `*_API_KEY` e `*_TOKEN`, tokens do Hugging Face (`hf_…`) e troca a sua pasta pessoal por `~`. Mesmo assim, **leia o texto antes de enviar**: nomes de modelos, IPs da rede interna e trechos de prompts no registro continuam visíveis.

Para pedir ajuda, abra uma [issue no GitHub](https://github.com/valmorbida4-eng/llama-desktop-launcher/issues) com o relatório, o que você fez e o que esperava. Nunca publique a chave da API nem links com acesso.

### Se o aplicativo não abre

Monte o relatório à mão: sistema e versão, versão do launcher (nome do instalador), como instalou (EXE, DEB, RPM, AppImage, DMG) e a mensagem exibida. No Linux, abra pelo terminal (`llama-desktop-launcher` ou a AppImage) para ver as mensagens de erro. Se o problema começou depois de mexer em `settings.json`, renomeie o arquivo e abra de novo.

## 4. Problemas gerais

| Sintoma | O que fazer |
| --- | --- |
| A lista de modelos está vazia | Confira as pastas em **02 · Pastas** e clique em **Atualizar lista**. GGUF precisa terminar em `.gguf`; vLLM precisa de `config.json` e `.safetensors` na mesma pasta; Strata precisa da pasta instalada escolhida em **01B**. |
| O aplicativo sempre abre em Configurações | Falta um motor pronto, um modelo nas pastas ou um modelo selecionado. Selecione um modelo na tela **Llama** ou clique em **Concluir e ir para Llama**. |
| Os botões de iniciar ficam desabilitados | O motor do modelo selecionado não está pronto (veja o selo em **Configurações**) ou já existe uma execução. Pare o servidor, a conversa ou o teste. |
| “Conversar aqui” e “Abrir CLI” desabilitados | São só para GGUF no llama.cpp. Com vLLM ou Strata, use **Iniciar servidor** e um cliente. |
| A pasta de modelos é recusada | Ela não pode ficar dentro da instalação nem da pasta de dados do aplicativo. |
| GPU ou VRAM aparecem como “não medida” | O sistema não informou um valor confiável. As sugestões usam só a RAM; ajuste à mão. |

## 5. llama.cpp

| Sintoma | Causa provável e solução |
| --- | --- |
| Download do motor falha | Sem internet, sem espaço ou GitHub bloqueado. Tente de novo ou use **Escolher pasta existente** com um motor baixado à mão. |
| “A versão … não contém todos os pacotes de …” | A release não tem esse backend para a sua plataforma. Escolha outro backend. |
| “Checksum SHA-256 do download não confere” | Download corrompido ou interceptado. Tente de novo em outra rede. |
| “O pacote CUDA não contém as bibliotecas esperadas” / “Pacote baixado sem llama-server” | O formato da release mudou. Escolha outro backend ou uma pasta existente e relate o problema. |
| “O motor encerrou antes de ficar pronto.” | Veja o fim do Registro do motor. Em geral: memória insuficiente (reduza contexto, batch ou camadas na GPU, ou use cache `q8_0`), GGUF incompatível com `b12211`, shards faltando ou driver ausente. |
| “Tempo esgotado ao carregar o modelo.” | O llama.cpp tem 5 minutos para carregar. Use um modelo menor, um disco mais rápido ou menos contexto. |
| A GPU não é usada | Confira o backend (CUDA para NVIDIA, Vulkan para qualquer GPU), o driver e o campo **Camadas na GPU** (`auto` ou `all`). O registro mostra quantas camadas foram para a GPU. |
| CUDA não carrega no Windows | Atualize o driver NVIDIA. Se continuar, teste o backend Vulkan. |
| “Este pacote não inclui llama-bench.” / benchmark falha | Use um pacote oficial com `llama-bench` ou ajustes mais conservadores. O teste tem limite de 10 minutos. |
| “Não encontrei um terminal gráfico.” (Linux) | Instale um terminal como `gnome-terminal` ou `xterm` para usar **Abrir CLI no terminal**. |
| “Este pacote do llama.cpp não inclui llama-fit-params.” | Pacote antigo ou incompleto. Baixe o motor oficial de novo. Sem ele, os valores automáticos não aparecem, mas o servidor funciona. |
| Autotuning: tentativa com “não coube na memória” ou “failed to allocate” | Normal: aquela combinação passa do limite da GPU e foi descartada. O resultado usa as que couberam. |
| Autotuning: “Divisão entre GPUs: row” falha | O backend (Vulkan, por exemplo) não suporta `-sm row`. A tentativa é descartada. |
| Autotuning muda pouco ou nada | Um valor só troca o atual com ganho de pelo menos 2%. Com orçamento curto, a busca para antes de testar tudo; a tabela **Medições do autotuning** mostra o que foi testado. |
| “Este modelo não tem camadas MTP (draft-mtp).” | O GGUF não tem camadas NextN/MTP. Escolha outro tipo de decodificação especulativa ou deixe em Auto. |
| “Cache V quantizado exige Flash Attention ligado ou automático.” | Ligue Flash Attention ou use cache V `f16`. |
| “Escolha o modelo rascunho para a decodificação especulativa.” | Os tipos `draft-simple` e `draft-eagle3` precisam de um GGUF menor da mesma família nas pastas de modelos. |
| Um campo aparece em “Não se aplicam a este modelo” | O motivo aparece embaixo dele. Se o launcher não consegue ler o cabeçalho do GGUF, nada é escondido. |

## 6. vLLM

### Linux (ambiente Python)

| Sintoma | Causa provável e solução |
| --- | --- |
| “Python 3 não encontrado.” | Instale `python3` e `python3-venv` (Python 3.10 a 3.13), por exemplo `sudo apt install python3 python3-venv`. |
| “python falhou (1): …” durante a instalação | O `pip` falhou; o fim da mensagem e o registro mostram o motivo (rede, espaço, versão do Python sem wheel). A pasta incompleta é apagada; tente de novo. |
| “A pasta precisa conter bin/vllm.” | Em **Usar ambiente existente**, escolha a raiz do ambiente (a pasta que contém `bin/`). |
| Erro de CUDA ou “no GPU” ao iniciar | O pacote do pip é só para NVIDIA. Confira `nvidia-smi`. Para AMD, instale o vLLM com ROCm pela documentação oficial e aponte esse ambiente. |
| Falta de memória da GPU | Reduza o **Contexto** (`--max-model-len`) e as **Sessões simultâneas** (`--max-num-seqs`), ou use um modelo quantizado (AWQ, GPTQ). |

### Windows (Docker Desktop)

| Sintoma | Causa provável e solução |
| --- | --- |
| “Docker Desktop não encontrado ou parado.” | Instale o Docker Desktop com WSL2, abra-o, espere ficar pronto e clique em **Verificar de novo**. |
| O download da imagem falha | Precisa de cerca de 10 GB livres no disco do WSL e internet estável. Tente de novo; o `docker pull` continua de onde parou. |
| O contêiner não vê a GPU | Ative a GPU no WSL2 conforme a [documentação do Docker](https://docs.docker.com/desktop/features/gpu/) e atualize o driver NVIDIA do Windows. |
| “Os pesos deste modelo são links simbólicos…” | A pasta aponta para arquivos fora dela. Use uma pasta com os arquivos reais ou o layout do cache do Hugging Face (`models--org--nome/snapshots/<hash>`). |
| “O caminho do modelo não pode conter vírgulas…” | Renomeie a pasta ou mova o modelo para um caminho sem vírgulas. |
| O modelo pede download ou falta arquivo | O contêiner roda sem internet (`HF_HUB_OFFLINE=1`). Baixe o repositório completo (inclusive tokenizer) antes. |
| Ficou um contêiner rodando | Rode `docker ps --filter name=llama-desktop-vllm-` e `docker stop NOME`. |
| Clientes da rede não conectam | A regra automática de firewall não vale para o Docker; crie a regra manual do Guia de integração. |
| “O número de GPUs (N) precisa dividir as … cabeças de atenção do modelo.” | Escolha um paralelismo de tensor que divida o número de cabeças (1, 2, 4…). |
| Autotuning do vLLM: a tentativa com `fp8` falha | A GPU não aceita cache KV fp8; a tentativa é descartada. |
| Autotuning do vLLM demora muito | Cada tentativa recarrega o modelo e captura os CUDA graphs. Escolha 20 ou 30 minutos, ou ajuste à mão depois da sugestão inicial. |

O vLLM pode levar vários minutos na primeira carga. O launcher espera até 30 minutos antes de mostrar “Tempo esgotado ao carregar o modelo.”.

## 7. Strata e PolyStrata

| Sintoma | Causa provável e solução |
| --- | --- |
| “A pasta precisa ser uma instalação do Strata ou do PolyStrata já configurada…” | Escolha a raiz da instalação, que contém `serve/server.py` e `.venv`. Se `.venv` não existir, rode o `START-HERE.bat` ou o `setup.sh` deles até o fim. |
| A pasta é aceita, mas nenhum modelo aparece | O launcher lê só os `strata-*.json` da raiz da pasta, ignora `*.shared-settings.json`, arquivos acima de 1 MB e JSON inválido. Configure um modelo pelo instalador deles. |
| As sessões simultâneas não mudam nada | No PolyStrata vale o `parallel` da configuração dele; altere por lá. |
| O servidor encerra ou não fica pronto | Veja o registro: em geral os pesos não foram baixados, a GPU não é suportada ou falta memória. Teste o servidor pelo próprio projeto para isolar o problema. |
| “Não foi possível localizar o Python base do Strata / PolyStrata (pyvenv.cfg)…” | O `.venv` não aponta para um Python existente. Recrie o ambiente pelo instalador deles ou libere a porta manualmente no firewall. |
| O cliente diz que o modelo não existe | Use o **Modelo API** do painel (o `model_name` da configuração), não `modelo-local`. Copie a configuração de novo. |
| Campo do Strata desativado com “A versão instalada … não aceita --…” | O `serve/server.py` instalado não tem essa opção. Atualize pelo instalador do projeto. |

## 8. Rede, chaves e firewall

| Sintoma | Causa provável e solução |
| --- | --- |
| O endereço LAN ou Tailscale não aparece na lista | Só endereços privados IPv4 e Tailscale (`100.64.0.0/10`) são listados. Confira se o Tailscale está conectado e reabra o launcher. |
| Funciona neste PC, mas não em outro | Firewall, IP errado ou outra rede. Teste `GET /v1/models` do outro computador (exemplos no Guia de integração). |
| “Acesso negado: chave ou token de sessão local ausente ou inválido.” | A página da ponte local foi aberta sem o token. Use **Abrir no navegador** de novo. |
| “Acesso compartilhado ausente, expirado ou revogado.” | O link com acesso é de uma execução anterior ou foi revogado. Copie um novo. |
| 401 na porta direta | Chave errada ou trocada com **Nova chave**. Copie a chave atual. |
| “A faixa de clientes precisa conter o endereço da rede selecionada.” | Use uma faixa que inclua o IP do servidor, como `192.168.1.0/24` para `192.168.1.5`. |
| “O endereço remoto deve ficar dentro de uma rede LAN privada ou Tailscale.” | A regra só aceita `10/8`, `172.16/12`, `192.168/16` ou `100.64/10`. |
| “As regras não foram removidas: a autorização de administrador foi negada…” | O pedido de administrador foi negado ou fechado. Clique de novo em **Remover regras do launcher** e confirme. |
| A regra de firewall não é criada | O pedido de administrador foi negado ou fechado. Clique de novo e confirme. |
| Regras antigas continuam liberadas | As regras `LlamaDesktopLauncher-…` ficam no Windows depois que o servidor para. No Strata/PolyStrata elas liberam o `python.exe` do sistema, usado por qualquer programa Python. Use **Configurações > 07 · Firewall do Windows > Remover regras do launcher**, o `wf.msc` ou, em um PowerShell como administrador, `Get-NetFirewallRule -Name 'LlamaDesktopLauncher-*' \| Remove-NetFirewallRule`. |
| “ID de modelo inválido.” ao copiar | O `model_name` do Strata está vazio, tem mais de 128 caracteres, começa com `-` ou contém quebra de linha ou outro caractere de controle. Espaços e símbolos são aceitos. Corrija o nome na configuração `strata-*.json`. |

## 9. Atualizações

| Sintoma | Causa provável e solução |
| --- | --- |
| “Você já usa a versão mais recente”, mas existe uma nova | A verificação roda ao abrir e uma vez por dia. Clique em **Verificar agora**. |
| A verificação falha | Sem acesso a `api.github.com` (rede, proxy ou limite de pedidos). Tente mais tarde ou baixe pela página de releases. |
| “Esta versão não tem pacote para este sistema.” | A release não tem instalador para a sua plataforma. Use as notas da versão para baixar outro formato. |
| “SHA256SUMS.txt não lista o pacote…” / “Checksum … não confere” | O pacote foi apagado por segurança. Tente de novo; se repetir, relate o problema. |

## 10. Mensagens do aplicativo

| Mensagem | Significado |
| --- | --- |
| “Pare a execução atual antes de iniciar outra.” | Já existe um servidor, uma conversa, um teste ou uma preparação de motor. |
| “Instale ou selecione o llama.cpp primeiro.” | O modelo é GGUF e o llama.cpp não está pronto. |
| “Prepare o vLLM em Configurações primeiro.” | Falta instalar o vLLM (Linux) ou baixar a imagem (Windows). |
| “Escolha a pasta do Strata ou do PolyStrata em Configurações primeiro.” | O modelo é do Strata, mas a pasta não está configurada ou não é mais válida. |
| “… está disponível só para modelos GGUF no llama.cpp.” | Conversa integrada, CLI, análise e valores automáticos (`llama-fit-params`) existem só no llama.cpp. |
| “O Strata e o PolyStrata não têm autotuning…” | Quantização, contexto e GPU vêm da configuração do instalador deles. |
| “Já existe um teste em execução.” | Aguarde ou clique em **Cancelar** no autotuning. |
| “Modelo não encontrado nas pastas configuradas.” | O arquivo foi movido ou a pasta mudou. Atualize a lista. |
| “Escolha um endereço de rede disponível.” | O IP escolhido não existe mais (rede trocada). Escolha de novo. |
| “Pare o servidor antes de gerar outra chave.” | A chave não pode mudar com o servidor ativo. |
| “Inicie o servidor em LAN ou Tailscale para compartilhar.” | O compartilhamento não existe no acesso local. |
| “Chave de API inválida. Gere uma nova chave.” | O `server-api-key.txt` foi alterado. Use **Nova chave**. |
| “O vLLM no Docker escuta pelo Docker Desktop…” | A regra automática não vale para o Docker; crie a regra manual. |
| “Escolha uma pasta fora da instalação do aplicativo…” | A desinstalação apagaria essa pasta. |

## 11. Antes de abrir uma issue

- Atualize para a versão mais recente e repita o problema.
- Reproduza com o modelo menor possível e as configurações padrão.
- Copie o relatório de diagnóstico logo depois da falha, antes de fechar o launcher.
- Revise o relatório e tire o que for pessoal.
- Descreva o passo a passo, o resultado esperado e o que aconteceu.
