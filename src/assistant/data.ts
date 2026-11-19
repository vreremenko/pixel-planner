/*
 * Данные аккаунта для помощника: те же записи, что синхронизирует приложение, разложенные по таблицам.
 * Не зависит ни от браузера, ни от сервера: им пользуются MCP сейчас, а потом бот с нейронкой и микрофон в приложении.
 */
import type { SyncMeta } from '../core/domain/types';

/** Запись синхронизации, как её отдаёт и принимает сервер. */
export interface WireRecord {
  t: string;
  id: string;
  u: number;
  d: string;
}

export class AccountData {
  private readonly tables = new Map<string, Map<string, SyncMeta>>();
  private readonly changed = new Map<string, { table: string; row: SyncMeta }>();

  constructor(records: readonly WireRecord[]) {
    for (const r of records) {
      try {
        this.table(r.t).set(r.id, JSON.parse(r.d) as SyncMeta);
      } catch {
        // повреждённую запись пропускаем
      }
    }
  }

  private table(name: string): Map<string, SyncMeta> {
    let t = this.tables.get(name);
    if (!t) {
      t = new Map();
      this.tables.set(name, t);
    }
    return t;
  }

  /** Все записи таблицы, включая удалённые (с deletedAt). */
  allWithDeleted<T extends SyncMeta>(name: string): T[] {
    return [...this.table(name).values()] as T[];
  }

  /** Живые (не удалённые) записи таблицы. */
  all<T extends SyncMeta>(name: string): T[] {
    return [...this.table(name).values()].filter((r) => !r.deletedAt) as T[];
  }

  // Тип строки задаёт вызывающий: таблица хранит записи разных разделов
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
  get<T extends SyncMeta>(name: string, id: string): T | undefined {
    return this.all<T>(name).find((r) => r.id === id);
  }

  /** Записать строку; она уйдёт на сервер вместе с остальными изменениями. */
  put<T extends SyncMeta>(name: string, row: T): T {
    this.table(name).set(row.id, row);
    this.changed.set(`${name}|${row.id}`, { table: name, row });
    return row;
  }

  /** Изменения в виде записей синхронизации. */
  changes(): WireRecord[] {
    return [...this.changed.values()].map(({ table, row }) => ({ t: table, id: row.id, u: row.updatedAt, d: JSON.stringify(row) }));
  }
}
