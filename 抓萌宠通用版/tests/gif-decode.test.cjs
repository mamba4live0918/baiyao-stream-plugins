const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');

const {decode}=require('../src/gif-decode.js');

const sample=path.join(os.homedir(),'Downloads','dh.gif');
const pixel=(frame,width,x,y)=>Array.from(frame.pixels.slice((y*width+x)*4,(y*width+x+1)*4));

test('offline fallback decodes every frame of the supplied GIF with its timing',async t=>{
 if(!fs.existsSync(sample)){t.skip('User-supplied GIF not present on this machine');return;}
 const result=await decode(new Uint8Array(fs.readFileSync(sample)),{preferNative:false});
 assert.equal(result.width,200);
 assert.equal(result.height,200);
 assert.equal(result.frames.length,5);
 assert.deepEqual(result.frames.map(f=>f.durationMs),[250,250,250,250,250]);
 for(const f of result.frames){
  assert.equal(f.pixels.length,200*200*4);
  assert.deepEqual(pixel(f,200,0,0),[252,252,252,255]);
 }
 assert.notDeepEqual(Array.from(result.frames[0].pixels),Array.from(result.frames[1].pixels));
});

test('GIF decoder rejects broken data without yielding a partially decoded animation',async()=>{
 await assert.rejects(decode(new Uint8Array([0,1,2,3]),{preferNative:false}));
});

test('fallback composes subframes and matches browser disposal-to-transparent and restore-to-previous',async()=>{
 const bytes=Buffer.from('R0lGODlhAwABAIIBAAAAAP8AAAD/AAAA/////wAAAAAAAAAAACH/C05FVFNDQVBFMi4wAwEAAAAh+QQECgAAACwAAAAAAwABAAADAhiaACH5BAgUAAAALAEAAAABAAEAAAMCKAkAIfkEDB4AAAAsAgAAAAEAAQAAAwI4CQAh+QQEKAAAACwAAAAAAQABAAADAkgJADs=','base64');
 const result=await decode(bytes,{preferNative:false});
 assert.deepEqual(result.frames.map(f=>f.durationMs),[100,200,300,400]);
 assert.deepEqual(result.frames.map(f=>[pixel(f,3,0,0),pixel(f,3,1,0),pixel(f,3,2,0)]),[
  [[255,0,0,255],[255,0,0,255],[255,0,0,255]],
  [[255,0,0,255],[0,255,0,255],[255,0,0,255]],
  [[255,0,0,255],[0,0,0,0],[0,0,255,255]],
  [[255,255,255,255],[0,0,0,0],[255,0,0,255]],
 ]);
});

test('GIF decoder rejects an oversized logical canvas before allocating decoded frames',async()=>{
 const bytes=Buffer.from('R0lGODlhAwABAIIBAAAAAP8AAAD/AAAA/////wAAAAAAAAAAACH/C05FVFNDQVBFMi4wAwEAAAAh+QQECgAAACwAAAAAAwABAAADAhiaACH5BAgUAAAALAEAAAABAAEAAAMCKAkAIfkEDB4AAAAsAgAAAAEAAQAAAwI4CQAh+QQEKAAAACwAAAAAAQABAAADAkgJADs=','base64');
 bytes[6]=1;bytes[7]=8; // 2049px, above the supported edge length
 await assert.rejects(decode(bytes,{preferNative:false}),/2048/);
});

test('single-frame GIF can be decoded for optional background removal',async()=>{
 const bytes=Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==','base64');
 const result=await decode(bytes,{preferNative:false});
 assert.equal(result.frames.length,1);
});
