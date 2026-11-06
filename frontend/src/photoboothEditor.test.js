import test from "node:test";
import assert from "node:assert/strict";
import { visibleEditorItems, resolveEditorText, resolveEditorTextItem, editorCatalogReducer, upsertStudioSticker } from "./photoboothEditor.js";
import { persistEditorCatalog } from "./editorCatalogStorage.js";

test("catalog exposes only published items and preserves an empty catalog", () => {
  const settings = { stickers: [{ id: "hidden", visible: false }, { id: "shown", visible: true }], texts: [] };
  assert.deepEqual(visibleEditorItems(settings).stickers.map((item) => item.id), ["shown"]);
  assert.deepEqual(visibleEditorItems(settings).texts, []);
});

test("users may only add published admin text", () => {
  const settings = { texts: [{ id: "a", text: "Hello", visible: true }, { id: "b", text: "Secret", visible: false }] };
  assert.equal(resolveEditorText(settings, "Hello"), "Hello");
  assert.equal(resolveEditorText(settings, "Secret"), null);
  assert.equal(resolveEditorText(settings, "User typed this"), null);
});

test("texts with identical wording retain the selected admin design by ID", () => {
  const settings = { texts: [
    { id: "pink", text: "Hello", visible: true, style: { color: "#ff00aa" } },
    { id: "gold", text: "Hello", visible: true, style: { color: "#ffcc00" } },
    { id: "hidden", text: "Hello", visible: false },
  ] };
  assert.equal(resolveEditorTextItem(settings, "Hello", "gold").style.color, "#ffcc00");
  assert.equal(resolveEditorTextItem(settings, "Hello", "hidden"), null);
  assert.equal(resolveEditorTextItem(settings, "Anything", "missing"), null);
});

test("reconnecting preserves an unsaved admin draft until a save succeeds", () => {
  const original = { stickers: [], texts: [] };
  const draft = { stickers: [], texts: [{ id: "new", text: "New", visible: false }] };
  let state = { draft: original, dirty: false };
  state = editorCatalogReducer(state, { type: "edit", draft });
  state = editorCatalogReducer(state, { type: "load", settings: original });
  assert.equal(state.draft, draft);
  assert.equal(state.dirty, true);
  state = editorCatalogReducer(state, { type: "saved", settings: draft });
  assert.equal(state.dirty, false);
  state = editorCatalogReducer(state, { type: "load", settings: original });
  assert.equal(state.draft, original);
});

test("admin catalog supports undo/redo and preserves history across a verified save", () => {
  const first = { stickers: [], texts: [] };
  const second = { stickers: [], texts: [{ id: "a", text: "Hello", visible: false }] };
  let state = { draft: first, dirty: false };
  state = editorCatalogReducer(state, { type: "edit", draft: second });
  state = editorCatalogReducer(state, { type: "saved", settings: second });
  state = editorCatalogReducer(state, { type: "load", settings: second });
  state = editorCatalogReducer(state, { type: "undo" });
  assert.equal(state.draft, first);
  assert.equal(state.dirty, true);
  state = editorCatalogReducer(state, { type: "redo" });
  assert.equal(state.draft, second);
});

test("retrying a photo save updates the same draft sticker and preserves existing style and visibility", () => {
  const photo = { id: "stable-photo-id", name: "Photo", content: "data:image/png;base64,one" };
  let draft = upsertStudioSticker({ texts: [], stickers: [] }, photo);
  draft = upsertStudioSticker(draft, { ...photo, content: "data:image/png;base64,two" });
  assert.equal(draft.stickers.length, 1);
  assert.equal(draft.stickers[0].visible, false);
  draft = { ...draft, stickers: [{ ...draft.stickers[0], visible: true, style: { size: 22, shadow: "glow" } }] };
  const result = upsertStudioSticker(draft, photo);
  assert.equal(result.stickers.length, 1);
  assert.equal(result.stickers[0].visible, true);
  assert.deepEqual(result.stickers[0].style, { size: 22, shadow: "glow" });
});

const styledCatalog = () => ({ stickers: [], texts: [{ id: "a", text: "HELLO", visible: true,
  style: { font: "serif", color: "#eecc88", size: 8, rotation: -15, background: "none" } }] });

test("saving refuses an old backend before it can discard the admin design", async () => {
  let writes = 0;
  await assert.rejects(persistEditorCatalog("http://test", styledCatalog(), { requestJson: async (_url, options) => {
    if (options?.method === "POST") writes += 1;
    return { success: true, settings: { stickers: [], texts: [] } };
  } }), /restart backend/i);
  assert.equal(writes, 0);
});

test("saving only accepts a catalog whose style survives POST and persisted readback", async () => {
  let settings = { stickers: [], texts: [] };
  const catalog = styledCatalog();
  const saved = await persistEditorCatalog("http://test", catalog, { requestJson: async (_url, options) => {
    if (options?.method === "POST") settings = JSON.parse(options.body);
    return { success: true, schema_version: 2, settings: structuredClone(settings) };
  } });
  assert.deepEqual(saved, catalog);
  assert.deepEqual(catalog, styledCatalog());
});

test("a backend response that drops style cannot replace the admin draft", async () => {
  const catalog = styledCatalog();
  await assert.rejects(persistEditorCatalog("http://test", catalog, { requestJson: async (_url, options) => {
    const settings = structuredClone(catalog);
    if (options?.method === "POST") delete settings.texts[0].style;
    return { success: true, schema_version: 2, settings };
  } }), /berbeda|berubah/i);
  assert.deepEqual(catalog, styledCatalog());
});

test("a persisted readback that differs from the saved design is reported as a failure", async () => {
  const catalog = styledCatalog();
  let calls = 0;
  await assert.rejects(persistEditorCatalog("http://test", catalog, { requestJson: async () => {
    calls += 1;
    const settings = structuredClone(catalog);
    if (calls === 3) settings.texts[0].style.color = "#ffffff";
    return { success: true, schema_version: 2, settings };
  } }), /berbeda|berubah/i);
});
