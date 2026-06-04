const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("proxyManager", {
  listServices: () => ipcRenderer.invoke("services:list"),
  startService: (serviceId, port) => ipcRenderer.invoke("services:start", { serviceId, port }),
  stopService: (serviceId) => ipcRenderer.invoke("services:stop", serviceId),
  startMany: (serviceIds) => ipcRenderer.invoke("services:startMany", serviceIds),
  stopAll: () => ipcRenderer.invoke("services:stopAll"),
  dreaminaStatus: () => ipcRenderer.invoke("dreamina:status"),
  installDreamina: () => ipcRenderer.invoke("dreamina:install"),
  loginDreamina: () => ipcRenderer.invoke("dreamina:login"),
  getSettings: () => ipcRenderer.invoke("settings:get"),
  saveSettings: (settings) => ipcRenderer.invoke("settings:save", settings),
  pickUpdreamExe: () => ipcRenderer.invoke("updream:pickExe"),
  configureUpdream: (settings) => ipcRenderer.invoke("updream:configure", settings),
  configureAndOpenUpdream: (settings) => ipcRenderer.invoke("updream:configureAndOpen", settings),
  checkUpdates: () => ipcRenderer.invoke("updates:check"),
  onStatus: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("service-status", listener);
    return () => ipcRenderer.removeListener("service-status", listener);
  },
  onLog: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("service-log", listener);
    return () => ipcRenderer.removeListener("service-log", listener);
  },
});
