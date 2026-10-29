import { describe, expect, it } from 'vitest';
import { parseQuickAdd, type QuickKind } from './quickAdd';

// 2026-10-29 — четверг
const T = '2026-10-29';
const p = (text: string, ignore: QuickKind[] = []) => parseQuickAdd(text, T, new Set(ignore));

describe('быстрый ввод: обычный текст', () => {
  it('без примет остаётся названием', () => {
    expect(p('Купить молоко')).toEqual({ title: 'Купить молоко', tags: [], found: [] });
  });
  it('слова, похожие на даты, внутри других слов не трогаем', () => {
    expect(p('Завтракать с Сашей').date).toBeUndefined();
    expect(p('Сегодняшний отчёт').date).toBeUndefined();
    expect(p('Прочитать про понедельники').date).toBeUndefined();
  });
  it('если после разбора названия не осталось, это обычный текст', () => {
    expect(p('завтра')).toEqual({ title: 'завтра', tags: [], found: [] });
    expect(p('#работа')).toEqual({ title: '#работа', tags: [], found: [] });
  });
  it('знаки по краям убираются', () => {
    expect(p('Позвонить, завтра').title).toBe('Позвонить');
  });
});

describe('быстрый ввод: дата', () => {
  it('сегодня / завтра / послезавтра', () => {
    expect(p('Дело сегодня').date).toBe('2026-10-29');
    expect(p('Дело завтра').date).toBe('2026-10-30');
    expect(p('Дело на завтра').title).toBe('Дело');
    expect(p('Дело послезавтра').date).toBe('2026-10-31');
  });
  it('через N дней / недель / месяц', () => {
    expect(p('Дело через 3 дня').date).toBe('2026-11-01');
    expect(p('Дело через неделю').date).toBe('2026-11-05');
    expect(p('Дело через 2 недели').date).toBe('2026-11-12');
    expect(p('Дело через месяц').date).toBe('2026-11-29');
    expect(p('Дело через день').date).toBeUndefined(); // «через день» двусмысленно
  });
  it('день недели — ближайший будущий, сегодняшний — через неделю', () => {
    expect(p('Дело в пятницу').date).toBe('2026-10-30');
    expect(p('Дело во вторник').date).toBe('2026-11-03');
    expect(p('Дело в четверг').date).toBe('2026-11-05');
    expect(p('Дело в воскресенье').title).toBe('Дело');
  });
  it('число и месяц: в этом году или в следующем, если уже прошло', () => {
    expect(p('Дело 15 ноября').date).toBe('2026-11-15');
    expect(p('Дело 5 октября').date).toBe('2027-10-05');
    expect(p('Дело 29 октября').date).toBe('2026-10-29');
    expect(p('Дело 1 мая 2028').date).toBe('2028-05-01');
    expect(p('Дело 31 ноября').date).toBeUndefined();
  });
  it('числовая дата; десятичные числа датами не считаются', () => {
    expect(p('Дело 15.11').date).toBe('2026-11-15');
    expect(p('Дело 15.11.2027').date).toBe('2027-11-15');
    expect(p('Дело 01.02.27').date).toBe('2027-02-01');
    expect(p('Купить 1.5 кг муки').date).toBeUndefined();
    expect(p('Заплатить 2.50 рубля').date).toBeUndefined();
  });
});

describe('быстрый ввод: время', () => {
  it('часы и минуты', () => {
    expect(p('Дело в 15:00')).toMatchObject({ title: 'Дело', time: '15:00' });
    expect(p('Дело 9:30').time).toBe('09:30');
    expect(p('Дело в 25:00').time).toBeUndefined();
    expect(p('Дело в 12:75').time).toBeUndefined();
  });
  it('с частью суток', () => {
    expect(p('Дело в 9 утра').time).toBe('09:00');
    expect(p('Дело в 7 вечера').time).toBe('19:00');
    expect(p('Дело в 2 дня').time).toBe('14:00');
    expect(p('Дело в 12 дня').time).toBe('12:00');
    expect(p('Дело в 12 ночи').time).toBe('00:00');
    expect(p('Дело в 11 ночи').time).toBe('23:00');
    expect(p('Дело в 7:30 вечера').time).toBe('19:30');
  });
  it('«в 9» — только когда это явно время', () => {
    expect(p('Позвонить завтра в 9')).toMatchObject({ title: 'Позвонить', time: '09:00', date: '2026-10-30' });
    expect(p('Позвонить в 9 завтра')).toMatchObject({ title: 'Позвонить', time: '09:00' });
    expect(p('Позвонить в 9 #работа')).toMatchObject({ time: '09:00', tags: ['работа'] });
    expect(p('Купить в 5 магазинах').time).toBeUndefined();
    expect(p('Купить в 5 магазинах').title).toBe('Купить в 5 магазинах');
    expect(p('Дело в 30').time).toBeUndefined();
  });
});

describe('быстрый ввод: приоритет и метки', () => {
  it('приоритет', () => {
    expect(p('Дело !').priority).toBe('high');
    expect(p('Дело !!').priority).toBe('high');
    expect(p('Дело !высокий').priority).toBe('high');
    expect(p('Дело !средний').priority).toBe('medium');
    expect(p('Дело !низкий').priority).toBe('low');
    expect(p('Дело !').title).toBe('Дело');
  });
  it('восклицательный знак в конце слова — не приоритет', () => {
    expect(p('Срочно!').priority).toBeUndefined();
    expect(p('Позвонить маме!').title).toBe('Позвонить маме!');
  });
  it('метки: нижний регистр, без дублей, с дефисом и цифрами', () => {
    expect(p('Дело #Работа #дом #работа #to-do2')).toMatchObject({ title: 'Дело', tags: ['работа', 'дом', 'to-do2'] });
    expect(p('Купить C# книгу').tags).toEqual([]); // «#» внутри слова — не метка
  });
});

describe('быстрый ввод: напоминание', () => {
  it('напомни за N — только со временем', () => {
    expect(p('Созвон в 10:00 напомни за 15 минут')).toMatchObject({ title: 'Созвон', time: '10:00', reminder: 15 });
    expect(p('Созвон в 10:00 напомнить за час').reminder).toBe(60);
    expect(p('Созвон в 10:00 напомни за 30 мин').reminder).toBe(30);
    expect(p('Созвон в 10:00 напомни за 1 час').reminder).toBe(60);
  });
  it('недопустимое значение и отсутствие времени — текст остаётся в названии', () => {
    expect(p('Созвон в 10:00 напомни за 7 минут').reminder).toBeUndefined();
    expect(p('Созвон в 10:00 напомни за 7 минут').title).toBe('Созвон напомни за 7 минут');
    expect(p('Созвон напомни за 15 минут')).toMatchObject({ title: 'Созвон напомни за 15 минут', found: [] });
  });
  it('глагол «напомнить» без «за» не трогаем', () => {
    expect(p('Напомнить маме позвонить').title).toBe('Напомнить маме позвонить');
  });
});

describe('быстрый ввод: повтор', () => {
  it('каждый день / по будням / ежедневно', () => {
    expect(p('Зарядка каждый день').repeat?.pattern).toEqual({ freq: 'daily' });
    expect(p('Зарядка ежедневно').repeat?.pattern).toEqual({ freq: 'daily' });
    expect(p('Отчёт по будням').repeat?.pattern).toEqual({ freq: 'weekdays' });
    expect(p('Зарядка каждый день').title).toBe('Зарядка');
  });
  it('каждый понедельник — это повтор, а не дата', () => {
    const r = p('Планёрка каждый понедельник');
    expect(r.repeat?.pattern).toEqual({ freq: 'weekly', days: [0] });
    expect(r.date).toBeUndefined();
    expect(p('Йога каждую среду').repeat?.pattern).toEqual({ freq: 'weekly', days: [2] });
  });
  it('каждые N дней', () => {
    expect(p('Полив каждые 3 дня').repeat?.pattern).toEqual({ freq: 'interval', everyDays: 3 });
    expect(p('Полив каждые 1 день').repeat?.pattern).toEqual({ freq: 'daily' });
  });
  it('каждую неделю / каждый месяц берут день от даты начала', () => {
    expect(p('Отчёт каждую неделю в пятницу').repeat?.pattern).toEqual({ freq: 'weekly', days: [4] });
    expect(p('Отчёт каждый месяц 15 ноября').repeat?.pattern).toEqual({ freq: 'monthly', monthDay: 15 });
    expect(p('Отчёт каждый месяц').repeat?.pattern).toEqual({ freq: 'monthly', monthDay: 29 });
  });
});

describe('быстрый ввод: всё вместе и отключение частей', () => {
  it('все признаки в одной строке', () => {
    expect(p('Зарядка каждый день в 7:30 #здоровье !')).toMatchObject({
      title: 'Зарядка',
      time: '07:30',
      tags: ['здоровье'],
      priority: 'high',
      repeat: { pattern: { freq: 'daily' } },
      found: expect.arrayContaining(['repeat', 'time', 'priority']) as QuickKind[],
    });
  });
  it('отключённая часть остаётся в названии', () => {
    expect(p('Купить хлеб в 9', ['time'])).toMatchObject({ title: 'Купить хлеб в 9', found: [] });
    expect(p('Дело завтра !', ['date']).title).toBe('Дело завтра');
    expect(p('Дело завтра !', ['date']).priority).toBe('high');
    expect(p('Зарядка каждый день', ['repeat']).repeat).toBeUndefined();
  });
});
