/**
 * DESIGN.md — the contract a person hands to whoever builds this.
 *
 * It lives apart from the exporter on purpose: this is a statement of what the design *is*, and
 * nothing in it should need the renderer to produce. That also means it can be read in a test.
 *
 * The colours written here are the ones the pages are actually painted with, resolved rather than
 * only what the system happens to name, because a developer reading this needs the real value.
 */
import {isApproved, type DesignSystem, type Project} from '../model';
import {semanticTokens, resolveTokens, typeRoles, type TypeRole} from './tokens';
import {fontStack} from './fonts';

/** Token names an imported system defined that nothing here paints. Written back so they survive. */
function carriedLines(s: DesignSystem): string {
  const carried = s.carried ?? {};
  const names = Object.keys(carried).sort();
  if (!names.length) return '';
  return `\n\n<!-- design-md:carried -->\nCarried from the imported system, not painted by this prototype:\n${names.map(name => `${name}: ${carried[name]}`).join('\n')}`;
}

/** A type role as one readable line, or nothing when the system does not describe it. */
function typeLine(name: string, role?: TypeRole): string {
  if (!role) return '';
  const parts = [role.family && `family ${role.family}`, role.size && `${role.size}px`, role.weight && `weight ${role.weight}`, role.lineHeight && `line-height ${role.lineHeight}`].filter(Boolean);
  return parts.length ? `\n${name}: ${parts.join(', ')}` : '';
}

export function designMarkdown(p: Project): string {
  const s = p.system;
  return `# ${p.name.replace(/[\r\n]/g, ' ')} Design System

<!-- design-md:section experience -->
## 1. Experience
Project-owned prototype brief: ${p.brief}
Primary task: help visitors understand this offering and discover its collection or next action.
Direction: ${s.name}. ${s.description}. Preserve the reviewed visual hierarchy; avoid adding unsupported product claims.

<!-- design-md:section foundations -->
## 2. Foundations
primary: ${s.accent}
background: ${s.background}
foreground: ${s.foreground}
${semanticTokens.map(name => `${name}: ${resolveTokens(s)[name]}`).join('\n')}
radius: ${s.radius}px
Section padding: 5% desktop, 7% mobile. Base spacing unit: 4px. No required animation. Respect prefers-reduced-motion.${carriedLines(s)}

<!-- design-md:section typography-assets -->
## 3. Typography & Assets
heading font: ${fontStack({family: s.headingFamily, category: s.font})}
body font: ${fontStack({family: s.bodyFamily, category: 'sans'})}${typeRoles.map(name => typeLine(name, s.type?.[name])).join('')}
These are the stacks the pages are actually painted with, including the Korean faces the Latin ones cannot draw. No brand fonts are bundled; a reader without one falls through the list.
Use the exact CSS metrics in index.html and the other page HTML files. Photography is reference material; see ASSETS.md. User-uploaded images retain their user's rights and require review before publishing.

<!-- design-md:section components-states -->
## 4. Components & States
${[...new Set(p.pages.flatMap(page => page.blocks.map(b => b.kind)))].map(k => `- ${k}: preserve the exported anatomy, content, order, token bindings and responsive behavior.`).join('\n')}
Links use native anchor semantics and visible keyboard focus. Pattern variations, density, columns and selected state are stored in SCENE.json.options. Hero calendar composition has a child identity. Preserve these settings rather than guessing a replacement layout. Table search/status filtering, radio-based view switching, input editing and local button feedback are prototype interactions. Loading/error/empty are manually selected design states, not live data-fetch states. No backend persistence, real calendar arithmetic or scheduling drag operations are implemented.

<!-- design-md:section layout-platforms -->
## 5. Layout & Platforms
Website layouts use a fluid page container. At 500px or below, hero, product grid and CTA stack; tertiary navigation hides. Preserve task reading order. Validate 375px mobile and 1440px desktop when implementing. The editor is a desktop workbench; exported pages reflow independently.

<!-- design-md:section content-locales -->
## 6. Content & Locales
User-authored copy is preserved without translation. HTML selects ko when page content contains Korean, otherwise en. Legacy furniture samples and prices are fictional. New product patterns contain explicitly illustrative Korean data; replace it before publishing. The editor's helper text is not product copy.

<!-- design-md:section governance -->
## 7. Governance
Authority kind: project-owned prototype brief; this is not an adopted OmD Bound System or a certified Portable Core document.
Priority: explicit user instruction, repository facts, this project contract, then external inspiration. Unknown values remain absent at the smallest unresolved boundary. Extensions must be reviewed and recorded before adopting them. Changes invalidate the workbench's visual approval.
Review status: ${isApproved(p) ? 'Visually approved in Aphrodite for this exact project content.' : 'Draft; visual approval still required.'}
Reference provenance: ${s.source}
The original imported DESIGN.md, if present, is preserved in SOURCE-DESIGN.md. This projection does not silently claim to implement every rule from that source.
`;
}
