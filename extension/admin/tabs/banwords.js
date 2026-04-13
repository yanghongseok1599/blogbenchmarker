// admin/tabs/banwords.js — 금칙어 탭

import { createEl, clearAndAppend } from '../../lib/dom-safe.js'
import { getBanWords, addBanWord, removeBanWord } from '../../lib/repositories/admin-repo.js'
import { showStatus, hide, prettyError } from '../utils.js'

export function bindBanwordsTab() {
  document.querySelector('[data-action="banword-add"]')
    ?.addEventListener('click', () => onAddBanWord())
}

export async function loadBanWords() {
  const listEl = document.querySelector('[data-role="banwords-list"]')
  const statusEl = document.querySelector('[data-role="banwords-status"]')
  if (!listEl) return
  showStatus(statusEl, '불러오는 중...', 'info')
  try {
    const words = await getBanWords()
    renderBanWords(listEl, words)
    hide(statusEl)
  } catch (e) {
    showStatus(statusEl, prettyError(e), 'error')
  }
}

function renderBanWords(listEl, words) {
  if (!words || words.length === 0) {
    clearAndAppend(
      listEl,
      createEl('p', { className: 'ad-banwords__empty' }, ['등록된 금칙어가 없습니다.']),
    )
    return
  }
  const items = words.map((w) =>
    createEl('li', { className: 'ad-banword' }, [
      String(w),
      createEl(
        'button',
        {
          type: 'button',
          className: 'ad-banword__remove',
          'aria-label': `${w} 삭제`,
          onClick: () => onRemoveBanWord(w),
        },
        ['×'],
      ),
    ]),
  )
  clearAndAppend(listEl, ...items)
}

async function onAddBanWord() {
  const input = document.querySelector('[data-role="banword-input"]')
  const statusEl = document.querySelector('[data-role="banwords-status"]')
  const word = (input?.value || '').trim()
  if (!word) return
  showStatus(statusEl, '추가 중...', 'info')
  try {
    await addBanWord(word)
    if (input) input.value = ''
    showStatus(statusEl, '추가 완료', 'ok')
    await loadBanWords()
  } catch (e) {
    showStatus(statusEl, prettyError(e), 'error')
  }
}

async function onRemoveBanWord(word) {
  if (!confirm(`'${word}' 를 삭제할까요?`)) return
  const statusEl = document.querySelector('[data-role="banwords-status"]')
  showStatus(statusEl, '삭제 중...', 'info')
  try {
    await removeBanWord(word)
    showStatus(statusEl, '삭제 완료', 'ok')
    await loadBanWords()
  } catch (e) {
    showStatus(statusEl, prettyError(e), 'error')
  }
}
