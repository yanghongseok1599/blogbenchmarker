// sidepanel/tabs/generate-tab.js
// Phase 5.2: 사이드패널 'AI 글 생성' 탭 컨트롤러.
//
// 책임:
//   1) 옵션 폼 UI 마운트(1회).
//   2) "생성" 클릭 → 폼 비활성화 + 상태 메시지 → chrome.runtime.sendMessage(generate.content).
//   3) 응답을 generate-result-card 로 렌더 (복사·학습 저장 콜백 주입).
//
// 옵션 매핑(UI ↔ Edge Function §1.1):
//   - originality slider 0~100  → 'preserve' | 'remix' | 'creative' (33/66 구간)
//   - length   short|medium|long → 'short'    | 'normal' | 'long'   (medium → normal)
//   - useLearning checked       → options.learningRefs 에 최근 학습 3건 삽입
//
// 안전 규칙:
//   - innerHTML 0건. DOM 은 dom-safe.createEl 로 조립.
//   - 외부 문자열(생성 결과, 에러 메시지)은 textContent / textarea.value 경로만 사용.

import { createEl, safeText, clearAndAppend } from '../../lib/dom-safe.js'
import { supabase, getCurrentUser } from '../../lib/supabase-client.js'
import { copyText } from '../../lib/utils/clipboard.js'
import { createGenerateResultCard } from '../components/generate-result-card.js'

const GENERATE_ACTION = 'generate.content'
const LEARNING_REF_LIMIT = 3
const LEARNING_REF_MAX_CHARS = 500

let mounted = false
/** @type {HTMLFormElement | null} */ let formEl = null
/** @type {HTMLInputElement | null} */ let topicEl = null
/** @type {HTMLInputElement | null} */ let originalityEl = null
/** @type {HTMLElement | null} */ let originalityValueEl = null
/** @type {HTMLSelectElement | null} */ let lengthEl = null
/** @type {HTMLTextAreaElement | null} */ let extraNotesEl = null
/** @type {HTMLInputElement | null} */ let useLearningEl = null
/** @type {HTMLButtonElement | null} */ let submitBtn = null
/** @type {HTMLElement | null} */ let statusEl = null
/** @type {HTMLElement | null} */ let resultEl = null

// ────────────────────────────────────────────────────────────
// 공개 진입점
// ────────────────────────────────────────────────────────────

/**
 * 생성 탭 마운트.
 * @param {HTMLElement} panelRoot <section data-panel="generate">
 */
export function mountGenerateTab(panelRoot) {
  if (mounted) return
  if (!panelRoot) {
    console.warn('[generate-tab] panelRoot 가 비어 있습니다.')
    return
  }

  const dom = buildGenerateTabDOM()
  clearAndAppend(panelRoot, dom.root)

  formEl = dom.formEl
  topicEl = dom.topicEl
  originalityEl = dom.originalityEl
  originalityValueEl = dom.originalityValueEl
  lengthEl = dom.lengthEl
  extraNotesEl = dom.extraNotesEl
  useLearningEl = dom.useLearningEl
  submitBtn = dom.submitBtn
  statusEl = dom.statusEl
  resultEl = dom.resultEl

  formEl.addEventListener('submit', handleSubmit)
  originalityEl.addEventListener('input', () => {
    safeText(originalityValueEl, originalityEl.value)
  })

  mounted = true
}

// ────────────────────────────────────────────────────────────
// DOM 조립 (generate-tab.html 마크업과 등가)
// ────────────────────────────────────────────────────────────

function buildGenerateTabDOM() {
  const topicEl = /** @type {HTMLInputElement} */ (
    createEl('input', {
      type: 'text',
      className: 'bm-input',
      name: 'topic',
      'data-role': 'topic',
      maxlength: '500',
      placeholder: '예: 초보 개발자에게 추천하는 VSCode 단축키 10가지',
      required: 'required',
    })
  )

  const originalityEl = /** @type {HTMLInputElement} */ (
    createEl('input', {
      type: 'range',
      className: 'bm-range',
      name: 'originality',
      'data-role': 'originality',
      min: '0', max: '100', step: '1', value: '50',
    })
  )
  const originalityValueEl = createEl('span', { 'data-role': 'originality-value' }, ['50'])

  const lengthEl = /** @type {HTMLSelectElement} */ (
    createEl('select', { className: 'bm-select', name: 'length', 'data-role': 'length' }, [
      createEl('option', { value: 'short' }, ['짧게']),
      createEl('option', { value: 'medium', selected: 'selected' }, ['보통']),
      createEl('option', { value: 'long' }, ['길게']),
    ])
  )

  const extraNotesEl = /** @type {HTMLTextAreaElement} */ (
    createEl('textarea', {
      className: 'bm-textarea',
      name: 'extraNotes',
      'data-role': 'extra-notes',
      maxlength: '500',
      rows: '3',
      placeholder: '말투, 구조, 금지어 등',
    })
  )

  const useLearningEl = /** @type {HTMLInputElement} */ (
    createEl('input', { type: 'checkbox', name: 'useLearning', 'data-role': 'use-learning' })
  )

  const submitBtn = /** @type {HTMLButtonElement} */ (
    createEl(
      'button',
      {
        type: 'submit',
        className: 'bm-btn bm-btn--primary',
        'data-action': 'generate-submit',
      },
      ['생성']
    )
  )

  const formEl = /** @type {HTMLFormElement} */ (
    createEl(
      'form',
      {
        className: 'bm-generate__form',
        'data-role': 'generate-form',
        autocomplete: 'off',
      },
      [
        createEl('label', { className: 'bm-generate__field' }, [
          createEl('span', { className: 'bm-generate__label' }, ['주제 (필수)']),
          topicEl,
        ]),
        createEl('label', { className: 'bm-generate__field' }, [
          createEl('span', { className: 'bm-generate__label' }, [
            '원본 보존도 ', originalityValueEl,
          ]),
          originalityEl,
          createEl('span', { className: 'bm-generate__hint-inline' }, [
            '0 = 원본 보존 · 50 = 리믹스 · 100 = 창의적',
          ]),
        ]),
        createEl('label', { className: 'bm-generate__field' }, [
          createEl('span', { className: 'bm-generate__label' }, ['분량']),
          lengthEl,
        ]),
        createEl('label', { className: 'bm-generate__field' }, [
          createEl('span', { className: 'bm-generate__label' }, ['추가 요청 (선택)']),
          extraNotesEl,
        ]),
        createEl('label', { className: 'bm-generate__checkbox' }, [
          useLearningEl,
          createEl('span', {}, ['내 학습 데이터를 참고 (최근 3개)']),
        ]),
        submitBtn,
      ]
    )
  )

  const statusEl = createEl('div', {
    className: 'bm-generate__status',
    'data-role': 'status',
    hidden: '',
    role: 'status',
    'aria-live': 'polite',
  })
  const resultEl = createEl('div', {
    className: 'bm-generate__result',
    'data-role': 'result',
  })

  const root = createEl(
    'section',
    { className: 'bm-generate', 'data-tab-content': 'generate' },
    [
      createEl('header', { className: 'bm-generate__head' }, [
        createEl('h2', { className: 'bm-generate__title' }, ['AI 글 생성']),
        createEl('p', { className: 'bm-generate__hint' }, [
          '주제와 옵션을 입력하면 Gemini 2.5 Flash 가 초안을 작성합니다.',
        ]),
      ]),
      formEl,
      statusEl,
      resultEl,
    ]
  )

  return {
    root, formEl, topicEl, originalityEl, originalityValueEl,
    lengthEl, extraNotesEl, useLearningEl, submitBtn, statusEl, resultEl,
  }
}

// ────────────────────────────────────────────────────────────
// 이벤트 / 생성 흐름
// ────────────────────────────────────────────────────────────

/** @param {SubmitEvent} event */
async function handleSubmit(event) {
  event.preventDefault()
  const topic = topicEl?.value.trim() ?? ''
  if (!topic) {
    showStatus('주제를 입력해 주세요.', 'error')
    return
  }

  const options = await buildOptions()

  setBusy(true)
  showStatus('AI 가 글을 작성 중입니다...', 'info')
  clearResult()

  try {
    const response = await sendGenerateMessage({ topic, options })
    if (!response?.ok) {
      throw new Error(response?.error || '생성에 실패했습니다.')
    }
    renderResult(topic, response.data)
    hide(statusEl)
  } catch (err) {
    showStatus(prettyError(err), 'error')
  } finally {
    setBusy(false)
  }
}

/**
 * UI 폼 값을 Edge Function 계약 shape 으로 매핑.
 * @returns {Promise<object>}
 */
async function buildOptions() {
  const originalityNum = Number(originalityEl?.value ?? 50)
  const lengthRaw = String(lengthEl?.value ?? 'medium')

  const options = {
    originality: mapOriginality(originalityNum),
    length: mapLength(lengthRaw),
  }

  const extra = extraNotesEl?.value.trim()
  if (extra) options.extraNotes = extra.slice(0, 500)

  if (useLearningEl?.checked) {
    const refs = await fetchLearningRefs()
    if (refs.length > 0) options.learningRefs = refs
  }

  return options
}

function mapOriginality(n) {
  const v = Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 50
  if (v <= 33) return 'preserve'
  if (v <= 66) return 'remix'
  return 'creative'
}

function mapLength(raw) {
  if (raw === 'short') return 'short'
  if (raw === 'long') return 'long'
  return 'normal' // medium → normal
}

/**
 * 본인의 최근 학습 데이터 3건을 가져와 learningRefs 배열로 반환.
 * 실패해도 생성 흐름은 중단하지 않고 빈 배열 반환.
 * @returns {Promise<string[]>}
 */
async function fetchLearningRefs() {
  try {
    const user = await getCurrentUser()
    if (!user) return []
    const { data, error } = await supabase
      .from('learning_data')
      .select('content_json, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(LEARNING_REF_LIMIT)
    if (error) {
      console.warn('[generate-tab] learning_data 조회 실패', error.message)
      return []
    }
    return (data ?? [])
      .map((row) => extractLearningText(row?.content_json))
      .filter((s) => typeof s === 'string' && s.length > 0)
      .map((s) => s.slice(0, LEARNING_REF_MAX_CHARS))
  } catch (err) {
    console.warn('[generate-tab] learningRefs 로드 실패', err?.message)
    return []
  }
}

/**
 * content_json 은 자유 스키마이므로 일반적인 키를 탐색한다.
 */
function extractLearningText(content) {
  if (!content || typeof content !== 'object') return ''
  if (typeof content.body === 'string') return content.body
  if (typeof content.content === 'string') return content.content
  if (typeof content.text === 'string') return content.text
  return ''
}

/**
 * background 로 생성 요청 전송.
 * @param {{ topic: string, options: object }} payload
 */
function sendGenerateMessage(payload) {
  return new Promise((resolve) => {
    if (!chrome?.runtime?.sendMessage) {
      resolve({ ok: false, error: 'chrome.runtime.sendMessage 미지원' })
      return
    }
    chrome.runtime.sendMessage(
      { action: GENERATE_ACTION, payload },
      (response) => {
        const lastErr = chrome.runtime.lastError
        if (lastErr) {
          resolve({ ok: false, error: lastErr.message })
          return
        }
        resolve(response ?? { ok: false, error: '빈 응답' })
      }
    )
  })
}

// ────────────────────────────────────────────────────────────
// 결과 렌더
// ────────────────────────────────────────────────────────────

function renderResult(topic, data) {
  if (!resultEl) return

  const card = createGenerateResultCard({
    topic,
    content: String(data?.content ?? ''),
    quota: data?.quota ?? null,
    onCopy: async (text) => copyText(text),
    onSaveLearning: async (text) => saveAsLearning(topic, text),
  })

  clearAndAppend(resultEl, card)
}

/**
 * 생성 결과를 learning_data 테이블에 저장.
 * RLS 가 본인 user_id 만 허용하므로 auth.uid 기반.
 * @param {string} topic
 * @param {string} text
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
async function saveAsLearning(topic, text) {
  try {
    const user = await getCurrentUser()
    if (!user) return { ok: false, error: '로그인이 필요합니다.' }
    const { error } = await supabase.from('learning_data').insert({
      user_id: user.id,
      content_json: { topic, body: text, source: 'generate-tab' },
      meta: { savedAt: new Date().toISOString() },
    })
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err?.message || '저장 실패' }
  }
}

function clearResult() { if (resultEl) clearAndAppend(resultEl) }

// ────────────────────────────────────────────────────────────
// UI 유틸
// ────────────────────────────────────────────────────────────

function setBusy(busy) {
  if (!formEl || !submitBtn) return
  const controls = formEl.querySelectorAll('input, select, textarea, button')
  controls.forEach((el) => {
    if (el === submitBtn || el instanceof HTMLButtonElement || el instanceof HTMLInputElement
      || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
      el.disabled = busy
    }
  })
  submitBtn.setAttribute('aria-busy', String(busy))
  safeText(submitBtn, busy ? '생성 중...' : '생성')
}

/**
 * @param {string} text
 * @param {'info' | 'error'} kind
 */
function showStatus(text, kind = 'info') {
  if (!statusEl) return
  statusEl.className = `bm-generate__status bm-generate__status--${kind}`
  safeText(statusEl, text)
  statusEl.removeAttribute('hidden')
}

function hide(el) { if (el) el.setAttribute('hidden', '') }

function prettyError(err) {
  if (!err) return '알 수 없는 오류'
  return err.message ? String(err.message) : String(err)
}
