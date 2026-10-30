import { useContext, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { TopbarSlot, useIsMobile } from './topbarSlot';

/** Кнопки экрана: на телефоне переезжают в верхнюю полосу рядом с названием, на широком экране остаются на месте. */
export function TopbarActions({ children }: { children: ReactNode }) {
  const slot = useContext(TopbarSlot);
  const mobile = useIsMobile();
  if (mobile && slot) return createPortal(children, slot);
  return <>{children}</>;
}
