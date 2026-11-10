# -*- coding: utf-8 -*-
"""生成扩展所需的静态资源：雾林背景 SVG + 扩展图标 PNG（无第三方依赖）。"""
import math
import os
import random
import struct
import zlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, "src", "assets")
os.makedirs(ASSETS, exist_ok=True)


# ---------------------------------------------------------------- 背景 SVG
def build_background():
    random.seed(20261106)
    W, H = 1600, 900
    out = []
    out.append(
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" '
        f'preserveAspectRatio="xMidYMid slice">'
    )
    out.append(
        """<defs>
  <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#eef2ef"/>
    <stop offset="0.42" stop-color="#cdd8d3"/>
    <stop offset="0.72" stop-color="#a7b8b1"/>
    <stop offset="1" stop-color="#7d918a"/>
  </linearGradient>
  <linearGradient id="fogUp" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#ffffff" stop-opacity="0.92"/>
    <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
  </linearGradient>
  <linearGradient id="fogDown" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#ffffff" stop-opacity="0"/>
    <stop offset="0.55" stop-color="#f2f6f4" stop-opacity="0.55"/>
    <stop offset="1" stop-color="#ffffff" stop-opacity="0.9"/>
  </linearGradient>
  <radialGradient id="vignette" cx="0.5" cy="0.42" r="0.78">
    <stop offset="0.55" stop-color="#000000" stop-opacity="0"/>
    <stop offset="1" stop-color="#0d1b16" stop-opacity="0.42"/>
  </radialGradient>
  <filter id="soft" x="-30%" y="-30%" width="160%" height="160%">
    <feGaussianBlur stdDeviation="26"/>
  </filter>
  <filter id="softer" x="-30%" y="-30%" width="160%" height="160%">
    <feGaussianBlur stdDeviation="52"/>
  </filter>
  <filter id="b1" x="-10%" y="-10%" width="120%" height="120%">
    <feGaussianBlur stdDeviation="2.6"/>
  </filter>
  <filter id="b2" x="-10%" y="-10%" width="120%" height="120%">
    <feGaussianBlur stdDeviation="1.6"/>
  </filter>
  <filter id="b3" x="-10%" y="-10%" width="120%" height="120%">
    <feGaussianBlur stdDeviation="0.9"/>
  </filter>
</defs>"""
    )
    out.append(f'<rect width="{W}" height="{H}" fill="url(#sky)"/>')

    layers = [
        dict(n=130, hmin=50, hmax=92, color="#a7b8b0", op=0.4, base=470, jitter=18, wmin=13, wmax=22, blur="b1"),
        dict(n=110, hmin=80, hmax=132, color="#8fa49b", op=0.48, base=540, jitter=22, wmin=20, wmax=34, blur="b1"),
        dict(n=90, hmin=120, hmax=192, color="#74897f", op=0.55, base=618, jitter=26, wmin=30, wmax=48, blur="b2"),
        dict(n=70, hmin=180, hmax=272, color="#566a61", op=0.6, base=712, jitter=30, wmin=44, wmax=70, blur="b3"),
        dict(n=50, hmin=258, hmax=382, color="#3b4b45", op=0.68, base=822, jitter=34, wmin=58, wmax=96, blur="b3"),
        dict(n=34, hmin=340, hmax=520, color="#25322d", op=0.76, base=946, jitter=40, wmin=76, wmax=126, blur=""),
    ]

    def fir(cx, base, hgt, wid):
        top = base - hgt
        d = [
            f"M{cx - wid / 2:.1f},{base:.1f} L{cx:.1f},{top:.1f} L{cx + wid / 2:.1f},{base:.1f} Z"
        ]
        for yy, ww in ((0.3, 0.56), (0.56, 0.76)):
            y1 = base - hgt * (1 - yy)
            d.append(
                f"M{cx - wid * ww / 2:.1f},{y1:.1f} L{cx:.1f},{y1 - hgt * 0.14:.1f} "
                f"L{cx + wid * ww / 2:.1f},{y1:.1f} Z"
            )
        return "".join(d)

    for layer in layers:
        paths = []
        for _ in range(layer["n"]):
            cx = random.uniform(-70, W + 70)
            base = layer["base"] + random.uniform(-layer["jitter"], layer["jitter"])
            hgt = random.uniform(layer["hmin"], layer["hmax"])
            wid = random.uniform(layer["wmin"], layer["wmax"])
            paths.append(fir(cx, base, hgt, wid))
        blur_attr = f' filter="url(#{layer["blur"]})"' if layer["blur"] else ""
        out.append(
            f'<g fill="{layer["color"]}" opacity="{layer["op"]}"{blur_attr}>'
            + "".join(f'<path d="{d}"/>' for d in paths)
            + "</g>"
        )
        # 柔和雾带：模糊椭圆，避免硬边
        for _ in range(7):
            out.append(
                f'<ellipse cx="{random.uniform(-100, W + 100):.0f}" '
                f'cy="{layer["base"] - layer["hmax"] * random.uniform(0.15, 0.75):.0f}" '
                f'rx="{random.uniform(180, 430):.0f}" ry="{random.uniform(38, 88):.0f}" '
                f'fill="#ffffff" opacity="{random.uniform(0.08, 0.2):.0f}" filter="url(#soft)"/>'
            )

    # 顶部雾照：让上半部通透
    out.append(
        f'<ellipse cx="{W * 0.45:.0f}" cy="60" rx="1000" ry="300" fill="#ffffff" '
        f'opacity="0.5" filter="url(#softer)"/>'
    )
    out.append(f'<rect x="0" y="{H - 240}" width="{W}" height="240" fill="url(#fogDown)" opacity="0.35"/>')
    out.append(f'<rect width="{W}" height="{H}" fill="url(#vignette)"/>')
    out.append("</svg>")

    path = os.path.join(ASSETS, "bg-forest.svg")
    with open(path, "w", encoding="utf-8") as f:
        f.write("".join(out))
    return path


# ---------------------------------------------------------------- 图标 PNG
SS = 4


def blend(dst, src, a):
    return tuple(
        int(round(dst[i] * (1 - a) + src[i] * a)) for i in range(3)
    ) + (max(dst[3], int(round(255 * a))),)


def render_icon(size):
    W = size * SS
    radius = W * 0.225
    top = (96, 205, 162)
    bottom = (22, 74, 58)
    px = [[(0, 0, 0, 0) for _ in range(W)] for _ in range(W)]

    for y in range(W):
        t = y / (W - 1)
        col = tuple(int(round(top[i] + (bottom[i] - top[i]) * t)) for i in range(3))
        # 圆角矩形
        cy = min(max(y, radius), W - radius)
        for x in range(W):
            cx = min(max(x, radius), W - radius)
            dx, dy = x - cx, y - cy
            if dx * dx + dy * dy <= radius * radius:
                px[y][x] = (*col, 255)

    dots = [
        (0.335, 0.335, 0.075, 1.0),
        (0.665, 0.335, 0.075, 0.62),
        (0.335, 0.665, 0.075, 0.62),
        (0.665, 0.665, 0.075, 1.0),
    ]
    for dcx, dcy, dr, alpha in dots:
        ccx, ccy, cr = dcx * W, dcy * W, dr * W
        for y in range(max(0, int(ccy - cr - 2)), min(W, int(ccy + cr + 3))):
            for x in range(max(0, int(ccx - cr - 2)), min(W, int(ccx + cr + 3))):
                if px[y][x][3] == 0:
                    continue
                d = math.hypot(x - ccx, y - ccy)
                cov = max(0.0, min(1.0, cr - d + 0.6))
                if cov <= 0:
                    continue
                px[y][x] = blend(px[y][x], (255, 255, 255), alpha * cov)

    # 盒式下采样
    out = []
    for y in range(size):
        row = []
        for x in range(size):
            r = g = b = a = 0
            for dy in range(SS):
                for dx in range(SS):
                    p = px[y * SS + dy][x * SS + dx]
                    r += p[0] * p[3]
                    g += p[1] * p[3]
                    b += p[2] * p[3]
                    a += p[3]
            n = SS * SS
            if a == 0:
                row.append((0, 0, 0, 0))
            else:
                row.append((r // a, g // a, b // a, a // n))
        out.append(row)
    return out


def write_png(path, size, pixels):
    raw = bytearray()
    for y in range(size):
        raw.append(0)
        for x in range(size):
            raw.extend(bytes(pixels[y][x]))

    def chunk(tag, data):
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(bytes(raw), 9))
        + chunk(b"IEND", b"")
    )
    with open(path, "wb") as f:
        f.write(png)


if __name__ == "__main__":
    print("bg:", build_background())
    for s in (16, 32, 48, 128):
        p = os.path.join(ASSETS, f"icon{s}.png")
        write_png(p, s, render_icon(s))
        print("icon:", p)
