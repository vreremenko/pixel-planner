import s from './WhatsNew.module.css';
import { Button, Modal } from '../ui';
import type { ChangelogEntry } from '../changelog';

interface Props {
  entries: readonly ChangelogEntry[];
  title: string;
  closeLabel: string;
  /** Свернуть все записи, кроме самой новой (история в Настройках): их можно развернуть по нажатию. */
  collapseOlder?: boolean;
  onClose: () => void;
}

const ruDate = (d: string) => d.split('-').reverse().join('.');

/** Окно с патч-ноутами: после обновления и из Настроек. */
export function ChangelogModal({ entries, title, closeLabel, collapseOlder = false, onClose }: Props) {
  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      accent="var(--c-gold)"
      footer={
        <Button variant="gold" icon="check" data-autofocus onClick={onClose}>
          {closeLabel}
        </Button>
      }
    >
      {entries.map((e, i) => {
        const items = (
          <ul className={s.items}>
            {e.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        );
        // Старые версии — в закрытой вкладке (нативный <details>: клавиатура и скринридеры работают сами)
        if (collapseOlder && i > 0) {
          return (
            <details key={e.version} className={`${s.entry} ${s.fold}`}>
              <summary className={s.summary}>
                <span className={s.head}>
                  <span className={s.version}>v{e.version}</span>
                  <span className={s.date}>{ruDate(e.date)}</span>
                </span>
                <span className={s.summaryTitle}>{e.title}</span>
              </summary>
              {items}
            </details>
          );
        }
        return (
          <article key={e.version} className={s.entry}>
            <div className={s.head}>
              <span className={s.version}>v{e.version}</span>
              <span className={s.date}>{ruDate(e.date)}</span>
            </div>
            <h3 className={s.title}>{e.title}</h3>
            {items}
          </article>
        );
      })}
    </Modal>
  );
}
