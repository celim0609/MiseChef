import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { Recipe } from '../../types';
import { getReadyToSellProductDraft, getStoreProductEditorDraft, buildUpdatedStoreProduct } from './storeProductVisibility';

const recipe: Pick<Recipe, 'id' | 'title' | 'sellingPrice' | 'costing'> = {
  id: 'recipe-laksa',
  title: ' Laksa Noodles ',
  sellingPrice: 12.5
};

const completeNutrition = { status: 'COMPLETE' as const, totalKcal: 840, kcalPerServing: 420, incompleteReasons: [] };

test('Ready to Sell opens a new Store Product draft with only sellable Recipe fields', () => {
  assert.deepEqual(getReadyToSellProductDraft(recipe, completeNutrition), {
    photoUrl: '',
    name: 'Laksa Noodles',
    description: '',
    price: 12.5,
    calories: 420,
    recipeId: 'recipe-laksa',
    available: true,
    optionGroupIds: []
  });
});

test('Ready to Sell snapshots public Recipe values without copying costing data', () => {
  const draft = getReadyToSellProductDraft({
    ...recipe,
    sellingPrice: 18,
    costing: {
      totalRecipeCost: 6,
      costPerPortion: 3,
      sellingPrice: 18,
      foodCostPercentage: 16.67,
      grossProfitPercentage: 83.33,
      breakdown: [],
      lastCalculatedAt: '2026-09-27T00:00:00.000Z'
    }
  }, { ...completeNutrition, totalKcal: 1020, kcalPerServing: 510 });

  assert.equal(draft.price, 18);
  assert.equal(draft.calories, 510);
  assert.deepEqual(Object.keys(draft).sort(), [
    'available', 'calories', 'description', 'name', 'optionGroupIds', 'photoUrl', 'price', 'recipeId'
  ]);
});

test('Ready to Sell leaves calories absent when Recipe nutrition is incomplete', () => {
  const draft = getReadyToSellProductDraft(recipe, { status: 'INCOMPLETE', incompleteReasons: ['Flour: nutrition profile is required.'] });

  assert.equal(draft.calories, undefined);
});

test('Ready to Sell sends a carried Recipe photo through the existing Store Product upload path', () => {
  const source = readFileSync(new URL('./StorePage.tsx', import.meta.url), 'utf8');

  assert.match(source, /loadRecipePhotoForStoreProduct\(\{ recipeId: recipe\.id, photoUrl \}\)/);
  assert.match(source, /uploadStoreProductPhoto\(\{ workspaceId: workspace\.id, productId, file: productPhotoFile \}\)/);
  assert.match(source, /uploadStoreProductSocialImage\(\{ workspaceId: workspace\.id, productId, file: productPhotoFile \}\)/);
  assert.doesNotMatch(source, /photoUrl: recipe\.(?:imageUrl|coverImage)/);
});

test('Ready to Sell remains available with estimated nutrition', () => {
  const draft = getReadyToSellProductDraft(recipe, {
    status: 'ESTIMATED', totalKcal: 800, kcalPerServing: 400,
    calculatedIngredientCount: 8, totalIngredientCount: 9,
    incompleteReasons: ['Ginger nutrition data unavailable']
  });
  assert.equal(draft.recipeId, recipe.id);
  assert.equal(draft.price, 12.5);
  assert.equal(draft.available, true);
});

test('manual photos invalidate pending transfers and stale nutrition cannot reset another draft', () => {
  const source = readFileSync(new URL('./StorePage.tsx', import.meta.url), 'utf8');
  const manual = source.slice(source.indexOf('const handleProductPhotoChange'), source.indexOf('const handleSetUpStore'));
  assert.match(manual, /productPhotoTransferIdRef.current \+= 1/);
  assert.match(manual, /readImageFile\(event, setProductPhotoFile\)/);
  assert.match(source, /if \(productDraftRequestIdRef.current !== requestId\) return;\s*setProductDraft/);
  assert.match(source, /if \(productPhotoTransferIdRef.current === transferId\) setProductPhotoFile\(photo\)/);
});

test('estimated calories remain absent rather than becoming a complete Product value', () => {
  assert.equal(getReadyToSellProductDraft(recipe, { status: 'ESTIMATED', totalKcal: 800, kcalPerServing: 400, incompleteReasons: ['Missing data'] }).calories, undefined);
});

test('Ready to Sell carries Partial kcal as clearly labelled editable public description', () => {
  const draft = getReadyToSellProductDraft(recipe, { status: 'ESTIMATED', totalKcal: 80, kcalPerServing: 8.275862, incompleteReasons: ['Missing food'] });
  assert.match(draft.description, /Partial nutrition \(estimated\): 8.3 kcal per serving/);
  assert.equal(draft.calories, undefined);
  assert.equal(draft.photoUrl, '');
  const saved = buildUpdatedStoreProduct({ ...draft, id: 'product', workspaceId: 'workspace', storeId: 'store', createdAt: '', updatedAt: '' } as import('./types').StoreProduct, { ...draft, description: 'My manual product description', calories: 100 }, 'now');
  const reopened = getStoreProductEditorDraft(saved);
  assert.equal(reopened.description, 'My manual product description');
  assert.equal(reopened.calories, 100);
  for (const value of [undefined, NaN, Infinity, -1]) {
    assert.equal(getReadyToSellProductDraft(recipe, { status: 'ESTIMATED', kcalPerServing: value, incompleteReasons: [] }).description, '');
  }
});

test('late Ready to Sell nutrition fills only nutrition fields without losing edited name, price, photo or recipe link', async () => {
 const {applyReadyToSellNutrition}=await import('./storeProductVisibility');
 const initial=getReadyToSellProductDraft(recipe);
 const edited={...initial,name:'Customer name',price:25,photoUrl:'https://store.test/manual.jpg'};
 const filled=applyReadyToSellNutrition(edited,recipe as Recipe,completeNutrition);
 assert.deepEqual(filled,{...edited,calories:420});
 const manual={...edited,calories:88,description:'Keep my copy'};
 assert.deepEqual(applyReadyToSellNutrition(manual,recipe as Recipe,completeNutrition),manual);
 assert.equal(applyReadyToSellNutrition({...edited,recipeId:'other'},recipe as Recipe,completeNutrition).calories,undefined);
 for(const status of ['ESTIMATED','INCOMPLETE'] as const) assert.equal(applyReadyToSellNutrition(initial,recipe as Recipe,{...completeNutrition,status}).calories,undefined);
});

test('actual Ready to Sell handler opens immediately, preserves edits during nutrition loading and isolates manual photos', async () => {
 const {transpileModule,ModuleKind,ScriptTarget}=await import('typescript');
 const {applyReadyToSellNutrition}=await import('./storeProductVisibility');
 const source=readFileSync(new URL('./StorePage.tsx',import.meta.url),'utf8');
 const handler=source.slice(source.indexOf('  const openReadyToSellProduct = async'),source.indexOf('\n  useEffect(() => {\n    if (!readyToSellRecipe)'));
 const state={draft:{} as import('./types').StoreProductDraft,open:false,nutritionLoading:false,photo:null as unknown};
 let finish!: (value: unknown)=>void;const pending=new Promise(resolve=>{finish=resolve;});
 let finishPhoto!: (value: unknown)=>void;const photo=new Promise(resolve=>{finishPhoto=resolve;});
 const photoRef={current:0},draftRef={current:0};
 const scope={productPhotoTransferIdRef:photoRef,productDraftRequestIdRef:draftRef,
  setActiveView(){},setEditingProduct(){},setProductOptions(){},setSavedOptionGroupId(){},setRecipePhotoError(){},setIsRecipePhotoLoading(){},clearMessages(){},
  setProductDraft(value:typeof state.draft|((current:typeof state.draft)=>typeof state.draft)){state.draft=typeof value==='function'?value(state.draft):value;},
  setProductPhotoFile(value:unknown){state.photo=value;},setIsRecipeNutritionLoading(value:boolean){state.nutritionLoading=value;},setIsProductFormOpen(value:boolean){state.open=value;},
  getReadyToSellProductDraft,applyReadyToSellNutrition,loadRecipePhotoForStoreProduct:()=>photo,loadIngredientNutritionProfiles:()=>pending,
  workspace:{id:'workspace'},recipes:[],calculateRecipeNutrition:()=>completeNutrition};
 const compiled=transpileModule(handler,{compilerOptions:{module:ModuleKind.None,target:ScriptTarget.ES2022}}).outputText;
 const open=new Function(...Object.keys(scope),`${compiled};return openReadyToSellProduct;`)(...Object.values(scope)) as (recipe:Recipe)=>Promise<void>;
 const task=open({...recipe,ingredients:[],imageUrl:'https://recipe.test/photo.jpg'} as Recipe);
 assert.equal(state.open,true);assert.equal(state.nutritionLoading,true);assert.equal(state.draft.recipeId,recipe.id);
 state.draft={...state.draft,name:'Keep edits',price:20};photoRef.current++;state.photo='manual photo';
 finish({});await task;finishPhoto('late Recipe photo');await Promise.resolve();
 assert.equal(state.draft.name,'Keep edits');assert.equal(state.draft.price,20);assert.equal(state.draft.calories,420);
 assert.equal(state.photo,'manual photo');assert.equal(state.nutritionLoading,false);
});

test('Store reload retains a newly saved Recipe product beyond the old 50-product boundary', async () => {
 const {transpileModule,ModuleKind,ScriptTarget}=await import('typescript');
 const {normalizeStoreProduct}=await import('./storeModel');
 const source=readFileSync(new URL('./services/storeService.ts',import.meta.url),'utf8');
 const method=source.slice(source.indexOf('  async listAdminProducts('),source.indexOf('  async createProduct('));
 const documents=Array.from({length:61},(_,index)=>({id:`product-${index}`,data:()=>({workspaceId:'workspace',storeId:'workspace',name:`Product ${index}`,photoUrl:'https://store.test/photo.jpg',recipeId:recipe.id,calories:420,updatedAt:String(index).padStart(3,'0')})}));
 const scope={db:{},collection:()=>({}),where:()=>({}),limit:(count:number)=>({count}),query:(_:unknown,...constraints:Array<{count?:number}>)=>constraints,
  getDocs:async(constraints:Array<{count?:number}>)=>({docs:documents.slice(0,constraints.find(item=>item.count)?.count??documents.length)}),normalizeStoreProduct};
 const code=transpileModule(`const service={${method}}`,{compilerOptions:{module:ModuleKind.None,target:ScriptTarget.ES2022}}).outputText;
 const service=new Function(...Object.keys(scope),`${code};return service;`)(...Object.values(scope));
 const products=await service.listAdminProducts('workspace');assert.equal(products.length,61);
 assert.equal(products[0].id,'product-60');assert.equal(products[0].recipeId,recipe.id);assert.equal(products[0].calories,420);
});
