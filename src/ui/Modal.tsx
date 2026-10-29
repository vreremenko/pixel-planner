import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import s from './ui.module.css';
import { Button } from './Button';
import { lockScroll, unlockScroll } from './scrollLock';

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
  // Пока окно открыто, страница под ним не прокручивается
  useEffect(() => {
    if (!open) return;
    lockScroll();
    return unlockScroll;
  }, [open]);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      // Фокус — на поле, помеченное data-autofocus (его ставят только пустым полям: у заполненного
      // фокус вызывал бы экранную клавиатуру при каждом открытии). Иначе — на саму панель окна,
      // а не на кнопку «Закрыть», которую браузер выбрал бы сам.
      const el = d.querySelector<HTMLElement>('[data-autofocus]') ?? d.querySelector<HTMLElement>('[data-dialog-root]');
      el?.focus({ preventScroll: true });
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
        <div className={`${s.panel} ${s.dialogInner}`} tabIndex={-1} data-dialog-root style={accent ? ({ '--bc': accent } as CSSProperties) : undefined}>
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
