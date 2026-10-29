/* 带引用计数的缓存：同一个键只创建一次；最后一个使用者释放时调用 dispose。
   用于按观众名生成的箱子贴图和材质，长时间直播不再越积越多。 */
export class RefCache {
  constructor(create, dispose) { this.create = create; this.dispose = dispose; this.map = new Map(); }
  acquire(key) {
    let e = this.map.get(key);
    if (!e) { e = { value: this.create(key), n: 0 }; this.map.set(key, e); }
    e.n++;
    return e.value;
  }
  release(key) {
    const e = this.map.get(key); if (!e) return;
    if (--e.n <= 0) { this.map.delete(key); this.dispose(e.value, key); }
  }
  peek(key) { return this.map.get(key)?.value; }
  refs(key) { return this.map.get(key)?.n || 0; }
  get size() { return this.map.size; }
}
