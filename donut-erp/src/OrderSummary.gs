// ============================================================
// OrderSummary.gs - 発注管理（期間別原料集計）
// ============================================================

/**
 * 指定期間の作業日に消費される原料の総量を原料ごとに集計して返す
 * （生産計画の出荷日を起点に BOM 展開し、期間内の作業日のものを合算）
 */
function getOrderSummary(startDate, endDate) {
  const ingredients = getIngredients();
  const products    = getProducts();
  const recipes     = getRecipes();

  const ingMap = {};
  ingredients.forEach(i => { ingMap[i.id] = i; });

  const prodMap = {};
  products.forEach(p => { prodMap[p.id] = p; });

  const recipeMap = {};
  recipes.forEach(r => {
    if (!recipeMap[r.parent_id]) recipeMap[r.parent_id] = [];
    recipeMap[r.parent_id].push(r);
  });

  // 期間に関連する出荷日を含む計画を取得
  // 作業日 = 出荷日 - N日 なので、出荷日は startDate より後かつ作業日が endDate 以前
  // 最大60日先の出荷日まで考慮
  const extendedEnd = new Date(endDate + 'T12:00:00+09:00');
  extendedEnd.setDate(extendedEnd.getDate() + 60);
  const plans = getProductionPlan(startDate, formatDate_(extendedEnd));

  // 出荷日+商品ごとに集計
  const planTotals = {};
  plans.forEach(plan => {
    const qty = Number(plan.quantity || 0);
    if (qty <= 0) return;
    const key = plan.shipping_date + '|||' + plan.product_id;
    planTotals[key] = (planTotals[key] || 0) + qty;
  });

  // BOM 展開して作業日ベースの消費を収集
  const consumptionMap = {}; // "work_date|||ing_id" -> grams
  Object.entries(planTotals).forEach(([key, totalQty]) => {
    const [shippingDate, productId] = key.split('|||');
    collectIngredientConsumption_(productId, true, totalQty, 0, shippingDate, recipeMap, consumptionMap);
  });

  // 期間内の作業日のみ抽出して原料ごとに合算
  const ingTotals = {}; // ing_id -> grams
  Object.entries(consumptionMap).forEach(([key, grams]) => {
    const [workDate, ingId] = key.split('|||');
    if (workDate >= startDate && workDate <= endDate) {
      ingTotals[ingId] = (ingTotals[ingId] || 0) + grams;
    }
  });

  return Object.entries(ingTotals)
    .map(([ingId, total]) => ({
      ingredient_id:   ingId,
      ingredient_name: ingMap[ingId]?.name || ingId,
      supplier:        ingMap[ingId]?.supplier || '',
      unit_cost:       Number(ingMap[ingId]?.unit_cost || 0),
      total_grams:     Math.round(total * 10) / 10,
      total_cost:      Math.round(total * Number(ingMap[ingId]?.unit_cost || 0) * 100) / 100,
      display_order:   Number(ingMap[ingId]?.display_order || 999)
    }))
    .sort((a, b) => a.display_order - b.display_order);
}
