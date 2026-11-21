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
  var NAME = { arm: 'Apple Silicon용', intel: 'Intel Mac용' };

  var $ = function (s) { return document.querySelector(s); };
  var root = document.documentElement, reason = $('[data-reason]'), meta = $('[data-meta]'), more = $('[data-more]');
  var OS = meta.textContent;

  // Every button for one chip (the hero, the menu, the row) takes the same address, or none: this is the only place that decides.
  function point(k, href) {
    var els = document.querySelectorAll('[data-dl="' + k + '"]');
    for (var i = 0; i < els.length; i++) {
      var b = els[i];
      if (href) { b.setAttribute('href', href); b.removeAttribute('aria-disabled'); b.removeAttribute('tabindex'); b.removeAttribute('role'); b.removeAttribute('aria-describedby'); }
      // Reachable by keyboard so the reason is read, though it does nothing.
      else { b.removeAttribute('href'); b.setAttribute('aria-disabled', 'true'); b.setAttribute('tabindex', '0'); b.setAttribute('role', 'link'); b.setAttribute('aria-describedby', 'dl-reason'); }
    }
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
    meta.textContent = '';
    [OS].concat(parts).forEach(function (p, i) { var s = document.createElement('span'); s.textContent = p; if (i) meta.appendChild(document.createTextNode(' · ')); meta.appendChild(s); });
  }
  function say(text, link) {
    reason.textContent = text;
    if (link) { var a = document.createElement('a'); a.href = BASE + '/releases'; a.textContent = '릴리스 페이지'; reason.appendChild(a); reason.appendChild(document.createTextNode(link)); }
  }

  function found(rel) {
    var assets = rel.assets || [], got = {};
    for (var i = 0; i < assets.length; i++) {
      var n = assets[i].name || '';
      if (!/\.dmg$/i.test(n)) continue;
      if (/aarch64|arm64/i.test(n)) got.arm = assets[i];
      else if (/x64|x86_64|intel/i.test(n)) got.intel = assets[i];
    }
    var missing = [];
    ['arm', 'intel'].forEach(function (k) { point(k, got[k] && got[k].browser_download_url); if (!got[k]) missing.push(NAME[k]); });
    var parts = [(rel.tag_name || 'v' + VERSION).replace(/^v/, '')], when = new Date(rel.published_at || rel.created_at || '');
    if (!isNaN(when)) parts.push(when.getFullYear() + '년 ' + (when.getMonth() + 1) + '월 ' + when.getDate() + '일');
    line(parts);
    say(missing.length ? '이 판에는 ' + missing.join(', ') + ' 파일이 아직 없습니다.' : '');
    root.setAttribute('data-release', 'found');
  }

  function absent() {
    point('arm'); point('intel');
    line([VERSION, '준비 중']);
    say('이 판은 아직 올라오지 않았습니다. 올라오면 이 자리에서 바로 받을 수 있습니다.');
    root.setAttribute('data-release', 'absent');
  }

  function blocked() {
    // The API is rate-limited or unreachable: the release may well exist, so the buttons stay live.
    point('arm', BUILT.arm); point('intel', BUILT.intel);
    line([VERSION]);
    say('릴리스를 확인하지 못했습니다. 받아지지 않으면 ', '에서 받으세요.');
    root.setAttribute('data-release', 'blocked');
  }

  var copied = $('[data-copied]');
  Array.prototype.forEach.call(document.querySelectorAll('[data-copy]'), function (btn) {
    var code = btn.parentNode.querySelector('code');
    btn.addEventListener('click', function () {
      function done(text) { btn.textContent = text; copied.textContent = text === '복사됨' ? '복사했습니다.' : '골라 두었습니다. ⌘C로 복사하세요.'; setTimeout(function () { btn.textContent = '복사'; }, 1600); }
      function pick() { var r = document.createRange(); r.selectNodeContents(code); var s = getSelection(); s.removeAllRanges(); s.addRange(r); done('⌘C'); }
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(code.textContent).then(function () { done('복사됨'); }, pick);
      else pick();
    });
  });
  var y = $('[data-year]');
  if (y) y.textContent = String(new Date().getFullYear());

  line([VERSION]);
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
