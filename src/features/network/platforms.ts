import type { ProbeTarget } from './probe';

/**
 * Зарубежные хостинги, куда можно было бы вынести сервер вместо Cloudflare.
 * Проверяем адрес, на который платформа отвечает всегда (даже «приложение не найдено», 404):
 * любой HTTP-ответ значит, что до сервера платформы с этого устройства можно достучаться.
 */
export const PLATFORMS: ProbeTarget[] = [
  { id: 'p-render', label: 'Render', url: 'https://pp-probe.onrender.com/' },
  { id: 'p-railway', label: 'Railway', url: 'https://pp-probe.up.railway.app/' },
  { id: 'p-koyeb', label: 'Koyeb', url: 'https://pp-probe.koyeb.app/' },
  { id: 'p-fly', label: 'Fly.io (API)', url: 'https://api.fly.io/' },
  { id: 'p-vercel', label: 'Vercel', url: 'https://pp-probe.vercel.app/' },
  { id: 'p-netlify', label: 'Netlify', url: 'https://pp-probe.netlify.app/' },
  { id: 'p-netlify-fn', label: 'Netlify Functions', url: 'https://pp-probe.netlify.app/.netlify/functions/x' },
  { id: 'p-deno', label: 'Deno Deploy (старые адреса deno.dev)', url: 'https://pp-probe.deno.dev/' },
  { id: 'p-deno-net', label: 'Deno Deploy (новые адреса deno.net)', url: 'https://pp-probe.deno.net/' },
  { id: 'p-deno-console', label: 'Deno Deploy (консоль и API)', url: 'https://api.deno.com/' },
  { id: 'p-firebase', label: 'Firebase Hosting', url: 'https://pp-probe.web.app/' },
  { id: 'p-cloudrun', label: 'Google Cloud Run', url: 'https://run.app/' },
  { id: 'p-heroku', label: 'Heroku', url: 'https://pp-probe.herokuapp.com/' },
  { id: 'p-zeabur', label: 'Zeabur', url: 'https://pp-probe.zeabur.app/' },
  { id: 'p-valtown', label: 'Val Town', url: 'https://pp-probe.val.run/' },
  { id: 'p-replit', label: 'Replit', url: 'https://pp-probe.replit.app/' },
  { id: 'p-appwrite', label: 'Appwrite Sites', url: 'https://pp-probe.appwrite.global/' },
  { id: 'p-appwrite-api', label: 'Appwrite Cloud (API)', url: 'https://cloud.appwrite.io/v1/health' },
  { id: 'p-lambda', label: 'AWS Lambda (ссылка функции)', url: 'https://pp-probe.lambda-url.us-east-1.on.aws/' },
  { id: 'p-supabase', label: 'Supabase (API)', url: 'https://api.supabase.com/' },
  { id: 'p-neon', label: 'Neon (база)', url: 'https://neon.tech/' },
  { id: 'p-upstash', label: 'Upstash (Redis)', url: 'https://upstash.com/' },
  { id: 'p-turso', label: 'Turso (база)', url: 'https://pp-probe.turso.io/' },
  { id: 'p-ghapi', label: 'GitHub API', url: 'https://api.github.com/zen' },
];
