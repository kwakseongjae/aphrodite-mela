// The native adapter embeds the same limits through the generated manifest.
import {protocol} from './protocol.mjs';
import {openSync, readSync, closeSync} from 'node:fs';

const {frameBytes, responseBytes, endpointBytes, depth} = protocol.limits;
const utf8 = new TextDecoder('utf-8', {fatal:true, ignoreBOM:true});

// Delimit before decoding. Drop an oversized frame up to its next terminator.
export async function* frames(input) {
  let parts = [], size = 0;
  for await (const chunk of input) {
    let start = 0;
    for (let i=0; i<=chunk.length; i++) {
      if (i < chunk.length && chunk[i] !== 10 && chunk[i] !== 13) continue;
      size += i-start;
      if (size > frameBytes) parts = [];
      else if (i>start) parts.push(chunk.subarray(start,i));
      if (i<chunk.length) {
        if (size) yield size <= frameBytes ? Buffer.concat(parts,size) : null;
        parts=[]; size=0;
      }
      start=i+1;
    }
  }
  if (size) yield size <= frameBytes ? Buffer.concat(parts,size) : null;
}

export function decode(bytes) {
  return utf8.decode(bytes).replace(/^\uFEFF/,'');
}

// The tree budget limits allocations and recursive formatting. Large response trees
// can still be validated and returned directly as JSON text within the byte budget.
export function fitsTree(text, structureLimit=protocol.limits.structure) {
  let level=0, structure=0, quoted=false;
  for (let i=0; i<text.length; i++) {
    const c=text[i];
    if (quoted && c==='\\\\') { i++; continue; }
    if (c==='"') { quoted=!quoted; continue; }
    if (quoted) continue;
    if (c==='{' || c==='[') {
      if (++level>depth) return false;
      structure++;
    } else if (c==='}' || c===']') level--;
    else if (c===',' || c===':') structure++;
    if (structure>structureLimit) return false;
  }
  return true;
}

export function parse(text, checked=false) {
  if (!checked && !fitsTree(text)) throw new SyntaxError();
  // Reject deeply nested values before allocating their trees or traversing them.
  let start=-1, escapedUnicode=false;
  for (let i=0; i<text.length; i++) {
    const c=text[i];
    if (start>=0) {
      if (c==='\\') {
        if(text[++i]==='u') escapedUnicode=true;
      } else if (c==='"') {
        if (escapedUnicode && /[\uD800-\uDFFF]/u.test(JSON.parse(text.slice(start,i+1)))) throw new SyntaxError();
        start=-1;
      }
      continue;
    }
    if (c==='"') {
      start=i;
      escapedUnicode=false;
    } else if (c==='-' || (c>='0' && c<='9')) {
      const from=i;
      while(i+1<text.length && /[0-9eE+.-]/.test(text[i+1])) i++;
      if (!Number.isFinite(Number(text.slice(from,i+1)))) throw new SyntaxError();
    }
  }
  return JSON.parse(text,(_key,value)=>{
    // A JSON field called toString is data. JS interpolation must have the same
    // ordinary-object spelling that the native adapter uses for RPC names and arguments.
    if (value && typeof value==='object' && Object.hasOwn(value,'toString')) {
      Object.defineProperty(value,Symbol.toPrimitive,{value:()=>'[object Object]'});
    }
    return value;
  });
}

export function readEndpoint(path) {
  const fd = openSync(path,'r');
  try {
    const bytes = Buffer.alloc(endpointBytes+1);
    let used=0;
    while (used<bytes.length) {
      const n=readSync(fd,bytes,used,bytes.length-used,null);
      if(!n) return parse(decode(bytes.subarray(0,used)));
      used+=n;
    }
    throw new RangeError();
  } finally {closeSync(fd);}
}

export async function responseBody(response) {
  const chunks=[];
  let size=0;
  for await (const chunk of response.body ?? []) {
    size+=chunk.length;
    if(size>responseBytes) throw new RangeError();
    chunks.push(chunk);
  }
  return Buffer.concat(chunks,size);
}
