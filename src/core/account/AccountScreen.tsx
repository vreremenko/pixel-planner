import { AccountPanel } from './AccountPanel';
import { ApiKeysPanel } from './ApiKeysPanel';
import { SiriPanel } from './SiriPanel';
import { inTelegram } from '../telegram/webapp';

/** Личный кабинет: вход, выход, пароль. На телефоне открывается значком в верхней полосе. */
export function AccountScreen() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap-4)' }}>
      <h1 className="glow pageTitle" style={{ color: 'var(--c-habit)' }}>
        Личный кабинет
      </h1>
      <AccountPanel />
      {!inTelegram() && <SiriPanel />}
      {!inTelegram() && <ApiKeysPanel />}
    </div>
  );
}
