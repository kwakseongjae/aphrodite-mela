/**
 * The local image library: pictures the person — or their agent — drops into a folder on this Mac.
 * A project stores `local:<id>` where id is a hash of the bytes, never a path, so the reference
 * survives renames and says nothing about the machine. Bytes are resolved at render and at export.
 */
export type LocalImage={id:string;name:string;bytes:number;mime:string;width:number;height:number;modified:number};
export type LocalLibrary={dir:string;images:LocalImage[]};

export const LOCAL_PREFIX='local:';
const ID=/^[0-9a-f]{16}$/;

export function localRef(id:string):string{return `${LOCAL_PREFIX}${id}`;}
export function isLocalRef(value:string):boolean{return ID.test(parseLocalRef(value));}
/** The id inside a `local:` reference, or '' when this is not one. */
export function parseLocalRef(value:string):string{
  if(!value.startsWith(LOCAL_PREFIX))return '';
  const id=value.slice(LOCAL_PREFIX.length);
  return ID.test(id)?id:'';
}

/** Every `local:` reference a project uses, de-duplicated, in a stable order. */
export function localRefsIn(project:{pages:{blocks:{image?:string;itemImages?:string[]}[]}[];reference?:string}):string[]{
  const ids:string[]=[];
  const add=(value?:string)=>{const id=parseLocalRef(value??'');if(id&&!ids.includes(id))ids.push(id);};
  for(const page of project.pages)for(const block of page.blocks){add(block.image);for(const item of block.itemImages??[])add(item);}
  add(project.reference);
  return ids;
}

export function extensionFor(mime:string):string{return mime==='image/png'?'png':mime==='image/jpeg'?'jpg':'webp';}
export function dataUrl(mime:string,base64:string):string{return `data:${mime};base64,${base64}`;}

/** Session cache of resolved bytes, so a picture is read from disk once per run. */
const cache=new Map<string,string>();
export function cachedLocal(id:string):string|undefined{return cache.get(id);}
export function cacheLocal(id:string,url:string):void{cache.set(id,url);}
export function forgetLocal(id?:string):void{if(id)cache.delete(id);else cache.clear();}

/** Swaps `local:` sources for resolved data URLs, marking the ones the library no longer holds. */
export function hydrateLocalImages(root:ParentNode,resolve:(id:string)=>void):void{
  for(const img of Array.from(root.querySelectorAll<HTMLImageElement>('img[src^="local:"]'))){
    const id=parseLocalRef(img.getAttribute('src')??'');
    if(!id){img.removeAttribute('src');continue;}
    const hit=cache.get(id);
    if(hit){img.src=hit;img.removeAttribute('data-local-missing');continue;}
    img.removeAttribute('src');
    img.dataset.localId=id;
    img.dataset.localMissing='pending';
    resolve(id);
  }
}

/** Sorts the library newest first and keeps only what the app can render. */
export function readableImages(library:LocalLibrary|undefined):LocalImage[]{
  if(!library)return [];
  return library.images.filter(i=>i.bytes>0&&['image/png','image/jpeg','image/webp'].includes(i.mime));
}

export function isWide(image:LocalImage):boolean{return image.width>0&&image.height>0&&image.width/image.height>=1.25;}
