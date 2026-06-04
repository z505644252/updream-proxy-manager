const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const https = require("node:https");
const { spawn, execFile } = require("node:child_process");
const { promisify } = require("node:util");
const initSqlJs = require("sql.js");

const execFileAsync = promisify(execFile);
let sqlReady;

const UPDATE_OWNER = "z505644252";
const UPDATE_REPO = "updream-proxy-manager";
const GITHUB_API_BASE = "https://api.github.com";

const SERVICES = {
  apimart: {
    id: "apimart",
    name: "APIMart 图片代理",
    configName: "apimart-image2",
    provider: "openai",
    generationType: "image",
    model: "跟 Endpoint ID 保持一致",
    dbModel: "__use_endpoint_id__",
    endpointId: "gpt-image-2",
    defaultPort: 8787,
    suffix: "/v1",
    exe: "apimart_sync_proxy_console.exe",
    description: "APIMart GPT-Image-2 同步适配，支持文生图和图生图。",
  },
  runninghub: {
    id: "runninghub",
    name: "RunningHub 图片代理",
    configName: "runninghub-image",
    provider: "openai",
    generationType: "image",
    model: "跟 Endpoint ID 保持一致",
    dbModel: "__use_endpoint_id__",
    endpointId: "rhart-image-g-2-text-to-image 或 rhart-image-g-2-image-to-image",
    defaultPort: 8788,
    suffix: "/v1",
    exe: "runninghub_sync_proxy_console.exe",
    description: "RunningHub 文生图/图生图同步适配，图生图会先上传图片。",
  },
  agnesImage: {
    id: "agnesImage",
    name: "Agnes 图片代理",
    configName: "agnes-image",
    provider: "openai",
    generationType: "image",
    model: "跟 Endpoint ID 保持一致",
    dbModel: "__use_endpoint_id__",
    endpointId: "agnes-image-2.1-flash",
    defaultPort: 8789,
    suffix: "/v1",
    exe: "agnes_sync_proxy.exe",
    description: "Agnes Image 2.1 Flash 适配，图生图使用临时图床中转。",
  },
  agnesVideo: {
    id: "agnesVideo",
    name: "Agnes 视频代理",
    configName: "agnes-video",
    provider: "updream-global",
    generationType: "video",
    model: "跟 Endpoint ID 保持一致",
    dbModel: "__use_endpoint_id__",
    endpointId: "agnes-video-v2.0",
    defaultPort: 8790,
    suffix: "",
    exe: "agnes_video_proxy.exe",
    description: "Agnes Video V2.0 异步任务适配，支持文生视频和图生视频。",
  },
};

const JIMENG_CONFIGS = [
  {
    name: "即梦cli2.0",
    provider: "jimeng",
    generationType: "video",
    apiKey: "(cli-auth)",
    baseUrl: null,
    model: "__use_endpoint_id__",
    endpointId: "seedance2.0",
  },
  {
    name: "即梦cli2.0fast",
    provider: "jimeng",
    generationType: "video",
    apiKey: "(cli-auth)",
    baseUrl: null,
    model: "__use_endpoint_id__",
    endpointId: "seedance2.0fast",
  },
  {
    name: "即梦cli2.0fast_vip",
    provider: "jimeng",
    generationType: "video",
    apiKey: "(cli-auth)",
    baseUrl: null,
    model: "__use_endpoint_id__",
    endpointId: "seedance2.0fast_vip",
  },
  {
    name: "即梦cli2.0_vip",
    provider: "jimeng",
    generationType: "video",
    apiKey: "(cli-auth)",
    baseUrl: null,
    model: "__use_endpoint_id__",
    endpointId: "seedance2.0_vip",
  },
];

const running = new Map();
let mainWindow;

function getAppIconPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, "app.asar", "build", "icon.ico")
    : path.resolve(__dirname, "..", "build", "icon.ico");
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 980,
    minHeight: 680,
    backgroundColor: "#f5f7fb",
    title: "updream管理器",
    icon: getAppIconPath(),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
}

function emit(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function log(serviceId, message, level = "info") {
  emit("service-log", {
    serviceId,
    message,
    level,
    time: new Date().toLocaleTimeString(),
  });
}

function parseVersion(value) {
  return String(value || "")
    .trim()
    .replace(/^v/i, "")
    .split(".")
    .map((part) => Number.parseInt(part.replace(/\D.*/, ""), 10) || 0);
}

function compareVersions(left, right) {
  const a = parseVersion(left);
  const b = parseVersion(right);
  const length = Math.max(a.length, b.length, 3);
  for (let index = 0; index < length; index += 1) {
    const diff = (a[index] || 0) - (b[index] || 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
}

function requestJson(url) {
  return new Promise((resolve, reject) => {
    const request = https.get(
      url,
      {
        headers: {
          "User-Agent": "Updream-Proxy-Manager",
          Accept: "application/vnd.github+json",
        },
        timeout: 15000,
      },
      (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => {
          if (response.statusCode < 200 || response.statusCode >= 300) {
            reject(new Error(`GitHub 返回状态 ${response.statusCode}`));
            return;
          }
          try {
            resolve(JSON.parse(body));
          } catch (error) {
            reject(new Error(`更新信息解析失败：${error.message}`));
          }
        });
      },
    );
    request.on("timeout", () => {
      request.destroy(new Error("检查更新超时"));
    });
    request.on("error", reject);
  });
}

function findWindowsInstaller(release) {
  const assets = Array.isArray(release.assets) ? release.assets : [];
  return (
    assets.find((asset) => /setup.*\.exe$/i.test(asset.name || "")) ||
    assets.find((asset) => /\.exe$/i.test(asset.name || ""))
  );
}

async function checkForUpdates(showDialog = true) {
  const currentVersion = app.getVersion();
  const release = await requestJson(`${GITHUB_API_BASE}/repos/${UPDATE_OWNER}/${UPDATE_REPO}/releases/latest`);
  const latestVersion = String(release.tag_name || release.name || "").replace(/^v/i, "");
  const installer = findWindowsInstaller(release);
  const hasUpdate = compareVersions(latestVersion, currentVersion) > 0;
  const result = {
    currentVersion,
    latestVersion,
    hasUpdate,
    releaseName: release.name || release.tag_name,
    releaseUrl: release.html_url,
    downloadUrl: installer?.browser_download_url || release.html_url,
    assetName: installer?.name || "",
  };

  if (!showDialog) return result;

  if (!hasUpdate) {
    await dialog.showMessageBox(mainWindow, {
      type: "info",
      title: "检查更新",
      message: "当前已经是最新版本。",
      detail: `当前版本：${currentVersion}\n最新版本：${latestVersion || currentVersion}`,
      buttons: ["确定"],
      noLink: true,
    });
    return result;
  }

  const response = await dialog.showMessageBox(mainWindow, {
    type: "info",
    title: "发现新版本",
    message: `发现新版本 ${latestVersion}`,
    detail: `当前版本：${currentVersion}\n最新版本：${latestVersion}\n\n${release.body || ""}`.slice(0, 1800),
    buttons: ["下载安装包", "打开发布页", "稍后"],
    defaultId: 0,
    cancelId: 2,
    noLink: true,
  });

  if (response.response === 0 && result.downloadUrl) {
    await shell.openExternal(result.downloadUrl);
  } else if (response.response === 1 && result.releaseUrl) {
    await shell.openExternal(result.releaseUrl);
  }
  return result;
}

function getBinDir() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "proxy-bin");
  }
  return path.resolve(__dirname, "..", "..", "dist");
}

function getExePath(service) {
  return path.join(getBinDir(), service.exe);
}

function getSqlJsDistDir() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "app.asar", "node_modules", "sql.js", "dist");
  }
  return path.resolve(__dirname, "..", "node_modules", "sql.js", "dist");
}

function getSQL() {
  if (!sqlReady) {
    sqlReady = initSqlJs({
      locateFile: (file) => path.join(getSqlJsDistDir(), file),
    });
  }
  return sqlReady;
}

function getSettingsPath() {
  return path.join(app.getPath("userData"), "settings.json");
}

function getDefaultUpdreamExePath() {
  const bundled = app.isPackaged
    ? path.join(process.resourcesPath, "updream-app", "updream.exe")
    : path.resolve(__dirname, "..", "..", "3", "updream", "updream.exe");
  const candidates = [
    bundled,
    path.join(app.getPath("home"), "Desktop", "updream", "3", "updream", "updream.exe"),
    path.join(app.getPath("home"), "Desktop", "updream", "updream.exe"),
    path.join(path.dirname(process.execPath), "updream.exe"),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0];
}

function getSettings() {
  const defaults = {
    updreamExePath: getDefaultUpdreamExePath(),
    apiKeys: {},
  };
  try {
    if (!fs.existsSync(getSettingsPath())) return defaults;
    const settings = { ...defaults, ...JSON.parse(fs.readFileSync(getSettingsPath(), "utf8")) };
    const configuredPath = settings.updreamExePath || "";
    const isStaleTempPath = configuredPath.toLowerCase().includes(`${path.sep}temp${path.sep}`);
    if (!configuredPath || !fs.existsSync(configuredPath) || isStaleTempPath) {
      settings.updreamExePath = defaults.updreamExePath;
    }
    return settings;
  } catch (_error) {
    return defaults;
  }
}

function saveSettings(settings) {
  fs.mkdirSync(path.dirname(getSettingsPath()), { recursive: true });
  const previous = getSettings();
  const apiKeys = { ...(previous.apiKeys || {}) };
  for (const [key, value] of Object.entries(settings.apiKeys || {})) {
    if (value) {
      apiKeys[key] = value;
    } else if (!(key in apiKeys)) {
      apiKeys[key] = "";
    }
  }
  if (!apiKeys.agnesImage && apiKeys.agnesVideo) apiKeys.agnesImage = apiKeys.agnesVideo;
  if (!apiKeys.agnesVideo && apiKeys.agnesImage) apiKeys.agnesVideo = apiKeys.agnesImage;
  const safeSettings = {
    updreamExePath: settings.updreamExePath || getDefaultUpdreamExePath(),
    apiKeys,
  };
  fs.writeFileSync(getSettingsPath(), JSON.stringify(safeSettings, null, 2), "utf8");
  return safeSettings;
}

function getUpdreamDbPath() {
  return path.join(app.getPath("appData"), "Updream", "data.db");
}

async function configureUpdream(settingsInput = {}) {
  const settings = saveSettings({ ...getSettings(), ...settingsInput });
  const dbPath = getUpdreamDbPath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const SQL = await getSQL();
  const fileBuffer = fs.existsSync(dbPath) ? fs.readFileSync(dbPath) : null;
  const db = fileBuffer ? new SQL.Database(fileBuffer) : new SQL.Database();
  db.run(`
    CREATE TABLE IF NOT EXISTS api_configs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      provider TEXT NOT NULL,
      api_key TEXT NOT NULL,
      base_url TEXT,
      model TEXT,
      endpoint_id TEXT,
      generation_type TEXT DEFAULT 'image',
      is_active INTEGER DEFAULT 1,
      ctime TEXT NOT NULL,
      mtime TEXT NOT NULL
    )
  `);

  const now = new Date().toISOString();
  const serviceRows = statusPayload().map((service) => ({
    name: service.configName,
    provider: service.provider,
    apiKey: settings.apiKeys?.[service.id] || "",
    baseUrl: service.baseUrl,
    model: service.dbModel,
    endpointId: service.endpointId,
    generationType: service.generationType,
  }));
  serviceRows.push(...JIMENG_CONFIGS);
  const missingKeys = [];

  const getExisting = (name) => {
    const escapedName = JSON.stringify(name);
    const result = db.exec(`SELECT id, api_key FROM api_configs WHERE name = ${escapedName} LIMIT 1`);
    if (!result.length || !result[0].values.length) return null;
    return {
      id: result[0].values[0][0],
      apiKey: result[0].values[0][1] || "",
    };
  };

  for (const row of serviceRows) {
    const existing = getExisting(row.name);
    const effectiveApiKey = row.apiKey || existing?.apiKey || "";
    if (row.provider !== "jimeng" && !effectiveApiKey) {
      missingKeys.push(row.name);
    }

    if (existing) {
      const stmt = db.prepare(`
        UPDATE api_configs
        SET provider = ?, api_key = ?, base_url = ?, model = ?, endpoint_id = ?,
            generation_type = ?, is_active = 1, mtime = ?
        WHERE id = ?
      `);
      stmt.run([
        row.provider,
        effectiveApiKey,
        row.baseUrl,
        row.model,
        row.endpointId,
        row.generationType,
        now,
        existing.id,
      ]);
      stmt.free();
    } else {
      const stmt = db.prepare(`
        INSERT INTO api_configs
          (name, provider, api_key, base_url, model, endpoint_id, generation_type, is_active, ctime, mtime)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
      `);
      stmt.run([
        row.name,
        row.provider,
        effectiveApiKey,
        row.baseUrl,
        row.model,
        row.endpointId,
        row.generationType,
        now,
        now,
      ]);
      stmt.free();
    }
  }

  const data = db.export();
  fs.writeFileSync(dbPath, Buffer.from(data));
  db.close();
  log("updream", `已写入 ${serviceRows.length} 条接口配置到 ${dbPath}`);
  if (missingKeys.length) {
    log("updream", `以下配置还没有 API Key：${missingKeys.join(", ")}`, "warn");
  }
  return {
    settings,
    dbPath,
    missingKeys,
    configs: serviceRows.map(({ apiKey, ...rest }) => rest),
  };
}

async function openUpdream(settingsInput = {}) {
  const settings = saveSettings({ ...getSettings(), ...settingsInput });
  const exePath = settings.updreamExePath;
  if (!exePath || !fs.existsSync(exePath)) {
    throw new Error(`找不到 Updream 程序：${exePath || "未设置"}`);
  }
  const child = spawn(exePath, [], {
    cwd: path.dirname(exePath),
    detached: true,
    stdio: "ignore",
    windowsHide: false,
  });
  child.unref();
  log("updream", `已打开 Updream：${exePath}`);
  return { started: true, pid: child.pid, exePath };
}

function getDreaminaResourceDir() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "dreamina-cli");
  }
  return path.resolve(__dirname, "..", "vendor", "dreamina");
}

function getDreaminaTargetDir() {
  return path.join(app.getPath("home"), ".dreamina_cli");
}

function getDreaminaTargetExe() {
  return path.join(getDreaminaTargetDir(), "dreamina.exe");
}

function normalizePathPart(value) {
  return String(value || "").trim().replace(/^"|"$/g, "").toLowerCase();
}

async function getDreaminaVersion(exePath) {
  try {
    const { stdout, stderr } = await execFileAsync(exePath, ["version"], {
      windowsHide: true,
      timeout: 12000,
    });
    return (stdout || stderr || "").trim();
  } catch (error) {
    return "";
  }
}

async function getDreaminaStatus() {
  const targetDir = getDreaminaTargetDir();
  const exePath = getDreaminaTargetExe();
  const bundledExe = path.join(getDreaminaResourceDir(), "dreamina.exe");
  const installed = fs.existsSync(exePath);
  const bundled = fs.existsSync(bundledExe);
  const version = installed ? await getDreaminaVersion(exePath) : "";
  return {
    installed,
    bundled,
    version,
    installDir: targetDir,
    exePath,
    bundledPath: bundledExe,
  };
}

async function addDreaminaToUserPath(targetDir) {
  const escaped = targetDir.replaceAll("'", "''");
  const script = `
$dir = '${escaped}'
$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
$items = @()
if ($userPath) {
  $items = $userPath -split ';' | Where-Object { $_ -and ($_.Trim().Trim('"') -ne $dir) }
}
$items = @($items) + $dir
[Environment]::SetEnvironmentVariable('Path', ($items -join ';'), 'User')
`;
  await execFileAsync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], {
    windowsHide: true,
    timeout: 15000,
  });

  const currentPath = process.env.Path || process.env.PATH || "";
  const hasCurrent = currentPath
    .split(";")
    .some((item) => normalizePathPart(item) === normalizePathPart(targetDir));
  if (!hasCurrent) {
    process.env.Path = `${currentPath}${currentPath ? ";" : ""}${targetDir}`;
    process.env.PATH = process.env.Path;
  }
}

async function installDreaminaCli() {
  const resourceDir = getDreaminaResourceDir();
  const sourceExe = path.join(resourceDir, "dreamina.exe");
  const targetDir = getDreaminaTargetDir();
  const targetExe = getDreaminaTargetExe();

  if (!fs.existsSync(sourceExe)) {
    throw new Error(`安装包内没有找到即梦 CLI：${sourceExe}`);
  }

  fs.mkdirSync(targetDir, { recursive: true });
  fs.copyFileSync(sourceExe, targetExe);

  for (const fileName of ["SKILL.md", "version.json"]) {
    const sourceFile = path.join(resourceDir, fileName);
    if (fs.existsSync(sourceFile)) {
      fs.copyFileSync(sourceFile, path.join(targetDir, fileName));
    }
  }

  await addDreaminaToUserPath(targetDir);
  const version = await getDreaminaVersion(targetExe);
  log("dreamina", `即梦 CLI 已安装到 ${targetExe}${version ? `，版本：${version}` : ""}`);
  return getDreaminaStatus();
}

async function loginDreaminaCli() {
  const exePath = getDreaminaTargetExe();
  if (!fs.existsSync(exePath)) {
    throw new Error("即梦 CLI 还没有安装，请先点击安装/修复。");
  }

  const child = spawn(exePath, ["login"], {
    cwd: path.dirname(exePath),
    windowsHide: true,
  });
  log("dreamina", `已启动登录流程：PID ${child.pid}`);

  const openUrl = (text) => {
    const urlMatch = text.match(/https?:\/\/[^\s"'<>]+/);
    if (urlMatch) {
      shell.openExternal(urlMatch[0]);
      log("dreamina", `已打开登录地址：${urlMatch[0]}`);
    }
  };

  child.stdout?.on("data", (chunk) => {
    const text = chunk.toString("utf8").trim();
    if (text) {
      log("dreamina", text);
      openUrl(text);
    }
  });

  child.stderr?.on("data", (chunk) => {
    const text = chunk.toString("utf8").trim();
    if (text) {
      log("dreamina", text, "warn");
      openUrl(text);
    }
  });

  child.on("exit", (code) => {
    log("dreamina", `登录流程已退出，代码 ${code ?? "unknown"}`, code === 0 ? "info" : "warn");
  });

  return { started: true, pid: child.pid };
}

function listPortPids(port) {
  return new Promise((resolve) => {
    execFile("netstat", ["-ano", "-p", "tcp"], { windowsHide: true }, (error, stdout) => {
      if (error) {
        resolve([]);
        return;
      }
      const pids = new Set();
      for (const line of stdout.split(/\r?\n/)) {
        const parts = line.trim().split(/\s+/);
        if (parts.length < 5 || parts[0].toUpperCase() !== "TCP") continue;
        if (parts[3].toUpperCase() !== "LISTENING") continue;
        const local = parts[1];
        const pid = Number(parts[4]);
        const localPort = Number(local.slice(local.lastIndexOf(":") + 1));
        if (localPort === Number(port) && pid && pid !== process.pid) {
          pids.add(pid);
        }
      }
      resolve([...pids]);
    });
  });
}

async function isPortFree(port) {
  return (await listPortPids(port)).length === 0;
}

async function findAvailablePort(startPort) {
  for (let port = startPort; port <= 65535; port += 1) {
    if (await isPortFree(port)) return port;
  }
  throw new Error(`没有找到可用端口：${startPort}-65535`);
}

function killPid(pid) {
  return new Promise((resolve) => {
    execFile("taskkill", ["/PID", String(pid), "/F"], { windowsHide: true }, () => resolve());
  });
}

async function resolvePortConflict(service, requestedPort) {
  const pids = await listPortPids(requestedPort);
  if (!pids.length) return { action: "use", port: requestedPort };

  const result = await dialog.showMessageBox(mainWindow, {
    type: "warning",
    title: "端口被占用",
    message: `${service.name} 需要使用端口 ${requestedPort}，但该端口已被占用。`,
    detail: `占用进程 PID：${pids.join(", ")}\n\n请选择处理方式。`,
    buttons: ["自动换新端口", "结束占用进程", "跳过此服务", "取消启动"],
    defaultId: 0,
    cancelId: 3,
    noLink: true,
  });

  if (result.response === 0) {
    const port = await findAvailablePort(requestedPort + 1);
    return { action: "use", port };
  }
  if (result.response === 1) {
    for (const pid of pids) await killPid(pid);
    return { action: "use", port: requestedPort };
  }
  if (result.response === 2) return { action: "skip" };
  return { action: "cancel" };
}

function statusPayload() {
  return Object.values(SERVICES).map((service) => {
    const state = running.get(service.id);
    return {
      ...service,
      running: Boolean(state),
      port: state?.port ?? service.defaultPort,
      baseUrl: `http://127.0.0.1:${state?.port ?? service.defaultPort}${service.suffix}`,
      pid: state?.process.pid ?? null,
    };
  });
}

function emitStatus() {
  emit("service-status", statusPayload());
}

async function startService(serviceId, requestedPort) {
  const service = SERVICES[serviceId];
  if (!service) throw new Error("未知服务");
  if (running.has(serviceId)) return running.get(serviceId);

  const exePath = getExePath(service);
  if (!fs.existsSync(exePath)) {
    throw new Error(`找不到代理程序：${exePath}`);
  }

  const conflict = await resolvePortConflict(service, Number(requestedPort || service.defaultPort));
  if (conflict.action === "skip") {
    log(serviceId, "已跳过启动。", "warn");
    return null;
  }
  if (conflict.action === "cancel") {
    throw new Error("用户取消启动");
  }

  const port = conflict.port;
  const args = ["--host", "127.0.0.1", "--port", String(port), "--no-kill-port"];
  const child = spawn(exePath, args, {
    cwd: path.dirname(exePath),
    windowsHide: true,
  });

  running.set(serviceId, { process: child, port });
  log(serviceId, `已启动：PID ${child.pid}，Base URL http://127.0.0.1:${port}${service.suffix}`);

  child.stdout?.on("data", (chunk) => {
    const text = chunk.toString("utf8").trim();
    if (text) log(serviceId, text);
  });

  child.stderr?.on("data", (chunk) => {
    const text = chunk.toString("utf8").trim();
    if (text) log(serviceId, text, "warn");
  });

  child.on("exit", (code) => {
    if (running.get(serviceId)?.process === child) {
      running.delete(serviceId);
      log(serviceId, `服务已退出，代码 ${code ?? "unknown"}`, code === 0 ? "info" : "warn");
      emitStatus();
    }
  });

  emitStatus();
  return running.get(serviceId);
}

async function stopService(serviceId) {
  const state = running.get(serviceId);
  if (!state) return;
  running.delete(serviceId);
  state.process.kill();
  log(serviceId, "已发送停止命令。");
  emitStatus();
}

ipcMain.handle("services:list", () => statusPayload());

ipcMain.handle("services:start", async (_event, { serviceId, port }) => {
  await startService(serviceId, port);
  return statusPayload();
});

ipcMain.handle("services:stop", async (_event, serviceId) => {
  await stopService(serviceId);
  return statusPayload();
});

ipcMain.handle("services:startMany", async (_event, serviceIds) => {
  for (const serviceId of serviceIds) {
    await startService(serviceId, SERVICES[serviceId].defaultPort);
  }
  return statusPayload();
});

ipcMain.handle("services:stopAll", async () => {
  for (const serviceId of [...running.keys()]) {
    await stopService(serviceId);
  }
  return statusPayload();
});

ipcMain.handle("dreamina:status", () => getDreaminaStatus());
ipcMain.handle("dreamina:install", () => installDreaminaCli());
ipcMain.handle("dreamina:login", () => loginDreaminaCli());
ipcMain.handle("settings:get", () => getSettings());
ipcMain.handle("settings:save", (_event, settings) => saveSettings({ ...getSettings(), ...settings }));
ipcMain.handle("updream:pickExe", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "选择 updream.exe",
    defaultPath: path.dirname(getSettings().updreamExePath || getDefaultUpdreamExePath()),
    filters: [{ name: "Updream", extensions: ["exe"] }],
    properties: ["openFile"],
  });
  if (result.canceled || !result.filePaths.length) return getSettings();
  return saveSettings({ ...getSettings(), updreamExePath: result.filePaths[0] });
});
ipcMain.handle("updream:configure", (_event, settings) => configureUpdream(settings));
ipcMain.handle("updream:configureAndOpen", async (_event, settings) => {
  const configured = await configureUpdream(settings);
  const opened = await openUpdream(configured.settings);
  return { ...configured, opened };
});
ipcMain.handle("updates:check", () => checkForUpdates(true));

app.whenReady().then(createWindow);

app.on("window-all-closed", async () => {
  for (const serviceId of [...running.keys()]) {
    await stopService(serviceId);
  }
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", async () => {
  for (const serviceId of [...running.keys()]) {
    await stopService(serviceId);
  }
});
