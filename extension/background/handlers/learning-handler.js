// background/handlers/learning-handler.js
// Phase 7: 학습 데이터 저장 게이트.
//
// content script(analyzer.js) 가 dispatch 하는 'learning.save' 액션을 처리한다.
// **저작권 안전:** ownContent === true 가 아니면 거부한다 — 타인 블로그 본문이
// learning_data 에 들어가는 경로를 차단.

import { saveLearning } from '../../lib/repositories/learning-repo.js'
import { getSession } from '../../lib/supabase-client.js'

export const learningHandler = {
  /**
   * @param {{
   *   ownContent: boolean,
   *   title: string,
   *   content: string,
   *   keywords?: string[],
   *   meta?: Object
   * }} payload
   */
  async save(payload) {
    if (!payload || typeof payload !== 'object') {
      throw new Error('learning-handler: payload 가 필요합니다.')
    }
    if (payload.ownContent !== true) {
      // 저작권 안전 게이트 — 호출자가 명시적으로 ownContent: true 를 보내지 않으면 저장하지 않는다.
      throw new Error('본인 글만 학습에 추가할 수 있습니다.')
    }

    const session = await getSession()
    const userId = session?.user?.id
    if (!userId) throw new Error('로그인이 필요합니다.')

    const row = await saveLearning(userId, {
      title: payload.title,
      content: payload.content,
      keywords: payload.keywords,
      meta: { ...(payload.meta || {}), source: 'analyzer:auto' },
    })
    return { id: row.id, createdAt: row.created_at }
  },
}
