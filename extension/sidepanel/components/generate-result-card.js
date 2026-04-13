// sidepanel/components/generate-result-card.js
// Phase 5.2: 생성 결과 표시 카드.
// - 결과 본문 편집 가능한 textarea + "복사" + "학습 데이터로 저장" 버튼
// - 외부 주입 가능: onCopy(text), onSaveLearning(text) 콜백
// - 순수 UI 컴포넌트 — supabase 의존성 없음. 저장 처리는 호출 측이 담당한다.
//
// 안전 규칙:
//   - 생성 본문은 반드시 textarea.value 로만 설정 (XSS 차단)
//   - 사용자에게 보여지는 모든 문자열은 textContent 또는 createEl 자식 경로만 사용

import { createEl, safeText, clearAndAppend } from '../../lib/dom-safe.js'

/**
 * @typedef {Object} GenerateResultCardOptions
 * @property {string} content          생성된 본문
 * @property {string} [topic]          주제(카드 헤더에 표시)
 * @property {(text: string) => Promise<{ ok: boolean, error?: string }>} [onCopy]
 * @property {(text: string) => Promise<{ ok: boolean, error?: string }>} [onSaveLearning]
 * @property {{ minuteCount: number, dailyCount: number, dailyQuota: number | null } | null} [quota]
 */

/**
 * 카드 DOM 을 생성한다. 이미 mount 된 카드가 있으면 호출 측이 replace 해야 한다.
 * @param {GenerateResultCardOptions} opts
 * @returns {HTMLElement}
 */
export function createGenerateResultCard(opts) {
  const {
    content = '',
    topic = '',
    onCopy,
    onSaveLearning,
    quota = null,
  } = opts || {}

  const editor = /** @type {HTMLTextAreaElement} */ (
    createEl('textarea', {
      className: 'bm-generate__editor',
      rows: '14',
      spellcheck: 'false',
      'aria-label': '생성된 본문',
    })
  )
  // textarea.value 는 HTML 로 해석되지 않는다 — 안전.
  editor.value = String(content ?? '')

  const statusEl = createEl('div', {
    className: 'bm-generate__card-status',
    role: 'status',
    'aria-live': 'polite',
    hidden: '',
  })

  const copyBtn = /** @type {HTMLButtonElement} */ (
    createEl(
      'button',
      {
        type: 'button',
        className: 'bm-btn bm-btn--primary',
        'data-action': 'generate-copy',
        onClick: () => handleCopy(editor, copyBtn, statusEl, onCopy),
      },
      ['복사']
    )
  )

  const saveBtn = /** @type {HTMLButtonElement} */ (
    createEl(
      'button',
      {
        type: 'button',
        className: 'bm-btn bm-btn--ghost',
        'data-action': 'generate-save-learning',
        onClick: () => handleSaveLearning(editor, saveBtn, statusEl, onSaveLearning),
      },
      ['학습 데이터로 저장']
    )
  )
  if (typeof onSaveLearning !== 'function') {
    saveBtn.disabled = true
    saveBtn.title = '저장 핸들러가 제공되지 않았습니다.'
  }

  const actions = createEl('div', { className: 'bm-generate__actions' }, [copyBtn, saveBtn])

  const header = createEl('header', { className: 'bm-generate__card-head' }, [
    createEl('h3', { className: 'bm-generate__card-title' }, [topic || '생성 결과']),
    quota ? createEl('p', { className: 'bm-generate__quota' }, [formatQuota(quota)]) : null,
  ])

  return createEl(
    'section',
    { className: 'bm-generate__card', 'data-role': 'generate-card' },
    [header, editor, actions, statusEl]
  )
}

// ─────────────────────────────────────────────────────────────
// 내부 이벤트 핸들러
// ─────────────────────────────────────────────────────────────

async function handleCopy(editor, btn, statusEl, onCopy) {
  if (typeof onCopy !== 'function') return
  const text = editor.value ?? ''
  setBusy(btn, true, '복사 중...')
  try {
    const res = await onCopy(text)
    if (res?.ok) {
      showStatus(statusEl, '복사되었습니다.', 'info')
    } else {
      showStatus(statusEl, res?.error || '복사에 실패했습니다.', 'error')
    }
  } catch (err) {
    showStatus(statusEl, err?.message || '복사에 실패했습니다.', 'error')
  } finally {
    setBusy(btn, false, '복사')
  }
}

async function handleSaveLearning(editor, btn, statusEl, onSaveLearning) {
  if (typeof onSaveLearning !== 'function') return
  const text = editor.value ?? ''
  if (!text.trim()) {
    showStatus(statusEl, '저장할 내용이 비어 있습니다.', 'error')
    return
  }
  setBusy(btn, true, '저장 중...')
  try {
    const res = await onSaveLearning(text)
    if (res?.ok) {
      showStatus(statusEl, '학습 데이터에 저장되었습니다.', 'info')
    } else {
      showStatus(statusEl, res?.error || '저장에 실패했습니다.', 'error')
    }
  } catch (err) {
    showStatus(statusEl, err?.message || '저장에 실패했습니다.', 'error')
  } finally {
    setBusy(btn, false, '학습 데이터로 저장')
  }
}

// ─────────────────────────────────────────────────────────────
// 내부 유틸
// ─────────────────────────────────────────────────────────────

function setBusy(btn, busy, label) {
  if (!btn) return
  btn.disabled = busy
  btn.setAttribute('aria-busy', String(busy))
  safeText(btn, label)
}

/**
 * @param {HTMLElement} el
 * @param {string} text
 * @param {'info'|'error'} kind
 */
function showStatus(el, text, kind) {
  if (!el) return
  el.className = `bm-generate__card-status bm-generate__card-status--${kind}`
  safeText(el, text)
  el.removeAttribute('hidden')
}

function formatQuota(quota) {
  const { minuteCount, dailyCount, dailyQuota } = quota
  const dailyPart = dailyQuota == null ? '무제한' : `${dailyCount}/${dailyQuota}`
  return `오늘 ${dailyPart} · 최근 1분 ${minuteCount}회`
}
