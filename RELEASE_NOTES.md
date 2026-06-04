# Release Notes / 更新日志

## v1.0.2

### 中文

- 新增“检查更新”按钮。
- 支持读取 GitHub 最新 Release，对比当前版本并提示升级。
- 发现新版本时可直接打开安装包下载链接或 Release 页面。

### English

- Added a "Check for updates" button.
- Added GitHub latest Release lookup and local version comparison.
- Allows opening the installer download link or Release page when a newer version is available.

## v1.0.1

### 中文

- 修复 Agnes 视频提交路径适配，避免 UpdreamGlobal 请求本地代理时返回 404。
- 修复 Agnes 视频上游参数 `seconds` 类型，按上游要求传字符串。
- 增加 `ref_images` 支持，适配 Updream 的图生视频/参考图生视频请求。
- 优化 Agnes 视频完成结果返回结构，提升 Updream 视频结果解析兼容性。
- 修复管理器中旧临时 Updream 路径残留导致打开错误程序的问题。

### English

- Fixed Agnes video submission path handling so UpdreamGlobal requests no longer fail with local 404.
- Fixed Agnes video payload `seconds` type for Agnes upstream compatibility.
- Added `ref_images` support for Agnes image-to-video/reference-to-video requests.
- Improved Agnes video completion response shape for Updream video result parsing.
- Fixed stale temporary Updream path fallback in the manager.

## v1.0.0

### 中文

- 初始桌面管理器版本。
- 增加本地代理服务管理和 Updream 配置写入。
- 增加 APIMart、RunningHub、Agnes 图片、Agnes 视频和即梦 CLI 配置入口。

### English

- Initial desktop manager build.
- Added local service management and Updream config writing.
- Added APIMart, RunningHub, Agnes image, Agnes video, and Jimeng CLI entries.
