#!/bin/bash
# check-sw-async-return.sh
# 목적: extension/background/service-worker.js 의 chrome.runtime.onMessage.addListener
#       콜백이 비동기 패턴(await/Promise/.then)을 사용하면서도 반드시 `return true` 를
#       포함하는지 정규식 수준으로 확인한다.
# 이유: MV3 Service Worker에서 비동기 sendResponse 사용 시 콜백이 true 를 반환하지 않으면
#       응답 채널이 즉시 닫혀 sendResponse 호출이 유실된다. (스킬 §2-1)
# 종료코드: 0 = 통과, 1 = 비동기인데 return true 누락
# 근거: chrome-extension-security §2-1, boundary-qa §3-5

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

cd "${PROJECT_ROOT}"

SW_FILE="extension/background/service-worker.js"

echo "🔍 [5/5] Service Worker 비동기 응답 패턴 검사 중..."
echo "    검사 대상: ${SW_FILE}"

if [[ ! -f "${SW_FILE}" ]]; then
  echo "⚠️  ${SW_FILE} 가 없습니다. Phase 1.3 시작 전이라면 정상입니다."
  exit 0
fi

# 1) onMessage.addListener 호출 자체가 존재하는가
if ! grep -qE 'chrome\.runtime\.onMessage\.addListener' "${SW_FILE}"; then
  echo "⚠️  chrome.runtime.onMessage.addListener 호출 없음. 메시지 라우터 설계가 다른 파일이라면 README에 명시하세요."
  exit 0
fi

# 2) 콜백 본문에서 비동기 패턴(await / Promise / .then) 흔적 검사
ASYNC_HITS="$(grep -nE '\bawait\b|\bPromise\b|\.then[[:space:]]*\(' "${SW_FILE}" || true)"

# 3) `return true` 존재 검사
HAS_RETURN_TRUE="$(grep -nE '^[[:space:]]*return[[:space:]]+true[[:space:]]*;?[[:space:]]*$|return[[:space:]]+true[[:space:]]*;?[[:space:]]*//' "${SW_FILE}" || true)"

if [[ -n "${ASYNC_HITS}" && -z "${HAS_RETURN_TRUE}" ]]; then
  echo ""
  echo "❌ 비동기 패턴은 사용하나 'return true' 누락:"
  echo "----------------------------------------"
  echo "  비동기 사용 라인:"
  echo "${ASYNC_HITS}" | sed 's/^/    /'
  echo ""
  echo "  return true 발견 라인: (없음)"
  echo "----------------------------------------"
  echo "🚨 BLOCKER: addListener 콜백 마지막에 'return true' 를 추가하세요."
  echo "   누락 시 sendResponse 가 유실되어 UI가 영원히 응답을 기다립니다."
  echo "   (참조: .claude/skills/chrome-extension-security/SKILL.md §2-1)"
  exit 1
fi

if [[ -z "${ASYNC_HITS}" ]]; then
  echo "ℹ️  Service Worker 에 비동기 패턴(await/Promise/.then) 사용 없음 — 검사 불필요."
else
  echo "✅ 비동기 패턴 사용 + 'return true' 존재 (${HAS_RETURN_TRUE%%:*} 줄 등)"
fi

exit 0
