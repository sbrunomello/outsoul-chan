"""Technical checks for isolated reaction PNGs and their manifest."""
import json
import hashlib
from pathlib import Path

import numpy as np
from PIL import Image

ASSET_DIR = Path("public/reactions")
MANIFEST = Path("src/shared/reactions/manifest.json")
MIN_EDGE = 256
MAX_BYTES = 5 * 1024 * 1024

entries = json.loads(MANIFEST.read_text(encoding="utf-8"))
errors = []
seen = set()
seen_files = set()
emotion_counts = {}
fingerprints = []
tiles = []
for entry in entries:
    asset_id = entry.get("id", "")
    file_name = entry.get("file", "")
    if asset_id in seen:
        errors.append(f"duplicate id: {asset_id}")
    seen.add(asset_id)
    if file_name in seen_files:
        errors.append(f"duplicate filename: {file_name}")
    seen_files.add(file_name)
    emotion = entry.get("emotion", "")
    emotion_counts[emotion] = emotion_counts.get(emotion, 0) + 1
    path = ASSET_DIR / file_name
    if not path.is_file():
        errors.append(f"missing image: {file_name}")
        continue
    try:
        with Image.open(path) as image:
            image.verify()
        with Image.open(path) as image:
            if image.format != "PNG" or image.mode != "RGBA":
                errors.append(f"not RGBA PNG: {file_name}")
            if min(image.size) < MIN_EDGE:
                errors.append(f"resolution below {MIN_EDGE}px: {file_name}")
            if image.getchannel("A").getextrema() == (255, 255):
                errors.append(f"no transparent pixels: {file_name}")
            if asset_id in {"confidence_sigma_03", "confidence_sigma_04"}:
                alpha_bounds = image.getchannel("A").getbbox()
                if alpha_bounds is None:
                    errors.append(f"empty transparent sticker: {file_name}")
                else:
                    left, top, right, bottom = alpha_bounds
                    margins = (left, top, image.width - right, image.height - bottom)
                    if min(margins) < image.width * 0.1:
                        errors.append(f"unsafe edge padding below 10%: {file_name} ({margins})")
            if hashlib.sha256(path.read_bytes()).hexdigest() != entry.get("sha256"):
                errors.append(f"manifest SHA-256 mismatch: {file_name}")
            preview = image.copy()
            preview.thumbnail((180, 180), Image.Resampling.LANCZOS)
            tiles.append((entry.get("id", file_name), preview))
            flat = Image.new("RGBA", image.size, "#eeeeee")
            flat.alpha_composite(image.convert("RGBA"))
            fingerprint = np.asarray(flat.convert("RGB").resize((32, 32)), dtype=np.float32) / 255
            fingerprints.append((asset_id, fingerprint))
        if path.stat().st_size > MAX_BYTES:
            errors.append(f"larger than {MAX_BYTES} bytes: {file_name}")
    except Exception as error:  # noqa: BLE001
        errors.append(f"corrupt image {file_name}: {type(error).__name__}")

if len(entries) != 32:
    errors.append(f"expected 32 assets, found {len(entries)}")
for emotion, amount in emotion_counts.items():
    if amount != 4:
        errors.append(f"expected 4 assets for {emotion}, found {amount}")
similar_pairs = []
for index, (first_id, first) in enumerate(fingerprints):
    for second_id, second in fingerprints[index + 1:]:
        distance = float(np.mean(np.abs(first - second)))
        if distance < 0.02:
            similar_pairs.append((first_id, second_id, round(distance, 4)))
if similar_pairs:
    errors.extend(f"near-duplicate images: {first} / {second} (distance {distance})" for first, second, distance in similar_pairs)
if tiles:
    columns = 4
    cell_w, cell_h = 200, 212
    rows = (len(tiles) + columns - 1) // columns
    contact = Image.new("RGB", (columns * cell_w, rows * cell_h), "#f3eef7")
    from PIL import ImageDraw
    draw = ImageDraw.Draw(contact)
    for index, (label, tile) in enumerate(tiles):
        x = (index % columns) * cell_w + (cell_w - tile.width) // 2
        y = (index // columns) * cell_h + 4
        contact.paste(tile, (x, y), tile)
        draw.text(((index % columns) * cell_w + 5, (index // columns) * cell_h + 188), label, fill="#24192c")
    contact.save("tools/reaction-contact-sheet.png", optimize=True)
print(json.dumps({"assets": len(entries), "emotions": emotion_counts, "similarPairs": similar_pairs, "errors": errors}, ensure_ascii=False, indent=2))
raise SystemExit(1 if errors else 0)
