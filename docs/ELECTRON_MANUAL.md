# Electron 使用与发布说明（Desktop Manual）

本项目支持以 Electron 打包为桌面应用（macOS / Windows / Linux）。

## 1. 入口与目录

- Electron 主进程：`electron/main.cjs`
- Preload：`electron/preload.cjs`
- electron-builder 配置：根 `package.json` 内的 `build` 字段

## 2. 开发

### 2.1 一键启动（推荐）

```powershell
pnpm desktop:dev
```

该命令会：

- 启动 Vite dev server（默认 `http://127.0.0.1:5173`）
- 启动 Electron，并加载 Vite dev server

因此前端改动会触发 Vite 的 HMR/刷新，桌面端也会同步看到变化。

### 2.2 pnpm 的 approve-builds

如你看到提示：`Ignored build scripts: electron, ...`，需要执行：

```powershell
pnpm approve-builds
```

在交互列表里允许 `electron` 等相关包执行脚本（主要用于下载 Electron 运行时）。

## 3. 打包

```powershell
pnpm desktop:dist
```

- 会先执行 `pnpm build` 产出 Web 静态文件到 `dist/`
- 再用 electron-builder 进行打包

输出目录：`dist-desktop/`

## 4. 常见问题

### 4.1 Electron 打不开/白屏

- 确认开发时 Vite 已启动：`pnpm desktop:dev`
- 确认端口是否被占用（默认 5173）
- 生产包白屏请检查是否存在 `dist/index.html`（先跑 `pnpm build`）

### 4.2 macOS 打包需要签名吗？

本项目默认不做签名配置。若要正式分发给 macOS 用户，需要补充 Apple Developer 相关签名与公证流程（可后续再加）。

