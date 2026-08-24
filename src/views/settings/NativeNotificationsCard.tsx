// APP 通知设置卡（原生 WebView 桥接，由 Settings.tsx 抽出，逻辑不变）
import { useEffect, useState } from 'react';
import { getNativeNotificationPermission, getNativeNotificationSettings, requestNativeNotificationPermission, saveNativeNotificationSettings, showNativeCategoryTestNotification, type NativeNotificationPermission, type NativeNotificationSettings, type NativeNotificationType } from '../../native';
import { Switch } from '../../ui';
import { Feedback } from './Feedback';

export function NativeNotificationSettingsCard({ superadmin }: { superadmin: boolean }) {
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
    <div className="setting-status"><div><h2>APP 通知</h2><p>每台手机可单独选择接收哪些提醒。</p></div><span className={`status-badge ${permission === 'granted' ? 'success' : 'neutral'}`}>{permission === 'granted' ? '已允许' : '待开启'}</span></div>
    {permission !== 'granted' && <button type="button" className="btn primary native-notification-enable" onClick={requestPermission}>开启 APP 通知</button>}
    <div className="form-switch-row"><div><label>接收 APP 通知</label><small>关闭后，当前手机不显示任何照护通知</small></div><Switch checked={settings.all} label="接收 APP 通知" onChange={value => change('all', value)} /></div>
    <div className="native-notification-list">{rows.map(row => <div className="native-notification-row" key={row.key}><div><b>{row.label}</b><small>{row.description}</small></div><div className="native-notification-controls"><Switch checked={settings[row.key]} label={`${settings[row.key] ? '关闭' : '开启'}${row.label}`} disabled={!settings.all} onChange={value => change(row.key, value)} />{superadmin && <button type="button" className="btn secondary" disabled={permission !== 'granted' || !settings.all || !settings[row.key]} onClick={() => testNotification(row.key, row.label)}>测试</button>}</div></div>)}</div>
    <div className="native-notification-info"><p>早报、喂奶和照护提醒由 APP 约每 15 分钟同步一次，可能略有延迟；疫苗预约提醒保存在当前手机。设置不影响 PushPlus。</p></div>
    <Feedback message={message} type="success" onClose={() => setMessage('')} />
  </section>;
}
