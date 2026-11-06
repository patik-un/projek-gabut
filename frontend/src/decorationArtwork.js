// One renderer for the admin canvas, user choices, and exported strip artwork.
export const DESIGN_FONTS = [
  { id: "sans", name: "Modern", family: 'Arial, Helvetica, sans-serif' },
  { id: "serif", name: "Elegan", family: 'Georgia, "Times New Roman", serif' },
  { id: "cute", name: "Tulisan tangan", family: '"Comic Sans MS", "Chalkboard SE", cursive' },
  { id: "retro", name: "Mesin tik", family: '"Courier New", Courier, monospace' },
  { id: "bold", name: "Poster", family: 'Impact, "Arial Black", sans-serif' },
];
const TEXT_DEFAULT = { font: "cute", size: 5.5, weight: 800, italic: false, color: "#ffffff",
  outlineWidth: 0, outlineColor: "#111318", shadow: "soft", background: "rounded", backgroundColor: "#111318", rotation: 0, opacity: 100 };
const STICKER_DEFAULT = { size: 18, outlineWidth: 0, outlineColor: "#ffffff", shadow: "soft", rotation: 0, opacity: 100 };
export const TEXT_STYLE_PRESETS = [
  { name: "Elegan", style: { ...TEXT_DEFAULT, font: "serif", color: "#f4e7bd", weight: 600, italic: true, background: "none", outlineWidth: 2 } },
  { name: "Pastel", style: { ...TEXT_DEFAULT, color: "#793b60", background: "pill", backgroundColor: "#ffe4f1", shadow: "none" } },
  { name: "Retro", style: { ...TEXT_DEFAULT, font: "retro", color: "#ffe7b0", backgroundColor: "#70362c", outlineWidth: 1, outlineColor: "#261c18" } },
  { name: "Neon", style: { ...TEXT_DEFAULT, font: "bold", color: "#74ffe0", background: "none", shadow: "glow", outlineWidth: 1, outlineColor: "#006650" } },
];

export function decorationStyle(type, style = {}) {
  return { ...(type === "text" ? TEXT_DEFAULT : STICKER_DEFAULT), ...style };
}
const makeDefaultCanvas = () => document.createElement("canvas");
function setShadow(ctx, style, unit, color) {
  ctx.shadowColor = style.shadow === "glow" ? color : "rgba(0,0,0,0.45)";
  ctx.shadowBlur = style.shadow === "none" ? 0 : unit * (style.shadow === "glow" ? 0.25 : 0.16);
  ctx.shadowOffsetY = style.shadow === "soft" ? unit * 0.07 : 0;
}
function artworkResult(canvas, opacity, makeCanvas) {
  let output = canvas;
  if (opacity !== 100) {
    output = makeCanvas();
    output.width = canvas.width;
    output.height = canvas.height;
    const context = output.getContext("2d");
    context.globalAlpha = opacity / 100;
    context.drawImage(canvas, 0, 0);
  }
  return { src: output.toDataURL("image/png"), width: output.width, height: output.height, widthPercent: output.width / 10 };
}

export function createTextArtwork(item, makeCanvas = makeDefaultCanvas) {
  const style = decorationStyle("text", item.style);
  const canvas = makeCanvas();
  let ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Tidak dapat membuat preview");
  const family = DESIGN_FONTS.find((font) => font.id === style.font)?.family || DESIGN_FONTS[0].family;
  const text = String(item.text || " ");
  let fontSize = style.size * 10;
  const font = () => `${style.italic ? "italic " : ""}${style.weight} ${fontSize}px ${family}`;
  ctx.font = font();
  const paddingFactor = style.background === "none" ? 0.12 : 0.45;
  const marginFactor = style.shadow === "none" ? 0.14 : 0.65;
  let width = ctx.measureText(text).width + fontSize * (paddingFactor + marginFactor) * 2;
  if (width > 880) fontSize *= 880 / width;
  ctx.font = font();
  const paddingX = fontSize * paddingFactor;
  const margin = Math.ceil(fontSize * marginFactor);
  const bodyWidth = ctx.measureText(text).width + paddingX * 2;
  const bodyHeight = fontSize * 1.55;
  canvas.width = Math.min(880, Math.ceil(bodyWidth + margin * 2));
  canvas.height = Math.ceil(bodyHeight + margin * 2);
  ctx = canvas.getContext("2d");
  ctx.font = font();
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.globalAlpha = 1;
  ctx.lineJoin = "round";
  if (style.background !== "none") {
    setShadow(ctx, style, fontSize, style.backgroundColor);
    ctx.fillStyle = style.backgroundColor;
    ctx.beginPath();
    ctx.roundRect(margin, margin, bodyWidth, bodyHeight, style.background === "pill" ? bodyHeight / 2 : fontSize * 0.2);
    ctx.fill();
  }
  setShadow(ctx, style, fontSize, style.color);
  if (style.outlineWidth > 0) {
    ctx.strokeStyle = style.outlineColor;
    ctx.lineWidth = fontSize * style.outlineWidth / 50;
    ctx.strokeText(text, margin + paddingX, canvas.height / 2);
  }
  ctx.fillStyle = style.color;
  ctx.fillText(text, margin + paddingX, canvas.height / 2);
  return artworkResult(canvas, style.opacity, makeCanvas);
}

function loadDataImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Gagal membaca gambar stiker"));
    image.src = src;
  });
}

export async function createStickerArtwork(item, { makeCanvas = makeDefaultCanvas, loadImage = loadDataImage } = {}) {
  const style = decorationStyle("sticker", item.kind === "gif" ? { ...item.style, shadow: "none", outlineWidth: 0 } : item.style);
  const size = style.size * 10;
  const image = ["image", "gif"].includes(item.kind) ? await loadImage(item.content) : null;
  const width = image ? size * image.width / Math.max(image.width, image.height) : size;
  const height = image ? size * image.height / Math.max(image.width, image.height) : size;
  const stroke = size * style.outlineWidth / 100;
  const margin = Math.ceil(stroke + (style.shadow === "none" ? 2 : size * 0.55));
  const canvas = makeCanvas();
  canvas.width = Math.ceil(width + margin * 2);
  canvas.height = Math.ceil(height + margin * 2);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Tidak dapat membuat preview");
  const drawContent = (target, x, y) => {
    if (image) target.drawImage(image, x, y, width, height);
    else {
      target.font = `${size * 0.88}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
      target.textAlign = "center";
      target.textBaseline = "middle";
      target.fillText(item.content, x + width / 2, y + height / 2);
    }
  };
  ctx.globalAlpha = 1;
  if (stroke > 0) {
    const mask = makeCanvas();
    mask.width = canvas.width;
    mask.height = canvas.height;
    const maskCtx = mask.getContext("2d");
    drawContent(maskCtx, margin, margin);
    maskCtx.globalCompositeOperation = "source-in";
    maskCtx.fillStyle = style.outlineColor;
    maskCtx.fillRect(0, 0, mask.width, mask.height);
    for (let index = 0; index < 24; index += 1) {
      const angle = index * Math.PI / 12;
      ctx.drawImage(mask, Math.cos(angle) * stroke, Math.sin(angle) * stroke);
    }
  }
  setShadow(ctx, style, size, style.outlineColor);
  drawContent(ctx, margin, margin);
  return artworkResult(canvas, style.opacity, makeCanvas);
}
