#!/bin/bash
# check-dom-unsafe.sh
# 목적: extension/ 안에서 XSS·CSP 위반 가능성이 있는 DOM API 사용을 검사한다.
# 검사 대상 패턴 (스킬 chrome-extension-security §3-1, §1-3 금지 목록):
#   - 위험 HTML 속성 직접 할당 (스킬 §3-1 표 참조)
#   - 위험 인접 삽입 호출
#   - 레거시 문서 스트림 API
#   - 동적 코드 실행 API (스킬 §1-3 금지 목록)
# 종료코드: 0 = 통과, 1 = 매치 발견
# 근거: chrome-extension-security §3, boundary-qa §3-2

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

cd "${PROJECT_ROOT}"

echo "🔍 [2/5] DOM 안전 헬퍼 우회·동적 코드 실행 검사 중..."
echo "    검사 대상: extension/"

if [[ ! -d extension ]]; then
  echo "⚠️  extension/ 디렉터리가 없습니다. 골격 생성 전이라면 정상입니다."
  exit 0
fi

# 위험 패턴은 self-match 회피용 대괄호 한 글자 클래스로 작성한다.
# 예: [i]nnerHTML 은 grep에서 "innerHTML" 을 매치하지만,
#     이 스크립트 본문에는 literal 문자열이 존재하지 않아 자기 자신은 잡히지 않는다.
PATTERN='[i]nnerHTML[[:space:]]*=|[o]uterHTML[[:space:]]*=|[i]nsertAdjacentHTML[[:space:]]*\(|[d]ocument\.write[[:space:]]*\(|[d]ocument\.writeln[[:space:]]*\(|[[:space:]][e]val[[:space:]]*\(|new[[:space:]]+[F]unction[[:space:]]*\('

EXCLUDES=(
  --exclude-dir=node_modules
  --exclude-dir=.git
  --exclude-dir=dist
  --exclude-dir=build
  --exclude='*.example.js'
  --exclude='*.example.ts'
  --exclude='dom-safe.js'   # 헬퍼 자체는 안전 래퍼 정의를 포함할 수 있음
  --exclude='*.md'
  --exclude='*.lock'
)

MATCHES="$(grep -rnE "${EXCLUDES[@]}" "${PATTERN}" extension/ 2>/dev/null || true)"

if [[ -n "${MATCHES}" ]]; then
  echo ""
  echo "❌ XSS/CSP 위험 패턴 발견:"
  echo "----------------------------------------"
  echo "${MATCHES}"
  echo "----------------------------------------"
  echo "🚨 BLOCKER: lib/utils/dom-safe.js 의 el()·clearAndAppend() 헬퍼로 교체하세요."
  echo "   (참조: .claude/skills/chrome-extension-security/SKILL.md §3-1 §3-2)"
  exit 1
fi

echo "✅ DOM 위험 패턴 0건"
exit 0
