import test from "node:test";
import assert from "node:assert/strict";
import { readStickerImage } from "./photoboothEditor.js";
import { createStickerArtwork } from "./decorationArtwork.js";

test("GIF upload preserves all original bytes without rasterizing",async()=>{
 const bytes=Uint8Array.from([71,73,70,56,57,97,0,255,9,33,249,4,0,1,0,0,0,59]);
 const file=new File([bytes],"animated.gif",{type:"image/gif"});
 const data=await readStickerImage(file);
 assert.equal(data,"data:image/gif;base64,"+Buffer.from(bytes).toString("base64"));
});
test("GIF upload enforces 2 MB before decoding",async()=>{
 await assert.rejects(readStickerImage(new File([new Uint8Array(2*1024*1024+1)],"large.gif",{type:"image/gif"})),/2 MB/);
});
test("GIF artwork decodes image and always uses the same 2px padded bounds without effects",async()=>{
 const draws=[],canvases=[];const image={width:400,height:200};
 function makeCanvas(){const c={width:0,height:0,toDataURL:()=>"data:image/png;base64,fallback",getContext:()=>({drawImage(...args){draws.push(args);},fillText(){throw new Error("GIF must decode as image");}})};canvases.push(c);return c;}
 const art=await createStickerArtwork({kind:"gif",content:"animated",style:{size:18,shadow:"glow",outlineWidth:6,opacity:70}},{makeCanvas,loadImage:async src=>{assert.equal(src,"animated");return image;}});
 assert.equal(art.width,184);assert.equal(art.height,94);assert.equal(art.widthPercent,18.4);
 assert.deepEqual(draws[0],[image,2,2,180,90]);assert.equal(canvases.length,2);
});
