import { chmodSync, existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const frontendDir = resolve(scriptDir, "..");
const projectRoot = resolve(frontendDir, "..");
const backendDir = join(projectRoot, "backend");
const srcTauriDir = join(frontendDir, "src-tauri");
const backendBinDir = join(srcTauriDir, "backend-bin");
const distPath = backendBinDir;
const workPath = join(srcTauriDir, "target", "pyinstaller-build");
const specPath = join(srcTauriDir, "target", "pyinstaller-spec");
const isWindows = process.platform === "win32";
const outputBinary = join(
  backendBinDir,
  isWindows ? "event-booth-backend.exe" : "event-booth-backend",
);

const pythonCandidates = [
  join(backendDir, ".venv", "bin", "python"),
  join(backendDir, ".venv", "Scripts", "python.exe"),
];

const python = pythonCandidates.find((candidate) => existsSync(candidate));

if (!python) {
  throw new Error(
    "Python virtual environment tidak ditemukan. Jalankan setup backend sampai backend/.venv tersedia."
  );
}

mkdirSync(backendBinDir, { recursive: true });
rmSync(outputBinary, { force: true });

const args = [
  "-m",
  "PyInstaller",
  "--clean",
  "--noconfirm",
  "--onefile",
  "--name",
  "event-booth-backend",
  "--paths",
  backendDir,
  "--collect-submodules",
  "api",
  "--collect-submodules",
  "process",
  "--collect-submodules",
  "capture",
  "--collect-submodules",
  "detect",
  "--collect-submodules",
  "upload",
  "--distpath",
  distPath,
  "--workpath",
  workPath,
  "--specpath",
  specPath,
  join(backendDir, "main.py"),
];

console.log("🔨 Building bundled backend binary...");
const result = spawnSync(python, args, {
  cwd: projectRoot,
  stdio: "inherit",
});

if (result.status !== 0) {
  throw new Error("Gagal build backend binary dengan PyInstaller.");
}

const windowsBinary = `${outputBinary}.exe`;
if (!isWindows && existsSync(windowsBinary) && !existsSync(outputBinary)) {
  renameSync(windowsBinary, outputBinary);
}

chmodSync(outputBinary, 0o755);
console.log(`✅ Backend binary ready at ${outputBinary}`);
