import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import s from './ui.module.css';
import { Button } from './Button';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  accent?: string;
}

/** Модалка на нативном <dialog>: фокус-ловушка, Esc и возврат фокуса — средствами браузера. */
export function Modal({ open, onClose, title, children, footer, accent }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      const el = d.querySelector<HTMLElement>('[data-autofocus]');
      el?.focus();
      // data-select: выделить текст, чтобы ввод сразу заменял старое значение
      if (el instanceof HTMLInputElement && el.hasAttribute('data-select')) el.select();
    }
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={s.dialog}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      {open && (
        <div className={`${s.panel} ${s.dialogInner}`} style={accent ? ({ '--bc': accent } as CSSProperties) : undefined}>
          <div className={s.dialogHeader}>
            <h2 style={{ color: accent }}>{title}</h2>
            <Button variant="ghost" small icon="close" label="Закрыть" onClick={onClose} />
          </div>
          {children}
          {footer && <div className={s.dialogFooter}>{footer}</div>}
        </div>
      )}
    </dialog>
  );
}
