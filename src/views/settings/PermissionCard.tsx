import { PERMISSION_ITEMS, PERMISSION_MATRIX, roleNames, type PermissionCategory } from '../../shared';
import type { UserRole } from '../../types';

const ROLES: UserRole[] = ['superadmin', 'admin', 'member'];

const CATEGORY_ORDER: PermissionCategory[] = ['照护记录', '宝宝档案', '照护管理', '系统设置', 'AI 对话'];

const CATEGORY_ICONS: Record<PermissionCategory, string> = {
  '照护记录': '📋',
  '宝宝档案': '👶',
  '照护管理': '💊',
  '系统设置': '⚙️',
  'AI 对话': '💬',
};

export function PermissionCard() {
  return (
    <section className="settings-card permission-card">
      <h2>权限一览</h2>
      <p>各角色的权限范围，便于家庭成员了解彼此能做什么。</p>

      <div className="permission-table">
        <div className="permission-table-head">
          <span className="permission-col-name">权限项</span>
          {ROLES.map(role => (
            <span key={role} className={`permission-col-role role-${role}`}>
              {roleNames[role]}
            </span>
          ))}
        </div>

        {CATEGORY_ORDER.map(category => {
          const items = PERMISSION_ITEMS.filter(i => i.category === category);
          if (!items.length) return null;
          return (
            <div key={category} className="permission-category">
              <div className="permission-category-head">
                <span>{CATEGORY_ICONS[category]}</span>
                <b>{category}</b>
              </div>
              {items.map(item => {
                const rolesWith = ROLES.filter(r => PERMISSION_MATRIX[r].includes(item.key));
                const allThree = rolesWith.length === 3;
                return (
                  <div key={item.key} className="permission-row">
                    <div className="permission-row-name" title={item.description}>
                      <span>{item.label}</span>
                      <small>{item.description}</small>
                    </div>
                    {ROLES.map(role => {
                      const has = PERMISSION_MATRIX[role].includes(item.key);
                      return (
                        <span
                          key={role}
                          className={`permission-check${has ? ' on' : ''}${allThree ? ' all' : ''}`}
                          aria-label={`${roleNames[role]}：${has ? '有权' : '无权限'}`}
                        >
                          {has ? (
                            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="3,7 6,10 11,4" />
                            </svg>
                          ) : (
                            <span className="dash" aria-hidden="true">—</span>
                          )}
                        </span>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </section>
  );
}
