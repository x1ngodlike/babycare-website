export function canDeleteCareRecord(user: { id: string; role: string } | null): boolean {
  if (!user) return false;
  return user.role === 'superadmin' || user.role === 'admin' || user.id === 'grandfather' || user.id === 'grandmother';
}
