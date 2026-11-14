import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import { requestBackendJson } from "./backendRequest.js";
import { resolveEditorText, resolveEditorTextItem } from "./photoboothEditor.js";
import { decorationStyle } from "./decorationArtwork.js";

const require = createRequire(import.meta.url);
const { parse } = require("@babel/parser");
const source = readFileSync(new URL("./App.jsx", import.meta.url), "utf8");
const app = parse(source, { sourceType: "module", plugins: ["jsx"] }).program.body
  .find((node) => node.type === "FunctionDeclaration" && node.id.name === "App");

// Run the actual callbacks, replacing only their surrounding state and IO.
function appHandler(name, context) {
  const declaration = app.body.body
    .filter((node) => node.type === "VariableDeclaration")
    .flatMap((node) => node.declarations)
    .find((node) => node.id.name === name);
  assert.ok(declaration, `App callback ${name} exists`);
  return vm.runInNewContext(`(${source.slice(declaration.init.start, declaration.init.end)})`, context);
}

function globalValue(name, context = {}) {
  const declaration = parse(source, { sourceType: "module", plugins: ["jsx"] }).program.body
    .filter((node) => node.type === "VariableDeclaration")
    .flatMap((node) => node.declarations).find((node) => node.id.name === name);
  assert.ok(declaration, `Global helper ${name} exists`);
  return vm.runInNewContext(`(${source.slice(declaration.init.start, declaration.init.end)})`, context);
}

test("permanent Drive delivery errors stop polling and show an actionable failure", async () => {
  const effect = app.body.body.find((node) => node.type === "ExpressionStatement" &&
    node.expression.callee?.name === "useEffect" &&
    source.slice(node.start, node.end).includes("const deliveryId = photoboothDriveResult.delivery_id"))
    .expression.arguments[0];
  const timers = [];
  const context = { backendReady: true, photoboothDriveResult: { queued: true, delivery_id: "job" },
    API_URL: "http://test", AbortController,
    requestBackendJson: async () => ({ queued: false, failed: true, delivery_id: "job", message: "Folder tujuan tidak ditemukan" }),
    window: { setTimeout(callback) { timers.push(callback); }, clearTimeout() {} },
    setPhotoboothDriveResult(update) { context.result = update(context.photoboothDriveResult); },
    setPhotoboothDeliveryStatus(update) { context.delivery = update({ drive: "queued" }); },
    setStatus(message) { context.status = message; },
  };
  const cleanup = vm.runInNewContext(`(${source.slice(effect.start, effect.end)})`, context)();
  await timers[0]();
  assert.equal(context.delivery.drive, "failed");
  assert.equal(context.status, "Folder tujuan tidak ditemukan");
  assert.equal(timers.length, 1);
  cleanup();
});

function sessionContext() {
  const context = {
    backendReady: true, photoboothDriveConfigured: false, photoboothInitialDriveFolderId: "",
    API_URL: "http://test", photoboothStripOptions: [], photoboothTemplates: {},
    selectedPhotoboothStrip: null, photoboothTemplate: null, photoboothPhotoCount: 3,
    photoboothCaptureCount: 3, photoboothAdminSettings: { mode: "oto" }, activePaperSize: "4r",
    DEFAULT_SLOT_ADJUSTMENT: {}, decorationRevisionRef: { current: 0 },
    captureSessionRevisionRef: { current: 0 }, photoboothSessionStartingRef: { current: false },
    photoboothFinalBase64Ref: { current: null }, captures: [{ id: "old-1" }, { id: "old-2" }],
    clearPhotoboothGifs() {}, clearAutoCaptureTimers() {},
    createEmptyPhotoboothTemplate: () => ({ pose_count: 3 }), getStripSlots: () => [{}, {}, {}],
    getPreferredStripTemplateMode: () => "default", createEmptyStripMap: globalValue("createEmptyStripMap"),
    window: { setTimeout() {} }, loadCaptures: async () => {}, loadPhotoQueue: async () => {},
    fetch: async () => ({ ok: true, json: async () => ({ success: true }) }),
  };
  // Supply React's state setters while running the production handler outside React.
  for (const node of app.body.body.filter((node) => node.type === "VariableDeclaration").flatMap((node) => node.declarations)) {
    if (node.id.type !== "ArrayPattern" || node.init?.callee?.name !== "useState") continue;
    const [field, setter] = node.id.elements;
    if (field && setter) context[setter.name] = (value) => {
      context[field.name] = typeof value === "function" ? value(context[field.name]) : value;
    };
  }
  context.requestBackendJson = (url, options) => requestBackendJson(url, { ...options, fetchImpl: context.fetch });
  return context;
}

test("a local photobooth session enters the camera without a configured Drive folder", async () => {
  const context = sessionContext();
  await appHandler("handleStartPhotoboothSession", context)();
  assert.equal(context.photoboothStep, 3);
  assert.equal(context.captures.length, 0);
});

test("entering the camera clears old photos before a slow capture refresh finishes", async () => {
  const context = sessionContext();
  context.photoboothDriveConfigured = true;
  let finish;
  context.loadCaptures = () => new Promise((resolve) => { finish = resolve; });
  const starting = appHandler("handleStartPhotoboothSession", context)();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(context.photoboothStep, 3);
  assert.equal(context.captures.length, 0);
  finish();
  await starting;
});

test("capture refresh from before a session reset cannot restore the previous photos", async () => {
  let finish;
  const context = { API_URL: "http://test", captureSessionRevisionRef: { current: 0 },
    requestBackendJson: () => new Promise((resolve) => { finish = resolve; }),
    captures: [] };
  context.setCaptures = (value) => { context.captures = value; };
  const loading = appHandler("loadCaptures", context)();
  context.captureSessionRevisionRef.current += 1;
  finish([{ id: "previous-session" }]);
  await loading;
  assert.equal(context.captures.length, 0);
});

test("repeated continue clicks cannot reset a session that is still starting", async () => {
  const context = sessionContext();
  let finish;
  let starts = 0;
  context.fetch = () => {
    starts += 1;
    return new Promise((resolve) => { finish = resolve; });
  };
  const start = appHandler("handleStartPhotoboothSession", context);
  const first = start();
  await start();
  assert.equal(starts, 1);
  finish({ ok: true, json: async () => ({ success: true }) });
  await first;
  assert.equal(context.photoboothStep, 3);
});

test("a rejected session start stays on selection and allows a later retry", async () => {
  const context = sessionContext();
  context.photoboothStep = 2;
  context.fetch = async () => ({ ok: false, status: 409, json: async () => ({ success: false, message: "Sesi sedang digunakan" }) });
  const start = appHandler("handleStartPhotoboothSession", context);
  await start();
  assert.equal(context.photoboothStep, 2);
  assert.equal(context.status, "Sesi sedang digunakan");
  context.fetch = async () => ({ ok: true, json: async () => ({ success: true }) });
  await start();
  assert.equal(context.photoboothStep, 3);
});

test("photobooth add-text rejects unpublished and freely typed text", () => {
  const added = [];
  const context = {
    editorCatalog: { texts: [{ text: "Approved", visible: true }, { text: "Hidden", visible: false }] },
    resolveEditorText, customTextInput: "Free typing", customTextFont: "bold", customTextColor: "white",
    resolveEditorTextItem, decorationStyle, createTextArtwork: () => ({ src: "data:image/png;base64,styled", width: 300, height: 100, widthPercent: 30 }),
    customTextBg: false, doubleStripEnabled: false, setStripTexts(update) { added.push(...update([])); },
    setSelectedDecoration() {}, setCustomTextInput() {},
  };
  const add = appHandler("handleAddText", context);
  add("Hidden");
  add();
  assert.equal(added.length, 0);
  add("Approved");
  assert.equal(added[0].text, "Approved");
});

test("adding a text snapshots the chosen admin style and rendered artwork", () => {
  let added;
  const style = { font: "serif", color: "#eecc88", size: 7, rotation: -15 };
  const selected = { id: "gold", text: "Hello", visible: true, style };
  const art = { src: "data:image/png;base64,gold", width: 400, height: 140, widthPercent: 40 };
  const context = { editorCatalog: { texts: [selected] }, resolveEditorTextItem, decorationStyle,
    createTextArtwork(item) { assert.equal(item, selected); return art; },
    customTextFont: "cute", customTextColor: "pink", customTextBg: false, doubleStripEnabled: false,
    setStripTexts(update) { added = update([])[0]; }, setSelectedDecoration() {}, setStatus() {},
  };
  appHandler("handleAddText", context)("Hello", "gold");
  assert.equal(added.style.color, "#eecc88");
  assert.equal(added.rotation, -15);
  assert.equal(added.artwork, art);
  assert.equal(added.presetId, "gold");
});

test("styled artwork exports at its saved strip size instead of the legacy font size", () => {
  const drawn = [];
  const ctx = { save() {}, restore() {}, translate() {}, rotate() {}, drawImage(...args) { drawn.push(args); } };
  const art = { src: "data:image/png;base64,styled", width: 400, height: 100, widthPercent: 40 };
  const image = {};
  globalValue("drawDecorationsToContext")(ctx, 1000, 1500, [], [],
    [{ text: "Styled", x: 10, y: 80, scale: 2, artwork: art }], { [art.src]: image });
  assert.deepEqual(drawn[0], [image, 0, -100, 800, 200]);
});

test("a sticker still decoding after session reset is not inserted into the new session", async () => {
  let finish;
  const added = [];
  const context = { editorCatalog: { stickers: [{ id: "s", content: "❤️", kind: "emoji", visible: true }] },
    decorationRevisionRef: { current: 0 }, doubleStripEnabled: false, decorationStyle,
    createStickerArtwork: () => new Promise((resolve) => { finish = resolve; }),
    setStripDecorations(update) { added.push(...update([])); }, setSelectedDecoration() {}, setStatus() {},
  };
  const adding = appHandler("handleAddSticker", context)("❤️", "emoji", "s");
  context.decorationRevisionRef.current += 1;
  finish({ src: "data:fixture", width: 100, height: 100, widthPercent: 10 });
  await adding;
  assert.equal(added.length, 0);
});

test("custom stickers draw decoded image with preserved aspect ratio on exported strip", () => {
  const drawn = [];
  const ctx = { save() {}, restore() {}, translate() {}, rotate() {}, fillText() { assert.fail("Image sticker rendered as text"); },
    drawImage(...args) { drawn.push(args); } };
  const bitmap = { width: 200, height: 100 };
  globalValue("drawDecorationsToContext")(ctx, 1000, 1500, [],
    [{ content: "data:image/png;base64,test", type: "image", x: 50, y: 40, scale: 2 }], [],
    { "data:image/png;base64,test": bitmap });
  assert.equal(drawn.length, 1);
  assert.equal(drawn[0][0], bitmap);
  assert.equal(drawn[0][3], 240);
  assert.equal(drawn[0][4], 120);
});

test("a catalog fetch started before a save cannot replace the new catalog", async () => {
  let resolve;
  const loaded = [];
  const context = {
    editorCatalogRevisionRef: { current: 0 }, API_URL: "http://test", DEFAULT_EDITOR_CATALOG: {},
    requestBackendJson: () => new Promise((done) => { resolve = done; }),
    setEditorCatalog(settings) { loaded.push(settings); },
  };
  const loading = appHandler("loadPhotoboothEditorCatalog", context)();
  const saved = { stickers: [], texts: [{ text: "New" }] };
  appHandler("commitEditorCatalog", context)(saved);
  resolve({ settings: { stickers: [], texts: [] } });
  await loading;
  assert.deepEqual(loaded, [saved]);
});

test("custom layouts render every pose inside either paper size, including half-sheet strips", () => {
  const getStripPaperConfig = globalValue("getStripPaperConfig", {
    STRIP_PAPER_SIZES: { "3r": { width: 1200, height: 1714 }, "4r": { width: 1200, height: 1800 } },
  });
  const getStripBaseSize = globalValue("getStripBaseSize", { getStripPaperConfig });
  const build = globalValue("buildCenteredStripSlots", {
    clampNumber: (value, min, max) => Math.min(max, Math.max(min, value)),
    getStripBaseSize, STRIP_SLOT_WIDTH_BY_COUNT: { 1: 86, 2: 84, 3: 78 }, STRIP_PHOTO_ASPECT_RATIO: 16 / 9,
  });
  for (const count of [1, 3, 4, 7, 10]) {
    for (const paper of ["3r", "4r"]) {
      for (const size of [null, { width: 600, height: 1800 }]) {
        const slots = build(count, paper, size);
        assert.equal(slots.length, count);
        for (const slot of slots) {
          assert.ok(slot.width > 0 && slot.height > 0 && slot.left >= 0 && slot.top >= 0);
          assert.ok(slot.left + slot.width <= 100 && slot.top + slot.height <= 100);
        }
      }
    }
  }
});

test("photo mapping allocates every custom pose and retains filled photo indices", () => {
  const map = globalValue("createEmptyStripMap", { STRIP_SLOTS: [{}, {}, {}] });
  assert.equal(map(10).length, 10);
  assert.deepEqual(Array.from(map(4, 4)), [0, 1, 2, 3]);
  assert.deepEqual(Array.from(map(4, 2)), [0, 1, null, null]);
});

test("double-strip capture sends a three-photo limit and stops after the third photo", async () => {
  const requests = [];
  const context = {
    photoboothPhotoCount: 3, doubleStripEnabled: true, captures: [{}, {}],
    backendReady: true, isCapturing: false, API_URL: "http://test",
    createEmptyStripMap: globalValue("createEmptyStripMap"),
    cameraProvider: "webcam", captureBrowserCameraFrame: () => "frame", clearAutoCaptureTimers() {},
    setIsCapturing() {}, setAutoCaptureCountdown() {}, setAutoCaptureLabel() {},
    setStatus() {}, setShowResult() {}, setSlotPhotoMap() {}, setPhotoboothEditMode() {},
    loadCaptures: async () => { context.captures.push({}); }, loadPhotoQueue: async () => {},
    window: { setTimeout() {} },
    fetch: async (_url, options) => {
      requests.push(JSON.parse(options.body));
      return { ok: true, json: async () => ({ success: true }) };
    },
  };
  context.photoboothCaptureCount = appHandler("photoboothCaptureCount", context);
  const capture = appHandler("handleCapture", context);
  assert.equal(await capture(), true);
  assert.equal(requests[0].max_photo_count, 3);
  assert.equal(await capture(), false);
  assert.equal(requests.length, 1);
});

test("double-strip composition reuses three photos as 1,2,3 and 3,1,2 with their effects and crops", async () => {
  const drawnPhotos = [];
  const loadedPhotos = [];
  const cutLines = [];
  const makeCanvas = () => {
    let translation;
    const drawing = {
      fillRect() {}, save() {}, restore() {}, clip() {}, fill() {}, stroke() {}, rotate() {},
      setLineDash() {}, beginPath() {}, moveTo(x, y) { cutLines.push([x, y]); },
      lineTo(x, y) { cutLines.push([x, y]); },
      translate(x, y) { translation = [x, y]; },
      drawImage(image) {
        if (image.photo) drawnPhotos.push({ photo: image.photo, filter: this.filter, translation });
      },
    };
    return { getContext: () => drawing, toDataURL: () => "data:image/jpeg;base64,output" };
  };
  const context = {
    photoboothPhotoCount: 3, doubleStripEnabled: true, slotPhotoMap: [0, 1, 2],
    photoboothSlotCaptures: [1, 2, 3].map((number) => ({ image_url: `photo-${number}` })),
    photoboothPreviewUsesUploadedTemplate: false, activePhotoboothTemplate: {},
    activeStripSlots: [10, 40, 70].map((top) => ({ left: 10, top, width: 80, height: 15 })),
    filledStripSlotCount: 3, activePaperConfig: { width: 1200, height: 1800 },
    STRIP_MIN_SLOT_SIZE: 1200, STRIP_MAX_RENDER_SCALE: 2, STRIP_SLOTS: [{ width: 80 }],
    templatePhotoAdjustments: [10, 20, 30].map((x) => ({ x, y: 0, scale: 100 })),
    DEFAULT_SLOT_ADJUSTMENT: { x: 0, y: 0, scale: 100 }, photoEffectMap: ["natural", "warm", "mono"],
    getPhotoboothEffect: (id) => ({ filter: id }), studioFrameColor: "white", streamVersion: 1,
    stripDoodles: [], stripDecorations: [], stripTexts: [], photoboothAdminSettings: {},
    document: { createElement: makeCanvas }, URL: { revokeObjectURL() {} },
    loadImage: async (url) => {
      const photo = url.split("?")[0];
      loadedPhotos.push(photo);
      return { image: { photo, width: 1200, height: 675 } };
    },
    traceRoundedRect() {}, drawRoundedRectRing() {}, drawDecorationsToContext() {},
  };
  context.photoboothCaptureCount = appHandler("photoboothCaptureCount", context);
  context.getPhotoboothSideSlotIndex = appHandler("getPhotoboothSideSlotIndex", context);
  context.getPhotoboothSidePhotoIndex = appHandler("getPhotoboothSidePhotoIndex", context);
  const result = await appHandler("renderPhotoboothStrip", context)();
  assert.deepEqual(drawnPhotos.map((draw) => draw.photo), ["photo-1", "photo-2", "photo-3", "photo-3", "photo-1", "photo-2"]);
  assert.deepEqual(drawnPhotos.map((draw) => draw.filter), ["natural", "warm", "mono", "mono", "natural", "warm"]);
  assert.deepEqual(drawnPhotos.map((draw) => draw.translation[0]), [696, 792, 888, 888, 696, 792]);
  assert.deepEqual(loadedPhotos, ["photo-1", "photo-2", "photo-3"]);
  assert.deepEqual(cutLines, [[1200, 0], [1200, 3600]]);
  assert.equal(result.width, 2400);
  assert.equal(result.height, 3600);
});

test("strip selection excludes inactive choices and falls back when a default is disabled or deleted", () => {
  const resolve = globalValue("resolvePhotoboothStripSelection");
  const strips = [{ id: "off", active: false }, { id: "one", active: true }, { id: "four", active: true }];
  assert.equal(resolve(strips, "off", "four").id, "four");
  assert.equal(resolve(strips, "missing", "off").id, "one");
  assert.equal(resolve(strips, "one", "four").id, "one");
  assert.equal(resolve([{ id: "off", active: false }], "off", "off"), null);
});

test("saved custom pose counts and per-strip paper preferences survive reload", () => {
  const load = globalValue("loadPhotoboothAdminSettings", {
    window: { localStorage: { getItem: () => JSON.stringify({ stripPhotoCount: 7,
      defaultStripId: "custom", stripSettings: { custom: { paper_size: "3r", double_strip_enabled: true } } }) } },
    PHOTOBOOTH_ADMIN_SETTINGS_KEY: "admin", PHOTOBOOTH_SLOT_COUNTS: [1, 2, 3],
    DEFAULT_PHOTOBOOTH_ADMIN_SETTINGS: {}, normalizeCompressionQuality: () => 70,
  });
  const settings = load();
  assert.equal(settings.stripPhotoCount, 7);
  assert.equal(settings.defaultStripId, "custom");
  assert.equal(settings.stripSettings.custom.paper_size, "3r");
});

function stripContext(options, ready = false) {
  options = options.map((strip) => ({ pose_count: 1, slot_count: 1, slots: [], image_url: null, active: true, ...strip }));
  const storage = new Map();
  const state = { options, settings: { defaultStripId: options[0]?.id, stripSettings: {}, stripPhotoCount: 1 } };
  const context = {
    API_URL: "http://127.0.0.1:8000", PHOTOBOOTH_STRIP_SETTINGS_KEY: "strips",
    state, storage, backendReadyRef: { current: ready },
    stripSettingsRevisionRef: { current: 0 }, stripSettingsSaveQueueRef: { current: Promise.resolve() },
    stripManagementRef: { current: { options: state.options, settings: state.settings } },
    resolvePhotoboothStripSelection: globalValue("resolvePhotoboothStripSelection"),
    normalizePhotoboothStripOptions: globalValue("normalizePhotoboothStripOptions", {
      createEmptyPhotoboothTemplate: globalValue("createEmptyPhotoboothTemplate"),
    }),
    window: { localStorage: { getItem: (key) => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, value) }, confirm: () => true },
    setPhotoboothStripOptions(value) { state.options = value; },
    setPhotoboothAdminSettings(value) { state.settings = typeof value === "function" ? value(state.settings) : value; },
    setAdminEditingStripId(value) { state.editing = value; },
    setStatus(value) { state.status = value; },
    requestBackendJson: async () => ({ success: true }),
  };
  context.commitPhotoboothStripChanges = appHandler("commitPhotoboothStripChanges", context);
  context.persistPhotoboothStrips = appHandler("persistPhotoboothStrips", context);
  return context;
}

test("editing a same-pose strip preserves its neighbor, image and ID and caches the offline edit", async () => {
  const context = stripContext([
    { id: "one", name: "Pertama", pose_count: 4, slot_count: 4, image_url: "/first.png", slots: [], active: true },
    { id: "two", name: "Kedua", pose_count: 4, slot_count: 4, image_url: "/second.png", slots: [], active: true },
  ]);
  await appHandler("handleUpdateStrip", context)("two", { name: "Anniversary", active: false });
  assert.equal(context.state.options[0].name, "Pertama");
  assert.equal(context.state.options[1].name, "Anniversary");
  assert.equal(context.state.options[1].image_url, "/second.png");
  assert.equal(context.state.options[1].id, "two");
  assert.equal(context.state.options[1].active, false);
  const cached = JSON.parse(context.storage.get("strips"));
  assert.equal(cached.pending_sync, true);
  assert.equal(cached.strip_options[1].name, "Anniversary");
});

test("deletion confirms first, removes only the chosen strip and protects the final strip", async () => {
  const context = stripContext([
    { id: "one", name: "Satu", pose_count: 1, active: true },
    { id: "two", name: "Dua", pose_count: 1, active: true },
  ]);
  const remove = appHandler("handleDeleteStrip", context);
  context.window.confirm = () => false;
  await remove("one");
  assert.equal(context.state.options.length, 2);
  context.window.confirm = () => true;
  await remove("one");
  assert.equal(context.state.options.length, 1);
  assert.equal(context.state.settings.defaultStripId, "two");
  await remove("two");
  assert.equal(context.state.options[0].id, "two");
});

test("settings saves run in order and an older save cannot clear a newer offline edit", async () => {
  const context = stripContext([{ id: "one", name: "Satu", pose_count: 1, active: true }], true);
  const requests = [];
  context.requestBackendJson = (_url, options) => new Promise((resolve) => requests.push({ body: JSON.parse(options.body), resolve }));
  const firstPayload = context.commitPhotoboothStripChanges(context.state.options);
  const first = context.persistPhotoboothStrips(firstPayload);
  await new Promise(setImmediate);
  const secondPayload = context.commitPhotoboothStripChanges([{ ...context.state.options[0], name: "Baru" }]);
  const second = context.persistPhotoboothStrips(secondPayload);
  assert.equal(requests.length, 1);
  requests[0].resolve({ success: true });
  await first;
  await new Promise(setImmediate);
  assert.equal(JSON.parse(context.storage.get("strips")).pending_sync, true);
  assert.equal(requests[1].body.strip_options[0].name, "Baru");
  requests[1].resolve({ success: true });
  await second;
  assert.equal(JSON.parse(context.storage.get("strips")).pending_sync, false);
});

test("reset clears the edited strip image offline while keeping it active and preserving other strips", async () => {
  const context = stripContext([
    { id: "one", name: "Satu", pose_count: 4, slots: [], image_url: "/one.png", active: true },
    { id: "two", name: "Dua", pose_count: 4, slots: [], image_url: "/two.png", active: true },
  ]);
  Object.assign(context, { backendReady: false, adminEditingStrip: context.state.options[1],
    setPendingPhotoboothTemplateFile() {}, setLastDetectedSlot() {} });
  await appHandler("handlePhotoboothTemplateReset", context)();
  assert.equal(context.state.options[0].image_url, "/one.png");
  assert.equal(context.state.options[1].image_url, null);
  assert.equal(context.state.options[1].active, true);
});

test("PNG upload falls back to a durable data URL for the selected custom strip offline", async () => {
  const context = stripContext([{ id: "custom", name: "Anniversary", pose_count: 4,
    slot_count: 4, slots: [], image_url: null, active: true }]);
  Object.assign(context, { backendReady: false, adminEditingStrip: context.state.options[0],
    pendingPhotoboothTemplateFile: { name: "strip.png" }, readFileAsBase64: async () => "cG5n",
    readStripImageSize: async () => ({ width: 400, height: 1000 }),
    buildCenteredStripSlots: () => Array.from({ length: 4 }, () => ({ left: 5, top: 5, width: 80, height: 15 })),
    setPendingPhotoboothTemplateFile() {}, setLastDetectedSlot() {}, setIsUploadingTemplate() {} });
  await appHandler("handleSavePhotoboothTemplate", context)();
  assert.equal(context.state.options[0].id, "custom");
  assert.equal(context.state.options[0].name, "Anniversary");
  assert.equal(context.state.options[0].image_url, "data:image/png;base64,cG5n");
  assert.equal(JSON.parse(context.storage.get("strips")).strip_options[0].image_url, "data:image/png;base64,cG5n");
});

test("a slow template load cannot overwrite a newer admin edit", async () => {
  let finish;
  const context = stripContext([{ id: "one", name: "Satu", active: true }], true);
  context.requestBackendJson = () => new Promise((resolve) => { finish = resolve; });
  const loading = appHandler("loadPhotoboothTemplate", context)();
  context.commitPhotoboothStripChanges([{ id: "one", name: "Baru", active: true }]);
  finish({ success: true, strip_options: [{ id: "one", name: "Lama", active: true }] });
  await loading;
  assert.equal(context.state.options[0].name, "Baru");
});

test("reconnection sends locally edited strips instead of applying an older server catalog", async () => {
  const context = stripContext([{ id: "custom", name: "Lokal", active: true }], true);
  const payload = context.commitPhotoboothStripChanges(context.state.options);
  context.loadPhotoboothStripCache = () => JSON.parse(context.storage.get("strips"));
  const requests = [];
  context.requestBackendJson = async (_url, options = {}) => {
    requests.push(options);
    return options.method === "POST" ? { success: true, ...JSON.parse(options.body) }
      : { success: true, strip_options: [{ id: "old", name: "Lama", active: true }] };
  };
  await appHandler("loadPhotoboothTemplate", context)();
  assert.equal(context.state.options[0].id, "custom");
  assert.equal(JSON.parse(requests[1].body).strip_options[0].name, "Lokal");
  assert.equal(JSON.parse(context.storage.get("strips")).pending_sync, false);
});

test("per-strip print settings change only that strip and persist its default ID", async () => {
  const context = stripContext([{ id: "one", active: true }, { id: "two", active: true }]);
  context.stripManagementRef.current.settings.stripSettings = { one: { paper_size: "4r", double_strip_enabled: false } };
  await appHandler("handleUpdateStripSettings", context)("two", { isDefault: true, paper_size: "3r", double_strip_enabled: true });
  const payload = JSON.parse(context.storage.get("strips"));
  assert.equal(payload.default_strip_id, "two");
  assert.deepEqual(payload.strip_settings.one, { paper_size: "4r", double_strip_enabled: false });
  assert.deepEqual(payload.strip_settings.two, { paper_size: "3r", double_strip_enabled: true });
});

test("adding a custom strip preserves existing same-pose options and validates 1–10 poses", async () => {
  const context = stripContext([{ id: "one", name: "Satu", pose_count: 4, slot_count: 4 }]);
  Object.assign(context, { crypto: { randomUUID: () => "unique" },
    createEmptyPhotoboothTemplate: globalValue("createEmptyPhotoboothTemplate") });
  const add = appHandler("handleAddNewStrip", context);
  assert.equal(await add("", 4), false);
  assert.equal(await add("Terlalu Banyak", 11), false);
  assert.equal(await add("Anniversary", 4), true);
  assert.equal(context.state.options.length, 2);
  assert.equal(context.state.options[0].id, "one");
  assert.equal(context.state.options[1].id, "photobooth-strip-custom-unique");
  assert.equal(context.state.options[1].active, true);
  assert.equal(context.state.options[1].pose_count, 4);
});

test("first migration keeps the existing global paper and double-strip settings for each strip", async () => {
  const context = stripContext([{ id: "one", name: "Satu" }], true);
  Object.assign(context.stripManagementRef.current.settings, { paperSize: "3r", doubleStripEnabled: true });
  Object.assign(context, { loadPhotoboothStripCache: () => ({ pending_sync: false }),
    normalizePhotoboothTemplates: () => ({}), selectedPhotoboothStripRef: { current: null },
    getPreferredStripTemplateMode: () => "default", setPhotoboothTemplates() {}, setSelectedPhotoboothStrip() {},
    setPhotoboothTemplate() {}, setStripTemplateMode() {}, setLastDetectedSlot() {},
    requestBackendJson: async () => ({ success: true, configured: false, strip_options: context.state.options,
      default_strip_id: "one", strip_settings: { one: { paper_size: "4r", double_strip_enabled: false } } }) });
  await appHandler("loadPhotoboothTemplate", context)();
  assert.equal(context.state.settings.stripSettings.one.paper_size, "3r");
  assert.equal(context.state.settings.stripSettings.one.double_strip_enabled, true);
});

test("printing uses the selected strip paper size", async () => {
  let sent;
  const context = { API_URL: "http://127.0.0.1:8000", activePaperSize: "3r",
    photoboothAdminSettings: { printerName: "Test Printer", paperSize: "4r" },
    setPrintError() {}, setIsPrintingStrip() {}, setStatus() {}, window: { setTimeout() {} },
    fetch: async (_url, options) => { sent = JSON.parse(options.body); return { ok: true, json: async () => ({ success: true }) }; } };
  assert.equal(await appHandler("printPhotoboothStrip", context)("image"), true);
  assert.equal(sent.paper_size, "3r");
});

test("backend validation errors retain HTTP status so uploads cannot treat them as disconnections", async () => {
  await assert.rejects(requestBackendJson("http://test/upload", {
    fetchImpl: async () => ({ ok: false, status: 400, json: async () => ({ message: "PNG memiliki terlalu banyak slot" }) }),
  }), (error) => error.status === 400 && error.message === "PNG memiliki terlalu banyak slot");
});

test("cached PNGs load directly without a fetch that packaged CSP would block", async () => {
  let loadedSource;
  class TestImage {
    set src(value) { loadedSource = value; this.onload(); }
  }
  const load = appHandler("loadImage", { Image: TestImage,
    fetch: async () => { throw new Error("CSP blocks fetching data URLs"); } });
  const result = await load("data:image/png;base64,cG5n");
  assert.equal(loadedSource, "data:image/png;base64,cG5n");
  assert.ok(result.image instanceof TestImage);
});

test("paper changes invalidate the final strip composite", () => {
  const context = { selectedPhotoboothStrip: { id: "one" }, activePhotoboothTemplate: {},
    photoboothPhotoCount: 1, photoboothSlotCaptures: [], slotPhotoMap: [], templatePhotoAdjustments: [],
    photoEffectMap: [], stripDecorations: [], stripTexts: [], stripDoodles: [], studioFrameColor: "white",
    doubleStripEnabled: false };
  const first = appHandler("photoboothCompositionKey", { ...context, activePaperSize: "3r" });
  const second = appHandler("photoboothCompositionKey", { ...context, activePaperSize: "4r" });
  assert.notEqual(first, second);
});

function studioFilterContext(scope = "all") {
  const state = { effects: ["natural", "natural", "natural"] };
  const context = { studioFilterScope: scope, selectedTemplateSlot: 1, slotPhotoMap: [2, 0, 1],
    photoboothCaptureCount: 3, photoboothPhotoCount: 3, doubleStripEnabled: true,
    setDraftPhotoEffect(value) { state.draft = value; },
    setPhotoEffectMap(value) { state.effects = typeof value === "function" ? value(state.effects) : value; },
  };
  context.handleApplyFilterToAll = appHandler("handleApplyFilterToAll", context);
  context.handleApplyFilterToPhoto = appHandler("handleApplyFilterToPhoto", context);
  return { context, state };
}

test("simple studio filter applies one selection to every captured photo by default", () => {
  const { context, state } = studioFilterContext();
  appHandler("handleSelectStudioFilter", context)("mono");
  assert.deepEqual(Array.from(state.effects), ["mono", "mono", "mono"]);
  assert.equal(state.draft, "mono");
});

test("simple studio filter can still target a reordered photo on both strips", () => {
  const { context, state } = studioFilterContext("selected");
  appHandler("handleSelectStudioFilter", context)("warm");
  assert.deepEqual(Array.from(state.effects), ["warm", "natural", "natural"]);
});

test("selecting a filter target cancels a pending swap without reordering photos", () => {
  const state = { slots: [2, 0, 1], adjustments: [{ x: 10 }, { x: 20 }, { x: 30 }], pending: 0 };
  const context = { pendingSwapSlot: 0, photoboothPhotoCount: 3, DEFAULT_SLOT_ADJUSTMENT: {},
    setStudioFilterScope(value) { state.scope = value; },
    setSelectedTemplateSlot(value) { state.selected = value; },
    setPendingSwapSlot(value) { state.pending = value; },
    setSlotPhotoMap(value) { state.slots = typeof value === "function" ? value(state.slots) : value; },
    setTemplatePhotoAdjustments(value) { state.adjustments = typeof value === "function" ? value(state.adjustments) : value; },
  };
  context.swapPhotoboothSlots = appHandler("swapPhotoboothSlots", context);
  context.handleSelectTemplateSlot = appHandler("handleSelectTemplateSlot", context);
  appHandler("handleChangeStudioFilterTarget", context)("1");
  assert.equal(state.scope, "selected");
  assert.equal(state.selected, 1);
  assert.equal(state.pending, null);
  assert.deepEqual(state.slots, [2, 0, 1]);
  assert.deepEqual(state.adjustments, [{ x: 10 }, { x: 20 }, { x: 30 }]);
});

test("clicking a photo on either strip opens editing for the matching source photo", () => {
  for (const [slot, side, selected] of [[1, 0, 1], [0, 1, 2]]) {
    const state = { tab: "text", scope: "all", decoration: { type: "text" } };
    const context = {
      doubleStripEnabled: true, photoboothPhotoCount: 3, pendingSwapSlot: null,
      slotPhotoMap: [2, 0, 1], selectedTemplateSlot: 0,
      setSelectedTemplateSlot(value) { state.selected = value; context.selectedTemplateSlot = value; },
      setStudioFilterScope(value) { state.scope = value; context.studioFilterScope = value; },
      setEditStudioTab(value) { state.tab = value; },
      setActiveStudioSide(value) { state.side = value; },
      setSelectedDecoration(value) { state.decoration = value; },
    };
    context.getPhotoboothSideSlotIndex = appHandler("getPhotoboothSideSlotIndex", context);
    context.handleSelectTemplateSlot = appHandler("handleSelectTemplateSlot", context);
    appHandler("handleSelectStudioPhoto", context)(slot, side);
    assert.equal(state.selected, selected);
    assert.equal(state.side, side);
    assert.equal(state.scope, "selected");
    assert.equal(state.tab, "filter");
    assert.equal(state.decoration, null);
    const effects = ["natural", "natural", "natural"];
    Object.assign(context, { setDraftPhotoEffect() {},
      setPhotoEffectMap(update) { state.effects = update(effects); } });
    context.handleApplyFilterToPhoto = appHandler("handleApplyFilterToPhoto", context);
    appHandler("handleSelectStudioFilter", context)("warm");
    assert.deepEqual(Array.from(state.effects), selected === 1
      ? ["warm", "natural", "natural"] : ["natural", "warm", "natural"]);
  }
});

test("photo clicks still complete a pending swap without opening another tool", () => {
  const state = { tab: "adjust" };
  const context = {
    doubleStripEnabled: true, photoboothPhotoCount: 3, pendingSwapSlot: 0,
    setActiveStudioSide() {}, setSelectedDecoration() {},
    getPhotoboothSideSlotIndex: (slot) => slot,
    handleSelectTemplateSlot(slot) { state.swap = [0, slot]; },
    setStudioFilterScope() {}, setEditStudioTab(value) { state.tab = value; },
  };
  appHandler("handleSelectStudioPhoto", context)(2);
  assert.deepEqual(state.swap, [0, 2]);
  assert.equal(state.tab, "adjust");
});

test("panning a photo does not activate its editing panel on release", () => {
  const state = { tab: "adjust", selected: 0 };
  const context = {
    pendingSwapSlot: null, slotPhotoMap: [0, 1, 2], templatePhotoAdjustments: [{ x: 0, y: 0 }],
    DEFAULT_SLOT_ADJUSTMENT: { x: 0, y: 0 }, stripGestureRef: { current: null },
    stripPhotoWasDraggedRef: { current: false },
    getPhotoboothSideSlotIndex: (slot) => slot, setSelectedTemplateSlot(value) { state.selected = value; },
    updateTemplateSlotAdjustmentByIndex() {}, clampNumber: (value, min, max) => Math.min(max, Math.max(min, value)),
    setActiveStudioSide() {}, setSelectedDecoration() {}, handleSelectTemplateSlot() {},
    setStudioFilterScope() {}, setEditStudioTab(value) { state.tab = value; },
  };
  const event = { pointerId: 1, clientX: 20, clientY: 20, preventDefault() {},
    currentTarget: { getBoundingClientRect: () => ({ width: 100, height: 100 }), setPointerCapture() {}, releasePointerCapture() {} } };
  appHandler("handleStripSlotPointerDown", context)(event, 0);
  appHandler("handleStripSlotPointerMove", context)({ ...event, clientX: 40 }, 0);
  appHandler("handleStripSlotPointerUp", context)(event);
  const select = appHandler("handleSelectStudioPhoto", context);
  select(0, 0, { detail: 1 });
  assert.equal(state.tab, "adjust");
  select(0, 0, { detail: 0 });
  assert.equal(state.tab, "filter");
});

test("photo resizing changes only the selected source slot and respects zoom limits", () => {
  const state = { adjustments: [{ scale: 100 }, { scale: 100 }, { scale: 100 }] };
  const context = {
    selectedTemplateSlot: 2, slotPhotoMap: [2, 0, 1],
    photoboothSlotCaptures: [{}, {}, {}], photoboothTemplateSlots: [{}, {}, {}],
    DEFAULT_SLOT_ADJUSTMENT: { scale: 100 }, clampNumber: (value, min, max) => Math.min(max, Math.max(min, value)),
    setTemplatePhotoAdjustments(update) { state.adjustments = update(state.adjustments); },
  };
  context.updateTemplateSlotAdjustment = appHandler("updateTemplateSlotAdjustment", context);
  const resize = appHandler("handleStudioPhotoScaleChange", context);
  resize(152);
  assert.deepEqual(Array.from(state.adjustments, (adjustment) => adjustment.scale), [100, 100, 152]);
  resize(500);
  assert.equal(state.adjustments[2].scale, 240);
  resize(0);
  assert.equal(state.adjustments[2].scale, 50);
  resize(100);
  resize(NaN);
  assert.equal(state.adjustments[2].scale, 100);
  context.slotPhotoMap[2] = null;
  resize(180);
  assert.equal(state.adjustments[2].scale, 100);
});

function watchContext(watch, fetchOverride) {
  const fields = { path: "/draft", drive: "DRAFT" };
  const fetchIO = fetchOverride || (async () => ({ ok: true, json: async () => watch }));
  return {
    fields,
    API_URL: "http://127.0.0.1:8000",
    watchSettingsRevisionRef: { current: 0 },
    watchFolderDraftRef: { current: null },
    driveFolderDraftRef: { current: null },
    fetch: fetchIO,
    requestBackendJson: (url, options) => requestBackendJson(url, { ...options, fetchImpl: fetchIO }),
    setActiveWatchFolder(value) { fields.watch = value; },
    setWatchFolderPath(value) { fields.path = value; },
    setDriveFolderId(value) { fields.drive = value; },
  };
}

test("watch polling preserves unsaved folder and Drive edits", async () => {
  const context = watchContext({ folder_path: "/old", drive_folder_id: "OLD" });
  context.watchFolderDraftRef.current = "/draft";
  context.driveFolderDraftRef.current = "DRAFT";
  await appHandler("loadAutoWatchFolder", context)();
  assert.equal(context.fields.path, "/draft");
  assert.equal(context.fields.drive, "DRAFT");
});

test("watch polling reflects a cleared server target when no local edit is pending", async () => {
  const context = watchContext({ folder_path: "", drive_folder_id: "" });
  await appHandler("loadAutoWatchFolder", context)();
  assert.equal(context.fields.path, "");
  assert.equal(context.fields.drive, "");
});

test("a watch response started before an edit cannot replace the draft", async () => {
  let respond;
  const context = watchContext(null, () => new Promise((resolve) => { respond = resolve; }));
  const loading = appHandler("loadAutoWatchFolder", context)();
  context.watchSettingsRevisionRef.current += 1;
  context.driveFolderDraftRef.current = "DRAFT";
  respond({ ok: true, json: async () => ({ folder_path: "/old", drive_folder_id: "OLD" }) });
  await loading;
  assert.equal(context.fields.path, "/draft");
  assert.equal(context.fields.drive, "DRAFT");
});

test("a stale watch response cannot undo an already saved target", async () => {
  let respond;
  const context = watchContext(null, () => new Promise((resolve) => { respond = resolve; }));
  const loading = appHandler("loadAutoWatchFolder", context)();
  context.watchSettingsRevisionRef.current += 1;
  context.driveFolderDraftRef.current = null;
  context.fields.drive = "SAVED";
  respond({ ok: true, json: async () => ({ folder_path: "/old", drive_folder_id: "OLD" }) });
  await loading;
  assert.equal(context.fields.drive, "SAVED");
});

test("clearing compression files does not access a missing input reference", () => {
  let selected = ["photo.jpg"];
  appHandler("clearCompressEditFiles", {
    setCompressEditFiles(value) { selected = value; },
  })();
  assert.equal(selected.length, 0);
});

test("camera white balance uses a valid default for missing or corrupt saved settings", () => {
  const declaration = app.body.body
    .filter((node) => node.type === "VariableDeclaration")
    .flatMap((node) => node.declarations)
    .find((node) => node.id.type === "ArrayPattern" && node.id.elements[0].name === "cameraWhiteBalance");
  const initializer = declaration.init.arguments[0];
  for (const [stored, expected] of [[null, 5600], ["bad", 5600], ["0", 5600], ["Infinity", 5600], ["6500", 6500]]) {
    const initialize = vm.runInNewContext(`(${source.slice(initializer.start, initializer.end)})`, {
      window: { localStorage: { getItem: () => stored } },
    });
    assert.equal(initialize(), expected, `stored white balance: ${stored}`);
  }
});
