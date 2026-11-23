/**
 * The batch edit vocabulary.
 *
 * One call carries a list of operations that are applied together: they land as a single undo step
 * and a single receipt, or none of them land at all. That is the difference between an agent that
 * makes a change and an agent that leaves a page half-built when its fourth call fails.
 *
 * Every op here has a counterpart a person can click — see `opAction`, which a test holds against the
 * real action table. The tool surface is a projection of the UI, never a superset of it.
 */
import {editableFields, type EditableField} from './bridge';
import {unknownValue, missingField} from './errors';
import {componentKinds} from './contract';
import {patternVariants} from '../patterns';
import {framePresets, type FramePreset} from '../editor/space';
import type {PatchOp, TextHunk} from '../ledger/patch';
import {MAX_REASON} from '../ledger/types';
import {MAX_PAGE_HTML} from '../free-page';
import {MAX_PAGE_NAME, PAGE_KEYS, BLOCK_KEYS} from '../model';
/** The first key of `value` that `known` does not name, or undefined. */
const unknownKeys = (value: Record<string, unknown>, known: ReadonlySet<string>) => Object.keys(value).find(k => !known.has(k));

export type OpKind = 'add' | 'update' | 'move' | 'delete' | 'frame' | 'page' | 'html_page' | 'html_set' | 'html_replace' | 'media_add';
export type Op =
  | {op: 'add'; component_kind: string; variant?: string; before_block_id?: string; content?: Partial<Record<EditableField, string>>}
  | {op: 'update'; block_id: string; fields: Partial<Record<EditableField, string>>; variant?: string; image?: string}
  | {op: 'move'; block_id: string; direction: 'up' | 'down'}
  | {op: 'delete'; block_id: string}
  | {op: 'frame'; page_id?: string; preset: FramePreset}
  | {op: 'page'; name: string; preset?: FramePreset; page_id?: string}
  | {op: 'html_page'; name: string; html: string; width?: number; height?: number}
  | {op: 'html_set'; page_id: string; html: string}
  | {op: 'html_replace'; page_id: string; find: string; replace: string; all?: boolean}
  | {op: 'media_add'; path?: string; library_id?: string; name?: string};

export const MAX_OPS = 100;
export const MAX_TEXT = 4_000;
/** The person's current selection, usable anywhere a block_id is. */
export const SELECTION = 'selection';
export const opKinds: readonly OpKind[] = ['add', 'update', 'move', 'delete', 'frame', 'page', 'html_page', 'html_set', 'html_replace', 'media_add'];

/**
 * The control a person would reach for to do the same thing as each op — a button with a data-action,
 * or an inspector field. The ops share the mutation functions those controls use rather than
 * dispatching them, because one click per op would mean one undo entry per op and the batch would
 * stop being one reviewable change. The correspondence still has to hold, and a test checks that each
 * of these controls really exists: an op with no way for a person to do it would leave an agent that
 * reads labels off the screen quietly behind.
 */
export type OpControl = {kind: 'action' | 'attribute'; name: string} | {kind: 'gesture'; name: 'media-drop'} | {kind: 'not-yet'; until: string; why: string};
/* Writing a page's html has no control a person can reach yet: hand editing inside a page is 0.4 (plan
   §16.4), and until then an agent writes the html and a person reads, undoes and decides. Each of these
   is a named exception, pinned by tests/agent-op-actions.test.ts, not a gap that can quietly grow. */
const HAND_EDITING: OpControl = {kind: 'not-yet', until: '0.4', why: 'a person edits inside an html page by hand from 0.4; until then they see the page, undo it and decide'};
export const opControl: Record<OpKind, OpControl> = {
  add: {kind: 'action', name: 'add'},
  update: {kind: 'attribute', name: 'data-field'},
  move: {kind: 'action', name: 'move-up'},
  delete: {kind: 'action', name: 'delete-block'},
  page: {kind: 'action', name: 'new-frame'},
  frame: {kind: 'attribute', name: 'data-frame-preset'},
  html_page: HAND_EDITING,
  html_set: HAND_EDITING,
  html_replace: HAND_EDITING,
  // A person puts a picture or a video on the board by dropping it there (edit.media).
  media_add: {kind: 'gesture', name: 'media-drop'},
};

const str = (value: unknown, max = MAX_TEXT): string | undefined =>
  typeof value === 'string' && value.length <= max ? value : undefined;
const ID = /^[a-zA-Z0-9_-]{1,200}$/;

function blockId(raw: unknown, where: string): {id: string} | {error: string} {
  const value = str(raw, 200);
  if (!value) return {error: missingField(`${where}.block_id`, `"block_id": "${SELECTION}" (or an id from aphrodite_get_contract)`)};
  if (value === SELECTION) return {id: SELECTION};
  if (!ID.test(value)) return {error: `${where}.block_id "${value}" is not an id. Use "${SELECTION}", or a block_id from aphrodite_get_contract.`};
  return {id: value};
}

function contentFields(raw: unknown, where: string): {fields: Partial<Record<EditableField, string>>} | {error: string} {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {error: `${where} must be an object of fields, for example {"title": "Light, made meaningful"}`};
  }
  const fields: Partial<Record<EditableField, string>> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!(editableFields as readonly string[]).includes(key)) {
      return {error: unknownValue(`${where} field`, key, editableFields)};
    }
    const text = str(value);
    if (text === undefined) return {error: `${where}.${key} must be a string of at most ${MAX_TEXT} characters.`};
    fields[key as EditableField] = text;
  }
  if (!Object.keys(fields).length) return {error: `${where} is empty. Name at least one of: ${editableFields.join(', ')}.`};
  return {fields};
}

function parseOne(raw: unknown, index: number): {op: Op} | {error: string} {
  const where = `ops[${index}]`;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {error: `${where} must be an object.`};
  const o = raw as Record<string, unknown>;
  const kind = str(o.op, 20);
  if (!kind || !(opKinds as readonly string[]).includes(kind)) {
    return {error: unknownValue(`${where}.op`, String(o.op ?? ''), opKinds)};
  }
  switch (kind as OpKind) {
    /* A free page: made with its whole document, replaced whole, or changed one exact passage at a time.
       What the html may hold is the app's to say once it is in place (src/free-page.ts). */
    case 'html_page': {
      const name = str(o.name, 60);
      if (!name) return {error: `${where}.name is required: give the page a name, for example "Briefing".`};
      const html = str(o.html, MAX_PAGE_HTML);
      if (html === undefined) return {error: `${where}.html must be the page's whole document, a string of at most ${MAX_PAGE_HTML.toLocaleString('en')} characters.`};
      const op: Extract<Op, {op: 'html_page'}> = {op: 'html_page', name, html};
      for (const [key, low, high] of [['width', 240, 3200], ['height', 100, 20_000]] as const) {
        if (o[key] === undefined) continue;
        const n = o[key];
        if (typeof n !== 'number' || !Number.isFinite(n) || n < low || n > high) return {error: `${where}.${key} is a number of pixels from ${low} to ${high}.`};
        op[key] = Math.round(n);
      }
      return {op};
    }
    case 'html_set':
    case 'html_replace': {
      const page = str(o.page_id, 200);
      if (!page || !ID.test(page)) return {error: missingField(`${where}.page_id`, '"page_id": "<an html page id from aphrodite_get_contract>"')};
      if (kind === 'html_set') {
        const html = str(o.html, MAX_PAGE_HTML);
        if (html === undefined) return {error: `${where}.html must be the page's whole document, a string of at most ${MAX_PAGE_HTML.toLocaleString('en')} characters.`};
        return {op: {op: 'html_set', page_id: page, html}};
      }
      const find = str(o.find, MAX_PAGE_HTML), replace = str(o.replace, MAX_PAGE_HTML);
      if (!find) return {error: `${where}.find must be the exact passage to change, as aphrodite_get_page_html returns it (not empty).`};
      if (replace === undefined) return {error: missingField(`${where}.replace`, '"replace": "<what goes in its place>"')};
      if (o.all !== undefined && typeof o.all !== 'boolean') return {error: `${where}.all is true or false.`};
      return {op: {op: 'html_replace', page_id: page, find, replace, ...(o.all ? {all: true} : {})}};
    }
    /* A picture or a video from this Mac: a file by its absolute path, or a picture in the image library.
       The host copies it onto the board before the batch runs (src/main.ts applyBatch). */
    case 'media_add': {
      const path = o.path === undefined ? undefined : str(o.path, 4096), library = o.library_id === undefined ? undefined : str(o.library_id, 16);
      if ((path === undefined) === (library === undefined)) return {error: `${where} names one file: "path" (an absolute path on this Mac) or "library_id" (from aphrodite_list_images), not both.`};
      if (path !== undefined && !path.startsWith('/')) return {error: `${where}.path is an absolute path to a file on this Mac, for example "/Users/you/Desktop/shot.png".`};
      if (library !== undefined && !/^[0-9a-f]{16}$/.test(library)) return {error: `${where}.library_id is the 16-character id from aphrodite_list_images.`};
      const name = o.name === undefined ? undefined : str(o.name, MAX_PAGE_NAME);
      if (o.name !== undefined && !name) return {error: `${where}.name is what to call it on the board, at most ${MAX_PAGE_NAME} characters.`};
      return {op: {op: 'media_add', ...(path !== undefined ? {path} : {library_id: library}), ...(name ? {name} : {})}};
    }
    case 'add': {
      const componentKind = str(o.component_kind, 60);
      if (!componentKind) return {error: missingField(`${where}.component_kind`, '"component_kind": "hero"')};
      const kinds = componentKinds();
      if (!kinds.includes(componentKind)) {
        return {error: unknownValue(`${where}.component_kind`, componentKind, kinds, 'Call aphrodite_list_components for the variants each kind takes.')};
      }
      const op: Op = {op: 'add', component_kind: componentKind};
      if (o.variant !== undefined) {
        const variant = str(o.variant, 60) ?? '';
        const variants = patternVariants(componentKind);
        if (!variants.includes(variant)) return {error: unknownValue(`${where}.variant`, variant, variants)};
        op.variant = variant;
      }
      if (o.before_block_id !== undefined) {
        const before = blockId(o.before_block_id, where);
        if ('error' in before) return before;
        if (before.id === SELECTION) return {error: `${where}.before_block_id must be a real block_id, not "${SELECTION}".`};
        op.before_block_id = before.id;
      }
      if (o.content !== undefined) {
        const content = contentFields(o.content, `${where}.content`);
        if ('error' in content) return content;
        op.content = content.fields;
      }
      return {op};
    }
    case 'update': {
      const target = blockId(o.block_id, where);
      if ('error' in target) return target;
      // A variant is a layout, not copy, so it has its own key — but changing one used to mean
      // adding a replacement and deleting the original, which throws the block id away and puts
      // the person's words at risk. The kind it belongs to decides which names are legal, and
      // only the app knows the kind, so the check happens where the block is found.
      const variant = o.variant === undefined ? undefined : str(o.variant, 60) ?? '';
      // An update with neither key is worth naming as such; the shape complaint from contentFields
      // would only mention the words and leave the person looking for the wrong mistake.
      /* A picture is neither copy nor layout, so it gets its own key. The id comes from
         aphrodite_list_images — `sample:desk-lamp` for one the app ships with, or a library id —
         and "" clears the slot. Whether it names something real is the app's to say. */
      const image = o.image === undefined ? undefined : str(o.image, 300) ?? '';
      if (o.fields === undefined && variant === undefined && image === undefined) {
        return {error: `${where} changes nothing: pass fields to change the words, variant to change the layout, image to change the picture, or any combination.`};
      }
      const fields = o.fields === undefined ? {fields: {}} : contentFields(o.fields, `${where}.fields`);
      if ('error' in fields) return fields;
      return {op: {op: 'update', block_id: target.id, fields: fields.fields, ...(variant === undefined ? {} : {variant}), ...(image === undefined ? {} : {image})}};
    }
    case 'move': {
      const target = blockId(o.block_id, where);
      if ('error' in target) return target;
      const direction = str(o.direction, 10);
      if (direction !== 'up' && direction !== 'down') return {error: unknownValue(`${where}.direction`, String(o.direction ?? ''), ['up', 'down'])};
      return {op: {op: 'move', block_id: target.id, direction}};
    }
    case 'delete': {
      const target = blockId(o.block_id, where);
      if ('error' in target) return target;
      return {op: {op: 'delete', block_id: target.id}};
    }
    /* Making a page had no operation at all, so an agent wanting a mobile frame had to run the
       palette's sample-page command and empty it out — thirty-three turns, and a page left named
       "Pointer lab". A page is a noun the surface should have. */
    case 'page': {
      const name = str(o.name, 60);
      if (!name) return {error: `${where}.name is required: give the page a name, for example "Mobile".`};
      const op: Op = {op: 'page', name};
      if (o.preset !== undefined) {
        const preset = str(o.preset, 20) ?? '';
        const presets = framePresets.map(p => p.id);
        if (!presets.includes(preset as FramePreset)) return {error: unknownValue(`${where}.preset`, preset, presets)};
        op.preset = preset as FramePreset;
      }
      if (o.page_id !== undefined) {
        const page = str(o.page_id, 200);
        if (!page || !ID.test(page)) return {error: `${where}.page_id "${String(o.page_id)}" is not an id. Take one from aphrodite_get_contract, or leave it out to make a new page.`};
        op.page_id = page;
      }
      return {op};
    }
    case 'frame': {
      const preset = str(o.preset, 20) ?? '';
      const presets = framePresets.map(p => p.id);
      if (!presets.includes(preset as FramePreset)) return {error: unknownValue(`${where}.preset`, preset, presets)};
      const op: Op = {op: 'frame', preset: preset as FramePreset};
      if (o.page_id !== undefined) {
        const page = str(o.page_id, 200);
        if (!page || !ID.test(page)) return {error: `${where}.page_id "${String(o.page_id)}" is not an id. Take one from aphrodite_get_contract.`};
        op.page_id = page;
      }
      return {op};
    }
  }
}

/** Validates a whole batch before a single thing is changed. */
export function parseOps(payload: unknown): {ops: Op[]; pageId?: string} | {error: string} {
  const p = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>;
  if (!Array.isArray(p.ops)) {
    return {error: missingField('ops', '"ops": [{"op": "add", "component_kind": "hero"}]')};
  }
  if (!p.ops.length) return {error: 'ops is empty. Send at least one operation.'};
  if (p.ops.length > MAX_OPS) {
    return {error: `${p.ops.length} operations is more than the ${MAX_OPS} allowed in one call. Split it, or the page cannot be reviewed as one change.`};
  }
  const ops: Op[] = [];
  for (const [index, raw] of p.ops.entries()) {
    const parsed = parseOne(raw, index);
    if ('error' in parsed) return parsed;
    ops.push(parsed.op);
  }
  if (p.page_id !== undefined) {
    const pageId = str(p.page_id, 200);
    if (!pageId || !ID.test(pageId)) return {error: `page_id "${String(p.page_id)}" is not an id. Take one from aphrodite_get_contract.`};
    return {ops, pageId};
  }
  return {ops};
}

/* ---------- the patch: the ledger's own vocabulary, accepted back ----------

   `aphrodite_get_changes` reports every change — a person's included — as the plain ops the ledger
   records (src/ledger/patch.ts). An agent can send those same ops back in `patch`, which is how
   a person's edit made on one copy is replayed onto another. They are checked for shape here and the
   result is held to what a saved project must be (see runBatch), so a patch cannot say anything the
   project model would refuse. Approving is not among the things it can say. */

export const MAX_PATCH = 400;
const PATCH_OPS = ['set', 'insert_page', 'remove_page', 'move_page', 'insert_block', 'remove_block', 'move_block', 'text'] as const;
const MAX_HUNKS = 10_000;
const SET_ON = ['project', 'system', 'page', 'block'] as const;
const FIELD = /^[a-zA-Z][a-zA-Z0-9]{0,40}$/;
const MAX_VALUE = 4_200_000;

function omitted(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  if ((value as {$omitted?: unknown}).$omitted !== undefined) return true;
  return Object.values(value).some(omitted);
}

function parsePatchOne(raw: unknown, index: number): {op: PatchOp} | {error: string} {
  const where = `patch[${index}]`;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {error: `${where} must be an object.`};
  const o = raw as Record<string, unknown>;
  const kind = str(o.op, 20);
  if (!kind || !(PATCH_OPS as readonly string[]).includes(kind)) return {error: unknownValue(`${where}.op`, String(o.op ?? ''), PATCH_OPS)};
  if (omitted(o)) return {error: `${where} carries a picture that aphrodite_get_changes left out ({"$omitted": …}). It cannot be replayed; set that picture with an update op and an image id instead.`};
  if (JSON.stringify(o).length > MAX_VALUE) return {error: `${where} is larger than ${MAX_VALUE} characters.`};
  const id = (key: string): string | {error: string} => {
    const value = str(o[key], 200);
    return value && ID.test(value) ? value : {error: `${where}.${key} must be an id from aphrodite_get_contract or aphrodite_get_changes.`};
  };
  const position = (): number | {error: string} => Number.isInteger(o.index) && (o.index as number) >= 0 ? o.index as number : {error: `${where}.index must be a whole number, 0 or more.`};
  const object = (key: string): Record<string, unknown> | {error: string} => o[key] && typeof o[key] === 'object' && !Array.isArray(o[key]) ? o[key] as Record<string, unknown> : {error: `${where}.${key} must be an object.`};
  const bad = (...xs: unknown[]) => xs.find(x => x && typeof x === 'object' && 'error' in (x as object)) as {error: string} | undefined;
  switch (kind as typeof PATCH_OPS[number]) {
    case 'set': {
      const on = str(o.on, 20);
      if (!on || !(SET_ON as readonly string[]).includes(on)) return {error: unknownValue(`${where}.on`, String(o.on ?? ''), SET_ON)};
      const field = str(o.field, 41);
      if (!field || !FIELD.test(field)) return {error: `${where}.field must name a field, for example "title".`};
      if (on === 'project' && field === 'approvedFingerprint') return {error: `${where} sets the approval. Approving a direction is the person's decision, and no tool here can make it.`};
      if (o.unset !== undefined && o.unset !== true) return {error: `${where}.unset is either true or left out.`};
      if (o.unset === true && o.value !== undefined) return {error: `${where} has both value and unset; pick one.`};
      if (o.unset !== true && o.value === undefined) return {error: `${where} needs a value, or "unset": true to clear the field.`};
      if (on === 'page' && field === 'html' && typeof o.value === 'string' && o.value.length > MAX_PAGE_HTML) return {error: `${where} sets html of ${o.value.length.toLocaleString('en')} characters; a page holds at most ${MAX_PAGE_HTML.toLocaleString('en')}.`};
      const tail = o.unset === true ? {unset: true as const} : {value: o.value};
      if (on === 'project') return {op: {op: 'set', on: 'project', field: field as never, ...tail}};
      if (on === 'system') return {op: {op: 'set', on: 'system', field, ...tail}};
      const page = id('page_id');
      if (typeof page !== 'string') return page;
      if (on === 'page') { if (!PAGE_KEYS.has(field) || field === 'id' || field === 'blocks') return {error: `${where} sets "${field}", which is not a page field an op sets.`}; return {op: {op: 'set', on: 'page', page_id: page, field: field as never, ...tail}}; }
      const block = id('block_id');
      if (typeof block !== 'string') return block;
      return {op: {op: 'set', on: 'block', page_id: page, block_id: block, field, ...tail}};
    }
    case 'insert_page': {
      const index = position(), page = object('page'), err = bad(index, page);
      if (err) return err;
      const extra = unknownKeys(page as Record<string, unknown>, PAGE_KEYS) ?? (Array.isArray((page as {blocks?: unknown}).blocks) ? ((page as {blocks: unknown[]}).blocks).map(b => b && typeof b === 'object' ? unknownKeys(b as Record<string, unknown>, BLOCK_KEYS) : undefined).find(Boolean) : undefined);
      if (extra) return {error: `${where} carries "${extra}", which no page or component has. Send only what aphrodite_get_changes shows a page holding.`};
      return {op: {op: 'insert_page', index: index as number, page: page as never}};
    }
    case 'remove_page': {
      const page = id('page_id');
      return typeof page === 'string' ? {op: {op: 'remove_page', page_id: page}} : page;
    }
    case 'move_page': {
      const page = id('page_id'), index = position(), err = bad(page, index);
      if (err) return err;
      return {op: {op: 'move_page', page_id: page as string, index: index as number}};
    }
    case 'insert_block': {
      const page = id('page_id'), index = position(), block = object('block'), err = bad(page, index, block);
      if (err) return err;
      const extra = unknownKeys(block as Record<string, unknown>, BLOCK_KEYS);
      if (extra) return {error: `${where}.block carries "${extra}", which no component has. Send only what aphrodite_get_changes shows a component holding.`};
      return {op: {op: 'insert_block', page_id: page as string, index: index as number, block: block as never}};
    }
    case 'remove_block': {
      const page = id('page_id'), block = id('block_id'), err = bad(page, block);
      if (err) return err;
      return {op: {op: 'remove_block', page_id: page as string, block_id: block as string}};
    }
    case 'move_block': {
      const page = id('page_id'), block = id('block_id'), index = position(), err = bad(page, block, index);
      if (err) return err;
      return {op: {op: 'move_block', page_id: page as string, block_id: block as string, index: index as number}};
    }
    /* A text diff, as aphrodite_get_changes returns it: each passage takes out `remove` (or, in the
       saved form, `remove_length` characters hashing to `remove_hash`) at `at` and puts in `insert`. */
    case 'text': {
      if (o.on !== 'page' || o.field !== 'html') return {error: `${where} is a text diff of a page's html: "on": "page", "field": "html".`};
      const page = id('page_id');
      if (typeof page !== 'string') return page;
      if (!Array.isArray(o.hunks) || !o.hunks.length || o.hunks.length > MAX_HUNKS) return {error: `${where}.hunks must be a list of 1 to ${MAX_HUNKS} passages, as aphrodite_get_changes returns them.`};
      const hunks: TextHunk[] = [];
      for (const [i, raw] of (o.hunks as unknown[]).entries()) {
        const h = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
        const at = h.at, insert = h.insert;
        if (!Number.isInteger(at) || (at as number) < 0 || typeof insert !== 'string') return {error: `${where}.hunks[${i}] needs "at" (a whole number, 0 or more) and "insert" (text).`};
        if (typeof h.remove === 'string') hunks.push({at: at as number, remove: h.remove, insert});
        else if (Number.isInteger(h.remove_length) && (h.remove_length as number) >= 0 && typeof h.remove_hash === 'string' && /^[0-9a-f]{32}$/.test(h.remove_hash)) hunks.push({at: at as number, remove_length: h.remove_length as number, remove_hash: h.remove_hash, insert});
        else return {error: `${where}.hunks[${i}] needs "remove" (the text taken out), or "remove_length" and "remove_hash" as aphrodite_get_changes gives them.`};
      }
      return {op: {op: 'text', on: 'page', page_id: page, field: 'html', hunks}};
    }
  }
}

export type Batch = {ops: Op[]; patch: PatchOp[]; pageId?: string; reason: string; baseRevision?: string};

/**
 * Validates everything `aphrodite_apply_edits` was sent, before a single thing is changed: the ops,
 * the patch, the reason, and the revision the agent last read.
 */
export function parseBatch(payload: unknown): {batch: Batch} | {error: string} {
  const p = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>;
  const reason = typeof p.reason === 'string' ? p.reason.trim() : '';
  if (!reason) return {error: missingField('reason', '"reason": "The first line now says what the shop sells, as the brief asks."') + ' The reason is shown to the person beside the change, so write it for them: one sentence on why.'};
  if (reason.length > MAX_REASON) return {error: `reason is ${reason.length} characters; keep it under ${MAX_REASON}.`};
  let baseRevision: string | undefined;
  if (p.base_revision !== undefined) {
    baseRevision = str(p.base_revision, 100);
    if (!baseRevision) return {error: 'base_revision must be the revision string from aphrodite_get_contract or aphrodite_get_changes.'};
  }
  // Either half sent in any other shape refuses the whole batch, before anything is read of the other (0.3-R): one half is never run alone.
  if (p.patch !== undefined && !Array.isArray(p.patch)) return {error: 'patch must be a list of ops, as aphrodite_get_changes returns them.'};
  if (p.ops !== undefined && !Array.isArray(p.ops)) return {error: 'ops must be a list of operations: "ops": [{"op": "add", "component_kind": "hero"}].'};
  const hasOps = Array.isArray(p.ops) && p.ops.length > 0, hasPatch = Array.isArray(p.patch) && p.patch.length > 0;
  if (!hasOps && !hasPatch) {
    return {error: missingField('ops', '"ops": [{"op": "add", "component_kind": "hero"}]') + ' (Or "patch", for ops taken from aphrodite_get_changes.)'};
  }
  let ops: Op[] = [], pageId: string | undefined;
  if (hasOps || p.page_id !== undefined) {
    const parsed = parseOps({ops: hasOps ? p.ops : [{op: 'frame', preset: 'desktop'}], page_id: p.page_id});
    if ('error' in parsed) return parsed;
    ops = hasOps ? parsed.ops : [];
    pageId = parsed.pageId;
  }
  const patch: PatchOp[] = [];
  if (hasPatch) {
    const list = p.patch as unknown[];
    if (list.length > MAX_PATCH) return {error: `${list.length} patch ops is more than the ${MAX_PATCH} allowed in one call. Split it.`};
    for (const [index, raw] of list.entries()) {
      const parsed = parsePatchOne(raw, index);
      if ('error' in parsed) return parsed;
      patch.push(parsed.op);
    }
  }
  return {batch: {ops, patch, ...(pageId ? {pageId} : {}), reason, ...(baseRevision ? {baseRevision} : {})}};
}
