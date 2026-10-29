export const validToolSensitivity=value=>Number.isFinite(value)&&value>=.25&&value<=3;
export const normalizeToolSensitivity=value=>Number.isFinite(value)?Math.max(.25,Math.min(3,value)):1;
export const followBlend=(seconds,sensitivity)=>1-Math.exp(-36*normalizeToolSensitivity(sensitivity)*Math.max(0,seconds));
// 默认工具：镊子一次一颗；拼豆笔一次取 2–20 颗同色豆（仍需逐格点放）。
export const normalizeDefaultTool=value=>value==='pen'?'pen':'tweezers';
export const validPenCapacity=value=>Number.isInteger(value)&&value>=2&&value<=20;
export const normalizePenCapacity=value=>validPenCapacity(value)?value:3;
