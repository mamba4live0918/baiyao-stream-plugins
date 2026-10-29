export async function readReferenceFiles(fileList) {
  const files = Array.from(fileList || []);
  if (!files.length) return [];
  if (files.length > 8) throw new Error('一次最多添加 4 张图片和 4 个文本文件。');
  return Promise.all(files.map(async file => {
    const extension = file.name.split('.').pop().toLowerCase();
    const image = ['png', 'jpg', 'jpeg'].includes(extension);
    if (!image && !['txt', 'md'].includes(extension)) throw new Error('参考资料仅支持 PNG、JPG、TXT 和 MD 文件。');
    if (file.size > (image ? 4 * 1024 * 1024 : 64 * 1024)) throw new Error(`${file.name} 太大：图片上限 4 MB，文本上限 64 KB。`);
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error(`无法读取 ${file.name}`));
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(new Blob([file], { type: image ? (extension === 'png' ? 'image/png' : 'image/jpeg') : 'text/plain' }));
    });
    return { name: file.name, dataUrl, usage: image ? 'general' : 'requirements' };
  }));
}
