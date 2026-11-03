import { useMemo, useRef, useState } from 'react';
import s from './Track.module.css';
import { Button, Modal, PixelIcon, cx } from '../../../core/ui';
import { useDay } from '../data/hooks';
import { createRestOnTrack, setTaskTrack } from '../services/tasks';
import { useTrackHours } from '../stores/trackHours';
import { STEP, canSplit, drag, fmtDuration, fmtTime, freeSlot, split, type DragMode, type Placed, type TrackBlock } from '../domain/track';
import type { LocalDate } from '../../../core/domain/types';
import type { Task } from '../domain/types';

/** Высота одного часа на треке, px. */
const PX_PER_HOUR = 56;
const PPM = PX_PER_HOUR / 60;

const PALETTE = ['var(--c-task)', 'var(--c-backlog)', 'var(--c-gym)', 'var(--c-gold)', 'var(--c-warn)', 'var(--c-food)'];
/** Цвет блока по первой метке: «отдых» всегда зелёный, остальные — по устойчивому хэшу названия. */
function tagColor(task: Task): string {
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
  const bounds = useMemo(() => ({ from: from * 60, to: to * 60 }), [from, to]);
  const [sel, setSel] = useState<string | null>(null);
  const [dragging, setDragging] = useState<Dragging | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  const tasks = useMemo(() => [...(data?.tasks ?? [])].sort((a, b) => a.order - b.order), [data]);
  const placed = useMemo<Placed[]>(() => tasks.flatMap((t) => (t.track ?? []).map((b, i) => ({ key: `${t.id}:${String(i)}`, start: b.start, end: b.end }))), [tasks]);
  const shown = placed.map((p) => (dragging?.key === p.key ? { ...p, ...dragging.now } : p));
  const byKey = (key: string) => {
    const [id, i] = key.split(':');
    const task = tasks.find((t) => t.id === id);
    return task ? { task, index: Number(i) } : null;
  };

  const write = (task: Task, blocks: TrackBlock[]) => void setTaskTrack(task, blocks.sort((a, b) => a.start - b.start));
  const patch = (key: string, next: TrackBlock) => {
    const ref = byKey(key);
    if (!ref) return;
    const blocks = [...(ref.task.track ?? [])];
    blocks[ref.index] = next;
    write(ref.task, blocks);
  };

  const tray = tasks.filter((t) => !t.done && !(t.track && t.track.length > 0));
  const place = (task: Task) => {
    const len = 60;
    const after = sel ? (placed.find((p) => p.key === sel)?.end ?? 0) : 0;
    const at = freeSlot(placed, len, after, bounds) ?? freeSlot(placed, len, 0, bounds);
    if (at === null) return;
    write(task, [{ start: at, end: at + len }]);
  };
  const addRest = () => {
    const after = sel ? (placed.find((p) => p.key === sel)?.end ?? 0) : 0;
    const at = freeSlot(placed, 30, after, bounds) ?? freeSlot(placed, 30, 0, bounds);
    if (at !== null) void createRestOnTrack(date, { start: at, end: at + 30 });
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
    const blocks = [...(ref.task.track ?? [])];
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

  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
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
      {data && data.occurrences.length > 0 && <p className={s.note}>Повторяющиеся задачи пока не ставятся на трек.</p>}

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
          const parts = (ref.task.track ?? []).length;
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
