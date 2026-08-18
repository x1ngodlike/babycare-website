import { db } from './connection.js';
import { FamilyPermissionError } from './errors.js';
import type { FamilyId, FamilyMemberPermission, UserRole } from '../types.js';

const familyNames: Record<FamilyId, string> = { father: '爸爸', mother: '妈妈', grandfather: '爷爷', grandmother: '奶奶' };
export function listFamilyMembers(): FamilyMemberPermission[] {
  const rows = db.prepare("SELECT id, role FROM family_permissions ORDER BY CASE id WHEN 'father' THEN 1 WHEN 'mother' THEN 2 WHEN 'grandfather' THEN 3 ELSE 4 END").all() as { id: FamilyId; role: UserRole }[];
  return rows.map(row => ({ ...row, name: familyNames[row.id] }));
}
export function getFamilyRole(id: FamilyId): UserRole {
  return (db.prepare('SELECT role FROM family_permissions WHERE id = ?').get(id) as { role: UserRole } | undefined)?.role || (id === 'father' ? 'superadmin' : 'member');
}
export function setFamilyRole(id: FamilyId, role: Exclude<UserRole, 'superadmin'>): FamilyMemberPermission {
  if (id === 'father') throw new FamilyPermissionError('超管账号的权限不能修改');
  const result = db.prepare('UPDATE family_permissions SET role = ?, updated_at = ? WHERE id = ?').run(role, new Date().toISOString(), id);
  if (!result.changes) throw new FamilyPermissionError('家庭成员不存在');
  return listFamilyMembers().find(member => member.id === id)!;
}

export function replaceFamilyRoles(items: Pick<FamilyMemberPermission, 'id' | 'role'>[]) {
  const allowed = new Map(items.map(item => [item.id, item.role]));
  const update = db.prepare('UPDATE family_permissions SET role = ?, updated_at = ? WHERE id = ?');
  const now = new Date().toISOString();
  db.transaction(() => {
    update.run('superadmin', now, 'father');
    for (const id of ['mother', 'grandfather', 'grandmother'] as FamilyId[]) {
      const role = allowed.get(id);
      update.run(role === 'admin' ? 'admin' : 'member', now, id);
    }
  })();
}
