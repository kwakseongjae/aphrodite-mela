/* Aphrodite internal preview download page. Reads the release for one tag from GitHub's public API; no build step. */
(function () {
  var REPO = 'kwakseongjae/aphrodite-mela';
  // The preview version: the one place to change when a new preview is cut. The tag is v + this.
  var VERSION = '0.3.0-preview.1';

  var BASE = 'https://github.com/' + REPO;
  var DL = BASE + '/releases/download/v' + VERSION + '/';
  var BUILT = {
    arm: DL + 'Aphrodite_' + VERSION + '_aarch64.dmg',
    intel: DL + 'Aphrodite_' + VERSION + '_x64.dmg'
  };

  // Every word the page shows, by key and then by language. The HTML already carries the Korean, so the page reads whole without this script.
  var COPY = {
    'meta.title': { ko: 'Aphrodite 미리보기판 내려받기', en: 'Download the Aphrodite preview' },
    'meta.desc': { ko: '쓰던 AI는 그대로, 작업물은 한곳에. Claude와 ChatGPT 구독은 쓰던 그대로 두세요. 여러 프로젝트의 작업물이 Aphrodite 보드 한곳에 모여요.', en: 'Keep your AI. Keep the work in one place. Stay on the Claude and ChatGPT plans you already have. The work from every project gathers on one Aphrodite board.' },
    'skip': { ko: '본문으로 건너뛰기', en: 'Skip to content' },
    'nav.home': { ko: 'Aphrodite 미리보기판', en: 'Aphrodite preview' },
    'nav.site': { ko: '사이트', en: 'Site' },
    'nav.get': { ko: '내려받기', en: 'Download' },
    'nav.connect': { ko: '연결', en: 'Connect' },
    'nav.not': { ko: '아직 안 되는 것', en: 'Not yet' },
    'nav.release': { ko: '정식판', en: 'Stable' },
    'nav.lang': { ko: '언어 바꾸기', en: 'Switch language' },
    'hero.eyebrow': { ko: 'Mac용 · 내부 미리보기', en: 'For Mac · Internal preview' },
    'hero.h1a': { ko: '쓰던 AI는 그대로,', en: 'Keep your AI.' },
    'hero.h1b': { ko: '작업물은', en: 'Keep the work in' },
    'hero.gold': { ko: '한곳에.', en: 'one place.' },
    'hero.sub1': { ko: 'Claude와 ChatGPT 구독은 쓰던 그대로 두세요.', en: 'Stay on the Claude and ChatGPT plans you already have.' },
    'hero.sub2': { ko: '여러 프로젝트의 작업물이 Aphrodite 보드 한곳에 모여요.', en: 'The work from every project gathers on one Aphrodite board.' },
    'dl.cta': { ko: 'Mac용 내려받기', en: 'Download for Mac' },
    'dl.small': { ko: '무료 · 계정 없음 · macOS 13 이상', en: 'Free · No account · macOS 13 or later' },
    'dl.more': { ko: '다른 칩: Intel Mac', en: 'Other chip: Intel Mac' },
    'dl.intel': { ko: 'Intel Mac용 내려받기', en: 'Download for Intel Mac' },
    'dl.intelSub': { ko: '2020년까지 나온 Intel Mac', en: 'Intel Macs, up to 2020' },
    'state.checking': { ko: '릴리스를 확인하고 있어요.', en: 'Checking the release…' },
    'state.soon': { ko: '준비 중', en: 'coming soon' },
    'state.absent': { ko: '이 판은 아직 올라오지 않았어요. 올라오면 이 자리에서 바로 받을 수 있어요.', en: 'This preview isn’t up yet. When it is, it downloads right here.' },
    'state.blockedPre': { ko: '릴리스를 확인하지 못했어요. 받아지지 않으면 ', en: 'Couldn’t check the release. If the download doesn’t start, use the ' },
    'state.blockedLink': { ko: '릴리스 페이지', en: 'releases page' },
    'state.blockedPost': { ko: '에서 받으세요.', en: '.' },
    'state.missing': { ko: '이 판에는 {files} 파일이 아직 없어요.', en: 'This preview has no {files} file yet.' },
    'state.arm': { ko: 'Apple Silicon용', en: 'Apple Silicon' },
    'state.intel': { ko: 'Intel Mac용', en: 'Intel Mac' },
    'state.and': { ko: ', ', en: ' or ' },
    'state.notes': { ko: '이 판에서 달라진 것', en: 'What changed in this preview' },
    'shot.alt': { ko: 'Aphrodite 보드. 왼쪽 목록에 HTML 페이지 둘과 그림, 영상이 있고, 보드에는 그 넷이 나란히 놓여 있다.', en: 'The Aphrodite board: two HTML pages, a picture and a video in the list on the left, and the four of them side by side on the board.' },
    'why.h2': { ko: '채팅창마다 흩어진 작업물, 이제 찾아다니지 마세요.', en: 'Stop digging through chats for the work.' },
    'why.p1': { ko: '브리핑은 지난주 대화에, 랜딩 시안은 다른 프로젝트에, 보고서는 다른 계정에 있죠. Aphrodite는 AI와 만든 것을 프로젝트별 보드에 모아 둬요. 열면 그려진 모습 그대로 나란히 보여요.', en: 'The briefing is in last week\'s conversation, the landing draft is in another project, the report is under another account. Aphrodite keeps what you make with AI on one board per project, drawn exactly as it runs.' },
    'why.p2': { ko: '프로젝트마다 쌓이는 디자인 시안과 문서, 아티팩트로 만들던 페이지를 Aphrodite 보드 한곳에 모아서 보고, 고치고, 건넬 수 있어요.', en: 'The designs, documents and pages your agents make across every project gather on one Aphrodite board, where you can review them, revise them and hand them over.' },
    'feats.label': { ko: '기능', en: 'Features' },
    'more.label': { ko: '기능 셋 더', en: 'Three more' },
    'f1.h': { ko: '쓰던 구독 그대로 써요.', en: 'Use the plans you already pay for.' },
    'f1.p': { ko: '새 요금제도, API 키도 필요 없어요. 이미 쓰고 있는 Claude Code나 Codex를 연결하면, 그 에이전트가 보드에 페이지를 만들고 고쳐요. Aphrodite는 무료예요.', en: 'No new subscription, no API key. Connect the Claude Code or Codex you already use and it builds and edits pages on your board. Aphrodite is free.' },
    'f1.alt': { ko: '에이전트가 연결된 보드. 위쪽 띠에 연결된 에이전트와 변경 수가 보인다.', en: 'A board with an agent connected: the strip on top names the agent and counts its changes.' },
    'f2.h': { ko: '프로젝트마다 보드 하나에 모여요.', en: 'One board per project.' },
    'f2.p': { ko: '브리핑, 보고서, 디자인 시안, 스크린샷, 영상까지 한 보드에 놓여요. 페이지를 누르면 실제로 동작하는 모습 그대로 크게 볼 수 있어요.', en: 'Briefings, reports, design drafts, screenshots and video sit side by side. Open a page to see it running at full size.' },
    'f2.alt': { ko: '보드의 브리핑 페이지 하나를 크게 연 모습. 그래프와 표가 그대로 그려져 있다.', en: 'One briefing page from the board opened full size, its chart and table drawn as they are.' },
    'f3.h': { ko: '작업물은 내 Mac에 남아요.', en: 'The work stays on your Mac.' },
    'f3.p': { ko: '보드는 이 Mac의 파일이에요. AI 계정을 바꿔도, 대화가 사라져도 그대로 있어요.', en: 'A board is a file on this Mac. Switch AI accounts or lose a conversation, and it is still here.' },
    'f3.alt': { ko: '홈. 이 Mac에 저장된 보드가 카드로 놓여 있다.', en: 'Home: the boards saved on this Mac, as cards.' },
    'f4.h': { ko: '누가, 왜 고쳤는지 남아요.', en: 'Every change says who and why.' },
    'f4.p': { ko: '에이전트가 고친 곳에는 이유가 함께 기록돼요. 마음에 들지 않으면 ⌘Z 한 번으로 되돌릴 수 있어요.', en: 'An agent\'s edit carries its reason, and one ⌘Z takes it back.' },
    'f5.h': { ko: '파일 하나로 건네요.', en: 'Hand it over as one file.' },
    'f5.p': { ko: '보드는 .aph 파일 하나로, 페이지는 HTML 파일 하나로 내보내요. HTML 파일은 브라우저에서 바로 열리고, .aph 파일은 Aphrodite에서 열려요.', en: 'A board exports as one .aph file, a page as one HTML file. The HTML file opens in any browser; the .aph file opens in Aphrodite.' },
    'f6.h': { ko: '결정은 사람이 해요.', en: 'People decide.' },
    'f6.p': { ko: '방향을 승인하는 일은 사람만 할 수 있어요. 에이전트가 만들고, 무엇을 고를지는 사람이 정해요.', en: 'Only a person can approve a direction. The agent makes, and a person decides what to keep.' },
    'start.h2': { ko: '쓰던 에이전트를 연결하면, 보드에 그리기 시작해요.', en: 'Connect the agent you already use, and it starts drawing on your board.' },
    's1.h': { ko: 'Aphrodite를 설치하고 열어 두세요.', en: 'Install Aphrodite and keep it open.' },
    's1.p': { ko: '내려받은 파일을 열어 Applications 폴더에 넣으면 끝이에요.', en: 'Open the file you downloaded and put Aphrodite in your Applications folder. That\'s all.' },
    'get.armSub': { ko: 'M1 이후 Mac', en: 'M1 and later' },
    'get.btn': { ko: '내려받기', en: 'Download' },
    'get.btnArm': { ko: 'Apple Silicon용 내려받기', en: 'Download for Apple Silicon' },
    's2.h': { ko: '쓰던 에이전트를 연결하세요.', en: 'Connect the agent you already use.' },
    's2.p': { ko: '지금은 저장소를 받은 다음 터미널에 명령 한 줄을 넣어서 연결해요(git과 Node가 필요해요). Claude Code와 Codex 가운데 쓰는 쪽만 하면 돼요. 체크 하나로 연결하는 방법은 다음 판에 들어가요.', en: 'For now, you clone the repository and add one line in the terminal (you need git and Node). Do it only for the one you use, Claude Code or Codex. Connecting with a single checkbox comes in the next preview.' },
    'cmd.repo': { ko: '저장소', en: 'Repository' },
    'cmd.pathPre': { ko: '', en: 'Replace ' },
    'cmd.pathPost': { ko: '는 받은 저장소 폴더의 경로로 바꿔요.', en: ' with the folder you cloned.' },
    's3.h': { ko: '평소처럼 부탁하세요.', en: 'Ask the way you always do.' },
    's3.p': { ko: '"이번 주 진행 상황을 브리핑 페이지로 만들어서 Aphrodite 보드에 올려 줘." 처음 한 번, Aphrodite가 편집을 허용할지 물어요.', en: '"Turn this week\'s progress into a briefing page and put it on the Aphrodite board." The first time, Aphrodite asks whether to allow edits.' },
    'copy.btn': { ko: '복사', en: 'Copy' },
    'copy.clone': { ko: '저장소 받기 명령 복사', en: 'Copy the clone command' },
    'copy.claude': { ko: 'Claude Code 연결 명령 복사', en: 'Copy the Claude Code command' },
    'copy.codex': { ko: 'Codex 연결 명령 복사', en: 'Copy the Codex command' },
    'copy.done': { ko: '복사됨', en: 'Copied' },
    'copy.pick': { ko: '⌘C', en: '⌘C' },
    'copy.liveDone': { ko: '복사했어요.', en: 'Copied.' },
    'copy.livePick': { ko: '골라 두었어요. ⌘C로 복사하세요.', en: 'Selected. Press ⌘C to copy.' },
    'not.h2': { ko: '미리보기판이라 아직 안 되는 것도 있어요.', en: 'It\'s a preview, so some things don\'t work yet.' },
    'not.1': { ko: '페이지 안의 글과 모양을 손으로 직접 고치기. 지금은 에이전트에게 말해서 고쳐요.', en: 'Editing a page\'s text and look by hand. For now, you ask the agent to change it.' },
    'not.2': { ko: '앱 안에서 바로 AI와 대화하기. 지금은 터미널의 에이전트를 연결해서 써요.', en: 'Talking to an AI inside the app. For now, you connect an agent in the terminal.' },
    'not.3': { ko: '링크로 공유하기. 지금은 파일로 건네요.', en: 'Sharing by link. For now, you hand it over as a file.' },
    'know.p': { ko: 'macOS 13·14에서는 보드의 HTML 페이지가 그려지지 않을 수 있어요. 확인한 것은 macOS 15와 27이에요.', en: 'On macOS 13 and 14, HTML pages on the board may not draw. We checked macOS 15 and 27.' },
    'report.btn': { ko: '문제 알리기', en: 'Report a problem' },
    'close.h2': { ko: '쓰던 AI로 만들고, Aphrodite에 모아 두세요.', en: 'Make it with the AI you already use. Keep it in Aphrodite.' },
    'end.intel': { ko: 'Intel Mac이라면 Intel용 받기', en: 'Intel Mac? Download the Intel build' },
    'end.all': { ko: '모든 릴리스', en: 'All releases' },
    'foot.notices': { ko: '서드파티 고지', en: 'Third-party notices' }
  };

  // The landing's own key and toggle: a language picked on one page is the language of the other.
  var KEY = 'aphrodite.lang', LANGS = ['ko', 'en'];
  function pick() {
    try { var saved = localStorage.getItem(KEY); if (LANGS.indexOf(saved) >= 0) return saved; } catch (e) {}
    var asked = (location.search.match(/[?&]lang=([a-z]+)/) || [])[1];
    if (LANGS.indexOf(asked) >= 0) return asked;
    var said = navigator.languages || [navigator.language || ''];
    for (var i = 0; i < said.length; i++) { var l = String(said[i]).toLowerCase().slice(0, 2); if (LANGS.indexOf(l) >= 0) return l; }
    return 'ko';
  }
  var lang = pick();
  function t(k) { return COPY[k][lang]; }

  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };
  var root = document.documentElement, reason = $('[data-reason]'), notes = $('[data-notes]'), more = $('[data-more]'), copied = $('[data-copied]'), toggle = $('[data-lang-toggle]');
  var state = { kind: 'checking' };

  // Every button for one chip (the hero, the menu, the row, the close) takes the same address, or none: this is the only place that decides.
  function point(k, href) {
    $$('[data-dl="' + k + '"]').forEach(function (b) {
      if (href) { b.setAttribute('href', href); b.removeAttribute('aria-disabled'); b.removeAttribute('tabindex'); b.removeAttribute('role'); b.removeAttribute('aria-describedby'); }
      // Reachable by keyboard so the reason is read, though it does nothing.
      else { b.removeAttribute('href'); b.setAttribute('aria-disabled', 'true'); b.setAttribute('tabindex', '0'); b.setAttribute('role', 'link'); b.setAttribute('aria-describedby', 'dl-reason'); }
    });
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-dl]');
    if (b && b.getAttribute('aria-disabled') === 'true') e.preventDefault();
    if (more.open && !more.contains(e.target)) more.open = false;
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && more.open) { more.open = false; more.querySelector('summary').focus(); }
  });

  function line(parts) {
    $$('[data-meta]').forEach(function (meta) {
      meta.textContent = '';
      parts.forEach(function (p, i) { var s = document.createElement('span'); s.textContent = p; if (i) meta.appendChild(document.createTextNode(' · ')); meta.appendChild(s); });
    });
  }
  function say(text, link, after) {
    reason.textContent = text;
    if (link) { var a = document.createElement('a'); a.href = BASE + '/releases'; a.textContent = link; reason.appendChild(a); reason.appendChild(document.createTextNode(after)); }
  }
  function day(iso) {
    var d = new Date(iso || '');
    if (isNaN(d)) return '';
    try { return new Intl.DateTimeFormat(lang === 'ko' ? 'ko-KR' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' }).format(d); } catch (e) { return d.toISOString().slice(0, 10); }
  }

  // What the release said is kept, so a change of language redraws these lines without asking GitHub again.
  function render() {
    var s = state.kind;
    if (s === 'checking') { line([VERSION]); say(t('state.checking')); }
    if (s === 'absent') { line([VERSION, t('state.soon')]); say(t('state.absent')); }
    if (s === 'blocked') { line([VERSION]); say(t('state.blockedPre'), t('state.blockedLink'), t('state.blockedPost')); }
    if (s === 'found') {
      var parts = [(state.tag || 'v' + VERSION).replace(/^v/, '')], when = day(state.when), missing = [];
      if (when) parts.push(when);
      line(parts);
      if (state.missing.arm) missing.push(t('state.arm'));
      if (state.missing.intel) missing.push(t('state.intel'));
      say(missing.length ? t('state.missing').replace('{files}', missing.join(t('state.and'))) : '');
    }
  }

  function found(rel) {
    var assets = rel.assets || [], got = {};
    for (var i = 0; i < assets.length; i++) {
      var n = assets[i].name || '';
      if (!/\.dmg$/i.test(n)) continue;
      if (/aarch64|arm64/i.test(n)) got.arm = assets[i];
      else if (/x64|x86_64|intel/i.test(n)) got.intel = assets[i];
    }
    point('arm', got.arm && got.arm.browser_download_url); point('intel', got.intel && got.intel.browser_download_url);
    state = { kind: 'found', tag: rel.tag_name, when: rel.published_at || rel.created_at, missing: { arm: !got.arm, intel: !got.intel } };
    // The release's own page is where what changed is written; shown only once GitHub has answered with it.
    if (/^https:\/\/github\.com\//.test(rel.html_url || '')) { notes.href = rel.html_url; notes.hidden = false; }
    root.setAttribute('data-release', 'found');
    render();
  }

  function absent() {
    point('arm'); point('intel');
    state = { kind: 'absent' };
    root.setAttribute('data-release', 'absent');
    render();
  }

  function blocked() {
    // The API is rate-limited or unreachable: the release may well exist, so the buttons stay live.
    point('arm', BUILT.arm); point('intel', BUILT.intel);
    state = { kind: 'blocked' };
    root.setAttribute('data-release', 'blocked');
    render();
  }

  function apply() {
    root.lang = lang;
    $$('[data-i18n]').forEach(function (e) { e.textContent = t(e.getAttribute('data-i18n')); });
    $$('[data-i18n-alt]').forEach(function (e) { e.setAttribute('alt', t(e.getAttribute('data-i18n-alt'))); });
    $$('[data-i18n-aria]').forEach(function (e) { e.setAttribute('aria-label', t(e.getAttribute('data-i18n-aria'))); });
    $$('[data-i18n-content]').forEach(function (e) { e.setAttribute('content', t(e.getAttribute('data-i18n-content'))); });
    toggle.textContent = lang === 'ko' ? 'EN' : '한국어';
    toggle.hidden = false;
    render();
  }
  toggle.addEventListener('click', function () {
    lang = lang === 'ko' ? 'en' : 'ko';
    try { localStorage.setItem(KEY, lang); } catch (e) {}
    apply();
  });

  $$('[data-copy]').forEach(function (btn) {
    var text = btn.parentNode.querySelector('code, .pv-prompt'), label = btn.querySelector('[data-i18n]');
    btn.addEventListener('click', function () {
      function done(said, live) { label.textContent = said; copied.textContent = live; setTimeout(function () { label.textContent = t('copy.btn'); }, 1600); }
      function pick() { var r = document.createRange(); r.selectNodeContents(text); var s = getSelection(); s.removeAllRanges(); s.addRange(r); done(t('copy.pick'), t('copy.livePick')); }
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text.textContent).then(function () { done(t('copy.done'), t('copy.liveDone')); }, pick);
      else pick();
    });
  });
  var y = $('[data-year]');
  if (y) y.textContent = String(new Date().getFullYear());

  apply();
  if (!window.fetch) { blocked(); return; }
  fetch('https://api.github.com/repos/' + REPO + '/releases/tags/v' + VERSION, { headers: { Accept: 'application/vnd.github+json' } })
    .then(function (r) {
      if (r.status === 404) { absent(); return null; }
      if (!r.ok) { blocked(); return null; }
      return r.json();
    })
    .then(function (rel) { if (rel) found(rel); })
    .catch(blocked);
})();
