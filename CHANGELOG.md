version: 0.1.8

- Daily Log na convenção de Módulos (#29): o repositório SQLite de entries nasce no `provide` do módulo, e o `ServerModuleDeps` fica só com a zona. Um manifest sem o entries sobe. A regra pura da tela (`timeline`, `entry-date`) foi para `ui/src/modules/daily-log/model/`.
- `@dailly/server` não exporta mais `sqliteEntryRepository`, que ninguém fora do módulo usava.
