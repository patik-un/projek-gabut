import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";

const { requestBackendJson } = await import("./backendRequest.js").catch(() => ({}));

const require = createRequire(import.meta.url);
const { parse } = require("@babel/parser");
const source = readFileSync(new URL("./App.jsx", import.meta.url), "utf8");
const app = parse(source, { sourceType: "module", plugins: ["jsx"] }).program.body
  .find((node) => node.type === "FunctionDeclaration" && node.id.name === "App");
const pollingEffectCall = app.body.body
  .filter((node) => node.type === "ExpressionStatement" && node.expression.callee?.name === "useEffect")
  .map((node) => node.expression)
  .find((node) => Array.isArray(node.arguments[0].body.body) && node.arguments[0].body.body.some((statement) =>
    statement.type === "VariableDeclaration" && statement.declarations.some((declaration) =>
      declaration.id.name === "checkBackend"
    )
  ));
assert.ok(pollingEffectCall, "backend polling effect exists");

const flush = () => new Promise((resolve) => setImmediate(resolve));
const actualCallback = (name, context) => {
  const declaration = app.body.body.filter((node) => node.type === "VariableDeclaration")
    .flatMap((node) => node.declarations).find((node) => node.id.name === name);
  return vm.runInNewContext(`(${source.slice(declaration.init.start, declaration.init.end)})`, context);
};
const loaderNames = [
  "loadCaptures", "loadQueue", "loadPhotoQueue", "loadAutoWatchFolder",
  "loadWatermark", "loadOutputSettings", "loadPhotoboothTemplate",
  "loadDriveAuthStatus", "loadPrinters",
];

// Execute the real React effect callback with only state, timers, and external
// requests replaced. No local backend, OAuth, camera, or printer is contacted.
function harness(overrides = {}) {
  let nextId = 1;
  const intervals = new Map();
  const timeouts = new Map();
  const calls = Object.fromEntries(loaderNames.map((name) => [name, 0]));
  const state = { ready: false, status: "Menunggu kamera...", writes: 0, warnings: [] };
  const context = {
    API_URL: "http://127.0.0.1:8000",
    adminUser: { email: "operator@example.com" },
    backendReadyRef: { current: false },
    AbortController,
    fetch: async () => ({ ok: true }),
    console: { warn: (...args) => state.warnings.push(args) },
    setBackendReady(value) { state.ready = value; state.writes += 1; },
    setStatus(value) { state.status = typeof value === "function" ? value(state.status) : value; state.writes += 1; },
    setStreamVersion() { state.writes += 1; },
    setIsLoadingPrinters() { state.writes += 1; },
    retryTimer: { current: null },
    watermarkSettingsSaveRef: { current: { timer: null } },
    clearAutoCaptureTimers() {},
    window: {
      setInterval(callback, milliseconds) {
        const id = nextId++;
        intervals.set(id, { callback, milliseconds });
        return id;
      },
      clearInterval(id) { intervals.delete(id); },
      setTimeout(callback, milliseconds) {
        const id = nextId++;
        timeouts.set(id, { callback, milliseconds });
        return id;
      },
      clearTimeout(id) { timeouts.delete(id); },
    },
    ...Object.fromEntries(loaderNames.map((name) => [name, async () => { calls[name] += 1; }])),
    ...overrides,
  };
  let previousDependencies;
  let activeCleanup;
  const registerEffect = (setup, dependencies) => {
    if (previousDependencies && dependencies.length === previousDependencies.length &&
        dependencies.every((value, index) => Object.is(value, previousDependencies[index]))) return;
    activeCleanup?.();
    previousDependencies = dependencies;
    activeCleanup = setup();
  };
  return {
    context,
    calls,
    state,
    timeouts,
    start() {
      vm.runInNewContext(source.slice(pollingEffectCall.start, pollingEffectCall.end), {
        ...context,
        useEffect: registerEffect,
      });
      return () => { activeCleanup?.(); activeCleanup = null; };
    },
    tick(milliseconds) {
      const timer = [...intervals.values()].find((item) => item.milliseconds === milliseconds);
      assert.ok(timer, `${milliseconds}ms poll is registered`);
      return timer.callback();
    },
  };
}

test("a failed health response disconnects the UI and stops data polling", async () => {
  let healthy = true;
  const app = harness({ fetch: async () => ({ ok: healthy }) });
  const cleanup = app.start();
  try {
    await flush();
    assert.equal(app.state.ready, true);
    const captureLoads = app.calls.loadCaptures;
    healthy = false;
    await app.tick(1200);
    assert.equal(app.context.backendReadyRef.current, false);
    assert.equal(app.state.ready, false);
    await app.tick(3000);
    assert.equal(app.calls.loadCaptures, captureLoads);
  } finally { cleanup(); }
});

test("a rejected health request clears a previously ready connection", async () => {
  let fail = false;
  const app = harness({ fetch: async () => {
    if (fail) throw new TypeError("Failed to fetch");
    return { ok: true };
  } });
  const cleanup = app.start();
  try {
    await flush();
    fail = true;
    await app.tick(1200);
    assert.equal(app.state.ready, false);
    assert.equal(app.context.backendReadyRef.current, false);
  } finally { cleanup(); }
});

test("a pending health request prevents concurrent health polls", async () => {
  let healthRequests = 0;
  let finishHealth;
  const app = harness({ fetch: () => {
    healthRequests += 1;
    return new Promise((resolve) => { finishHealth = resolve; });
  } });
  const cleanup = app.start();
  try {
    await flush();
    app.tick(1200);
    await flush();
    assert.equal(healthRequests, 1);
  } finally {
    cleanup();
    finishHealth({ ok: true });
    await flush();
  }
});

test("initialization and periodic refresh share one in-flight data batch", async () => {
  let captureLoads = 0;
  let finishCapture;
  const app = harness({ loadCaptures: () => {
    captureLoads += 1;
    return new Promise((resolve) => { finishCapture = resolve; });
  } });
  const cleanup = app.start();
  try {
    await flush();
    app.tick(3000);
    await flush();
    assert.equal(captureLoads, 1);
    finishCapture();
    await flush();
    app.tick(3000);
    await flush();
    assert.equal(captureLoads, 2);
  } finally {
    cleanup();
    finishCapture?.();
    await flush();
  }
});

test("stalled health requests time out and permit reconnection", async () => {
  let healthRequests = 0;
  let firstSignal;
  const app = harness({ fetch: async (_url, options) => {
    healthRequests += 1;
    if (healthRequests === 1) {
      firstSignal = options.signal;
      return new Promise(() => {});
    }
    return { ok: true };
  } });
  const cleanup = app.start();
  try {
    await flush();
    const deadline = [...app.timeouts.values()].find((timer) => timer.milliseconds <= 5000);
    assert.ok(deadline, "health request has a finite timeout");
    deadline.callback();
    await flush();
    assert.equal(firstSignal.aborted, true);
    assert.equal(app.state.ready, false);
    await app.tick(1200);
    await flush();
    assert.equal(app.state.ready, true);
    assert.equal(healthRequests, 2);
  } finally { cleanup(); }
});

test("initialization and data loader failures are consumed without unhandled rejections", async () => {
  let attempts = 0;
  const app = harness({ loadQueue: async () => {
    attempts += 1;
    throw new TypeError("Failed to fetch");
  } });
  const cleanup = app.start();
  try {
    await flush();
    await app.tick(3000);
    await flush();
    assert.equal(attempts, 2);
    assert.ok(app.state.warnings.length >= 1);
    assert.equal(app.state.ready, true);
  } finally { cleanup(); }
});

test("reconnection initializes data again after the backend recovers", async () => {
  let healthy = true;
  const app = harness({ fetch: async () => ({ ok: healthy }) });
  const cleanup = app.start();
  try {
    await flush();
    healthy = false;
    await app.tick(1200);
    healthy = true;
    await app.tick(1200);
    await flush();
    assert.equal(app.calls.loadOutputSettings, 2);
    assert.equal(app.state.ready, true);
  } finally { cleanup(); }
});

test("login restarts initialization after the anonymous polling effect is cleaned up", async () => {
  const app = harness({ adminUser: null });
  app.start();
  await flush();
  assert.equal(app.calls.loadPhotoboothTemplate, 1);
  assert.equal(app.calls.loadCaptures, 0);
  app.context.adminUser = { email: "operator@example.com" };
  const cleanupAdmin = app.start();
  try {
    await flush();
    assert.equal(app.calls.loadCaptures, 1);
    assert.equal(app.calls.loadOutputSettings, 1);
  } finally { cleanupAdmin(); }
});

test("unmount aborts health IO and ignores a late successful response", async () => {
  let finishHealth;
  let healthSignal;
  const app = harness({ fetch: (_url, options) => {
    healthSignal = options.signal;
    return new Promise((resolve) => { finishHealth = resolve; });
  } });
  const cleanup = app.start();
  await flush();
  cleanup();
  const writes = app.state.writes;
  assert.equal(healthSignal.aborted, true);
  finishHealth({ ok: true });
  await flush();
  assert.equal(app.state.writes, writes);
  assert.equal(app.state.ready, false);
});

test("a never-settling initialization loader is cancelled before recovery reloads data", async () => {
  let healthy = true;
  let printerSignal;
  const app = harness({
    fetch: async () => ({ ok: healthy }),
    loadPrinters: (options = {}) => {
      printerSignal = options.signal;
      return new Promise(() => {});
    },
  });
  const cleanup = app.start();
  try {
    await flush();
    assert.equal(app.calls.loadCaptures, 1);
    healthy = false;
    await app.tick(1200);
    await flush();
    assert.equal(printerSignal?.aborted, true);
    healthy = true;
    await app.tick(1200);
    await flush();
    assert.equal(app.state.ready, true);
    assert.equal(app.calls.loadCaptures, 2);
  } finally { cleanup(); }
});

test("the data batch deadline releases a loader that ignores cancellation", async () => {
  let printerSignal;
  const app = harness({ loadPrinters: (options = {}) => {
    printerSignal = options.signal;
    return new Promise(() => {});
  } });
  const cleanup = app.start();
  try {
    await flush();
    const deadline = [...app.timeouts.values()].find((timer) => timer.milliseconds > 2000 && timer.milliseconds <= 15000);
    assert.ok(deadline, "data batch has a finite deadline");
    deadline.callback();
    await flush();
    assert.equal(printerSignal.aborted, true);
    await app.tick(3000);
    await flush();
    assert.equal(app.calls.loadCaptures, 2);
  } finally { cleanup(); }
});

test("unmount cancels a pending data batch", async () => {
  let printerSignal;
  const app = harness({ loadPrinters: (options = {}) => {
    printerSignal = options.signal;
    return new Promise(() => {});
  } });
  const cleanup = app.start();
  await flush();
  cleanup();
  await flush();
  assert.equal(printerSignal?.aborted, true);
});

test("all polling loaders ignore JSON bodies that arrive after cancellation", async () => {
  for (const name of loaderNames) {
    let finishBody;
    let writes = 0;
    const controller = new AbortController();
    const payload = name === "loadCaptures" || name === "loadQueue" || name === "loadPhotoQueue"
      ? []
      : { success: true, settings: { configured: true }, printers: [], default_printer: null, drive: {}, folder_path: "/saved", drive_folder_id: "SAVED" };
    const fetchIO = async () => ({ ok: true, json: () => new Promise((resolve) => { finishBody = resolve; }) });
    const context = {
      API_URL: "http://127.0.0.1:8000",
      fetch: fetchIO,
      requestBackendJson: (url, options) => requestBackendJson(url, { ...options, fetchImpl: fetchIO, timeoutMs: 1000 }),
      backendReady: true,
      backendReadyRef: { current: true },
      watchSettingsRevisionRef: { current: 0 },
      captureSessionRevisionRef: { current: 0 },
      stripSettingsRevisionRef: { current: 0 },
      watchFolderDraftRef: { current: null },
      driveFolderDraftRef: { current: null },
      outputSettingsLoadedRef: { current: false },
      photoboothPhotoCount: 1,
      normalizeOutputSettingsFromBackend: () => ({}),
      mergeWatermarkData: () => ({}),
      normalizeWatermarkSettings: () => ({}),
      normalizePhotoboothTemplates: () => ({}),
      normalizePhotoboothStripOptions: () => [],
      createEmptyPhotoboothTemplate: () => ({}),
      getPreferredStripTemplateMode: () => "default",
      ...Object.fromEntries([
        "setCaptures", "setQueue", "setPhotoQueue", "setActiveWatchFolder", "setWatchFolderPath", "setDriveFolderId",
        "setWatermark", "setWatermarkSettings", "setPhotoboothAdminSettings", "setPhotoboothTemplates", "setPhotoboothStripOptions",
        "setSelectedPhotoboothStrip", "setPhotoboothTemplate", "setStripTemplateMode", "setLastDetectedSlot", "setDriveAuthStatus",
        "setDriveAuthError", "setIsLoadingPrinters", "setPrinters", "setPrintError",
      ].map((setter) => [setter, () => { writes += 1; }])),
    };
    const loading = actualCallback(name, context)({ signal: controller.signal }).catch((error) => error);
    await flush();
    controller.abort();
    await flush();
    const writesAtCancellation = writes;
    finishBody(payload);
    await loading;
    assert.equal(writes, writesAtCancellation, `${name} must not apply a stale JSON body`);
    assert.equal(context.outputSettingsLoadedRef.current, false, `${name} must not change initialization refs after cancellation`);
  }
});

test("bounded backend requests cover a JSON body that never completes", async () => {
  assert.equal(typeof requestBackendJson, "function", "bounded request helper exists");
  await assert.rejects(requestBackendJson("http://127.0.0.1:8000/printers", {
    timeoutMs: 20,
    fetchImpl: async () => ({ ok: true, json: () => new Promise(() => {}) }),
  }), { name: "TimeoutError" });
});

test("output initialization forwards cancellation into its fallback settings save", async () => {
  let finishSaveBody;
  let saveSignal;
  const controller = new AbortController();
  const context = {
    API_URL: "http://127.0.0.1:8000",
    photoboothAdminSettings: { outputCompressionEnabled: true, outputCompressionQuality: 70 },
    outputSettingsLoadedRef: { current: false },
    requestBackendJson: (url, options) => requestBackendJson(url, {
      ...options,
      fetchImpl: async (_url, request) => {
        if (request.method === "POST") {
          saveSignal = request.signal;
          return { ok: true, json: () => new Promise((resolve) => { finishSaveBody = resolve; }) };
        }
        return { ok: true, json: async () => ({ success: true, settings: { configured: false } }) };
      },
    }),
  };
  context.saveOutputSettings = actualCallback("saveOutputSettings", context);
  const loading = actualCallback("loadOutputSettings", context)({ signal: controller.signal }).catch((error) => error);
  await flush();
  controller.abort();
  assert.equal(saveSignal.aborted, true);
  finishSaveBody({ success: true, settings: { configured: true } });
  await loading;
  assert.equal(context.outputSettingsLoadedRef.current, false);
});
