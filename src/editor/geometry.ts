export type Point={x:number;y:number};
export type Box=Point & {width:number;height:number};
export type Handle='n'|'ne'|'e'|'se'|'s'|'sw'|'w'|'nw';
export const clamp=(n:number,min:number,max:number)=>Math.min(max,Math.max(min,n));
export function localDelta(from:Point,to:Point,scale:number):Point {
  if(!Number.isFinite(scale)||scale<=0)throw new Error('Invalid canvas scale');
  return {x:(to.x-from.x)/scale,y:(to.y-from.y)/scale};
}
export function resizeBox(start:Box,delta:Point,handle:Handle,free:boolean):Box {
  let {x,y,width,height}=start;
  if(handle.includes('e'))width=clamp(width+delta.x,64,2000);
  if(handle.includes('s'))height=clamp(height+delta.y,100,2000);
  if(handle.includes('w')) {width=clamp(width-delta.x,free?Math.max(64,start.x+start.width-1500):64,free?Math.min(2000,start.x+start.width):2000);if(free)x=start.x+start.width-width;}
  if(handle.includes('n')) {height=clamp(height-delta.y,free?Math.max(100,start.y+start.height-1500):100,free?Math.min(2000,start.y+start.height):2000);if(free)y=start.y+start.height-height;}
  return {x:Math.round(x),y:Math.round(y),width:Math.round(width),height:Math.round(height)};
}
