"""Генерирует пиксельные PNG-иконки PWA (без зависимостей). Запуск: python3 scripts/make-icons.py"""
import struct, zlib, os

BG = (11, 10, 26)
CY = (41, 230, 255)
MG = (255, 79, 168)
YL = (255, 210, 63)

# 16×16: календарь-«картридж» с галочкой
ART = [
    "................",
    "...M........M...",
    "..CCCCCCCCCCCC..",
    "..CCCCCCCCCCCC..",
    "..C..........C..",
    "..C.........YC..",
    "..C........YYC..",
    "..C.Y.....YY.C..",
    "..C.YY...YY..C..",
    "..C..YY.YY...C..",
    "..C...YYY....C..",
    "..C....Y.....C..",
    "..C..........C..",
    "..CCCCCCCCCCCC..",
    "................",
    "................",
]
COL = {"C": CY, "M": MG, "Y": YL}

def png(path, size, pad_frac):
    inner = int(size * (1 - 2 * pad_frac))
    scale = inner // 16
    off = (size - 16 * scale) // 2
    rows = []
    for y in range(size):
        row = bytearray([0])
        for x in range(size):
            ax, ay = (x - off) // scale, (y - off) // scale
            c = BG
            if 0 <= ax < 16 and 0 <= ay < 16 and x >= off and y >= off:
                c = COL.get(ART[ay][ax], BG)
            row += bytes(c)
        rows.append(bytes(row))
    raw = zlib.compress(b"".join(rows), 9)
    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
    data = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)) + chunk(b"IDAT", raw) + chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(data)

os.makedirs("public/icons", exist_ok=True)
png("public/icons/icon-192.png", 192, 0.0)
png("public/icons/icon-512.png", 512, 0.0)
png("public/icons/icon-maskable-512.png", 512, 0.12)
png("public/icons/apple-touch-icon.png", 180, 0.06)
print("ok")
