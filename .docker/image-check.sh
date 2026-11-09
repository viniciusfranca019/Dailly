#!/usr/bin/env bash
# The image's scenarios (card #61), against Docker for real: what a unit test
# cannot see (the build context, the volume, the MCP inside the container).
# Not in `make check`, which runs without Docker; `make image-check` runs it.
#
#   IMAGE_REF=main (default) — the ref the image is built from; a branch or HEAD
#   to try it before the merge.
set -euo pipefail

REF="${IMAGE_REF:-main}"
ROOT="$(git rev-parse --show-toplevel)"
NAME="dailly-image-check"
PORT="${CHECK_PORT:-43180}"
DATA="$(mktemp -d)"
PROBE="$ROOT/WIP-probe-not-committed.txt"
fail() { echo "FALHOU: $*" >&2; exit 1; }
# The body to a file first: `curl | grep -q` under pipefail fails when grep stops early.
body() { curl -fsS -o "$DATA.body" "$@" && cat "$DATA.body"; }
ok() { echo "ok: $*"; }
cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; rm -f "$PROBE" "$DATA.body"; rm -rf "$DATA"; }
trap cleanup EXIT

# C1: the image comes from the ref, never from the folder. `make image` says the
# tag it wrote: the version for main, `ref-<sha>` for anything else.
echo "solto na pasta" >"$PROBE"
image="$(make -C "$ROOT" --no-print-directory image IMAGE_REF="$REF" 2>/dev/null | tail -1)"
docker image inspect "$image" >/dev/null 2>&1 || fail "C1: não existe $image"
docker run --rm --entrypoint sh "$image" -c 'test ! -e /app/WIP-probe-not-committed.txt' || fail "C1: o arquivo WIP entrou na imagem"
ok "C1 $image buildada de $REF, sem o arquivo WIP"

start() {
  docker run -d --name "$NAME" -p "127.0.0.1:$PORT:4318" -v "$DATA:/data" "$image" >/dev/null
  for _ in $(seq 1 50); do
    curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1 && return 0
    sleep 0.2
  done
  docker logs "$NAME" >&2; fail "o container não respondeu em /api/health"
}
start

# C2: one origin serves the screen and the API, with Tasks and Requests in the build.
body "http://127.0.0.1:$PORT/" | grep -q '<div id="app"' || fail "C2: a raiz não é a tela"
body "http://127.0.0.1:$PORT/api/health" | grep -q '"status":"ok"' || fail "C2: /api/health"
docker exec "$NAME" sh -c 'grep -l "Buscar tarefa" /app/ui/dist/assets/*.js >/dev/null' || fail "C2: o Tasks não está na tela"
docker exec "$NAME" sh -c 'grep -l "Nova request" /app/ui/dist/assets/*.js >/dev/null' || fail "C2: o Requests não está na tela"
ok "C2 tela e API na mesma origem, com Tasks e Requests"

# C4: the Host guard, as outside the container.
code="$(curl -s -o /dev/null -w '%{http_code}' -H 'Host: evil.example' "http://127.0.0.1:$PORT/api/health")"
[ "$code" = 403 ] || fail "C4: Host de fora respondeu $code"
ok "C4 Host evil.example recusado (403)"

# C5: the MCP inside the image, against the API of the same container.
mcp() {
  printf '%s\n' \
    '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"check","version":"0"}}}' \
    '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
    "$1" | docker exec -i "$NAME" dailly-mcp 2>/dev/null
}
tools="$(mcp '{"jsonrpc":"2.0","id":2,"method":"tools/list"}')"
for tool in create_task create_entry; do
  grep -q "\"$tool\"" <<<"$tools" || fail "C5: a tool $tool não aparece"
done
mcp '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"create_entry","arguments":{"body":"Registro que sobrevive ao container"}}}' \
  | grep -q 'Registro que sobrevive' || fail "C5: create_entry pelo MCP"
ok "C5 o MCP da imagem lista as tools e registra"

# C3: the diary lives in the volume, not in the image.
docker rm -f "$NAME" >/dev/null
start
body "http://127.0.0.1:$PORT/api/entries" | grep -q 'Registro que sobrevive' || fail "C3: o registro sumiu com o container"
ok "C3 o registro continua depois de recriar o container"
