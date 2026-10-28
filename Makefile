.PHONY: help install dev dev-api dev-ui dev-all start start-api start-ui test test-all test-watch build build-all check clean-db clean-db-app clean

# Os dois bancos, que têm riscos bem diferentes.
DEV_DB  := server/dailly.dev.sqlite
# O diário de verdade. É onde o Electron o guardava (ADR 0012): ficou no lugar
# para que cortar o desktop não movesse dado nenhum.
APP_DB  := $(HOME)/.config/dailly/dailly.sqlite

help: ## Lista os alvos disponíveis
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

install: ## Instala dependências de todo o workspace
	pnpm install

dev: ## Sobe API + app (app em http://localhost:5173, playground em /playground/)
	@$(MAKE) -j2 dev-api dev-ui

dev-api: ## Só a API local, em http://127.0.0.1:4317
	pnpm --filter @dailly/server dev

dev-ui: ## Só o renderer. Sem a API junto, a timeline não carrega
	pnpm --filter @dailly/ui dev

dev-all: ## Sobe API + app com todos os módulos ligados por flag
	@VITE_ANALYSE=true VITE_REQUESTS=true $(MAKE) -j2 dev-api dev-ui

test: ## Roda os testes de todo o workspace
	pnpm test

test-all: ## Testes com todos os módulos ligados por flag
	@echo "com as flags ligadas o manifesto tem 3 módulos, então o loop da"
	@echo "composition.test.ts monta Analyse e Requests de verdade — com elas"
	@echo "desligadas ele tem uma iteração só e nunca exercita esse caminho."
	VITE_ANALYSE=true VITE_REQUESTS=true pnpm test

test-watch: ## Testes em watch
	pnpm test:watch

build: ## Builda o app (só os módulos prontos)
	pnpm --filter @dailly/ui build

build-all: ## Builda com todos os módulos ligados por flag
	VITE_ANALYSE=true VITE_REQUESTS=true pnpm --filter @dailly/ui build

start: ## O app de verdade, no navegador, com o diário de verdade: http://localhost:4173
	VITE_REQUESTS=true pnpm --filter @dailly/ui build
	@mkdir -p $(dir $(APP_DB))
	@$(MAKE) -j2 start-api start-ui

# Porta própria, para o diário de verdade e o `make dev` poderem rodar juntos
# sem que um aponte para o banco do outro.
START_PORT := 4318

start-api:
	DAILLY_PORT=$(START_PORT) DAILLY_DB=$(APP_DB) pnpm --filter @dailly/server start

start-ui:
	DAILLY_PORT=$(START_PORT) pnpm --filter @dailly/ui exec vite preview --port 4173 --strictPort

check: ## Typecheck + testes, com e sem as flags de módulo
	pnpm -r typecheck
	$(MAKE) test
	$(MAKE) test-all

clean-db: ## Apaga o banco de desenvolvimento (o que `make dev` usa)
	@rm -f $(DEV_DB) $(DEV_DB)-wal $(DEV_DB)-shm
	@echo "banco de dev apagado — pare a API antes, senão ela recria os arquivos"

clean-db-app: ## Apaga o banco do app instalado. É o diário de verdade: pede confirmação
	@printf 'Isto apaga em definitivo o diário em:\n  %s\nNão há backup e não há como desfazer.\nDigite "apagar" para confirmar: ' "$(APP_DB)"
	@read -r resposta; \
	  if [ "$$resposta" = apagar ]; then \
	    rm -f "$(APP_DB)" "$(APP_DB)-wal" "$(APP_DB)-shm"; \
	    echo "apagado."; \
	  else \
	    echo "cancelado, nada foi tocado."; \
	  fi

clean: ## Apaga build e dependências. Não toca em banco nenhum
	rm -rf ui/dist node_modules ui/node_modules server/node_modules packages/*/node_modules
