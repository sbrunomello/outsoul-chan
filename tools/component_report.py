from pathlib import Path
import numpy as np
from PIL import Image
from scipy import ndimage

for name in ["anger_03", "anger_04", "confidence_sigma_04", "dramatic_sadness_04", "joy_03", "joy_04"]:
    alpha = np.array(Image.open(Path("public/reactions") / f"{name}.png").getchannel("A")) > 16
    labels, _ = ndimage.label(alpha)
    sizes = np.bincount(labels.ravel())[1:]
    boxes = ndimage.find_objects(labels)
    indexed = sorted(enumerate(sizes, start=1), key=lambda item: item[1], reverse=True)[:6]
    details = []
    for label, size in indexed:
        bounds = boxes[label - 1]
        details.append((int(size), (bounds[1].start, bounds[0].start, bounds[1].stop, bounds[0].stop)))
    print(name, details)
