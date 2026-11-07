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
    if (pathname === `/in/${env.RELAY_KEY}` && request.method === 'POST') {
      const res = await fetch(`${env.SERVER_URL}/api/telegram/update`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-relay-key': env.RELAY_KEY },
        body: request.body,
      });
      return new Response(null, { status: res.ok ? 200 : 502 });
    }
    const out = `/out/${env.RELAY_KEY}/`;
    if (pathname.startsWith(out)) {
      return fetch(`https://api.telegram.org/${pathname.slice(out.length)}${search}`, { method: request.method, headers: { 'content-type': request.headers.get('content-type') ?? 'application/json' }, body: request.body });
    }
    return new Response('not found', { status: 404 });
  },
};
