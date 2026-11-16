/*
 * Посредник между Telegram и сервером. С российского сервера Telegram недоступен, поэтому:
 *   /in/<ключ>   Telegram присылает сюда обновления, они уходят на наш сервер;
 *   /out/<ключ>/ наш сервер присылает сюда запросы к Bot API, они уходят в Telegram.
 *   /api/…       запасной вход в API приложения для тех, у кого сервер не открывается напрямую (часть VPN).
 * Ничего не хранит. Секреты Worker: RELAY_KEY и SERVER_URL.
 */

/** Какие заголовки приложения передаём серверу; остальное (куки, чужие служебные) отбрасываем. */
const PASS_HEADERS = ['authorization', 'content-type', 'origin', 'access-control-request-method', 'access-control-request-headers'];
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
    if (pathname.startsWith('/api/')) {
      // Обновления бота принимаются только от Telegram по секретному пути выше, а не отсюда
      if (pathname.startsWith('/api/telegram/')) return new Response('not found', { status: 404 });
      const headers = new Headers();
      for (const h of PASS_HEADERS) {
        const v = request.headers.get(h);
        if (v) headers.set(h, v);
      }
      // Ключ подтверждает серверу, что адрес клиента настоящий: по нему считаются ограничения попыток входа
      headers.set('x-relay-key', env.RELAY_KEY);
      headers.set('x-client-ip', request.headers.get('cf-connecting-ip') ?? '');
      headers.set('user-agent', 'PixelPlanner-relay');
      const res = await fetch(`${env.SERVER_URL}${pathname}${search}`, {
        method: request.method,
        headers,
        body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
        redirect: 'manual',
      });
      return new Response(res.body, { status: res.status, headers: res.headers });
    }
    const out = `/out/${env.RELAY_KEY}/`;
    // Только вызовы Bot API (/bot<токен>/<метод>): посредник не должен быть проходом к остальному api.telegram.org
    if (pathname.startsWith(`${out}bot`)) {
      return fetch(`https://api.telegram.org/${pathname.slice(out.length)}${search}`, { method: request.method, headers: { 'content-type': request.headers.get('content-type') ?? 'application/json' }, body: request.body });
    }
    return new Response('not found', { status: 404 });
  },
};
