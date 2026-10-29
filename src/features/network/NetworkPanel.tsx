import { useState } from 'react';
import { Button, Panel, TextInput, rowClass, toast } from '../../ui';
import { apiUrl, defaultApiBase, getApiOverride, setApiOverride } from '../../apiBase';
import { probe, probeBody, verdict, type ProbeResult, type ProbeTarget } from './probe';

const TARGETS = (): ProbeTarget[] => [
  { id: 'api', label: 'Текущий сервер приложения', url: apiUrl('config') },
  { id: 'api8', label: 'Сервер приложения: ответ 8 КБ', url: apiUrl('ping?kb=8'), body: true },
  { id: 'api64', label: 'Сервер приложения: ответ 64 КБ', url: apiUrl('ping?kb=64'), body: true },
  { id: 'cf', label: 'Cloudflare (workers.dev)', url: 'https://pixel-planner.pixel-planner.workers.dev/api/config' },
  { id: 'yc-fn', label: 'Yandex Cloud Functions', url: 'https://functions.yandexcloud.net/' },
  { id: 'yc-st', label: 'Yandex Object Storage', url: 'https://storage.yandexcloud.net/' },
  { id: 'gh', label: 'GitHub Pages (само приложение)', url: 'https://vreremenko.github.io/pixel-planner/version.json' },
];

const PENDING: ProbeResult = { ok: false, ms: 0, error: '…' };
const MARK = { fast: '✓', slow: '~', down: '✗' } as const;
const COLOR = { fast: 'var(--c-habit)', slow: 'var(--c-xp)', down: 'var(--c-warn)' } as const;

export function NetworkPanel() {
  const [results, setResults] = useState<Record<string, ProbeResult>>({});
  const [busy, setBusy] = useState(false);
  const [override, setOverride] = useState(getApiOverride() ?? '');
  const active = getApiOverride();

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

  const save = () => {
    const v = override.trim();
    if (v && !/^https:\/\/\S+$/.test(v)) {
      toast('Адрес должен начинаться с https://', 'alert', 'var(--c-warn)');
      return;
    }
    setApiOverride(v ? (v.endsWith('/') ? v : `${v}/`) : null);
    toast(v ? 'Сервер изменён. Перезапустите приложение.' : 'Вернули сервер по умолчанию. Перезапустите приложение.', 'check', 'var(--c-habit)');
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
      <details style={{ marginTop: 16 }}>
        <summary style={{ cursor: 'pointer', color: 'var(--c-text-dim)' }}>Другой сервер (для проверки)</summary>
        <p style={{ color: 'var(--c-text-dim)', fontSize: 17 }}>
          Сейчас: {active ?? defaultApiBase()}
          {active ? ' (изменён вручную)' : ' (по умолчанию)'}. Пустое поле — вернуть по умолчанию.
        </p>
        <TextInput label="Адрес сервера" value={override} onChange={(e) => setOverride(e.target.value)} placeholder="https://…" autoCapitalize="off" autoCorrect="off" spellCheck={false} />
        <Button small onClick={save}>
          Сохранить
        </Button>
      </details>
    </Panel>
  );
}
