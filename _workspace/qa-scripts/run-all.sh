#!/bin/bash
# run-all.sh
# 목적: BLOG BenchMarker 횡단(cross-cutting) BLOCKER 5종 자동 검사 일괄 실행.
# 종료코드: 0 = 모두 통과, 1 = 하나라도 실패
# 사용: bash _workspace/qa-scripts/run-all.sh
# 권장: 매 Phase 작업 시작 전(전 단계 회귀 방지) + 각 Phase 완료 직후 실행.
# 근거: boundary-qa §8 검증 스크립트 자동화

set -uo pipefail
# 주의: 개별 스크립트가 실패해도 전체 결과를 모아서 보고하기 위해 set -e 는 사용하지 않는다.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

CHECKS=(
  "check-hardcoded-keys.sh"
  "check-dom-unsafe.sh"
  "check-rls-enabled.sh"
  "check-email-admin.sh"
  "check-sw-async-return.sh"
)

PASS_COUNT=0
FAIL_COUNT=0
FAIL_NAMES=()

echo "=========================================="
echo "🛡  BLOG BenchMarker — QA 횡단 검사 (5종)"
echo "=========================================="
echo ""

for check in "${CHECKS[@]}"; do
  CHECK_PATH="${SCRIPT_DIR}/${check}"

  if [[ ! -x "${CHECK_PATH}" ]]; then
    # 실행 권한이 없으면 bash 로 직접 실행
    bash "${CHECK_PATH}"
    rc=$?
  else
    "${CHECK_PATH}"
    rc=$?
  fi

  if [[ ${rc} -eq 0 ]]; then
    PASS_COUNT=$((PASS_COUNT + 1))
  else
    FAIL_COUNT=$((FAIL_COUNT + 1))
    FAIL_NAMES+=("${check}")
  fi
  echo ""
done

echo "=========================================="
echo "📊 결과 요약"
echo "=========================================="
echo "✅ PASS: ${PASS_COUNT}/5"
echo "❌ FAIL: ${FAIL_COUNT}/5"

if [[ ${FAIL_COUNT} -gt 0 ]]; then
  echo ""
  echo "실패한 검사:"
  for name in "${FAIL_NAMES[@]}"; do
    echo "  - ${name}"
  done
  echo ""
  echo "🚨 BLOCKER 항목이 발견되었습니다. Phase 진행 전 모두 해결하세요."
  exit 1
fi

echo ""
echo "🎉 모든 횡단 BLOCKER 검사 통과!"
exit 0
