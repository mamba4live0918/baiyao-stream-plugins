"""Convert generated sprite atlases into deterministic, bounded bead-grid data.

The PNGs remain untouched. This creates the game's cell data and a QA contact
sheet rendered from those cells, not from the high-resolution source images.
"""
from pathlib import Path
from collections import deque
import json
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
ASSETS = ROOT / 'reference/generated-patterns'
SHEETS = [
    ('animals', 4, ['草莓抱抱猫','蜷睡橘猫','花茶奶牛猫','蓝蝴蝶灰猫','郁金香垂耳兔','草莓帽兔兔','围巾焦糖兔','胡萝卜小兔','向日葵柯基','抱桃奶油犬','雨衣腊肠犬','竹叶团子熊猫','橘子卡皮巴拉','荷叶小青蛙','蜷尾红狐狸','爱心小企鹅']),
    ('desserts',4,['草莓奶油蛋糕','薄荷巧克力冰淇淋','蜜桃气泡饮','樱桃焦糖布丁','猫咪巧克力甜甜圈','蓝莓松饼','草莓牛奶盒','抹茶瑞士卷','小熊果酱吐司','牛角三明治','三色马卡龙','雏菊小茶壶','海苔饭团','太阳蛋吐司','草莓巴菲','葡萄奶油挞']),
    ('fantasy',4,['抱星小幽灵','薄荷幼龙','蘑菇小精灵','珍珠章鱼','星际小宇航员','草莓贝雷女孩','星夜小巫师','小熊帽女孩','冰块小海豹','爱心小蝙蝠','薄荷六角龙','背包小恐龙','蘑菇森林屋','云朵彩虹','星光魔法瓶','月亮晚安猫']),
    ('floral',2,['郁金香花束','雏菊蓝蝴蝶结','月光紫花环','蕾丝爱心挂坠']),
]

def components(cells,w,h,diagonals=False):
    unseen={i for i,c in enumerate(cells) if c}
    result=[]
    while unseen:
        start=next(iter(unseen));unseen.remove(start);group=[start];todo=deque([start])
        while todo:
            i=todo.popleft();x,y=i%w,i//w
            for dx,dy in (((1,0),(-1,0),(0,1),(0,-1),(1,1),(1,-1),(-1,1),(-1,-1)) if diagonals else ((1,0),(-1,0),(0,1),(0,-1))):
                xx,yy=x+dx,y+dy;j=yy*w+xx
                if 0<=xx<w and 0<=yy<h and j in unseen:
                    unseen.remove(j);group.append(j);todo.append(j)
        result.append(group)
    return sorted(result,key=len,reverse=True)

patterns=[]
for group,n,names in SHEETS:
    atlas=Image.open(ASSETS/f'{group}.png').convert('RGBA')
    for index,name in enumerate(names):
        col,row=index%n,index//n
        tile=atlas.crop((round(col*atlas.width/n),round(row*atlas.height/n),round((col+1)*atlas.width/n),round((row+1)*atlas.height/n)))
        alpha=tile.getchannel('A').point(lambda a:255 if a>=160 else 0)
        # Atlas generators may let a neighboring tile cross its nominal border.
        # Keep substantial sprite regions before finding the content bounds.
        avalues=list(alpha.getdata())
        regions=components(avalues,tile.width,tile.height,True)
        for region in regions[1:]:
            if len(region)<len(regions[0])*.07:
                for at in region:avalues[at]=0
        alpha.putdata(avalues)
        tile.putalpha(alpha)
        box=alpha.getbbox()
        if not box:raise ValueError(name)
        tile=tile.crop(box)
        scale=44/max(tile.size)
        w,h=max(1,round(tile.width*scale)),max(1,round(tile.height*scale))
        # Preserve crisp clusters; no dithering adds spurious one-bead colors.
        sample=tile.resize((w,h),Image.Resampling.NEAREST)
        mask=sample.getchannel('A')
        quant=sample.convert('RGB').quantize(colors=18,method=Image.Quantize.MEDIANCUT,dither=Image.Dither.NONE).convert('RGB')
        cells=[('#%02x%02x%02x'%rgb) if a>=160 else None for rgb,a in zip(quant.getdata(),mask.getdata())]
        groups=components(cells,w,h,True)
        removed=0
        for component in groups[1:]:
            # Remove only isolated resampling specks; retain meaningful design parts.
            if len(component)<=2:
                for i in component:cells[i]=None;removed+=1
        # Fuse-bead manufacturing constraint: join near-touching charm parts.
        # This adjusts cell data only; source artwork is preserved for auditing.
        joins=0
        groups=components(cells,w,h)
        while len(groups)>1:
            main=groups[0];other=groups[1]
            a,b=min(((a,b) for a in main for b in other),key=lambda pair:abs(pair[0]%w-pair[1]%w)+abs(pair[0]//w-pair[1]//w))
            x,y=a%w,a//w;tx,ty=b%w,b//w
            while (x,y)!=(tx,ty):
                if x!=tx:x+=1 if tx>x else -1
                else:y+=1 if ty>y else -1
                at=y*w+x
                if cells[at] is None:cells[at]=cells[a];joins+=1
            groups=components(cells,w,h)
        # One clear working cell around the silhouette at minimum.
        width,height=w+2,h+2
        padded=[None]*(width*height)
        for y in range(h):padded[(y+1)*width+1:(y+1)*width+w+1]=cells[y*w:(y+1)*w]
        category=group
        if group=='animals' and index<8:category='cats-rabbits'
        if group=='fantasy' and 4<=index<=7:category='characters'
        patterns.append(dict(id=f'gen-{group}-{index+1:02}',name=name,category=category,width=width,height=height,cells=padded,source=dict(kind='generated',author='拼豆工坊 · AI 辅助设计',atlas=f'{group}.png',tile=index+1,colors=len(set(filter(None,padded))),beads=sum(bool(c) for c in padded),specksRemoved=removed,joinCells=joins)))

(ROOT/'src/generated-patterns.json').write_text(json.dumps(patterns,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
font=ImageFont.truetype('C:/Windows/Fonts/msyh.ttc',20)
small=ImageFont.truetype('C:/Windows/Fonts/msyh.ttc',15)
cols=8;cw,ch=220,265
out=Image.new('RGB',(cols*cw,((len(patterns)+cols-1)//cols)*ch+65),'#f4f0e7');d=ImageDraw.Draw(out)
d.text((24,16),'52 张新图纸 · 以下预览直接来自游戏逐格数据',font=font,fill='#344840')
for i,p in enumerate(patterns):
    x=(i%cols)*cw;y=65+(i//cols)*ch
    sprite=Image.new('RGBA',(p['width'],p['height']))
    sprite.putdata([tuple(bytes.fromhex(c[1:]))+(255,) if c else (0,0,0,0) for c in p['cells']])
    sprite=sprite.resize((p['width']*4,p['height']*4),Image.Resampling.NEAREST)
    out.paste(sprite,(x+(cw-sprite.width)//2,y+(192-sprite.height)//2),sprite)
    d.text((x+10,y+198),p['name'],font=small,fill='#263d32')
    d.text((x+10,y+223),f"{p['width']}×{p['height']}  {p['source']['colors']}色  {p['source']['beads']}豆",font=small,fill='#69766b')
out.save(ROOT/'交付/新图纸52款总览.png')
print(json.dumps({'patterns':len(patterns),'beadsRange':[min(p['source']['beads'] for p in patterns),max(p['source']['beads'] for p in patterns)],'components':{p['name']:[len(g) for g in components(p['cells'],p['width'],p['height'])] for p in patterns if len(components(p['cells'],p['width'],p['height']))>1}},ensure_ascii=False))
