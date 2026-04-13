// extension/sidepanel/tabs/tools-tab.js
// 부가 도구 탭 마운트 진입점. 4개 도구 카드를 각자의 슬롯에 렌더한다.
//
// panel.js 가 `const { mount } = await import('./tabs/tools-tab.js'); await mount(container)`
// 패턴으로 호출한다는 관례에 맞춤. destroy() 반환으로 타이머 리스너 정리.

import { createEl, safeText, clearAndAppend } from '../../lib/dom-safe.js'
import { createCharCounterCard } from '../tools/char-counter.js'
import { createPomodoroCard, destroyPomodoroCard } from '../tools/pomodoro.js'
import { createForbiddenWordsCard } from '../tools/forbidden-words.js'
import { createScreenshotCard } from '../tools/screenshot.js'

async function loadTemplate() {
  const url = chrome.runtime.getURL('sidepanel/tabs/tools-tab.html')
  const res = await fetch(url)
  if (!res.ok) throw new Error(`template load failed: ${res.status}`)
  const html = await res.text()
  // DOMParser 사용 — innerHTML 미사용. 파싱 단계에서 스크립트 실행 X.
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  const root = parsed.body.firstElementChild
  if (!root) throw new Error('template empty')
  return /** @type {HTMLElement} */ (document.importNode(root, true))
}

function showError(root, text) {
  const el = root.querySelector('#bm-tools-error')
  if (!el) return
  safeText(el, text)
  el.removeAttribute('hidden')
}

function slot(root, name) {
  return root.querySelector(`.bm-tools__slot[data-slot="${name}"]`)
}

/**
 * panel.js 가 호출하는 엔트리.
 * @param {HTMLElement} container
 * @returns {Promise<{ destroy: () => void }>}
 */
export async function mount(container) {
  if (!container) throw new Error('tools-tab: container 필요')

  let root
  try {
    root = await loadTemplate()
  } catch (err) {
    console.warn('[tools-tab] template load failed')
    clearAndAppend(
      container,
      createEl('div', { className: 'bm-tools__error', role: 'alert' }, '부가 도구를 불러올 수 없습니다.'),
    )
    return { destroy: () => clearAndAppend(container) }
  }
  clearAndAppend(container, root)

  /** @type {Array<{ node: HTMLElement, kind: 'pomodoro' | 'other' }>} */
  const mounted = []

  function mountInto(slotName, factory, kind) {
    const target = slot(root, slotName)
    if (!target) return
    try {
      const node = factory()
      if (node instanceof HTMLElement) {
        clearAndAppend(target, node)
        mounted.push({ node, kind })
      }
    } catch (err) {
      console.warn(`[tools-tab] mount ${slotName} failed`)
      clearAndAppend(
        target,
        createEl('p', { className: 'bm-tools__slot-error', role: 'alert' }, `도구 로드 실패: ${slotName}`),
      )
    }
  }

  mountInto('counter', createCharCounterCard, 'other')
  mountInto('pomodoro', createPomodoroCard, 'pomodoro')
  mountInto('forbidden', createForbiddenWordsCard, 'other')
  mountInto('screenshot', createScreenshotCard, 'other')

  return {
    destroy: () => {
      for (const m of mounted) {
        if (m.kind === 'pomodoro') {
          try { destroyPomodoroCard(m.node) } catch (_) { /* noop */ }
        }
      }
      clearAndAppend(container)
    },
  }
}

export default { mount }
