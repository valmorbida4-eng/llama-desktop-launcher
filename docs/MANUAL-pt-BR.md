# Manual de uso — Llama Desktop Launcher

Versão 0.1.0 · Português (Brasil)

## 1. O que o aplicativo faz

O Llama Desktop Launcher instala ou localiza o motor [llama.cpp](https://github.com/ggml-org/llama.cpp), encontra modelos locais em formato GGUF e abre a interface do `llama-server` no navegador. Você pode escolher acesso somente local, LAN ou Tailscale. Ao escolher a rede, a API exige uma chave. Os dados trocados com outros computadores trafegam pela rede escolhida.

O instalador do aplicativo **não inclui modelos**. O motor oficial também é baixado na primeira execução, ou você pode indicar uma instalação já existente. A versão do motor testada é `b11193`.

## 2. Requisitos

| Sistema | Instalador | Aceleração de GPU |
| --- | --- | --- |
| Windows x64 | `Llama Desktop Launcher Setup 0.1.0.exe` | Vulkan com driver de vídeo compatível |
| Linux x64/arm64 | AppImage, DEB ou RPM | Vulkan com driver e bibliotecas compatíveis |
| macOS Intel/Apple Silicon | DMG | Metal |

O espaço necessário depende do modelo escolhido. Reserve espaço para o arquivo GGUF, para o cache e para o motor. Modelos grandes podem exigir muito mais memória do que o tamanho do arquivo em disco. Se o computador não tiver GPU compatível, a execução pode cair para CPU e ficar lenta. No Linux, o pacote oficial do motor é compilado no Ubuntu; outras distribuições podem precisar de bibliotecas compatíveis. A matriz do GitHub Actions está configurada para Windows x64, Linux x64/arm64 e macOS Intel/Apple Silicon, mas os artefatos Linux e macOS só estarão validados depois que os jobs correspondentes forem executados e os pacotes forem abertos nos sistemas de destino.

## 3. Instalar o aplicativo

### Windows

1. Abra o instalador `Llama Desktop Launcher Setup 0.1.0.exe`.
2. Escolha a pasta de instalação. O instalador trabalha por usuário, então não precisa colocar o aplicativo em `Program Files`.
3. Marque ou desmarque a criação do atalho da área de trabalho.
4. Conclua a instalação e abra o aplicativo pelo Menu Iniciar ou pelo atalho.

### Linux

- **DEB:** instale pelo gerenciador de pacotes da sua distribuição Debian/Ubuntu.
- **RPM:** instale pelo gerenciador de pacotes da sua distribuição Fedora/RHEL compatível.
- **AppImage:** torne o arquivo executável e abra-o. O AppImage é portátil e fica na pasta que você escolher; não é instalado pelo gerenciador de pacotes.

Os pacotes DEB/RPM usam os diretórios definidos pelo sistema e pelo gerenciador de pacotes. A escolha das pastas de modelos é feita dentro do aplicativo.

Para teste preliminar em Linux x64, você também pode extrair `llama-desktop-launcher-0.1.0-portable-x64.tar.gz` com `tar -xzf` e iniciar `./llama-desktop-launcher-0.1.0/llama-desktop-launcher`. Esse arquivo foi montado no Windows e ainda não teve execução validada em Linux. Ele não instala entradas no menu nem substitui os pacotes AppImage/DEB/RPM.

### macOS

1. Abra o arquivo DMG.
2. Arraste o aplicativo para `Applications` ou para outra pasta onde você queira mantê-lo.
3. Abra o aplicativo pelo Finder.

As versões de desenvolvimento sem assinatura/notarização podem exigir autorização manual nas configurações de segurança do macOS. Não desative as proteções do sistema de forma geral.

## 4. Primeiro uso: motor llama.cpp

No primeiro início, o aplicativo abre a tela **Configurações**. Você pode preencher as opções agora ou clicar em **Concluir agora, baixar depois**. Mais tarde, a aba **Configurações** continua disponível para baixar o motor, apontar para outra instalação ou alterar as pastas de modelos. Na seção **Motor llama.cpp**, escolha uma das opções:

1. **Baixar motor oficial:** o aplicativo acessa a release `b11193` do projeto `ggml-org/llama.cpp` no GitHub e baixa o pacote correspondente ao sistema. Windows/Linux usam Vulkan; macOS usa Metal. O motor é guardado na pasta de dados do seu usuário, fora da instalação do aplicativo.
2. **Escolher pasta existente:** a pasta selecionada precisa conter `llama-server` (ou `llama-server.exe`). Use esta opção para aproveitar uma instalação já preparada, como a pasta `b11193-vulkan` do launcher Windows anterior.

O download requer internet. Se a release não tiver pacote para a arquitetura detectada, selecione um runtime compilado por você. O aplicativo verifica o SHA-256 quando a API da release fornece o digest. Se você já escolheu um motor e quiser substituí-lo, use **Escolher pasta existente** ou baixe novamente o pacote oficial na mesma tela.

Se você usa o launcher Windows anterior, selecione primeiro a pasta que contém seus GGUF. Em **Configurações > Perfis do launcher anterior**, clique em **Importar perfis TSV** e escolha `launcher-profiles.tsv` da pasta do launcher antigo. A importação associa perfis pelo caminho completo do modelo; se você moveu os GGUF, selecione a pasta antiga ou ajuste os perfis manualmente. Perfis já salvos no aplicativo não são sobrescritos. O resultado mostra quantos perfis foram importados, não localizados, já existentes ou inválidos.

## 5. Pastas e modelos GGUF

O aplicativo aceita **duas localizações** de modelos na tela **Configurações**. A primeira começa sugerida em `~/Models/GGUF`; clique em **Alterar** para escolher outro disco ou pasta. A segunda é opcional e pode ser adicionada ou removida. Você pode mudar as duas pastas depois. A tela **Modelos** procura arquivos `.gguf` dentro das subpastas.

Para obter um modelo:

1. Clique em **MoE Q4_K_M** para abrir o [filtro de modelos MoE](https://huggingface.co/models?library=gguf&apps=llama.cpp&base_model_relation=quantized&sort=most_params&search=moe+q4_k_m), ou em **GGUF Q4_K_M** para abrir o [filtro geral Q4_K_M](https://huggingface.co/models?library=gguf&apps=llama.cpp&base_model_relation=quantized&sort=most_params&search=q4_k_m). Os dois links já incluem GGUF, aplicativo llama.cpp e relação de modelo quantizado.
2. Escolha um repositório e confira a **licença do modelo**, requisitos de RAM/VRAM, quantização e instruções do autor.
3. Baixe o arquivo `.gguf` para uma das pastas configuradas. Esta versão abre o Hugging Face no navegador; o download do arquivo é feito pelo navegador.
4. Volte ao aplicativo e clique em **Atualizar lista**.

Se um modelo usa projetor multimodal, mantenha um único arquivo `mmproj*.gguf` na mesma pasta. O aplicativo o associa automaticamente. Em modelos divididos em vários arquivos, todos os shards devem permanecer juntos; a lista mostra apenas o primeiro shard.

**Atenção:** GGUF descreve o formato, mas não garante que todo modelo seja compatível com esta versão do llama.cpp. Repositórios podem exigir uma versão mais nova do motor.

## 6. Iniciar uma conversa

1. Escolha um GGUF na lista **Modelo e desempenho**.
2. Aceite os parâmetros iniciais ou clique em **Aplicar sugestão inicial**. Essa ação preenche os campos sem executar o modelo.
3. Clique em **Abrir no navegador**. O aplicativo inicia `llama-server`, espera o carregamento do modelo e abre a interface web local.
4. Ao terminar, clique em **Parar servidor** no aplicativo.

O carregamento de um modelo grande pode levar alguns minutos. O registro do motor na parte inferior mostra mensagens e erros. Se a aba do navegador for fechada, o servidor continua ativo até você clicar em **Parar servidor** ou encerrar o aplicativo.

## 7. Parâmetros avançados

### Acesso, link e sessões simultâneas

Na seção **Acesso e sessões**, escolha **Somente este computador** ou um endereço LAN/Tailscale detectado. Defina de **1 a 8 sessões simultâneas**. O ajuste passa `--parallel` ao `llama-server`; mais sessões compartilham o contexto e a memória disponíveis, portanto comece com 1 ou 2 se o modelo for grande. Esse número é a capacidade simultânea do servidor, não a quantidade de tokens do contexto. O campo **Contexto** (`-c`) controla os tokens.

Ao iniciar em LAN/Tailscale, use **Mostrar chave**, **Copiar chave** ou **Nova chave**. Para trocar a chave, pare o servidor primeiro. O app abre a interface local por uma ponte autenticada. Use **Copiar link da API** para obter o endereço terminado em `/v1`, e **Copiar link da interface** para obter o endereço web na rede. Clientes remotos devem enviar `Authorization: Bearer SUA_CHAVE`; o link por si só não concede acesso. Uma interface remota também precisa oferecer suporte a essa autenticação. Não coloque a chave no URL nem publique a chave em mensagens abertas.

O aplicativo não altera o firewall ao iniciar o servidor. No Windows, com o servidor LAN/Tailscale ativo, informe a **faixa de clientes permitidos** na seção **Firewall do Windows** e clique em **Criar regra para a porta ativa**. Confirme a solicitação de administrador do Windows. A regra limita o acesso ao executável `llama-server.exe`, à porta ativa e à faixa indicada. Confira a faixa antes de confirmar; se mudar de porta, crie outra regra. No Linux/macOS, siga as regras do firewall da distribuição. O servidor usa uma porta livre de 8080 a 8180. Prefira Tailscale ou uma LAN confiável, pois o HTTP direto na LAN não cifra o tráfego.

### Conversa via llama-cli

Na seção **Conversa via llama-cli**, escolha o modelo e ajuste seus parâmetros acima. Clique em **Conversar aqui** para usar a janela do aplicativo: digite a mensagem e clique em **Enviar**; Enter envia e Shift+Enter cria uma linha. Clique em **Encerrar conversa** ao terminar. O aplicativo mostra a saída do motor nessa janela e não salva o histórico.

Quem prefere o programa original pode clicar em **Abrir CLI no terminal**. O aplicativo abre `llama-cli` (`llama-cli.exe` no Windows) em uma janela de terminal separada, com o modelo e os ajustes atuais. Use o próprio terminal para conversar e encerrá-lo; o botão **Encerrar conversa** controla apenas a conversa interna. Pare o servidor ou a conversa interna antes de abrir a CLI externa. Um terminal gráfico precisa estar instalado no Linux. O terminal externo pode continuar aberto depois que o launcher for fechado.

Cada modelo tem seu próprio perfil. Clique em **Salvar ajustes** para guardá-lo. **Aplicar sugestão inicial** preenche os campos com base na RAM, no número de threads de CPU, no tamanho e no nome do arquivo GGUF. É um ponto de partida, não uma garantia de velocidade ou de uso exato de memória. A sugestão só é salva quando você clica em **Salvar ajustes**, abre o modelo no navegador ou inicia uma conversa pelo aplicativo.

| Campo | Argumento do llama.cpp | Como usar |
| --- | --- | --- |
| Camadas na GPU | `-ngl` | `auto` deixa o motor ajustar; `all` tenta usar GPU para todas as camadas; `0` usa CPU. |
| Dispositivo | `-dev` | Vazio deixa a escolha automática. Use um identificador como `Vulkan0` quando houver mais de uma GPU. |
| Contexto | `-c` | Número de tokens mantidos na conversa. Valores maiores consomem mais memória. |
| Camadas MoE na CPU | `-ncmoe` | Mantém os pesos de especialistas das primeiras camadas na RAM. Só faz sentido para modelos MoE; vazio desativa esse ajuste. |
| Cache K / V | `-ctk` / `-ctv` | `f16` prioriza fidelidade; `q8_0` reduz memória com pequeno custo. Outros formatos devem ser testados por modelo. |
| Flash Attention | `-fa` | `auto`, `on` ou `off`; disponibilidade depende do motor/backend. |
| Threads CPU | `-t` | Número de threads para partes executadas na CPU. Vazio usa o padrão do motor. |
| Batch | `-b` | Tamanho lógico de processamento do prompt. |
| Microbatch | `-ub` | Tamanho físico de cada bloco. Não pode ser maior que batch. |

O motor recebe também `-fit on` para adaptar a carga à memória disponível. Um modelo denso não deve receber `-ncmoe`; deixe o campo vazio. Para um MoE que não cabe totalmente na VRAM, teste o número de camadas MoE na CPU e observe o desempenho e o consumo de RAM.

## 8. Testar o desempenho com o primeiro modelo

Depois de baixar o primeiro GGUF e instalar o motor:

1. Selecione o modelo. Se desejar uma sugestão para vários campos, clique em **Aplicar sugestão inicial**; isso não executa o modelo.
2. Se desejar medir o microbatch, pare o servidor e clique em **Comparar microbatch**. O `llama-bench` testa o valor atual e outro de até 128, limitado pelo batch. Quando os dois valores coincidem, há apenas um teste.
3. Aguarde os resultados de processamento de prompt e geração, em tokens por segundo. O aplicativo coloca no campo **Microbatch** o valor com melhor pontuação; os outros campos permanecem como estavam.
4. Revise os campos e clique em **Salvar ajustes** para manter o resultado sem iniciar o modelo.

O teste pode carregar o modelo mais de uma vez e levar vários minutos. Ele não salva o perfil sozinho nem otimiza contexto, cache, camadas de GPU ou camadas MoE. Esses valores continuam ajustáveis manualmente.

## 9. Solução de problemas

| Sintoma | O que verificar |
| --- | --- |
| Não há modelos na lista | Confirme as duas pastas e a extensão `.gguf`; clique em **Atualizar lista**. |
| O download do motor falhou | Confira internet, espaço livre e acesso ao GitHub. Tente de novo ou use **Escolher pasta existente**. |
| “Pacote sem llama-server” | O arquivo da release pode ter mudado; escolha um runtime compatível manualmente. |
| O servidor encerra ao abrir | Consulte **Registro do motor**; reduza contexto/batch, experimente `-ngl auto` ou menos camadas de GPU. |
| GPU não é usada | Atualize o driver Vulkan no Windows/Linux; no macOS, confirme o pacote Metal. Verifique mensagens do motor. |
| Benchmark falha | Confirme que a pasta do runtime inclui `llama-bench`; tente parâmetros mais conservadores. |
| Modelo não carrega | Verifique todos os shards, compatibilidade com `b11193`, licença/instruções do repositório e memória disponível. |

## 10. Dados, atualização e desinstalação segura

As preferências e perfis ficam em `settings.json` na pasta de dados do usuário do aplicativo. O motor baixado fica sob `engines/` nessa mesma área. Os modelos permanecem nas pastas que você escolheu. O aplicativo não aceita uma pasta de modelos dentro da instalação nem dentro de sua pasta de dados internos.

Antes de desinstalar, volte ao aplicativo, clique em **Parar servidor** se estiver ativo e feche o aplicativo normalmente. No Windows, o desinstalador verifica se ele ainda está aberto e pede que você o feche; **Tentar novamente** prossegue após o fechamento. Ele não força o encerramento do app. Use **Configurações > Aplicativos instalados**. O desinstalador remove o aplicativo e seus atalhos, mas **preserva por padrão os modelos, perfis e o motor baixado**. Não use opções avançadas de remoção de dados sem verificar o conteúdo da pasta de dados.

No Linux, use o gerenciador de pacotes para remover DEB/RPM, ou apague o arquivo AppImage. No macOS, mova o aplicativo para o Lixo. Em ambos, os dados de usuário e os GGUF permanecem para revisão manual. Se você quiser apagá-los, faça isso separadamente depois de confirmar o caminho e fazer cópia de `settings.json` se desejar preservar os perfis. Nunca apague uma pasta de modelos apenas porque ela foi selecionada no aplicativo.

## 11. Créditos

O [llama.cpp](https://github.com/ggml-org/llama.cpp) foi iniciado por [Georgi Gerganov](https://github.com/ggerganov) e é mantido pelos [colaboradores da ggml-org](https://github.com/ggml-org/llama.cpp/blob/master/AUTHORS), sob [licença MIT](https://github.com/ggml-org/llama.cpp/blob/master/LICENSE). Este launcher independente foi desenvolvido para Célio com Codex, com base no launcher WinForms anterior. O código do launcher não tem licença pública definida (`UNLICENSED`) e o pacote npm é privado; defina os termos antes de publicar ou redistribuir o código. Os autores do llama.cpp não participam nem endossam este aplicativo. Cada modelo tem licença própria.
