// sidepanel/tabs/analyze-tab.js
// Phase 3.3 / UI 고도화: 사이드패널 '분석' 탭 컨트롤러 — 대시보드 레이아웃.
//
// 책임:
//   1) 탭 패널(<section data-panel="analyze">) 안에 분석 UI 를 1회 마운트한다.
//   2) 활성 탭 URL 을 자동 감지해 "분석 대상: @blogId" 표시.
//      - 네이버 블로그일 때만 "분석 시작" 버튼 활성화.
//      - chrome.tabs.onActivated / onUpdated 리스너로 실시간 반영.
//   3) "분석 시작" 클릭 → service-worker 에 analyze.post 전송.
//   4) 응답 데이터를 대시보드로 렌더:
//      - 상단: 총점 원형 게이지 + 통계 스트립
//      - 중단: 섹션별 점수 카드 5장 그리드
//      - 하단: 카테고리별 추천사항 목록
//   5) 로딩 중에는 스켈레톤 플레이스홀더 카드 6개 표시.
//   6) 실패 시 에러 카드 렌더 (빨간 배너 금지 — 중앙 카드).
//
// 응답 shape (background/handlers/analyze-handler.js `buildUiShape` 기준):
//   {
//     url, title, totalScore,
//     sections: [
//       { key, title, score, recommendations, maxScore? }, …
//     ],
//     stats: { charCount, sentenceCount, paragraphCount, imageCount, wordCount, avgSentenceLength, emojiCount },
//     recommendations: string[],       // global
//     warnings: string[],
//   }
//
// 안전 규칙 (chrome-extension-security §3):
//   - 외부/사용자 데이터(blog title, URL, recommendation)는 dom-safe 의 safeText / createEl 경유.
//   - innerHTML 사용 0건. SVG 는 각 컴포넌트의 createElementNS.

import { createEl, safeText, clearAndAppend } from '../../lib/dom-safe.js'
import { createScoreCard } from '../components/score-card.js'
import { createTotalScoreGauge } from '../components/total-score-gauge.js'
import { createStatsStrip } from '../components/stats-strip.js'
import { createRecommendationList } from '../components/recommendation-list.js'

// ────────────────────────────────────────────────────────────
// 상수
// ────────────────────────────────────────────────────────────

const ANALYZE_ACTION = 'analyze.post'
const NAVER_BLOG_HOST_RE = /^(?:m\.)?(?:[a-z0-9-]+\.)?blog\.naver\.com$/i
const SKELETON_CARD_COUNT = 6

/** 섹션 기본 만점 (seo-analyzer SECTION_MAX 와 동기화). */
const SECTION_MAX = Object.freeze({
  titleSeo:       20,
  contentSeo:     30,
  hookScore:      15,
  readability:    20,
  keywordDensity: 15,
})

// ────────────────────────────────────────────────────────────
// 모듈 상태 (싱글톤 — 탭 mount 는 idempotent)
// ────────────────────────────────────────────────────────────

let mounted = false

/** DOM refs. */
const refs = {
  /** @type {HTMLElement | null} */ root: null,
  /** @type {HTMLElement | null} */ targetInfo: null,
  /** @type {HTMLButtonElement | null} */ startBtn: null,
  /** @type {HTMLElement | null} */ body: null,
}

/** 현재 활성 탭 URL 상태 (UI 의 "분석 대상" 라벨 동기화용). */
const tabState = {
  url: '',
  hostOk: false,
  blogId: '',
}

// ────────────────────────────────────────────────────────────
// 공개 진입점
// ────────────────────────────────────────────────────────────

/**
 * 분석 탭을 panel 에 마운트. 두 번째 호출부터는 무시된다.
 * @param {HTMLElement} panelRoot
 */
export function mountAnalyzeTab(panelRoot) {
  if (mounted) return
  if (!panelRoot) {
    console.warn('[analyze-tab] panelRoot 가 비어 있습니다.')
    return
  }

  const dom = buildShell()
  clearAndAppend(panelRoot, dom.root)

  refs.root = dom.root
  refs.targetInfo = dom.targetInfo
  refs.startBtn = dom.startBtn
  refs.body = dom.body

  dom.startBtn.addEventListener('click', handleAnalyzeClick)
  attachTabListeners()
  renderEmptyState()
  refreshActiveTabState().catch(() => { /* noop */ })

  mounted = true
}

// ────────────────────────────────────────────────────────────
// 쉘 DOM
// ────────────────────────────────────────────────────────────

function buildShell() {
  const startBtn = /** @type {HTMLButtonElement} */ (
    createEl(
      'button',
      {
        type: 'button',
        className: 'bm-btn bm-btn--primary bm-analyze__start',
        'data-action': 'analyze-start',
        disabled: 'disabled',
      },
      ['분석 시작'],
    )
  )

  const targetInfo = createEl(
    'div',
    {
      className: 'bm-analyze__target',
      'data-role': 'target-info',
      role: 'status',
      'aria-live': 'polite',
    },
    [
      createEl('span', { className: 'bm-analyze__target-label' }, ['분석 대상:']),
      createEl('strong', { className: 'bm-analyze__target-value' }, ['활성 탭 확인 중...']),
    ],
  )

  const head = createEl('header', { className: 'bm-analyze__head' }, [
    targetInfo,
    startBtn,
  ])

  const body = createEl('div', {
    className: 'bm-analyze__body',
    'data-role': 'body',
  })

  const root = createEl(
    'section',
    { className: 'bm-analyze', 'data-tab-content': 'analyze' },
    [head, body],
  )

  return { root, startBtn, targetInfo, body }
}

// ────────────────────────────────────────────────────────────
// 활성 탭 감지 & "분석 대상" 라벨 업데이트
// ────────────────────────────────────────────────────────────

function attachTabListeners() {
  if (!chrome?.tabs) return
  try {
    chrome.tabs.onActivated?.addListener(() => {
      refreshActiveTabState().catch(() => {})
    })
    chrome.tabs.onUpdated?.addListener((_id, changeInfo) => {
      if (changeInfo.url || changeInfo.status === 'complete') {
        refreshActiveTabState().catch(() => {})
      }
    })
  } catch (e) {
    console.warn('[analyze-tab] tab listener 등록 실패:', e?.message)
  }
}

async function refreshActiveTabState() {
  const tab = await getActiveTab()
  const url = tab?.url ?? ''
  const hostOk = isNaverBlogUrl(url)
  const blogId = hostOk ? extractBlogId(url) : ''
  tabState.url = url
  tabState.hostOk = hostOk
  tabState.blogId = blogId
  syncTargetUI()
}

function syncTargetUI() {
  if (!refs.targetInfo || !refs.startBtn) return
  const valueEl = refs.targetInfo.querySelector('.bm-analyze__target-value')
  if (!(valueEl instanceof HTMLElement)) return

  if (!tabState.url) {
    safeText(valueEl, '활성 탭 확인 중...')
    refs.targetInfo.classList.remove('bm-analyze__target--ok', 'bm-analyze__target--bad')
    refs.startBtn.disabled = true
    refs.startBtn.setAttribute('aria-disabled', 'true')
    return
  }
  if (tabState.hostOk) {
    safeText(valueEl, `@${tabState.blogId || '(네이버 블로그)'}`)
    refs.targetInfo.classList.add('bm-analyze__target--ok')
    refs.targetInfo.classList.remove('bm-analyze__target--bad')
    refs.startBtn.disabled = false
    refs.startBtn.removeAttribute('aria-disabled')
  } else {
    safeText(valueEl, '네이버 블로그가 아닙니다')
    refs.targetInfo.classList.add('bm-analyze__target--bad')
    refs.targetInfo.classList.remove('bm-analyze__target--ok')
    refs.startBtn.disabled = true
    refs.startBtn.setAttribute('aria-disabled', 'true')
  }
}

// ────────────────────────────────────────────────────────────
// 클릭 핸들러
// ────────────────────────────────────────────────────────────

async function handleAnalyzeClick() {
  if (!refs.startBtn || refs.startBtn.disabled) return

  setBusy(true)
  renderSkeleton()

  try {
    // 최신 상태 재확인 (사용자가 중간에 탭을 전환했을 수 있음)
    await refreshActiveTabState()
    if (!tabState.url) throw new Error('현재 탭 URL 을 가져올 수 없습니다.')
    if (!tabState.hostOk) throw new Error('네이버 블로그 글 페이지에서만 분석할 수 있습니다.')

    const response = await sendAnalyzeMessage(tabState.url)
    if (!response?.ok) {
      throw new Error(response?.error || '분석 실패 (응답 오류)')
    }
    renderDashboard(response.data)
  } catch (err) {
    renderErrorCard(prettyError(err))
  } finally {
    setBusy(false)
  }
}

// ────────────────────────────────────────────────────────────
// chrome.tabs / chrome.runtime 래퍼
// ────────────────────────────────────────────────────────────

/** @returns {Promise<chrome.tabs.Tab | undefined>} */
function getActiveTab() {
  return new Promise((resolve) => {
    if (!chrome?.tabs?.query) { resolve(undefined); return }
    try {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        resolve(tabs?.[0])
      })
    } catch {
      resolve(undefined)
    }
  })
}

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
        if (lastErr) { resolve({ ok: false, error: lastErr.message }); return }
        resolve(response ?? { ok: false, error: '빈 응답' })
      },
    )
  })
}

// ────────────────────────────────────────────────────────────
// 상태 렌더: 빈 상태 / 스켈레톤 / 에러 / 대시보드
// ────────────────────────────────────────────────────────────

function renderEmptyState() {
  if (!refs.body) return
  const empty = createEl(
    'div',
    { className: 'bm-analyze__empty', 'data-state': 'empty' },
    [
      createEl('div', { className: 'bm-analyze__empty-icon', 'aria-hidden': 'true' }, ['🔍']),
      createEl('p', { className: 'bm-analyze__empty-title' }, [
        '네이버 블로그 글 페이지에서 분석을 시작하세요.',
      ]),
      createEl('p', { className: 'bm-analyze__empty-hint' }, [
        '활성 탭이 blog.naver.com 이면 위의 버튼이 활성화됩니다.',
      ]),
    ],
  )
  clearAndAppend(refs.body, empty)
}

function renderSkeleton() {
  if (!refs.body) return
  const heroSkeleton = createEl(
    'div',
    { className: 'bm-skeleton bm-skeleton--hero', 'aria-hidden': 'true' },
  )
  const stripSkeleton = createEl(
    'div',
    { className: 'bm-skeleton bm-skeleton--strip', 'aria-hidden': 'true' },
  )
  const grid = createEl(
    'div',
    { className: 'bm-skeleton-grid', 'aria-hidden': 'true' },
    Array.from({ length: SKELETON_CARD_COUNT }, () =>
      createEl('div', { className: 'bm-skeleton bm-skeleton--card' }),
    ),
  )
  const srStatus = createEl(
    'p',
    { className: 'bm-sr-only', role: 'status', 'aria-live': 'polite' },
    ['분석 중입니다. 잠시만 기다려 주세요.'],
  )
  clearAndAppend(refs.body, heroSkeleton, stripSkeleton, grid, srStatus)
}

/**
 * 에러 카드 — 빨간 배너 대신 중앙 카드로.
 * @param {string} message
 */
function renderErrorCard(message) {
  if (!refs.body) return
  const icon = createEl('div', { className: 'bm-error-card__icon', 'aria-hidden': 'true' }, ['⚠️'])
  const title = createEl('h3', { className: 'bm-error-card__title' }, ['분석에 실패했어요'])
  const body = createEl('p', { className: 'bm-error-card__body' }, [String(message)])
  const retry = createEl(
    'button',
    {
      type: 'button',
      className: 'bm-btn bm-btn--secondary',
      onClick: handleAnalyzeClick,
    },
    ['다시 시도'],
  )
  const card = createEl(
    'section',
    {
      className: 'bm-error-card',
      role: 'alert',
      'aria-live': 'assertive',
      'data-state': 'error',
    },
    [icon, title, body, retry],
  )
  clearAndAppend(refs.body, card)
}

/**
 * 분석 결과 대시보드 렌더.
 * @param {any} data
 */
function renderDashboard(data) {
  if (!refs.body) return
  const safe = normalizeAnalyzeResult(data)

  const hero = buildHero(safe)
  const strip = createStatsStrip(safe.stats, { includeReadingTime: true })
  const gridChildren = safe.sections.map((s) =>
    createScoreCard({
      title: s.title,
      score: s.score,
      maxScore: s.maxScore,
      recommendations: s.recommendations,
      sectionKey: s.key,
    }),
  )
  const grid = createEl(
    'div',
    {
      className: 'bm-score-grid',
      role: 'list',
      'aria-label': '섹션별 점수 카드',
    },
    gridChildren.map((c) => {
      c.setAttribute('role', 'listitem')
      return c
    }),
  )

  const recList = createRecommendationList(safe.recommendations, { sections: safe.sections })

  const children = [hero, strip, grid, recList]

  // warnings 가 있으면 상단 한 줄 안내 (너무 짧은 글 등)
  if (safe.warnings.length > 0) {
    children.unshift(buildWarningsBanner(safe.warnings))
  }

  clearAndAppend(refs.body, ...children)
}

function buildHero(safe) {
  const gauge = createTotalScoreGauge(safe.totalScore, {
    label: '총점',
    subtitle: '블로그 SEO',
  })

  const postTitle = createEl('p', { className: 'bm-analyze__post-title' }, [safe.title])
  const postUrl = createEl(
    'p',
    { className: 'bm-analyze__post-url', title: safe.url },
    [safe.url || '(URL 없음)'],
  )
  const meta = createEl('div', { className: 'bm-analyze__hero-meta' }, [postTitle, postUrl])

  return createEl('section', { className: 'bm-analyze__hero' }, [gauge, meta])
}

function buildWarningsBanner(warnings) {
  const items = warnings.map((w) =>
    createEl('li', { className: 'bm-analyze__warn-item' }, [warningLabel(w)]),
  )
  return createEl(
    'aside',
    { className: 'bm-analyze__warnings', role: 'note' },
    [
      createEl(
        'span',
        { className: 'bm-analyze__warnings-icon', 'aria-hidden': 'true' },
        ['⚠️'],
      ),
      createEl(
        'ul',
        { className: 'bm-analyze__warnings-list' },
        items,
      ),
    ],
  )
}

function warningLabel(code) {
  switch (code) {
    case 'empty':      return '글이 비어있습니다.'
    case 'too_short':  return '글자 수가 매우 적습니다 (100자 미만).'
    case 'too_long':   return '글이 매우 깁니다 (10,000자 초과).'
    case 'image_only': return '본문 없이 이미지만 있습니다.'
    case 'emoji_bomb': return '이모지가 과도하게 많습니다.'
    default:           return String(code)
  }
}

// ────────────────────────────────────────────────────────────
// 응답 정규화
// ────────────────────────────────────────────────────────────

function normalizeAnalyzeResult(raw) {
  const sectionsRaw = Array.isArray(raw?.sections) ? raw.sections : []
  const sections = sectionsRaw
    .filter((s) => s && typeof s === 'object')
    .map((s) => {
      const key = typeof s.key === 'string' ? s.key : ''
      return {
        key,
        title: typeof s.title === 'string' ? s.title : '항목',
        score: clampScore(s.score),
        maxScore: Number.isFinite(Number(s.maxScore))
          ? Math.max(0, Number(s.maxScore))
          : (SECTION_MAX[key] ?? 100),
        recommendations: Array.isArray(s.recommendations)
          ? s.recommendations.filter((r) => typeof r === 'string')
          : [],
      }
    })

  return {
    url: typeof raw?.url === 'string' ? raw.url : '',
    title: typeof raw?.title === 'string' && raw.title ? raw.title : '(제목 없음)',
    totalScore: clampScore(raw?.totalScore),
    sections,
    stats: (raw?.stats && typeof raw.stats === 'object') ? raw.stats : {},
    recommendations: Array.isArray(raw?.recommendations)
      ? raw.recommendations.filter((r) => typeof r === 'string')
      : [],
    warnings: Array.isArray(raw?.warnings)
      ? raw.warnings.filter((w) => typeof w === 'string')
      : [],
  }
}

function clampScore(v) {
  const n = Number(v)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(100, n))
}

// ────────────────────────────────────────────────────────────
// 공통 유틸
// ────────────────────────────────────────────────────────────

function setBusy(busy) {
  if (!refs.startBtn) return
  refs.startBtn.disabled = busy || !tabState.hostOk
  refs.startBtn.setAttribute('aria-busy', String(busy))
  safeText(refs.startBtn, busy ? '분석 중...' : '분석 시작')
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

/**
 * URL 에서 블로그 ID 추출.
 *   https://blog.naver.com/foo          → 'foo'
 *   https://blog.naver.com/foo/12345    → 'foo'
 *   https://blog.naver.com/PostView.naver?blogId=foo&logNo=...  → 'foo'
 *   https://m.blog.naver.com/foo/12345  → 'foo'
 */
function extractBlogId(url) {
  try {
    const u = new URL(url)
    const qId = u.searchParams.get('blogId')
    if (qId) return qId
    const segments = u.pathname.split('/').filter(Boolean)
    if (segments.length === 0) return ''
    const first = segments[0]
    if (first === 'PostView.naver' || first === 'PostList.naver') return ''
    return first
  } catch {
    return ''
  }
}

function prettyError(err) {
  if (!err) return '알 수 없는 오류'
  return err.message ? String(err.message) : String(err)
}

// ────────────────────────────────────────────────────────────
// 테스트 편의 — 내부 함수 노출
// ────────────────────────────────────────────────────────────

export const __internals = Object.freeze({
  normalizeAnalyzeResult,
  isNaverBlogUrl,
  extractBlogId,
  warningLabel,
  SECTION_MAX,
})
