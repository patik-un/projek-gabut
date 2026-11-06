import { useEffect, useRef, useState } from "react";
import { createStickerArtwork, createTextArtwork } from "./decorationArtwork.js";

export default function DecorationArtwork({ item, type, className = "", proportional = false }) {
  const liveWrapper = useRef(null);
  const [liveWidth, setLiveWidth] = useState(null);
  const [result, setResult] = useState({ artwork: null, error: "" });
  useEffect(() => {
    let active = true;
    setResult({ artwork: null, error: "" });
    Promise.resolve().then(() => type === "text" ? createTextArtwork(item) : createStickerArtwork(item))
      .then((artwork) => { if (active) setResult({ artwork, error: "" }); })
      .catch((error) => { if (active) setResult({ artwork: null, error: error.message }); });
    return () => { active = false; };
  }, [item, type]);
  useEffect(() => {
    const parent = liveWrapper.current?.parentElement;
    if (item.kind !== "gif" || proportional || !result.artwork || !parent) return;
    const fit = () => {
      const { width, height } = parent.getBoundingClientRect();
      setLiveWidth(Math.min(width, height > 0 ? height * result.artwork.width / result.artwork.height : width));
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(parent);
    return () => observer.disconnect();
  }, [item.kind, proportional, result.artwork]);
  if (result.error) return <span className="design-artwork-error" role="status">{result.error}</span>;
  if (!result.artwork) return <span className="design-artwork-loading" aria-label="Memuat preview" />;
  if (type !== "text" && item.kind === "gif") {
    const art = result.artwork;
    return <span ref={liveWrapper} className={`design-artwork ${className}`} style={{ display: "block", position: "relative",
      width: proportional ? `${art.widthPercent}%` : liveWidth === null ? "100%" : `${liveWidth}px`,
      maxHeight: proportional ? undefined : "100%", aspectRatio: `${art.width} / ${art.height}`,
      opacity: (item.style?.opacity ?? 100) / 100, transform: `rotate(${item.style?.rotation || 0}deg)` }}>
      <img src={item.content} alt={item.name} draggable={false} style={{ position: "absolute", display: "block",
        left: `${200 / art.width}%`, top: `${200 / art.height}%`, width: `${100 - 400 / art.width}%`,
        height: `${100 - 400 / art.height}%`, maxHeight: "none", objectFit: "fill", pointerEvents: "none" }} />
    </span>;
  }
  return <img src={result.artwork.src} alt={type === "text" ? item.text : item.name} draggable={false}
    className={`design-artwork ${className}`} style={{ width: proportional ? `${result.artwork.widthPercent}%` : undefined,
      transform: `rotate(${item.style?.rotation || 0}deg)` }} />;
}
