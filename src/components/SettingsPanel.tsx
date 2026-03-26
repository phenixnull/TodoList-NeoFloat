import { useEffect, useMemo, useState } from 'react'
import { FONT_OPTIONS } from '../store/useTaskStore'
import type { AppSettings } from '../types/domain'
import type { SyncConfig, SyncStatus } from '../types/sync'

type SettingsPanelProps = {
  settings: AppSettings
  onChange: (patch: Partial<AppSettings>) => void
  syncConfig: SyncConfig
  syncStatus: SyncStatus
  syncBusy: boolean
  onSaveSyncConfig: (config: SyncConfig) => Promise<void> | void
  onSyncNow: () => Promise<void> | void
}

function formatSyncMoment(value: string | null): string {
  if (!value) {
    return '未同步'
  }

  const date = new Date(value)
  const yyyy = String(date.getFullYear())
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const hh = String(date.getHours()).padStart(2, '0')
  const min = String(date.getMinutes()).padStart(2, '0')
  const ss = String(date.getSeconds()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`
}

function describeSyncStatus(status: SyncStatus): { tone: 'idle' | 'syncing' | 'error'; text: string } {
  if (status.phase === 'syncing') {
    return { tone: 'syncing', text: '同步中' }
  }

  if (status.phase === 'error') {
    return { tone: 'error', text: status.lastError ? `失败: ${status.lastError}` : '同步失败' }
  }

  if (!status.enabled) {
    return { tone: 'idle', text: '未启用' }
  }

  if (status.lastSyncAt) {
    return { tone: 'idle', text: `最近同步 ${formatSyncMoment(status.lastSyncAt)}` }
  }

  return { tone: 'idle', text: '等待首次同步' }
}

export function SettingsPanel({
  settings,
  onChange,
  syncConfig,
  syncStatus,
  syncBusy,
  onSaveSyncConfig,
  onSyncNow,
}: SettingsPanelProps) {
  const [now, setNow] = useState(() => new Date())
  const [syncForm, setSyncForm] = useState<SyncConfig>(syncConfig)

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date())
    }, 1000)

    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    setSyncForm(syncConfig)
  }, [syncConfig])

  const currentTime = useMemo(() => {
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    const hour = String(now.getHours()).padStart(2, '0')
    const minute = String(now.getMinutes()).padStart(2, '0')
    const second = String(now.getSeconds()).padStart(2, '0')

    return {
      date: `${year}年${month}月${day}日`,
      time: `${hour}:${minute}:${second}`,
    }
  }, [now])

  const syncSummary = useMemo(() => describeSyncStatus(syncStatus), [syncStatus])
  const canEnableSync = Boolean(syncForm.serverUrl.trim()) && Boolean(syncForm.token.trim())

  const handleSaveSync = async () => {
    await onSaveSyncConfig({
      ...syncForm,
      enabled: syncForm.enabled && canEnableSync,
    })
  }

  return (
    <section className="settings-panel">
      <h2>Settings</h2>

      <section className="current-time-card" aria-label="当前时间显示">
        <span className="current-time-date">{currentTime.date}</span>
        <strong className="current-time-main">{currentTime.time}</strong>
      </section>

      <section className="settings-section">
        <h3 className="settings-section-title">窗口与任务</h3>

        <label>
          透明度: {(settings.opacity * 100).toFixed(0)}%
          <input
            type="range"
            min={0.25}
            max={1}
            step={0.01}
            value={settings.opacity}
            onChange={(event) => onChange({ opacity: Number(event.target.value) })}
          />
        </label>

        <label className="toggle-row">
          <input
            type="checkbox"
            checked={settings.alwaysOnTop}
            onChange={(event) => onChange({ alwaysOnTop: event.target.checked })}
          />
          窗口常驻最前
        </label>

        <label className="toggle-row">
          <input
            type="checkbox"
            checked={settings.edgeAutoHide}
            onChange={(event) => onChange({ edgeAutoHide: event.target.checked })}
          />
          贴边自动伸缩
        </label>

        <label className="toggle-row">
          <input
            type="checkbox"
            checked={settings.autoLaunch}
            onChange={(event) => onChange({ autoLaunch: event.target.checked })}
          />
          开机自启动
        </label>

        <label className="toggle-row">
          <input
            type="checkbox"
            checked={settings.showArchived}
            onChange={(event) => onChange({ showArchived: event.target.checked })}
          />
          显示归档任务
        </label>

        <label>
          任务块模式
          <select
            value={settings.taskCardMode}
            onChange={(event) =>
              onChange({
                taskCardMode: event.target.value === 'collapsed' ? 'collapsed' : 'expanded',
              })
            }
          >
            <option value="expanded">展开（Start / Finished）</option>
            <option value="collapsed">折叠（图标紧凑）</option>
          </select>
        </label>

        <label>
          任务输入显示
          <select
            value={settings.taskContentDisplayMode}
            onChange={(event) =>
              onChange({
                taskContentDisplayMode: event.target.value === 'auto-height' ? 'auto-height' : 'inner-scroll',
              })
            }
          >
            <option value="inner-scroll">框内滚动显示</option>
            <option value="auto-height">任务块高度自适应</option>
          </select>
        </label>

        <label>
          未完成任务块配色
          <select
            value={settings.taskPaletteMode}
            onChange={(event) =>
              onChange({
                taskPaletteMode:
                  event.target.value === 'gray-gradient' || event.target.value === 'default-gray'
                    ? event.target.value
                    : 'auto-vivid',
              })
            }
          >
            <option value="auto-vivid">炫彩自动排色（当前机制）</option>
            <option value="default-gray">默认配色（灰色任务块）</option>
            <option value="gray-gradient">灰色渐变 + 白色粗边</option>
          </select>
        </label>

        <div className="defaults-grid">
          <label>
            全局字体
            <select
              value={settings.defaultFontFamily}
              onChange={(event) => onChange({ defaultFontFamily: event.target.value })}
            >
              {FONT_OPTIONS.map((font) => (
                <option key={font} value={font}>
                  {font}
                </option>
              ))}
            </select>
          </label>

          <label>
            全局字号
            <input
              type="number"
              min={12}
              max={36}
              step={1}
              value={settings.defaultFontSize}
              onChange={(event) => onChange({ defaultFontSize: Number(event.target.value) })}
            />
          </label>
        </div>
      </section>

      <section className="settings-section">
        <div className="settings-section-heading">
          <h3 className="settings-section-title">同步</h3>
          <span className={`sync-status-chip tone-${syncSummary.tone}`}>{syncSummary.text}</span>
        </div>

        <p className="settings-note">桌面端保留当前外观与行为，只把任务数据通过服务器做双端同步。</p>

        <label className="toggle-row">
          <input
            type="checkbox"
            checked={syncForm.enabled}
            onChange={(event) => setSyncForm((current) => ({ ...current, enabled: event.target.checked }))}
          />
          启用服务器同步
        </label>

        <label>
          服务器地址
          <input
            type="url"
            placeholder="https://example.com:8787"
            value={syncForm.serverUrl}
            onChange={(event) => setSyncForm((current) => ({ ...current, serverUrl: event.target.value }))}
          />
        </label>

        <label>
          Token
          <input
            type="password"
            placeholder="输入同步令牌"
            value={syncForm.token}
            onChange={(event) => setSyncForm((current) => ({ ...current, token: event.target.value }))}
          />
        </label>

        <p className="settings-note">Token 只保存在当前电脑本地的同步配置中，不会写进任务内容。</p>

        <div className="settings-actions">
          <button type="button" className="settings-primary-action" disabled={syncBusy} onClick={() => void handleSaveSync()}>
            {syncBusy ? '处理中...' : '保存配置'}
          </button>
          <button
            type="button"
            className="settings-secondary-action"
            disabled={syncBusy || !syncConfig.enabled}
            onClick={() => void onSyncNow()}
          >
            立即同步
          </button>
        </div>

        <div className="sync-meta-grid">
          <span>最近同步: {formatSyncMoment(syncStatus.lastSyncAt)}</span>
          <span>最近拉取: {formatSyncMoment(syncStatus.lastPullAt)}</span>
          <span>最近推送: {formatSyncMoment(syncStatus.lastPushAt)}</span>
        </div>

        {syncForm.enabled && !canEnableSync ? <p className="settings-note">要启用同步，服务器地址和 Token 都必须填写。</p> : null}
        {syncStatus.lastError ? <p className="settings-error-text">错误: {syncStatus.lastError}</p> : null}
      </section>
    </section>
  )
}
