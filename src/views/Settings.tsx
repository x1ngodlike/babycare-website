// 设置视图（由 App.tsx 抽出，React.lazy 按需加载）
import { createElement, useCallback, useEffect, useRef, useState } from 'react';
import { Baby, Bell, Bot, LogOut, Monitor, Pill, RefreshCw, Save, Send, Server, Syringe, Users } from 'lucide-react';
import { api, ApiError } from '../api';
import { isoDay } from '../date';
import { isCareItemDue, nextCareItemDueDate, careItemCourseRemaining, careItemCourseCompleted, getCareItemReminderTimes } from '../careSchedule';
import { cacheProfile } from '../offline';
import { ActionMenu, confirmAction, SegmentedControl, Switch, useDialogFocus } from '../ui';
import { DateField, TimeField } from '../DateField';
import { getNativeNotificationPermission, getNativeNotificationSettings, requestNativeNotificationPermission, saveNativeNotificationSettings, showNativeCategoryTestNotification, type NativeNotificationPermission, type NativeNotificationSettings, type NativeNotificationType } from '../native';
import { AvatarCropperModal } from '../AvatarCropper';
import { canManage, careItemIconSources, ChoiceField, familyMembers, roleNames, sexLabels, type ThemeMode } from '../shared';
import type { AiSettingsPublic, BabySex, Capabilities, CareItem, CareItemCategory, CareItemIcon, DraftVaccineCatalogItem, FamilyId, FamilyMemberPermission, Profile, PushStatus, ServerBackupFile, ServerBackupStatus, SessionUser, VaccineCatalogItem } from '../types';

function Feedback({ message, type, onClose }: { message: string; type: 'success' | 'error'; onClose?: () => void }) {
  const [displayMessage, setDisplayMessage] = useState(message);
  const [leaving, setLeaving] = useState(false);
  
  useEffect(() => {
    if (message) {
      setDisplayMessage(message);
      setLeaving(false);
      if (type === 'success') {
        const timer = setTimeout(() => {
          handleClose();
        }, 4000);
        return () => clearTimeout(timer);
      }
    } else if (displayMessage) {
      setLeaving(true);
      const timer = setTimeout(() => {
        setDisplayMessage('');
        setLeaving(false);
      }, 220);
      return () => clearTimeout(timer);
    }
  }, [message]);
  
  const handleClose = () => {
    setLeaving(true);
    setTimeout(() => {
      setDisplayMessage('');
      setLeaving(false);
      onClose?.();
    }, 220);
  };
  
  if (!displayMessage) return null;
  
  const className = `${type === 'success' ? 'success-text' : 'error-text'} ${leaving ? 'leaving' : 'show'}`;
  
  return (
    <p className={className} role={type === 'error' ? 'alert' : 'status'} onClick={handleClose}>
      <span>{displayMessage}</span>
      <button
        type="button"
        className="feedback-close"
        aria-label="关闭"
        onClick={e => { e.stopPropagation(); handleClose(); }}
      >×</button>
    </p>
  );
}

function ProfileSettingsCard({ profile, onSaved }: { profile: Profile; onSaved(value: Profile): void }) {
  const [form, setForm] = useState<Profile>({ ...profile, sex: profile.sex || 'unspecified', nickname: profile.nickname || '', caregiverTitle: profile.caregiverTitle || '妈妈', avatar: profile.avatar ?? null, birthTime: profile.birthTime || '' });
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [saved, setSaved] = useState('');
  const [cropperSrc, setCropperSrc] = useState<string | null>(null); const [avatarBusy, setAvatarBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => { setForm({ ...profile, sex: profile.sex || 'unspecified', nickname: profile.nickname || '', caregiverTitle: profile.caregiverTitle || '妈妈', avatar: profile.avatar ?? null, birthTime: profile.birthTime || '' }); setSaved(''); }, [profile]);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setSaved('');
    try { const next = await api.updateProfile({ name: form.name, birthDate: form.birthDate, birthTime: form.birthTime || undefined, sex: form.sex, nickname: form.nickname, caregiverTitle: form.caregiverTitle }); cacheProfile(next); onSaved(next); setSaved('宝宝资料已保存'); }
    catch (err) { setError(err instanceof Error ? err.message : '保存失败'); }
    finally { setBusy(false); }
  }
  function pickFile() { fileInputRef.current?.click(); }
  function onFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; if (!file) return;
    if (!file.type.startsWith('image/')) { setError('请选择图片文件'); return; }
    if (file.size > 8 * 1024 * 1024) { setError('图片不能大于 8MB'); return; }
    const reader = new FileReader(); reader.onload = () => setCropperSrc(String(reader.result)); reader.onerror = () => setError('图片读取失败'); reader.readAsDataURL(file); event.target.value = '';
  }
  async function onCropperConfirm(file: File) {
    setAvatarBusy(true); setCropperSrc(null); setError(''); setSaved('');
    try { const result = await api.uploadAvatar(file); setForm(prev => ({ ...prev, avatar: result.url })); cacheProfile(result.profile); onSaved(result.profile); setSaved('头像已更新'); }
    catch (err) { setError(err instanceof Error ? err.message : '头像上传失败'); }
    finally { setAvatarBusy(false); }
  }
  async function removeAvatarClick() {
    if (!await confirmAction({ title: '移除宝宝头像？', description: '将使用默认插画作为头像。', confirmLabel: '移除头像', danger: true })) return;
    setAvatarBusy(true); setError(''); setSaved('');
    try { const result = await api.removeAvatar(); setForm(prev => ({ ...prev, avatar: null })); cacheProfile(result.profile); onSaved(result.profile); setSaved('头像已移除'); }
    catch (err) { setError(err instanceof Error ? err.message : '头像移除失败'); }
    finally { setAvatarBusy(false); }
  }
  return <section className="settings-card profile-settings-card"><div className="setting-status"><h2>宝宝资料</h2><span className="on">已配置</span></div>
    <p>用于问候语、档案页和疫苗提醒。昵称和头像用于首页展示。</p>
    <form onSubmit={submit}>
      <div className="avatar-upload-area">
        <div className="avatar-preview" aria-label="当前头像">{form.avatar ? <img src={form.avatar} alt="" /> : <img src="/bear-bottle.png" alt="" />}</div>
        <div className="avatar-actions"><button type="button" className="btn secondary" onClick={pickFile} disabled={avatarBusy}>{avatarBusy ? '处理中…' : '上传头像'}</button>{form.avatar && <button type="button" className="btn danger-button secondary" onClick={() => void removeAvatarClick()} disabled={avatarBusy}>移除</button>}</div>
        <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={onFileChange} />
      </div>
      <label>宝宝姓名<input value={form.name} maxLength={30} onChange={event => setForm({ ...form, name: event.target.value })} required /></label>
      <label>昵称<small className="field-hint">亲切的小名，首页会优先展示</small><input value={form.nickname ?? ''} maxLength={20} placeholder="如 小糯米" onChange={event => setForm({ ...form, nickname: event.target.value })} /></label>
      <ChoiceField label="宝宝性别" values={['male', 'female', 'unspecified'] as BabySex[]} selected={form.sex} onSelect={sex => setForm({ ...form, sex })} getLabel={sex => sex === 'unspecified' ? '未设置' : sexLabels[sex]} />
      <DateField label="出生日期" max={isoDay(new Date())} value={form.birthDate} onChange={birthDate => setForm({ ...form, birthDate })} />
      <TimeField label="出生时间" value={form.birthTime ?? ''} onChange={birthTime => setForm({ ...form, birthTime })} required={false} />
      <Feedback message={error} type="error" onClose={() => setError('')} />
      <Feedback message={saved} type="success" onClose={() => setSaved('')} />
      <footer className="editor-actions" style={{ marginTop: 16 }}><button className="btn primary" disabled={busy || avatarBusy}>{busy ? '保存中…' : '保存资料'}</button></footer>
    </form>
    {cropperSrc && <AvatarCropperModal imageSrc={cropperSrc} onClose={() => setCropperSrc(null)} onConfirm={file => void onCropperConfirm(file)} />}
  </section>;
}

function AiSettingsCard({ capabilities, onChanged }: { capabilities: Capabilities; onChanged(): Promise<void> }) {
  const [settings, setSettings] = useState<AiSettingsPublic | null>(null);
  const [baseUrl, setBaseUrl] = useState('https://api.deepseek.com');
  const [model, setModel] = useState('deepseek-v4-flash');
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState<'save' | 'test' | 'clear' | ''>('');
  const [status, setStatus] = useState<{ text: string; error?: boolean } | null>(null);
  useEffect(() => {
    api.aiSettings().then(value => { setSettings(value); setBaseUrl(value.baseUrl); setModel(value.model); })
      .catch(err => setStatus({ text: err instanceof Error ? err.message : '无法读取模型配置', error: true }));
  }, []);
  const payload = () => ({ baseUrl, model, ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}) });
  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy('save'); setStatus(null);
    try { const next = await api.updateAiSettings(payload()); setSettings(next); setApiKey(''); await onChanged(); setStatus({ text: '模型配置已保存' }); }
    catch (err) { setStatus({ text: err instanceof Error ? err.message : '保存失败', error: true }); }
    finally { setBusy(''); }
  }
  async function test() {
    setBusy('test'); setStatus(null);
    try { const result = await api.testAiSettings(payload()); setStatus({ text: result.message }); }
    catch (err) { setStatus({ text: err instanceof Error ? err.message : '连接测试失败', error: true }); }
    finally { setBusy(''); }
  }
  async function clearKey() {
    if (!await confirmAction({ title: '移除已保存的密钥？', description: '移除后，依赖 AI 模型的智能功能将暂停；重新配置后可以恢复。', confirmLabel: '确认移除', danger: true })) return;
    setBusy('clear'); setStatus(null);
    try { const next = await api.updateAiSettings({ baseUrl, model, apiKey: '' }); setSettings(next); setApiKey(''); await onChanged(); setStatus({ text: 'API 密钥已移除' }); }
    catch (err) { setStatus({ text: err instanceof Error ? err.message : '移除失败', error: true }); }
    finally { setBusy(''); }
  }
  return <section className="settings-card model-settings"><div className="setting-status"><h2>AI 模型设置</h2><span className={capabilities.aiEnabled ? 'on' : ''}>{capabilities.aiEnabled ? '已配置' : '未配置'}</span></div>
    <p>配置模型后，可为报告总结、成长分析和后续智能功能提供能力。</p>
    <form onSubmit={save}>
      <label>服务商<input value="DeepSeek" readOnly aria-readonly="true" /></label>
      <label>接口地址<input type="url" inputMode="url" value={baseUrl} onChange={e => setBaseUrl(e.target.value)} required /></label>
      <label>模型名称<input value={model} onChange={e => setModel(e.target.value)} required /></label>
      <label>API 密钥<div className="secret-field"><input type={showKey ? 'text' : 'password'} value={apiKey} onChange={e => setApiKey(e.target.value)} autoComplete="off" placeholder={settings?.configured ? `已保存 ${settings.keyHint}，留空不修改` : '请输入 DeepSeek API 密钥'} /><button type="button" onClick={() => setShowKey(value => !value)}>{showKey ? '隐藏' : '显示'}</button></div></label>
      <div className="model-actions"><button type="button" className="btn secondary" disabled={Boolean(busy)} onClick={test}>{busy === 'test' ? '正在测试…' : '测试连接'}</button><button className="btn primary" disabled={Boolean(busy)}>{busy === 'save' ? '正在保存…' : '保存配置'}</button></div>
      {settings?.configured && <button type="button" className="text-danger" disabled={Boolean(busy)} onClick={clearKey}>{busy === 'clear' ? '正在移除…' : '移除已保存的密钥'}</button>}
      <Feedback message={status?.text || ''} type={status?.error ? 'error' : 'success'} onClose={() => setStatus(null)} />
    </form>
  </section>;
}

function BackupRestoreDialog({ onClose, onRestored }: { onClose(): void; onRestored(status: ServerBackupStatus, message: string): void | Promise<void> }) {
  const [files, setFiles] = useState<ServerBackupFile[]>([]); const [selected, setSelected] = useState(''); const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [deletingName, setDeletingName] = useState(''); const [error, setError] = useState('');
  const dialogRef = useRef<HTMLElement | null>(null); useDialogFocus(dialogRef, onClose);
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
  return <div className="modal-layer" onMouseDown={event => event.target === event.currentTarget && !busy && onClose()}><section ref={dialogRef} className="editor backup-restore-dialog" role="dialog" aria-modal="true" aria-labelledby="restore-title"><header className="editor-head"><div><p className="kicker">完整替换恢复</p><h2 id="restore-title">选择服务器备份</h2></div><button className="close-btn" disabled={busy} onClick={onClose} aria-label="关闭">×</button></header>
    <p className="dialog-description">恢复前会自动备份当前数据。恢复后，宝宝资料、记录和操作历史将与所选备份完全一致。</p>
    {loading && <p className="loading-copy">正在读取备份…</p>}{!loading && !files.length && <div className="empty-state compact"><h3>暂无服务器备份</h3><p>请先返回并立即备份一次。</p></div>}
    <div className="backup-file-list" role="radiogroup" aria-label="服务器备份">{files.map(file => <div key={file.name} className={`backup-file-item ${selected === file.name ? 'selected' : ''}`}><button type="button" role="radio" aria-checked={selected === file.name} className="backup-file-select" onClick={() => setSelected(file.name)}><span className="backup-file-meta"><b>{new Date(file.createdAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}</b><small className={`backup-type-tag ${file.type}`}>{file.type === 'manual' ? '手动' : '自动'}</small><small>{formatSize(file.size)}</small></span><i aria-hidden="true" /></button><button type="button" className="backup-file-delete" disabled={busy || deletingName === file.name} onClick={event => { event.stopPropagation(); void removeBackup(file.name); }} aria-label={`删除 ${file.name}`} title="删除此备份">{deletingName === file.name ? '…' : '×'}</button></div>)}</div>
    <Feedback message={error} type="error" onClose={() => setError('')} /><footer className="editor-actions"><button className="btn secondary" disabled={busy} onClick={onClose}>取消</button><button className="btn danger-button" disabled={busy || !selected} onClick={restore}>{busy ? '正在恢复…' : '确认完整恢复'}</button></footer>
  </section></div>;
}

function ImportModeDialog({ onClose, onConfirm, busy }: { onClose(): void; onConfirm(mode: 'replace' | 'merge'): Promise<void> | void; busy: boolean }) {
  const [mode, setMode] = useState<'replace' | 'merge'>('merge');
  const dialogRef = useRef<HTMLElement | null>(null);
  useDialogFocus(dialogRef, onClose);
  async function handleConfirm() {
    await onConfirm(mode);
  }
  return <div className="modal-layer" onMouseDown={event => event.target === event.currentTarget && !busy && onClose()}><section ref={dialogRef} className="editor" role="dialog" aria-modal="true" aria-labelledby="import-mode-title"><header className="editor-head"><div><p className="kicker">选择导入方式</p><h2 id="import-mode-title">导入备份文件</h2></div><button className="close-btn" disabled={busy} onClick={onClose} aria-label="关闭">×</button></header>
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
    <footer className="editor-actions"><button className="btn secondary" disabled={busy} onClick={onClose}>取消</button><button className={`btn ${mode === 'replace' ? 'danger-button' : 'primary'}`} disabled={busy} onClick={handleConfirm}>{busy ? '正在导入…' : '确认导入'}</button></footer>
  </section></div>;
}

function ServerBackupCard({ onImported }: { onImported(): void | Promise<void> }) {
  const [status, setStatus] = useState<ServerBackupStatus | null>(null); const [busy, setBusy] = useState<'backup' | 'import' | 'export' | ''>(''); const [message, setMessage] = useState(''); const [showRestore, setShowRestore] = useState(false); const [pendingFile, setPendingFile] = useState<File | null>(null); const [showImportDialog, setShowImportDialog] = useState(false);
  const loadStatus = useCallback(async () => { const next = await api.backupStatus(); setStatus(next); }, []);
  useEffect(() => { loadStatus().catch(() => setMessage('暂时无法读取服务器备份状态')); }, [loadStatus]);
  const formatTime = (value: string | null) => value ? new Date(value).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) : '等待首次备份';
  async function createBackup() {
    setBusy('backup'); setMessage('');
    try { const result = await api.createServerBackup(); setStatus(result.status); setMessage(`服务器备份已完成：${result.name}`); }
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
    try { const result = await api.importData(JSON.parse(await pendingFile.text()), mode); await loadStatus(); await onImported(); const modeLabel = mode === 'replace' ? '全量替换' : '增量合并'; setMessage(`${modeLabel}完成：${result.imported} 条记录${result.profileRestored ? '，宝宝资料已恢复' : ''}`); }
    catch (error) { setMessage(error instanceof Error ? error.message : '导入失败，请选择本应用导出的备份文件'); }
    finally { setBusy(''); setPendingFile(null); }
  }
  return <><section className="settings-card backup-card"><div className="setting-status"><h2>备份状态与恢复</h2><span className="on">每 6 小时</span></div>
    <p>自动保存完整照护数据，最多保留最近 {status?.retention ?? 30} 份。可选择服务器备份进行完整恢复，操作前会先保存当前数据。</p>
    <div className="backup-summary"><div><span>最近备份</span><b>{formatTime(status?.lastBackupAt ?? null)}</b></div><div><span>下次预计</span><b>{formatTime(status?.nextBackupAt ?? null)}</b></div><div><span>服务器备份</span><b>{status ? `${status.count} 份` : '读取中…'}</b></div><div><span>保存位置</span><b>{status?.directory || '/data/backups'}</b></div></div>
    <div className="backup-actions">
      <button className="btn primary full" disabled={Boolean(busy)} onClick={createBackup}>{busy === 'backup' ? '正在备份…' : '立即备份到服务器'}</button>
      <button className="btn secondary full" disabled={Boolean(busy) || !status?.count} onClick={() => setShowRestore(true)}>从服务器恢复</button>
      <div className="backup-actions-divider" role="separator" aria-hidden="true" />
      <div className="backup-actions-row">
        <button className="btn secondary wide" disabled={Boolean(busy)} onClick={async () => { setBusy('export'); setMessage(''); try { const res = await fetch('/api/export', { credentials: 'same-origin' }); if (!res.ok) throw new ApiError((await res.json()).error || '导出失败', res.status); const blob = new Blob([await res.text()], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `babycare-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click(); URL.revokeObjectURL(url); setMessage('备份文件已下载'); } catch (error) { setMessage(error instanceof Error ? error.message : '导出失败'); } finally { setBusy(''); } }}>{busy === 'export' ? '正在导出…' : '下载备份文件'}</button>
        <label className={`btn secondary wide ${busy ? 'disabled' : ''}`}>导入备份文件<input className="sr-only" type="file" accept=".json" disabled={Boolean(busy)} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; selectFile(file); }} /></label>
      </div>
    </div>
    <Feedback message={message} type={message.includes('失败') || message.includes('无法') ? 'error' : 'success'} onClose={() => setMessage('')} />
  </section>{showRestore && <BackupRestoreDialog onClose={() => setShowRestore(false)} onRestored={async (nextStatus, nextMessage) => { setStatus(nextStatus); await onImported(); setMessage(nextMessage); }} />}{showImportDialog && <ImportModeDialog onClose={() => { setShowImportDialog(false); setPendingFile(null); }} onConfirm={confirmImport} busy={busy === 'import'} />}</>;
}

function PatternDaysEditor({ value, onChange }: { value: boolean[] | null; onChange: (v: boolean[]) => void }) {
  const pattern = value || [true, true, true, false, false];
  const dayLabels = ['1', '2', '3', '4', '5', '6', '7'];

  function toggle(index: number) {
    const next = [...pattern];
    next[index] = !next[index];
    onChange(next);
  }
  function setLength(len: number) {
    const next: boolean[] = [];
    for (let i = 0; i < len; i++) {
      next.push(i < pattern.length ? pattern[i] : i < Math.ceil(len / 2));
    }
    onChange(next);
  }

  return <div className="pattern-days-editor">
    <span className="field-label">循环模式 · 点击切换执行/休息</span>
    <div className="pattern-days-controls">
      <span className="field-label small">周期长度</span>
      <div className="pattern-length-buttons">
        {[3, 5, 7, 10].map(len => <button key={len} type="button" className={pattern.length === len ? 'selected' : ''} onClick={() => setLength(len)}>{len}天</button>)}
      </div>
    </div>
    <div className="pattern-days-row" role="group" aria-label="循环模式日期">
      {pattern.map((active, idx) => (
        <button key={idx} type="button" className={`pattern-day ${active ? 'active' : 'rest'}`} onClick={() => toggle(idx)} aria-pressed={active}>
          <span className="pattern-day-num">{dayLabels[idx]}</span>
          <span className="pattern-day-label">{active ? '执行' : '休息'}</span>
        </button>
      ))}
    </div>
    <p className="field-help">从开始日期起，每天按顺序匹配，执行日会出现在今日计划中。</p>
  </div>;
}

function CareItemEditor({ item, nextOrder, onClose, onSaved }: { item?: CareItem; nextOrder: number; onClose(): void; onSaved(item: CareItem): void }) {
  const defaultStart = isoDay(new Date());
  const initial = {
    name: item?.name || '',
    category: item?.category || 'medication' as CareItemCategory,
    icon: item?.icon || 'medicine' as CareItemIcon,
    scheduleType: item?.scheduleType || 'as_needed' as CareItem['scheduleType'],
    intervalDays: item?.intervalDays || 2,
    scheduleStartDate: item?.scheduleStartDate || defaultStart,
    reminderTime: item?.reminderTime || '',
    reminderTimes: item?.reminderTimes && item?.reminderTimes.length > 0 ? item.reminderTimes : (item?.reminderTime ? [item.reminderTime] : []),
    scheduleEndDate: item?.scheduleEndDate || '',
    weekDays: item?.weekDays || [],
    patternDays: item?.patternDays || null as boolean[] | null,
    courseDays: item?.courseDays || null as number | null,
    courseStartDate: item?.courseStartDate || ''
  };
  const [draft, setDraft] = useState(initial); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  async function requestClose() { if (busy) return; if (dirty && !await confirmAction({ title: '放弃未保存的修改？', description: '项目与执行计划的修改尚未保存。', confirmLabel: '放弃修改', danger: true })) return; onClose(); }
  const dialogRef = useRef<HTMLElement | null>(null); useDialogFocus(dialogRef, () => void requestClose());

  const weekdayLabels = ['一', '二', '三', '四', '五', '六', '日'];
  const weekdayDisplayValues = [1, 2, 3, 4, 5, 6, 0];
  function toggleWeekday(day: number) {
    setDraft(v => ({
      ...v,
      weekDays: v.weekDays.includes(day) ? v.weekDays.filter(d => d !== day) : [...v.weekDays, day].sort((a, b) => a - b)
    }));
  }
  function addReminderTime() {
    const last = draft.reminderTimes[draft.reminderTimes.length - 1] || draft.reminderTime || '08:00';
    const [h, m] = last.split(':').map(Number);
    const next = `${String(Math.min(23, h + 1)).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    setDraft(v => ({ ...v, reminderTimes: [...v.reminderTimes, next] }));
  }
  function updateReminderTime(index: number, value: string) {
    setDraft(v => ({ ...v, reminderTimes: v.reminderTimes.map((t, i) => i === index ? value : t) }));
  }
  function removeReminderTime(index: number) {
    setDraft(v => ({ ...v, reminderTimes: v.reminderTimes.filter((_, i) => i !== index) }));
  }
  function clearAllTimes() {
    setDraft(v => ({ ...v, reminderTime: '', reminderTimes: [] }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    const sortOrder = item?.sortOrder ?? nextOrder;
    const reminderTimes = draft.reminderTimes.length > 0 ? draft.reminderTimes : (draft.reminderTime ? [draft.reminderTime] : null);
    const scheduleStartDate = draft.scheduleType === 'as_needed' ? null : draft.scheduleStartDate;
    const payload = {
      ...draft,
      name: draft.name.trim(),
      sortOrder,
      intervalDays: draft.scheduleType === 'interval' ? draft.intervalDays : 1,
      scheduleStartDate,
      reminderTime: draft.reminderTime || null,
      reminderTimes,
      scheduleEndDate: draft.scheduleType === 'as_needed' ? null : draft.scheduleEndDate || null,
      weekDays: draft.scheduleType === 'weekly' ? draft.weekDays : null,
      patternDays: draft.scheduleType === 'pattern' ? draft.patternDays : null,
      courseDays: null,
      courseStartDate: null
    };
    try {
      const saved = item ? await api.updateCareItem(item.id, payload) : await api.createCareItem(payload);
      onSaved(saved); onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败'); setBusy(false);
    }
  }
  const iconOptions: { value: CareItemIcon; label: string }[] = [{ value: 'medicine', label: '药物' }, { value: 'massage', label: '推拿' }, { value: 'bath', label: '洗澡' }, { value: 'care', label: '其他' }];
  const weekDayOptions: { value: number; label: string }[] = weekdayDisplayValues.map((val, idx) => ({ value: val, label: weekdayLabels[idx] }));
  const canSetTime = draft.scheduleType !== 'as_needed';
  const effectiveTimes = draft.reminderTimes.length > 0 ? draft.reminderTimes : (draft.reminderTime ? [draft.reminderTime] : []);
  return <div className="modal-layer" onMouseDown={event => event.target === event.currentTarget && void requestClose()}><section ref={dialogRef} className="editor care-item-editor" role="dialog" aria-modal="true" aria-labelledby="care-item-title"><header className="editor-head"><div><p className="kicker">用药护理</p><h2 id="care-item-title">{item ? '修改项目' : '新增项目'}</h2></div><button className="close-btn" disabled={busy} onClick={() => void requestClose()} aria-label="关闭">×</button></header><form className="editor-form" onSubmit={submit}>
    <div className="care-item-meta">
      <div className="meta-category-label">{draft.category === 'medication' ? '用药' : '护理'}</div>
      <div className="meta-icon-picker" role="group" aria-label="选择图标">
        {iconOptions.map(option => <button type="button" key={option.value} className={`meta-icon-btn${draft.icon === option.value ? ' selected' : ''}`} onClick={() => setDraft(v => ({ ...v, icon: option.value, category: option.value === 'medicine' ? 'medication' : 'care' }))} aria-label={option.label}><img src={careItemIconSources[option.value]} alt="" /></button>)}
      </div>
    </div>
    <label>项目名称<input maxLength={12} value={draft.name} onChange={event => setDraft(value => ({ ...value, name: event.target.value }))} placeholder={draft.category === 'medication' ? '例如：维生素 D' : '例如：洗澡'} autoFocus required /></label>
    <fieldset><legend>执行计划</legend><div className="choice-group schedule-choice">
      <button type="button" className={draft.scheduleType === 'as_needed' ? 'selected' : ''} onClick={() => setDraft(value => ({ ...value, scheduleType: 'as_needed' }))}>按需</button>
      <button type="button" className={draft.scheduleType === 'daily' ? 'selected' : ''} onClick={() => setDraft(value => ({ ...value, scheduleType: 'daily' }))}>一次</button>
      <button type="button" className={draft.scheduleType === 'interval' ? 'selected' : ''} onClick={() => setDraft(value => ({ ...value, scheduleType: 'interval' }))}>间隔</button>
      <button type="button" className={draft.scheduleType === 'weekly' ? 'selected' : ''} onClick={() => setDraft(value => ({ ...value, scheduleType: 'weekly' }))}>指定</button>
      <button type="button" className={draft.scheduleType === 'pattern' ? 'selected' : ''} onClick={() => setDraft(value => ({ ...value, scheduleType: 'pattern', patternDays: value.patternDays || [true, true, true, false, false] }))}>循环</button>
    </div><p className="field-help">按需项目不会自动进入首页今日计划，仍可随时手动记录。</p></fieldset>
    {draft.scheduleType !== 'as_needed' && <>
      <div className="schedule-fields">
        {draft.scheduleType === 'interval' && <label className="compact-field">间隔天数<input type="number" inputMode="numeric" min="2" max="365" value={draft.intervalDays} onChange={event => setDraft(value => ({ ...value, intervalDays: Number(event.target.value) || 2 }))} required /></label>}
        {draft.scheduleType === 'weekly' && <div className="weekday-selector" role="group" aria-label="选择星期"><span className="field-label">选择星期</span><div className="weekday-buttons">{weekDayOptions.map(day => <button type="button" key={day.value} className={draft.weekDays.includes(day.value) ? 'selected' : ''} onClick={() => toggleWeekday(day.value)} aria-pressed={draft.weekDays.includes(day.value)}>{day.label}</button>)}</div></div>}
        {draft.scheduleType === 'pattern' && <PatternDaysEditor value={draft.patternDays} onChange={patternDays => setDraft(v => ({ ...v, patternDays }))} />}
        <div className="date-row">
          <DateField label="开始日期" value={draft.scheduleStartDate} onChange={scheduleStartDate => setDraft(value => ({ ...value, scheduleStartDate }))} />
          <DateField label="结束日期" required={false} min={draft.scheduleStartDate} value={draft.scheduleEndDate} onChange={scheduleEndDate => setDraft(value => ({ ...value, scheduleEndDate }))} />
        </div>
        {canSetTime && <div className="time-unified">
          <div className="time-unified-header">
            <span className="field-label">提醒时间</span>
            {effectiveTimes.length > 0 && <button type="button" className="text-link" onClick={clearAllTimes}>清空</button>}
          </div>
          {effectiveTimes.length === 0 ? (
            <div className="time-empty-state">
              <span className="time-empty-hint">未设置时间</span>
              <button type="button" className="btn secondary small" onClick={addReminderTime}>+ 添加时间</button>
            </div>
          ) : effectiveTimes.map((t, i) => (
            <div key={i} className="reminder-time-row">
              <input type="time" value={t} onChange={e => updateReminderTime(i, e.target.value)} aria-label={`第 ${i + 1} 次提醒时间`} />
              {effectiveTimes.length > 1 && <button type="button" className="btn secondary small" onClick={() => removeReminderTime(i)} aria-label="删除时间">删除</button>}
              {i === effectiveTimes.length - 1 && effectiveTimes.length < 10 && <button type="button" className="btn secondary small" onClick={addReminderTime}>+</button>}
            </div>
          ))}
        </div>}
      </div>
      {canSetTime && effectiveTimes.length === 0 && <p className="field-help">未设置时间仍会进入今日计划，但不会显示具体时间。</p>}
      {draft.scheduleType === 'pattern' && draft.patternDays && <p className="field-help">循环模式：{draft.patternDays.filter(Boolean).length} 天执行 / {draft.patternDays.filter(v => !v).length} 天休息，从开始日期起按序循环。</p>}
    </>}
    {error && <Feedback message={error} type="error" onClose={() => setError('')} />}
    <footer className="editor-actions"><button type="button" className="btn secondary" disabled={busy} onClick={() => void requestClose()}>取消</button><button className="btn primary" disabled={busy || !draft.name.trim()}>{busy ? '保存中…' : '保存项目'}</button></footer>
  </form></section></div>;
}

function careItemHomeStatus(item: CareItem) {
  if (!item.active) return '已停用';
  if (item.scheduleType === 'as_needed') return '按需 · 手动添加';
  const due = isCareItemDue(item);
  const reminders = getCareItemReminderTimes(item);
  const courseRemaining = careItemCourseRemaining(item);
  const courseDone = careItemCourseCompleted(item);
  const timeLabel = reminders.length > 0 ? reminders.join(' · ') : (item.reminderTime || '');
  const scheduleLabel = item.scheduleType === 'weekly' && item.weekDays
    ? `每 ${[...item.weekDays].sort((a, b) => a === 0 ? 1 : b === 0 ? -1 : a - b).map(d => ['日','一','二','三','四','五','六'][d]).join('、')}`
    : item.scheduleType === 'pattern' && item.patternDays
    ? `循环 ${item.patternDays.filter(Boolean).length}休${item.patternDays.filter(v => !v).length}`
    : item.scheduleType === 'interval' ? `每 ${item.intervalDays} 天`
    : item.scheduleType === 'daily' ? '每天' : '';
  const courseLabel = courseRemaining !== null
    ? courseDone ? '疗程已完成' : `第 ${(item.courseDays! - courseRemaining + 1)} 天，剩 ${courseRemaining} 天`
    : '';
  const timePart = timeLabel ? `今日 ${timeLabel}` : '今日';
  if (due) return `${timePart}${scheduleLabel ? ` · ${scheduleLabel}` : ''}${courseLabel ? ` · ${courseLabel}` : ''}`;
  const nextDue = nextCareItemDueDate(item);
  if (!nextDue) return '计划已结束';
  const dateLabel = new Date(`${nextDue}T12:00:00`).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
  return `${dateLabel} · 不显示`;
}

function CareAdherenceCard() {
  const [data, setData] = useState<{ items: { name: string; completionRate: number; completedDays: number; totalDays: number; streakDays: number; lastCompletedAt: string | null }[] } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api.careAdherence().then(setData).catch(err => setError(err instanceof Error ? err.message : '无法加载统计'));
  }, []);
  if (error) return <section className="settings-card"><div className="setting-status"><h2>依从性统计</h2><span className="on">30 天</span></div><p>{error}</p></section>;
  if (!data || data.items.length === 0) return <section className="settings-card"><div className="setting-status"><h2>依从性统计</h2><span className="on">30 天</span></div><p>暂无执行计划数据。添加有执行计划的用药或护理项目后，将在这里显示完成率。</p></section>;
  const avgRate = Math.round(data.items.reduce((sum, item) => sum + item.completionRate, 0) / data.items.length);
  return <section className="settings-card care-adherence-card"><div className="setting-status"><h2>依从性统计</h2><span className="on">近 30 天 · 平均 {avgRate}%</span></div><p>完成率基于近 30 天的计划天数和实际记录计算，仅供参考。</p>
    <div className="adherence-list">{data.items.map(item => {
      const rate = item.completionRate;
      const color = rate >= 80 ? '#22c55e' : rate >= 50 ? '#f59e0b' : '#ef4444';
      return <article key={item.name} className="adherence-item">
        <div className="adherence-header"><b>{item.name}</b><span className="adherence-rate" style={{ color }}>{rate}%</span></div>
        <div className="adherence-bar"><div className="adherence-bar-fill" style={{ width: `${rate}%`, background: color }} /></div>
        <div className="adherence-meta">
          <span>完成 {item.completedDays}/{item.totalDays} 天</span>
          {item.streakDays > 0 && <span>连续 {item.streakDays} 天</span>}
          {item.lastCompletedAt && <span>上次 {item.lastCompletedAt.slice(5)}</span>}
        </div>
      </article>;
    })}</div>
  </section>;
}

function CareItemsCard({ items, onChanged }: { items: CareItem[]; onChanged(): Promise<void> }) {
  const [editing, setEditing] = useState<CareItem | 'new' | null>(null); const [busyId, setBusyId] = useState(''); const [message, setMessage] = useState(''); const [ordered, setOrdered] = useState(items); const [draggingId, setDraggingId] = useState('');
  const orderedRef = useRef(items); const dragRef = useRef<{ id: string; original: CareItem[] } | null>(null);
  useEffect(() => { if (!draggingId) { setOrdered(items); orderedRef.current = items; } }, [items, draggingId]);
  async function toggle(item: CareItem) { if (item.active && !await confirmAction({ title: `停用“${item.name}”？`, description: '首页将不再显示该项目，历史记录仍会保留。', confirmLabel: '确认停用', danger: true })) return; setBusyId(item.id); setMessage(''); try { await api.setCareItemActive(item.id, !item.active); await onChanged(); setMessage(item.active ? '项目已停用' : '项目已启用'); } catch (err) { setMessage(err instanceof Error ? err.message : '操作失败'); } finally { setBusyId(''); } }
  function reorderLocal(id: string, targetId: string) { const current = orderedRef.current; const movedItem = current.find(item => item.id === id); const targetItem = current.find(item => item.id === targetId); if (!movedItem || !targetItem || movedItem.category !== targetItem.category) return; const from = current.findIndex(item => item.id === id); const to = current.findIndex(item => item.id === targetId); if (from === to) return; const next = [...current]; const [moved] = next.splice(from, 1); next.splice(to, 0, moved); orderedRef.current = next; setOrdered(next); }
  async function persistOrder(next: CareItem[], previous: CareItem[]) { if (next.map(item => item.id).join() === previous.map(item => item.id).join()) return; setBusyId('order'); setMessage(''); try { await api.reorderCareItems(next.map(item => item.id)); await onChanged(); setMessage('项目顺序已保存'); } catch (err) { orderedRef.current = previous; setOrdered(previous); setMessage(err instanceof Error ? err.message : '顺序保存失败'); } finally { setBusyId(''); } }
  async function moveByKeyboard(item: CareItem, direction: -1 | 1) { const previous = orderedRef.current; const group = previous.filter(entry => entry.category === item.category); const index = group.findIndex(entry => entry.id === item.id); const target = group[index + direction]; if (!target || busyId) return; reorderLocal(item.id, target.id); await persistOrder(orderedRef.current, previous); }
  function startDrag(event: React.PointerEvent<HTMLButtonElement>, item: CareItem) { if (busyId) return; event.currentTarget.setPointerCapture(event.pointerId); dragRef.current = { id: item.id, original: orderedRef.current }; setDraggingId(item.id); }
  function drag(event: React.PointerEvent<HTMLButtonElement>) { if (!dragRef.current) return; const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-care-item-id]')?.dataset.careItemId; if (target) reorderLocal(dragRef.current.id, target); }
  function endDrag() { const state = dragRef.current; if (!state) return; dragRef.current = null; setDraggingId(''); void persistOrder(orderedRef.current, state.original); }
  function cancelDrag() { const state = dragRef.current; if (!state) return; orderedRef.current = state.original; setOrdered(state.original); dragRef.current = null; setDraggingId(''); }
  const groups: { category: CareItemCategory; label: string }[] = [{ category: 'medication', label: '用药' }, { category: 'care', label: '护理' }];
  const renderItem = (item: CareItem) => <article data-care-item-id={item.id} className={`${item.active ? '' : 'inactive'} ${draggingId === item.id ? 'dragging' : ''}`} key={item.id}><button type="button" className="care-drag-handle" aria-label={`调整${item.name}在${item.category === 'medication' ? '用药' : '护理'}分组中的顺序，可拖动或按上下方向键`} aria-keyshortcuts="ArrowUp ArrowDown" onPointerDown={event => startDrag(event, item)} onPointerMove={drag} onPointerUp={endDrag} onPointerCancel={cancelDrag} onKeyDown={event => { if (event.key === 'ArrowUp' || event.key === 'ArrowDown') { event.preventDefault(); void moveByKeyboard(item, event.key === 'ArrowUp' ? -1 : 1); } }} aria-hidden="true">≡</button><img src={careItemIconSources[item.icon]} alt="" /><button className="care-item-info" onClick={() => setEditing(item)}><b>{item.name}<span className="care-item-edit-hint"> · 修改</span></b><small>{careItemHomeStatus(item)}</small></button><Switch checked={item.active} label={`${item.active ? '停用' : '启用'}${item.name}`} disabled={Boolean(busyId)} onChange={() => void toggle(item)} /></article>;
  return <><section className="settings-card care-items-card"><div className="setting-status"><h2>用药护理</h2><span className="on">管理</span></div><p>定时或间隔项目会进入首页今日计划；护理项目统一用“完成”记录。按需项目仅在手动添加记录时显示。</p>{groups.map(group => <section className="care-item-group" key={group.category}><h3>{group.label}</h3><div className="care-item-list">{ordered.filter(item => item.category === group.category).map(renderItem)}</div></section>)}<button className="btn primary full" disabled={Boolean(busyId)} onClick={() => setEditing('new')}>新增项目</button><Feedback message={message} type={message.includes('失败') || message.includes('变化') ? 'error' : 'success'} onClose={() => setMessage('')} /></section>{editing && <CareItemEditor item={editing === 'new' ? undefined : editing} nextOrder={Math.max(0, ...items.map(item => item.sortOrder)) + 10} onClose={() => setEditing(null)} onSaved={async () => { await onChanged(); setMessage(editing === 'new' ? '项目已新增' : '项目已修改'); }} />}</>;
}

function FamilyPermissionsCard() {
  const [members, setMembers] = useState<FamilyMemberPermission[]>([]); const [busyId, setBusyId] = useState(''); const [message, setMessage] = useState('');
  useEffect(() => { api.familyMembers().then(setMembers).catch(err => setMessage(err instanceof Error ? err.message : '无法读取家庭成员')); }, []);
  async function changeRole(member: FamilyMemberPermission, role: 'admin' | 'member') { if (member.role === role || !await confirmAction({ title: `将${member.name}设为“${roleNames[role]}”？`, description: role === 'admin' ? '管理身份可以管理用药项目和已删除记录。' : '普通身份可以查看、添加和修改照护记录。', confirmLabel: '确认修改' })) return; setBusyId(member.id); setMessage(''); try { const updated = await api.updateFamilyRole(member.id as Exclude<FamilyId, 'father'>, role); setMembers(items => items.map(item => item.id === updated.id ? updated : item)); setMessage(`${member.name}已设为${roleNames[role]}`); } catch (err) { setMessage(err instanceof Error ? err.message : '权限修改失败'); } finally { setBusyId(''); } }
  return <section className="settings-card family-permissions-card"><div className="setting-status"><h2>成员与权限</h2><span className="on">超管</span></div><p>管理身份可管理用药项目和回收站；普通身份可记录和修改照护信息。</p><div className="family-permission-list">{members.map(member => { const visual = familyMembers.find(item => item.id === member.id)!; return <article key={member.id}><img src={visual.icon} alt="" /><div><b>{member.name}</b><small>{member.id === 'father' ? '最高管理权限' : roleNames[member.role]}</small></div>{member.id === 'father' ? <span className="fixed-role">超管·不可修改</span> : <div className="role-switch" role="group" aria-label={`${member.name}的权限`}><button type="button" aria-pressed={member.role === 'admin'} className={member.role === 'admin' ? 'active' : ''} disabled={Boolean(busyId)} onClick={() => void changeRole(member, 'admin')}>管理</button><button type="button" aria-pressed={member.role === 'member'} className={member.role === 'member' ? 'active' : ''} disabled={Boolean(busyId)} onClick={() => void changeRole(member, 'member')}>普通</button></div>}</article>; })}</div><Feedback message={message} type={message.includes('失败') || message.includes('无法') ? 'error' : 'success'} onClose={() => setMessage('')} /></section>;
}

function VaccineCatalogEditor({ item, onClose, onSaved }: { item?: VaccineCatalogItem; onClose(): void; onSaved(item: VaccineCatalogItem): void }) {
  const initial: DraftVaccineCatalogItem = { name: item?.name || '', category: item?.category || 'program', shortName: item?.shortName ?? null, description: item?.description || '', doseCount: item?.doseCount ?? 1, intervalSummary: item?.intervalSummary || '' };
  const [draft, setDraft] = useState(initial); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const dialogRef = useRef<HTMLElement | null>(null);
  async function requestClose() { if (busy) return; if (dirty && !await confirmAction({ title: '放弃未保存的修改？', description: '疫苗信息尚未保存。', confirmLabel: '放弃修改', danger: true })) return; onClose(); }
  useDialogFocus(dialogRef, () => void requestClose());
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    const payload = { ...draft, name: draft.name.trim(), description: draft.description.trim(), intervalSummary: draft.intervalSummary.trim() };
    try { const saved = item ? await api.updateVaccineCatalogItem(item.id, payload) : await api.createVaccineCatalogItem(payload); onSaved(saved); onClose(); }
    catch (err) { setError(err instanceof Error ? err.message : '保存疫苗失败'); setBusy(false); }
  }
  return <div className="modal-layer" onMouseDown={event => event.target === event.currentTarget && void requestClose()}><section ref={dialogRef} className="editor vaccine-catalog-editor" role="dialog" aria-modal="true" aria-labelledby="vaccine-catalog-editor-title"><header className="editor-head"><div><p className="kicker">疫苗目录</p><h2 id="vaccine-catalog-editor-title">{item ? '修改疫苗' : '新增疫苗'}</h2></div><button type="button" className="close-btn" disabled={busy} onClick={() => void requestClose()} aria-label="关闭">×</button></header><form className="editor-form" onSubmit={submit}><label>疫苗名称<input value={draft.name} maxLength={50} required autoFocus={!item} placeholder="例如：水痘疫苗" onChange={event => setDraft(value => ({ ...value, name: event.target.value }))} /></label><fieldset><legend>疫苗类型</legend><SegmentedControl label="疫苗类型" value={draft.category} options={[{ value: 'program', label: '规划' }, { value: 'self_paid', label: '自费' }]} onChange={category => setDraft(value => ({ ...value, category }))} /></fieldset><label>常规剂次<select value={draft.doseCount ?? ''} onChange={event => setDraft(value => ({ ...value, doseCount: event.target.value ? Number(event.target.value) : null }))}><option value="">按接种门诊安排</option>{Array.from({ length: 9 }, (_, index) => <option value={index + 1} key={index + 1}>{index + 1} 剂</option>)}</select></label><label>预防疾病 <span>选填</span><textarea rows={3} maxLength={300} value={draft.description} placeholder="例如：用于预防水痘。" onChange={event => setDraft(value => ({ ...value, description: event.target.value }))} /></label><label>接种程序 <span>选填</span><textarea rows={2} maxLength={200} value={draft.intervalSummary} placeholder="例如：共 2 剂，每剂至少间隔 3 个月" onChange={event => setDraft(value => ({ ...value, intervalSummary: event.target.value }))} /></label>{error && <Feedback message={error} type="error" onClose={() => setError('')} />}<footer className="editor-actions"><button type="button" className="btn secondary" disabled={busy} onClick={() => void requestClose()}>取消</button><button className="btn primary" disabled={busy || !draft.name.trim()}>{busy ? '保存中…' : '保存疫苗'}</button></footer></form></section></div>;
}

function VaccineSettingsCard({ catalog, manager, onCatalogChanged }: { catalog: VaccineCatalogItem[]; manager: boolean; onCatalogChanged(): Promise<void> }) {
  const [busy, setBusy] = useState(''); const [expanded, setExpanded] = useState(''); const [editing, setEditing] = useState<VaccineCatalogItem | 'new' | null>(null); const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  async function toggle(item: VaccineCatalogItem) { setBusy(item.id); setMessage(null); try { await api.setVaccineCatalogActive(item.id, !item.active); await onCatalogChanged(); setMessage({ text: item.active ? `${item.name}已停用` : `${item.name}已启用` }); } catch (error) { setMessage({ text: error instanceof Error ? error.message : '更新疫苗目录失败', error: true }); } finally { setBusy(''); } }
  async function remove(item: VaccineCatalogItem) { if (!await confirmAction({ title: `删除“${item.name}”？`, description: '将从疫苗目录和未来接种安排中移除；已接种历史记录仍会保留。', confirmLabel: '删除疫苗', danger: true })) return; setBusy(item.id); setMessage(null); try { await api.deleteVaccineCatalogItem(item.id); await onCatalogChanged(); setExpanded(current => current === item.id ? '' : current); setMessage({ text: `${item.name}已删除` }); } catch (error) { setMessage({ text: error instanceof Error ? error.message : '删除疫苗失败', error: true }); } finally { setBusy(''); } }
  return <><section className="settings-card vaccine-settings-card"><div><h2>疫苗安排</h2><p>首页自动显示近期建议接种与门诊预约，无需单独开启。</p></div><dl><div><dt>接种地区</dt><dd>浙江省杭州市</dd></div><div><dt>提醒依据</dt><dd>预约日期优先</dd></div><div><dt>参考规则</dt><dd>国家免疫规划（2021年版）</dd></div></dl><p className="vaccine-safety-note">门诊没有给出预约时无需设置。系统建议日期仅供参考。</p></section>
  <section className="settings-card vaccine-catalog-card"><div className="section-title"><div><p className="kicker">疫苗目录</p><h2>显示疫苗</h2></div><div className="catalog-head-actions"><span>{catalog.filter(item => item.active).length} 项启用</span>{manager && <button type="button" className="btn secondary" disabled={Boolean(busy)} onClick={() => setEditing('new')}>＋ 新增疫苗</button>}</div></div><p>内置 10 种默认疫苗只能启用或停用；自行新增的疫苗可以修改和删除。</p><div className="vaccine-catalog-list">{catalog.map(item => <article key={item.id} className={`${item.active ? '' : 'inactive'} ${manager ? '' : 'readonly'}`}><div className="catalog-copy"><div className="catalog-title"><b>{item.name}</b><i className={`vaccine-kind ${item.category}`}>{item.category === 'program' ? '规划' : '自费'}</i></div><small>{item.doseCount ? `${item.doseCount} 剂` : '按接种门诊安排'}{item.isSystem ? ' · 系统默认' : ''}</small></div>{manager && !item.isSystem ? <ActionMenu label={`管理${item.name}`} items={[{ label: expanded === item.id ? '收起详情' : '查看详情', onSelect: () => setExpanded(expanded === item.id ? '' : item.id) }, { label: '修改', onSelect: () => setEditing(item) }, { label: '删除', danger: true, onSelect: () => remove(item) }]} /> : <button type="button" className="catalog-detail-toggle" aria-expanded={expanded === item.id} onClick={() => setExpanded(expanded === item.id ? '' : item.id)}>{expanded === item.id ? '收起' : '详情'}</button>}{manager && <Switch checked={item.active} label={`${item.active ? '停用' : '启用'}${item.name}`} disabled={Boolean(busy)} onChange={() => void toggle(item)} />}{expanded === item.id && <div className="catalog-detail"><dl><dt>预防疾病</dt><dd>{item.description || '尚未填写。'}</dd><dt>接种程序</dt><dd>{item.intervalSummary || (item.doseCount ? `共 ${item.doseCount} 剂` : '按接种门诊安排')}</dd></dl></div>}</article>)}</div><Feedback message={message?.text || ''} type={message?.error ? 'error' : 'success'} onClose={() => setMessage(null)} /></section>{editing && <VaccineCatalogEditor item={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} onSaved={async saved => { await onCatalogChanged(); setMessage({ text: editing === 'new' ? `${saved.name}已新增` : `${saved.name}已修改` }); }} />}</>;
}

type PushSettingsPatch = { enabled?: boolean; pushplusToken?: string; pushplusTopic?: string; morningDigestEnabled?: boolean; morningDigestTime?: string; feedingGapEnabled?: boolean; feedingGapLevel1Minutes?: number; feedingGapLevel2Minutes?: number; careItemEnabled?: boolean };

function PushSettingsCard({ pushStatus, onRefresh, onTestMorning, onTestFeedingGap, onTestCareItem, onSave, onOpenAppNotifications }: { pushStatus: PushStatus | null; onRefresh(): Promise<void>; onTestMorning(): Promise<{ message: string }>; onTestFeedingGap(level: 'level1' | 'level2'): Promise<{ message: string }>; onTestCareItem(): Promise<{ message: string }>; onSave(data: PushSettingsPatch): Promise<PushStatus>; onOpenAppNotifications?(): void }) {
  const [digestTime, setDigestTime] = useState('08:00');
  const [gapLevel1, setGapLevel1] = useState(150);
  const [gapLevel2, setGapLevel2] = useState(180);
  const [token, setToken] = useState('');
  const [topic, setTopic] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [testingKey, setTestingKey] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const initialized = useRef(false);

  useEffect(() => {
    if (!pushStatus || initialized.current) return;
    setDigestTime(pushStatus.morningDigestTime || '08:00');
    setGapLevel1(pushStatus.feedingGapLevel1Minutes || 150);
    setGapLevel2(pushStatus.feedingGapLevel2Minutes || 180);
    initialized.current = true;
  }, [pushStatus]);

  function minutesLabel(totalMinutes: number): string {
    const m = Math.max(0, Math.trunc(totalMinutes || 0));
    const h = Math.floor(m / 60);
    const r = m % 60;
    if (h === 0) return `${m} 分钟`;
    if (r === 0) return `${h} 小时`;
    return `${h} 小时 ${r} 分`;
  }

  async function persist(key: string, patch: PushSettingsPatch, successText = '已保存'): Promise<boolean> {
    setSavingKey(key);
    setMessage(null);
    try {
      await onSave(patch);
      setMessage({ text: successText, error: false });
      return true;
    } catch (error) {
      const text = error instanceof ApiError ? error.message : '保存失败';
      setMessage({ text, error: true });
      return false;
    } finally {
      setSavingKey(null);
    }
  }

  async function saveDigestTime() {
    const value = digestTime.trim();
    if (!/^\d{2}:\d{2}$/.test(value)) {
      setMessage({ text: '发送时间必须为 HH:MM 格式（如 08:00）', error: true });
      return;
    }
    await persist('digest-time', { morningDigestTime: value });
  }

  async function saveGapLevels() {
    const l1 = Number(gapLevel1);
    const l2 = Number(gapLevel2);
    if (!Number.isSafeInteger(l1) || l1 < 30) {
      setMessage({ text: '轻度提醒至少 30 分钟', error: true });
      return;
    }
    if (!Number.isSafeInteger(l2) || l2 < 30) {
      setMessage({ text: '重点提醒至少 30 分钟', error: true });
      return;
    }
    if (l2 <= l1) {
      setMessage({ text: '重点提醒必须大于轻度提醒', error: true });
      return;
    }
    await persist('gap-levels', { feedingGapLevel1Minutes: l1, feedingGapLevel2Minutes: l2 });
  }

  async function saveChannel(clear: boolean) {
    if (clear && !await confirmAction({ title: '清除微信推送配置？', description: 'Token 与话题编码将一并清除，微信将不再收到推送；APP 通知不受影响。', confirmLabel: '清除配置', danger: true })) return;
    const trimmedToken = token.trim();
    const trimmedTopic = topic.trim();
    if (!clear && !trimmedToken && !trimmedTopic) return;
    const saved = await persist('channel', clear
      ? { pushplusToken: '', pushplusTopic: '' }
      : { ...(trimmedToken ? { pushplusToken: trimmedToken } : {}), ...(trimmedTopic ? { pushplusTopic: trimmedTopic } : {}) },
      clear ? '微信推送配置已清除' : '微信推送配置已保存');
    if (saved) {
      setToken('');
      setTopic('');
    }
  }

  async function handleTestMorning() {
    setTestingKey('morning');
    setMessage(null);
    try {
      const result = await onTestMorning();
      const text = result.message || '早报测试消息已发送，请查收';
      setMessage({ text, error: false });
    } catch (error) {
      const text = error instanceof ApiError ? error.message : '发送失败，请检查配置';
      setMessage({ text, error: true });
    } finally {
      setTestingKey(null);
    }
  }

  async function handleTestFeedingGap(level: 'level1' | 'level2') {
    setTestingKey(level);
    setMessage(null);
    try {
      const result = await onTestFeedingGap(level);
      const text = result.message || '喂奶间隔测试消息已发送，请查收';
      setMessage({ text, error: false });
    } catch (error) {
      const text = error instanceof ApiError ? error.message : '发送失败，请检查配置';
      setMessage({ text, error: true });
    } finally {
      setTestingKey(null);
    }
  }

  async function handleTestCareItem() {
    setTestingKey('care-item');
    setMessage(null);
    try {
      const result = await onTestCareItem();
      const text = result.message || '用药护理测试消息已发送，请查收';
      setMessage({ text, error: false });
    } catch (error) {
      const text = error instanceof ApiError ? error.message : '发送失败，请检查配置';
      setMessage({ text, error: true });
    } finally {
      setTestingKey(null);
    }
  }

  async function refresh() {
    setMessage(null);
    try {
      await onRefresh();
      setMessage({ text: '状态已刷新', error: false });
    } catch (error) {
      const text = error instanceof ApiError ? error.message : '刷新失败';
      setMessage({ text, error: true });
    }
  }

  const feedingGapLabel = (() => {
    if (!pushStatus?.lastFeedAt) return '暂无喂奶记录';
    const gap = pushStatus.currentFeedingGapMinutes;
    if (gap === null || typeof gap !== 'number') return '暂无';
    const level = pushStatus.feedingGapLevel;
    const tag = level === 'level1' ? ' · 🟡 一级已提醒' : level === 'level2' ? ' · 🔴 二级已提醒' : '';
    return `${minutesLabel(gap)}（${new Date(pushStatus.lastFeedAt).toLocaleString('zh-CN')}）${tag}`;
  })();

  const digestDirty = digestTime.trim() !== (pushStatus?.morningDigestTime || '08:00');
  const gapDirty = Number(gapLevel1) !== (pushStatus?.feedingGapLevel1Minutes || 150) || Number(gapLevel2) !== (pushStatus?.feedingGapLevel2Minutes || 180);
  const channelDirty = Boolean(token.trim() || topic.trim());

  return <>
    <section className="settings-card push-rules-card">
      <div>
        <h2>提醒规则</h2>
        <p>规则对全家生效：关闭某类提醒后，微信推送和 APP 通知都会停止该类消息。</p>
      </div>
      <div className="push-rule-list">
        <article className="push-rule-row">
          <header className="push-rule-head">
            <div><b>早间日报</b><small>昨日汇总与今日计划，每天一条</small></div>
            <Switch checked={pushStatus?.morningDigestEnabled ?? true} label="早间日报提醒开关" disabled={savingKey !== null} onChange={value => void persist('rule-digest', { morningDigestEnabled: value }, value ? '早间日报已开启' : '早间日报已关闭')} />
          </header>
          <form className="push-rule-fields" onSubmit={event => { event.preventDefault(); void saveDigestTime(); }}>
            <label>
              发送时间
              <input type="time" value={digestTime} onChange={event => setDigestTime(event.target.value)} />
            </label>
            <button type="submit" className="btn secondary" disabled={savingKey !== null || !digestDirty}>{savingKey === 'digest-time' ? '保存中…' : '保存时间'}</button>
          </form>
          <p className="push-rule-meta">{pushStatus?.morningDigestEnabled
            ? (pushStatus.morningDigestTodaySent ? '今日早报已发送' : `今日未发送，到 ${pushStatus.morningDigestTime || '08:00'} 自动触发`)
            : '规则已关闭，时间仅作预设'}</p>
          <footer className="push-rule-actions">
            <button type="button" className="btn secondary" disabled={testingKey === 'morning'} onClick={handleTestMorning}>{testingKey === 'morning' ? '发送中…' : '发送测试'}</button>
          </footer>
        </article>

        <article className="push-rule-row">
          <header className="push-rule-head">
            <div><b>喂奶间隔</b><small>超过轻度先提醒一次，超过重点再提醒一次</small></div>
            <Switch checked={pushStatus?.feedingGapEnabled ?? true} label="喂奶间隔提醒开关" disabled={savingKey !== null} onChange={value => void persist('rule-gap', { feedingGapEnabled: value }, value ? '喂奶间隔提醒已开启' : '喂奶间隔提醒已关闭')} />
          </header>
          <form className="push-rule-fields push-rule-fields-gap" onSubmit={event => { event.preventDefault(); void saveGapLevels(); }}>
            <label>
              轻度（分钟）
              <input type="number" min={30} step={1} value={gapLevel1} onChange={event => setGapLevel1(Number(event.target.value))} />
            </label>
            <label>
              重点（分钟）
              <input type="number" min={30} step={1} value={gapLevel2} onChange={event => setGapLevel2(Number(event.target.value))} />
            </label>
            <button type="submit" className="btn secondary" disabled={savingKey !== null || !gapDirty}>{savingKey === 'gap-levels' ? '保存中…' : '保存阈值'}</button>
          </form>
          <p className="push-rule-meta">当前约轻度 {minutesLabel(gapLevel1)}、重点 {minutesLabel(gapLevel2)}；有新喂奶记录会自动重置。{pushStatus?.lastFeedAt ? `距上次喂奶：${feedingGapLabel}。` : '暂无喂奶记录，记录后自动按间隔提醒。'}</p>
          <footer className="push-rule-actions">
            <button type="button" className="btn secondary" disabled={testingKey === 'level1'} onClick={() => handleTestFeedingGap('level1')}>{testingKey === 'level1' ? '发送中…' : '🟡 轻度测试'}</button>
            <button type="button" className="btn secondary" disabled={testingKey === 'level2'} onClick={() => handleTestFeedingGap('level2')}>{testingKey === 'level2' ? '发送中…' : '🔴 重点测试'}</button>
          </footer>
        </article>

        <article className="push-rule-row">
          <header className="push-rule-head">
            <div><b>用药护理</b><small>到点提醒吃药、推拿等定时照护</small></div>
            <Switch checked={pushStatus?.careItemEnabled ?? true} label="用药护理提醒开关" disabled={savingKey !== null} onChange={value => void persist('rule-care', { careItemEnabled: value }, value ? '用药护理提醒已开启' : '用药护理提醒已关闭')} />
          </header>
          <footer className="push-rule-actions">
            <button type="button" className="btn secondary" disabled={testingKey === 'care-item'} onClick={handleTestCareItem}>{testingKey === 'care-item' ? '发送中…' : '发送测试'}</button>
          </footer>
        </article>
      </div>
    </section>

    <section className="settings-card push-channels-card">
      <div>
        <h2>接收通道</h2>
        <p>提醒规则触发后按通道送达；各通道独立开关，互不影响。</p>
      </div>

      <article className="push-channel-row">
        <header className="push-channel-head">
          <div><b>微信推送</b><small>PushPlus 服务号消息，需配置 Token</small></div>
          {pushStatus?.pushplusConfigured
            ? <Switch checked={pushStatus.enabled} label="微信推送通道开关" disabled={savingKey !== null} onChange={value => void persist('channel-toggle', { enabled: value }, value ? '微信推送已开启' : '微信推送已关闭')} />
            : <span className="push-channel-badge">未配置</span>}
        </header>
        <form className="push-channel-fields" onSubmit={event => { event.preventDefault(); void saveChannel(false); }}>
          <label>
            用户 Token
            <div className="secret-field">
              <input
                type={showToken ? 'text' : 'password'}
                value={token}
                onChange={event => setToken(event.target.value)}
                placeholder={pushStatus?.pushplusConfigured ? `已保存 ${pushStatus.pushplusTokenMasked || 'Token'}，留空不修改` : '从 pushplus.plus 复制的用户 Token'}
                autoComplete="off"
              />
              <button type="button" onClick={() => setShowToken(value => !value)}>{showToken ? '隐藏' : '显示'}</button>
            </div>
          </label>
          <label>
            话题编码 <span>选填</span>
            <input
              type="text"
              value={topic}
              onChange={event => setTopic(event.target.value)}
              placeholder={pushStatus?.pushplusTopic ? `已保存：${pushStatus.pushplusTopic}，留空不修改` : '填写后，订阅该话题的家人都会收到'}
              autoComplete="off"
            />
          </label>
          <div className="push-channel-actions">
            <button type="submit" className="btn secondary" disabled={savingKey !== null || !channelDirty}>{savingKey === 'channel' ? '保存中…' : '保存配置'}</button>
            {pushStatus?.pushplusConfigured && <button type="button" className="btn secondary" disabled={savingKey !== null} onClick={() => void saveChannel(true)}>清除配置</button>}
          </div>
        </form>
        <small className="field-help">
          在 <a href="https://www.pushplus.plus" target="_blank" rel="noreferrer">pushplus.plus</a> 扫码登录拿 Token；进入「一对多消息」新建 topic，家人扫话题二维码加入即可在普通微信里收到提醒。
        </small>
      </article>

      <article className="push-channel-row">
        <header className="push-channel-head">
          <div><b>APP 通知</b><small>推送到本机通知栏，免服务器配置</small></div>
          {onOpenAppNotifications
            ? <button type="button" className="btn secondary" onClick={onOpenAppNotifications}>本机设置</button>
            : <span className="push-channel-badge">仅 APP 内</span>}
        </header>
        <p className="push-rule-meta">提醒类型可在每台手机上单独开关，不影响其他家人。</p>
      </article>
    </section>

    <section className="settings-card push-runtime-card">
      <div className="setting-status">
        <div>
          <h2>运行状态</h2>
          <p>今日已推送 {pushStatus?.todayPushedItems ?? 0} 条。</p>
        </div>
        <span className={pushStatus?.schedulerRunning ? 'on' : ''}>{!pushStatus ? '读取中' : pushStatus.schedulerRunning ? '调度运行中' : '调度未启动'}</span>
      </div>
      <dl className="push-status-dl">
        <div><dt>上次检查</dt><dd>{pushStatus?.lastCheckAt ? new Date(pushStatus.lastCheckAt).toLocaleString('zh-CN') : '暂无'}</dd></div>
        <div><dt>距上次喂奶</dt><dd>{feedingGapLabel}</dd></div>
        <div><dt>微信通道</dt><dd>{pushStatus?.pushplusConfigured ? (pushStatus.enabled ? '已开启' : '已关闭') : '未配置 Token'}</dd></div>
        <div><dt>最近更新</dt><dd>{pushStatus?.updatedAt ? new Date(pushStatus.updatedAt).toLocaleString('zh-CN') : '未修改过'}</dd></div>
      </dl>
      <div className="push-runtime-actions">
        <button type="button" className="btn secondary" onClick={refresh}>刷新状态</button>
      </div>
    </section>

    <Feedback message={message?.text || ''} type={message?.error ? 'error' : 'success'} onClose={() => setMessage(null)} />
  </>;
}

function NativeNotificationSettingsCard({ superadmin }: { superadmin: boolean }) {
  const [permission, setPermission] = useState<NativeNotificationPermission>(() => getNativeNotificationPermission());
  const [settings, setSettings] = useState<NativeNotificationSettings>(() => getNativeNotificationSettings());
  const [message, setMessage] = useState('');
  useEffect(() => {
    const update = (event: Event) => {
      const status = (event as CustomEvent<NativeNotificationPermission>).detail;
      setPermission(status || getNativeNotificationPermission());
      setMessage(status === 'granted' ? '通知权限已开启' : '未允许通知，可以稍后在系统设置中开启');
    };
    window.addEventListener('babycare:native-notification-permission', update);
    return () => window.removeEventListener('babycare:native-notification-permission', update);
  }, []);
  function requestPermission() {
    setMessage('');
    requestNativeNotificationPermission();
    window.setTimeout(() => setPermission(getNativeNotificationPermission()), 500);
  }
  function change(key: keyof NativeNotificationSettings, value: boolean) {
    const next = { ...settings, [key]: value };
    setSettings(next);
    saveNativeNotificationSettings(next);
    setMessage('已保存到当前手机');
  }
  function testNotification(type: NativeNotificationType, label: string) {
    setMessage(`已发送${label}测试通知，请查看手机通知栏`);
    showNativeCategoryTestNotification(type);
  }
  const rows: Array<{ key: NativeNotificationType; label: string; description: string }> = [
    { key: 'morning', label: '宝宝早报', description: '昨日喂奶统计、今日待办和疫苗安排' },
    { key: 'feeding', label: '喂奶提醒', description: '达到设置的喂奶间隔时提醒' },
    { key: 'care', label: '用药与照护', description: '计划时间到达且尚未完成时提醒' },
    { key: 'vaccine', label: '疫苗预约', description: '已预约疫苗在接种前一天提醒' }
  ];
  return <section className="settings-card native-notification-card">
    <div className="setting-status"><div><h2>APP 通知</h2><p>每台手机可以独立选择接收的提醒。</p></div><span className={permission === 'granted' ? 'on' : ''}>{permission === 'granted' ? '已允许' : '待开启'}</span></div>
    {permission !== 'granted' && <button type="button" className="btn primary" onClick={requestPermission}>开启 APP 通知</button>}
    <div className="form-switch-row"><div><label>接收 APP 通知</label><small>关闭后，当前手机不显示任何照护通知</small></div><Switch checked={settings.all} label="接收 APP 通知" onChange={value => change('all', value)} /></div>
    <div className="native-notification-list">{rows.map(row => <div className="native-notification-row" key={row.key}><div><b>{row.label}</b><small>{row.description}</small></div><div className="native-notification-controls"><Switch checked={settings[row.key]} label={`${settings[row.key] ? '关闭' : '开启'}${row.label}`} disabled={!settings.all} onChange={value => change(row.key, value)} />{superadmin && <button type="button" className="btn secondary" disabled={permission !== 'granted' || !settings.all || !settings[row.key]} onClick={() => testNotification(row.key, row.label)}>测试</button>}</div></div>)}</div>
    <div className="native-notification-info"><p>早报、喂奶和照护提醒由 APP 约每 15 分钟同步一次，可能略有延迟；疫苗预约提醒保存在当前手机。设置不影响 PushPlus。</p></div>
    <Feedback message={message} type="success" onClose={() => setMessage('')} />
  </section>;
}

type SettingsSection = 'root' | 'family' | 'care-items' | 'vaccines' | 'ai' | 'backup' | 'push' | 'baby' | 'app-notifications' | 'appearance';
type SettingsIconName = 'medicine' | 'vaccine' | 'profile' | 'members' | 'ai' | 'backup' | 'bell' | 'send' | 'server' | 'logout' | 'monitor' | 'refresh';

function SettingsIcon({ name }: { name: SettingsIconName }) {
  // 使用 Lucide React 线性图标，统一 strokeWidth 1.8，与设计系统的圆角/圆润风格一致
  const mapping: Record<SettingsIconName, typeof Pill> = {
    medicine: Pill,
    vaccine: Syringe,
    profile: Baby,
    members: Users,
    ai: Bot,
    backup: Save,
    bell: Bell,
    send: Send,
    server: Server,
    logout: LogOut,
    monitor: Monitor,
    refresh: RefreshCw,
  };
  const Component = mapping[name];
  return createElement(Component, { size: 22, strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true });
}

function SettingsEntry({ icon, title, description, status, danger = false, showChevron = true, onClick }: { icon: SettingsIconName; title: string; description: string; status?: string; danger?: boolean; showChevron?: boolean; onClick(): void }) {
  return <button type="button" className={`settings-entry${danger ? ' danger' : ''}`} onClick={onClick}><span className="settings-entry-icon"><SettingsIcon name={icon} /></span><span><b>{title}</b><small>{description}</small></span><em>{status || ''}</em><i aria-hidden="true">{showChevron ? '›' : ''}</i></button>;
}

function SettingsView({ profile, careItems, vaccineCatalog, capabilities, user, pushStatus, theme, onThemeChange, onProfileSaved, onVaccineCatalogChanged, onCapabilitiesChanged, onCareItemsChanged, onImported, onLogout, onRefreshPush, onTestMorning, onTestFeedingGap, onTestCareItem, onSavePush }: { profile: Profile; careItems: CareItem[]; vaccineCatalog: VaccineCatalogItem[]; capabilities: Capabilities; user: SessionUser; pushStatus: PushStatus | null; theme: ThemeMode; onThemeChange(value: ThemeMode): void; onProfileSaved(value: Profile): void; onVaccineCatalogChanged(): Promise<void>; onCapabilitiesChanged(): Promise<void>; onCareItemsChanged(): Promise<void>; onImported(): void | Promise<void>; onLogout(): void; onRefreshPush(): Promise<void>; onTestMorning(): Promise<{ message: string }>; onTestFeedingGap(level: 'level1' | 'level2'): Promise<{ message: string }>; onTestCareItem(): Promise<{ message: string }>; onSavePush(data: PushSettingsPatch): Promise<PushStatus> }) {
  const [section, setSection] = useState<SettingsSection>('root'); const pushedRef = useRef(false);
  const nativeBridge = window.BabyCareNative;
  const nativeNotificationsAvailable = Boolean(nativeBridge?.getNotificationPermissionStatus && nativeBridge?.requestNotificationPermission && nativeBridge?.showTestNotification && nativeBridge?.getAppNotificationSettings && nativeBridge?.saveAppNotificationSettings);
  let nativeEnvironment = '';
  try { nativeEnvironment = nativeBridge?.getEnvironmentLabel() || ''; } catch { nativeEnvironment = ''; }
  useEffect(() => { const pop = () => { pushedRef.current = false; setSection('root'); }; window.addEventListener('popstate', pop); return () => { window.removeEventListener('popstate', pop); if (pushedRef.current) window.history.back(); }; }, []);
  const member = familyMembers.find(item => item.id === user.id)!;
  function open(next: Exclude<SettingsSection, 'root'>) { window.history.pushState({ babycareSettings: next }, ''); pushedRef.current = true; setSection(next); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  function back() { if (pushedRef.current) window.history.back(); else setSection('root'); }
  const pushEntryStatus = (() => {
    if (!pushStatus) return '未配置';
    if (!pushStatus.pushplusConfigured) return '未配置';
    return pushStatus.enabled ? '已开启' : '已关闭';
  })();
  const nativeNotificationPermission = nativeNotificationsAvailable ? getNativeNotificationPermission() : 'unavailable';
  const subTitles: Record<Exclude<SettingsSection, 'root'>, string> = { baby: '宝宝资料', family: '成员权限', 'care-items': '用药护理', vaccines: '疫苗管理', ai: 'AI 模型', backup: '数据备份', push: '消息推送', 'app-notifications': 'APP 通知', appearance: '外观主题' };
  if (section !== 'root') return <div className="page-stack settings-subpage"><header className="subpage-head"><button type="button" onClick={back} aria-label="返回设置">←</button><div><p className="kicker">设置</p><h1>{subTitles[section]}</h1></div></header><div className="settings-grid">
    {section === 'baby' && <ProfileSettingsCard profile={profile} onSaved={onProfileSaved} />}
    {section === 'family' && <FamilyPermissionsCard />}
    {section === 'care-items' && <><CareItemsCard items={careItems} onChanged={onCareItemsChanged} /><CareAdherenceCard /></>}
    {section === 'vaccines' && canManage(user) && <VaccineSettingsCard catalog={vaccineCatalog} manager onCatalogChanged={onVaccineCatalogChanged} />}
    {section === 'ai' && <AiSettingsCard capabilities={capabilities} onChanged={onCapabilitiesChanged} />}
    {section === 'backup' && <ServerBackupCard onImported={onImported} />}
    {section === 'push' && <PushSettingsCard pushStatus={pushStatus} onRefresh={onRefreshPush} onTestMorning={onTestMorning} onTestFeedingGap={onTestFeedingGap} onTestCareItem={onTestCareItem} onSave={onSavePush} onOpenAppNotifications={nativeNotificationsAvailable ? () => open('app-notifications') : undefined} />}
    {section === 'app-notifications' && nativeNotificationsAvailable && <NativeNotificationSettingsCard superadmin={user.role === 'superadmin'} />}
    {section === 'appearance' && <AppearanceSettingsCard theme={theme} onChange={onThemeChange} />}
  </div></div>;
  return <div className="page-stack settings-home"><header className="page-head"><h1>设置</h1><p>{user.role === 'superadmin' ? '管理家庭成员、照护项目和服务器。' : user.role === 'admin' ? '管理宝宝资料、用药项目和已删除记录。' : '查看当前身份和权限。'}</p></header><section className="account-card"><img src={member.icon} alt="" /><div><span>当前身份与权限</span><h2>{user.name}</h2><p>{roleNames[user.role]}</p></div><i>{canManage(user) ? '管理权限' : '记录权限'}</i></section>
    {user.role === 'admin' && <section className="settings-card permission-note"><p className="kicker">管理权限</p><h2>管理日常照护</h2><p>可编辑宝宝资料、管理用药项目和回收站，也可管理消息推送。家庭权限、AI 模型和备份仅超管可操作。</p></section>}
    {user.role === 'member' && <section className="settings-card permission-note"><p className="kicker">普通权限</p><h2>可以记录和修改</h2><p>可查看、添加和修改照护记录；不能删除记录或查看操作历史。</p></section>}
    <div className="settings-menu-stack">
      {canManage(user) && <section className="settings-menu" aria-label="家庭设置"><SettingsEntry icon="profile" title="宝宝资料" description="姓名、生日与基础信息" onClick={() => open('baby')} />{user.role === 'superadmin' && <SettingsEntry icon="members" title="成员权限" description="家庭成员与管理权限" status={`${familyMembers.length} 人`} onClick={() => open('family')} />}</section>}
      {(canManage(user) || nativeNotificationsAvailable) && <section className="settings-menu" aria-label="提醒通知">{canManage(user) && <SettingsEntry icon="send" title="消息推送" description="提醒规则与接收通道" status={pushEntryStatus} onClick={() => open('push')} />}{nativeNotificationsAvailable && <SettingsEntry icon="bell" title="APP 通知" description="早报、喂奶、照护与疫苗提醒" status={nativeNotificationPermission === 'granted' ? '已允许' : '待开启'} onClick={() => open('app-notifications')} />}</section>}
      {canManage(user) && <section className="settings-menu" aria-label="照护设置"><SettingsEntry icon="medicine" title="用药护理" description="分类、计划与项目管理" status={`${careItems.filter(item => item.active).length} 项`} onClick={() => open('care-items')} /><SettingsEntry icon="vaccine" title="疫苗管理" description="目录与接种计划" status={`${vaccineCatalog.filter(item => item.active).length} 项`} onClick={() => open('vaccines')} /></section>}
      {user.role === 'superadmin' && <section className="settings-menu" aria-label="系统设置"><SettingsEntry icon="ai" title="AI 模型" description="模型配置与智能功能" status={capabilities.aiEnabled ? '已配置' : '未配置'} onClick={() => open('ai')} /><SettingsEntry icon="backup" title="数据备份" description="备份、恢复、导入与导出" status="每 6 小时" onClick={() => open('backup')} /></section>}
      <section className="settings-menu" aria-label="APP 设置">
        {nativeBridge && <SettingsEntry icon="server" title="服务器环境" description="切换局域网或外网连接" status={nativeEnvironment} onClick={() => nativeBridge.openServerSettings()} />}
        <SettingsEntry icon="refresh" title="清除缓存" description="清除本地缓存并刷新页面" showChevron={false} onClick={() => {
          try { caches.keys().then(keys => Promise.all(keys.filter(k => !k.includes('babycare-offline')).map(k => caches.delete(k)))); } catch { /* ignore */ }
          window.location.reload();
        }} />
      </section>
      <section className="settings-menu" aria-label="外观设置"><SettingsEntry icon="monitor" title="外观主题" description="浅色 / 深色 / 跟随系统" status={theme === 'light' ? '浅色' : theme === 'dark' ? '深色' : '跟随系统'} onClick={() => open('appearance')} /></section>
      <section className="settings-menu logout-menu" aria-label="账号操作"><SettingsEntry icon="logout" title="退出登录" description="退出当前家庭身份" danger showChevron={false} onClick={onLogout} /></section>
    </div>
  </div>;
}

function AppearanceSettingsCard({ theme, onChange }: { theme: ThemeMode; onChange(value: ThemeMode): void }) {
  const options: { value: ThemeMode; label: string }[] = [
    { value: 'light', label: '浅色' },
    { value: 'dark', label: '深色' },
    { value: 'system', label: '跟随系统' },
  ];
  return <section className="settings-card">
    <h2>外观主题</h2>
    <p>选择浅色或深色模式，也可以跟随系统自动切换。</p>
    <div style={{ marginTop: 14 }}>
      <SegmentedControl label="主题模式" value={theme} options={options} onChange={onChange} />
    </div>
  </section>;
}

export default SettingsView;
