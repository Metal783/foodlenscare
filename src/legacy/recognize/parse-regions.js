/** 保留文字框并提取营养候选；只在用户核对后计算。 */
import { parseLabelText, splitIngredientLines, findIngredientHeading } from './parse-label.js';
import { NUTRIENT_FIELDS } from '../data/nutrition.js';
const TITLES = { energy:/^(?:能量|热量)/, protein:/^蛋白(?:质)?/, saturatedFat:/^饱和脂肪(?:酸)?/, fat:/^脂肪/, carbohydrate:/^碳水(?:化合物|化物)/, sugar:/^(?:糖|总糖|糖分|添加糖)/, sodium:/^钠/ };
const normalize = t=>String(t||'').replace(/([\u3400-\u9fff])[ \t\u3000]+(?=[\u3400-\u9fff])/g,'$1').trim();
export function groupOcrRows(items=[]) {
  const lines=items.filter(i=>i.text?.trim() && i.poly?.length>=4 && i.poly.every(p=>p.length>=2 && p.every(Number.isFinite))).map(i=>({
    ...i,text:normalize(i.text), x:Math.min(...i.poly.map(p=>p[0])), y:i.poly.reduce((s,p)=>s+p[1],0)/i.poly.length,
    height:Math.max(1,((i.poly[3][1]-i.poly[0][1])+(i.poly[2][1]-i.poly[1][1]))/2)
  })).sort((a,b)=>a.y-b.y || a.x-b.x);
  const rows=[];
  for(const line of lines) {
    const row=rows.find(r=>Math.abs(r.y-line.y)<=Math.min(r.height,line.height)*0.6);
    if(row) { row.items.push(line); row.y=row.items.reduce((s,l)=>s+l.y,0)/row.items.length; }
    else rows.push({y:line.y,height:line.height,items:[line]});
  }
  return rows.sort((a,b)=>a.y-b.y).map(r=>{r.items.sort((a,b)=>a.x-b.x); return {...r,text:r.items.map(i=>i.text).join(' '),confidence:Math.min(...r.items.map(i=>i.score??0))};});
}
function readValue(text,key) {
  const hit=text.match(/(?<![\d.\-])([0-9]+(?:\.[0-9]+)?)\s*(千焦|干焦|kJ|千卡|kcal|毫克|mg|克|g)(?![a-z])/i);
  if(!hit) return null;
  let value=Number(hit[1]); const unit=hit[2].toLowerCase();
  if(key==='energy') {
    if(/^(千卡|kcal)$/.test(unit)) value=Math.round(value*4.184*1000)/1000;
    else if(!/^(千焦|干焦|kj)$/.test(unit)) return null;
  } else if(key==='sodium') {
    if(/^(克|g)$/.test(unit)) value*=1000;
    else if(!/^(毫克|mg)$/.test(unit)) return null;
  } else {
    if(/^(毫克|mg)$/.test(unit)) value/=1000;
    else if(!/^(克|g)$/.test(unit)) return null;
  }
  return {value,raw:hit[0],warning:unit==='干焦'?'原文单位识别为“干焦”，请核对是否为千焦。':''};
}
export function labelFromRegions(result) {
  const rows=groupOcrRows(result.items),rawText=rows.map(r=>r.text).join('\n');
  const boxes = result.items.filter(i=>i.text?.trim() && i.poly?.length>=4);
  const ingredientAnchor = boxes.find(i=>/^(?:配料|配科|妃料|原料|原辅料)/.test(normalize(i.text)));
  const nutritionAnchor = boxes.find(i=>/营养成分表?|营养标签/.test(normalize(i.text))) || boxes.find(i=>/^项目/.test(normalize(i.text)));
  let ingredientRows = rows, nutritionRows = rows;
  if (ingredientAnchor && nutritionAnchor) {
    const ix = Math.min(...ingredientAnchor.poly.map(p=>p[0])), nx = Math.min(...nutritionAnchor.poly.map(p=>p[0]));
    const iy = ingredientAnchor.poly[0][1], ny = nutritionAnchor.poly[0][1];
    const width = result.image?.width || Math.max(...boxes.flatMap(i=>i.poly.map(p=>p[0])));
    if (Math.abs(ix - nx) > width * .25 && Math.abs(iy - ny) < (result.image?.height || 600) * .4) {
      const boundary = (ix + nx) / 2;
      const left = i => Math.min(...i.poly.map(p=>p[0])) < boundary;
      ingredientRows = groupOcrRows(boxes.filter(i=>left(i) === (ix < nx)));
      nutritionRows = groupOcrRows(boxes.filter(i=>left(i) === (nx < ix)));
    }
  }
  const label=parseLabelText(ingredientRows.map(r=>r.text).join('\n'),{channelLabel:'PaddleOCR · 本机中文识别'});
  const candidates={},per100g={},confidence={};
  for(const f of NUTRIENT_FIELDS) {per100g[f.key]=null;confidence[f.key]=0;}
  let start=nutritionRows.findIndex(r=>/营养成分表|营养标签/.test(r.text));
  if(start<0) start=nutritionRows.findIndex(r=>/每\s*(?:100\s*(?:毫升|ml|克|g)|份)/i.test(r.text));
  const tail=start<0?[]:nutritionRows.slice(start);
  const end=tail.findIndex((r,i)=>i>0 && /^(?:产品名称|产品类型|配料|原料|净含量|生产日期|保质期)/.test(r.text));
  const table=end<0?tail:tail.slice(0,end),header=table.slice(0,3).map(r=>r.text).join(' ');
  const basis=header.match(/每\s*100\s*(毫升|ml|克|g)/i);
  const bases=[...header.matchAll(/每\s*100\s*(毫升|ml|克|g)/gi)].map(m=>/毫升|ml/i.test(m[1])?'ml':'g');
  const ambiguous=new Set(bases).size>1 || (Boolean(basis) && /每\s*(份|瓶|包|袋)/.test(header));
  const servingUnit=basis&&!ambiguous?(/毫升|ml/i.test(basis[1])?'ml':'g'):null;
  const serving = !basis && !ambiguous && header.match(/每\s*份\s*(?:[（(]?\s*(\d+(?:\.\d+)?)\s*(克|g|毫升|ml)\s*[)）]?)?/i);
  const display = {};
  for(const row of table) {
    const key=Object.keys(TITLES).find(k=>TITLES[k].test(row.text.replace(/\s/g,'')));
    if(!key) continue;
    const parsed=readValue(row.text,key); if(!parsed) continue;
    if(candidates[key] && candidates[key].value!==parsed.value) {per100g[key]=null;delete display[key];confidence[key]=0;candidates[key].conflict=true;continue;}
    if(candidates[key]?.conflict) continue;
    candidates[key]={...parsed,confidence:row.confidence,text:row.text,boxes:row.items.map(i=>i.poly)};
    const nrv = row.text.match(/(\d+(?:\.\d+)?)\s*[%％]/);
    display[key] = {key, value:parsed.value, nrv:nrv?Number(nrv[1]):null};
    if(servingUnit) {per100g[key]=parsed.value;confidence[key]=row.confidence;}
  }
  const heading=findIngredientHeading(label.ingredientText),ingredientEvidence=ingredientRows.filter(r=>/配料|原料/.test(r.text));
  return {...label,rawText,ingredientLines:splitIngredientLines(label.ingredientText),
    ingredientHeadingSuspect:heading?!/^(?:配料表|配料|原料|原辅料)/.test(heading.heading):false,
    nutritionPer100g:per100g,nutritionCandidates:candidates,confidence,
    missingFields:NUTRIENT_FIELDS.filter(f=>per100g[f.key]==null).map(f=>f.key),
    nutritionTable:ambiguous?[]:NUTRIENT_FIELDS.filter(f=>display[f.key]).map(f=>({...display[f.key],label:f.label,unit:f.unit})),
    nutritionPerServing:serving?Object.fromEntries(Object.entries(display).map(([k,v])=>[k,v.value])):{},
    servingUnit,servingLabel:servingUnit==='ml'?'每 100 毫升':servingUnit==='g'?'每 100 克':serving?`每份${serving[1]?`（${serving[1]}${serving[2]}）`:''}`:'计量基准未识别',
    declaredPer:servingUnit?'per100g':serving?'perServing':'unknown',servingBasis:serving?'perServing':'per100g',
    ocrConfidence:ingredientEvidence.length?Math.min(...ingredientEvidence.map(r=>r.confidence)):rows.length?rows.reduce((s,r)=>s+r.confidence,0)/rows.length:0,
    ocrRows:rows.map(r=>({text:r.text,confidence:r.confidence,boxes:r.items.map(i=>i.poly)})),
    imageDimensions:result.image,readingOnly:true,channel:'paddleOcr',nutritionConfirmed:false};
}
