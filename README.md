# Stealth Reader Desktop

一个面向 macOS 与 Windows 的低干扰桌面阅读与网页浏览工具。项目目标是提供透明、置顶、快速隐藏、多标签网页浏览与本地电子书阅读能力，并以原创品牌和交互实现同类产品体验。

> 当前阶段：本地 MVP 开发。账号、会员和远程后端暂不进入范围。

## 当前可运行能力

- Electron 安全进程边界：主进程、受限 preload、React 应用界面和不可信网页标签相互隔离。
- Chromium 多标签浏览、地址输入/搜索、前进、后退、刷新和新窗口拦截。
- 窗口置顶、35%–100% 透明度、托盘、最小化和全局老板键。
- 鼠标离开后收起网页工具栏，从顶部细条恢复。
- TXT 文件导入、UTF-8/UTF-16/GB18030 识别、本地书架、全文搜索和阅读进度。
- 字号、行距和三种阅读主题，设置仅保存在本机。
- macOS arm64 实际启动验证；生产构建和自动化测试已建立。

当前实现状态和后续缺口见 [MVP 状态](docs/MVP_STATUS.md)。

## 本地运行

要求 Node.js 22.12 或更高版本。

```bash
npm install
npm run dev
```

Electron 运行时下载较慢时，可以显式使用镜像：

```bash
ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ npm run install:electron
```

验证命令：

```bash
npm run typecheck
npm test
npm run build
```

## 产品定位

- **桌面优先**：macOS 优先验证，同时保持 Windows 可交付。
- **本地优先**：第一阶段不依赖账号、云服务或会员系统。
- **隐私优先**：用户网页会话、书籍和阅读记录默认只保存在本机。
- **安全隔离**：访问任意网页时，不向网页暴露 Node.js 或桌面系统权限。
- **原创实现**：借鉴通用产品能力，但不复制第三方名称、商标、素材、私有代码或像素级界面。

## 第一阶段目标

- 多标签网页浏览、地址输入、前进后退、刷新、历史与收藏。
- 窗口置顶、透明度调节、迷你模式、鼠标移出隐藏。
- 可配置的全局老板键，以及托盘快速显示、隐藏和退出。
- TXT、EPUB、PDF 阅读；支持书架、目录、搜索和阅读进度。
- macOS Apple Silicon、macOS Intel 和 Windows 安装包。
- 本地设置导入导出，不包含账号、支付和云同步。

## 文档

- [产品需求](docs/PRODUCT_REQUIREMENTS.md)
- [技术架构](docs/ARCHITECTURE.md)
- [安全与隐私](docs/SECURITY_PRIVACY.md)
- [开发规范](docs/DEVELOPMENT.md)
- [交付路线图](docs/ROADMAP.md)
- [MVP 状态](docs/MVP_STATUS.md)
- [技术决策：Electron](docs/decisions/0001-electron-desktop-runtime.md)

## 当前不做

- 会员、支付、邀请和营销体系。
- 云同步、团队协作、社区和写作功能。
- Chrome 扩展商店的无差别兼容。
- 绕过网站验证码、DRM、付费墙或安全策略。
- 对第三方产品进行反编译或资源复制。

## 暂定技术栈

- Electron
- TypeScript
- React
- Vite
- SQLite
- Vitest / Playwright

技术选型依据见 [ADR-0001](docs/decisions/0001-electron-desktop-runtime.md)。

## 仓库状态

本仓库计划保持私有。进入开发阶段前，需要完成产品范围确认、威胁模型评审和里程碑拆分。
