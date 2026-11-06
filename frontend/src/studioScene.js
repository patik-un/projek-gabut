const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
export function sceneReducer(state, action) {
  const past = state.past || [], future = state.future || [];
  if (action.type === "set") {
    if (action.layers.length > 24) throw new Error("Maksimal 24 layer dalam satu desain");
    return { layers: action.layers, past: [...past, state.layers].slice(-20), future: [] };
  }
  if (action.type === "undo" && past.length) return { layers: past.at(-1), past: past.slice(0, -1), future: [state.layers, ...future] };
  if (action.type === "redo" && future.length) return { layers: future[0], past: [...past, state.layers].slice(-20), future: future.slice(1) };
  return state;
}
export function transformLayer(layer, gesture, start, point) {
  if (![start.x, start.y, point.x, point.y].every(Number.isFinite)) throw new Error("Koordinat canvas tidak valid");
  if (gesture === "move") return { x: clamp(layer.x + point.x - start.x, 0, 100), y: clamp(layer.y + point.y - start.y, 0, 100) };
  const center = { x: layer.x, y: layer.y };
  if (gesture === "resize") {
    const ratio = Math.hypot(point.x - center.x, point.y - center.y) / Math.max(1, Math.hypot(start.x - center.x, start.y - center.y));
    return { width: clamp(layer.width * ratio, 5, 100) };
  }
  const degrees = (Math.atan2(point.y - center.y, point.x - center.x) - Math.atan2(start.y - center.y, start.x - center.x)) * 180 / Math.PI;
  return { rotation: ((layer.rotation + degrees + 540) % 360) - 180 };
}
function loadImage(src) {
  return new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(new Error("Gagal membaca layer desain")); image.src = src; });
}
export async function renderScene(layers, { makeCanvas = () => document.createElement("canvas"), loadImage: decode = loadImage } = {}) {
  const visible = layers.filter((layer) => layer.visible);
  if (!visible.length) throw new Error("Tambahkan minimal satu layer yang tampil");
  const canvas = makeCanvas(); canvas.width = 512; canvas.height = 512;
  const ctx = canvas.getContext("2d");
  for (const layer of visible) {
    const image = await decode(layer.artwork.src);
    const width = layer.width / 100 * 512, height = width * layer.artwork.height / layer.artwork.width;
    ctx.save(); ctx.globalAlpha = layer.opacity / 100;
    ctx.translate(layer.x / 100 * 512, layer.y / 100 * 512); ctx.rotate(layer.rotation * Math.PI / 180);
    ctx.drawImage(image, -width / 2, -height / 2, width, height); ctx.restore();
  }
  const pixels = ctx.getImageData(0, 0, 512, 512).data;
  let hasPixels = false;
  for (let index = 3; index < pixels.length; index += 4) if (pixels[index] > 0) { hasPixels = true; break; }
  if (!hasPixels) throw new Error("Desain kosong atau transparan. Pulihkan atau pindahkan layer ke dalam canvas.");
  return canvas.toDataURL("image/png");
}
