version: 0.1.12

- Daily Log, Fase 2, F3 (#35): propriedades. "+ propriedade" sugere as chaves com o tipo; uma chave nova escolhe o tipo uma vez (texto, número ou sim/não), e o valor é conferido por ele. A timeline mostra "chave: valor".
- Migration 7: `property_defs`. Rotas `GET` e `POST /property-defs`; `POST` e `PATCH /entries` recusam chave sem tipo ou valor fora do tipo.
