import type { Block, BlockKind, Project } from './model';
import { catalog } from './model';
import { patternVariants, patternSpecs } from './patterns';
import { providers } from './providers';
import {componentAccent} from './design/component-theme';

// Project-owned registry, shared by canvas, standalone HTML and handoff.
export const componentRegistry: Record<BlockKind, { id: string; version: number; variants: string[]; slots: string[]; tokens: string[]; source: string }> = Object.fromEntries(
  catalog.map(({kind}) => [kind, {
    id: `aphrodite.${kind}`, version: 1, variants: [...patternVariants(kind)],
    slots: ['title', 'text', 'label', ...(['hero', 'products'].includes(kind) ? ['image'] : []), ...(kind === 'hero' ? ['eyebrow'] : []),...(kind==='products'?['description','itemImages']:[])],
    tokens: ['accent', 'background', 'foreground', 'radius', 'font'], source: 'Aphrodite original · src/render.ts + src/page.css',
  }]),
) as Record<BlockKind, { id: string; version: number; variants: string[]; slots: string[]; tokens: string[]; source: string }>;
export function componentIdentity(block: Block) {
  const component = componentRegistry[block.kind];
  return { componentId: block.provider && block.provider!=='own'?`${block.provider}.${block.kind}`:component.id, componentVersion: component.version, variant: block.variant ?? component.variants[0], provider:block.provider??'own', ...(block.theme?{theme:block.theme}:{}) };
}
export function sceneManifest(project: Project) {
  return { schema: 'aphrodite.scene/1', activePageId: project.activePageId, componentThemes:project.pages.flatMap(page=>page.blocks.filter(b=>b.theme).map(b=>({instanceId:b.id,policy:b.theme,resolvedAccent:componentAccent(b,project.system.accent)}))), authority: 'Mixed: official React adapters, adapted shadcn source, and project-owned patterns. See providers and node provider.', providers, registry: componentRegistry, patternSpecifications: patternSpecs,
    pages: project.pages.map(page => ({ id: page.id, name: page.name, referenceEvidence: page.referenceEvidence,
      nodes: page.blocks.map(b => ({ instanceId: b.id, ...componentIdentity(b), parentId:b.parentId, layout:b.layout??{}, options: b.options ?? {}, children: b.kind==='hero' && b.options?.media==='calendar' ? [{instanceId:`${b.id}-media`,componentId:'aphrodite.calendar',componentVersion:1,variant:'week',slots:{text:b.options.mediaText ?? patternSpecs.calendar.text}}] : [], slots: Object.fromEntries(componentRegistry[b.kind].slots.map(slot => [slot, b[slot as keyof Block] ?? ''])) })) })) };
}
