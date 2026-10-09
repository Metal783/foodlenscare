/** 真实图片冷启动与重复识别计时；图片仅由命令行读取，不写入项目。 */
const {chromium}=require(process.env.FLC_PLAYWRIGHT_PATH||'playwright');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),sample=process.argv[2];
if(!sample)throw new Error('请提供原图路径');
const server=http.createServer((req,res)=>{
 const target=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
 if(!target.startsWith(root+path.sep))return res.writeHead(403).end();
 const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.wasm':'application/wasm'};
 fs.readFile(target,(error,data)=>error?res.writeHead(404).end():res.writeHead(200,{'Content-Type':mime[path.extname(target)]||'application/octet-stream'}).end(data));
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try {
  const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage();
  const requests=[];context.on('request',r=>{if(r.url().includes('/assets/paddle/'))requests.push(r.url());});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  const input={bytes:[...fs.readFileSync(sample)],name:path.basename(sample)};
  const reports=[];
  for(let i=0;i<2;i++){
   const offset=requests.length;
   reports.push(await page.evaluate(async({bytes,name})=>{
    const {recognize}=await import('./src/recognize/ocr-paddle.js');
    const file=new File([new Uint8Array(bytes)],name,{type:'image/jpeg'}),phases=[],start=performance.now();
    const result=await recognize({file,onProgress:p=>phases.push({text:p.text,ms:Math.round(performance.now()-start)})});
    return {ms:Math.round(performance.now()-start),phases,ingredient:result.label.ingredientText,nutrition:result.label.nutritionPer100g};
   },input));
   reports[i].requests=requests.slice(offset).map(url=>new URL(url).pathname.split('/assets/paddle/')[1]);
   assert.equal(reports[i].ingredient,'配料表：水、葡萄浓缩汁。');
   assert.equal(reports[i].nutrition.carbohydrate,11.4);
   console.log(JSON.stringify({run:i+1,...reports[i]}));
  }
  assert.deepEqual(errors,[]);
  if(process.argv.includes('--reuse')){
   assert.equal(reports[1].requests.length,0,'重复识别应复用模型，不再发起资源请求');
   assert.ok(reports[1].phases.some(p=>p.text.includes('复用')),'重复识别明确复用状态');
   console.log('PASS: 原图识别正确，重复识别零资源请求、复用模型。');
  }
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
