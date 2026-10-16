# macOS 免费临时签名与验证

## 当前分发方式

当前没有 Apple Developer ID 证书和公证凭证。`build.mac.identity` 明确设为 `-`，由 electron-builder / @electron/osx-sign 对应用、Helper 和 Framework 完成免费的 ad-hoc 签名。`hardenedRuntime: false` 避免无 Team ID 的临时签名与 Electron Framework 的库验证冲突；不提交证书、不访问发布密钥、不进行公证。

ad-hoc 签名只提供代码完整性，不是苹果认证，也不会让 Gatekeeper 自动信任应用。互联网下载首次打开仍可能需要用户按 macOS「系统设置 → 隐私与安全性 → 仍要打开」操作；不能承诺所有受管理设备或安全策略都允许使用。不要自动移除 quarantine，也不要关闭系统全局安全检查。

## v0.1.2 原始安装包故障

原始发布包的 DMG 校验与 SHA-256 正确，但包内 `.app` 的 `codesign --verify --deep --strict` 报错：

```text
code has no resources but signature indicates they must be present
```

原生 CI 日志显示 PR 构建跳过了签名，留下 Electron 原始的 linker-signed 签名而没有完整的应用资源封印。这不是下载损坏，也不能仅靠重命名 DMG 修复。

流水线在 macOS 打包步骤设置 `CSC_FOR_PULL_REQUEST=true`，仅允许无证书 ad-hoc 签名；保留 `CSC_IDENTITY_AUTO_DISCOVERY=false`，没有导入任何私钥或 GitHub Actions 签名 secrets。以后接入正式签名时，必须使用独立的受保护发布流程，不得把凭证暴露给 PR。

## 必须通过的发布检查

```sh
npm test
npm run build
CSC_IDENTITY_AUTO_DISCOVERY=false CSC_FOR_PULL_REQUEST=true npx --no-install electron-builder --mac --arm64 --publish never
node scripts/verify-bundle.cjs 'release/mac-arm64/Stealth Reader.app/Contents/Resources/app.asar'
node scripts/verify-macos-dmg.cjs
```

Intel runner 使用 `--x64`，包内容路径为 `release/mac/Stealth Reader.app/Contents/Resources/app.asar`。验证脚本默认检查当前主机架构，也可显式传入 DMG 路径。

脚本对最终 DMG 校验、只读挂载、复制出应用，再进行 deep/strict 签名校验。使用临时独立用户目录启动真正的打包程序，通过仅本地调试端口确认 React 界面、preload 和 bootstrap IPC 可用，最后终止测试进程、卸载镜像并清理测试目录。它不修改正常用户数据或系统安全设置，也不证明公证/Gatekeeper 信任已通过。

ARM64 与 Intel 必须在各自原生 CI 上通过检查。ARM64 另做本机交互验证。发布时更新 `SHA256SUMS.txt`、`BUILD_INFO.json` 和 Release 说明，明确记录重新构建的提交；不能继续声称旧二进制未改变。Windows 安装包不受该修复影响。

参考：[electron-builder v26 macOS 签名配置](https://www.electron.build/v26/docs/mac/)、[Electron 签名说明](https://www.electronjs.org/docs/latest/tutorial/code-signing)、[Apple 安全打开应用说明](https://support.apple.com/en-au/102445)。
