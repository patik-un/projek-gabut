import { useEffect, useState } from "react";

export default function PhotoboothGifResults({ printUrl, assets, busy, errors, onRetry, canRetry = true }) {
  const [selected, setSelected] = useState("print");
  useEffect(() => { if (selected !== "print" && !assets.some((item) => item.kind === selected)) setSelected("print"); }, [assets, selected]);
  const asset = assets.find((item) => item.kind === selected);
  return <div className="photobooth-gif-results">
    <div className="final-result-tabs" role="tablist" aria-label="Jenis hasil photobooth">
      <button type="button" role="tab" aria-selected={selected === "print"} onClick={() => setSelected("print")}>Strip cetak</button>
      {assets.map((item) => <button type="button" key={item.kind} role="tab" aria-selected={selected === item.kind} onClick={() => setSelected(item.kind)}>{item.label}</button>)}
    </div>
    <div className="final-strip-render">{asset || printUrl ? <img src={asset?.dataUrl || printUrl} alt={asset?.label || "Preview hasil photobooth"} /> : <span>Menyusun hasil final…</span>}</div>
    <div className="final-result-downloads">
      {printUrl && <a href={printUrl} download="photobooth-strip.jpg">Unduh strip JPG</a>}
      {assets.map((item) => <a key={item.kind} href={item.dataUrl} download={item.filename}>Unduh {item.label}</a>)}
    </div>
    {busy && <p role="status">Membuat GIF digital… Hasil cetak tetap diproses.</p>}
    {assets.length > 0 && <small>GIF untuk hasil digital; cetakan memakai gambar diam. GIF foto membutuhkan minimal 2 foto sesi.</small>}
    {errors.length > 0 && <div className="final-gif-error"><p role="alert">{errors.join(" · ")}</p>
      <button type="button" className="secondary-button compact" disabled={busy || !canRetry} onClick={onRetry}>Coba buat GIF lagi</button>
      <small>GIF yang dibuat ulang dapat diunduh di sini. GIF baru belum disertakan ke folder Drive yang sudah dibuat.</small>
    </div>}
  </div>;
}
