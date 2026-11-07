/* Ошибка внутри экрана: устаревший кусок приложения перезагружаем сами, остальное показываем понятно. */
import { useRouteError } from 'react-router';
import { Button, Panel } from '../ui';
import { isChunkError, reloadOnce } from './chunkReload';

export function RouteError() {
  const error = useRouteError();
  if (isChunkError(error) && reloadOnce()) return <p style={{ color: 'var(--c-text-dim)' }}>Обновляем приложение…</p>;
  return (
    <Panel title="Экран не открылся" icon="alert" accent="var(--c-warn)">
      <p style={{ marginTop: 0 }}>{isChunkError(error) ? 'Приложение обновилось. Перезагрузите его, чтобы подтянуть новую версию.' : 'Что-то пошло не так. Данные не потеряны.'}</p>
      <Button variant="gold" onClick={() => location.reload()}>
        Перезагрузить
      </Button>
    </Panel>
  );
}
