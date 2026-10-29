import { useState } from 'react';
import { Button, Panel, rowClass } from '../../ui';
import { apiUrl } from '../../apiBase';
import { probe, probeBody, verdict, type ProbeResult, type ProbeTarget } from './probe';

const TARGETS = (): ProbeTarget[] => [
  { id: 'api', label: 'Текущий сервер приложения', url: apiUrl('config') },
  { id: 'api8', label: 'Сервер приложения: ответ 8 КБ', url: apiUrl('ping?kb=8'), body: true },
  { id: 'api64', label: 'Сервер приложения: ответ 64 КБ', url: apiUrl('ping?kb=64'), body: true },
  { id: 'cf', label: 'Cloudflare (workers.dev)', url: 'https://pixel-planner.pixel-planner.workers.dev/api/config' },
  { id: 'gh', label: 'GitHub Pages (само приложение)', url: 'https://vreremenko.github.io/pixel-planner/version.json' },
];

const PENDING: ProbeResult = { ok: false, ms: 0, error: '…' };
const MARK = { fast: '✓', slow: '~', down: '✗' } as const;
const COLOR = { fast: 'var(--c-habit)', slow: 'var(--c-xp)', down: 'var(--c-warn)' } as const;

export function NetworkPanel() {
  const [results, setResults] = useState<Record<string, ProbeResult>>({});
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    setResults(Object.fromEntries(TARGETS().map((t) => [t.id, PENDING])));
    await Promise.all(
      TARGETS().map(async (t) => {
        const r = await (t.body ? probeBody(t.url) : probe(t.url));
        setResults((p) => ({ ...p, [t.id]: r }));
      }),
    );
    setBusy(false);
  };

  return (
    <Panel title="Сеть и сервер" icon="search" accent="var(--c-backlog)">
      <p style={{ marginTop: 0, color: 'var(--c-text-dim)' }}>
        Если синхронизация или уведомления не работают без VPN, нажмите «Проверить»: покажем, какие серверы открываются с этого устройства и как быстро.
      </p>
      <div className={rowClass}>
        <Button variant="habit" icon="search" disabled={busy} onClick={() => void run()}>
          {busy ? 'Проверяем…' : 'Проверить'}
        </Button>
      </div>
      {Object.keys(results).length > 0 && (
        <ul className="digits" style={{ margin: '12px 0 0', paddingLeft: 0, listStyle: 'none' }}>
          {TARGETS().map((t) => {
            const r = results[t.id];
            if (!r) return null;
            const pending = r.error === '…';
            const v = verdict(r);
            return (
              <li key={t.id} style={{ color: pending ? 'var(--c-text-dim)' : COLOR[v], marginBottom: 4 }}>
                {pending ? '…' : MARK[v]} {t.label}: {pending ? 'проверяем' : r.ok ? `${String(r.ms)} мс` : r.error}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
