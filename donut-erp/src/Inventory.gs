// ============================================================
// Inventory.gs - 在庫管理
// ============================================================

function getInventory() {
  const ingredients = getIngredients();
  const invSheet    = getSheet_(SHEET_NAMES.INVENTORY);
  const invData     = sheetToObjects_(invSheet);

  const invMap = {};
  invData.forEach(row => {
    if (row.ingredient_name) invMap[row.ingredient_name] = row;
  });

  // 全原料を返す（在庫未登録は 0 扱い）
  return ingredients.map(ing => {
    const inv = invMap[ing.name] || {};
    return {
      ingredient_id:   ing.id,
      ingredient_name: ing.name,
      supplier:        ing.supplier,
      quantity:        Number(inv.quantity || 0),
      last_updated:    inv.last_updated || ''
    };
  });
}

function updateInventoryItem(ingredientId, quantity) {
  const sheet      = getSheet_(SHEET_NAMES.INVENTORY);
  const ingredients = getIngredients();
  const ing        = ingredients.find(i => i.id === ingredientId);
  const ingName    = ing?.name || ingredientId;
  const today      = formatDate_(new Date());

  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === ingName) {
      sheet.getRange(i + 1, 2, 1, 2).setValues([[Number(quantity), today]]);
      return { success: true };
    }
  }
  sheet.appendRow([ingName, Number(quantity), today]);
  return { success: true };
}

/**
 * 指定期間の在庫推移を計算して返す
 * 現在の在庫から作業日ベースで消費を引いていく
 */
function getInventoryProjection(startDate, endDate) {
  const inventory   = getInventory();
  const products    = getProducts();
  const recipes     = getRecipes();
  const plans       = getProductionPlan(startDate, endDate);

  const prodMap = {};
  products.forEach(p => { prodMap[p.id] = p; });

  const recipeMap = {};
  recipes.forEach(r => {
    if (!recipeMap[r.parent_id]) recipeMap[r.parent_id] = [];
    recipeMap[r.parent_id].push(r);
  });

  // 計画から作業日ごとの原料消費量を収集
  const consumptionMap = {}; // "work_date|||ing_id" -> grams
  const planTotals = {};
  plans.forEach(plan => {
    const qty = Number(plan.quantity || 0);
    if (qty <= 0) return;
    const key = plan.shipping_date + '|||' + plan.product_id;
    planTotals[key] = (planTotals[key] || 0) + qty;
  });

  Object.entries(planTotals).forEach(([key, totalQty]) => {
    const [shippingDate, productId] = key.split('|||');
    collectIngredientConsumption_(productId, true, totalQty, 0, shippingDate, recipeMap, consumptionMap);
  });

  // 作業日ごとに整理
  const byDate = {}; // work_date -> { ing_id -> grams }
  Object.entries(consumptionMap).forEach(([key, grams]) => {
    const [date, ingId] = key.split('|||');
    if (!byDate[date]) byDate[date] = {};
    byDate[date][ingId] = (byDate[date][ingId] || 0) + grams;
  });

  // 在庫の初期値
  const runningStock = {};
  const ingNameMap   = {};
  inventory.forEach(i => {
    runningStock[i.ingredient_id] = i.quantity;
    ingNameMap[i.ingredient_id]   = i.ingredient_name;
  });

  // 日付順で推移を計算
  const sortedDates = Object.keys(byDate).sort();
  const projection  = [];

  sortedDates.forEach(date => {
    const items = [];
    Object.entries(byDate[date]).forEach(([ingId, grams]) => {
      const before = runningStock[ingId] || 0;
      const after  = before - grams;
      runningStock[ingId] = after;
      items.push({
        ingredient_id:   ingId,
        ingredient_name: ingNameMap[ingId] || ingId,
        consumption:     Math.round(grams * 10) / 10,
        stock_before:    Math.round(before * 10) / 10,
        stock_after:     Math.round(after * 10) / 10,
        shortage:        after < 0
      });
    });
    projection.push({ date, items });
  });

  return projection;
}
