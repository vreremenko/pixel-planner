/* Настройки разделов: какие включены и какие стоят в нижнем меню телефона. */
import { Panel, toast } from '../ui';
import { useSettings } from '../stores/settings';
import { MODULES } from '../../modules';
import { MOBILE_SLOTS, useModules } from '../shell/nav';
import { ToggleRow } from './ToggleRow';

export function ModulesPanel() {
  const { settings, update } = useSettings();
  const enabled = useModules();
  const items = enabled.flatMap((m) => m.nav);
  const pinned = settings.mobileNav.filter((to) => items.some((n) => n.to === to));

  const setModule = (id: string, on: boolean) =>
    void update({ modulesOff: on ? settings.modulesOff.filter((x) => x !== id) : [...settings.modulesOff, id] });

  const setPinned = (to: string, on: boolean) => {
    if (on && pinned.length >= MOBILE_SLOTS) {
      toast(`В нижнем меню помещается ${String(MOBILE_SLOTS)} раздела — сначала уберите один`, 'alert', 'var(--c-warn)');
      return;
    }
    void update({ mobileNav: on ? [...pinned, to] : pinned.filter((x) => x !== to) });
  };

  return (
    <Panel title="Разделы" icon="home" accent="var(--c-gold)">
      {MODULES.map((m) => (
        <ToggleRow
          key={m.id}
          label={m.title}
          hint={m.nav.length > 1 ? m.nav.map((n) => n.label).join(' · ') : undefined}
          checked={!settings.modulesOff.includes(m.id)}
          onChange={(v) => setModule(m.id, v)}
          color={m.accent}
        />
      ))}
      <h3 style={{ margin: '16px 0 8px' }}>Нижнее меню на телефоне</h3>
      <p style={{ marginTop: 0, color: 'var(--c-text-dim)' }}>
        «Сводка» и «Ещё» есть всегда. Между ними — до {MOBILE_SLOTS} разделов на выбор, остальные в «Ещё».
      </p>
      {items.map((n) => (
        <ToggleRow
          key={n.to}
          label={n.label}
          checked={pinned.includes(n.to)}
          onChange={(v) => setPinned(n.to, v)}
          color={n.accent}
        />
      ))}
    </Panel>
  );
}
