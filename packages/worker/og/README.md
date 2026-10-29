# Share image

`og.png` is the 1200 x 630 image shown when a vanish.sh link is shared (Open Graph and Twitter cards). The worker serves it at `/og.png` from `src/lib/og-image.ts`, where it is inlined as base64.

To change it, edit `index.html` (the board scene is copied from the landing), then:

```bash
aeom capture --dir packages/worker/og --pages / --widths 1200 --out /tmp/og-cap
python3 - <<'PY'
from PIL import Image
im = Image.open('/tmp/og-cap/index@1200.png').convert('RGB').crop((0, 0, 1200, 630))
im.quantize(colors=128).save('packages/worker/og/og.png', optimize=True)
PY
```

Then rebuild `src/lib/og-image.ts` from the PNG (base64 of the file, wrapped in the same constant).
