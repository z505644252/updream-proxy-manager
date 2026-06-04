let services = [];
let logs = [];
let dreaminaStatus = null;
let appSettings = { apiKeys: {}, updreamExePath: "" };

const serviceNav = document.querySelector("#serviceNav");
const serviceGrid = document.querySelector("#serviceGrid");
const configList = document.querySelector("#configList");
const logsEl = document.querySelector("#logs");
const runningCount = document.querySelector("#runningCount");
const totalCount = document.querySelector("#totalCount");
const dreaminaState = document.querySelector("#dreaminaState");
const dreaminaPath = document.querySelector("#dreaminaPath");
const installDreaminaBtn = document.querySelector("#installDreaminaBtn");
const loginDreaminaBtn = document.querySelector("#loginDreaminaBtn");
const refreshDreaminaBtn = document.querySelector("#refreshDreaminaBtn");
const keyGrid = document.querySelector("#keyGrid");
const updreamExePath = document.querySelector("#updreamExePath");
const pickUpdreamBtn = document.querySelector("#pickUpdreamBtn");
const saveSettingsBtn = document.querySelector("#saveSettingsBtn");
const configureOnlyBtn = document.querySelector("#configureOnlyBtn");
const startConfigureOpenBtn = document.querySelector("#startConfigureOpenBtn");

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function configText(service) {
  return [
    `[${service.name}]`,
    `Provider: ${service.provider}`,
    `generation_type: ${service.generationType}`,
    `Base URL: ${service.baseUrl}`,
    "API Key: 在本软件密钥面板填写后自动写入",
    `Model: ${service.model}`,
    `Endpoint ID: ${service.endpointId}`,
    `说明: ${service.description}`,
  ].join("\n");
}

function render() {
  totalCount.textContent = services.length;
  runningCount.textContent = services.filter((item) => item.running).length;

  serviceNav.innerHTML = services
    .map(
      (item) => `
        <div class="service-nav-item">
          <span>${escapeHtml(item.name)}</span>
          <i class="status-dot ${item.running ? "running" : ""}"></i>
        </div>
      `,
    )
    .join("");

  serviceGrid.innerHTML = services
    .map(
      (item) => `
        <article class="service-card" data-service-id="${item.id}">
          <div class="service-card-header">
            <div>
              <h3>${escapeHtml(item.name)}</h3>
              <p>${escapeHtml(item.description)}</p>
            </div>
            <span class="badge ${item.running ? "running" : ""}">
              ${item.running ? "运行中" : "未启动"}
            </span>
          </div>

          <div class="service-controls">
            <input class="port-field" type="number" min="1" max="65535"
              value="${item.port}" ${item.running ? "disabled" : ""}
              aria-label="${escapeHtml(item.name)} 端口" />
            <div class="base-url">${escapeHtml(item.baseUrl)}</div>
            <button class="service-btn ${item.running ? "stop" : ""}">
              ${item.running ? "停止" : "启动"}
            </button>
          </div>
        </article>
      `,
    )
    .join("");

  configList.innerHTML = services
    .map(
      (item) => `
        <article class="config-card">
          <h4>${escapeHtml(item.name)}</h4>
          <div class="config-row"><span>Provider</span><code>${escapeHtml(item.provider)}</code></div>
          <div class="config-row"><span>类型</span><code>${escapeHtml(item.generationType)}</code></div>
          <div class="config-row"><span>Base URL</span><code>${escapeHtml(item.baseUrl)}</code></div>
          <div class="config-row"><span>API Key</span><code>在本软件密钥面板填写后自动写入</code></div>
          <div class="config-row"><span>Model</span><code>${escapeHtml(item.model)}</code></div>
          <div class="config-row"><span>Endpoint ID</span><code>${escapeHtml(item.endpointId)}</code></div>
        </article>
      `,
    )
    .join("");
}

function renderLogs() {
  if (!logs.length) {
    logsEl.innerHTML = `<div class="log-line">等待操作...</div>`;
    return;
  }
  logsEl.innerHTML = logs
    .slice(-250)
    .map(
      (item) => `
        <div class="log-line ${item.level || "info"}">
          [${escapeHtml(item.time)}] ${escapeHtml(item.serviceId || "system")} · ${escapeHtml(item.message)}
        </div>
      `,
    )
    .join("");
  logsEl.scrollTop = logsEl.scrollHeight;
}

function renderDreamina() {
  if (!dreaminaStatus) {
    dreaminaState.textContent = "检测中";
    dreaminaState.className = "dreamina-state";
    dreaminaPath.textContent = "-";
    loginDreaminaBtn.disabled = true;
    return;
  }

  dreaminaState.textContent = dreaminaStatus.installed ? "已安装" : "未安装";
  dreaminaState.className = `dreamina-state ${dreaminaStatus.installed ? "installed" : "missing"}`;
  dreaminaPath.textContent = dreaminaStatus.installed
    ? `${dreaminaStatus.exePath}${dreaminaStatus.version ? ` · ${dreaminaStatus.version}` : ""}`
    : `将安装到 ${dreaminaStatus.installDir}`;
  loginDreaminaBtn.disabled = !dreaminaStatus.installed;
}

function renderKeyGrid() {
  if (!keyGrid || !services.length) return;
  keyGrid.innerHTML = services
    .map(
      (item) => `
        <label class="key-card">
          <span>${escapeHtml(item.name)}</span>
          <small>${escapeHtml(item.provider)} · ${escapeHtml(item.endpointId)}</small>
          <input type="password" class="key-field" data-service-id="${item.id}"
            value="${escapeHtml(appSettings.apiKeys?.[item.id] || "")}"
            placeholder="填写该平台 API Key" />
        </label>
      `,
    )
    .join("");
}

function collectSettings() {
  const apiKeys = {};
  for (const input of document.querySelectorAll(".key-field")) {
    apiKeys[input.dataset.serviceId] = input.value.trim();
  }
  if (!apiKeys.agnesImage && apiKeys.agnesVideo) apiKeys.agnesImage = apiKeys.agnesVideo;
  if (!apiKeys.agnesVideo && apiKeys.agnesImage) apiKeys.agnesVideo = apiKeys.agnesImage;
  return {
    updreamExePath: updreamExePath.value.trim(),
    apiKeys,
  };
}

function pushLog(serviceId, level, message) {
  logs.push({
    serviceId,
    level,
    message,
    time: new Date().toLocaleTimeString(),
  });
  renderLogs();
}

async function refresh() {
  services = await window.proxyManager.listServices();
  render();
  renderKeyGrid();
}

async function refreshSettings() {
  appSettings = await window.proxyManager.getSettings();
  updreamExePath.value = appSettings.updreamExePath || "";
  renderKeyGrid();
}

async function refreshDreamina() {
  dreaminaStatus = await window.proxyManager.dreaminaStatus();
  renderDreamina();
}

serviceGrid.addEventListener("click", async (event) => {
  const button = event.target.closest(".service-btn");
  if (!button) return;
  const card = event.target.closest(".service-card");
  const serviceId = card.dataset.serviceId;
  const service = services.find((item) => item.id === serviceId);
  const port = Number(card.querySelector(".port-field").value);
  button.disabled = true;
  try {
    if (service.running) {
      services = await window.proxyManager.stopService(serviceId);
    } else {
      services = await window.proxyManager.startService(serviceId, port);
    }
    render();
  } catch (error) {
    pushLog(serviceId, "error", error.message || String(error));
  } finally {
    button.disabled = false;
  }
});

document.querySelector("#startAllBtn").addEventListener("click", async () => {
  try {
    services = await window.proxyManager.startMany(services.map((item) => item.id));
    render();
  } catch (error) {
    pushLog("system", "error", error.message || String(error));
  }
});

document.querySelector("#stopAllBtn").addEventListener("click", async () => {
  services = await window.proxyManager.stopAll();
  render();
});

document.querySelector("#copyAllBtn").addEventListener("click", async () => {
  const text = services.map(configText).join("\n\n");
  await navigator.clipboard.writeText(text);
  pushLog("system", "info", "配置清单已复制到剪贴板。");
});

document.querySelector("#clearLogBtn").addEventListener("click", () => {
  logs = [];
  renderLogs();
});

installDreaminaBtn.addEventListener("click", async () => {
  installDreaminaBtn.disabled = true;
  try {
    dreaminaStatus = await window.proxyManager.installDreamina();
    renderDreamina();
  } catch (error) {
    pushLog("dreamina", "error", error.message || String(error));
  } finally {
    installDreaminaBtn.disabled = false;
  }
});

loginDreaminaBtn.addEventListener("click", async () => {
  loginDreaminaBtn.disabled = true;
  try {
    await window.proxyManager.loginDreamina();
  } catch (error) {
    pushLog("dreamina", "error", error.message || String(error));
  } finally {
    loginDreaminaBtn.disabled = false;
  }
});

refreshDreaminaBtn.addEventListener("click", refreshDreamina);

pickUpdreamBtn.addEventListener("click", async () => {
  appSettings = await window.proxyManager.pickUpdreamExe();
  updreamExePath.value = appSettings.updreamExePath || "";
});

saveSettingsBtn.addEventListener("click", async () => {
  appSettings = await window.proxyManager.saveSettings(collectSettings());
  pushLog("updream", "info", "密钥与 Updream 路径已保存。");
});

configureOnlyBtn.addEventListener("click", async () => {
  configureOnlyBtn.disabled = true;
  try {
    appSettings = await window.proxyManager.saveSettings(collectSettings());
    const result = await window.proxyManager.configureUpdream(appSettings);
    pushLog("updream", "info", "Updream 接口配置已写入。");
    if (result.missingKeys?.length) {
      pushLog("updream", "warn", `这些配置还没有 API Key：${result.missingKeys.join(", ")}`);
    }
  } catch (error) {
    pushLog("updream", "error", error.message || String(error));
  } finally {
    configureOnlyBtn.disabled = false;
  }
});

startConfigureOpenBtn.addEventListener("click", async () => {
  startConfigureOpenBtn.disabled = true;
  try {
    appSettings = await window.proxyManager.saveSettings(collectSettings());
    services = await window.proxyManager.startMany(services.map((item) => item.id));
    render();
    const result = await window.proxyManager.configureAndOpenUpdream(appSettings);
    pushLog("updream", "info", "代理已启动，配置已写入，Updream 已打开。");
    if (result.missingKeys?.length) {
      pushLog("updream", "warn", `这些配置还没有 API Key：${result.missingKeys.join(", ")}`);
    }
  } catch (error) {
    pushLog("updream", "error", error.message || String(error));
  } finally {
    startConfigureOpenBtn.disabled = false;
  }
});

window.proxyManager.onStatus((payload) => {
  services = payload;
  render();
});

window.proxyManager.onLog((payload) => {
  logs.push(payload);
  renderLogs();
});

refreshSettings();
refresh();
refreshDreamina();
renderLogs();
renderDreamina();
