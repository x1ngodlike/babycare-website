// 完整备份导出载荷：把各表数据组装成可恢复的 JSON 结构（导入与手动备份共用）。
import {
  allAudit, allChatMessages, allRecords, getProfile, listCareItems,
  listDailyReports, listFamilyMembers, listGrowthRecords, listMemories,
  listMilestoneRecords, listSessions, listVaccineCatalog, listVaccineRecords
} from './db/index.js';

function normalizeDateTime(value: string | null | undefined): string | null {
  if (!value) return null;
  // 将 "2026-08-10 11:15:47" 格式转换为 ISO 格式
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) {
    return value.replace(' ', 'T') + 'Z';
  }
  return value;
}

export function exportPayload() {
  const records = allRecords(true).map(record => {
    if (record.type === 'feeding') {
      if (record.breastMilkMl == null && record.formulaMl == null) record.breastMilkMl = 0;
    } else if (record.type === 'supplement') {
      if (!record.supplement) record.supplement = '未记录';
    } else if (record.type === 'bowel') {
      if (!record.bowelSize) record.bowelSize = '中';
    } else if (record.type === 'note') {
      if (!record.subject && !record.note) record.note = '无备注';
    }
    return record;
  });
  const careItems = listCareItems(true).map(item => ({
    ...item,
    createdAt: normalizeDateTime(item.createdAt) || new Date().toISOString(),
    updatedAt: normalizeDateTime(item.updatedAt) || new Date().toISOString()
  }));
  const growthRecords = listGrowthRecords(true).map(record => ({
    ...record,
    createdAt: normalizeDateTime(record.createdAt) || new Date().toISOString(),
    updatedAt: normalizeDateTime(record.updatedAt) || new Date().toISOString(),
    evaluatedAt: normalizeDateTime(record.evaluatedAt)
  }));
  const vaccineRecords = listVaccineRecords(true).map(record => ({
    ...record,
    createdAt: normalizeDateTime(record.createdAt) || new Date().toISOString(),
    updatedAt: normalizeDateTime(record.updatedAt) || new Date().toISOString(),
    administeredOn: record.administeredOn || null
  }));
  const milestoneRecords = listMilestoneRecords(true).map(record => ({
    ...record,
    createdAt: normalizeDateTime(record.createdAt) || new Date().toISOString(),
    updatedAt: normalizeDateTime(record.updatedAt) || new Date().toISOString()
  }));
  const profile = getProfile();
  return { version: 10, exportedAt: new Date().toISOString(), profile: profile || { name: '宝宝', birthDate: new Date().toISOString().slice(0, 10), birthTime: null, sex: 'unspecified' as const, nickname: '', caregiverTitle: '', avatar: null }, records, audits: allAudit(), careItems, familyMembers: listFamilyMembers(), growthRecords, vaccineRecords, milestoneRecords, vaccineCatalog: listVaccineCatalog(true), dailyReports: listDailyReports(), aiMemories: listMemories(true), chatSessions: listSessions(), chatMessages: allChatMessages() };
}
