import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { handle, type Deps } from './core.ts';
import { json, mk, register, req } from './test-helpers.ts';
import type { HttpReq } from './types.ts';

const HOST = 'pp.test';
const APP = 'https://app.test/pixel/';
const REDIRECT = 'https://chatgpt.test/oauth/callback';
const VERIFIER = 'verifier-verifier-verifier-verifier-verifier-123';
const CHALLENGE = createHash('sha256').update(VERIFIER).digest('base64url');

const at = (r: HttpReq, extra: Record<string, string> = {}): HttpReq => ({ ...r, headers: { ...r.headers, host: HOST, ...extra } });
const form = (body: Record<string, string>): HttpReq => at({ method: 'POST', path: 'oauth/token', query: {}, headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body).toString() });
const rpc = (token: string | undefined, method: string, params: unknown = {}, id: number | null = 1) =>
  at(req('POST', 'mcp', { token, body: id === null ? { jsonrpc: '2.0', method, params } : { jsonrpc: '2.0', id, method, params } }));

async function connect(d: Deps, session: string, clientId: string, state = 'xyz'): Promise<string> {
  const auth = await handle(at(req('GET', 'oauth/authorize', { query: { response_type: 'code', client_id: clientId, redirect_uri: REDIRECT, code_challenge: CHALLENGE, code_challenge_method: 'S256', state, scope: 'planner' } })), d);
  expect(auth.status).toBe(302);
  const loc = auth.headers.location ?? '';
  expect(loc.startsWith(`${APP}#/connect?r=`)).toBe(true);
  const id = loc.split('r=')[1] ?? '';
  const info = json(await handle(at(req('GET', `oauth/request/${id}`, { token: session })), d));
  expect(info).toEqual({ client: 'ChatGPT', redirectHost: 'chatgpt.test' });
  const ok = json(await handle(at(req('POST', 'oauth/approve', { token: session, body: { id, allow: true } })), d)) as { redirect: string };
  const u = new URL(ok.redirect);
  expect(u.origin + u.pathname).toBe(REDIRECT);
  expect(u.searchParams.get('state')).toBe(state);
  expect(u.searchParams.get('iss')).toBe(`https://${HOST}`);
  return u.searchParams.get('code') ?? '';
}

describe('MCP в интернете и вход через OAuth', () => {
  it('описания входа указывают на этот сервер, без ключа MCP отвечает 401 с адресом описания', async () => {
    const d = mk({ env: { APP_URL: APP } });
    const prm = json(await handle(at(req('GET', '.well-known/oauth-protected-resource/api/mcp')), d));
    expect(prm).toMatchObject({ resource: `https://${HOST}/api/mcp`, authorization_servers: [`https://${HOST}`] });
    const as = json(await handle(at(req('GET', '.well-known/oauth-authorization-server')), d));
    expect(as).toMatchObject({ issuer: `https://${HOST}`, token_endpoint: `https://${HOST}/api/oauth/token`, code_challenge_methods_supported: ['S256'] });
    const no = await handle(rpc(undefined, 'initialize'), d);
    expect(no.status).toBe(401);
    expect(no.headers['www-authenticate']).toContain(`resource_metadata="https://${HOST}/.well-known/oauth-protected-resource/api/mcp"`);
    const pre = await handle(at({ method: 'OPTIONS', path: 'mcp', query: {}, headers: { origin: 'https://chatgpt.com' }, body: '' }), d);
    expect(pre.headers['access-control-allow-origin']).toBe('*');
  });

  it('полный путь: регистрация, разрешение, ключи, действия, продление, отзыв', async () => {
    const d = mk({ env: { APP_URL: APP } });
    const session = await register(d, 'a@b.ru');
    const reg = await handle(at(req('POST', 'oauth/register', { body: { client_name: 'ChatGPT', redirect_uris: [REDIRECT] } })), d);
    expect(reg.status).toBe(201);
    const clientId = String(json(reg).client_id);

    // Код с неверной проверкой PKCE не меняется на ключи и после этого не действует
    const bad = await connect(d, session, clientId);
    expect(json(await handle(form({ grant_type: 'authorization_code', code: bad, code_verifier: 'x'.repeat(43), client_id: clientId, redirect_uri: REDIRECT }), d)).error).toBe('invalid_grant');
    expect(json(await handle(form({ grant_type: 'authorization_code', code: bad, code_verifier: VERIFIER, client_id: clientId, redirect_uri: REDIRECT }), d)).error).toBe('invalid_grant');

    const code = await connect(d, session, clientId);
    const tok = json(await handle(form({ grant_type: 'authorization_code', code, code_verifier: VERIFIER, client_id: clientId, redirect_uri: REDIRECT }), d)) as { access_token: string; refresh_token: string; token_type: string };
    expect(tok.token_type).toBe('Bearer');
    expect(tok.access_token.startsWith('ppk_')).toBe(true);
    // Повторно код не принимается
    expect(json(await handle(form({ grant_type: 'authorization_code', code, code_verifier: VERIFIER, client_id: clientId }), d)).error).toBe('invalid_grant');

    const init = json(await handle(rpc(tok.access_token, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } }), d)) as { result: { protocolVersion: string; serverInfo: { name: string } } };
    expect(init.result.protocolVersion).toBe('2025-06-18');
    expect((await handle(rpc(tok.access_token, 'notifications/initialized', {}, null), d)).status).toBe(202);
    const list = json(await handle(rpc(tok.access_token, 'tools/list'), d)) as { result: { tools: { name: string; annotations: { destructiveHint: boolean } }[] } };
    expect(list.result.tools.map((t) => t.name)).toContain('add_task');
    expect(list.result.tools.find((t) => t.name === 'delete_task')?.annotations.destructiveHint).toBe(true);

    const add = json(await handle(rpc(tok.access_token, 'tools/call', { name: 'add_task', arguments: { title: 'Позвонить маме', date: 'today' } }), d)) as { result: { content: { text: string }[]; isError?: boolean } };
    expect(add.result.isError).toBeUndefined();
    const day = json(await handle(rpc(tok.access_token, 'tools/call', { name: 'get_day', arguments: {} }), d)) as { result: { content: { text: string }[] } };
    expect(day.result.content[0]?.text).toContain('Позвонить маме');
    // Задача видна приложению через обычную синхронизацию
    expect((await handle(req('GET', 'sync', { token: session, query: { after: '0' } }), d)).body).toContain('Позвонить маме');
    const err = json(await handle(rpc(tok.access_token, 'tools/call', { name: 'mark_habit', arguments: { habit: 'Нет такой' } }), d)) as { result: { isError: boolean } };
    expect(err.result.isError).toBe(true);

    // Ключ нейросети не управляет аккаунтом и не разрешает доступ другим
    expect((await handle(at(req('POST', 'oauth/approve', { token: tok.access_token, body: { id: 'x', allow: true } })), d)).status).toBe(403);

    // Продление: новые ключи работают, старые — нет
    const ref = json(await handle(form({ grant_type: 'refresh_token', refresh_token: tok.refresh_token, client_id: clientId }), d)) as { access_token: string; refresh_token: string };
    expect((await handle(rpc(tok.access_token, 'ping'), d)).status).toBe(401);
    expect((await handle(rpc(ref.access_token, 'ping'), d)).status).toBe(200);
    expect(json(await handle(form({ grant_type: 'refresh_token', refresh_token: tok.refresh_token }), d)).error).toBe('invalid_grant');

    // Подключение видно в «Ключах доступа» и отзывается там же
    const keys = (json(await handle(req('GET', 'auth/keys', { token: session }), d)) as { keys: { id: string; name: string; oauth: boolean }[] }).keys;
    expect(keys).toEqual([expect.objectContaining({ name: 'ChatGPT', oauth: true })]);
    await handle(req('DELETE', `auth/keys/${keys[0]?.id ?? ''}`, { token: session }), d);
    expect((await handle(rpc(ref.access_token, 'ping'), d)).status).toBe(401);
  });

  it('отказ, чужой адрес возврата, без PKCE и опасные адреса при регистрации', async () => {
    const d = mk({ env: { APP_URL: APP } });
    const session = await register(d, 'a@b.ru');
    for (const uri of ['javascript:alert(1)', 'http://evil.test/cb', 'https://x.test/cb#frag']) {
      expect((await handle(at(req('POST', 'oauth/register', { body: { client_name: 'X', redirect_uris: [uri] } })), d)).status).toBe(400);
    }
    const clientId = String(json(await handle(at(req('POST', 'oauth/register', { body: { client_name: 'ChatGPT', redirect_uris: [REDIRECT, 'cursor://anysphere/cb'] } })), d)).client_id);
    const base = { response_type: 'code', client_id: clientId, code_challenge: CHALLENGE, code_challenge_method: 'S256', state: 's' };
    // На незарегистрированный адрес не уводим даже с ошибкой
    const foreign = await handle(at(req('GET', 'oauth/authorize', { query: { ...base, redirect_uri: 'https://evil.test/cb' } })), d);
    expect(foreign.status).toBe(400);
    expect(foreign.headers.location).toBeUndefined();
    const noPkce = await handle(at(req('GET', 'oauth/authorize', { query: { ...base, redirect_uri: REDIRECT, code_challenge_method: 'plain' } })), d);
    expect(noPkce.headers.location).toContain('error=invalid_request');
    const auth = await handle(at(req('GET', 'oauth/authorize', { query: { ...base, redirect_uri: REDIRECT } })), d);
    const id = (auth.headers.location ?? '').split('r=')[1] ?? '';
    expect((await handle(at(req('GET', `oauth/request/${id}`)), d)).status).toBe(401);
    const no = json(await handle(at(req('POST', 'oauth/approve', { token: session, body: { id, allow: false } })), d)) as { redirect: string };
    expect(no.redirect).toBe(`${REDIRECT}?error=access_denied&state=s`);
    // Запрос одноразовый
    expect((await handle(at(req('POST', 'oauth/approve', { token: session, body: { id, allow: true } })), d)).status).toBe(404);
  });
});
