// extension/lib/utils/stats.js
// 평균·중앙값·표준편차 등 기본 통계 유틸. 순수 함수(외부 의존 없음, 부수효과 없음).
// 같은 입력 → 항상 같은 출력. chrome.*, document, Math.random() 미사용.

/** 입력 배열을 숫자로만 필터링. null/NaN/undefined/비숫자 제거. */
function toNumbers(arr) {
  if (!Array.isArray(arr)) return []
  const out = []
  for (const v of arr) {
    const n = typeof v === 'number' ? v : Number(v)
    if (Number.isFinite(n)) out.push(n)
  }
  return out
}

/**
 * 산술 평균. 빈 배열은 0 반환(예외 던지지 않음 — UI 렌더 중 방어).
 * @param {Array<number>} arr
 * @returns {number}
 */
export function mean(arr) {
  const nums = toNumbers(arr)
  if (nums.length === 0) return 0
  let sum = 0
  for (const n of nums) sum += n
  return sum / nums.length
}

/**
 * 중앙값. 빈 배열은 0. 짝수 개수면 가운데 두 값의 평균.
 * @param {Array<number>} arr
 * @returns {number}
 */
export function median(arr) {
  const nums = toNumbers(arr).slice().sort((a, b) => a - b)
  if (nums.length === 0) return 0
  const mid = Math.floor(nums.length / 2)
  return nums.length % 2 === 0 ? (nums[mid - 1] + nums[mid]) / 2 : nums[mid]
}

/**
 * 표본 표준편차(분모 n-1). 표본이 1개 이하면 0.
 * population stdev이 필요한 경우 stdevPopulation() 사용.
 * @param {Array<number>} arr
 * @returns {number}
 */
export function stdev(arr) {
  const nums = toNumbers(arr)
  if (nums.length < 2) return 0
  const m = mean(nums)
  let sumSq = 0
  for (const n of nums) sumSq += (n - m) ** 2
  return Math.sqrt(sumSq / (nums.length - 1))
}

/**
 * 모표준편차(분모 n).
 * @param {Array<number>} arr
 * @returns {number}
 */
export function stdevPopulation(arr) {
  const nums = toNumbers(arr)
  if (nums.length === 0) return 0
  const m = mean(nums)
  let sumSq = 0
  for (const n of nums) sumSq += (n - m) ** 2
  return Math.sqrt(sumSq / nums.length)
}

/** 최솟값. 빈 배열은 0. */
export function min(arr) {
  const nums = toNumbers(arr)
  if (nums.length === 0) return 0
  let m = nums[0]
  for (let i = 1; i < nums.length; i++) if (nums[i] < m) m = nums[i]
  return m
}

/** 최댓값. 빈 배열은 0. */
export function max(arr) {
  const nums = toNumbers(arr)
  if (nums.length === 0) return 0
  let m = nums[0]
  for (let i = 1; i < nums.length; i++) if (nums[i] > m) m = nums[i]
  return m
}

/** 합계. */
export function sum(arr) {
  const nums = toNumbers(arr)
  let s = 0
  for (const n of nums) s += n
  return s
}

/**
 * 분위수(linear interpolation). q ∈ [0, 1].
 * q=0.5 이면 중앙값과 동일.
 * @param {Array<number>} arr
 * @param {number} q
 * @returns {number}
 */
export function quantile(arr, q) {
  const nums = toNumbers(arr).slice().sort((a, b) => a - b)
  if (nums.length === 0) return 0
  if (q <= 0) return nums[0]
  if (q >= 1) return nums[nums.length - 1]
  const pos = (nums.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  if (lo === hi) return nums[lo]
  return nums[lo] + (nums[hi] - nums[lo]) * (pos - lo)
}

/**
 * 숫자 배열을 n 개의 동일 너비 bucket 으로 분포시킨다.
 * 히스토그램/바차트 재료.
 * 반환: [{ rangeStart, rangeEnd, count, label }, ...]
 * @param {Array<number>} arr
 * @param {number} bucketCount 기본 5
 * @returns {Array<{ rangeStart: number, rangeEnd: number, count: number, label: string }>}
 */
export function distribute(arr, bucketCount = 5) {
  const nums = toNumbers(arr)
  if (nums.length === 0 || bucketCount <= 0) return []

  const lo = min(nums)
  const hi = max(nums)

  // 모든 값이 동일할 때: 단일 bucket.
  if (lo === hi) {
    return [{ rangeStart: lo, rangeEnd: hi, count: nums.length, label: `${lo}` }]
  }

  const width = (hi - lo) / bucketCount
  const buckets = Array.from({ length: bucketCount }, (_, i) => ({
    rangeStart: lo + width * i,
    rangeEnd: lo + width * (i + 1),
    count: 0,
    label: '',
  }))
  for (const n of nums) {
    let idx = Math.floor((n - lo) / width)
    if (idx >= bucketCount) idx = bucketCount - 1  // 최댓값 처리
    buckets[idx].count += 1
  }
  for (const b of buckets) {
    b.label = `${Math.round(b.rangeStart)}-${Math.round(b.rangeEnd)}`
  }
  return buckets
}
