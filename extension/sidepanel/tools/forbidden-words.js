// extension/sidepanel/tools/forbidden-words.js
// 금칙어 검사기. 전역 리스트(app_settings)와 사용자 정의 리스트(chrome.storage.local)를 병합해
// 입력 본문에서 매칭 위치를 하이라이트.
//
// 데이터 출처:
//   - 전역: public.app_settings WHERE key='forbidden_words' (관리자가 관리, 공개 SELECT)
//   - 사용자: chrome.storage.local.__forbidden_words_user (TEXT[])
//
// TODO(repo): lib/repositories/app-settings-repo.js 생성 시 아래 인라인 쿼리를 이관한다.
//             현재 lib/ 쓰기 제한으로 임시로 supabase 클라이언트 직접 호출.

import { createEl, safeText, clearAndAppend } from '../../lib/dom-safe.js'
import { supabase } from '../../lib/supabase-client.js'

const USER_KEY = '__forbidden_words_user'
const APP_SETTINGS_KEY = 'forbidden_words'

async function loadGlobalWords() {
  try {
    const { data, error } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', APP_SETTINGS_KEY)
      .maybeSingle()
    if (error) throw error
    const v = data?.value
    if (Array.isArray(v)) return v.filter((w) => typeof w === 'string')
    if (v && Array.isArray(v.words)) return v.words.filter((w) => typeof w === 'string')
    return []
  } catch (err) {
    console.warn('[forbidden] global load failed:', err?.message)
    return []
  }
}

async function loadUserWords() {
  try {
    const res = await chrome.storage.local.get([USER_KEY])
    const v = res?.[USER_KEY]
    return Array.isArray(v) ? v.filter((w) => typeof w === 'string' && w.trim()) : []
  } catch (_) { return [] }
}

async function saveUserWords(words) {
  const clean = Array.from(new Set(
    (Array.isArray(words) ? words : [])
      .map((w) => (typeof w === 'string' ? w.trim() : ''))
      .filter(Boolean),
  ))
  await chrome.storage.local.set({ [USER_KEY]: clean })
  return clean
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * text 에서 금칙어 매칭 위치를 모두 찾는다.
 * @param {string} text
 * @param {Array<string>} words
 * @returns {Array<{word: string, start: number, end: number}>}
 */
function findMatches(text, words) {
  const out = []
  if (typeof text !== 'string' || !text) return out
  for (const w of words) {
    if (!w) continue
    const re = new RegExp(escapeRegex(w), 'gi')
    // matchAll 이터레이터 사용 — RegExp.lastIndex 수동 조작 없이 안전하게 순회.
    for (const m of text.matchAll(re)) {
      if (typeof m.index !== 'number') continue
      const matched = m[0] || ''
      if (!matched) continue
      out.push({ word: w, start: m.index, end: m.index + matched.length })
    }
  }
  out.sort((a, b) => a.start - b.start || a.end - b.end)
  return out
}

/**
 * 매칭 결과를 DOM 노드 배열로 변환(하이라이트 span).
 * @param {string} text
 * @param {Array<{word, start, end}>} matches
 * @returns {Node[]}
 */
function renderHighlighted(text, matches) {
  const out = []
  if (!text) return out
  if (matches.length === 0) return [document.createTextNode(text)]

  // 겹치는 매칭 병합
  const merged = []
  for (const m of matches) {
    const prev = merged[merged.length - 1]
    if (prev && m.start <= prev.end) {
      prev.end = Math.max(prev.end, m.end)
      prev.words = Array.from(new Set([...(prev.words || [prev.word]), m.word]))
    } else {
      merged.push({ ...m, words: [m.word] })
    }
  }

  let cursor = 0
  for (const m of merged) {
    if (m.start > cursor) {
      out.push(document.createTextNode(text.slice(cursor, m.start)))
    }
    const mark = createEl('mark', {
      className: 'bm-fw__hit',
      title: `금칙어: ${m.words.join(', ')}`,
    })
    safeText(mark, text.slice(m.start, m.end))
    out.push(mark)
    cursor = m.end
  }
  if (cursor < text.length) {
    out.push(document.createTextNode(text.slice(cursor)))
  }
  return out
}

/**
 * 금칙어 검사 카드.
 * @returns {HTMLElement}
 */
export function createForbiddenWordsCard() {
  const root = createEl('section', {
    className: 'bm-tool bm-fw',
    'aria-label': '금칙어 검사',
  })

  root.appendChild(
    createEl('header', { className: 'bm-tool__head' }, [
      createEl('h3', { className: 'bm-tool__title' }, '금칙어 검사'),
      createEl('p', { className: 'bm-tool__hint' }, '관리자가 등록한 공용 금칙어와 내가 추가한 단어를 찾아 표시합니다.'),
    ]),
  )

  // 입력
  const textarea = createEl('textarea', {
    className: 'bm-fw__input',
    rows: '6',
    placeholder: '검사할 본문을 붙여넣으세요...',
    'aria-label': '검사 대상 본문',
  })
  root.appendChild(textarea)

  // 사용자 정의 단어 입력
  const userInput = createEl('input', {
    type: 'text',
    className: 'bm-fw__user-input',
    placeholder: '내 금칙어 추가 (쉼표로 구분)',
    'aria-label': '사용자 정의 금칙어',
  })
  const addBtn = createEl('button', { type: 'button', className: 'bm-btn' }, '추가')
  const clearUserBtn = createEl('button', { type: 'button', className: 'bm-btn' }, '내 단어 비우기')
  root.appendChild(
    createEl('div', { className: 'bm-fw__user-row' }, [userInput, addBtn, clearUserBtn]),
  )

  // 사용자 단어 목록
  const userList = createEl('ul', { className: 'bm-fw__user-list' })
  root.appendChild(userList)

  // 검사 결과
  const status = createEl('p', { className: 'bm-fw__status' }, '입력 후 자동 검사됩니다.')
  root.appendChild(status)

  const preview = createEl('div', {
    className: 'bm-fw__preview',
    'aria-label': '하이라이트된 본문',
  })
  root.appendChild(preview)

  let globalWords = []
  let userWords = []
  let debounceTimer = null

  function renderUserWordList() {
    if (userWords.length === 0) {
      clearAndAppend(userList, createEl('li', { className: 'bm-fw__empty' }, '등록된 내 금칙어 없음'))
      return
    }
    const items = userWords.map((w) => {
      const removeBtn = createEl(
        'button',
        {
          type: 'button',
          className: 'bm-fw__chip-remove',
          'aria-label': `${w} 삭제`,
          onClick: async () => {
            userWords = await saveUserWords(userWords.filter((x) => x !== w))
            renderUserWordList()
            runCheck()
          },
        },
        '×',
      )
      return createEl('li', { className: 'bm-fw__chip' }, [w, removeBtn])
    })
    clearAndAppend(userList, ...items)
  }

  function runCheck() {
    const text = /** @type {HTMLTextAreaElement} */ (textarea).value
    const allWords = Array.from(new Set([...globalWords, ...userWords]))
    const matches = findMatches(text, allWords)

    if (!text.trim()) {
      safeText(status, '입력 후 자동 검사됩니다.')
      clearAndAppend(preview)
      return
    }

    const unique = new Set(matches.map((m) => m.word.toLowerCase()))
    safeText(
      status,
      matches.length === 0
        ? `금칙어 없음 (검사 단어 ${allWords.length}개)`
        : `금칙어 ${matches.length}회 발견 (${unique.size}종)`,
    )
    clearAndAppend(preview, ...renderHighlighted(text, matches))
  }

  textarea.addEventListener('input', () => {
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(runCheck, 200)
  })

  addBtn.addEventListener('click', async () => {
    const raw = /** @type {HTMLInputElement} */ (userInput).value
    const toks = raw.split(/[,\n]/).map((s) => s.trim()).filter(Boolean)
    if (toks.length === 0) return
    userWords = await saveUserWords([...userWords, ...toks])
    /** @type {HTMLInputElement} */ (userInput).value = ''
    renderUserWordList()
    runCheck()
  })

  clearUserBtn.addEventListener('click', async () => {
    userWords = await saveUserWords([])
    renderUserWordList()
    runCheck()
  })

  ;(async () => {
    const [g, u] = await Promise.all([loadGlobalWords(), loadUserWords()])
    globalWords = g
    userWords = u
    renderUserWordList()
    runCheck()
  })()

  return root
}

// 순수 함수로 노출(테스트/재사용)
export { findMatches as findForbiddenMatches }
