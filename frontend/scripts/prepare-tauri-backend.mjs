import { mkdirSync, rmSync, cpSync, existsSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const frontendDir = resolve(scriptDir, "..");
const projectRoot = resolve(frontendDir, "..");
const backendDir = join(projectRoot, "backend");
const seedDir = join(frontendDir, "src-tauri", "backend-seed");

const copyIfExists = (from, to) => {
  if (!existsSync(from)) {
    return;
  }

  mkdirSync(dirname(to), { recursive: true });
  cpSync(from, to, { recursive: true });
};

const writeJson = (to, data) => {
  mkdirSync(dirname(to), { recursive: true });
  writeFileSync(to, `${JSON.stringify(data, null, 2)}\n`);
};

// =========================
// SEED DATA
// =========================
console.log("📦 Copying seed data...");
rmSync(seedDir, { recursive: true, force: true });

for (const dir of [
  "auth",
  "database",
  "manual_uploads",
  "output",
  "photobooth_strips",
  "processed",
  "watermark",
]) {
  mkdirSync(join(seedDir, dir), { recursive: true });
}

copyIfExists(join(backendDir, "auth", "client_secrets.json"), join(seedDir, "auth", "client_secrets.json"));
copyIfExists(join(backendDir, "counter.txt"), join(seedDir, "counter.txt"));
writeJson(join(seedDir, "database", "auto_watch.json"), {
  folder_path: "",
  drive_folder_id: "",
  enabled: false,
  auto_upload_enabled: false,
  known_files: [],
  pending_files: [],
});
copyIfExists(join(backendDir, "database", "output_settings.json"), join(seedDir, "database", "output_settings.json"));
copyIfExists(join(backendDir, "watermark"), join(seedDir, "watermark"));

console.log(`✅ Seed data ready at ${seedDir}`);
