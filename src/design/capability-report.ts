import type {Project} from '../model';
import {componentIdentity} from '../components';
import {providers,supportsProvider} from '../providers';
import {collectionRows} from './collection';

/** Consumer-side inventory, not an assertion that an imported OmD system is adopted. */
export function capabilityReport(project:Project){
 return {
  schema:'aphrodite.capability-report/1',
  authority:'consumer-runtime-inventory',
  activePageId:project.activePageId,
  referenceConformance:{status:'not-assessed',note:'Token selection and adapter availability do not establish full source-rule conformance or OmD Bound/Proven status.'},
  pageExperience:{
   staticVerticalFlow:'implemented',
   fullPageReferenceCoverage:'not-assessed',
   inferredBelowFoldContent:'not-assessed',
   scrollMotionContract:'not-implemented',
   pinnedHorizontalOrScaleTimeline:'not-implemented',
   note:'Existing component-local prototype interactions are not a scroll timeline. Capture whole-page and interaction evidence before proposing one.',
  },
  pages:project.pages.map(page=>({pageId:page.id,nodes:page.blocks.map(block=>{
   const identity=componentIdentity(block),provider=identity.provider;
   return {
    instanceId:block.id,...identity,
    adapterAvailable:supportsProvider(provider,block.kind),
    implementation:providers[provider].source,
    tokenMapping:provider==='astryx'||provider==='seed'?'provider-default-theme':provider==='own'?'project-owned-css':'project-token-adapter',
    missingImageSlots:block.kind==='products'?collectionRows(block).filter(row=>!row.image).map(row=>row.index):block.kind==='hero'&&block.options?.media!=='calendar'&&!block.image?[0]:[],
    mediaRights:'not-assessed',
   };
  })})),
 };
}
