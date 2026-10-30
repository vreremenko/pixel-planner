import { useEffect, useState } from 'react';
import { APP_VERSION, CHANGELOG, type ChangelogEntry } from '../changelog';
import { entriesToShow } from '../domain/whatsNew';
import { hasUserData, metaRepo } from '../data/repo';
import { ChangelogModal } from './ChangelogModal';

const SEEN_KEY = 'lastSeenVersion';

/**
 * Окно «Что нового» при первом запуске после обновления. Само приложение обновляется тихо,
 * поэтому достаточно сравнить версию в коде с той, патч-ноуты которой пользователь уже видел.
 */
export function WhatsNew() {
  const [entries, setEntries] = useState<ChangelogEntry[] | null>(null);

  useEffect(() => {
    const run = { cancelled: false };
    void (async () => {
      const lastSeen = await metaRepo.get<string>(SEEN_KEY);
      if (lastSeen === APP_VERSION) return;
      // Версия не записана: новичок (данных нет) или обновление со сборки, где окна ещё не было
      const existing = lastSeen !== undefined || (await hasUserData());
      const toShow = entriesToShow(CHANGELOG, lastSeen, existing);
      if (toShow.length === 0) await metaRepo.set(SEEN_KEY, APP_VERSION);
      else if (!run.cancelled) setEntries(toShow);
    })().catch(() => undefined); // нет доступа к базе — окно просто не покажем
    return () => {
      run.cancelled = true;
    };
  }, []);

  if (!entries) return null;
  const close = () => {
    setEntries(null);
    void metaRepo.set(SEEN_KEY, APP_VERSION);
  };
  return <ChangelogModal entries={entries} title="Что нового" closeLabel="Понятно" onClose={close} />;
}
