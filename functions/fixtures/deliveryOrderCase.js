// Synthetic fixture reproducing the shape of MC-1020-DV47; no customer data.
export const deliveryOrderCase = () => ({
  id: 'fixture-order', orderNumber: 'MC-1020-ANON', pickupCode: 'ANON', storeId: 's', workspaceId: 's', country: 'MY', currency: 'MYR',
  customerName: 'Example Customer', phone: '0123456789', orderSource: 'online', fulfilmentMethod: 'delivery', fulfilmentStatus: 'New',
  pickupDate: '2026-10-22', pickupTime: '11:30', pickupLocationName: 'Example Counter', pickupLocationAddress: 'Example Kitchen, Test Street',
  items: [{productId:'a',productName:'Example Meal',quantity:3,selectedOptions:[],healthyLunchSnapshot:{planId:'plan',date:'2026-10-22'}},{productId:'b',productName:'Example Side',quantity:1,selectedOptions:[]}],
  fulfilments: [{id:'day_20261022',method:'delivery',date:'2026-10-22',time:'11:30',pickupLocationId:'',pickupLocationName:'Example Counter',pickupLocationAddress:'Example Kitchen, Test Street',allocations:[{itemIndex:0,quantity:3},{itemIndex:1,quantity:1}]}],
  fulfilmentOperations: {}, fulfilmentCompletion: {}, payment:{status:'paid',amountMinor:8070,currency:'MYR'}, total:80.7, totals:{deliveryFee:9,grandTotal:80.7},
  deliveryPricingSnapshot:{firstDayFee:9,fulfilmentCount:1,finalDeliveryTotal:9},
  delivery:{environment:'sandbox',fulfilmentMethod:'delivery',fulfilmentMode:'preorder',schedule:{date:'2026-10-22',time:'11:30',timeZone:'Asia/Kuala_Lumpur'},
    quote:{quotationId:'expired-original-quote',serviceType:'MOTORCYCLE',fee:9,expiresAt:'2026-10-20T06:45:51Z',stops:[{stopId:'original-sender',address:'Example Kitchen, Test Street',coordinates:{lat:'3.1',lng:'101.1'}},{stopId:'original-recipient',address:'Unit 8, Example Building, Test Road',coordinates:{lat:'3.11',lng:'101.11'}}]},
    pickup:{name:'Example Counter',address:'Example Kitchen, Test Street',latitude:'3.1',longitude:'101.1',contactName:'Example Sender',contactPhoneE164:'+60111111111'},
    recipient:{name:'Example Customer',phoneE164:'0123456789',address:'Unit 8, Example Building, Test Road',latitude:'3.11',longitude:'101.11',instructions:'Unit 8'},
    dispatch:{status:'not_requested'},lifecycle:{state:'not_started'}}
});
