import {hydrateNativeLibraries} from './native-library';
import {installPatternRuntime} from '../pattern-runtime';
import {installMoaRuntime} from '../moa-runtime';

/** Trusted generated page only. Shadow DOM isolates CSS without nested opaque iframe origins.
 * Official components retain their sandboxed iframes and local CSP-safe runtime.
 * Preview interactions mutate this disposable DOM, never the project model.
 */
export function mountNativePreview(frame:HTMLIFrameElement,generatedPage:string){
 const parsed=new DOMParser().parseFromString(generatedPage,'text/html');
 const main=parsed.querySelector('main.design-page');if(!main)throw new Error('Missing preview page');
 const host=document.createElement('div');host.className=`${frame.className} native-page-preview`;
 host.setAttribute('role','region');host.setAttribute('aria-label',frame.title);host.tabIndex=0;
 const root=host.attachShadow({mode:'open'});
 const reset=document.createElement('style');reset.textContent=':host{display:block;overflow:auto}*{box-sizing:border-box}button,input,select,textarea{font:inherit}';root.append(reset);
 parsed.head.querySelectorAll('style').forEach(style=>root.append(document.importNode(style,true)));
 root.append(document.importNode(main,true));frame.replaceWith(host);
 hydrateNativeLibraries(root);
 const runtime={querySelectorAll:root.querySelectorAll.bind(root),createElement:document.createElement.bind(document),addEventListener:root.addEventListener.bind(root)};
 installPatternRuntime(runtime);installMoaRuntime(runtime);
 root.addEventListener('click',event=>{
  const link=event.composedPath().find(node=>node instanceof HTMLAnchorElement) as HTMLAnchorElement|undefined;if(!link)return;
  event.preventDefault();const href=link.getAttribute('href')??'';
  // Raw fragment works with Tauri's custom scheme; scroll only this preview host.
  if(href.startsWith('#')){let id=href.slice(1);try{id=decodeURIComponent(id);}catch{return;}
   const target=root.getElementById(id);if(target)host.scrollTo({top:host.scrollTop+target.getBoundingClientRect().top-host.getBoundingClientRect().top-20,behavior:'auto'});
  }
 });
 return host;
}
