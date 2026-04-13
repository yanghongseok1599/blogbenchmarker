// sidepanel/components/score-card.js
// 분석 항목 하나(섹션 점수 + 권장사항)를 카드로 렌더한다.
//
// Props:
//   { title: string, score: number(0~100), recommendations?: string[] }
//
// 안전 규칙:
//   - 모든 사용자/외부 데이터(title, recommendation 문자열)는 textContent 경로로만 삽입.
//   - 본 컴포넌트는 dom-safe.js 의 createEl 만 사용 (chrome-extension-security §3-1 §3-2).

import { createEl } from '../../lib/dom-safe.js'
import { createProgressBar } from './progress-bar.js'

/**
 * @typedef ScoreCardProps
 * @property {string} title 섹션 제목 (예: '첫 문단 품질')
 * @property {number} score 0~100
 * @property {string[]} [recommendations] 개선 권장사항 리스트 (선택)
 */

/**
 * 점수 카드 컴포넌트.
 * @param {ScoreCardProps} props
 * @returns {HTMLElement}
 */
export function createScoreCard(props) {
  const title = String(props?.title ?? '제목 없음')
  const score = Number(props?.score ?? 0)
  const recs = Array.isArray(props?.recommendations) ? props.recommendations : []

  // 헤더: 제목 + 우측 점수 배지
  const header = createEl('div', { className: 'bm-card__header' }, [
    createEl('h3', { className: 'bm-card__title' }, [title]),
    createEl(
      'span',
      {
        className: `bm-card__badge bm-card__badge--${badgeLevel(score)}`,
      },
      [`${Math.round(score)}점`],
    ),
  ])

  // 진행 막대
  const bar = createProgressBar(score, { label: title, showValue: false })

  // 권장사항 목록
  const children = [header, bar]
  if (recs.length > 0) {
    children.push(buildRecommendationList(recs))
  }

  return createEl(
    'article',
    { className: 'bm-card', 'data-score': String(Math.round(score)) },
    children,
  )
}

/**
 * 권장사항 ul 을 만든다. 문자열은 textContent 로만 삽입된다.
 * @param {string[]} recommendations
 * @returns {HTMLElement}
 */
function buildRecommendationList(recommendations) {
  const items = recommendations
    .filter((r) => typeof r === 'string' && r.trim().length > 0)
    .map((r) =>
      createEl('li', { className: 'bm-card__rec-item' }, [String(r)]),
    )

  return createEl('ul', { className: 'bm-card__recs', 'aria-label': '권장사항' }, items)
}

/**
 * 점수 배지 색상 토큰.
 * @param {number} score
 * @returns {'good' | 'fair' | 'poor'}
 */
function badgeLevel(score) {
  if (score >= 80) return 'good'
  if (score >= 60) return 'fair'
  return 'poor'
}
