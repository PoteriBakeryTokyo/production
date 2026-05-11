// ============================================================
// WorkSchedule.gs - 作業管理（BOM展開）
// ============================================================

/**
 * 指定作業日の作業内容を返す
 *
 * 戻り値:
 *   dailyItems  : 作業日ベースで実施する工程（半製品・直接原料）
 *   fixedItems  : 固定表示の半製品（fixed_display=TRUE）
 */
function getWorkSchedule(workDateStr) {
  const { ingredients, products, recipes, fixedRecipes } = getAllMasterData();

  const ingMap = {};
  ingredients.forEach(i => { ingMap[i.id] = i; });

  const prodMap = {};
  products.forEach(p => { prodMap[p.id] = p; });

  const recipeMap = {};
  recipes.forEach(r => {
    if (!recipeMap[r.parent_id]) recipeMap[r.parent_id] = [];
    recipeMap[r.parent_id].push(r);
  });

  const fixedRecipeMap = {};
  fixedRecipes.forEach(r => {
    if (!fixedRecipeMap[r.item_id]) fixedRecipeMap[r.item_id] = [];
    fixedRecipeMap[r.item_id].push(r);
  });

  // 出荷日 = 作業日 + 最大60日先まで見る（レシピの最大オフセット分）
  const workDate = new Date(workDateStr + 'T12:00:00+09:00');
  const endDate  = new Date(workDate);
  endDate.setDate(endDate.getDate() + 60);

  const plans = getProductionPlan(workDateStr, formatDate_(endDate));

  // 出荷日+商品ごとに数量を集計
  const planTotals = {};
  plans.forEach(plan => {
    const qty = Number(plan.quantity || 0);
    if (qty <= 0) return;
    const key = plan.shipping_date + '|||' + plan.product_id;
    planTotals[key] = (planTotals[key] || 0) + qty;
  });

  // 作業アイテムを収集（キー = タイプ_itemId_workDate で重複集約）
  const workItemsMap  = {};
  const fixedItemIds  = new Set();

  Object.entries(planTotals).forEach(([key, totalQty]) => {
    const [shippingDate, productId] = key.split('|||');
    collectWorkItems_(
      productId, true, totalQty, 0,
      shippingDate, workDateStr,
      prodMap, ingMap, recipeMap,
      workItemsMap, fixedItemIds
    );
  });

  // dailyItems の recipe 組み立て
  const dailyItems = Object.values(workItemsMap).map(item => {
    if (item.type === 'semi_product') {
      const childRecipes = (recipeMap[item.itemId] || [])
        .sort((a, b) => Number(a.display_order || 0) - Number(b.display_order || 0));
      const batchYield   = childRecipes.reduce((s, r) => s + Number(r.weight || 0), 0);
      const scaleFactor  = batchYield > 0 ? item.totalNeededGrams / batchYield : 1;

      item.batchYield  = batchYield;
      item.scaleFactor = scaleFactor;
      item.recipe      = childRecipes.map(r => ({
        childId:      r.child_id,
        childName:    r.child_type === '原料' ? (ingMap[r.child_id]?.name || r.child_id) : (prodMap[r.child_id]?.name || r.child_id),
        childType:    r.child_type,
        baseWeight:   Number(r.weight || 0),
        scaledWeight: Math.round(Number(r.weight || 0) * scaleFactor * 10) / 10
      }));
    }
    return item;
  }).sort((a, b) => {
    // 出荷日昇順 → 表示順
    if (a.shippingDate !== b.shippingDate) return a.shippingDate < b.shippingDate ? -1 : 1;
    return Number(a.displayOrder || 0) - Number(b.displayOrder || 0);
  });

  // fixedItems 組み立て
  const fixedItems = [];
  fixedItemIds.forEach(itemId => {
    const item   = prodMap[itemId];
    const recipe = (fixedRecipeMap[itemId] || [])
      .sort((a, b) => Number(a.display_order || 0) - Number(b.display_order || 0))
      .map(r => ({
        childId:   r.child_id,
        childName: r.child_type === '原料' ? (ingMap[r.child_id]?.name || r.child_id) : (prodMap[r.child_id]?.name || r.child_id),
        childType: r.child_type,
        weight:    Number(r.weight || 0)
      }));

    fixedItems.push({ itemId, itemName: item?.name || itemId, recipe });
  });

  return { workDate: workDateStr, dailyItems, fixedItems };
}

/**
 * BOM を再帰展開して、targetWorkDate に行う作業を workItemsMap へ収集する
 *
 * isProduct=true のとき productQty は生産数（個）、neededGrams は無視
 * isProduct=false のとき neededGrams が必要量(g)、productQty は無視
 */
function collectWorkItems_(itemId, isProduct, productQty, neededGrams,
                           shippingDate, targetWorkDate,
                           prodMap, ingMap, recipeMap,
                           workItemsMap, fixedItemIds) {

  const itemRecipes = (recipeMap[itemId] || [])
    .sort((a, b) => Number(a.display_order || 0) - Number(b.display_order || 0));

  const batchYield = isProduct
    ? null
    : itemRecipes.reduce((s, r) => s + Number(r.weight || 0), 0);

  itemRecipes.forEach(recipe => {
    let childNeeded;
    if (isProduct) {
      childNeeded = Number(recipe.weight || 0) * productQty;
    } else {
      const sf    = batchYield > 0 ? neededGrams / batchYield : 0;
      childNeeded = Number(recipe.weight || 0) * sf;
    }
    if (childNeeded <= 0) return;

    const workDate = subtractDays_(shippingDate, recipe.work_days_before);

    if (recipe.child_type === '原料') {
      if (workDate === targetWorkDate) {
        const key = 'ing_' + recipe.child_id;
        if (!workItemsMap[key]) {
          workItemsMap[key] = {
            type:             'ingredient',
            itemId:           recipe.child_id,
            itemName:         ingMap[recipe.child_id]?.name || recipe.child_id,
            totalNeededGrams: 0,
            shippingDate,
            displayOrder:     recipe.display_order
          };
        }
        workItemsMap[key].totalNeededGrams += childNeeded;
        // 複数出荷日からの合算でも shippingDate を上書きしない（最初のもの）
      }

    } else if (recipe.child_type === '半製品') {
      const childProd   = prodMap[recipe.child_id];
      const isFixed     = String(childProd?.fixed_display).toUpperCase() === 'TRUE';

      if (isFixed) {
        fixedItemIds.add(recipe.child_id);
        return; // 固定アイテムは再帰しない
      }

      if (workDate === targetWorkDate) {
        const key = 'semi_' + recipe.child_id + '_' + shippingDate;
        if (!workItemsMap[key]) {
          workItemsMap[key] = {
            type:             'semi_product',
            itemId:           recipe.child_id,
            itemName:         childProd?.name || recipe.child_id,
            totalNeededGrams: 0,
            shippingDate,
            displayOrder:     Number(childProd?.display_order || recipe.display_order || 0),
            recipe:           []
          };
        }
        workItemsMap[key].totalNeededGrams += childNeeded;
      }

      // 常に再帰（子の工程が別の作業日にある可能性）
      collectWorkItems_(
        recipe.child_id, false, productQty, childNeeded,
        shippingDate, targetWorkDate,
        prodMap, ingMap, recipeMap,
        workItemsMap, fixedItemIds
      );
    }
  });
}
