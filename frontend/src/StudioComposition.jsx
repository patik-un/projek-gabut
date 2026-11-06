import { forwardRef, useEffect, useImperativeHandle, useReducer, useRef, useState } from "react";
import { createStickerArtwork, createTextArtwork, decorationStyle, DESIGN_FONTS } from "./decorationArtwork.js";
import { renderScene, sceneReducer, transformLayer } from "./studioScene.js";

const StudioComposition = forwardRef(function StudioComposition({ draft, hidden, saving, onPhoto, onSaveSticker }, ref) {
  const [scene, dispatch] = useReducer(sceneReducer, { layers: [], past: [], future: [] });
  const [selectedId, setSelectedId] = useState(null);
  const [asset, setAsset] = useState("");
  const [name, setName] = useState("Desain gabungan");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [preview, setPreview] = useState(null);
  const board = useRef(null), drag = useRef(null), outputId = useRef(null), operation = useRef(0);
  const selected = scene.layers.find((layer) => layer.id === selectedId);
  useEffect(() => () => { operation.current += 1; }, []);
  const assets = [...draft.texts.map((item) => ({ type: "text", item })), ...draft.stickers.map((item) => ({ type: "sticker", item }))];
  const apply = (layers) => { dispatch({ type: "set", layers }); setError(""); };
  const patch = (id, value) => apply(scene.layers.map((layer) => layer.id === id ? { ...layer, ...value } : layer));
  const addAsset = async (source) => {
    if (scene.layers.length >= 24 || busy || saving) return false;
    setBusy(true); setError("");
    const revision = ++operation.current;
    try {
      const artwork = source.type === "text" ? createTextArtwork(source.item) : await createStickerArtwork(source.item);
      if (revision !== operation.current) return false;
      const id = crypto.randomUUID();
      apply([...scene.layers, { id, name: source.type === "text" ? source.item.text : source.item.name, source, artwork,
        x: 50, y: 50, width: Math.min(80, Math.max(20, artwork.widthPercent)), rotation: source.item.style?.rotation || 0, opacity: 100, visible: true, locked: false }]);
      setSelectedId(id); return true;
    } catch (cause) { setError(cause.message); return false; }
    finally { setBusy(false); }
  };
  useImperativeHandle(ref, () => ({ addPhoto: (photo) => addAsset({ type: "sticker", item: { id: crypto.randomUUID(), kind: "image", content: photo.content, name: photo.name, style: { shadow: "none", size: 32 } } }) }));
  const point = (event) => { const bounds = board.current.getBoundingClientRect(); return { x: (event.clientX - bounds.left) / bounds.width * 100, y: (event.clientY - bounds.top) / bounds.height * 100 }; };
  const start = (event, layer, gesture) => {
    if (busy || saving) return;
    event.preventDefault(); event.stopPropagation(); setSelectedId(layer.id);
    if (layer.locked) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { layer, gesture, start: point(event), pointerId: event.pointerId };
  };
  const move = (event) => {
    const current = drag.current; if (!current || current.pointerId !== event.pointerId) return;
    setPreview({ id: current.layer.id, ...transformLayer(current.layer, current.gesture, current.start, point(event)) });
  };
  const finish = (event, cancelled = false) => {
    const current = drag.current; if (!current || current.pointerId !== event.pointerId) return;
    const last = point(event);
    if (!cancelled && Math.hypot(last.x - current.start.x, last.y - current.start.y) > 0.1) {
      patch(current.layer.id, transformLayer(current.layer, current.gesture, current.start, last));
    }
    drag.current = null; setPreview(null);
  };
  const remove = () => { if (selected) { apply(scene.layers.filter((layer) => layer.id !== selected.id)); setSelectedId(null); } };
  const order = (direction) => {
    if (!selected) return;
    const layers = [...scene.layers], index = layers.findIndex((layer) => layer.id === selected.id), next = index + direction;
    if (next < 0 || next >= layers.length) return;
    [layers[index], layers[next]] = [layers[next], layers[index]]; apply(layers);
  };
  const duplicate = () => {
    if (!selected || scene.layers.length >= 24) return;
    const copy = { ...selected, id: crypto.randomUUID(), x: Math.min(100, selected.x + 4), y: Math.min(100, selected.y + 4) };
    apply([...scene.layers, copy]); setSelectedId(copy.id);
  };
  const textChange = (text) => {
    const source = { ...selected.source, item: { ...selected.source.item, text } };
    patch(selected.id, { source, name: text || "Tulisan", artwork: createTextArtwork(source.item) });
  };
  const textStyleChange = (changes) => {
    const source = { ...selected.source, item: { ...selected.source.item, style: { ...decorationStyle("text", selected.source.item.style), ...changes } } };
    patch(selected.id, { source, artwork: createTextArtwork(source.item) });
  };
  const save = async () => {
    if (busy || saving) return;
    setBusy(true); setError("");
    try {
      const content = await renderScene(scene.layers);
      outputId.current ||= crypto.randomUUID();
      if (await onSaveSticker({ id: outputId.current, content, name: name.trim() || "Desain gabungan" }) === false) throw new Error("Desain belum tersimpan. Coba kembali.");
    } catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  };
  return <section className="studio-composition" hidden={hidden}>
    <fieldset disabled={busy || saving} className="composition-toolbar">
      <select aria-label="Tambahkan elemen ke canvas" value={asset} onChange={(event) => setAsset(event.target.value)}>
        <option value="">Pilih tulisan / stiker…</option>{assets.map((entry, index) => <option key={`${entry.type}-${entry.item.id}`} value={index}>{entry.type === "text" ? "Teks" : "Stiker"} · {entry.type === "text" ? entry.item.text : entry.item.name}</option>)}
      </select>
      <button type="button" disabled={asset === "" || scene.layers.length >= 24} onClick={() => addAsset(assets[Number(asset)])}>＋ Tambah</button>
      <button type="button" onClick={onPhoto} disabled={scene.layers.length >= 24}>Foto → Stiker</button>
      <button type="button" disabled={!scene.past.length} onClick={() => dispatch({ type: "undo" })}>Urungkan</button>
      <button type="button" disabled={!scene.future.length} onClick={() => dispatch({ type: "redo" })}>Ulangi</button>
    </fieldset>
    <div className="composition-body">
      <div className="composition-board-area"><div className="composition-canvas" ref={board} aria-label="Canvas desain gabungan">
        {!scene.layers.length && <p>Tambahkan elemen, lalu geser dan atur ukurannya di sini.</p>}
        {scene.layers.filter((layer) => layer.visible).map((layer) => {
          const displayed = preview?.id === layer.id ? { ...layer, ...preview } : layer;
          return <div key={layer.id} role="button" tabIndex={0} aria-label={`Layer ${layer.name}`} aria-pressed={selectedId === layer.id}
            className={`composition-layer ${selectedId === layer.id ? "selected" : ""} ${layer.locked ? "locked" : ""}`}
            style={{ left: `${displayed.x}%`, top: `${displayed.y}%`, width: `${displayed.width}%`, opacity: displayed.opacity / 100,
              transform: `translate(-50%, -50%) rotate(${displayed.rotation}deg)` }}
            onClick={() => setSelectedId(layer.id)} onPointerDown={(event) => start(event, layer, "move")} onPointerMove={move}
            onPointerUp={finish} onPointerCancel={(event) => finish(event, true)}
            onKeyDown={(event) => {
              const offsets = { ArrowLeft: [-1,0], ArrowRight: [1,0], ArrowUp: [0,-1], ArrowDown: [0,1] };
              if (event.target !== event.currentTarget || layer.locked || busy || saving || !offsets[event.key]) return;
              event.preventDefault(); const [x,y] = offsets[event.key], step = event.shiftKey ? 5 : 1;
              patch(layer.id, { x: Math.max(0, Math.min(100, layer.x + x * step)), y: Math.max(0, Math.min(100, layer.y + y * step)) });
            }}>
            <img src={layer.artwork.src} alt="" draggable={false} />
            {selectedId === layer.id && !layer.locked && <>
              <button type="button" className="composition-handle resize" aria-label={`Ubah ukuran ${layer.name}`} onPointerDown={(event) => start(event, layer, "resize")} onPointerMove={move} onPointerUp={finish} onPointerCancel={(event) => finish(event,true)}>↔</button>
              <button type="button" className="composition-handle rotate" aria-label={`Putar ${layer.name}`} onPointerDown={(event) => start(event, layer, "rotate")} onPointerMove={move} onPointerUp={finish} onPointerCancel={(event) => finish(event,true)}>↻</button>
            </>}
          </div>;
        })}
      </div><p className="composition-hint">Geser elemen · handle ↔ untuk ukuran · ↻ untuk rotasi. Tombol panah menggeser 1%.</p></div>
      <fieldset disabled={busy || saving} className="composition-inspector">
        <h3>Layer <small>{scene.layers.length}/24</small></h3>
        <div className="composition-layer-list">{[...scene.layers].reverse().map((layer) => <div key={layer.id} className={layer.id === selectedId ? "active" : ""}>
          <button type="button" onClick={() => setSelectedId(layer.id)} aria-pressed={layer.id === selectedId}>{layer.name}</button>
          <button type="button" aria-label={`${layer.visible ? "Sembunyikan" : "Tampilkan"} layer ${layer.name}`} onClick={() => patch(layer.id, { visible: !layer.visible })}>{layer.visible ? "◉" : "○"}</button>
          <button type="button" aria-label={`${layer.locked ? "Buka kunci" : "Kunci"} layer ${layer.name}`} onClick={() => patch(layer.id, { locked: !layer.locked })}>{layer.locked ? "🔒" : "◇"}</button>
        </div>)}</div>
        {selected && <>
          {selected.source.type === "text" && <fieldset disabled={selected.locked} className="composition-text-fields">
            <label className="design-control">Isi teks layer<input aria-label="Isi teks layer" value={selected.source.item.text} maxLength={32} onChange={(event) => textChange(event.target.value)} /></label>
            <label className="design-control">Font layer<select aria-label="Font layer" value={decorationStyle("text", selected.source.item.style).font} onChange={(event) => textStyleChange({ font: event.target.value })}>
              {DESIGN_FONTS.map((font) => <option key={font.id} value={font.id}>{font.name}</option>)}
            </select></label>
            <label className="design-control">Warna layer<input aria-label="Warna layer" type="color" value={decorationStyle("text", selected.source.item.style).color} onChange={(event) => textStyleChange({ color: event.target.value })} /></label>
          </fieldset>}
          <fieldset disabled={selected.locked} className="composition-transform-fields">
            {[["x","Posisi X",0,100],["y","Posisi Y",0,100],["width","Ukuran layer",5,100],["rotation","Rotasi layer",-180,180],["opacity","Opasitas layer",20,100]].map(([key,label,min,max]) => <label key={key} className="design-control">{label}<input aria-label={label} type="number" min={min} max={max} value={Math.round(selected[key] * 10) / 10} onChange={(event) => {
              const value = Number(event.target.value); if (Number.isFinite(value)) patch(selected.id, { [key]: Math.max(min, Math.min(max, value)) });
            }} /></label>)}
          </fieldset>
          <div className="design-item-actions"><button type="button" onClick={() => order(1)}>Ke depan</button><button type="button" onClick={() => order(-1)}>Ke belakang</button>
            <button type="button" disabled={scene.layers.length >= 24} onClick={duplicate}>Duplikat</button><button type="button" onClick={remove}>Hapus layer</button></div>
        </>}
      </fieldset>
    </div>
    <fieldset disabled={busy || saving} className="composition-save"><input aria-label="Nama desain gabungan" value={name} maxLength={80} onChange={(event) => setName(event.target.value)} />
      <button type="button" disabled={!scene.layers.some((layer) => layer.visible)} onClick={save}>{busy || saving ? "Memproses…" : "Simpan gabungan sebagai stiker"}</button>
      <small>Hasil gabungan berupa PNG transparan; GIF di canvas ini menjadi gambar diam. Pasang GIF langsung pada strip fotobooth untuk hasil bergerak.</small>
    </fieldset>
    {error && <p role="alert" className="design-error">{error}</p>}
  </section>;
});
export default StudioComposition;
