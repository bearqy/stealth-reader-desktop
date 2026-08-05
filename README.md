# Stealth Reader Desktop

一个面向 macOS 与 Windows 的低干扰桌面阅读与网页浏览工具。项目目标是提供透明、置顶、快速隐藏、多标签网页浏览与本地电子书阅读能力，并以原创品牌和交互实现同类产品体验。

> 当前阶段：产品与技术方案设计。尚未开始功能开发。

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
