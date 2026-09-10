import type {BlockKind} from '../model';

// Only authored scaffolding, never OCR copy or the project's name.
export const referenceDefaults:Partial<Record<BlockKind,Partial<Record<'title'|'text'|'label',string>>>>={
 features:{title:'The details that make a difference.',text:'Your first benefit|Describe a useful, specific benefit.\nYour second benefit|Add a reason to believe.\nYour third benefit|Explain what comes next.',label:'WHAT TO EXPECT'},
 cta:{title:'Take the next step.',text:'Replace this with a clear invitation for your audience.',label:'Get in touch'},
 footer:{text:'Your brand statement.',label:'Contact · Privacy'},
};
