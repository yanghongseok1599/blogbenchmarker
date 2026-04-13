// admin/tabs/users.js — 유저 관리 탭

import { createEl, clearAndAppend, safeText } from '../../lib/dom-safe.js'
import {
  listAllUsers,
  updateUserPlan,
  toggleUserAdmin,
} from '../../lib/repositories/admin-repo.js'
import { showStatus, hide, formatDate, prettyError } from '../utils.js'

const PLAN_VALUES = ['free', 'pro', 'unlimited']

export function bindUsersTab() {
  document.querySelector('[data-action="users-search"]')
    ?.addEventListener('click', () => loadUsers())
  document.querySelector('[data-role="user-search"]')
    ?.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') { ev.preventDefault(); loadUsers() }
    })
}

export async function loadUsers() {
  const tableEl = document.querySelector('[data-role="users-table"]')
  const statusEl = document.querySelector('[data-role="users-status"]')
  const countEl = document.querySelector('[data-role="users-count"]')
  if (!tableEl) return

  showStatus(statusEl, '불러오는 중...', 'info')
  const search = (document.querySelector('[data-role="user-search"]')?.value || '').trim()

  try {
    const { rows, total } = await listAllUsers({ limit: 100, search })
    if (countEl) safeText(countEl, total != null ? `총 ${total}명` : '')
    renderUsersTable(tableEl, rows)
    hide(statusEl)
  } catch (e) {
    showStatus(statusEl, prettyError(e), 'error')
  }
}

function renderUsersTable(tableEl, rows) {
  const head = createEl('div', { className: 'ad-row ad-row--head' }, [
    createEl('div', { className: 'ad-cell' }, ['이메일']),
    createEl('div', { className: 'ad-cell' }, ['표시 이름']),
    createEl('div', { className: 'ad-cell' }, ['Plan']),
    createEl('div', { className: 'ad-cell' }, ['Admin']),
    createEl('div', { className: 'ad-cell' }, ['가입일']),
    createEl('div', { className: 'ad-cell ad-cell--actions' }, ['액션']),
  ])

  if (!rows || rows.length === 0) {
    clearAndAppend(tableEl, head, createEl('div', { className: 'ad-row ad-row--empty' }, ['결과 없음']))
    return
  }

  clearAndAppend(tableEl, head, ...rows.map(buildUserRow))
}

function buildUserRow(user) {
  const planSelect = /** @type {HTMLSelectElement} */ (
    createEl(
      'select',
      {
        className: 'ad-input',
        'aria-label': `${user.email} plan`,
        onChange: (ev) => onChangePlan(user.id, ev.target?.value),
      },
      PLAN_VALUES.map((p) =>
        createEl(
          'option',
          { value: p, selected: p === user.plan ? 'selected' : null },
          [p],
        ),
      ),
    )
  )

  const toggleAdminBtn = createEl(
    'button',
    {
      type: 'button',
      className: user.is_admin ? 'ad-btn ad-btn--danger' : 'ad-btn',
      onClick: () => onToggleAdmin(user.id, !user.is_admin, user.email),
    },
    [user.is_admin ? '관리자 회수' : '관리자 부여'],
  )

  return createEl('div', { className: 'ad-row', 'data-user-id': user.id }, [
    createEl('div', { className: 'ad-cell', title: user.email }, [user.email || '']),
    createEl('div', { className: 'ad-cell' }, [user.display_name || '']),
    createEl(
      'div',
      { className: 'ad-cell' },
      [createEl('span', { className: 'ad-plan', 'data-plan': user.plan }, [user.plan])],
    ),
    createEl('div', { className: 'ad-cell' }, [user.is_admin ? '✓' : '']),
    createEl('div', { className: 'ad-cell' }, [formatDate(user.created_at)]),
    createEl('div', { className: 'ad-cell ad-cell--actions' }, [planSelect, toggleAdminBtn]),
  ])
}

async function onChangePlan(userId, plan) {
  if (!PLAN_VALUES.includes(plan)) return
  if (!confirm(`${userId} 의 plan 을 ${plan} 로 변경할까요?`)) {
    await loadUsers()
    return
  }
  const statusEl = document.querySelector('[data-role="users-status"]')
  showStatus(statusEl, `plan 변경 중...`, 'info')
  try {
    await updateUserPlan(userId, plan)
    showStatus(statusEl, 'plan 변경 완료', 'ok')
    await loadUsers()
  } catch (e) {
    showStatus(statusEl, prettyError(e), 'error')
  }
}

async function onToggleAdmin(userId, nextIsAdmin, email) {
  const verb = nextIsAdmin ? '부여' : '회수'
  if (!confirm(`${email} 의 관리자 권한을 ${verb}할까요?`)) return
  const statusEl = document.querySelector('[data-role="users-status"]')
  showStatus(statusEl, `권한 ${verb} 중...`, 'info')
  try {
    await toggleUserAdmin(userId, nextIsAdmin)
    showStatus(statusEl, '완료', 'ok')
    await loadUsers()
  } catch (e) {
    showStatus(statusEl, prettyError(e), 'error')
  }
}
