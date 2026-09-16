.PHONY: help install dev dev-api dev-ui dev-all desktop desktop-dev test test-watch build build-all check clean

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
	@VITE_ANALYSE=true $(MAKE) -j2 dev-api dev-ui

test: ## Roda os testes de todo o workspace
	pnpm test

test-watch: ## Testes em watch
	pnpm test:watch

build: ## Builda o app (só os módulos prontos)
	pnpm --filter @dailly/ui build

build-all: ## Builda com todos os módulos ligados por flag
	VITE_ANALYSE=true pnpm --filter @dailly/ui build

desktop: ## Abre o app completo no Electron (API dentro, banco de verdade)
	$(MAKE) build
	pnpm --filter @dailly/desktop start

desktop-dev: ## Electron apontado para o vite (rode `make dev` em outro terminal)
	pnpm --filter @dailly/desktop build
	cd desktop && DAILLY_DEV_URL=http://localhost:5173 pnpm exec electron .

check: ## Typecheck + testes
	pnpm -r typecheck
	$(MAKE) test

clean:
	rm -rf ui/dist node_modules ui/node_modules packages/*/node_modules
