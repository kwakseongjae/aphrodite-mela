/**
 * Reading a portable design-system graph (`design-system-graph-v2`).
 *
 * The same contract our DESIGN.md carries, in the structured form the upstream tool writes. Tokens
 * arrive namespaced and in DTCG shape — `color.v2-primary: {$type: "color", $value: "#5546ff"}` — so
 * the namespace is stripped before a name is matched, and anything that is not a plain colour is
 * carried rather than guessed at.
 *
 * The result always says what happened: a person importing a design system should be able to see how
 * much of it this prototype can actually paint.
 */
import {semanticTokens, tokenSynonyms, isColour, typeRoles, sanitizeTypeRole, type SemanticToken, type TypeRole, type TypeScale} from './tokens';

export type GraphImport = {
  tokens: Partial<Record<SemanticToken, string>>;
  carried: Record<string, string>;
  type?: TypeScale;
  /** What a person is told: how much of their system landed. */
  report: {read: number; painted: number; carried: number; skipped: number; name?: string};
};

/**
 * `color.v2-primary` → `primary`; `--brand` → `brand`.
 *
 * A namespace and a version prefix say where a token lives, not what it is. Everything after that is
 * left alone: `primary-deep` and `on-primary` are their own things and must not collapse into
 * `primary`, which is why this trims prefixes rather than matching suffixes.
 */
export function plainName(key: string): string {
  return key
    .replace(/^(color|colour|palette|token|semantic)\./i, '')
    .replace(/^--/, '')
    .trim().toLowerCase().replace(/[ _]+/g, '-')
    .replace(/^v\d+-/, '');
}

/** Which of our tokens a name is, if any. Preference order decides, as it does for DESIGN.md. */
export function matchToken(name: string): SemanticToken | undefined {
  const plain = plainName(name);
  for (const token of semanticTokens) {
    if (tokenSynonyms[token].some(alias => alias.replace(/ /g, '-') === plain)) return token;
  }
  return undefined;
}

/** What a role in the graph is called here. Anything else is left to the carried half. */
export function matchRole(id: string): keyof TypeScale | undefined {
  const plain = plainName(id);
  if (/^(heading|title|display|headline)/.test(plain)) return 'heading';
  if (/^(body|text|paragraph|ui-sans|default)/.test(plain)) return 'body';
  if (/^(caption|small|label|footnote|legal)/.test(plain)) return 'caption';
  return undefined;
}

const PRIMARY = ['primary', 'accent', 'brand'];
const CANVAS = ['canvas', 'background', 'bg', 'paper'];
const INK = ['foreground', 'ink', 'text-primary'];

/** Reads a graph. Never throws on a token it does not understand — it counts it. */
export function importDesignGraph(raw: unknown): GraphImport & {accent?: string; background?: string; foreground?: string} {
  const graph = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const foundations = (graph.foundations ?? {}) as Record<string, unknown>;
  const tokenMap = (foundations.tokens ?? {}) as Record<string, unknown>;
  const identity = (graph.identity ?? {}) as Record<string, unknown>;

  const tokens: Partial<Record<SemanticToken, string>> = {};
  const carried: Record<string, string> = {};
  let read = 0;
  let skipped = 0;
  let accent: string | undefined;
  let background: string | undefined;
  let foreground: string | undefined;

  // Gather first, decide second. Resolving as we walk would let whichever name a document happens to
  // list first win, which is how an earlier version of this took a brand's body colour for its muted.
  const colours = new Map<string, {key: string; colour: string}>();
  for (const [key, value] of Object.entries(tokenMap)) {
    read++;
    const token = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
    const colour = typeof token.$value === 'string' ? token.$value : '';
    if (token.$type !== 'color' || !isColour(colour)) { skipped++; continue; }
    const plain = plainName(key);
    if (!colours.has(plain)) colours.set(plain, {key, colour});
  }

  const taken = new Set<string>();
  const claim = (names: readonly string[]): string | undefined => {
    for (const name of names) {
      const hit = colours.get(name.replace(/ /g, '-'));
      if (hit && !taken.has(hit.key)) { taken.add(hit.key); return hit.colour; }
    }
    return undefined;
  };
  accent = claim(PRIMARY);
  background = claim(CANVAS);
  foreground = claim(INK);
  for (const token of semanticTokens) { const colour = claim(tokenSynonyms[token]); if (colour) tokens[token] = colour; }
  for (const {key, colour} of colours.values()) {
    if (!taken.has(key) && Object.keys(carried).length < 200) carried[key] = colour;
  }

  const roles = Array.isArray((graph.typography_assets as Record<string, unknown>)?.roles)
    ? ((graph.typography_assets as Record<string, unknown>).roles as Record<string, unknown>[])
    : [];
  const scale: TypeScale = {};
  for (const role of roles) {
    const name = typeof role?.id === 'string' ? matchRole(role.id) : undefined;
    if (!name || scale[name]) continue;
    const parsed = sanitizeTypeRole({
      family: typeof role.family === 'string' ? role.family : undefined,
      size: Number.parseFloat(String(role.size ?? '')) || undefined,
      weight: Number.parseFloat(String(role.weight ?? '')) || undefined,
      lineHeight: Number.parseFloat(String(role.line_height ?? '')) || undefined,
    });
    if (parsed) scale[name] = parsed;
  }

  const painted = Object.keys(tokens).length + [accent, background, foreground].filter(Boolean).length;
  return {
    tokens,
    carried,
    ...(Object.keys(scale).length ? {type: scale} : {}),
    accent,
    background,
    foreground,
    report: {
      read,
      painted,
      carried: Object.keys(carried).length,
      skipped,
      ...(typeof identity.name === 'string' ? {name: identity.name} : {}),
    },
  };
}

/** One sentence a person can read about what landed. */
export function importSummary(report: GraphImport['report'], ko: boolean): string {
  const {read, painted, carried, skipped} = report;
  if (!read) return ko ? '이 파일에서 토큰을 찾지 못했습니다.' : 'No tokens were found in that file.';
  return ko
    ? `토큰 ${read}개 중 ${painted}개를 화면에 적용하고, ${carried}개는 그대로 보관했습니다${skipped ? `. ${skipped}개는 색이 아니어서 읽지 않았습니다` : ''}.`
    : `Of ${read} tokens, ${painted} are painted and ${carried} carried${skipped ? `; ${skipped} were not colours and were left` : ''}.`;
}

/** The type roles, for a caller that wants them separately. */
export const graphRoleNames = typeRoles;
