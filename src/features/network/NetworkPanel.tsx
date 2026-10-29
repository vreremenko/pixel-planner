import { useState } from 'react';
import { Button, Panel, rowClass, toast } from '../../ui';
import { apiUrl } from '../../apiBase';
import { probe, probeBody, verdict, type ProbeResult, type ProbeTarget } from './probe';
import { PLATFORMS } from './platforms';

const TARGETS = (): ProbeTarget[] => [
  { id: 'api', label: 'Текущий сервер приложения', url: apiUrl('config') },
  { id: 'api8', label: 'Сервер приложения: ответ 8 КБ', url: apiUrl('ping?kb=8'), body: true },
  { id: 'api64', label: 'Сервер приложения: ответ 64 КБ', url: apiUrl('ping?kb=64'), body: true },
  { id: 'n1', label: 'Netlify, адрес 1: главная', url: 'https://pp-api-83f524.netlify.app/' },
  { id: 'n2', label: 'Netlify, адрес 1: /api/config', url: 'https://pp-api-83f524.netlify.app/api/config' },
  { id: 'n3', label: 'Netlify, адрес 2: главная', url: 'https://planner-sync-47b7e4.netlify.app/' },
  { id: 'n4', label: 'Netlify, адрес 2: /api/config', url: 'https://planner-sync-47b7e4.netlify.app/api/config' },
  { id: 'n5', label: 'Netlify, адрес 2: ответ 64 КБ', url: 'https://planner-sync-47b7e4.netlify.app/api/ping?kb=64', body: true },
  { id: 'cf', label: 'Cloudflare (workers.dev)', url: 'https://pixel-planner.pixel-planner.workers.dev/api/config' },
  { id: 'gh', label: 'GitHub Pages (само приложение)', url: 'https://vreremenko.github.io/pixel-planner/version.json' },
];

const PENDING: ProbeResult = { ok: false, ms: 0, error: '…' };
const MARK = { fast: '✓', slow: '~', down: '✗' } as const;
const COLOR = { fast: 'var(--c-habit)', slow: 'var(--c-xp)', down: 'var(--c-warn)' } as const;

export function NetworkPanel() {
  const [results, setResults] = useState<Record<string, ProbeResult>>({});
  const [busy, setBusy] = useState(false);

  const run = async (targets: ProbeTarget[]) => {
    setBusy(true);
    setResults((p) => ({ ...p, ...Object.fromEntries(targets.map((t) => [t.id, PENDING])) }));
    await Promise.all(
      targets.map(async (t) => {
        const r = await (t.body ? probeBody(t.url) : probe(t.url));
        setResults((p) => ({ ...p, [t.id]: r }));
      }),
    );
    setBusy(false);
  };

  const done = PLATFORMS.filter((t) => results[t.id] && results[t.id]?.error !== '…');
  const open = done.filter((t) => results[t.id]?.ok);

  const copy = () => {
    const lines = [...TARGETS(), ...PLATFORMS].flatMap((t) => {
      const r = results[t.id];
      return r && r.error !== '…' ? [`${r.ok ? '+' : '-'} ${t.label}: ${r.ok ? `${String(r.ms)} мс` : (r.error ?? '')}`] : [];
    });
    void navigator.clipboard.writeText(lines.join('\n')).then(
      () => toast('Результаты скопированы', 'check', 'var(--c-habit)'),
      () => toast('Не удалось скопировать', 'alert', 'var(--c-warn)'),
    );
  };

  return (
    <Panel title="Сеть и сервер" icon="search" accent="var(--c-backlog)">
      <p style={{ marginTop: 0, color: 'var(--c-text-dim)' }}>
        Если синхронизация или уведомления не работают без VPN, нажмите «Проверить»: покажем, какие серверы открываются с этого устройства и как быстро.
        {' '}
        «Проверить платформы» пробует зарубежные хостинги, куда можно перенести сервер. Проверка показывает, доходит ли запрос, а крупные ответы не проверяет.
      </p>
      <div className={rowClass}>
        <Button variant="habit" icon="search" disabled={busy} onClick={() => void run(TARGETS())}>
          {busy ? 'Проверяем…' : 'Проверить'}
        </Button>
        <Button icon="search" disabled={busy} onClick={() => void run(PLATFORMS)}>
          Проверить платформы
        </Button>
        {Object.keys(results).length > 0 && (
          <Button small variant="ghost" onClick={copy}>
            Скопировать результаты
          </Button>
        )}
      </div>
      {Object.keys(results).length > 0 && (
        <ul className="digits" style={{ margin: '12px 0 0', paddingLeft: 0, listStyle: 'none' }}>
          {done.length > 0 && (
            <li style={{ marginBottom: 8 }}>
              Платформы: открываются {open.length} из {done.length}
              {done.length < PLATFORMS.length ? ' (проверка идёт…)' : ''}
            </li>
          )}
          {[...TARGETS(), ...PLATFORMS].map((t) => {
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
