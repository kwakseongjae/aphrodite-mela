/**
 * What Aphrodite offers an agent, and how each tool reaches the app.
 *
 * The descriptions are the product here. A tool an agent misreads costs a round trip and often a
 * wrong edit, so each one says what it is for, when not to reach for it, and shows one complete call.
 * Every tool is a thin route onto the loopback channel: the app decides what is allowed, always.
 */

/** Tools are namespaced so they stay distinct among whatever else a client has loaded. */
export const PREFIX = 'aphrodite_';

const READ = {readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false};
const WRITE = {readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false};
const DESTRUCTIVE = {readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false};

export const tools = [
  {
    name: 'aphrodite_guide',
    title: 'How to work with Aphrodite',
    description: [
      'Read this first. What Aphrodite is, how to change a design, what needs the person\'s permission, and what is happening in the app right now — which project is open, whether you may edit, who is holding the screen.',
      '',
      'Call it at the start of a session, and again if a call is refused and you are unsure why. It costs nothing and needs no permission.',
      'It works even with the app closed, in which case it tells you how to open it.',
      '',
      'Example: {}',
    ].join('\n'),
    annotations: {title: 'How to work with Aphrodite', ...READ},
    inputSchema: {type: 'object', properties: {}, additionalProperties: false},
    route: {method: 'GET', path: '/agent/guide'},
  },
  {
    name: 'aphrodite_request_connection',
    title: 'Ask to edit alongside the person',
    description: [
      'Ask the person to let you change the design. A line appears at the top of their app with your name on it, and they allow or decline with one click.',
      '',
      'Call it once, when an edit came back saying writing is off. Then tell the person in your own words what you would like to change while they decide — that is what makes them comfortable saying yes.',
      'Asking again straight away does nothing: one request stands at a time, and a decline holds for a few minutes. This is deliberate. Nothing here can open the door on its own.',
      'You do not need it if the reply says Connected mode or Agent mode is already on.',
      '',
      'Example: {}',
    ].join('\n'),
    annotations: {title: 'Ask to edit alongside the person', readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false},
    inputSchema: {type: 'object', properties: {}, additionalProperties: false},
    route: {method: 'POST', path: '/agent/connect'},
    body: () => ({}),
  },
  {
    name: 'aphrodite_get_contract',
    title: 'Read the design contract',
    description: [
      'What is on the canvas, in design terms: pages as frames, the components on each with their block_id, kind and variant, the design system, and what the person currently has selected.',
      '',
      'Call this first, and again after someone else may have changed the project. Every other tool takes ids from here.',
      'It never returns image bytes — a picture is described (`local:<id>`, or `inline:image/png:24000`) so the reply stays small.',
      'Do not call it in a loop to watch for changes; it is a snapshot, not a subscription.',
      '',
      'Example: {"format": "concise"} — or {"page_id": "abc-1", "format": "detailed"} for one page with its body text.',
    ].join('\n'),
    annotations: {title: 'Read the design contract', ...READ},
    inputSchema: {
      type: 'object',
      properties: {
        format: {type: 'string', enum: ['concise', 'detailed'], description: 'concise (default) omits body text and options; detailed includes them.'},
        page_id: {type: 'string', description: 'Limit to one page. Use it when the project has more pages than fit in one reply.'},
      },
      additionalProperties: false,
    },
    route: {method: 'GET', path: '/agent/contract'},
    params: args => ({format: args.format, pageId: args.page_id}),
  },
  {
    name: 'aphrodite_get_tokens',
    title: 'Read the design tokens',
    description: [
      'The design system as CSS custom properties — the same variables the rendered page uses: --brand, --paper, --ink, --radius, --heading, --body.',
      '',
      'Use this before writing any code or styles for this design, so the result reaches for var(--brand) instead of a hex value that will change the moment the person edits the system.',
      'It does not tell you which components exist; that is aphrodite_get_contract.',
      '',
      'Example: {}',
    ].join('\n'),
    annotations: {title: 'Read the design tokens', ...READ},
    inputSchema: {type: 'object', properties: {}, additionalProperties: false},
    route: {method: 'GET', path: '/agent/tokens'},
  },
  {
    name: 'aphrodite_get_render',
    title: 'Look at the page',
    description: [
      'A picture of the page as it will actually be seen, drawn at the width you ask for.',
      '',
      'Use it after a change to check the result, and before saying anything about how something looks — the contract tells you what is on the page, not whether it works. Ask for a narrow width to see how the design holds up on a phone.',
      'It renders the page on its own, not the app around it: no panels, no dock, no zoom. What comes back is a viewport, so a long page is cut off at the bottom unless you ask for a taller one.',
      '',
      'Example: {"width": 390} for a phone, or {} for the page\'s own frame width.',
    ].join('\n'),
    annotations: {title: 'Look at the page', ...READ},
    inputSchema: {
      type: 'object',
      properties: {
        width: {type: 'number', minimum: 240, maximum: 2000, description: 'Pixels. Defaults to the frame width of the page.'},
        height: {type: 'number', minimum: 320, maximum: 6000, description: 'Pixels. This is a viewport, so a long page is cut off — ask for a taller one to see the rest.'},
        page_id: {type: 'string', description: 'Which page. Defaults to the one being edited.'},
      },
      additionalProperties: false,
    },
    route: {method: 'GET', path: '/agent/render'},
    params: args => ({width: args.width, height: args.height, pageId: args.page_id}),
  },
  {
    name: 'aphrodite_list_components',
    title: 'List the component vocabulary',
    description: [
      'Every component kind this workbench can place, with the variants and providers each one accepts.',
      '',
      'Call this before aphrodite_apply_edits when you are not certain a kind or variant exists — the edit will be refused otherwise, and this is the cheaper way to find out.',
      'These are the kinds available to add, not the components currently on the page.',
      '',
      'Example: {}',
    ].join('\n'),
    annotations: {title: 'List the component vocabulary', ...READ},
    inputSchema: {type: 'object', properties: {}, additionalProperties: false},
    route: {method: 'GET', path: '/agent/components'},
  },
  {
    name: 'aphrodite_list_images',
    title: 'List the local picture library',
    description: [
      'The pictures on this Mac that the project can use, with the id to reference each one, its size and whether it belongs to this project or is shared across all of them.',
      '',
      'Use it to find real imagery before adding a component that needs a picture; reference one as "local:<id>".',
      'Reading the list is always allowed, even when editing is not.',
      '',
      'Example: {"scope": "project"}',
    ].join('\n'),
    annotations: {title: 'List the local picture library', ...READ},
    inputSchema: {
      type: 'object',
      properties: {scope: {type: 'string', enum: ['project', 'global'], description: 'project = filed with this project, global = shared by every project. Defaults to global.'}},
      additionalProperties: false,
    },
    route: {method: 'POST', path: '/agent/library'},
    body: args => ({action: 'list', scope: args.scope ?? 'global'}),
  },
  {
    name: 'aphrodite_apply_edits',
    title: 'Change the design',
    description: [
      'Change a page with a list of operations that land together: add, update, move, delete a component, or resize a page frame.',
      '',
      'Send everything one change needs in a single call. The whole list lands as one undo step and one receipt, so the person can take back your work in one press — and if any operation is wrong, none of them are applied and the reply says which one failed.',
      'Target a component by block_id from aphrodite_get_contract, or by the literal "selection" for whatever the person has selected.',
      'It cannot approve a direction: that decision stays a human one and no tool here can make it.',
      'Editing needs the person to have opened the door (Connected mode, or Agent mode). If it is closed you get a 423 and a sentence to pass on to them; do not retry in a loop.',
      '',
      'Example: {"ops": [{"op": "add", "component_kind": "hero", "variant": "stacked", "content": {"title": "Light, made meaningful"}}, {"op": "update", "block_id": "selection", "fields": {"label": "See the range"}}]}',
    ].join('\n'),
    annotations: {title: 'Change the design', ...WRITE},
    inputSchema: {
      type: 'object',
      properties: {
        ops: {
          type: 'array',
          minItems: 1,
          maxItems: 40,
          description: 'The operations, applied in order.',
          items: {
            type: 'object',
            properties: {
              op: {type: 'string', enum: ['add', 'update', 'move', 'delete', 'frame']},
              component_kind: {type: 'string', description: 'add: the kind to place, from aphrodite_list_components.'},
              variant: {type: 'string', description: 'add/update: a variant that kind accepts. On update it changes the layout and keeps the words — you do not delete and re-add to restyle a component.'},
              before_block_id: {type: 'string', description: 'add: place it before this component instead of at the end.'},
              content: {type: 'object', description: 'add: initial copy — title, text, label, eyebrow, description.'},
              block_id: {type: 'string', description: 'update/move/delete: which component, or "selection".'},
              fields: {type: 'object', description: 'update: the copy to set — title, text, label, eyebrow, description. Optional when you are only changing the variant.'},
              direction: {type: 'string', enum: ['up', 'down'], description: 'move: which way in the page order.'},
              preset: {type: 'string', enum: ['desktop', 'tablet', 'mobile', 'custom'], description: 'frame: the size to give the page.'},
              page_id: {type: 'string', description: 'frame: which page to resize. Defaults to the one being edited.'},
            },
            required: ['op'],
          },
        },
        page_id: {type: 'string', description: 'The page to edit. Defaults to the one the person is on.'},
      },
      required: ['ops'],
      additionalProperties: false,
    },
    route: {method: 'POST', path: '/agent/apply'},
    body: args => ({ops: args.ops, page_id: args.page_id}),
  },
  {
    name: 'aphrodite_use_interface',
    title: 'Drive the interface directly',
    description: [
      'Reach the app\'s own interface when the tools above cannot express what you need — opening a dialog, running Preview or Export, changing a setting, pressing a shortcut.',
      '',
      'Try the other tools first. This one needs you to know the interface, and a change made through it is a normal edit the person can undo like any other.',
      'The most useful action is `command`: it runs the best match from the app\'s own command palette, the same list a person sees with ⌘K, so you can name what you want in words instead of hunting for a selector. Reach for `click`, `type` and `key` only when no command covers it.',
      'It needs the same open door as editing, and no combination of actions here can approve a direction.',
      'None of it needs the window in front: nothing is done with a real mouse or keyboard, so the person can be working in another app.',
      '',
      'Example: {"action": "command", "query": "Preview"} — or {"action": "key", "key": "1", "shift": true} to fit everything on screen.',
    ].join('\n'),
    annotations: {title: 'Drive the interface directly', ...WRITE},
    inputSchema: {
      type: 'object',
      properties: {
        action: {type: 'string', enum: ['command', 'click', 'type', 'key'], description: 'command runs a palette entry by name; click/type/key drive an element directly.'},
        query: {type: 'string', description: 'command: what you want, in words — "Export", "Add Testimonial", "Choose design system".'},
        selector: {type: 'string', description: 'click/type: a CSS selector for the element.'},
        text: {type: 'string', description: 'type: what to put in the field.'},
        submit: {type: 'boolean', description: 'type: submit the form afterwards.'},
        key: {type: 'string', description: 'key: the key to press, e.g. "Escape", "k", "1".'},
        meta: {type: 'boolean'},
        shift: {type: 'boolean'},
      },
      required: ['action'],
      additionalProperties: false,
    },
    route: {method: 'POST', path: '/agent/ui'},
    body: args => ({
      action: args.action,
      query: args.query,
      selector: args.selector,
      text: args.text,
      submit: args.submit,
      key: args.key,
      meta: args.meta,
      shift: args.shift,
    }),
  },
  {
    name: 'aphrodite_add_image',
    title: 'Add a picture to the library',
    description: [
      'Put an image into the local picture library so the design can use it. PNG, JPEG or WebP, as base64.',
      '',
      'Use it for imagery you generated or were given for this project. It only adds to the library — place it on a page with aphrodite_apply_edits afterwards, referencing "local:<id>" from the reply.',
      'Nothing leaves this Mac: the file is written to a folder the person can open.',
      '',
      'Example: {"name": "lighting-hero", "base64": "iVBORw0KGgo…", "scope": "project"}',
    ].join('\n'),
    annotations: {title: 'Add a picture to the library', ...WRITE},
    inputSchema: {
      type: 'object',
      properties: {
        name: {type: 'string', description: 'A name for the file, without an extension.'},
        base64: {type: 'string', description: 'The image bytes, base64 encoded.'},
        scope: {type: 'string', enum: ['project', 'global'], description: 'project = only this project, global = every project. Defaults to global.'},
      },
      required: ['name', 'base64'],
      additionalProperties: false,
    },
    route: {method: 'POST', path: '/agent/library'},
    body: args => ({action: 'import', name: args.name, base64: args.base64, scope: args.scope ?? 'global'}),
  },
  {
    name: 'aphrodite_delete_image',
    title: 'Delete a picture from the library',
    description: [
      'Remove a picture from the local library by its id. The file is deleted from the folder.',
      '',
      'Only do this when the person asked for it. A component still pointing at that picture will show a gap until someone chooses another, and this cannot be undone from here.',
      '',
      'Example: {"image_id": "0123456789abcdef"}',
    ].join('\n'),
    annotations: {title: 'Delete a picture from the library', ...DESTRUCTIVE},
    inputSchema: {
      type: 'object',
      properties: {
        image_id: {type: 'string', description: 'The 16-character id from aphrodite_list_images.'},
        scope: {type: 'string', enum: ['project', 'global']},
      },
      required: ['image_id'],
      additionalProperties: false,
    },
    route: {method: 'POST', path: '/agent/library'},
    body: args => ({action: 'delete', id: args.image_id, scope: args.scope ?? 'global'}),
  },
];

export const toolByName = Object.fromEntries(tools.map(t => [t.name, t]));

/** What the client sees — the call plumbing stays here. */
export function toolManifest() {
  return tools.map(({name, title, description, inputSchema, annotations}) => ({name, title, description, inputSchema, annotations}));
}
