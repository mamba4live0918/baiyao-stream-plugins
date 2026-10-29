// 后台线程：生成熨烫成品的网格与表面贴图数据，算完整体转交回主线程，熨烫动画和工作台不卡。
import { buildFinishedData, transferablesOf } from './finished-viewer.js';

self.onmessage = event => {
  const { id, options } = event.data || {};
  try {
    const data = buildFinishedData(options);
    self.postMessage({ id, data }, transferablesOf(data));
  } catch (error) {
    self.postMessage({ id, error: String(error?.message || error) });
  }
};
