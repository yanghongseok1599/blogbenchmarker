// extension/content/analyzer-bridge.js
// 글쓰기 에디터의 입력을 debounce(800ms) 감지 → service-worker 에 `analyze.post` 요청
// → 응답을 사이드바 iframe 으로 postMessage 로 전달한다.
//
// 데이터 흐름:
//   [host page editor] --(input/MutationObserver)--> debounce --> chrome.runtime.sendMessage
//                                                                       |
//                                                                       v
//                                                   [service-worker → analyze handler]
//                                                                       |
//                                                                       v
//   [sidebar iframe] <--(postMessage BBM_ANALYSIS)-- [content script]
//
// host page DOM 은 읽기 전용으로만 접근한다. 어떤 엘리먼트도 수정/삽입하지 않는다(사이드바 컨테이너 제외 — injector 담당).

(() => {
  const DEBOUNCE_MS = 800
  const POST_MESSAGE_TYPE = 'BBM_ANALYSIS'
  // iframe 쪽 postMessage 수신 시 origin 검증에 사용. chrome-extension://<id>.
  const EXTENSION_ORIGIN = (() => {
    try {
      return new URL(chrome.runtime.getURL('/')).origin
    } catch (_) {
      return ''
    }
  })()

  /** @type {HTMLIFrameElement | null} */
  let sidebarFrame = null

  /** 사이드바 주입 완료 이벤트 수신 (CustomEvent composed=true, shadow 경계 통과). */
  document.addEventListener('bbm:sidebar-ready', (/** @type {CustomEvent} */ e) => {
    if (e?.detail?.frame instanceof HTMLIFrameElement) {
      sidebarFrame = e.detail.frame
      // 준비 신호 한 번 보내 두면 iframe 측에서 초기 상태 렌더 가능.
      postToSidebar({ status: 'ready' })
    }
  })

  /** @type {number | null} */
  let debounceTimer = null

  function scheduleAnalyze() {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer)
    }
    debounceTimer = /** @type {any} */ (setTimeout(runAnalyze, DEBOUNCE_MS))
  }

  /**
   * 에디터 텍스트를 추출한다. SmartEditor 가 iframe 구조를 가지면
   * same-origin 일 경우에만 내부 document 에 접근한다.
   * 실패 시 null 반환(사이드바에 "감지 실패" 상태 표시).
   * @returns {{ title: string, body: string } | null}
   */
  function extractEditorContent() {
    // 제목 후보
    const titleEl =
      document.querySelector('input[placeholder*="제목"]') ||
      document.querySelector('[data-bbm-role="title"]') ||
      document.querySelector('textarea[placeholder*="제목"]')

    const title =
      (titleEl && 'value' in titleEl && typeof titleEl.value === 'string')
        ? titleEl.value.trim()
        : (titleEl ? String(titleEl.textContent || '').trim() : '')

    // 본문 후보: contenteditable 우선, 그 다음 SmartEditor iframe.
    let bodyText = ''

    const editable = document.querySelector('[contenteditable="true"]')
    if (editable && editable.textContent) {
      bodyText = editable.textContent.trim()
    }

    if (!bodyText) {
      const seFrame = /** @type {HTMLIFrameElement | null} */ (
        document.querySelector('iframe#mainFrame, iframe[name="mainFrame"]')
      )
      if (seFrame) {
        try {
          const doc = seFrame.contentDocument
          if (doc) {
            const inner = doc.querySelector('[contenteditable="true"]') || doc.body
            if (inner && inner.textContent) bodyText = inner.textContent.trim()
          }
        } catch (_) {
          // cross-origin → 접근 불가. host page DOM 은 수정하지 않는다.
        }
      }
    }

    if (!title && !bodyText) return null
    return { title, body: bodyText }
  }

  async function runAnalyze() {
    const content = extractEditorContent()
    if (!content) {
      postToSidebar({ status: 'empty' })
      return
    }

    postToSidebar({ status: 'analyzing' })

    let response
    try {
      response = await chrome.runtime.sendMessage({
        action: 'analyze.post',
        payload: {
          title: content.title,
          body: content.body,
          source: 'sidebar-live',
          at: Date.now(),
        },
      })
    } catch (err) {
      console.warn('[bbm/analyzer-bridge] sendMessage failed')
      postToSidebar({ status: 'error', error: 'service_worker_unreachable' })
      return
    }

    if (!response || response.ok !== true) {
      postToSidebar({
        status: 'error',
        error: response?.error || 'unknown_error',
      })
      return
    }

    postToSidebar({
      status: 'ok',
      data: response.data || null,
      at: Date.now(),
    })
  }

  /**
   * sidebar iframe 으로 안전하게 메시지를 보낸다.
   * targetOrigin 은 extension origin 으로 고정해 누수 방지.
   * @param {Record<string, unknown>} payload
   */
  function postToSidebar(payload) {
    if (!sidebarFrame || !sidebarFrame.contentWindow) return
    try {
      sidebarFrame.contentWindow.postMessage(
        { type: POST_MESSAGE_TYPE, payload },
        EXTENSION_ORIGIN || '*',
      )
    } catch (err) {
      console.warn('[bbm/analyzer-bridge] postMessage failed')
    }
  }

  /**
   * 에디터 변화 감지 — input/keyup 은 일반 textarea 에 반응,
   * MutationObserver 는 contenteditable 리치 에디터에 반응.
   */
  function attachListeners() {
    document.addEventListener('input', (e) => {
      const t = /** @type {HTMLElement | null} */ (e.target)
      if (!t) return
      const tag = t.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || t.isContentEditable) {
        scheduleAnalyze()
      }
    }, true)

    document.addEventListener('keyup', (e) => {
      const t = /** @type {HTMLElement | null} */ (e.target)
      if (t && t.isContentEditable) scheduleAnalyze()
    }, true)

    // SmartEditor 리치 에디터: DOM 변화 기반.
    const mo = new MutationObserver(() => scheduleAnalyze())
    mo.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
    })

    // 페이지 언로드 시 정리.
    window.addEventListener('beforeunload', () => {
      try { mo.disconnect() } catch (_) { /* noop */ }
      if (debounceTimer !== null) clearTimeout(debounceTimer)
    }, { once: true })
  }

  // service-worker 가 비동기 업데이트(예: 캐시 무효화)로 강제 재분석을 푸시할 수 있다.
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || sender.id !== chrome.runtime.id) return false
    if (msg.action === 'sidebar.invalidate') {
      scheduleAnalyze()
      sendResponse({ ok: true })
      return false
    }
    return false
  })

  attachListeners()
})()
