export async function chooseOption(page,selector,value){
 const trigger=page.locator(selector).locator('..').locator('.inline-select-trigger');
 await trigger.click();await page.locator('.inline-select-popup').locator(`[data-value="${value}"]`).click();
}
// V5.2 起确认改为页面内确认框（OBS 不显示原生弹窗）；旧脚本原先自动接受原生确认，这里等价地自动点「继续」。
export async function autoConfirm(page){
 await page.addInitScript(()=>{new MutationObserver(()=>{const layer=document.getElementById('confirm-layer');if(layer&&!layer.hidden)document.getElementById('confirm-ok')?.click();}).observe(document,{subtree:true,childList:true,attributes:true,attributeFilter:['hidden']});});
}
