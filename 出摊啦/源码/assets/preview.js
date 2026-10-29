(() => {
  'use strict';
  const manifest = window.CHUTAN_ASSETS;
  const statusElement = document.getElementById('asset-status');
  if (!manifest?.assets?.length) {
    statusElement.textContent = '素材清单缺失：请将 manifest.js 与本预览页放在同一个文件夹。';
    statusElement.dataset.state = 'missing';
    return;
  }

  const byId = new Map(manifest.assets.map(asset => [asset.id, asset]));
  const cache = new Map();
  const imageElements = [];
  const counterCanvases = [];
  const customerCards = [];
  const toolCanvases = [];
  const rentCanvases = [];
  const eventCanvases = [];
  const shopCanvases = [];
  const ui = {
    format: 'png', background: 'grid', expression: 'all', crowdExpression: 'happy',
    seed: 20261022, crowdOpen: false, crowdCount: 200, loadedAssets: 0, missingAssets: [], loading: true,
    counterView: 'actual', counterShot: null,
  };
  let crowdPlacements = [];
  let renderRevision = 0;
  let lastFocus;

  function pathFor(asset, format = ui.format) { return format === 'webp' ? asset.webp : asset.src; }
  function loadAsset(asset, format = ui.format) {
    const path = pathFor(asset, format);
    if (asset.group === 'counters' && manifest.counterRevision === 2 && asset.derivation?.preparedRevision !== 2) {
      return Promise.resolve({ image: null, ok: false, id: asset.id, path, pendingRevision: 2 });
    }
    if (!cache.has(path)) {
      cache.set(path, new Promise(resolve => {
        const image = new Image();
        image.decoding = 'async';
        image.onload = () => resolve({ image, ok: true, id: asset.id, path });
        image.onerror = () => resolve({ image: null, ok: false, id: asset.id, path });
        image.src = path;
      }));
    }
    return cache.get(path);
  }

  function imageFor(asset, className = '') {
    const image = document.createElement('img');
    image.dataset.assetId = asset.id;
    image.alt = asset.label;
    image.width = asset.displaySize.width;
    image.height = asset.displaySize.height;
    image.className = className;
    image.draggable = false;
    imageElements.push({ image, asset });
    return image;
  }

  function addCard(asset, target) {
    const card = document.createElement('figure');
    card.className = 'asset-card';
    card.dataset.assetId = asset.id;
    const surface = document.createElement('div');
    surface.className = 'asset-image-wrap';
    surface.style.setProperty('--asset-width', asset.displaySize.width);
    surface.style.setProperty('--asset-height', asset.displaySize.height);
    surface.append(imageFor(asset));
    const caption = document.createElement('figcaption');
    const title = document.createElement('strong');
    title.textContent = asset.label;
    const file = document.createElement('code');
    file.textContent = asset.src;
    const dimensions = document.createElement('span');
    dimensions.textContent = `显示 ${asset.displaySize.width}×${asset.displaySize.height} / PNG ${asset.sourceSize.width}×${asset.sourceSize.height}`;
    caption.append(title, file, dimensions);
    card.append(surface, caption);
    document.getElementById(target).append(card);
    if (/^customer_\d{2}_/.test(asset.id)) customerCards.push({ asset, card });
    return card;
  }

  for (const asset of manifest.assets) {
    const target = /^customer_\d{2}_/.test(asset.id) ? 'customer-grid'
      : asset.group === 'customers' ? 'crowd-extras-grid'
      : asset.group === 'counters' ? 'counter-grid'
      : asset.group === 'props' ? 'props-grid' : asset.group === 'tools' ? 'tools-grid' : asset.group === 'rent' ? 'rent-grid' : asset.group === 'events' ? 'events-grid' : asset.group === 'shops' ? 'shops-grid' : 'ui-grid';
    addCard(asset, target);
  }

  function addToolComposition(id, label, width, height, placements) {
    const figure = document.createElement('figure');
    figure.className = 'tool-composition';
    figure.dataset.toolGroup = id;
    const surface = document.createElement('div');
    surface.className = 'tool-composition-surface transparency-surface';
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.dataset.toolPreview = id;
    canvas.dataset.renderComplete = 'false';
    canvas.setAttribute('aria-label', label);
    const caption = document.createElement('figcaption');
    caption.textContent = label;
    surface.append(canvas);
    figure.append(surface, caption);
    document.getElementById('tool-compositions').append(figure);
    toolCanvases.push({ id, canvas, placements, missingAssets: [], format: null });
  }
  for (let level = 0; level <= 3; level++) {
    const ids = ['pot', 'pot_water', ...(level ? [`pot_noodles_${level}`] : [])];
    addToolComposition(`pot-${level}`, `锅分层 · ${level ? ['少量', '中量', '满锅'][level - 1] : '清水'}`, 220, 140,
      ids.map(id => ({ id, x: 0, y: 0, width: 220, height: 140 })));
  }
  const bowlIds = ['bowl_empty', ...[1, 2, 3].map(level => `bowl_noodles_${level}`)];
  addToolComposition('bowls', '空碗 → 1 / 2 / 3 两 · 相同碗体与脚底', 440, 85,
    bowlIds.map((id, index) => ({ id, x: index * 110, y: 0, width: 110, height: 85 })));
  addToolComposition('salmon', '鱼块 · 满 → 半份 → 剩一点 · 相同左缘', 660, 60,
    [1, 2, 3].map((level, index) => ({ id: `salmon_block_${level}`, x: index * 220, y: 0, width: 220, height: 60 })));

  async function renderToolPreviews() {
    const format = ui.format;
    await Promise.all(toolCanvases.map(async entry => {
      const results = await Promise.all(entry.placements.map(item => loadAsset(byId.get(item.id), format)));
      if (format !== ui.format) return;
      const context = entry.canvas.getContext('2d');
      context.clearRect(0, 0, entry.canvas.width, entry.canvas.height);
      entry.placements.forEach((placement, index) => {
        if (!results[index].ok) return;
        const opening = entry.id.startsWith('pot-') && placement.id !== 'pot' ? byId.get('pot').opening : null;
        context.save();
        if (opening) {
          const frame = byId.get('pot').sourceSize;
          const sx = placement.width / frame.width, sy = placement.height / frame.height;
          context.beginPath();
          context.ellipse(placement.x + opening.cx * sx, placement.y + opening.cy * sy, opening.rx * sx, opening.ry * sy, 0, 0, Math.PI * 2);
          context.clip();
        }
        context.drawImage(results[index].image, placement.x, placement.y, placement.width, placement.height);
        context.restore();
      });
      entry.missingAssets = results.filter(result => !result.ok).map(result => result.id);
      entry.format = format;
      entry.canvas.dataset.renderComplete = String(entry.missingAssets.length === 0);
    }));
    return toolState();
  }
  function toolState() {
    return toolCanvases.map(entry => ({ id: entry.id, width: entry.canvas.width, height: entry.canvas.height,
      assetIds: entry.placements.map(item => item.id), format: entry.format, missingAssets: [...entry.missingAssets],
      renderComplete: entry.canvas.dataset.renderComplete === 'true',
      ...(entry.id.startsWith('pot-') ? { opening: { ...byId.get('pot').opening }, clipAppliesTo: 'water-and-noodles-only' } : {}) }));
  }

  function addRentComposition(id,label,width,height,placements,texts=[]) {
    const figure=document.createElement('figure');
    figure.className='rent-composition';figure.dataset.rentGroup=id;
    const surface=document.createElement('div');surface.className='rent-composition-surface transparency-surface';
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    canvas.dataset.rentPreview=id;canvas.dataset.renderComplete='false';canvas.setAttribute('aria-label',label);
    const caption=document.createElement('figcaption');caption.textContent=label;
    surface.append(canvas);figure.append(surface,caption);document.getElementById('rent-compositions').append(figure);
    rentCanvases.push({id,canvas,placements,texts,format:null,missingAssets:[]});
  }
  const landladyPlacements=['landlady_stand','landlady_stamp'].flatMap((id,index)=>{
    const actor=byId.get(id),book=byId.get('landlady_book');
    const grip=actor.anchors.find(a=>a.name==='book-grip');
    return[{id,x:index*230,y:10,width:200,height:260},
      {id:'landlady_book',x:index*230+(grip.x-book.anchor.x)/2,y:10+(grip.y-book.anchor.y)/2,width:70,height:65}];
  });
  addRentComposition('landlady-poses','站立 → 抬手盖章 · 相同画布与独立本子',430,280,landladyPlacements);
  addRentComposition('rent-sign','交租牌 · 文字由代码写入',240,100,[{id:'rent_sign',x:0,y:0,width:240,height:100}],
    [{text:'下次交租 03:12',x:120,y:52,size:14},{text:'要交 100 铜板',x:120,y:70,size:12}]);
  addRentComposition('overtime-clock','自带加班机 · 两行代码时间',320,150,[{id:'overtime_clock',x:0,y:0,width:320,height:150}],
    [{text:'距离下播 1:23:45',x:148,y:63,size:15},{text:'已加班 +12:00',x:148,y:87,size:12}]);
  async function renderRentPreviews(){
    const format=ui.format;
    await Promise.all(rentCanvases.map(async entry=>{
      const results=await Promise.all(entry.placements.map(item=>loadAsset(byId.get(item.id),format)));
      if(format!==ui.format)return;
      const context=entry.canvas.getContext('2d');context.clearRect(0,0,entry.canvas.width,entry.canvas.height);
      entry.placements.forEach((p,index)=>{if(results[index].ok)context.drawImage(results[index].image,p.x,p.y,p.width,p.height);});
      context.textAlign='center';context.textBaseline='middle';context.fillStyle='#49372d';
      for(const text of entry.texts){context.font=`700 ${text.size}px "Microsoft YaHei",sans-serif`;context.fillText(text.text,text.x,text.y);}
      entry.missingAssets=results.filter(r=>!r.ok).map(r=>r.id);entry.format=format;
      entry.canvas.dataset.renderComplete=String(entry.missingAssets.length===0);
    }));
    return rentState();
  }
  function rentState(){return rentCanvases.map(entry=>({id:entry.id,width:entry.canvas.width,height:entry.canvas.height,
    assetIds:entry.placements.map(p=>p.id),placements:entry.placements.map(p=>({...p})),format:entry.format,
    missingAssets:[...entry.missingAssets],renderComplete:entry.canvas.dataset.renderComplete==='true'}));}

  function addEventComposition(id,label,width,height,placements,texts=[]){
    const figure=document.createElement('figure');figure.className='event-composition';
    const surface=document.createElement('div');surface.className='event-composition-surface transparency-surface';
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;canvas.dataset.eventPreview=id;canvas.dataset.renderComplete='false';
    const caption=document.createElement('figcaption');caption.textContent=label;surface.append(canvas);figure.append(surface,caption);document.getElementById('event-compositions').append(figure);
    eventCanvases.push({id,canvas,placements,texts,format:null,missingAssets:[]});
  }
  function eventStrip(id,label,ids){
    const assets=ids.map(id=>byId.get(id)).filter(Boolean);if(!assets.length)return;
    const width=assets.reduce((s,a)=>s+a.displaySize.width+16,0),height=Math.max(...assets.map(a=>a.displaySize.height))+12;
    let x=0;const placements=assets.map(a=>{const p={id:a.id,x,y:height-a.displaySize.height,width:a.displaySize.width,height:a.displaySize.height};x+=p.width+16;return p;});
    addEventComposition(id,label,width,height,placements);
  }
  eventStrip('thief','小偷两帧与独立麻袋',['thief_walk_1','thief_walk_2','thief_sack']);
  eventStrip('cat','坐着 → 偷吃 → 被拎起',['cat_sit','cat_eat','cat_held']);
  if(byId.has('bus')){
    const placements=['bus','bus_door_open'].flatMap((id,i)=>[{id,x:i*350,y:0,width:330,height:190},
      ...byId.get(id).anchors.filter(a=>a.name.startsWith('wheel-')).map(a=>({id:'bus_wheel',x:i*350+a.x/2-27.5,y:a.y/2-27.5,width:55,height:55}))]);
    addEventComposition('bus','车门两态与独立轮子叠合',680,190,placements,[{text:'小强团',x:155,y:110,size:17},{text:'小强团',x:505,y:110,size:17}]);
  }
  eventStrip('spice','大手与两种调料',['big_hand','chili_pile','wasabi_pile']);
  eventStrip('helper','帮手跑步两帧与端菜',['helper_run_1','helper_run_2','helper_serve']);
  addEventComposition('guard','保安两态与独立盾牌叠合',410,260,[{id:'guard_stand',x:0,y:0,width:190,height:260},{id:'guard_block',x:210,y:0,width:190,height:260},{id:'guard_shield',x:235,y:85,width:140,height:170}],
    [{text:'🛡 ×3',x:305,y:165,size:20}]);
  eventStrip('fire','三帧火焰',['flame_1','flame_2','flame_3']);
  eventStrip('smoke-foam','烟与灭火泡沫换帧',['smoke_1','smoke_2','foam_1','foam_2','foam_3']);
  eventStrip('impact','爆炸与敲击底图',['explosion_1','explosion_2','bonk_star']);
  for(const kind of ['soot','noodle','batter','tea'])eventStrip('gunk-'+kind,kind+' 糊脸三档',[1,2,3].map(n=>'gunk_'+kind+'_'+n));
  eventStrip('fish','整条鱼拍脸',['fish_slap']);
  if(byId.has('fuse_lever')){const anchor=byId.get('fuse_lever').anchor;addEventComposition('fuse','电闸箱和独立闸杆',90,130,[{id:'fuse_box',x:0,y:0,width:90,height:130},{id:'fuse_lever',x:45-anchor.x/2,y:65-anchor.y/2,width:40,height:65}]);}
  addEventComposition('wanted','通缉令代码文字示例',150,200,[{id:'wanted_poster',x:0,y:0,width:150,height:200}],
    [{text:'通缉令',x:75,y:32,size:18},{text:'小强',x:75,y:164,size:16},{text:'铜板 30',x:75,y:184,size:13}]);
  async function renderEventPreviews(){
    const format=ui.format;await Promise.all(eventCanvases.map(async e=>{
      const results=await Promise.all(e.placements.map(p=>loadAsset(byId.get(p.id),format)));if(format!==ui.format)return;
      const g=e.canvas.getContext('2d');g.clearRect(0,0,e.canvas.width,e.canvas.height);
      e.placements.forEach((p,i)=>{if(results[i].ok)g.drawImage(results[i].image,p.x,p.y,p.width,p.height);});
      g.textAlign='center';g.textBaseline='middle';g.fillStyle='#49372d';for(const t of e.texts){g.font=`800 ${t.size}px "Microsoft YaHei",sans-serif`;g.fillText(t.text,t.x,t.y);}
      e.missingAssets=results.filter(r=>!r.ok).map(r=>r.id);e.format=format;e.canvas.dataset.renderComplete=String(e.missingAssets.length===0);
    }));return eventState();
  }
  function eventState(){return eventCanvases.map(e=>({id:e.id,width:e.canvas.width,height:e.canvas.height,assetIds:e.placements.map(p=>p.id),format:e.format,missingAssets:[...e.missingAssets],renderComplete:e.canvas.dataset.renderComplete==='true'}));}

  function addShopComposition(id,label,width,height,placements,texts=[]){
    const figure=document.createElement('figure');figure.className='shop-composition';figure.dataset.shopGroup=id;
    const surface=document.createElement('div');surface.className='shop-composition-surface transparency-surface';
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;canvas.dataset.shopPreview=id;canvas.dataset.renderComplete='false';
    const caption=document.createElement('figcaption');caption.textContent=label;surface.append(canvas);figure.append(surface,caption);document.getElementById('shop-compositions').append(figure);
    shopCanvases.push({id,canvas,placements,texts,format:null,missingAssets:[]});
  }
  function shopLayer(id,x,y){const a=byId.get(id),r=a.layerRect||{x:0,y:0,width:a.sourceSize.width,height:a.sourceSize.height};return{id,x:x+r.x/2,y:y+r.y/2,width:r.width/2,height:r.height/2};}
  if(byId.has('griddle')){
    addShopComposition('batter-levels','面糊从小摊 → 半开 → 摊满 · 实际锚点对齐',880,220,[1,2,3].flatMap((n,i)=>[shopLayer('griddle',i*300,0),shopLayer('batter_disk_'+n,i*300,0)]));
    addShopComposition('pancake-two-eggs','摊满面糊 + 最多两个蛋的默认图示',280,220,[shopLayer('griddle',0,0),shopLayer('batter_disk_3',0,0),{id:'egg_on_pancake',x:85,y:56,width:60,height:55},{id:'egg_on_pancake',x:135,y:56,width:60,height:55}]);
    addShopComposition('pancake-tools','面糊桶、蛋筐、铲子和成品纸袋',500,135,[{id:'batter_bucket',x:0,y:25,width:90,height:100},{id:'egg_basket',x:110,y:35,width:90,height:90},{id:'spatula',x:210,y:55,width:160,height:65},{id:'pancake_bag',x:395,y:15,width:90,height:110}]);
    addShopComposition('tea-cup-levels','杯后壁 → 茶 → 1 / 2 / 3 勺珍珠 → 前壁 → 封膜',410,175,[1,2,3].flatMap((n,i)=>['cup_back','cup_tea','cup_pearls_'+n,'cup_front','cup_lid'].map(id=>shopLayer(id,i*150,0))));
    addShopComposition('tea-shaker','珍珠罐、雪克杯与独立盖子',300,140,[{id:'pearl_jar',x:0,y:10,width:90,height:120},shopLayer('shaker',120,0),shopLayer('shaker_lid',120,0),{id:'bobbing_pearl',x:265,y:95,width:14,height:14}]);
  }
  async function renderShopPreviews(){
    const format=ui.format;await Promise.all(shopCanvases.map(async e=>{
      const results=await Promise.all(e.placements.map(p=>loadAsset(byId.get(p.id),format)));if(format!==ui.format)return;
      const g=e.canvas.getContext('2d');g.clearRect(0,0,e.canvas.width,e.canvas.height);
      e.placements.forEach((p,i)=>{if(results[i].ok)g.drawImage(results[i].image,p.x,p.y,p.width,p.height);});
      for(const t of e.texts){g.font=`800 ${t.size}px "Microsoft YaHei",sans-serif`;g.fillStyle='#49372d';g.fillText(t.text,t.x,t.y);}
      e.missingAssets=results.filter(r=>!r.ok).map(r=>r.id);e.format=format;e.canvas.dataset.renderComplete=String(e.missingAssets.length===0);
    }));return shopState();
  }
  function shopState(){return shopCanvases.map(e=>({id:e.id,width:e.canvas.width,height:e.canvas.height,assetIds:e.placements.map(p=>p.id),placements:e.placements.map(p=>({...p})),format:e.format,missingAssets:[...e.missingAssets],renderComplete:e.canvas.dataset.renderComplete==='true'}));}

  const shops = [['noodle', '面馆', '面'], ['pancake', '煎饼摊', '饼'], ['tea', '奶茶店', '茶'], ['sushi', '日料店', '鱼']];
  function counterCanvas(shop, width, kind) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = 210;
    canvas.dataset.counterShop = shop;
    canvas.dataset.counterWidth = String(width);
    canvas.dataset.counterKind = kind;
    canvas.dataset.renderComplete = 'false';
    canvas.id = `counter-${kind}-${shop}-${width}`;
    canvas.setAttribute('aria-label', `${shop} 柜台 ${width}×210 像素`);
    counterCanvases.push({ shop, width, kind, canvas, fittedTileWidths: [], format: null, missingAssets: [] });
    return canvas;
  }
  for (const [shop, label, signText] of shops) {
    const example = document.createElement('article');
    example.className = 'counter-example';
    const header = document.createElement('header');
    header.textContent = label;
    const preview = document.createElement('div');
    preview.className = 'counter-preview transparency-surface';
    preview.append(counterCanvas(shop, 768, 'overview'));
    const note = document.createElement('p');
    note.textContent = '768×210 概览，随版面等比缩放；原尺寸验收在下方。';
    example.append(header, preview, note);
    document.getElementById('counter-compositions').append(example);

    const widthGroup = document.createElement('article');
    widthGroup.className = 'counter-width-group';
    const heading = document.createElement('h3');
    heading.textContent = `${label} · 木台面与店面纹样`;
    widthGroup.append(heading);
    for (const width of [1920, 2560]) {
      const caption = document.createElement('p');
      caption.className = 'counter-width-caption';
      caption.textContent = `${width}×210 原尺寸 · 两端各 128px · ${width === 1920 ? '7 个完整图案片，237/238px 等宽铺满' : '9 个完整图案片，每片 256px'}`;
      const show = document.createElement('button');
      show.type = 'button';
      show.className = 'counter-shot-button';
      show.textContent = '单独查看原尺寸';
      show.addEventListener('click', () => showCounterPreview(shop, width));
      caption.append(show);
      const scroll = document.createElement('div');
      scroll.className = 'counter-width-scroll transparency-surface';
      scroll.tabIndex = 0;
      scroll.setAttribute('aria-label', `${label} ${width} 像素宽，可横向滚动`);
      scroll.append(counterCanvas(shop, width, 'actual'));
      widthGroup.append(caption, scroll);
    }
    document.getElementById('counter-width-previews').append(widthGroup);
  }

  for (const id of ['coin_jar', 'coin_jar_top']) document.getElementById('jar-composition').append(imageFor(byId.get(id)));

  async function refreshImages() {
    const format = ui.format;
    ui.loading = true;
    statusElement.textContent = `正在检查 ${manifest.assets.length} 张本地 ${format.toUpperCase()}…`;
    const results = await Promise.all(manifest.assets.map(asset => loadAsset(asset, format)));
    if (format !== ui.format) return;
    const loaded = new Map(results.map(result => [result.id, result]));
    for (const { image, asset } of imageElements) {
      const result = loaded.get(asset.id);
      image.src = pathFor(asset, format);
      image.dataset.load = result.ok ? 'ready' : 'missing';
      const card = image.closest('.asset-card');
      if (card) card.dataset.load = image.dataset.load;
    }
    // Preloading settles the resource; wait for the actual gallery elements to decode
    // before exposing a ready state to screenshots or a later format switch.
    await Promise.all(imageElements.map(({ image, asset }) => loaded.get(asset.id).ok && image.decode ? image.decode().catch(() => {}) : Promise.resolve()));
    if (format !== ui.format) return;
    await renderCounterCanvases(format);
    await renderToolPreviews();
    await renderRentPreviews();
    await renderEventPreviews();
    await renderShopPreviews();
    if (format !== ui.format) return;
    ui.loadedAssets = results.filter(result => result.ok).length;
    ui.missingAssets = results.filter(result => !result.ok).map(result => result.id);
    ui.loading = false;
    statusElement.dataset.state = ui.missingAssets.length ? 'missing' : 'ready';
    statusElement.textContent = `${format.toUpperCase()} 已就绪 ${ui.loadedAssets}/${manifest.assets.length} 张 · 当前显示 ${Number(document.getElementById('display-zoom').value) * 100}%${ui.missingAssets.length ? ' · 缺图处显示文件名，等待本地图片' : ' · 透明底与尺寸可验收'}`;
    if (ui.crowdOpen) await renderCrowd();
    return getState();
  }

  function setBackground(background) {
    if (background !== 'grid' && background !== 'avatar') throw new Error('底图只能为 grid 或 avatar。');
    ui.background = background;
    document.body.dataset.background = background;
    for (const control of document.querySelectorAll('input[name="background"]')) control.checked = control.value === background;
    return getState();
  }

  async function renderCounterCanvases(format = ui.format) {
    await Promise.all(shops.map(async ([shop, , signText]) => {
      const parts = ['left', 'mid', 'right', 'sign'];
      const results = await Promise.all(parts.map(part => loadAsset(byId.get(`counter_${shop}_${part}`), format)));
      if (format !== ui.format) return;
      const images = Object.fromEntries(parts.map((part, index) => [part, results[index].image]));
      for (const entry of counterCanvases.filter(item => item.shop === shop)) {
        const { canvas, width } = entry;
        const context = canvas.getContext('2d');
        context.clearRect(0, 0, width, 210);
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = 'high';
        const innerWidth = width - 256;
        const tileCount = Math.max(1, Math.round(innerWidth / 256));
        const widths = [];
        if (images.left) context.drawImage(images.left, 0, 0, 128, 210);
        for (let index = 0; index < tileCount; index += 1) {
          const start = 128 + Math.round(innerWidth * index / tileCount);
          const end = 128 + Math.round(innerWidth * (index + 1) / tileCount);
          widths.push(end - start);
          // Every placement uses the whole patterned tile, never a clipped half tile.
          if (images.mid) context.drawImage(images.mid, start, 0, end - start, 210);
        }
        if (images.right) context.drawImage(images.right, width - 128, 0, 128, 210);
        if (images.sign) {
          context.drawImage(images.sign, width / 2 - 60, 78, 120, 120);
          context.fillStyle = '#49372d';
          context.font = '900 45px "Microsoft YaHei",sans-serif';
          context.textAlign = 'center';
          context.textBaseline = 'middle';
          context.fillText(signText, width / 2, 138);
        }
        entry.fittedTileWidths = widths;
        entry.format = format;
        entry.missingAssets = results.filter(result => !result.ok).map(result => result.id);
        canvas.dataset.renderComplete = String(entry.missingAssets.length === 0);
        canvas.dataset.tileCount = String(tileCount);
        canvas.dataset.fittedTileWidths = widths.join(',');
        canvas.dataset.format = format;
      }
    }));
    return counterState();
  }

  function counterState() {
    return counterCanvases.filter(entry => entry.kind === 'actual').map(entry => ({
      shop: entry.shop, width: entry.canvas.width, height: entry.canvas.height,
      displayedWidth: entry.canvas.getBoundingClientRect().width, format: entry.format,
      capWidths: [128, 128], nominalTileDisplayWidth: 256,
      fittedTileWidths: [...entry.fittedTileWidths], allTilesUseWholeImage: true,
      missingAssets: [...entry.missingAssets], renderComplete: entry.canvas.dataset.renderComplete === 'true',
      canvasId: entry.canvas.id,
    }));
  }

  function setCounterView(view) {
    if (!['actual', 'fit'].includes(view)) throw new Error('柜台视图只能为 actual 或 fit。');
    ui.counterView = view;
    document.documentElement.dataset.counterView = view;
    document.getElementById('counter-view').value = view;
    return counterState();
  }

  async function showCounterPreview(shop, width) {
    if (![1920, 2560].includes(width)) throw new Error('原尺寸验收宽度只能为 1920 或 2560。');
    await window.chutanAssetPreview.ready;
    const entry = counterCanvases.find(item => item.kind === 'actual' && item.shop === shop && item.width === width);
    if (!entry) throw new Error('未找到该店柜台画布。');
    const canvas = document.getElementById('counter-shot-canvas');
    canvas.width = width;
    canvas.height = 210;
    canvas.style.width = `${width}px`;
    canvas.style.height = '210px';
    canvas.getContext('2d').drawImage(entry.canvas, 0, 0);
    canvas.dataset.counterShop = shop;
    canvas.dataset.counterWidth = String(width);
    canvas.dataset.renderComplete = entry.canvas.dataset.renderComplete;
    ui.counterShot = { shop, width, height: 210, format: ui.format };
    document.getElementById('counter-shot-label').textContent = `${shops.find(item => item[0] === shop)[1]} · ${width}×210 实际像素 · ${ui.format.toUpperCase()}`;
    document.getElementById('counter-shot-panel').hidden = false;
    document.body.style.overflow = 'hidden';
    return { ...ui.counterShot, renderComplete: entry.canvas.dataset.renderComplete === 'true' };
  }

  function closeCounterPreview() {
    ui.counterShot = null;
    document.getElementById('counter-shot-panel').hidden = true;
    document.body.style.overflow = ui.crowdOpen ? 'hidden' : '';
  }

  function setExpression(expression) {
    if (!['all', 'happy', 'neutral', 'impatient', 'angry'].includes(expression)) throw new Error('未知表情。');
    ui.expression = expression;
    for (const { asset, card } of customerCards) card.hidden = expression !== 'all' && !asset.id.endsWith(`_${expression}`);
    for (const button of document.querySelectorAll('[data-expression]')) button.setAttribute('aria-pressed', String(button.dataset.expression === expression));
    if (expression !== 'all') {
      ui.crowdExpression = expression;
      document.getElementById('crowd-expression').value = expression;
      if (ui.crowdOpen) return renderCrowd();
    }
    return Promise.resolve(getState());
  }

  function randomGenerator(seed) {
    let value = seed >>> 0;
    return () => {
      value += 0x6d2b79f5;
      let result = Math.imul(value ^ (value >>> 15), 1 | value);
      result ^= result + Math.imul(result ^ (result >>> 7), 61 | result);
      return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
    };
  }

  function createPlacements(seed) {
    const random = randomGenerator(seed);
    const placements = [];
    // 10 rows × 20 sprites, sorted back to front. Render once after images settle.
    for (let row = 0; row < 10; row += 1) {
      for (let column = 0; column < 20; column += 1) {
        const scale = 0.93 + row * 0.021 + random() * 0.07;
        placements.push({
          customer: 1 + Math.floor(random() * 16),
          x: 9 + column * 98 + (row % 2 ? -25 : 0) + (random() - 0.5) * 34,
          y: 82 + row * 104 + (random() - 0.5) * 28,
          scale,
        });
      }
    }
    return placements.sort((left, right) => left.y - right.y);
  }

  async function renderCrowd() {
    const revision = ++renderRevision;
    const expression = ui.crowdExpression;
    const format = ui.format;
    const customerIds = Array.from({ length: 16 }, (_, index) => `customer_${String(index + 1).padStart(2, '0')}_${expression}`);
    const results = await Promise.all(customerIds.map(id => loadAsset(byId.get(id), format)));
    if (revision !== renderRevision) return getState();
    const images = new Map(results.map(result => [result.id, result.image]));
    const canvas = document.getElementById('crowd-canvas');
    const context = canvas.getContext('2d');
    context.clearRect(0, 0, canvas.width, canvas.height);
    let drawn = 0;
    for (const placement of crowdPlacements) {
      const id = `customer_${String(placement.customer).padStart(2, '0')}_${expression}`;
      const image = images.get(id);
      if (!image) continue;
      const width = 110 * placement.scale;
      const height = 130 * placement.scale;
      context.drawImage(image, placement.x - width / 2 + 45, placement.y - height / 2, width, height);
      drawn += 1;
    }
    canvas.dataset.peopleCount = String(crowdPlacements.length);
    canvas.dataset.drawnCount = String(drawn);
    canvas.dataset.renderComplete = 'true';
    document.getElementById('crowd-status').textContent = `固定 ${crowdPlacements.length} 人 · 已绘制 ${drawn} 张图片 · 随机种子 ${ui.seed} · 1920×1080 画布随视口等比铺满${drawn < 200 ? ' · 源素材未齐' : ''}`;
    return getState();
  }

  async function randomize200(seed) {
    ui.seed = Number.isFinite(seed) ? seed >>> 0 : crypto.getRandomValues(new Uint32Array(1))[0];
    crowdPlacements = createPlacements(ui.seed);
    if (!ui.crowdOpen) lastFocus = document.activeElement;
    ui.crowdOpen = true;
    document.getElementById('crowd-overlay').hidden = false;
    document.body.style.overflow = 'hidden';
    document.getElementById('crowd-canvas').dataset.renderComplete = 'false';
    await renderCrowd();
    document.getElementById('crowd-close').focus({ preventScroll: true });
    return getState();
  }

  function closeCrowd() {
    ui.crowdOpen = false;
    document.getElementById('crowd-overlay').hidden = true;
    document.body.style.overflow = '';
    lastFocus?.focus({ preventScroll: true });
  }

  function getState() {
    return {
      ...ui, expectedAssets: manifest.assets.length, missingAssets: [...ui.missingAssets],
      peopleCount: crowdPlacements.length,
      drawnCount: Number(document.getElementById('crowd-canvas').dataset.drawnCount || 0),
      renderComplete: document.getElementById('crowd-canvas').dataset.renderComplete === 'true',
      displayZoom: Number(document.getElementById('display-zoom').value),
      counterPreviews: counterState(),
      toolPreviews: toolState(),
      rentPreviews: rentState(),
      eventPreviews: eventState(),
      shopPreviews: shopState(),
    };
  }

  document.querySelectorAll('input[name="background"]').forEach(control => control.addEventListener('change', () => setBackground(control.value)));
  document.querySelectorAll('[data-expression]').forEach(button => button.addEventListener('click', () => setExpression(button.dataset.expression)));
  document.getElementById('image-format').addEventListener('change', event => { ui.format = event.target.value; window.chutanAssetPreview.ready = refreshImages(); });
  document.getElementById('display-zoom').addEventListener('change', event => { document.documentElement.style.setProperty('--display-zoom', event.target.value); window.chutanAssetPreview.ready = refreshImages(); });
  document.getElementById('show-crowd').addEventListener('click', () => randomize200());
  document.getElementById('crowd-randomize').addEventListener('click', () => randomize200());
  document.getElementById('crowd-close').addEventListener('click', closeCrowd);
  document.getElementById('crowd-background').addEventListener('click', () => setBackground(ui.background === 'grid' ? 'avatar' : 'grid'));
  document.getElementById('crowd-expression').addEventListener('change', event => { ui.crowdExpression = event.target.value; renderCrowd(); });
  document.getElementById('counter-view').addEventListener('change', event => setCounterView(event.target.value));
  document.getElementById('counter-shot-close').addEventListener('click', closeCounterPreview);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && ui.counterShot) { closeCounterPreview(); return; }
    if (event.key === 'Escape' && ui.crowdOpen) closeCrowd();
    if (event.key !== 'Tab' || !ui.crowdOpen) return;
    const controls = [...document.querySelectorAll('.crowd-toolbar select, .crowd-toolbar button')];
    const first = controls[0], last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });

  crowdPlacements = createPlacements(ui.seed);
  window.chutanAssetPreview = {
    ready: refreshImages(), state: getState, randomize200, setBackground, setExpression, closeCrowd,
    counterState, setCounterView, showCounterPreview, closeCounterPreview, renderCounterPreviews: renderCounterCanvases,
    toolState, renderToolPreviews,
    rentState, renderRentPreviews,
    eventState, renderEventPreviews,
    shopState, renderShopPreviews,
    async setCrowdExpression(expression) {
      if (!['happy', 'neutral', 'impatient', 'angry'].includes(expression)) throw new Error('未知表情。');
      ui.crowdExpression = expression;
      document.getElementById('crowd-expression').value = expression;
      return renderCrowd();
    },
  };
})();
