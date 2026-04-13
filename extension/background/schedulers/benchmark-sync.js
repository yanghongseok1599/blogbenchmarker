// background/schedulers/benchmark-sync.js
// chrome.alarms 기반 주기 동기화 스케줄러.
//
// 동작:
//   - SW boot 시 ensureBenchmarkAlarm() 으로 알람 등록(idempotent).
//   - 3시간마다 발화 → 현재 로그인 사용자 ID 조회 → benchmark.syncBlogPosts 실행.
//   - 미로그인 상태면 조용히 skip.
//
// 설계 메모:
//   - SW 는 idle 시 종료될 수 있어 setInterval 사용 불가. chrome.alarms 가 정답.
//   - manifest.json permissions 에 "alarms" 필수.

import { benchmarkHandler } from '../handlers/benchmark-handler.js'

export const BENCHMARK_ALARM_NAME = 'benchmark.syncAll'
const PERIOD_MINUTES = 180 // 3시간
const FIRST_DELAY_MINUTES = 5 // 부팅 직후가 아니라 5분 뒤 첫 발화 — 부팅 폭주 방지

/**
 * 알람을 등록한다(이미 있으면 그대로 둔다).
 * onInstalled 와 SW 부팅 양쪽에서 호출되어도 안전.
 * @returns {Promise<void>}
 */
export async function ensureBenchmarkAlarm() {
  if (!chrome.alarms?.create) {
    console.warn('[benchmark-sync] chrome.alarms 미지원 — 스케줄러 비활성')
    return
  }

  try {
    const existing = await chrome.alarms.get(BENCHMARK_ALARM_NAME)
    if (existing && existing.periodInMinutes === PERIOD_MINUTES) {
      return // 이미 같은 주기로 등록됨
    }
    chrome.alarms.create(BENCHMARK_ALARM_NAME, {
      delayInMinutes: FIRST_DELAY_MINUTES,
      periodInMinutes: PERIOD_MINUTES,
    })
  } catch (e) {
    console.warn('[benchmark-sync] alarm 등록 실패:', e?.message)
  }
}

/**
 * 알람 발화 핸들러. service-worker.js 의 onAlarm 리스너에서 호출.
 * @param {chrome.alarms.Alarm} alarm
 */
export async function handleBenchmarkAlarm(alarm) {
  if (!alarm || alarm.name !== BENCHMARK_ALARM_NAME) return

  const userId = await getCurrentUserId()
  if (!userId) {
    // 미로그인 상태에서는 sync 를 건너뛴다. 알람은 계속 살아있어 다음 주기에 재시도.
    return
  }

  try {
    const result = await benchmarkHandler.syncBlogPosts({ userId })
    console.info(
      `[benchmark-sync] 동기화 완료: ${result.count}개 블로그`,
      result.results,
    )
  } catch (e) {
    console.warn('[benchmark-sync] sync 실패:', e?.message)
  }
}

/**
 * 알람 중지 (테스트/디버깅용).
 * @returns {Promise<boolean>}
 */
export async function clearBenchmarkAlarm() {
  if (!chrome.alarms?.clear) return false
  return chrome.alarms.clear(BENCHMARK_ALARM_NAME)
}

/**
 * Supabase 세션에서 현재 사용자 ID 추출.
 * 동적 import 로 supabase-client 의존성을 늦게 로드 — alarm 비활성 환경에서 불필요한 초기화 회피.
 * @returns {Promise<string | null>}
 */
async function getCurrentUserId() {
  try {
    const { supabase } = await import('../../lib/supabase-client.js')
    const { data, error } = await supabase.auth.getSession()
    if (error) {
      console.warn('[benchmark-sync] 세션 조회 실패:', error.message)
      return null
    }
    return data?.session?.user?.id ?? null
  } catch (e) {
    console.warn('[benchmark-sync] supabase-client 로드 실패:', e?.message)
    return null
  }
}
