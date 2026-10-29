// 在后台线程准备成品数据；后台线程不可用（或出错）时退回当前线程计算，结果完全相同。
import workerSource from 'virtual:finish-worker';
import { buildFinishedData } from './finished-viewer.js';

let worker = null, workerBroken = false, nextId = 1;
const pending = new Map();

function ensureWorker() {
  if (worker || workerBroken) return worker;
  try {
    const url = URL.createObjectURL(new Blob([workerSource], { type: 'text/javascript' }));
    worker = new Worker(url);
    URL.revokeObjectURL(url);
    worker.onmessage = event => {
      const { id, data, error } = event.data || {};
      const job = pending.get(id); if (!job) return;
      pending.delete(id);
      if (error) job.fallback(error); else job.resolve(data);
    };
    worker.onerror = event => {
      event.preventDefault?.();
      workerBroken = true; worker?.terminate(); worker = null;
      for (const job of pending.values()) job.fallback('worker error');
      pending.clear();
    };
  } catch {
    workerBroken = true; worker = null;
  }
  return worker;
}

function computeHere(options) {
  // 让出一帧再算，至少让当前画面和提示先显示出来。
  return new Promise((resolve, reject) => setTimeout(() => { try { resolve(buildFinishedData(options)); } catch (error) { reject(error); } }, 30));
}

/** 返回 Promise<成品数据>，交给 createFinishedViewer({ prepared }) 使用。 */
export function prepareFinished(options) {
  const target = ensureWorker();
  if (!target) return computeHere(options);
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, fallback: () => computeHere(options).then(resolve, reject) });
    try { target.postMessage({ id, options: { cells: [...options.cells], size: options.size, style: options.style, seed: options.seed, quality: options.quality } }); }
    catch { pending.delete(id); computeHere(options).then(resolve, reject); }
  });
}
export const finishWorkerActive = () => !!worker && !workerBroken;
