const authError = (name, message) => Object.assign(new Error(message), { name });

export const isDriveAuthReady = (drive) => Boolean(
  drive?.configured &&
    drive?.token_exists &&
    drive?.has_required_scopes &&
    (drive?.valid || drive?.has_refresh_token)
);

const delay = (milliseconds, signal) => new Promise((resolve, reject) => {
  const cancel = () => {
    clearTimeout(timer);
    signal.removeEventListener("abort", cancel);
    reject(signal.reason);
  };
  const timer = setTimeout(() => {
    signal.removeEventListener("abort", cancel);
    resolve();
  }, milliseconds);
  signal.addEventListener("abort", cancel, { once: true });
  if (signal.aborted) cancel();
});

export async function runDriveLogin({
  apiUrl,
  signal,
  startBackend,
  fetchImpl = globalThis.fetch,
  now = Date.now,
  sleep = delay,
  timeoutMs = 120000,
  backendTimeoutMs = 120000,
  pollIntervalMs = 2000,
  onWaiting = () => {},
  onValidating = () => {},
}) {
  const controller = new AbortController();
  const cancel = () => controller.abort(
    signal?.reason || authError("AbortError", "Login Google Drive dibatalkan")
  );
  signal?.addEventListener("abort", cancel, { once: true });
  if (signal?.aborted) cancel();

  let deadline;
  let deadlineTimer;
  let timeoutMessage;
  const setDeadline = (milliseconds, message) => {
    clearTimeout(deadlineTimer);
    deadline = now() + milliseconds;
    timeoutMessage = message;
    deadlineTimer = setTimeout(() => controller.abort(
      authError("TimeoutError", message)
    ), milliseconds);
  };
  const checkActive = () => {
    if (!controller.signal.aborted && now() >= deadline) {
      controller.abort(authError("TimeoutError", timeoutMessage));
    }
    if (controller.signal.aborted) throw controller.signal.reason;
  };

  // Race each operation with cancellation as well as its timeout. Fetch and
  // native startup may finish late even after abort; their results are ignored.
  const step = (operation, timeout = deadline - now()) => {
    checkActive();
    return new Promise((resolve, reject) => {
      const requestController = new AbortController();
      let settled = false;
      let timer;
      const cleanup = () => {
        clearTimeout(timer);
        controller.signal.removeEventListener("abort", cancelStep);
      };
      const fail = (error) => {
        if (settled) return;
        settled = true;
        cleanup();
        requestController.abort(error);
        reject(error);
      };
      const cancelStep = () => fail(controller.signal.reason);
      controller.signal.addEventListener("abort", cancelStep, { once: true });
      timer = setTimeout(() => fail(authError(
        "TimeoutError", "Permintaan Google Drive terlalu lama. Silakan coba lagi."
      )), Math.min(timeout, deadline - now()));
      Promise.resolve().then(() => {
        checkActive();
        return operation(requestController.signal);
      }).then((value) => {
        checkActive();
        if (settled) return;
        settled = true;
        cleanup();
        resolve(value);
      }).catch(fail);
    });
  };

  const pause = (milliseconds) => step((requestSignal) => sleep(milliseconds, requestSignal));
  const request = (path, method, timeout = 15000) => step(async (requestSignal) => {
    const response = await fetchImpl(`${apiUrl}${path}`, {
      ...(method ? { method } : {}),
      cache: "no-store",
      signal: requestSignal,
    });
    const data = await response.json();
    if (!response.ok || data?.success !== true) {
      throw new Error(data?.message || "Gagal menghubungkan Google Drive");
    }
    return data;
  }, timeout);

  setDeadline(
    startBackend ? backendTimeoutMs : timeoutMs,
    startBackend
      ? "Server tidak merespons. Silakan coba lagi."
      : "Login Google Drive kehabisan waktu. Silakan coba lagi dan selesaikan login di browser."
  );
  try {
    checkActive();
    if (startBackend) {
      await step(() => startBackend());
      let serverReady = false;
      while (!serverReady) {
        try {
          const health = await step((requestSignal) => fetchImpl(`${apiUrl}/system/health`, {
            cache: "no-store",
            signal: requestSignal,
          }), 1000);
          if (health.status === 401) throw authError("BackendSessionError",
            "Backend dari sesi aplikasi lain masih aktif. Tutup aplikasi lama lalu coba lagi.");
          serverReady = health.ok;
        } catch (error) {
          if (error.name === "BackendSessionError") throw error;
          checkActive();
        }
        if (!serverReady) await pause(1000);
      }
      setDeadline(timeoutMs, "Login Google Drive kehabisan waktu. Silakan coba lagi dan selesaikan login di browser.");
    }

    await request("/auth/drive/login-trigger", "POST");
    checkActive();
    onWaiting();
    while (true) {
      await pause(pollIntervalMs);
      const status = await request("/auth/drive/status", undefined, 5000);
      if (!isDriveAuthReady(status.drive)) continue;

      checkActive();
      onValidating();
      const connection = await request("/auth/drive/connect", "POST");
      if (!isDriveAuthReady(connection.drive)) {
        throw new Error("Token Google Drive belum siap. Silakan login kembali.");
      }
      return connection;
    }
  } finally {
    clearTimeout(deadlineTimer);
    signal?.removeEventListener("abort", cancel);
  }
}
