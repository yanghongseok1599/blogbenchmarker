// extension/content/sidebar-injector.js
// 네이버 블로그 글쓰기 페이지에서만 실행되어, 우측에 고정된 사이드바 iframe을 주입한다.
//
// 격리 전략:
//   (1) host page DOM에 <div> 하나만 추가(`#bbm-root`) — 다른 DOM은 건드리지 않는다.
//   (2) 그 <div>에 Shadow DOM(closed)을 붙여 host page CSS가 새어 들어오지 못하게 한다.
//   (3) Shadow Root 안에 <iframe src="chrome-extension://.../content/sidebar.html">을 두어
//       JS 실행 컨텍스트까지 분리한다. 사이드바 로직은 iframe 내부에서 extension 권한으로 동작.
//
// Content Script 제약:
//   - ES module import 선언은 사용 불가(classic script). 대신 chrome.runtime.getURL 과
//     dynamic import 로 lib/dom-safe.js 를 로드한다.
//   - lib/dom-safe.js, content/sidebar.html, content/content.css 는 manifest 의
//     `web_accessible_resources` 에 `https://*.blog.naver.com/*` 화이트리스트로 등록 필요.
//     TODO(manifest): 기획자/백엔드 에이전트가 manifest.json 에 WAR 블록 추가.

(async () => {
  // 이미 주입된 경우 중복 생성 차단.
  if (document.getElementById('bbm-root')) return

  // URL 패턴: 글쓰기 관련 경로만 대상.
  // SmartEditor 진입 경로는 다양하므로 느슨한 휴리스틱 사용 — match 자체는 manifest가 제한.
  const href = location.href
  const isWritePage =
    /PostWriteForm\.naver/i.test(href) ||
    /GoBlogWrite\.naver/i.test(href) ||
    /\/post\/write/i.test(href) ||
    /editor/i.test(href)

  if (!isWritePage) return

  // dom-safe 동적 로드. 실패 시 사이드바 미주입으로 안전하게 폴백.
  let domSafe
  try {
    domSafe = await import(chrome.runtime.getURL('lib/dom-safe.js'))
  } catch (err) {
    console.warn('[bbm/sidebar-injector] dom-safe load failed')
    return
  }
  const { createEl } = domSafe

  // 1) host page에 container 엘리먼트 생성(속성만 지정, 텍스트 없음).
  const root = createEl('div', {
    id: 'bbm-root',
    'data-bbm-version': '0.1.0',
    'aria-hidden': 'false',
  })
  document.documentElement.appendChild(root)

  // 2) Shadow DOM(closed) 부착 — host page JS에서 내부 DOM 을 조회하지 못하게 한다.
  const shadow = root.attachShadow({ mode: 'closed' })

  // 3) Shadow Root 안에 <link rel="stylesheet" href="chrome-extension://.../content/content.css">
  const styleLink = createEl('link', {
    rel: 'stylesheet',
    href: chrome.runtime.getURL('content/content.css'),
  })
  shadow.appendChild(styleLink)

  // 4) 사이드바 쉘(토글 버튼 + iframe).
  const frame = createEl('iframe', {
    id: 'bbm-sidebar-frame',
    title: 'BLOG BenchMarker 사이드바',
    src: chrome.runtime.getURL('content/sidebar.html'),
    // 샌드박스: iframe 자체는 extension origin이므로 chrome.* API 사용 가능해야 함 → 제한 생략.
    // referrerpolicy: host 페이지 referer 를 Supabase 로 보내지 않는다.
    referrerpolicy: 'no-referrer',
  })

  const toggleBtn = createEl(
    'button',
    {
      id: 'bbm-sidebar-toggle',
      type: 'button',
      'aria-label': 'BLOG BenchMarker 토글',
      title: 'BLOG BenchMarker 토글 (Alt+B)',
      onClick: () => {
        const collapsed = container.getAttribute('data-collapsed') === 'true'
        container.setAttribute('data-collapsed', collapsed ? 'false' : 'true')
      },
    },
    'B',
  )

  const container = createEl(
    'aside',
    {
      id: 'bbm-sidebar',
      role: 'complementary',
      'aria-label': 'BLOG BenchMarker 사이드바',
      'data-collapsed': 'false',
    },
    [toggleBtn, frame],
  )

  shadow.appendChild(container)

  // 5) 단축키 Alt+B 로 토글.
  window.addEventListener('keydown', (e) => {
    if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && (e.key === 'b' || e.key === 'B')) {
      const collapsed = container.getAttribute('data-collapsed') === 'true'
      container.setAttribute('data-collapsed', collapsed ? 'false' : 'true')
    }
  })

  // 6) analyzer-bridge 가 사용하는 frame ref 를 window 에 노출하지 않는다.
  //    대신 CustomEvent 로 bridge 에 주입한다(shadow 경계를 넘는 Event 는 composed=true 필요).
  const readyEvent = new CustomEvent('bbm:sidebar-ready', {
    detail: { frame },
    bubbles: true,
    composed: true,
  })
  root.dispatchEvent(readyEvent)

  // 7) 탭/페이지 언로드 시 정리 (MV3에서 content script는 자동 GC 되지만 명시적으로).
  window.addEventListener('beforeunload', () => {
    try {
      root.remove()
    } catch (_) { /* noop */ }
  }, { once: true })
})()
