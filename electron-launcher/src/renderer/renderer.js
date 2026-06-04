let services = [];
let logs = [];
let dreaminaStatus = null;
let appSettings = { apiKeys: {}, updreamExePath: "" };
let announcementActionUrl = "";

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
const checkUpdatesBtn = document.querySelector("#checkUpdatesBtn");
const pageTitle = document.querySelector("#pageTitle");
const themeToggleBtn = document.querySelector("#themeToggleBtn");
const pageViews = document.querySelectorAll(".page-view");
const pageButtons = document.querySelectorAll("[data-page-target]");
const pageLinks = document.querySelectorAll("[data-go-page]");
const healthServiceText = document.querySelector("#healthServiceText");
const healthUpdreamText = document.querySelector("#healthUpdreamText");
const healthDreaminaText = document.querySelector("#healthDreaminaText");
const authorAvatar = document.querySelector("#authorAvatar");
const authorName = document.querySelector("#authorName");
const authorSubtitle = document.querySelector("#authorSubtitle");
const contactCards = document.querySelector("#contactCards");
const contactWideCards = document.querySelector("#contactWideCards");
const sponsorCard = document.querySelector("#sponsorCard");
const sponsorTitle = document.querySelector("#sponsorTitle");
const sponsorQr = document.querySelector("#sponsorQr");
const sponsorText = document.querySelector("#sponsorText");
const announcementModal = document.querySelector("#announcementModal");
const announcementTitle = document.querySelector("#announcementTitle");
const announcementBody = document.querySelector("#announcementBody");
const announcementCloseBtn = document.querySelector("#announcementCloseBtn");
const announcementTodayBtn = document.querySelector("#announcementTodayBtn");
const announcementOkBtn = document.querySelector("#announcementOkBtn");
const announcementActionBtn = document.querySelector("#announcementActionBtn");
const setupTabs = document.querySelectorAll(".setup-tab");
const setupPanes = {
  keys: document.querySelector("#keysPane"),
  configs: document.querySelector("#configsPane"),
};

const pageNames = {
  dashboard: "仪表盘",
  services: "本地代理服务",
  logs: "运行日志",
  settings: "系统设置",
  contact: "联系作者",
};

const defaultContactContent = {
  author: {
    name: "联系作者",
    subtitle: "这里的内容会从 GitHub 在线读取，后续修改 JSON 后用户重新打开软件即可看到最新内容。",
    avatarUrl: "./assets/logo.png",
  },
  cards: [
    { title: "Bilibili", text: "账号 / 链接待填写", icon: "▶", color: "pink", actionText: "前往关注", url: "" },
    { title: "抖音", text: "账号 / 链接待填写", icon: "♪", color: "dark", actionText: "复制号码", copyText: "" },
    { title: "小红书", text: "账号 / 链接待填写", icon: "❤", color: "red", actionText: "复制号码", copyText: "" },
    { title: "YouTube", text: "账号 / 链接待填写", icon: "▶", color: "youtube", actionText: "前往订阅", url: "" },
  ],
  wideCards: [
    { title: "QQ 频道", text: "频道号 / 入口待填写", icon: "✉", color: "cyan", actionText: "复制", copyText: "" },
    { title: "粉丝资源网站", text: "AI 工作流 / 提示词 / 素材合集", icon: "▣", color: "purple", actionText: "前往网盘", url: "" },
  ],
  sponsor: {
    title: "请作者喝杯奶茶",
    text: "支持文案待填写",
    qrImageUrl: "",
    enabled: true,
  },
};

const defaultAnnouncementContent = {
  enabled: true,
  id: "local-welcome-2026-06-05",
  title: "公告",
  body: "公告功能已启用。\n后续把 remote/announcement.json 同步到 GitHub 后，这里会自动显示线上公告内容，不需要重新打包。",
  actionText: "",
  actionUrl: "",
};

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function linesToHtml(value) {
  return escapeHtml(value || "").replace(/\r?\n/g, "<br />");
}

async function runContactAction(item) {
  if (!item) return;
  if (item.url) {
    await window.proxyManager.openExternal(item.url);
    return;
  }
  if (item.copyText) {
    await navigator.clipboard.writeText(item.copyText);
    pushLog("contact", "info", `${item.title || "内容"} 已复制。`);
  }
}

function contactButtonHtml(item, className = "ghost") {
  if (!item.url && !item.copyText) return "";
  return `<button class="${className}" data-contact-action="${escapeHtml(item.id)}">${escapeHtml(item.actionText || "打开")}</button>`;
}

function renderContactContent(content) {
  const data = {
    ...defaultContactContent,
    ...content,
    author: { ...defaultContactContent.author, ...(content?.author || {}) },
    sponsor: { ...defaultContactContent.sponsor, ...(content?.sponsor || {}) },
  };
  const contactItems = [...(data.cards || []), ...(data.wideCards || [])].map((item, index) => ({
    ...item,
    id: item.id || `contact-${index}`,
  }));
  const itemById = new Map(contactItems.map((item) => [item.id, item]));

  authorName.textContent = data.author.name || "联系作者";
  authorSubtitle.textContent = data.author.subtitle || "";
  authorAvatar.src = data.author.avatarUrl || "./assets/logo.png";

  contactCards.innerHTML = contactItems
    .slice(0, data.cards?.length || 0)
    .map(
      (item) => `
        <article class="contact-card">
          <div class="contact-icon ${escapeHtml(item.color || "purple")}">${escapeHtml(item.icon || "•")}</div>
          <div>
            <h4>${escapeHtml(item.title || "")}</h4>
            <p>${escapeHtml(item.text || "")}</p>
          </div>
          ${contactButtonHtml(item)}
        </article>
      `,
    )
    .join("");

  contactWideCards.innerHTML = contactItems
    .slice(data.cards?.length || 0)
    .map(
      (item) => `
        <article class="contact-wide-card">
          <div class="contact-icon ${escapeHtml(item.color || "purple")}">${escapeHtml(item.icon || "•")}</div>
          <div>
            <h4>${escapeHtml(item.title || "")}</h4>
            <p>${escapeHtml(item.text || "")}</p>
          </div>
          ${contactButtonHtml(item)}
        </article>
      `,
    )
    .join("");

  sponsorCard.classList.toggle("hidden", data.sponsor.enabled === false);
  sponsorTitle.textContent = data.sponsor.title || "";
  sponsorText.textContent = data.sponsor.text || "";
  sponsorQr.innerHTML = data.sponsor.qrImageUrl
    ? `<img src="${escapeHtml(data.sponsor.qrImageUrl)}" alt="${escapeHtml(data.sponsor.title || "收款码")}" />`
    : "收款码图片待填写";

  for (const button of document.querySelectorAll("[data-contact-action]")) {
    button.addEventListener("click", () => runContactAction(itemById.get(button.dataset.contactAction)));
  }
}

function hideAnnouncement() {
  announcementModal.classList.add("hidden");
}

function showAnnouncement(content) {
  if (!content?.enabled) return;
  const id = String(content.id || "default");
  const hiddenDate = localStorage.getItem(`announcementHiddenDate:${id}`);
  if (hiddenDate === todayKey()) return;

  announcementTitle.textContent = content.title || "公告";
  announcementBody.innerHTML = linesToHtml(content.body || "");
  announcementActionUrl = content.actionUrl || "";
  announcementActionBtn.textContent = content.actionText || "查看详情";
  announcementActionBtn.classList.toggle("hidden", !announcementActionUrl);
  announcementTodayBtn.dataset.announcementId = id;
  announcementModal.classList.remove("hidden");
}

async function refreshRemoteContent() {
  renderContactContent(defaultContactContent);
  try {
    const contact = await window.proxyManager.getRemoteContent("contact");
    if (contact) renderContactContent(contact);
  } catch (error) {
    pushLog("contact", "warn", `联系作者在线内容读取失败：${error.message || String(error)}`);
  }

  try {
    const announcement = await window.proxyManager.getRemoteContent("announcement");
    showAnnouncement(announcement || defaultAnnouncementContent);
  } catch (error) {
    pushLog("announcement", "warn", `公告在线内容读取失败：${error.message || String(error)}`);
    showAnnouncement(defaultAnnouncementContent);
  }
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
  const running = services.filter((item) => item.running).length;
  healthServiceText.textContent = running ? `${running}/${services.length} 运行中` : "待启动";
  healthServiceText.parentElement.querySelector(".status-dot").classList.toggle("running", running > 0);

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
            <span class="status-label ${item.running ? "normal" : "abnormal"}">
              <i class="status-dot ${item.running ? "running" : "error"}"></i>
              ${item.running ? "正常" : "不正常"}
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

function setPage(pageName) {
  for (const view of pageViews) {
    view.classList.toggle("active", view.dataset.page === pageName);
  }
  for (const button of pageButtons) {
    button.classList.toggle("active", button.dataset.pageTarget === pageName);
  }
  pageTitle.textContent = pageNames[pageName] || pageNames.dashboard;
}

function setSetupTab(tabName) {
  for (const tab of setupTabs) {
    const active = tab.dataset.setupTab === tabName;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
  }
  for (const [name, pane] of Object.entries(setupPanes)) {
    pane?.classList.toggle("active", name === tabName);
  }
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
    healthDreaminaText.textContent = "检测中";
    healthDreaminaText.parentElement.querySelector(".status-dot").classList.remove("running");
    loginDreaminaBtn.disabled = true;
    return;
  }

  dreaminaState.textContent = dreaminaStatus.installed ? "已安装" : "未安装";
  dreaminaState.className = `dreamina-state ${dreaminaStatus.installed ? "installed" : "missing"}`;
  healthDreaminaText.textContent = dreaminaStatus.installed ? "正常" : "未安装";
  healthDreaminaText.parentElement
    .querySelector(".status-dot")
    .classList.toggle("running", dreaminaStatus.installed);
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
  healthUpdreamText.textContent = appSettings.updreamExePath ? "正常" : "未设置";
  healthUpdreamText.parentElement
    .querySelector(".status-dot")
    .classList.toggle("running", Boolean(appSettings.updreamExePath));
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

for (const tab of setupTabs) {
  tab.addEventListener("click", () => setSetupTab(tab.dataset.setupTab));
}

for (const button of pageButtons) {
  button.addEventListener("click", () => setPage(button.dataset.pageTarget));
}

for (const link of pageLinks) {
  link.addEventListener("click", () => setPage(link.dataset.goPage));
}

themeToggleBtn.addEventListener("click", () => {
  const light = document.body.classList.toggle("light-mode");
  themeToggleBtn.textContent = light ? "☾" : "◐";
  themeToggleBtn.title = light ? "切换夜间模式" : "切换日间模式";
});

announcementCloseBtn.addEventListener("click", hideAnnouncement);
announcementOkBtn.addEventListener("click", hideAnnouncement);
announcementTodayBtn.addEventListener("click", () => {
  const id = announcementTodayBtn.dataset.announcementId || "default";
  localStorage.setItem(`announcementHiddenDate:${id}`, todayKey());
  hideAnnouncement();
});
announcementActionBtn.addEventListener("click", async () => {
  if (announcementActionUrl) await window.proxyManager.openExternal(announcementActionUrl);
});

checkUpdatesBtn.addEventListener("click", async () => {
  checkUpdatesBtn.disabled = true;
  try {
    const result = await window.proxyManager.checkUpdates();
    if (result.hasUpdate) {
      pushLog("update", "info", `发现新版本 ${result.latestVersion}，当前版本 ${result.currentVersion}。`);
    } else {
      pushLog("update", "info", `当前已是最新版本：${result.currentVersion}。`);
    }
  } catch (error) {
    pushLog("update", "error", error.message || String(error));
  } finally {
    checkUpdatesBtn.disabled = false;
  }
});

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
refreshRemoteContent();
