"""
Pisa el chatbot flotante de Manguito ("Hablar con Manguito" + avatar) en
cada captura del app. Detección automática: busca en la franja derecha
de la imagen la fila con un cluster de pixeles oscuros sobre fondo claro.

Uso:
    python scripts/strip_chatbot.py [--dry-run]

Hace BACKUP en .screenshots-originals/ antes de pisar (idempotente: en
ejecuciones siguientes restaura desde el backup primero).
"""

import sys
import shutil
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent / "public" / "screenshots"
BACKUP = ROOT.parent / ".screenshots-originals"

KEEP = {"manguito-chat.jpg"}
ONBOARDING_PREFIX = "onb-"


def detect_chatbot_band(img):
    """Devuelve (y_top, y_bottom) de la banda donde está el chatbot, o
    None si no se detecta."""
    w, h = img.size
    band_left = int(w * 0.85)

    strip = img.crop((band_left, 0, w, h)).convert("L")
    sw, sh = strip.size
    px = strip.load()

    row_brights = []
    for y in range(sh):
        s = 0
        for x in range(sw):
            s += px[x, y]
        row_brights.append(s / sw)

    median = sorted(row_brights)[sh // 2]
    threshold = median - 60
    dark = [b < threshold for b in row_brights]

    if not any(dark):
        return None

    best_start = -1
    best_end = -1
    best_len = 0
    cur_start = -1
    for y, d in enumerate(dark):
        if d:
            if cur_start == -1:
                cur_start = y
        else:
            if cur_start != -1:
                cur_len = y - cur_start
                if cur_len > best_len:
                    best_len = cur_len
                    best_start = cur_start
                    best_end = y - 1
                cur_start = -1
    if cur_start != -1:
        cur_len = sh - cur_start
        if cur_len > best_len:
            best_len = cur_len
            best_start = cur_start
            best_end = sh - 1

    pad = max(int(h * 0.015), 12)
    return (max(0, best_start - pad), min(h - 1, best_end + pad))


def sample_bg_color(img, x, y):
    """Promedio de un parche 20x20 centrado en (x,y)."""
    box = img.crop((x - 10, y - 10, x + 10, y + 10))
    bands = box.split()[:3]
    return tuple(int(b.resize((1, 1)).getpixel((0, 0))) for b in bands)


def strip_chatbot(path, dry_run=False):
    with Image.open(path) as img:
        img = img.convert("RGB")
        w, h = img.size

        band = detect_chatbot_band(img)
        if band is None:
            return "no-chatbot-detected"

        y_top, y_bot = band
  