#!/usr/bin/env bash
# scripts/package-extension.sh
# dist/extension/ → blogbenchmarker-{version}.zip 생성 (Chrome Web Store 제출용).
#
# 사용:
#   bash scripts/package-extension.sh          # manifest.json 의 version 사용
#   bash scripts/package-extension.sh 1.2.3    # 인자로 version 명시
#
# 생성물: dist/blogbenchmarker-{version}.zip

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="$ROOT/dist"
DIST_EXT="$DIST_DIR/extension"

log()  { printf '\033[0;36m[package]\033[0m %s\n' "$*"; }
fail() { printf '\033[0;31m[package 실패]\033[0m %s\n' "$*" >&2; exit 1; }

[ -d "$DIST_EXT" ] || fail "dist/extension 이 없습니다. 먼저 'bash scripts/build.sh' 를 실행하세요."
command -v zip >/dev/null 2>&1 || fail "zip 이 필요합니다."
command -v node >/dev/null 2>&1 || fail "node 가 필요합니다 (version 읽기)."

# 버전 인자 또는 manifest.json 에서 추출
VERSION="${1:-}"
if [ -z "$VERSION" ]; then
  VERSION="$(node -p "require('$DIST_EXT/manifest.json').version")"
fi
[ -n "$VERSION" ] && [ "$VERSION" != "undefined" ] || fail "버전을 확인할 수 없습니다."

ZIP_NAME="blogbenchmarker-$VERSION.zip"
ZIP_PATH="$DIST_DIR/$ZIP_NAME"

# 기존 zip 제거
rm -f "$ZIP_PATH"

log "zip 생성: $ZIP_PATH"
# -r 재귀, -X .DS_Store 같은 확장 속성 제외, -9 최대 압축.
# 디렉토리 기준 변경: dist/extension 내부를 압축 (zip 루트가 extension/ 이 아니라 파일 바로 있도록)
( cd "$DIST_EXT" && zip -r -X -9 "$ZIP_PATH" . \
    -x "*.DS_Store" \
    -x "__MACOSX/*" \
    > /dev/null
)

# 파일 권한 600 (읽기/쓰기 오직 소유자)
chmod 600 "$ZIP_PATH"

SIZE=$(du -sh "$ZIP_PATH" | awk '{print $1}')
FILE_COUNT=$(unzip -l "$ZIP_PATH" 2>/dev/null | awk 'END{print $2}')

log "완료: $ZIP_NAME ($SIZE, $FILE_COUNT files)"
