import { describe, expect, it } from 'vitest';
import { chineseNumber, parseVoice, parseVoiceRecords } from './voice';

describe('voice parser', () => {
  it('parses Chinese numbers', () => {
    expect(chineseNumber('九十')).toBe(90);
    expect(chineseNumber('一百二十')).toBe(120);
    expect(chineseNumber('一百二')).toBe(120);
  });
  it('parses feeding phrase', () => {
    const record = parseVoice('早上八点半母乳九十', new Date('2026-08-09T12:00:00+08:00'));
    expect(record?.type).toBe('feeding');
    expect(record?.breastMilkMl).toBe(90);
    expect(new Date(record!.occurredAt).getHours()).toBe(8);
    expect(new Date(record!.occurredAt).getMinutes()).toBe(30);
  });
  it('parses supplements and bowel', () => {
    expect(parseVoice('十一点AD吃了')?.supplement).toBe('AD');
    expect(parseVoice('下午三点排便，中')?.bowelSize).toBe('中');
  });
  it('parses colloquial formula amount', () => {
    expect(parseVoice('十点奶粉一百二')?.formulaMl).toBe(120);
  });
  it('parses common feeding word orders with or without units', () => {
    expect(parseVoice('母乳量 30 毫升')?.breastMilkMl).toBe(30);
    expect(parseVoice('喝了30毫升母乳')?.breastMilkMl).toBe(30);
    expect(parseVoice('奶粉三十')?.formulaMl).toBe(30);
    expect(parseVoice('120ml奶粉')?.formulaMl).toBe(120);
  });
  it('keeps an incomplete feeding draft so it can be corrected', () => {
    expect(parseVoice('刚才喝了母乳')).toMatchObject({ type: 'feeding', breastMilkMl: null, formulaMl: null });
  });
  it('creates multiple drafts from one phrase', () => {
    const records = parseVoiceRecords('下午三点母乳九十，AD吃了，排便中');
    expect(records.map(record => record.type)).toEqual(['feeding', 'supplement', 'bowel']);
  });
  it('does not confuse the period with bowel size', () => {
    expect(parseVoice('中午十二点排便小')?.bowelSize).toBe('小');
  });
});
