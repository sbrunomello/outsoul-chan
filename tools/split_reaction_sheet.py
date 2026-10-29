"""Split a four-panel generated reaction sheet into independent transparent PNGs."""
from pathlib import Path
import sys

from PIL import Image, ImageOps
import numpy as np
from scipy import ndimage


def split(sheet_path: Path, emotions: list[str], output_dir: Path) -> list[Path]:
    if len(emotions) != 4:
        raise ValueError("Provide exactly four emotion IDs for a 2x2 sheet")
    image = Image.open(sheet_path).convert("RGBA")
    width, height = image.size
    margin = 28
    bounds = [
        (margin, margin, width // 2 - margin, height // 2 - margin),
        (width // 2 + margin, margin, width - margin, height // 2 - margin),
        (margin, height // 2 + margin, width // 2 - margin, height - margin),
        (width // 2 + margin, height // 2 + margin, width - margin, height - margin),
    ]
    output_dir.mkdir(parents=True, exist_ok=True)
    results = []
    numbers: dict[str, int] = {}
    for index, box in enumerate(bounds):
        panel = image.crop(box)
        alpha = np.array(panel.getchannel("A"))
        labels, _ = ndimage.label(alpha > 16)
        sizes = np.bincount(labels.ravel())
        largest = int(sizes[1:].max(initial=0))
        slices = ndimage.find_objects(labels)
        keep_labels = []
        for label_id, bounds_for_component in enumerate(slices, start=1):
            if bounds_for_component is None:
                continue
            size = int(sizes[label_id])
            component_y, component_x = bounds_for_component
            touches_margin = (
                component_x.start < 28 or component_y.start < 28 or
                component_x.stop > panel.width - 28 or component_y.stop > panel.height - 28
            )
            if not touches_margin or size >= largest * 0.2:
                keep_labels.append(label_id)
        if keep_labels:
            mask = np.isin(labels, keep_labels)
            alpha[~mask] = 0
            panel.putalpha(Image.fromarray(alpha.astype("uint8")))
        alpha = panel.getchannel("A")
        bbox = alpha.getbbox()
        if bbox is None:
            raise ValueError(f"Panel {index} is fully transparent")
        panel = panel.crop(bbox)
        panel.thumbnail((640, 640), Image.Resampling.LANCZOS)
        canvas = Image.new("RGBA", (640, 640), (0, 0, 0, 0))
        canvas.alpha_composite(panel, ((640 - panel.width) // 2, (640 - panel.height) // 2))
        emotion = emotions[index]
        numbers[emotion] = numbers.get(emotion, 0) + 1
        target = output_dir / f"{emotion}_{numbers[emotion]:02}.png"
        canvas.save(target, format="PNG", optimize=True)
        results.append(target)
    return results


if __name__ == "__main__":
    if len(sys.argv) != 4:
        raise SystemExit("Usage: python tools/split_reaction_sheet.py SHEET EMOTION1,EMOTION2,EMOTION3,EMOTION4 OUTPUT_DIR")
    for path in split(Path(sys.argv[1]), sys.argv[2].split(","), Path(sys.argv[3])):
        print(path)
