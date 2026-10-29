/** Page-rendered choices for embedded/OSR browsers: never opens a native select popup. */
export function installInlineSelects(root){
 const controls=new Map();let opened=null,serial=0,busy=false;
 function label(select){return select.getAttribute('aria-label')||select.closest('label')?.querySelector('b')?.textContent||select.closest('label')?.firstChild?.textContent?.trim()||'选择选项';}
 function syncOne(select,c){
  const value=select.selectedOptions[0]?.textContent||'请选择';if(c.text.textContent!==value)c.text.textContent=value;
  if(c.button.disabled!==(select.disabled||busy))c.button.disabled=select.disabled||busy;
  c.button.setAttribute('aria-label',label(select));c.button.dataset.value=select.value;
  if(opened?.select===select&&(select.disabled||!select.isConnected||!c.button.getClientRects().length))close(false);
 }
 function close(focus=false){if(!opened)return;const {button,popup}=opened;opened=null;popup.remove();button.setAttribute('aria-expanded','false');button.removeAttribute('aria-activedescendant');if(focus&&button.isConnected&&!button.disabled)button.focus({preventScroll:true});}
 function choose(c,option){if(busy||c.select.disabled||option.disabled||option.parentElement?.disabled)return;const value=option.value,changed=c.select.value!==value;close(true);c.select.value=value;syncOne(c.select,c);if(changed){c.select.dispatchEvent(new Event('input',{bubbles:true}));c.select.dispatchEvent(new Event('change',{bubbles:true}));}queueMicrotask(sync);}
 function open(c,edge){
  if(busy||c.select.disabled)return;if(opened?.select===c.select){close(true);return;}close();
  const popup=document.createElement('div');popup.className='inline-select-popup';popup.id=c.popupId;popup.setAttribute('role','listbox');popup.setAttribute('aria-label',label(c.select));
  const items=[];for(const option of c.select.options){const item=document.createElement('button');item.type='button';item.className='inline-select-option';item.textContent=option.textContent;item.setAttribute('role','option');item.dataset.value=option.value;item.setAttribute('aria-selected',String(option.selected));item.disabled=option.disabled||!!option.parentElement?.disabled;item.tabIndex=-1;item.addEventListener('click',()=>choose(c,option));popup.append(item);items.push(item);}
  document.body.append(popup);c.button.setAttribute('aria-expanded','true');opened={...c,popup,items,index:-1};
  positionPopup();
  const initial=edge==='last'?items.length-1:Math.max(0,items.findIndex(item=>item.getAttribute('aria-selected')==='true'));focusOption(initial,1);
  popup.addEventListener('keydown',key);popup.addEventListener('dblclick',e=>e.stopPropagation());
 }
 function positionPopup(){if(!opened)return;const {button,popup,items}=opened,rect=button.getBoundingClientRect(),clip=button.closest('.menu-scroll')?.getBoundingClientRect();if(!button.isConnected||!button.getClientRects().length||(clip&&(rect.bottom<clip.top||rect.top>clip.bottom))){close(false);return;}const width=Math.min(Math.max(180,rect.width),innerWidth-16),desired=Math.min(320,items.length*40+12),below=innerHeight-rect.bottom-12,above=rect.top-12,up=below<desired&&above>below,height=Math.max(40,Math.min(desired,up?above:below));popup.style.width=`${width}px`;popup.style.maxHeight=`${height}px`;popup.style.left=`${Math.max(8,Math.min(rect.left,innerWidth-width-8))}px`;popup.style.top=`${Math.max(8,up?rect.top-height-5:rect.bottom+5)}px`;}
 function focusOption(index,direction){if(!opened)return;const {items}=opened;for(let tries=0;tries<items.length;tries++){index=(index+items.length)%items.length;if(!items[index].disabled){opened.index=index;items[index].focus({preventScroll:true});items[index].scrollIntoView({block:'nearest'});return;}index+=direction;}}
 function key(event){if(!opened)return;
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close(true);}
  else if(event.key==='Tab'){close(true);}
  else if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();event.stopPropagation();focusOption(event.key==='Home'?0:event.key==='End'?opened.items.length-1:opened.index+(event.key==='ArrowDown'?1:-1),event.key==='ArrowUp'||event.key==='End'?-1:1);}
  else if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();opened.items[opened.index]?.click();}
 }
 function enhance(select){
  const wrapper=document.createElement('span');wrapper.className='inline-select';const button=document.createElement('button');button.type='button';button.className='inline-select-trigger';button.setAttribute('role','combobox');button.setAttribute('aria-haspopup','listbox');button.setAttribute('aria-expanded','false');
  const text=document.createElement('span'),arrow=document.createElement('i');arrow.className='inline-select-chevron';arrow.setAttribute('aria-hidden','true');button.append(text,arrow);
  const popupId=`inline-select-options-${++serial}`;button.setAttribute('aria-controls',popupId);if(select.id){button.id=select.id+'-trigger';button.dataset.selectId=select.id;}
  select.before(wrapper);wrapper.append(button,select);select.classList.add('native-select-state');select.tabIndex=-1;select.setAttribute('aria-hidden','true');const c={select,wrapper,button,text,popupId};controls.set(select,c);
  button.addEventListener('click',()=>open(c));button.addEventListener('keydown',event=>{if(['ArrowDown','ArrowUp','Enter',' '].includes(event.key)){event.preventDefault();event.stopPropagation();if(!opened)open(c,event.key==='ArrowUp'?'last':undefined);}else if(event.key==='Escape'&&opened){event.preventDefault();event.stopPropagation();close(true);}});
  select.addEventListener('change',()=>queueMicrotask(sync));syncOne(select,c);
 }
 function sync(){for(const select of root.querySelectorAll('select')){if(!controls.has(select))enhance(select);else syncOne(select,controls.get(select));}for(const[select]of controls)if(!select.isConnected){if(opened?.select===select)close(false);controls.delete(select);}}
 const outside=event=>{if(opened&&!opened.popup.contains(event.target)&&!opened.button.contains(event.target))close(false);};
 const scroll=event=>{if(opened&&!opened.popup.contains(event.target))positionPopup();};
 const dismiss=()=>close(false);
 const observer=new MutationObserver(records=>{if(records.some(r=>r.type==='childList'||r.target.tagName==='SELECT'||r.target.tagName==='OPTION'))sync();});
 sync();observer.observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:['disabled','selected','value','aria-label','class']});
 document.addEventListener('pointerdown',outside,true);document.addEventListener('focusin',outside);document.addEventListener('scroll',scroll,true);window.addEventListener('resize',dismiss);window.addEventListener('blur',dismiss);
 return{sync,close,setBusy(value){busy=!!value;if(busy)close(false);sync();},destroy(){close();observer.disconnect();document.removeEventListener('pointerdown',outside,true);document.removeEventListener('focusin',outside);document.removeEventListener('scroll',scroll,true);window.removeEventListener('resize',dismiss);window.removeEventListener('blur',dismiss);for(const[select,c]of controls){select.classList.remove('native-select-state');select.removeAttribute('aria-hidden');select.removeAttribute('tabindex');c.wrapper.before(select);c.wrapper.remove();}controls.clear();}};
}
