"""Real localhost 9910 service, identify/count=3, disconnect backoff and reconnect."""
from pathlib import Path
import asyncio,json,os,socket,threading,time
from playwright.sync_api import sync_playwright
from websockets.asyncio.server import serve
ROOT=Path(__file__).resolve().parents[1];QA=ROOT/'qa/2026-10-15-V2.3.2-自测'
URL=Path(os.environ.get('LOCK_HTML',ROOT/'红黑破锁-1.html')).resolve().as_uri()
try:
    probe=socket.socket();probe.bind(('127.0.0.1',9910));probe.close()
except OSError:
    result={'passed':0,'skipped':1,'failed':0,'reason':'9910 is occupied; no existing service was stopped or sent test gifts.'}
    (QA/'channel-result.json').write_text(json.dumps(result,indent=2),encoding='utf-8');print('SKIP real 9910 mock: port occupied');raise SystemExit(77)
class Mock:
    def __init__(self):self.loop=None;self.server=None;self.ready=threading.Event();self.clients=set();self.identities=[];self.connections=0;self.errors=[]
    async def handler(self,ws):
        self.connections+=1;self.clients.add(ws)
        try:
            async for text in ws:self.identities.append(json.loads(text))
        except Exception:pass
        finally:self.clients.discard(ws)
    async def main(self):
        self.loop=asyncio.get_running_loop();self.stop_event=asyncio.Event()
        try:
            async with serve(self.handler,'127.0.0.1',9910) as server:self.server=server;self.ready.set();await self.stop_event.wait()
        except Exception as error:self.errors.append(str(error));self.ready.set()
    def start(self):
        self.ready.clear();self.thread=threading.Thread(target=lambda:asyncio.run(self.main()),daemon=True);self.thread.start();assert self.ready.wait(4);assert not self.errors,self.errors
    def stop(self):
        if self.loop and self.thread.is_alive():self.loop.call_soon_threadsafe(self.stop_event.set);self.thread.join(5);assert not self.thread.is_alive(),'mock thread leaked'
    def send(self,count):
        async def broadcast():
            for ws in list(self.clients):await ws.send(json.dumps({'type':'gift','giftName':'小心心','count':count,'nickName':'本地模拟'}))
        asyncio.run_coroutine_threadsafe(broadcast(),self.loop).result(3)
mock=Mock();mock.start()
try:
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True)
        try:
            page=browser.new_page();console=[];page.on('console',lambda m:console.append({'time':time.monotonic(),'type':m.type,'text':m.text}))
            page.goto(URL);page.wait_for_function('document.getElementById("settings-connection").textContent==="本机 9910"')
            for _ in range(40):
                if mock.identities:break
                time.sleep(.025)
            assert mock.identities[0]=={'action':'identify','module':'自定义插件'},mock.identities
            mock.send(3);page.wait_for_function('JSON.parse(localStorage.getItem("red-black-lock-v1:state")).lock.layers===3')
            before=len(console);mock.stop();page.wait_for_function('document.getElementById("settings-connection").textContent==="未连接"')
            page.wait_for_timeout(10200)
            errors=[x for x in console[before:] if x['type']=='error']
            # Browser-native connection errors may remain, but are no longer emitted every 3s.
            assert len(errors)<=4,errors
            mock=Mock();mock.start();page.wait_for_function('document.getElementById("settings-connection").textContent==="本机 9910"',timeout=16000)
            mock.send(2);page.wait_for_function('JSON.parse(localStorage.getItem("red-black-lock-v1:state")).lock.layers===5')
            result={'passed':1,'skipped':0,'failed':0,'identify':'自定义插件','first_layers':3,'after_reconnect_layers':5,'native_error_messages_during_10s_outage':len(errors)}
            (QA/'channel-result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
        finally:browser.close()
finally:mock.stop()
print('PASS real 9910 mock: identify, incremental count=3, bounded retries and automatic reconnect')
