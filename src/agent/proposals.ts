import {esc} from '../html';
import {type Page, type PageProposal, type Project} from '../model';
import {FRAME_GAP, frameWidth, type FrameLayout} from '../editor/space';

export const PROPOSAL_ROW_OFFSET=1400;

function sourceLayout(project:Project,fromPageId:string):FrameLayout{
  return project.space?.frames[fromPageId]??{x:0,y:0,preset:'desktop'};
}

function dropPage(project:Project,id:string):void{
  project.pages=project.pages.filter(p=>p.id!==id);
  if(project.space)delete project.space.frames[id];
}

/** Appends cloned candidate pages as a row under the source frame. Mutates `project`. */
export function placeProposals(project:Project,fromPageId:string,candidates:{page:Page;label:string}[],kind:PageProposal['kind']):string[]{
  if(project.pages.length+candidates.length>30)throw new Error('Page limit');
  const src=sourceLayout(project,fromPageId);
  const step=frameWidth(src)+FRAME_GAP;
  if(!project.space)project.space={frames:{}};
  const ids:string[]=[];
  candidates.forEach((candidate,i)=>{
    const page=structuredClone(candidate.page);
    page.proposal={fromPageId,label:candidate.label,kind};
    project.pages.push(page);
    project.space!.frames[page.id]={
      x:src.x+i*step,
      y:src.y+PROPOSAL_ROW_OFFSET,
      preset:src.preset,
      ...(src.width!==undefined?{width:src.width}:{}),
    };
    ids.push(page.id);
  });
  return ids;
}

export function proposalsOf(project:Project,fromPageId:string):Page[]{
  return project.pages.filter(p=>p.proposal?.fromPageId===fromPageId);
}

export function resolveProposal(project:Project,chosenPageId:string,mode:'replace'|'keep'):void{
  const chosen=project.pages.find(p=>p.id===chosenPageId);
  const proposal=chosen?.proposal;
  if(!chosen||!proposal)return;
  const source=project.pages.find(p=>p.id===proposal.fromPageId);
  if(!source)return;
  const siblings=proposalsOf(project,proposal.fromPageId);
  if(mode==='replace'){
    source.blocks=structuredClone(chosen.blocks);
    for(const page of siblings)dropPage(project,page.id);
    project.activePageId=source.id;
    return;
  }
  const label=proposal.label;
  delete chosen.proposal;
  chosen.name=`${source.name} · ${label}`;
  for(const page of siblings)if(page.id!==chosen.id)dropPage(project,page.id);
  if(!project.pages.some(p=>p.id===project.activePageId))project.activePageId=source.id;
}

export function discardProposals(project:Project,fromPageId:string):number{
  const ids=proposalsOf(project,fromPageId).map(p=>p.id);
  for(const id of ids)dropPage(project,id);
  if(!project.pages.some(p=>p.id===project.activePageId))project.activePageId=fromPageId;
  return ids.length;
}

export function proposalBadgeHtml(page:Page,language:'en'|'ko'):string{
  if(!page.proposal)return '';
  const text=language==='ko'?`제안 · ${page.proposal.label}`:`Proposal · ${page.proposal.label}`;
  return `<span class="frame-proposal" data-proposal-kind="${esc(page.proposal.kind)}">${esc(text)}</span>`;
}
