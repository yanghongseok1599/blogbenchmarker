#!/usr/bin/env bash
# scripts/build.sh
# 프로덕션 빌드 파이프라인.
#   (1) dist/ 정리
#   (2) extension/ → dist/extension/ 복사 (env-config.js 제외, .example.js 만 포함)
#   (3) strip-console.js 로 console.log/warn/info/debug/trace 제거 (error 는 유지)
#   (4) package.json 의 version → dist/extension/manifest.json version 동기화
#   (5) zip 생성 (package-extension.sh)
#   (6) 결과 요약 출력
#
# 사용법: bash scripts/build.sh
# 환경: macOS / Linux (rsync, zip, python3 또는 node 필요)

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

DIST_DIR="$ROOT/dist"
DIST_EXT="$DIST_DIR/extension"
SRC_EXT="$ROOT/extension"
PKG_JSON="$ROOT/package.json"

log()  { printf '\033[0;36m[build]\033[0m %s\n' "$*"; }
warn() { printf '\033[0;33m[build]\033[0m %s\n' "$*" >&2; }
fail() { printf '\033[0;31m[build 실패]\033[0m %s\n' "$*" >&2; exit 1; }

# ─────────────────────────────────────────────────────────────
# 사전 점검
# ─────────────────────────────────────────────────────────────

[ -d "$SRC_EXT" ] || fail "extension/ 디렉토리가 없습니다: $SRC_EXT"
[ -f "$PKG_JSON" ] || fail "package.json 이 없습니다."
command -v rsync >/dev/null 2>&1 || fail "rsync 가 필요합니다."
command -v zip >/dev/null 2>&1 || fail "zip 이 필요합니다."
command -v node >/dev/null 2>&1 || fail "node 가 필요합니다 (strip-console.js 실행)."

# 버전 읽기 — node 의존 (jq 대신)
VERSION="$(node -p "require('$PKG_JSON').version")"
[ -n "$VERSION" ] && [ "$VERSION" != "undefined" ] || fail "package.json 의 version 을 읽지 못했습니다."
log "빌드 대상 버전: $VERSION"

# ─────────────────────────────────────────────────────────────
# 1) dist 정리
# ─────────────────────────────────────────────────────────────

log "(1/6) dist/ 정리"
rm -rf "$DIST_DIR"
mkdir -p "$DIST_EXT"

# ─────────────────────────────────────────────────────────────
# 2) 복사 (env-config.js 제외, 기타 불필요 파일 제외)
# ─────────────────────────────────────────────────────────────

log "(2/6) extension/ → dist/extension/ 복사"
rsync -a \
  --exclude='lib/env-config.js' \
  --exclude='lib/env-config.local.js' \
  --exclude='.DS_Store' \
  --exclude='*.map' \
  --exclude='*.md' \
  --exclude='*.log' \
  --exclude='__tests__/' \
  --exclude='node_modules/' \
  --exclude='*.test.js' \
  "$SRC_EXT/" "$DIST_EXT/"

# env-config.example.js 는 남긴다(배포 시 운영자가 env-config.js 로 복사해 키 주입).
if [ ! -f "$DIST_EXT/lib/env-config.example.js" ]; then
  warn "lib/env-config.example.js 누락 — 템플릿 없이 배포 시 설치자가 혼란함."
fi

# env-config.js 포함 누락 재확인 (안전장치)
if [ -f "$DIST_EXT/lib/env-config.js" ]; then
  fail "dist/ 에 env-config.js 가 포함되어 있습니다. rsync 제외 룰을 확인하세요."
fi

# ─────────────────────────────────────────────────────────────
# 3) console 호출 제거
# ─────────────────────────────────────────────────────────────

log "(3/6) strip-console.js 실행 (console.error 는 유지)"
node "$ROOT/scripts/strip-console.js" "$DIST_EXT"

# ─────────────────────────────────────────────────────────────
# 4) manifest.json version 동기화
# ─────────────────────────────────────────────────────────────

log "(4/6) manifest.json version 동기화 → $VERSION"
node -e "
const fs = require('fs');
const p  = '$DIST_EXT/manifest.json';
const j  = JSON.parse(fs.readFileSync(p, 'utf8'));
j.version = '$VERSION';
fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n');
console.log('manifest.version =', j.version);
"

# ─────────────────────────────────────────────────────────────
# 5) zip 생성
# ─────────────────────────────────────────────────────────────

log "(5/6) zip 패키징"
bash "$ROOT/scripts/package-extension.sh" "$VERSION"

# ─────────────────────────────────────────────────────────────
# 6) 요약
# ─────────────────────────────────────────────────────────────

log "(6/6) 빌드 결과 요약"

FILE_COUNT=$(find "$DIST_EXT" -type f | wc -l | tr -d ' ')
TOTAL_SIZE=$(du -sh "$DIST_EXT" | awk '{print $1}')
ZIP_PATH="$DIST_DIR/blogbenchmarker-$VERSION.zip"
ZIP_SIZE="-"
if [ -f "$ZIP_PATH" ]; then
  ZIP_SIZE=$(du -sh "$ZIP_PATH" | awk '{print $1}')
fi

printf '\n'
printf '  📦 버전       : %s\n' "$VERSION"
printf '  📁 파일 수    : %s\n' "$FILE_COUNT"
printf '  📏 총 크기    : %s\n' "$TOTAL_SIZE"
printf '  🗜  zip 크기   : %s\n' "$ZIP_SIZE"
printf '  📍 zip 경로   : %s\n' "$ZIP_PATH"
printf '\n'

log "빌드 완료. verify 는 'npm run verify' 또는 'bash scripts/verify-build.sh' 로 실행."
