import { db } from './connection.js';
import { canonicalInstant } from '../shanghai-date.js';
import { saveProfile } from './profile.js';
import { replaceFamilyRoles } from './family.js';
import { restoreMemory } from './chat.js';
import { addAudit } from './records.js';
import { syncDefaultVaccineCatalog, systemVaccineIds } from './vaccines.js';
import type { DailyReport } from './daily-reports.js';
import type { AiMemory, AiMemoryCategory, AuditEntry, BabySex, CareItem, CareRecord, ChatMessage, ChatSession, FamilyMemberPermission, GrowthRecord, MilestoneRecord, VaccineCatalogItem, VaccineRecord } from '../types.js';
import type { AiSettings } from './ai.js';
import type { PushSettings } from './push.js';

type ImportedMemory = { id: string; content: string; category: AiMemoryCategory; createdAt: string; updatedAt: string; expiresAt?: string | null; status?: 'active' | 'resolved'; resolvedAt?: string | null };

type ImportPayload = { profile?: { name: string; birthDate: string; birthTime?: string | null; sex?: BabySex; nickname?: string; caregiverTitle?: string; avatar?: string | null }; records: CareRecord[]; audits?: AuditEntry[]; careItems?: CareItem[]; familyMembers?: FamilyMemberPermission[]; familyPermissions?: Pick<FamilyMemberPermission, 'id' | 'role'>[]; aiSettings?: AiSettings; pushSettings?: PushSettings; growthRecords?: GrowthRecord[]; vaccineRecords?: VaccineRecord[]; milestoneRecords?: MilestoneRecord[]; vaccineCatalog?: VaccineCatalogItem[]; dailyReports?: DailyReport[]; aiMemories?: ImportedMemory[]; chatSessions?: ChatSession[]; chatMessages?: ChatMessage[] };
type ImportResult = { imported: number; profileRestored: boolean };
const importBackupTransaction = db.transaction((payload: ImportPayload): ImportResult => {
  if (payload.profile) saveProfile({ name: payload.profile.name, birthDate: payload.profile.birthDate, birthTime: payload.profile.birthTime, sex: payload.profile.sex ?? 'unspecified', nickname: payload.profile.nickname, caregiverTitle: payload.profile.caregiverTitle, avatar: payload.profile.avatar });
  if (payload.careItems?.length) for (const item of payload.careItems) {
    db.prepare(`INSERT INTO care_items (id, name, category, icon, sort_order, active, schedule_type, interval_days, schedule_start_date, reminder_time, reminder_times, schedule_end_date, week_days, pattern_days, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name, category=excluded.category, icon=excluded.icon, sort_order=excluded.sort_order, active=excluded.active,
        schedule_type=excluded.schedule_type, interval_days=excluded.interval_days, schedule_start_date=excluded.schedule_start_date,
        reminder_time=excluded.reminder_time, reminder_times=excluded.reminder_times, schedule_end_date=excluded.schedule_end_date,
        week_days=excluded.week_days, pattern_days=excluded.pattern_days, updated_at=excluded.updated_at`)
      .run(item.id, item.name, item.category || (item.icon === 'medicine' ? 'medication' : 'care'), item.icon, item.sortOrder, item.active ? 1 : 0, item.scheduleType || 'as_needed', item.intervalDays || 1, item.scheduleStartDate || null, item.reminderTime || null, item.reminderTimes ? JSON.stringify(item.reminderTimes) : null, item.scheduleEndDate || null, item.weekDays ? JSON.stringify(item.weekDays) : null, item.patternDays ? JSON.stringify(item.patternDays) : null, item.createdAt, item.updatedAt);
  }
  if (payload.familyMembers?.length) replaceFamilyRoles(payload.familyMembers);
  if (payload.familyPermissions?.length) replaceFamilyRoles(payload.familyPermissions);
  if (payload.aiSettings) {
    db.prepare(`INSERT INTO ai_settings (id, provider, base_url, model, api_key, updated_at) VALUES (1, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET provider=excluded.provider, base_url=excluded.base_url, model=excluded.model, api_key=excluded.api_key, updated_at=excluded.updated_at`)
      .run(payload.aiSettings.provider, payload.aiSettings.baseUrl, payload.aiSettings.model, payload.aiSettings.apiKey, payload.aiSettings.updatedAt || new Date().toISOString());
  }
  if (payload.pushSettings) {
    const ps = payload.pushSettings;
    db.prepare(`INSERT INTO push_settings (id, enabled, pushplus_token, pushplus_topic, morning_digest_enabled, morning_digest_time, feeding_gap_enabled, feeding_gap_level1_minutes, feeding_gap_level2_minutes, care_item_enabled, push_sent_flags, updated_at)
      VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET enabled=excluded.enabled, pushplus_token=excluded.pushplus_token, pushplus_topic=excluded.pushplus_topic,
        morning_digest_enabled=excluded.morning_digest_enabled, morning_digest_time=excluded.morning_digest_time,
        feeding_gap_enabled=excluded.feeding_gap_enabled, feeding_gap_level1_minutes=excluded.feeding_gap_level1_minutes,
        feeding_gap_level2_minutes=excluded.feeding_gap_level2_minutes, care_item_enabled=excluded.care_item_enabled,
        push_sent_flags=excluded.push_sent_flags, updated_at=excluded.updated_at`)
      .run(ps.enabled ? 1 : 0, ps.pushplusToken, ps.pushplusTopic, ps.morningDigestEnabled ? 1 : 0, ps.morningDigestTime, ps.feedingGapEnabled ? 1 : 0, ps.feedingGapLevel1Minutes, ps.feedingGapLevel2Minutes, ps.careItemEnabled ? 1 : 0, JSON.stringify(ps.pushSentFlags || {}), ps.updatedAt || new Date().toISOString());
  }
  if (payload.growthRecords?.length) {
    const upsertGrowth = db.prepare(`INSERT INTO growth_records (id, measured_on, height_cm, weight_kg, created_at, updated_at, created_by, updated_by, deleted_at, deleted_by)
      VALUES (@id, @measuredOn, @heightCm, @weightKg, @createdAt, @updatedAt, @createdBy, @updatedBy, @deletedAt, @deletedBy)
      ON CONFLICT(id) DO UPDATE SET measured_on=excluded.measured_on, height_cm=excluded.height_cm, weight_kg=excluded.weight_kg,
        updated_at=excluded.updated_at, updated_by=excluded.updated_by, deleted_at=excluded.deleted_at, deleted_by=excluded.deleted_by`);
    for (const record of payload.growthRecords) upsertGrowth.run(record);
  }
  if (payload.vaccineRecords?.length) {
    const upsertVaccine = db.prepare(`INSERT INTO vaccine_records (id, vaccine_name, category, dose, planned_on, appointment_on, appointment_time, administered_on, note, created_at, updated_at, created_by, updated_by, deleted_at, deleted_by)
      VALUES (@id, @vaccineName, @category, @dose, @plannedOn, @appointmentOn, @appointmentTime, @administeredOn, @note, @createdAt, @updatedAt, @createdBy, @updatedBy, @deletedAt, @deletedBy)
      ON CONFLICT(id) DO UPDATE SET vaccine_name=excluded.vaccine_name, category=excluded.category, dose=excluded.dose, planned_on=excluded.planned_on,
        appointment_on=excluded.appointment_on, appointment_time=excluded.appointment_time, administered_on=excluded.administered_on, note=excluded.note, updated_at=excluded.updated_at, updated_by=excluded.updated_by,
        deleted_at=excluded.deleted_at, deleted_by=excluded.deleted_by`);
    for (const record of payload.vaccineRecords) upsertVaccine.run({ appointmentOn: null, appointmentTime: null, ...record });
  }
  if (payload.milestoneRecords?.length) {
    const upsertMilestone = db.prepare(`INSERT INTO milestones (id, milestone_key, category, achieved_on, note, photo, created_at, updated_at, created_by, deleted_at, deleted_by)
      VALUES (@id, @milestoneKey, @category, @achievedOn, @note, @photo, @createdAt, @updatedAt, @createdBy, @deletedAt, @deletedBy)
      ON CONFLICT(id) DO UPDATE SET milestone_key=excluded.milestone_key, category=excluded.category, achieved_on=excluded.achieved_on,
        note=excluded.note, photo=excluded.photo, updated_at=excluded.updated_at, updated_by=excluded.updated_by,
        deleted_at=excluded.deleted_at, deleted_by=excluded.deleted_by`);
    for (const record of payload.milestoneRecords) upsertMilestone.run(record);
  }
  if (payload.vaccineCatalog?.length) {
    const upsertCatalog = db.prepare(`INSERT INTO vaccine_catalog (id, name, category, short_name, description, dose_count, interval_summary, active, sort_order, is_system) VALUES (@id, @name, @category, @shortName, @description, @doseCount, @intervalSummary, @active, @sortOrder, @isSystem) ON CONFLICT(id) DO UPDATE SET name=excluded.name, category=excluded.category, short_name=excluded.short_name, description=excluded.description, dose_count=excluded.dose_count, interval_summary=excluded.interval_summary, active=excluded.active, sort_order=excluded.sort_order, is_system=excluded.is_system`);
    for (const item of payload.vaccineCatalog) upsertCatalog.run({ ...item, active: item.active ? 1 : 0, isSystem: systemVaccineIds.has(item.id) ? 1 : 0 });
  }
  if (payload.dailyReports?.length) {
    const upsertReport = db.prepare('INSERT INTO daily_reports (report_date, summary, suggestions, model, generated_at) VALUES (@reportDate, @summary, @suggestions, @model, @generatedAt) ON CONFLICT(report_date) DO UPDATE SET summary=excluded.summary, suggestions=excluded.suggestions, model=excluded.model, generated_at=excluded.generated_at');
    for (const report of payload.dailyReports) upsertReport.run({ ...report, suggestions: JSON.stringify(report.suggestions) });
  }
  if (payload.aiMemories?.length) for (const m of payload.aiMemories) restoreMemory({ id: m.id, content: m.content, category: m.category, createdAt: m.createdAt, updatedAt: m.updatedAt, expiresAt: m.expiresAt ?? null, status: m.status ?? 'active', resolvedAt: m.resolvedAt ?? null });
  if (payload.chatSessions?.length) {
    const upsertSession = db.prepare(`INSERT INTO chat_sessions (id, user_id, title, created_at, updated_at) VALUES (@id, @userId, @title, @createdAt, @updatedAt) ON CONFLICT(id) DO UPDATE SET user_id=excluded.user_id, title=excluded.title, updated_at=excluded.updated_at`);
    for (const s of payload.chatSessions) upsertSession.run({ ...s, title: s.title ?? null });
  }
  if (payload.chatMessages?.length) {
    const upsertMessage = db.prepare(`INSERT INTO chat_messages (id, session_id, role, content, created_at) VALUES (@id, @sessionId, @role, @content, @createdAt) ON CONFLICT(id) DO UPDATE SET content=excluded.content, role=excluded.role`);
    for (const m of payload.chatMessages) upsertMessage.run(m);
  }
  const upsert = db.prepare(`
    INSERT INTO care_records (id, type, occurred_at, breast_milk_ml, formula_ml, supplement, bowel_size, subject, note, created_at, updated_at, created_by, updated_by, deleted_at, deleted_by)
    VALUES (@id, @type, @occurredAt, @breastMilkMl, @formulaMl, @supplement, @bowelSize, @subject, @note, @createdAt, @updatedAt, @createdBy, @updatedBy, @deletedAt, @deletedBy)
    ON CONFLICT(id) DO UPDATE SET
      type=excluded.type, occurred_at=excluded.occurred_at, breast_milk_ml=excluded.breast_milk_ml,
      formula_ml=excluded.formula_ml, supplement=excluded.supplement, bowel_size=excluded.bowel_size,
      subject=excluded.subject, note=excluded.note, updated_at=excluded.updated_at, updated_by=excluded.updated_by,
      deleted_at=excluded.deleted_at, deleted_by=excluded.deleted_by
  `);
  for (const record of payload.records) upsert.run({ ...record, occurredAt: canonicalInstant(record.occurredAt) });
  if (payload.audits?.length) {
    const ids = [...new Set(payload.records.map(record => record.id))];
    const removeAudit = db.prepare('DELETE FROM record_audit WHERE record_id = ?');
    for (const id of ids) removeAudit.run(id);
    for (const audit of payload.audits) addAudit(audit.recordId, audit.action, audit.actor, audit.snapshot, audit.occurredAt, audit.changes ?? null);
  } else {
    for (const record of payload.records) addAudit(record.id, 'import', record.updatedBy || 'legacy', record);
  }
  syncDefaultVaccineCatalog();
  return { imported: payload.records.length, profileRestored: Boolean(payload.profile) };
});
export function importBackup(payload: ImportPayload): ImportResult { return importBackupTransaction(payload); }

type ReplacePayload = { profile: { name: string; birthDate: string; birthTime?: string | null; sex?: BabySex; nickname?: string; caregiverTitle?: string; avatar?: string | null }; records: CareRecord[]; audits?: AuditEntry[]; careItems?: CareItem[]; familyMembers?: FamilyMemberPermission[]; familyPermissions?: Pick<FamilyMemberPermission, 'id' | 'role'>[]; aiSettings?: AiSettings; pushSettings?: PushSettings; growthRecords?: GrowthRecord[]; vaccineRecords?: VaccineRecord[]; milestoneRecords?: MilestoneRecord[]; vaccineCatalog?: VaccineCatalogItem[]; dailyReports?: DailyReport[]; aiMemories?: AiMemory[]; chatSessions?: ChatSession[]; chatMessages?: ChatMessage[] };
const replaceBackupTransaction = db.transaction((payload: ReplacePayload): ImportResult => {
  db.prepare('DELETE FROM record_audit').run();
  db.prepare('DELETE FROM care_records').run();
  saveProfile({ name: payload.profile.name, birthDate: payload.profile.birthDate, birthTime: payload.profile.birthTime, sex: payload.profile.sex ?? 'unspecified', nickname: payload.profile.nickname, caregiverTitle: payload.profile.caregiverTitle, avatar: payload.profile.avatar });
  if (payload.careItems?.length) {
    db.prepare('DELETE FROM care_items').run();
    const insertItem = db.prepare(`INSERT INTO care_items (id, name, category, icon, sort_order, active, schedule_type, interval_days,
      schedule_start_date, reminder_time, reminder_times, schedule_end_date, week_days, pattern_days, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const item of payload.careItems) insertItem.run(item.id, item.name, item.category || (item.icon === 'medicine' ? 'medication' : 'care'), item.icon, item.sortOrder, item.active ? 1 : 0, item.scheduleType || 'as_needed', item.intervalDays || 1, item.scheduleStartDate || null, item.reminderTime || null, item.reminderTimes ? JSON.stringify(item.reminderTimes) : null, item.scheduleEndDate || null, item.weekDays ? JSON.stringify(item.weekDays) : null, item.patternDays ? JSON.stringify(item.patternDays) : null, item.createdAt, item.updatedAt);
  }
  if (payload.familyMembers?.length) replaceFamilyRoles(payload.familyMembers);
  if (payload.familyPermissions?.length) replaceFamilyRoles(payload.familyPermissions);
  if (payload.aiSettings) {
    db.prepare(`INSERT INTO ai_settings (id, provider, base_url, model, api_key, updated_at) VALUES (1, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET provider=excluded.provider, base_url=excluded.base_url, model=excluded.model, api_key=excluded.api_key, updated_at=excluded.updated_at`)
      .run(payload.aiSettings.provider, payload.aiSettings.baseUrl, payload.aiSettings.model, payload.aiSettings.apiKey, payload.aiSettings.updatedAt || new Date().toISOString());
  }
  if (payload.pushSettings) {
    const ps = payload.pushSettings;
    db.prepare(`INSERT INTO push_settings (id, enabled, pushplus_token, pushplus_topic, morning_digest_enabled, morning_digest_time, feeding_gap_enabled, feeding_gap_level1_minutes, feeding_gap_level2_minutes, care_item_enabled, push_sent_flags, updated_at)
      VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET enabled=excluded.enabled, pushplus_token=excluded.pushplus_token, pushplus_topic=excluded.pushplus_topic,
        morning_digest_enabled=excluded.morning_digest_enabled, morning_digest_time=excluded.morning_digest_time,
        feeding_gap_enabled=excluded.feeding_gap_enabled, feeding_gap_level1_minutes=excluded.feeding_gap_level1_minutes,
        feeding_gap_level2_minutes=excluded.feeding_gap_level2_minutes, care_item_enabled=excluded.care_item_enabled,
        push_sent_flags=excluded.push_sent_flags, updated_at=excluded.updated_at`)
      .run(ps.enabled ? 1 : 0, ps.pushplusToken, ps.pushplusTopic, ps.morningDigestEnabled ? 1 : 0, ps.morningDigestTime, ps.feedingGapEnabled ? 1 : 0, ps.feedingGapLevel1Minutes, ps.feedingGapLevel2Minutes, ps.careItemEnabled ? 1 : 0, JSON.stringify(ps.pushSentFlags || {}), ps.updatedAt || new Date().toISOString());
  }
  db.prepare('DELETE FROM growth_records').run();
  if (payload.growthRecords?.length) {
    const insertGrowth = db.prepare(`INSERT INTO growth_records (id, measured_on, height_cm, weight_kg, created_at, updated_at, created_by, updated_by, deleted_at, deleted_by)
      VALUES (@id, @measuredOn, @heightCm, @weightKg, @createdAt, @updatedAt, @createdBy, @updatedBy, @deletedAt, @deletedBy)`);
    for (const record of payload.growthRecords) insertGrowth.run(record);
  }
  db.prepare('DELETE FROM vaccine_records').run();
  if (payload.vaccineRecords?.length) {
    const insertVaccine = db.prepare(`INSERT INTO vaccine_records (id, vaccine_name, category, dose, planned_on, appointment_on, appointment_time, administered_on, note, created_at, updated_at, created_by, updated_by, deleted_at, deleted_by)
      VALUES (@id, @vaccineName, @category, @dose, @plannedOn, @appointmentOn, @appointmentTime, @administeredOn, @note, @createdAt, @updatedAt, @createdBy, @updatedBy, @deletedAt, @deletedBy)`);
    for (const record of payload.vaccineRecords) insertVaccine.run({ appointmentOn: null, appointmentTime: null, ...record });
  }
  db.prepare('DELETE FROM milestones').run();
  if (payload.milestoneRecords?.length) {
    const insertMilestone = db.prepare(`INSERT INTO milestones (id, milestone_key, category, achieved_on, note, photo, created_at, updated_at, created_by, deleted_at, deleted_by)
      VALUES (@id, @milestoneKey, @category, @achievedOn, @note, @photo, @createdAt, @updatedAt, @createdBy, @deletedAt, @deletedBy)`);
    for (const record of payload.milestoneRecords) insertMilestone.run(record);
  }
  if (payload.vaccineCatalog?.length) {
    db.prepare('DELETE FROM vaccine_catalog').run();
    const insertCatalog = db.prepare(`INSERT INTO vaccine_catalog (id, name, category, short_name, description, dose_count, interval_summary, active, sort_order, is_system) VALUES (@id, @name, @category, @shortName, @description, @doseCount, @intervalSummary, @active, @sortOrder, @isSystem)`);
    for (const item of payload.vaccineCatalog) insertCatalog.run({ ...item, active: item.active ? 1 : 0, isSystem: systemVaccineIds.has(item.id) ? 1 : 0 });
  }
  db.prepare('DELETE FROM daily_reports').run();
  if (payload.dailyReports?.length) {
    const insertReport = db.prepare('INSERT INTO daily_reports (report_date, summary, suggestions, model, generated_at) VALUES (@reportDate, @summary, @suggestions, @model, @generatedAt)');
    for (const report of payload.dailyReports) insertReport.run({ ...report, suggestions: JSON.stringify(report.suggestions) });
  }
  if (payload.aiMemories?.length) for (const m of payload.aiMemories) restoreMemory({ id: m.id, content: m.content, category: m.category, createdAt: m.createdAt, updatedAt: m.updatedAt, expiresAt: m.expiresAt ?? null, status: m.status ?? 'active', resolvedAt: m.resolvedAt ?? null });
  db.prepare('DELETE FROM chat_messages').run();
  db.prepare('DELETE FROM chat_sessions').run();
  if (payload.chatSessions?.length) {
    const insertSession = db.prepare(`INSERT INTO chat_sessions (id, user_id, title, created_at, updated_at) VALUES (@id, @userId, @title, @createdAt, @updatedAt)`);
    for (const s of payload.chatSessions) insertSession.run({ ...s, title: s.title ?? null });
  }
  if (payload.chatMessages?.length) {
    const insertMessage = db.prepare(`INSERT INTO chat_messages (id, session_id, role, content, created_at) VALUES (@id, @sessionId, @role, @content, @createdAt)`);
    for (const m of payload.chatMessages) insertMessage.run(m);
  }
  const insertRecord = db.prepare(`
    INSERT INTO care_records (id, type, occurred_at, breast_milk_ml, formula_ml, supplement, bowel_size, subject, note, created_at, updated_at, created_by, updated_by, deleted_at, deleted_by)
    VALUES (@id, @type, @occurredAt, @breastMilkMl, @formulaMl, @supplement, @bowelSize, @subject, @note, @createdAt, @updatedAt, @createdBy, @updatedBy, @deletedAt, @deletedBy)
  `);
  for (const record of payload.records) insertRecord.run({ ...record, occurredAt: canonicalInstant(record.occurredAt) });
  if (payload.audits?.length) {
    const insertAudit = db.prepare('INSERT INTO record_audit (id, record_id, action, actor, occurred_at, snapshot, changes) VALUES (@id, @recordId, @action, @actor, @occurredAt, @snapshot, @changes)');
    for (const audit of payload.audits) insertAudit.run({ ...audit, snapshot: audit.snapshot ? JSON.stringify(audit.snapshot) : null, changes: audit.changes ? JSON.stringify(audit.changes) : null });
  } else {
    for (const record of payload.records) addAudit(record.id, 'import', record.updatedBy || 'legacy', record);
  }
  syncDefaultVaccineCatalog();
  return { imported: payload.records.length, profileRestored: true };
});
export function replaceBackup(payload: ReplacePayload): ImportResult { return replaceBackupTransaction(payload); }
