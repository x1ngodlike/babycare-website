import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Inbox, X } from 'lucide-react';

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
  useEffect(() => {
    if (!request) return;
    const root = document.getElementById('root');
    if (!root) return;
    const previousAriaHidden = root.getAttribute('aria-hidden');
    const wasInert = root.hasAttribute('inert');
    root.setAttribute('aria-hidden', 'true');
    root.setAttribute('inert', '');
    root.inert = true;
    return () => {
      root.inert = false;
      if (!wasInert) root.removeAttribute('inert');
      if (previousAriaHidden === null) root.removeAttribute('aria-hidden');
      else root.setAttribute('aria-hidden', previousAriaHidden);
    };
  }, [request]);
  const close = (result: boolean) => { request?.resolve(result); setRequest(null); };
  useDialogFocus(dialogRef, () => request && close(false), Boolean(request));
  return <>{children}{request && createPortal(<div className="modal-layer confirm-layer" onMouseDown={event => event.target === event.currentTarget && close(false)}><section ref={dialogRef} className="ui-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby={request.options.description ? 'confirm-description' : undefined}><header><h2 id="confirm-title">{request.options.title}</h2><button type="button" className="close-btn" onClick={() => close(false)} aria-label="关闭"><X aria-hidden="true" /></button></header>{request.options.description && <p id="confirm-description">{request.options.description}</p>}<footer><button type="button" className="btn secondary" onClick={() => close(false)}>{request.options.cancelLabel || '取消'}</button><button type="button" className={`btn ${request.options.danger ? 'danger-button' : 'primary'}`} onClick={() => close(true)}>{request.options.confirmLabel || '确认'}</button></footer></section></div>, document.body)}</>;
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
  return <div className="empty-state">{image ? <img className="empty-state-image" src={image} alt="" /> : <span className="empty-state-placeholder" aria-hidden="true"><Inbox /></span>}<h3>{title}</h3>{description && <p>{description}</p>}{action && <div className="empty-state-action">{action}</div>}</div>;
}

export function ImageWithFallback({ src, fallbackSrc, onError, ...props }: React.ImgHTMLAttributes<HTMLImageElement> & { fallbackSrc: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [src]);
  const resolvedSrc = !failed && src ? src : fallbackSrc;
  return <img {...props} src={resolvedSrc} onError={event => {
    onError?.(event);
    if (resolvedSrc !== fallbackSrc) setFailed(true);
  }} />;
}

// ----- 弹窗与脏关闭确认（由各视图弹窗抽出，行为与原实现一致） -----

/** 内容有未保存修改时，关闭需二次确认。返回 Promise 的关闭函数。 */
export function useDirtyClose(dirty: boolean, onClose: () => void, busy = false, confirm?: Partial<ConfirmOptions>) {
  return useCallback(async () => {
    if (busy) return;
    if (dirty && !await confirmAction({ title: confirm?.title ?? '放弃未保存的内容？', description: confirm?.description ?? '当前填写内容不会保存。', confirmLabel: confirm?.confirmLabel ?? '放弃修改', danger: true })) return;
    const layers = [...document.querySelectorAll<HTMLElement>('.modal-layer:not(.confirm-layer)')];
    const layer = layers.at(-1);
    if (layer) {
      layer.classList.add('closing');
      const dialog = layer.querySelector<HTMLElement>('[role="dialog"]');
      if (dialog) { dialog.inert = true; dialog.setAttribute('aria-hidden', 'true'); }
      if (!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) await new Promise(resolve => window.setTimeout(resolve, 180));
    }
    onClose();
  }, [dirty, onClose, busy, confirm?.title, confirm?.description, confirm?.confirmLabel]);
}

/** 通用弹窗骨架：遮罩 + editor 容器 + 标题栏（可选 kicker 与额外描述）+ 关闭按钮，统一焦点圈定与 Escape/遮罩关闭。内容与操作按钮由 children 提供。 */
export function Modal({ title, kicker, headerExtra, onClose, children, className = '', busy = false }: {
  title: string;
  kicker?: string;
  headerExtra?: React.ReactNode;
  onClose(): void;
  children: React.ReactNode;
  className?: string;
  busy?: boolean;
}) {
  const dialogRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const [closing, setClosing] = useState(false);
  const closeTimer = useRef<number | null>(null);
  const requestClose = useCallback(() => {
    if (busy || closing) return;
    setClosing(true);
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    closeTimer.current = window.setTimeout(async () => {
      await onClose();
      await new Promise(resolve => window.requestAnimationFrame(resolve));
      if (document.querySelector('.confirm-layer')) {
        await new Promise<void>(resolve => {
          const observer = new MutationObserver(() => {
            if (!document.querySelector('.confirm-layer')) { observer.disconnect(); resolve(); }
          });
          observer.observe(document.body, { childList: true });
        });
      }
      setClosing(false);
    }, reduceMotion ? 0 : 180);
  }, [busy, closing, onClose]);
  useEffect(() => () => {
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
  }, []);
  useDialogFocus(dialogRef, requestClose, !closing);
  return (
    <div className={`modal-layer${closing ? ' closing' : ''}`} onMouseDown={event => event.target === event.currentTarget && requestClose()}>
      <section ref={dialogRef} className={`editor ${className}`} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-hidden={closing || undefined} inert={closing || undefined}>
        <header className="editor-head"><div>{kicker && <p className="kicker">{kicker}</p>}<h2 id={titleId}>{title}</h2>{headerExtra}</div><button className="close-btn" disabled={busy} onClick={requestClose} aria-label="关闭"><X aria-hidden="true" /></button></header>
        {children}
      </section>
    </div>
  );
}
