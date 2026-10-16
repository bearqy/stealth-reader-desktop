import { useState } from 'react'
import type { UpdateState } from '../../shared/contracts'

function megabytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function UpdatePanel({ state, onState }: {
  state: UpdateState
  onState: (state: UpdateState) => void
}): React.JSX.Element {
  const [error, setError] = useState<string | null>(null)
  const busy = ['checking', 'downloading', 'installing'].includes(state.status)
  const canDownload = Boolean(state.latest?.assetName) && ['available', 'error'].includes(state.status)

  const run = async (action: () => Promise<UpdateState | void>): Promise<void> => {
    setError(null)
    try {
      const next = await action()
      if (next) onState(next)
    } catch {
      setError('操作失败，请稍后重试。')
    }
  }

  return (
    <section className="setting-card update-panel" id="app-updates" aria-label="软件更新">
      <div className="update-heading">
        <div>
          <strong>软件更新</strong>
          <p>当前版本 v{state.currentVersion} · {state.system} {state.architecture}
            {state.packageType === 'portable' ? ' · 免安装版' : ''}</p>
        </div>
        <button className="secondary-button" type="button"
          disabled={busy || state.status === 'downloaded'}
          onClick={() => void run(() => window.stealthReader.updates.check())}>
          {state.status === 'checking' ? '检查中…' : '检查更新'}
        </button>
      </div>
      <p className={`update-message ${state.status === 'error' || error ? 'update-error' : ''}`} role="status">
        {error ?? state.message}
      </p>
      {state.status === 'downloading' && state.progress && (
        <div className="update-progress">
          <progress aria-label="更新下载进度" max={state.progress.total} value={state.progress.received} />
          <span>{state.progress.percent}% · {megabytes(state.progress.received)} / {megabytes(state.progress.total)}</span>
        </div>
      )}
      {state.latest && state.status !== 'up-to-date' && (
        <div className="update-release">
          <strong>{state.latest.title}</strong>
          {state.latest.assetName && (
            <p>{state.latest.assetName}{state.latest.size ? ` · ${megabytes(state.latest.size)}` : ''}</p>
          )}
          {state.latest.notes && <details><summary>更新内容</summary><pre>{state.latest.notes}</pre></details>}
        </div>
      )}
      <div className="update-actions">
        {canDownload && (
          <button className="primary-button" type="button"
            onClick={() => void run(() => window.stealthReader.updates.download())}>
            {state.status === 'error' ? '重新下载' : '下载更新'}
          </button>
        )}
        {state.status === 'downloading' && (
          <button className="secondary-button" type="button"
            onClick={() => void run(() => window.stealthReader.updates.cancel())}>取消下载</button>
        )}
        {state.status === 'downloaded' && (
          <button className="primary-button" type="button" disabled={!state.canInstall}
            onClick={() => void run(() => window.stealthReader.updates.install())}>
            {state.packageType === 'dmg' ? '打开安装包并退出'
              : state.packageType === 'portable' ? '打开安装包位置' : '安装更新并退出'}
          </button>
        )}
        <button className="text-button" type="button"
          onClick={() => void run(() => window.stealthReader.updates.openRelease())}>查看 GitHub Releases ↗</button>
      </div>
      {!state.canInstall && state.packageType && <p className="update-hint">开发模式可检查和下载，安装操作仅在正式安装版中启用。</p>}
      {state.checkedAt && <p className="update-hint">上次检查：{new Date(state.checkedAt).toLocaleString()}</p>}
    </section>
  )
}
