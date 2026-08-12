#!/usr/bin/env python3
"""批量压缩项目图片资源。
档位：
  - icons/*.png 全部 → 最长边 256（PNG quantize 256色 + optimize）
  - bear-bottle.png  → 最长边 512（PNG RGB + optimize）
  - illustrations/*.webp → 最长边 512（WebP quality=80）
跳过 icon-192.png / icon-512.png（PWA 强制尺寸）
处理前先完整备份到 public/.image-backup-{ts}/
"""
import os
import shutil
import time
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent / "public"
TS = time.strftime("%Y%m%d-%H%M%S")
BACKUP = ROOT / f".image-backup-{TS}"

PNG_SKIP = {"icon-192.png", "icon-512.png"}

stats_before = {}
stats_after = {}


def record(path: Path, bucket):
    try:
        with Image.open(path) as im:
            size = (im.width, im.height)
    except Exception:
        size = (0, 0)
    bytes_ = path.stat().st_size
    bucket[str(path.relative_to(ROOT))] = (size, bytes_)


def print_stats(title, data):
    print(f"\n=== {title} ===")
    total = 0
    for key in sorted(data.keys()):
        (w, h), b = data[key]
        kb = b / 1024
        total += b
        print(f"  {w:>4}x{h:<4}  {kb:>7.1f} KB  {key}")
    print(f"  TOTAL: {total/1024:.1f} KB ({total/1024/1024:.2f} MB)")


def print_compare(before, after):
    print(f"\n=== 前后对比（仅改动项） ===")
    keys = sorted(set(before.keys()) & set(after.keys()))
    total_b = total_a = 0
    changed = 0
    for k in keys:
        (ws, hs), b = before[k]
        (wa, ha), a = after[k]
        if b == a and ws == wa and hs == ha:
            continue
        total_b += b; total_a += a; changed += 1
        ratio = (1 - a / b) * 100 if b > 0 else 0
        print(
            f"  {k}\n"
            f"    前 {ws}x{hs}  {b/1024:.1f} KB  →  后 {wa}x{ha}  {a/1024:.1f} KB  "
            f"↓ {ratio:.1f}%"
        )
    if changed == 0:
        print("  （无任何改动）")
        return
    print(
        f"\n  改动项合计：{total_b/1024:.1f} KB → {total_a/1024:.1f} KB "
        f"（节省 {(1-total_a/total_b)*100:.1f}%）"
    )


def backup_file(rel_path: Path):
    src = ROOT / rel_path
    dst = BACKUP / rel_path
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst)


def resize_png(path: Path, max_edge: int, quantize: bool):
    """原地覆盖：resize + 优化。返回是否做了实际写入。

    带透明（RGBA / LA / P+transparency key）的 PNG 不做 quantize，
    只做 resize + optimize，避免 alpha 丢失。
    """
    with Image.open(path) as im:
        w, h = im.size
        resized = False
        if max(w, h) > max_edge:
            scale = max_edge / max(w, h)
            new_size = (max(1, round(w * scale)), max(1, round(h * scale)))
            im = im.resize(new_size, Image.Resampling.LANCZOS)
            resized = True

        # 判断是否带透明
        has_alpha = (
            im.mode in ("RGBA", "LA")
            or (im.mode == "P" and "transparency" in im.info)
        )

        # 统一转换到最合适的输出模式
        if has_alpha:
            # 带透明：坚决不 quantize，保留 alpha
            if im.mode != "RGBA":
                im = im.convert("RGBA")
        elif quantize and im.mode not in ("P", "1", "L"):
            # 不透明 + 允许量化：安全走 256 色调色板
            if im.mode == "RGB":
                im = im.quantize(colors=256, method=2, dither=Image.Dither.FLOYDSTEINBERG)
            elif im.mode == "L":
                pass  # 灰度不需要量化
            else:
                im = im.convert("RGB").quantize(colors=256, method=2, dither=Image.Dither.FLOYDSTEINBERG)
        elif im.mode not in ("P", "RGB", "L", "1"):
            im = im.convert("RGB")

        # 没 resize 且允许跳过的情况：不写入
        if not resized and not quantize:
            return False

        tmp = path.with_suffix(path.suffix + ".tmp")
        im.save(tmp, format="PNG", optimize=True)
        # 相同尺寸模式下，bytes 没更小就不替换
        if not resized:
            before_bytes = path.stat().st_size
            after_bytes = tmp.stat().st_size
            if after_bytes * 1.02 >= before_bytes:
                tmp.unlink()
                return False
        os.replace(tmp, path)
        return True


def process_illustrations_webp(path: Path, max_edge: int):
    with Image.open(path) as im:
        w, h = im.size
        if max(w, h) <= max_edge:
            # 尺寸不变也尝试重压缩（quality 80）
            reencode_only = True
        else:
            reencode_only = False
            scale = max_edge / max(w, h)
            new_size = (max(1, round(w * scale)), max(1, round(h * scale)))
            im = im.resize(new_size, Image.Resampling.LANCZOS)

        tmp = path.with_suffix(path.suffix + ".tmp")
        im.save(
            tmp,
            format="WEBP",
            quality=80,
            method=6,
        )
        before_bytes = path.stat().st_size
        after_bytes = tmp.stat().st_size
        if reencode_only and after_bytes * 1.03 >= before_bytes:
            # 重压缩反而没小 3% 以上，就放弃重写
            tmp.unlink()
            return False
        os.replace(tmp, path)
        return True


def main():
    BACKUP.mkdir(parents=True, exist_ok=True)
    print(f"备份目录: {BACKUP}")

    # ---- 收集文件 ----
    icon_pngs = sorted((ROOT / "icons").glob("*.png"))
    bear = ROOT / "bear-bottle.png"
    webps = sorted((ROOT / "illustrations").glob("*.webp"))

    png_targets = [p for p in icon_pngs if p.name not in PNG_SKIP]
    if bear.exists() and bear.name not in PNG_SKIP:
        png_targets.append(bear)

    all_files = png_targets + webps
    for f in all_files:
        record(f, stats_before)
        backup_file(f.relative_to(ROOT))
    print_stats("处理前", stats_before)

    # ---- 处理 PNG icons（256，量化）----
    icons_done = 0
    for p in icon_pngs:
        if p.name in PNG_SKIP:
            continue
        try:
            if resize_png(p, max_edge=256, quantize=True):
                icons_done += 1
        except Exception as e:
            print(f"  [WARN] icons PNG 失败 {p.name}: {e}")

    # ---- bear-bottle.png（最长边 512，保留 RGBA 透明，不贴白底）----
    if bear.exists():
        try:
            written = False
            with Image.open(bear) as im:
                w, h = im.size
                if max(w, h) > 512:
                    scale = 512 / max(w, h)
                    ns = (max(1, round(w * scale)), max(1, round(h * scale)))
                    im = im.resize(ns, Image.Resampling.LANCZOS)
                # 保留原始透明（P→RGBA、LA→RGBA，其余如果带透明就保留）
                if im.mode == "P" or "transparency" in im.info:
                    im = im.convert("RGBA")
                elif im.mode not in ("RGB", "RGBA", "LA"):
                    im = im.convert("RGBA")
                tmp = bear.with_suffix(".png.tmp")
                im.save(tmp, format="PNG", optimize=True)
                before_bytes = bear.stat().st_size
                after_bytes = tmp.stat().st_size
                # 只在更小或尺寸改变时替换（尺寸改变时 bytes 可能略大，但分辨率降了也要换）
                if after_bytes < before_bytes or (w, h) != (im.width, im.height):
                    os.replace(tmp, bear)
                    written = True
                else:
                    tmp.unlink()
            if written:
                icons_done += 1
        except Exception as e:
            print(f"  [WARN] bear-bottle 失败: {e}")

    print(f"PNG 处理完成: {icons_done} 张写入")

    # ---- WebP illustrations（512）----
    webp_done = 0
    for p in webps:
        try:
            if process_illustrations_webp(p, max_edge=512):
                webp_done += 1
        except Exception as e:
            print(f"  [WARN] WebP 失败 {p.name}: {e}")
    print(f"WebP 处理完成: {webp_done} 张写入")

    # ---- 写回 after stats ----
    for f in all_files:
        record(f, stats_after)
    print_stats("处理后", stats_after)
    print_compare(stats_before, stats_after)
    print(f"\n如需还原:\n  cp -r {BACKUP}/* {ROOT}/")


if __name__ == "__main__":
    main()
