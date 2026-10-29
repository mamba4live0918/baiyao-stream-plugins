const TypingLockModel=(()=>{
    const keys=Object.freeze({Space:'空格',KeyF:'F',KeyJ:'J',Enter:'回车'}),epsilon=1e-9;
    // 停手回落：停手 grace 毫秒后，每秒回落 rate（按一层的比例，0.35 = 每秒掉 35% 一层）。可由设置调整。
    let grace=240,rate=.35;
    function setDecay(options){const r=Number(options?.rate),g=Number(options?.graceMs);if(Number.isFinite(r)&&r>=0&&r<=5)rate=r;if(Number.isFinite(g)&&g>=0&&g<=10000)grace=g;return {rate,graceMs:grace};}
    // Tiers are user-defined. Each batch snapshots its tier id, display name and look so later edits never alter queued locks.
    const looks=Object.freeze({normal:'普通',rare:'稀有',legendary:'传说'}),own=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);
    const keyNames=Object.freeze({Space:'空格',Enter:'回车',Tab:'Tab',Escape:'Esc',Backspace:'退格',Delete:'Delete',Insert:'Insert',Home:'Home',End:'End',PageUp:'Page Up',PageDown:'Page Down',ArrowUp:'上方向键 ↑',ArrowDown:'下方向键 ↓',ArrowLeft:'左方向键 ←',ArrowRight:'右方向键 →',Backquote:'`',Minus:'-',Equal:'=',BracketLeft:'[',BracketRight:']',Backslash:'\\',Semicolon:';',Quote:"'",Comma:',',Period:'.',Slash:'/',IntlBackslash:'国际键 \\',IntlRo:'国际键 Ro',IntlYen:'国际键 ¥',CapsLock:'Caps Lock',NumLock:'Num Lock',ScrollLock:'Scroll Lock',PrintScreen:'Print Screen',Pause:'Pause',ContextMenu:'菜单键',NumpadAdd:'小键盘 +',NumpadSubtract:'小键盘 -',NumpadMultiply:'小键盘 ×',NumpadDivide:'小键盘 ÷',NumpadDecimal:'小键盘 .',NumpadEqual:'小键盘 =',NumpadComma:'小键盘 ,'});
    const canonicalKey=code=>code==='NumpadEnter'?'Enter':code;
    function keyValid(code){return typeof code==='string'&&(own(keyNames,canonicalKey(code))||/^Key[A-Z]$/.test(code)||/^Digit[0-9]$/.test(code)||/^Numpad[0-9]$/.test(code)||/^F(?:[1-9]|1\d|2[0-4])$/.test(code));}
    function keyLabel(code){
        if(!keyValid(code))return '';code=canonicalKey(code);
        return keyNames[code]||(/^Key[A-Z]$/.test(code)?code.slice(3):/^Digit[0-9]$/.test(code)?code.slice(5):/^Numpad[0-9]$/.test(code)?'小键盘 '+code.slice(6):code);
    }
    const virtualKeys=Object.freeze({8:'Backspace',9:'Tab',13:'Enter',19:'Pause',20:'CapsLock',27:'Escape',32:'Space',33:'PageUp',34:'PageDown',35:'End',36:'Home',37:'ArrowLeft',38:'ArrowUp',39:'ArrowRight',40:'ArrowDown',44:'PrintScreen',45:'Insert',46:'Delete',93:'ContextMenu',106:'NumpadMultiply',107:'NumpadAdd',108:'NumpadComma',109:'NumpadSubtract',110:'NumpadDecimal',111:'NumpadDivide',144:'NumLock',145:'ScrollLock',186:'Semicolon',187:'Equal',188:'Comma',189:'Minus',190:'Period',191:'Slash',192:'Backquote',219:'BracketLeft',220:'Backslash',221:'BracketRight',222:'Quote',226:'IntlBackslash'});
    const namedKeys=Object.freeze({' ':'Space',Spacebar:'Space',Enter:'Enter',Escape:'Escape',Esc:'Escape',Tab:'Tab',Backspace:'Backspace',Delete:'Delete',Del:'Delete',Insert:'Insert',Ins:'Insert',ArrowUp:'ArrowUp',ArrowDown:'ArrowDown',ArrowLeft:'ArrowLeft',ArrowRight:'ArrowRight',Up:'ArrowUp',Down:'ArrowDown',Left:'ArrowLeft',Right:'ArrowRight',Home:'Home',End:'End',PageUp:'PageUp',PageDown:'PageDown',CapsLock:'CapsLock',NumLock:'NumLock',ScrollLock:'ScrollLock',PrintScreen:'PrintScreen',Pause:'Pause',ContextMenu:'ContextMenu'});
    const characterKeys=Object.freeze({'`':'Backquote','~':'Backquote','-':'Minus','_':'Minus','=':'Equal','+':'Equal','[':'BracketLeft','{':'BracketLeft',']':'BracketRight','}':'BracketRight','\\':'Backslash','|':'Backslash',';':'Semicolon',':':'Semicolon',"'":'Quote','"':'Quote',',':'Comma','<':'Comma','.':'Period','>':'Period','/':'Slash','?':'Slash','!':'Digit1','@':'Digit2','#':'Digit3','$':'Digit4','%':'Digit5','^':'Digit6','&':'Digit7','*':'Digit8','(':'Digit9',')':'Digit0'});
    const padNavigation=Object.freeze({Insert:'Numpad0',Ins:'Numpad0',End:'Numpad1',ArrowDown:'Numpad2',Down:'Numpad2',PageDown:'Numpad3',ArrowLeft:'Numpad4',Left:'Numpad4',Clear:'Numpad5',ArrowRight:'Numpad6',Right:'Numpad6',Home:'Numpad7',ArrowUp:'Numpad8',Up:'Numpad8',PageUp:'Numpad9',Delete:'NumpadDecimal',Del:'NumpadDecimal'});
    const padVirtual=Object.freeze({12:'Numpad5',33:'Numpad9',34:'Numpad3',35:'Numpad1',36:'Numpad7',37:'Numpad4',38:'Numpad8',39:'Numpad6',40:'Numpad2',45:'Numpad0',46:'NumpadDecimal'});
    const padCharacters=Object.freeze({'+':'NumpadAdd','-':'NumpadSubtract','*':'NumpadMultiply','/':'NumpadDivide','.':'NumpadDecimal',',':'NumpadComma','=':'NumpadEqual',Enter:'Enter'});
    const modifierNames=new Set(['Shift','Control','Alt','Meta','AltGraph','OS','Win','Super','Hyper','Fn','FnLock','Symbol','SymbolLock']);
    const lookupKey=(map,value)=>own(map,value)?map[value]:'';
    function keyFromEvent(event){
        if(!event||event.isComposing||event.key==='Process')return '';
        const vk=Number(event.keyCode||event.which||0),code=typeof event.code==='string'?event.code:'',key=typeof event.key==='string'?event.key:'',pad=Number(event.location)===3;
        if(vk===229||modifierNames.has(key)||/^(?:Shift|Control|Alt|Meta)(?:Left|Right)?$/.test(code))return '';
        const recoverPad=()=>{
            if(vk>=96&&vk<=105)return 'Numpad'+(vk-96);
            if(vk>=106&&vk<=111)return virtualKeys[vk];
            if(!pad)return '';
            if(vk>=48&&vk<=57)return 'Numpad'+(vk-48);
            return lookupKey(padVirtual,vk)||lookupKey(padNavigation,key)||(/^[0-9]$/.test(key)?'Numpad'+key:'')||lookupKey(padCharacters,key)||'';
        };
        // Native physical codes lead. An old host shim can label numpad navigation as arrows;
        // location=3 recovers those keys independently of the current NumLock text.
        if(keyValid(code)){
            if(pad&&!/^Numpad/.test(code)&&(/^Digit[0-9]$/.test(code)||own(padNavigation,code)||['Period','Comma','Slash','Equal','Minus'].includes(code))){const recovered=recoverPad();if(recovered)return recovered;}
            return canonicalKey(code);
        }
        if([16,17,18,91,92,224,225].includes(vk))return '';
        const recovered=recoverPad();if(recovered)return recovered;
        if(vk>=65&&vk<=90)return 'Key'+String.fromCharCode(vk);
        if(vk>=48&&vk<=57)return 'Digit'+(vk-48);
        if(vk>=112&&vk<=135)return 'F'+(vk-111);
        return lookupKey(virtualKeys,vk)||lookupKey(namedKeys,key)||(/^Key[A-Z]$/.test(key)?key:/^[a-z]$/i.test(key)?'Key'+key.toUpperCase():/^[0-9]$/.test(key)?'Digit'+key:/^F(?:[1-9]|1\d|2[0-4])$/.test(key)?key:'')||lookupKey(characterKeys,key)||'';
    }
    const TARGET_MIN=1,TARGET_MAX=99999,EFFECTIVE_TARGET_MAX=1000000000,fallbackTarget=60,BLINDBOX_BATCH_MAX=20000;
    function integer(value,min,max){const text=String(value).trim(),n=Number(text);return /^\d+$/.test(text)&&Number.isSafeInteger(n)&&n>=min&&n<=max?n:null;}
    const layers=value=>integer(value,1,20000),target=value=>integer(value,TARGET_MIN,TARGET_MAX),countValid=value=>Number.isSafeInteger(value)&&value>0;
    const effectiveTarget=value=>integer(value,1,EFFECTIVE_TARGET_MAX),challengeModes=new Set(['bar','count']);
    const scaledTarget=(base,multiplier)=>Math.min(EFFECTIVE_TARGET_MAX,base*multiplier);
    const tierId=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,40}$/.test(value);
    const tierName=value=>typeof value==='string'&&value.trim().length>0&&value.length<=40;
    const compiledPools=new WeakMap(),seedOk=value=>Number.isInteger(value)&&value>=0&&value<=4294967295;
    function poolEntries(raw){
        if(!Array.isArray(raw)||!raw.length||raw.length>50)return null;
        const ids=new Set(),pool=[];
        for(const item of raw){
            if(!item||!tierId(item.id)||ids.has(item.id)||!tierName(item.name)||/[\u0000-\u001f\u007f]/.test(item.name))return null;
            const min=target(item.min),max=target(item.max),text=String(item.percent??'').trim(),percent=Number(text),basis=Math.round(percent*100);
            if(min===null||max===null||min>max||!/^\d+(?:\.\d{1,2})?$/.test(text)||!Number.isFinite(percent)||percent<0||percent>100||Math.abs(percent*100-basis)>1e-7)return null;
            if(item.enabled!==undefined&&typeof item.enabled!=='boolean'||item.look!==undefined&&!own(looks,item.look))return null;
            ids.add(item.id);pool.push({id:item.id,name:item.name.trim(),min,max,percent:basis/100,enabled:item.enabled!==false,look:item.look||'normal'});
        }
        return pool;
    }
    function cleanTargetPool(raw){
        const pool=poolEntries(raw);if(!pool)return null;
        return pool.reduce((sum,item)=>sum+(item.enabled?Math.round(item.percent*100):0),0)===10000?pool:null;
    }
    function normalizeTargetPool(raw){
        const pool=poolEntries(raw);if(!pool)return null;
        const enabled=pool.filter(item=>item.enabled);if(!enabled.length)return null;
        const sum=enabled.reduce((total,item)=>total+Math.round(item.percent*100),0);
        if(!sum)return null;
        const shares=enabled.map((item,index)=>{const numerator=Math.round(item.percent*100)*10000;return {item,index,base:Math.floor(numerator/sum),remainder:numerator%sum};});
        let left=10000-shares.reduce((total,share)=>total+share.base,0);
        for(const share of [...shares].sort((a,b)=>b.remainder-a.remainder||a.index-b.index)){if(left>0){share.base++;left--;}}
        for(const share of shares)share.item.percent=share.base/100;
        return pool;
    }
    function compilePool(pool){
        const entries=pool.filter(item=>item.enabled&&item.percent>0),bounds=[];let total=0;
        for(const item of entries){total+=Math.round(item.percent*100);bounds.push(total/10000);}
        const fixed=entries.every(item=>item.min===entries[0].min&&item.max===entries[0].min)?entries[0].min:null;
        return {entries,bounds,fixed,minimum:Math.min(...entries.map(item=>item.min))};
    }
    function immutablePool(raw){
        const pool=cleanTargetPool(raw);if(!pool)throw new TypeError('Invalid target pool');
        const enabled=Object.freeze(pool.filter(item=>item.enabled).map(item=>Object.freeze(item)));
        compiledPools.set(enabled,compilePool(enabled));return enabled;
    }
    function choose(compiled,a,b){
        let low=0,high=compiled.bounds.length-1;
        while(low<high){const middle=(low+high)>>1;if(a<compiled.bounds[middle])high=middle;else low=middle+1;}
        const item=compiled.entries[low];return {target:item.min+Math.floor(b*(item.max-item.min+1)),tier:item.id,tierName:item.name,look:item.look};
    }
    function drawTarget(raw,rng=Math.random){
        const pool=cleanTargetPool(raw);if(!pool||typeof rng!=='function')return null;
        try{const a=rng(),b=rng();return Number.isFinite(a)&&a>=0&&a<1&&Number.isFinite(b)&&b>=0&&b<1?choose(compilePool(pool),a,b):null;}catch{return null;}
    }
    const randomStep=value=>(Math.imul(value,1664525)+1013904223)>>>0;
    // Jump the saved generator exactly, without allocating or visiting constant-target layers.
    function skipDraws(value,count){
        let steps=BigInt(count)*2n,a=1664525,c=1013904223;
        while(steps>0n){if(steps&1n)value=(Math.imul(a,value)+c)>>>0;c=(Math.imul(a,c)+c)>>>0;a=Math.imul(a,a)>>>0;steps>>=1n;}
        return value;
    }
    function drawEntry(entry){
        entry.rngState=randomStep(entry.rngState);const a=entry.rngState/4294967296;
        entry.rngState=randomStep(entry.rngState);const drawn=choose(compiledPools.get(entry.targetPool),a,entry.rngState/4294967296);
        Object.assign(entry,drawn,{baseTarget:drawn.target,target:scaledTarget(drawn.target,entry.multiplier),drawn:true,targetAdjusted:false});
    }
    function config(value){
        const tier=tierId(value?.tier)?value.tier:'normal',look=own(looks,value?.look)?value.look:own(looks,tier)?tier:'normal';
        const name=tierName(value?.tierName)?value.tierName.trim():own(looks,tier)?looks[tier]:looks[look];
        const baseTarget=target(value?.baseTarget)||target(value?.target)||fallbackTarget,multiplier=effectiveTarget(value?.multiplier??1)||1;
        return {key:keyValid(value?.key)?canonicalKey(value.key):'Space',baseTarget,multiplier,target:scaledTarget(baseTarget,multiplier),targetAdjusted:false,challengeMode:challengeModes.has(value?.challengeMode)?value.challengeMode:'bar',tier,tierName:name,look};
    }
    const entryValid=entry=>tierId(entry.tier)&&tierName(entry.tierName)&&own(looks,entry.look)&&challengeModes.has(entry.challengeMode)&&Number.isSafeInteger(entry.baseTarget)&&target(entry.baseTarget)!==null&&Number.isSafeInteger(entry.multiplier)&&effectiveTarget(entry.multiplier)!==null&&typeof entry.targetAdjusted==='boolean'&&(entry.targetAdjusted||entry.target===scaledTarget(entry.baseTarget,entry.multiplier));
    // Source metadata is detached from the caller and must survive JSON storage unchanged.
    function snapshot(value,seen=new Set(),depth=0){
        if(value===undefined)return null;
        if(value===null||typeof value==='string'||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value))return value;
        if(typeof value!=='object'||depth>32||seen.has(value))throw new TypeError('Invalid lock source');
        if(!Array.isArray(value)&&Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null)throw new TypeError('Invalid lock source');
        seen.add(value);const result=Array.isArray(value)?[]:{};
        for(const key of Object.keys(value))Object.defineProperty(result,key,{value:snapshot(value[key],seen,depth+1),enumerable:true,writable:true,configurable:true});
        seen.delete(value);return result;
    }
    function batch(count,settings){
        if(settings?.multiplier!==undefined&&effectiveTarget(settings.multiplier)===null||settings?.challengeMode!==undefined&&!challengeModes.has(settings.challengeMode))throw new TypeError('Invalid challenge settings');
        const result={...config(settings),layers:count,source:snapshot(settings?.source)};
        if(settings?.targetPool!==undefined&&settings.targetPool!==null){
            const pool=immutablePool(settings.targetPool);if(!compiledPools.get(pool).fixed&&count>BLINDBOX_BATCH_MAX)throw new RangeError('Blindbox batch too large');
            const seed=settings.rngState??settings.seed??Math.floor(Math.random()*4294967296);if(!seedOk(seed))throw new TypeError('Invalid random state');
            Object.assign(result,{targetMode:'blindbox',targetPool:pool,rngState:seed,drawn:false});
        }
        return result;
    }
    function front(state){
        const first=state.queue[0];
        if(first){if(first.targetPool&&!first.drawn)drawEntry(first);state.target=first.target;state.baseTarget=first.baseTarget;state.multiplier=first.multiplier;state.targetAdjusted=first.targetAdjusted;state.challengeMode=first.challengeMode;state.key=first.key;state.tier=first.tier;state.tierName=first.tierName;state.look=first.look;state.source=first.source;
            if(first.targetPool){state.targetMode='blindbox';state.targetPool=first.targetPool;}else{delete state.targetMode;delete state.targetPool;}}
        else{delete state.targetMode;delete state.targetPool;}
    }
    function valid(state){
        if(!state||!Number.isSafeInteger(state.layers)||state.layers<0||!Number.isSafeInteger(state.target)||effectiveTarget(state.target)===null||!keyValid(state.key)||!entryValid(state)||!Array.isArray(state.queue))return false;
        if(!Number.isFinite(state.progress)||state.progress<0||!Number.isFinite(state.relief)||state.relief<0||!Number.isFinite(state.updatedAt)||!Number.isFinite(state.lastHitAt))return false;
        if(!Number.isSafeInteger(state.totalHits)||state.totalHits<0||state.challengeMode==='count'&&!Number.isSafeInteger(state.progress))return false;
        let total=0;
        for(const entry of state.queue){
            if(!entry||!countValid(entry.layers)||!Number.isSafeInteger(entry.target)||effectiveTarget(entry.target)===null||!keyValid(entry.key)||!entryValid(entry)||entry!==state.queue[0]&&entry.targetAdjusted)return false;
            if(entry.targetPool&&(!compiledPools.has(entry.targetPool)||!seedOk(entry.rngState)||typeof entry.drawn!=='boolean'||!compiledPools.get(entry.targetPool).fixed&&entry.layers>BLINDBOX_BATCH_MAX))return false;
            total+=entry.layers;if(!Number.isSafeInteger(total))return false;
        }
        if(total!==state.layers)return false;
        if(!total)return state.queue.length===0&&state.progress===0&&state.relief===0;
        const first=state.queue[0];
        return (!first.targetPool||first.drawn)&&first.target===state.target&&first.baseTarget===state.baseTarget&&first.multiplier===state.multiplier&&first.targetAdjusted===state.targetAdjusted&&first.challengeMode===state.challengeMode&&first.key===state.key&&first.tier===state.tier&&first.tierName===state.tierName&&first.look===state.look&&state.progress+state.relief<state.target;
    }
    function create(count,settings,now){
        if(!countValid(count)||!Number.isFinite(now))return null;
        try{const first=batch(count,settings),state={...first,queue:[first],progress:0,relief:0,totalHits:0,lastHitAt:now,updatedAt:now};front(state);delete state.drawn;delete state.rngState;return state;}catch{return null;}
    }
    function decay(state,now){const current=Math.max(state.updatedAt,now),elapsed=Math.max(0,current-Math.max(state.updatedAt,state.lastHitAt+grace));if(state.challengeMode!=='count')state.progress=Math.max(0,state.progress-elapsed*state.target*rate/1000);state.updatedAt=current;}
    function tick(state,now){if(Number.isFinite(now)&&valid(state))decay(state,now);}
    function add(state,count,now,settings){
        if(!countValid(count)||!Number.isFinite(now)||!valid(state)||!Number.isSafeInteger(state.layers+count))return false;
        let entry;try{entry=batch(count,settings===undefined?state:settings);}catch{return false;}
        decay(state,now);state.queue.push(entry);state.layers+=count;front(state);return true;
    }
    function clear(state,count){
        const entry=state.queue[0];entry.layers-=count;state.layers-=count;
        if(entry.layers===0)state.queue.shift();
        else if(entry.targetPool){if(count>1)entry.rngState=skipDraws(entry.rngState,count-1);entry.drawn=false;}
        else{entry.target=scaledTarget(entry.baseTarget,entry.multiplier);entry.targetAdjusted=false;}
        state.progress=0;state.relief=0;state.lastHitAt=state.updatedAt;front(state);
    }
    function press(state,now){
        if(!Number.isFinite(now)||!valid(state)||state.layers===0)return false;
        decay(state,now);state.lastHitAt=state.updatedAt;state.progress+=1;state.totalHits=Math.min(Number.MAX_SAFE_INTEGER,state.totalHits+1);
        if(state.progress+state.relief+epsilon>=state.target){clear(state,1);return true;}return false;
    }
    function relieve(state,points,now){
        if(!Number.isFinite(points)||points<0||points>Number.MAX_SAFE_INTEGER||!Number.isFinite(now))return null;
        if(state&&!valid(state))return null;
        const result={applied:0,unused:points,clearedLayers:0};
        if(!state||!state.layers||points===0)return result;
        decay(state,now);
        while(state.layers&&result.unused>0){
            // Whole untouched layers are consumed in one step even for billion-layer batches.
            if(state.progress===0&&state.relief===0&&!state.targetAdjusted&&result.unused>=state.target&&(!state.queue[0].targetPool||compiledPools.get(state.queue[0].targetPool).fixed)){
                const count=Math.min(state.queue[0].layers,Math.floor(result.unused/state.target)),cost=count*state.target;
                result.unused-=cost;result.clearedLayers+=count;clear(state,count);continue;
            }
            const remaining=state.target-state.relief-state.progress,amount=Math.min(result.unused,remaining);
            state.relief+=amount;result.unused-=amount;
            if(remaining-amount<=epsilon){clear(state,1);result.clearedLayers++;}else break;
        }
        result.applied=points-result.unused;return result;
    }
    function multiplyRemaining(state,factor,now,repetitions=1){
        if(!valid(state)||!state.layers||!Number.isFinite(now)||!Number.isSafeInteger(factor)||integer(factor,1,1000)===null||!Number.isSafeInteger(repetitions)||integer(repetitions,1,99000000)===null||factor===1)return false;
        decay(state,now);
        let changed=false;
        for(let index=0;index<state.queue.length;index++){
            const entry=state.queue[index],oldMultiplier=entry.multiplier,oldTarget=entry.target;
            let multiplier=oldMultiplier;
            // Any factor >=2 reaches the one-billion ceiling within 30 iterations.
            for(let n=0;n<repetitions&&multiplier<EFFECTIVE_TARGET_MAX;n++)multiplier=Math.min(EFFECTIVE_TARGET_MAX,multiplier*factor);
            const minimum=entry.targetPool?compiledPools.get(entry.targetPool).minimum:entry.baseTarget;
            const futureChanged=(index>0||entry.layers>1)&&scaledTarget(minimum,oldMultiplier)!==scaledTarget(minimum,multiplier);
            let nextTarget=scaledTarget(entry.baseTarget,multiplier);
            if(index===0){
                const credit=state.progress+state.relief;nextTarget=oldTarget;
                for(let n=0;n<repetitions&&nextTarget<EFFECTIVE_TARGET_MAX;n++)nextTarget=Math.min(EFFECTIVE_TARGET_MAX,Math.ceil(credit+(nextTarget-credit)*factor));
            }
            if(nextTarget===oldTarget&&!futureChanged)continue;
            entry.multiplier=multiplier;entry.target=nextTarget;entry.targetAdjusted=index===0&&nextTarget!==scaledTarget(entry.baseTarget,multiplier);changed=true;
        }
        front(state);return changed;
    }
    function restore(value,now){
        if(!value||!countValid(value.layers)||!Number.isFinite(now))return null;
        try{
            const legacy=!own(value,'queue');
            const queue=legacy?[{layers:value.layers,target:value.target,key:value.key,tier:'normal',source:null}]:value.queue;
            if(!Array.isArray(queue))return null;
            // V1.3 saves had fixed tiers without names or looks; derive them from the old id.
            const upgrade=entry=>{const tier=entry.tier,look=own(looks,entry.look)?entry.look:own(looks,tier)?tier:'normal',multiplier=entry.multiplier??1;return {tier,look,tierName:tierName(entry.tierName)?entry.tierName:own(looks,tier)?looks[tier]:looks[look],multiplier,baseTarget:entry.baseTarget??entry.target/multiplier,targetAdjusted:entry.targetAdjusted??false,challengeMode:entry.challengeMode??'bar'};};
            const head=upgrade({...value,tier:legacy?'normal':value.tier});
            const state={layers:value.layers,target:value.target,key:canonicalKey(value.key),...head,progress:value.progress,relief:legacy?0:value.relief,totalHits:value.totalHits??Math.floor(value.progress),updatedAt:value.updatedAt,lastHitAt:value.lastHitAt,
                queue:queue.map(entry=>{
                    if(!entry)return entry;
                    const restored={layers:entry.layers,target:entry.target,key:canonicalKey(entry.key),...upgrade(entry),source:snapshot(entry.source)};
                    if(entry.targetPool!==undefined&&entry.targetPool!==null){
                        const pool=immutablePool(entry.targetPool);Object.assign(restored,{targetMode:'blindbox',targetPool:pool,rngState:entry.rngState,drawn:entry.drawn});
                        if(!seedOk(entry.rngState)||typeof entry.drawn!=='boolean')throw new TypeError('Invalid saved random state');
                        if(entry.drawn&&!pool.some(item=>item.enabled&&item.percent>0&&item.id===restored.tier&&item.name===restored.tierName&&item.look===restored.look&&restored.baseTarget>=item.min&&restored.baseTarget<=item.max))throw new TypeError('Invalid saved layer draw');
                    }else if(entry.targetMode==='blindbox')throw new TypeError('Missing saved target pool');
                    return restored;
                })};
            if(!valid(state))return null;
            state.updatedAt=Math.min(state.updatedAt,now);state.lastHitAt=Math.min(state.lastHitAt,now);front(state);decay(state,now);return state;
        }catch{return null;}
    }
    return Object.freeze({setDecay,layers,target,effectiveTarget,keys,keyValid,keyLabel,keyFromEvent,looks,TARGET_MIN,TARGET_MAX,EFFECTIVE_TARGET_MAX,BLINDBOX_BATCH_MAX,tierId,config,cleanTargetPool,normalizeTargetPool,drawTarget,create,tick,add,press,relieve,multiplyRemaining,restore});
})();
if(typeof module==='object'&&module.exports)module.exports=TypingLockModel;
