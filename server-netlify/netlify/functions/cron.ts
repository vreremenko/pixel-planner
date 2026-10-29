/* Раз в минуту просит API разослать наступившие push-напоминания */
export default async (): Promise<void> => {
  const base = process.env.URL ?? 'https://pp-api-83f524.netlify.app';
  const res = await fetch(new URL('/api/cron', base), { method: 'POST', headers: { 'x-cron-secret': process.env.CRON_SECRET ?? '' } });
  const text = await res.text();
  if (!res.ok || !text.includes('"sent":0')) console.log('cron:', res.status, text);
};

export const config = { schedule: '* * * * *' };
