import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import { createChangeHub } from './events.js';

describe('realtime change events', () => {
  it('broadcasts change scope and removes closed clients', () => {
    const request = new EventEmitter();
    const writes: string[] = [];
    const response = {
      setHeader: vi.fn(), flushHeaders: vi.fn(), write: vi.fn((value: string) => { writes.push(value); return true; })
    } as unknown as Response;
    const hub = createChangeHub();

    hub.connect(request as unknown as Request, response);
    expect(hub.clientCount()).toBe(1);
    hub.broadcast('records');
    expect(writes.join('')).toContain('"scope":"records"');

    request.emit('close');
    expect(hub.clientCount()).toBe(0);
  });
});
