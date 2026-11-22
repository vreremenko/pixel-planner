/* «Отменить» после записи помощником: сервер возвращает всё как было (10 минут, один раз). */
import { useState } from 'react';
import { assistantUndo } from '../auth/api';
import { syncNow } from '../sync/manager';
import { Button } from '../ui';
import s from './Assistant.module.css';

export function UndoButton({ token, undo }: { token: string; undo: string }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  if (done !== null) return <span className={s.dim}>{done}</span>;
  return (
    <Button
      small
      variant="ghost"
      icon="left"
      disabled={busy}
      onClick={() => {
        setBusy(true);
        assistantUndo(token, undo).then(
          (r) => {
            setDone(r.text);
            void syncNow();
          },
          () => setDone('Отменить уже нельзя: прошло больше 10 минут.'),
        );
      }}
    >
      Отменить
    </Button>
  );
}
