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

  var $ = function (s) { return document.querySelector(s); };
  var btn = { arm: $('[data-dl="arm"]'), intel: $('[data-dl="intel"]') };
  var status = $('[data-status]'), reason = $('[data-reason]'), meta = $('[data-meta]'), fallback = $('[data-fallback]');

  function disable(b, why) {
    b.removeAttribute('href');
    b.setAttribute('aria-disabled', 'true');
    b.setAttribute('tabindex', '0'); // reachable by keyboard so the reason is read, though it does nothing
    b.setAttribute('role', 'link');
    if (why) b.setAttribute('data-why', why);
  }
  function enable(b, href) {
    b.setAttribute('href', href);
    b.removeAttribute('aria-disabled');
    b.removeAttribute('tabindex');
    b.removeAttribute('role');
    b.removeAttribute('data-why');
  }
  // A disabled link must not act on click or Enter even though it is focusable.
  Object.keys(btn).forEach(function (k) {
    btn[k].addEventListener('click', function (e) { if (btn[k].getAttribute('aria-disabled') === 'true') e.preventDefault(); });
  });

  function show(rel) {
    var parts = [];
    if (rel.tag_name) parts.push(rel.tag_name.replace(/^v/, '') + (rel.prerelease ? ' (미리보기)' : ''));
    var when = rel.published_at || rel.created_at;
    if (when) {
      var d = new Date(when);
      if (!isNaN(d)) parts.push(d.getFullYear() + '년 ' + (d.getMonth() + 1) + '월 ' + d.getDate() + '일');
    }
    if (parts.length) { meta.textContent = parts.join(' · '); meta.hidden = false; }
  }

  function found(rel) {
    var assets = rel.assets || [], arm = null, intel = null;
    for (var i = 0; i < assets.length; i++) {
      var n = assets[i].name || '';
      if (!/\.dmg$/i.test(n)) continue;
      if (/aarch64|arm64/i.test(n)) arm = assets[i];
      else if (/x64|x86_64|intel/i.test(n)) intel = assets[i];
    }
    show(rel);
    status.textContent = '';
    var missing = [];
    if (arm) enable(btn.arm, arm.browser_download_url); else { disable(btn.arm); missing.push('Apple Silicon용'); }
    if (intel) enable(btn.intel, intel.browser_download_url); else { disable(btn.intel); missing.push('Intel Mac용'); }
    reason.textContent = missing.length ? '이 판에는 ' + missing.join(', ') + ' 파일이 아직 없습니다.' : '';
    fallback.hidden = true;
  }

  function absent() {
    disable(btn.arm); disable(btn.intel);
    status.textContent = '아직 올라오지 않았습니다.';
    reason.textContent = VERSION + ' 판 릴리스가 아직 없어 내려받을 수 없습니다. 올라오면 이 페이지에서 받을 수 있습니다.';
    meta.hidden = true; fallback.hidden = true;
  }

  function blocked() {
    // The API is rate-limited or unreachable: the release may well exist, so the buttons stay live.
    enable(btn.arm, BUILT.arm); enable(btn.intel, BUILT.intel);
    status.textContent = '릴리스를 확인하지 못했습니다. 아래 버튼은 이 판의 주소입니다.';
    reason.textContent = '';
    meta.hidden = true; fallback.hidden = false;
  }

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
