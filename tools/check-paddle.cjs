/** 真实葡萄汁包装回归：图片由命令参数提供，不复制进仓库。
 * FLC_PLAYWRIGHT_PATH=... node tools/check-paddle.cjs <原图.jpg>
 */
const { chromium } = require(process.env.FLC_PLAYWRIGHT_PATH || 'playwright');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),sample=path.resolve(process.argv[2]||'');
if(!process.argv[2] || !fs.statSync(sample).isFile()) throw new Error('请传入葡萄汁原图路径。');
const server=http.createServer((req,res)=>{
 let target=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
 if(!target.startsWith(root+path.sep)) return res.writeHead(403).end();
 const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.wasm':'application/wasm'};
 fs.readFile(target,(e,d)=>e?res.writeHead(404).end():res.writeHead(200,{'Content-Type':mime[path.extname(target)]||'application/octet-stream'}).end(d));
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try {
  for(const entry of (process.env.FLC_PADDLE_ENTRY?[process.env.FLC_PADDLE_ENTRY]:['/index.html','/docs/index.html'])) {
   const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage(),errors=[],external=[];
   page.on('pageerror',e=>{errors.push(e.message);console.log('PAGE ERROR '+entry+': '+e.message);});
   page.on('request',r=>{if(/^https?:/.test(r.url())&&!r.url().startsWith('http://127.0.0.1:'))external.push(r.url());});
   await page.goto(`http://127.0.0.1:${server.address().port}${entry}#/scan`);
   try {await page.waitForFunction(()=>window.FoodLensCare);} catch(e) {
    console.log('启动诊断',await page.evaluate(()=>({url:location.href,boot:window.__FLC_BOOT__,text:document.body.innerText.slice(0,1200),scripts:document.scripts.length})));throw e;
   }
   await page.evaluate(()=>{window.FoodLensCare.state.profile.voiceOn=false;window.FoodLensCare.state.profile.allergens=[];});
   const chooser=page.waitForEvent('filechooser');
   await page.getByRole('button',{name:'从相册里选一张配料表照片'}).click();await(await chooser).setFiles(sample);
   await page.getByRole('button',{name:/就用这张/}).click();
   await page.waitForFunction(()=>window.FoodLensCare.state.result?.photo.label.rawText,null,{timeout:150000});
   const label=await page.evaluate(()=>window.FoodLensCare.state.result.photo.label);
   assert.equal(label.channel,'paddleOcr','新引擎不可静默退回基础 OCR');
   assert.equal(label.ingredientText,'配料表：水、葡萄浓缩汁。');assert.match(label.productName,/葡萄汁/);assert.equal(label.servingUnit,'ml');
   assert.deepEqual(label.nutritionPer100g,{energy:194,protein:0,fat:0,saturatedFat:null,carbohydrate:11.4,sugar:null,sodium:8});
   assert.equal(label.readingOnly,true);assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('flc.records.v1')||'[]').length),0);
   for(const [key,value] of Object.entries(label.nutritionPer100g))assert.equal(await page.locator('#review-'+key).inputValue(),value==null?'':String(value));
   assert.equal(await page.locator('#review-unit').inputValue(),'ml');
   if(process.env.FLC_PADDLE_SCREENSHOT && entry.includes('docs'))await page.screenshot({path:process.env.FLC_PADDLE_SCREENSHOT,fullPage:true});
   await page.getByRole('button',{name:'确认核对，重新查看提醒'}).click();assert.match(await page.locator('#view').textContent(),/请先对照包装核对/);
   await page.locator('#review-checked').check();await page.getByRole('button',{name:'确认核对，重新查看提醒'}).click();
   await page.waitForFunction(()=>window.FoodLensCare.state.result.photo.label.nutritionConfirmed);
   assert.equal(await page.evaluate(()=>window.FoodLensCare.state.result.assessment.level),'gray');
   assert.match(await page.locator('#view').textContent(),/缺失项目无法判断/);
   await page.locator('#consumed-quantity').fill('50');await page.getByRole('button',{name:'我已吃了，记入今天'}).click();
   const records=await page.evaluate(()=>JSON.parse(localStorage.getItem('flc.records.v1')));
   assert.equal(records.length,1);assert.equal(records[0].servingUnit,'ml');assert.equal(records[0].nutrients.sodium,4);assert.equal(records[0].nutrients.carbohydrate,5.7);assert.equal(records[0].nutrients.sugar,null);
   await page.evaluate(()=>window.FoodLensCare.ctx.navigate('result',{}, {force:true}));assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('flc.records.v1')).length),1);
   if(process.env.FLC_PADDLE_SCREENSHOT && entry.includes('docs'))await page.screenshot({path:process.env.FLC_PADDLE_SCREENSHOT.replace(/\.png$/,'-confirmed.png'),fullPage:true});
   await page.evaluate(()=>window.FoodLensCare.ctx.navigate('home'));assert.match(await page.locator('#view').textContent(),/有缺失记录，余量未知/);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
   console.log('PASS '+entry+': 原图识别、五项候选、单位、人工核对、50ml记录、缺失字段不补零、重复记录保护，全程本机。');
   await context.close();
  }
  // 模拟区域引擎资源不可用，验证真实基础 OCR 降级与可见原因。
  const fallbackContext=await browser.newContext({serviceWorkers:'block'}),fallbackPage=await fallbackContext.newPage();
  await fallbackPage.route('**/assets/paddle/paddle.mjs',route=>route.abort());
  await fallbackPage.goto(`http://127.0.0.1:${server.address().port}/index.html#/scan`);
  await fallbackPage.waitForFunction(()=>window.FoodLensCare);
  await fallbackPage.evaluate(()=>window.FoodLensCare.state.profile.voiceOn=false);
  const fallbackChooser=fallbackPage.waitForEvent('filechooser');
  await fallbackPage.getByRole('button',{name:'从相册里选一张配料表照片'}).click();
  await(await fallbackChooser).setFiles(sample);
  await fallbackPage.getByRole('button',{name:/就用这张/}).click();
  await fallbackPage.waitForFunction(()=>window.FoodLensCare.state.result?.photo.label.rawText,null,{timeout:150000});
  const fallback=await fallbackPage.evaluate(()=>window.FoodLensCare.state.result.photo);
  assert.equal(fallback.label.channel,'localOcr');
  assert.match(fallback.fallbackReason,/中文区域识别未能运行/);
  assert.match(await fallbackPage.locator('#view').textContent(),/已改用基础文字识别/);
  assert.equal(fallback.label.readingOnly,true);
  assert.equal(await fallbackPage.evaluate(()=>JSON.parse(localStorage.getItem('flc.records.v1')||'[]').length),0);
  console.log('PASS 区域引擎资源失败时降级到真实基础 OCR，说明原因，保持待核对且不自动记录。');
  await fallbackContext.close();
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
