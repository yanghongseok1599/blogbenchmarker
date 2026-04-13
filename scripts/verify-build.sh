#!/usr/bin/env bash
# scripts/verify-build.sh
# dist/ 검증 — 빌드가 제대로 됐는지 배포 전 최종 점검.
#
# 체크:
#   (A) 필수 파일 존재
#   (B) env-config.js 미포함 (env-config.example.js 만 있어야)
#   (C) console.log/warn/info/debug/trace 잔존 0건 (error 는 제외)
#   (D) manifest.json.version == package.json.version
#   (E) API 키/시크릿 하드코딩 0건
#   (F) innerHTML 할당 0건

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_EXT="$ROOT/dist/extension"
PKG_JSON="$ROOT/package.json"

pass() { printf '  \033[0;32m✓\033[0m %s\n' "$*"; }
fail() { printf '  \033[0;31m✗\033[0m %s\n' "$*"; FAILED=1; }
info() { printf '\033[0;36m[verify]\033[0m %s\n' "$*"; }

FAILED=0

[ -d "$DIST_EXT" ] || { echo "dist/extension 없음. 먼저 빌드하세요."; exit 1; }

info "빌드 산출물 검증: $DIST_EXT"
echo ''

# ─────────────────────────────────────────────────────────────
# A) 필수 파일 존재
# ─────────────────────────────────────────────────────────────
info "(A) 필수 파일 존재 확인"

REQUIRED_FILES=(
  "manifest.json"
  "background/service-worker.js"
  "background/handlers/index.js"
  "sidepanel/panel.html"
  "sidepanel/panel.js"
  "lib/supabase-client.js"
  "lib/dom-safe.js"
  "lib/env-config.example.js"
  "icons/README.md"
)
for f in "${REQUIRED_FILES[@]}"; do
  if [ -e "$DIST_EXT/$f" ]; then
    pass "존재: $f"
  else
    fail "누락: $f"
  fi
done
echo ''

# ─────────────────────────────────────────────────────────────
# B) env-config.js 미포함
# ─────────────────────────────────────────────────────────────
info "(B) env-config.js 미포함 확인"
if [ -f "$DIST_EXT/lib/env-config.js" ]; then
  fail "lib/env-config.js 가 dist 에 포함됨 — 비밀값 유출 위험"
else
  pass "lib/env-config.js 미포함"
fi
if [ -f "$DIST_EXT/lib/env-config.example.js" ]; then
  pass "lib/env-config.example.js 존재 (템플릿)"
else
  fail "lib/env-config.example.js 누락"
fi
echo ''

# ─────────────────────────────────────────────────────────────
# C) console.log/warn/info/debug/trace 잔존 0건
# ─────────────────────────────────────────────────────────────
info "(C) 프로덕션 console 호출 잔존 검사 (error 제외)"
CONSOLE_HITS=$(grep -rnE 'console\.(log|warn|info|debug|trace)\s*\(' "$DIST_EXT" \
  --include='*.js' --include='*.mjs' 2>/dev/null \
  | grep -v '^\s*//' \
  | grep -vE '^\s*\*' \
  || true)
if [ -z "$CONSOLE_HITS" ]; then
  pass "console.log/warn/info/debug/trace 0건"
else
  fail "잔존 console 호출 발견:"
  echo "$CONSOLE_HITS" | sed 's/^/      /'
fi

# error 는 몇 건인지만 참고 표시 (PASS 취급)
ERR_COUNT=$(grep -rnE 'console\.error\s*\(' "$DIST_EXT" --include='*.js' --include='*.mjs' 2>/dev/null | wc -l | tr -d ' ')
pass "console.error 보존: $ERR_COUNT 건 (프로덕션 장애 감시용)"
echo ''

# ─────────────────────────────────────────────────────────────
# D) version 일치
# ─────────────────────────────────────────────────────────────
info "(D) manifest.json.version == package.json.version"
PKG_VER=$(node -p "require('$PKG_JSON').version")
MANIFEST_VER=$(node -p "require('$DIST_EXT/manifest.json').version")
if [ "$PKG_VER" = "$MANIFEST_VER" ]; then
  pass "버전 일치: $PKG_VER"
else
  fail "버전 불일치 — package.json=$PKG_VER, manifest=$MANIFEST_VER"
fi
echo ''

# ─────────────────────────────────────────────────────────────
# E) 시크릿 하드코딩 검사
# ─────────────────────────────────────────────────────────────
info "(E) 시크릿/API 키 하드코딩 검사"
SECRET_HITS=$(grep -rnE '(AIza[0-9A-Za-z_-]{30,}|sk_live_|sb_secret_|service_role|whsec_[A-Za-z0-9_-]+|TOSS_SECRET_KEY\s*=|PORTONE_API_SECRET\s*=)' "$DIST_EXT" \
  --include='*.js' --include='*.json' --include='*.html' 2>/dev/null \
  | grep -vE 'env-config\.example\.js|icons/README|// ' \
  || true)
if [ -z "$SECRET_HITS" ]; then
  pass "시크릿 하드코딩 0건"
else
  fail "시크릿 패턴 의심 발견:"
  echo "$SECRET_HITS" | sed 's/^/      /'
fi
echo ''

# ─────────────────────────────────────────────────────────────
# F) innerHTML 할당 0건
# ─────────────────────────────────────────────────────────────
info "(F) innerHTML 할당 검사"
INNER_HITS=$(grep -rnE '\.innerHTML\s*=' "$DIST_EXT" \
  --include='*.js' --include='*.mjs' --include='*.html' 2>/dev/null \
  | grep -v '^\s*//' || true)
if [ -z "$INNER_HITS" ]; then
  pass "innerHTML 할당 0건"
else
  fail "innerHTML 할당 발견 (XSS 위험):"
  echo "$INNER_HITS" | sed 's/^/      /'
fi
echo ''

# ─────────────────────────────────────────────────────────────
# 결과
# ─────────────────────────────────────────────────────────────
if [ "$FAILED" -eq 0 ]; then
  printf '\033[0;32m[verify]\033[0m 모든 검증 통과.\n'
  exit 0
else
  printf '\033[0;31m[verify]\033[0m 검증 실패 — 위 항목을 수정하세요.\n'
  exit 1
fi
