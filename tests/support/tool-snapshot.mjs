/**
 * The MCP tool list as plain data: what a client is shown, where each call goes, and what a call
 * becomes on the wire for no arguments and for one argument of every kind the schema names. Two lists
 * that give the same snapshot behave the same for every client, which is what moving the list into the
 * command table has to prove.
 */
const sample = (name, schema) => {
  const type = Array.isArray(schema?.type) ? schema.type[0] : schema?.type;
  if (schema?.enum) return schema.enum.at(-1);
  if (type === 'string') return `${name}-value`;
  if (type === 'number' || type === 'integer') return 7;
  if (type === 'boolean') return true;
  if (type === 'array') return [{op: 'delete', block_id: 'selection'}];
  if (type === 'object') return {title: 'Sample'};
  return `${name}-value`;
};

export function toolSnapshot(tools) {
  return tools.map(tool => {
    const props = tool.inputSchema?.properties ?? {};
    const every = Object.fromEntries(Object.entries(props).map(([name, schema]) => [name, sample(name, schema)]));
    const wire = args => tool.route.method === 'GET'
      ? {params: tool.params ? tool.params(args) : null}
      : {body: tool.body ? tool.body(args) : null};
    return {
      name: tool.name,
      title: tool.title,
      description: tool.description,
      annotations: tool.annotations,
      inputSchema: tool.inputSchema,
      route: tool.route,
      keys: Object.keys(tool).sort(),
      empty: wire({}),
      every: wire(every),
    };
  });
}
