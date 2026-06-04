const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

function findRcedit() {
  const localAppData = process.env.LOCALAPPDATA || "";
  const candidates = [
    path.join(localAppData, "electron-builder", "Cache", "winCodeSign", "winCodeSign-2.6.0", "rcedit-x64.exe"),
    path.join(localAppData, "electron-builder", "Cache", "winCodeSign", "winCodeSign-2.6.0", "rcedit-ia32.exe"),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate));
}

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== "win32") return;

  const rcedit = findRcedit();
  if (!rcedit) {
    console.warn("rcedit not found; skip Windows icon resource editing.");
    return;
  }

  const exePath = path.join(context.appOutDir, "updream-manager.exe");
  const tempExePath = path.join(context.appOutDir, "updream-manager.icon.exe");
  const iconPath = path.join(context.packager.projectDir, "build", "icon.ico");
  fs.copyFileSync(exePath, tempExePath);
  const result = spawnSync(
    rcedit,
    [
      tempExePath,
      "--set-version-string",
      "FileDescription",
      "Updream Manager",
      "--set-version-string",
      "ProductName",
      "Updream Manager",
      "--set-version-string",
      "LegalCopyright",
      "Copyright 2026 Updream Manager",
      "--set-file-version",
      context.packager.appInfo.version,
      "--set-product-version",
      `${context.packager.appInfo.version}.0`,
      "--set-version-string",
      "InternalName",
      "updream-manager",
      "--set-version-string",
      "OriginalFilename",
      "updream-manager.exe",
      "--set-icon",
      iconPath,
    ],
    { encoding: "utf8" },
  );

  if (result.status !== 0) {
    throw new Error(`rcedit failed: ${result.stderr || result.stdout}`);
  }
  fs.copyFileSync(tempExePath, exePath);
  fs.unlinkSync(tempExePath);
};
