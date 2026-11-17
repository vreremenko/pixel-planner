/*
 * Личные ключи доступа: ими пользуются нейросети через MCP (Claude Code, Claude Desktop, Cursor и другие),
 * позже — команды iPhone. Ключ читает и добавляет записи, но не управляет аккаунтом; отзывается одной кнопкой.
 */
import { useCallback, useEffect, useState } from 'react';
import { createApiKey, deleteApiKey, listApiKeys, type ApiKey } from '../auth/api';
import { useAuth } from '../auth/store';
import { formatDateShort, dateOf } from '../domain/dates';
import { mcpUrl } from '../apiBase';
import { Button, ConfirmDialog, Modal, Panel, TextInput, rowClass, toast } from '../ui';

const day = (ms: number) => formatDateShort(dateOf(new Date(ms)));
const fail = (e: unknown) => toast(e instanceof Error ? e.message : 'Не получилось', 'alert', 'var(--c-warn)');

/** Команда, которая подключает MCP к Claude Code; путь к собранному серверу подставит пользователь. */
const setupCommand = (key: string) => `claude mcp add pixel-planner -e PP_API_KEY=${key} -- node <папка проекта>/mcp/dist/pixel-planner-mcp.mjs`;

export function ApiKeysPanel() {
  const token = useAuth((s) => s.session?.token);
  const [keys, setKeys] = useState<ApiKey[] | null>(null);
  const [name, setName] = useState('Claude Code');
  const [created, setCreated] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<ApiKey | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(() => {
    if (!token) return;
    listApiKeys(token).then((r) => setKeys(r.keys), fail);
  }, [token]);

  useEffect(() => {
    if (!token) return;
    let live = true;
    listApiKeys(token).then((r) => {
      if (live) setKeys(r.keys);
    }, fail);
    return () => {
      live = false;
    };
  }, [token]);

  if (!token) return null;

  const create = () => {
    setBusy(true);
    createApiKey(token, name)
      .then((r) => {
        setCreated(r.key);
        reload();
      }, fail)
      .finally(() => setBusy(false));
  };

  const copy = (text: string) => {
    navigator.clipboard.writeText(text).then(() => toast('Скопировано', 'check', 'var(--c-habit)'), fail);
  };

  return (
    <Panel title="Ключи доступа" icon="lock" accent="var(--c-habit)">
      <p style={{ marginTop: 0 }}>Для нейросетей через MCP: Claude, ChatGPT и другие смогут читать ваши задачи, привычки, финансы и питание, добавлять и править записи. Доступ не даёт менять пароль и удалять аккаунт.</p>
      <p>
        <b>ChatGPT, claude.ai и другие чаты:</b> добавьте коннектор MCP с этим адресом — нейросеть сама попросит вас войти и разрешить доступ:
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 12 }}>
        <code style={{ overflowWrap: 'anywhere', background: 'var(--c-bg)', padding: '6px 8px', minWidth: 0 }}>{mcpUrl()}</code>
        <Button small onClick={() => copy(mcpUrl())}>
          Скопировать
        </Button>
      </div>
      <p style={{ color: 'var(--c-text-dim)' }}>Ниже — подключённые нейросети и ключи для Claude Code на компьютере.</p>
      {keys && keys.length > 0 && (
        <ul style={{ listStyle: 'none', margin: '0 0 12px', padding: 0, display: 'grid', gap: 8 }}>
          {keys.map((k) => (
            <li key={k.id} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
              <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                {k.name}
                <br />
                <span style={{ color: 'var(--c-text-dim)' }}>
                  {k.oauth ? 'подключена' : 'создан'} {day(k.createdAt)} · {k.lastUsedAt ? `использован ${day(k.lastUsedAt)}` : 'ещё не использован'}
                </span>
              </span>
              <Button small icon="trash" label={k.oauth ? `Отключить «${k.name}»` : `Отозвать ключ «${k.name}»`} onClick={() => setRevoking(k)} />
            </li>
          ))}
        </ul>
      )}
      <TextInput label="Название ключа" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
      <div className={rowClass}>
        <Button variant="habit" icon="plus" disabled={busy} onClick={create}>
          Создать ключ
        </Button>
      </div>
      <Modal keepOnOutsideClick open={created !== null} onClose={() => setCreated(null)} title="Ключ создан" accent="var(--c-habit)">
        {created && (
          <>
            <p style={{ marginTop: 0 }}>Скопируйте его сейчас: больше он не покажется. Храните как пароль.</p>
            <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', background: 'var(--c-bg)', padding: 10, margin: '0 0 12px' }}>{created}</pre>
            <div className={rowClass}>
              <Button variant="habit" onClick={() => copy(created)}>
                Скопировать ключ
              </Button>
              <Button onClick={() => copy(setupCommand(created))}>Команда для Claude Code</Button>
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
        «{revoking?.name}» {revoking?.oauth ? 'потеряет доступ сразу. Подключить снова можно в самой нейросети.' : 'перестанет работать сразу.'}
      </ConfirmDialog>
    </Panel>
  );
}
