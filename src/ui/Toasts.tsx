import s from './ui.module.css';
import { PixelIcon } from './PixelIcon';
import { useToasts } from './toastStore';

export function ToastHost() {
  const toasts = useToasts((st) => st.toasts);
  return (
    <div className={s.toasts} role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`${s.panel} ${s.toast}`} style={t.color ? { color: t.color } : undefined}>
          <PixelIcon name={t.icon} size={24} />
          <span style={{ color: 'var(--c-text)' }}>{t.text}</span>
        </div>
      ))}
    </div>
  );
}
