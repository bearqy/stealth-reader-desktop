# 在线版本更新

## 使用方式

- 在设置页或系统托盘选择「检查更新」。正式安装版默认启动 10 秒后检查一次，可以通过「启动时检查更新」关闭。
- 更新源固定为公开仓库 [bearqy/stealth-reader-desktop 的 Releases](https://github.com/bearqy/stealth-reader-desktop/releases)，只检查 latest 正式发布，忽略草稿/预发布，不降级。
- 界面显示当前版本、系统和架构、新版本说明与选中的安装包。发现更新后由用户选择下载，展示进度，支持取消、失败后重试。检查本身不会自动下载或退出程序。
- 下载流式写入本机用户数据目录下独立的 `updates/download-*` 目录，同时校验 GitHub 附件 `digest` 中的 SHA-256 和附件大小；不完整/校验失败/取消时清理本次临时目录。
- 安装前再次校验。Mac 下载后选择「重启并安装更新」，等待校验及预置完成后自动退出、替换并重新打开，不需要手动拖拽。开发模式允许检查和下载，禁止真正启动安装程序；自动启动检查也仅对正式安装版生效。

## 系统与安装行为

| 当前环境 | 安装包 | 操作 |
| --- | --- | --- |
| macOS Apple Silicon | arm64 DMG，缺失时可用 universal DMG | 用户确认「重启并安装更新」后，自动校验、替换应用并重新打开 |
| macOS Intel | x64 DMG，缺失时可用 universal DMG | 同上 |
| Windows x64 安装版 | x64 Setup EXE | 启动 NSIS 覆盖安装界面，退出旧程序，用户继续安装 |
| Windows x64 portable | x64 Portable EXE | 定位已校验文件，用户退出程序后手动替换旧文件 |
| Windows ARM64 | 仅接受 ARM64 包 | 暂无对应附件时提示，不冒充 x64 包 |

macOS 在 Rosetta 下运行时会识别底层 ARM64 架构并选择原生包。Mac 只替换已确认的当前 `.app`，不会改写原 TXT、书架、进度或设置；重启保留当前用户数据目录。安装版沿用现有 appId 和安装路径。

### Mac 自动替换流程

1. 对下载的 DMG 再次校验大小和 SHA-256，再验证镜像并只读挂载。
2. 确认当前应用真实路径、标识和版本；要求当前目录可写，不支持从磁盘映像、App Translocation 或符号链接运行的应用。不索取管理员密码。
3. 将新 `.app` 复制到当前应用父目录下唯一的 `.stealth-reader-update-<UUID>` 私有目录，验证新应用标识、目标版本、本机架构与 deep/strict 签名。已有 Developer ID 团队时，拒绝换成其他团队或无团队签名。
4. 卸载镜像，启动独立系统 shell 助手并等待其就绪，待本地状态写入后退出旧程序。助手只在旧主进程退出且安装目标 inode 没变时，将旧应用移作备份，再将新应用移入原路径。
5. 通过 `/usr/bin/open`（LaunchServices）启动新版，保留用户数据目录。新版主进程记录 PID，React 完成 bootstrap 后经受限 IPC 确认启动；45 秒内未确认则终止可明确识别的新进程并恢复旧应用。确认成功后清理此次旧应用备份。
6. 若准备期间失败，旧程序不退出，已校验的下载可重试；替换/启动失败时保留诊断日志和失败包，并在恢复的旧版中提示。日志位于同卷的本次私有更新目录，准备阶段的临时数据会安全清理。

这是应用内安装助手，并未接入 Squirrel.Mac。当前仍使用免费的 ad-hoc 签名，签名只提供完整性，GitHub HTTPS 与附件 SHA-256 也不等于 Apple Developer ID 发布者认证。不会重新签名下载包、移除 quarantine、关闭 Gatekeeper 或静默提升权限；系统安全提示仍可能需要手动允许，不能承诺所有受管理设备均可无人值守更新。

**迁移限制：**v0.1.5 及更早的已安装 Mac 更新器不会因服务端配置而获得此代码，需要最后手动安装一次包含本改动的新版。之后才可使用下载后的「重启并安装更新」。普通退出/重启不会偷偷执行缓存安装包，仍需用户明确确认。

## 发布约定

PR 会通过 `.github/workflows/packages.yml` 在 macOS arm64、macOS Intel 和 Windows x64 原生 runner 上执行测试与构建，生成安装包附件，并核对包内版本及 `out` 内容与当前源码构建完全一致。未合并的候选包应先发布为 prerelease，不进入正式客户端的 latest 更新通道。

1. 递增 `package.json` 和锁文件中的版本号（正式版本 `x.y.z`），构建对应平台/架构。
2. 保持安装包命名规则：`StealthReader-<version>-<os>-<arch>[-<type>].<ext>`（已配置在 electron-builder）：
   - `StealthReader-<version>-macos-arm64.dmg`
   - `StealthReader-<version>-macos-x64.dmg`
   - 可选 `StealthReader-<version>-macos-universal.dmg`
   - `StealthReader-<version>-windows-x64-setup.exe`
   - `StealthReader-<version>-windows-x64-portable.exe`
3. 将所有目标平台附件上传到同一个 Release，再发布为 latest 正式版本；客户端按自己的平台选取，不需要维护 `latest.yml`。
4. 检查 GitHub API 返回附件状态 `uploaded`、正确字节数以及 `sha256:<64 位摘要>` 的 `digest`。缺少摘要时仅提供发布页入口，不允许应用内下载和交接。
5. 在 macOS 和 Windows 正式包中验证升级。旧的 `0.1.1` 不含更新入口，需要先手动安装一次带更新功能的新版。

### 旧版更新兼容

原始 `0.1.2` 更新器仅识别旧文件名。CI 的 `create-update-aliases.cjs` 会将标准安装包按原名复制到产物的 `update-compat/`，内容与 SHA-256 完全相同。后续发布新版本时，必须把此目录中的兼容附件一起上传到同一个 Release，供原始 0.1.2 客户端升级；无需重建或修改安装包。兼容附件可标注「旧版升级兼容」，下载说明优先展示标准名称。

新版更新器优先匹配标准名，同时接受历史名。维护者操作现有附件时应只更改 `name`，清除会遮住文件名的自定义 label，并同步更新 SHA256SUMS.txt、BUILD_INFO.json 和 Release 下载说明；不要重建同版本安装包来实现改名。

开发、发布时使用维护者本机 GitHub CLI 已登录凭证；分发客户端只读取公开发布信息，不依赖 CLI、不内置 Token。仓库若改成私有，匿名客户端会报告找不到公开 Release，需要另设公开发布仓库。

## 当前限制

- 不支持断点续传、差分更新和后台静默安装，取消后重新下载。
- 单个安装包最大 1GB；网络检查超时 20 秒，下载总时限 30 分钟。
- 不改变 GitHub 域名或设置不受控镜像；网络失败可重试或打开官方 Release 页面。
- 已下载成功的包保留在用户数据缓存目录，应用重启后不会自动执行缓存中的安装包。
- SHA-256 校验是附件完整性校验，不替代发布者签名和操作系统安全校验。
- 断电或强制终止安装助手不能保证自动回滚；若恰好发生在替换窗口，可从此次 `.stealth-reader-update-<UUID>/previous.app` 恢复备份，或重新下载安装，不要删除用户数据目录。

## 更新安装回归验证

- `npm test`：包括版本匹配、下载及安装状态机、握手 token、元数据/签名/架构拒绝，以及 Mac 原生签名小应用的替换、回滚和目标变更保护。Mac 专用用例在其他系统跳过。
- `npm run build && npm run test:mac-update`：在私有临时目录创建两份隔离 Electron 应用与签名 DMG，实际替换、重启并等待 React/preload 启动确认；验证字号、字体、字距、主题、书架、书签和原 TXT 保留。
- 测试只启动/终止其自身的应用副本，不覆盖 `/Applications`，不读写正常用户配置，也不改变系统安全策略。ARM64/Intel 发布 CI 均执行真实 Electron 更新回归；最终分发包仍执行 DMG 签名/启动验证。

参考：[GitHub Releases API](https://docs.github.com/en/rest/releases/releases#get-the-latest-release)、[GitHub 附件 API](https://docs.github.com/en/rest/releases/assets#get-a-release-asset)、[Electron macOS 自动更新签名要求](https://www.electronjs.org/docs/latest/api/auto-updater#macos)。
