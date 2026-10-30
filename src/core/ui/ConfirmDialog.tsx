import type { ReactNode } from 'react';
import { Button } from './Button';
import { Modal } from './Modal';

/** Подтверждение необратимого действия (удаление и т.п.): «Отмена» и красная кнопка действия. */
export function ConfirmDialog({ open, title, children, action = 'Удалить', onConfirm, onClose }: { open: boolean; title: string; children?: ReactNode; action?: string; onConfirm: () => void; onClose: () => void }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      accent="var(--c-warn)"
      footer={
        <>
          <Button onClick={onClose}>Отмена</Button>
          <Button
            variant="danger"
            onClick={() => {
              onClose();
              onConfirm();
            }}
          >
            {action}
          </Button>
        </>
      }
    >
      {children && <p style={{ margin: 0 }}>{children}</p>}
    </Modal>
  );
}
