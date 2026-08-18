// 设置页通用的成功/错误反馈条（由 Settings.tsx 抽出，逻辑不变）
import { useEffect, useState } from 'react';

export function Feedback({ message, type, onClose }: { message: string; type: 'success' | 'error'; onClose?: () => void }) {
  const [displayMessage, setDisplayMessage] = useState(message);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (message) {
      setDisplayMessage(message);
      setLeaving(false);
      if (type === 'success') {
        const timer = setTimeout(() => {
          handleClose();
        }, 4000);
        return () => clearTimeout(timer);
      }
    } else if (displayMessage) {
      setLeaving(true);
      const timer = setTimeout(() => {
        setDisplayMessage('');
        setLeaving(false);
      }, 220);
      return () => clearTimeout(timer);
    }
  }, [message]);

  const handleClose = () => {
    setLeaving(true);
    setTimeout(() => {
      setDisplayMessage('');
      setLeaving(false);
      onClose?.();
    }, 220);
  };

  if (!displayMessage) return null;

  const className = `${type === 'success' ? 'success-text' : 'error-text'} ${leaving ? 'leaving' : 'show'}`;

  return (
    <p className={className} role={type === 'error' ? 'alert' : 'status'} onClick={handleClose}>
      <span>{displayMessage}</span>
      <button
        type="button"
        className="feedback-close"
        aria-label="关闭"
        onClick={e => { e.stopPropagation(); handleClose(); }}
      >×</button>
    </p>
  );
}
