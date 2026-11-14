import { useEffect, useReducer, useRef, useState } from "react";
import { editorCatalogReducer, readStickerImage, upsertStudioSticker } from "./photoboothEditor.js";
import { persistEditorCatalog } from "./editorCatalogStorage.js";
import PhotoboothDesignStudio from "./PhotoboothDesignStudio.jsx";
import DecorationArtwork from "./DecorationArtwork.jsx";

export default function PhotoboothEditorAdmin({ settings, apiUrl, onSaved, error, onRetry, onUpdateBusy }) {
  const [{ draft, dirty, past = [], future = [] }, dispatch] = useReducer(editorCatalogReducer, { draft: settings, dirty: false });
  const latestDraft = useRef(draft);
  latestDraft.current = draft;
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [saveError, setSaveError] = useState(false);
  const savingRef = useRef(false);
  const [designer, setDesigner] = useState(null);
  useEffect(() => { onUpdateBusy?.(saving || uploading || dirty || Boolean(designer));
    return () => onUpdateBusy?.(false);
  }, [saving, uploading, dirty, designer, onUpdateBusy]);
  useEffect(() => { dispatch({ type: "load", settings }); }, [settings]);
  const update = (collection, items) => {
    dispatch({ type: "edit", draft: { ...draft, [collection]: items } });
    setMessage("");
  };
  const toggle = (collection, id) => saveCatalog({ ...draft,
    [collection]: draft[collection].map((item) => item.id === id ? { ...item, visible: !item.visible } : item) });
  const changeItem = (collection, id, patch) => update(collection,
    draft[collection].map((item) => item.id === id ? { ...item, ...patch } : item));
  const duplicate = (collection, item) => {
    if (draft[collection].length >= 100) return;
    const copy = { ...item, id: crypto.randomUUID(), visible: false };
    update(collection, [...draft[collection], copy]);
    setDesigner({ collection, id: copy.id });
  };
  const addStudioText = () => {
    if (draft.texts.length >= 100) return;
    const item = { id: crypto.randomUUID(), text: "TULISAN BARU", visible: false };
    update("texts", [...draft.texts, item]);
    setDesigner({ collection: "texts", id: item.id });
  };
  const addText = () => {
    if (!text.trim() || draft.texts.length >= 100) return;
    update("texts", [...draft.texts, { id: crypto.randomUUID(), text: text.trim(), visible: false }]);
    setText("");
  };
  const upload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || draft.stickers.length >= 100) return;
    setUploading(true);
    try {
      const content = await readStickerImage(file);
      const item = { id: crypto.randomUUID(), name: file.name.slice(0, 80), content, kind: file.type === "image/gif" ? "gif" : "image", visible: false,
        ...(file.type === "image/gif" ? { style: { size: 18, shadow: "none", outlineWidth: 0 } } : {}) };
      update("stickers", [...draft.stickers, item]);
      if (designer) setDesigner({ collection: "stickers", id: item.id });
    } catch (cause) { setMessage(cause.message || "Gagal membaca stiker"); }
    finally { setUploading(false); }
  };
  const saveCatalog = async (next) => {
    if (savingRef.current) return false;
    savingRef.current = true;
    setSaving(true);
    setMessage("");
    setSaveError(false);
    try {
      const settings = await persistEditorCatalog(apiUrl, next);
      onSaved(settings);
      dispatch({ type: "saved", settings });
      setMessage("Tersimpan. Desain dan pilihan pengguna sudah diperbarui.");
      return true;
    } catch (cause) { setSaveError(true); setMessage(cause.message || "Gagal menyimpan katalog"); return false; }
    finally { savingRef.current = false; setSaving(false); }
  };
  const save = () => saveCatalog(draft);
  const createStudioSticker = async ({ id = crypto.randomUUID(), content, name }) => {
    if (savingRef.current) return false;
    let next;
    try { next = upsertStudioSticker(latestDraft.current, { id, content, name }); }
    catch (cause) { setSaveError(true); setMessage(cause.message); return false; }
    dispatch({ type: "edit", draft: next });
    setDesigner({ collection: "stickers", id });
    return saveCatalog(next);
  };
  const renderTiles = (collection, type) => <div className={`editor-catalog-tiles editor-catalog-${collection}`}>
    {draft[collection].map((item) => {
      const label = type === "text" ? item.text : item.name;
      return <div key={item.id} className={`editor-catalog-tile ${item.visible ? "is-visible" : "is-hidden"}`}>
        <button type="button" className="editor-catalog-toggle" aria-pressed={item.visible}
          aria-label={`${item.visible ? "Sembunyikan" : "Tampilkan"} ${type === "text" ? "tulisan" : "stiker"} ${label}`} onClick={() => toggle(collection, item.id)}>
          <span className="editor-catalog-tile-art"><DecorationArtwork item={item} type={type} /></span>
          <span className="editor-catalog-tile-name">{label}</span><span className="editor-catalog-tile-status">{item.visible ? "✓ Tampil" : "Tersembunyi"}</span>
        </button>
        <button type="button" className="editor-catalog-design" aria-label={`Desain ${type === "text" ? "tulisan" : "stiker"} ${label}`}
          onClick={() => setDesigner({ collection, id: item.id })}>Edit desain</button>
      </div>;
    })}
    {!draft[collection].length && <p>Belum ada {type === "text" ? "tulisan" : "stiker"}.</p>}
  </div>;
  return <section className="admin-card sparse admin-editor-catalog">
    <div className="template-panel-header"><div>
      <h2>Pilihan Edit Photobooth</h2>
      <span>Desain tulisan dan stiker, lihat hasilnya, lalu tampilkan untuk pengguna.</span>
    </div></div>
    {error ? <div role="alert">{error} <button type="button" className="secondary-button compact" onClick={onRetry}>Coba lagi</button></div>
      : !draft ? <p>Memuat katalog edit…</p> : <>
        <div className="design-launch-card">
          <div><h3>Studio Desain</h3><p>Edit tulisan dan stiker dengan preview langsung.</p></div>
          <button type="button" className="upload-button compact" disabled={saving || uploading} onClick={() => setDesigner({ collection: "texts", id: draft.texts[0]?.id })}>Buka Studio Desain</button>
        </div>
        <p className="editor-catalog-legend"><span />Hijau = tampil · Gelap = tersembunyi. Klik kartu untuk mengubah dan langsung menyimpan.</p>
        <fieldset disabled={saving || uploading} className="editor-catalog-fields">
          <h3>Stiker</h3>
          <label className="admin-input-field">Tambah stiker custom (PNG, JPEG, WebP, GIF · maks. 2 MB)
            <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={upload} disabled={draft.stickers.length >= 100} />
          </label>
          {renderTiles("stickers", "sticker")}
          <h3>Tulisan</h3>
          <p>Pengguna hanya memilih tulisan yang ditampilkan di sini.</p>
          <div className="studio-text-input-row">
            <input className="studio-input" aria-label="Tulisan baru untuk pengguna" value={text} maxLength={32} placeholder="Contoh: SELAMAT DATANG" onChange={(event) => setText(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addText(); } }} />
            <button type="button" className="secondary-button compact" onClick={addText} disabled={!text.trim() || draft.texts.length >= 100}>Tambah tulisan</button>
          </div>
          {renderTiles("texts", "text")}
        </fieldset>
        <p className="admin-setting-note">Item baru dimulai dalam keadaan tersembunyi. Klik kartunya untuk menampilkan.</p>
        <button type="button" className="upload-button compact" disabled={saving || uploading || !dirty} onClick={save}>{saving ? "Menyimpan…" : uploading ? "Memproses stiker…" : "Simpan Pilihan Edit"}</button>
        {dirty && <span className="editor-catalog-unsaved">Ada perubahan belum disimpan</span>}
        {designer && <PhotoboothDesignStudio draft={draft} selection={designer} onSelect={setDesigner} onChange={changeItem}
          onDuplicate={duplicate} onDelete={(collection, id) => update(collection, draft[collection].filter((entry) => entry.id !== id))}
          onAddText={addStudioText} onUpload={upload} onSave={save} onClose={() => setDesigner(null)}
          apiUrl={apiUrl} onCreateSticker={createStudioSticker}
          onUndo={() => dispatch({ type: "undo" })} onRedo={() => dispatch({ type: "redo" })} canUndo={past.length > 0} canRedo={future.length > 0}
          saving={saving} uploading={uploading} dirty={dirty} message={message} saveError={saveError} />}
      </>}
    {message && <p role={saveError ? "alert" : "status"} className={saveError ? "design-error" : ""}>{message}</p>}
  </section>;
}
