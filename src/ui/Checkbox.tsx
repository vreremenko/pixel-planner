import type { CSSProperties } from 'react';
import s from './ui.module.css';
import { PixelIcon } from './PixelIcon';

interface Props {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  color?: string;
  disabled?: boolean;
}

export function Checkbox({ checked, onChange, label, color, disabled }: Props) {
  return (
    <label className={s.check} style={color ? ({ '--cc': color } as CSSProperties) : undefined}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-label={label}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className={s.checkBox} aria-hidden>
        {checked && <PixelIcon name="check" size={16} />}
      </span>
    </label>
  );
}
