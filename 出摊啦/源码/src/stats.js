/* 出摊啦 · 只保存本插件铜板和统计，不保存队列或厨房。 */
import { KEY_STATS } from './settings.js';
import { defaultRentState, sanitizeRentState, newRentSession } from './rent/model.js';
export { KEY_STATS };

export const defaultStats = () => ({ coins: 0, served: 0, badReviews: 0, abandoned: 0, rent: defaultRentState() });
const finite = value => typeof value === 'number' && Number.isFinite(value);
const count = value => finite(value) && value >= 0 ? Math.min(Number.MAX_SAFE_INTEGER,Math.floor(value)) : 0;

export function sanitizeStats(raw) {
  const x = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return { coins: finite(x.coins) ? x.coins : 0, served: count(x.served), badReviews: count(x.badReviews), abandoned: count(x.abandoned), rent: sanitizeRentState(x.rent) };
}

export function loadStats(storage,{wallNow=Date.now}={}) {
  try {
    let raw = storage.getItem(KEY_STATS);
    const migrate=raw==null;
    if(migrate)raw=storage.getItem('chutan.v1.stats');
    if(raw==null)return {stats:defaultStats(),readable:true};
    const input=JSON.parse(raw);let stats=sanitizeStats(input);
    const r=stats.rent,active=r.started||r.overtimeSeconds>0||r.transactions.length>0;
    if(active){
      const legacy=input?.rent?.version!==2||!finite(r.lastSeenAt);
      const awayAt=r.closedAt??r.lastSeenAt,wall=wallNow();
      if(legacy||(finite(wall)&&wall-awayAt>=3600000))stats=newRentSession(stats,{},wall);
      else stats={...stats,rent:{...r,closedAt:awayAt}};
    }
    if(migrate)saveStats(storage,stats);
    return {stats,readable:true};
  } catch {
    return { stats: defaultStats(), readable: false };
  }
}

export function saveStats(storage, stats) {
  try {
    storage.setItem(KEY_STATS,JSON.stringify(sanitizeStats(stats)));
    return true;
  } catch { return false; }
}
