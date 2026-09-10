export function luminance(hex:string){
 if(!/^#[0-9a-f]{6}$/i.test(hex))throw new Error('Expected six-digit hex color');
 const rgb=hex.slice(1).match(/../g)!.map(h=>{const v=parseInt(h,16)/255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});
 return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;
}
export function contrastRatio(a:string,b:string){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
export function onColor(background:string){return contrastRatio(background,'#000000')>=contrastRatio(background,'#ffffff')?'#000000':'#ffffff';}
