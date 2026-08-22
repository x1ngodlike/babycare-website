export interface ServerEndpoint {
  id: string;
  name: string;
  url: string;
  type: 'lan' | 'wan' | 'custom';
}

export type ServerMode = 'auto' | 'lan' | 'wan' | 'custom';

function getEnvUrl(key: string): string | undefined {
  const value = import.meta.env[key];
  return value && value.trim() ? value.trim() : undefined;
}

export function getServerList(): ServerEndpoint[] {
  const lanUrl = getEnvUrl('VITE_LAN_URL') ?? 'http://localhost:3000';
  const wanUrl = getEnvUrl('VITE_WAN_URL') ?? 'http://localhost:3000';
  return [
    { id: 'lan', name: '局域网', url: lanUrl, type: 'lan' },
    { id: 'wan', name: '外网', url: wanUrl, type: 'wan' },
  ];
}

export function getStoredMode(): ServerMode {
  try {
    return (localStorage.getItem('server_mode') as ServerMode) || 'auto';
  } catch {
    return 'auto';
  }
}

export function setStoredMode(mode: ServerMode): void {
  try {
    localStorage.setItem('server_mode', mode);
  } catch { /* ignore */ }
}

export function getCustomUrl(): string {
  try {
    return localStorage.getItem('server_custom_url') || '';
  } catch {
    return '';
  }
}

export function setCustomUrl(url: string): void {
  try {
    localStorage.setItem('server_custom_url', url);
  } catch { /* ignore */ }
}

export function getLastConnectedId(): string | null {
  try {
    return localStorage.getItem('server_last_connected');
  } catch {
    return null;
  }
}

export function setLastConnectedId(id: string): void {
  try {
    localStorage.setItem('server_last_connected', id);
  } catch { /* ignore */ }
}
