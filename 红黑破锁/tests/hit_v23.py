"""Real Chromium checks for bounded hit/slap feedback, masks and distinct rendered audio."""
from pathlib import Path
import base64, json, os
from PIL import Image, ImageChops
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
QA=ROOT/'qa/2026-10-15-V2.3.2-自测';QA.mkdir(exist_ok=True)
os.environ['TEMP']=os.environ['TMP']=str(QA)
checks=[]
def check(value,label):
    assert value,label
    checks.append(label)
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True)
    try:
        page=browser.new_page(viewport={'width':1000,'height':850})
        errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        png=base64.b64encode((ROOT/'assets/themes/fufu-padlock.png').read_bytes()).decode()
        page.set_content('''<html data-theme="fufu"><style>
        body{margin:0;background:#233342}#typing-lock-overlay{position:absolute;inset:0;--typing-lock-padlock:url(data:image/png;base64,'''+png+''')}
        .lock-emblem{position:absolute;display:block;width:500px;height:500px;left:250px;top:80px}.lock-art,.lock-shackle{position:absolute;inset:0}.lock-shackle{background:var(--typing-lock-padlock) center/contain no-repeat}
        #lock-fx{position:absolute;left:500px;top:330px;width:0;height:0}.chain-arm{position:absolute;left:100px;top:300px;width:200px;height:10px}.lock-chain{height:100%;background:#edc65a}
        .fufu-mouse-art{position:absolute;left:360px;top:650px;width:35px;height:25px;background:#ffe4a8;border-radius:50%}
        .cage-door{position:absolute;top:45px;height:700px;width:420px;border:12px solid #a9d8f5;box-sizing:border-box;z-index:-1}.cage-door-left{left:80px}.cage-door-right{left:500px}.cage-bar{width:8px;height:100%;background:#a9d8f5;margin:auto}
        </style><div id="typing-lock-overlay" data-motion="on"><div class="cage-door cage-door-left"><i class="cage-bar"></i></div><div class="cage-door cage-door-right"><i class="cage-bar"></i></div><span class="lock-emblem"><span class="lock-art"><span class="lock-shackle"></span></span></span><div class="chain-arm"><div class="lock-chain"></div></div><span class="fufu-mouse-art"></span><div id="lock-fx"></div></div></html>''')
        if (ROOT/'src/hit-feedback.js').exists():page.add_script_tag(path=str(ROOT/'src/hit-feedback.js'))
        check(page.evaluate('typeof window.LockHitFeedback==="object"'),'hit feedback API exists')
        page.add_style_tag(path=str(ROOT/'src/hit-feedback.css'))
        page.evaluate('''()=>{window.cfg={mode:'lock',theme:'fufu',motion:'on'};window.o=document.querySelector('#typing-lock-overlay');window.feedback=LockHitFeedback.create({overlay:o,getSettings:()=>cfg,spawn:(cls,frames,options)=>{const f=o.querySelector('#lock-fx');if(f.children.length>=90)return;const el=document.createElement('i');el.className=cls;f.append(el);const a=el.animate(frames,options);a.onfinish=()=>el.remove();}})}''')
        check(page.locator('.lock-hit > .lock-art').count()==1,'inner wrapper preserves original artwork')
        for ratio,count in [(0,0),(.19,0),(.2,1),(.4,2),(.6,3),(.8,4),(.95,5),(.39,1)]:
            page.evaluate('r=>feedback.update(r,"layer1")',ratio)
            check(page.locator('.lock-art').get_attribute('data-bite-count')==str(count),f'threshold {ratio} produces {count} notches')
        for ratio,count in [(0,0),(.4,2),(.95,5)]:
            page.evaluate('r=>{feedback.reset();feedback.update(r,"photo");o.querySelector("#lock-fx").replaceChildren()}',ratio)
            page.screenshot(path=str(QA/f'feedback-teeth-{count}.png'))
        whole=Image.open(QA/'feedback-teeth-0.png').convert('RGB')
        two=Image.open(QA/'feedback-teeth-2.png').convert('RGB')
        five=Image.open(QA/'feedback-teeth-5.png').convert('RGB')
        check(ImageChops.difference(whole.crop((250,80,750,350)),five.crop((250,80,750,350))).getbbox() is None,'rendered ears and U-shaped shackle are unchanged')
        sample_points=[(373,398),(621,420),(409,483),(589,488),(495,509)]
        check(sum(whole.getpixel(p)!=two.getpixel(p) for p in sample_points)==2,'two visible body-edge holes rendered')
        check(sum(whole.getpixel(p)!=five.getpixel(p) for p in sample_points)==5,'five visible body-edge holes rendered')
        page.evaluate('feedback.update(.1,"layer2")')
        check(page.locator('.lock-art').get_attribute('data-bite-count')=='0','new layer restores whole lock')
        page.evaluate('feedback.update(.4,"layer2");o.querySelector(".lock-emblem").style.width="400px";o.querySelector(".lock-emblem").style.height="400px";feedback.update(.4,"layer2")')
        check(page.locator('.lock-art').evaluate('e=>e.style.maskImage.includes("92.8px")'),'same-progress resize keeps notches on artwork edge')
        page.evaluate('o.querySelector(".lock-emblem").style.width="500px";o.querySelector(".lock-emblem").style.height="500px";feedback.update(.4,"layer2")')
        page.evaluate('feedback.hit();window.prior=o.querySelector(".lock-hit").getAnimations()[0];for(let i=0;i<60;i++)feedback.hit()')
        check(page.evaluate('prior.playState==="idle" && o.querySelector(".lock-hit").getAnimations().length===1'),'rapid repeats cancel previous animation')
        check(page.locator('#lock-fx > *').count()<=90,'rapid particles stay within shared cap')
        check(page.evaluate('o.querySelector(".lock-emblem").getBoundingClientRect().x===250'),'outer geometry stays static during hit')
        page.evaluate('for(const a of o.getAnimations({subtree:true}))if(a.effect.target.matches(".lock-hit")){a.pause();a.currentTime=40}')
        page.screenshot(path=str(QA/'feedback-hit-midframe.png'))
        page.evaluate('feedback.stop();o.querySelector("#lock-fx").replaceChildren();cfg.motion="off";o.dataset.motion="off";feedback.hit();feedback.update(.95,"off")')
        check(page.evaluate('o.getAnimations({subtree:true}).every(a=>a.effect.getKeyframes().every(f=>!f.transform))'),'motion off emits brightness only')
        check(page.locator('#lock-fx > *').count()==0,'motion off emits no particles')
        page.evaluate('feedback.stop();cfg.motion="on";o.dataset.motion="on";cfg.mode="cage";feedback.update(.95,"cage");feedback.hit()')
        check(page.locator('.lock-art').get_attribute('data-bite-count')=='0','cage never gnaws the lock')
        check(page.evaluate('[...o.querySelectorAll(".cage-door")].every(e=>e.getAnimations().some(a=>a.effect.getTiming().duration===150))'),'both doors rebound for 150ms')
        check(page.locator('.door-impact-paw').count()==1,'fufu slap shows a paw print')
        points=page.evaluate('''()=>{let points=[];for(let i=0;i<12;i++){feedback.hit();const e=o.querySelector('.door-impact-ripple');points.push([parseFloat(e.style.left),parseFloat(e.style.top)])}return points}''')
        check(len(set(tuple(x) for x in points))>=8 and all(abs(x-500)<65 and 45<y<745 for x,y in points),'slap position varies near door seam')
        check(all(y>600 or y<60 for x,y in points),'door impacts remain visible beyond the lock artwork')
        check(page.locator('.door-impact-ripple').count()==1 and page.locator('.door-impact-paw').count()==1,'rapid door hits reuse ripple and paw')
        for theme in ['fufu','horror']:
            page.evaluate('t=>{cfg.theme=t;document.documentElement.dataset.theme=t;feedback.hit();for(const a of o.getAnimations({subtree:true})){a.pause();a.currentTime=55}}',theme)
            page.screenshot(path=str(QA/f'feedback-slap-{theme}.png'))
        page.evaluate('feedback.stop();cfg.theme="fufu";cfg.mode="count";o.dataset.customLock="true";feedback.update(.95,"custom")')
        check(page.locator('.lock-art').get_attribute('data-bite-count')=='0','unknown custom artwork keeps complete silhouette')
        for theme in ['horror','cyber','typewriter','notebook','pixel','chalk','terminal','cream','fufu']:
            for mode in ['lock','cage','count']:
                check(page.evaluate('''([theme,mode])=>{feedback.stop();cfg.theme=theme;cfg.mode=mode;cfg.motion='on';o.dataset.motion='on';feedback.hit();const a=o.querySelector('.lock-hit').getAnimations();return a.length===1 && a[0].effect.getKeyframes().some(f=>f.transform && f.transform!=='none')}''',[theme,mode]),f'{theme}/{mode} has bounded hit response')
        # Render real audio samples, so routing every theme to one timbre is observable.
        fingerprints=page.evaluate('''async()=>{const result={};for(const theme of ['horror','cyber','typewriter','notebook','pixel','chalk','terminal','cream','fufu']){cfg.theme=theme;const ctx=new OfflineAudioContext(1,11025,22050);feedback.synthDoor(ctx,.8);const b=await ctx.startRendering(),d=b.getChannelData(0);let energy=0,hash=0;for(let i=0;i<d.length;i++){energy+=d[i]*d[i];hash=(hash*31+Math.round(d[i]*1e6))|0;}result[theme]={energy,hash};}return result}''')
        check(all(x['energy']>.001 for x in fingerprints.values()),'nine theme door sounds render audible samples')
        check(len({x['hash'] for x in fingerprints.values()})==9,'nine theme door sounds have distinct waveforms')
        page.evaluate('feedback.stop()')
        check(page.evaluate('o.querySelectorAll(".door-impact-ripple,.door-impact-paw").length===0'),'stop cleans transient nodes')
        check(not errors,'no browser errors')
    finally:browser.close()
(QA/'hit-feedback-result.json').write_text(json.dumps({'passed':len(checks),'failed':0,'skipped':0,'checks':checks},ensure_ascii=False,indent=2),encoding='utf-8')
print(f'PASS V2.3 hit feedback: {len(checks)} checks; 0 failed; 0 skipped')
