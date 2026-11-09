version: 0.1.23

- MCP do dailly (#57): um servidor MCP por stdio (`mcp/`, `make mcp`, `.mcp.json`) para o Claude Code operar o Tasks pela API local. As tools leem boards e tarefas, buscam, e criam, mudam, movem e apagam tarefas e comentários. Por padrão opera o diário de verdade (`:4318`); `DAILLY_API_URL` aponta para o de dev.
- O teste "mostra o JSON descomprimido" do Requests espera o gunzip com prazo, em vez de ticks fixos, porque falhava às vezes sob a carga da suíte.
