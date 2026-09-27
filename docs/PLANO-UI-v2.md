# Plano simples da interface

## 1. Separar as três telas

- **Llama (uso):** modelo selecionado, conversa integrada, botões **Abrir CLI no terminal** e **Abrir no navegador**, endereço de acesso e sessões. Ajustes avançados do modelo em um acordeão fechado por padrão; botão **Salvar ajustes deste modelo**.
- **Modelos:** listar GGUF locais e mostrar RAM, CPU, GPU/VRAM quando detectáveis e espaço em disco. Mesmo sem GGUF, sugerir faixas de tamanho e quantização compatíveis por estimativa, com limites claros. Oferecer três links Hugging Face: MoE quantizado, modelos densos quantizados e modelos completos, após validar os filtros.
- **Configurações:** motor llama.cpp, até duas pastas de modelos, importação e gestão de perfis, opções globais. Os ajustes do modelo selecionado ficam abertos nesta tela e podem ser salvos por modelo. Manter um botão visível para abrir Configurações em todas as telas.

## 2. Primeiro uso

- Abrir **Configurações** enquanto o motor ou um modelo ainda não estiver pronto/selecionado. Explicar o próximo passo na própria tela e permitir concluir depois.
- Assim que existir um modelo selecionável, abrir **Llama** por padrão nas próximas execuções. A tela **Modelos** serve para encontrar, escolher e trocar GGUF.

## 3. Sugestões e prompt

- Antes do primeiro modelo, calcular sugestões locais a partir do hardware detectado; não depender de uma IA já instalada.
- Depois de instalar um modelo, oferecer **Copiar prompt de análise** e **Analisar com o modelo atual**. O prompt incluirá somente dados relevantes do hardware e ajustes, pedirá sugestões de configuração e de outros modelos compatíveis, e deixará claro que a resposta da IA precisa ser conferida. O benchmark continua sendo a medição real do microbatch.
- Guardar seleção e parâmetros por caminho de modelo. Distinguir ajustes sugeridos, medidos e salvos.

## 4. Manual e validação

- Atualizar os manuais detalhados em português e inglês e gerar versões PDF de ambos com a navegação nova e capturas de tela verificadas.
- Validar os três fluxos: sem modelo, com modelo e após reinstalação; testar conversa integrada, CLI externa, navegador, perfis, links e preservação dos dados na desinstalação. Recompilar instaladores Windows/Linux e prévia macOS depois da revisão.
