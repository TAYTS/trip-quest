// Two-tap confirm button (no window.confirm — it is blocked in some embedded viewers).
import { useEffect, useState, type ReactNode } from 'react';

export function ConfirmButton({
  className,
  children,
  confirmLabel = 'Tap again to confirm',
  onConfirm,
  disabled,
}: {
  className?: string;
  children: ReactNode;
  confirmLabel?: string;
  onConfirm: () => void;
  disabled?: boolean;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = window.setTimeout(() => setArmed(false), 3000);
    return () => window.clearTimeout(t);
  }, [armed]);
  return (
    <button
      type="button"
      className={`${className ?? ''} ${armed ? 'armed' : ''}`}
      disabled={disabled}
      onClick={() => {
        if (armed) {
          setArmed(false);
          onConfirm();
        } else setArmed(true);
      }}
    >
      {armed ? confirmLabel : children}
    </button>
  );
}
