import type {Block} from '../model';
/** Default demo anchors are kind-prioritized, never hijacked by earlier inserted sections.
 * This is not a user-defined navigation/route contract.
 */
export function demoAnchor(blocks:readonly Block[],name:'collection'|'contact'){
 const priority=name==='collection'?['products','cta','footer']:['footer','cta'];
 for(const kind of priority){const b=blocks.find(b=>b.kind===kind);if(b)return `block-${b.id}`;}
 return 'top';
}
