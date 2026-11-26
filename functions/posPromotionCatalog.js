import {HttpsError} from 'firebase-functions/v2/https';
import {assertOperator} from './externalPosOrders.js';
import {normalizePromotion,isValidPromotion} from './storePromotionPricing.js';
// Existing POS roles receive only the scoped calculation terms; private promotion records remain protected.
export async function getPosPromotionCatalog({db,uid,input}) {
  if(!uid)throw new HttpsError('unauthenticated','Sign in to view POS promotion pricing.');
  if(!input?.storeId || !input?.workspaceId)throw new HttpsError('invalid-argument','Choose a Store and Workspace.');
  await assertOperator({db,uid,workspaceId:input.workspaceId});
  const store=(await db.collection('stores').doc(input.storeId).get()).data();
  if(!store || store.workspaceId!==input.workspaceId || store.slug!==input.slug)throw new HttpsError('permission-denied','Store ownership mismatch.');
  const snapshot=await db.collection('storePromotions').where('storeId','==',input.storeId).where('active','==',true).get();
  const promotions=snapshot.docs.map(doc=>normalizePromotion(doc.id,doc.data())).filter(p=>p.storeId===input.storeId && p.workspaceId===input.workspaceId && isValidPromotion(p));
  return {promotions:promotions.map(p=>({id:p.id,storeId:p.storeId,workspaceId:p.workspaceId,name:p.name,active:p.active,type:p.type,eligibleProductIds:p.eligibleProductIds,
    minimumQuantity:p.minimumQuantity,minimumOrderAmount:p.minimumOrderAmount,startsAt:p.startsAt.toISOString(),endsAt:p.endsAt?.toISOString() || null,priority:p.priority,
    ...(p.type==='percentage'?{percentageOff:p.percentageOff}:p.type==='fixed_amount'?{fixedAmountOff:p.fixedAmountOff}:{buyQuantity:p.buyQuantity,getQuantity:p.getQuantity})}))};
}
