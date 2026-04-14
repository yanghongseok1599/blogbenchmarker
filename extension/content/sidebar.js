// extension/content/sidebar.js
// 사이드바 iframe 내부 전용 — 부모(content script)가 postMessage 로 보낸
// 분석 결과를 슬롯에 렌더링한다. 실제 분석 알고리즘은 Phase 3.1 소관.
//
// 이 스크립트는 chrome-extension:// origin 에서 실행되므로 extension 권한(chrome.*) 사용 가능.
// 다만 이 파일은 렌더링만 담당 — 네트워크/Supabase 호출은 하지 않는다.

import { createEl, safeText, clearAndAppend } from '../lib/dom-safe.js'

const MESSAGE_TYPE = 'BBM_ANALYSIS'
const EXTENSION_ORIGIN = (() => {
  try {
    return new URL(chrome.runtime.getURL('/')).origin
  } catch (_) {
    return ''
  }
})()

const $ = (id) => document.getElementById(id)

const STATUS_LABEL = {
  idle: '대기 중',
  ready: '준비됨',
  analyzing: '분석 중…',
  empty: '내용 없음',
  ok: '완료',
  error: '오류',
}

function setStatus(state) {
  const el = $('bbm-status')
  if (!el) return
  const label = STATUS_LABEL[state] || state
  el.setAttribute('data-state', state)
  safeText(el, label)
}

function renderScore(score, hint) {
  const scoreEl = $('bbm-score')
  const hintEl = $('bbm-score-hint')
  if (scoreEl) safeText(scoreEl, score == null ? '—' : String(score))
  if (hintEl) safeText(hintEl, hint || '글을 수정하면 자동으로 다시 분석합니다.')
}

/**
 * 기본 지표 슬롯 — { charCount, wordCount, imageCount, paragraphCount } 형태 가정.
 * Phase 3.1 에서 확정하는 스키마에 유연하게 대응하도록 key/value 목록으로 렌더한다.
 */
function renderBasic(basic) {
  const slot = $('bbm-slot-basic')
  if (!slot) return

  if (!basic || typeof basic !== 'object' || Object.keys(basic).length === 0) {
    clearAndAppend(slot, createEl('span', { className: 'bbm-empty' }, '데이터 없음'))
    return
  }

  const list = createEl('ul', { style: { margin: 0, paddingLeft: '16px' } })
  for (const [key, value] of Object.entries(basic)) {
    list.appendChild(
      createEl('li', {}, [`${humanizeKey(key)}: `, String(value ?? '-')]),
    )
  }
  clearAndAppend(slot, list)
}

function renderHook(hook) {
  const slot = $('bbm-slot-hook')
  if (!slot) return
  if (!hook) {
    clearAndAppend(slot, createEl('span', { className: 'bbm-empty' }, '첫 문장을 감지할 수 없습니다.'))
    return
  }
  const text = typeof hook === 'string' ? hook : hook.text || ''
  const score = typeof hook === 'object' ? hook.score : undefined
  const children = [text || '—']
  if (score !== undefined) {
    children.push(createEl('div', { style: { marginTop: '4px', color: '#64748b', fontSize: '12px' } }, `후킹 점수: ${score}`))
  }
  clearAndAppend(slot, ...children)
}

function renderSuggestions(list) {
  const slot = $('bbm-slot-suggestions')
  if (!slot) return
  if (!Array.isArray(list) || list.length === 0) {
    clearAndAppend(slot, createEl('span', { className: 'bbm-empty' }, '제안 없음'))
    return
  }
  const ul = createEl('ul', { style: { margin: 0, paddingLeft: '16px' } })
  for (const item of list) {
    const text = typeof item === 'string' ? item : item?.text || String(item)
    ul.appendChild(createEl('li', {}, text))
  }
  clearAndAppend(slot, ul)
}

/**
 * 구조 가이드 — 작성 중인 글의 구조를 체크리스트로 표시.
 * structure shape: { title, intro, sections, outro, totals, score, recommendations, ideal }
 */
function renderStructure(structure) {
  const slot = $('bbm-slot-structure')
  if (!slot) return
  if (!structure || typeof structure !== 'object') {
    clearAndAppend(slot, createEl('span', { className: 'bbm-empty' }, '제목과 본문을 입력하면 구조가 표시됩니다.'))
    return
  }

  const { score, totals, intro, sections, outro, ideal } = structure
  const checks = [
    {
      label: '제목',
      detail: `${(structure.title || '').length}자`,
      ok: score.titleQuality >= 70,
    },
    {
      label: '도입부',
      detail: `${intro?.charCount || 0}자 · ${intro?.paragraphCount || 0}단락`,
      ok: score.introQuality >= 70,
    },
    {
      label: '섹션',
      detail: `${totals.sectionCount}개`,
      ok: score.sectionCountQuality >= 70,
      hint: totals.sectionCount === 0
        ? '▶, ■ 또는 「1.」 로 소제목을 추가하세요.'
        : null,
    },
    {
      label: '섹션 균형',
      detail: sections.length
        ? `평균 ${Math.round(sections.reduce((a, s) => a + s.charCount, 0) / sections.length)}자`
        : '-',
      ok: score.sectionBalance >= 70,
    },
    {
      label: '이미지',
      detail: `${totals.imageCount}장`,
      ok: score.imageDistribution >= 70,
    },
    {
      label: '마무리',
      detail: outro ? `${outro.charCount}자` : '—',
      ok: !outro || score.outroQuality >= 60,
    },
  ]

  const header = createEl('div', { className: 'bbm-guide-head' }, [
    createEl('span', { className: 'bbm-guide-title' }, ['구조 점수']),
    createEl('strong', { className: `bbm-guide-score ${scoreClass(score.total)}` },
      [`${score.total}`, createEl('span', { className: 'bbm-guide-score-sub' }, [' /100'])]
    ),
  ])

  const list = createEl('ul', { className: 'bbm-guide-list' },
    checks.map((c) =>
      createEl('li', { className: `bbm-guide-item ${c.ok ? 'ok' : 'warn'}` }, [
        createEl('span', { className: `bbm-guide-icon ${c.ok ? 'ok' : 'warn'}` }, [c.ok ? '✓' : '!']),
        createEl('span', { className: 'bbm-guide-label' }, [c.label]),
        createEl('span', { className: 'bbm-guide-detail' }, [c.detail]),
      ])
    )
  )

  // 다음 단계 가이드
  const nextHint = getNextHint(structure)
  const children = [header, list]
  if (nextHint) {
    children.push(
      createEl('p', { className: 'bbm-guide-next' },
        [createEl('strong', {}, ['다음 단계 · ']), nextHint]
      )
    )
  }

  clearAndAppend(slot, ...children)
}

function scoreClass(n) {
  if (n >= 80) return 'is-good'
  if (n >= 60) return 'is-warn'
  return 'is-poor'
}

/**
 * 가장 높은 우선순위 recommendation 1개를 "다음 단계" 힌트로.
 */
function getNextHint(structure) {
  const recs = structure.recommendations || []
  const high = recs.find((r) => r.priority === 'high')
  const medium = recs.find((r) => r.priority === 'medium')
  const pick = high || medium || recs[0]
  return pick ? pick.text : null
}

function renderError(code) {
  renderScore('—', '분석에 실패했습니다.')
  const slot = $('bbm-slot-suggestions')
  if (!slot) return
  const friendly = mapErrorCode(code)
  clearAndAppend(
    slot,
    createEl('span', { style: { color: '#dc2626' } }, friendly),
  )
}

function mapErrorCode(code) {
  if (!code) return '알 수 없는 오류가 발생했습니다.'
  if (code === 'service_worker_unreachable') return '확장프로그램 서비스와 연결할 수 없습니다. 확장 재시작 후 다시 시도해 주세요.'
  if (code === 'unauthenticated') return '로그인이 필요합니다.'
  if (code === 'rate_limited') return '요청이 너무 많습니다. 잠시 후 자동으로 다시 시도합니다.'
  return '분석 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.'
}

function humanizeKey(key) {
  const map = {
    charCount: '글자 수',
    wordCount: '단어 수',
    paragraphCount: '문단 수',
    imageCount: '이미지 수',
    linkCount: '링크 수',
    readingTimeMin: '예상 읽기 시간(분)',
  }
  return map[key] || key
}

function findHookRec(d) {
  // sections 배열에서 hookScore 섹션 찾기
  const hookSec = (d.sections || []).find((s) => s.key === 'hookScore')
  if (!hookSec) return null
  return { score: hookSec.score, text: '첫 문단 후킹 점수' }
}

function handleMessage(event) {
  // 보안: 발신 origin 을 extension origin 으로 제한.
  if (EXTENSION_ORIGIN && event.origin !== EXTENSION_ORIGIN) return
  const data = event.data
  if (!data || data.type !== MESSAGE_TYPE) return

  const { payload } = data
  if (!payload || typeof payload !== 'object') return

  const status = payload.status
  setStatus(status)

  if (status === 'ok' && payload.data) {
    const d = payload.data
    // analyze-handler 응답 shape 은 { totalScore, sections[], stats, structure, recommendations, ... }
    // 사이드바는 구조 가이드 + 기본 지표 + 개선 제안만 사용.
    renderScore(
      typeof d.totalScore === 'number' ? d.totalScore : d.score,
      d.scoreHint,
    )
    const basic = d.stats || d.basic || d.metrics || null
    renderBasic(basic)
    renderHook(d.hook || findHookRec(d))
    renderStructure(d.structure || null)
    renderSuggestions(d.recommendations || d.suggestions || [])
    return
  }

  if (status === 'analyzing') {
    renderScore('…', '분석 중…')
    return
  }

  if (status === 'empty') {
    renderScore('—', '글을 작성하면 자동으로 분석합니다.')
    renderBasic(null)
    renderHook(null)
    renderSuggestions([])
    return
  }

  if (status === 'error') {
    renderError(payload.error)
    return
  }

  // ready / idle
  renderScore('—', '글을 작성하면 자동으로 분석합니다.')
}

window.addEventListener('message', handleMessage)
setStatus('idle')
