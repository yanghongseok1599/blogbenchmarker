#!/bin/bash
# check-email-admin.sh
# 목적: 이메일 비교 기반 관리자 판정 패턴이 코드/마이그레이션에 존재하는지 검사한다.
#       관리자 권한은 반드시 profiles.is_admin 플래그로만 판정해야 한다.
# 종료코드: 0 = 통과, 1 = 매치 발견(즉시 수정 필요)
# 근거: supabase-migration-rules §2-3, chrome-extension-security §4, boundary-qa §4-1

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

cd "${PROJECT_ROOT}"

echo "🔍 [4/5] 이메일 비교 기반 관리자 판정 검사 중..."
echo "    검사 대상: extension/, supabase/migrations/"

# 검사 대상 디렉터리 존재 여부 확인
TARGETS=()
[[ -d extension ]] && TARGETS+=("extension")
[[ -d supabase/migrations ]] && TARGETS+=("supabase/migrations")

if [[ ${#TARGETS[@]} -eq 0 ]]; then
  echo "⚠️  검사 대상 디렉터리가 없습니다. 골격 생성 전이라면 정상입니다."
  exit 0
fi

# 패턴:
#   1) auth.email() — Postgres RLS에서 이메일 직접 비교
#   2) email === '...' / email == "..." — JS에서 이메일 동등 비교
#   3) .email === 'admin... — admin 도메인/계정 하드코딩
PATTERN='auth\.email\(\)|email[[:space:]]*===[[:space:]]*['"'"'"]|email[[:space:]]*==[[:space:]]*['"'"'"]|\.email[[:space:]]*===[[:space:]]*['"'"'"]admin'

EXCLUDES=(
  --exclude-dir=node_modules
  --exclude-dir=.git
  --exclude-dir=dist
  --exclude-dir=build
  --exclude='*.example.js'
  --exclude='*.example.ts'
  --exclude='*.md'
  --exclude='*.lock'
)

MATCHES="$(grep -rnE "${EXCLUDES[@]}" "${PATTERN}" "${TARGETS[@]}" 2>/dev/null || true)"

if [[ -n "${MATCHES}" ]]; then
  echo ""
  echo "❌ 이메일 비교 기반 관리자 판정 패턴 발견:"
  echo "----------------------------------------"
  echo "${MATCHES}"
  echo "----------------------------------------"
  echo "🚨 BLOCKER: 관리자 판정은 반드시 profiles.is_admin 으로만 수행하세요."
  echo "   RLS 예: EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin)"
  exit 1
fi

echo "✅ 이메일 기반 관리자 판정 패턴 0건"
exit 0
