import { afterEach, describe, expect, it, vi } from 'vitest';
import { dailyReportMessages, evaluateAdVdPlan, testModelConnection, type DailyReportInput } from './ai.js';

const settings = { baseUrl: 'https://api.deepseek.com', model: 'deepseek-v4-flash', apiKey: 'secret' };

afterEach(() => vi.unstubAllGlobals());

function input(overrides: Partial<DailyReportInput> = {}): DailyReportInput {
  return {
    babyName: '安安', ageText: '5个月12天', sex: 'female', date: '2026-08-10',
    growthContext: { heightCm: 65, weightKg: 7.2, measuredOn: '2026-08-08', daysSinceMeasurement: 2, recordCount: 1, recent: true },
    supplementPlan: { rule: 'AD 与 VD 每天一种、交替补充', previousDay: ['VD'], status: '昨日 AD 与前一日 VD 交替，符合计划' },
    yesterday: { breastMl: 0, formulaMl: 720, feedCount: 6, bowelCount: 1, supplements: ['AD'], notes: [] },
    ...overrides
  };
}

describe('daily report prompt', () => {
  it('recognizes normal and questionable AD/VD alternation without treating missing records as missed doses', () => {
    expect(evaluateAdVdPlan(['AD'], ['VD'])).toContain('符合计划');
    expect(evaluateAdVdPlan(['AD'], ['AD'])).toContain('请核对');
    expect(evaluateAdVdPlan(['AD', 'VD'], ['AD'])).toContain('同时记录');
    expect(evaluateAdVdPlan([], ['VD'])).toContain('未记录不等于未服用');
  });

  it('keeps growth out of the daily summary and forbids invented trends', () => {
    const messages = dailyReportMessages(input());
    expect(messages[0].content).toContain('不要在 summary 中展示身高、体重或成长趋势');
    expect(messages[0].content).toContain('不得出现“比上次”');
    expect(messages[1].content).not.toContain('prevGrowth');
    expect(messages[1].content).not.toContain('上次');
  });

  it('provides age, sex, recent growth context and the AD/VD plan', () => {
    const payload = JSON.parse(dailyReportMessages(input())[1].content) as Record<string, unknown>;
    expect(payload).toMatchObject({
      baby: { age: '5个月12天', sex: '女宝宝' },
      supplementPlan: { status: '昨日 AD 与前一日 VD 交替，符合计划' },
      growthContext: { recordCount: 1, recent: true }
    });
  });
});

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
