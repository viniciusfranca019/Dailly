#!/usr/bin/env bash
# Which tags `make image` writes (gate #61): only a build of `main` moves the
# version tag and `latest`, the ones the deamon runs against the real diary. Any
# other ref (a branch tried before the merge) gets a tag of its own. A fake
# `docker` on the PATH records the build; nothing is built.
#   bash docker/image-tags.test.sh
set -u
ROOT="$(git rev-parse --show-toplevel)"
fails=0
check() { if [ "$2" -eq 0 ]; then echo "ok   $1"; else echo "FAIL $1"; fails=$((fails + 1)); fi; }

T="$(mktemp -d)"
trap 'rm -rf "$T"' EXIT
mkdir -p "$T/bin"
{
  echo '#!/usr/bin/env bash'
  echo "echo \"\$*\" >> '$T/docker.log'"
  echo 'cat >/dev/null'
} > "$T/bin/docker"
chmod +x "$T/bin/docker"

build() { : > "$T/docker.log"; PATH="$T/bin:$PATH" make -C "$ROOT" --no-print-directory image IMAGE_REF="$1" > "$T/out" 2>&1; }

main_version="$(git -C "$ROOT" show main:VERSION | tr -d '[:space:]')"
build main
check "a main marca a versão da main e o latest" \
  "$(grep -q -- "-t dailly:$main_version" "$T/docker.log" && grep -q -- "-t dailly:latest" "$T/docker.log"; echo $?)"
check "e diz a tag que escreveu" "$(tail -1 "$T/out" | grep -qx "dailly:$main_version"; echo $?)"

sha="$(git -C "$ROOT" rev-parse --short HEAD)"
build HEAD
check "outro ref não move o latest" "$(! grep -q -- "-t dailly:latest" "$T/docker.log"; echo $?)"
check "nem a tag de versão" "$(! grep -qE -- "-t dailly:[0-9]+\.[0-9]+\.[0-9]+" "$T/docker.log"; echo $?)"
check "ganha uma tag só sua, ref-<sha>" "$(grep -q -- "-t dailly:ref-$sha" "$T/docker.log" && tail -1 "$T/out" | grep -qx "dailly:ref-$sha"; echo $?)"

echo
[ "$fails" -eq 0 ] && echo "todos os cenários passaram" || echo "$fails falha(s)"
[ "$fails" -eq 0 ]
