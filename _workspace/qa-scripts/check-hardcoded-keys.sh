#!/bin/bash
# check-hardcoded-keys.sh
# 목적: extension/ 와 supabase/ 안에 API 키·시크릿이 하드코딩되어 있는지 검사한다.
# 종료코드: 0 = 통과, 1 = 매치 발견(즉시 수정 필요)
# 근거: chrome-extension-security §4-4, supabase-migration-rules §4-3, boundary-qa §3-1
#
# 오탐 회피:
#   1) extension/lib/env-config.js 는 .gitignore 대상 (실제 키 보관소) → 제외
#   2) .sql 파일의 -- 주석 라인은 검사 전 제거 (롤백 주석에 키 모양 토큰이 포함될 수 있음)
#   3) sb_publishable_* 는 Supabase Publishable Key (anon key 후속 명칭, 공개 OK) → 제외

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

cd "${PROJECT_ROOT}"

echo "🔍 [1/5] 하드코딩된 API 키·시크릿 검사 중..."
echo "    검사 대상: extension/, supabase/"

TARGETS=()
[[ -d extension ]] && TARGETS+=("extension")
[[ -d supabase ]] && TARGETS+=("supabase")

if [[ ${#TARGETS[@]} -eq 0 ]]; then
  echo "⚠️  extension/, supabase/ 디렉터리가 없습니다. 골격 생성 전이라면 정상입니다."
  exit 0
fi

# 위험 패턴:
#   1) Google API 키 (AIza... 39자)
#   2) Stripe live 키 (sk_live)
#   3) Supabase service_role 키 표식
#   4) GEMINI_API_KEY="...", OPENAI_API_KEY='...', SUPABASE_*_KEY="..." 인라인 할당
PATTERN='AIza[0-9A-Za-z_-]{30,}|sk_live|service_role|(GEMINI|OPENAI|SUPABASE)_[A-Z_]*_KEY[[:space:]]*=[[:space:]]*['"'"'"][A-Za-z0-9]'

EXCLUDES=(
  --exclude-dir=node_modules
  --exclude-dir=.git
  --exclude-dir=dist
  --exclude-dir=build
  --exclude='*.example.js'
  --exclude='*.example.ts'
  --exclude='env-config.js'   # .gitignore 대상 — 실제 키 보관소
  --exclude='*.lock'
  --exclude='*.md'
)

# 1차 grep: 후보 라인 수집
RAW_MATCHES="$(grep -rEn "${EXCLUDES[@]}" "${PATTERN}" "${TARGETS[@]}" 2>/dev/null || true)"

# 후처리 필터:
#   (a) .sql 파일의 SQL 주석 라인(-- ...) 제거: "<path>.sql:<n>:    -- 주석"
#   (b) .ts/.js/.mts/.cts/.jsx/.tsx 파일의 JS/TS 라인 주석(// ...) 제거
#   (c) Supabase Publishable Key(sb_publishable_*) 매치 제거 (공개 OK)
FILTERED="$(echo "${RAW_MATCHES}" \
  | grep -vE '\.sql:[0-9]+:[[:space:]]*--' \
  | grep -vE '\.(t|j|mt|ct)sx?:[0-9]+:[[:space:]]*//' \
  | grep -vE '\.(t|j|mt|ct)sx?:[0-9]+:[[:space:]]*\*' \
  | grep -vE 'sb_publishable_[A-Za-z0-9_-]+' \
  || true)"

# 빈 줄 정리
FILTERED="$(echo "${FILTERED}" | sed '/^[[:space:]]*$/d')"

if [[ -n "${FILTERED}" ]]; then
  echo ""
  echo "❌ 하드코딩된 키/시크릿 발견:"
  echo "----------------------------------------"
  echo "${FILTERED}"
  echo "----------------------------------------"
  echo "🚨 BLOCKER: 즉시 .env 또는 Supabase Secrets로 이동하세요."
  exit 1
fi

echo "✅ 하드코딩된 키 0건 (env-config.js, .sql 주석, sb_publishable_* 제외)"
exit 0
