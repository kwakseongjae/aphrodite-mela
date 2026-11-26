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

export function parse(text) {
  // Reject deeply nested values before allocating their trees or traversing them.
  let level=0, quoted=false;
  for(let i=0;i<text.length;i++) {
    const c=text.charCodeAt(i);
    if(quoted && c===92) {i++;continue;}
    if(c===34) quoted=!quoted;
    if(!quoted && (c===123 || c===91) && ++level>depth) throw new SyntaxError();
    if(!quoted && (c===125 || c===93)) level--;
  }
  return JSON.parse(text,(key,value)=>{
    if (!key.isWellFormed() || typeof value==='string' && !value.isWellFormed()
      || typeof value==='number' && !Number.isFinite(value)) throw new SyntaxError();
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

export async function responseText(response) {
  const chunks=[];
  let size=0;
  for await (const chunk of response.body ?? []) {
    size+=chunk.length;
    if(size>responseBytes) throw new RangeError();
    chunks.push(chunk);
  }
  return decode(Buffer.concat(chunks,size));
}
