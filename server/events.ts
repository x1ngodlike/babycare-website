import type { Request, Response } from 'express';

export type ChangeScope = 'records' | 'profile' | 'all';

export function createChangeHub() {
  const clients = new Set<Response>();

  function connect(req: Request, res: Response) {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();
    res.write('retry: 5000\n: connected\n\n');
    clients.add(res);

    const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 25_000);
    const close = () => {
      clearInterval(heartbeat);
      clients.delete(res);
    };
    req.once('close', close);
  }

  function broadcast(scope: ChangeScope) {
    const payload = `data: ${JSON.stringify({ scope, changedAt: new Date().toISOString() })}\n\n`;
    for (const client of clients) {
      try { client.write(payload); }
      catch { clients.delete(client); }
    }
  }

  return { connect, broadcast, clientCount: () => clients.size };
}
