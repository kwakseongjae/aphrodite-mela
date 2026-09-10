/* Aphrodite landing — language toggle + latest-release download link. No build step. */
(function () {
  var REPO = 'kwakseongjae/aphrodite-mela';
  // Pinned floor: a real, signed DMG that downloads even if the GitHub API is rate-limited or a newer
  // release is still a draft (GitHub's /releases/latest skips drafts). latestRelease() upgrades this.
  var VERSION = '0.1.5';
  var DL = 'https://github.com/' + REPO + '/releases/download/v' + VERSION + '/';
  var PIN_ARM = DL + 'Aphrodite_' + VERSION + '_aarch64.dmg';
  var PIN_INTEL = DL + 'Aphrodite_' + VERSION + '_x64.dmg';
  var GATEKEEPER_NOTE = false; // releases are Developer ID signed + notarized (v0.1.0+); set true for unsigned test builds

  var copy = {
    en: {
      'skip': 'Skip to content',
      'nav.how': 'How it works', 'nav.download': 'Download',
      'hero.eyebrow': 'A little structure. A lot of possibility.',
      'hero.h1': 'Shape before you build.',
      'hero.em': 'Decide the direction. Let the agent do the building.',
      'hero.lede': 'Aphrodite is a local-first macOS workbench where you settle the look of a screen in minutes — with real components, real tokens and a design contract your coding agent can follow — before a thirty-minute implementation starts.',
      'hero.cta': 'Download for macOS', 'hero.ctaSub': 'Apple Silicon & Intel · free · no account',
      'hero.ghost': 'View on GitHub', 'hero.hand': 'make something yours.',
      'hero.caption': 'Your muse, with a point of view.',
      'shot.caption': 'The Space. Every page is a frame on one open canvas — desktop, mobile, or a custom width — with real components and project tokens.',
      'screens.eyebrow': 'Around the studio', 'screens.h2': 'One canvas. Three ways to work on it.',
      'screens.s1.h': 'Your projects, on this Mac', 'screens.s1.p': 'Home keeps every project as a card with a live preview. Favourites, archive, right-click menus, and a brand kit for the studio itself. Nothing leaves the machine.',
      'screens.s2.h': 'Hand the screen to an agent', 'screens.s2.p': 'Agent mode delegates the same UI to a computer-use agent with a scope you choose. Every edit is receipted, approval stays yours, and you can take control back at any time.',
      'screens.s3.h': 'Read-only handoff for developers', 'screens.s3.p': 'Dev mode turns the inspector into a handoff: component identity, tokens as CSS, the rendered markup, page HTML, a prompt for a coding agent. Copy what you need.',
      'story.h2': 'Everyone is building faster. Direction still gets lost.',
      'story.p1': 'A coding agent can ship a page in half an hour. It can also ship the wrong page in half an hour — wrong layout, wrong tone, a hero nobody asked for — and you find out at the end.',
      'story.p2': 'Prompts are a poor place to keep a design decision. Screenshots drift. Figma is a different world from the code.',
      'story.p3': 'Deciding should start the build — not another round of rework.',
      'how.eyebrow': 'How it works', 'how.h2': 'Three steps. One decision.',
      'how.s1.h': 'Set the direction',
      'how.s1.p': 'Start from a brief, or drop in a reference. On macOS, Apple Vision reads the copy and layout on-device; local pixel analysis proposes colors and image regions.',
      'how.s2.h': 'Make it tangible',
      'how.s2.p': 'Assemble with real components, not mockups, on one open canvas where every page is a frame. Spread three directions side by side as proposal frames, swap design systems, edit copy and images, keep desktop and mobile in view. Every step is undoable.',
      'how.s3.h': 'Make it real',
      'how.s3.p': 'Approve the direction and export a contract: PROMPT.md, DESIGN.md, tokens.json, the rendered HTML and a project file — everything Codex or Claude Code needs to build exactly what you approved.',
      'feat.eyebrow': "What's inside", 'feat.h2': 'Quiet tools for a loud step.',
      'feat.f1.h': 'Local-first', 'feat.f1.p': 'Projects live on your Mac. No account, no cloud, no generation credits. Export files whenever you want a backup.',
      'feat.f2.h': 'Built for agents, too', 'feat.f2.p': 'Real DOM, named buttons, stable data-actions and keyboard paths. Agent mode hands the screen to a computer-use agent with a scope and receipts; Dev mode is a read-only handoff.',
      'feat.f3.h': 'Design systems as tokens', 'feat.f3.p': 'Atelier, Karrot-inspired, Toss-inspired, Mono. Change one, every page follows. Pull explicit colors from your own DESIGN.md.',
      'feat.f4.h': 'Reference, read on-device', 'feat.f4.p': 'OCR with Apple Vision, color and region candidates from pixels. Nothing leaves your machine.',
      'feat.f5.h': 'Three directions, one decision', 'feat.f5.p': 'Honest layout variants of the same components — not generated guesses. Pick one, keep the rest.',
      'feat.f6.h': 'Approval that means something', 'feat.f6.p': 'Any change to text, images, system or structure clears the approval. What you export is what you saw.',
      'dl.h2': 'Aphrodite for macOS', 'dl.os': 'macOS 13 or later',
      'dl.cta': 'Download for Apple Silicon', 'dl.ctaSub': 'Free · open source · no sign-up',
      'dl.note': "First launch: if macOS says the app can't be checked for malicious software, right-click the app and choose Open once.",
      'dl.all': 'All releases', 'dl.source': 'Build from source', 'dl.intel': 'Intel Mac? Download the x64 build',
      'foot.mark': 'Shape before you build.', 'foot.notices': 'Third-party notices',
      'foot.credit': 'Made with intention. A little instinct, too.'
    },
    ko: {
      'skip': '본문으로 건너뛰기',
      'nav.how': '작동 방식', 'nav.download': '다운로드',
      'hero.eyebrow': '가벼운 구조. 무한한 가능성.',
      'hero.h1': '만들기 전에, 방향부터.',
      'hero.em': '방향은 당신이 정하고, 조립은 에이전트가 합니다.',
      'hero.lede': 'Aphrodite는 코딩 에이전트가 30분짜리 구현을 시작하기 전에, 실제 컴포넌트와 토큰으로 화면의 방향을 몇 분 안에 확정하는 로컬 우선 macOS 작업대입니다. 확정한 방향은 에이전트가 따를 수 있는 디자인 계약으로 내보냅니다.',
      'hero.cta': 'macOS용 다운로드', 'hero.ctaSub': 'Apple Silicon & Intel · 무료 · 계정 불필요',
      'hero.ghost': 'GitHub에서 보기', 'hero.hand': '당신다운 무언가를.',
      'hero.caption': '당신만의 관점을 가진 뮤즈.',
      'shot.caption': '스페이스. 모든 페이지가 하나의 열린 캔버스 위 프레임입니다. 데스크톱·모바일·사용자 지정 너비, 실제 컴포넌트와 프로젝트 토큰.',
      'screens.eyebrow': '스튜디오 둘러보기', 'screens.h2': '하나의 캔버스. 세 가지 일하는 방식.',
      'screens.s1.h': '내 Mac 안의 프로젝트', 'screens.s1.p': '홈은 모든 프로젝트를 실시간 미리보기 카드로 보여줍니다. 즐겨찾기·보관함·우클릭 메뉴, 그리고 스튜디오의 브랜드 리소스까지. 어떤 것도 기기 밖으로 나가지 않습니다.',
      'screens.s2.h': '화면을 에이전트에게 맡기기', 'screens.s2.p': '에이전트 모드는 같은 UI를 컴퓨터 유즈 에이전트에게 위임합니다. 범위는 당신이 정하고, 모든 편집은 영수증으로 남으며, 승인은 사람의 몫입니다. 언제든 제어를 되찾을 수 있습니다.',
      'screens.s3.h': '개발자를 위한 읽기 전용 핸드오프', 'screens.s3.p': '개발 모드는 인스펙터를 핸드오프로 바꿉니다. 컴포넌트 식별자, CSS 토큰, 렌더된 마크업, 페이지 HTML, 코딩 에이전트용 프롬프트. 필요한 것만 복사하세요.',
      'story.h2': '모두가 더 빨리 만들지만, 방향은 여전히 새어 나갑니다.',
      'story.p1': '코딩 에이전트는 30분이면 페이지 하나를 만듭니다. 잘못된 레이아웃, 다른 톤, 아무도 요청하지 않은 히어로도 30분이면 만들어지죠. 문제는 그걸 마지막에야 알게 된다는 것.',
      'story.p2': '프롬프트는 디자인 결정을 담기엔 부실한 그릇입니다. 스크린샷은 흘러가고, Figma는 코드와 다른 세계에 있죠.',
      'story.p3': '결정이 곧 구현의 시작이어야 합니다. 또 한 번의 재작업이 아니라.',
      'how.eyebrow': '작동 방식', 'how.h2': '세 단계, 하나의 결정.',
      'how.s1.h': '방향 잡기',
      'how.s1.p': '브리프로 시작하거나 레퍼런스 이미지를 넣으세요. macOS에서는 Apple Vision이 기기 안에서 문구와 배치를 읽고, 로컬 픽셀 분석이 색상과 이미지 영역을 제안합니다.',
      'how.s2.h': '손에 잡히게',
      'how.s2.p': '모든 페이지가 프레임인 하나의 열린 캔버스에서, 목업이 아닌 실제 컴포넌트로 조립합니다. 세 가지 방향을 제안 프레임으로 나란히 펼치고, 디자인 시스템을 바꾸고, 문구와 이미지를 고치고, 데스크톱과 모바일을 한눈에 보세요. 모든 단계는 되돌릴 수 있습니다.',
      'how.s3.h': '실제로 만들기',
      'how.s3.p': '방향을 승인하고 계약을 내보내세요. PROMPT.md, DESIGN.md, tokens.json, 렌더된 HTML, 프로젝트 파일까지. Codex나 Claude Code가 승인한 그대로 구현하는 데 필요한 전부입니다.',
      'feat.eyebrow': '무엇이 들어 있나', 'feat.h2': '요란한 단계를 위한, 조용한 도구.',
      'feat.f1.h': '로컬 우선', 'feat.f1.p': '프로젝트는 내 Mac에만 있습니다. 계정도, 클라우드도, 생성 크레딧도 없습니다. 백업이 필요하면 파일로 내보내세요.',
      'feat.f2.h': '에이전트도 쓰는 작업대', 'feat.f2.p': '실제 DOM, 이름 있는 버튼, 안정적인 data-action과 키보드 경로. 에이전트 모드는 범위와 영수증을 붙여 화면을 컴퓨터 유즈 에이전트에게 맡기고, 개발 모드는 읽기 전용 핸드오프가 됩니다.',
      'feat.f3.h': '토큰으로 다루는 디자인 시스템', 'feat.f3.p': 'Atelier, Karrot·Toss 영감 프리셋, Mono. 하나를 바꾸면 모든 페이지가 따라옵니다. 내 DESIGN.md의 색상을 직접 가져올 수도 있습니다.',
      'feat.f4.h': '기기 안에서 읽는 레퍼런스', 'feat.f4.p': 'Apple Vision OCR, 픽셀 기반 색상·영역 후보. 어떤 것도 Mac 밖으로 나가지 않습니다.',
      'feat.f5.h': '세 방향, 하나의 결정', 'feat.f5.p': '같은 컴포넌트의 정직한 배치 변형 세 가지. 생성 모델의 추측이 아닙니다. 하나를 고르고 나머지는 남겨두세요.',
      'feat.f6.h': '의미 있는 승인', 'feat.f6.p': '텍스트·이미지·시스템·구조가 바뀌면 승인이 해제됩니다. 내보낸 것은 당신이 본 그대로입니다.',
      'dl.h2': 'macOS용 Aphrodite', 'dl.os': 'macOS 13 이상',
      'dl.cta': 'Apple Silicon용 다운로드', 'dl.ctaSub': '무료 · 오픈소스 · 가입 없음',
      'dl.note': '처음 실행할 때 macOS가 "악성 소프트웨어 검사를 할 수 없다"고 하면, 앱을 우클릭한 뒤 열기를 한 번 눌러주세요.',
      'dl.all': '모든 릴리스', 'dl.source': '소스에서 빌드', 'dl.intel': 'Intel Mac이라면 x64 빌드 다운로드',
      'foot.mark': '만들기 전에, 방향부터.', 'foot.notices': '서드파티 고지',
      'foot.credit': '의도 있게. 약간의 직감도 함께.'
    }
  };

  var lang = 'en';
  try {
    var saved = localStorage.getItem('aphrodite.lang');
    if (saved === 'ko' || saved === 'en') lang = saved;
    else if ((navigator.language || '').toLowerCase().indexOf('ko') === 0) lang = 'ko';
  } catch (e) {}

  function apply(l) {
    lang = l;
    var dict = copy[l];
    document.documentElement.lang = l;
    var nodes = document.querySelectorAll('[data-i18n]');
    for (var i = 0; i < nodes.length; i++) {
      var key = nodes[i].getAttribute('data-i18n');
      if (dict[key] != null) nodes[i].textContent = dict[key];
    }
    var imgs = document.querySelectorAll('img[data-src-' + l + ']');
    for (var k = 0; k < imgs.length; k++) { var src = imgs[k].getAttribute('data-src-' + l); if (src && imgs[k].getAttribute('src') !== src) imgs[k].setAttribute('src', src); }
    var toggle = document.querySelector('[data-lang-toggle]');
    if (toggle) toggle.textContent = l === 'en' ? '한국어' : 'EN';
    document.title = l === 'ko' ? 'Aphrodite — 만들기 전에, 방향부터.' : 'Aphrodite — Shape before you build.';
    try { localStorage.setItem('aphrodite.lang', l); } catch (e) {}
  }

  function wireLinks() {
    var base = 'https://github.com/' + REPO;
    var set = function (sel, href) { var els = document.querySelectorAll(sel); for (var i = 0; i < els.length; i++) els[i].href = href; };
    set('[data-repo-link]', base);
    set('[data-releases-link]', base + '/releases');
    set('[data-readme-link]', base + '#readme');
    set('[data-notices-link]', base + '/blob/main/THIRD_PARTY_NOTICES.md');
    set('[data-download]', PIN_ARM);
    var intel = document.querySelector('[data-download-intel]');
    if (intel) { intel.href = PIN_INTEL; intel.hidden = false; }
    var v = document.querySelector('[data-version]');
    if (v) v.textContent = 'v' + VERSION;
    var note = document.querySelector('[data-gatekeeper]');
    if (note && !GATEKEEPER_NOTE) note.hidden = true;
  }

  function cmpVersion(a, b) {
    var pa = String(a).split('.'), pb = String(b).split('.');
    for (var i = 0; i < 3; i++) { var d = (parseInt(pa[i], 10) || 0) - (parseInt(pb[i], 10) || 0); if (d) return d < 0 ? -1 : 1; }
    return 0;
  }

  function latestRelease() {
    if (!window.fetch) return;
    fetch('https://api.github.com/repos/' + REPO + '/releases/latest', { headers: { Accept: 'application/vnd.github+json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (rel) {
        if (!rel) return;
        // Never let a stale "latest" (older than the pinned floor) downgrade the button.
        if (cmpVersion((rel.tag_name || '').replace(/^v/, ''), VERSION) < 0) return;
        var assets = rel.assets || [];
        var arm = null, intel = null;
        for (var i = 0; i < assets.length; i++) {
          var n = assets[i].name || '';
          if (!/\.dmg$/i.test(n)) continue;
          if (/aarch64|arm64/i.test(n)) arm = assets[i];
          else if (/x64|x86_64|intel/i.test(n)) intel = assets[i];
        }
        var v = document.querySelector('[data-version]');
        if (v && rel.tag_name) v.textContent = rel.tag_name.replace(/^v/, 'v');
        var primary = arm || intel;
        if (primary) {
          var links = document.querySelectorAll('[data-download]');
          for (var j = 0; j < links.length; j++) links[j].href = primary.browser_download_url;
        }
        var intelLink = document.querySelector('[data-download-intel]');
        if (intelLink) { if (intel) { intelLink.href = intel.browser_download_url; intelLink.hidden = false; } else intelLink.hidden = true; }
      })
      .catch(function () {});
  }

  document.addEventListener('DOMContentLoaded', function () {
    wireLinks();
    apply(lang);
    var toggle = document.querySelector('[data-lang-toggle]');
    if (toggle) toggle.addEventListener('click', function () { apply(lang === 'en' ? 'ko' : 'en'); });
    var y = document.querySelector('[data-year]');
    if (y) y.textContent = String(new Date().getFullYear());
    latestRelease();
  });
})();
