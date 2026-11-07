/* Внутри Telegram: кнопка «Назад» в шапке и цвета под тему приложения. Вне Telegram ничего не делает. */
import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useSettings } from '../stores/settings';
import { inTelegram, telegramBackButton, telegramReady } from './webapp';

export function TelegramBridge() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const mom = useSettings((s) => s.settings.momMode);
  useEffect(() => {
    telegramReady();
  }, [mom]);
  useEffect(() => {
    if (inTelegram()) telegramBackButton(pathname !== '/', () => void navigate(-1));
  }, [pathname, navigate]);
  return null;
}
