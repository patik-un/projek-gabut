import { useEffect, useRef, useState } from "react";
import DecorationArtwork from "./DecorationArtwork.jsx";
import { decorationStyle, DESIGN_FONTS } from "./decorationArtwork.js";
import PhotoStickerEditor from "./PhotoStickerEditor.jsx";
import StudioComposition from "./StudioComposition.jsx";

function Range({ label, value, min, max, step = 1, unit = "", onChange }) {
  return <label className="design-control design-range"><span>{label}<output>{value}{unit}</output></span>
    <input type="range" aria-label={label} min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
  </label>;
}
function Color({ label, value, onChange }) {
  return <label className="design-control design-color"><span>{label}</span><div>
    <input type="color" aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} />
    <span>{value.toUpperCase()}</span></div></label>;
}

export default function PhotoboothDesignStudio({ draft, selection, onSelect, onChange, onDuplicate, onDelete,
  onAddText, onUpload, onSave, onClose, saving, uploading, dirty, message, saveError,
  apiUrl, onCreateSticker, onUndo, onRedo, canUndo, canRedo }) {
  const dialog = useRef(null);
  const [background, setBackground] = useState("dark");
  const [mode, setMode] = useState("element");
  const [photo, setPhoto] = useState(null);
  const composition = useRef(null);
  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement;
    element.showModal();
    return () => { element.close(); previous?.focus?.(); };
  }, []);
  const collection = selection.collection;
  const item = draft[collection].find((entry) => entry.id === selection.id) || draft[collection][0];
  const type = collection === "texts" ? "text" : "sticker";
  const style = decorationStyle(type, item?.style);
  const patch = (value) => { if (item) onChange(collection, item.id, value); };
  const setStyle = (value) => patch({ style: { ...style, ...value } });
  return <dialog ref={dialog} className="photobooth-design-dialog" aria-labelledby="design-studio-heading"
    onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <div className="design-studio-shell">
      <header className="design-studio-header">
        <div><h2 id="design-studio-heading">Studio Desain</h2><span className={dirty ? "design-dirty" : "design-saved"}>{dirty ? "Perubahan belum disimpan" : "Desain tersimpan"}</span></div>
        <div className="design-header-actions">
          {mode === "element" && <><button type="button" className="secondary-button compact" disabled={saving || uploading || !canUndo} onClick={onUndo}>Urungkan</button>
          <button type="button" className="secondary-button compact" disabled={saving || uploading || !canRedo} onClick={onRedo}>Ulangi</button>
          <button type="button" className="upload-button compact" disabled={saving || uploading || !dirty} onClick={onSave}>{saving ? "Menyimpan…" : "Simpan desain"}</button></>}
          <button type="button" className="secondary-button compact" onClick={onClose} aria-label="Tutup studio desain">Tutup</button>
        </div>
      </header>
      {message && <p role={saveError ? "alert" : "status"} className={`design-message ${saveError ? "design-error" : ""}`}>{message}</p>}
      <div className="advanced-studio-modes"><button type="button" aria-pressed={mode === "element"} onClick={() => setMode("element")}>Edit elemen</button>
        <button type="button" aria-pressed={mode === "composition"} onClick={() => setMode("composition")}>Canvas & layer</button>
        <button type="button" disabled={saving || uploading} onClick={() => setPhoto({ initialSrc: null, id: crypto.randomUUID() })}>Foto → Stiker</button></div>
      <fieldset disabled={saving || uploading} className="design-studio-body" style={{ display: mode === "element" ? undefined : "none" }}>
        <section className="design-workspace" aria-label="Preview desain langsung">
          <div className="design-element-picker">
            <div className="design-library-tabs">
              {[["texts", "Tulisan"], ["stickers", "Stiker"]].map(([key, label]) => <button type="button" key={key}
                aria-pressed={collection === key} className={collection === key ? "active" : ""}
                onClick={() => onSelect({ collection: key, id: draft[key][0]?.id })}>{label}</button>)}
            </div>
            <select aria-label="Pilih elemen desain" value={item?.id || ""} onChange={(event) => onSelect({ collection, id: event.target.value })}>
              {!draft[collection].length && <option value="">Belum ada elemen</option>}
              {draft[collection].map((entry) => <option key={entry.id} value={entry.id}>{type === "text" ? entry.text || "Tulisan kosong" : entry.name}</option>)}
            </select>
          </div>
          <div className={`design-stage design-stage-${background}`}>
            <div className="design-stage-frame">
              {item ? <DecorationArtwork item={item} type={type} proportional /> : <p>Tambahkan elemen untuk mulai mendesain.</p>}
            </div>
          </div>
          <div className="design-workspace-footer"><span>Preview desain yang akan disimpan.</span>
            <label>Latar preview<select aria-label="Latar preview" value={background} onChange={(event) => setBackground(event.target.value)}>
              <option value="dark">Gelap</option><option value="light">Terang</option><option value="checker">Transparan</option>
            </select></label></div>
        </section>
        <aside className="design-inspector" aria-label="Pengaturan desain">
          {item ? <>
            {type === "sticker" && item.kind === "image" && <button type="button" className="secondary-button compact" onClick={() => setPhoto({ initialSrc: item.content, id: item.id, name: item.name })}>Edit foto stiker</button>}
            <label className="design-control"><span>{type === "text" ? "Isi tulisan" : "Nama stiker"}</span>
              <input type="text" aria-label={type === "text" ? "Isi tulisan" : "Nama stiker"} value={type === "text" ? item.text : item.name} maxLength={type === "text" ? 32 : 80}
                onChange={(event) => patch(type === "text" ? { text: event.target.value } : { name: event.target.value })} /></label>
            {type === "text" && <>
              <label className="design-control"><span>Font</span><select aria-label="Jenis font" value={style.font} onChange={(event) => setStyle({ font: event.target.value })}>
                {DESIGN_FONTS.map((font) => <option key={font.id} value={font.id}>{font.name}</option>)}
              </select></label>
              <Color label="Warna tulisan" value={style.color} onChange={(color) => setStyle({ color })} />
            </>}
            <Range label="Ukuran" min={type === "text" ? 2 : 6} max={type === "text" ? 14 : 40} step={0.5} value={style.size} unit="%" onChange={(size) => setStyle({ size })} />
            <details className="design-advanced"><summary>Pengaturan lanjutan</summary>
              {type === "text" && <>
                <div className="design-control-pair"><label className="design-control"><span>Ketebalan</span><select aria-label="Ketebalan tulisan" value={style.weight} onChange={(event) => setStyle({ weight: Number(event.target.value) })}>
                  <option value={400}>Normal</option><option value={600}>Sedang</option><option value={800}>Tebal</option>
                </select></label><label className="design-check"><input type="checkbox" checked={style.italic} onChange={(event) => setStyle({ italic: event.target.checked })} />Miring</label></div>
                <label className="design-control"><span>Latar tulisan</span><select aria-label="Latar tulisan" value={style.background} onChange={(event) => setStyle({ background: event.target.value })}>
                  <option value="none">Transparan</option><option value="rounded">Kotak membulat</option><option value="pill">Label oval</option></select></label>
                {style.background !== "none" && <Color label="Warna latar tulisan" value={style.backgroundColor} onChange={(backgroundColor) => setStyle({ backgroundColor })} />}
              </>}
              <Range label="Rotasi" min={-180} max={180} value={style.rotation} unit="°" onChange={(rotation) => setStyle({ rotation })} />
              <Range label="Opasitas" min={20} max={100} value={style.opacity} unit="%" onChange={(opacity) => setStyle({ opacity })} />
              {item.kind !== "gif" && <>
              <Range label="Garis tepi" min={0} max={type === "text" ? 8 : 12} value={style.outlineWidth} onChange={(outlineWidth) => setStyle({ outlineWidth })} />
              {style.outlineWidth > 0 && <Color label="Warna garis tepi" value={style.outlineColor} onChange={(outlineColor) => setStyle({ outlineColor })} />}
              <label className="design-control"><span>Bayangan</span><select aria-label="Bayangan" value={style.shadow} onChange={(event) => setStyle({ shadow: event.target.value })}>
                <option value="none">Tanpa bayangan</option><option value="soft">Lembut</option><option value="glow">Bercahaya</option></select></label>
              </>}
              {item.kind === "gif" && <small className="design-hint">Animasi GIF dipertahankan. Ukuran, rotasi, dan opasitas berlaku pada hasil digital.</small>}
              <button type="button" className="secondary-button compact" onClick={() => patch({ style: item.kind === "gif" ? { ...decorationStyle(type), shadow: "none", outlineWidth: 0 } : decorationStyle(type) })}>Reset gaya</button>
            </details>
          </> : <p className="design-empty">Belum ada elemen.</p>}
          <details className="design-advanced"><summary>Kelola elemen</summary>
            <div className="design-item-actions">
              {type === "text" ? <button type="button" onClick={onAddText} disabled={draft.texts.length >= 100}>Tambah tulisan</button>
                : <label className="design-upload">Unggah stiker<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={onUpload} disabled={draft.stickers.length >= 100} /></label>}
              {item && <><button type="button" disabled={draft[collection].length >= 100} onClick={() => onDuplicate(collection, item)}>Duplikat</button>
                <button type="button" onClick={() => onDelete(collection, item.id)}>Hapus</button></>}
            </div>
          </details>
        </aside>
      </fieldset>
      <StudioComposition ref={composition} draft={draft} hidden={mode !== "composition"} saving={saving || uploading}
        onPhoto={() => setPhoto({ initialSrc: null, id: crypto.randomUUID() })} onSaveSticker={onCreateSticker} />
      {photo && <PhotoStickerEditor apiUrl={apiUrl} initialSrc={photo.initialSrc} initialName={photo.name} onClose={() => setPhoto(null)}
        onApply={async (result) => {
          if (mode === "composition") return composition.current?.addPhoto(result) ?? false;
          return onCreateSticker({ ...result, ...(photo.id ? { id: photo.id } : {}) });
        }} />}
    </div>
  </dialog>;
}
