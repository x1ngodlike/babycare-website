import type Database from 'better-sqlite3';
import { db } from './connection.js';
import { DuplicateVaccineRecordError, RecordNotFoundError, VaccineCatalogConflictError } from './errors.js';
import type { AuditIdentity, VaccineCatalogItem, VaccineRecord } from '../types.js';

// 国家免疫规划疫苗默认目录（启动时同步，恢复备份后也会重新同步）
const defaultVaccineCatalog: Omit<VaccineCatalogItem, 'active'>[] = [
  { id: 'hepb', name: '乙肝疫苗', category: 'program', shortName: '乙肝', description: '用于预防乙型病毒性肝炎。', doseCount: 3, intervalSummary: '共 3 剂：出生时、1 月龄、6 月龄', sortOrder: 10, isSystem: true },
  { id: 'bcg', name: '卡介苗', category: 'program', shortName: '卡介苗', description: '用于预防儿童结核病，尤其是结核性脑膜炎、粟粒性肺结核等重症。', doseCount: 1, intervalSummary: '共 1 剂：出生时接种', sortOrder: 20, isSystem: true },
  { id: 'polio', name: '脊灰疫苗', category: 'program', shortName: '脊灰', description: '用于预防脊髓灰质炎。', doseCount: 4, intervalSummary: '共 4 剂：2、3、4 月龄及 4 周岁', sortOrder: 30, isSystem: true },
  { id: 'dtap', name: '百白破疫苗', category: 'program', shortName: '百白破', description: '用于预防百日咳、白喉和破伤风。', doseCount: 5, intervalSummary: '共 5 剂：3、4、5、18 月龄及 6 周岁', sortOrder: 40, isSystem: true },
  { id: 'mmr', name: '麻腮风疫苗', category: 'program', shortName: '麻腮风', description: '用于预防麻疹、流行性腮腺炎和风疹。', doseCount: 2, intervalSummary: '共 2 剂：8 月龄、18 月龄', sortOrder: 50, isSystem: true },
  { id: 'je', name: '乙脑疫苗', category: 'program', shortName: '乙脑', description: '用于预防流行性乙型脑炎。', doseCount: 2, intervalSummary: '减毒活疫苗共 2 剂：8 月龄、2 周岁；灭活疫苗程序不同，以接种门诊安排为准', sortOrder: 60, isSystem: true },
  { id: 'meningococcal', name: '流脑疫苗', category: 'program', shortName: '流脑', description: '用于预防流行性脑脊髓膜炎。', doseCount: 4, intervalSummary: '共 4 剂：6、9 月龄及 3、6 周岁', sortOrder: 70, isSystem: true },
  { id: 'hepa', name: '甲肝疫苗', category: 'program', shortName: '甲肝', description: '用于预防甲型病毒性肝炎。', doseCount: 1, intervalSummary: '减毒活疫苗共 1 剂：18 月龄；灭活疫苗程序不同，以接种门诊安排为准', sortOrder: 80, isSystem: true },
  { id: 'pcv13', name: '13价肺炎疫苗', category: 'self_paid', shortName: '13价肺炎', description: '用于预防相应血清型肺炎球菌引起的侵袭性疾病。', doseCount: 4, intervalSummary: '常见共 4 剂：6 月龄内完成 3 剂基础免疫，每剂间隔 1–2 个月；12–15 月龄加强 1 剂。具体以产品说明和接种门诊安排为准', sortOrder: 90, isSystem: true },
  { id: 'rv5', name: '五价轮状疫苗', category: 'self_paid', shortName: '五价轮状', description: '用于预防相应型别轮状病毒引起的胃肠炎。', doseCount: 3, intervalSummary: '共 3 剂：6–12 周龄开始，每剂间隔 4–10 周；第 3 剂不晚于 32 周龄', sortOrder: 100, isSystem: true }
];
export const systemVaccineIds = new Set(defaultVaccineCatalog.map(item => item.id));
const legacyPresetIds = ['pentavalent', 'quadrivalent', 'hib', 'varicella', 'flu', 'ev71', 'menac', 'ppv23', 'rotavirus', 'rabies', 'hepe'];
export const syncDefaultVaccineCatalog: Database.Transaction = db.transaction(() => {
  db.prepare("UPDATE vaccine_records SET vaccine_name = '13价肺炎疫苗' WHERE vaccine_name IN ('13价肺炎球菌疫苗', '13价肺炎球菌多糖结合疫苗')").run();
  db.prepare("UPDATE vaccine_records SET vaccine_name = '五价轮状疫苗' WHERE vaccine_name IN ('五价轮状病毒疫苗', '五价轮状病毒减毒活疫苗')").run();
  db.prepare('UPDATE vaccine_catalog SET is_system = 0').run();
  const upsert = db.prepare(`INSERT INTO vaccine_catalog (id, name, category, short_name, description, dose_count, interval_summary, active, sort_order, is_system, deleted_at)
    VALUES (@id, @name, @category, @shortName, @description, @doseCount, @intervalSummary, @active, @sortOrder, 1, NULL)
    ON CONFLICT(id) DO UPDATE SET name=excluded.name, category=excluded.category, short_name=excluded.short_name,
      description=excluded.description, dose_count=excluded.dose_count, interval_summary=excluded.interval_summary,
      sort_order=excluded.sort_order, is_system=1, deleted_at=NULL`);
  for (const item of defaultVaccineCatalog) upsert.run({ ...item, active: 1 });
  const archiveUnusedPreset = db.prepare(`UPDATE vaccine_catalog SET active = 0, deleted_at = COALESCE(deleted_at, datetime('now'))
    WHERE id = ? AND NOT EXISTS (SELECT 1 FROM vaccine_records WHERE vaccine_name = vaccine_catalog.name)`);
  for (const id of legacyPresetIds) archiveUnusedPreset.run(id);
});
syncDefaultVaccineCatalog();
const knownSelfPaidVaccines = [
  '五联疫苗（DTaP-IPV-Hib）', '四联疫苗（DTaP-IPV）', 'b型流感嗜血杆菌结合疫苗',
  '13价肺炎球菌多糖结合疫苗', '23价肺炎球菌多糖疫苗', '五价轮状病毒减毒活疫苗',
  '口服轮状病毒活疫苗', '水痘减毒活疫苗', '季节性流感疫苗', '鼻喷流感减毒活疫苗',
  'AC群流脑结合疫苗', 'ACYW135群流脑多糖疫苗', '流脑多糖结合疫苗',
  '肠道病毒71型灭活疫苗', '狂犬病疫苗', '戊型肝炎疫苗'
];
const markSelfPaid = db.prepare('UPDATE vaccine_records SET category = \'self_paid\' WHERE vaccine_name = ? AND category <> \'self_paid\'');
db.transaction(() => { for (const name of knownSelfPaidVaccines) markSelfPaid.run(name); })();

const vaccineColumns = `id, vaccine_name AS vaccineName, category, dose, planned_on AS plannedOn,
  appointment_on AS appointmentOn, appointment_time AS appointmentTime, administered_on AS administeredOn, note, created_at AS createdAt, updated_at AS updatedAt,
  created_by AS createdBy, updated_by AS updatedBy, deleted_at AS deletedAt, deleted_by AS deletedBy`;

function getVaccineRecord(id: string): VaccineRecord | null {
  return db.prepare(`SELECT ${vaccineColumns} FROM vaccine_records WHERE id = ?`).get(id) as VaccineRecord | undefined || null;
}

export function listVaccineRecords(includeDeleted = false): VaccineRecord[] {
  const where = includeDeleted ? '' : 'WHERE deleted_at IS NULL';
  return db.prepare(`SELECT ${vaccineColumns} FROM vaccine_records ${where} ORDER BY COALESCE(administered_on, planned_on) DESC, updated_at DESC`).all() as VaccineRecord[];
}

export function saveVaccineRecord(record: VaccineRecord): VaccineRecord {
  const storedRecord = { appointmentOn: null, appointmentTime: null, ...record };
  const existing = getVaccineRecord(record.id);
  const duplicate = db.prepare(`SELECT ${vaccineColumns} FROM vaccine_records WHERE vaccine_name = ? AND dose = ? AND deleted_at IS NULL AND id <> ? LIMIT 1`)
    .get(record.vaccineName, record.dose, record.id) as VaccineRecord | undefined;
  if (duplicate) throw new DuplicateVaccineRecordError(duplicate);
  if (existing?.deletedAt) throw new RecordNotFoundError('疫苗记录已经删除');
  if (existing) db.prepare(`UPDATE vaccine_records SET vaccine_name=@vaccineName, category=@category, dose=@dose, planned_on=@plannedOn,
    appointment_on=@appointmentOn, appointment_time=@appointmentTime, administered_on=@administeredOn, note=@note, updated_at=@updatedAt, updated_by=@updatedBy WHERE id=@id AND deleted_at IS NULL`).run(storedRecord);
  else db.prepare(`INSERT INTO vaccine_records (id, vaccine_name, category, dose, planned_on, appointment_on, appointment_time, administered_on, note, created_at, updated_at, created_by, updated_by, deleted_at, deleted_by)
    VALUES (@id, @vaccineName, @category, @dose, @plannedOn, @appointmentOn, @appointmentTime, @administeredOn, @note, @createdAt, @updatedAt, @createdBy, @updatedBy, NULL, NULL)`).run(storedRecord);
  return getVaccineRecord(record.id)!;
}

export function removeVaccineRecord(id: string, _actor: AuditIdentity): VaccineRecord | null {
  const existing = getVaccineRecord(id);
  if (!existing) return null;
  db.prepare('DELETE FROM vaccine_records WHERE id = ?').run(id);
  return existing;
}

const vaccineCatalogColumns = `id, name, category, short_name AS shortName, description, dose_count AS doseCount, interval_summary AS intervalSummary, active, sort_order AS sortOrder, is_system AS isSystem`;
type VaccineCatalogRow = Omit<VaccineCatalogItem, 'active'> & { active: number };
function mapVaccineCatalog(item: VaccineCatalogRow): VaccineCatalogItem { return { ...item, active: Boolean(item.active), isSystem: Boolean(item.isSystem) }; }
export function listVaccineCatalog(includeInactive = false): VaccineCatalogItem[] {
  const where = includeInactive ? 'WHERE deleted_at IS NULL' : 'WHERE active = 1 AND deleted_at IS NULL';
  return (db.prepare(`SELECT ${vaccineCatalogColumns} FROM vaccine_catalog ${where} ORDER BY sort_order, name`).all() as VaccineCatalogRow[]).map(mapVaccineCatalog);
}
export function setVaccineCatalogActive(id: string, active: boolean): VaccineCatalogItem {
  if (!db.prepare('UPDATE vaccine_catalog SET active = ? WHERE id = ? AND deleted_at IS NULL').run(active ? 1 : 0, id).changes) throw new RecordNotFoundError('疫苗不存在');
  return mapVaccineCatalog(db.prepare(`SELECT ${vaccineCatalogColumns} FROM vaccine_catalog WHERE id = ?`).get(id) as VaccineCatalogRow);
}
export function saveVaccineCatalogItem(item: VaccineCatalogItem): VaccineCatalogItem {
  const existingById = db.prepare(`SELECT ${vaccineCatalogColumns} FROM vaccine_catalog WHERE id = ?`).get(item.id) as VaccineCatalogRow | undefined;
  if (existingById?.isSystem) throw new VaccineCatalogConflictError('系统默认疫苗只能修改启用状态');
  const existingByName = db.prepare('SELECT id, deleted_at AS deletedAt FROM vaccine_catalog WHERE name = ?').get(item.name) as { id: string; deletedAt: string | null } | undefined;
  if (existingByName && !existingByName.deletedAt && existingByName.id !== item.id) throw new VaccineCatalogConflictError('已经存在同名疫苗');
  if (existingById) {
    try {
      db.prepare(`UPDATE vaccine_catalog SET name = @name, category = @category, short_name = @shortName, description = @description,
        dose_count = @doseCount, interval_summary = @intervalSummary, active = @active, sort_order = @sortOrder, is_system = 0, deleted_at = NULL WHERE id = @id`)
        .run({ ...item, active: item.active ? 1 : 0 });
    } catch (error) {
      if (error instanceof Error && error.message.includes('UNIQUE')) throw new VaccineCatalogConflictError('已经存在同名疫苗');
      throw error;
    }
  } else if (existingByName?.deletedAt) {
    db.prepare(`UPDATE vaccine_catalog SET category = @category, short_name = @shortName, description = @description,
      dose_count = @doseCount, interval_summary = @intervalSummary, active = @active, sort_order = @sortOrder, is_system = 0, deleted_at = NULL WHERE id = @existingId`)
      .run({ ...item, existingId: existingByName.id, active: item.active ? 1 : 0 });
    item = { ...item, id: existingByName.id };
  } else {
    db.prepare(`INSERT INTO vaccine_catalog (id, name, category, short_name, description, dose_count, interval_summary, active, sort_order, is_system, deleted_at)
      VALUES (@id, @name, @category, @shortName, @description, @doseCount, @intervalSummary, @active, @sortOrder, 0, NULL)`)
      .run({ ...item, active: item.active ? 1 : 0 });
  }
  return mapVaccineCatalog(db.prepare(`SELECT ${vaccineCatalogColumns} FROM vaccine_catalog WHERE id = ? AND deleted_at IS NULL`).get(item.id) as VaccineCatalogRow);
}
export function removeVaccineCatalogItem(id: string): boolean {
  return Boolean(db.prepare("UPDATE vaccine_catalog SET active = 0, deleted_at = datetime('now') WHERE id = ? AND is_system = 0 AND deleted_at IS NULL").run(id).changes);
}
export function reorderVaccineCatalog(ids: string[]): VaccineCatalogItem[] {
  const all = listVaccineCatalog(true);
  if (ids.length !== all.length || ids.some(id => !all.some(item => item.id === id))) throw new Error('疫苗顺序不完整');
  if (all.some(item => item.isSystem)) throw new Error('系统默认疫苗不可调整顺序');
  const update = db.prepare('UPDATE vaccine_catalog SET sort_order = ? WHERE id = ?');
  db.transaction(() => ids.forEach((id, index) => { update.run((index + 1) * 10, id); }))();
  return listVaccineCatalog(true);
}
