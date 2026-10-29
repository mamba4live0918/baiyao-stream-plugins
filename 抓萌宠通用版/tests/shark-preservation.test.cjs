const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8')),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const currentBase=read('开发/自己人动画-2026-10-08/preservation-baseline.json');
const removedBirds=['friend-chicken','friend-duck','friend-goose'];
const addedFriends=['friend-gray-upright','friend-call-duck','friend-nebulosa-tabby','friend-cherry-seal'];
const movedFurry=['dog-10','dog-07','friend-tabby','cat-08','cat-01','friend-rat','friend-hamster','friend-dog'];
const expandedFriends=['friend-lynx','friend-starry-whale','friend-world-pet','friend-cloud','friend-bell-black-cat'];
const approvedGroup={...currentBase.group,members:currentBase.group.members.filter(id=>!removedBirds.includes(id)&&!movedFurry.includes(id)).concat(addedFriends,expandedFriends),labels:{
 ...Object.fromEntries(Object.entries(currentBase.group.labels).filter(([id])=>!removedBirds.includes(id)&&!movedFurry.includes(id))),
 'friend-gray-upright':'灰色立耳兔','friend-call-duck':'科尔鸭','friend-nebulosa-tabby':'⋆Nebulosa⋆（狸花猫）','friend-cherry-seal':'樱桃小海豹',
 'friend-lynx':'猞猁','friend-starry-whale':'星空鲸鱼','friend-world-pet':'世界之外小宠物','friend-cloud':'云宝宝','friend-bell-black-cat':'铃铛黑猫'
}};
test('the shark repair changes exactly its two built-in images and leaves all other resources and metadata intact',()=>{
 const audit=read('开发/水族馆正式素材-2026-10-05/shark-v112-audit.json'),manifest=read('素材/manifest.json');assert(audit.finGeometryPassed);
 const {cows,barns,categories,balls,...beforeOther}=audit.before.manifest,{cows:currentCows,barns:currentBarns,categories:currentCategories,balls:currentBalls,...currentOther}=manifest;
 assert.equal(cows.length,95);assert.equal(barns.length,7);assert.deepEqual(currentCows.slice(0,95),cows);assert.deepEqual(currentBarns.slice(0,7),barns);assert.deepEqual(currentCategories.filter(c=>c.id!=='xiaoyao-furry').slice(0,categories.length).filter(c=>c.id!=='xiaoyao'),categories.filter(c=>c.id!=='xiaoyao'));assert.deepEqual(currentBalls.slice(0,balls.length),balls);assert.deepEqual(currentOther,beforeOther);
 assert.deepEqual(currentBase.manifest.categories.slice(0,categories.length),categories);assert.deepEqual(currentCategories.find(c=>c.id==='xiaoyao'),approvedGroup);
 const expected=['水族馆/aqua-great-white.png','水族馆/aqua-great-white-12frames.png'];assert.deepEqual(audit.allowedChanges,expected);const changed=[];
 for(const[file,before]of Object.entries(audit.before.files)){const current=hash(fs.readFileSync(path.join(root,'素材',file)));assert.equal(current,audit.after[file],file);if(current!==before)changed.push(file);}
 assert.deepEqual(changed.sort(),expected.sort());assert.equal(manifest.cows.length,112);assert.equal(manifest.barns.length,8);assert.equal(manifest.cows[80].id,'aqua-great-white');
});
