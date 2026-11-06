import { HttpsError } from 'firebase-functions/v2/https';
import { createHash } from 'node:crypto';
import { validCalendarDate } from './storeWeeklyMealPlan.js';
const fail = message => { throw new HttpsError('invalid-argument', message); };
const text = (value, max) => typeof value === 'string' ? value.trim().slice(0,max) : '';
const normalize = value => value.normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase();
const amount = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100000 && Math.round(value*100)/100 === value ? value : null;

export const pasteOrderSchema = {
 type:'OBJECT', properties:{
  customerName:{type:'STRING'},phone:{type:'STRING'},remarks:{type:'STRING'},paymentStatement:{type:'STRING'},deliveryFee:{type:'NUMBER',nullable:true},
  warnings:{type:'ARRAY',items:{type:'STRING'}},
  lines:{type:'ARRAY',items:{type:'OBJECT',properties:{name:{type:'STRING'},quantity:{type:'NUMBER'},unitPrice:{type:'NUMBER',nullable:true},lineTotal:{type:'NUMBER',nullable:true},date:{type:'STRING'},time:{type:'STRING'},deadline:{type:'STRING',description:'Verbatim source deadline phrase including Before, sebelum or 之前; never a bare replacement clock time.'},method:{type:'STRING'},address:{type:'STRING'},remarks:{type:'STRING'},evidence:{type:'STRING'}},required:['name','quantity','date','time','method','address','evidence']}}
 }, required:['customerName','phone','remarks','paymentStatement','lines','warnings']
};

// Preserve source qualifiers even when AI reduces a deadline to a bare clock time.
export function pasteDeadlineNote(line, original, issues) {
 const supplied=text(line.deadline,120);
 if (!supplied) return '';
 const patterns=[/\bbefore\s+(?:\d{1,2}[:.]\d{2}|\d{1,2}\s*(?:am|pm))\s*(?:a\.?m\.?|p\.?m\.?)?/gi,/\bsebelum\s+(?:jam\s*)?\d{1,2}[:.]\d{2}\s*(?:pagi|petang|malam|tengah\s+hari)?/gi,/(?:上午|下午|中午|晚上|早上|凌晨)?\s*\d{1,2}[:：]\d{2}\s*(?:之前|以前|前)/g];
 const phrases=[...new Set(patterns.flatMap(pattern=>[...original.matchAll(pattern)].map(match=>match[0].trim())))];
 const norm=value=>value.normalize('NFKC').replace(/\s+/g,'').toLowerCase();
 let matches=phrases.filter(phrase=>norm(phrase).includes(norm(supplied)) || norm(supplied).includes(norm(phrase)));
 if (!matches.length && /^([01]\d|2[0-3]):[0-5]\d$/.test(line.time || '')) matches=phrases.filter(phrase=>{
  const clock=phrase.normalize('NFKC').match(/(\d{1,2})[:.](\d{2})/); if(!clock)return false;
  let hour=Number(clock[1]); if(/pm|p\.m|下午|晚上|petang|malam/i.test(phrase)&&hour<12)hour+=12;
  if(/am|a\.m|上午|早上|凌晨|pagi/i.test(phrase)&&hour===12)hour=0;
  return `${String(hour).padStart(2,'0')}:${clock[2]}`===line.time;
 });
 if (matches.length===1) return `Deadline: ${matches[0]}`;
 issues.push('Verify the original deadline wording; no ambiguous deadline has been substituted.');
 return `Deadline (review): ${supplied}`;
}

// Model output is untrusted data. Only these fields enter an editable preview.
// Catalog IDs, prices and payment state cannot be supplied by the model.
export function validatePastePreview(raw, catalog, original) {
 if (!raw || !Array.isArray(raw.lines) || !raw.lines.length || raw.lines.length>50) fail('Extract 1–50 items, or shorten the pasted order.');
 const warnings=(Array.isArray(raw.warnings)?raw.warnings:[]).slice(0,20).map(value=>text(value,200)).filter(Boolean);
 const choices=[...catalog.products.map(p=>({id:p.id,kind:'product',name:p.name,price:p.price,weekly:p.productType==='weekly_meal_plan'})),...catalog.sets.filter(s=>s.available).map(s=>({id:s.id,kind:'set',name:s.name,price:s.price}))];
 const lines=raw.lines.map((line,index)=>{
  if (!line || typeof line!=='object') fail('The extraction returned an invalid item.');
  const name=text(line.name,120), evidence=text(line.evidence,1000);
  const issues=[];
  if (!evidence || !original.includes(evidence)) issues.push('Verify this item against the original message.');
  const matches=choices.filter(choice=>normalize(choice.name)===normalize(name));
  const match=matches.length===1?matches[0]:null;
  if (!match) issues.push(matches.length>1?'Multiple exact catalog matches. Choose the intended item.':'No exact catalog match. Choose an item or explicitly create a Custom Item.');
  const quantity=Number.isInteger(line.quantity)&&line.quantity>0&&line.quantity<=10000?line.quantity:0;
  if (!quantity) issues.push('Enter the quantity.');
  const date=validCalendarDate(line.date)?line.date:'';
  const time=/^([01]\d|2[0-3]):[0-5]\d$/.test(line.time)?line.time:'';
  const method=['pickup','delivery'].includes(line.method)?line.method:'';
  if (!date) issues.push('Confirm the fulfilment date.');
  if (!time) issues.push('Confirm the exact time.');
  if (!method) issues.push('Choose Pickup or Delivery.');
  const unitPrice=amount(line.unitPrice), lineTotal=amount(line.lineTotal);
  if (match && unitPrice!==null && Math.round(unitPrice*100)!==Math.round(match.price*100)) issues.push('Pasted unit price differs from the catalog. Catalog pricing applies.');
  if (unitPrice!==null && lineTotal!==null && Math.round(unitPrice*quantity*100)!==Math.round(lineTotal*100)) issues.push('Pasted quantity, price and line total conflict.');
  return {key:`paste-${index}`,name,quantity,date,time,method,address:text(line.address,500),notes:[pasteDeadlineNote(line,original,issues),text(line.remarks,300)].filter(Boolean).join(' · '),unitPrice,lineTotal,match:match?{id:match.id,kind:match.kind}:null,issues};
 });
 return {customerName:text(raw.customerName,120),phone:text(raw.phone,40),notes:text(raw.remarks,500),paymentStatement:text(raw.paymentStatement,300),deliveryFee:amount(raw.deliveryFee),warnings,lines};
}

export async function extractPasteOrder({db,uid,input,authorize,loadCheckout,generate,now=new Date()}) {
 if (!uid) throw new HttpsError('unauthenticated','Sign in to extract an order.');
 if (typeof input?.text!=='string'||input.text.trim().length<3||input.text.length>12000) fail('Paste 3–12,000 characters.');
 const base=await loadCheckout(db,input.slug);
 if (base.store.workspaceId!==input.workspaceId||base.store.id!==input.storeId) throw new HttpsError('permission-denied','Store ownership mismatch.');
 const full=await authorize({db,uid,workspaceId:input.workspaceId,posFullAccess:true});
 const checkout=full?await loadCheckout(db,input.slug,{includeUnavailable:true}):base;
 if (checkout.store.id!==base.store.id||checkout.store.workspaceId!==base.store.workspaceId) throw new HttpsError('permission-denied','Store ownership mismatch.');
 const key=createHash('sha256').update(`${uid}:${now.toISOString().slice(0,13)}`).digest('hex');
 await db.runTransaction(async tx=>{
  const ref=db.collection('storePosPasteUsage').doc(key), current=(await tx.get(ref)).data();
  if ((current?.count||0)>=20) throw new HttpsError('resource-exhausted','Extraction limit reached. Try again next hour or enter the order manually.');
  tx.set(ref,{uid,count:(current?.count||0)+1,expiresAt:new Date(now.getTime()+7200000)});
 });
 const response=await generate({text:input.text,malaysiaDate:new Date(now.getTime()+28800000).toISOString().slice(0,10)});
 let raw;
 try { if (typeof response!=='string'||response.length>60000) fail('Extraction response is too large.');raw=JSON.parse(response); }
 catch { fail('Unable to extract this message. Edit the text and retry, or enter the order manually.'); }
 return validatePastePreview(raw,checkout,input.text);
}
