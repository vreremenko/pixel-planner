import { useEffect } from 'react';
import { createHashRouter, RouterProvider } from 'react-router';
import { Layout } from './Layout';
import { DayScreen } from '../features/day/DayScreen';
import { BacklogScreen } from '../features/backlog/BacklogScreen';
import { HabitsScreen } from '../features/habits/HabitsScreen';
import { StatsScreen } from '../features/stats/StatsScreen';
import { ProfileScreen } from '../features/game/ProfileScreen';
import { SettingsScreen } from '../features/settings/SettingsScreen';
import { TagScreen } from '../features/tags/TagScreen';
import { TaskEditor } from '../features/day/TaskEditor';
import { ToastHost } from '../ui';
import { useSettings } from '../stores/settings';
import { startNotifications } from '../features/notifications/scheduler';
import { WhatsNew } from '../features/whatsnew/WhatsNew';

const router = createHashRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <DayScreen /> },
      { path: 'backlog', element: <BacklogScreen /> },
      { path: 'habits', element: <HabitsScreen /> },
      { path: 'stats', element: <StatsScreen /> },
      { path: 'profile', element: <ProfileScreen /> },
      { path: 'settings', element: <SettingsScreen /> },
      { path: 'tag/:tag', element: <TagScreen /> },
      { path: '*', element: <DayScreen /> },
    ],
  },
]);

export function App() {
  const crt = useSettings((s) => s.settings.crtEffect);
  useEffect(() => {
    document.body.classList.toggle('crt', crt);
  }, [crt]);
  useEffect(() => startNotifications(), []);
  return (
    <>
      <RouterProvider router={router} />
      <TaskEditor />
      <WhatsNew />
      <ToastHost />
    </>
  );
}
