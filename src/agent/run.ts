import {fingerprint,type Project} from '../model';
export type RunEvent={seq:number;at:string;kind:string;pageId:string;revision:string;details:Record<string,unknown>};
export type AssemblyRun={schema:'aphrodite.assembly-run/1';id:string;startedAt:string;endedAt?:string;status:'assembling'|'review-requested'|'ended';intent:string;modelLabel:string;projectId:string;initialRevision:string;environment:{width:number;height:number;appVersion:string};events:RunEvent[];dropped:number;usage:null;recording:null};
export function newRun(p:Project,intent:string,modelLabel:string,width:number,height:number):AssemblyRun{
 return {schema:'aphrodite.assembly-run/1',id:crypto.randomUUID(),startedAt:new Date().toISOString(),status:'assembling',intent:intent.slice(0,1200),modelLabel:modelLabel.slice(0,100),projectId:p.id,initialRevision:fingerprint(p),environment:{width,height,appVersion:'0.1.0'},events:[],dropped:0,usage:null,recording:null};
}
export function appendEvent(run:AssemblyRun,p:Project,kind:string,details:Record<string,unknown>={}){
 if(run.status==='ended')return;
 if(run.events.length>=500){run.dropped++;return;}
 run.events.push({seq:run.events.length+1,at:new Date().toISOString(),kind:kind.slice(0,80),pageId:p.activePageId,revision:fingerprint(p),details});
}
export function changeReceipt(before:Project,after:Project){
 const old=new Map(before.pages.flatMap(p=>p.blocks).map(b=>[b.id,b]));
 const nodes=after.pages.flatMap(p=>p.blocks);
 const changed=nodes.filter(b=>JSON.stringify(old.get(b.id))!==JSON.stringify(b));
 return {projectId:after.id,changedNodes:changed.map(b=>({id:b.id,kind:b.kind,parentId:b.parentId??null,layout:b.layout??{},fields:old.has(b.id)?[...new Set([...Object.keys(old.get(b.id)!),...Object.keys(b)])].filter(k=>JSON.stringify(old.get(b.id)![k as keyof typeof b])!==JSON.stringify(b[k as keyof typeof b])):['added']})),pageOrders:after.pages.filter(p=>JSON.stringify(before.pages.find(old=>old.id===p.id)?.blocks.map(b=>b.id))!==JSON.stringify(p.blocks.map(b=>b.id))).map(p=>({pageId:p.id,nodeIds:p.blocks.map(b=>b.id)})),removedIds:[...old.keys()].filter(id=>!nodes.some(b=>b.id===id)),savedRevision:fingerprint(after)};
}
export function readRun(raw:string):AssemblyRun|null{
 try{if(raw.length>2_000_000)return null;const r=JSON.parse(raw) as AssemblyRun;
 if(r?.schema!=='aphrodite.assembly-run/1'||typeof r.id!=='string'||! /^[a-zA-Z0-9-]{1,100}$/.test(r.id)||!['assembling','review-requested','ended'].includes(r.status)||typeof r.intent!=='string'||r.intent.length>1200||typeof r.modelLabel!=='string'||r.modelLabel.length>100||typeof r.startedAt!=='string'||typeof r.projectId!=='string'||!Array.isArray(r.events)||r.events.length>500||!Number.isInteger(r.dropped)||r.dropped<0||!r.events.every(e=>e&&typeof e.kind==='string'&&e.kind.length<=80&&typeof e.at==='string'&&typeof e.revision==='string'&&typeof e.pageId==='string'&&Number.isInteger(e.seq)))return null;
 return r;}catch{return null;}
}
