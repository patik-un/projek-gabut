export const STUDIO_STICKER_CATEGORIES = [
  { id: "cute", label: "Lucu", items: ["🥰", "🐱", "🧸", "🌸", "🥳", "😎", "🐻", "🍒"] },
  { id: "y2k", label: "Berkilau", items: ["✨", "⭐", "🌟", "💫", "⚡", "🪩", "💿", "🦋"] },
  { id: "ribbon", label: "Pita", items: ["🎀", "🎗️", "🩷", "🌷", "💐", "🪷", "🦢", "👛"] },
  { id: "party", label: "Aksesori", items: ["🕶️", "👓", "🎩", "🥳", "🎉", "🎈", "🎂", "👑"] },
  { id: "love", label: "Hati", items: ["❤️", "💖", "💗", "💕", "💘", "💝", "💋", "💌"] },
];
export const DEFAULT_EDITOR_CATALOG = {
  stickers: STUDIO_STICKER_CATEGORIES.flatMap((category) => category.items.map((content, index) => ({
    id: `${category.id}-${index}`, name: `${category.label} ${index + 1}`, content, kind: "emoji", visible: true,
  }))),
  texts: ["BESTIES ✨", "PHOTOBOOTH 📸", "HAPPY DAY 💖", "SWEET MEMORIES", "LOVE YOU ❤️", "SMILE :) 😊", "GOOD VIBES 🌸", "SPECIAL MOMENT"]
    .map((text, index) => ({ id: `text-${index}`, text, visible: true })),
};

export function visibleEditorItems(settings) {
  return {
    stickers: settings.stickers.filter((item) => item.visible === true),
    texts: settings.texts.filter((item) => item.visible === true),
  };
}

export function resolveEditorText(settings, text) {
  return settings.texts.find((item) => item.visible === true && item.text === text)?.text ?? null;
}

export function resolveEditorTextItem(settings, text, id = null) {
  return settings.texts.find((item) => item.visible === true && (id ? item.id === id : item.text === text)) || null;
}

export function editorCatalogReducer(state, action) {
  const past = state.past || [], future = state.future || [];
  if (action.type === "edit") return { draft: action.draft, dirty: true, past: state.draft ? [...past, state.draft].slice(-20) : [], future: [] };
  if (action.type === "undo" && past.length) return { draft: past.at(-1), dirty: true, past: past.slice(0, -1), future: [state.draft, ...future] };
  if (action.type === "redo" && future.length) return { draft: future[0], dirty: true, past: [...past, state.draft].slice(-20), future: future.slice(1) };
  if (action.type === "saved") return { draft: action.settings, dirty: false, past, future };
  if (action.type === "load" && !state.dirty && action.settings !== state.draft) {
    return { draft: action.settings, dirty: false, past: [], future: [] };
  }
  return state;
}

export function upsertStudioSticker(draft, { id, content, name }) {
  const previous = draft.stickers.find((item) => item.id === id);
  if (!previous && draft.stickers.length >= 100) throw new Error("Katalog penuh. Hapus stiker sebelum menambahkan.");
  const item = previous ? { ...previous, content, name } : { id, content, name, kind: "image", visible: false, style: { size: 32, shadow: "none" } };
  return { ...draft, stickers: previous ? draft.stickers.map((entry) => entry.id === id ? item : entry) : [...draft.stickers, item] };
}

// Keep animated GIF bytes; decode and resize static uploads, preserving PNG transparency.
export async function readStickerImage(file) {
  if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.type) || file.size > 2 * 1024 * 1024) {
    throw new Error("Pilih PNG, JPEG, WebP, atau GIF maksimal 2 MB");
  }
  if (file.type === "image/gif") {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 32768) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
    }
    return `data:image/gif;base64,${btoa(binary)}`;
  }
  const bitmap = await createImageBitmap(file);
  try {
    const ratio = Math.min(1, 512 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
    canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  } finally {
    bitmap.close();
  }
}
