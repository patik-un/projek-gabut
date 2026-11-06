import test from "node:test";
import assert from "node:assert/strict";
import { runDriveLogin } from "./driveAuth.js";

const API_URL = "http://localhost:8000";
const readyDrive = {
  configured: true,
  token_exists: true,
  valid: true,
  expired: false,
  has_refresh_token: true,
  has_required_scopes: true,
  scopes: ["https://www.googleapis.com/auth/drive"],
};
const user = { email: "operator@example.com", name: "Operator", picture: null };
const response = (data, ok = true) => ({ ok, json: async () => data });
const triggerResponse = () => response({
  success: true,
  message: "Proses login telah dimulai. Silakan cek browser Anda.",
});
const statusResponse = (drive = readyDrive) => response({ success: true, drive });
const connectResponse = (overrides = {}, ok = true) => response({
  success: true,
  drive: readyDrive,
  user,
  ...overrides,
}, ok);

// Only the external HTTP boundary and clock are replaced. The production
// orchestration, validation, abort handling, and deadline checks run unchanged.
function flowOptions(request, overrides = {}) {
  let time = 0;
  return {
    apiUrl: API_URL,
    fetchImpl: request,
    now: () => time,
    sleep: async (milliseconds) => { time += milliseconds; },
    timeoutMs: 100,
    pollIntervalMs: 20,
    ...overrides,
  };
}

function requests({ trigger = triggerResponse(), status = statusResponse(), connect = connectResponse() } = {}) {
  return async (url, options) => {
    assert.equal(options.cache, "no-store");
    assert.ok(options.signal instanceof AbortSignal);
    if (url === `${API_URL}/auth/drive/login-trigger`) {
      assert.equal(options.method, "POST");
      return trigger;
    }
    if (url === `${API_URL}/auth/drive/status`) {
      assert.equal(options.method, undefined);
      return typeof status === "function" ? status() : status;
    }
    if (url === `${API_URL}/auth/drive/connect`) {
      assert.equal(options.method, "POST");
      return typeof connect === "function" ? connect() : connect;
    }
    throw new Error(`Unexpected auth request: ${url}`);
  };
}

test("returns the validated connect status and operator after browser login", async () => {
  const refreshedDrive = { ...readyDrive, expired: false, has_refresh_token: false };
  const result = await runDriveLogin(flowOptions(requests({
    status: statusResponse({ ...readyDrive, valid: false, expired: true }),
    connect: connectResponse({ drive: refreshedDrive }),
  })));
  assert.deepEqual(result, { success: true, drive: refreshedDrive, user });
});

test("HTTP 200 success:false never authenticates an existing token", async () => {
  await assert.rejects(runDriveLogin(flowOptions(requests({
    connect: connectResponse({ success: false, message: "Login diperlukan" }),
  }))), /Login diperlukan/);
});

test("an unsuccessful HTTP connect cannot authenticate even with success:true", async () => {
  await assert.rejects(runDriveLogin(flowOptions(requests({
    connect: connectResponse({ message: "Gagal auth Google Drive" }, false),
  }))), /Gagal auth Google Drive/);
});

test("connect must return usable Drive credentials before authenticating", async () => {
  for (const drive of [undefined, { ...readyDrive, valid: false, has_refresh_token: false }, { ...readyDrive, has_required_scopes: false }]) {
    await assert.rejects(runDriveLogin(flowOptions(requests({
      connect: connectResponse({ drive }),
    }))), /Token Google Drive belum siap/);
  }
});

test("a rejected login trigger stops before status polling", async () => {
  await assert.rejects(runDriveLogin(flowOptions(requests({
    trigger: response({ success: false, message: "Login tidak dapat dimulai" }),
    status: () => assert.fail("must not poll after a rejected trigger"),
  }))), /Login tidak dapat dimulai/);
});

test("a failed status response cannot authenticate its stale token payload", async () => {
  await assert.rejects(runDriveLogin(flowOptions(requests({
    status: response({ success: false, message: "Status gagal", drive: readyDrive }),
    connect: () => assert.fail("must not connect after failed status"),
  }))), /Status gagal/);
});

test("an incomplete token keeps polling until the login deadline", async () => {
  for (const drive of [
    { ...readyDrive, configured: false },
    { ...readyDrive, token_exists: false },
    { ...readyDrive, has_required_scopes: false },
    { ...readyDrive, valid: false, has_refresh_token: false },
  ]) {
    await assert.rejects(runDriveLogin(flowOptions(requests({
      status: statusResponse(drive),
      connect: () => assert.fail("must not connect an unready token"),
    }))), { name: "TimeoutError" });
  }
});

test("a cancelled browser login with no token expires instead of waiting forever", async () => {
  await assert.rejects(runDriveLogin(flowOptions(requests({
    status: statusResponse({
      ...readyDrive,
      token_exists: false,
      valid: false,
      has_refresh_token: false,
      has_required_scopes: false,
      scopes: [],
    }),
    connect: () => assert.fail("must not connect without a token"),
  }))), { name: "TimeoutError" });
});

test("a slow status request completes before the next poll starts", async () => {
  let releaseStatus;
  let statusCount = 0;
  const pendingStatus = new Promise((resolve) => { releaseStatus = resolve; });
  const login = runDriveLogin(flowOptions(requests({
    status: () => {
      statusCount += 1;
      return statusCount === 1 ? pendingStatus : statusResponse();
    },
  }), { timeoutMs: 1000 }));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(statusCount, 1);
  releaseStatus(statusResponse({ ...readyDrive, token_exists: false }));
  assert.deepEqual((await login).user, user);
  assert.equal(statusCount, 2);
});

test("logout or unmount aborts an in-flight connect and rejects its late success", async () => {
  const controller = new AbortController();
  let finishConnect;
  let connectSignal;
  const login = runDriveLogin(flowOptions(async (url, options) => {
    if (url.endsWith("/connect")) {
      connectSignal = options.signal;
      return new Promise((resolve) => { finishConnect = resolve; });
    }
    return requests()(url, options);
  }, { signal: controller.signal, timeoutMs: 1000 }));
  await new Promise((resolve) => setImmediate(resolve));
  controller.abort();
  await assert.rejects(login, { name: "AbortError" });
  assert.equal(connectSignal.aborted, true);
  finishConnect(connectResponse());
  await new Promise((resolve) => setImmediate(resolve));
});

test("aborting the browser wait prevents all later requests", async () => {
  const controller = new AbortController();
  await assert.rejects(runDriveLogin(flowOptions(requests({
    status: () => assert.fail("must not poll after cancellation"),
  }), {
    signal: controller.signal,
    sleep: async () => { controller.abort(); },
  })), { name: "AbortError" });
});

test("cancelling the real browser wait clears its sleep timer", async () => {
  const controller = new AbortController();
  await assert.rejects(runDriveLogin(flowOptions(requests({
    status: () => assert.fail("must not poll after cancellation"),
  }), {
    signal: controller.signal,
    sleep: undefined,
    onWaiting: () => setImmediate(() => controller.abort()),
    pollIntervalMs: 60000,
    timeoutMs: 120000,
  })), { name: "AbortError" });
});

test("a stalled HTTP response is bounded even when fetch ignores cancellation", async () => {
  await assert.rejects(runDriveLogin(flowOptions(() => new Promise(() => {}), {
    timeoutMs: 30,
  })), { name: "TimeoutError" });
});

test("the deadline also covers a stalled JSON response body", async () => {
  await assert.rejects(runDriveLogin(flowOptions(async () => ({
    ok: true,
    json: () => new Promise(() => {}),
  }), { timeoutMs: 30 })), { name: "TimeoutError" });
});

test("backend preparation is cancellable and cannot start login after logout", async () => {
  const controller = new AbortController();
  let finishStart;
  const login = runDriveLogin(flowOptions(() => assert.fail("must not request after cancelled startup"), {
    signal: controller.signal,
    startBackend: () => new Promise((resolve) => { finishStart = resolve; }),
  }));
  await new Promise((resolve) => setImmediate(resolve));
  controller.abort();
  await assert.rejects(login, { name: "AbortError" });
  finishStart();
});

test("backend health checks expire without ever triggering OAuth", async () => {
  await assert.rejects(runDriveLogin(flowOptions(async (url) => {
    assert.equal(url, `${API_URL}/`);
    return { ok: false };
  }, {
    startBackend: async () => {},
    backendTimeoutMs: 50,
  })), { name: "TimeoutError" });
});
