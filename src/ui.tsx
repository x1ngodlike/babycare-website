import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export type ConfirmOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};

let confirmationHandler: (options: ConfirmOptions) => Promise<boolean> = async options => window.confirm([options.title, options.description].filter(Boolean).join('\n\n'));

export function confirmAction(options: ConfirmOptions) {
  return confirmationHandler(options);
}

export function useDialogFocus(ref: React.RefObject<HTMLElement | null>, onClose: () => void, active = true) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!active) return;
    const previous = document.activeElement as HTMLElement | null;
    const focusable = () => [...(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [href]') || [])];
    focusable()[0]?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current(); return; }
      if (event.key !== 'Tab') return;
      const items = focusable(); if (!items.length) return;
      const first = items[0]; const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', keydown);
    return () => { window.removeEventListener('keydown', keydown); previous?.focus(); };
  }, [active, ref]);
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [request, setRequest] = useState<{ options: ConfirmOptions; resolve(value: boolean): void } | null>(null);
  const dialogRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    confirmationHandler = options => new Promise(resolve => setRequest({ options, resolve }));
    return () => { confirmationHandler = async options => window.confirm([options.title, options.description].filter(Boolean).join('\n\n')); };
  }, []);
  const close = (result: boolean) => { request?.resolve(result); setRequest(null); };
  useDialogFocus(dialogRef, () => request && close(false), Boolean(request));
  return <>{children}{request && <div className="modal-layer confirm-layer" onMouseDown={event => event.target === event.currentTarget && close(false)}><section ref={dialogRef} className="ui-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby={request.options.description ? 'confirm-description' : undefined}><header><h2 id="confirm-title">{request.options.title}</h2><button type="button" className="close-btn" onClick={() => close(false)} aria-label="关闭">×</button></header>{request.options.description && <p id="confirm-description">{request.options.description}</p>}<footer><button type="button" className="btn secondary" onClick={() => close(false)}>{request.options.cancelLabel || '取消'}</button><button type="button" className={`btn ${request.options.danger ? 'danger-button' : 'primary'}`} onClick={() => close(true)}>{request.options.confirmLabel || '确认'}</button></footer></section></div>}</>;
}

export type ActionMenuItem = { label: string; onSelect(): void | Promise<void>; danger?: boolean };

export function ActionMenu({ label, items, className = '' }: { label: string; items: ActionMenuItem[]; className?: string }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const openedAtRef = useRef(0);
  const toggle = () => {
    if (open) { setOpen(false); setPos(null); return; }
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) setPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    setOpen(true);
  };
  useEffect(() => {
    if (!open) return;
    openedAtRef.current = Date.now();
    popoverRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    const pointer = (event: PointerEvent) => { if (event.target instanceof Node && !triggerRef.current?.contains(event.target) && !popoverRef.current?.contains(event.target)) setOpen(false); };
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    const scroll = () => { if (Date.now() - openedAtRef.current > 100) setOpen(false); };
    window.addEventListener('resize', scroll); window.addEventListener('scroll', scroll, true); document.addEventListener('pointerdown', pointer); window.addEventListener('keydown', key);
    return () => { window.removeEventListener('resize', scroll); window.removeEventListener('scroll', scroll, true); document.removeEventListener('pointerdown', pointer); window.removeEventListener('keydown', key); };
  }, [open]);
  function moveFocus(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    popoverRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')[next]?.focus();
  }
  return <div ref={ref} className={`ui-action-menu ${className}`}><button ref={triggerRef} type="button" className="ui-action-trigger" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={toggle}><span className="menu-dots" aria-hidden="true"><i /><i /><i /></span></button>{open && pos && createPortal(<div ref={popoverRef} className="ui-action-popover" role="menu" style={{ position: 'fixed', top: pos.top, right: pos.right }}>{items.map((item, index) => <button type="button" role="menuitem" className={item.danger ? 'danger' : ''} key={item.label} onKeyDown={event => moveFocus(event, index)} onClick={() => { setOpen(false); void item.onSelect(); }}>{item.label}</button>)}</div>, document.body)}</div>;
}

export function SegmentedControl<T extends string>({ label, value, options, onChange, className = '' }: { label: string; value: T; options: { value: T; label: string }[]; onChange(value: T): void; className?: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  function keydown(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + options.length) % options.length;
    onChange(options[next].value);
    ref.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
  }
  return <div ref={ref} className={`ui-segmented ${className}`} role="tablist" aria-label={label}>{options.map((option, index) => <button type="button" role="tab" key={option.value} aria-selected={value === option.value} tabIndex={value === option.value ? 0 : -1} className={value === option.value ? 'active' : ''} onKeyDown={event => keydown(event, index)} onClick={() => onChange(option.value)}>{option.label}</button>)}</div>;
}

export function Switch({ checked, label, onChange, disabled = false }: { checked: boolean; label: string; onChange(value: boolean): void; disabled?: boolean }) {
  return <button type="button" className={`ui-switch ${checked ? 'on' : ''}`} role="switch" aria-label={label} aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)}><span /></button>;
}

export function EmptyState({ title, description, image, action }: { title: string; description?: string; image?: string; action?: React.ReactNode }) {
  return <div className="empty-state">{image ? <img className="empty-state-image" src={image} alt="" /> : <span aria-hidden="true">○</span>}<h3>{title}</h3>{description && <p>{description}</p>}{action && <div className="empty-state-action">{action}</div>}</div>;
}
