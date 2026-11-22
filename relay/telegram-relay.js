/*
 * Посредник между Telegram и сервером. С российского сервера Telegram недоступен, поэтому:
 *   /in/<ключ>   Telegram присылает сюда обновления, они уходят на наш сервер;
 *   /out/<ключ>/ наш сервер присылает сюда запросы к Bot API, они уходят в Telegram.
 *   /api/…       запасной вход в API приложения для тех, у кого сервер не открывается напрямую (часть VPN);
 *   /ai/<ключ>   наш сервер спрашивает нейросеть Workers AI (бесплатные модели Cloudflare) — для ввода фразами в боте
 *                и распознавания голосовых (Whisper).
 *   /out/<ключ>/file/bot… — скачивание файла из Telegram (голосовое сообщение) для нашего сервера.
 * Ничего не хранит. Секреты Worker: RELAY_KEY и SERVER_URL; привязка Workers AI — AI (wrangler.toml).
 */

/** Модели, которые можно звать через посредника: бесплатные и умеющие вызывать действия. */
const AI_MODELS = new Set(['@cf/openai/gpt-oss-20b', '@cf/meta/llama-3.3-70b-instruct-fp8-fast', '@cf/zai-org/glm-4.7-flash', '@cf/qwen/qwen3-30b-a3b-fp8', '@cf/openai/whisper-large-v3-turbo']);
/** Голосовое до ~2 минут в base64 — около 1,5 МБ. */
const AI_MAX_BODY = 3_000_000;

/** Какие заголовки приложения передаём серверу; остальное (куки, чужие служебные) отбрасываем. */
const PASS_HEADERS = ['authorization', 'content-type', 'origin', 'access-control-request-method', 'access-control-request-headers'];
/** Сравнение ключа за одинаковое время: по времени ответа нельзя подбирать его по символу. */
function sameKey(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export default {
  async fetch(request, env) {
    const { pathname, search } = new URL(request.url);
    if (pathname === '/ping') return new Response('ok');
    // Без секретов путь /in/undefined совпал бы с «ключом»: пока они не заданы, посредник закрыт
    if (!env.RELAY_KEY || !env.SERVER_URL) return new Response('not configured', { status: 503 });
    const [, head = '', key = '', ...rest] = pathname.split('/');
    const keyOk = sameKey(key, env.RELAY_KEY);
    if (head === 'in' && keyOk && rest.length === 0 && request.method === 'POST') {
      const res = await fetch(`${env.SERVER_URL}/api/telegram/update`, {
        method: 'POST',
        // Обновление бота помечаем своим заголовком: ветка /api/ ниже его не ставит никогда, поэтому подделать
        // обновление через запасной вход нельзя (x-relay-key оставлен на время перехода, пока сервер старый)
        headers: { 'content-type': 'application/json', 'x-relay-update': env.RELAY_KEY, 'x-relay-key': env.RELAY_KEY },
        body: request.body,
      });
      return new Response(null, { status: res.ok ? 200 : 502 });
    }
    if (head === 'ai' && keyOk && rest.length === 0 && request.method === 'POST') {
      if (!env.AI) return Response.json({ error: 'ai not bound' }, { status: 503 });
      const text = await request.text();
      if (text.length > AI_MAX_BODY) return Response.json({ error: 'too large' }, { status: 413 });
      let body;
      try {
        body = JSON.parse(text);
      } catch {
        return Response.json({ error: 'bad json' }, { status: 400 });
      }
      const { model, ...input } = body ?? {};
      if (!AI_MODELS.has(model)) return Response.json({ error: 'model not allowed' }, { status: 400 });
      try {
        return Response.json(await env.AI.run(model, input));
      } catch (e) {
        return Response.json({ error: String(e?.message ?? e).slice(0, 300) }, { status: 502 });
      }
    }
    if (pathname.startsWith('/api/')) {
      // «/api//telegram/update» обходил проверку ниже, а сервер выбрасывает пустые части пути: пустых частей не бывает
      if (pathname.includes('//')) return new Response('not found', { status: 404 });
      // Обновления бота принимаются только от Telegram по секретному пути выше, а не отсюда
      if (/^\/api\/telegram(\/|$)/i.test(pathname)) return new Response('not found', { status: 404 });
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
    const tail = rest.join('/');
    // Файл из Telegram (голосовое) — только чтение
    if (head === 'out' && keyOk && tail.startsWith('file/bot') && request.method === 'GET') {
      return fetch(`https://api.telegram.org/${tail}`);
    }
    // Только вызовы Bot API (/bot<токен>/<метод>): посредник не должен быть проходом к остальному api.telegram.org
    if (head === 'out' && keyOk && tail.startsWith('bot')) {
      return fetch(`https://api.telegram.org/${tail}${search}`, { method: request.method, headers: { 'content-type': request.headers.get('content-type') ?? 'application/json' }, body: request.body });
    }
    return new Response('not found', { status: 404 });
  },
};
