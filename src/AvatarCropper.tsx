// 头像裁剪弹窗（由 App.tsx 抽出，仅被懒加载视图引用，可自动进入共享异步 chunk）
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useDialogFocus } from './ui';

export function AvatarCropperModal({ imageSrc, onClose, onConfirm }: { imageSrc: string; onClose(): void; onConfirm(file: File): void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [size] = useState({ w: 320, h: 320 });
  const stateRef = useRef({ imgW: 0, imgH: 0, scale: 1, offsetX: 0, offsetY: 0, minScale: 1 });
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const gestureRef = useRef({ centerX: 0, centerY: 0, distance: 0 });
  const dialogRef = useRef<HTMLElement | null>(null); useDialogFocus(dialogRef, onClose);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      imageRef.current = img;
      const canvas = canvasRef.current!;
      const ctx = canvas.getContext('2d')!;
      const s = stateRef.current;
      s.imgW = img.width; s.imgH = img.height;
      // 最小缩放：确保完全覆盖裁剪圆
      const cover = Math.max(size.w / img.width, size.h / img.height);
      s.scale = cover; s.minScale = cover;
      s.offsetX = (size.w - img.width * s.scale) / 2;
      s.offsetY = (size.h - img.height * s.scale) / 2;
      draw(ctx, canvas, img, s);
      setReady(true);
    };
    img.src = imageSrc;
  }, [imageSrc, size.w, size.h]);

  function draw(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, img: HTMLImageElement, s: typeof stateRef.current) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    // 圆形裁剪区
    ctx.beginPath();
    ctx.arc(canvas.width / 2, canvas.height / 2, canvas.width / 2 - 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(img, s.offsetX, s.offsetY, img.width * s.scale, img.height * s.scale);
    ctx.restore();
  }

  function redraw() {
    const canvas = canvasRef.current; const img = imageRef.current; if (!canvas || !img) return;
    draw(canvas.getContext('2d')!, canvas, img, stateRef.current);
  }

  function constrainImage() {
    const s = stateRef.current;
    const scaledWidth = s.imgW * s.scale, scaledHeight = s.imgH * s.scale;
    s.offsetX = Math.min(0, Math.max(size.w - scaledWidth, s.offsetX));
    s.offsetY = Math.min(0, Math.max(size.h - scaledHeight, s.offsetY));
  }

  function canvasPoint(clientX: number, clientY: number) {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: (clientX - rect.left) * size.w / rect.width, y: (clientY - rect.top) * size.h / rect.height };
  }

  function gestureMetrics() {
    const points = [...pointersRef.current.values()];
    if (points.length < 2) return { centerX: points[0]?.x || 0, centerY: points[0]?.y || 0, distance: 0 };
    const [first, second] = points;
    return {
      centerX: (first.x + second.x) / 2,
      centerY: (first.y + second.y) / 2,
      distance: Math.hypot(second.x - first.x, second.y - first.y),
    };
  }

  function onWheel(e: React.WheelEvent) {
    e.preventDefault();
    const s = stateRef.current;
    const delta = -e.deltaY * 0.0015;
    const next = Math.max(s.minScale, Math.min(s.minScale * 4, s.scale * (1 + delta)));
    if (next === s.scale) return;
    const point = canvasPoint(e.clientX, e.clientY);
    const cx = point.x, cy = point.y;
    const imgX = (cx - s.offsetX) / s.scale, imgY = (cy - s.offsetY) / s.scale;
    s.scale = next;
    s.offsetX = cx - imgX * s.scale;
    s.offsetY = cy - imgY * s.scale;
    constrainImage();
    redraw();
  }

  function onPointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    pointersRef.current.set(event.pointerId, canvasPoint(event.clientX, event.clientY));
    gestureRef.current = gestureMetrics();
  }

  function onPointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!pointersRef.current.has(event.pointerId)) return;
    event.preventDefault();
    const previous = gestureRef.current;
    pointersRef.current.set(event.pointerId, canvasPoint(event.clientX, event.clientY));
    const current = gestureMetrics();
    const s = stateRef.current;
    if (pointersRef.current.size >= 2 && previous.distance > 0 && current.distance > 0) {
      const next = Math.max(s.minScale, Math.min(s.minScale * 4, s.scale * current.distance / previous.distance));
      const imgX = (previous.centerX - s.offsetX) / s.scale;
      const imgY = (previous.centerY - s.offsetY) / s.scale;
      s.scale = next;
      s.offsetX = current.centerX - imgX * next;
      s.offsetY = current.centerY - imgY * next;
    } else if (pointersRef.current.size === 1) {
      s.offsetX += current.centerX - previous.centerX;
      s.offsetY += current.centerY - previous.centerY;
    }
    constrainImage();
    gestureRef.current = current;
    redraw();
  }

  function onPointerEnd(event: ReactPointerEvent<HTMLCanvasElement>) {
    pointersRef.current.delete(event.pointerId);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    gestureRef.current = gestureMetrics();
  }

  async function confirm() {
    const canvas = canvasRef.current; const img = imageRef.current; if (!canvas || !img || busy) return;
    setBusy(true);
    try {
      // 输出 512×512 的圆形内容（透明圆外），为了兼容直接裁正方形，服务端会再 resize
      const out = document.createElement('canvas');
      out.width = 512; out.height = 512;
      const octx = out.getContext('2d')!;
      const s = stateRef.current;
      const ratio = 512 / size.w;
      octx.drawImage(img, s.offsetX * ratio, s.offsetY * ratio, img.width * s.scale * ratio, img.height * s.scale * ratio);
      const blob: Blob | null = await new Promise(resolve => out.toBlob(b => resolve(b), 'image/jpeg', 0.92));
      if (!blob) throw new Error('裁剪失败');
      const file = new File([blob], 'avatar.jpg', { type: 'image/jpeg' });
      onConfirm(file);
    } finally { setBusy(false); }
  }

  return <div className="modal-layer" onMouseDown={e => e.target === e.currentTarget && !busy && onClose()}><section ref={dialogRef} className="editor avatar-cropper-modal" role="dialog" aria-modal="true" aria-labelledby="avatar-cropper-title"><header className="editor-head"><div><p className="kicker">宝宝头像</p><h2 id="avatar-cropper-title">裁剪头像</h2></div><button className="close-btn" onClick={() => !busy && onClose()} aria-label="关闭" disabled={busy}>×</button></header><div className="cropper-body" onWheel={onWheel}><canvas ref={canvasRef} width={size.w} height={size.h}
    onPointerDown={onPointerDown}
    onPointerMove={onPointerMove}
    onPointerUp={onPointerEnd}
    onPointerCancel={onPointerEnd} /></div><p className="cropper-hint">单指拖动位置，双指缩放大小</p>
    {!ready && <p className="cropper-loading">正在载入图片…</p>}
    <footer className="editor-actions"><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>取消</button><button className="btn primary" onClick={() => void confirm()} disabled={!ready || busy}>{busy ? '处理中…' : '确认使用'}</button></footer></section></div>;
}
