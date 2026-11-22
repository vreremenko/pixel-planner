/** Пробовал ли человек помощника на этом устройстве — для пункта «Начала работы». */
export const ASSISTANT_TRIED_KEY = 'pp-assistant-tried';
export function markAssistantTried(): void {
  try {
    localStorage.setItem(ASSISTANT_TRIED_KEY, '1');
  } catch {
    // не страшно: пункт просто останется неотмеченным
  }
}

export function triedAssistant(): boolean {
  try {
    return localStorage.getItem(ASSISTANT_TRIED_KEY) === '1';
  } catch {
    return false;
  }
}
