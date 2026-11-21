/*
 * «Siri»: команда iPhone «Пиксель». Одна кнопка создаёт личный ключ, кладёт его в буфер обмена и открывает
 * установку команды — при установке iPhone спросит ключ, его остаётся вставить. Подписанную команду с уже
 * вписанным ключом сервер собрать не может (подписывает только Mac), поэтому ключ вставляется один раз руками.
 */
import { useState } from 'react';
import { createApiKey } from '../auth/api';
import { useAuth } from '../auth/store';
import { Button, Panel, toast } from '../ui';

const SHORTCUT_URL = `${import.meta.env.BASE_URL}siri/${encodeURIComponent('Пиксель')}.shortcut`;
const dim = { color: 'var(--c-text-dim)' } as const;
const steps = { margin: '0 0 8px', paddingLeft: 34, display: 'grid', gap: 6 } as const;
const codeBox = { overflowWrap: 'anywhere', background: 'var(--c-bg)', padding: '8px 10px', display: 'block', margin: '0 0 8px' } as const;

/**
 * Скопировать то, что ещё только придёт с сервера. Safari разрешает запись в буфер лишь сразу после нажатия,
 * поэтому отдаём ему обещание текста (ClipboardItem) прямо в обработчике; где так нельзя — обычная запись.
 */
async function copyLater(text: Promise<string>): Promise<boolean> {
  try {
    if (typeof ClipboardItem !== 'undefined') {
      await navigator.clipboard.write([new ClipboardItem({ 'text/plain': text.then((t) => new Blob([t], { type: 'text/plain' })) })]);
      return true;
    }
    await navigator.clipboard.writeText(await text);
    return true;
  } catch {
    return false;
  }
}

export function SiriPanel() {
  const token = useAuth((s) => s.session?.token);
  const [key, setKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!token) return null;

  const install = () => {
    setBusy(true);
    const made = createApiKey(token, 'Siri').then((r) => r.key);
    const copying = copyLater(made);
    made.then(
      async (k) => {
        setKey(k);
        setCopied(await copying);
        window.open(SHORTCUT_URL, '_blank');
      },
      (e: unknown) => toast(e instanceof Error ? e.message : 'Не получилось', 'alert', 'var(--c-warn)'),
    ).finally(() => setBusy(false));
  };

  return (
    <Panel title="Siri" icon="mic" accent="var(--c-gold)">
      <p style={{ marginTop: 0 }}>
        Скажите «Привет, Siri, Пиксель» и надиктуйте: «потратил 400 на такси», «напомни завтра в 10 купить молоко». Siri покажет, что записать, — снимите лишнее, и она зачитает итог.
      </p>
      {!key ? (
        <>
          <Button variant="primary" icon="mic" disabled={busy} onClick={install}>
            {busy ? 'Готовлю…' : 'Установить команду'}
          </Button>
          <p style={{ ...dim, marginBottom: 0 }}>Для iPhone, iPad и Mac. Работает и с кнопки действия или двойного касания по задней крышке.</p>
        </>
      ) : (
        <>
          <ol style={steps}>
            <li>Откроется установка команды «Пиксель» — нажмите «Добавить команду» (если Safari скачал файл — откройте его в «Загрузках»).</li>
            <li>В поле ключа нажмите «Вставить»{copied ? ' — ключ уже скопирован' : ''}.</li>
            <li>Скажите «Привет, Siri, Пиксель». В первый раз iPhone спросит разрешение на доступ к серверу — разрешите.</li>
          </ol>
          {!copied && <code style={codeBox}>{key}</code>}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {!copied && (
              <Button
                small
                onClick={() => {
                  void navigator.clipboard.writeText(key).then(() => setCopied(true));
                }}
              >
                Скопировать ключ
              </Button>
            )}
            <Button small onClick={() => window.open(SHORTCUT_URL, '_blank')}>
              Открыть установку ещё раз
            </Button>
          </div>
          <p style={{ ...dim, marginBottom: 0 }}>Ключ показывается один раз. Отозвать его можно в разделе «Нейросети» → ключи (называется «Siri»).</p>
        </>
      )}
    </Panel>
  );
}
