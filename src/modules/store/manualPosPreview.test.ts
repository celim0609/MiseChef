import test from "node:test";
import assert from "node:assert/strict";
import { previewManualLines, type ManualLine } from "./manualPosPreview";
import { buildManualOrder } from "../../../functions/manualPosOrders.js";
import type { StoreProduct, StoreSet, StoreOptionGroup } from "./types";
const products = [
  {
    id: "p",
    storeId: "s",
    workspaceId: "s",
    name: "Lunch",
    price: 15,
    available: true,
    optionGroupIds: ["g"],
  },
] as StoreProduct[];
const groups = [
  {
    id: "g",
    name: "Extra",
    available: true,
    required: false,
    selectionType: "single",
    options: [{ id: "o", name: "Egg", priceAdjustment: 2, available: true }],
  },
] as StoreOptionGroup[];
const sets = [
  {
    id: "set",
    name: "Meal set",
    price: 20,
    available: true,
    storeId: "s",
    groups: [
      {
        id: "main",
        name: "Main",
        required: true,
        selectionCount: 1,
        options: [{ productId: "p", priceAdjustment: 3 }],
      },
    ],
  },
] as StoreSet[];
const line = (change: Partial<ManualLine> = {}): ManualLine => ({
  date: "2026-10-20",
  time: "12:00",
  method: "pickup",
  quantity: 2,
  notes: "",
  deliveryAddress: "",
  selection: {
    productId: "p",
    selectedOptions: [{ groupId: "g", optionId: "o" }],
  },
  ...change,
});
const store = {
  id: "s",
  workspaceId: "s",
  orderDays: ["monday", "tuesday", "wednesday", "thursday", "friday"],
  maximumAdvanceDays: 30,
  earliestPickupDays: 0,
  unavailableDates: [],
  pickupOperatingHours: { start: "09:00", end: "18:00" },
};
test("catalog modifiers and custom items across days match server total without posting client prices", () => {
  const lines = [
    line(),
    line({
      date: "2026-10-21",
      selection: undefined,
      custom: { name: "Custom", unitPrice: 12.5 },
    }),
  ];
  const preview = previewManualLines(lines, products, sets, groups);
  const built = buildManualOrder(
    { source: "whatsapp", customerName: "QA", phone: "", lines },
    { store, products, optionGroups: groups, sets },
    new Date("2026-10-19T04:00:00Z"),
  );
  assert.equal(preview.totalMinor, 5900);
  assert.equal(preview.totalMinor, built.total * 100);
  assert.deepEqual(
    preview.days.map((day) => day.totalMinor),
    [3400, 2500],
  );
  assert.equal(preview.days[0].entries[0].quantity, 2);
});
test("set upgrades use the existing options and price calculation", () => {
  const lines = [
    line({
      selection: {
        setId: "set",
        selectedOptions: [],
        selectedSetItems: [{ groupId: "main", productId: "p" }],
      },
    }),
  ];
  const preview = previewManualLines(lines, products, sets, groups);
  assert.equal(preview.totalMinor, 4600);
});
test("incomplete or invalid prices never appear as a payable grand total", () => {
  for (const custom of [
    { name: "", unitPrice: 5 },
    { name: "X", unitPrice: NaN },
    { name: "X", unitPrice: 1.234 },
  ])
    assert.equal(
      previewManualLines([line({ custom })], products, sets, groups).totalMinor,
      null,
    );
  assert.equal(
    previewManualLines([line({ quantity: 0 })], products, sets, groups)
      .totalMinor,
    null,
  );
  const required = groups.map((g) => ({
    ...g,
    required: true,
    minimumSelections: 1,
    maximumSelections: 1,
  }));
  assert.equal(
    previewManualLines(
      [line({ selection: { productId: "p", selectedOptions: [] } })],
      products,
      sets,
      required,
    ).totalMinor,
    null,
  );
});
test("Owner Custom Item preview accepts 20, 21, 40, 100 and 200 while staff stays capped", () => {
  for (const quantity of [20, 21, 40, 100, 200]) {
    const rows = [line({ quantity, selection: undefined, custom: { name: "Custom Item", unitPrice: 4 } })];
    assert.equal(previewManualLines(rows, products, sets, groups, true).totalMinor, 400 * quantity);
    assert.equal(previewManualLines(rows, products, sets, groups).totalMinor, quantity <= 20 ? 400 * quantity : null);
  }
});
test("Owner catalog and set previews accept quantity 40 at canonical prices", () => {
  assert.equal(previewManualLines([line({ quantity: 40 })], products, sets, groups, true).totalMinor, 68000);
  const setLine = line({ quantity: 40, selection: { setId: "set", selectedOptions: [], selectedSetItems: [{ groupId: "main", productId: "p" }] } });
  assert.equal(previewManualLines([setLine], products, sets, groups, true).totalMinor, 92000);
  assert.equal(previewManualLines([setLine], products, sets, groups).totalMinor, null);
});
test("weekly package has five dated allocations whose cents sum to one package total", () => {
  const plan = {
    ...products[0],
    id: "week",
    name: "Weekly",
    productType: "weekly_meal_plan",
    price: 80.03,
    optionGroupIds: [],
    weeklyMeals: { mon: "p", tue: "p", wed: "p", thu: "p", fri: "p" },
  } as StoreProduct;
  const result = previewManualLines(
    [
      line({
        date: "2026-10-26",
        quantity: 1,
        selection: { productId: "week", selectedOptions: [] },
      }),
    ],
    [...products, plan],
    [],
    [],
  );
  assert.equal(result.days.length, 5);
  assert.equal(result.totalMinor, 8003);
  assert.equal(
    result.days.reduce((n, d) => n + d.totalMinor, 0),
    8003,
  );
  assert.deepEqual(
    result.days.map((d) => d.date),
    ["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30"],
  );
});

test('embedded meal-day previews match server prices and meal modifiers', () => {
  const meals = Object.fromEntries(['mon','tue','wed','thu','fri'].map(day => [day, {name:`${day} bowl`,price:12.9,photoUrl:'meal.jpg',optionGroups:day==='tue'?[{id:'egg',name:'Egg',type:'choose',required:true,selection:'single',options:[{id:'omega',name:'Omega',priceAdjustmentMinor:120}]}]:[]}]));
  const plan = {id:'plan',storeId:'s',workspaceId:'s',name:'Weekly',productType:'weekly_meal_plan',weeklyMenuVersion:2,available:true,price:60,optionGroupIds:[],weeklyWeeks:{week1:{startMonday:'2026-10-19',meals}}} as unknown as StoreProduct;
  const lines = [line({quantity:1,selection:{productId:'plan',healthyLunchPlanId:'plan',healthyLunchDate:'2026-10-20',selectedOptions:[],selectedMealOptions:[{optionGroupId:'egg',optionId:'omega',serviceDate:'2026-10-20'}]}})];
  const preview = previewManualLines(lines,[plan],[],[]);
  const built = buildManualOrder({source:'whatsapp',customerName:'QA',phone:'',lines},{store,products:[plan],optionGroups:[],sets:[]},new Date('2026-10-19T04:00:00Z'));
  assert.equal(preview.totalMinor,1410); assert.equal(preview.totalMinor,Math.round(built.total*100)); assert.equal(preview.rows[0].name,'tue bowl');
});
