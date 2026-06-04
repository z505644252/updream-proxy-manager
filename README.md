# Updream Proxy Manager

中文 | [English](#english)

Updream Proxy Manager 是一个 Windows 桌面管理器，用来启动本地 Updream 兼容代理服务、自动写入 Updream 接口配置，并可一键打开内置 Updream 客户端。

## 功能

- 一键启动本地代理服务。
- 自动写入 Updream API 配置。
- 内置 APIMart、RunningHub、Agnes 图片、Agnes 视频等代理配置入口。
- Agnes 视频异步接口适配 UpdreamGlobal 同步/轮询流程。
- 内置即梦/Jimeng CLI 安装和登录辅助。
- 端口冲突处理，可选择自动换端口或结束占用进程。
- 可一键打开内置 Updream 程序。

## 支持的服务

| 服务 | 默认端口 | Updream 协议类型 | 生成类型 | Endpoint ID |
| --- | ---: | --- | --- | --- |
| APIMart 图片代理 | 8787 | openai | image | gpt-image-2 |
| RunningHub 图片代理 | 8788 | openai | image | rhart-image-g-2-text-to-image / rhart-image-g-2-image-to-image |
| Agnes 图片代理 | 8789 | openai | image | agnes-image-2.1-flash |
| Agnes 视频代理 | 8790 | updream-global | video | agnes-video-v2.0 |
| 即梦 CLI 2.0 | CLI | jimeng | video | seedance2.0 |
| 即梦 CLI 2.0 fast | CLI | jimeng | video | seedance2.0fast |
| 即梦 CLI 2.0 fast VIP | CLI | jimeng | video | seedance2.0fast_vip |
| 即梦 CLI 2.0 VIP | CLI | jimeng | video | seedance2.0_vip |

## 使用方式

1. 从 GitHub Releases 下载最新安装包。
2. 安装并打开 `Updream Proxy Manager`。
3. 在管理器里填写需要使用的上游 API Key。
4. 启动指定服务，或点击全部启动。
5. 点击配置/打开 Updream，管理器会自动写入 Updream 接口配置。

API Key 只保存在本机管理器数据目录中，不会提交到本仓库。

## 开发构建

环境要求：

- Windows
- Node.js
- Python 3.10+
- PyInstaller

安装 Electron 依赖：

```powershell
cd electron-launcher
npm install
```

构建 Python 代理程序：

```powershell
pyinstaller --onefile --noconsole --clean --name agnes_sync_proxy agnes_sync_proxy.py
pyinstaller --onefile --noconsole --clean --name agnes_video_proxy agnes_video_proxy.py
```

构建 Windows 安装包：

```powershell
cd electron-launcher
npm run build
```

开发环境下，管理器会从项目根目录的 `dist/` 读取代理 exe；正式打包时通过 Electron Builder 将代理程序打进安装包资源目录。

## 注意事项

- 本项目不会发布 API Key、Updream 用户数据、本地数据库或本地配置。
- 部分第三方/上游程序运行文件可能只作为 Release 附件分发，不一定包含在源码仓库中。
- 请遵守各上游服务商的 API 使用条款和计费规则。

## English

Updream Proxy Manager is a Windows desktop manager for local Updream-compatible proxy services. It starts provider adapters, writes Updream API configuration automatically, and can launch a bundled Updream client.

## Features

- One-click start for local proxy services.
- Automatic Updream configuration writing.
- APIMart, RunningHub, Agnes image, and Agnes video adapter entries.
- Agnes video async API adaptation for the UpdreamGlobal polling flow.
- Built-in Dreamina/Jimeng CLI install and login helpers.
- Port conflict handling with options to switch ports or stop the occupying process.
- Optional bundled Updream executable launch.

## Supported Local Services

| Service | Default port | Updream provider | Generation type | Endpoint ID |
| --- | ---: | --- | --- | --- |
| APIMart image proxy | 8787 | openai | image | gpt-image-2 |
| RunningHub image proxy | 8788 | openai | image | rhart-image-g-2-text-to-image / rhart-image-g-2-image-to-image |
| Agnes image proxy | 8789 | openai | image | agnes-image-2.1-flash |
| Agnes video proxy | 8790 | updream-global | video | agnes-video-v2.0 |
| Jimeng CLI 2.0 | CLI | jimeng | video | seedance2.0 |
| Jimeng CLI 2.0 fast | CLI | jimeng | video | seedance2.0fast |
| Jimeng CLI 2.0 fast VIP | CLI | jimeng | video | seedance2.0fast_vip |
| Jimeng CLI 2.0 VIP | CLI | jimeng | video | seedance2.0_vip |

## Usage

1. Download the latest installer from GitHub Releases.
2. Install and open `Updream Proxy Manager`.
3. Fill the API keys for the providers you want to use.
4. Start selected services or start all services.
5. Click the configure/open Updream action to write the API configs.

API keys are stored locally in the manager's app data directory. They are not included in this repository.

## Development

Requirements:

- Windows
- Node.js
- Python 3.10+
- PyInstaller

Install Electron dependencies:

```powershell
cd electron-launcher
npm install
```

Build Python proxy executables:

```powershell
pyinstaller --onefile --noconsole --clean --name agnes_sync_proxy agnes_sync_proxy.py
pyinstaller --onefile --noconsole --clean --name agnes_video_proxy agnes_video_proxy.py
```

Build the Windows installer:

```powershell
cd electron-launcher
npm run build
```

The manager expects proxy executables in `dist/` during development and bundles them through Electron Builder for production builds.

## Notes

- This project does not publish API keys, Updream user data, local databases, or local settings.
- Some third-party/upstream runtime files may be distributed as release artifacts rather than source files.
- Respect each upstream provider's API terms and billing rules.
