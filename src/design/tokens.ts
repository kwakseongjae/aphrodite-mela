/**
 * The semantic half of the design contract.
 *
 * A design system that only carries a brand colour, a paper and an ink cannot say what a quiet layer,
 * a divider or an error looks like — so the renderer decided those itself, in constants. Importing a
 * brand left its notices the wrong red. These tokens move those decisions into the contract.
 *
 * Every default here is what the renderer paints today. Wiring a token up must not change a single
 * pixel; only a design system that names one may do that. The one exception is `muted`, called out
 * below, because today that is an opacity rather than a colour.
 */
export const semanticTokens = ['surface', 'line', 'muted', 'danger', 'success', 'warning'] as const;
export type SemanticToken = typeof semanticTokens[number];

export type TypeRole = {family?: string; size?: number; weight?: number; lineHeight?: number};
export const typeRoles = ['heading', 'body', 'caption'] as const;
export type TypeRoleName = typeof typeRoles[number];
export type TypeScale = Partial<Record<TypeRoleName, TypeRole>>;

/**
 * What the renderer paints today.
 *
 * `line` is already referenced as `var(--line, #dfe3eb)` in the page css and has simply never been
 * fed, so feeding it is pure wiring. `danger`, `success` and `warning` are the constants the notice
 * component paints. `surface` is the quiet layer behind media. `muted` is the exception: secondary
 * text is dimmed with opacity today, so its default is derived from the ink over the paper, which
 * matches what you see over a paper background and not over a picture.
 */
export const paintedToday: Record<Exclude<SemanticToken, 'muted'>, string> = {
  surface: '#d9d4c8',
  line: '#dfe3eb',
  danger: '#ba3030',
  success: '#187345',
  warning: '#a76600',
};

/** How faded secondary text is today, as an opacity. */
export const MUTED_MIX = 0.7;

export function isColour(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);
}

const channel = (hex: string, at: number) => parseInt(hex.slice(at, at + 2), 16);

/** The colour text at `MUTED_MIX` opacity resolves to over the paper. */
export function mix(front: string, back: string, ratio = MUTED_MIX): string {
  if (!isColour(front) || !isColour(back)) return front;
  const blend = (at: number) => Math.round(channel(front, at) * ratio + channel(back, at) * (1 - ratio));
  return `#${[1, 3, 5].map(at => blend(at).toString(16).padStart(2, '0')).join('')}`;
}

/** Every semantic token with a value: what the system says, or what the renderer paints today. */
export function resolveTokens(system: {foreground: string; background: string} & Partial<Record<SemanticToken, string>>): Record<SemanticToken, string> {
  return {
    surface: isColour(system.surface) ? system.surface : paintedToday.surface,
    line: isColour(system.line) ? system.line : paintedToday.line,
    muted: isColour(system.muted) ? system.muted : mix(system.foreground, system.background),
    danger: isColour(system.danger) ? system.danger : paintedToday.danger,
    success: isColour(system.success) ? system.success : paintedToday.success,
    warning: isColour(system.warning) ? system.warning : paintedToday.warning,
  };
}

/**
 * The css a page is painted with, for the semantic half.
 *
 * `muted` is handled differently on purpose. Secondary text is dimmed with opacity today, at five
 * different strengths, and opacity has a property a single colour does not: it adapts to whatever is
 * behind it. So the fade stays unless a design system actually names a muted colour, and then the
 * colour takes over at full strength. A system that says nothing leaves the page exactly as it was.
 */
export function tokenVars(system: {foreground: string; background: string} & Partial<Record<SemanticToken, string>>): string {
  const resolved = resolveTokens(system);
  const parts = semanticTokens.filter(name => name !== 'muted').map(name => `--${name}:${resolved[name]}`);
  if (isColour(system.muted)) parts.push(`--muted:${system.muted}`, '--muted-fade:1');
  return parts.join(';');
}

/** Keeps only what a page can actually be painted with, and says nothing it cannot honour. */
export function sanitizeTypeRole(value: unknown): TypeRole | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  const role: TypeRole = {};
  if (typeof raw.family === 'string') role.family = raw.family;
  if (typeof raw.size === 'number' && raw.size >= 8 && raw.size <= 200) role.size = Math.round(raw.size);
  if (typeof raw.weight === 'number' && raw.weight >= 100 && raw.weight <= 900) role.weight = Math.round(raw.weight / 100) * 100;
  if (typeof raw.lineHeight === 'number' && raw.lineHeight >= 0.8 && raw.lineHeight <= 3) role.lineHeight = Math.round(raw.lineHeight * 100) / 100;
  return Object.keys(role).length ? role : undefined;
}

export function sanitizeTypeScale(value: unknown): TypeScale | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  const scale: TypeScale = {};
  for (const name of typeRoles) {
    const role = sanitizeTypeRole(raw[name]);
    if (role) scale[name] = role;
  }
  return Object.keys(scale).length ? scale : undefined;
}
