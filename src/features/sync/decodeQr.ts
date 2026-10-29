import jsQR from 'jsqr';

/** Найти QR-код на фотографии (запасной путь, когда живая камера не включается). Возвращает текст или null. */
export async function decodeQrFromFile(file: File): Promise<string | null> {
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    // Фото с телефона огромные: пробуем несколько размеров, на разных масштабах код находится по-разному
    for (const max of [1200, 800, 1800]) {
      const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'attemptBoth' });
      if (code?.data) return code.data;
    }
    return null;
  } finally {
    bitmap.close();
  }
}
