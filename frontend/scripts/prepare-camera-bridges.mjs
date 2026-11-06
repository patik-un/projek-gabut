import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const frontendDir = resolve(scriptDir, "..");
const projectRoot = resolve(frontendDir, "..");
const destinationRoot = join(frontendDir, "src-tauri", "camera-bridges");

rmSync(destinationRoot, { recursive: true, force: true });
mkdirSync(destinationRoot, { recursive: true });

if (process.platform === "darwin") {
  const sonyRoot = join(projectRoot, "backend", "camera", "native", "sony");
  const result = spawnSync(join(sonyRoot, "build.sh"), [], {
    cwd: projectRoot,
    stdio: "inherit",
  });

  if (result.status !== 0) {
    throw new Error("Gagal membangun Sony Camera Remote SDK bridge.");
  }

  const source = join(sonyRoot, "build");
  const destination = join(destinationRoot, "sony");
  mkdirSync(destination, { recursive: true });
  for (const item of [
    "event-booth-sony-crsdk-bridge",
    "libCr_Core.dylib",
    "libmonitor_protocol.dylib",
    "libmonitor_protocol_pf.dylib",
    "Contents",
  ]) {
    cpSync(join(source, item), join(destination, item), { recursive: true });
  }

  for (const required of [
    "event-booth-sony-crsdk-bridge",
    "libCr_Core.dylib",
    "Contents/Frameworks/CrAdapter/libCr_PTP_USB.dylib",
  ]) {
    if (!existsSync(join(destination, required))) {
      throw new Error(`Sony bridge resource tidak lengkap: ${required}`);
    }
  }
}

console.log(`Camera bridges ready at ${destinationRoot}`);
