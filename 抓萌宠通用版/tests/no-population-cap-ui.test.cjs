const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {execFileSync}=require('node:child_process');
const source=fs.readFileSync(path.join(__dirname,'../src/settings.html'),'utf8');
const parser=String.raw`
from html.parser import HTMLParser
import json, sys
class SettingsParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.elements=[]
        self.text=[]
    def handle_starttag(self,tag,attrs):
        self.elements.append({'tag':tag,'attrs':dict(attrs)})
    def handle_data(self,data):
        self.text.append(data)
p=SettingsParser()
p.feed(sys.stdin.read())
print(json.dumps({'elements':p.elements,'text':' '.join(p.text)}))
`;
const python=path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe');
const parsed=JSON.parse(execFileSync(python,['-X','utf8','-c',parser],{input:source,encoding:'utf8'}));
const byId=id=>parsed.elements.filter(node=>node.attrs.id===id);
test('settings replaces obsolete forced-cap controls with an explicitly optional limit',()=>{
 assert.deepEqual(byId('visibleLimitInput'),[]);assert.deepEqual(byId('apply-visible-limit'),[]);
 assert.equal(parsed.elements.some(node=>node.attrs.class?.split(/\s+/).includes('population-control')),false);
 assert.equal(byId('sceneLimitEnabled').length,1);assert.equal(byId('sceneLimitEnabled')[0].attrs.type,'checkbox');
 assert.equal(byId('sceneLimit').length,1);assert.equal(byId('sceneLimit')[0].attrs.min,'1');assert.equal(byId('sceneLimit')[0].attrs.max,'100000');
 assert.equal(byId('apply-scene-limit').length,1);
});
test('population status remains accessible and manual add controls keep the independent ledger limits',()=>{
 assert.equal(byId('population-status').length,1);assert.equal(byId('population-status')[0].attrs.role,'status');
 assert.equal(byId('manual-add-population').length,1);assert.equal(byId('manual-add-count')[0].attrs.max,'10000');assert.equal(byId('add-cows').length,1);
 assert(parsed.text.includes('在外总量最多100000只'));
});
test('default-unlimited settings explain waiting pets without imposing the old 240 or 500 cap',()=>{
 for(const obsolete of ['场内上限','调整同屏数量','默认240','1–500','抓回家后自动补入'])assert.equal(parsed.text.includes(obsolete),false,obsolete);
 assert(parsed.text.includes('分批入场'));assert(parsed.text.includes('入场提示'));
 assert(parsed.text.includes('默认不限'));assert(parsed.text.includes('召回包含候场'));
 assert.equal(byId('preview-waiting').length,1);assert.equal(byId('waitingHudscale').length,1);
});
