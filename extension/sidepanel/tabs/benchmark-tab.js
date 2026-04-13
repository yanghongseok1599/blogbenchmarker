// sidepanel/tabs/benchmark-tab.js
// Phase 4.1: 사이드패널 '벤치마크' 탭 컨트롤러 — 즐겨찾기 블로그 관리.
//
// 책임:
//   1) 탭 패널(<section data-panel="benchmark">) 안에 UI 1회 마운트 (idempotent).
//   2) URL 입력 + "추가" → benchmark-repo.addBlog 호출 → 목록 갱신.
//   3) 항목별 "삭제" 버튼 → benchmark-repo.removeBlog.
//   4) Realtime 구독 → 다른 기기/세션 변경을 자동 반영.
//   5) 탭 unmount 시점이 없으므로 beforeunload 에서 cleanup 필수.
//
// 안전 규칙:
//   - 외부 데이터(blog_url, blog_name)는 반드시 textContent 로만 삽입 (createEl 경로).
//   - innerHTML 사용 금지 — 본 파일 내 검증 grep 0건.

import { createEl, safeText, clearAndAppend } from '../../lib/dom-safe.js'
import { getCurrentUser } from '../../lib/supabase-client.js'
import {
  addBlog,
  removeBlog,
  listBlogs,
  subscribeToChanges,
} from '../../lib/repositories/benchmark-repo.js'
import { parseNaverBlogUrl } from '../../lib/utils/url-parser.js'

let mounted = false
let currentUserId = /** @type {string | null} */ (null)
let unsubscribeRealtime = /** @type {(() => Promise<void>) | null} */ (null)

/** DOM 참조 */
/** @type {HTMLFormElement | null} */ let formEl = null
/** @type {HTMLInputElement | null} */ let urlInput = null
/** @type {HTMLButtonElement | null} */ let addBtn = null
/** @type {HTMLElement | null} */ let statusEl = null
/** @type {HTMLElement | null} */ let listEl = null
/** @type {HTMLElement | null} */ let emptyEl = null

/** 로컬 캐시 — 렌더 비교/중복 방지용. id → blog 객체 */
const blogById = new Map()

// ────────────────────────────────────────────────────────────
// 공개 진입점
// ────────────────────────────────────────────────────────────

/**
 * 벤치마크 탭 마운트. panel.js 의 탭 활성화 훅에서 호출.
 * @param {HTMLElement} panelRoot <section data-panel="benchmark">
 */
export async function mountBenchmarkTab(panelRoot) {
  if (mounted) return
  if (!panelRoot) {
    console.warn('[benchmark-tab] panelRoot 가 비어 있습니다.')
    return
  }

  const dom = buildBenchmarkTabDOM()
  clearAndAppend(panelRoot, dom.root)

  formEl = dom.formEl
  urlInput = dom.urlInput
  addBtn = dom.addBtn
  statusEl = dom.statusEl
  listEl = dom.listEl
  emptyEl = dom.emptyEl

  formEl.addEventListener('submit', handleAddSubmit)
  mounted = true

  await bootstrap()

  // 페이지 unload 시 Realtime 채널 정리.
  window.addEventListener('beforeunload', cleanup, { once: true })
}

/**
 * Realtime 구독을 해제한다. 테스트/재초기화 용도로도 사용.
 */
export async function cleanup() {
  if (unsubscribeRealtime) {
    try { await unsubscribeRealtime() } catch { /* noop */ }
    unsubscribeRealtime = null
  }
}

// ────────────────────────────────────────────────────────────
// DOM 조립 (benchmark-tab.html 마크업과 등가)
// ────────────────────────────────────────────────────────────

function buildBenchmarkTabDOM() {
  const urlInput = /** @type {HTMLInputElement} */ (
    createEl('input', {
      type: 'url',
      className: 'bm-input',
      name: 'blog-url',
      'data-role': 'url-input',
      placeholder: 'https://blog.naver.com/...',
      required: 'required',
    })
  )

  const addBtn = /** @type {HTMLButtonElement} */ (
    createEl(
      'button',
      {
        type: 'submit',
        className: 'bm-btn bm-btn--primary',
        'data-action': 'benchmark-add',
      },
      ['추가']
    )
  )

  const formEl = /** @type {HTMLFormElement} */ (
    createEl(
      'form',
      {
        className: 'bm-benchmark__form',
        'data-role': 'add-form',
        autocomplete: 'off',
      },
      [urlInput, addBtn]
    )
  )

  const head = createEl('header', { className: 'bm-benchmark__head' }, [
    createEl('h2', { className: 'bm-benchmark__title' }, ['즐겨찾기 블로거']),
    createEl('p', { className: 'bm-benchmark__hint' }, [
      '벤치마킹할 네이버 블로그 URL 을 추가하세요. 예) https://blog.naver.com/example',
    ]),
  ])

  const statusEl = createEl('div', {
    className: 'bm-benchmark__status',
    'data-role': 'status',
    hidden: '',
    role: 'status',
    'aria-live': 'polite',
  })

  const listEl = createEl('ul', {
    className: 'bm-benchmark__list',
    'data-role': 'list',
  })

  const emptyEl = createEl(
    'p',
    { className: 'bm-benchmark__empty', 'data-role': 'empty', hidden: '' },
    ['아직 등록된 블로그가 없습니다.']
  )

  const root = createEl(
    'section',
    { className: 'bm-benchmark', 'data-tab-content': 'benchmark' },
    [head, formEl, statusEl, listEl, emptyEl]
  )

  return { root, formEl, urlInput, addBtn, statusEl, listEl, emptyEl }
}

// ────────────────────────────────────────────────────────────
// 초기 로드 + Realtime 구독
// ────────────────────────────────────────────────────────────

async function bootstrap() {
  try {
    const user = await getCurrentUser()
    if (!user) {
      showStatus('로그인이 필요합니다.', 'error')
      setFormDisabled(true)
      return
    }
    currentUserId = user.id

    const blogs = await listBlogs(currentUserId)
    resetCache(blogs)
    renderList()

    unsubscribeRealtime = subscribeToChanges(currentUserId, handleRealtimeEvent)
  } catch (err) {
    showStatus(prettyError(err), 'error')
  }
}

function resetCache(blogs) {
  blogById.clear()
  for (const b of blogs) blogById.set(b.id, b)
}

// ────────────────────────────────────────────────────────────
// 이벤트 핸들러
// ────────────────────────────────────────────────────────────

/** @param {SubmitEvent} event */
async function handleAddSubmit(event) {
  event.preventDefault()
  if (!currentUserId || !urlInput) return

  const raw = urlInput.value.trim()
  if (!raw) return

  // URL 유효성/정규화를 저장 전에 클라이언트에서 1차 차단 (UX 힌트).
  const parsed = parseNaverBlogUrl(raw)
  if (!parsed.isValid || !parsed.canonicalUrl) {
    showStatus('네이버 블로그 URL 형식이 아닙니다. 예) https://blog.naver.com/example', 'error')
    return
  }

  setBusy(true)
  hide(statusEl)
  try {
    const displayName = parsed.blogId
    const created = await addBlog(currentUserId, parsed.canonicalUrl, displayName)
    blogById.set(created.id, created)
    renderList()
    urlInput.value = ''
    showStatus('추가되었습니다.', 'info')
  } catch (err) {
    showStatus(prettyError(err), 'error')
  } finally {
    setBusy(false)
  }
}

/** @param {string} id */
async function handleRemoveClick(id) {
  if (!id) return
  setBusy(true)
  hide(statusEl)
  try {
    await removeBlog(id)
    blogById.delete(id)
    renderList()
  } catch (err) {
    showStatus(prettyError(err), 'error')
  } finally {
    setBusy(false)
  }
}

/**
 * Realtime 이벤트로 캐시/DOM 동기화.
 * @param {{ event: 'INSERT'|'UPDATE'|'DELETE', new: any, old: any }} payload
 */
function handleRealtimeEvent(payload) {
  if (!payload) return
  const { event } = payload
  if (event === 'DELETE') {
    const id = payload.old?.id
    if (id) blogById.delete(id)
  } else if (event === 'INSERT' || event === 'UPDATE') {
    const row = payload.new
    if (row?.id) blogById.set(row.id, row)
  }
  renderList()
}

// ────────────────────────────────────────────────────────────
// 렌더링
// ────────────────────────────────────────────────────────────

function renderList() {
  if (!listEl || !emptyEl) return

  const blogs = [...blogById.values()].sort((a, b) => {
    const ta = new Date(a.added_at || 0).getTime()
    const tb = new Date(b.added_at || 0).getTime()
    return tb - ta
  })

  if (blogs.length === 0) {
    clearAndAppend(listEl)
    show(emptyEl)
    return
  }

  hide(emptyEl)
  const items = blogs.map(renderItem)
  clearAndAppend(listEl, ...items)
}

/**
 * @param {{ id: string, blog_url: string, blog_name: string | null, added_at: string }} blog
 */
function renderItem(blog) {
  const nameEl = createEl(
    'p',
    { className: 'bm-benchmark__item-name' },
    [blog.blog_name || deriveDisplayName(blog.blog_url)]
  )
  const urlEl = createEl(
    'a',
    {
      className: 'bm-benchmark__item-url',
      href: blog.blog_url,
      target: '_blank',
      rel: 'noopener noreferrer',
      title: blog.blog_url,
    },
    [blog.blog_url]
  )
  const removeBtn = createEl(
    'button',
    {
      type: 'button',
      className: 'bm-btn bm-btn--ghost bm-benchmark__remove',
      'data-action': 'benchmark-remove',
      'data-id': blog.id,
      'aria-label': '삭제',
      onClick: () => handleRemoveClick(blog.id),
    },
    ['삭제']
  )

  return createEl(
    'li',
    { className: 'bm-benchmark__item', 'data-id': blog.id },
    [
      createEl('div', { className: 'bm-benchmark__item-body' }, [nameEl, urlEl]),
      removeBtn,
    ]
  )
}

/** blog_url 에서 표시용 이름 추출 (예: https://blog.naver.com/example → example) */
function deriveDisplayName(url) {
  try {
    const u = new URL(url)
    const first = u.pathname.split('/').filter(Boolean)[0]
    return first || u.hostname
  } catch {
    return url
  }
}

// ────────────────────────────────────────────────────────────
// UI 유틸
// ────────────────────────────────────────────────────────────

/**
 * @param {string} text
 * @param {'info' | 'error'} kind
 */
function showStatus(text, kind = 'info') {
  if (!statusEl) return
  statusEl.className = `bm-benchmark__status bm-benchmark__status--${kind}`
  safeText(statusEl, text)
  show(statusEl)
}

function show(el) { if (el) el.removeAttribute('hidden') }
function hide(el) { if (el) el.setAttribute('hidden', '') }

function setBusy(busy) {
  if (addBtn) {
    addBtn.disabled = busy
    addBtn.setAttribute('aria-busy', String(busy))
    safeText(addBtn, busy ? '처리 중...' : '추가')
  }
  if (urlInput) urlInput.disabled = busy
}

function setFormDisabled(disabled) {
  if (addBtn) addBtn.disabled = disabled
  if (urlInput) urlInput.disabled = disabled
}

function prettyError(err) {
  if (!err) return '알 수 없는 오류'
  return err.message ? String(err.message) : String(err)
}
