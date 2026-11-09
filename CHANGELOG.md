version: 0.1.22

- Tasks F10 (#48): `C` (ou Shift+C), fora de um campo de texto e em qualquer tela, abre um formulário flutuante com título, status e prioridade no último board usado. Confirmar cria no topo do status e fecha; com o Tasks na tela, no mesmo board, o board relê, e em qualquer outro lugar aparece o aviso "CASA-2 criada".
- `POST /tasks` aceita `priority` opcional (ausente é 0, "sem"); fora de 0 a 4 é 400 nomeando o campo `priority`. A RN8 do PRD passa a ler "nasce sem quando ninguém escolhe".
- A costura de comandos do shell ganha `notify(texto)` e o atalho de letra solta com Shift, que com um comando aberto é texto dele.
