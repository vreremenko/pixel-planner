/* Красная полоска «нет связи»: без неё кажется, что данные с другого устройства пропали. */
import { useSyncExternalStore } from 'react';
import s from './Layout.module.css';
import { useUnreachable } from '../sync/manager';

function subscribe(onChange: () => void): () => void {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

/** Телефон считает себя в сети и при слабом сигнале, поэтому учитываем и то, что сервер не отвечает. */
export function OfflineBar({ className }: { className: string | undefined }) {
  const online = useSyncExternalStore(subscribe, () => navigator.onLine);
  const unreachable = useUnreachable();
  if (online && !unreachable) return null;
  return (
    <div className={`${s.offline} ${className}`} role="status">
      Нет связи: новое подтянется позже
    </div>
  );
}
