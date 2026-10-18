/** 照片和游客识别历史存入IndexedDB，避免将大图片塞进字符串存储。 */
let database: Promise<IDBDatabase> | null = null;
function open() { if (!database) database = new Promise((resolve,reject) => { const request=indexedDB.open("foodlenscare.v4.records",1); request.onupgradeneeded=()=>request.result.createObjectStore("records"); request.onsuccess=()=>resolve(request.result); request.onerror=()=>{database=null;reject(new Error("本机照片存储无法打开，请检查浏览器存储权限。"));}; }); return database; }
export async function saveLocalRecord(owner: string, record: any) { const db=await open(); return new Promise<void>((resolve,reject)=>{ const tx=db.transaction("records","readwrite"); tx.objectStore("records").put(record,`${owner}:${record.id}`); tx.oncomplete=()=>resolve(); tx.onabort=tx.onerror=()=>reject(new Error("本机照片存储失败，请释放浏览器空间。")); }); }
export async function getLocalRecord(owner: string, id: string) { const db=await open(); return new Promise<any>((resolve,reject)=>{ const request=db.transaction("records").objectStore("records").get(`${owner}:${id}`); request.onsuccess=()=>resolve(request.result); request.onerror=()=>reject(new Error("本机照片读取失败。")); }); }
export async function deleteLocalRecord(owner: string, id: string) {
  const db = await open();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction('records', 'readwrite');
    tx.objectStore('records').delete(`${owner}:${id}`);
    tx.oncomplete = () => resolve();
    tx.onabort = tx.onerror = () => reject(new Error('本机记录删除失败，请重试。'));
  });
}
export async function clearLocalRecords() {
  const db = await open();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction("records", "readwrite");
    tx.objectStore("records").clear();
    tx.oncomplete = () => resolve();
    tx.onabort = tx.onerror = () => reject(new Error("旧照片缓存清理失败，请检查浏览器存储权限。"));
  });
}
