// AI 模型设置卡（由 Settings.tsx 抽出，逻辑不变）
import { useEffect, useState } from 'react';
import { api } from '../../api';
import { confirmAction } from '../../ui';
import { Feedback } from './Feedback';
import type { AiSettingsPublic, Capabilities } from '../../types';

export function AiSettingsCard({ capabilities, onChanged }: { capabilities: Capabilities; onChanged(): Promise<void> }) {
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
    <p className="field-help">默认 DeepSeek，也可填写兼容 OpenAI 的接口地址与模型。</p>
    <form onSubmit={save}>
      <label>接口地址<input type="url" inputMode="url" value={baseUrl} onChange={e => setBaseUrl(e.target.value)} required /></label>
      <label>模型名称<input value={model} onChange={e => setModel(e.target.value)} required /></label>
      <label>API 密钥<div className="secret-field"><input type={showKey ? 'text' : 'password'} value={apiKey} onChange={e => setApiKey(e.target.value)} autoComplete="off" placeholder={settings?.configured ? `已保存 ${settings.keyHint}，留空不修改` : '请输入 DeepSeek API 密钥'} /><button type="button" onClick={() => setShowKey(value => !value)}>{showKey ? '隐藏' : '显示'}</button></div></label>
      <div className="model-actions"><button type="button" className="btn secondary" disabled={Boolean(busy)} onClick={test}>{busy === 'test' ? '测试中…' : '测试连接'}</button><button className="btn primary" disabled={Boolean(busy)}>{busy === 'save' ? '保存中…' : '保存配置'}</button></div>
      {settings?.configured && <button type="button" className="text-danger" disabled={Boolean(busy)} onClick={clearKey}>{busy === 'clear' ? '移除中…' : '移除已保存的密钥'}</button>}
      <Feedback message={status?.text || ''} type={status?.error ? 'error' : 'success'} onClose={() => setStatus(null)} />
    </form>
  </section>;
}
