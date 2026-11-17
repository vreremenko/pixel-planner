/*
 * «Нейросети»: подключение Claude, ChatGPT и других через MCP. Главное действие одно — скопировать адрес:
 * нейросеть сама попросит войти и разрешить доступ (OAuth). Ключи доступа нужны только приложениям,
 * которые входить не умеют, поэтому они спрятаны в свёрнутый раздел. Всё отзывается одной кнопкой.
 */
import { useEffect, useState } from 'react';
import { createApiKey, deleteApiKey, listApiKeys, type ApiKey } from '../auth/api';
import { useAuth } from '../auth/store';
import { formatDateShort, dateOf } from '../domain/dates';
import { mcpUrl } from '../apiBase';
import { Button, ConfirmDialog, Modal, Panel, Segmented, TextInput, rowClass, toast } from '../ui';

const day = (ms: number) => formatDateShort(dateOf(new Date(ms)));
const fail = (e: unknown) => toast(e instanceof Error ? e.message : 'Не получилось', 'alert', 'var(--c-warn)');
const copy = (text: string, what: string) => {
  navigator.clipboard.writeText(text).then(() => toast(`${what} скопирован`, 'check', 'var(--c-habit)'), fail);
};

type Guide = 'claude' | 'chatgpt' | 'other';
const GUIDES: readonly { value: Guide; label: string }[] = [
  { value: 'claude', label: 'Claude' },
  { value: 'chatgpt', label: 'ChatGPT' },
  { value: 'other', label: 'Другие' },
];

const dim = { color: 'var(--c-text-dim)' } as const;
const codeBox = { overflowWrap: 'anywhere', background: 'var(--c-bg)', padding: '8px 10px', display: 'block' } as const;
/** Номера пунктов шире обычного отступа в пиксельном шрифте: даём им место, чтобы не вылезали за край текста. */
const stepList = { margin: '0 0 8px', paddingLeft: 34, display: 'grid', gap: 6 } as const;
const list = { listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 } as const;
const item = { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, justifyContent: 'space-between' } as const;

function Steps({ guide, url }: { guide: Guide; url: string }) {
  if (guide === 'claude') {
    return (
      <>
        <ol style={stepList}>
          <li>
            На <b>claude.ai</b>: Настройки → Коннекторы → «Добавить свой коннектор».
          </li>
          <li>Название — PIXEL PLANNER, адрес — тот, что выше.</li>
          <li>Нажмите «Подключить» и разрешите доступ на странице PIXEL PLANNER.</li>
        </ol>
        <p style={{ ...dim, margin: 0 }}>После этого PIXEL PLANNER работает и в приложениях Claude на телефоне и компьютере, и в Claude Code.</p>
      </>
    );
  }
  if (guide === 'chatgpt') {
    return (
      <>
        <ol style={stepList}>
          <li>
            В <b>веб-версии ChatGPT</b>: Настройки → Приложения и коннекторы → Дополнительно → включите «Режим разработчика».
          </li>
          <li>Создайте коннектор: адрес — тот, что выше, способ входа — OAuth.</li>
          <li>Разрешите доступ на странице PIXEL PLANNER.</li>
        </ol>
        <p style={{ ...dim, margin: 0 }}>Нужен платный тариф ChatGPT. Названия пунктов меню у ChatGPT иногда меняются.</p>
      </>
    );
  }
  return (
    <>
      <ul style={stepList}>
        <li>Если приложение умеет входить само (OAuth) — просто вставьте адрес, оно попросит разрешить доступ.</li>
        <li>Если приложение просит ключ или токен — создайте его ниже, в разделе «Ключ для приложений без входа».</li>
      </ul>
      <p style={{ ...dim, margin: '0 0 4px' }}>Claude Code в терминале:</p>
      <code style={codeBox}>claude mcp add --transport http pixel-planner {url}</code>
    </>
  );
}

export function ApiKeysPanel() {
  const token = useAuth((s) => s.session?.token);
  const [keys, setKeys] = useState<ApiKey[] | null>(null);
  const [guide, setGuide] = useState<Guide>('claude');
  const [name, setName] = useState('');
  const [created, setCreated] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<ApiKey | null>(null);
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!token) return;
    let live = true;
    listApiKeys(token).then((r) => {
      if (live) setKeys(r.keys);
    }, fail);
    return () => {
      live = false;
    };
  }, [token, version]);

  if (!token) return null;
  const reload = () => setVersion((v) => v + 1);
  const url = mcpUrl();
  const connected = keys?.filter((k) => k.oauth) ?? [];
  const manual = keys?.filter((k) => !k.oauth) ?? [];

  const create = () => {
    setBusy(true);
    createApiKey(token, name.trim() || 'Ключ')
      .then((r) => {
        setCreated(r.key);
        setName('');
        reload();
      }, fail)
      .finally(() => setBusy(false));
  };

  const used = (k: ApiKey) => (k.lastUsedAt ? `использован ${day(k.lastUsedAt)}` : 'ещё не использован');

  return (
    <Panel title="Нейросети" icon="gem" accent="var(--c-habit)">
      <p style={{ marginTop: 0 }}>
        Подключите Claude, ChatGPT или другую нейросеть: она сможет смотреть ваш день, добавлять задачи, расходы и еду, отмечать привычки — когда вы её попросите.
      </p>

      <p style={{ margin: '0 0 6px' }}>
        <b>Адрес для подключения</b>
      </p>
      <code style={{ ...codeBox, marginBottom: 8 }}>{url}</code>
      <div className={rowClass} style={{ marginBottom: 16 }}>
        <Button variant="habit" icon="check" onClick={() => copy(url, 'Адрес')}>
          Скопировать адрес
        </Button>
      </div>

      <p style={{ margin: '0 0 6px' }}>
        <b>Как подключить</b>
      </p>
      <div style={{ marginBottom: 10 }}>
        <Segmented label="Нейросеть" value={guide} options={GUIDES} onChange={setGuide} accent="var(--c-habit)" />
      </div>
      <Steps guide={guide} url={url} />

      <p style={{ margin: '20px 0 8px' }}>
        <b>Подключённые нейросети</b>
      </p>
      {keys === null ? (
        <p style={dim}>Загружаем…</p>
      ) : connected.length === 0 ? (
        <p style={dim}>Пока ни одна не подключена.</p>
      ) : (
        <ul style={list}>
          {connected.map((k) => (
            <li key={k.id} style={item}>
              <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                {k.name}
                <br />
                <span style={dim}>
                  подключена {day(k.createdAt)} · {used(k)}
                </span>
              </span>
              <Button small onClick={() => setRevoking(k)}>
                Отключить
              </Button>
            </li>
          ))}
        </ul>
      )}

      <details style={{ marginTop: 20, borderTop: '4px dashed var(--c-border)', paddingTop: 12 }}>
        <summary style={{ cursor: 'pointer' }}>
          Ключ для приложений без входа{manual.length > 0 ? ` (${String(manual.length)})` : ''}
        </summary>
        <p>
          Нужен, только если приложение просит ключ или токен вместо входа. <b>Claude и ChatGPT ключ не нужен.</b> Ключ указывают вместе с адресом выше, в заголовке <code>Authorization: Bearer ключ</code>.
        </p>
        {manual.length > 0 && (
          <ul style={{ ...list, marginBottom: 12 }}>
            {manual.map((k) => (
              <li key={k.id} style={item}>
                <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                  {k.name}
                  <br />
                  <span style={dim}>
                    создан {day(k.createdAt)} · {used(k)}
                  </span>
                </span>
                <Button small icon="trash" label={`Отозвать ключ «${k.name}»`} onClick={() => setRevoking(k)} />
              </li>
            ))}
          </ul>
        )}
        <TextInput label="Для какого приложения" placeholder="Например, Cherry Studio" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
        <div className={rowClass}>
          <Button icon="plus" disabled={busy} onClick={create}>
            Создать ключ
          </Button>
        </div>
      </details>

      <Modal keepOnOutsideClick open={created !== null} onClose={() => setCreated(null)} title="Ключ создан" accent="var(--c-habit)">
        {created && (
          <>
            <p style={{ marginTop: 0 }}>Скопируйте его сейчас: больше он не покажется. Храните как пароль.</p>
            <code style={{ ...codeBox, marginBottom: 12 }}>{created}</code>
            <p style={{ ...dim, marginTop: 0 }}>
              В приложении укажите адрес <span style={{ overflowWrap: 'anywhere' }}>{url}</span> и заголовок Authorization: Bearer и этот ключ.
            </p>
            <div className={rowClass}>
              <Button variant="habit" icon="check" onClick={() => copy(created, 'Ключ')}>
                Скопировать ключ
              </Button>
            </div>
          </>
        )}
      </Modal>
      <ConfirmDialog
        open={revoking !== null}
        title={revoking?.oauth ? 'Отключить нейросеть?' : 'Отозвать ключ?'}
        action={revoking?.oauth ? 'Отключить' : 'Отозвать'}
        onClose={() => setRevoking(null)}
        onConfirm={() => {
          if (revoking) deleteApiKey(token, revoking.id).then(reload, fail);
        }}
      >
        «{revoking?.name}» {revoking?.oauth ? 'сразу потеряет доступ. Подключить снова можно в самой нейросети.' : 'перестанет работать сразу.'}
      </ConfirmDialog>
    </Panel>
  );
}
