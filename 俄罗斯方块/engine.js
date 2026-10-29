(function(root){
  'use strict';
  const W=10,H=20;
  const SHAPES={I:[[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],O:[[1,1],[1,1]],T:[[0,1,0],[1,1,1],[0,0,0]],S:[[0,1,1],[1,1,0],[0,0,0]],Z:[[1,1,0],[0,1,1],[0,0,0]],J:[[1,0,0],[1,1,1],[0,0,0]],L:[[0,0,1],[1,1,1],[0,0,0]]};
  const TYPES=Object.keys(SHAPES);
  class BlockGame{
    constructor(random=Math.random){this.random=random;this.reset();}
    reset(){
      this.board=Array.from({length:H},()=>Array(W).fill(0));this.bag=[];this.next=[];
      this.score=0;this.lines=0;this.level=1;this.combo=-1;this.clock=0;this.held=null;this.holdUsed=false;
      this.active=null;this.status='ready';this.gravity=0;this.lockTime=0;this.lockResets=0;
      this.effects={reverse:0,rush:0,fog:0,seal:0};this.challenge=null;this.events=[];this.pieces=0;
      this.fillNext();return this;
    }
    emit(type,data={}){this.events.push({type,...data});if(this.events.length>40)this.events.shift();}
    drain(){return this.events.splice(0);}
    fillNext(){
      while(this.next.length<5){
        if(!this.bag.length){this.bag=[...TYPES];for(let i=6;i>0;i--){const j=Math.floor(this.random()*(i+1));[this.bag[i],this.bag[j]]=[this.bag[j],this.bag[i]];}}
        this.next.push(this.bag.pop());
      }
    }
    start(){if(this.status==='ready'){this.status='playing';this.spawn();}}
    spawn(type){
      type=type||this.next.shift();this.fillNext();
      const matrix=SHAPES[type].map(r=>[...r]);
      this.active={type,matrix,x:Math.floor((W-matrix.length)/2),y:0};
      this.gravity=0;this.lockTime=0;this.lockResets=0;
      if(this.collides(this.active))this.lose();
    }
    cells(piece=this.active){
      if(!piece)return[];const cells=[];
      piece.matrix.forEach((row,y)=>row.forEach((v,x)=>{if(v)cells.push([piece.x+x,piece.y+y]);}));return cells;
    }
    collides(piece){return this.cells(piece).some(([x,y])=>x<0||x>=W||y>=H||(y>=0&&this.board[y][x]));}
    activeEffect(name){return(this.effects[name]||0)>this.clock;}
    resetLock(){if(this.lockResets<12){this.lockTime=0;this.lockResets++;}}
    move(dx){
      if(this.status!=='playing')return false;
      const sign=this.activeEffect('reverse')?-1:1;
      const piece={...this.active,x:this.active.x+dx*sign};
      if(this.collides(piece))return false;this.active=piece;this.resetLock();return true;
    }
    rotate(direction=1){
      if(this.status!=='playing'||this.activeEffect('seal'))return false;
      const old=this.active.matrix,n=old.length;
      const matrix=Array.from({length:n},(_,y)=>Array.from({length:n},(_,x)=>direction>0?old[n-1-x][y]:old[x][n-1-y]));
      // Small bounded wall/floor kicks keep rotations usable at the board edges.
      for(const[dx,dy]of[[0,0],[-1,0],[1,0],[-2,0],[2,0],[0,-1],[-1,-1],[1,-1],[0,-2]]){
        const piece={...this.active,matrix,x:this.active.x+dx,y:this.active.y+dy};
        if(!this.collides(piece)){this.active=piece;this.resetLock();return true;}
      }
      return false;
    }
    softDrop(manual=true){
      if(this.status!=='playing')return false;
      const piece={...this.active,y:this.active.y+1};
      if(this.collides(piece))return false;this.active=piece;if(manual)this.score++;this.lockTime=0;return true;
    }
    ghostY(){if(!this.active)return 0;let y=this.active.y;while(!this.collides({...this.active,y:y+1}))y++;return y;}
    hardDrop(){
      if(this.status!=='playing')return;
      const y=this.ghostY();this.score+=(y-this.active.y)*2;this.active.y=y;this.lock();
    }
    hold(){
      if(this.status!=='playing'||this.holdUsed)return false;
      const old=this.held;this.held=this.active.type;this.spawn(old);this.holdUsed=true;this.emit('hold');return true;
    }
    lock(){
      if(this.status!=='playing')return;
      const cells=this.cells();if(cells.some(([,y])=>y<0)){this.lose();return;}
      const value=TYPES.indexOf(this.active.type)+1;
      for(const[x,y]of cells)this.board[y][x]=value;
      const full=[];this.board.forEach((row,y)=>{if(row.every(Boolean))full.push(y);});
      if(full.length){
        this.board=this.board.filter((_,y)=>!full.includes(y));while(this.board.length<H)this.board.unshift(Array(W).fill(0));
        this.combo++;const points=([0,100,300,500,800][full.length]+Math.max(0,this.combo)*50)*this.level;
        this.score+=points;this.lines+=full.length;this.level=1+Math.floor(this.lines/10);this.emit('clear',{rows:full,count:full.length,points,combo:this.combo});
      }else this.combo=-1;
      this.pieces++;this.holdUsed=false;
      this.checkChallenge();this.spawn();this.emit('lock');
    }
    lose(){if(this.status==='over')return;this.status='over';this.emit('over');}
    addGarbage(count){
      const amount=Math.min(4,Math.max(1,Math.floor(count)));let overflow=false;
      for(let i=0;i<amount;i++){
        if(this.board.shift().some(Boolean))overflow=true;
        const gap=Math.floor(this.random()*W);this.board.push(Array.from({length:W},(_,x)=>x===gap?0:8));
      }
      if(this.active){
        for(let i=0;i<amount+4&&this.collides(this.active);i++)this.active.y--;
        if(this.collides(this.active)||this.cells().every(([,y])=>y<0))overflow=true;
      }
      this.emit('garbage',{count:amount});if(overflow)this.lose();
    }
    checkChallenge(){
      if(!this.challenge)return;
      if(this.lines-this.challenge.start>=2){this.challenge=null;this.score+=500;this.emit('challenge-win');}
      else if(this.clock>=this.challenge.end){this.challenge=null;this.addGarbage(3);this.emit('challenge-fail');}
    }
    effect(kind){
      if(this.status!=='playing')return false;
      if(kind==='garbage')this.addGarbage(2);
      else if(['reverse','rush','fog','seal'].includes(kind))this.effects[kind]=this.clock+({reverse:12000,rush:12000,fog:9000,seal:8000}[kind]);
      else if(kind==='challenge')this.challenge={start:this.lines,end:this.clock+15000};
      else if(kind==='bomb'){
        this.board.splice(H-3,3);this.board.unshift(...Array.from({length:3},()=>Array(W).fill(0)));this.emit('rescue');
      }else if(kind==='cleanse'){
        for(const key of Object.keys(this.effects))this.effects[key]=0;this.challenge=null;this.emit('cleanse');
      }else return false;
      this.emit('effect',{kind});return true;
    }
    tick(dt){
      if(this.status!=='playing')return;
      dt=Math.min(50,Math.max(0,Number(dt)||0));this.clock+=dt;
      for(const key of Object.keys(this.effects))if(this.effects[key]&&this.effects[key]<=this.clock){this.effects[key]=0;this.emit('expired',{kind:key});}
      this.checkChallenge();if(this.status!=='playing')return;
      const interval=Math.max(95,780*Math.pow(.84,this.level-1))/(this.activeEffect('rush')?4:1);
      this.gravity+=dt;
      if(this.collides({...this.active,y:this.active.y+1})){
        this.lockTime+=dt;if(this.lockTime>=450)this.lock();
      }else{
        this.lockTime=0;
        for(let n=0;n<4&&this.gravity>=interval;n++){this.gravity-=interval;if(!this.softDrop(false))break;}
      }
    }
  }
  root.BlockGame=BlockGame;root.BlockShapes=SHAPES;root.BlockTypes=TYPES;
  if(typeof module!=='undefined')module.exports={BlockGame,SHAPES,TYPES,W,H};
})(typeof window!=='undefined'?window:globalThis);
