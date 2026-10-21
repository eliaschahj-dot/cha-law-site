# OG 이미지(1200×630) 생성. 로고 마크 + '상속 전문 변호사 차형진'. 실행: python -X utf8 scripts/make_og.py
from PIL import Image, ImageDraw, ImageFont
import os

W, H = 1200, 630
PAPER, INK, INK2, ACCENT, BRASS = '#F5F4EF', '#0F1A30', '#44506A', '#1B4B8F', '#9A7F52'
FONTS = r'C:\Windows\Fonts'
serif = os.path.join(FONTS, 'HANBatangB.ttf')
sans = os.path.join(FONTS, 'NotoSansKR-VF.ttf')

def font(path, size, variation=None):
    f = ImageFont.truetype(path, size)
    if variation:
        try:
            f.set_variation_by_name(variation)
        except Exception:
            pass
    return f

img = Image.new('RGB', (W, H), PAPER)
d = ImageDraw.Draw(img)

# 마크(ㅊ 세 획): 32 단위 좌표를 scale 배로
def mark(x, y, scale, color, width):
    def seg(a, b):
        p = (x + a[0] * scale, y + a[1] * scale, x + b[0] * scale, y + b[1] * scale)
        d.line(p, fill=color, width=width)
        r = width / 2
        for cx, cy in ((p[0], p[1]), (p[2], p[3])):
            d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=color)
    seg((12, 5.5), (20, 5.5))
    seg((5.5, 11.5), (26.5, 11.5))
    seg((16, 11.5), (7, 26.5))
    seg((16, 11.5), (25, 26.5))

mark(96, 84, 2.6, INK, 7)

# 제목
t1 = font(serif, 88)
d.text((96, 190), '상속', font=t1, fill=ACCENT)
w = d.textlength('상속 ', font=t1)
d.text((96 + w, 190), '전문 변호사', font=t1, fill=INK)
d.text((96, 300), '차형진', font=t1, fill=INK)

# 놋쇠 가는 선 + 보조 문구
d.line((96, 452, 156, 452), fill=BRASS, width=2)
s1 = font(sans, 30, 'Medium')
s2 = font(sans, 26, 'Regular')
d.text((96, 478), '법무법인 베율 부대표 변호사 · 상담도 재판도 변호사가 직접 합니다', font=s1, fill=INK2)
d.text((96, 526), '070-4571-7668  ·  well@beyullaw.com', font=s2, fill=INK2)

out = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'public', 'og.png')
img.save(out, optimize=True)
print('saved', out, os.path.getsize(out))
