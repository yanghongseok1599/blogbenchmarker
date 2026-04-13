// admin/tabs/audit.js — 감사 로그 탭

import { createEl, clearAndAppend, safeText } from '../../lib/dom-safe.js'
import { listAuditLog } from '../../lib/repositories/admin-repo.js'
import { showStatus, hide, formatDateTime, stringifyValue, prettyError } from '../utils.js'

export function bindAuditTab() {
  document.querySelector('[data-action="audit-reload"]')
    ?.addEventListener('click', () => loadAudit())
}

export async function loadAudit() {
  const tableEl = document.querySelector('[data-role="audit-table"]')
  const statusEl = document.querySelector('[data-role="audit-status"]')
  const countEl = document.querySelector('[data-role="audit-count"]')
  if (!tableEl) return
  showStatus(statusEl, '불러오는 중...', 'info')
  try {
    const { rows, total } = await listAuditLog({ limit: 100 })
    if (countEl) safeText(countEl, total != null ? `총 ${total}건` : '')
    renderAuditTable(tableEl, rows)
    hide(statusEl)
  } catch (e) {
    showStatus(statusEl, prettyError(e), 'error')
  }
}

function renderAuditTable(tableEl, rows) {
  const head = createEl('div', { className: 'ad-row ad-row--head ad-row--audit' }, [
    createEl('div', { className: 'ad-cell' }, ['시각']),
    createEl('div', { className: 'ad-cell' }, ['action']),
    createEl('div', { className: 'ad-cell' }, ['admin / target']),
    createEl('div', { className: 'ad-cell' }, ['metadata']),
  ])
  if (!rows || rows.length === 0) {
    clearAndAppend(tableEl, head, createEl('div', { className: 'ad-row ad-row--empty' }, ['로그 없음']))
    return
  }
  const items = rows.map((r) =>
    createEl('div', { className: 'ad-row ad-row--audit', 'data-id': String(r.id) }, [
      createEl('div', { className: 'ad-cell ad-cell--mono' }, [formatDateTime(r.created_at)]),
      createEl('div', { className: 'ad-cell ad-cell--mono' }, [r.action]),
      createEl('div', { className: 'ad-cell ad-cell--mono' }, [
        `admin: ${r.admin_id ?? '(deleted)'}\ntarget: ${r.target_user_id ?? '-'}`,
      ]),
      createEl('div', { className: 'ad-cell ad-cell--mono ad-cell--meta' }, [stringifyValue(r.metadata)]),
    ]),
  )
  clearAndAppend(tableEl, head, ...items)
}
