// 测试数据脚本：清空并重建近 30 天照护数据（喂奶/排便/护理/备注）
// 注意：会删除 care_records 全部现有记录，仅用于开发环境
// 用法：node scripts/seed-records.mjs
import Database from 'better-sqlite3';

const db = new Database('data/baby-care.db');
db.pragma('journal_mode = WAL');

const creators = ['father', 'mother', 'grandmother'];
const pick = list => list[Math.floor(Math.random() * list.length)];
const pad = n => String(n).padStart(2, '0');
// 本地（Asia/Shanghai）日期 -> UTC ISO
const localToUtc = (y, m, d, hh, mm) => new Date(Date.UTC(y, m - 1, d, hh - 8, mm)).toISOString();

const now = new Date();
const endY = now.getFullYear(); const endM = now.getMonth() + 1; const endD = now.getDate();
const rows = [];
let id = 0;
const nextId = () => `seed-${Date.now().toString(36)}-${(id += 1).toString(36).padStart(4, '0')}`;

// 生成近 30 天（含今天），喂奶锚点为本地时间，白天 ~3h 间隔 + 夜间长间隔
const DAY_COUNT = 30;
for (let back = DAY_COUNT - 1; back >= 0; back -= 1) {
  const date = new Date(endY, endM - 1, endD - back);
  const y = date.getFullYear(); const m = date.getMonth() + 1; const d = date.getDate();
  const isToday = back === 0;

  // 每天喂奶时刻（本地）：7 点起，白天每 2.5–3.5h；夜间 1 次或 2 次夜奶（间隔 ≥2h）
  const feeds = [];
  if (Math.random() < 0.45) {
    feeds.push(0.5 + Math.random());      // 第一次夜奶 0:30–1:30
    feeds.push(3.5 + Math.random());      // 第二次夜奶 3:30–4:30
  } else {
    feeds.push(1 + Math.random() * 1.5);  // 单次夜奶 1:00–2:30
  }
  let cursor = 7 + Math.random() * 0.5;
  while (cursor < 22) { feeds.push(cursor); cursor += 2.5 + Math.random(); }
  for (const feed of feeds) {
    const hh = Math.floor(feed); const mm = Math.floor((feed - hh) * 60) + Math.floor(Math.random() * 21 - 10);
    const at = localToUtc(y, m, d, hh, Math.max(0, Math.min(59, mm)));
    if (isToday && new Date(at) > now) continue; // 今天不生成未来记录
    const kind = Math.random();
    const breast = kind < 0.4 ? 60 + Math.floor(Math.random() * 41) : null;
    const formula = kind >= 0.35 ? 90 + Math.floor(Math.random() * 61) : null;
    rows.push({ id: nextId(), type: 'feeding', at, breast, formula, supplement: null, bowel: null, note: null, by: pick(creators) });
  }

  // 排便 1–2 次
  if (Math.random() < 0.95) {
    const count = Math.random() < 0.55 ? 2 : 1;
    for (let i = 0; i < count; i += 1) {
      const hh = 6 + Math.floor(Math.random() * 15); const mm = Math.floor(Math.random() * 60);
      const at = localToUtc(y, m, d, hh, mm);
      if (isToday && new Date(at) > now) continue;
      rows.push({ id: nextId(), type: 'bowel', at, breast: null, formula: null, supplement: null, bowel: pick(['大', '中', '小']), note: null, by: pick(creators) });
    }
  }

  // 护理：AD/VD 每天上午；益生菌/推拿/洗澡随机
  const morning = localToUtc(y, m, d, 10, Math.floor(Math.random() * 60));
  if (!isToday || new Date(morning) <= now) {
    rows.push({ id: nextId(), type: 'supplement', at: morning, breast: null, formula: null, supplement: 'AD', bowel: null, note: null, by: pick(creators) });
    if (back % 2 === 0) rows.push({ id: nextId(), type: 'supplement', at: morning, breast: null, formula: null, supplement: 'VD', bowel: null, note: null, by: pick(creators) });
  }
  if (Math.random() < 0.5) {
    const at = localToUtc(y, m, d, 14 + Math.floor(Math.random() * 5), Math.floor(Math.random() * 60));
    if (!isToday || new Date(at) <= now) rows.push({ id: nextId(), type: 'supplement', at, breast: null, formula: null, supplement: pick(['推拿', '益生菌']), bowel: null, note: null, by: pick(creators) });
  }
  if (Math.random() < 0.4) {
    const at = localToUtc(y, m, d, 19 + Math.floor(Math.random() * 2), Math.floor(Math.random() * 60));
    if (!isToday || new Date(at) <= now) rows.push({ id: nextId(), type: 'supplement', at, breast: null, formula: null, supplement: '洗澡', bowel: null, note: null, by: pick(creators) });
  }

  // 偶发备注
  if (Math.random() < 0.12) {
    const at = localToUtc(y, m, d, 12 + Math.floor(Math.random() * 8), Math.floor(Math.random() * 60));
    if (!isToday || new Date(at) <= now) rows.push({ id: nextId(), type: 'note', at, breast: null, formula: null, supplement: null, bowel: null, note: pick(['今天精神不错', '睡了个长觉', '外出散步半小时']), by: pick(creators) });
  }
}

const insert = db.prepare(`INSERT INTO care_records (id, type, occurred_at, breast_milk_ml, formula_ml, supplement, bowel_size, note, created_at, updated_at, created_by, updated_by) VALUES (@id, @type, @at, @breast, @formula, @supplement, @bowel, @note, @at, @at, @by, @by)`);
const wipe = db.transaction(() => {
  db.exec("DELETE FROM care_records");
  db.exec("DELETE FROM record_audit WHERE record_id LIKE 'seed-%'");
  for (const row of rows) insert.run(row);
});
wipe();

const summary = db.prepare("SELECT type, COUNT(*) n FROM care_records GROUP BY type").all();
const range = db.prepare("SELECT MIN(occurred_at) a, MAX(occurred_at) b FROM care_records").get();
console.log('[seed] done', summary, range);
db.close();
