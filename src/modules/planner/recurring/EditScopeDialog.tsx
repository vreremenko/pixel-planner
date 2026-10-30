import { Button, Modal } from '../../../core/ui';
import type { EditScope } from '../services/tasks';

interface Props {
  open: boolean;
  action: 'edit' | 'delete';
  onPick: (scope: EditScope) => void;
  onClose: () => void;
}

/** «Только эта задача» или «эта и все следующие». */
export function EditScopeDialog({ open, action, onPick, onClose }: Props) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={action === 'edit' ? 'Изменить повтор?' : 'Удалить повтор?'}
      accent={action === 'delete' ? 'var(--c-warn)' : 'var(--c-task)'}
      footer={
        <>
          <Button onClick={onClose}>Отмена</Button>
          <Button onClick={() => onPick('this')}>Только эту</Button>
          <Button variant={action === 'delete' ? 'danger' : 'primary'} onClick={() => onPick('following')}>
            Эту и все следующие
          </Button>
        </>
      }
    >
      <p style={{ margin: 0 }}>Это повторяющаяся задача. Применить изменение только к этому дню или ко всем будущим повторам?</p>
    </Modal>
  );
}
