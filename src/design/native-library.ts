/** Keep native CSP script-src self; exported offline HTML retains its inline runtime. */
export function nativeLibraryDocument(doc:string,url:string){
 return doc.replace(/<script>\/\*RUNTIME_START\*\/[\s\S]*?<\/script>/,`<script src="${url}"></script>`);
}
export function hydrateNativeLibraries(root:ParentNode){
 if(!('__TAURI_INTERNALS__' in window))return;
 root.querySelectorAll<HTMLIFrameElement>('.official-component iframe').forEach(frame=>{
  if(frame.dataset.nativeRuntime)return;
  frame.dataset.nativeRuntime='true';
  frame.srcdoc=nativeLibraryDocument(frame.srcdoc,`${location.origin}/assets/library-runtime.js`);
 });
}
