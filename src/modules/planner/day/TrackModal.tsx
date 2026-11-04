import { useMemo, useRef, useState } from 'react';
import s from './Track.module.css';
import { Button, Modal, PixelIcon, cx } from '../../../core/ui';
import { useDay } from '../data/hooks';
import { createRestOnTrack, setOccurrenceTrack, setTaskTrack } from '../services/tasks';
import { useTrackHours } from '../stores/trackHours';
import { STEP, canSplit, drag, fmtDuration, fmtTime, freeSlot, shiftRest, split, type DragMode, type Placed, type ShiftItem, type TrackBlock } from '../domain/track';
import { minutesOf } from '../../../core/domain/dates';
import type { LocalDate } from '../../../core/domain/types';
import type { Occurrence, Task } from '../domain/types';

/** Высота одного часа на треке, px. */
const PX_PER_HOUR = 56;
const PPM = PX_PER_HOUR / 60;

const PALETTE = ['var(--c-task)', 'var(--c-backlog)', 'var(--c-gym)', 'var(--c-gold)', 'var(--c-warn)', 'var(--c-food)'];
/** Цвет блока по первой метке: «отдых» всегда зелёный, остальные — по устойчивому хэшу названия. */
function tagColor(task: { tags: readonly string[] }): string {
  const tag = task.tags[0];
  if (!tag) return 'var(--c-text-muted)';
  if (tag.toLowerCase() === 'отдых') return 'var(--c-habit)';
  let h = 0;
  for (const ch of tag) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length] ?? 'var(--c-task)';
}

interface Props {
  open: boolean;
  onClose: () => void;
  date: LocalDate;
  todayDate: LocalDate;
}

/** Всё, что может стоять на треке: обычная задача или экземпляр повторяющейся. */
interface Item {
  id: string;
  title: string;
  tags: string[];
  time?: string;
  done: boolean;
  track: TrackBlock[];
  task?: Task;
  occ?: Occurrence;
}

interface Dragging {
  key: string;
  mode: DragMode;
  y: number;
  base: Placed;
  now: TrackBlock;
  moved: boolean;
}

/** «Трек дня» во всплывающем окне: блоки времени задач на шкале; двигать, растягивать, разрезать. */
export function TrackModal({ open, onClose, date, todayDate }: Props) {
  const data = useDay(date, todayDate);
  const { from, to, set: setHours } = useTrackHours();
  const [sel, setSel] = useState<string | null>(null);
  const [dragging, setDragging] = useState<Dragging | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  const items = useMemo<Item[]>(() => {
    const fromTasks = [...(data?.tasks ?? [])].sort((a, b) => a.order - b.order).map((t): Item => ({ id: t.id, title: t.title, tags: t.tags, ...(t.time ? { time: t.time } : {}), done: t.done, track: t.track ?? [], task: t }));
    const fromOcc = (data?.occurrences ?? []).filter((o) => o.status === 'pending' || o.status === 'done').map((o): Item => ({ id: o.key, title: `↻ ${o.title}`, tags: o.tags, ...(o.time ? { time: o.time } : {}), done: o.status === 'done', track: o.track ?? [], occ: o }));
    return [...fromTasks, ...fromOcc];
  }, [data]);
  const placed = useMemo<Placed[]>(() => items.flatMap((t) => t.track.map((b, i) => ({ key: `${t.id}:${String(i)}`, start: b.start, end: b.end }))), [items]);
  // Блоки, выходящие за выбранные часы дня (например, после «сдвинуть остаток»), расширяют шкалу, а не пропадают
  const bounds = useMemo(
    () => ({ from: Math.min(from * 60, ...placed.map((p) => Math.floor(p.start / 60) * 60)), to: Math.max(to * 60, ...placed.map((p) => Math.ceil(p.end / 60) * 60)) }),
    [from, to, placed],
  );
  const shown = placed.map((p) => (dragging?.key === p.key ? { ...p, ...dragging.now } : p));
  // id экземпляра повтора сам содержит «:», поэтому номер блока — после последнего двоеточия
  const byKey = (key: string) => {
    const cut = key.lastIndexOf(':');
    const item = items.find((t) => t.id === key.slice(0, cut));
    return item ? { task: item, index: Number(key.slice(cut + 1)) } : null;
  };

  const write = (item: Item, blocks: TrackBlock[]) => void (item.occ ? setOccurrenceTrack(item.occ, blocks) : item.task ? setTaskTrack(item.task, blocks) : undefined);
  const patch = (key: string, next: TrackBlock) => {
    const ref = byKey(key);
    if (!ref) return;
    const blocks = [...ref.task.track];
    blocks[ref.index] = next;
    write(ref.task, blocks);
  };

  const tray = items.filter((t) => !t.done && t.track.length === 0);
  const place = (item: Item) => {
    const len = 60;
    // Если у задачи уже есть время, ставим как можно ближе к нему
    const wish = item.time ? minutesOf(item.time) : sel ? (placed.find((p) => p.key === sel)?.end ?? 0) : 0;
    const at = freeSlot(placed, len, wish, bounds) ?? freeSlot(placed, len, 0, bounds);
    if (at === null) return;
    write(item, [{ start: at, end: at + len }]);
  };
  const addRest = () => {
    const after = sel ? (placed.find((p) => p.key === sel)?.end ?? 0) : 0;
    const at = freeSlot(placed, 30, after, bounds) ?? freeSlot(placed, 30, 0, bounds);
    if (at !== null) void createRestOnTrack(date, { start: at, end: at + 30 });
  };

  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const isToday = date === todayDate;
  const shiftItems: ShiftItem[] = placed.map((p) => ({ ...p, fixed: byKey(p.key)?.task.done ?? false }));
  const shiftPlan = isToday ? shiftRest(shiftItems, nowMin) : null;
  const shiftRestOfDay = () => {
    if (!shiftPlan || shiftPlan === 'overflow') return;
    for (const item of items) {
      if (!item.track.some((_, i) => shiftPlan.moves[`${item.id}:${String(i)}`])) continue;
      write(item, item.track.map((b, i) => shiftPlan.moves[`${item.id}:${String(i)}`] ?? b));
    }
    setSel(null);
  };

  const total = bounds.to - bounds.from;
  const planned = placed.reduce((sum, b) => sum + b.end - b.start, 0);

  const onDown = (e: React.PointerEvent, key: string) => {
    const p = placed.find((x) => x.key === key);
    if (!p) return;
    const handle = (e.target as HTMLElement).dataset.h;
    const mode: DragMode = handle === 'top' ? 'top' : handle === 'bottom' ? 'bottom' : 'move';
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // нет активного указателя — перетаскивание всё равно работает через move на дорожке
    }
    setSel(key);
    setDragging({ key, mode, y: e.clientY, base: p, now: { start: p.start, end: p.end }, moved: false });
  };
  const onMove = (e: React.PointerEvent) => {
    if (!dragging) return;
    const delta = (e.clientY - dragging.y) / PPM;
    const now = drag(placed, dragging.base, dragging.mode, delta, bounds);
    setDragging({ ...dragging, now, moved: dragging.moved || Math.abs(e.clientY - dragging.y) > 3 });
  };
  const onUp = () => {
    if (!dragging) return;
    const d = dragging;
    setDragging(null);
    if (d.now.start !== d.base.start || d.now.end !== d.base.end) patch(d.key, d.now);
  };

  const cur = sel ? (shown.find((p) => p.key === sel) ?? null) : null;
  const curTask = sel ? byKey(sel)?.task : undefined;
  const act = (kind: 'split' | 'earlier' | 'later' | 'shorter' | 'longer' | 'remove') => {
    if (!cur || !sel) return;
    const ref = byKey(sel);
    if (!ref) return;
    const blocks = [...ref.task.track];
    const b = { start: cur.start, end: cur.end };
    if (kind === 'remove') {
      blocks.splice(ref.index, 1);
      setSel(null);
      return write(ref.task, blocks);
    }
    if (kind === 'split') {
      const parts = split(b);
      if (!parts) return;
      blocks.splice(ref.index, 1, ...parts);
      return write(ref.task, blocks);
    }
    const mode: DragMode = kind === 'shorter' || kind === 'longer' ? 'bottom' : 'move';
    const delta = kind === 'earlier' || kind === 'shorter' ? -STEP : STEP;
    patch(sel, drag(placed, { key: sel, ...b }, mode, delta, bounds));
  };

  const lines: number[] = [];
  for (let m = bounds.from; m <= bounds.to; m += 60) lines.push(m);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Трек дня"
      accent="var(--c-task)"
      keepOnOutsideClick
      footer={
        cur && curTask ? (
          <div className={s.actions}>
            <div className={s.info}>
              <b>{curTask.title}</b> · {fmtTime(cur.start)}–{fmtTime(cur.end)} · {fmtDuration(cur.end - cur.start)}
            </div>
            <Button small variant="primary" disabled={!canSplit(cur)} onClick={() => act('split')}>
              Разрезать
            </Button>
            <Button small onClick={() => act('earlier')}>
              Раньше
            </Button>
            <Button small onClick={() => act('later')}>
              Позже
            </Button>
            <Button small onClick={() => act('shorter')}>
              Короче
            </Button>
            <Button small onClick={() => act('longer')}>
              Длиннее
            </Button>
            <Button small variant="danger" onClick={() => act('remove')}>
              С трека
            </Button>
          </div>
        ) : undefined
      }
    >
      <div className={s.range}>
        <span>Часы дня: с</span>
        <select className={s.select} value={from} aria-label="Начало дня" onChange={(e) => setHours({ from: Math.min(Number(e.target.value), to - 4), to })}>
          {Array.from({ length: 13 }, (_, h) => (
            <option key={h} value={h}>{`${String(h).padStart(2, '0')}:00`}</option>
          ))}
        </select>
        <span>до</span>
        <select className={s.select} value={to} aria-label="Конец дня" onChange={(e) => setHours({ from, to: Math.max(Number(e.target.value), from + 4) })}>
          {Array.from({ length: 11 }, (_, i) => i + 14).map((h) => (
            <option key={h} value={h}>{`${String(h).padStart(2, '0')}:00`}</option>
          ))}
        </select>
      </div>
      <p className={s.sum}>
        Запланировано: <b>{fmtDuration(planned)}</b> · Свободно: <b>{fmtDuration(Math.max(0, total - planned))}</b>
      </p>

      {isToday && shiftPlan !== null && (
        <div className={s.shift}>
          {shiftPlan === 'overflow' ? (
            <span className={s.note}>Остаток дня не помещается до полуночи: сократите или уберите часть блоков.</span>
          ) : (
            <Button small onClick={shiftRestOfDay}>{`Сдвинуть остаток дня на ${fmtDuration(shiftPlan.delta)}`}</Button>
          )}
        </div>
      )}

      <div className={s.trayTitle}>Не на треке</div>
      <div className={s.tray}>
        {tray.map((t) => (
          <button key={t.id} type="button" className={s.chip} style={{ '--c': tagColor(t) } as React.CSSProperties} onClick={() => place(t)}>
            {t.title}
          </button>
        ))}
        <button type="button" className={s.chip} style={{ '--c': 'var(--c-habit)' } as React.CSSProperties} onClick={addRest}>
          <PixelIcon name="plus" size={12} /> Отдых
        </button>
      </div>

      <div
        ref={trackRef}
        className={s.track}
        style={{ height: total * PPM }}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onPointerDown={(e) => {
          if (e.target === e.currentTarget) setSel(null);
        }}
      >
        {lines.map((m) => (
          <div key={m} className={s.hour} style={{ top: (m - bounds.from) * PPM }}>
            <span>{fmtTime(m)}</span>
          </div>
        ))}
        {date === todayDate && nowMin >= bounds.from && nowMin <= bounds.to && <div className={s.now} style={{ top: (nowMin - bounds.from) * PPM }} />}
        {shown.map((p) => {
          const ref = byKey(p.key);
          if (!ref) return null;
          const parts = ref.task.track.length;
          return (
            <div
              key={p.key}
              className={cx(s.block, sel === p.key && s.sel, dragging?.key === p.key && s.drag, ref.task.done && s.done)}
              style={{ '--c': tagColor(ref.task), top: (p.start - bounds.from) * PPM, height: (p.end - p.start) * PPM } as React.CSSProperties}
              onPointerDown={(e) => onDown(e, p.key)}
            >
              <div className={cx(s.h, s.hTop)} data-h="top" />
              <div className={s.title}>{parts > 1 ? `${ref.task.title} (${String(ref.index + 1)}/${String(parts)})` : ref.task.title}</div>
              <div className={s.meta}>
                {fmtTime(p.start)}–{fmtTime(p.end)} · {fmtDuration(p.end - p.start)}
              </div>
              <div className={cx(s.h, s.hBottom)} data-h="bottom" />
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
