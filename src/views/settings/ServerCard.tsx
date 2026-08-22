import { useState } from 'react';
import { Check, Globe, Monitor, RefreshCw, Server, Settings } from 'lucide-react';
import {
  getCustomUrl,
  setCustomUrl,
  setStoredMode,
  type ServerMode,
} from '../../config/servers';
import { useAutoConnect } from '../../hooks/useAutoConnect';

interface Props {
  connection: ReturnType<typeof useAutoConnect>;
}

export function ServerSettingsCard({ connection }: Props) {
  const [customUrlInput, setCustomUrlInput] = useState(getCustomUrl());
  const [testing, setTesting] = useState(false);

  const modes: { value: ServerMode; label: string; description: string; icon: typeof Server }[] = [
    { value: 'auto', label: '自动选择', description: '优先连接上次成功的服务器，失败后自动切换', icon: RefreshCw },
    { value: 'lan', label: '仅局域网', description: '只连接局域网服务器，适合家庭或办公网络', icon: Monitor },
    { value: 'wan', label: '仅外网', description: '只连接外网服务器，适合移动网络', icon: Globe },
    { value: 'custom', label: '自定义地址', description: '输入自定义的服务器地址', icon: Settings },
  ];

  async function handleModeChange(mode: ServerMode) {
    await connection.setMode(mode);
  }

  async function handleSaveCustomUrl() {
    const url = customUrlInput.trim();
    if (!url) return;
    setCustomUrl(url);
    setStoredMode('custom');
    await connection.setMode('custom');
  }

  async function handleReconnect() {
    setTesting(true);
    await connection.reconnect();
    setTesting(false);
  }

  return (
    <section className="settings-card">
      <p className="kicker">连接设置</p>
      <h2>服务器连接</h2>
      <p className="settings-description">
        当前状态：{connection.status === 'connected' && connection.currentServer
          ? `已连接到 ${connection.currentServer.name}`
          : connection.status === 'failed'
          ? '连接失败'
          : '正在连接…'}
      </p>

      <div className="server-status-bar">
        <div className={`status-indicator ${connection.status}`} />
        <span className="status-text">
          {connection.status === 'connected'
            ? connection.currentServer?.url
            : connection.status === 'failed'
            ? '无法连接，请检查网络或切换服务器'
            : '正在检测连接…'}
        </span>
        <button
          type="button"
          className="btn secondary small"
          onClick={handleReconnect}
          disabled={testing}
        >
          <RefreshCw size={14} className={testing ? 'spinning' : ''} />
          {testing ? '检测中' : '重新检测'}
        </button>
      </div>

      <div className="server-modes">
        {modes.map(mode => {
          const Icon = mode.icon;
          const selected = connection.mode === mode.value;
          return (
            <button
              key={mode.value}
              type="button"
              className={`server-mode-item${selected ? ' selected' : ''}`}
              onClick={() => handleModeChange(mode.value)}
            >
              <span className="mode-icon">
                <Icon size={18} />
              </span>
              <span className="mode-info">
                <b>{mode.label}</b>
                <small>{mode.description}</small>
              </span>
              {selected && <Check size={16} className="mode-check" />}
            </button>
          );
        })}
      </div>

      {connection.mode === 'custom' && (
        <div className="custom-url-section">
          <label htmlFor="custom-server-url">自定义服务器地址</label>
          <div className="custom-url-input-row">
            <input
              id="custom-server-url"
              type="url"
              value={customUrlInput}
              onChange={e => setCustomUrlInput(e.target.value)}
              placeholder="https://your-server.com"
              className="form-input"
            />
            <button
              type="button"
              className="btn primary"
              onClick={handleSaveCustomUrl}
              disabled={!customUrlInput.trim()}
            >
              保存并连接
            </button>
          </div>
          <p className="helper-text">
            输入完整的服务器地址，包括协议头（https://）。
          </p>
        </div>
      )}

      <div className="server-list-preview">
        <p className="kicker">可用服务器</p>
        <div className="server-list">
          {connection.servers.map(server => {
            const isCurrent = connection.currentServer?.id === server.id;
            return (
              <div
                key={server.id}
                className={`server-list-item${isCurrent ? ' current' : ''}`}
              >
                <span className="server-icon">
                  {server.type === 'lan' ? <Monitor size={16} /> : <Globe size={16} />}
                </span>
                <span className="server-name">{server.name}</span>
                <code className="server-url">{server.url}</code>
                {isCurrent && <span className="current-badge">当前</span>}
              </div>
            );
          })}
        </div>
      </div>

      <style>{`
        .server-status-bar {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px;
          background: var(--surface-subtle);
          border-radius: 8px;
          margin-top: 12px;
        }
        .status-indicator {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          flex-shrink: 0;
        }
        .status-indicator.connected { background: var(--green); }
        .status-indicator.failed { background: var(--red, #c85a3c); }
        .status-indicator.connecting { background: var(--muted); }
        .status-text {
          flex: 1;
          font-size: 13px;
          color: var(--text-secondary);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .server-modes {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-top: 16px;
        }
        .server-mode-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px;
          background: var(--surface-card);
          border: 1px solid var(--line);
          border-radius: 8px;
          cursor: pointer;
          text-align: left;
          transition: border-color .15s, background .15s;
        }
        .server-mode-item:hover {
          border-color: var(--line-strong);
        }
        .server-mode-item.selected {
          border-color: var(--green);
          background: var(--sage, #f0f7f0);
        }
        .mode-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 36px;
          height: 36px;
          border-radius: 8px;
          background: var(--surface-subtle);
          color: var(--text-secondary);
          flex-shrink: 0;
        }
        .server-mode-item.selected .mode-icon {
          background: var(--green);
          color: white;
        }
        .mode-info {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .mode-info b {
          font-size: 14px;
          color: var(--text);
        }
        .mode-info small {
          font-size: 12px;
          color: var(--text-tertiary);
        }
        .mode-check {
          color: var(--green);
        }
        .custom-url-section {
          margin-top: 16px;
          padding: 16px;
          background: var(--surface-subtle);
          border-radius: 8px;
        }
        .custom-url-section label {
          display: block;
          font-size: 13px;
          font-weight: 600;
          margin-bottom: 8px;
          color: var(--text);
        }
        .custom-url-input-row {
          display: flex;
          gap: 8px;
        }
        .custom-url-input-row .form-input {
          flex: 1;
        }
        .helper-text {
          font-size: 12px;
          color: var(--text-tertiary);
          margin-top: 8px;
          margin-bottom: 0;
        }
        .server-list-preview {
          margin-top: 16px;
        }
        .server-list {
          display: flex;
          flex-direction: column;
          gap: 6px;
          margin-top: 8px;
        }
        .server-list-item {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 12px;
          background: var(--surface-card);
          border: 1px solid var(--line);
          border-radius: 6px;
          font-size: 13px;
        }
        .server-list-item.current {
          border-color: var(--green);
          background: var(--sage, #f0f7f0);
        }
        .server-icon {
          color: var(--text-tertiary);
        }
        .server-name {
          font-weight: 600;
          color: var(--text);
        }
        .server-url {
          flex: 1;
          font-size: 12px;
          color: var(--text-tertiary);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-family: monospace;
        }
        .current-badge {
          font-size: 11px;
          font-weight: 600;
          color: var(--green);
          background: var(--sage, #f0f7f0);
          padding: 2px 6px;
          border-radius: 4px;
        }
        .spinning {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </section>
  );
}
