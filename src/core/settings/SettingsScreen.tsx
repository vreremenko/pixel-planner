import { useEffect, useRef, useState } from 'react';
import { Button, Panel, TextInput, toast } from '../ui';
import { useSettings } from '../stores/settings';
import { permission, requestPermission } from '../notifications/notify';
import { tick } from '../notifications/scheduler';
import { disablePush, enablePush, getPushState, getServerKey, pushUnavailableReason } from '../notifications/push';
import { play } from '../sfx';
import { useInstallPrompt } from '../pwa/useInstallPrompt';
import { APP_VERSION, CHANGELOG } from '../changelog';
import { ChangelogModal } from '../whatsnew/ChangelogModal';
import { AccountPanel } from '../account/AccountPanel';
import { ModulesPanel } from './ModulesPanel';
import { ToggleRow } from './ToggleRow';
import { useAuth } from '../auth/store';
import { fs } from '../ui/fs';

const PERM_TEXT: Record<string, string> = {
  granted: 'разрешены',
  denied: 'запрещены в браузере',
  default: 'ещё не запрошены',
  unsupported: 'не поддерживаются этим браузером',
};

function NotificationsPanel() {
  const { settings, update } = useSettings();
  const [perm, setPerm] = useState(permission());
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

  const pushReason = pushUnavailableReason(server, loggedIn);

  /** Подписать устройство на push (при закрытом приложении) и вернуть, получилось ли. */
  const startPush = async (): Promise<boolean> => {
    setBusy(true);
    setPushError(null);
    try {
      await enablePush(serverKey ?? undefined);
      setPushOn(true);
      void tick();
      return true;
    } catch (e) {
      setPushError(e instanceof Error ? e.message : 'Не удалось включить push');
      return false;
    } finally {
      setBusy(false);
    }
  };

  // Напоминания включены, а push на этом устройстве ещё нет (вошли в аккаунт позже, обновили приложение): подключаем сами
  const autoTried = useRef(false);
  useEffect(() => {
    if (autoTried.current || !settings.notificationsEnabled || perm !== 'granted' || pushOn || busy || server === null || pushReason) return;
    autoTried.current = true;
    void startPush();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.notificationsEnabled, perm, pushOn, busy, server, pushReason]);

  const rowRef = useRef<HTMLDivElement>(null);
  const [blocked, setBlocked] = useState(false);
  const blockedHint =
    perm === 'denied'
      ? 'Уведомления запрещены в браузере. Разрешите их в настройках сайта, и тогда напоминания можно будет включить.'
      : perm === 'unsupported'
        ? 'Этот браузер не поддерживает уведомления, поэтому напоминания включить нельзя.'
        : 'Сначала разрешите уведомления кнопкой выше, без этого напоминания включить нельзя.';

  /** Флажок нельзя включить без разрешения: трясём его и объясняем почему. */
  const refuse = () => {
    setBlocked(true);
    toast(blockedHint, 'alert', 'var(--c-warn)');
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
      rowRef.current?.animate(
        [{ transform: 'translateX(0)' }, { transform: 'translateX(-10px)' }, { transform: 'translateX(10px)' }, { transform: 'translateX(-8px)' }, { transform: 'translateX(8px)' }, { transform: 'translateX(0)' }],
        { duration: 400, easing: 'ease-in-out' },
      );
    }
  };

  const turnOn = async () => {
    await update({ notificationsEnabled: true });
    if (!pushReason && !pushOn && (await startPush())) toast('Напоминания придут и при закрытом приложении', 'bell', 'var(--c-habit)');
    void tick();
  };

  const allow = async () => {
    const p = await requestPermission();
    setPerm(p);
    if (p === 'granted') {
      setBlocked(false);
      await turnOn();
    } else {
      refuse();
    }
  };

  const enable = async (v: boolean) => {
    if (busy) return;
    if (v) {
      if (perm !== 'granted') return refuse();
      return turnOn();
    }
    await update({ notificationsEnabled: false });
    if (pushOn) {
      try {
        await disablePush();
      } finally {
        setPushOn(false);
      }
    }
    void tick();
  };

  return (
    <Panel title="Уведомления" icon="bell" accent="var(--c-gold)">
      <p style={{ marginTop: 0 }}>
        Статус в браузере: <b style={{ color: perm === 'granted' ? 'var(--c-habit)' : 'var(--c-warn)' }}>{PERM_TEXT[perm]}</b>
      </p>
      {perm !== 'granted' && perm !== 'unsupported' && (
        <div style={{ marginBottom: 16, padding: 12, border: '4px dashed var(--c-border)' }}>
          <p style={{ marginTop: 0 }}>
            Разрешение нужно, чтобы присылать напоминания о задачах и привычках в момент их начала и утреннюю сводку.
            Мы спросим браузер только после нажатия кнопки.
          </p>
          <Button variant="gold" icon="bell" disabled={perm === 'denied'} onClick={() => void allow()}>
            Разрешить уведомления
          </Button>
          {perm === 'denied' && <p style={{ color: 'var(--c-warn)' }}>Разрешение отклонено — включите его в настройках сайта в браузере.</p>}
        </div>
      )}
      <ToggleRow
        label="Напоминания включены"
        rowRef={rowRef}
        hintColor={blocked && perm !== 'granted' ? 'var(--c-warn)' : undefined}
        hint={
          blocked && perm !== 'granted'
            ? blockedHint
            : busy
              ? 'Подключаем…'
              : pushError
                ? `Не удалось включить push при закрытом приложении: ${pushError}`
                : pushOn
                  ? 'Приходят и при закрытом приложении'
                  : (pushReason ?? 'Глобальный выключатель всех напоминаний и сводки')
        }
        checked={settings.notificationsEnabled && perm === 'granted'}
        onChange={(v) => void enable(v)}
        color="var(--c-gold)"
      />
      <ToggleRow
        label="Утренняя сводка"
        hint="Сколько задач и привычек на сегодня"
        checked={settings.morningSummary.enabled}
        onChange={(v) => void update({ morningSummary: { ...settings.morningSummary, enabled: v } })}
        color="var(--c-gold)"
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
        color="var(--c-gold)"
      />
      {settings.quietHours.enabled && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, maxWidth: 360 }}>
          <TextInput label="С" type="time" value={settings.quietHours.from} onChange={(e) => e.target.value && void update({ quietHours: { ...settings.quietHours, from: e.target.value } })} />
          <TextInput label="До" type="time" value={settings.quietHours.to} onChange={(e) => e.target.value && void update({ quietHours: { ...settings.quietHours, to: e.target.value } })} />
        </div>
      )}
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
        <ModulesPanel />
        <NotificationsPanel />
        <Panel title="Звук и экран" icon="sound" accent="var(--c-task)">
          <ToggleRow
            label="8-битные звуки"
            hint="При выполнении задач и привычек"
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
              <Button variant="gold" icon="upload" onClick={install.applyUpdate}>
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
        <Panel title="О приложении" icon="star" accent="var(--c-gold)">
          <p style={{ marginTop: 0 }}>
            PIXEL PLANNER, версия <b className="digits" style={{ fontSize: fs(22), color: 'var(--c-gold)' }}>{APP_VERSION}</b>
          </p>
          <Button icon="book" onClick={() => setShowLog(true)}>
            Что нового
          </Button>
        </Panel>
        <Panel title="Управление" icon="menu" accent="var(--c-text-dim)">
          <ul style={{ margin: 0, paddingLeft: 20, color: 'var(--c-text-dim)' }}>
            <li><b>N</b> — новая задача (на экране привычек — новая привычка)</li>
            <li><b>← / →</b> — предыдущий / следующий день (месяц в привычках)</li>
            <li><b>T</b> — вернуться к сегодня</li>
            <li><b>/</b> — поиск в бэклоге</li>
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
