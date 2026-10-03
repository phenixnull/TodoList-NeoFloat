import { RefreshCcw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useStore } from '../data/store';

const CACHE_KEY = 'habitpulse.desktop.cache.v1';

export default function SettingsPage() {
  const store = useStore();
  const [urlInput, setUrlInput] = useState('');
  const [message, setMessage] = useState('');
  const effective = urlInput || store.serverUrl;

  const saveUrl = () => {
    if (!urlInput.trim()) {
      setMessage('请输入服务地址');
      return;
    }
    store.setServerUrl(urlInput.trim());
    setUrlInput('');
    setMessage('地址已保存，正在重新连接...');
  };

  const clearCache = () => {
    localStorage.removeItem(CACHE_KEY);
    setMessage('本地缓存已清除');
  };

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <h2 className="text-xl font-black text-slate-100">设置</h2>

      <div className="glass p-5">
        <h3 className="text-sm font-extrabold text-slate-100">服务连接</h3>
        <p className="mt-1 text-xs text-slate-500">
          桌面端通过 HabitPulse 同步服务与手机端共享数据，本机默认 http://127.0.0.1:8787
        </p>

        <div className="mt-4 flex items-center gap-2">
          <input
            className="input font-mono"
            value={effective}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="http://127.0.0.1:8787"
          />
          <button className="btn-ghost shrink-0" onClick={saveUrl}>
            保存
          </button>
          <button
            className="btn-accent shrink-0"
            onClick={() => {
              void store.refresh();
              setMessage('正在同步...');
            }}
          >
            <RefreshCcw size={14} /> 立即同步
          </button>
        </div>

        <div className="mt-4 flex items-center gap-2 text-xs">
          <span
            className={`h-2 w-2 rounded-full ${
              store.online ? 'bg-emerald-400' : 'bg-rose-400'
            }`}
          />
          <span className="text-slate-400">
            {store.online
              ? `已连接${store.lastSyncedAt ? ` · ${store.lastSyncedAt.toLocaleTimeString('zh-CN')}` : ''}`
              : '无法连接服务，正在使用本地缓存'}
          </span>
        </div>
      </div>

      <div className="glass p-5">
        <h3 className="text-sm font-extrabold text-slate-100">本地数据</h3>
        <p className="mt-1 text-xs text-slate-500">缓存用于离线时查看最近一次同步的数据</p>
        <button className="btn-danger mt-4" onClick={clearCache}>
          <Trash2 size={14} /> 清除本地缓存
        </button>
      </div>

      <div className="glass p-5">
        <h3 className="text-sm font-extrabold text-slate-100">关于</h3>
        <p className="mt-2 text-xs leading-5 text-slate-400">
          HabitPulse Desktop v1.0.0 · 习惯打卡 / 计时 / 统计 / 数据管理
          <br />
          与手机端共用同一套数据服务，打卡记录实时互通。
        </p>
      </div>

      {message && <p className="text-sm font-medium text-cyan-300">{message}</p>}
    </div>
  );
}
