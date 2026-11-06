const finite = (n, fallback) => Number.isFinite(n) ? n : fallback;
export function normalizeRect(rect = {}) {
 const x=Math.max(0,Math.min(.99,finite(rect.x,0))), y=Math.max(0,Math.min(.99,finite(rect.y,0)));
 return { x,y,width:Math.max(.01,Math.min(1-x,finite(rect.width,1))),height:Math.max(.01,Math.min(1-y,finite(rect.height,1))) };
}
export function fitDimensions(width,height,max=1024) {
 if (![width,height,max].every(n=>Number.isFinite(n)&&n>0)) throw new Error("Dimensi foto tidak valid.");
 const scale=Math.min(1,max/width,max/height);
 return {width:Math.max(1,Math.round(width*scale)),height:Math.max(1,Math.round(height*scale))};
}
export function paintAlphaStroke(pixels, original, width,height,from,to,radius,mode) {
 if (![width,height,from.x,from.y,to.x,to.y,radius].every(Number.isFinite)||radius<=0||pixels.length!==width*height*4||original.length!==pixels.length) return false;
 const minX=Math.max(0,Math.floor(Math.min(from.x,to.x)-radius)), maxX=Math.min(width-1,Math.ceil(Math.max(from.x,to.x)+radius));
 const minY=Math.max(0,Math.floor(Math.min(from.y,to.y)-radius)), maxY=Math.min(height-1,Math.ceil(Math.max(from.y,to.y)+radius));
 const dx=to.x-from.x,dy=to.y-from.y,length=dx*dx+dy*dy; let changed=false;
 for(let y=minY;y<=maxY;y++) for(let x=minX;x<=maxX;x++) {
 const t=length?Math.max(0,Math.min(1,((x-from.x)*dx+(y-from.y)*dy)/length)):0;
 if ((x-from.x-t*dx)**2+(y-from.y-t*dy)**2>radius*radius) continue;
 const i=(y*width+x)*4;
 if(mode==="restore") { for(let c=0;c<4;c++) {if(pixels[i+c]!==original[i+c]) changed=true; pixels[i+c]=original[i+c];} }
 else if(pixels[i+3]) {pixels[i+3]=0;changed=true;}
 }
 return changed;
}
export function hasVisiblePixels(pixels) {for(let i=3;i<pixels.length;i+=4) if(pixels[i]>0) return true; return false;}
export function pushHistory(history,snapshot,limit=20) {
 if(history.entries[history.index]===snapshot) return history;
 const entries=[...history.entries.slice(0,history.index+1),snapshot].slice(-limit);
 return {entries,index:entries.length-1};
}
export function stepHistory(history,delta) {const index=Math.max(0,Math.min(history.entries.length-1,history.index+delta));return index===history.index?history:{...history,index};}

export function backgroundRemovalPayload(imageData, guide) {
 const rect=normalizeRect(guide);
 const full=rect.x===0&&rect.y===0&&rect.width===1&&rect.height===1;
 return full?{image_data:imageData}:{image_data:imageData,rect};
}
