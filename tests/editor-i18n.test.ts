import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {controlText} from '../src/i18n';

const main=readFileSync(new URL('../src/main.ts',import.meta.url),'utf8');
const i18n=readFileSync(new URL('../src/i18n.ts',import.meta.url),'utf8');

const chrome=[
  'Look & feel','Component properties','Layout & nesting','Preview','Export',
  'Approve direction','Assembly console','Pin selected frame','Insert at page root',
  'Design mode','Get Vibe','Start from a brief','Choose design system',
  'Selected component','Color palette','Ready to export','Import your DESIGN.md',
  'Agent assembly console','A little guidance','Set the direction','Make it tangible',
  'Make it real','Add a section','Click to edit · Drag to compose',
  'THE DESIGN WORKBENCH','Shape it. Then build it','A little structure. A lot of possibility.',
  'Direction, decided.','Like where this is going?','Reference','Manage project',
  'Page options','Component variation','Parent frame','Page root',
];

function escapeRe(value:string){return value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}
function wrapped(phrase:string){
  const q=escapeRe(phrase);
  return new RegExp(`(?:ui|control)\\(\\s*['"\`]${q}['"\`]`).test(main)
    || new RegExp(`['"\`]${q}['"\`]\\s*:`).test(i18n);
}

test('controlText maps representative editor chrome labels to Korean and leaves English unchanged',()=>{
  assert.equal(controlText('Preview','ko'),'미리보기');
  assert.equal(controlText('Export','ko'),'내보내기');
  assert.equal(controlText('Approve direction','ko'),'방향 승인');
  assert.equal(controlText('Start from a brief','ko'),'브리프로 시작');
  assert.equal(controlText('Choose design system','ko'),'디자인 시스템 선택');
  assert.equal(controlText('Get Vibe','ko'),'Get Vibe');
  assert.equal(controlText('Draft','ko'),'초안');
  assert.equal(controlText('Filled','ko'),'채움');
  assert.equal(controlText('Preview','en'),'Preview');
  assert.equal(controlText('Approve direction','en'),'Approve direction');
});

test('editor chrome strings are wrapped in ui/control or listed in controls, not bare template text',()=>{
  assert.ok(chrome.length>=25);
  for(const phrase of chrome){
    assert.ok(wrapped(phrase),`expected ${phrase} inside ui(/control( or controls`);
    assert.equal(main.includes(`>${phrase}<`),false,`bare HTML text ${phrase}`);
  }
});
