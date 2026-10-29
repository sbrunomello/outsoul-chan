from pathlib import Path

from PIL import Image, ImageDraw, ImageOps

files = sorted(Path("imagens de base").glob("*.png"))
cell_w, cell_h = 220, 240
sheet = Image.new("RGB", (cell_w * 4, cell_h * 3), "#f5f5f5")
draw = ImageDraw.Draw(sheet)

for index, path in enumerate(files):
    image = Image.open(path).convert("RGBA")
    thumb = ImageOps.contain(image, (cell_w - 12, cell_h - 36))
    x = (index % 4) * cell_w + (cell_w - thumb.width) // 2
    y = (index // 4) * cell_h + 4
    sheet.paste(thumb, (x, y), thumb)
    draw.text(((index % 4) * cell_w + 5, (index // 4) * cell_h + cell_h - 24), path.name[:8], fill="black")

sheet.save("tools/reference-contact-sheet.png")
