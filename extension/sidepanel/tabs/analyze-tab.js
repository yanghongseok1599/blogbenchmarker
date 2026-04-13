// sidepanel/tabs/analyze-tab.js
// Phase 3.3: 사이드패널 '분석' 탭 컨트롤러.
//
// 책임:
//   1) 탭 패널(<section data-panel="analyze">) 안에 분석 UI 를 1회 마운트한다.
//   2) "분석 시작" 클릭 → 활성 탭 URL 이 네이버 블로그인지 확인.
//   3) service-worker 에 { action: 'analyze.post', payload: { url } } 메시지 전송.
//   4) 응답 결과를 점수 카드 N장 + 총점 요약으로 렌더한다.
//
// 안전 규칙 (chrome-extension-security §3):
//   - 사용자/외부 데이터(블로그 제목, URL, 권장사항)는 모두 textContent 경로로만 삽입.
//   - 본 파일에서도 위험 DOM 속성 직접 할당은 금지. dom-safe 헬퍼 createEl/safeText/clearAndAppend 만 사용.

import { createEl, safeText, clearAndAppend } from '../../lib/dom-safe.js'
import { createScoreCard } from '../components/score-card.js'

// ────────────────────────────────────────────────────────────
// 상수 / 설정
// ────────────────────────────────────────────────────────────

const ANALYZE_ACTION = 'analyze.post' // service-worker.js 의 액션 네임스페이스
const NAVER_BLOG_HOST_RE = /^(?:m\.)?(?:[a-z0-9-]+\.)?blog\.naver\.com$/i

// 분석 응답 shape (assumed — TODO: _workspace/analyzer_result_shape.md 확정 시 동기화)
//
// {
//   ok: true,
//   data: {
//     url: string,
//     title: string,
//     totalScore: number(0~100),
//     sections: [
//       { title: string, score: number(0~100), recommendations: string[] },
//       ...
//     ],
//     stats?: { charCount?: number, paragraphCount?: number, imageCount?: number }
//   }
// }
//
// 응답이 위 shape 을 벗어나면 안전 fallback 으로 빈 결과를 표시한다.

let mounted = false
/** @type {HTMLElement | null} */ let statusEl = null
/** @type {HTMLElement | null} */ let summaryEl = null
/** @type {HTMLElement | null} */ let resultsEl = null
/** @type {HTMLButtonElement | null} */ let startBtn = null

// ────────────────────────────────────────────────────────────
// 공개 진입점
// ────────────────────────────────────────────────────────────

/**
 * 분석 탭을 panel 에 마운트한다. 두 번째 호출부터는 무시된다(idempotent).
 * panel.js 의 탭 활성화 훅에서 호출된다.
 * @param {HTMLElement} panelRoot 분석 탭 패널 루트(<section data-panel="analyze">)
 */
export function mountAnalyzeTab(panelRoot) {
  if (mounted) return
  if (!panelRoot) {
    console.warn('[analyze-tab] panelRoot 가 비어 있습니다.')
    return
  }

  const dom = buildAnalyzeTabDOM()
  clearAndAppend(panelRoot, dom.root)

  statusEl = dom.statusEl
  summaryEl = dom.summaryEl
  resultsEl = dom.resultsEl
  startBtn = dom.startBtn

  startBtn.addEventListener('click', handleAnalyzeClick)

  mounted = true
}

// ────────────────────────────────────────────────────────────
// DOM 조립 (analyze-tab.html 마크업과 등가)
// ────────────────────────────────────────────────────────────

/**
 * @returns {{
 *   root: HTMLElement,
 *   startBtn: HTMLButtonElement,
 *   statusEl: HTMLElement,
 *   summaryEl: HTMLElement,
 *   resultsEl: HTMLElement,
 * }}
 */
function buildAnalyzeTabDOM() {
  const startBtn = /** @type {HTMLButtonElement} */ (
    createEl(
      'button',
      {
        type: 'button',
        className: 'bm-btn bm-btn--primary',
        'data-action': 'analyze-start',
      },
      ['분석 시작'],
    )
  )

  const head = createEl('header', { className: 'bm-analyze__head' }, [
    createEl('p', { className: 'bm-analyze__hint' }, [
      '네이버 블로그 글 페이지에서 “분석 시작”을 누르세요.',
    ]),
    startBtn,
  ])

  const statusEl = createEl('div', {
    className: 'bm-analyze__status',
    'data-role': 'status',
    hidden: '',
    role: 'status',
    'aria-live': 'polite',
  })

  const summaryEl = createEl('div', {
    className: 'bm-analyze__summary',
    'data-role': 'summary',
    hidden: '',
  })

  const resultsEl = createEl('div', {
    className: 'bm-analyze__results',
    'data-role': 'results',
  })

  const root = createEl(
    'section',
    { className: 'bm-analyze', 'data-tab-content': 'analyze' },
    [head, statusEl, summaryEl, resultsEl],
  )

  return { root, startBtn, statusEl, summaryEl, resultsEl }
}

// ────────────────────────────────────────────────────────────
// 이벤트 핸들러
// ────────────────────────────────────────────────────────────

async function handleAnalyzeClick() {
  if (!startBtn) return

  setBusy(true)
  showStatus('현재 탭 확인 중...', 'info')
  hide(summaryEl)
  clearResults()

  try {
    const tab = await getActiveTab()
    if (!tab?.url) {
      throw new Error('현재 탭 URL 을 가져올 수 없습니다.')
    }
    if (!isNaverBlogUrl(tab.url)) {
      throw new Error('네이버 블로그 글 페이지에서만 분석할 수 있습니다.')
    }

    showStatus('분석 중...', 'info')
    const response = await sendAnalyzeMessage(tab.url)

    if (!response?.ok) {
      throw new Error(response?.error || '분석 실패 (응답 오류)')
    }

    renderResult(response.data)
    hide(statusEl)
  } catch (err) {
    showStatus(prettyError(err), 'error')
  } finally {
    setBusy(false)
  }
}

// ────────────────────────────────────────────────────────────
// chrome API 래퍼
// ────────────────────────────────────────────────────────────

/**
 * 현재 활성 탭을 조회한다.
 * @returns {Promise<chrome.tabs.Tab | undefined>}
 */
function getActiveTab() {
  return new Promise((resolve) => {
    if (!chrome?.tabs?.query) {
      resolve(undefined)
      return
    }
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      resolve(tabs?.[0])
    })
  })
}

/**
 * service-worker 에 분석 요청 메시지를 보낸다.
 * @param {string} url
 * @returns {Promise<{ ok: boolean, data?: unknown, error?: string }>}
 */
function sendAnalyzeMessage(url) {
  return new Promise((resolve) => {
    if (!chrome?.runtime?.sendMessage) {
      resolve({ ok: false, error: 'chrome.runtime.sendMessage 미지원' })
      return
    }
    chrome.runtime.sendMessage(
      { action: ANALYZE_ACTION, payload: { url } },
      (response) => {
        const lastErr = chrome.runtime.lastError
        if (lastErr) {
          resolve({ ok: false, error: lastErr.message })
          return
        }
        resolve(response ?? { ok: false, error: '빈 응답' })
      },
    )
  })
}

// ────────────────────────────────────────────────────────────
// 렌더링
// ────────────────────────────────────────────────────────────

/**
 * 분석 결과를 요약 + 카드 목록으로 렌더한다.
 * @param {any} data
 */
function renderResult(data) {
  const safe = normalizeAnalyzeResult(data)
  renderSummary(safe)
  renderSections(safe.sections)
}

/**
 * 응답 데이터를 안전한 shape 으로 정규화한다(외부 입력 가드).
 * @param {any} raw
 */
function normalizeAnalyzeResult(raw) {
  const sections = Array.isArray(raw?.sections) ? raw.sections : []
  return {
    url: typeof raw?.url === 'string' ? raw.url : '',
    title: typeof raw?.title === 'string' ? raw.title : '(제목 없음)',
    totalScore: clampScore(raw?.totalScore),
    sections: sections
      .filter((s) => s && typeof s === 'object')
      .map((s) => ({
        title: typeof s.title === 'string' ? s.title : '항목',
        score: clampScore(s.score),
        recommendations: Array.isArray(s.recommendations)
          ? s.recommendations.filter((r) => typeof r === 'string')
          : [],
      })),
  }
}

function clampScore(v) {
  const n = Number(v)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(100, n))
}

function renderSummary({ totalScore, title, url }) {
  if (!summaryEl) return

  const totalEl = createEl('div', { className: 'bm-analyze__total' }, [
    createEl('span', { className: 'bm-analyze__total-label' }, ['총점']),
    createEl('strong', { className: 'bm-analyze__total-value' }, [
      `${Math.round(totalScore)}점`,
    ]),
  ])

  const titleEl = createEl('p', { className: 'bm-analyze__post-title' }, [title])
  const urlEl = createEl(
    'p',
    { className: 'bm-analyze__post-url', title: url },
    [url || '(URL 없음)'],
  )

  clearAndAppend(summaryEl, totalEl, titleEl, urlEl)
  show(summaryEl)
}

function renderSections(sections) {
  if (!resultsEl) return

  if (!sections || sections.length === 0) {
    const empty = createEl('p', { className: 'bm-analyze__empty' }, [
      '표시할 분석 항목이 없습니다.',
    ])
    clearAndAppend(resultsEl, empty)
    return
  }

  const cards = sections.map((s) =>
    createScoreCard({
      title: s.title,
      score: s.score,
      recommendations: s.recommendations,
    }),
  )
  clearAndAppend(resultsEl, ...cards)
}

function clearResults() {
  if (resultsEl) clearAndAppend(resultsEl)
}

// ────────────────────────────────────────────────────────────
// 유틸: status / 표시 토글
// ────────────────────────────────────────────────────────────

/**
 * @param {string} text
 * @param {'info' | 'error'} kind
 */
function showStatus(text, kind = 'info') {
  if (!statusEl) return
  statusEl.className = `bm-analyze__status bm-analyze__status--${kind}`
  safeText(statusEl, text)
  show(statusEl)
}

function show(el) {
  if (!el) return
  el.removeAttribute('hidden')
}

function hide(el) {
  if (!el) return
  el.setAttribute('hidden', '')
}

function setBusy(busy) {
  if (!startBtn) return
  startBtn.disabled = busy
  startBtn.setAttribute('aria-busy', String(busy))
  safeText(startBtn, busy ? '분석 중...' : '분석 시작')
}

function isNaverBlogUrl(rawUrl) {
  try {
    const u = new URL(rawUrl)
    if (u.protocol !== 'https:') return false
    return NAVER_BLOG_HOST_RE.test(u.hostname)
  } catch {
    return false
  }
}

function prettyError(err) {
  if (!err) return '알 수 없는 오류'
  return err.message ? String(err.message) : String(err)
}
