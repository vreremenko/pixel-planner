import { Suspense, useEffect } from 'react';
import { createHashRouter, RouterProvider, type RouteObject } from 'react-router';
import { Layout } from './Layout';
import { SettingsScreen } from '../settings/SettingsScreen';
import { Dashboard } from './Dashboard';
import { MoreScreen } from './MoreScreen';
import { MODULES } from '../../modules';
import { ToastHost } from '../ui';
import { useSettings } from '../stores/settings';
import { startNotifications } from '../notifications/scheduler';
import { startSync } from '../sync/manager';
import { startAuth } from '../auth/store';
import { applyMode } from '../settings/mode';
import { WhatsNew } from '../whatsnew/WhatsNew';

// Маршруты всех разделов сборки: выключенный в настройках раздел пропадает из меню, но его ссылки работают
const moduleRoutes: RouteObject[] = MODULES.flatMap((m) => m.routes.map(({ path, Component }) => ({ path, element: <Component /> })));

const router = createHashRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <Dashboard /> },
      ...moduleRoutes,
      { path: 'more', element: <MoreScreen /> },
      { path: 'settings', element: <SettingsScreen /> },
      // Неизвестный адрес — сводка
      { path: '*', element: <Dashboard /> },
    ],
  },
]);

const globals = MODULES.flatMap((m) => m.globals ?? []);

export function App() {
  const crt = useSettings((s) => s.settings.crtEffect);
  const mom = useSettings((s) => s.settings.momMode);
  const loaded = useSettings((s) => s.loaded);
  useEffect(() => {
    // Сканлайны не сочетаются со светлой темой
    document.body.classList.toggle('crt', crt && !mom);
  }, [crt, mom]);
  useEffect(() => {
    // До загрузки настроек ничего не трогаем: тему уже выставил скрипт в index.html
    if (loaded) applyMode(mom);
  }, [mom, loaded]);
  useEffect(() => startNotifications(), []);
  useEffect(() => startAuth(), []);
  useEffect(() => startSync(), []);
  return (
    <>
      <RouterProvider router={router} />
      <Suspense fallback={null}>
        {globals.map((G, i) => (
          <G key={i} />
        ))}
      </Suspense>
      <WhatsNew />
      <ToastHost />
    </>
  );
}
