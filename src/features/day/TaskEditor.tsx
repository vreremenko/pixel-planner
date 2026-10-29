import { useEffect, useState, type SyntheticEvent } from 'react';
import { Button, Field, Modal, MultiToggle, Segmented, TextInput, inputClass, toast } from '../../ui';
import { useUi, type EditorTarget } from '../../stores/ui';
import { today } from '../../domain/dates';
import { type ChecklistItem, type LocalDate, type Priority, type ReminderOffset } from '../../domain/types';
import {
  createTask,
  deleteOccurrence,
  deleteTask,
  editOccurrence,
  skipOccurrence,
  updateTask,
  type EditScope,
  type TaskDraft,
} from '../../services/tasks';
import { seriesRepo } from '../../data/repo';
import { RecurrenceEditor, type RepeatValue } from '../recurring/RecurrenceEditor';
import { ChecklistEditor } from './ChecklistEditor';
import { ReminderList } from './ReminderList';
import { EditScopeDialog } from '../recurring/EditScopeDialog';
import { describeRule } from '../../domain/recurrence';
import { parseTagInput } from '../../domain/tags';
import { remindersOf } from '../../domain/reminderSpecs';
import { useTagCounts } from '../../data/hooks';
import { PRIORITY_LABEL } from './labels';
import { fs } from '../../ui/fs';

const PRIORITIES: { value: Priority; label: string }[] = (['low', 'medium', 'high'] as const).map((p) => ({
  value: p,
  label: PRIORITY_LABEL[p],
}));

type Extra = 'notes' | 'checklist';
const EXTRA_OPTIONS: { value: Extra; label: string }[] = [
  { value: 'notes', label: 'Заметки' },
  { value: 'checklist', label: 'Чек-лист' },
];

interface FormState {
  title: string;
  notes: string;
  /** Какие дополнительные блоки включены; выключенный блок при сохранении не записывается. */
  extras: Extra[];
  checklist: ChecklistItem[];
  inBacklog: boolean;
  date: LocalDate;
  time: string;
  priority: Priority;
  reminders: ReminderOffset[];
  tags: string;
  repeat: RepeatValue | undefined;
}

function initial(t: EditorTarget): FormState {
  if (t.kind === 'new') {
    // У новой задачи сразу открыта вкладка «Заметки»; пустая заметка при сохранении не записывается
    return {
      title: '', notes: '', extras: ['notes'], checklist: [], inBacklog: t.date === null, date: t.date ?? today(), time: '',
      priority: 'medium', reminders: [], tags: '', repeat: undefined,
    };
  }
  const src = t.kind === 'task' ? t.task : t.occ;
  const checklist = src.checklist ?? [];
  return {
    title: src.title,
    notes: src.notes ?? '',
    checklist,
    extras: [...(src.notes ? (['notes'] as const) : []), ...(checklist.length > 0 ? (['checklist'] as const) : [])],
    inBacklog: t.kind === 'task' && t.task.date === null,
    date: (t.kind === 'task' ? t.task.date : t.occ.date) ?? today(),
    time: src.time ?? '',
    priority: src.priority,
    reminders: remindersOf(src).map((r) => r.offsetMin),
    tags: src.tags.join(', '),
    repeat: undefined,
  };
}

function toDraft(f: FormState): TaskDraft {
  const d: TaskDraft = {
    title: f.title.trim(),
    date: f.inBacklog ? null : f.date,
    priority: f.priority,
    tags: parseTagInput(f.tags),
  };
  if (f.extras.includes('notes') && f.notes.trim()) d.notes = f.notes.trim();
  if (f.extras.includes('checklist') && f.checklist.length > 0) d.checklist = f.checklist;
  if (f.time) d.time = f.time;
  if (f.time && f.reminders.length > 0) d.reminders = f.reminders.map((offsetMin) => ({ offsetMin }));
  if (f.repeat && !f.inBacklog) d.repeat = f.repeat;
  return d;
}

function EditorBody({ target, onDone }: { target: EditorTarget; onDone: () => void }) {
  const [f, setF] = useState<FormState>(() => initial(target));
  const [scopeFor, setScopeFor] = useState<'edit' | 'delete' | null>(null);
  const [ruleText, setRuleText] = useState<string | null>(null);
  const isOcc = target.kind === 'occurrence';
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((p) => ({ ...p, [k]: v }));
  // Подсказки: самые используемые метки, которых в этой задаче ещё нет
  const tagCounts = useTagCounts();
  const chosen = parseTagInput(f.tags);
  const suggestions = tagCounts.filter((c) => !chosen.includes(c.tag)).slice(0, 10);
  const setExtras = (extras: Extra[]) =>
    setF((p) => ({
      ...p,
      extras,
      // Включили чек-лист — сразу даём пустой пункт, чтобы было куда печатать
      checklist: extras.includes('checklist') && p.checklist.length === 0 ? [{ id: crypto.randomUUID(), text: '', done: false }] : p.checklist,
    }));

  useEffect(() => {
    if (target.kind !== 'occurrence') return;
    void seriesRepo.get(target.occ.seriesId).then((s) => {
      if (!s) return;
      setRuleText(describeRule(s.rule));
      const { start: _s, end, ...pattern } = s.rule;
      setF((p) => ({ ...p, repeat: { pattern, end } }));
    });
  }, [target]);

  const invalid =
    !f.title.trim() || (f.repeat?.pattern.freq === 'weekly' && f.repeat.pattern.days.length === 0);

  const save = async (scope?: EditScope) => {
    const draft = toDraft(f);
    if (target.kind === 'new') {
      await createTask(draft);
      toast(draft.repeat ? 'Повторяющаяся задача создана' : draft.date ? 'Задача добавлена' : 'Добавлено в инвентарь', 'plus', 'var(--c-task)');
    } else if (target.kind === 'task') {
      await updateTask(target.task, draft);
    } else {
      if (!scope) return setScopeFor('edit');
      // «Только эта» — правила не меняем
      if (scope === 'this') delete draft.repeat;
      await editOccurrence(target.occ, draft, scope);
    }
    onDone();
  };

  const remove = async (scope?: EditScope) => {
    if (target.kind === 'task') await deleteTask(target.task.id);
    else if (target.kind === 'occurrence') {
      if (!scope) return setScopeFor('delete');
      await deleteOccurrence(target.occ, scope);
    }
    toast('Удалено', 'trash', 'var(--c-warn)');
    onDone();
  };

  const onSubmit = (e: SyntheticEvent) => {
    e.preventDefault();
    if (!invalid) void save();
  };

  return (
    <form onSubmit={onSubmit}>
      <TextInput label="Название" value={f.title} data-autofocus={f.title.trim() === '' ? true : undefined} required maxLength={200} onChange={(e) => set('title', e.target.value)} placeholder="Победить босса…" />
      {!isOcc && (
        <Field label="Где">
          <Segmented
            label="Где лежит задача"
            value={f.inBacklog ? 'backlog' : 'day'}
            options={[
              { value: 'day', label: 'На дату' },
              { value: 'backlog', label: 'В инвентарь' },
            ]}
            onChange={(v) => set('inBacklog', v === 'backlog')}
          />
        </Field>
      )}
      {!f.inBacklog && (
        <div style={{ display: 'grid', gridTemplateColumns: 'var(--cols-2, 1fr 1fr)', gap: 12 }}>
          <TextInput label="Дата" type="date" value={f.date} onChange={(e) => e.target.value && set('date', e.target.value)} />
          <TextInput label="Время" type="time" value={f.time} onChange={(e) => set('time', e.target.value)} />
        </div>
      )}
      <Field label="Приоритет">
        <Segmented label="Приоритет" value={f.priority} options={PRIORITIES} onChange={(v) => set('priority', v)} />
      </Field>
      {!f.inBacklog && <ReminderList value={f.reminders} onChange={(v) => set('reminders', v)} disabled={!f.time} />}
      <TextInput label="Метки через запятую" value={f.tags} onChange={(e) => set('tags', e.target.value)} placeholder="работа, дом" />
      {suggestions.length > 0 && (
        <div role="group" aria-label="Уже используемые метки" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '-6px 0 12px' }}>
          {suggestions.map(({ tag, count }) => (
            <button
              key={tag}
              type="button"
              title={`Добавить метку (использована ${String(count)} раз)`}
              onClick={() => set('tags', [...parseTagInput(f.tags), tag].join(', '))}
              style={{ minHeight: 28, padding: '0 8px', border: '2px dashed var(--c-backlog)', background: 'transparent', color: 'var(--c-backlog)', font: 'inherit', fontSize: fs(16), cursor: 'pointer' }}
            >
              + #{tag}
            </button>
          ))}
        </div>
      )}
      <Field label="Добавить к задаче">
        <MultiToggle label="Заметки и чек-лист" values={f.extras} options={EXTRA_OPTIONS} onChange={setExtras} />
      </Field>
      {f.extras.includes('notes') && (
        <Field label="Заметки">
          <textarea className={inputClass} rows={3} value={f.notes} onChange={(e) => set('notes', e.target.value)} />
        </Field>
      )}
      {f.extras.includes('checklist') && <ChecklistEditor items={f.checklist} onChange={(items) => set('checklist', items)} />}
      {!f.inBacklog && (target.kind !== 'occurrence' || f.repeat) && (
        <>
          {ruleText && <p style={{ margin: '0 0 8px', color: 'var(--c-text-dim)' }}>Сейчас: {ruleText}. Изменение правила применяется к «этой и следующим».</p>}
          <RecurrenceEditor value={f.repeat} onChange={(v) => set('repeat', v)} start={f.date} />
        </>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
        {target.kind !== 'new' && (
          <Button variant="danger" icon="trash" onClick={() => void remove()}>
            Удалить
          </Button>
        )}
        {target.kind === 'occurrence' && target.occ.status !== 'done' && (
          <Button
            icon="skip"
            onClick={() => {
              void skipOccurrence(target.occ).then(onDone);
            }}
          >
            Пропустить
          </Button>
        )}
        <span style={{ flex: 1 }} />
        <Button onClick={onDone}>Отмена</Button>
        <Button type="submit" variant="primary" icon="check" disabled={invalid}>
          Сохранить
        </Button>
      </div>
      <EditScopeDialog
        open={scopeFor !== null}
        action={scopeFor ?? 'edit'}
        onClose={() => setScopeFor(null)}
        onPick={(scope) => {
          const act = scopeFor;
          setScopeFor(null);
          void (act === 'delete' ? remove(scope) : save(scope));
        }}
      />
    </form>
  );
}

export function TaskEditor() {
  const editor = useUi((st) => st.editor);
  const close = useUi((st) => st.closeEditor);
  const title = !editor ? '' : editor.kind === 'new' ? 'Новая задача' : 'Задача';
  return (
    <Modal open={editor !== null} onClose={close} title={title} accent="var(--c-task)">
      {editor && <EditorBody key={JSON.stringify(editor)} target={editor} onDone={close} />}
    </Modal>
  );
}
