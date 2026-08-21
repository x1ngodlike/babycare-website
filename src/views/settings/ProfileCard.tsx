// 宝宝资料设置卡（由 Settings.tsx 抽出，逻辑不变）
import { useEffect, useRef, useState } from 'react';
import { api } from '../../api';
import { isoDay } from '../../date';
import { cacheProfile } from '../../offline';
import { ChoiceField, sexLabels } from '../../shared';
import { confirmAction } from '../../ui';
import { DateField, TimeField } from '../../DateField';
import { AvatarCropperModal } from '../../AvatarCropper';
import { Feedback } from './Feedback';
import type { BabySex, Profile } from '../../types';

export function ProfileSettingsCard({ profile, onSaved }: { profile: Profile; onSaved(value: Profile): void }) {
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
  return <section className="settings-card profile-settings-card"><div className="setting-status"><h2>宝宝资料</h2></div>
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
      <footer className="editor-actions single-action" style={{ marginTop: 16 }}><button className="btn primary full" disabled={busy || avatarBusy}>{busy ? '保存中…' : '保存资料'}</button></footer>
    </form>
    {cropperSrc && <AvatarCropperModal imageSrc={cropperSrc} onClose={() => setCropperSrc(null)} onConfirm={file => void onCropperConfirm(file)} />}
  </section>;
}
