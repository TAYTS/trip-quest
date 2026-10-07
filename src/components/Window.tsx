// Retro game window: wooden frame, title bar, close button. Used for every dialog.
import { useEffect, type ReactNode } from 'react';

export function Window({
  title,
  icon,
  onClose,
  children,
  footer,
  wide,
}: {
  title: ReactNode;
  icon?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return (
    <div
      className="overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={`window ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true">
        <div className="window-title">
          <span className="window-title-text">
            {icon}
            {title}
          </span>
          <button type="button" className="window-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="window-body">{children}</div>
        {footer && <div className="window-footer">{footer}</div>}
      </div>
    </div>
  );
}
