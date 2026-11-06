import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const frontendDir = resolve(scriptDir, "..");
const packageJson = JSON.parse(readFileSync(join(frontendDir, "package.json"), "utf8"));
const tauriConfig = JSON.parse(
  readFileSync(join(frontendDir, "src-tauri", "tauri.conf.json"), "utf8"),
);
const cargoToml = readFileSync(join(frontendDir, "src-tauri", "Cargo.toml"), "utf8");
const cargoVersion = cargoToml.match(/^\s*version\s*=\s*"([^"]+)"/m)?.[1];
const versions = {
  "package.json": packageJson.version,
  "tauri.conf.json": tauriConfig.version,
  "Cargo.toml": cargoVersion,
};
const uniqueVersions = new Set(Object.values(versions));
const forbiddenBundledTokens = [
  join(frontendDir, "src-tauri", "backend-seed", "auth", "token.json"),
  join(frontendDir, "src-tauri", "backend-seed", "auth", "token.pickle"),
];

if ([...uniqueVersions].some((version) => !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version || ""))) {
  throw new Error(`Versi release tidak valid: ${JSON.stringify(versions)}`);
}

if (uniqueVersions.size !== 1) {
  throw new Error(`Versi release tidak sinkron: ${JSON.stringify(versions)}`);
}

for (const tokenPath of forbiddenBundledTokens) {
  if (existsSync(tokenPath)) {
    throw new Error(`Token Google Drive tidak boleh masuk bundle: ${tokenPath}`);
  }
}

console.log(`Release version check passed: ${packageJson.version}`);
