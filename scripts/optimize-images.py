#!/usr/bin/env python3
"""检查或批量优化 public 中的固定图片资源。

默认只列出目标文件，不写入；传入 --apply 才会创建备份并原地优化。
"""

import argparse
import os
import shutil
import sys
import time
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print("缺少 Pillow，请先运行：python3 -m pip install Pillow", file=sys.stderr)
    raise SystemExit(2)


ROOT = Path(__file__).resolve().parent.parent / "public"
PNG_SKIP = {"icon-192.png", "icon-512.png"}


def parse_args():
    parser = argparse.ArgumentParser(
        description="检查图片资源；添加 --apply 后才会创建备份并执行优化。"
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="创建 public/.image-backup-* 备份后原地优化图片",
    )
    return parser.parse_args()


def targets():
    icon_pngs = sorted((ROOT / "icons").glob("*.png"))
    png_targets = [path for path in icon_pngs if path.name not in PNG_SKIP]
    bear = ROOT / "bear-bottle.png"
    if bear.exists():
        png_targets.append(bear)
    webps = sorted((ROOT / "illustrations").glob("*.webp"))
    return icon_pngs, bear, webps, png_targets + webps


def image_info(path):
    with Image.open(path) as image:
        return image.width, image.height, path.stat().st_size


def print_inventory(files):
    print("\n=== 图片检查（不会修改文件） ===")
    total = 0
    for path in files:
        width, height, size = image_info(path)
        total += size
        print(
            f"  {width:>4}x{height:<4}  {size / 1024:>7.1f} KB  "
            f"{path.relative_to(ROOT)}"
        )
    print(f"  TOTAL: {total / 1024:.1f} KB ({total / 1024 / 1024:.2f} MB)")


def resize_png(path, max_edge, quantize):
    with Image.open(path) as source:
        image = source.copy()
        original_size = image.size
        if max(image.size) > max_edge:
            scale = max_edge / max(image.size)
            image = image.resize(
                tuple(max(1, round(value * scale)) for value in image.size),
                Image.Resampling.LANCZOS,
            )

        has_alpha = image.mode in ("RGBA", "LA") or (
            image.mode == "P" and "transparency" in image.info
        )
        if has_alpha:
            image = image.convert("RGBA")
        elif quantize and image.mode not in ("P", "1", "L"):
            image = image.convert("RGB").quantize(
                colors=256,
                method=Image.Quantize.MEDIANCUT,
                dither=Image.Dither.FLOYDSTEINBERG,
            )
        elif image.mode not in ("P", "RGB", "L", "1"):
            image = image.convert("RGB")

        temporary = path.with_suffix(path.suffix + ".tmp")
        image.save(temporary, format="PNG", optimize=True)
        resized = image.size != original_size
        if not resized and temporary.stat().st_size * 1.02 >= path.stat().st_size:
            temporary.unlink()
            return False
        os.replace(temporary, path)
        return True


def optimize_webp(path, max_edge=512):
    with Image.open(path) as source:
        image = source.copy()
        resized = max(image.size) > max_edge
        if resized:
            scale = max_edge / max(image.size)
            image = image.resize(
                tuple(max(1, round(value * scale)) for value in image.size),
                Image.Resampling.LANCZOS,
            )

        temporary = path.with_suffix(path.suffix + ".tmp")
        image.save(temporary, format="WEBP", quality=80, method=6)
        if not resized and temporary.stat().st_size * 1.03 >= path.stat().st_size:
            temporary.unlink()
            return False
        os.replace(temporary, path)
        return True


def create_backup(files):
    backup = ROOT / f".image-backup-{time.strftime('%Y%m%d-%H%M%S')}"
    for source in files:
        destination = backup / source.relative_to(ROOT)
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, destination)
    return backup


def apply_optimization(icon_pngs, bear, webps, files):
    backup = create_backup(files)
    before = {path: image_info(path) for path in files}
    changed = []

    for path in icon_pngs:
        if path.name not in PNG_SKIP and resize_png(path, 256, True):
            changed.append(path)
    if bear.exists() and resize_png(bear, 512, False):
        changed.append(bear)
    for path in webps:
        if optimize_webp(path):
            changed.append(path)

    print(f"\n备份目录：{backup}")
    if not changed:
        print("没有图片需要重写；备份可直接删除。")
        return

    print("\n=== 已优化 ===")
    for path in changed:
        old_size = before[path][2]
        new_size = path.stat().st_size
        print(
            f"  {path.relative_to(ROOT)}: {old_size / 1024:.1f} KB → "
            f"{new_size / 1024:.1f} KB"
        )
    print(f"\n如需还原：cp -R \"{backup}/.\" \"{ROOT}/\"")


def main():
    args = parse_args()
    icon_pngs, bear, webps, files = targets()
    if not files:
        print("没有找到目标图片。")
        return
    print_inventory(files)
    if not args.apply:
        print("\n检查完成，未修改任何文件。确认后可运行：npm run images:optimize")
        return
    apply_optimization(icon_pngs, bear, webps, files)


if __name__ == "__main__":
    main()
