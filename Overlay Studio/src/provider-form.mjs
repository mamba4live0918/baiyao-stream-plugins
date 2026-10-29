import limits from '../electron/token-limits.json' with {type:'json'};
export const TOKEN_LIMIT = limits.max;
export function modelTokenDefault(info) {
 return Number.isInteger(info?.maxOutputTokens) && info.maxOutputTokens >= 256 ? Math.min(TOKEN_LIMIT, info.maxOutputTokens) : 8192;
}
export function providerFormErrors({baseUrl,model,maxTokens,modelInfo}) {
 const errors={};
 try {
  const url=new URL(baseUrl.trim());
  const loopback=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
  if(url.username||url.password||/[?#]/.test(baseUrl)||(url.protocol!=='https:'&&!(url.protocol==='http:'&&loopback))||/\/(chat\/completions|messages)\/*$/i.test(decodeURIComponent(url.pathname)))throw new Error();
 }catch{errors.baseUrl='请输入有效的 HTTPS 基础地址，不包含 /chat/completions 或 /messages（本机回环地址可用 HTTP）。';}
 if(!model.trim()||model.length>200||/[\x00-\x1f]/.test(model))errors.model='请同步并选择模型，或填写 1–200 个字符的模型 ID。';
 const limit=modelInfo?.maxOutputTokens>=256?Math.min(TOKEN_LIMIT,modelInfo.maxOutputTokens):TOKEN_LIMIT;
 if(!Number.isInteger(Number(maxTokens))||Number(maxTokens)<256||Number(maxTokens)>limit)errors.tokens=`最大输出须为 256–${limit.toLocaleString('en-US')} 的整数。${modelInfo?.maxOutputTokens?'这是当前模型可用的输出上限。':'可同步模型自动填写，或恢复默认值。'}`;
 return errors;
}
