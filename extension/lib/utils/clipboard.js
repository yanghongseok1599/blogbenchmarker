// lib/utils/clipboard.js
// 안전한 클립보드 복사 유틸.
// - navigator.clipboard.writeText 우선 시도 (HTTPS / secure context 에서만 허용)
// - 실패 시 execCommand('copy') 폴백
// - 폴백의 textarea 는 textContent(value) 로만 설정 → XSS 경로 차단
//
// 외부 호출 규약: 성공/실패 모두 { ok, method?, error? } 객체를 반환한다 (throw 안 함).
// UI 코드는 실패 시 친화 메시지로 사용자에게 안내한다.

/**
 * @typedef {Object} ClipboardResult
 * @property {boolean} ok
 * @property {'clipboard-api' | 'exec-command' | 'none'} [method]
 * @property {string} [error] 사용자 친화 에러 메시지(성공 시 없음)
 */

/** 보안 컨텍스트에서 navigator.clipboard 사용 가능 여부를 보수적으로 검사한다. */
function canUseClipboardApi() {
  if (typeof navigator === 'undefined' || !navigator.clipboard) return false
  // MV3 확장 페이지는 isSecureContext=true. 혹시 false 면 API 호출 생략.
  if (typeof window !== 'undefined' && window.isSecureContext === false) return false
  return typeof navigator.clipboard.writeText === 'function'
}

/**
 * 텍스트를 클립보드에 복사한다.
 * @param {string} text - 복사할 문자열. null/undefined 는 빈 문자열로 처리.
 * @returns {Promise<ClipboardResult>}
 */
export async function copyText(text) {
  const value = text == null ? '' : String(text)

  // 1) 표준 API 경로
  if (canUseClipboardApi()) {
    try {
      await navigator.clipboard.writeText(value)
      return { ok: true, method: 'clipboard-api' }
    } catch (err) {
      // 권한 거부/Transient activation 누락 등 — 폴백으로 계속 진행
      console.warn('[clipboard] clipboard-api 실패, 폴백 시도', err?.message)
    }
  }

  // 2) execCommand 폴백 — document 가 있어야 가능
  if (typeof document === 'undefined' || !document.body) {
    return { ok: false, method: 'none', error: '복사를 지원하지 않는 환경입니다.' }
  }

  const ta = document.createElement('textarea')
  // value 프로퍼티는 DOM 텍스트 노드로만 저장되어 HTML 해석되지 않는다.
  ta.value = value
  ta.setAttribute('readonly', '')
  // 화면 밖 배치 — 화면 점프·레이아웃 흔들림 방지
  ta.style.position = 'fixed'
  ta.style.top = '0'
  ta.style.left = '0'
  ta.style.opacity = '0'
  ta.style.pointerEvents = 'none'
  document.body.appendChild(ta)

  let ok = false
  try {
    ta.select()
    ta.setSelectionRange(0, value.length)
    ok = document.execCommand('copy')
  } catch (err) {
    console.warn('[clipboard] execCommand 실패', err?.message)
  } finally {
    ta.remove()
  }

  if (ok) return { ok: true, method: 'exec-command' }
  return {
    ok: false,
    method: 'none',
    error: '클립보드 복사에 실패했습니다. 텍스트를 직접 선택해 복사해 주세요.',
  }
}
