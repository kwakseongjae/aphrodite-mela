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

export type OpKind = 'add' | 'update' | 'move' | 'delete' | 'frame' | 'page';
export type Op =
  | {op: 'add'; component_kind: string; variant?: string; before_block_id?: string; content?: Partial<Record<EditableField, string>>}
  | {op: 'update'; block_id: string; fields: Partial<Record<EditableField, string>>; variant?: string; image?: string}
  | {op: 'move'; block_id: string; direction: 'up' | 'down'}
  | {op: 'delete'; block_id: string}
  | {op: 'frame'; page_id?: string; preset: FramePreset}
  | {op: 'page'; name: string; preset?: FramePreset; page_id?: string};

export const MAX_OPS = 40;
export const MAX_TEXT = 4_000;
/** The person's current selection, usable anywhere a block_id is. */
export const SELECTION = 'selection';
export const opKinds: readonly OpKind[] = ['add', 'update', 'move', 'delete', 'frame', 'page'];

/**
 * The control a person would reach for to do the same thing as each op — a button with a data-action,
 * or an inspector field. The ops share the mutation functions those controls use rather than
 * dispatching them, because one click per op would mean one undo entry per op and the batch would
 * stop being one reviewable change. The correspondence still has to hold, and a test checks that each
 * of these controls really exists: an op with no way for a person to do it would leave an agent that
 * reads labels off the screen quietly behind.
 */
export type OpControl = {kind: 'action' | 'attribute'; name: string};
export const opControl: Record<OpKind, OpControl> = {
  add: {kind: 'action', name: 'add'},
  update: {kind: 'attribute', name: 'data-field'},
  move: {kind: 'action', name: 'move-up'},
  delete: {kind: 'action', name: 'delete-block'},
  page: {kind: 'action', name: 'new-frame'},
  frame: {kind: 'attribute', name: 'data-frame-preset'},
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
