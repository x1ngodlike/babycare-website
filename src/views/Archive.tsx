// 宝宝档案视图（由 App.tsx 抽出，React.lazy 按需加载）
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type GrowthAssessment, type GrowthIndicatorAssessment } from '../api';
import { calculateAge, isoDay } from '../date';
import { cacheProfile } from '../offline';
import { ActionMenu, confirmAction, EmptyState, ImageWithFallback, Modal, useDirtyClose } from '../ui';
import { DateField, TimeField } from '../DateField';
import { VaccineArchiveSummary } from '../VaccineViews';
import { MilestoneArchiveSummary, MilestoneHistory } from '../MilestoneCard';
import { AvatarCropperModal } from '../AvatarCropper';
import { auditNames, canManage, ChoiceField, sexLabels } from '../shared';
import { GrowthChart } from './GrowthChart';
import type { BabySex, GrowthCurveData, GrowthRecord, Profile, SessionUser, VaccineCatalogItem, VaccineRecord } from '../types';

function ProfileEditor({ profile, onClose, onSaved }: { profile: Profile; onClose(): void; onSaved(value: Profile): void }) {
  const [form, setForm] = useState<Profile>({ ...profile, sex: profile.sex || 'unspecified', nickname: profile.nickname || '', caregiverTitle: profile.caregiverTitle || '妈妈', avatar: profile.avatar ?? null, birthTime: profile.birthTime || '' });
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [cropperSrc, setCropperSrc] = useState<string | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dirty = form.name !== profile.name || form.birthDate !== profile.birthDate || form.sex !== (profile.sex || 'unspecified') || (form.nickname ?? '') !== (profile.nickname ?? '') || (form.birthTime ?? '') !== (profile.birthTime ?? '');
  const requestClose = useDirtyClose(dirty, onClose, busy, { description: '宝宝资料的修改不会保存。' });
  async function submit(event: React.FormEvent) { event.preventDefault(); setBusy(true); setError(''); try { const next = await api.updateProfile({ name: form.name, birthDate: form.birthDate, birthTime: form.birthTime || undefined, sex: form.sex, nickname: form.nickname, caregiverTitle: form.caregiverTitle }); cacheProfile(next); onSaved(next); onClose(); } catch (err) { setError(err instanceof Error ? err.message : '保存失败'); setBusy(false); } }
  function pickFile() { fileInputRef.current?.click(); }
  function onFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; if (!file) return;
    if (!file.type.startsWith('image/')) { setError('请选择图片文件'); return; }
    if (file.size > 8 * 1024 * 1024) { setError('图片不能大于 8MB'); return; }
    const reader = new FileReader();
    reader.onload = () => setCropperSrc(String(reader.result));
    reader.onerror = () => setError('图片读取失败');
    reader.readAsDataURL(file);
    event.target.value = '';
  }
  async function onCropperConfirm(file: File) {
    setAvatarBusy(true); setCropperSrc(null);
    try { const result = await api.uploadAvatar(file); setForm(prev => ({ ...prev, avatar: result.url })); cacheProfile(result.profile); onSaved(result.profile); }
    catch (err) { setError(err instanceof Error ? err.message : '头像上传失败'); }
    finally { setAvatarBusy(false); }
  }
  async function removeAvatarClick() {
    if (!await confirmAction({ title: '移除宝宝头像？', description: '将使用默认插画作为头像。', confirmLabel: '移除头像', danger: true })) return;
    setAvatarBusy(true);
    try { const result = await api.removeAvatar(); setForm(prev => ({ ...prev, avatar: null })); cacheProfile(result.profile); onSaved(result.profile); }
    catch (err) { setError(err instanceof Error ? err.message : '头像移除失败'); }
    finally { setAvatarBusy(false); }
  }
  return <Modal title="修改基本资料" kicker="宝宝档案" onClose={() => void requestClose()}><form className="editor-form" onSubmit={submit}>
    <div className="avatar-upload-area">
      <div className="avatar-preview" aria-label="当前头像">
        <ImageWithFallback src={form.avatar || undefined} fallbackSrc="/bear-bottle.png" alt="" />
      </div>
      <div className="avatar-actions">
        <button type="button" className="btn secondary" onClick={pickFile} disabled={avatarBusy}>{avatarBusy ? '处理中…' : '上传头像'}</button>
        {form.avatar && <button type="button" className="btn danger-button secondary" onClick={() => void removeAvatarClick()} disabled={avatarBusy}>移除</button>}
      </div>
      <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={onFileChange} />
    </div>
    <label>宝宝姓名<input value={form.name} maxLength={30} onChange={event => setForm({ ...form, name: event.target.value })} required /></label>
    <label>昵称<small className="field-hint">亲切的小名，首页会优先展示</small><input value={form.nickname ?? ''} maxLength={20} placeholder="如 小糯米" onChange={event => setForm({ ...form, nickname: event.target.value })} /></label>
    <ChoiceField label="宝宝性别" values={['male', 'female', 'unspecified'] as BabySex[]} selected={form.sex} onSelect={sex => setForm({ ...form, sex })} getLabel={sex => sex === 'unspecified' ? '未设置' : sexLabels[sex]} />
    <DateField label="出生日期" max={isoDay(new Date())} value={form.birthDate} onChange={birthDate => setForm({ ...form, birthDate })} />
    <TimeField label="出生时间" value={form.birthTime ?? ''} onChange={birthTime => setForm({ ...form, birthTime })} required={false} />
    {error && <p className="error-text" role="alert">{error}</p>}
    <footer className="editor-actions"><button type="button" className="btn secondary" onClick={() => void requestClose()}>取消</button><button className="btn primary" disabled={busy}>{busy ? '保存中…' : '保存资料'}</button></footer>
  </form>
  {cropperSrc && <AvatarCropperModal imageSrc={cropperSrc} onClose={() => setCropperSrc(null)} onConfirm={file => void onCropperConfirm(file)} />}
  </Modal>;
}

function Pagination({ page, totalPages, onChange }: { page: number; totalPages: number; onChange(page: number): void }) {
  if (totalPages <= 1) return null;
  return <nav className="pagination" aria-label="成长记录分页"><button disabled={page <= 1} onClick={() => onChange(page - 1)}><ChevronLeft size={14} strokeWidth={2.2} /> 上一页</button><span>第 {page} / {totalPages} 页</span><button disabled={page >= totalPages} onClick={() => onChange(page + 1)}>下一页 <ChevronRight size={14} strokeWidth={2.2} /></button></nav>;
}

function GrowthDelta({ value, digits, unit }: { value: number; digits: number; unit: string }) {
  const direction = value > 0 ? 'up' : value < 0 ? 'down' : 'flat';
  return <small className={`growth-delta ${direction}`} aria-label={`较上次${value > 0 ? '增加' : value < 0 ? '减少' : '无变化'}${Math.abs(value).toFixed(digits)}${unit}`}>{value > 0 ? '+' : ''}{value.toFixed(digits)} {unit}</small>;
}

function ArchiveView({ profile, growthRecords, deletedGrowthRecords, vaccineRecords, vaccineCatalog, user, archiveMode, setArchiveMode, onOpenVaccines, onEditGrowth, onAddGrowth, onDeleteGrowth, onRestoreGrowth, onPurgeGrowth, onProfileSaved }: { profile: Profile; growthRecords: GrowthRecord[]; deletedGrowthRecords: GrowthRecord[]; vaccineRecords: VaccineRecord[]; vaccineCatalog: VaccineCatalogItem[]; user: SessionUser; archiveMode: 'main' | 'milestone'; setArchiveMode(value: 'main' | 'milestone'): void; onOpenVaccines(): void; onEditGrowth(record: GrowthRecord): void; onAddGrowth(): void; onDeleteGrowth(record: GrowthRecord): Promise<void>; onRestoreGrowth(record: GrowthRecord): Promise<void>; onPurgeGrowth(record: GrowthRecord): Promise<void>; onProfileSaved(value: Profile): void }) {
  const [editingProfile, setEditingProfile] = useState(false); const [showDeleted, setShowDeleted] = useState(false);
  const [growthPage, setGrowthPage] = useState(1); const [deletedPage, setDeletedPage] = useState(1);
  const [growthCurve, setGrowthCurve] = useState<GrowthCurveData | null>(null);
  const previousGrowthCount = useRef(growthRecords.length);
  const deletedArchivePushed = useRef(false);
  const todayGrowth = growthRecords.find(record => record.measuredOn === isoDay(new Date()));
  const growthPages = Math.max(1, Math.ceil(growthRecords.length / 5));
  const deletedPages = Math.max(1, Math.ceil(deletedGrowthRecords.length / 10));
  const visibleGrowthRecords = growthRecords.slice((growthPage - 1) * 5, growthPage * 5);
  const visibleDeletedRecords = deletedGrowthRecords.slice((deletedPage - 1) * 10, deletedPage * 10);

  useEffect(() => {
    setGrowthPage(page => growthRecords.length > previousGrowthCount.current ? 1 : Math.min(page, growthPages));
    previousGrowthCount.current = growthRecords.length;
  }, [growthPages, growthRecords.length]);
  useEffect(() => setDeletedPage(page => Math.min(page, deletedPages)), [deletedPages]);
  useEffect(() => { if (archiveMode === 'main') api.growthCurve().then(setGrowthCurve).catch(() => undefined); }, [archiveMode, growthRecords.length]);
  useEffect(() => { const pop = () => { deletedArchivePushed.current = false; setShowDeleted(false); }; window.addEventListener('popstate', pop); return () => { window.removeEventListener('popstate', pop); if (deletedArchivePushed.current) window.history.back(); }; }, []);
  function openDeletedArchive() { window.history.pushState({ babycareGrowthDeleted: true }, ''); deletedArchivePushed.current = true; setShowDeleted(true); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  function closeDeletedArchive() { if (deletedArchivePushed.current && window.history.state?.babycareGrowthDeleted) window.history.back(); else { deletedArchivePushed.current = false; setShowDeleted(false); } }

  if (archiveMode === 'milestone') {
    return <MilestoneHistory profile={profile} manager={canManage(user)} onBack={() => setArchiveMode('main')} />;
  }
  if (showDeleted && canManage(user)) return <div className="page-stack archive-page"><header className="subpage-head"><button onClick={closeDeletedArchive} aria-label="返回宝宝档案">←</button><div><p className="kicker">宝宝档案</p><h1>已删除的成长记录</h1></div></header><section className="growth-history growth-deleted-page">{deletedGrowthRecords.length ? <div className="growth-deleted-list">{visibleDeletedRecords.map(record => <article key={record.id}><span>{new Date(`${record.measuredOn}T12:00:00`).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })}</span><b>{record.heightCm} cm · {record.weightKg} kg</b><button className="btn secondary" onClick={() => void onRestoreGrowth(record)}>恢复</button><button className="btn danger-button" onClick={() => void onPurgeGrowth(record)}>彻底删除</button></article>)}</div> : <EmptyState title="没有已删除的成长记录" description="删除的记录会保留在这里。" image="/illustrations/empty-records.webp" />}<Pagination page={deletedPage} totalPages={deletedPages} onChange={setDeletedPage} /></section></div>;

  return <div className="page-stack archive-page">
    <header className="page-head"><h1>宝宝档案</h1><p>集中查看基本资料和成长变化。</p></header>
    <section className="archive-profile"><p className="kicker">基本资料</p><div className="archive-profile-head"><div className="archive-profile-avatar" aria-label="宝宝头像"><ImageWithFallback src={profile.avatar || undefined} fallbackSrc="/bear-bottle.png" alt="" /></div><div className="archive-profile-meta"><h2>{profile.name}{profile.nickname?.trim() ? <small className="nickname"> · {profile.nickname.trim()}</small> : null}</h2><p className="archive-profile-summary">{sexLabels[profile.sex || 'unspecified']} · {calculateAge(profile.birthDate)} · 出生于 {profile.birthDate.replaceAll('-', '.')}</p></div></div></section>
    <MilestoneArchiveSummary profile={profile} onOpen={() => setArchiveMode('milestone')} />
    <VaccineArchiveSummary profile={profile} records={vaccineRecords} catalog={vaccineCatalog} onOpen={onOpenVaccines} />
    <GrowthAssessmentCard user={user} growthRecords={growthRecords} />
    <GrowthChart data={growthCurve} />
    <section className="growth-history">
      <div className="section-title"><h2>成长记录</h2><div className="growth-head-actions">{canManage(user) && <button className="deleted-records-link" onClick={openDeletedArchive}>已删除 {deletedGrowthRecords.length} 条</button>}<button className="btn secondary section-add-button" onClick={() => todayGrowth ? onEditGrowth(todayGrowth) : onAddGrowth()}>{!todayGrowth && <Plus aria-hidden="true" />}{todayGrowth ? '修改成长' : '记录成长'}</button></div></div>
      {growthRecords.length ? <div className="growth-list">{visibleGrowthRecords.map(record => { const recordIndex = growthRecords.findIndex(item => item.id === record.id); const previous = growthRecords[recordIndex + 1]; const curveRecord = growthCurve?.records?.find(r => r.id === record.id); return <article key={record.id}><time>{new Date(`${record.measuredOn}T12:00:00`).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })}<small>{calculateAge(profile.birthDate, new Date(`${record.measuredOn}T12:00:00`))}</small><small>{auditNames[record.createdBy]}录入</small></time><div><span>身高</span><b>{record.heightCm} cm</b>{previous && <GrowthDelta value={record.heightCm - previous.heightCm} digits={1} unit="cm" />}{curveRecord?.heightPercentile != null && <small className="growth-percentile">P{curveRecord.heightPercentile} · {curveRecord.heightBand}</small>}</div><div><span>体重</span><b>{record.weightKg} kg</b>{previous && <GrowthDelta value={record.weightKg - previous.weightKg} digits={2} unit="kg" />}{curveRecord?.weightPercentile != null && <small className="growth-percentile">P{curveRecord.weightPercentile} · {curveRecord.weightBand}</small>}</div><ActionMenu label={`${record.measuredOn}成长记录操作`} items={[{ label: '修改记录', onSelect: () => onEditGrowth(record) }, ...(canManage(user) ? [{ label: '删除记录', danger: true, onSelect: () => onDeleteGrowth(record) }] : [])]} /></article>; })}</div> : <EmptyState title="还没有成长记录" description="可以从今日开始记录身高和体重。" image="/illustrations/empty-records.webp" />}
      <Pagination page={growthPage} totalPages={growthPages} onChange={setGrowthPage} />
    </section>
    {editingProfile && <ProfileEditor profile={profile} onClose={() => setEditingProfile(false)} onSaved={onProfileSaved} />}
  </div>;
}

function growthMarkerPosition(value: number, anchors: GrowthIndicatorAssessment['anchors']): number {
  const stops: [number, number][] = [[anchors.minus2sd, 0], [anchors.minus1sd, 25], [anchors.median, 50], [anchors.plus1sd, 75], [anchors.plus2sd, 100]];
  if (value <= stops[0][0]) return 1;
  for (let index = 1; index < stops.length; index += 1) {
    const [limit, percent] = stops[index];
    if (value <= limit) {
      const [previousLimit, previousPercent] = stops[index - 1];
      return limit === previousLimit ? percent : previousPercent + ((value - previousLimit) / (limit - previousLimit)) * (percent - previousPercent);
    }
  }
  return 99;
}

function GrowthIndicatorBar({ label, unit, indicator }: { label: string; unit: string; indicator: GrowthIndicatorAssessment }) {
  const position = growthMarkerPosition(indicator.value, indicator.anchors);
  const anchorLabel = (value: number) => Math.round(value * 10) / 10;
  return <div className="ga-indicator">
    <div className="ga-indicator-head"><span>{label}</span><b>{indicator.value} {unit}</b><em className={`ga-band ${indicator.band}`}>{indicator.bandLabel}</em></div>
    <div className="ga-track" role="img" aria-label={`${label} ${indicator.value} ${unit}，在同龄宝宝中属于${indicator.bandLabel}水平`}>
      <i className="ga-seg edge" /><i className="ga-seg core" /><i className="ga-seg core" /><i className="ga-seg edge" />
      <span className="ga-marker" style={{ left: `${position}%` }} />
    </div>
    <div className="ga-scale"><span>-2SD {anchorLabel(indicator.anchors.minus2sd)}</span><span>-1SD {anchorLabel(indicator.anchors.minus1sd)}</span><span>中位 {anchorLabel(indicator.anchors.median)}</span><span>+1SD {anchorLabel(indicator.anchors.plus1sd)}</span><span>+2SD {anchorLabel(indicator.anchors.plus2sd)}</span></div>
  </div>;
}

function GrowthMilkBar({ milk }: { milk: NonNullable<GrowthAssessment['milk']> }) {
  const domain = Math.max(milk.referenceMax * 1.15, milk.avgDailyMl * 1.08, 1);
  const hasData = milk.daysCounted > 0;
  const inRange = milk.avgDailyMl >= milk.referenceMin && milk.avgDailyMl <= milk.referenceMax;
  const below = hasData && !inRange && milk.avgDailyMl < milk.referenceMin;
  const above = hasData && !inRange && !below;
  const zoneLeft = milk.referenceMin / domain * 100;
  const zoneRight = milk.referenceMax / domain * 100;
  const zoneLabelLeft = Math.min(78, Math.max(22, (zoneLeft + zoneRight) / 2));
  return <div className="ga-indicator">
    <div className="ga-indicator-head"><span>奶量 · 近 7 天平均</span><b>{hasData ? `${milk.avgDailyMl} mL/天` : '暂无数据'}</b>{hasData && <em className={`ga-band ${inRange ? 'mid' : above ? 'high' : 'low'}`}>{inRange ? '参考范围内' : above ? '高于参考' : '低于参考'}</em>}</div>
    <div className="ga-track ga-track-milk" role="img" aria-label={`近 7 天平均每天奶量 ${milk.avgDailyMl} 毫升，参考范围 ${milk.referenceMin} 到 ${milk.referenceMax} 毫升${hasData ? inRange ? '，处于参考范围内' : above ? '，高于参考范围' : '，低于参考范围' : ''}`}>
      {above && <span className="ga-danger-zone" style={{ left: `${zoneRight}%`, width: `${100 - zoneRight}%` }} />}
      {below && <span className="ga-danger-zone" style={{ left: 0, width: `${zoneLeft}%` }} />}
      <span className="ga-zone" style={{ left: `${zoneLeft}%`, width: `${zoneRight - zoneLeft}%` }} />
      {hasData && <span className={`ga-marker${inRange ? '' : ' alert'}`} style={{ left: `${Math.min(98, Math.max(2, milk.avgDailyMl / domain * 100))}%` }} />}
    </div>
    <div className="ga-scale ga-scale-milk"><span className="ga-zone-label" style={{ left: `${zoneLabelLeft}%` }}>参考 {milk.referenceMin}–{milk.referenceMax} mL</span></div>
    <p className="ga-milk-note">{hasData ? `按近 7 天里 ${milk.daysCounted} 天有喂养记录的日总量取平均。` : '今天往前 7 天还没有喂奶记录，记录后会自动对比。'}</p>
  </div>;
}

function GrowthAssessmentCard({ user, growthRecords }: { user: SessionUser; growthRecords: GrowthRecord[] }) {
  const [assessment, setAssessment] = useState<GrowthAssessment | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setLoadError('');
    try { setAssessment(await api.growthAssessment()); }
    catch (error) { setLoadError(error instanceof Error ? error.message : '生长对比加载失败'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load, growthRecords]);
  async function generate() {
    if (!assessment?.latestRecordId || generating) return;
    setGenerating(true); setGenerateError('');
    try {
      const result = await api.generateGrowthEvaluation(assessment.latestRecordId);
      setAssessment(current => current ? { ...current, evaluation: result.evaluation } : current);
    } catch (error) {
      setGenerateError(error instanceof Error ? error.message : 'AI 评价生成失败');
    } finally { setGenerating(false); }
  }
  if (loading && !assessment) return <section className="growth-assessment-card"><div className="section-title"><h2>生长对比</h2></div><p className="ga-note">正在加载生长对比…</p></section>;
  if (loadError) return <section className="growth-assessment-card"><div className="section-title"><h2>生长对比</h2></div><p className="ga-note error">{loadError}</p></section>;
  if (assessment && !assessment.available) {
    if (assessment.reason === 'no_records') return null;
    const hint = assessment.reason === 'no_sex' ? '在宝宝资料里设置性别后，这里会展示身高体重与中国《7岁以下儿童生长标准》的对比。' : `月龄超过 ${assessment.maxMonths} 个月（6 岁 9 月），暂不支持生长标准对比。`;
    return <section className="growth-assessment-card"><div className="section-title"><h2>生长对比</h2></div><p className="ga-note">{hint}</p></section>;
  }
  if (!assessment) return null;
  const evaluation = assessment.evaluation ?? null;
  return <section className="growth-assessment-card">
    <div className="section-title"><h2>生长对比</h2><span className="ga-measured">测量于 {new Date(`${assessment.measuredOn}T12:00:00`).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })} · 月龄 {assessment.ageMonths}</span></div>
    <GrowthIndicatorBar label="身高" unit="cm" indicator={assessment.height!} />
    <GrowthIndicatorBar label="体重" unit="kg" indicator={assessment.weight!} />
    {assessment.milk && <GrowthMilkBar milk={assessment.milk} />}
    <div className="ga-evaluation">
      <div className="ga-eval-head"><h3>AI 生长评价</h3>{canManage(user) && <button className="text-button" onClick={() => void generate()} disabled={generating}>{generating ? '生成中…' : evaluation ? '重新生成' : '生成评价'}</button>}</div>
      <p aria-live="polite">{generateError ? <span className="ga-note error">{generateError}</span> : evaluation ? null : <span className="ga-note">{canManage(user) ? '生成后在这里查看对本次测量的解读。' : '管理员生成后，这里会展示对本次测量的解读。'}</span>}</p>
      {evaluation && <>
        <p className="ga-eval-text">{evaluation.text}</p>
        {evaluation.evaluatedAt && <p className="ga-eval-meta">AI 生成 · {new Date(evaluation.evaluatedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>}
      </>}
    </div>
    <p className="ga-disclaimer">区间基于国家卫生行业标准《7岁以下儿童生长标准》（WS/T 423-2022）和常见喂养参考，仅供参考，不能替代儿保医生评估。</p>
  </section>;
}

export default ArchiveView;
