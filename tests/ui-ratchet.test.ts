import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';

/**
 * The older stylesheets can only lose colours and font sizes, never gain them.
 *
 * New screens use src/ui (tokens and parts). The sheets written before it are pinned here at the number
 * of distinct colours and distinct font sizes each held on 2026-11-18, when the system came in; F3–F5
 * move screens over and lower the pins as they go. A count that grows fails. A count that shrinks fails
 * too, asking for the pin to come down in the same change, so the ground gained is not given back.
 *
 * Legacy is every .css under src/ except src/ui (the system), src/generated and src/vendor (built or
 * copied from elsewhere). A new .css file there has no pin and fails: put new styles in src/ui.
 * CSS written inside .ts files is not counted; that is a known gap.
 */
const pins:Record<string,{colours:number,sizes:number}>={
  'agent/agent.css':{colours:10,sizes:2},
  'design/component-explorer.css':{colours:92,sizes:15},
  'design/studio.css':{colours:29,sizes:11},
  'editor/pointer-editor.css':{colours:9,sizes:3},
  'moa.css':{colours:5,sizes:9},
  'page.css':{colours:10,sizes:38},
  'patterns.css':{colours:6,sizes:8},
  'reference.css':{colours:22,sizes:7},
  'style.css':{colours:341,sizes:32},
  'workspace/home.css':{colours:82,sizes:29},
  'workspace/vault.css':{colours:3,sizes:3},
};

const named='aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen'.split(' ');
const namedRe=new RegExp(`(?<![\\w-])(${named.join('|')})(?![\\w-])`,'gi');
const fnRe=/\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\((?:[^()]|\([^()]*\))*\)/gi;
const hexRe=/#[0-9a-f]{3,8}\b/gi;

/** Every declaration's property and value, with comments, strings and url()s taken out. */
function declarations(css:string){
  const clean=css.replace(/\/\*[\s\S]*?\*\//g,'').replace(/url\((?:[^()]|\([^()]*\))*\)/g,'url()').replace(/(["'])(?:\\.|(?!\1).)*\1/g,'""');
  return [...clean.matchAll(/([\w-]+)\s*:\s*([^;{}]+)(?=[;}])/g)].map(m=>({prop:m[1].toLowerCase(),value:m[2].trim()}));
}

const hex=(h:string)=>{h=h.toLowerCase().slice(1);if(h.length===3||h.length===4)h=[...h].map(c=>c+c).join('');if(h.length===8&&h.endsWith('ff'))h=h.slice(0,6);return `#${h}`;};

export function colours(css:string){
  const seen=new Set<string>();
  for(const {value} of declarations(css)){
    for(const m of value.matchAll(fnRe))seen.add(m[0].toLowerCase().replace(/\s*([,/()])\s*/g,'$1').replace(/\s+/g,' '));
    for(const m of value.replace(fnRe,'').matchAll(hexRe))seen.add(hex(m[0]));
    for(const m of value.replace(fnRe,'').matchAll(namedRe))seen.add(m[1].toLowerCase());
  }
  return seen;
}

/** Top-level tokens of a value, keeping a function and its arguments as one token. */
function tokens(value:string){
  const out:string[]=[];let depth=0,cur='';
  for(const ch of value){
    if(ch==='(')depth++;
    if(ch===')')depth--;
    if(depth===0&&/[\s/]/.test(ch)){if(cur)out.push(cur);cur='';if(ch==='/')out.push('/');continue;}
    cur+=ch;
  }
  if(cur)out.push(cur);
  return out;
}
const sizeLike=/^(?:-?\d*\.?\d+(?:px|r?em|%|pt|vw|vh|vmin|vmax|cqw|cqi|ch|ex)|(?:calc|clamp|min|max|var)\(.*\)|xx-small|x-small|small|medium|large|x-large|xx-large|xxx-large|smaller|larger)$/i;

export function sizes(css:string){
  const seen=new Set<string>();
  const norm=(v:string)=>v.replace(/!important/i,'').trim().toLowerCase().replace(/\s+/g,' ');
  for(const {prop,value} of declarations(css)){
    if(prop==='font-size'){const v=norm(value);if(!/^(inherit|initial|unset|revert|revert-layer)$/.test(v))seen.add(v);}
    if(prop==='font'){
      const parts=tokens(norm(value));
      const slash=parts.indexOf('/');
      const size=slash>0?parts[slash-1]:parts.find(t=>sizeLike.test(t)&&!/^var\(/.test(t));
      if(size&&sizeLike.test(size)&&!(slash<0&&parts.length===1))seen.add(size);
    }
  }
  return seen;
}

const src=new URL('../src/',import.meta.url);
const legacy=readdirSync(src,{recursive:true}).map(String).filter(f=>f.endsWith('.css')&&!/^(ui|generated|vendor)\//.test(f)).sort();

test('the counters read colours and sizes the way they are written',()=>{
  assert.deepEqual([...colours('.a{color:#FFF;background:#ffffff;border:1px solid rgb(0 0 0 / .1)} .white:hover{fill:White;stroke:rgb(0 0 0/.1)}')].sort(),['#ffffff','rgb(0 0 0/.1)','white']);
  assert.deepEqual([...colours('.a{background:url("x.svg#fff");content:"#abc red";color:var(--ink,#292d27)}')],['#292d27']);
  assert.deepEqual([...sizes('.a{font:600 13px/1.4 Arial}.b{font-size:12px}.c{font:inherit}.d{font-size:clamp(12px, 2vw, 14px)}.e{font:14px/1.55 Arial,sans-serif}.f{font-size:12px !important}')].sort(),['12px','13px','14px','clamp(12px, 2vw, 14px)']);
});

test('every older stylesheet has a pin, and nothing in src/ outside src/ui is new',()=>{
  assert.deepEqual(legacy.filter(f=>!(f in pins)),[],'a stylesheet outside src/ui with no pin: new styles belong in src/ui');
  assert.deepEqual(Object.keys(pins).filter(f=>!legacy.includes(f)),[],'a pinned stylesheet is gone: remove its pin');
});

test('no older stylesheet gains a colour or a font size, and one that loses one lowers its pin',()=>{
  const report:string[]=[];
  for(const file of legacy){
    const css=readFileSync(new URL(file,src),'utf8');
    const now={colours:colours(css).size,sizes:sizes(css).size},pin=pins[file];
    if(!pin)continue;
    for(const key of ['colours','sizes'] as const){
      if(now[key]>pin[key])report.push(`${file}: ${now[key]} distinct ${key}, more than the ${pin[key]} pinned. Use the src/ui tokens instead.`);
      if(now[key]<pin[key])report.push(`${file}: ${now[key]} distinct ${key}, fewer than the ${pin[key]} pinned. Lower the pin to ${now[key]} in tests/ui-ratchet.test.ts.`);
    }
  }
  assert.deepEqual(report,[]);
});
