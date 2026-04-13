// sidepanel/components/learning-card.js
// 학습 데이터 1건을 카드로 렌더한다.
//
// Props:
//   {
//     id: string,
//     title: string,
//     keywords: string[],
//     createdAt: string (ISO),
//     selected?: boolean,
//     onToggleSelect?: (id, nextChecked) => void,
//     onDelete?: (id) => void,
//   }
//
// 안전 규칙(chrome-extension-security §3): 모든 외부 데이터는 createEl 의
// children 슬롯으로만 들어가 textContent 경로로 삽입된다.

import { createEl } from '../../lib/dom-safe.js'

/**
 * @typedef LearningCardProps
 * @property {string} id
 * @property {string} title
 * @property {string[]} [keywords]
 * @property {string} [createdAt]
 * @property {boolean} [selected]
 * @property {(id: string, next: boolean) => void} [onToggleSelect]
 * @property {(id: string) => void} [onDelete]
 */

/**
 * @param {LearningCardProps} props
 * @returns {HTMLElement}
 */
export function createLearningCard(props) {
  const id = String(props?.id ?? '')
  const title = String(props?.title ?? '(제목 없음)')
  const keywords = Array.isArray(props?.keywords) ? props.keywords : []
  const createdAt = formatDate(props?.createdAt)
  const selected = !!props?.selected

  const checkbox = /** @type {HTMLInputElement} */ (
    createEl('input', {
      type: 'checkbox',
      className: 'bm-lcard__check',
      checked: selected ? 'checked' : null,
      'data-learning-id': id,
      'aria-label': `${title} 선택`,
      onChange: (ev) => {
        const next = !!ev.target?.checked
        props?.onToggleSelect?.(id, next)
      },
    })
  )

  const titleEl = createEl('h3', { className: 'bm-lcard__title', title }, [title])

  const head = createEl('label', { className: 'bm-lcard__head' }, [checkbox, titleEl])

  const meta = createEl('div', { className: 'bm-lcard__meta' }, [
    createEl('span', { className: 'bm-lcard__date' }, [createdAt]),
    createEl(
      'button',
      {
        type: 'button',
        className: 'bm-lcard__delete',
        'data-learning-id': id,
        'aria-label': '학습 데이터 삭제',
        onClick: () => props?.onDelete?.(id),
      },
      ['삭제'],
    ),
  ])

  const children = [head, meta]
  if (keywords.length > 0) {
    children.push(buildKeywordChips(keywords))
  }

  return createEl(
    'article',
    {
      className: 'bm-lcard',
      'data-learning-id': id,
      'data-selected': selected ? 'true' : 'false',
    },
    children,
  )
}

function buildKeywordChips(keywords) {
  const chips = keywords
    .filter((k) => typeof k === 'string' && k.trim())
    .slice(0, 8)
    .map((k) => createEl('li', { className: 'bm-lcard__chip' }, [String(k)]))
  return createEl('ul', { className: 'bm-lcard__chips', 'aria-label': '키워드' }, chips)
}

function formatDate(iso) {
  if (!iso) return ''
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return ''
  const d = new Date(t)
  // YYYY-MM-DD
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
