# 파비콘 세트 생성: favicon.ico(16/32/48) · favicon-16/32.png · apple-touch-icon.png(180) · icon-192/512.png · site.webmanifest
# 마크는 Mark.astro 의 'ㅊ' 세 획. 실행: python -X utf8 scripts/make_favicons.py
from PIL import Image, ImageDraw
import json, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUB = os.path.join(ROOT, 'public')
INK, PAPER = (15, 26, 48), (245, 244, 239)

def mark(size, bg=INK, fg=PAPER, radius_ratio=0.22, pad_ratio=0.16):
    # 선명하게: 4배로 그려서 축소
    S = size * 4
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((0, 0, S - 1, S - 1), radius=int(S * radius_ratio), fill=bg)
    pad = S * pad_ratio
    scale = (S - 2 * pad) / 32.0
    w = max(2, int(S * 0.075))
    def seg(a, b):
        p = (pad + a[0] * scale, pad + a[1] * scale, pad + b[0] * scale, pad + b[1] * scale)
        d.line(p, fill=fg, width=w)
        r = w / 2
        for cx, cy in ((p[0], p[1]), (p[2], p[3])):
            d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=fg)
    seg((12, 5.5), (20, 5.5)); seg((5.5, 11.5), (26.5, 11.5)); seg((16, 11.5), (7, 26.5)); seg((16, 11.5), (25, 26.5))
    return im.resize((size, size), Image.LANCZOS)

for s in (16, 32):
    mark(s).save(os.path.join(PUB, f'favicon-{s}.png'))
mark(180, radius_ratio=0.0).save(os.path.join(PUB, 'apple-touch-icon.png'))   # iOS가 모서리를 깎으므로 사각형
mark(192).save(os.path.join(PUB, 'icon-192.png'))
mark(512).save(os.path.join(PUB, 'icon-512.png'))
# PIL의 ICO 저장은 기준 이미지를 sizes 로 축소해 담는다(append_images 는 무시됨) → 48px 를 기준으로
mark(48).save(os.path.join(PUB, 'favicon.ico'), format='ICO', sizes=[(16, 16), (32, 32), (48, 48)])
json.dump({
    'name': '차형진 변호사 | 상속 전문', 'short_name': '차형진 변호사', 'start_url': '/', 'display': 'browser',
    'background_color': '#F5F4EF', 'theme_color': '#F5F4EF',
    'icons': [{'src': '/icon-192.png', 'sizes': '192x192', 'type': 'image/png'}, {'src': '/icon-512.png', 'sizes': '512x512', 'type': 'image/png'}],
}, open(os.path.join(PUB, 'site.webmanifest'), 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
for f in ('favicon.ico', 'favicon-16.png', 'favicon-32.png', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'site.webmanifest'):
    print(f, os.path.getsize(os.path.join(PUB, f)), 'bytes')
