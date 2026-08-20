import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { isoDay } from './date';
import { useDialogFocus } from './ui';

/* ---------- 纯逻辑（可单测） ---------- */

export function pad2(value: number) {
  return String(value).padStart(2, '0');
}

/** 严格校验 YYYY-MM-DD，且必须是真实存在的日期（拒绝 2026-02-30 之类）。 */
export function isValidDay(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]); const month = Number(match[2]); const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

/** ISO 日期字符串按字典序即可比较。 */
export function compareDay(a: string, b: string) {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function shiftMonth(year: number, month: number, delta: number) {
  const total = year * 12 + month + delta;
  return { year: Math.floor(total / 12), month: ((total % 12) + 12) % 12 };
}

export type DayCell = { day: string; inMonth: boolean };

/** 生成周一开头、固定 6 行 42 格的月历。 */
export function monthGrid(year: number, month: number): DayCell[] {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7; // 周一为一周起点
  const start = new Date(year, month, 1 - offset);
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
    return { day: isoDay(date), inMonth: date.getMonth() === month };
  });
}

export function formatDay(day: string) {
  const [year, month, date] = day.split('-');
  return `${Number(year)}年${Number(month)}月${Number(date)}日`;
}

export function clampDay(day: string, min?: string, max?: string) {
  if (min && compareDay(day, min) < 0) return min;
  if (max && compareDay(day, max) > 0) return max;
  return day;
}

/** ISO 时间戳 → 本地 { day, time }。 */
export function splitLocal(iso: string) {
  const date = new Date(iso);
  return { day: isoDay(date), time: `${pad2(date.getHours())}:${pad2(date.getMinutes())}` };
}

/** 本地 day + time → ISO 时间戳。 */
export function combineLocal(day: string, time: string) {
  return new Date(`${day}T${time}:00`).toISOString();
}

/** 以当前时间为基准，返回若干分钟前的 ISO 时间戳。 */
export function minutesAgoIso(minutesAgo: number, now = Date.now()) {
  return new Date(now - minutesAgo * 60000).toISOString();
}

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];
const HOURS = Array.from({ length: 24 }, (_, index) => pad2(index));
const MINUTES = Array.from({ length: 60 }, (_, index) => pad2(index));

/* ---------- 月历（三个组件共用） ---------- */

function Calendar({ day, min, max, onPick }: { day: string; min?: string; max?: string; onPick(day: string): void }) {
  const today = isoDay(new Date());
  const initial = isValidDay(day) ? day : clampDay(today, min, max);
  const [view, setView] = useState(() => {
    const [year, month] = initial.split('-').map(Number);
    return { year, month: month - 1 };
  });
  const gridRef = useRef<HTMLDivElement | null>(null);
  const cells = monthGrid(view.year, view.month);
  const firstDay = `${view.year}-${pad2(view.month + 1)}-01`;
  const prevMonthLastDay = isoDay(new Date(view.year, view.month, 0)); // 当月第 0 天 = 上月最后一天
  const canPrev = !min || compareDay(prevMonthLastDay, min) >= 0;
  const canNext = !max || compareDay(firstDay, max) <= 0;
  const inRange = (dayValue: string) => (!min || compareDay(dayValue, min) >= 0) && (!max || compareDay(dayValue, max) <= 0);
  const focusDay = (dayValue: string) => gridRef.current?.querySelector<HTMLButtonElement>(`button[data-day="${dayValue}"]`)?.focus();

  function move(current: string, delta: number) {
    const date = new Date(`${current}T12:00:00`);
    date.setDate(date.getDate() + delta);
    const next = isoDay(date);
    const [year, month] = next.split('-').map(Number);
    if (year !== view.year || month - 1 !== view.month) setView({ year, month: month - 1 });
    // 等视图渲染后再聚焦
    requestAnimationFrame(() => focusDay(next));
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, cell: DayCell) {
    const delta = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : event.key === 'ArrowUp' ? -7 : event.key === 'ArrowDown' ? 7 : 0;
    if (!delta) return;
    event.preventDefault();
    move(cell.day, delta);
  }

  return <div className="picker-calendar">
    <div className="picker-calendar-nav">
      <button type="button" aria-label="上个月" disabled={!canPrev} onClick={() => setView(shiftMonth(view.year, view.month, -1))}><ChevronLeft size={18} strokeWidth={2.2} /></button>
      <strong aria-live="polite">{view.year}年{view.month + 1}月</strong>
      <button type="button" aria-label="下个月" disabled={!canNext} onClick={() => setView(shiftMonth(view.year, view.month, 1))}><ChevronRight size={18} strokeWidth={2.2} /></button>
    </div>
    <div className="picker-weekdays">{WEEKDAYS.map(name => <span key={name}>{name}</span>)}</div>
    <div className="picker-grid" ref={gridRef} role="grid" aria-label={`${view.year}年${view.month + 1}月`}>
      {cells.map(cell => {
        const disabled = !cell.inMonth || !inRange(cell.day);
        return <button
          type="button"
          role="gridcell"
          key={cell.day}
          data-day={cell.day}
          disabled={disabled}
          className={`picker-day${cell.inMonth ? '' : ' outside'}${cell.day === today ? ' today' : ''}${cell.day === day ? ' selected' : ''}`}
          aria-pressed={cell.day === day}
          aria-label={cell.day === today ? `${formatDay(cell.day)}，今天` : formatDay(cell.day)}
          onKeyDown={event => onKeyDown(event, cell)}
          onClick={() => onPick(cell.day)}
        >{Number(cell.day.split('-')[2])}</button>;
      })}
    </div>
  </div>;
}

/* ---------- 时间滚轮（时 / 分 两列） ---------- */

function TimeColumns({ value, onChange }: { value: string; onChange(value: string): void }) {
  const [hour = '12', minute = '00'] = value.split(':');
  const hourRef = useRef<HTMLDivElement | null>(null);
  const minuteRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    // 等弹层完成布局后再定位（offsetTop 相对已定位的列容器）
    const frame = requestAnimationFrame(() => {
      for (const [container, selected] of [[hourRef.current, hour], [minuteRef.current, minute]] as const) {
        const target = container?.querySelector<HTMLButtonElement>(`button[data-value="${selected}"]`);
        if (container && target) container.scrollTop = target.offsetTop - (container.clientHeight - target.clientHeight) / 2;
      }
    });
    return () => cancelAnimationFrame(frame);
  }, []); // 仅在打开时定位一次
  const column = (options: string[], selected: string, unit: string, ref: React.RefObject<HTMLDivElement | null>, pick: (next: string) => void) => (
    <div className="picker-time-column" role="listbox" aria-label={unit} ref={ref}>
      {options.map(option => <button
        type="button"
        role="option"
        aria-selected={option === selected}
        key={option}
        data-value={option}
        className={option === selected ? 'selected' : ''}
        onClick={() => pick(option)}
      >{option}</button>)}
    </div>
  );
  return <div className="picker-time">
    {column(HOURS, hour, '小时', hourRef, next => onChange(`${next}:${minute}`))}
    <span className="picker-time-sep" aria-hidden="true">:</span>
    {column(MINUTES, minute, '分钟', minuteRef, next => onChange(`${hour}:${next}`))}
  </div>;
}

/* ---------- 弹层骨架 ---------- */

function PickerSheet({ title, onClose, children, footer }: { title: string; onClose(): void; children: React.ReactNode; footer?: React.ReactNode }) {
  const dialogRef = useRef<HTMLElement | null>(null);
  useDialogFocus(dialogRef, onClose);
  return <div className="modal-layer picker-layer" onMouseDown={event => event.target === event.currentTarget && onClose()}>
    <section ref={dialogRef} className="editor picker-sheet" role="dialog" aria-modal="true" aria-label={title}>
      <header className="editor-head"><h2>{title}</h2><button type="button" className="close-btn" onClick={onClose} aria-label="关闭">×</button></header>
      {children}
      {footer && <footer className="picker-actions">{footer}</footer>}
    </section>
  </div>;
}

function FieldShell({ label, required, display, placeholder, disabled, onOpen }: { label: string; required: boolean; display: string; placeholder: string; disabled?: boolean; onOpen(): void }) {
  return <div className="picker-field">
    <span className="picker-field-label">{label}{!required && <span className="picker-optional">选填</span>}</span>
    <button type="button" className={`picker-trigger${display ? '' : ' empty'}`} aria-haspopup="dialog" disabled={disabled} onClick={onOpen}>
      {display || placeholder}
    </button>
  </div>;
}

/* ---------- DateField ---------- */

export function DateField({ label, value, onChange, min, max, required = true, disabled = false }: { label: string; value: string; onChange(value: string): void; min?: string; max?: string; required?: boolean; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const today = isoDay(new Date());
  const todayInRange = (!min || compareDay(today, min) >= 0) && (!max || compareDay(today, max) <= 0);
  return <>
    <FieldShell label={label} required={required} disabled={disabled} display={value && isValidDay(value) ? formatDay(value) : ''} placeholder="选择日期" onOpen={() => setOpen(true)} />
    {open && <PickerSheet title={label} onClose={() => setOpen(false)} footer={<>
      {!required && value && <button type="button" className="btn secondary" onClick={() => { onChange(''); setOpen(false); }}>清除</button>}
      {todayInRange && <button type="button" className="btn secondary" onClick={() => { onChange(today); setOpen(false); }}>今天</button>}
    </>}>
      <Calendar day={value} min={min} max={max} onPick={day => { onChange(day); setOpen(false); }} />
    </PickerSheet>}
  </>;
}

/* ---------- TimeField ---------- */

export function TimeField({ label, value, onChange, required = true, disabled = false }: { label: string; value: string; onChange(value: string): void; required?: boolean; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value || '08:00');
  const open_ = () => { setDraft(value || '08:00'); setOpen(true); };
  return <>
    <FieldShell label={label} required={required} disabled={disabled} display={value} placeholder="选择时间" onOpen={open_} />
    {open && <PickerSheet title={label} onClose={() => setOpen(false)} footer={<>
      {!required && value && <button type="button" className="btn secondary" onClick={() => { onChange(''); setOpen(false); }}>清除</button>}
      <button type="button" className="btn secondary" onClick={() => setOpen(false)}>取消</button>
      <button type="button" className="btn primary" onClick={() => { onChange(draft); setOpen(false); }}>确定</button>
    </>}>
      <TimeColumns value={draft} onChange={setDraft} />
    </PickerSheet>}
  </>;
}

/* ---------- DateTimeField ---------- */

export function DateTimeField({ label, value, onChange, max, disabled = false }: { label: string; value: string; onChange(value: string): void; max?: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const initial = splitLocal(value);
  const [draft, setDraft] = useState(initial);
  const maxLocal = max ? splitLocal(max) : undefined;
  const open_ = () => { setDraft(splitLocal(value)); setOpen(true); };
  function commit() {
    let iso = combineLocal(draft.day, draft.time);
    if (max && iso > max) iso = max; // 不允许超过上限（默认：未来 10 分钟内）
    onChange(iso);
    setOpen(false);
  }
  function quick(minutesAgo: number) {
    onChange(minutesAgoIso(minutesAgo));
    setOpen(false);
  }
  return <>
    <FieldShell label={label} required display={`${formatDay(initial.day)} ${initial.time}`} placeholder="选择时间" disabled={disabled} onOpen={open_} />
    {open && <PickerSheet title={label} onClose={() => setOpen(false)} footer={<>
      <button type="button" className="btn secondary" onClick={() => setOpen(false)}>取消</button>
      <button type="button" className="btn primary" onClick={commit}>确定</button>
    </>}>
      <div className="picker-quick">
        <button type="button" onClick={() => quick(0)}>现在</button>
        <button type="button" onClick={() => quick(30)}>30 分钟前</button>
        <button type="button" onClick={() => quick(60)}>1 小时前</button>
      </div>
      <Calendar day={draft.day} max={maxLocal?.day} onPick={day => setDraft(current => ({ ...current, day }))} />
      <TimeColumns value={draft.time} onChange={time => setDraft(current => ({ ...current, time }))} />
    </PickerSheet>}
  </>;
}
