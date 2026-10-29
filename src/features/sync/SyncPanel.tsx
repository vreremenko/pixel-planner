import { useRef, useState } from 'react';
import { Button, Modal, Panel, TextInput, rowClass, toast } from '../../ui';
import { keyToPairingText, parsePairingText } from '../../sync/core';
import { deleteRemoteAndDisable, disableSync, enableSync, syncNow, useSync } from '../../sync/manager';
import { QrCode } from './QrCode';
import { QrScanner } from './QrScanner';
import { decodeQrFromFile } from './decodeQr';
import { fs } from '../../ui/fs';

const fmt = (t: number) => new Date(t).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const fail = (e: unknown) => toast(e instanceof Error ? e.message : 'Что-то пошло не так', 'alert', 'var(--c-warn)');

export function SyncPanel() {
  const state = useSync((s) => s.state);
  const running = useSync((s) => s.running);
  const [showQr, setShowQr] = useState(false);
  const [connect, setConnect] = useState(false);
  const [candidate, setCandidate] = useState<string | null>(null);
  const [manual, setManual] = useState('');
  const [confirmWipe, setConfirmWipe] = useState(false);
  const photoRef = useRef<HTMLInputElement>(null);

  const start = async () => {
    try {
      await enableSync();
      setShowQr(true);
    } catch (e) {
      fail(e);
    }
  };

  const onScanned = (text: string) => {
    const key = parsePairingText(text);
    if (key && key !== candidate) {
      setCandidate(key);
      setConnect(false);
    }
  };

  const join = async () => {
    if (!candidate) return;
    try {
      await enableSync(candidate);
      toast('Синхронизация включена', 'upload', 'var(--c-habit)');
    } catch (e) {
      fail(e);
    }
    setCandidate(null);
    setManual('');
  };

  const manualKey = parsePairingText(manual);

  const onPhoto = async (f: File | undefined) => {
    if (photoRef.current) photoRef.current.value = '';
    if (!f) return;
    try {
      const text = await decodeQrFromFile(f);
      if (text && parsePairingText(text)) onScanned(text);
      else toast('QR-код на фото не найден. Снимите ближе и ровнее, чтобы код был в кадре целиком.', 'alert', 'var(--c-warn)');
    } catch (e) {
      fail(e);
    }
  };

  return (
    <Panel title="Синхронизация" icon="repeat" accent="var(--c-habit)">
      {state ? (
        <>
          <p style={{ marginTop: 0 }}>
            Включена. Задачи, привычки и награды общие на всех устройствах с этим ключом.
          </p>
          <p className="digits" style={{ margin: '0 0 12px', color: state.lastError ? 'var(--c-warn)' : 'var(--c-text-dim)' }}>
            {running
              ? 'Синхронизируем…'
              : state.lastError
                ? `Не удалось: ${state.lastError}${state.lastAt ? ` (последний успех ${fmt(state.lastAt)})` : ''}`
                : state.lastAt
                  ? `Последняя синхронизация: ${fmt(state.lastAt)}`
                  : 'Ещё не синхронизировались'}
          </p>
          <div className={rowClass}>
            <Button variant="habit" icon="repeat" disabled={running} onClick={() => void syncNow()}>
              Синхронизировать
            </Button>
            <Button icon="lock" onClick={() => setShowQr(true)}>
              QR-код для другого устройства
            </Button>
          </div>
          <div className={rowClass} style={{ marginTop: 12 }}>
            <Button small variant="ghost" onClick={() => void disableSync()}>
              Отключить на этом устройстве
            </Button>
            <Button small variant="ghost" icon="trash" onClick={() => setConfirmWipe(true)}>
              Удалить данные с сервера
            </Button>
          </div>
        </>
      ) : (
        <>
          <p style={{ marginTop: 0, color: 'var(--c-text-dim)' }}>
            Чтобы на телефоне и компьютере были одни и те же данные: на одном устройстве включите синхронизацию и покажите QR-код, на другом — отсканируйте его.
          </p>
          <div className={rowClass}>
            <Button variant="habit" icon="repeat" onClick={() => void start()}>
              Включить синхронизацию
            </Button>
            <Button icon="search" onClick={() => setConnect(true)}>
              Подключиться по QR-коду
            </Button>
          </div>
        </>
      )}
      <p style={{ marginBottom: 0, color: 'var(--c-text-dim)', fontSize: fs(17) }}>
        Ключ работает как пароль: у кого он есть, тот видит ваши данные. На сервере они хранятся без шифрования. Настройки и журнал напоминаний остаются на каждом устройстве свои. Без сети всё работает как раньше, а изменения уйдут при подключении.
      </p>

      <Modal open={showQr && state != null} onClose={() => setShowQr(false)} title="Подключить устройство" accent="var(--c-habit)" footer={<Button onClick={() => setShowQr(false)}>Готово</Button>}>
        {state && (
          <>
            <p style={{ marginTop: 0 }}>На втором устройстве откройте Настройки → «Подключиться по QR-коду» и наведите камеру.</p>
            <div style={{ display: 'grid', placeItems: 'center' }}>
              <QrCode text={keyToPairingText(state.key)} label="QR-код ключа синхронизации" />
            </div>
            <p style={{ marginBottom: 4, color: 'var(--c-text-dim)' }}>Нет камеры? Введите ключ вручную:</p>
            <code className="digits" style={{ wordBreak: 'break-all', userSelect: 'all', fontSize: fs(18) }}>{state.key}</code>
            <p style={{ marginBottom: 0 }}>
              <Button
                small
                onClick={() => void navigator.clipboard.writeText(state.key).then(() => toast('Ключ скопирован', 'check', 'var(--c-habit)'), fail)}
              >
                Скопировать ключ
              </Button>
            </p>
          </>
        )}
      </Modal>

      <Modal open={connect} onClose={() => setConnect(false)} title="Подключиться по QR-коду" accent="var(--c-habit)" footer={<Button onClick={() => setConnect(false)}>Отмена</Button>}>
        <p style={{ marginTop: 0 }}>Наведите камеру на QR-код, который показывает другое устройство.</p>
        {connect && <QrScanner onText={onScanned} />}
        <p style={{ margin: '12px 0 0' }}>
          <Button small icon="search" onClick={() => photoRef.current?.click()}>
            Сфотографировать QR-код
          </Button>
          <input ref={photoRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => void onPhoto(e.target.files?.[0])} />
        </p>
        <div style={{ marginTop: 16 }}>
          <TextInput label="Или вставьте ключ" value={manual} onChange={(e) => setManual(e.target.value)} placeholder="43 символа" autoComplete="off" autoCapitalize="off" spellCheck={false} />
          <Button
            small
            variant="habit"
            disabled={!manualKey}
            onClick={() => {
              if (manualKey) onScanned(manualKey);
            }}
          >
            Подключить
          </Button>
        </div>
      </Modal>

      <Modal
        open={candidate !== null}
        onClose={() => setCandidate(null)}
        title="Объединить данные?"
        accent="var(--c-habit)"
        footer={
          <>
            <Button onClick={() => setCandidate(null)}>Отмена</Button>
            <Button variant="habit" onClick={() => void join()}>
              Объединить
            </Button>
          </>
        }
      >
        <p style={{ marginTop: 0 }}>Данные этого устройства и те, что уже есть на сервере, будут объединены. Ничего не удалится: при расхождении побеждает более свежая правка.</p>
      </Modal>

      <Modal
        open={confirmWipe}
        onClose={() => setConfirmWipe(false)}
        title="Удалить данные с сервера?"
        accent="var(--c-warn)"
        footer={
          <>
            <Button onClick={() => setConfirmWipe(false)}>Отмена</Button>
            <Button
              variant="danger"
              onClick={() => {
                setConfirmWipe(false);
                void deleteRemoteAndDisable().then(() => toast('Данные на сервере удалены, синхронизация отключена', 'trash', 'var(--c-habit)'), fail);
              }}
            >
              Удалить
            </Button>
          </>
        }
      >
        <p style={{ marginTop: 0 }}>Копия в облаке будет стёрта, синхронизация отключится. Данные на этом устройстве останутся. На других устройствах они тоже останутся, но обмен прекратится.</p>
      </Modal>
    </Panel>
  );
}
