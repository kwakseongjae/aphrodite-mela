import {test} from 'node:test';
import assert from 'node:assert/strict';
import {importDesignGraph,importSummary,plainName,matchToken,matchRole} from '../src/design/omd';

const colour=(value:string)=>({$type:'color',$value:value});
const graph=(tokens:Record<string,unknown>,roles:unknown[]=[])=>({
  $schema:'design-system-graph-v2',schema_version:'2.0.0',
  identity:{kind:'project-system',name:'Toss'},
  foundations:{tokens},typography_assets:{roles},
});

test('a namespace and a version prefix say where a token lives, not what it is',()=>{
  assert.equal(plainName('color.v2-primary'),'primary');
  assert.equal(plainName('--brand'),'brand');
  assert.equal(plainName('palette.Surface Grey'),'surface-grey');
  assert.equal(plainName('color.on-primary'),'on-primary','a modifier is not trimmed away');
  assert.equal(plainName('color.primary-deep'),'primary-deep');
});

test('only the name itself matches, never a name it merely ends with',()=>{
  assert.equal(matchToken('color.border'),'line');
  assert.equal(matchToken('hairline'),'line');
  assert.equal(matchToken('color.error-red'),'danger');
  assert.equal(matchToken('color.on-primary'),undefined,'on-primary is its own thing');
  assert.equal(matchToken('color.primary-deep'),undefined);
  assert.equal(matchToken('spacing.large'),undefined);
});

test('a real system lands and says how much of it landed',()=>{
  const result=importDesignGraph(graph({
    'color.primary':colour('#3182f6'),
    'color.canvas':colour('#ffffff'),
    'color.foreground':colour('#191f28'),
    'color.surface':colour('#f2f4f6'),
    'color.border':colour('#e5e8eb'),
    'color.muted':colour('#8b95a1'),
    'color.error':colour('#e42939'),
    'color.on-primary':colour('#ffffff'),
    'spacing.gutter':{$type:'dimension',$value:'16px'},
  }));
  assert.equal(result.accent,'#3182f6');
  assert.equal(result.background,'#ffffff');
  assert.deepEqual(result.tokens,{surface:'#f2f4f6',line:'#e5e8eb',muted:'#8b95a1',danger:'#e42939'});
  assert.deepEqual(Object.keys(result.carried),['color.on-primary'],'what we cannot paint is kept, not lost');
  assert.deepEqual(result.report,{read:9,painted:7,carried:1,skipped:1,name:'Toss'});
  assert.match(importSummary(result.report,true),/9개 중 7개를 화면에 적용하고, 1개는 그대로 보관/);
  assert.match(importSummary(result.report,false),/Of 9 tokens, 7 are painted and 1 carried/);
});

test('whichever name a document lists first does not get to win',()=>{
  // `body` before `muted`, the shape that once made us take a brand's body colour for its muted one.
  const result=importDesignGraph(graph({
    'color.body':colour('#4e5968'),
    'color.muted':colour('#8b95a1'),
  }));
  assert.equal(result.tokens.muted,'#8b95a1');
  assert.equal(result.carried['color.body'],'#4e5968');
});

test('a dark and light pair is carried rather than guessed at',()=>{
  const result=importDesignGraph(graph({
    'color.v2-bg-dark':colour('#0a0a0f'),
    'color.v2-bg-light':colour('#fafafa'),
    'color.v2-primary':colour('#5546ff'),
  }));
  assert.equal(result.accent,'#5546ff');
  assert.equal(result.background,undefined,'nobody said which one the canvas is');
  assert.equal(Object.keys(result.carried).length,2);
});

test('type roles are read where they are recognised',()=>{
  const result=importDesignGraph(graph({},[
    {id:'heading-xl',usage:'headings',family:'Nanum Myeongjo',size:'48',weight:'700',line_height:'1.1'},
    {id:'ui-sans',usage:'body text',family:'Geist',weight:'500'},
    {id:'ui-mono',usage:'code',family:'Geist Mono'},
  ]));
  assert.deepEqual(result.type?.heading,{family:'Nanum Myeongjo',size:48,weight:700,lineHeight:1.1});
  assert.deepEqual(result.type?.body,{family:'Geist',weight:500});
  assert.equal(result.type?.caption,undefined,'a role we have no place for is not forced into one');
  assert.equal(matchRole('ui-mono'),undefined);
});

test('rubbish is counted rather than thrown',()=>{
  const result=importDesignGraph(graph({
    'color.broken':{$type:'color',$value:'{color.primary}'},
    'color.also-broken':{$type:'color'},
    'color.fine':colour('#123456'),
  }));
  assert.equal(result.report.skipped,2,'a reference and a missing value are skipped, not crashed on');
  assert.equal(result.report.read,3);
  assert.equal(result.carried['color.fine'],'#123456');
  assert.deepEqual(importDesignGraph(null).report,{read:0,painted:0,carried:0,skipped:0});
  assert.match(importSummary(importDesignGraph({}).report,true),/찾지 못했습니다/);
});
