import { Component, type ErrorInfo, type ReactNode } from 'react';
import { resetAppCache } from './resetCache';
import { fs } from '../ui/fs';

interface State {
  error: Error | null;
}

/** Вместо белого экрана — пиксельный «GAME OVER» с текстом ошибки и кнопкой перезапуска. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div style={{ padding: 24, maxWidth: 560, margin: '10vh auto', textAlign: 'center' }}>
        <h1 style={{ color: 'var(--c-warn)', fontSize: fs(20) }}>GAME OVER</h1>
        <p>Что-то сломалось. Данные не потеряны — они хранятся на устройстве.</p>
        <pre style={{ whiteSpace: 'pre-wrap', textAlign: 'left', color: 'var(--c-text-dim)', background: 'var(--c-panel)', padding: 12, fontSize: fs(14) }}>
          {error.name}: {error.message}
        </pre>
        <button type="button" onClick={() => location.reload()} style={btn}>
          Перезапустить
        </button>{' '}
        <button type="button" onClick={() => void resetAppCache()} style={btn}>
          Сбросить кэш приложения
        </button>
      </div>
    );
  }
}

const btn = {
  minHeight: 44,
  padding: '8px 14px',
  margin: 8,
  background: 'var(--c-panel-2)',
  color: 'var(--c-text)',
  border: '4px solid var(--c-task)',
  fontFamily: 'var(--font-title)',
  fontSize: fs(10),
  cursor: 'pointer',
};
