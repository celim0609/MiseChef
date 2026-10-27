import test from "node:test";
import assert from "node:assert/strict";
import {
  buildManualOrder,
  confirmManualPosPayment,
  saveManualPosOrder,
} from "./manualPosOrders.js";
const now = new Date("2026-10-18T04:00:00Z");
const store = {
  id: "s",
  workspaceId: "s",
  name: "GG Grab&Go",
  currency: "MYR",
  country: "MY",
  orderDays: ["monday", "tuesday", "wednesday", "thursday", "friday"],
  earliestPickupDays: 0,
  maximumAdvanceDays: 30,
  unavailableDates: [],
  pickupOperatingHours: { start: "09:00", end: "18:00" },
};
const products = [
  {
    id: "prawn",
    storeId: "s",
    workspaceId: "s",
    name: "Vietnam Prawn Noodle Salad",
    price: 15,
    available: true,
    optionGroupIds: [],
  },
  {
    id: "burrito",
    storeId: "s",
    workspaceId: "s",
    name: "Chicken Burrito Bowl",
    price: 18,
    available: true,
    optionGroupIds: [],
  },
];
const checkout = { store, products, optionGroups: [], sets: [] };
const line = (id, date, quantity = 1) => ({
  selection: { productId: id, selectedOptions: [], unitPrice: 0 },
  date,
  time: "12:00",
  method: "pickup",
  quantity,
  notes: "",
});
const input = () => ({
  slug: "gg",
  storeId: "s",
  workspaceId: "s",
  requestId: "request-1234567890",
  source: "whatsapp",
  customerName: "Py",
  phone: "0164209116",
  lines: [line("prawn", "2026-10-19"), line("burrito", "2026-10-20", 2)],
});
test("Py manual order keeps one server-priced total and allocates Monday prawn and Tuesday burrito independently", () => {
  const result = buildManualOrder(
    { ...input(), payment: { status: "paid" }, total: 1 },
    checkout,
    now,
  );
  assert.equal(result.total, 51);
  assert.equal(result.fulfilments.length, 2);
  assert.deepEqual(
    result.fulfilments.map((d) => d.allocations),
    [[{ itemIndex: 0, quantity: 1 }], [{ itemIndex: 1, quantity: 2 }]],
  );
});
test("custom items mix across dates, preserve notes and optionally save only privately", () => {
  const result = buildManualOrder(
    {
      ...input(),
      lines: [
        ...input().lines,
        {
          custom: { name: "Special lunch", unitPrice: 12.5, savePrivate: true },
          quantity: 2,
          date: "2026-10-20",
          time: "12:00",
          method: "pickup",
          notes: "No chilli",
        },
      ],
    },
    checkout,
    now,
  );
  assert.equal(result.items[2].productId, "");
  assert.equal(result.total, 76);
  assert.equal(result.fulfilments[1].allocations.length, 2);
  assert.equal(result.privateItems[0].notes, "No chilli");
});
test("Owner manual Custom Item quantities use the canonical RM4 price and retain safe limits", () => {
  for (const quantity of [20, 21, 40, 100, 200]) {
    const result = buildManualOrder(
      { ...input(), lines: [{ ...line("prawn", "2026-10-19", quantity), selection: undefined, custom: { name: "Custom Item", unitPrice: 4 } }] },
      checkout, now, { owner: true },
    );
    assert.equal(result.total, 4 * quantity);
    assert.equal(result.items[0].lineTotal, 4 * quantity);
    assert.equal(result.fulfilments[0].allocations[0].quantity, quantity);
  }
  assert.throws(() => buildManualOrder({ ...input(), lines: [line("prawn", "2026-10-19", 10001)] }, checkout, now, { owner: true }), /10,000/);
  assert.throws(() => buildManualOrder({ ...input(), lines: [line("prawn", "2026-10-19", 1.5)] }, checkout, now, { owner: true }), /quantity/i);
});
test("privileged manual Custom Item accepts 10,000 and rejects 10,001", () => {
  const custom = quantity => ({ ...input(), lines: [{ ...line("prawn", "2026-10-19", quantity), selection: undefined, custom: { name: "Custom Item", unitPrice: 20 } }] });
  assert.equal(buildManualOrder(custom(10000), checkout, now, { owner: true }).total, 200000);
  assert.throws(() => buildManualOrder(custom(10001), checkout, now, { owner: true }), /10,000/);
});
test("privileged catalog quantities above 20 retain server pricing; other staff remains capped", () => {
  for (const quantity of [21, 40, 100, 200]) {
    const result = buildManualOrder({ ...input(), lines: [line("prawn", "2026-10-19", quantity)] }, checkout, now, { owner: true });
    assert.equal(result.total, 15 * quantity);
  }
  assert.throws(() => buildManualOrder({ ...input(), lines: [line("prawn", "2026-10-19", 21)] }, checkout, now), /1–20/);
});
test("manual preorder rejects invalid dates, same-day at Malaysia midnight, forged catalog items, invalid prices and quantities", () => {
  for (const date of ["2026-10-18", "2026-02-30", "2026-13-20", "garbage"])
    assert.throws(() =>
      buildManualOrder(
        { ...input(), lines: [line("prawn", date)] },
        checkout,
        now,
      ),
    );
  assert.throws(
    () =>
      buildManualOrder(
        { ...input(), lines: [line("prawn", "2026-10-19")] },
        checkout,
        new Date("2026-10-18T16:00:00Z"),
      ),
    /advance/,
  );
  for (const price of [-1, NaN, Infinity, 1.234, "5"])
    assert.throws(() =>
      buildManualOrder(
        {
          ...input(),
          lines: [
            {
              ...line("prawn", "2026-10-19"),
              selection: undefined,
              custom: { name: "x", unitPrice: price },
            },
          ],
        },
        checkout,
        now,
      ),
    );
  assert.throws(() =>
    buildManualOrder(
      { ...input(), lines: [line("unknown", "2026-10-19")] },
      checkout,
      now,
    ),
  );
  assert.throws(() =>
    buildManualOrder(
      { ...input(), lines: [line("prawn", "2026-10-19", 0)] },
      checkout,
      now,
    ),
  );
});
test("same date groups by time/mode and rejects mismatched delivery destinations", () => {
  const a = line("prawn", "2026-10-19"),
    b = {
      ...line("burrito", "2026-10-19"),
      time: "13:00",
      method: "delivery",
      deliveryAddress: "Customer address",
    };
  assert.equal(
    buildManualOrder({ ...input(), lines: [a, b] }, checkout, now).fulfilments
      .length,
    2,
  );
  assert.throws(
    () =>
      buildManualOrder(
        { ...input(), lines: [{ ...b, deliveryAddress: "" }] },
        checkout,
        now,
      ),
    /address/,
  );
});
test("weekly plan plus regular/custom lines creates five component allocations without multiplying parent total", () => {
  const days = ["mon", "tue", "wed", "thu", "fri"];
  const meals = days.map((day) => ({
    ...products[0],
    id: day,
    name: `${day} meal`,
    availableDay: day,
  }));
  const plan = {
    ...products[0],
    id: "plan",
    name: "Weekly",
    price: 60,
    productType: "weekly_meal_plan",
    weeklyMeals: Object.fromEntries(days.map((d) => [d, d])),
  };
  const result = buildManualOrder(
    {
      ...input(),
      lines: [line("plan", "2026-10-19"), line("burrito", "2026-10-20")],
    },
    { ...checkout, products: [...products, ...meals, plan] },
    now,
  );
  assert.equal(result.total, 78);
  assert.equal(result.fulfilments.length, 5);
  assert.equal(
    result.items[0].weeklyPlanSnapshot.meals[1].productName,
    "tue meal",
  );
  assert.equal(result.fulfilments[1].allocations[0].componentDay, "tue");
});
test("Owner weekly quantities above 20 keep five allocations and one parent total", () => {
  const days = ["mon", "tue", "wed", "thu", "fri"];
  const meals = days.map(day => ({ ...products[0], id: day, availableDay: day }));
  const plan = { ...products[0], id: "plan", price: 60, productType: "weekly_meal_plan", weeklyMeals: Object.fromEntries(days.map(day => [day, day])) };
  const result = buildManualOrder({ ...input(), lines: [line("plan", "2026-10-19", 21)] }, { ...checkout, products: [...products, ...meals, plan] }, now, { owner: true });
  assert.equal(result.total, 1260);
  assert.equal(result.fulfilments.length, 5);
  assert.ok(result.fulfilments.every(day => day.allocations[0].quantity === 21));
});
test("Owner set quantity 40 keeps the configured set price and allocation", () => {
  const set = { id: "meal-set", storeId: "s", workspaceId: "s", name: "Meal set", available: true, price: 20, groups: [{ id: "main", name: "Main", required: true, selectionCount: 1, options: [{ productId: "prawn", priceAdjustment: 3 }] }] };
  const setLine = { ...line("prawn", "2026-10-19", 40), selection: { setId: "meal-set", selectedOptions: [], selectedSetItems: [{ groupId: "main", productId: "prawn" }] } };
  const result = buildManualOrder({ ...input(), lines: [setLine] }, { ...checkout, sets: [set] }, now, { owner: true });
  assert.equal(result.total, 920);
  assert.equal(result.items[0].setSnapshot.setId, "meal-set");
  assert.equal(result.fulfilments[0].allocations[0].quantity, 40);
  assert.throws(() => buildManualOrder({ ...input(), lines: [setLine] }, { ...checkout, sets: [set] }, now), /1–20/);
});
// Transactional fake persists dotted updates and rejects duplicate creates, exercising retries.
function database(initial = {}) {
  const docs = structuredClone(initial);
  const writes = [];
  let auto = 0;
  const ref = (name, id = `auto${++auto}`) => ({
    id,
    key: `${name}/${id}`,
    get: async () => snap(ref(name, id)),
    collection: (child) => collection(`${name}/${id}/${child}`),
  });
  const snap = (r) => ({
    exists: !!docs[r.key],
    data: () => structuredClone(docs[r.key]),
  });
  const collection = (name) => ({
    doc: (id) => ref(name, id),
    where: () => ({
      where() {
        return this;
      },
      limit() {
        return { query: true };
      },
    }),
  });
  const db = {
    collection,
    runTransaction: async (handler) =>
      handler({
        get: async (r) => (r.query ? { empty: true } : snap(r)),
        create(r, v) {
          if (docs[r.key]) throw Error("duplicate");
          docs[r.key] = structuredClone(v);
          writes.push(r.key);
        },
        set(r, v) {
          docs[r.key] = structuredClone(v);
          writes.push(r.key);
        },
        update(r, v) {
          for (const [key, val] of Object.entries(v)) {
            const parts = key.split(".");
            let target = docs[r.key];
            while (parts.length > 1) {
              const p = parts.shift();
              target = target[p] ??= {};
            }
            target[parts[0]] = val;
          }
          writes.push(r.key);
        },
      }),
  };
  return { db, docs, writes };
}
const workspace = {
  ownerId: "owner",
  subscriptionPlan: "professional",
  subscriptionStatus: "active",
};
test("saved Owner and Manager Custom Items above 20 use canonical prices; staff and cross-store requests fail", async () => {
  const { db, docs } = database({
    "workspaces/s": workspace,
    "workspaceMembers/s_manager": { workspaceId: "s", userId: "manager", status: "Active", role: "Manager" },
    "workspaceMembers/s_chef": { workspaceId: "s", userId: "chef", status: "Active", role: "Chef" },
    "workspaceMembers/s_inactive": { workspaceId: "s", userId: "inactive", status: "Inactive", role: "Manager" },
  });
  const custom = { ...input(), lines: [{ ...line("prawn", "2026-10-19", 40), selection: undefined, custom: { name: "Custom Item", unitPrice: 4 } }] };
  const args = { db, input: custom, now, loadCheckout: async () => checkout };
  const saved = await saveManualPosOrder({ ...args, uid: "owner" });
  assert.equal(docs[`storeOrders/${saved.orderId}`].total, 160);
  const managerCustom = { ...custom, requestId: "manager-custom-12345678", lines: [{ ...custom.lines[0], custom: { name: "Custom Item", unitPrice: 20 } }] };
  const managerSaved = await saveManualPosOrder({ ...args, uid: "manager", input: managerCustom });
  assert.equal(docs[`storeOrders/${managerSaved.orderId}`].total, 800);
  await assert.rejects(saveManualPosOrder({ ...args, uid: "chef" }), /1–20/);
  await assert.rejects(saveManualPosOrder({ ...args, uid: "inactive", input: { ...custom, posFullAccess: true, owner: true } }), e => e.code === "permission-denied");
  await assert.rejects(saveManualPosOrder({ ...args, uid: "stranger" }), e => e.code === "permission-denied");
  await assert.rejects(saveManualPosOrder({ ...args, uid: "manager", input: { ...managerCustom, workspaceId: "other" } }), e => e.code === "permission-denied");
});
test("Owner and Manager manual orders load unpublished same-store products for quantities 21–200", async () => {
  const hidden = { ...products[0], id: "hidden", available: false, price: 9 };
  for (const uid of ["owner", "manager"]) {
    for (const quantity of [21, 40, 100, 200]) {
      const { db, docs } = database({
        "workspaces/s": workspace,
        "workspaceMembers/s_manager": { workspaceId: "s", userId: "manager", status: "Active", role: "Manager" },
      });
      const calls = [];
      const result = await saveManualPosOrder({
        db, uid, now,
        input: { ...input(), requestId: `${uid}-${quantity}-hidden-product`, lines: [line("hidden", "2026-10-19", quantity)] },
        loadCheckout: async (_db, _slug, options) => {
          calls.push(options?.includeUnavailable === true);
          return options?.includeUnavailable ? { ...checkout, products: [...products, hidden] } : checkout;
        },
      });
      assert.deepEqual(calls, [false, true]);
      assert.equal(docs[`storeOrders/${result.orderId}`].total, 9 * quantity);
    }
  }
});
test("Manager manual order accepts a hidden Weekly Menu with five fulfilments", async () => {
  const days = ["mon", "tue", "wed", "thu", "fri"];
  const meals = days.map(day => ({ ...products[0], id: day, available: false, availableDay: day }));
  const plan = { ...products[0], id: "hidden-week", available: false, price: 60, productType: "weekly_meal_plan", weeklyMeals: Object.fromEntries(days.map(day => [day, day])) };
  const { db, docs } = database({
    "workspaces/s": workspace,
    "workspaceMembers/s_manager": { workspaceId: "s", userId: "manager", status: "Active", role: "Manager" },
  });
  const saved = await saveManualPosOrder({
    db, uid: "manager", now,
    input: { ...input(), requestId: "manager-hidden-week-12345", lines: [line("hidden-week", "2026-10-19", 40)] },
    loadCheckout: async (_db, _slug, options) => options?.includeUnavailable ? { ...checkout, products: [...meals, plan] } : checkout,
  });
  const order = docs[`storeOrders/${saved.orderId}`];
  assert.equal(order.total, 2400);
  assert.equal(order.fulfilments.length, 5);
  assert.ok(order.fulfilments.every(day => day.allocations[0].quantity === 40));
});
test("save/edit manual order always pending, idempotent request, confirmation authorized and idempotent, no inventory writes", async () => {
  const { db, docs, writes } = database({ "workspaces/s": workspace });
  const args = {
    db,
    uid: "owner",
    input: input(),
    now,
    loadCheckout: async () => checkout,
  };
  const first = await saveManualPosOrder(args);
  const order = docs[`storeOrders/${first.orderId}`];
  assert.equal(order.payment.status, "pending");
  assert.equal((await saveManualPosOrder(args)).duplicate, true);
  const edited = {
    ...input(),
    orderId: first.orderId,
    expectedRevision: 1,
    requestId: "edit-request-12345678",
    customerName: "Py Edited",
  };
  await saveManualPosOrder({ ...args, input: edited });
  assert.equal(docs[`storeOrders/${first.orderId}`].manualOrder.revision, 2);
  const confirmation = {
    orderId: first.orderId,
    expectedRevision: 2,
    amountMinor: 5100,
    received: true,
    method: "cash",
    reference: "cash received",
  };
  await assert.rejects(
    confirmManualPosPayment({ db, uid: "foreign", input: confirmation }),
  );
  await assert.rejects(
    confirmManualPosPayment({
      db,
      uid: "owner",
      input: { ...confirmation, received: false },
    }),
  );
  await assert.rejects(
    confirmManualPosPayment({
      db,
      uid: "owner",
      input: { ...confirmation, amountMinor: 1 },
    }),
  );
  await confirmManualPosPayment({ db, uid: "owner", input: confirmation, now });
  const count = writes.length;
  assert.equal(
    (
      await confirmManualPosPayment({
        db,
        uid: "owner",
        input: confirmation,
        now,
      })
    ).duplicate,
    true,
  );
  assert.equal(writes.length, count);
  await assert.rejects(
    saveManualPosOrder({
      ...args,
      input: {
        ...edited,
        requestId: "another-request-12345",
        expectedRevision: 2,
      },
    }),
  );
  assert.equal(docs[`storeOrders/${first.orderId}`].payment.status, "paid");
  assert.ok(!writes.some((key) => /inventory|sales|publicProducts/.test(key)));
});
test("Chef may draft but only Owner/Manager confirms actual payment", async () => {
  const { db, docs } = database({
    "workspaces/s": workspace,
    "workspaceMembers/s_chef": {
      workspaceId: "s",
      userId: "chef",
      status: "Active",
      role: "Chef",
    },
  });
  const result = await saveManualPosOrder({
    db,
    uid: "chef",
    input: input(),
    now,
    loadCheckout: async () => checkout,
  });
  await assert.rejects(
    confirmManualPosPayment({
      db,
      uid: "chef",
      input: { orderId: result.orderId, received: true },
    }),
    (e) => e.code === "permission-denied",
  );
  assert.equal(docs[`storeOrders/${result.orderId}`].payment.status, "pending");
});

test('embedded order-by-day menu selections retain each meal and server-priced modifiers, with separate weekly snapshots',()=>{
 const option={id:'egg',name:'Egg',type:'choose',required:true,selection:'single',options:[{id:'omega',name:'Omega',priceAdjustmentMinor:120}]};
 const meals=Object.fromEntries(['mon','tue','wed','thu','fri'].map(day=>[day,{name:`${day} bowl`,photoUrl:`${day}.jpg`,price:12.9,...(day==='mon'?{optionGroups:[option]}:{})}]));
 const plan={id:'plan',storeId:'s',workspaceId:'s',name:'Weekly',productType:'weekly_meal_plan',weeklyMenuVersion:2,available:true,price:60,optionGroupIds:[],weeklyWeeks:{week1:{startMonday:'2026-10-19',meals}}};
 const monday={...line('plan','2026-10-19'),selection:{productId:'plan',healthyLunchPlanId:'plan',healthyLunchDate:'2026-10-19',selectedOptions:[],selectedMealOptions:[{optionGroupId:'egg',optionId:'omega',serviceDate:'2026-10-19'}]}};
 const tuesday={...line('plan','2026-10-20',2),selection:{productId:'plan',healthyLunchPlanId:'plan',healthyLunchDate:'2026-10-20',selectedOptions:[]}};
 const result=buildManualOrder({...input(),lines:[monday,tuesday]},{...checkout,products:[plan]},now);
 assert.equal(result.total,39.9);assert.equal(result.items[0].productName,'mon bowl');assert.equal(result.items[1].productName,'tue bowl');assert.equal(result.items[0].healthyLunchSnapshot.selectedMealOptions[0].optionName,'Omega');
 assert.throws(()=>buildManualOrder({...input(),lines:[{...monday,selection:{...monday.selection,selectedMealOptions:[]}}]},{...checkout,products:[plan]},now));
 const full={...line('plan','2026-10-19'),selection:{productId:'plan',selectedOptions:[],selectedMealOptions:monday.selection.selectedMealOptions}};
 const week=buildManualOrder({...input(),lines:[full,tuesday]},{...checkout,products:[plan]},now);
 assert.equal(week.total,87);assert.equal(week.items[0].weeklyPlanSnapshot.meals[0].selectedMealOptions[0].optionName,'Omega');
});

test('FPX receipt recording uses exact saved amount, revision, acknowledgment and one audit event', async () => {
  const { db, docs, writes } = database({ 'workspaces/s': workspace });
  const saved = await saveManualPosOrder({db,uid:'owner',input:input(),now,loadCheckout:async()=>checkout});
  const confirmation = {orderId:saved.orderId,expectedRevision:1,amountMinor:5100,received:true,method:'fpx',reference:'QA-FPX-received'};
  for (const change of [{expectedRevision:0},{amountMinor:5000},{received:false},{reference:''},{method:'card_capture'}]) {
    await assert.rejects(confirmManualPosPayment({db,uid:'owner',input:{...confirmation,...change},now}));
    assert.equal(docs[`storeOrders/${saved.orderId}`].payment.status,'pending');
  }
  await confirmManualPosPayment({db,uid:'owner',input:confirmation,now});
  const count=writes.length;
  assert.equal((await confirmManualPosPayment({db,uid:'owner',input:confirmation,now})).duplicate,true);
  assert.equal(writes.length,count);
  assert.equal(docs[`storeOrders/${saved.orderId}`].payment.providerPaymentMethod,'fpx');
});
