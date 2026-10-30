import type { ReactNode, Ref } from 'react';
import { Checkbox } from '../ui';
import { fs } from '../ui/fs';

/** Строка настройки: флажок, подпись и пояснение. */
export function ToggleRow({ label, hint, hintColor, checked, onChange, color, rowRef }: { label: string; hint?: ReactNode; hintColor?: string; checked: boolean; onChange: (v: boolean) => void; color?: string; rowRef?: Ref<HTMLDivElement> }) {
  return (
    <div ref={rowRef} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 14 }}>
      <Checkbox checked={checked} onChange={onChange} label={label} color={color} />
      <div>
        <div>{label}</div>
        {hint && <div style={{ color: hintColor ?? 'var(--c-text-dim)', fontSize: fs(17) }}>{hint}</div>}
      </div>
    </div>
  );
}
