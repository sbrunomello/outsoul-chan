import hashlib
import json
from pathlib import Path

ASSETS = Path("public/reactions")
MANIFEST = Path("src/shared/reactions/manifest.json")
emotions = {
    "joy": ("chibi", ["cute", "happy", "delight"]),
    "anger": ("dramatic_manga", ["anger", "exasperated", "comedy"]),
    "dramatic_sadness": ("dramatic_manga", ["crying", "sad", "dramatic"]),
    "fear_shock": ("comedy", ["shock", "surprise", "unexpected"]),
    "embarrassment": ("cinematic_anime", ["bashful", "blush", "awkward"]),
    "bored_judgment": ("cinematic_anime", ["bored", "judgment", "side-eye"]),
    "mockery_laughter": ("meme", ["laugh", "smug", "teasing"]),
    "confidence_sigma": ("dramatic_manga", ["confidence", "sigma", "parody"]),
}

entries = []
for image_path in sorted(ASSETS.glob("*.png")):
    emotion = next((name for name in emotions if image_path.stem.startswith(f"{name}_")), None)
    if emotion is None:
        raise SystemExit(f"Unknown emotion filename: {image_path.name}")
    style, tags = emotions[emotion]
    suffix = int(image_path.stem.rsplit("_", 1)[1])
    entries.append({
        "id": image_path.stem,
        "emotion": emotion,
        "style": style,
        "intensity": 2 + ((suffix + 1) % 3),
        "tags": tags,
        "file": image_path.name,
        "sha256": hashlib.sha256(image_path.read_bytes()).hexdigest(),
        "approved": True,
        "enabled": True,
    })

if len(entries) != 32:
    raise SystemExit(f"Expected 32 reaction assets, found {len(entries)}")
MANIFEST.write_text(json.dumps(entries, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"Wrote {len(entries)} assets to {MANIFEST}")
