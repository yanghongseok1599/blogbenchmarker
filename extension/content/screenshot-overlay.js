// extension/content/screenshot-overlay.js
// chrome.scripting.executeScript 로 on-demand 주입되는 캡처 영역 선택 오버레이.
// Shadow DOM(closed) 로 host 페이지와 CSS 격리. 외부 리소스 의존 없음(라이브러리 0, 이미지 0).
// innerHTML 금지 — createElement + textContent 만.
//
// 흐름:
//   1) 주입 시 자동 실행 (IIFE)
//   2) 사용자가 드래그로 영역 지정 → 좌상단/크기 계산
//   3) chrome.runtime.sendMessage({ action: 'tools.screenshotSelection', payload }) 로 전달
//   4) 오버레이 제거

(() => {
  const ROOT_ID = 'bbm-screenshot-root'
  if (document.getElementById(ROOT_ID)) return

  const host = document.createElement('div')
  host.id = ROOT_ID
  host.setAttribute('data-bbm-version', '0.1.0')
  // 최상위 레이어 확보. Shadow 내부 스타일이 주 방어선.
  host.style.position = 'fixed'
  host.style.left = '0'
  host.style.top = '0'
  host.style.right = '0'
  host.style.bottom = '0'
  host.style.zIndex = '2147483647'

  const shadow = host.attachShadow({ mode: 'closed' })

  const style = document.createElement('style')
  style.textContent = `
    :host { all: initial; }
    .dim {
      position: fixed; inset: 0; background: rgba(15, 23, 42, 0.35); cursor: crosshair;
    }
    .hint {
      position: fixed; top: 16px; left: 50%; transform: translateX(-50%);
      padding: 8px 14px; background: rgba(15, 23, 42, 0.92); color: #fff;
      border-radius: 6px; font-size: 13px; font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      pointer-events: none; user-select: none;
    }
    .sel {
      position: fixed; display: none;
      border: 2px solid #2563eb; background: rgba(37, 99, 235, 0.12);
      pointer-events: none;
    }
    .size-badge {
      position: fixed; display: none;
      padding: 2px 8px; background: #0f172a; color: #fff;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif; font-size: 11px;
      border-radius: 4px; pointer-events: none; user-select: none;
    }
  `
  shadow.appendChild(style)

  const dim = document.createElement('div')
  dim.className = 'dim'
  const hint = document.createElement('div')
  hint.className = 'hint'
  hint.textContent = '드래그하여 영역을 선택하세요 · ESC로 취소'
  const sel = document.createElement('div')
  sel.className = 'sel'
  const sizeBadge = document.createElement('div')
  sizeBadge.className = 'size-badge'

  shadow.appendChild(dim)
  shadow.appendChild(sel)
  shadow.appendChild(sizeBadge)
  shadow.appendChild(hint)

  document.documentElement.appendChild(host)

  let start = null
  let finished = false

  function cleanup() {
    if (finished) return
    finished = true
    try { host.remove() } catch (_) { /* noop */ }
    window.removeEventListener('keydown', onKeyDown, true)
  }

  function sendSelection(payload) {
    try {
      chrome.runtime.sendMessage({
        action: 'tools.screenshotSelection',
        payload,
      })
    } catch (_) {
      // 메시지 전송 실패는 조용히 처리(수신 측이 없을 수 있음).
    }
    cleanup()
  }

  function cancel() {
    sendSelection({ cancelled: true })
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      cancel()
    }
  }

  function updateSelection(a, b) {
    const x = Math.min(a.x, b.x)
    const y = Math.min(a.y, b.y)
    const w = Math.abs(a.x - b.x)
    const h = Math.abs(a.y - b.y)
    sel.style.display = 'block'
    sel.style.left = `${x}px`
    sel.style.top = `${y}px`
    sel.style.width = `${w}px`
    sel.style.height = `${h}px`

    sizeBadge.style.display = 'block'
    sizeBadge.style.left = `${x + w + 4}px`
    sizeBadge.style.top = `${y + h + 4}px`
    sizeBadge.textContent = `${Math.round(w)} × ${Math.round(h)}`
    return { x, y, width: w, height: h }
  }

  let lastRect = null

  dim.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return
    e.preventDefault()
    start = { x: e.clientX, y: e.clientY }
    lastRect = updateSelection(start, start)
  })

  dim.addEventListener('mousemove', (e) => {
    if (!start) return
    lastRect = updateSelection(start, { x: e.clientX, y: e.clientY })
  })

  dim.addEventListener('mouseup', (e) => {
    if (!start) return
    const end = { x: e.clientX, y: e.clientY }
    const rect = updateSelection(start, end)
    start = null

    if (rect.width < 8 || rect.height < 8) {
      cancel()
      return
    }

    sendSelection({
      rect,
      devicePixelRatio: window.devicePixelRatio || 1,
      viewport: { innerWidth: window.innerWidth, innerHeight: window.innerHeight },
      tabUrl: location.href,
    })
  })

  // 우클릭 / 페이지 떠남 / ESC 로 취소.
  dim.addEventListener('contextmenu', (e) => {
    e.preventDefault()
    cancel()
  })
  window.addEventListener('keydown', onKeyDown, true)
  window.addEventListener('beforeunload', cleanup, { once: true })
})()
