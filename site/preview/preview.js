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
    'meta.desc': { ko: '내부 팀이 먼저 쓰는 Aphrodite 미리보기판. 터미널의 Claude Code·Codex가 보드에 HTML 페이지를 올리고, 보드는 파일 하나로 건넵니다.', en: 'The Aphrodite preview, for the team first. Claude Code or Codex puts HTML pages on a board from your terminal, and the board goes out as one file.' },
    'skip': { ko: '본문으로 건너뛰기', en: 'Skip to content' },
    'nav.home': { ko: 'Aphrodite 미리보기판', en: 'Aphrodite preview' },
    'nav.tag': { ko: '내부 미리보기', en: 'Internal preview' },
    'nav.get': { ko: '내려받기', en: 'Download' },
    'nav.connect': { ko: '연결', en: 'Connect' },
    'nav.know': { ko: '알아 둘 것', en: 'Known limits' },
    'nav.release': { ko: '정식판', en: 'Stable' },
    'nav.site': { ko: '사이트', en: 'Site' },
    'nav.lang': { ko: '언어 바꾸기', en: 'Switch language' },
    'hero.eyebrow': { ko: 'Aphrodite 미리보기판', en: 'Aphrodite preview' },
    'hero.h1': { ko: '한 보드에 올리고, 그대로 건넵니다.', en: 'Put it on one board. Hand it over whole.' },
    'hero.em': { ko: '페이지는 터미널의 에이전트가 만들고 고칩니다.', en: 'Your agent in the terminal makes the pages and revises them.' },
    'hero.lede': { ko: '아티팩트로 보여 주던 브리핑과 보고서, pen이나 Claude Design으로 잡던 시안을 터미널의 Claude Code·Codex와 한 보드에서 만듭니다. 내부 팀이 먼저 쓰는 판입니다.', en: 'The briefings, reports and drafts you made in artifacts, pen or Claude Design, now on one board with Claude Code or Codex in your terminal. The team gets it first.' },
    'hero.caption': { ko: '보낼 것이 있는 비둘기.', en: 'A dove with something to deliver.' },
    'dl.cta': { ko: 'Mac용 내려받기', en: 'Download for Mac' },
    'dl.ctaSub': { ko: 'Apple Silicon · M1 이후', en: 'Apple Silicon · M1 and later' },
    'dl.more': { ko: '다른 칩: Intel Mac', en: 'Other chip: Intel Mac' },
    'dl.intel': { ko: 'Intel Mac용 내려받기', en: 'Download for Intel Mac' },
    'dl.intelSub': { ko: '2020년까지 나온 Intel Mac', en: 'Intel Macs, up to 2020' },
    'state.os': { ko: 'macOS 13 이상', en: 'macOS 13 or later' },
    'state.checking': { ko: '릴리스를 확인하는 중입니다.', en: 'Checking the release…' },
    'state.soon': { ko: '준비 중', en: 'coming soon' },
    'state.absent': { ko: '이 판은 아직 올라오지 않았습니다. 올라오면 이 자리에서 바로 받을 수 있습니다.', en: 'This preview isn’t up yet. When it is, it downloads right here.' },
    'state.blockedPre': { ko: '릴리스를 확인하지 못했습니다. 받아지지 않으면 ', en: 'Couldn’t check the release. If the download doesn’t start, use the ' },
    'state.blockedLink': { ko: '릴리스 페이지', en: 'releases page' },
    'state.blockedPost': { ko: '에서 받으세요.', en: '.' },
    'state.missing': { ko: '이 판에는 {files} 파일이 아직 없습니다.', en: 'This preview has no {files} file yet.' },
    'state.arm': { ko: 'Apple Silicon용', en: 'Apple Silicon' },
    'state.intel': { ko: 'Intel Mac용', en: 'Intel Mac' },
    'state.and': { ko: ', ', en: ' or ' },
    'state.notes': { ko: '이 판에서 달라진 것', en: 'What changed in this preview' },
    'shot.alt': { ko: 'Aphrodite 보드: 에이전트가 올린 HTML 페이지가 섹션 페이지 옆에 놓여 있고, 그 아래에 스크린샷과 영상이 함께 놓여 있다.', en: 'The Aphrodite board: an HTML page an agent put up sits beside the section pages, with a screenshot and a video below it.' },
    'shot.caption': { ko: '보드. HTML 페이지와 스크린샷, 영상이 한 캔버스에 나란히 놓입니다.', en: 'The board. HTML pages, screenshots and video, side by side on one canvas.' },
    'screens.eyebrow': { ko: '이 판에서 하는 일', en: 'What the preview does' },
    'screens.h2': { ko: '올리고, 보고, 건넵니다.', en: 'Put it up. Look. Hand it over.' },
    's1.alt': { ko: '에이전트가 연결된 보드. 위쪽 띠가 연결과 허용 상태를 알리고, 에이전트가 만든 HTML 페이지가 프레임으로 놓여 있다.', en: 'A board with an agent connected: the strip on top shows the connection and what it may do, and the HTML page the agent made sits in a frame.' },
    's1.h': { ko: '올립니다', en: 'Put it up' },
    's1.p': { ko: 'Claude Code나 Codex가 HTML 페이지를 만들어 보드에 놓고, 말한 대로 고칩니다.', en: 'Claude Code or Codex makes an HTML page, puts it on the board, and revises it as you ask.' },
    's2.alt': { ko: '보드의 HTML 페이지 안으로 들어간 모습. 페이지의 그래프와 표가 그대로 그려져 있다.', en: 'Inside an HTML page on the board, its chart and table drawn as they are.' },
    's2.h': { ko: '봅니다', en: 'Look' },
    's2.p': { ko: '페이지 안으로 들어가, 실제로 그려지는 그대로 봅니다.', en: 'Step inside a page and see it exactly as it draws.' },
    's3.alt': { ko: '내보내기 창: 보드를 .aph로 저장하는 단추와, 페이지 하나를 HTML 파일로 내려받는 칸.', en: 'The export dialog: a button that saves the board as .aph, and a panel that downloads one page as an HTML file.' },
    's3.h': { ko: '건넵니다', en: 'Hand it over' },
    's3.pre': { ko: '보드는 ', en: 'The board goes out as one ' },
    's3.post': { ko: ' 파일 하나로, 페이지는 HTML 파일 하나로 내보냅니다.', en: ' file, a page as one HTML file.' },
    'get.eyebrow': { ko: '내려받기와 설치', en: 'Download and install' },
    'get.h2': { ko: '받고, 세 단계.', en: 'Download. Three steps.' },
    'get.p': { ko: '어느 쪽인지 모르겠다면 Apple 메뉴 > 이 Mac에 관하여에서 칩을 봅니다. Apple M으로 시작하면 Apple Silicon입니다.', en: 'Not sure which? Apple menu > About This Mac, then look at Chip. If it starts with Apple M, it’s Apple Silicon.' },
    'get.armSub': { ko: 'M1 이후 Mac', en: 'M1 and later' },
    'get.btn': { ko: '내려받기', en: 'Download' },
    'get.btnArm': { ko: 'Apple Silicon용 내려받기', en: 'Download for Apple Silicon' },
    'install.label': { ko: '설치', en: 'Install' },
    'i1.h': { ko: '파일 열기', en: 'Open the file' },
    'i1.pre': { ko: '내려받은 ', en: 'Double-click the ' },
    'i1.post': { ko: ' 파일을 두 번 눌러 엽니다.', en: ' you downloaded.' },
    'i2.h': { ko: 'Applications로 끌기', en: 'Drag it to Applications' },
    'i2.p': { ko: 'Aphrodite 아이콘을 Applications 폴더에 놓습니다.', en: 'Drop the Aphrodite icon onto the Applications folder.' },
    'i3.h': { ko: '열기', en: 'Open it' },
    'i3.p': { ko: 'Applications에서 Aphrodite를 엽니다. 에이전트를 연결하는 동안 열어 둡니다.', en: 'Open Aphrodite from Applications, and keep it open while you connect an agent.' },
    'connect.eyebrow': { ko: '에이전트 연결', en: 'Connect an agent' },
    'connect.h2': { ko: '터미널의 에이전트를 보드에.', en: 'Bring your terminal agent to the board.' },
    'connect.note': { ko: '0.2 기준', en: 'As of 0.2' },
    'status.checking': { ko: '확인 중', en: 'Checking' },
    'status.known': { ko: '알려짐', en: 'Known' },
    'c1.h': { ko: '저장소 받기', en: 'Get the repository' },
    'c1.p': { ko: '연결해 주는 MCP 서버가 이 저장소 안에 있습니다. 명령은 git과 node로 돕니다.', en: 'The MCP server that makes the connection lives in this repository. The commands run on git and node.' },
    'c2.h': { ko: '한 줄 넣기', en: 'Add one line' },
    'c2.p': { ko: 'Claude Code와 Codex 가운데 쓰는 쪽 하나만 넣습니다.', en: 'Only the one you use, Claude Code or Codex.' },
    'c2.pathPre': { ko: '', en: 'Replace ' },
    'c2.pathPost': { ko: '는 01에서 받은 폴더의 경로로 바꿉니다.', en: ' with the folder you cloned in 01.' },
    'c3.h': { ko: '허용하고 시작하기', en: 'Allow it, then start' },
    'c3.p': { ko: '읽기는 늘 되고, 고치는 것은 사람이 켜 줘야 합니다. 에이전트가 요청하면 앱 가운데 창이 뜨고, 한 번 눌러 허용합니다.', en: 'Reading always works; changing needs a person to turn it on. When the agent asks, a dialog opens in the middle of the app, and one click allows it.' },
    'c3.try': { ko: '처음 해 볼 한 마디', en: 'A first thing to ask' },
    'c3.prompt': { ko: 'aphrodite_guide를 먼저 읽고, 이번 주 할 일을 정리한 HTML 페이지 한 장을 보드에 만들어 줘.', en: 'Read aphrodite_guide first, then make one HTML page on the board that lists this week’s tasks.' },
    'cmd.repo': { ko: '저장소', en: 'Repository' },
    'copy.btn': { ko: '복사', en: 'Copy' },
    'copy.clone': { ko: '저장소 받기 명령 복사', en: 'Copy the clone command' },
    'copy.claude': { ko: 'Claude Code 연결 명령 복사', en: 'Copy the Claude Code command' },
    'copy.codex': { ko: 'Codex 연결 명령 복사', en: 'Copy the Codex command' },
    'copy.prompt': { ko: '첫 마디 복사', en: 'Copy the first message' },
    'copy.done': { ko: '복사됨', en: 'Copied' },
    'copy.pick': { ko: '⌘C', en: '⌘C' },
    'copy.liveDone': { ko: '복사했습니다.', en: 'Copied.' },
    'copy.livePick': { ko: '골라 두었습니다. ⌘C로 복사하세요.', en: 'Selected. Press ⌘C to copy.' },
    'scope.eyebrow': { ko: '이 판의 범위', en: 'In this preview' },
    'scope.h2': { ko: '되는 것과, 아직 안 되는 것.', en: 'What works, and what doesn’t yet.' },
    'yes.h': { ko: '이 판으로 되는 것', en: 'Works now' },
    'yes.1': { ko: '터미널의 Claude Code와 Codex를 연결해, 보드에 HTML 페이지를 올리고 고칩니다.', en: 'Connect Claude Code or Codex from your terminal, then put HTML pages on the board and revise them.' },
    'yes.2': { ko: '스크린샷과 영상을 보드에 놓습니다.', en: 'Put screenshots and video on the board.' },
    'yes.3pre': { ko: '보드는 ', en: 'Hand over the board as an ' },
    'yes.3post': { ko: ' 파일로, 페이지는 HTML 파일로 건넵니다.', en: ' file, a page as an HTML file.' },
    'yes.4': { ko: '모든 변경에 누가, 왜 바꿨는지가 남습니다.', en: 'Every change keeps who made it, and why.' },
    'not.h': { ko: '아직 안 되는 것', en: 'Not yet' },
    'not.1': { ko: '페이지 안의 글과 모양을 손으로 고치기. 지금은 에이전트에게 말해 고칩니다.', en: 'Editing a page’s words and look by hand. For now, ask the agent.' },
    'not.2': { ko: '앱 안에서 AI와 대화하기. 지금은 터미널의 에이전트와 합니다.', en: 'Talking to AI inside the app. For now, use the agent in your terminal.' },
    'not.3': { ko: '링크로 보드 공유하기. 지금은 파일로 건넵니다.', en: 'Sharing a board by link. For now, send the file.' },
    'not.4': { ko: '앱 화면의 새 디자인. 지금은 이전 화면을 그대로 씁니다.', en: 'The app’s new design. For now, the screens are the ones you know.' },
    'know.h2': { ko: '미리 알아 둘 것.', en: 'Worth knowing first.' },
    'know.what': { ko: '무엇', en: 'What' },
    'know.now': { ko: '지금 아는 것', en: 'What we know' },
    'know.state': { ko: '상태', en: 'Status' },
    'k1.what': { ko: 'macOS 13·14', en: 'macOS 13–14' },
    'k1.now': { ko: 'HTML 페이지가 그려지지 않을 수 있습니다. 페이지 벽을 확인한 것은 macOS 15와 27입니다.', en: 'HTML pages may not draw. The page wall was checked on macOS 15 and 27.' },
    'k2.what': { ko: '자동 업데이트', en: 'Automatic updates' },
    'k2.now': { ko: '새 판이 나오면 이 페이지에서 받습니다.', en: 'When a new preview is out, get it from this page.' },
    'k3.what': { ko: '정식판과 함께', en: 'Next to the release' },
    'k3.now': { ko: '정식판(0.2)과 한 Mac에 함께 둘 수 있는지 봅니다.', en: 'Whether it can sit on the same Mac as the release (0.2).' },
    'report.h': { ko: '문제를 알리는 곳', en: 'Report a problem' },
    'report.p': { ko: 'GitHub 이슈에 남겨 주세요. 판 번호, macOS 버전, 어느 칩인지를 함께 적어 주세요.', en: 'Open a GitHub issue, with the version, your macOS and which chip.' },
    'report.btn': { ko: '이슈 남기기', en: 'Open an issue' },
    'end.h2': { ko: 'macOS용 미리보기판', en: 'The preview, for macOS' },
    'end.cta': { ko: 'Apple Silicon용 내려받기', en: 'Download for Apple Silicon' },
    'end.ctaSub': { ko: '무료 · 오픈소스 · 가입 없음', en: 'Free · open source · no sign-up' },
    'end.intel': { ko: 'Intel Mac이라면 Intel용 받기', en: 'Intel Mac? Download the Intel build' },
    'end.all': { ko: '모든 릴리스', en: 'All releases' },
    'foot.mark': { ko: '만들기 전에, 방향부터.', en: 'Shape before you build.' },
    'foot.notices': { ko: '서드파티 고지', en: 'Third-party notices' },
    'foot.credit': { ko: '의도 있게. 약간의 직감도 함께.', en: 'Made with intention. A little instinct, too.' }
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
      [t('state.os')].concat(parts).forEach(function (p, i) { var s = document.createElement('span'); s.textContent = p; if (i) meta.appendChild(document.createTextNode(' · ')); meta.appendChild(s); });
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
