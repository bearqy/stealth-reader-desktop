# 在线版本更新

## 使用方式

- 在设置页或系统托盘选择「检查更新」。正式安装版默认启动 10 秒后检查一次，可以通过「启动时检查更新」关闭。
- 更新源固定为公开仓库 [bearqy/stealth-reader-desktop 的 Releases](https://github.com/bearqy/stealth-reader-desktop/releases)，只检查 latest 正式发布，忽略草稿/预发布，不降级。
- 界面显示当前版本、系统和架构、新版本说明与选中的安装包。发现更新后由用户选择下载，展示进度，支持取消、失败后重试。检查本身不会自动下载或退出程序。
- 下载流式写入本机用户数据目录下独立的 `updates/download-*` 目录，同时校验 GitHub 附件 `digest` 中的 SHA-256 和附件大小；不完整/校验失败/取消时清理本次临时目录。
- 打开安装包前再次校验。开发模式允许检查和下载，禁止真正启动安装程序；自动启动检查也仅对正式安装版生效。

## 系统与安装行为

| 当前环境 | 安装包 | 操作 |
| --- | --- | --- |
| macOS Apple Silicon | arm64 DMG，缺失时可用 universal DMG | 打开已校验 DMG，退出旧程序，用户将应用拖入「应用程序」覆盖 |
| macOS Intel | x64 DMG，缺失时可用 universal DMG | 同上 |
| Windows x64 安装版 | x64 Setup EXE | 启动 NSIS 覆盖安装界面，退出旧程序，用户继续安装 |
| Windows x64 portable | x64 Portable EXE | 定位已校验文件，用户退出程序后手动替换旧文件 |
| Windows ARM64 | 仅接受 ARM64 包 | 暂无对应附件时提示，不冒充 x64 包 |

macOS 在 Rosetta 下运行时会识别底层 ARM64 架构并选择原生包。当前安装流程不自动修改或删除旧安装目录，也不删除书架、进度和用户设置。安装版沿用现有 appId，覆盖安装时应保持原安装路径。

当前 macOS 尚未使用 Apple Developer ID 签名/公证，不能使用要求签名的 Squirrel 原位自动替换。当前提供在线下载和 DMG 安装交接，不承诺静默升级。后续引入签名版本后再接入带验签的重启安装机制。不要通过移除签名校验或自动删除隔离属性实现更新。

## 发布约定

PR 会通过 `.github/workflows/packages.yml` 在 macOS arm64、macOS Intel 和 Windows x64 原生 runner 上执行测试与构建，生成安装包附件，并核对包内版本及 `out` 内容与当前源码构建完全一致。未合并的候选包应先发布为 prerelease，不进入正式客户端的 latest 更新通道。

1. 递增 `package.json` 和锁文件中的版本号（正式版本 `x.y.z`），构建对应平台/架构。
2. 保持安装包命名规则（已配置在 electron-builder）：
   - `Stealth-Reader-<version>-arm64.dmg`
   - `Stealth-Reader-<version>-x64.dmg`
   - 可选 `Stealth-Reader-<version>-universal.dmg`
   - `Stealth-Reader-Setup-<version>-x64.exe`
   - `Stealth-Reader-Portable-<version>-x64.exe`
3. 将所有目标平台附件上传到同一个 Release，再发布为 latest 正式版本；客户端按自己的平台选取，不需要维护 `latest.yml`。
4. 检查 GitHub API 返回附件状态 `uploaded`、正确字节数以及 `sha256:<64 位摘要>` 的 `digest`。缺少摘要时仅提供发布页入口，不允许应用内下载和交接。
5. 在 macOS 和 Windows 正式包中验证升级。旧的 `0.1.1` 不含更新入口，需要先手动安装一次带更新功能的新版。

开发、发布时使用维护者本机 GitHub CLI 已登录凭证；分发客户端只读取公开发布信息，不依赖 CLI、不内置 Token。仓库若改成私有，匿名客户端会报告找不到公开 Release，需要另设公开发布仓库。

## 当前限制

- 不支持断点续传、差分更新和后台静默安装，取消后重新下载。
- 单个安装包最大 1GB；网络检查超时 20 秒，下载总时限 30 分钟。
- 不改变 GitHub 域名或设置不受控镜像；网络失败可重试或打开官方 Release 页面。
- 已下载成功的包保留在用户数据缓存目录，应用重启后不会自动执行缓存中的安装包。
- SHA-256 校验是附件完整性校验，不替代发布者签名和操作系统安全校验。

参考：[GitHub Releases API](https://docs.github.com/en/rest/releases/releases#get-the-latest-release)、[GitHub 附件 API](https://docs.github.com/en/rest/releases/assets#get-a-release-asset)、[Electron macOS 自动更新签名要求](https://www.electronjs.org/docs/latest/api/auto-updater#macos)。
