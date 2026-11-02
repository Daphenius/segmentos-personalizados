# Changelog

## 1.7.2

### Corrigido
- **Alteração gravada no segmento errado:** se uma gravação ainda estava em andamento e você marcava, desmarcava ou removia uma pasta ou documento e logo trocava de segmento, a alteração caía no segmento novo, e o segmento onde você clicou ficava igual. Agora a alteração vale sempre para o segmento que estava aberto no momento do clique. Vale para as caixas de marcação e para os botões × da aba Conteúdo.

### Testes
- Quatro testes novos que seguram uma gravação na fila e trocam de segmento antes de ela terminar: marcar documento, marcar pasta, desmarcar e remover pelo botão ×. Os quatro falham na 1.7.1 e passam na 1.7.2. Total: 34.

## 1.7.1

### Corrigido
- **Menu do botão direito (Ocultar/Restaurar):** as opções usavam o formato antigo (`name`, `condition`, `callback`). O Foundry 14 usa `label`, `visible` e `onClick(event, alvo)`. Agora seguem o formato atual, sem depender da compatibilidade com o formato antigo.
- **Busca da janela de segmentos perdia o cursor:** se outro Mestre (ou o próprio Foundry) alterasse um ator, item ou pasta enquanto você digitava na busca, a janela era redesenhada e o campo perdia o foco. Agora o cursor volta para onde estava.

### Documentação
- README: a linha de resumo diz que o módulo é testado no Foundry e no D&D 5e.

## 1.7.0

### Adicionado
- Tradução para inglês (`lang/en.json`). Os textos em português foram para `lang/pt-BR.json`, e o módulo segue o idioma escolhido no Foundry. Em idiomas sem tradução, aparece em inglês.
- Plural pelas regras do idioma ativo ("1 pasta" / "3 pastas", "1 folder" / "3 folders").

### Alterado
- Um segmento sem nome agora fica com o nome vazio no dado salvo, e a interface mostra "Sem nome" ou "Unnamed" conforme o idioma. Na 1.6.0, o texto "Sem nome" era gravado. Segmentos que já tenham "Sem nome" gravado continuam com esse nome.
- A escolha de tema confere a chave com `Object.hasOwn` em vez de `in`, que também aceitava nomes herdados como `constructor`.

### Publicação
- Primeira versão publicada no GitHub. O `module.json` ganhou os links de instalação (`manifest`, `download`), licença, README, changelog e issues, e o autor passou a ser Daphenius.
- Licença MIT (`LICENSE`) e publicação automática: ao criar uma release `vX.Y.Z` no GitHub, o ZIP e o `module.json` são anexados nela.

### Testes
- Quatro testes novos: os dois arquivos de tradução têm as mesmas chaves e os mesmos campos `{nome}`; o plural segue o idioma; "Sem nome"/"Unnamed" não vai para o dado salvo; os avisos saem no idioma do Mestre. Total: 30.

## 1.6.0

Versão de manutenção. A aparência e o funcionamento para quem usa são os mesmos da 1.5.1, e os dados salvos não mudam de formato.

### Corrigido
- **Segmento criado com falha na gravação:** a janela selecionava o segmento novo antes de saber se ele tinha sido salvo. Se a gravação falhasse, ficava selecionado um segmento inexistente. Agora a janela só muda depois que a gravação confirma.
- **Renomear ou excluir um segmento que outro Mestre acabou de excluir:** antes nada acontecia e nenhum aviso aparecia. Agora renomear avisa que o segmento não existe mais, e nos dois casos a janela é redesenhada com o estado real.
- **Caixa marcada num segmento excluído por outro Mestre:** ficava marcada sem nada ter sido salvo. Agora a janela é redesenhada com o estado real.
- **Erro ao preparar uma alteração:** só aparecia no console. Agora também aparece um aviso na tela.
- **Tooltips:** usavam `data-tooltip`, que no Foundry 14 tenta traduzir o texto e o mostra como HTML. Um nome de pasta com `<` ou igual a uma chave de tradução aparecia errado. Agora usam `data-tooltip-text`, que mostra texto puro.
- **Limpeza dos dados apagava segmentos legítimos:** um segmento sem nome (ou com nome numérico) era descartado na leitura e sumia na próxima gravação. Agora ele é mantido como "Sem nome" (ou com o número como texto).
- **Nomes com mais de 80 caracteres** eram cortados na leitura e gravados cortados. Agora o limite vale só para nomes novos, digitados na janela.
- **Segmentos com o mesmo ID** (só acontece com dados editados à mão) deixavam seleção, renomeação e exclusão ambíguas. Agora o segundo recebe um ID com sufixo (`-2`, `-3`...) e nenhum dos dois some.
- A busca sem acentos usava caracteres invisíveis no código-fonte; foi trocada por uma expressão legível (`\p{Diacritic}`), com o mesmo resultado.
- O comentário que dizia que funções eram exportadas "para os testes automáticos" era falso: não havia testes. Agora há (ver abaixo).

### Desempenho
- A janela de segmentos era redesenhada a cada alteração de qualquer ator ou item, inclusive PV e outros dados da ficha, que mudam o tempo todo em combate. Agora ela só é redesenhada quando muda o nome, a imagem, a pasta ou a marcação de oculto.
- Operações em lote (excluir uma pasta com muitos documentos, importar vários) disparavam um redesenho por documento. Agora os pedidos que chegam num intervalo de 50 ms viram um só. O timer é cancelado quando a janela fecha.

### Organização do código
- `scripts/segmentos.js` (cerca de 900 linhas) foi dividido em `main.js`, `data.js`, `store.js`, `sidebar.js` e `manager.js`, todos módulos ES. O `module.json` aponta só para `main.js`.
- Retirados os separadores decorativos do JavaScript e do CSS, comentários que só repetiam o código e as chamadas opcionais (`super._preRender?.()`) a métodos que sempre existem no `ApplicationV2`.
- `updateSegments` agora retorna `"saved"`, `"unchanged"` ou `"failed"` em vez de `true`/`false`, para quem chama saber se algo foi gravado.

### Testes
- Novos testes automáticos da lógica em `tests/` (`npm test`): 26 casos cobrindo a limpeza dos dados, dados da 1.1.0 e da 1.5.1, IDs repetidos, pastas e herança de subpastas, seleção de segmento, fila de gravação, permissões e limpeza de referências. Usam uma imitação do Foundry e não substituem o teste no Foundry real.

## 1.5.1
- Compatível só com o Foundry 14. Removido o código que tratava formatos de versões anteriores.

## 1.5.0
- Oito temas, escolhidos na janela de segmentos ou nas configurações.
- Corrigida a lista do filtro da barra lateral, que ficava ilegível ao abrir.

## 1.4.0
- Nova interface da janela de segmentos (duas colunas, busca, cartões por pasta, retratos) e do filtro da barra lateral.
