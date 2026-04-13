// extension/sidepanel/tabs/benchmark-stats-section.js
// benchmark 탭 내부의 "통계" 섹션. 평균 글자수/이미지수/점수 + 점수 분포 바차트 + 상위 키워드 워드클라우드.
//
// 계약:
//   - 호출자(benchmark-tab.js)가 benchmark_posts 배열을 이 섹션에 prop 으로 전달한다.
//   - 각 post shape: { title?, seo_score?, word_count?, image_count?, metrics?: { seoScore?, charCount?, imageCount?, topKeywords? } }
//   - metrics JSONB 우선, 없으면 테이블 컬럼 폴백.
//   - benchmark-repo 의 실호출은 호출자 책임(본 섹션은 순수 렌더러). 호출자가 loading/error 상태도 prop 으로 넘긴다.
//
// TODO(repo 연동): Phase 4.1에서 benchmark-repo 가 다음 시그니처를 제공해야 한다:
//   import { benchmarkRepo } from '../../lib/repositories/benchmark-repo.js'
//   const posts = await benchmarkRepo.listPostsForStats({ userId, limit })
// 본 섹션은 repo 의존성을 직접 import 하지 않는다(테스트 용이성 + repo scope 제한).

import { createEl, safeText, clearAndAppend } from '../../lib/dom-safe.js'
import { createBarChart } from '../components/bar-chart.js'
import { createWordCloud } from '../components/word-cloud.js'
import { mean, median, stdev, min, max, distribute } from '../../lib/utils/stats.js'

/** post 한 건에서 SEO 점수를 안전하게 추출. metrics.seoScore 우선. */
function pickScore(post) {
  if (!post) return null
  if (post.metrics && typeof post.metrics.seoScore === 'number') return post.metrics.seoScore
  if (typeof post.seo_score === 'number') return post.seo_score
  return null
}

function pickCharCount(post) {
  if (!post) return null
  if (post.metrics && typeof post.metrics.charCount === 'number') return post.metrics.charCount
  if (typeof post.word_count === 'number') return post.word_count  // 폴백: 워드 카운트
  return null
}

function pickImageCount(post) {
  if (!post) return null
  if (post.metrics && typeof post.metrics.imageCount === 'number') return post.metrics.imageCount
  if (typeof post.image_count === 'number') return post.image_count
  return null
}

function pickKeywords(post) {
  if (!post) return []
  if (post.metrics && Array.isArray(post.metrics.topKeywords)) return post.metrics.topKeywords
  return []
}

/** 상위 키워드 집계: 모든 post 의 topKeywords 를 flatten + count. */
function aggregateKeywords(posts) {
  const counter = new Map()
  for (const p of posts) {
    const kws = pickKeywords(p)
    for (const k of kws) {
      const text = typeof k === 'string' ? k : String(k?.word ?? '')
      if (!text) continue
      counter.set(text, (counter.get(text) || 0) + 1)
    }
  }
  const arr = Array.from(counter.entries()).map(([text, weight]) => ({ text, weight }))
  arr.sort((a, b) => b.weight - a.weight)
  return arr.slice(0, 30)
}

function renderMetricCard(label, value, hint) {
  return createEl('div', { className: 'bm-stats__metric' }, [
    createEl('p', { className: 'bm-stats__metric-label' }, label),
    createEl('p', { className: 'bm-stats__metric-value' }, value),
    hint ? createEl('p', { className: 'bm-stats__metric-hint' }, hint) : null,
  ])
}

function fmt(n, digits = 0) {
  if (!Number.isFinite(n)) return '—'
  if (digits === 0) return Math.round(n).toLocaleString('ko-KR')
  const p = Math.pow(10, digits)
  return (Math.round(n * p) / p).toLocaleString('ko-KR')
}

/**
 * @typedef {{
 *   posts: Array<object>,
 *   loading?: boolean,
 *   error?: string | null,
 *   scoreBuckets?: number  // 기본 5
 * }} BenchmarkStatsOptions
 */

/**
 * 통계 섹션 생성.
 * @param {BenchmarkStatsOptions} options
 * @returns {HTMLElement}
 */
export function createBenchmarkStatsSection(options) {
  const { posts = [], loading = false, error = null, scoreBuckets = 5 } = options || {}

  const root = createEl('section', {
    className: 'bm-stats',
    'aria-label': '벤치마크 통계',
  })

  root.appendChild(
    createEl('header', { className: 'bm-stats__header' }, [
      createEl('h2', { className: 'bm-stats__title' }, '통계'),
      createEl(
        'p',
        { className: 'bm-stats__subtitle' },
        loading
          ? '불러오는 중…'
          : `샘플 ${Array.isArray(posts) ? posts.length : 0}개 기준`,
      ),
    ]),
  )

  if (error) {
    root.appendChild(
      createEl('div', { className: 'bm-stats__error', role: 'alert' }, String(error)),
    )
    return root
  }

  if (loading) {
    root.appendChild(createEl('p', { className: 'bm-stats__loading' }, '통계를 집계 중입니다…'))
    return root
  }

  if (!Array.isArray(posts) || posts.length === 0) {
    root.appendChild(
      createEl('p', { className: 'bm-stats__empty' }, '벤치마크 데이터가 아직 없습니다. 즐겨찾기 블로그를 추가해 주세요.'),
    )
    return root
  }

  const scores = posts.map(pickScore).filter((v) => v != null)
  const chars = posts.map(pickCharCount).filter((v) => v != null)
  const images = posts.map(pickImageCount).filter((v) => v != null)

  // 요약 지표 그리드
  root.appendChild(
    createEl('div', { className: 'bm-stats__metrics' }, [
      renderMetricCard('평균 점수', fmt(mean(scores)), `중앙값 ${fmt(median(scores))} · σ ${fmt(stdev(scores), 1)}`),
      renderMetricCard('평균 글자수', fmt(mean(chars)), `범위 ${fmt(min(chars))} ~ ${fmt(max(chars))}`),
      renderMetricCard('평균 이미지수', fmt(mean(images), 1), `최대 ${fmt(max(images))}개`),
    ]),
  )

  // 점수 분포 바차트
  const buckets = distribute(scores, scoreBuckets)
  const chartData = buckets.map((b) => ({ label: b.label, value: b.count }))
  const chartWrap = createEl('div', { className: 'bm-stats__chart-wrap' }, [
    createEl('h3', { className: 'bm-stats__section-title' }, 'SEO 점수 분포'),
  ])
  chartWrap.appendChild(
    createBarChart({
      data: chartData,
      height: 180,
      width: 320,
      title: '경쟁 블로그 SEO 점수 분포',
    }),
  )
  root.appendChild(chartWrap)

  // 상위 키워드 워드클라우드
  const keywordData = aggregateKeywords(posts)
  if (keywordData.length > 0) {
    const kwWrap = createEl('div', { className: 'bm-stats__kw-wrap' }, [
      createEl('h3', { className: 'bm-stats__section-title' }, '자주 등장한 키워드'),
    ])
    kwWrap.appendChild(createWordCloud({ data: keywordData, maxItems: 30 }))
    root.appendChild(kwWrap)
  }

  return root
}

/**
 * 이미 렌더된 container 에 새 데이터로 교체 렌더.
 * @param {HTMLElement} container
 * @param {BenchmarkStatsOptions} options
 */
export function renderBenchmarkStatsInto(container, options) {
  if (!container) return
  const section = createBenchmarkStatsSection(options)
  clearAndAppend(container, section)
}
