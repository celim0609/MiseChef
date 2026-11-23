import {withHistoryReadFallback, HISTORY_INITIALIZATION_NOTICE} from '../../../../functions/posHistoryReadPolicy.js';
import { collection, getDoc, getDocs, doc, query, where, orderBy, limit, startAfter, type QueryDocumentSnapshot, type DocumentData } from 'firebase/firestore';
import {db} from '../../../firebase';
import {storeOrderService} from './storeOrderService';
import {historySearchToken, normalizeHistorySearch} from '../../../../functions/posHistoryIndex.js';
import type {StoreOrder} from '../types';
export type HistorySearchCursor = QueryDocumentSnapshot<DocumentData>;
export interface HistorySearchPage {orders: StoreOrder[]; cursor: HistorySearchCursor | null; hasMore: boolean; scanned: number; source: 'index' | 'legacy'; notice?: string}
export const HISTORY_SEARCH_PAGE_SIZE = 50;
export async function searchPosHistory(input: {storeId:string;workspaceId:string;start:string;end:string;search:string;allDates:boolean}, cursor:HistorySearchCursor|null=null, cursorSource?: 'index'|'legacy'): Promise<HistorySearchPage> {
  if (!db) throw new Error('History search is unavailable.');
  const ready=await getDoc(doc(db,'system','posHistoryIndex'));
  const legacyPage = async (): Promise<HistorySearchPage> => {
    const page = await storeOrderService.getTerminalOrderHistoryPage(input.storeId,input.workspaceId,cursor);
    return {...page,scanned:page.orders.length,source:'legacy',notice:HISTORY_INITIALIZATION_NOTICE};
  };
  return withHistoryReadFallback({readiness:ready.data(),cursorSource:cursor ? cursorSource : undefined,hasCursor:Boolean(cursor),loadLegacy:legacyPage,loadIndex:async ():Promise<HistorySearchPage>=>{
  const text=normalizeHistorySearch(input.search);
  const constraints=[where('storeId','==',input.storeId),where('workspaceId','==',input.workspaceId)];
  if(text) constraints.push(where('searchTerms','array-contains',historySearchToken(text)));
  if(!input.allDates) constraints.push(where('date','>=',input.start),where('date','<',input.end));
  const snapshot=await getDocs(query(collection(db,'storeOrderHistoryIndex'),...constraints,orderBy('date','desc'),...(cursor?[startAfter(cursor)]:[]),limit(HISTORY_SEARCH_PAGE_SIZE+1)));
  const documents=snapshot.docs.slice(0,HISTORY_SEARCH_PAGE_SIZE);
  const ids=[...new Set<string>(documents.filter(document => !text || document.data().searchValues.some((value:string)=>value.includes(text))).map(document=>document.data().orderId as string))];
  // Canonical reads preserve current details, permissions and actions. Never trust a projection as order state.
  const orders=(await Promise.all(ids.map(id=>storeOrderService.getOrder(id)))).filter((order):order is StoreOrder=>Boolean(order && !order.deletedAt));
  const hasMore=snapshot.docs.length>HISTORY_SEARCH_PAGE_SIZE;
  return {orders,cursor:hasMore?documents.at(-1)||null:null,hasMore,scanned:documents.length,source:'index'};
  }});
}
