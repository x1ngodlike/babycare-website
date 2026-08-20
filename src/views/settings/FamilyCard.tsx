// 成员与权限设置卡（由 Settings.tsx 抽出，逻辑不变）
import { useEffect, useState } from 'react';
import { api } from '../../api';
import { familyMembers, roleNames } from '../../shared';
import { confirmAction } from '../../ui';
import { Feedback } from './Feedback';
import { PermissionCard } from './PermissionCard';
import type { FamilyId, FamilyMemberPermission } from '../../types';

export function FamilyPermissionsCard() {
  const [members, setMembers] = useState<FamilyMemberPermission[]>([]); const [busyId, setBusyId] = useState(''); const [message, setMessage] = useState('');
  useEffect(() => { api.familyMembers().then(setMembers).catch(err => setMessage(err instanceof Error ? err.message : '无法读取家庭成员')); }, []);
  async function changeRole(member: FamilyMemberPermission, role: 'admin' | 'member') { if (member.role === role || !await confirmAction({ title: `将${member.name}设为“${roleNames[role]}”？`, description: role === 'admin' ? '管理身份可以管理用药项目和已删除记录。' : '普通身份可以查看、添加和修改照护记录。', confirmLabel: '确认修改' })) return; setBusyId(member.id); setMessage(''); try { const updated = await api.updateFamilyRole(member.id as Exclude<FamilyId, 'father'>, role); setMembers(items => items.map(item => item.id === updated.id ? updated : item)); setMessage(`${member.name}已设为${roleNames[role]}`); } catch (err) { setMessage(err instanceof Error ? err.message : '权限修改失败'); } finally { setBusyId(''); } }
  return <>
    <section className="settings-card family-permissions-card"><div className="setting-status"><h2>成员与权限</h2><span className="on">超管</span></div><p>管理身份可管理用药项目和回收站；普通身份可记录和修改照护信息。</p><div className="family-permission-list">{members.map(member => { const visual = familyMembers.find(item => item.id === member.id)!; return <article key={member.id}><img src={visual.icon} alt="" /><div><b>{member.name}</b><small>{roleNames[member.role]}</small></div>{member.id === 'father' ? <span className="fixed-role">不可修改</span> : <div className="role-switch" role="group" aria-label={`${member.name}的权限`}><button type="button" aria-pressed={member.role === 'admin'} className={member.role === 'admin' ? 'active' : ''} disabled={Boolean(busyId)} onClick={() => void changeRole(member, 'admin')}>管理</button><button type="button" aria-pressed={member.role === 'member'} className={member.role === 'member' ? 'active' : ''} disabled={Boolean(busyId)} onClick={() => void changeRole(member, 'member')}>普通</button></div>}</article>; })}</div><Feedback message={message} type={message.includes('失败') || message.includes('无法') ? 'error' : 'success'} onClose={() => setMessage('')} /></section>
    <PermissionCard />
  </>;
}
