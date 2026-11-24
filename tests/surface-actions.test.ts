import {test} from 'node:test';
import assert from 'node:assert/strict';
import {states,reachable} from './support/surfaces';

/**
 * 0.3-L4 ②: the surfaces drawn outside main.ts (dock, help menu, command palette, toasts, update card, welcome
 * and tour, the files dialog, the agent panel, the missing-folder banner, the language dialog) move onto the
 * system. `before` is what each offered before the move, state by state (generated from that code and pasted
 * here). A surface may change how it looks, never what it lets a person reach.
 */
const before:Record<string,string[]>={
  dock:["component-explorer[tool=add]","dock-group[group=insert]","dock-group[group=media]","dock-group[group=pointer]","dock-group[group=zoom]","dock-select[tool=select]","editor-mode[mode=agent]","editor-mode[mode=design]","editor-mode[mode=dev]","preview[tool=preview]","reference[tool=reference]","zoom-fit"],
  dockPointer:["component-explorer[tool=add]","dock-group[group=insert]","dock-group[group=media]","dock-group[group=pointer]","dock-group[group=zoom]","dock-hand[tool=hand]","dock-select[tool=select]","editor-mode[mode=agent]","editor-mode[mode=design]","editor-mode[mode=dev]","preview[tool=preview]","reference[tool=reference]","zoom-fit"],
  dockInsert:["component-explorer[tool=add]","dock-group[group=insert]","dock-group[group=media]","dock-group[group=pointer]","dock-group[group=zoom]","dock-select[tool=select]","editor-mode[mode=agent]","editor-mode[mode=design]","editor-mode[mode=dev]","new-frame[tool=frame]","preview[tool=preview]","reference[tool=reference]","zoom-fit"],
  dockMedia:["autofill[tool=vibe]","component-explorer[tool=add]","dock-group[group=insert]","dock-group[group=media]","dock-group[group=pointer]","dock-group[group=zoom]","dock-select[tool=select]","editor-mode[mode=agent]","editor-mode[mode=design]","editor-mode[mode=dev]","preview[tool=preview]","reference[tool=reference]","zoom-fit"],
  dockZoom:["component-explorer[tool=add]","dock-group[group=insert]","dock-group[group=media]","dock-group[group=pointer]","dock-group[group=zoom]","dock-select[tool=select]","editor-mode[mode=agent]","editor-mode[mode=design]","editor-mode[mode=dev]","preview[tool=preview]","reference[tool=reference]","zoom-100","zoom-fit","zoom-frame","zoom-in","zoom-out"],
  helpEn:["agent","agent-connect","brand-kit","commands","language-settings","link:https://github.com/kwakseongjae/aphrodite-mela/issues","link:https://github.com/kwakseongjae/aphrodite-mela/releases","taste","tour-start"],
  helpKo:["agent","agent-connect","brand-kit","commands","language-settings","link:https://github.com/kwakseongjae/aphrodite-mela/issues","link:https://github.com/kwakseongjae/aphrodite-mela/releases","taste","tour-start"],
  palette:["add[kind=accordion,palette]","add[kind=avatar,palette]","add[kind=badge,palette]","add[kind=breadcrumb,palette]","add[kind=button,palette]","add[kind=calendar,palette]","add[kind=cards,palette]","add[kind=checkbox,palette]","add[kind=chips,palette]","add[kind=cta,palette]","add[kind=features,palette]","add[kind=footer,palette]","add[kind=frame,palette]","add[kind=hero,palette]","add[kind=input,palette]","add[kind=navigation,palette]","add[kind=notice,palette]","add[kind=pagination,palette]","add[kind=products,palette]","add[kind=progress,palette]","add[kind=select,palette]","add[kind=skeleton,palette]","add[kind=slider,palette]","add[kind=stats,palette]","add[kind=stepper,palette]","add[kind=switch,palette]","add[kind=table,palette]","add[kind=tabs,palette]","add[kind=testimonial,palette]","add[kind=textarea,palette]","add[kind=toggle,palette]","agent[palette]","autofill[palette]","brief[palette]","component-explorer[palette]","delete[palette]","desktop[palette]","dock-hand[palette]","dock-select[palette]","duplicate[palette]","editor-mode[mode=agent,palette]","editor-mode[mode=design,palette]","editor-mode[mode=dev,palette]","export[palette]","focus-component-search[palette]","home[palette]","input#command-search","language-settings[palette]","moa-recipe[palette]","mobile[palette]","move-down[palette]","move-up[palette]","new-frame[palette]","page[id=p2,nav=fit,palette]","panel-toggle[palette,side=left]","panel-toggle[palette,side=right]","panels-all[palette]","pointer-lab[palette]","preview[palette]","redo[palette]","reference[palette]","save-project[palette]","systems[palette]","theme-review[palette]","tidy-frames[palette]","tour-start[palette]","ul#command-list","undo[palette]","welcome-show[palette]","zoom-100[palette]","zoom-fit[palette]","zoom-frame[palette]","zoom-in[palette]","zoom-out[palette]"],
  paletteQuery:["add[kind=button,palette]","add[kind=calendar,palette]","add[kind=cards,palette]","add[kind=cta,palette]","add[kind=features,palette]","add[kind=footer,palette]","add[kind=frame,palette]","add[kind=hero,palette]","add[kind=input,palette]","add[kind=navigation,palette]","add[kind=products,palette]","add[kind=stats,palette]","add[kind=table,palette]","add[kind=tabs,palette]","add[kind=testimonial,palette]","autofill[palette]","brief[palette]","component-explorer[palette]","dock-hand[palette]","dock-select[palette]","focus-component-search[palette]","home[palette]","input#command-search","moa-recipe[palette]","new-frame[palette]","page[id=p2,nav=fit,palette]","panel-toggle[palette,side=left]","panel-toggle[palette,side=right]","panels-all[palette]","pointer-lab[palette]","reference[palette]","systems[palette]","theme-review[palette]","tidy-frames[palette]","tour-start[palette]","ul#command-list","welcome-show[palette]","zoom-100[palette]","zoom-fit[palette]","zoom-frame[palette]","zoom-in[palette]","zoom-out[palette]"],
  paletteNone:["input#command-search","ul#command-list"],
  toasts:["mark:data-toast"],
  updateOffer:["details","update-dismiss","update-download","update-install","update-never","update-notes"],
  updateWorking:[],
  updateInstalling:[],
  updateRestart:["details","update-later","update-relaunch"],
  updateReady:["details","update-dismiss","update-download","update-never","update-notes","update-open"],
  updateFailed:["details","update-dismiss","update-download","update-install","update-never","update-notes"],
  welcomeEn:["set-language[lang=en]","set-language[lang=ko]","welcome-blank","welcome-dismiss","welcome-sample"],
  welcomeKo:["set-language[lang=en]","set-language[lang=ko]","welcome-blank","welcome-dismiss","welcome-sample"],
  tourFirst:["tour-next","tour-skip"],
  tourLast:["tour-skip"],
  vault:["vault-export[kind=document,name=notes.md]","vault-export[kind=image,name=hero.png]","vault-export[kind=snapshot,name=DESIGN.md]","vault-import","vault-note","vault-read[kind=document,name=notes.md]","vault-read[kind=image,name=hero.png]","vault-read[kind=snapshot,name=DESIGN.md]","vault-refresh"],
  agentPanel:["delegation-return","mark:data-delegation-receipts","mark:data-scope-frame"],
  agentPanelEmpty:["delegation-return","mark:data-delegation-receipts","mark:data-scope-frame"],
  vanished:["disk-reload","disk-start-fresh"],
  languageEditor:["field:contentLanguage","field:uiLanguage","form#language-settings-form"],
  languageHome:["field:uiLanguage","form#language-settings-form"],
};

export function dropped(){
  return Object.entries(before).flatMap(([state,was])=>{const now=new Set(reachable(states[state]()));return was.filter(x=>!now.has(x)).map(x=>state+': '+x);});
}

test('every surface still offers everything it offered before it moved onto the system',()=>{
  assert.deepEqual(Object.keys(states).sort(),Object.keys(before).sort());
  assert.deepEqual(dropped(),[]);
});

test('the check notices a control that goes missing',()=>{
  const was=states.dock;
  states.dock=()=>was().replace(/<button[^>]*data-action="zoom-fit"[^>]*>/,'<button>');
  try{assert.deepEqual(dropped(),['dock: zoom-fit']);}finally{states.dock=was;}
});
