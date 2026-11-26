"""Render reproducible release graphics from committed benchmark evidence (Pillow)."""
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
ROOT=Path(__file__).resolve().parent.parent
a=[v for k,v in json.loads((ROOT/'bench/results/js-phase22-final/summary.json').read_text())['configurations'].items() if '-earlysan-' in k]
cold=json.loads((ROOT/'bench/results/cold-start-0.6.0.json').read_text())['summary']
def font(n,b=False):
 return ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans'+('-Bold' if b else '')+'.ttf',n)
bg='#101b2b'; fg='#f4f7fb'; subtle='#bac9d8'; accent='#4ee0ba'; rule='#35465a'
def canvas(size):
 im=Image.new('RGB',size,bg);return im,ImageDraw.Draw(im)
def txt(d,xy,s,n=24,color=fg,b=False):d.text(xy,s,font=font(n,b),fill=color)
def minimum(lane,engine):return min(x['matrix'][lane][engine] for x in a)
im,d=canvas((1440,940))
txt(d,(54,40),'GigaChess 0.6.0  |  Competitive performance',42,b=True)
txt(d,(54,106),'Minimum measured throughput ratio • five Linux/Windows configurations',24,subtle)
txt(d,(54,143),'Higher is better. GigaChess / competitor; same workloads, warm engines.',22,subtle)
cols=[('drumevp','drumevp-published'),('chessops','chessops'),('chess.js','chess.js'),('GigaChess 0.5.0','gigachess-npm-0.5.0')]
xs=[520,752,972,1170]
for x,(label,_) in zip(xs,cols):txt(d,(x,204),label,23,b=True)
lanes=[('Native move list','fresh-native-move-list'),('Normalized UCI list','fresh-normalized-uci-list'),('SAN list','fresh-SAN-list'),('FEN round trip','fen-parse-write'),('Validated replay','validated-uci-replay'),('Start perft d5','start-d5'),('Kiwipete perft d4','kiwipete-d4'),('Mixed perft d3','mixed-perft-d3')]
for i,(label,lane) in enumerate(lanes):
 y=253+i*67
 d.rounded_rectangle((42,y-9,1398,y+43),radius=10,fill='#17273a' if i%2==0 else '#101b2b')
 txt(d,(54,y),label,27,b=True)
 for x,(_,engine) in zip(xs,cols):
  v=minimum(lane,engine) if engine in a[0]['matrix'][lane] else None
  txt(d,(x,y),f'{v:,.2f}×' if v is not None else '—',27,accent if v is not None else subtle,b=True)
txt(d,(54,805),'20,000 positions • 300 games • Node 22.5 / 24.19 • native API shapes differ',21,subtle)
txt(d,(54,840),'— unsupported lane. See README and raw artifacts for normalized comparisons.',21,subtle)
txt(d,(54,875),'WASM UltraChess is reported separately; final Apple Silicon/browser validation deferred.',21,subtle)
im.save(ROOT/'assets/benchmark-comparison.png',optimize=True)
im,d=canvas((1280,720))
txt(d,(52,37),'Cold start: first legal move list',42,b=True)
txt(d,(52,98),'15 fresh processes per entry • Node 24.19 • Linux x64 • local disk',22,subtle)
labels=[('GigaChess • synchronous','giga-cold'),('GigaChess • tables ready','giga-ready'),('UltraChess • default WASM','ultra-default'),('UltraChess • inline WASM','ultra-inline')]
mx=max(cold[k]['firstListMs'] for _,k in labels)
for i,(label,k) in enumerate(labels):
 y=180+i*106;v=cold[k]['firstListMs']
 txt(d,(52,y),label,24,b=True)
 x=52;w=max(4,round(v/mx*1020))
 d.rounded_rectangle((x,y+37,x+w,y+63),radius=10,fill=accent if k.startswith('giga') else '#89a6d6')
 txt(d,(min(x+w+14,1120),y+33),f'{v:.1f} ms',25,b=True)
txt(d,(52,628),'Import + initialization + board + first 20 moves; excludes process launch.',20,subtle)
txt(d,(52,658),'Warm WASM throughput is a different metric. One local host; not browser/network latency.',20,subtle)
im.save(ROOT/'assets/cold-start.png',optimize=True)
im,d=canvas((1280,720))
logo=Image.open(ROOT/'assets/logo.png').convert('RGBA');logo.thumbnail((340,340))
im.paste(logo,(880,80),logo)
txt(d,(60,48),'GigaChess',70,b=True)
txt(d,(64,135),'0.6.0  •  Pure TypeScript',35,accent,b=True)
txt(d,(64,211),'2.33–3.73×',72,accent,b=True)
txt(d,(68,300),'faster than drumevp in direct movegen',30,b=True)
txt(d,(68,355),'10 benchmark lanes won vs tested pure-JS engines',28)
txt(d,(68,405),'Chess960  •  16-bit moves  •  SAN / FEN / PGN',25,subtle)
d.line((64,470,1216,470),fill=rule,width=2)
txt(d,(68,498),'No WASM or runtime dependencies',35,b=True)
txt(d,(68,553),'Five Linux / Windows Node.js configurations',25,subtle)
txt(d,(68,600),'MIT  •  npm install gigachess  •  Reproducible benchmarks',24,subtle)
im.save(ROOT/'assets/social-preview.png',optimize=True)
