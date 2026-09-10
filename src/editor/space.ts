/**
 * The Space: an open canvas where every page of a project is a frame placed in world coordinates,
 * viewed through a camera (pan + zoom). Pure functions only; DOM wiring lives in main.ts.
 */
export type FramePreset='desktop'|'tablet'|'mobile'|'custom';
export type FrameLayout={x:number;y:number;preset:FramePreset;width?:number};
export type Space={frames:Record<string,FrameLayout>};
export type Camera={x:number;y:number;zoom:number};
export type Box={x:number;y:number;width:number;height:number};

export const framePresets:readonly {id:FramePreset;width:number;en:string;ko:string}[]=[
  {id:'desktop',width:1440,en:'Desktop · 1440',ko:'데스크톱 · 1440'},
  {id:'tablet',width:834,en:'Tablet · 834',ko:'태블릿 · 834'},
  {id:'mobile',width:390,en:'Mobile · 390',ko:'모바일 · 390'},
  {id:'custom',width:1200,en:'Custom width',ko:'사용자 지정 너비'},
];
export const FRAME_GAP=160;
export const MIN_ZOOM=0.1;
export const MAX_ZOOM=4;
export const zoomSteps:readonly number[]=[0.1,0.25,0.5,0.75,1,1.5,2,3,4];
const MAX_COORD=200000;

export function isFramePreset(v:unknown):v is FramePreset{return v==='desktop'||v==='tablet'||v==='mobile'||v==='custom';}
export function frameWidth(layout:Pick<FrameLayout,'preset'|'width'>):number{
  if(layout.preset==='custom')return clampWidth(layout.width??1200);
  return framePresets.find(p=>p.id===layout.preset)!.width;
}
export function clampWidth(w:number):number{return Math.round(Math.min(3200,Math.max(240,Number.isFinite(w)?w:1200)));}
export function validFrameLayout(v:unknown):v is FrameLayout{
  if(!v||typeof v!=='object')return false;
  const f=v as FrameLayout;
  if(!Number.isFinite(f.x)||!Number.isFinite(f.y)||Math.abs(f.x)>MAX_COORD||Math.abs(f.y)>MAX_COORD)return false;
  if(!isFramePreset(f.preset))return false;
  if(f.width!==undefined&&(!Number.isFinite(f.width)||f.width<240||f.width>3200))return false;
  return true;
}
/** Drops invalid frame entries instead of throwing: a broken layout must never brick a project. */
export function sanitizeSpace(v:unknown):Space|undefined{
  if(!v||typeof v!=='object')return undefined;
  const raw=(v as Space).frames;
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return undefined;
  const frames:Record<string,FrameLayout>={};
  for(const [id,layout] of Object.entries(raw)){
    if(!/^[a-zA-Z0-9_-]{1,200}$/.test(id)||!validFrameLayout(layout))continue;
    frames[id]={x:Math.round(layout.x),y:Math.round(layout.y),preset:layout.preset,...(layout.width!==undefined?{width:clampWidth(layout.width)}:{})};
  }
  return {frames};
}

/** Every page gets a frame; frames of deleted pages go away. Missing frames line up to the right, in page order. Returns true when something changed. */
export function ensureSpace(project:{pages:{id:string}[];space?:Space}):boolean{
  const space=project.space??{frames:{}};
  let changed=!project.space;
  for(const id of Object.keys(space.frames))if(!project.pages.some(p=>p.id===id)){delete space.frames[id];changed=true;}
  for(const page of project.pages){
    if(space.frames[page.id])continue;
    space.frames[page.id]=nextFramePosition(space,'desktop');
    changed=true;
  }
  project.space=space;
  return changed;
}
/** Position for a new frame: right of the rightmost frame, on the top row. */
export function nextFramePosition(space:Space,preset:FramePreset,width?:number):FrameLayout{
  let right=-FRAME_GAP;
  let top=0;
  const entries=Object.values(space.frames);
  if(entries.length){top=Math.min(...entries.map(f=>f.y));}
  for(const f of entries)right=Math.max(right,f.x+frameWidth(f));
  return {x:right+FRAME_GAP,y:top,preset,...(preset==='custom'?{width:clampWidth(width??1200)}:{})};
}
/** Lines the frames up in one row in the given page order, keeping presets. */
export function tidyFrames(space:Space,order:string[]):Space{
  const frames:Record<string,FrameLayout>={};
  let x=0;
  for(const id of order){
    const f=space.frames[id];if(!f)continue;
    frames[id]={...f,x,y:0};
    x+=frameWidth(f)+FRAME_GAP;
  }
  for(const [id,f] of Object.entries(space.frames))if(!frames[id])frames[id]=f;
  return {frames};
}
export function moveFrame(space:Space,id:string,x:number,y:number,grid=8):Space{
  const f=space.frames[id];if(!f)return space;
  const snap=(v:number)=>Math.round(v/grid)*grid;
  return {frames:{...space.frames,[id]:{...f,x:Math.max(-MAX_COORD,Math.min(MAX_COORD,snap(x))),y:Math.max(-MAX_COORD,Math.min(MAX_COORD,snap(y)))}}};
}

export function clampZoom(z:number):number{return Math.min(MAX_ZOOM,Math.max(MIN_ZOOM,Number.isFinite(z)?z:1));}
export function screenToWorld(camera:Camera,p:{x:number;y:number}):{x:number;y:number}{return {x:(p.x-camera.x)/camera.zoom,y:(p.y-camera.y)/camera.zoom};}
export function worldToScreen(camera:Camera,p:{x:number;y:number}):{x:number;y:number}{return {x:p.x*camera.zoom+camera.x,y:p.y*camera.zoom+camera.y};}
/** Zooms so the world point under `anchor` (viewport coordinates) stays put. */
export function zoomAt(camera:Camera,anchor:{x:number;y:number},nextZoom:number):Camera{
  const zoom=clampZoom(nextZoom);
  const world=screenToWorld(camera,anchor);
  return {x:anchor.x-world.x*zoom,y:anchor.y-world.y*zoom,zoom};
}
export function panBy(camera:Camera,dx:number,dy:number):Camera{return {...camera,x:camera.x+dx,y:camera.y+dy};}
/** Next preset step above or below the current zoom. */
export function stepZoom(zoom:number,direction:1|-1):number{
  const eps=1e-6;
  if(direction>0){const next=zoomSteps.find(s=>s>zoom+eps);return next??MAX_ZOOM;}
  const prev=[...zoomSteps].reverse().find(s=>s<zoom-eps);return prev??MIN_ZOOM;
}
export function unionBox(boxes:Box[]):Box|undefined{
  if(!boxes.length)return undefined;
  const x=Math.min(...boxes.map(b=>b.x)),y=Math.min(...boxes.map(b=>b.y));
  const r=Math.max(...boxes.map(b=>b.x+b.width)),btm=Math.max(...boxes.map(b=>b.y+b.height));
  return {x,y,width:r-x,height:btm-y};
}
/** Camera that shows `box` centred in the viewport. Zoom never exceeds `maxZoom` (1 = real size). */
export function fitCamera(box:Box,viewport:{width:number;height:number},padding=48,maxZoom=1):Camera{
  const w=Math.max(1,box.width),h=Math.max(1,box.height);
  const zoom=clampZoom(Math.min(maxZoom,(viewport.width-padding*2)/w,(viewport.height-padding*2)/h));
  return {x:Math.round((viewport.width-w*zoom)/2-box.x*zoom),y:Math.round((viewport.height-h*zoom)/2-box.y*zoom),zoom};
}
export function cameraLabel(camera:Camera):string{return `${Math.round(camera.zoom*100)}%`;}

export const CAMERA_KEY='aphrodite-camera-v1';
export function readCamera(storage:Pick<Storage,'getItem'>,projectId:string):Camera|undefined{
  try{
    const raw=storage.getItem(`${CAMERA_KEY}:${projectId}`);if(!raw)return undefined;
    const c=JSON.parse(raw) as Camera;
    if(!c||!Number.isFinite(c.x)||!Number.isFinite(c.y)||!Number.isFinite(c.zoom))return undefined;
    return {x:c.x,y:c.y,zoom:clampZoom(c.zoom)};
  }catch{return undefined;}
}
export function writeCamera(storage:Pick<Storage,'setItem'>,projectId:string,camera:Camera):void{
  try{storage.setItem(`${CAMERA_KEY}:${projectId}`,JSON.stringify(camera));}catch{/* quota / private mode */}
}
