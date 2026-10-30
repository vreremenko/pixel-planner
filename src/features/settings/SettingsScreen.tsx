import { useEffect, useState, type ReactNode } from 'react';
import { Button, Checkbox, Panel, TextInput, rowClass, toast } from '../../ui';
import { useSettings } from '../../stores/settings';
import { permission, requestPermission } from '../notifications/notify';
import { flushPush, testNotification, tick } from '../notifications/scheduler';
import { useLiveQuery } from 'dexie-react-hooks';
import { metaRepo } from '../../data/repo';
import { disablePush, enablePush, forceNextSync, getPushState, type SyncStatus, getServerKey, isIos as detectIos, isStandalone, pushSupported, pushUnavailableReason, testPush } from '../notifications/push';
import { play } from '../../services/sfx';
import { useInstallPrompt } from '../pwa/useInstallPrompt';
import { APP_VERSION, CHANGELOG } from '../../changelog';
import { ChangelogModal } from '../whatsnew/ChangelogModal';
import { AccountPanel } from '../account/AccountPanel';
import { useAuth } from '../../auth/store';
import { fs } from '../../ui/fs';

function ToggleRow({ label, hint, checked, onChange, color }: { label: string; hint?: ReactNode; checked: boolean; onChange: (v: boolean) => void; color?: string }) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 14 }}>
      <Checkbox checked={checked} onChange={onChange} label={label} color={color} />
      <div>
        <div>{label}</div>
        {hint && <div style={{ color: 'var(--c-text-dim)', fontSize: fs(17) }}>{hint}</div>}
      </div>
    </div>
  );
}

const PERM_TEXT: Record<string, string> = {
  granted: 'разрешены',
  denied: 'запрещены в браузере',
  default: 'ещё не запрошены',
  unsupported: 'не поддерживаются этим браузером',
};

function NotificationsPanel() {
  const { settings, update } = useSettings();
  const [perm, setPerm] = useState(permission());
  const isIos = detectIos();
  const standalone = isStandalone();
  const [server, setServer] = useState<boolean | null>(null);
  const [serverKey, setServerKey] = useState<string | null>(null);
  const [pushOn, setPushOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
  const loggedIn = useAuth((a) => a.session) != null;

  useEffect(() => {
    void getServerKey().then((k) => {
      setServer(k !== null);
      setServerKey(k);
    });
    void getPushState().then((st) => setPushOn(st?.enabled === true));
  }, []);

  const togglePush = async (v: boolean) => {
    setBusy(true);
    setPushError(null);
    try {
      if (v) {
        if (perm !== 'granted') {
          const p = await requestPermission();
          setPerm(p);
          if (p !== 'granted') throw new Error('Нужно разрешение на уведомления');
        }
        await enablePush(serverKey ?? undefined);
        if (!settings.notificationsEnabled) await update({ notificationsEnabled: true });
        toast('Push включён: напоминания придут и при закрытом приложении', 'bell', 'var(--c-habit)');
      } else {
        await disablePush();
      }
      setPushOn(v);
      void tick();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Не удалось включить push';
      setPushError(msg);
      toast(msg, 'alert', 'var(--c-warn)');
    } finally {
      setBusy(false);
    }
  };
  const pushReason = pushUnavailableReason(server, loggedIn);
  const [diag, setDiag] = useState<string[]>([]);
  const sync = useLiveQuery(() => metaRepo.get<SyncStatus>('pushSync'), []);
  const runDiag = async () => {
    const lines = [
      `Разрешение: ${PERM_TEXT[permission()] ?? '?'}`,
      `Установлено как приложение: ${standalone ? 'да' : 'нет'}`,
      `Service worker: ${'serviceWorker' in navigator ? ((await navigator.serviceWorker.getRegistration())?.active ? 'активен' : 'не активен') : 'не поддерживается'}`,
      `Push API: ${pushSupported() ? 'есть' : 'нет'}`,
      `Сервер: ${server === null ? 'проверка…' : server ? 'доступен' : 'недоступен'}`,
    ];
    if (pushSupported()) {
      const sub = await (await navigator.serviceWorker.getRegistration())?.pushManager.getSubscription();
      lines.push(`Подписка: ${sub ? new URL(sub.endpoint).host : 'нет'}`);
    }
    setDiag(lines);
  };

  const enable = async (v: boolean) => {
    if (v && perm !== 'granted') {
      const p = await requestPermission();
      setPerm(p);
      if (p !== 'granted') toast('Без разрешения напоминания будут только внутри приложения', 'alert', 'var(--c-warn)');
    }
    await update({ notificationsEnabled: v });
    void tick();
  };

  return (
    <Panel title="Уведомления" icon="bell" accent="var(--c-xp)">
      <p style={{ marginTop: 0 }}>
        Статус в браузере: <b style={{ color: perm === 'granted' ? 'var(--c-habit)' : 'var(--c-warn)' }}>{PERM_TEXT[perm]}</b>
      </p>
      {perm !== 'granted' && perm !== 'unsupported' && (
        <div style={{ marginBottom: 16, padding: 12, border: '4px dashed var(--c-border)' }}>
          <p style={{ marginTop: 0 }}>
            Разрешение нужно, чтобы присылать напоминания о задачах и квестах в момент их начала и утреннюю сводку.
            Мы спросим браузер только после нажатия кнопки.
          </p>
          <Button variant="xp" icon="bell" disabled={perm === 'denied'} onClick={() => void enable(true)}>
            Разрешить уведомления
          </Button>
          {perm === 'denied' && <p style={{ color: 'var(--c-warn)' }}>Разрешение отклонено — включите его в настройках сайта в браузере.</p>}
        </div>
      )}
      <ToggleRow
        label="Напоминания включены"
        hint="Глобальный выключатель всех напоминаний и сводки"
        checked={settings.notificationsEnabled}
        onChange={(v) => void enable(v)}
        color="var(--c-xp)"
      />
      <ToggleRow
        label="Утренняя сводка"
        hint="Сколько задач и квестов на сегодня"
        checked={settings.morningSummary.enabled}
        onChange={(v) => void update({ morningSummary: { ...settings.morningSummary, enabled: v } })}
        color="var(--c-xp)"
      />
      {settings.morningSummary.enabled && (
        <div style={{ maxWidth: 200 }}>
          <TextInput label="Время сводки" type="time" value={settings.morningSummary.time} onChange={(e) => e.target.value && void update({ morningSummary: { ...settings.morningSummary, time: e.target.value } })} />
        </div>
      )}
      <ToggleRow
        label="Тихие часы"
        hint="Напоминания в это время переносятся на конец тихих часов"
        checked={settings.quietHours.enabled}
        onChange={(v) => void update({ quietHours: { ...settings.quietHours, enabled: v } })}
        color="var(--c-xp)"
      />
      {settings.quietHours.enabled && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, maxWidth: 360 }}>
          <TextInput label="С" type="time" value={settings.quietHours.from} onChange={(e) => e.target.value && void update({ quietHours: { ...settings.quietHours, from: e.target.value } })} />
          <TextInput label="До" type="time" value={settings.quietHours.to} onChange={(e) => e.target.value && void update({ quietHours: { ...settings.quietHours, to: e.target.value } })} />
        </div>
      )}
      <div style={{ padding: 12, marginBottom: 16, border: '4px solid var(--c-habit)' }}>
        <ToggleRow
          label="Push при закрытом приложении"
          hint={
            busy
              ? 'Подключаем…'
              : pushError
                ? `Ошибка: ${pushError}`
                : (pushReason ?? 'Расписание напоминаний на 7 дней хранится на сервере, он присылает их вовремя')
          }
          checked={pushOn}
          onChange={(v) => {
            if (busy) return;
            if (v && pushReason) {
              toast(pushReason, 'alert', 'var(--c-warn)');
              return;
            }
            void togglePush(v);
          }}
          color="var(--c-habit)"
        />
        {pushOn && (
          <p className="digits" style={{ margin: '0 0 8px', color: sync?.ok === false ? 'var(--c-warn)' : 'var(--c-text-dim)' }}>
            Расписание на сервере:{' '}
            {sync
              ? `${new Date(sync.at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}, напоминаний: ${String(sync.count)}${sync.ok ? ' ✓' : ` — ошибка: ${sync.error ?? '?'}`}`
              : 'ещё не отправлялось'}
          </p>
        )}
        <div className={rowClass}>
          {pushOn && (
            <Button
              small
              icon="upload"
              onClick={() => {
                forceNextSync();
                void flushPush().then(() => toast('Расписание отправлено', 'upload', 'var(--c-habit)'));
              }}
            >
              Отправить расписание
            </Button>
          )}
          {pushOn && (
            <Button small icon="bell" onClick={() => void testPush().then((m) => toast(m, 'bell', 'var(--c-habit)'), (e: unknown) => toast(`Ошибка сети: ${String(e)}`, 'alert', 'var(--c-warn)'))}>
              Проверить push
            </Button>
          )}
          <Button small variant="ghost" icon="search" onClick={() => void runDiag()}>
            Диагностика
          </Button>
        </div>
        {diag.length > 0 && (
          <ul className="digits" style={{ margin: '8px 0 0', paddingLeft: 20, color: 'var(--c-text-dim)' }}>
            {diag.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        )}
      </div>
      <Button
        small
        icon="bell"
        onClick={() =>
          void testNotification().then((err) =>
            err
              ? toast(`Не удалось показать: ${err}`, 'alert', 'var(--c-warn)')
              : toast('Уведомление отправлено. Не видно? Проверьте системные настройки уведомлений для браузера и режим «Не беспокоить».', 'bell', 'var(--c-xp)'),
          )
        }
      >
        Тестовое уведомление
      </Button>
      <div style={{ marginTop: 16, padding: 12, background: 'var(--c-bg)', borderLeft: '8px solid var(--c-warn)' }}>
        <h3 style={{ color: 'var(--c-warn)', marginBottom: 8 }}>Честно об ограничениях</h3>
        <ul style={{ margin: 0, paddingLeft: 20, color: 'var(--c-text-dim)' }}>
          {pushOn ? (
            <>
              <li>Push включён: сервер присылает напоминания и при закрытом приложении, с точностью до минуты.</li>
              <li>Расписание отправляется на сервер, когда приложение открыто. Если не открывать его больше 7 дней, новые напоминания перестанут приходить.</li>
              <li>Изменения, сделанные без сети, попадут на сервер при следующем подключении. Число задач в утренней сводке — на момент последней синхронизации.</li>
              <li>На сервере хранятся только названия и время напоминаний — не вся база.</li>
            </>
          ) : (
            <>
              <li>Без push напоминания приходят, <b style={{ color: 'var(--c-text)' }}>только пока приложение открыто</b> или живо в фоне. Если вкладку закрыть, браузер не разбудит её к нужному времени.</li>
              <li>Сработавшие без вас напоминания покажем списком «Пропущенные» при следующем открытии.</li>
              <li>Браузер может «усыплять» фоновые вкладки, поэтому напоминание иногда приходит с задержкой до минуты.</li>
            </>
          )}
          {isIos && !standalone && <li>На iPhone уведомления работают только для приложения, установленного на экран «Домой» (iOS 16.4+).</li>}
        </ul>
      </div>
    </Panel>
  );
}

export function SettingsScreen() {
  const { settings, update } = useSettings();
  const install = useInstallPrompt();
  const [showLog, setShowLog] = useState(false);
  return (
    <>
      <h1 className="glow" style={{ marginBottom: 16 }}>
        Настройки
      </h1>
      <div style={{ display: 'grid', gap: 24 }}>
        <AccountPanel />
        <NotificationsPanel />
        <Panel title="Звук и экран" icon="sound" accent="var(--c-task)">
          <ToggleRow
            label="8-битные звуки"
            hint="При выполнении задач, новом уровне и достижениях"
            checked={settings.soundEnabled}
            onChange={(v) => {
              void update({ soundEnabled: v });
              if (v) play('complete', true);
            }}
          />
          <ToggleRow label="Эффект CRT-монитора" hint="Сканлайны и лёгкое свечение" checked={settings.crtEffect} onChange={(v) => void update({ crtEffect: v })} />
        </Panel>
        <Panel title="Установка" icon="download" accent="var(--c-backlog)">
          {install.updateReady && (
            <p style={{ marginTop: 0 }}>
              <Button variant="xp" icon="upload" onClick={install.applyUpdate}>
                Обновить приложение
              </Button>
            </p>
          )}
          {install.installed ? (
            <p style={{ margin: 0 }}>Приложение установлено и работает офлайн.</p>
          ) : install.canInstall ? (
            <Button icon="download" onClick={() => void install.prompt()}>
              Установить приложение
            </Button>
          ) : (
            <p style={{ margin: 0, color: 'var(--c-text-dim)' }}>
              Установите через меню браузера: «Установить приложение» (Chrome/Edge) или «Поделиться → На экран „Домой“» (Safari). После установки приложение работает офлайн.
            </p>
          )}
        </Panel>
        <Panel title="О приложении" icon="star" accent="var(--c-xp)">
          <p style={{ marginTop: 0 }}>
            PIXEL PLANNER, версия <b className="digits" style={{ fontSize: fs(22), color: 'var(--c-xp)' }}>{APP_VERSION}</b>
          </p>
          <Button icon="book" onClick={() => setShowLog(true)}>
            Что нового
          </Button>
        </Panel>
        <Panel title="Управление" icon="menu" accent="var(--c-text-dim)">
          <ul style={{ margin: 0, paddingLeft: 20, color: 'var(--c-text-dim)' }}>
            <li><b>N</b> — новая задача (на экране квестов — новый квест)</li>
            <li><b>← / →</b> — предыдущий / следующий день (месяц в квестах)</li>
            <li><b>T</b> — вернуться к сегодня</li>
            <li><b>/</b> — поиск в инвентаре</li>
            <li><b>Esc</b> — закрыть окно</li>
            <li>Перетаскивание задач — мышью, пальцем (долгое нажатие) или клавиатурой: Tab до ручки, Пробел, стрелки, Пробел.</li>
          </ul>
        </Panel>
        <Panel title="Для мамы" icon="heart" accent="var(--c-warn)">
          <ToggleRow
            label="Режим «Для мамы»"
            hint="Светлая тёплая тема, крупнее текст и более читаемый шрифт. Выключите — всё вернётся как было."
            checked={settings.momMode}
            onChange={(v) => void update({ momMode: v })}
          />
        </Panel>
      </div>
      {showLog && <ChangelogModal entries={CHANGELOG.slice(0, 10)} title="История обновлений" closeLabel="Закрыть" collapseOlder onClose={() => setShowLog(false)} />}
    </>
  );
}
