// The second input review's inputs (0.3-P3 inputs check 2, lab/review-board/evidence/0.3-P3/inputs-review-2/harness/myvectors.mjs). Each returns a body fragment, or a whole document when it starts with <!doctype.
// H: the recording HTTP server, T: the raw TCP port. Every probe that reaches out names its id in the path or host.
const hostId = id => id.replace(/[^a-z0-9~]/gi, '').toLowerCase().replace('~', '-v');
export function myVectors(HP, TP) {
  const H = 'http://127.0.0.1:' + HP + '/';
  const P = id => "<meta http-equiv=refresh content='0;url=" + H + id + "'><link rel=preconnect href='http://127.0.0.1:" + TP + "/'>";
  const CSS = id => '<style>@import url(' + H + id + '-imp);</style>';
  const ESC = String.fromCharCode(27);
  const doc = (head, body, htmlAttrs = '') => '<!doctype html><html' + htmlAttrs + '><head><title>t</title>' + head + '</head><body>' + body + '</body></html>';
  return {
    // --- DOM clobbering of the cleaner's own reads (SANITIZE_DOM: false keeps name="...") ---
    'clobber-docEl-form': id => doc('', '<form name="documentElement"><p>words</p>' + CSS(id) + '<div style="width:9px;height:9px;background-image:image-set(\'' + H + id + '-is\' 1x)">x</div></form>'),
    'clobber-head-form': id => doc(CSS(id), '<form name="head"></form><p>words</p>'),
    'clobber-docEl-img': id => doc('', '<img name="documentElement">' + CSS(id)),
    'clobber-img-head': id => doc('', '<img name="head"><p>y</p>' + CSS(id)),
    'clobber-qsa': id => doc(CSS(id), '<form name="querySelectorAll"></form>'),
    'clobber-createElement': id => doc(CSS(id), '<form name="createElement"></form>'),
    'blind-nextSibling-img-head': id => doc(CSS(id), '<form><input name="nextSibling"></form><img name="head"><p>after</p>'),
    'blind-firstChild': id => doc('', '<form><p>hidden from the comparison</p><input name="firstChild"></form>' + CSS(id)),
    // --- what keepsAttribute does not see, left to the policy ---
    'css-escape-url-attr': id => '<div style="width:9px;height:9px;background:u\\72l(' + H + id + ')">x</div>',
    'css-image-set-attr': id => '<div style="width:9px;height:9px;background-image:image-set(\'' + H + id + '\' 1x)">x</div>',
    'svg-fill-escaped-url': id => '<svg width="20" height="20"><rect width="9" height="9" fill="u\\72l(' + H + id + '#g)"/><rect width="9" height="9" filter="u\\72l(' + H + id + '-f#f)"/></svg>',
    'style-fontface': id => '<style>@font-face{font-family:q;src:url(' + H + id + ')}p{font-family:q}</style><p>font</p>',
    'style-import-string': id => '<style>@import "' + H + id + '";</style><p>x</p>',
    'svg-style-import': id => '<svg><style>@import url(' + H + id + ');</style></svg>',
    'svg-style-cdata': id => '<svg><style><![CDATA[@import url(' + H + id + ');]]></style></svg>',
    'svg-style-breakout': id => '<svg><style>&lt;/style&gt;&lt;img src=x&gt;' + P(id).replace(/</g, '&lt;') + '</style></svg><p>after</p>',
    'style-cursor-url': id => '<p style="cursor:url(' + H + id + '),auto">c</p>',
    // --- links and forms (a press is allowed; nothing may happen without one) ---
    'a-dns-host': id => '<a href="http://dns-' + hostId(id) + '.trap.test:' + HP + '/">link</a>',
    // the positive control for the DNS reading: with its scripts it resolves .trap.test hosts on opening
    'dns-control': id => '<link rel="dns-prefetch" href="http://dnsctl-' + hostId(id) + '.trap.test/"><img src="http://dnsimg-' + hostId(id) + '.trap.test:' + HP + '/i">',
    'a-target-rel': id => '<a href="' + H + id + '" target="_blank" rel="opener">t</a><map name="m"><area shape="rect" coords="0,0,9,9" href="' + H + id + '-area" target="_top"></map>',
    'svg-a-actuate': id => '<svg><a xlink:href="' + H + id + '" xlink:show="embed" xlink:actuate="onLoad"><text y="10">x</text></a></svg>',
    'form-attrs': id => '<form id="f" method="post" enctype="multipart/form-data" target="_blank"><input name="a" autofocus value="1"><input type="image" src="' + H + id + '-img" alt="i"><button form="f" formaction="' + H + id + '-fa" formmethod="get">b</button></form>',
    'track-src': id => '<video><track default kind="subtitles" src="' + H + id + '"></video>',
    'input-image': id => '<input type="image" src="' + H + id + '">',
    // --- data: files that are themselves documents ---
    'svg-image-data-svg': id => '<svg width="20" height="20"><image width="9" height="9" href="data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg"><image href="' + H + id + '"/><style>@import url(' + H + id + '-i)</style></svg>') + '"/></svg>',
    'img-data-svg': id => '<img src="data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg"><image href="' + H + id + '"/><style>@import url(' + H + id + '-i)</style></svg>') + '">',
    // --- custom elements, namespaces, parser corners ---
    'custom-el-attrs': id => '<my-el src="' + H + id + '" href="' + H + id + '-h" style="background:url(' + H + id + '-s)"><x-y>t</x-y></my-el>',
    'custom-el-dsd': id => '<my-el><template shadowrootmode="open"><style>@import url(' + H + id + ')</style></template></my-el>',
    'svg-meta-breakout': id => '<svg><meta http-equiv="refresh" content="0;url=' + H + id + '"></svg>',
    'svg-link-ns': id => '<svg><link rel="preconnect" href="http://127.0.0.1:' + TP + '/"/></svg>',
    'math-mglyph-style': id => '<math><mi><mglyph><style><a title="</style>' + P(id) + '"></a></style></mglyph></mi></math>',
    'table-foster-style': id => '<table><style><a title="</style>' + P(id) + '"></a></style><tr><td>x</td></tr></table>',
    'select-style': id => '<select><style><a title="</style>' + P(id) + '"></a></style><option>o</option></select>',
    'pre-after-removed': id => '<pre><noscript>z</noscript>\nkeep</pre><textarea>\nkept</textarea>' + CSS(id),
    'textarea-rcdata': id => '<textarea></textarea><textarea>&lt;/textarea&gt;' + P(id).replace(/</g, '&lt;') + '</textarea>',
    'comment-in-head': id => doc('<!--' + P(id).replace(/--/g, '') + '-->', '<p>x</p>'),
    'pi-like': id => '<?xml-stylesheet href="' + H + id + '"?><p>x</p>',
    'nul-in-tag': id => '<p>x</p><scr\u0000ipt>a</scr\u0000ipt><me\u0000ta http-equiv=refresh content="0;url=' + H + id + '">',
    // --- the file's encoding when nothing marks it (the handoff zip writes no BOM) ---
    'enc-iso2022jp': id => doc('', '<p>x</p><style>/*</st' + ESC + '(Byle>' + P(id) + '*/</style>', ' data-pad="' + 'a'.repeat(1100) + '"'),
    'enc-pad-only': id => doc('', '<p>한국어 글</p>', ' data-pad="' + 'a'.repeat(1100) + '"'),
  };
}
/** Probes that need a press even with scripts, so their S page staying quiet says nothing. */
export const MY_QUIET = ['a-dns-host', 'a-target-rel', 'svg-a-actuate', 'form-attrs', 'svg-image-data-svg', 'img-data-svg', 'custom-el-attrs', 'svg-link-ns', 'pi-like', 'enc-pad-only', 'textarea-rcdata', 'svg-style-breakout'];
/**
 * Controls that reach nothing on opening, measured (the review's table and verify:wall): a video track with no source,
 * inputs that differ only for a broken parser (math-mglyph-style, comment-in-head, nul-in-tag, enc-iso2022jp), and two
 * that Chrome sets off but WebKit, where verify:wall opens the controls, does not (svg-fill-escaped-url, dns-control).
 */
export const QUIET_OPENING = ['track-src', 'math-mglyph-style', 'comment-in-head', 'nul-in-tag', 'enc-iso2022jp', 'svg-fill-escaped-url', 'dns-control'];
