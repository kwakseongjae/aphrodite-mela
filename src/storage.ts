/**
 * The page's storage, or one that keeps nothing when the browser refuses it outright (reading
 * window.localStorage itself throws in a locked-down profile): the app still starts on its defaults,
 * and every write says it could not be kept, so the places that save tell the person as they already do.
 */
export function pageStorage(get:()=>Storage):Storage{
  try{const storage=get();void storage.length;return storage;}catch{return refusing;}
}
const refused=()=>{throw new DOMException('This browser keeps nothing for this page.','SecurityError');};
const refusing:Storage={
  get length(){return 0;},
  key:()=>null,getItem:()=>null,setItem:refused,removeItem:()=>{},clear:()=>{},
};
