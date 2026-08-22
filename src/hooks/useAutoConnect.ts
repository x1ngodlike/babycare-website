import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getServerList,
  getStoredMode,
  setStoredMode,
  getCustomUrl,
  getLastConnectedId,
  setLastConnectedId,
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

const PING_TIMEOUT = 3000;
const PING_PATH = '/api/health';

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
  const [state, setState] = useState<ConnectionState>(() => ({
    status: 'connecting',
    currentServer: null,
    mode: getStoredMode(),
    servers: getServerList(),
    lastConnectedId: getLastConnectedId(),
  }));

  const reconnectTimerRef = useRef<number | null>(null);

  const tryConnect = useCallback(async (mode?: ServerMode) => {
    const currentMode = mode ?? getStoredMode();
    const servers = getServerList();
    const customUrl = getCustomUrl();

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
      const lanServer = servers.find(s => s.type === 'lan');
      const wanServer = servers.find(s => s.type === 'wan');

      if (lanServer) {
        targetServer = lanServer;
        const ok = await pingServer(lanServer.url, 2000);
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

      if (wanServer) {
        targetServer = wanServer;
        const ok = await pingServer(wanServer.url, 2000);
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

      const results = await Promise.all(
        servers.map(async s => ({ server: s, ok: await pingServer(s.url) }))
      );
      const connected = results.find(r => r.ok);

      if (connected) {
        targetServer = connected.server;
        setLastConnectedId(connected.server.id);
        setState(prev => ({
          ...prev,
          status: 'connected',
          currentServer: connected.server,
          mode: 'auto',
          servers,
          lastConnectedId: connected.server.id,
        }));
        return connected.server;
      }

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
    void tryConnect();
  }, [tryConnect]);

  useEffect(() => {
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
  }, [state.status, tryConnect]);

  return {
    ...state,
    tryConnect,
    setMode,
    reconnect,
  };
}
