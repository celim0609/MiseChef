import {useEffect,useState} from 'react';
import {storeOrderService} from './services';
import type {StorePromotion} from './types';
export function usePosPromotions(workspaceId:string,storeId:string,slug:string,enabled:boolean) {
  const [state,setState]=useState<{promotions:StorePromotion[];ready:boolean;error:string}>({promotions:[],ready:false,error:''});
  const [clock,setClock]=useState(Date.now());
  useEffect(()=>{
    setState({promotions:[],ready:false,error:''});
    if(!enabled||!slug)return;
    let active=true,inFlight=false;
    const refresh=async()=>{if(inFlight)return;inFlight=true;try{const promotions=await storeOrderService.listPosPromotions(workspaceId,storeId,slug);if(active)setState({promotions,ready:true,error:''});}catch(error){if(active)setState(previous=>({...previous,ready:false,error:error instanceof Error?error.message:'Unable to verify promotion pricing.'}));}finally{inFlight=false;if(active)setClock(Date.now());}};
    void refresh();const timer=window.setInterval(()=>void refresh(),15000);
    window.addEventListener('focus',refresh);
    return()=>{active=false;window.clearInterval(timer);window.removeEventListener('focus',refresh);};
  },[workspaceId,storeId,slug,enabled]);
  return {...state,now:new Date(clock)};
}
