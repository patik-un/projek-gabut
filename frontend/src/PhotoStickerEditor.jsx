import { useEffect, useRef, useState } from "react";
import { requestBackendJson } from "./backendRequest.js";
import { normalizeRect, fitDimensions, paintAlphaStroke, pushHistory, stepHistory, hasVisiblePixels, backgroundRemovalPayload } from "./photoStickerTools.js";
import "./PhotoStickerEditor.css";

function makeCanvas(width,height) { const c=document.createElement("canvas");c.width=width;c.height=height;return c; }
function readFile(file) { return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error("Foto tidak dapat dibaca."));reader.readAsDataURL(file);}); }
function loadImage(src) { return new Promise((resolve,reject)=>{const image=new Image();image.crossOrigin="anonymous";image.onload=()=>resolve(image);image.onerror=()=>reject(new Error("Foto tidak dapat dibuka. Gunakan PNG, JPEG, atau WebP."));image.src=src;}); }
const FULL={x:0,y:0,width:1,height:1};
export default function PhotoStickerEditor({apiUrl,initialSrc=null,initialName="Stiker foto",onApply,onClose}) {
 const dialog=useRef(null), canvas=useRef(null), original=useRef(null), initial=useRef(null), operation=useRef(null), mounted=useRef(true), stroke=useRef(null);
 const [ready,setReady]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(""),[name,setName]=useState(initialName),[mode,setMode]=useState("crop"),[brush,setBrush]=useState(24),[rect,setRect]=useState(FULL),[history,setHistory]=useState({entries:[],index:-1});
 function snapshot() {return JSON.stringify({image:canvas.current.toDataURL("image/png"),original:original.current.toDataURL("image/png")});}
 function commit() {const value=snapshot();setHistory(h=>pushHistory(h,value));}
 function close() {operation.current?.abort();onClose();}
 async function run(action) {
  if(operation.current) return;
  const controller=new AbortController();operation.current=controller;setBusy(true);setError("");
  const active=()=>mounted.current&&!controller.signal.aborted;
  try {await action(controller.signal,active);} catch(err) {if(active())setError(err.message||"Foto gagal diproses.");}
  finally {if(operation.current===controller) {operation.current=null;if(mounted.current)setBusy(false);}}
 }
 async function restoreSnapshot(value,active) {
  const saved=JSON.parse(value);const [image,source]=await Promise.all([loadImage(saved.image),loadImage(saved.original)]);
  if(!active())return;
  const target=canvas.current;target.width=image.width;target.height=image.height;target.getContext("2d").drawImage(image,0,0);
  original.current=makeCanvas(source.width,source.height);original.current.getContext("2d").drawImage(source,0,0);setRect(FULL);setReady(true);
 }
 async function importPhoto(src,active) {
  const image=await loadImage(src);if(!active())return;
  const size=fitDimensions(image.naturalWidth,image.naturalHeight);const target=canvas.current;
  target.width=size.width;target.height=size.height;target.getContext("2d").drawImage(image,0,0,size.width,size.height);
  original.current=makeCanvas(size.width,size.height);original.current.getContext("2d").drawImage(target,0,0);
  const value=snapshot();initial.current=value;setHistory({entries:[value],index:0});setRect(FULL);setReady(true);
 }
 useEffect(()=>{
  mounted.current=true;
  const modal=dialog.current;if(!modal.open)modal.showModal();
  if(initialSrc) run((_signal,active)=>importPhoto(initialSrc,active));
  return ()=>{mounted.current=false;operation.current?.abort();operation.current=null;};
 },[]);
 async function upload(event) {
  const file=event.target.files?.[0];event.target.value="";if(!file)return;
  if(!["image/png","image/jpeg","image/webp"].includes(file.type)) {setError("Gunakan foto PNG, JPEG, atau WebP.");return;}
  if(file.size>10*1024*1024) {setError("Ukuran foto maksimal 10 MB.");return;}
  await run(async (_signal,active)=>{const src=await readFile(file);if(active()){await importPhoto(src,active);if(active())setName(file.name.replace(/\.[^.]+$/,"").slice(0,80)||"Stiker foto");}});
 }
 function crop() {
  if(!ready||busy||stroke.current)return;
  const c=canvas.current,r=normalizeRect(rect),x=Math.min(c.width-1,Math.floor(r.x*c.width)),y=Math.min(c.height-1,Math.floor(r.y*c.height)),w=Math.max(1,Math.min(c.width-x,Math.round(r.width*c.width))),h=Math.max(1,Math.min(c.height-y,Math.round(r.height*c.height)));
  const result=makeCanvas(w,h),source=makeCanvas(w,h);result.getContext("2d").drawImage(c,x,y,w,h,0,0,w,h);source.getContext("2d").drawImage(original.current,x,y,w,h,0,0,w,h);
  c.width=w;c.height=h;c.getContext("2d").drawImage(result,0,0);original.current=source;setRect(FULL);commit();
 }
 function point(event) {const bounds=canvas.current.getBoundingClientRect();return {x:(event.clientX-bounds.left)/bounds.width*canvas.current.width,y:(event.clientY-bounds.top)/bounds.height*canvas.current.height};}
 function paint(from,to) {
  const c=canvas.current,ctx=c.getContext("2d"),pixels=ctx.getImageData(0,0,c.width,c.height),base=original.current.getContext("2d").getImageData(0,0,c.width,c.height);
  if(paintAlphaStroke(pixels.data,base.data,c.width,c.height,from,to,brush/2,mode)){ctx.putImageData(pixels,0,0);stroke.current.changed=true;}
 }
 function pointerDown(event) {
  if(!ready||busy||operation.current||stroke.current)return;
  event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);const p=point(event);stroke.current={id:event.pointerId,last:p,start:p,changed:false};
  if(mode!=="crop")paint(p,p);
 }
 function pointerMove(event) {
  const s=stroke.current;if(!s||s.id!==event.pointerId||busy)return;const p=point(event);
  if(mode==="crop") {const c=canvas.current;setRect(normalizeRect({x:Math.min(p.x,s.start.x)/c.width,y:Math.min(p.y,s.start.y)/c.height,width:Math.abs(p.x-s.start.x)/c.width,height:Math.abs(p.y-s.start.y)/c.height}));}
  else paint(s.last,p);s.last=p;
 }
 function pointerEnd(event) {const s=stroke.current;if(!s||s.id!==event.pointerId)return;stroke.current=null;if(s.changed)commit();}
 function moveHistory(delta) {
  if(stroke.current)return;
  const next=stepHistory(history,delta);if(next===history)return;
  run(async (_signal,active)=>{await restoreSnapshot(next.entries[next.index],active);if(active())setHistory(next);});
 }
 function removeBackground() {
  if(stroke.current)return;
  run(async (signal,active)=>{
   const data=await requestBackendJson(`${apiUrl}/photobooth/sticker/remove-background`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(backgroundRemovalPayload(canvas.current.toDataURL("image/png"),rect)),signal,timeoutMs:45000});
   if(!data.success||typeof data.image_data!=="string"||!data.image_data.startsWith("data:image/png;base64,"))throw new Error(data.message||"Latar gagal dihapus.");
   const image=await loadImage(data.image_data);if(!active())return;
   const c=canvas.current;if(image.width!==c.width||image.height!==c.height)throw new Error("Dimensi hasil penghapusan latar tidak cocok.");
   c.getContext("2d").clearRect(0,0,c.width,c.height);c.getContext("2d").drawImage(image,0,0);commit();
  });
 }
 async function exportPhoto(download=false) {
  if(!ready||busy||operation.current||stroke.current)return;
  try {
   const c=canvas.current;if(!hasVisiblePixels(c.getContext("2d").getImageData(0,0,c.width,c.height).data))throw new Error("Foto kosong. Pulihkan sebagian foto sebelum menyimpan.");
   const size=fitDimensions(c.width,c.height,512),out=makeCanvas(size.width,size.height);out.getContext("2d").drawImage(c,0,0,size.width,size.height);
   if(!hasVisiblePixels(out.getContext("2d").getImageData(0,0,out.width,out.height).data))throw new Error("Hasil terlalu kecil atau transparan. Pulihkan sebagian foto.");
   const content=out.toDataURL("image/png");if(content.length>2*1024*1024)throw new Error("Hasil foto terlalu besar. Potong area foto lalu coba lagi.");
   const label=name.trim().slice(0,80)||"Stiker foto";setError("");
   if(download){const link=document.createElement("a");link.href=content;link.download=`${label.replace(/[^a-zA-Z0-9_-]/g,"_")}.png`;link.click();}
   else await run(async (_signal,active)=>{const result=await onApply({content,name:label});if(active()&&result===false)throw new Error("Stiker belum tersimpan. Periksa koneksi dan coba lagi.");if(active()&&result!==false)close();});
  } catch(err){setError(err.message||"PNG gagal dibuat.");}
 }
 const disabled=busy||!ready;
 return <dialog ref={dialog} className="photo-sticker-editor" onCancel={e=>{e.preventDefault();close();}} aria-labelledby="photo-sticker-title">
  <header><div><h2 id="photo-sticker-title">Studio foto stiker</h2><p>Potong, hapus latar, lalu rapikan tepi foto.</p></div><button type="button" onClick={close} aria-label="Tutup editor foto">✕</button></header>
  <div className="photo-sticker-body"><aside>
   <label className="photo-upload">Unggah foto<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={upload}/></label><small>PNG, JPEG, WebP · maksimal 10 MB</small>
   <label>Nama stiker<input value={name} maxLength={80} disabled={busy} onChange={e=>setName(e.target.value)}/></label>
   <div className="photo-tool-row">{[["crop","Area / potong"],["erase","Penghapus"],["restore","Pulihkan"]].map(([tool,label])=><button type="button" key={tool} disabled={disabled} aria-pressed={mode===tool} onClick={()=>setMode(tool)}>{label}</button>)}</div>
   {mode==="crop"?<fieldset disabled={disabled}><legend>Area potong / panduan subjek</legend><small>Tarik kotak di foto, atau atur persentase di bawah.</small>{[["x","Kiri"],["y","Atas"],["width","Lebar"],["height","Tinggi"]].map(([key,label])=><label key={key}>{label} (%)<input type="number" min={key==="x"||key==="y"?0:1} max="100" value={Math.round(rect[key]*100)} onChange={e=>setRect(r=>normalizeRect({...r,[key]:Number(e.target.value)/100}))}/></label>)}<button type="button" onClick={crop}>Potong ke area</button><button type="button" onClick={()=>setRect(FULL)}>Pilih seluruh foto</button></fieldset>:<label>Ukuran kuas: {brush} px<input type="range" min="2" max="160" value={brush} disabled={disabled} onChange={e=>setBrush(Number(e.target.value))}/></label>}
   <button type="button" disabled={disabled} onClick={removeBackground}>Hapus latar otomatis</button><small>Pemrosesan lokal. Tandai area subjek sebelum menghapus latar. Hasil otomatis dapat dirapikan dengan Penghapus / Pulihkan.</small>
   <div className="photo-tool-row"><button type="button" disabled={disabled||history.index<=0} onClick={()=>moveHistory(-1)}>Urungkan</button><button type="button" disabled={disabled||history.index>=history.entries.length-1} onClick={()=>moveHistory(1)}>Ulangi</button><button type="button" disabled={disabled} onClick={()=>run(async (_signal,active)=>{await restoreSnapshot(initial.current,active);if(active())commit();})}>Reset foto</button></div>
  </aside><main><div className="photo-stage"><div className="photo-image-wrap" style={{display:ready?"inline-block":"none"}}><canvas ref={canvas} aria-label="Foto yang sedang diedit" style={{cursor:mode==="crop"?"crosshair":"cell"}} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerEnd} onPointerCancel={pointerEnd}/>{mode==="crop"&&<div className="photo-selection" style={{left:`${rect.x*100}%`,top:`${rect.y*100}%`,width:`${rect.width*100}%`,height:`${rect.height*100}%`}}/>}</div>{!ready&&<p>Unggah foto untuk mulai mengedit.</p>}</div><p className="photo-stage-note">Pola kotak menandakan area transparan. Kuas Pulihkan memakai foto asli; potongan dapat dikembalikan dengan Urungkan atau Reset.</p></main></div>
  <div aria-live="polite" className="photo-editor-status">{busy?"Memproses foto…":error&&<span role="alert">{error}</span>}</div>
  <footer><small>PNG transparan · maksimal 512 × 512 px</small><button type="button" disabled={disabled} onClick={()=>exportPhoto(true)}>Unduh PNG</button><button type="button" disabled={disabled} className="photo-apply" onClick={()=>exportPhoto()}>Gunakan stiker</button></footer>
 </dialog>;
}
