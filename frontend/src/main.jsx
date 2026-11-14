import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { createBackendFetch } from "./backendTransport.js";

const token = isTauri() ? invoke("backend_api_token") : Promise.resolve(null);
const sessionKey = "event-booth-tab-session";
let sessionId = window.sessionStorage.getItem(sessionKey);
if (!sessionId) {
  sessionId = crypto.randomUUID();
  window.sessionStorage.setItem(sessionKey, sessionId);
}
globalThis.fetch = createBackendFetch({
  fetchImpl: globalThis.fetch.bind(globalThis), getToken: () => token, sessionId,
});

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
