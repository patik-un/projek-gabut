const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function stickerActionCorrection(rect, bounds, rotation, scale) {
  const dx = Math.max(bounds.left + 8 - rect.left, 0) - Math.max(rect.right - bounds.right + 8, 0);
  const dy = Math.max(bounds.top + 8 - rect.top, 0) - Math.max(rect.bottom - bounds.bottom + 8, 0);
  const angle = rotation * Math.PI / 180;
  return { x: (dx * Math.cos(angle) + dy * Math.sin(angle)) / scale,
    y: (-dx * Math.sin(angle) + dy * Math.cos(angle)) / scale };
}

// Work in viewport pixels: percentage coordinates distort angles on tall strips.
export function transformSticker(item, mode, center, start, point) {
  if (![center.x, center.y, start.x, start.y, point.x, point.y].every(Number.isFinite)) return {};
  const dx = start.x - center.x, dy = start.y - center.y;
  const distance = Math.hypot(dx, dy);
  if (!Number.isFinite(distance) || distance < 1) return {};
  if (mode === "resize") {
    const scale = Number.isFinite(item.scale) ? item.scale : 1;
    // Signed motion along the original handle direction: crossing the center
    // must keep shrinking, and sideways motion must not enlarge the sticker.
    const ratio = ((point.x - center.x) / distance) * (dx / distance)
      + ((point.y - center.y) / distance) * (dy / distance);
    if (!Number.isFinite(ratio)) return {};
    return { scale: clamp(scale * ratio, 0.4, 2.8) };
  }
  if (mode === "rotate") {
    const delta = Math.atan2(point.y - center.y, point.x - center.x) - Math.atan2(dy, dx);
    const rotation = Number.isFinite(item.rotation) ? item.rotation : 0;
    return { rotation: ((rotation + delta * 180 / Math.PI + 540) % 360) - 180 };
  }
  return {};
}

export function beginStickerTransform(event, item, mode, onChange, targetWindow = window) {
  event.stopPropagation();
  if (event.button !== 0) return () => {};
  event.preventDefault();
  const target = event.currentTarget;
  const bounds = target.closest(".studio-sticker-item")?.getBoundingClientRect();
  if (!bounds || !bounds.width || !bounds.height) return () => {};
  const center = { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 };
  const start = { x: event.clientX, y: event.clientY };
  const pointerId = event.pointerId;
  let active = true;
  target.setPointerCapture?.(pointerId);
  const move = (next) => {
    if (!active || next.pointerId !== pointerId) return;
    const patch = transformSticker(item, mode, center, start, { x: next.clientX, y: next.clientY });
    if (Object.keys(patch).length) onChange(patch);
  };
  const cleanup = () => {
    if (!active) return;
    active = false;
    targetWindow.removeEventListener("pointermove", move);
    targetWindow.removeEventListener("pointerup", end);
    targetWindow.removeEventListener("pointercancel", cancel);
    targetWindow.removeEventListener("blur", cleanup);
    if (target.hasPointerCapture?.(pointerId)) target.releasePointerCapture(pointerId);
  };
  const end = (next) => {
    if (next.pointerId !== pointerId) return;
    move(next);
    cleanup();
  };
  const cancel = (next) => { if (next.pointerId === pointerId) cleanup(); };
  targetWindow.addEventListener("pointermove", move);
  targetWindow.addEventListener("pointerup", end);
  targetWindow.addEventListener("pointercancel", cancel);
  targetWindow.addEventListener("blur", cleanup);
  return cleanup;
}
