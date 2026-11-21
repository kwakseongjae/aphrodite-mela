/**
 * Pages built to slip past a cleaner (0.3-P3-fix1): the 30 the input review sent (lab/review-board/evidence/0.3-P3/
 * inputs-review/harness/vectors.mts) and the ones the code review and the second look added. Each one, cleaned, must
 * reach nothing when a browser opens it; the same page sent with its scripts is the probe that it would (QUIET lists
 * the ones that reach nothing even then, because opening a page is not enough to set them off).
 *
 * `page(id)` takes P, the review's payload (a meta refresh and a preconnect), and H, the recording server's address.
 */
export function vectors(HP, TP) {
  const P = (id) => "<meta http-equiv=refresh content='0;url=http://127.0.0.1:"+HP+"/"+id+"'><link rel=preconnect href='http://127.0.0.1:"+TP+"/'>";
  const V = {
  'control-plain': id => '<p>hi</p>'+P(id),
  'control-script': id => '<p>hi</p><script>new Image().src="http://127.0.0.1:'+HP+'/'+id+'"</script>',
  // Reaches out only as it is left, so its request lands while the next input is open: it must still be counted on its
  // own input, by its name, never on the next one's (0.3-P3-fix2 #12).
  'control-late': id => '<p>hi</p><script>addEventListener("pagehide", () => navigator.sendBeacon("http://127.0.0.1:'+HP+'/'+id+'", "x"))</script>',
  'comment-abrupt': id => '<p>a</p><!-->'+P(id)+'-->',
  'comment-abrupt2': id => '<p>a</p><!--->'+P(id)+'-->',
  'comment-bang': id => '<p>a</p><!-- x --!>'+P(id)+'-->',
  'noscript-attr': id => '<noscript><p title="</noscript>'+P(id)+'"></noscript>',
  'svg-title-style': id => '<svg><title><style><a title="</style>'+P(id)+'"></a></style></title></svg>',
  'svg-desc-style': id => '<svg><desc><style><a title="</style>'+P(id)+'"></a></style></desc></svg>',
  'svg-fo-textarea': id => '<svg><foreignObject><textarea><a title="</textarea>'+P(id)+'"></a></textarea></foreignObject></svg>',
  'math-mtext-style': id => '<math><mtext><style><a title="</style>'+P(id)+'"></a></style></mtext></math>',
  'math-annot-style': id => '<math><annotation-xml encoding="text/html"><style><a title="</style>'+P(id)+'"></a></style></annotation-xml></math>',
  'svg-p-style': id => '<svg><p><style><a title="</style>'+P(id)+'"></a></style></svg>',
  'math-close-svg-style': id => '<math></svg><style>'+P(id)+'</style></math>',
  'svg-close-math-xmp': id => '<svg></math><xmp>'+P(id)+'</xmp></svg>',
  'svg-close-math-style': id => '<svg></math><style>'+P(id)+'</style></svg>',
  'svg-cdata': id => '<svg><![CDATA[><a title="]]>'+P(id)+'">]]></svg>',
  'meta-link-header': id => '<meta http-equiv="Link" content="<http://127.0.0.1:'+TP+'/>; rel=preconnect">',
  'template-attr': id => '<template><p title="</template>'+P(id)+'"></p></template>',
  'iframe-raw': id => '<iframe><p title="</iframe>'+P(id)+'"></iframe>',
  'script-double-escape': id => '<script><!--<script>x</script>'+P(id)+'</script>-->',
  'entity-refresh': id => '<meta http-equiv="&#x72;efresh" content="0;url=http://127.0.0.1:'+HP+'/'+id+'">',
  'img-http': id => '<img src="http://127.0.0.1:'+HP+'/'+id+'">',
  'css-import': id => '<style>@import url(http://127.0.0.1:'+HP+'/'+id+');body{background:url(http://127.0.0.1:'+HP+'/'+id+'-bg)}</style>',
  'video-http': id => '<video autoplay src="http://127.0.0.1:'+HP+'/'+id+'"></video>',
  'preload-imagesrcset': id => '<link rel=preload as=image href="data:," imagesrcset="http://127.0.0.1:'+HP+'/'+id+' 1x">',
  'object-data': id => '<object data="http://127.0.0.1:'+HP+'/'+id+'"></object><embed src="http://127.0.0.1:'+HP+'/'+id+'-e">',
  'svg-image': id => '<svg><image href="http://127.0.0.1:'+HP+'/'+id+'"/></svg>',
  'svg-use': id => '<svg><use href="http://127.0.0.1:'+HP+'/'+id+'#a"/></svg>',
  'svg-animate-href': id => '<svg><a><animate attributeName=href to="javascript:alert(1)"/><text y=20>x</text></a></svg>',
  'form-autosubmit-ish': id => '<form action="http://127.0.0.1:'+HP+'/'+id+'"><button>go</button></form>',
};

const H = 'http://127.0.0.1:' + HP + '/';
Object.assign(V, {
  'style-attr-url': id => '<div style="width:10px;height:10px;background:url(' + H + id + ')">x</div>',
  'svg-fill-url': id => '<svg><rect width="10" height="10" fill="url(' + H + id + '#g)"/><rect filter="url(' + H + id + '-f#f)" mask="url(' + H + id + '-m#m)" clip-path="url(' + H + id + '-c#c)" width="5" height="5"/></svg>',
  'svg-self-closing-script': id => '<svg><script/><text>kept</text></svg><p>after the drawing</p>' + P(id).replace(/<meta[^>]*>/, ''),
  'fo-textarea-words': id => '<svg><foreignObject><textarea>&lt;script&gt;keep me</textarea></foreignObject></svg>',
  'prose-media': id => '<p>media:' + 'a'.repeat(64) + '</p><img src="media:' + 'a'.repeat(64) + '">',
  'xlink-a-js': id => '<svg><a xlink:href="javascript:fetch(\'' + H + id + '\')"><text>x</text></a></svg>',
  'link-in-body': id => '<p>x</p><link rel=stylesheet href="' + H + id + '">',
  'base-href': id => '<base href="' + H + id + '/"><img src="x.png">',
});
  return V;
}
/** Probes that reach nothing even with scripts, measured in Chrome: no Link header from meta, inert template content, a script that never runs, a cross-origin use, links and forms nobody presses, and pages kept for their words. */
export const QUIET = ['meta-link-header', 'template-attr', 'script-double-escape', 'svg-use', 'svg-animate-href', 'form-autosubmit-ish', 'fo-textarea-words', 'prose-media', 'xlink-a-js'];

/**
 * Ordinary pages, which must go out cleaned and read the same as with their scripts: words, tables, a drawing, a
 * form, a custom element, styles in the head, and a heading a link goes to by an id the app's own document also has.
 */
export const ORDINARY = {
  'table-korean': '<h1>분기 보고</h1><table><thead><tr><th>항목</th><th>값</th></tr></thead><tbody><tr><td>매출</td><td>1,200</td></tr></tbody></table><p>한국어 글 &amp; 기호 &lt;태그&gt;</p>',
  'svg-chart': '<svg viewBox="0 0 100 50" width="300"><defs><linearGradient id="g"><stop offset="0" stop-color="#4a7"/><stop offset="1" stop-color="#27a"/></linearGradient><rect id="bar" width="10" height="10"/></defs><rect x="5" y="10" width="20" height="40" fill="url(#g)"/><path d="M0 50 L50 0" stroke="#333"/><use href="#bar" x="40"/><text x="5" y="8" font-size="6">Q1 매출</text></svg>',
  'pre-textarea': '<pre>' + String.fromCharCode(10, 10) + 'two blank lines kept</pre><textarea>' + String.fromCharCode(10) + 'one</textarea><p>after</p>',
  'form': '<form action="https://x.example/send"><label>Name <input name="n" value="a"></label><button>Send</button></form>',
  'custom-element': '<my-card data-x="1" title="t"><span>inside the card</span></my-card>',
  'id-anchor': '<nav><a href="#title">to the title</a> <a href="#links">to the links</a></nav><h1 id="title">Title</h1><h2 id="links">Links</h2><style>#title{color:#a33}</style>',
  'links': '<a href="https://example.com/x">out</a> <a href="#top">up</a> <a href="mailto:a@b.co">mail</a> <a href="javascript:alert(1)">js</a>',
  // Text on both sides of what cleaning takes out joins into one text, as a second reading makes it.
  'text-around-removed': '<p>a</p>\n<script></script>\n<link rel="icon" href="x.png">\n<p>b</p>',
  'details': '<details open><summary>More</summary><p>Hidden text</p></details><dialog open>hi</dialog>',
};
/** Whole documents: the page as stored, its head, its html and body attributes. */
export const ORDINARY_DOCUMENTS = {
  'head-styles': '<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>Head</title><style>main .card{color:#222;padding:12px}a[href^="#"]::after{content:" →"}</style></head><body class="paper"><main><div class="card">Card <a href="#c">c</a></div></main></body></html>',
};
/** What a page keeps without its scripts that is only an attribute (0.3-P3-fix2 O-3): [body, selector, attribute]. */
export const KEPT_ATTRIBUTES = {
  'video-poster': ['<video id="k" poster="data:image/png;base64,iVBORw0KGgo=" controls></video>', '#k', 'poster'],
  'tel-link': ['<a id="k" href="tel:+82-2-123-4567">call</a>', '#k', 'href'],
};
/**
 * And what it loses that is only an attribute: where a link opens, a link to a file beside it or to another page of the
 * board, a picture's other sizes, and what only a script or a reader of the page's data would use. The export dialog
 * names only what would surprise a person: links to other pages.
 */
export const LOST_ATTRIBUTES = {
  'a-target': ['<a id="k" href="https://example.com/" target="_blank">x</a>', '#k', 'target'],
  'relative-link': ['<a id="k" href="other.html">x</a>', '#k', 'href'],
  'page-link': ['<a id="k" href="page:p2">x</a>', '#k', 'href'],
  'picture-srcset': ['<picture><source id="k" srcset="data:image/png;base64,iVBORw0KGgo="><img src="data:image/png;base64,iVBORw0KGgo=" alt=""></picture>', '#k', 'srcset'],
  'contenteditable': ['<div id="k" contenteditable="true">x</div>', '#k', 'contenteditable'],
  'accesskey': ['<button id="k" accesskey="s">x</button>', '#k', 'accesskey'],
  'itemprop': ['<span id="k" itemprop="name">x</span>', '#k', 'itemprop'],
  'autofocus': ['<input id="k" autofocus>', '#k', 'autofocus'],
};
/** What an ordinary page loses without its scripts: formulas written in MathML (the export dialog says so). */
export const LOSSES = {
  'math': ['<p>before</p><math><mi>x</mi><mo>=</mo><mn>2</mn></math><p>after</p>', 'x=2'],
};
