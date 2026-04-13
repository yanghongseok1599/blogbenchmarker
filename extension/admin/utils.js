// extension/admin/utils.js
// 관리자 페이지 공용 유틸 (탭 모듈에서 import).

import { safeText } from '../lib/dom-safe.js'

export function showStatus(el, text, kind) {
  if (!el) return
  el.className = `ad-status ad-status--${kind}`
  safeText(el, text)
  el.removeAttribute('hidden')
}

export function hide(el) { if (el) el.setAttribute('hidden', '') }

export function formatDate(iso) {
  if (!iso) return ''
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return ''
  const d = new Date(t)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function formatDateTime(iso) {
  if (!iso) return ''
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return ''
  const d = new Date(t)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function stringifyValue(value) {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

export function prettyError(e) {
  if (!e) return '알 수 없는 오류'
  return e.message ? String(e.message) : String(e)
}
