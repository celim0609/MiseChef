import { httpsCallable } from 'firebase/functions';
import { functions } from '../../../firebase';
export type GroupApproval = { id:string; approvedBy:string; approvedAt:string; approvedPortions:number; estimatedDeliveryCostMinor:number; currency:string; customerDeliveryFeeMinor:number; reservationExpiresAt?:string };
export type GroupReviewSummary = { id:string; date:string; areaId:string; areaName:string; status:string; activePortions:number; target:number; expiresAt:string; approval?:GroupApproval };
export type GroupReviewMember = { id:string; name:string; phone:string; mealReleased?:boolean; unit:string; fallbackQuote?:{quoteId:string;amountMinor:number;expiresAt:string}; deliveryFeeVerified?:boolean; portions:number; expiresAt:string; address:{formattedAddress:string;latitude:number;longitude:number}; items:Array<{name:string;quantity:number;portionsPerUnit:number;selectedMealOptions?:Array<{optionName:string}>}> };
export type GroupEstimate = { id:string; valid:boolean; feeMinor:number; currency:string; environment:string; expiresAt:string; serviceType:string; scheduleAt:string; route:Array<{address:string}> };
export type GroupReviewDetail = { group:GroupReviewSummary; members:GroupReviewMember[]; cancellationRequests?:Array<{customerId:string;mealOrderId:string;requestedAt:string}>; pickup:{address:string}|null; estimate:GroupEstimate|null; history:GroupApproval[] };
async function call<T>(name:string,data:unknown):Promise<T> {
  if(!functions) throw new Error('Group review unavailable. / 团购审核暂不可用。');
  return (await httpsCallable<unknown,T>(functions,name)(data)).data;
}
export const groupDeliveryReviewService = {
  list:(storeId:string,workspaceId:string,date='',cursor='',areaId='')=>call<{groups:GroupReviewSummary[];cursor:string;areas:Array<{areaId:string;areaName:string}>}>('listMiseChefGroupDeliveryReview',{storeId,workspaceId,date,cursor,areaId}),
  detail:(storeId:string,workspaceId:string,groupId:string)=>call<GroupReviewDetail>('getMiseChefGroupDeliveryReview',{storeId,workspaceId,groupId}),
  estimate:(storeId:string,workspaceId:string,groupId:string,pickupTime:string)=>call<GroupEstimate>('estimateMiseChefGroupDelivery',{storeId,workspaceId,groupId,pickupTime}),
  releaseMeal:(storeId:string,groupId:string,customerId:string)=>
    call<{released:boolean}>('releaseMiseChefGroupMeal',{storeId,groupId,customerId}),
  verifyFee:(storeId:string,groupId:string,customerId:string,quoteId:string,amountMinor:number,receipt:string)=>
    call<{verified:boolean}>('verifyMiseChefGroupDeliveryFee',{storeId,groupId,customerId,quoteId,amountMinor,receipt}),
  approve:(storeId:string,workspaceId:string,groupId:string,estimate:GroupEstimate,requestId:string)=>call<{duplicate:boolean;approval:GroupApproval}>('approveMiseChefGroupDelivery',{storeId,workspaceId,groupId,estimateId:estimate.id,expectedFeeMinor:estimate.feeMinor,confirmFreeDelivery:true,requestId})
};
