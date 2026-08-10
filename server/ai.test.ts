import { afterEach, describe, expect, it, vi } from 'vitest';
import { interpretTranscript, testModelConnection } from './ai.js';

const settings = { baseUrl: 'https://api.deepseek.com', model: 'deepseek-v4-flash', apiKey: 'secret' };

afterEach(() => vi.unstubAllGlobals());

describe('DeepSeek model integration', () => {
  it('uses the configured endpoint and model when testing', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await testModelConnection(settings);
    expect(fetchMock).toHaveBeenCalledWith('https://api.deepseek.com/chat/completions', expect.objectContaining({ method: 'POST' }));
    const request = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(request).toMatchObject({ model: 'deepseek-v4-flash', stream: false, thinking: { type: 'disabled' } });
  });

  it('turns model JSON into record drafts', async () => {
    const content = JSON.stringify({ records: [{ type: 'feeding', occurredAt: '2026-08-10T08:30:00+08:00', breastMilkMl: 90, formulaMl: null }] });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 })));
    await expect(interpretTranscript('八点半母乳九十', settings)).resolves.toEqual([
      expect.objectContaining({ type: 'feeding', breastMilkMl: 90, formulaMl: null })
    ]);
  });

  it('rejects incomplete model records', async () => {
    const content = JSON.stringify({ records: [{ type: 'feeding', occurredAt: '2026-08-10T08:30:00+08:00' }] });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 })));
    await expect(interpretTranscript('喝奶了', settings)).rejects.toThrow();
  });
});
