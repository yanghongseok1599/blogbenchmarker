// extension/sidepanel/tools/screenshot.js
// 캡처 도구. html2canvas 사용 금지(CSP). chrome.tabs.captureVisibleTab + <canvas> 로 크롭.
// 영역 선택은 content script 오버레이(screenshot-overlay.js)가 담당.

import { createEl, safeText, clearAndAppend } from '../../lib/dom-safe.js'

const OVERLAY_FILE = 'content/screenshot-overlay.js'

/** 활성 탭 조회. 네이버 블로그 탭이 아니면 null. */
async function queryActiveNaverTab() {
  try {
    const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
    const tab = tabs?.[0]
    if (!tab) return null
    const url = tab.url || ''
    if (!/^https?:\/\/([a-z0-9-]+\.)*naver\.com\//i.test(url)) return null
    return tab
  } catch (_) {
    return null
  }
}

/** 오버레이 주입 — 동일 탭에 이미 주입돼도 자체 가드로 중복 방지. */
async function injectOverlay(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: [OVERLAY_FILE],
  })
}

/** 다음 번 오버레이 응답 1건만 받는다. 타임아웃 60초. */
function waitForSelection(timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    let done = false
    const timer = setTimeout(() => {
      if (done) return
      done = true
      try { chrome.runtime.onMessage.removeListener(handler) } catch (_) {}
      reject(new Error('timeout'))
    }, timeoutMs)

    const handler = (msg, sender) => {
      if (!msg || msg.action !== 'tools.screenshotSelection') return
      if (sender?.id && sender.id !== chrome.runtime.id) return
      if (done) return
      done = true
      clearTimeout(timer)
      try { chrome.runtime.onMessage.removeListener(handler) } catch (_) {}
      resolve(msg.payload || null)
    }
    chrome.runtime.onMessage.addListener(handler)
  })
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('image load failed'))
    img.src = dataUrl
  })
}

/**
 * 전체 가시 영역 캡처 후 rect 로 크롭.
 * @param {{ rect: { x, y, width, height }, devicePixelRatio: number }} sel
 * @returns {Promise<string>} 크롭된 이미지 data URL (image/png)
 */
async function captureAndCrop(sel) {
  const dataUrl = await chrome.tabs.captureVisibleTab({ format: 'png' })
  if (!dataUrl) throw new Error('captureVisibleTab returned empty')

  const img = await loadImage(dataUrl)
  const dpr = Math.max(1, Number(sel.devicePixelRatio) || 1)

  const sx = Math.max(0, Math.round(sel.rect.x * dpr))
  const sy = Math.max(0, Math.round(sel.rect.y * dpr))
  const sw = Math.max(1, Math.round(sel.rect.width * dpr))
  const sh = Math.max(1, Math.round(sel.rect.height * dpr))

  const canvas = document.createElement('canvas')
  canvas.width = sw
  canvas.height = sh
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas 2d context unavailable')
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh)
  return canvas.toDataURL('image/png')
}

/**
 * 스크린샷 카드 컴포넌트.
 * @returns {HTMLElement}
 */
export function createScreenshotCard() {
  const root = createEl('section', {
    className: 'bm-tool bm-shot',
    'aria-label': '스크린샷 도구',
  })

  root.appendChild(
    createEl('header', { className: 'bm-tool__head' }, [
      createEl('h3', { className: 'bm-tool__title' }, '스크린샷'),
      createEl('p', { className: 'bm-tool__hint' }, '현재 탭의 보이는 영역을 캡처합니다. "영역 캡처"는 드래그로 범위를 선택합니다.'),
    ]),
  )

  const areaBtn = createEl('button', { type: 'button', className: 'bm-btn bm-btn--primary' }, '영역 캡처')
  const fullBtn = createEl('button', { type: 'button', className: 'bm-btn' }, '전체 캡처')
  root.appendChild(createEl('div', { className: 'bm-tool__actions' }, [areaBtn, fullBtn]))

  const status = createEl('p', { className: 'bm-shot__status' }, '')
  root.appendChild(status)

  const previewWrap = createEl('div', { className: 'bm-shot__preview', 'aria-live': 'polite' })
  root.appendChild(previewWrap)

  function setStatus(text, kind = 'info') {
    safeText(status, text || '')
    status.setAttribute('data-kind', kind)
  }

  function renderPreview(dataUrl) {
    const img = createEl('img', {
      className: 'bm-shot__img',
      src: dataUrl,
      alt: '캡처 미리보기',
    })
    const download = createEl(
      'a',
      {
        className: 'bm-btn',
        href: dataUrl,
        download: `blog-benchmarker-${Date.now()}.png`,
      },
      '저장',
    )
    clearAndAppend(previewWrap, img, createEl('div', { className: 'bm-tool__actions' }, [download]))
  }

  async function capture(kind) {
    setStatus('준비 중…', 'info')
    try {
      if (kind === 'full') {
        const dataUrl = await chrome.tabs.captureVisibleTab({ format: 'png' })
        if (!dataUrl) throw new Error('empty')
        renderPreview(dataUrl)
        setStatus('전체 캡처 완료', 'ok')
        return
      }

      const tab = await queryActiveNaverTab()
      if (!tab) {
        setStatus('네이버 블로그 탭에서만 사용할 수 있습니다.', 'error')
        return
      }
      setStatus('영역을 드래그하세요. (ESC 취소)', 'info')
      await injectOverlay(tab.id)

      const sel = await waitForSelection()
      if (!sel || sel.cancelled) {
        setStatus('캡처가 취소되었습니다.', 'info')
        return
      }

      const dataUrl = await captureAndCrop(sel)
      renderPreview(dataUrl)
      setStatus('영역 캡처 완료', 'ok')
    } catch (err) {
      const msg = err?.message === 'timeout'
        ? '영역 선택 시간이 초과되었습니다.'
        : '캡처에 실패했습니다. 탭 권한을 확인해 주세요.'
      setStatus(msg, 'error')
      console.warn('[screenshot] capture failed')
    }
  }

  areaBtn.addEventListener('click', () => capture('area'))
  fullBtn.addEventListener('click', () => capture('full'))

  return root
}
