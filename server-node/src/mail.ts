/* Отправка писем через SMTP. Без настроек письма не отправляются, а запросы к ним получают понятный отказ. */
import { createTransport } from 'nodemailer';

export type SendMail = (to: string, subject: string, text: string) => Promise<void>;

export interface MailEnv {
  SMTP_HOST?: string;
  SMTP_PORT?: string;
  SMTP_USER?: string;
  SMTP_PASS?: string;
  /** Только для разработки: писать письма в консоль вместо отправки. */
  MAIL_TO_CONSOLE?: string;
}

export function createMailer(env: MailEnv): SendMail | undefined {
  if (env.MAIL_TO_CONSOLE) {
    return (to, subject, text) => {
      console.log(`письмо для ${to}: ${subject}\n${text}`);
      return Promise.resolve();
    };
  }
  const { SMTP_USER: user, SMTP_PASS: pass } = env;
  if (!user || !pass) return undefined;
  const port = Number(env.SMTP_PORT ?? 465);
  const transport = createTransport({ host: env.SMTP_HOST ?? 'smtp.mail.ru', port, secure: port === 465, auth: { user, pass } });
  return async (to, subject, text) => {
    await transport.sendMail({ from: `PIXEL PLANNER <${user}>`, to, subject, text });
  };
}
