// 数据备份设置卡：立即备份、从服务器恢复、导入导出（由 Settings.tsx 抽出，逻辑不变）
import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../../api';
import { confirmAction, Modal } from '../../ui';
import { Feedback } from './Feedback';
import type { ServerBackupFile, ServerBackupStatus, SystemAuditEntry } from '../../types';
import { Download, FileDown, FileUp, RefreshCw, RotateCcw, Trash2 } from 'lucide-react';

export function BackupRestoreDialog({ onClose, onRestored }: { onClose(): void; onRestored(status: ServerBackupStatus, message: string): void | Promise<void> }) {
  const [files, setFiles] = useState<ServerBackupFile[]>([]); const [selected, setSelected] = useState(''); const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [deletingName, setDeletingName] = useState(''); const [error, setError] = useState('');
  const loadFiles = useCallback(async () => { const items = await api.serverBackups(); setFiles(items); setSelected(prev => prev && items.find(i => i.name === prev)?.name || items[0]?.name || ''); }, []);
  useEffect(() => { loadFiles().catch(err => setError(err instanceof Error ? err.message : '无法读取服务器备份')).finally(() => setLoading(false)); }, [loadFiles]);
  const formatSize = (size: number) => size < 1024 * 1024 ? `${Math.max(1, Math.round(size / 1024))} KB` : `${(size / 1024 / 1024).toFixed(1)} MB`;
  async function restore() {
    const file = files.find(item => item.name === selected); if (!file) return;
    const time = new Date(file.createdAt).toLocaleString('zh-CN', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
    if (!await confirmAction({ title: `恢复 ${time} 的服务器备份？`, description: '当前宝宝资料、记录和操作历史会被完整替换；恢复前会自动备份当前数据。', confirmLabel: '完整恢复', danger: true })) return;
    setBusy(true); setError('');
    try { const result = await api.restoreServerBackup(file.name); await onRestored(result.status, `已恢复 ${time} 的服务器备份，共 ${result.imported} 条记录`); onClose(); }
    catch (err) { setError(err instanceof Error ? err.message : '服务器备份恢复失败'); setBusy(false); }
  }
  async function removeBackup(name: string) {
    const file = files.find(item => item.name === name); if (!file) return;
    const time = new Date(file.createdAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
    if (!await confirmAction({ title: `删除 ${time} 的备份？`, description: '删除后无法恢复，服务器将基于保留策略管理剩余备份。', confirmLabel: '删除', danger: true })) return;
    setDeletingName(name); setError('');
    try { await api.deleteServerBackup(name); await loadFiles(); }
    catch (err) { setError(err instanceof Error ? err.message : '删除失败'); }
    finally { setDeletingName(''); }
  }
  return <Modal className="backup-restore-dialog" title="选择服务器备份" kicker="完整替换恢复" onClose={onClose} busy={busy}>
    <p className="dialog-description">恢复前会自动备份当前数据。恢复后，宝宝资料、记录和操作历史将与所选备份完全一致。</p>
    {loading && <p className="loading-copy">正在读取备份…</p>}{!loading && !files.length && <div className="empty-state compact"><h3>暂无服务器备份</h3><p>请先返回并立即备份一次。</p></div>}
    <div className="backup-file-list" role="radiogroup" aria-label="服务器备份">{files.map(file => <div key={file.name} className={`backup-file-item ${selected === file.name ? 'selected' : ''}`}><button type="button" role="radio" aria-checked={selected === file.name} className="backup-file-select" onClick={() => setSelected(file.name)}><span className="backup-file-meta"><b>{new Date(file.createdAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}</b><small className={`backup-type-tag ${file.type}`}>{file.type === 'manual' ? '手动' : '自动'}</small><small>{formatSize(file.size)}</small></span><i aria-hidden="true" /></button><button type="button" className="backup-file-delete" disabled={busy || deletingName === file.name} onClick={event => { event.stopPropagation(); void removeBackup(file.name); }} aria-label={`删除 ${file.name}`} title="删除此备份">{deletingName === file.name ? '…' : '×'}</button></div>)}</div>
    <Feedback message={error} type="error" onClose={() => setError('')} /><footer className="editor-actions"><button className="btn secondary" disabled={busy} onClick={onClose}>取消</button><button className="btn danger-button" disabled={busy || !selected} onClick={restore}>{busy ? '恢复中…' : '确认完整恢复'}</button></footer>
  </Modal>;
}

export function ImportModeDialog({ onClose, onConfirm, busy }: { onClose(): void; onConfirm(mode: 'replace' | 'merge'): Promise<void> | void; busy: boolean }) {
  const [mode, setMode] = useState<'replace' | 'merge'>('merge');
  async function handleConfirm() {
    await onConfirm(mode);
  }
  return <Modal title="导入备份文件" kicker="选择导入方式" onClose={onClose} busy={busy}>
    <fieldset className="import-mode-group">
      <button type="button" className={`import-mode-option ${mode === 'replace' ? 'selected' : ''}`} onClick={() => setMode('replace')}>
        <span className="import-mode-radio">{mode === 'replace' ? '●' : '○'}</span>
        <div className="import-mode-content">
          <b>全量替换</b>
          <p>清除当前所有数据，完整恢复备份内容。当前宝宝资料、记录和操作历史将被覆盖。</p>
        </div>
      </button>
      <button type="button" className={`import-mode-option ${mode === 'merge' ? 'selected' : ''}`} onClick={() => setMode('merge')}>
        <span className="import-mode-radio">{mode === 'merge' ? '●' : '○'}</span>
        <div className="import-mode-content">
          <b>增量合并</b>
          <p>保留现有数据，合并备份中的记录。已存在的记录会被备份版本覆盖，备份中没有的记录会保留。</p>
        </div>
      </button>
    </fieldset>
    <footer className="editor-actions"><button className="btn secondary" disabled={busy} onClick={onClose}>取消</button><button className={`btn ${mode === 'replace' ? 'danger-button' : 'primary'}`} disabled={busy} onClick={handleConfirm}>{busy ? '导入中…' : '确认导入'}</button></footer>
  </Modal>;
}

export function ServerBackupCard({ onImported }: { onImported(): void | Promise<void> }) {
  const [status, setStatus] = useState<ServerBackupStatus | null>(null); const [busy, setBusy] = useState<'backup' | 'import' | 'export' | ''>(''); const [message, setMessage] = useState(''); const [showRestore, setShowRestore] = useState(false); const [pendingFile, setPendingFile] = useState<File | null>(null); const [showImportDialog, setShowImportDialog] = useState(false);
  const [auditLog, setAuditLog] = useState<SystemAuditEntry[]>([]); const [auditLoading, setAuditLoading] = useState(false);
  const loadStatus = useCallback(async () => { const next = await api.backupStatus(); setStatus(next); }, []);
  const loadAuditLog = useCallback(async () => { setAuditLoading(true); try { const entries = await api.systemAudit(20); setAuditLog(entries); } catch { /* ignore */ } finally { setAuditLoading(false); } }, []);
  useEffect(() => { loadStatus().catch(() => setMessage('暂时无法读取服务器备份状态')); loadAuditLog(); }, [loadStatus, loadAuditLog]);
  const formatTime = (value: string | null) => value ? new Date(value).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) : '等待首次备份';
  async function createBackup() {
    setBusy('backup'); setMessage('');
    try { const result = await api.createServerBackup(); setStatus(result.status); setMessage(`服务器备份已完成：${result.name}`); loadAuditLog(); }
    catch (error) { setMessage(error instanceof Error ? error.message : '服务器备份失败'); }
    finally { setBusy(''); }
  }
  function selectFile(file?: File) {
    if (!file) return;
    setPendingFile(file);
    setShowImportDialog(true);
  }
  async function confirmImport(mode: 'replace' | 'merge') {
    if (!pendingFile) return;
    setShowImportDialog(false);
    setBusy('import'); setMessage('');
    try { const result = await api.importData(JSON.parse(await pendingFile.text()), mode); await loadStatus(); await onImported(); const modeLabel = mode === 'replace' ? '全量替换' : '增量合并'; setMessage(`${modeLabel}完成：${result.imported} 条记录${result.profileRestored ? '，宝宝资料已恢复' : ''}`); loadAuditLog(); }
    catch (error) { setMessage(error instanceof Error ? error.message : '导入失败，请选择本应用导出的备份文件'); }
    finally { setBusy(''); setPendingFile(null); }
  }
  return <><section className="settings-card backup-card"><div className="setting-status"><h2>备份状态与恢复</h2><span className="on">每 6 小时</span></div>
    <p>自动保存完整照护数据，最多保留最近 {status?.retention ?? 30} 份。可选择服务器备份进行完整恢复，操作前会先保存当前数据。</p>
    <div className="backup-summary"><div><span>最近备份</span><b>{formatTime(status?.lastBackupAt ?? null)}</b></div><div><span>下次预计</span><b>{formatTime(status?.nextBackupAt ?? null)}</b></div><div><span>服务器备份</span><b>{status ? `${status.count} 份` : '读取中…'}</b></div><div><span>保存位置</span><b>{status?.directory ? '由服务器自动托管' : '服务器托管'}</b></div></div>
    <div className="backup-actions">
      <button className="btn primary full" disabled={Boolean(busy)} onClick={createBackup}>{busy === 'backup' ? '备份中…' : '立即备份到服务器'}</button>
      <button className="btn secondary full" disabled={Boolean(busy) || !status?.count} onClick={() => setShowRestore(true)}>从服务器恢复</button>
      <div className="backup-actions-divider" role="separator" aria-hidden="true" />
      <div className="backup-actions-row">
        <button className="btn secondary wide" disabled={Boolean(busy)} onClick={async () => { setBusy('export'); setMessage(''); try { const res = await fetch('/api/export', { credentials: 'same-origin' }); if (!res.ok) throw new ApiError((await res.json()).error || '导出失败', res.status); const blob = new Blob([await res.text()], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `babycare-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click(); URL.revokeObjectURL(url); setMessage('备份文件已下载'); loadAuditLog(); } catch (error) { setMessage(error instanceof Error ? error.message : '导出失败'); } finally { setBusy(''); } }}>{busy === 'export' ? '导出中…' : '下载备份文件'}</button>
        <label className={`btn secondary wide ${busy ? 'disabled' : ''}`}>导入备份文件<input className="sr-only" type="file" accept=".json" disabled={Boolean(busy)} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; selectFile(file); }} /></label>
      </div>
    </div>
    <div className="audit-log-section">
      <div className="audit-log-header"><h3>操作日志</h3><button type="button" className="audit-log-refresh" disabled={auditLoading} onClick={() => loadAuditLog()} aria-label="刷新日志">{auditLoading ? '…' : <RefreshCw size={14} />}</button></div>
      {auditLoading && !auditLog.length ? <p className="audit-log-loading">正在加载日志…</p> : !auditLog.length ? <p className="audit-log-empty">暂无操作记录</p> :
        <ul className="audit-log-list" role="list">
          {auditLog.map(entry => {
            const eventLabels: Record<string, { label: string; icon: typeof Download }> = {
              backup: { label: '服务器备份', icon: Download },
              restore: { label: '服务器恢复', icon: RotateCcw },
              export: { label: '导出文件', icon: FileDown },
              import: { label: '导入文件', icon: FileUp },
              delete_backup: { label: '删除备份', icon: Trash2 },
            };
            const actorLabels: Record<string, string> = { father: '爸爸', mother: '妈妈', grandfather: '爷爷', grandmother: '奶奶', legacy: '系统' };
            const conf = eventLabels[entry.eventType] ?? { label: entry.eventType, icon: Download };
            const Icon = conf.icon;
            const detailsText = (() => {
              if (!entry.details) return '';
              const d = entry.details;
              if (d.name) return String(d.name);
              if (d.imported) return `导入 ${d.imported} 条`;
              if (d.status) return String(d.status);
              return '';
            })();
            return <li key={entry.id} className={`audit-log-item ${entry.status === 'failure' ? 'failed' : ''}`}>
              <span className="audit-log-icon" aria-hidden="true"><Icon size={16} /></span>
              <div className="audit-log-info">
                <div className="audit-log-top"><b>{conf.label}</b><span className={`audit-log-status ${entry.status}`}>{entry.status === 'success' ? '成功' : '失败'}</span></div>
                <div className="audit-log-meta"><span>{actorLabels[entry.actor] ?? entry.actor}</span><time>{new Date(entry.occurredAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}</time></div>
                {detailsText && <p className="audit-log-details">{detailsText}</p>}
              </div>
            </li>;
          })}
        </ul>}
    </div>
    <Feedback message={message} type={message.includes('失败') || message.includes('无法') ? 'error' : 'success'} onClose={() => setMessage('')} />
  </section>{showRestore && <BackupRestoreDialog onClose={() => setShowRestore(false)} onRestored={async (nextStatus, nextMessage) => { setStatus(nextStatus); await onImported(); setMessage(nextMessage); loadAuditLog(); }} />}{showImportDialog && <ImportModeDialog onClose={() => { setShowImportDialog(false); setPendingFile(null); }} onConfirm={confirmImport} busy={busy === 'import'} />}</>;
}
