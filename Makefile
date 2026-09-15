.PHONY: help install dev dev-all test test-watch build build-all check clean

help: ## Lista os alvos disponíveis
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

install: ## Instala dependências
	cd app && pnpm install

dev: ## Sobe o app em http://localhost:5173 (playground em /playground/)
	cd app && pnpm dev

dev-all: ## Sobe o app com todos os módulos ligados por flag
	cd app && VITE_ANALYSE=true pnpm dev

test: ## Roda os testes
	cd app && pnpm test

test-watch: ## Testes em watch
	cd app && pnpm test:watch

build: ## Builda o ui (só os módulos prontos)
	cd app && pnpm build

build-all: ## Builda com todos os módulos ligados por flag
	cd app && VITE_ANALYSE=true pnpm build

check: ## Typecheck + testes
	cd app && pnpm typecheck
	$(MAKE) test

clean:
	rm -rf app/dist app/node_modules
