import type { DraftRecord, Supplement, BowelSize } from './types';

const chineseDigits: Record<string, number> = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };

export function chineseNumber(input: string): number | null {
  if (/^\d+$/.test(input)) return Number(input);
  if (input === '十') return 10;
  if (input.includes('百')) {
    const [hundreds, rest = ''] = input.split('百');
    const base = (chineseDigits[hundreds] || 1) * 100;
    if (!rest) return base;
    if (rest.length === 1 && rest in chineseDigits) return base + chineseDigits[rest] * 10;
    const tail = chineseNumber(rest.replace(/^零/, ''));
    return base + (tail || 0);
  }
  if (input.includes('十')) {
    const [tens, units] = input.split('十');
    return (tens ? chineseDigits[tens] || 0 : 1) * 10 + (units ? chineseDigits[units] || 0 : 0);
  }
  if ([...input].every(char => char in chineseDigits)) return Number([...input].map(char => chineseDigits[char]).join(''));
  return null;
}

function withSpokenTime(text: string, base: Date) {
  const period = text.match(/凌晨|早上|上午|中午|下午|晚上/)?.[0];
  const time = text.match(/([零一二两三四五六七八九十\d]{1,3})[点时](?:(半)|([零一二两三四五六七八九十\d]{1,3})分?)?/);
  if (!time) return base;
  let hour = chineseNumber(time[1]) ?? base.getHours();
  const minute = time[2] === '半' ? 30 : time[3] ? chineseNumber(time[3]) ?? 0 : 0;
  if ((period === '下午' || period === '晚上') && hour < 12) hour += 12;
  if (period === '中午' && hour < 11) hour += 12;
  if (period === '凌晨' && hour === 12) hour = 0;
  const result = new Date(base);
  result.setHours(hour, minute, 0, 0);
  return result;
}

function amountAfter(text: string, keyword: string) {
  const match = text.match(new RegExp(`${keyword}(?:喝了|喂了|是)?([零一二两三四五六七八九十百\\d]{1,6})`));
  return match ? chineseNumber(match[1]) : null;
}

export function parseVoiceRecords(text: string, now = new Date()): DraftRecord[] {
  const clean = text.replace(/[，。,.\s]/g, '');
  const occurredAt = withSpokenTime(clean, now).toISOString();
  const records: DraftRecord[] = [];
  if (clean.includes('母乳') || clean.includes('奶粉')) {
    records.push({
      type: 'feeding', occurredAt,
      breastMilkMl: amountAfter(clean, '母乳'),
      formulaMl: amountAfter(clean, '奶粉')
    });
  }
  (['益生菌', 'AD', 'VD'] as Supplement[])
    .filter(item => clean.toUpperCase().includes(item.toUpperCase()))
    .forEach(supplement => records.push({ type: 'supplement', occurredAt, supplement }));
  if (clean.includes('排便') || clean.includes('大便') || clean.includes('拉屎')) {
    const size = clean.match(/(?:排便|大便|拉屎)(?:量)?(?:是|为)?([大中小])/)?.[1] as BowelSize | undefined;
    records.push({ type: 'bowel', occurredAt, bowelSize: size || '中' });
  }
  const note = clean.match(/备注(.+)/)?.[1];
  if (note) records.push({ type: 'note', occurredAt, note });
  return records;
}

export function parseVoice(text: string, now = new Date()): DraftRecord | null {
  return parseVoiceRecords(text, now)[0] || null;
}
