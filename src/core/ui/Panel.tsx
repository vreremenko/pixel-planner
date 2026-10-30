import type { HTMLAttributes, ReactNode } from 'react';
import s from './ui.module.css';
import { cx } from './cx';
import { PixelIcon } from './PixelIcon';
import type { IconName } from './icons';

interface Props extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  title?: ReactNode;
  icon?: IconName;
  /** Цвет заголовка (CSS-переменная токена). */
  accent?: string;
  actions?: ReactNode;
  as?: 'section' | 'div' | 'article';
}

export function Panel({ title, icon, accent, actions, as: Tag = 'section', className, style, children, ...rest }: Props) {
  return (
    <Tag className={cx(s.panel, className)} style={style} {...rest}>
      {(title ?? actions) && (
        <div className={s.panelTitle}>
          {icon && <PixelIcon name={icon} size={16} />}
          {title && <h2 style={accent ? { color: accent } : undefined}>{title}</h2>}
          {actions && <div style={{ marginLeft: 'auto' }} className={s.row}>{actions}</div>}
        </div>
      )}
      {children}
    </Tag>
  );
}
