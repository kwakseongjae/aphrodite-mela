import {systems,type DesignSystem} from '../model';
export const referenceSources=[
 {id:'karrot',name:'Karrot · SEED product',sha256:'09df85980a8ae2f45e3c936b62f2549fcaf4660904fffee91c9d59d4effca087',path:'web/references/karrot/DESIGN.md',scope:'SEED product tokens; marketing primary excluded',adopted:['tokens.colors.primary','tokens.colors.canvas','tokens.colors.foreground','tokens.rounded.md'],unmapped:['Typography metrics','Spacing scale','Component states','Marketing variants']},
 {id:'toss',name:'Toss · TDS product',sha256:'115778c526c36b165ad5828b95637c2289c05735e5d81d8a00c4c7d195c50c32',path:'web/references/toss/DESIGN.md',scope:'TDS product colors; toss.im marketing primary excluded',adopted:['tokens.colors.primary','tokens.colors.canvas','tokens.colors.foreground'],unmapped:['Toss Product Sans (not bundled)','Component-specific radii','Spacing scale','Component states']}
];
export async function verifyReference(id:string,markdown:string):Promise<DesignSystem>{
 const source=referenceSources.find(s=>s.id===id);if(!source)throw new Error('Unknown reference');
 const bytes=new TextEncoder().encode(markdown);
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(b=>b.toString(16).padStart(2,'0')).join('');
 if(hash!==source.sha256)throw new Error('Reference hash mismatch. Refresh the reviewed source snapshot before applying.');
 return {...systems.find(s=>s.id===id)!,originalMarkdown:markdown,source:`oh-my-design canonical snapshot: ${source.path}; sha256=${hash}; locally inspected 2026-09-09. ${source.scope}. Mapped: ${source.adopted.join(', ')}. Unmapped: ${source.unmapped.join(', ')}. Project font and global radius outside those claims are Aphrodite decisions, not company facts. Not an OmD Bound System.`};
}
export function referenceIssue(id:string,missing:string){
 const source=referenceSources.find(s=>s.id===id);
 return `# [Aphrodite integration] ${source?.name??'Custom system'} coverage request\n\nStatus: local proposal, not submitted.\n\n## Source\n${source?`${source.path}\nSHA-256: ${source.sha256}`:'User-supplied source; attach the exact DESIGN.md and its hash.'}\n\n## Consumer need\n${missing.slice(0,2000)}\n\n## Existing contracts\nReuse list_references, get_design_md and search_by_vibe; inspect PortableReferenceAst before adding a parallel format.\n\n## Acceptance\n- Return field-level source/surface and exact source hash.\n- Preserve unknown-as-absence; distinguish project decisions from observed tokens.\n- List adapter/component coverage independently of brand token coverage.\n- Font and imagery rights/availability are explicit.\n- Candidate import never implies owner adoption.\n\n## Owner decision\nChoose whether this belongs in the existing AST/MCP contract or in Aphrodite's adapter layer.\n`;
}
