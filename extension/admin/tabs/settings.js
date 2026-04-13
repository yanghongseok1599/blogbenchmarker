// admin/tabs/settings.js — 앱 설정 탭

import { createEl, clearAndAppend } from '../../lib/dom-safe.js'
import { getAppSettings, updateAppSetting } from '../../lib/repositories/admin-repo.js'
import { showStatus, hide, formatDate, stringifyValue, prettyError } from '../utils.js'

export function bindSettingsTab() {
  document.querySelector('[data-action="settings-reload"]')
    ?.addEventListener('click', () => loadSettings())
  document.querySelector('[data-action="setting-save"]')
    ?.addEventListener('click', () => saveSetting())
}

export async function loadSettings() {
  const tableEl = document.querySelector('[data-role="settings-table"]')
  const statusEl = document.querySelector('[data-role="settings-status"]')
  if (!tableEl) return
  showStatus(statusEl, '불러오는 중...', 'info')
  try {
    const rows = await getAppSettings()
    renderSettingsTable(tableEl, rows)
    hide(statusEl)
  } catch (e) {
    showStatus(statusEl, prettyError(e), 'error')
  }
}

function renderSettingsTable(tableEl, rows) {
  const head = createEl('div', { className: 'ad-row ad-row--head ad-row--settings' }, [
    createEl('div', { className: 'ad-cell' }, ['key']),
    createEl('div', { className: 'ad-cell' }, ['value']),
    createEl('div', { className: 'ad-cell' }, ['updated_at']),
    createEl('div', { className: 'ad-cell ad-cell--actions' }, ['액션']),
  ])
  if (!rows || rows.length === 0) {
    clearAndAppend(tableEl, head, createEl('div', { className: 'ad-row ad-row--empty' }, ['설정 없음']))
    return
  }
  const items = rows.map((r) =>
    createEl('div', { className: 'ad-row ad-row--settings', 'data-key': r.key }, [
      createEl('div', { className: 'ad-cell ad-cell--mono', title: r.key }, [r.key]),
      createEl('div', { className: 'ad-cell ad-cell--mono ad-cell--meta' }, [stringifyValue(r.value)]),
      createEl('div', { className: 'ad-cell' }, [formatDate(r.updated_at)]),
      createEl('div', { className: 'ad-cell ad-cell--actions' }, [
        createEl(
          'button',
          {
            type: 'button',
            className: 'ad-btn',
            onClick: () => fillSettingForm(r.key, r.value),
          },
          ['편집'],
        ),
      ]),
    ]),
  )
  clearAndAppend(tableEl, head, ...items)
}

function fillSettingForm(key, value) {
  const keyEl = document.querySelector('[data-role="setting-key"]')
  const valueEl = document.querySelector('[data-role="setting-value"]')
  if (keyEl) keyEl.value = key
  if (valueEl) valueEl.value = stringifyValue(value)
  document.querySelector('.ad-details')?.setAttribute('open', '')
}

async function saveSetting() {
  const keyEl = document.querySelector('[data-role="setting-key"]')
  const valueEl = document.querySelector('[data-role="setting-value"]')
  const statusEl = document.querySelector('[data-role="settings-status"]')
  const key = (keyEl?.value || '').trim()
  const rawValue = (valueEl?.value || '').trim()
  if (!key) {
    showStatus(statusEl, 'key 가 비어 있습니다.', 'error')
    return
  }
  let parsed
  try {
    parsed = rawValue ? JSON.parse(rawValue) : null
  } catch {
    showStatus(statusEl, 'value 는 유효한 JSON 이어야 합니다.', 'error')
    return
  }
  showStatus(statusEl, '저장 중...', 'info')
  try {
    await updateAppSetting(key, parsed)
    showStatus(statusEl, '저장 완료', 'ok')
    await loadSettings()
  } catch (e) {
    showStatus(statusEl, prettyError(e), 'error')
  }
}
