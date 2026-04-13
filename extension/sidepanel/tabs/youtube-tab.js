// extension/sidepanel/tabs/youtube-tab.js
// YouTube → 블로그 변환 탭 컨트롤러
//
// 책임:
//   1) 폼 제출 → background 의 'extractYoutube' 핸들러에 메시지 전송
//   2) 로딩/에러/결과 렌더 (innerHTML 금지 — textContent / createElement 만 사용)
//   3) 결과를 chrome.storage.session 에 캐시 → "생성 탭으로 보내기" 버튼이 generate-tab 초기값으로 소비
//
// 참조:
//   - _workspace/edge_function_contracts.md §2 (extract-youtube 응답 shape)
//   - background/handlers/youtube-handler.js
//
// 주의: 모든 결과 텍스트는 사용자 제공(YouTube 자막) 또는 AI 생성.
//       innerHTML 로 바인딩 금지 (XSS 방지). 본 파일은 textContent / createElement 만 사용.

// -----------------------------------------------------------------------------
// DOM helpers (innerHTML 금지)
// -----------------------------------------------------------------------------

function $(id) { return document.getElementById(id) }

function setText(el, text) { if (el) el.textContent = text ?? '' }

function show(el) { if (el) el.classList.remove('hidden') }
function hide(el) { if (el) el.classList.add('hidden') }

/**
 * plain text 를 문단(빈 줄 기준)으로 나눠 <p> / <h2> 요소들로 변환.
 * "## 소제목" 줄은 h2, 나머지는 p. innerHTML 미사용.
 */
function renderArticle(container, text) {
  if (!container) return
  // 자식 제거
  while (container.firstChild) container.removeChild(container.firstChild)
  if (!text) return
  const paragraphs = String(text).split(/\n{2,}/)
  for (const para of paragraphs) {
    const trimmed = para.trim()
    if (!trimmed) continue
    if (/^##\s+/.test(trimmed)) {
      const h2 = document.createElement('h2')
      h2.className = 'yt-section-heading'
      h2.textContent = trimmed.replace(/^##\s+/, '')
      container.appendChild(h2)
    } else {
      const p = document.createElement('p')
      p.className = 'yt-section-para'
      p.textContent = trimmed
      container.appendChild(p)
    }
  }
}

// -----------------------------------------------------------------------------
// 메시지 / 로딩 상태
// -----------------------------------------------------------------------------

function showMessage(type, text) {
  const box = $('yt-message')
  if (!box) return
  box.classList.remove('hidden', 'msg-error', 'msg-success', 'msg-info')
  box.classList.add(type === 'error' ? 'msg-error' : type === 'success' ? 'msg-success' : 'msg-info')
  box.textContent = text
}

function clearMessage() {
  const box = $('yt-message')
  if (!box) return
  box.classList.add('hidden')
  box.textContent = ''
}

function setLoading(isLoading) {
  const btn = $('yt-submit')
  const label = $('yt-submit-label')
  if (btn) btn.disabled = isLoading
  if (label) label.textContent = isLoading ? '변환 중...' : '변환하기'
}

// -----------------------------------------------------------------------------
// 메시지 매핑 (에러 code → 사용자 친화 문구)
// -----------------------------------------------------------------------------

const ERROR_MESSAGES = {
  invalid_input:        '입력값을 확인해 주세요.',
  invalid_url:          '지원하지 않는 YouTube URL 입니다. youtube.com/watch, youtu.be, /shorts/ 형식을 입력하세요.',
  missing_authorization:'로그인이 필요합니다.',
  invalid_token:        '세션이 만료되었습니다. 다시 로그인해 주세요.',
  profile_not_found:    '프로필 정보를 찾지 못했습니다.',
  rate_limit:           '너무 빠르게 요청했습니다. 잠시 후 다시 시도해 주세요.',
  quota_exceeded:       '일일 사용 한도를 초과했습니다. 플랜 업그레이드를 고려해 주세요.',
  no_transcripts:       '이 영상에는 사용 가능한 자막이 없습니다. 다른 영상을 시도해 주세요.',
  video_unavailable:    '비공개/삭제된 영상이거나 접근이 제한됩니다.',
  upstream_error:       'AI/YouTube 서버 오류입니다. 잠시 후 다시 시도해 주세요.',
  network_error:        '네트워크 연결을 확인해 주세요.',
  invalid_response:     '서버 응답을 해석할 수 없습니다.',
  server_misconfig:     '서버 설정 오류입니다. 관리자에게 문의해 주세요.'
}

function friendlyErrorText(error) {
  if (!error) return '알 수 없는 오류가 발생했습니다.'
  const known = ERROR_MESSAGES[error.code]
  return known ?? error.message ?? '알 수 없는 오류가 발생했습니다.'
}

// -----------------------------------------------------------------------------
// 메시지 전송 (background)
// -----------------------------------------------------------------------------

function requestExtract(videoUrl, options) {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(
        { action: 'extractYoutube', videoUrl, options },
        (resp) => {
          if (chrome.runtime.lastError) {
            resolve({
              ok: false,
              error: { code: 'network_error', message: chrome.runtime.lastError.message }
            })
            return
          }
          if (!resp || typeof resp !== 'object' || !('ok' in resp)) {
            resolve({
              ok: false,
              error: { code: 'invalid_response', message: 'background 응답 형식 오류.' }
            })
            return
          }
          resolve(resp)
        }
      )
    } catch {
      resolve({
        ok: false,
        error: { code: 'network_error', message: 'background 와 통신할 수 없습니다.' }
      })
    }
  })
}

// -----------------------------------------------------------------------------
// 결과 렌더 / 상태 캐시
// -----------------------------------------------------------------------------

let lastResult = null  // 생성 탭 전달 대기용 메모리 복사본

function renderResult(data) {
  const { blogPost, source, transcript, quota } = data
  show($('yt-result'))

  setText($('yt-result-title'), blogPost.title)

  // 메타 정보: 채널 · 영상 길이 · 자막 언어 · 쿼터
  const metaParts = []
  if (source.author)      metaParts.push(`채널: ${source.author}`)
  if (source.durationSec) metaParts.push(`영상 길이: ${Math.round(source.durationSec)}초`)
  if (transcript.language) metaParts.push(`자막: ${transcript.language}${transcript.isAutoGenerated ? ' (자동)' : ''}`)
  if (quota) {
    const q = quota.dailyQuota === null
      ? `일일 ${quota.dailyCount}회 사용`
      : `일일 ${quota.dailyCount}/${quota.dailyQuota}회`
    metaParts.push(q)
  }
  setText($('yt-result-meta'), metaParts.join(' · '))

  renderArticle($('yt-result-content'), blogPost.content)

  // Transcript 섹션
  const tMeta = []
  tMeta.push(`길이 ${transcript.charCount.toLocaleString('ko-KR')}자`)
  tMeta.push(`언어 ${transcript.language}`)
  if (transcript.isAutoGenerated) tMeta.push('자동 자막')
  setText($('yt-transcript-meta'), tMeta.join(' · '))
  setText($('yt-transcript-text'), transcript.text)
}

function clearResult() {
  hide($('yt-result'))
  setText($('yt-result-title'), '')
  setText($('yt-result-meta'), '')
  setText($('yt-transcript-meta'), '')
  setText($('yt-transcript-text'), '')
  const c = $('yt-result-content')
  if (c) while (c.firstChild) c.removeChild(c.firstChild)
}

async function copyBlogContent() {
  if (!lastResult?.blogPost?.content) {
    showMessage('error', '복사할 본문이 없습니다.')
    return
  }
  const text = `${lastResult.blogPost.title}\n\n${lastResult.blogPost.content}`
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
    } else {
      // 폴백 — chrome-extension 컨텍스트에선 대부분 clipboard 사용 가능
      throw new Error('clipboard-unavailable')
    }
    showMessage('success', '복사했습니다.')
  } catch {
    showMessage('error', '복사에 실패했습니다. 본문 영역에서 직접 선택해 주세요.')
  }
}

function sendToGenerateTab() {
  if (!lastResult?.blogPost) {
    showMessage('error', '전달할 결과가 없습니다.')
    return
  }
  const seed = {
    source: 'youtube',
    videoId: lastResult.source.videoId,
    topic: lastResult.blogPost.title,
    extraNotes: `원본 영상: ${lastResult.source.url}`,
    learningRefs: [lastResult.blogPost.content.slice(0, 500)],
    createdAt: Date.now()
  }
  try {
    chrome.storage?.session?.set({ __generate_seed: seed })
  } catch {
    // session storage 없는 환경(오래된 Chrome) 은 local 폴백
    try { chrome.storage?.local?.set({ __generate_seed: seed }) } catch { /* ignore */ }
  }
  // 같은 패널 내 탭 전환 이벤트. panel.js 의 탭 스위처가 listen.
  try {
    document.dispatchEvent(new CustomEvent('panel:switch-tab', { detail: { tab: 'generate' } }))
  } catch { /* ignore */ }
  showMessage('success', '생성 탭으로 전송했습니다. 탭을 열어 확인해 주세요.')
}

// -----------------------------------------------------------------------------
// 이벤트 바인딩
// -----------------------------------------------------------------------------

async function handleSubmit(event) {
  event.preventDefault()
  clearMessage()
  clearResult()

  const url = ($('yt-url')?.value ?? '').trim()
  if (!url) {
    showMessage('error', 'YouTube URL 을 입력해 주세요.')
    return
  }
  // 클라이언트 1차 검증 — 서버에서도 엄격 검증
  if (!/^https?:\/\//i.test(url)) {
    showMessage('error', 'http 또는 https 로 시작하는 URL 을 입력해 주세요.')
    return
  }

  const length = $('yt-length')?.value ?? 'normal'
  const targetLanguage = $('yt-language')?.value ?? 'ko'

  setLoading(true)
  try {
    const resp = await requestExtract(url, { length, targetLanguage })
    if (!resp.ok) {
      showMessage('error', friendlyErrorText(resp.error))
      return
    }
    lastResult = resp.data
    renderResult(resp.data)
  } catch (err) {
    console.warn('[youtube-tab] unexpected error', err?.message)
    showMessage('error', '변환 중 알 수 없는 오류가 발생했습니다.')
  } finally {
    setLoading(false)
  }
}

export function init() {
  const form = $('yt-form')
  if (form) form.addEventListener('submit', handleSubmit)

  const copyBtn = $('yt-btn-copy')
  if (copyBtn) copyBtn.addEventListener('click', copyBlogContent)

  const sendBtn = $('yt-btn-to-generate')
  if (sendBtn) sendBtn.addEventListener('click', sendToGenerateTab)
}

// panel.js 가 본 탭 섹션을 주입한 후 init 호출.
// fallback: 스크립트가 직접 로드된 경우에도 DOMContentLoaded 이후 init.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true })
}

// 테스트/재사용 목적 export
export {
  handleSubmit,
  renderResult,
  clearResult,
  friendlyErrorText,
  ERROR_MESSAGES
}
