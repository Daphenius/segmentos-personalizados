# Segmentos Personalizados

## Sobre como este módulo foi feito
Sei que parte da comunidade não gosta de módulos produzidos com IA, então prefiro ser transparente: este foi desenvolvido com ajuda de IA. Não sou programador.

Tudo começou quando um amigo me disse: “cara, ficou muito mais simples, é só fazer uma macro do que você quer”. Fiz a macro para a minha mesa, fui adaptando conforme a necessidade dos jogos e, no fim, ela virou um módulo. Uso nas minhas próprias sessões e resolvi compartilhar caso seja útil para mais alguém.

Se encontrar bugs ou tiver sugestões, abra uma [issue](https://github.com/Daphenius/segmentos-personalizados/issues). Todo retorno é bem-vindo.

---

**Versão 1.7.0** · Foundry VTT 14 · Qualquer sistema · Português e English · Licença MIT · ✅ Testado no Foundry

Módulo para Foundry VTT 14 (não funciona em versões anteriores). Não depende de nenhum sistema de jogo. Permite ao Mestre reunir pastas inteiras e documentos avulsos de Atores e Itens em segmentos (ex.: "Inimigos", "Chefes"), sem mover, copiar ou apagar nada.

## O que faz
- **Segmentos por referência:** cada segmento guarda os IDs das pastas e dos documentos. O conteúdo continua onde está.
- **Pastas inteiras:** incluir uma pasta inclui tudo o que está nela, inclusive subpastas. O que entrar ou sair da pasta depois aparece no segmento sem nenhuma ação extra.
- **Documentos avulsos:** dá para incluir um documento sem a pasta dele. O mesmo documento pode estar em vários segmentos.
- **Gerenciador** (só o Mestre), em duas colunas: à esquerda a lista de segmentos (com a contagem de cada um) e o atalho para os Ocultos; à direita o segmento escolhido, com busca por nome e duas abas:
  - *Conteúdo:* cada pasta aparece como um cartão com os documentos dentro, com retrato; os documentos avulsos aparecem numa lista com a pasta de origem. Clicar no nome abre a ficha. Nenhum documento aparece duas vezes.
  - *Adicionar / remover:* caixas de marcação para pastas (em árvore, com a cor da pasta) e documentos (com retrato). Cada marcação é salva na hora.
    - Pasta marcada por você: caixa normal.
    - Subpasta incluída porque a pasta de cima está marcada: caixa em estado indeterminado, travada, com "herdada de *Pasta*". Para tirar, desmarque a pasta de cima.
    - Subpasta marcada por você e também herdada: continua editável e mostra "também herdada de *Pasta*".
    - Documento que já entra por uma pasta: mostra "já entra por *X*".
- **Filtro na barra lateral:** Todos, Sem segmento, cada segmento e Ocultos (esse último só para o Mestre). Quando há um filtro ativo, o campo fica destacado e ganha um botão × para voltar a "Todos".
- **Temas:** oito temas — Âmbar (padrão), Esmeralda, Arcano, Gelo, Carmesim, Ouro, Pergaminho (claro) e Obsidiana (escuro). Escolha pelas bolinhas no rodapé da janela de segmentos ou em Configurações > Segmentos Personalizados > Tema. Cada usuário escolhe o seu. Os temas coloridos acompanham o modo claro/escuro do Foundry; Pergaminho e Obsidiana usam fundo próprio.
- **Ocultar/restaurar** pelo botão direito (só o Mestre).
- **Idiomas:** português (Brasil) e inglês. O módulo segue o idioma escolhido no Foundry (Configurações > Idioma). Em qualquer outro idioma, aparece em inglês.

## Como os dados são guardados
- Configuração do mundo `segmentos-personalizados.actorsSegments` / `itemsSegments`.
- Cada segmento: `{ id, name, documentIds, folderIds }`. Os dados da 1.1.0 continuam valendo: segmentos antigos ganham `folderIds` vazio na leitura, e isso só é gravado na próxima alteração.
- Pastas de Atores só entram em segmentos de Atores, e pastas de Itens só em segmentos de Itens.
- Na leitura, os dados passam por uma limpeza que não descarta segmentos legítimos:
  - entradas sem ID são ignoradas (não teriam como ser selecionadas);
  - um segmento sem nome aparece como "Sem nome" (o texto não é gravado, então muda junto com o idioma);
  - IDs repetidos na mesma lista de pastas ou documentos viram um só;
  - se dois segmentos tiverem o mesmo ID (só acontece com edição manual dos dados), o segundo passa a usar o ID com sufixo `-2`, `-3`... Os dois continuam existindo.
- O tema é uma configuração de cliente (`segmentos-personalizados.theme`): cada pessoa escolhe o seu.

## Quando algo muda no Foundry
- **Pasta renomeada ou movida:** continua no segmento, porque o ID dela não muda.
- **Documento movido para outra pasta:** passa a seguir a nova pasta. Se a nova pasta não estiver no segmento e ele não tiver sido adicionado como avulso, sai do segmento.
- **Pasta ou documento excluído:** a referência sai dos segmentos e o Mestre recebe um aviso. Nada mais é apagado. Se a exclusão acontecer sem nenhum Mestre conectado, a limpeza é feita quando um Mestre entrar.
- **Pasta excluída com a opção de mover o conteúdo para a pasta de cima:** a pasta sai do segmento, e os documentos que eram dela saem junto (a menos que estejam lá como avulsos).

## Permissões
Criar, renomear, excluir, adicionar e remover são ações só do Mestre. Isso é verificado na hora de salvar, e não apenas escondendo os botões.
Segmentos e a ocultação organizam a barra lateral, mas **não são segurança**: não mudam permissões, e um jogador com acesso a um documento continua podendo abri-lo.

## Como a barra lateral é filtrada
O Foundry não tem uma API para filtrar a barra lateral. O módulo trabalha sobre o HTML que o Foundry já desenhou:
- **Hook usado:** `renderActorDirectory` / `renderItemDirectory`. Ele roda a cada redesenho da barra lateral. A cada vez, o módulo recria os controles (sem duplicar) e reaplica o filtro escolhido. O filtro fica guardado na memória, então sobrevive aos redesenhos. Sistemas que trocam a classe da barra lateral (o dnd5e pode usar uma subclasse) continuam disparando esses hooks, porque o Foundry chama o hook de cada classe da herança.
- **Documentos:** cada linha `li.directory-item[data-entry-id]` recebe a classe `sp-hidden` (`display: none`) quando não pertence ao filtro.
- **Pastas:** a decisão vem dos dados, não do HTML, porque o conteúdo de uma pasta fechada pode não estar desenhado. Uma pasta `li.folder[data-folder-id]` fica visível se algum documento visível estiver nela ou em qualquer subpasta. Assim, as pastas acima de uma pasta incluída continuam aparecendo como caminho. Com "Todos" selecionado, nenhuma pasta é escondida, nem as vazias (comportamento normal do Foundry).
- **Ocultar/restaurar:** ocultar só muda uma flag, e o Foundry não necessariamente redesenha a barra lateral por isso. O módulo escuta `updateActor` / `updateItem` e, quando a mudança tem flags do módulo, chama `ui.actors.render()` / `ui.items.render()`. O hook roda em todos os clientes, então a barra lateral de todos é atualizada sem recarregar a página. Outras mudanças nos documentos não causam redesenho extra.
- **Se o Foundry mudar o HTML da barra lateral** (nomes de classes ou atributos), o filtro deixa de esconder linhas, mas não quebra nada nem apaga dados. Nesse caso, ajuste os seletores em `applyFilter`, no `scripts/sidebar.js`.

## Limitações
- Cobre Atores e Itens do mundo. Não cobre compêndios, Diários, Cenas e outros tipos, nem itens dentro das fichas.
- Com um segmento ativo, pastas fechadas não abrem sozinhas. Abra a pasta para ver o que está dentro.
- O gerenciador mostra o caminho da pasta de origem, mas não a abre na barra lateral.
- O filtro escolhido volta para "Todos" quando a página é recarregada.
- **Dois Mestres editando ao mesmo tempo:** as alterações de um mesmo Mestre entram numa fila e não se perdem. Entre dois Mestres, se ambos gravarem no mesmo instante (dentro do tempo de ida e volta ao servidor), vale a última gravação e a outra se perde. O Foundry não tem gravação condicional para configurações, então isso não dá para eliminar sem um sistema de coordenação que não se justifica para o uso normal. Na prática, só um Mestre mexe nos segmentos por vez.

## Instalação e atualização

### Instalar pelo Foundry (recomendado)

1. No Foundry, vá em **Módulos Complementares → Instalar Módulo**.
2. No campo **URL do Manifesto**, cole:

   ```
   https://github.com/Daphenius/segmentos-personalizados/releases/latest/download/module.json
   ```

3. Clique em **Instalar**, entre no mundo e ative **Segmentos Personalizados** em *Gerenciar Módulos*.

Instalado assim, o Foundry avisa quando houver versão nova e atualiza pelo botão de atualizar.

### Instalar manualmente

1. Baixe `segmentos-personalizados.zip` na [página de releases](https://github.com/Daphenius/segmentos-personalizados/releases).
2. Extraia em `Data/modules/segmentos-personalizados` (a pasta precisa ter esse nome).
3. Reinicie o Foundry e ative **Segmentos Personalizados** em *Gerenciar Módulos* no seu mundo.

### Atualizar manualmente

Apague a pasta `Data/modules/segmentos-personalizados` e extraia a versão nova no lugar. Os segmentos ficam salvos no mundo, não na pasta do módulo, e são mantidos entre versões.

## Suporte e sugestões

Bugs e sugestões pelas [issues do GitHub](https://github.com/Daphenius/segmentos-personalizados/issues). Ajuda a resolver mais rápido dizer a versão do Foundry, a versão do módulo e o que aparece no console (F12).

## Arquivos
- `scripts/main.js`: registra configurações e hooks. É o único arquivo no `module.json`; os outros são importados por ele.
- `scripts/data.js`: regras dos segmentos (limpeza dos dados, pastas, herança). Não grava nada.
- `scripts/store.js`: configurações e gravação (fila de alterações, limpeza de referências, ocultar/restaurar).
- `scripts/sidebar.js`: filtro e menu do botão direito na barra lateral.
- `scripts/manager.js`: janela de segmentos.
- `lang/pt-BR.json` e `lang/en.json`: todos os textos da interface. Para traduzir para outro idioma, copie o `en.json`, traduza os valores (mantendo os campos entre chaves, como `{name}`) e adicione o arquivo em `languages` no `module.json`.
- `tests/`: testes automáticos da lógica. Não são carregados pelo Foundry.

## Testes
Testado no Foundry VTT 14 com o sistema D&D 5e.

Testes automáticos (`npm test`, Node 22): cobrem a limpeza dos dados, a compatibilidade com dados antigos, pastas e herança de subpastas, seleção de segmento, a fila de gravação e as traduções (os dois arquivos precisam ter as mesmas chaves e os mesmos campos). Rodam com uma imitação mínima do Foundry, então mostram que a lógica está certa, não que o módulo funciona dentro do Foundry.

## Licença e créditos

Distribuído sob a **licença MIT**: você pode usar, copiar, modificar e redistribuir, inclusive em projetos comerciais, desde que mantenha o aviso de copyright e a licença. Veja o arquivo [`LICENSE`](LICENSE).

Copyright © 2026 Daphenius.

Idealizado e desenvolvido por Daphenius, com auxílio de Claude e ChatGPT na elaboração, revisão e refatoração do código. A definição das funcionalidades, as decisões do projeto e os testes dentro do Foundry VTT foram realizados pelo autor.

---

## English summary

**Segmentos Personalizados** (Custom Segments) lets the GM group folders and single documents from the Actors and Items sidebars into segments such as "Enemies" or "Bosses", without moving, copying or deleting anything. Selecting a folder includes everything inside it, subfolders too. The sidebar gets a filter (all, no segment, each segment, hidden), and the GM can hide documents from the sidebar with a right-click. Segments and hiding only organize the sidebar; they don't change permissions. Works with any game system; the interface is available in Portuguese and English, with eight color themes.

Requires Foundry VTT 14. Install from Foundry with the manifest URL `https://github.com/Daphenius/segmentos-personalizados/releases/latest/download/module.json` (or extract the release ZIP into `Data/modules/segmentos-personalizados`) and enable it. Issues and suggestions: [GitHub Issues](https://github.com/Daphenius/segmentos-personalizados/issues). Licensed under MIT.

**How this module was made:** I know part of the community doesn't like AI-made modules, so I'd rather be transparent: this one was developed with the help of AI. I'm not a programmer. It started as a macro for my own table, grew as our games needed more, and ended up as a module. I use it in my own sessions and decided to share it in case it's useful to someone else. If you find bugs or have suggestions, please open an issue. All feedback is welcome.
