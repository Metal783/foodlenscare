import assert from 'node:assert/strict';
import { labelFromRegions } from '../src/recognize/parse-regions.js';
import { reviewLabel } from '../src/core/label-review.js';
import { evaluate } from '../src/core/rules.js';
import { todayTotals,scaleNutrients } from '../src/core/store.js';
let passed=0;
const test=(name,fn)=>{fn();passed++;console.log('PASS '+name);};
const box=(text,x,y,score=0.95)=>({text,score,poly:[[x,y],[x+100,y],[x+100,y+20],[x,y+20]]});
const items=[box('营养成分表',0,0),box('项目',0,30),box('每100毫升',200,30),box('NRV%',400,30),
 box('能量',0,60),box('194千焦',200,60),box('2%',400,60),box('蛋白质',0,90),box('0克',200,90),box('0%',400,90),
 box('脂肪',0,120),box('0克',200,120),box('0%',400,120),box('碳水化合物',0,150),box('11.4克',200,150),box('4%',400,150),
 box('钠',0,180),box('8毫克',200,180),box('0%',400,180),box('产品名称：葡萄汁',0,210),box('配料表：水、葡萄浓缩汁。',0,240),box('果汁含量：100%',0,270)];
const label=labelFromRegions({items:[...items].reverse(),image:{width:600,height:300}});
test('乱序文字框恢复五项表格，NRV 不当作含量',()=>assert.deepEqual(label.nutritionPer100g,{energy:194,protein:0,fat:0,saturatedFat:null,carbohydrate:11.4,sugar:null,sodium:8}));
test('配料区段排除上方营养表和下方其他字段',()=>assert.equal(label.ingredientText,'配料表：水、葡萄浓缩汁。'));
test('毫升口径与零值保留',()=>{assert.equal(label.servingUnit,'ml');assert.equal(label.nutritionPer100g.fat,0);});
test('候选数值未核对不进入摄入评估',()=>{assert.equal(label.readingOnly,true);assert.equal(evaluate({label,profile:{},servingGrams:100,consumedToday:{}}).nutrients.length,0);});
test('只剩 NRV 数字时留空',()=>{const i=items.map(i=>i.text==='194千焦'?{...i,text:'2%'}:i);assert.equal(labelFromRegions({items:i}).nutritionPer100g.energy,null);});
test('每份标签不冒充每100毫升',()=>{const i=items.map(i=>i.text==='每100毫升'?{...i,text:'每份250毫升'}:i);const l=labelFromRegions({items:i});assert.equal(l.servingUnit,null);assert.equal(l.nutritionPer100g.sodium,null);});
test('双口径同表不擅自选择',()=>{const i=items.map(i=>i.text==='每100毫升'?{...i,text:'每100毫升 每份'}:i);assert.equal(labelFromRegions({items:i}).servingUnit,null);});
test('同名字段不同值保留冲突',()=>{const l=labelFromRegions({items:[...items,box('钠 10毫克',0,195)]});assert.equal(l.nutritionPer100g.sodium,null);assert.equal(l.nutritionCandidates.sodium.conflict,true);});
test('千卡转换为千焦候选',()=>{const i=items.map(i=>i.text==='194千焦'?{...i,text:'10kcal'}:i);assert.equal(labelFromRegions({items:i}).nutritionPer100g.energy,41.84);});
const partial=reviewLabel(label,{ingredientText:label.ingredientText,nutrients:label.nutritionPer100g,unit:'ml'});
test('五项核对后可换算，糖不推断为碳水',()=>{assert.equal(partial.nutritionConfirmed,true);assert.equal(partial.nutritionPartial,true);assert.deepEqual(partial.missingFields,['saturatedFat','sugar']);assert.equal(scaleNutrients(partial.nutritionPer100g,50).sugar,null);});
test('部分数据不输出可以吃',()=>{const a=evaluate({label:partial,profile:{},servingGrams:50,consumedToday:{}});assert.equal(a.level,'gray');assert.equal(a.nutrients.find(n=>n.key==='sodium').amount,4);assert.match(a.advice,/未知/);});
test('部分营养仍优先显示确定过敏冲突',()=>{const l=reviewLabel(label,{ingredientText:'配料：花生。',nutrients:{sodium:8},unit:'g'});assert.equal(evaluate({label:l,profile:{allergens:['peanut']},servingGrams:100,consumedToday:{}}).level,'red');});
test('当日统计记录缺失字段，而非默认0完整记录',()=>{const totals=todayTotals([{at:new Date().toISOString(),consumptionConfirmed:true,origin:'album',nutrients:scaleNutrients(partial.nutritionPer100g,50)}]);assert.equal(totals.sodium,4);assert.equal(totals.unknown.sugar,1);assert.equal(totals.unknown.fat,0);});
test('后续完整标签不能忽略此前的未知摄入',()=>{const l=reviewLabel(label,{ingredientText:'配料：水。',nutrients:{energy:1,protein:0,fat:0,saturatedFat:0,carbohydrate:0,sugar:0,sodium:0},unit:'ml'});const a=evaluate({label:l,profile:{},servingGrams:100,consumedToday:{unknown:{sugar:1}}});assert.equal(a.level,'gray');assert.match(a.headline,/缺失/);});
console.log(`${passed} 项区域识别与缺失字段回归通过`);
