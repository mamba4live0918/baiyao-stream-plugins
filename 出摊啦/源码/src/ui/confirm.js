// A deliberate second click, local to one button. The wall of game time is not
// involved, so pausing or debug fast-forwarding cannot confirm a reset.
export function createDoubleConfirmation({onConfirm,onChange=()=>{},now=()=>performance.now(),setTimer=setTimeout,clearTimer=clearTimeout}){
 let deadline=null,timer=null;
 function reset(){
  if(timer!==null)clearTimer(timer);timer=null;
  const armed=deadline!==null;deadline=null;if(armed)onChange(false);
 }
 return{
  click(){
   const current=now();
   if(deadline!==null&&current<deadline){reset();onConfirm();return true;}
   reset();deadline=current+3000;onChange(true);
   timer=setTimer(()=>reset(),3000);return false;
  },
  reset,dispose:reset,
  snapshot:()=>({armed:deadline!==null&&now()<deadline,deadline})
 };
}
