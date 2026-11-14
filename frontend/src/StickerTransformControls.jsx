import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { beginStickerTransform, stickerActionCorrection } from "./stickerTransform.js";

const CORNERS = [
  ["nw", "kiri atas"], ["ne", "kanan atas"],
  ["sw", "kiri bawah"], ["se", "kanan bawah"],
];

export default function StickerTransformControls({ item, onChange, onDelete }) {
  const cleanupRef = useRef(null);
  const controlsRef = useRef(null);
  const actionsRef = useRef(null);
  const [actionOffset, setActionOffset] = useState({ x: 0, y: 0 });
  const actionOffsetRef = useRef(actionOffset);
  actionOffsetRef.current = actionOffset;
  useLayoutEffect(() => {
    const controls = controlsRef.current;
    const bounds = controls?.closest(".studio-template-preview");
    const actions = actionsRef.current;
    if (!bounds || !actions) return;
    const fitActions = () => {
      const current = actionOffsetRef.current;
      const scale = item.scale || 1, rotation = item.rotation || 0;
      const angle = rotation * Math.PI / 180;
      const dx = scale * (current.x * Math.cos(angle) - current.y * Math.sin(angle));
      const dy = scale * (current.x * Math.sin(angle) + current.y * Math.cos(angle));
      const rect = actions.getBoundingClientRect();
      const correction = stickerActionCorrection({ left: rect.left - dx, right: rect.right - dx,
        top: rect.top - dy, bottom: rect.bottom - dy }, bounds.getBoundingClientRect(), rotation, scale);
      if (Math.abs(correction.x - current.x) < 0.5 && Math.abs(correction.y - current.y) < 0.5) return;
      actionOffsetRef.current = correction;
      setActionOffset(correction);
    };
    fitActions();
    const observer = new ResizeObserver(fitActions);
    observer.observe(controls);
    observer.observe(bounds);
    return () => observer.disconnect();
  }, [item.id, item.scale, item.rotation, item.x, item.y]);
  useEffect(() => () => cleanupRef.current?.(), [item.id]);
  const start = (event, mode) => {
    cleanupRef.current?.();
    cleanupRef.current = beginStickerTransform(event, item, mode, onChange);
  };
  const handleKey = (event, mode) => {
    if (!["ArrowUp", "ArrowRight", "ArrowDown", "ArrowLeft"].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    const direction = ["ArrowUp", "ArrowRight"].includes(event.key) ? 1 : -1;
    onChange(mode === "resize"
      ? { scale: Math.max(0.4, Math.min(2.8, (item.scale || 1) + direction * 0.1)) }
      : { rotation: ((item.rotation || 0) + direction * 5) % 360 });
  };
  return (
    <div ref={controlsRef} className="sticker-transform-controls" style={{ "--handle-inverse-scale": 1 / (item.scale || 1),
      "--handle-counter-rotation": `${-(item.rotation || 0)}deg` }}
      onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
      <span className="sticker-transform-outline" aria-hidden="true" />
      {CORNERS.map(([corner, label]) => (
        <button key={corner} type="button" className={`sticker-transform-handle sticker-resize-${corner}`}
          aria-label={`Ubah ukuran stiker dari ${label}`} title="Tarik untuk ubah ukuran · tombol panah untuk ukuran"
          onPointerDown={(event) => start(event, "resize")} onKeyDown={(event) => handleKey(event, "resize")} />
      ))}
      <div ref={actionsRef} className="sticker-transform-actions" style={{ marginLeft: actionOffset.x, marginTop: actionOffset.y }}>
      <button type="button" className="sticker-transform-handle sticker-rotate-handle"
        aria-label="Putar stiker langsung" title="Tarik untuk memutar · tombol panah untuk putaran"
        onPointerDown={(event) => start(event, "rotate")} onKeyDown={(event) => handleKey(event, "rotate")}>↻</button>
      <button type="button" className="sticker-transform-handle sticker-delete-handle"
        aria-label="Hapus stiker" title="Hapus stiker"
        onClick={(event) => { event.stopPropagation(); onDelete(); }}>×</button>
      </div>
    </div>
  );
}
