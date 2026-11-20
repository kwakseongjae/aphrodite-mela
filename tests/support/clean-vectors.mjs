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
