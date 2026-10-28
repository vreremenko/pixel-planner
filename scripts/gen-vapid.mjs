// Генерирует пару VAPID-ключей. Запуск: node scripts/gen-vapid.mjs
// Публичный ключ — в wrangler.jsonc (vars.VAPID_PUBLIC_KEY), приватный — `npx wrangler secret put VAPID_PRIVATE_KEY`.
const { publicKey, privateKey } = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']);
const raw = new Uint8Array(await crypto.subtle.exportKey('raw', publicKey));
const jwk = await crypto.subtle.exportKey('jwk', privateKey);
const b64url = (u8) => Buffer.from(u8).toString('base64url');
console.log(`VAPID_PUBLIC_KEY=${b64url(raw)}`);
console.log(`VAPID_PRIVATE_KEY=${jwk.d}`);
