/*
 * Посредник между Telegram и сервером. С российского сервера Telegram недоступен, поэтому:
 *   /in/<ключ>   Telegram присылает сюда обновления, они уходят на наш сервер;
 *   /out/<ключ>/ наш сервер присылает сюда запросы к Bot API, они уходят в Telegram.
 * Ничего не хранит. Секреты Worker: RELAY_KEY и SERVER_URL.
 */
export default {
  async fetch(request, env) {
    const { pathname, search } = new URL(request.url);
    if (pathname === '/ping') return new Response('ok');
    // Без секретов путь /in/undefined совпал бы с «ключом»: пока они не заданы, посредник закрыт
    if (!env.RELAY_KEY || !env.SERVER_URL) return new Response('not configured', { status: 503 });
    if (pathname === `/in/${env.RELAY_KEY}` && request.method === 'POST') {
      const res = await fetch(`${env.SERVER_URL}/api/telegram/update`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-relay-key': env.RELAY_KEY },
        body: request.body,
      });
      return new Response(null, { status: res.ok ? 200 : 502 });
    }
    const out = `/out/${env.RELAY_KEY}/`;
    // Только вызовы Bot API (/bot<токен>/<метод>): посредник не должен быть проходом к остальному api.telegram.org
    if (pathname.startsWith(`${out}bot`)) {
      return fetch(`https://api.telegram.org/${pathname.slice(out.length)}${search}`, { method: request.method, headers: { 'content-type': request.headers.get('content-type') ?? 'application/json' }, body: request.body });
    }
    return new Response('not found', { status: 404 });
  },
};
