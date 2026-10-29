/* OBS 浏览器源键盘兼容：OBS「交互」窗口转发的按键没有 event.code，长按时也不带 repeat 标记。
   在所有页面脚本之前补齐 code / key，并把长按自动重复标记为 repeat。普通浏览器中原生值不变。 */
(function(){'use strict';if(window.__obsKeyShim)return;window.__obsKeyShim=1;
var VK={8:'Backspace',9:'Tab',13:'Enter',16:'ShiftLeft',17:'ControlLeft',18:'AltLeft',27:'Escape',32:'Space',33:'PageUp',34:'PageDown',35:'End',36:'Home',37:'ArrowLeft',38:'ArrowUp',39:'ArrowRight',40:'ArrowDown',45:'Insert',46:'Delete',186:'Semicolon',187:'Equal',188:'Comma',189:'Minus',190:'Period',191:'Slash',192:'Backquote',219:'BracketLeft',220:'Backslash',221:'BracketRight',222:'Quote'};
var NAMED={' ':'Space',Spacebar:'Space',Enter:'Enter',Escape:'Escape',Esc:'Escape',Tab:'Tab',Backspace:'Backspace',Delete:'Delete',Del:'Delete',ArrowUp:'ArrowUp',ArrowDown:'ArrowDown',ArrowLeft:'ArrowLeft',ArrowRight:'ArrowRight',Up:'ArrowUp',Down:'ArrowDown',Left:'ArrowLeft',Right:'ArrowRight',Home:'Home',End:'End',PageUp:'PageUp',PageDown:'PageDown'};
var KEYS={Space:' ',Enter:'Enter',Escape:'Escape',Tab:'Tab',Backspace:'Backspace',Delete:'Delete',ArrowUp:'ArrowUp',ArrowDown:'ArrowDown',ArrowLeft:'ArrowLeft',ArrowRight:'ArrowRight',Home:'Home',End:'End',PageUp:'PageUp',PageDown:'PageDown'};
function missing(v){return typeof v!=='string'||!v||v==='Unidentified';}
function derive(e){var c=e.keyCode||e.which||0,k=e.key;
 if(c===229||k==='Process')return '';
 if(c>=65&&c<=90)return 'Key'+String.fromCharCode(c);
 if(c>=48&&c<=57)return 'Digit'+String.fromCharCode(c);
 if(c>=96&&c<=105)return 'Numpad'+(c-96);
 if(c>=112&&c<=123)return 'F'+(c-111);
 if(VK[c])return VK[c];
 if(typeof k==='string'){if(NAMED[k])return NAMED[k];if(/^[a-z]$/i.test(k))return 'Key'+k.toUpperCase();if(/^[0-9]$/.test(k))return 'Digit'+k;}
 return '';}
function define(e,name,value){try{Object.defineProperty(e,name,{value:value,configurable:true,enumerable:true});}catch(_){}}
function fix(e){if(!e||e.__obsKeyFixed)return;define(e,'__obsKeyFixed',true);
 if(missing(e.code)){var code=derive(e);if(code)define(e,'code',code);}
 if(missing(e.key)&&typeof e.code==='string'){var key=KEYS[e.code]||(/^Key[A-Z]$/.test(e.code)?(e.shiftKey?e.code.slice(3):e.code.slice(3).toLowerCase()):/^Digit\d$/.test(e.code)?e.code.slice(5):'');if(key)define(e,'key',key);}}
var lastDown={},lastUp={},held={};
function id(e){return e.code||('vk'+(e.keyCode||0));}
addEventListener('keydown',function(e){fix(e);var k=id(e),now=performance.now();
 if(!e.repeat&&((held[k]&&now-lastDown[k]<1100)||(lastUp[k]&&now-lastUp[k]<20))){define(e,'repeat',true);define(e,'__obsRepeatGuess',true);}
 held[k]=true;lastDown[k]=now;},true);
addEventListener('keyup',function(e){fix(e);var k=id(e);held[k]=false;lastUp[k]=performance.now();},true);
addEventListener('keypress',fix,true);
addEventListener('blur',function(e){if(e.target===window)held={};});
})();
