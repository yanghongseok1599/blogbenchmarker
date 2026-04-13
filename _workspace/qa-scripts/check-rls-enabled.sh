#!/bin/bash
# check-rls-enabled.sh
# 목적: supabase/migrations/*.sql 안에서 CREATE TABLE public.<name> 으로 정의된
#       모든 테이블이 ENABLE ROW LEVEL SECURITY 구문을 가지는지 정적 파싱한다.
# 종료코드: 0 = 모든 public 테이블이 RLS ENABLE, 1 = 누락 발견
# 비고: 동일 효과의 런타임 SQL 쿼리는 이 폴더의 check-rls-enabled.sql 참조.
# 근거: supabase-migration-rules §2-1, boundary-qa §3-3

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

cd "${PROJECT_ROOT}"

MIGRATION_DIR="supabase/migrations"

echo "🔍 [3/5] public 테이블 RLS ENABLE 누락 검사 중..."
echo "    검사 대상: ${MIGRATION_DIR}/*.sql"

if [[ ! -d "${MIGRATION_DIR}" ]]; then
  echo "⚠️  ${MIGRATION_DIR} 가 없습니다. Phase 1.2 시작 전이라면 정상입니다."
  exit 0
fi

shopt -s nullglob
SQL_FILES=( "${MIGRATION_DIR}"/*.sql )
shopt -u nullglob

if [[ ${#SQL_FILES[@]} -eq 0 ]]; then
  echo "⚠️  마이그레이션 파일이 0건입니다. Phase 1.2 시작 전이라면 정상입니다."
  exit 0
fi

# 1) CREATE TABLE [IF NOT EXISTS] public.<name> 패턴에서 테이블 이름 추출
#    - 대소문자 무관, IF NOT EXISTS 옵션 허용
#    - public.<name> 또는 따옴표 둘러싼 형태 모두 허용
ALL_TABLES="$(grep -hiE 'CREATE[[:space:]]+TABLE[[:space:]]+(IF[[:space:]]+NOT[[:space:]]+EXISTS[[:space:]]+)?(public\.)?"?[a-zA-Z_][a-zA-Z0-9_]*"?' "${SQL_FILES[@]}" 2>/dev/null \
  | sed -E 's/.*CREATE[[:space:]]+TABLE[[:space:]]+(IF[[:space:]]+NOT[[:space:]]+EXISTS[[:space:]]+)?(public\.)?"?([a-zA-Z_][a-zA-Z0-9_]*)"?.*/\3/I' \
  | sort -u)"

# 2) ALTER TABLE [public.]<name> ENABLE ROW LEVEL SECURITY 패턴에서 ENABLE된 테이블 추출
ENABLED_TABLES="$(grep -hiE 'ALTER[[:space:]]+TABLE[[:space:]]+(public\.)?"?[a-zA-Z_][a-zA-Z0-9_]*"?[[:space:]]+ENABLE[[:space:]]+ROW[[:space:]]+LEVEL[[:space:]]+SECURITY' "${SQL_FILES[@]}" 2>/dev/null \
  | sed -E 's/.*ALTER[[:space:]]+TABLE[[:space:]]+(public\.)?"?([a-zA-Z_][a-zA-Z0-9_]*)"?.*/\2/I' \
  | sort -u)"

# 3) ALL_TABLES − ENABLED_TABLES 차집합 = 누락
MISSING="$(comm -23 <(echo "${ALL_TABLES}") <(echo "${ENABLED_TABLES}"))"
# 빈 줄 필터
MISSING="$(echo "${MISSING}" | sed '/^[[:space:]]*$/d')"

# 통계
TOTAL_COUNT="$(echo "${ALL_TABLES}" | sed '/^[[:space:]]*$/d' | wc -l | tr -d ' ')"
ENABLED_COUNT="$(echo "${ENABLED_TABLES}" | sed '/^[[:space:]]*$/d' | wc -l | tr -d ' ')"

echo "    감지된 public 테이블: ${TOTAL_COUNT}개"
echo "    RLS ENABLE된 테이블: ${ENABLED_COUNT}개"

if [[ -n "${MISSING}" ]]; then
  echo ""
  echo "❌ RLS ENABLE 누락 테이블:"
  echo "----------------------------------------"
  echo "${MISSING}" | sed 's/^/  - /'
  echo "----------------------------------------"
  echo "🚨 BLOCKER: 각 테이블에 다음 구문을 추가하세요:"
  echo "   ALTER TABLE public.<table> ENABLE ROW LEVEL SECURITY;"
  exit 1
fi

echo "✅ 모든 public 테이블 RLS ENABLE"
exit 0
