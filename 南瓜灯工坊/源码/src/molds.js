import {clipPolygon} from './geometry.js';
export const MOLDS=[['classic','经典'],['round','圆眼'],['smile','笑脸'],['surprise','吃惊'],['cry','哭脸'],['angry','生气'],['cat','猫猫'],['goofy','鬼脸'],['sleepy','困困'],['heart','爱心'],['star','星星'],['vampire','吸血鬼']].map(([id,name])=>({id,name}));
const ellipse=(x,y,rx,ry,n=20)=>Array.from({length:n},(_,i)=>[x+Math.cos(i/n*2*Math.PI)*rx,y+Math.sin(i/n*2*Math.PI)*ry]);
const tri=(x,y)=>[[x,y-.065],[x-.065,y+.045],[x+.065,y+.045]];
const crescent=(x,y)=>[[x-.07,y+.025],[x-.04,y-.015],[x,y-.03],[x+.04,y-.015],[x+.07,y+.025],[x+.04,y+.005],[x,y-.006],[x-.04,y+.005]];
const heart=(x,y)=>[[x,y+.065],[x-.07,y],[x-.065,y-.045],[x-.025,y-.06],[x,y-.032],[x+.025,y-.06],[x+.065,y-.045],[x+.07,y]];
const star=(x,y)=>Array.from({length:10},(_,i)=>{const a=-Math.PI/2+i*Math.PI/5,r=i%2?.035:.075;return[x+Math.cos(a)*r,y+Math.sin(a)*r];});
const mouth=()=>[[.30,.65],[.40,.70],[.5,.71],[.60,.70],[.7,.65],[.65,.74],[.5,.79],[.35,.74]];
export function moldPolygons(id){
 let eyes=[tri(.36,.48),tri(.64,.48)],m=mouth(),extras=[];
 switch(id){
 case 'classic':m=[[.3,.65],[.38,.68],[.4,.65],[.45,.69],[.5,.66],[.55,.69],[.6,.65],[.62,.68],[.7,.65],[.65,.75],[.58,.73],[.52,.78],[.47,.74],[.4,.77],[.35,.74]];break;
 case 'round':eyes=[ellipse(.36,.48,.055,.065),ellipse(.64,.48,.055,.065)];break;
 case 'smile':eyes=[crescent(.36,.48),crescent(.64,.48)];break;
 case 'surprise':eyes=[ellipse(.36,.48,.055,.07),ellipse(.64,.48,.055,.07)];m=ellipse(.5,.7,.07,.085);break;
 case 'cry':eyes=[crescent(.36,.46),crescent(.64,.46)];extras=[ellipse(.32,.57,.02,.055),ellipse(.68,.57,.02,.055)];m=[[.36,.73],[.43,.68],[.5,.66],[.57,.68],[.64,.73],[.5,.70]];break;
 case 'angry':eyes=[[[.29,.43],[.44,.49],[.32,.52]],[[.71,.43],[.56,.49],[.68,.52]]];m=[[.32,.68],[.42,.65],[.45,.72],[.5,.67],[.55,.72],[.58,.65],[.68,.68],[.6,.77],[.4,.77]];break;
 case 'cat':eyes=[ellipse(.36,.49,.04,.06),ellipse(.64,.49,.04,.06)];m=[[.4,.69],[.46,.72],[.5,.68],[.54,.72],[.6,.69],[.55,.75],[.5,.72],[.45,.75]];extras=[tri(.5,.59),[[.25,.58],[.39,.60],[.25,.61]],[[.75,.58],[.61,.60],[.75,.61]]];break;
 case 'goofy':eyes=[ellipse(.36,.47,.055,.065),crescent(.64,.48)];extras=[ellipse(.55,.76,.04,.07)];break;
 case 'sleepy':eyes=[[[.29,.49],[.43,.49],[.43,.51],[.29,.51]],[[.57,.49],[.71,.49],[.71,.51],[.57,.51]]];m=ellipse(.5,.70,.04,.025);break;
 case 'heart':eyes=[heart(.36,.48),heart(.64,.48)];break;
 case 'star':eyes=[star(.36,.48),star(.64,.48)];break;
 case 'vampire':m=[[.31,.65],[.39,.67],[.42,.75],[.46,.68],[.54,.68],[.58,.75],[.61,.67],[.69,.65],[.64,.77],[.36,.77]];break;
 }return [...eyes,m,...extras].map(clipPolygon).filter(p=>p.length>=3);
}
