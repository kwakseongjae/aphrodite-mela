// All distances here are viewport CSS pixels, independent of canvas zoom/DPR.
export function nearestGuide(edges:number[],guides:number[],threshold=6):{delta:number;guide?:number}{
  let delta=threshold+1,guide:number|undefined;
  for(const edge of edges)for(const g of guides){const d=g-edge;if(Math.abs(d)<Math.abs(delta)){delta=d;guide=g;}}
  return Math.abs(delta)<=threshold?{delta,guide}:{delta:0};
}
export function edgeVelocity(point:number,start:number,end:number):number{
  if(point<start||point>end||end<=start)return 0;
  const zone=Math.min(40,(end-start)/3),max=420;
  if(point<start+zone)return -max*(1-(point-start)/zone);
  if(point>end-zone)return max*(1-(end-point)/zone);
  return 0;
}
