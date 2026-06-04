# Updream Proxy Manager

Updream Proxy Manager is a Windows desktop manager for local Updream-compatible proxy services. It starts provider adapters, writes Updream API configuration automatically, and can launch a bundled Updream client.

## Features

- One-click start for local proxy services.
- Automatic Updream configuration writing.
- APIMart, RunningHub, Agnes image, and Agnes video adapter entries.
- Agnes video async-to-UpdreamGlobal compatibility proxy.
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

The manager expects proxy executables in `dist/` during development and bundles them through Electron Builder.

## Notes

- This project does not publish API keys, Updream user data, local databases, or local settings.
- Some bundled provider executables and the bundled Updream runtime may be distributed as release artifacts rather than source files.
- Respect each upstream provider's API terms and billing rules.
