#!/usr/bin/env python3
"""Create deterministic PWA icons and normalize the generated share card."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"


def font(size: int):
    candidates = [Path("C:/Windows/Fonts/arialbd.ttf"), Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf")]
    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size)
    return ImageFont.load_default()


def make_icon(size: int) -> None:
    image = Image.new("RGB", (size, size), "#122822")
    draw = ImageDraw.Draw(image)
    inset = round(size * .09)
    draw.rounded_rectangle((inset, inset, size - inset, size - inset), radius=round(size * .18), fill="#f2efe7")
    draw.polygon([(inset, size-inset), (inset, round(size*.64)), (size-inset, round(size*.38)), (size-inset, size-inset)], fill="#78b9d5")
    draw.rectangle((inset, round(size*.79), size-inset, size-inset), fill="#dc3d2f")
    label_font = font(round(size * .29))
    label = "Z3"
    box = draw.textbbox((0, 0), label, font=label_font)
    x = (size - (box[2] - box[0])) / 2
    y = size * .22
    draw.text((x, y), label, font=label_font, fill="#122822")
    image.save(ASSETS / f"icon-{size}.png", optimize=True)


def normalize_social_card() -> None:
    path = ASSETS / "og.png"
    if not path.exists():
        return
    image = Image.open(path).convert("RGB")
    target_ratio = 1200 / 630
    current_ratio = image.width / image.height
    if current_ratio < target_ratio:
        height = round(image.width / target_ratio)
        top = (image.height - height) // 2
        image = image.crop((0, top, image.width, top + height))
    else:
        width = round(image.height * target_ratio)
        left = (image.width - width) // 2
        image = image.crop((left, 0, left + width, image.height))
    image.resize((1200, 630), Image.Resampling.LANCZOS).save(path, optimize=True)


if __name__ == "__main__":
    ASSETS.mkdir(exist_ok=True)
    normalize_social_card()
    make_icon(192)
    make_icon(512)
