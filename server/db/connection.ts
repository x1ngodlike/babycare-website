import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { canonicalInstant } from '../shanghai-date.js';

const databasePath = process.env.DATABASE_PATH || './data/baby-care.db';
mkdirSync(dirname(databasePath), { recursive: true });

export const db: Database.Database = new Database(databasePath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS profile (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    name TEXT NOT NULL,
    birth_date TEXT NOT NULL,
    sex TEXT NOT NULL DEFAULT 'unspecified' CHECK (sex IN ('male', 'female', 'unspecified')),
    nickname TEXT NOT NULL DEFAULT '',
    caregiver_title TEXT NOT NULL DEFAULT '妈妈',
    avatar TEXT,
    updated_at TEXT NOT NULL
  );
`);

const profileColumns = db.prepare('PRAGMA table_info(profile)').all() as { name: string }[];
if (!profileColumns.some(column => column.name === 'sex')) db.exec("ALTER TABLE profile ADD COLUMN sex TEXT NOT NULL DEFAULT 'unspecified' CHECK (sex IN ('male', 'female', 'unspecified'))");
if (!profileColumns.some(column => column.name === 'nickname')) db.exec("ALTER TABLE profile ADD COLUMN nickname TEXT NOT NULL DEFAULT ''");
if (!profileColumns.some(column => column.name === 'caregiver_title')) db.exec("ALTER TABLE profile ADD COLUMN caregiver_title TEXT NOT NULL DEFAULT '妈妈'");
if (!profileColumns.some(column => column.name === 'avatar')) db.exec('ALTER TABLE profile ADD COLUMN avatar TEXT');
if (!profileColumns.some(column => column.name === 'birth_time')) db.exec("ALTER TABLE profile ADD COLUMN birth_time TEXT");

db.exec(`
  INSERT OR IGNORE INTO profile (id, name, birth_date, sex, nickname, caregiver_title, avatar, updated_at)
  VALUES (1, '示例宝宝', '2026-01-01', 'unspecified', '', '妈妈', NULL, datetime('now'));

  CREATE TABLE IF NOT EXISTS care_records (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL CHECK (type IN ('feeding', 'supplement', 'bowel', 'note')),
    occurred_at TEXT NOT NULL,
    breast_milk_ml INTEGER,
    formula_ml INTEGER,
    supplement TEXT CHECK (supplement IN ('AD', 'VD', '益生菌')),
    bowel_size TEXT CHECK (bowel_size IN ('大', '中', '小')),
    subject TEXT,
    note TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_care_records_occurred_at ON care_records(occurred_at);
`);

const recordColumns = db.prepare('PRAGMA table_info(care_records)').all() as { name: string }[];
if (!recordColumns.some(column => column.name === 'created_by')) db.exec("ALTER TABLE care_records ADD COLUMN created_by TEXT NOT NULL DEFAULT 'legacy'");
if (!recordColumns.some(column => column.name === 'updated_by')) db.exec("ALTER TABLE care_records ADD COLUMN updated_by TEXT NOT NULL DEFAULT 'legacy'");
if (!recordColumns.some(column => column.name === 'deleted_at')) db.exec('ALTER TABLE care_records ADD COLUMN deleted_at TEXT');
if (!recordColumns.some(column => column.name === 'deleted_by')) db.exec('ALTER TABLE care_records ADD COLUMN deleted_by TEXT');

const recordTableSql = (db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'care_records'").get() as { sql: string }).sql;
if (recordTableSql.includes("supplement IN ('AD', 'VD', '益生菌')")) db.transaction(() => {
  db.exec(`
    CREATE TABLE care_records_unrestricted (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL CHECK (type IN ('feeding', 'supplement', 'bowel', 'note')),
      occurred_at TEXT NOT NULL,
      breast_milk_ml INTEGER,
      formula_ml INTEGER,
      supplement TEXT,
      bowel_size TEXT CHECK (bowel_size IN ('大', '中', '小')),
      subject TEXT,
      note TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      created_by TEXT NOT NULL DEFAULT 'legacy',
      updated_by TEXT NOT NULL DEFAULT 'legacy',
      deleted_at TEXT,
      deleted_by TEXT
    );
    INSERT INTO care_records_unrestricted
      SELECT id, type, occurred_at, breast_milk_ml, formula_ml, supplement, bowel_size, ${recordColumns.some(column => column.name === 'subject') ? 'subject' : 'NULL'}, note,
        created_at, updated_at, created_by, updated_by, deleted_at, deleted_by FROM care_records;
    DROP TABLE care_records;
    ALTER TABLE care_records_unrestricted RENAME TO care_records;
    CREATE INDEX idx_care_records_occurred_at ON care_records(occurred_at);
  `);
})();

const currentRecordColumns = db.prepare('PRAGMA table_info(care_records)').all() as { name: string }[];
if (!currentRecordColumns.some(column => column.name === 'subject')) db.exec('ALTER TABLE care_records ADD COLUMN subject TEXT');
db.prepare("UPDATE care_records SET subject = note, note = NULL WHERE type = 'note' AND subject IS NULL AND note IS NOT NULL").run();

db.transaction(() => {
  const rows = db.prepare('SELECT id, occurred_at AS occurredAt FROM care_records').all() as { id: string; occurredAt: string }[];
  const update = db.prepare('UPDATE care_records SET occurred_at = ? WHERE id = ?');
  for (const row of rows) {
    const normalized = canonicalInstant(row.occurredAt);
    if (normalized !== row.occurredAt) update.run(normalized, row.id);
  }
})();

db.exec(`
  CREATE TABLE IF NOT EXISTS record_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    record_id TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('create', 'update', 'delete', 'restore', 'import')),
    actor TEXT NOT NULL,
    occurred_at TEXT NOT NULL,
    snapshot TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_record_audit_record_id ON record_audit(record_id, occurred_at DESC);

  CREATE TABLE IF NOT EXISTS ai_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    provider TEXT NOT NULL,
    base_url TEXT NOT NULL,
    model TEXT NOT NULL,
    api_key TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  INSERT OR IGNORE INTO ai_settings (id, provider, base_url, model, api_key, updated_at)
  VALUES (1, 'DeepSeek', 'https://api.deepseek.com', 'deepseek-v4-flash', '', datetime('now'));

  CREATE TABLE IF NOT EXISTS ai_feeding_insights (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    summary TEXT NOT NULL,
    insights_json TEXT NOT NULL,
    alert TEXT NOT NULL DEFAULT 'none',
    gap_minutes INTEGER,
    next_feed_at TEXT,
    records_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS push_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    enabled INTEGER NOT NULL DEFAULT 0,
    pushplus_token TEXT NOT NULL DEFAULT '',
    pushplus_topic TEXT NOT NULL DEFAULT '',
    morning_digest_enabled INTEGER NOT NULL DEFAULT 1,
    morning_digest_time TEXT NOT NULL DEFAULT '08:00',
    feeding_gap_enabled INTEGER NOT NULL DEFAULT 1,
    feeding_gap_level1_minutes INTEGER NOT NULL DEFAULT 150,
    feeding_gap_level2_minutes INTEGER NOT NULL DEFAULT 180,
    care_item_enabled INTEGER NOT NULL DEFAULT 1,
    push_sent_flags TEXT NOT NULL DEFAULT '{}',
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  INSERT OR IGNORE INTO push_settings
    (id, enabled, pushplus_token, pushplus_topic, morning_digest_enabled, morning_digest_time, feeding_gap_enabled, feeding_gap_level1_minutes, feeding_gap_level2_minutes, care_item_enabled, push_sent_flags)
    VALUES (1, 0, '', '', 1, '08:00', 1, 150, 180, 1, '{}');

  CREATE TABLE IF NOT EXISTS app_notification_clients (
    client_id TEXT PRIMARY KEY,
    last_seen_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS app_notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL CHECK (type IN ('morning', 'feeding', 'care')),
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    target TEXT NOT NULL DEFAULT 'today',
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_app_notifications_expires_at ON app_notifications(expires_at);

  CREATE TABLE IF NOT EXISTS care_items (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    category TEXT NOT NULL DEFAULT 'medication' CHECK (category IN ('medication', 'care')),
    icon TEXT NOT NULL CHECK (icon IN ('medicine', 'massage', 'bath', 'care')),
    sort_order INTEGER NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    schedule_type TEXT NOT NULL DEFAULT 'as_needed' CHECK (schedule_type IN ('daily', 'interval', 'weekly', 'pattern', 'as_needed')),
    interval_days INTEGER NOT NULL DEFAULT 1,
    schedule_start_date TEXT,
    reminder_time TEXT,
    reminder_times TEXT,
    schedule_end_date TEXT,
    week_days TEXT,
    pattern_days TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS family_permissions (
    id TEXT PRIMARY KEY CHECK (id IN ('father', 'mother', 'grandfather', 'grandmother')),
    role TEXT NOT NULL CHECK (role IN ('superadmin', 'admin', 'member')),
    updated_at TEXT NOT NULL
  );
  INSERT OR IGNORE INTO family_permissions (id, role, updated_at) VALUES
    ('father', 'superadmin', datetime('now')),
    ('mother', 'admin', datetime('now')),
    ('grandfather', 'member', datetime('now')),
    ('grandmother', 'member', datetime('now'));

  CREATE TABLE IF NOT EXISTS growth_records (
    id TEXT PRIMARY KEY,
    measured_on TEXT NOT NULL,
    height_cm REAL NOT NULL,
    weight_kg REAL NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    created_by TEXT NOT NULL,
    updated_by TEXT NOT NULL,
    deleted_at TEXT,
    deleted_by TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_growth_records_measured_on ON growth_records(measured_on DESC);

  CREATE TABLE IF NOT EXISTS vaccine_records (
    id TEXT PRIMARY KEY,
    vaccine_name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'program' CHECK (category IN ('program', 'self_paid')),
    dose INTEGER NOT NULL,
    planned_on TEXT NOT NULL,
    appointment_on TEXT,
    appointment_time TEXT,
    administered_on TEXT,
    note TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    created_by TEXT NOT NULL,
    updated_by TEXT NOT NULL,
    deleted_at TEXT,
    deleted_by TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_vaccine_records_administered_on ON vaccine_records(administered_on DESC);

  CREATE TABLE IF NOT EXISTS vaccine_catalog (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    category TEXT NOT NULL CHECK (category IN ('program', 'self_paid')),
    short_name TEXT,
    description TEXT NOT NULL,
    dose_count INTEGER,
    interval_summary TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL,
    is_system INTEGER NOT NULL DEFAULT 0,
    deleted_at TEXT
  );

  CREATE TABLE IF NOT EXISTS milestones (
    id TEXT PRIMARY KEY,
    milestone_key TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('gross_motor', 'fine_motor', 'language', 'cognitive', 'social')),
    achieved_on TEXT NOT NULL,
    note TEXT,
    photo TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    created_by TEXT NOT NULL,
    updated_by TEXT NOT NULL DEFAULT '',
    deleted_at TEXT,
    deleted_by TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_milestones_achieved_on ON milestones(achieved_on DESC);
  CREATE INDEX IF NOT EXISTS idx_milestones_key ON milestones(milestone_key);
`);

const growthTableColumns = db.prepare('PRAGMA table_info(growth_records)').all() as { name: string }[];
if (!growthTableColumns.some(column => column.name === 'evaluation')) db.exec('ALTER TABLE growth_records ADD COLUMN evaluation TEXT');
if (!growthTableColumns.some(column => column.name === 'evaluated_at')) db.exec('ALTER TABLE growth_records ADD COLUMN evaluated_at TEXT');

const milestoneTableColumns = db.prepare('PRAGMA table_info(milestones)').all() as { name: string }[];
if (!milestoneTableColumns.some(column => column.name === 'updated_by')) db.exec("ALTER TABLE milestones ADD COLUMN updated_by TEXT NOT NULL DEFAULT ''");

const careItemTableColumns = db.prepare('PRAGMA table_info(care_items)').all() as { name: string }[];
if (!careItemTableColumns.some(column => column.name === 'schedule_type')) db.exec("ALTER TABLE care_items ADD COLUMN schedule_type TEXT NOT NULL DEFAULT 'as_needed' CHECK (schedule_type IN ('daily', 'interval', 'as_needed'))");
if (!careItemTableColumns.some(column => column.name === 'interval_days')) db.exec('ALTER TABLE care_items ADD COLUMN interval_days INTEGER NOT NULL DEFAULT 1');
if (!careItemTableColumns.some(column => column.name === 'schedule_start_date')) db.exec('ALTER TABLE care_items ADD COLUMN schedule_start_date TEXT');
if (!careItemTableColumns.some(column => column.name === 'reminder_time')) db.exec('ALTER TABLE care_items ADD COLUMN reminder_time TEXT');
if (!careItemTableColumns.some(column => column.name === 'schedule_end_date')) db.exec('ALTER TABLE care_items ADD COLUMN schedule_end_date TEXT');
if (!careItemTableColumns.some(column => column.name === 'reminder_times')) db.exec('ALTER TABLE care_items ADD COLUMN reminder_times TEXT');
if (!careItemTableColumns.some(column => column.name === 'week_days')) db.exec('ALTER TABLE care_items ADD COLUMN week_days TEXT');
if (!careItemTableColumns.some(column => column.name === 'pattern_days')) db.exec('ALTER TABLE care_items ADD COLUMN pattern_days TEXT');
// 重新获取列信息以反映 ALTER TABLE 后最新的表结构
const updatedCareItemTableColumns = db.prepare('PRAGMA table_info(care_items)').all() as { name: string }[];
const careItemTableSql = (db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'care_items'").get() as { sql: string }).sql;
if (!updatedCareItemTableColumns.some(column => column.name === 'category') || !careItemTableSql.includes("'bath'") || !careItemTableSql.includes("'weekly'") || !careItemTableSql.includes("'pattern'")) db.transaction(() => {
  const hasCategory = updatedCareItemTableColumns.some(column => column.name === 'category');
  db.exec(`
    CREATE TABLE care_items_new (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL DEFAULT 'medication' CHECK (category IN ('medication', 'care')),
      icon TEXT NOT NULL CHECK (icon IN ('medicine', 'massage', 'bath', 'care')),
      sort_order INTEGER NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      schedule_type TEXT NOT NULL DEFAULT 'as_needed' CHECK (schedule_type IN ('daily', 'interval', 'weekly', 'pattern', 'as_needed')),
      interval_days INTEGER NOT NULL DEFAULT 1,
      schedule_start_date TEXT,
      reminder_time TEXT,
      reminder_times TEXT,
      schedule_end_date TEXT,
      week_days TEXT,
      pattern_days TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    INSERT INTO care_items_new (id, name, category, icon, sort_order, active, schedule_type, interval_days, schedule_start_date, reminder_time, reminder_times, schedule_end_date, week_days, pattern_days, created_at, updated_at)
    SELECT id, name, ${hasCategory ? "category" : "CASE WHEN icon = 'massage' THEN 'care' ELSE 'medication' END"}, icon, sort_order, active, schedule_type, interval_days, schedule_start_date, reminder_time, ${careItemTableColumns.some(column => column.name === 'reminder_times') ? 'reminder_times' : 'NULL'}, schedule_end_date, ${careItemTableColumns.some(column => column.name === 'week_days') ? 'week_days' : 'NULL'}, ${careItemTableColumns.some(column => column.name === 'pattern_days') ? 'pattern_days' : 'NULL'}, created_at, updated_at
    FROM care_items;
    DROP TABLE care_items;
    ALTER TABLE care_items_new RENAME TO care_items;
  `);
})();

db.exec(`
  INSERT OR IGNORE INTO care_items (id, name, category, icon, sort_order, active, created_at, updated_at) VALUES
    ('ad', 'AD', 'medication', 'medicine', 10, 1, datetime('now'), datetime('now')),
    ('vd', 'VD', 'medication', 'medicine', 20, 1, datetime('now'), datetime('now')),
    ('probiotic', '益生菌', 'medication', 'medicine', 30, 1, datetime('now'), datetime('now')),
    ('massage', '推拿', 'care', 'massage', 40, 1, datetime('now'), datetime('now')),
    ('bath', '洗澡', 'care', 'bath', 50, 1, datetime('now'), datetime('now'));
`);

const vaccineTableColumns = db.prepare('PRAGMA table_info(vaccine_records)').all() as { name: string }[];
if (!vaccineTableColumns.some(column => column.name === 'category')) db.exec("ALTER TABLE vaccine_records ADD COLUMN category TEXT NOT NULL DEFAULT 'program' CHECK (category IN ('program', 'self_paid'))");
if (!vaccineTableColumns.some(column => column.name === 'appointment_on')) db.exec('ALTER TABLE vaccine_records ADD COLUMN appointment_on TEXT');
if (!vaccineTableColumns.some(column => column.name === 'appointment_time')) db.exec('ALTER TABLE vaccine_records ADD COLUMN appointment_time TEXT');
const vaccineCatalogTableColumns = db.prepare('PRAGMA table_info(vaccine_catalog)').all() as { name: string }[];
if (!vaccineCatalogTableColumns.some(column => column.name === 'deleted_at')) db.exec('ALTER TABLE vaccine_catalog ADD COLUMN deleted_at TEXT');
if (!vaccineCatalogTableColumns.some(column => column.name === 'is_system')) db.exec('ALTER TABLE vaccine_catalog ADD COLUMN is_system INTEGER NOT NULL DEFAULT 0');

const pushSettingsColumns = db.prepare('PRAGMA table_info(push_settings)').all() as { name: string }[];
if (!pushSettingsColumns.some(column => column.name === 'pushplus_token')) db.exec("ALTER TABLE push_settings ADD COLUMN pushplus_token TEXT NOT NULL DEFAULT ''");
if (!pushSettingsColumns.some(column => column.name === 'pushplus_topic')) db.exec("ALTER TABLE push_settings ADD COLUMN pushplus_topic TEXT NOT NULL DEFAULT ''");
if (!pushSettingsColumns.some(column => column.name === 'morning_digest_enabled')) db.exec('ALTER TABLE push_settings ADD COLUMN morning_digest_enabled INTEGER NOT NULL DEFAULT 1');
if (!pushSettingsColumns.some(column => column.name === 'morning_digest_time')) db.exec("ALTER TABLE push_settings ADD COLUMN morning_digest_time TEXT NOT NULL DEFAULT '08:00'");
if (!pushSettingsColumns.some(column => column.name === 'feeding_gap_enabled')) db.exec('ALTER TABLE push_settings ADD COLUMN feeding_gap_enabled INTEGER NOT NULL DEFAULT 1');
if (!pushSettingsColumns.some(column => column.name === 'feeding_gap_level1_minutes')) db.exec('ALTER TABLE push_settings ADD COLUMN feeding_gap_level1_minutes INTEGER NOT NULL DEFAULT 150');
if (!pushSettingsColumns.some(column => column.name === 'feeding_gap_level2_minutes')) db.exec('ALTER TABLE push_settings ADD COLUMN feeding_gap_level2_minutes INTEGER NOT NULL DEFAULT 180');
if (!pushSettingsColumns.some(column => column.name === 'push_sent_flags')) db.exec("ALTER TABLE push_settings ADD COLUMN push_sent_flags TEXT NOT NULL DEFAULT '{}'");
if (!pushSettingsColumns.some(column => column.name === 'care_item_enabled')) db.exec('ALTER TABLE push_settings ADD COLUMN care_item_enabled INTEGER NOT NULL DEFAULT 1');
// 启动时确保 id=1 的唯一行存在：修复历史库 NOT NULL 无 DEFAULT 导致 INSERT OR IGNORE 被吞、上行缺失的问题
db.prepare(`
  INSERT OR IGNORE INTO push_settings
    (id, updated_at, enabled, pushplus_token, pushplus_topic, morning_digest_enabled, morning_digest_time, feeding_gap_enabled, feeding_gap_level1_minutes, feeding_gap_level2_minutes, care_item_enabled, push_sent_flags)
    VALUES (1, COALESCE((SELECT updated_at FROM push_settings WHERE id = 1), ''),
            COALESCE((SELECT enabled FROM push_settings WHERE id = 1), 0),
            COALESCE((SELECT pushplus_token FROM push_settings WHERE id = 1), ''),
            COALESCE((SELECT pushplus_topic FROM push_settings WHERE id = 1), ''),
            COALESCE((SELECT morning_digest_enabled FROM push_settings WHERE id = 1), 1),
            COALESCE((SELECT morning_digest_time FROM push_settings WHERE id = 1), '08:00'),
            COALESCE((SELECT feeding_gap_enabled FROM push_settings WHERE id = 1), 1),
            COALESCE((SELECT feeding_gap_level1_minutes FROM push_settings WHERE id = 1), 150),
            COALESCE((SELECT feeding_gap_level2_minutes FROM push_settings WHERE id = 1), 180),
            COALESCE((SELECT care_item_enabled FROM push_settings WHERE id = 1), 1),
            COALESCE((SELECT push_sent_flags FROM push_settings WHERE id = 1), '{}'))
`).run();

db.exec(`
  CREATE TABLE IF NOT EXISTS daily_reports (
    report_date TEXT PRIMARY KEY,
    summary TEXT NOT NULL,
    suggestions TEXT NOT NULL,
    model TEXT NOT NULL,
    generated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS ai_memories (
    id TEXT PRIMARY KEY,
    content TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'notes' CHECK (category IN ('preferences', 'health', 'notes')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    expires_at TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'resolved')),
    resolved_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_ai_memories_updated_at ON ai_memories(updated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_ai_memories_expires_at ON ai_memories(expires_at);

  CREATE TABLE IF NOT EXISTS chat_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL CHECK (user_id IN ('father', 'mother', 'grandfather', 'grandmother')),
    title TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_chat_sessions_user ON chat_sessions(user_id, created_at DESC);

  CREATE TABLE IF NOT EXISTS chat_messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id, created_at ASC);
`);

const dailyReportUtcMigration = 'daily-report-utc-boundaries-v1';
if (!db.prepare('SELECT 1 FROM schema_migrations WHERE name = ?').get(dailyReportUtcMigration)) db.transaction(() => {
  db.prepare('DELETE FROM daily_reports').run();
  db.prepare('INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)').run(dailyReportUtcMigration, new Date().toISOString());
})();

// 记忆过期字段：旧库可能没有 expires_at，按需补列（CREATE TABLE IF NOT EXISTS 不会为已存在的表加列）
const aiMemoryColumns = db.prepare('PRAGMA table_info(ai_memories)').all() as { name: string }[];
if (!aiMemoryColumns.some(column => column.name === 'expires_at')) db.exec('ALTER TABLE ai_memories ADD COLUMN expires_at TEXT');
if (!aiMemoryColumns.some(column => column.name === 'status')) db.exec("ALTER TABLE ai_memories ADD COLUMN status TEXT NOT NULL DEFAULT 'active'");
if (!aiMemoryColumns.some(column => column.name === 'resolved_at')) db.exec('ALTER TABLE ai_memories ADD COLUMN resolved_at TEXT');

export function closeDatabaseForTests() { db.close(); }
