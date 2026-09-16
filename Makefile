.PHONY: help install dev dev-all test test-watch build build-all check clean

help: ## Lista os alvos disponíveis
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

install: ## Instala dependências
	cd ui && pnpm install

dev: ## Sobe o app em http://localhost:5173 (playground em /playground/)
	cd ui && pnpm dev

dev-all: ## Sobe o app com todos os módulos ligados por flag
	cd ui && VITE_ANALYSE=true pnpm dev

test: ## Roda os testes
	cd ui && pnpm test

test-watch: ## Testes em watch
	cd ui && pnpm test:watch

build: ## Builda o app (só os módulos prontos)
	cd ui && pnpm build

build-all: ## Builda com todos os módulos ligados por flag
	cd ui && VITE_ANALYSE=true pnpm build

check: ## Typecheck + testes
	cd ui && pnpm typecheck
	$(MAKE) test

clean:
	rm -rf ui/dist ui/node_modules
