import { afterEach, describe, expect, it, vi } from 'vitest';
import { testModelConnection } from './ai.js';

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

});
