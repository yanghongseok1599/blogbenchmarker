// sidepanel/tabs/learning-tab.js
// Phase 7 학습 탭 컨트롤러.
//
// 책임:
//   1) 본인 학습 데이터 목록 표시 (learning-repo.listLearnings)
//   2) 체크박스로 선택 → chrome.storage.local 에 selectedIds 저장
//      (generate 탭이 'bm.learning.selectedIds' 키에서 읽음)
//   3) 삭제 버튼 → learning-repo.deleteLearning + 목록 갱신
//
// 안전 규칙(chrome-extension-security §3): 모든 DOM 조작은 dom-safe.js 의
// createEl/safeText/clearAndAppend 만 사용한다. textContent 경로로만 외부 데이터 삽입.

import { createEl, safeText, clearAndAppend } from '../../lib/dom-safe.js'
import { createLearningCard } from '../components/learning-card.js'
import {
  listLearnings,
  deleteLearning,
  countLearnings,
} from '../../lib/repositories/learning-repo.js'
import { supabase } from '../../lib/supabase-client.js'

const SELECTED_IDS_KEY = 'bm.learning.selectedIds'
const PAGE_LIMIT = 50

let mounted = false
/** @type {HTMLElement | null} */ let listEl = null
/** @type {HTMLElement | null} */ let statusEl = null
/** @type {HTMLElement | null} */ let emptyEl = null
/** @type {HTMLElement | null} */ let countEl = null

/** @type {Set<string>} */
const selectedIds = new Set()

/**
 * 학습 탭을 패널에 마운트한다(idempotent).
 * @param {HTMLElement} panelRoot
 */
export async function mountLearningTab(panelRoot) {
  if (mounted) {
    await refresh()
    return
  }
  if (!panelRoot) return

  const dom = buildLearningTabDOM()
  clearAndAppend(panelRoot, dom.root)
  listEl = dom.listEl
  statusEl = dom.statusEl
  emptyEl = dom.emptyEl
  countEl = dom.countEl

  dom.refreshBtn.addEventListener('click', () => refresh())
  dom.clearSelBtn.addEventListener('click', () => clearSelection())

  await loadSelectionFromStorage()
  mounted = true
  await refresh()
}

/**
 * 외부에서 현재 선택된 학습 ID 목록 조회 (테스트/디버깅용).
 * generate 탭은 chrome.storage.local 을 직접 읽는 게 권장.
 * @returns {string[]}
 */
export function getSelectedLearningIds() {
  return Array.from(selectedIds)
}

// ─────────────────────────────────────────────────────────────
// DOM 조립 (learning-tab.html 마크업과 등가)
// ─────────────────────────────────────────────────────────────

function buildLearningTabDOM() {
  const countEl = createEl('span', {
    className: 'bm-learning__count',
    'data-role': 'count',
    'aria-live': 'polite',
  })

  const titleRow = createEl('div', { className: 'bm-learning__head-row' }, [
    createEl('h2', { className: 'bm-learning__title' }, ['내 학습 데이터']),
    countEl,
  ])

  const refreshBtn = /** @type {HTMLButtonElement} */ (
    createEl(
      'button',
      { type: 'button', className: 'bm-btn', 'data-action': 'learning-refresh' },
      ['새로고침'],
    )
  )
  const clearSelBtn = /** @type {HTMLButtonElement} */ (
    createEl(
      'button',
      { type: 'button', className: 'bm-btn', 'data-action': 'learning-clear-selection' },
      ['선택 해제'],
    )
  )

  const head = createEl('header', { className: 'bm-learning__head' }, [
    titleRow,
    createEl('p', { className: 'bm-learning__hint' }, [
      '체크박스로 선택한 글이 AI 글 생성 시 “내 스타일” 참고로 사용됩니다.',
    ]),
    createEl('div', { className: 'bm-learning__head-actions' }, [refreshBtn, clearSelBtn]),
  ])

  const statusEl = createEl('div', {
    className: 'bm-learning__status',
    'data-role': 'status',
    role: 'status',
    'aria-live': 'polite',
    hidden: '',
  })
  const listEl = createEl('div', { className: 'bm-learning__list', 'data-role': 'list' })
  const emptyEl = createEl(
    'p',
    { className: 'bm-learning__empty', 'data-role': 'empty', hidden: '' },
    ['아직 학습 데이터가 없습니다. 본인 글 분석 시 “학습에 추가”를 선택해 보세요.'],
  )

  const root = createEl(
    'section',
    { className: 'bm-learning', 'data-tab-content': 'learning' },
    [head, statusEl, listEl, emptyEl],
  )

  return { root, listEl, statusEl, emptyEl, countEl, refreshBtn, clearSelBtn }
}

// ─────────────────────────────────────────────────────────────
// 데이터 로드/렌더
// ─────────────────────────────────────────────────────────────

async function refresh() {
  hide(emptyEl)
  showStatus('불러오는 중...', 'info')

  const userId = await getCurrentUserId()
  if (!userId) {
    showStatus('로그인이 필요합니다.', 'error')
    if (listEl) clearAndAppend(listEl)
    setCount(0)
    return
  }

  try {
    const [records, total] = await Promise.all([
      listLearnings(userId, { limit: PAGE_LIMIT }),
      countLearnings(userId),
    ])
    setCount(total)
    renderRecords(records)
    hide(statusEl)
  } catch (e) {
    showStatus(prettyError(e), 'error')
  }
}

function renderRecords(records) {
  if (!listEl) return

  if (!records || records.length === 0) {
    clearAndAppend(listEl)
    show(emptyEl)
    return
  }
  hide(emptyEl)

  // 사라진 ID 는 selection 에서도 제거
  const presentIds = new Set(records.map((r) => r.id))
  for (const id of Array.from(selectedIds)) {
    if (!presentIds.has(id)) selectedIds.delete(id)
  }
  saveSelectionToStorage().catch(() => {})

  const cards = records.map((r) =>
    createLearningCard({
      id: r.id,
      title: r.content_json?.title ?? '(제목 없음)',
      keywords: Array.isArray(r.keywords) ? r.keywords : [],
      createdAt: r.created_at,
      selected: selectedIds.has(r.id),
      onToggleSelect: handleToggleSelect,
      onDelete: handleDelete,
    }),
  )
  clearAndAppend(listEl, ...cards)
}

// ─────────────────────────────────────────────────────────────
// 이벤트 핸들러
// ─────────────────────────────────────────────────────────────

async function handleToggleSelect(id, next) {
  if (!id) return
  if (next) selectedIds.add(id)
  else selectedIds.delete(id)
  // 카드 data-selected 속성 동기화 (시각 표시용)
  const card = listEl?.querySelector(`[data-learning-id="${cssEscape(id)}"]`)
  if (card) card.setAttribute('data-selected', String(next))
  await saveSelectionToStorage()
}

async function handleDelete(id) {
  if (!id) return
  if (!confirm('이 학습 데이터를 삭제할까요?')) return

  try {
    await deleteLearning(id)
    selectedIds.delete(id)
    await saveSelectionToStorage()
    await refresh()
  } catch (e) {
    showStatus(prettyError(e), 'error')
  }
}

async function clearSelection() {
  selectedIds.clear()
  await saveSelectionToStorage()
  await refresh()
}

// ─────────────────────────────────────────────────────────────
// chrome.storage 어댑터 + 유틸
// ─────────────────────────────────────────────────────────────

async function loadSelectionFromStorage() {
  try {
    const obj = await chrome.storage.local.get(SELECTED_IDS_KEY)
    const raw = obj?.[SELECTED_IDS_KEY]
    if (Array.isArray(raw)) {
      for (const id of raw) {
        if (typeof id === 'string' && id) selectedIds.add(id)
      }
    }
  } catch {
    // 무시 — 빈 selection 으로 시작
  }
}

async function saveSelectionToStorage() {
  try {
    await chrome.storage.local.set({ [SELECTED_IDS_KEY]: Array.from(selectedIds) })
  } catch {
    // 무시 — 다음 토글 때 재시도
  }
}

async function getCurrentUserId() {
  try {
    const { data, error } = await supabase.auth.getSession()
    if (error) return null
    return data?.session?.user?.id ?? null
  } catch {
    return null
  }
}

function showStatus(text, kind) {
  if (!statusEl) return
  statusEl.className = `bm-learning__status bm-learning__status--${kind}`
  safeText(statusEl, text)
  show(statusEl)
}

function setCount(n) {
  if (!countEl) return
  safeText(countEl, n > 0 ? `(${n})` : '')
}

function show(el) { if (el) el.removeAttribute('hidden') }
function hide(el) { if (el) el.setAttribute('hidden', '') }

function prettyError(e) {
  if (!e) return '알 수 없는 오류'
  return e.message ? String(e.message) : String(e)
}

/**
 * data-learning-id 값에 들어갈 수 있는 특수 문자 회피.
 * UUID 만 들어오는 경로지만 방어적 처리.
 */
function cssEscape(value) {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(String(value))
  }
  return String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&')
}
