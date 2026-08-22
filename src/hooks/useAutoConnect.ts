import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getServerList,
  getStoredMode,
  setStoredMode,
  getCustomUrl,
  getLastConnectedId,
  setLastConnectedId,
  getCurrentServerUrl,
  type ServerEndpoint,
  type ServerMode,
} from '../config/servers';

export type ConnectionStatus = 'connecting' | 'connected' | 'failed';

export interface ConnectionState {
  status: ConnectionStatus;
  currentServer: ServerEndpoint | null;
  mode: ServerMode;
  servers: ServerEndpoint[];
  lastConnectedId: string | null;
}

const PING_TIMEOUT = 5000;
const PING_PATH = '/api/health';

function isNativeApp(): boolean {
  try {
    const bridge = (window as Window & { BabyCareNative?: Record<string, unknown> }).BabyCareNative;
    return Boolean(bridge);
  } catch {
    return false;
  }
}

async function pingServer(url: string, timeoutMs = PING_TIMEOUT): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url + PING_PATH, {
      method: 'GET',
      signal: controller.signal,
      cache: 'no-store',
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

export function useAutoConnect() {
  const isNative = isNativeApp();
  
  const [state, setState] = useState<ConnectionState>(() => {
    // 非原生环境（Web版本）直接标记为已连接，使用相对路径
    if (!isNative) {
      return {
        status: 'connected',
        currentServer: null,
        mode: 'auto',
        servers: [],
        lastConnectedId: null,
      };
    }
    return {
      status: 'connecting',
      currentServer: null,
      mode: getStoredMode(),
      servers: getServerList(),
      lastConnectedId: getLastConnectedId(),
    };
  });

  const reconnectTimerRef = useRef<number | null>(null);

  const tryConnect = useCallback(async (mode?: ServerMode) => {
    // 非原生环境直接返回已连接
    if (!isNativeApp()) {
      setState({
        status: 'connected',
        currentServer: null,
        mode: 'auto',
        servers: [],
        lastConnectedId: null,
      });
      return null;
    }

    const currentMode = mode ?? getStoredMode();
    const servers = getServerList();
    const customUrl = getCustomUrl();
    const currentUrl = getCurrentServerUrl();

    setState(prev => ({ ...prev, status: 'connecting' }));

    let targetServer: ServerEndpoint | null = null;

    if (currentMode === 'custom' && customUrl) {
      targetServer = { id: 'custom', name: '自定义', url: customUrl, type: 'custom' };
      const ok = await pingServer(customUrl);
      if (!ok) {
        setState(prev => ({ ...prev, status: 'failed', currentServer: null, mode: currentMode }));
        return null;
      }
    } else if (currentMode === 'lan' || currentMode === 'wan') {
      const server = servers.find(s => s.type === currentMode);
      if (server) {
        targetServer = server;
        const ok = await pingServer(server.url);
        if (!ok) {
          setState(prev => ({ ...prev, status: 'failed', currentServer: null, mode: currentMode }));
          return null;
        }
      }
    } else {
      // auto mode: prioritize current server (if available), then try LAN first, then WAN
      
      // If we have a current URL, try that first
      if (currentUrl) {
        const currentServer = servers.find(s => s.url === currentUrl);
        if (currentServer) {
          targetServer = currentServer;
          const ok = await pingServer(currentServer.url, PING_TIMEOUT);
          if (ok) {
            setLastConnectedId(currentServer.id);
            setState(prev => ({
              ...prev,
              status: 'connected',
              currentServer,
              mode: 'auto',
              servers,
              lastConnectedId: currentServer.id,
            }));
            return currentServer;
          }
        } else {
          // current URL not in server list, try pinging it directly
          const ok = await pingServer(currentUrl, PING_TIMEOUT);
          if (ok) {
            const newServer: ServerEndpoint = {
              id: 'current',
              name: '当前服务器',
              url: currentUrl,
              type: 'lan',
            };
            setState(prev => ({
              ...prev,
              status: 'connected',
              currentServer: newServer,
              mode: 'auto',
              servers: [...servers, newServer],
              lastConnectedId: 'current',
            }));
            return newServer;
          }
        }
      }

      // Try LAN first
      const lanServer = servers.find(s => s.type === 'lan');
      if (lanServer) {
        targetServer = lanServer;
        const ok = await pingServer(lanServer.url, PING_TIMEOUT);
        if (ok) {
          setLastConnectedId(lanServer.id);
          setState(prev => ({
            ...prev,
            status: 'connected',
            currentServer: lanServer,
            mode: 'auto',
            servers,
            lastConnectedId: lanServer.id,
          }));
          return lanServer;
        }
      }

      // Try WAN
      const wanServer = servers.find(s => s.type === 'wan');
      if (wanServer) {
        targetServer = wanServer;
        const ok = await pingServer(wanServer.url, PING_TIMEOUT);
        if (ok) {
          setLastConnectedId(wanServer.id);
          setState(prev => ({
            ...prev,
            status: 'connected',
            currentServer: wanServer,
            mode: 'auto',
            servers,
            lastConnectedId: wanServer.id,
          }));
          return wanServer;
        }
      }

      // All servers failed
      setState(prev => ({
        ...prev,
        status: 'failed',
        currentServer: null,
        mode: 'auto',
        servers,
      }));
      return null;
    }

    if (targetServer) {
      setLastConnectedId(targetServer.id);
      setState(prev => ({
        ...prev,
        status: 'connected',
        currentServer: targetServer,
        mode: currentMode,
        servers,
        lastConnectedId: targetServer.id,
      }));
      return targetServer;
    }

    return null;
  }, []);

  const setMode = useCallback(async (mode: ServerMode) => {
    setStoredMode(mode);
    await tryConnect(mode);
  }, [tryConnect]);

  const reconnect = useCallback(async () => {
    await tryConnect();
  }, [tryConnect]);

  useEffect(() => {
    if (!isNative) return;
    void tryConnect();
  }, [isNative, tryConnect]);

  useEffect(() => {
    if (!isNative) return;
    if (state.status === 'failed' && !reconnectTimerRef.current) {
      reconnectTimerRef.current = window.setInterval(() => {
        void tryConnect();
      }, 5000);
    } else if (state.status === 'connected' && reconnectTimerRef.current) {
      clearInterval(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    return () => {
      if (reconnectTimerRef.current) {
        clearInterval(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };
  }, [isNative, state.status, tryConnect]);

  return {
    ...state,
    isNative,
    tryConnect,
    setMode,
    reconnect,
  };
}
