// extension/sidepanel/tools/char-counter.js
// 글자수/단어수/문장수/문단수/예상 읽기 시간 카운터. 독립 도구 카드로 사용.
// 외부 라이브러리 의존 0, innerHTML 금지.
//
// 한국어 가독 통계 가정:
//   - 공백 제외 글자 수: 가장 신뢰도 높은 지표 (네이버 블로그 "글자 수")
//   - 읽기 속도: 분당 500자 (한국어 블로그 평균)

import { createEl, safeText, clearAndAppend } from '../../lib/dom-safe.js'

const READING_CHARS_PER_MIN = 500

/**
 * 텍스트를 분석해 통계 객체 반환.
 * @param {string} text
 */
function analyze(text) {
  const src = typeof text === 'string' ? text : ''
  const withSpaces = src.length
  const withoutSpaces = src.replace(/\s+/g, '').length
  const trimmed = src.trim()
  const words = trimmed ? trimmed.split(/\s+/).filter(Boolean).length : 0
  // 한/영/일 문장 종결자 포함. 연속 종결자는 하나로 계산.
  const sentences = trimmed
    ? src.split(/[.!?。！？]+/).map((s) => s.trim()).filter(Boolean).length
    : 0
  const paragraphs = trimmed
    ? src.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean).length
    : 0
  const readingTimeMin = withoutSpaces > 0
    ? Math.max(1, Math.ceil(withoutSpaces / READING_CHARS_PER_MIN))
    : 0

  return { withSpaces, withoutSpaces, words, sentences, paragraphs, readingTimeMin }
}

function fmt(n) {
  return Number.isFinite(n) ? n.toLocaleString('ko-KR') : '—'
}

function renderStat(label, value, hint) {
  return createEl('div', { className: 'bm-cc__stat' }, [
    createEl('p', { className: 'bm-cc__stat-label' }, label),
    createEl('p', { className: 'bm-cc__stat-value' }, fmt(value)),
    hint ? createEl('p', { className: 'bm-cc__stat-hint' }, hint) : null,
  ])
}

/**
 * 카운터 카드 컴포넌트.
 * @param {{ initialText?: string }} [options]
 * @returns {HTMLElement}
 */
export function createCharCounterCard(options = {}) {
  const initialText = typeof options.initialText === 'string' ? options.initialText : ''

  const root = createEl('section', {
    className: 'bm-tool bm-cc',
    'aria-label': '글자 수 카운터',
  })

  // 헤더
  root.appendChild(
    createEl('header', { className: 'bm-tool__head' }, [
      createEl('h3', { className: 'bm-tool__title' }, '글자 수 카운터'),
      createEl('p', { className: 'bm-tool__hint' }, '작성 중인 텍스트를 붙여넣으면 실시간으로 분석합니다.'),
    ]),
  )

  // 입력 textarea (host page editor 값을 수동 복사/붙여넣기 하거나 직접 작성)
  const textarea = createEl('textarea', {
    className: 'bm-cc__input',
    id: 'bm-cc-input',
    rows: '6',
    placeholder: '여기에 텍스트를 붙여넣으세요...',
    'aria-label': '분석 대상 텍스트',
  })
  if (initialText) {
    /** @type {HTMLTextAreaElement} */ (textarea).value = initialText
  }
  root.appendChild(textarea)

  // 통계 그리드
  const statsGrid = createEl('div', { className: 'bm-cc__stats' })
  root.appendChild(statsGrid)

  // 버튼 영역
  const clearBtn = createEl(
    'button',
    {
      type: 'button',
      className: 'bm-btn',
      onClick: () => {
        /** @type {HTMLTextAreaElement} */ (textarea).value = ''
        update()
      },
    },
    '지우기',
  )
  root.appendChild(createEl('div', { className: 'bm-tool__actions' }, [clearBtn]))

  function update() {
    const text = /** @type {HTMLTextAreaElement} */ (textarea).value
    const s = analyze(text)
    clearAndAppend(
      statsGrid,
      renderStat('글자 수 (공백 포함)', s.withSpaces),
      renderStat('글자 수 (공백 제외)', s.withoutSpaces, '네이버 기준'),
      renderStat('단어 수', s.words),
      renderStat('문장 수', s.sentences),
      renderStat('문단 수', s.paragraphs),
      renderStat('예상 읽기 시간', s.readingTimeMin, s.readingTimeMin ? `${READING_CHARS_PER_MIN}자/분` : null),
    )
  }

  textarea.addEventListener('input', update)
  update() // 초기 렌더

  return root
}

/**
 * 외부에서 텍스트를 주입(예: 사이드바 주입 시 에디터 텍스트 전달).
 * @param {HTMLElement} root createCharCounterCard 반환 루트
 * @param {string} text
 */
export function setCounterText(root, text) {
  if (!root) return
  const ta = /** @type {HTMLTextAreaElement | null} */ (root.querySelector('#bm-cc-input'))
  if (!ta) return
  ta.value = typeof text === 'string' ? text : ''
  ta.dispatchEvent(new Event('input'))
}

// 순수 함수로도 노출(다른 도구에서 재사용 가능)
export { analyze as analyzeText }
