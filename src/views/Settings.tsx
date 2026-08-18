// 设置视图主组件：设置首页菜单与子页面导航。
// 各设置卡片已拆到 src/views/settings/（ProfileCard / AiCard / BackupCard / CareItemsCard / FamilyCard / VaccineCard / PushCard / NativeNotificationsCard / AppearanceCard）。
import { createElement, useEffect, useRef, useState } from 'react';
import { Baby, Bell, Bot, LogOut, Monitor, Pill, RefreshCw, Save, Send, Server, Syringe, Users } from 'lucide-react';
import { getNativeNotificationPermission } from '../native';
import { canManage, familyMembers, isScheduleOver, roleNames, type ThemeMode } from '../shared';
import { confirmAction } from '../ui';
import { ProfileSettingsCard } from './settings/ProfileCard';
import { AiSettingsCard } from './settings/AiCard';
import { ServerBackupCard } from './settings/BackupCard';
import { CareAdherenceCard, CareItemsCard } from './settings/CareItemsCard';
import { FamilyPermissionsCard } from './settings/FamilyCard';
import { VaccineSettingsCard } from './settings/VaccineCard';
import { PushSettingsCard, type PushSettingsPatch } from './settings/PushCard';
import { NativeNotificationSettingsCard } from './settings/NativeNotificationsCard';
import { AppearanceSettingsCard } from './settings/AppearanceCard';
import type { Capabilities, CareItem, Profile, PushStatus, SessionUser, VaccineCatalogItem } from '../types';

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

export default function SettingsView({ profile, careItems, vaccineCatalog, capabilities, user, pushStatus, theme, onThemeChange, onProfileSaved, onVaccineCatalogChanged, onCapabilitiesChanged, onCareItemsChanged, onImported, onLogout, onRefreshPush, onTestMorning, onTestFeedingGap, onTestCareItem, onSavePush }: { profile: Profile; careItems: CareItem[]; vaccineCatalog: VaccineCatalogItem[]; capabilities: Capabilities; user: SessionUser; pushStatus: PushStatus | null; theme: ThemeMode; onThemeChange(value: ThemeMode): void; onProfileSaved(value: Profile): void; onVaccineCatalogChanged(): Promise<void>; onCapabilitiesChanged(): Promise<void>; onCareItemsChanged(): Promise<void>; onImported(): void | Promise<void>; onLogout(): void; onRefreshPush(): Promise<void>; onTestMorning(): Promise<{ message: string }>; onTestFeedingGap(level: 'level1' | 'level2'): Promise<{ message: string }>; onTestCareItem(): Promise<{ message: string }>; onSavePush(data: PushSettingsPatch): Promise<PushStatus> }) {
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
      {canManage(user) && <section className="settings-menu" aria-label="照护设置"><SettingsEntry icon="medicine" title="用药护理" description="分类、计划与项目管理" status={`${careItems.filter(item => item.active && !isScheduleOver(item)).length} 项`} onClick={() => open('care-items')} /><SettingsEntry icon="vaccine" title="疫苗管理" description="目录与接种计划" status={`${vaccineCatalog.filter(item => item.active).length} 项`} onClick={() => open('vaccines')} /></section>}
      {user.role === 'superadmin' && <section className="settings-menu" aria-label="系统设置"><SettingsEntry icon="ai" title="AI 模型" description="模型配置与智能功能" status={capabilities.aiEnabled ? '已配置' : '未配置'} onClick={() => open('ai')} /><SettingsEntry icon="backup" title="数据备份" description="备份、恢复、导入与导出" status="每 6 小时" onClick={() => open('backup')} /></section>}
      <section className="settings-menu" aria-label="APP 设置">
        {nativeBridge && <SettingsEntry icon="server" title="服务器环境" description="切换局域网或外网连接" status={nativeEnvironment} onClick={() => nativeBridge.openServerSettings()} />}
        <SettingsEntry icon="refresh" title="清除缓存" description="清除本地缓存并刷新页面" showChevron={false} onClick={() => void (async () => {
          if (!await confirmAction({ title: '清除缓存并刷新？', description: '只清除本地缓存的静态资源，不会删除任何记录。', confirmLabel: '清除并刷新' })) return;
          try { caches.keys().then(keys => Promise.all(keys.filter(k => !k.includes('babycare-offline')).map(k => caches.delete(k)))); } catch { /* ignore */ }
          window.location.reload();
        })()} />
      </section>
      <section className="settings-menu" aria-label="外观设置"><SettingsEntry icon="monitor" title="外观主题" description="浅色 / 深色 / 跟随系统" status={theme === 'light' ? '浅色' : theme === 'dark' ? '深色' : '跟随系统'} onClick={() => open('appearance')} /></section>
      <section className="settings-menu logout-menu" aria-label="账号操作"><SettingsEntry icon="logout" title="退出登录" description="退出当前家庭身份" danger showChevron={false} onClick={() => void (async () => { if (await confirmAction({ title: '退出登录？', description: '退出后需要重新输入密码才能进入。', confirmLabel: '退出登录', danger: true })) onLogout(); })()} /></section>
    </div>
  </div>;
}
