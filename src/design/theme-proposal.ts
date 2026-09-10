import {fingerprint,type Project} from '../model';
import {contrastRatio} from './contrast';
export function themeProposal(project:Project,accent:string,font:'serif'|'sans'){
 if(!/^#[0-9a-f]{6}$/i.test(accent)||!['serif','sans'].includes(font))throw new Error('Invalid theme proposal');
 const candidate=structuredClone(project);candidate.system.accent=accent;candidate.system.font=font;
 return {base:fingerprint(project),projectId:project.id,candidate,bodyContrast:contrastRatio(candidate.system.foreground,candidate.system.background)};
}
export function applyThemeProposal(project:Project,proposal:ReturnType<typeof themeProposal>){
 if(proposal.projectId!==project.id||proposal.base!==fingerprint(project))throw new Error('Project changed since preview. Create a new preview.');
 project.system={...proposal.candidate.system};
 // Applying a draft is not visual approval or implementation authorization.
}
