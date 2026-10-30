import type { ButtonHTMLAttributes, ReactNode } from 'react';
import s from './ui.module.css';
import { cx } from './cx';
import { PixelIcon } from './PixelIcon';
import type { IconName } from './icons';

type Variant = 'default' | 'primary' | 'habit' | 'xp' | 'danger' | 'ghost';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  icon?: IconName;
  small?: boolean;
  /** Подпись для кнопки-иконки (для скринридеров и подсказки). */
  label?: string;
  children?: ReactNode;
}

export function Button({ variant = 'default', icon, small, label, children, className, ...rest }: Props) {
  const iconOnly = !children;
  return (
    <button
      type="button"
      className={cx(s.btn, variant !== 'default' && s[variant], small && s.small, iconOnly && s.iconOnly, className)}
      aria-label={iconOnly ? label : undefined}
      title={label}
      {...rest}
    >
      {icon && <PixelIcon name={icon} size={small ? 16 : 16} />}
      {children}
    </button>
  );
}
