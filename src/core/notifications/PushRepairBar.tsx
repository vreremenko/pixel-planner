/* Просьба снова включить уведомления, если телефон перестал получать их при закрытом приложении. */
import { useEffect, useState } from 'react';
import { Button, toast } from '../ui';
import { enablePush, loadPushBroken, usePushBroken } from './push';
import { tick } from './scheduler';
import s from './PushRepairBar.module.css';

export function PushRepairBar() {
  const broken = usePushBroken((st) => st.broken);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void loadPushBroken();
  }, []);
  if (!broken) return null;

  const repair = async () => {
    setBusy(true);
    try {
      await enablePush();
      void tick();
      toast('Уведомления снова приходят и при закрытом приложении', 'bell', 'var(--c-habit)');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Не получилось включить уведомления', 'alert', 'var(--c-warn)');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={s.bar} role="status">
      <span>Напоминания перестали приходить при закрытом приложении.</span>
      <Button small variant="gold" disabled={busy} onClick={() => void repair()}>
        Включить снова
      </Button>
    </div>
  );
}
