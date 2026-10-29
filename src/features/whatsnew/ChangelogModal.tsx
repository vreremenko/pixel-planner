import s from './WhatsNew.module.css';
import { Button, Modal } from '../../ui';
import type { ChangelogEntry } from '../../changelog';

interface Props {
  entries: readonly ChangelogEntry[];
  title: string;
  closeLabel: string;
  onClose: () => void;
}

const ruDate = (d: string) => d.split('-').reverse().join('.');

/** Окно с патч-ноутами: после обновления и из Настроек. */
export function ChangelogModal({ entries, title, closeLabel, onClose }: Props) {
  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      accent="var(--c-xp)"
      footer={
        <Button variant="xp" icon="check" data-autofocus onClick={onClose}>
          {closeLabel}
        </Button>
      }
    >
      {entries.map((e) => (
        <article key={e.version} className={s.entry}>
          <div className={s.head}>
            <span className={s.version}>v{e.version}</span>
            <span className={s.date}>{ruDate(e.date)}</span>
          </div>
          <h3 className={s.title}>{e.title}</h3>
          <ul className={s.items}>
            {e.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>
      ))}
    </Modal>
  );
}
