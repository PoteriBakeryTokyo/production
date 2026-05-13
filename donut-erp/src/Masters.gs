// ============================================================
// Masters.gs - マスタデータ CRUD
// ============================================================

const MASTER_CACHE_KEY = 'allMasterData';
const MASTER_CACHE_TTL = 300; // 5分

function invalidateMasterCache_() {
  CacheService.getScriptCache().remove(MASTER_CACHE_KEY);
}

// ---- 原料マスタ ----

function getIngredients() {
  return sheetToObjects_(getSheet_(SHEET_NAMES.INGREDIENTS))
    .sort((a, b) => Number(a.display_order || 0) - Number(b.display_order || 0));
}

function saveIngredient(data) {
  invalidateMasterCache_();
  const sheet = getSheet_(SHEET_NAMES.INGREDIENTS);
  const all = sheetToObjects_(sheet);
  if (data.id) {
    const idx = all.findIndex(r => r.id === data.id);
    if (idx >= 0) all[idx] = data; else all.push(data);
  } else {
    data.id = generateId_();
    all.push(data);
  }
  objectsToSheet_(sheet, all);
  return data;
}

function deleteIngredient(id) {
  invalidateMasterCache_();
  const sheet = getSheet_(SHEET_NAMES.INGREDIENTS);
  objectsToSheet_(sheet, sheetToObjects_(sheet).filter(r => r.id !== id));
}

// ---- 店舗マスタ ----

function getStores() {
  return sheetToObjects_(getSheet_(SHEET_NAMES.STORES))
    .sort((a, b) => Number(a.display_order || 0) - Number(b.display_order || 0));
}

function saveStore(data) {
  invalidateMasterCache_();
  const sheet = getSheet_(SHEET_NAMES.STORES);
  const all = sheetToObjects_(sheet);
  if (data.id) {
    const idx = all.findIndex(r => r.id === data.id);
    if (idx >= 0) all[idx] = data; else all.push(data);
  } else {
    data.id = generateId_();
    all.push(data);
  }
  objectsToSheet_(sheet, all);
  return data;
}

function deleteStore(id) {
  invalidateMasterCache_();
  const sheet = getSheet_(SHEET_NAMES.STORES);
  objectsToSheet_(sheet, sheetToObjects_(sheet).filter(r => r.id !== id));
}

// ---- 商品マスタ（商品・半製品共用） ----

function getProducts() {
  return sheetToObjects_(getSheet_(SHEET_NAMES.PRODUCTS))
    .sort((a, b) => Number(a.display_order || 0) - Number(b.display_order || 0));
}

function saveProduct(data) {
  invalidateMasterCache_();
  const sheet = getSheet_(SHEET_NAMES.PRODUCTS);
  const all = sheetToObjects_(sheet);
  if (data.id) {
    const idx = all.findIndex(r => r.id === data.id);
    if (idx >= 0) all[idx] = data; else all.push(data);
  } else {
    data.id = generateId_();
    all.push(data);
  }
  objectsToSheet_(sheet, all);
  return data;
}

function deleteProduct(id) {
  invalidateMasterCache_();
  const sheet = getSheet_(SHEET_NAMES.PRODUCTS);
  objectsToSheet_(sheet, sheetToObjects_(sheet).filter(r => r.id !== id));
}

// ---- レシピマスタ ----

function getRecipes() {
  return sheetToObjects_(getSheet_(SHEET_NAMES.RECIPES));
}

function saveRecipe(data) {
  invalidateMasterCache_();
  const sheet = getSheet_(SHEET_NAMES.RECIPES);
  const all = sheetToObjects_(sheet);
  if (data.id) {
    const idx = all.findIndex(r => r.id === data.id);
    if (idx >= 0) all[idx] = data; else all.push(data);
  } else {
    data.id = generateId_();
    all.push(data);
  }
  objectsToSheet_(sheet, all);
  return data;
}

function deleteRecipe(id) {
  invalidateMasterCache_();
  const sheet = getSheet_(SHEET_NAMES.RECIPES);
  objectsToSheet_(sheet, sheetToObjects_(sheet).filter(r => r.id !== id));
}

// ---- 固定レシピ ----

function getFixedRecipes() {
  return sheetToObjects_(getSheet_(SHEET_NAMES.FIXED_RECIPES));
}

function saveFixedRecipe(data) {
  invalidateMasterCache_();
  const sheet = getSheet_(SHEET_NAMES.FIXED_RECIPES);
  const all = sheetToObjects_(sheet);
  if (data.id) {
    const idx = all.findIndex(r => r.id === data.id);
    if (idx >= 0) all[idx] = data; else all.push(data);
  } else {
    data.id = generateId_();
    all.push(data);
  }
  objectsToSheet_(sheet, all);
  return data;
}

function deleteFixedRecipe(id) {
  invalidateMasterCache_();
  const sheet = getSheet_(SHEET_NAMES.FIXED_RECIPES);
  objectsToSheet_(sheet, sheetToObjects_(sheet).filter(r => r.id !== id));
}

// ---- 一括取得（画面初期ロード用） ----

function getAllMasterData() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get(MASTER_CACHE_KEY);
  if (cached) return JSON.parse(cached);
  const data = {
    ingredients: getIngredients(),
    stores:       getStores(),
    products:     getProducts(),
    recipes:      getRecipes(),
    fixedRecipes: getFixedRecipes()
  };
  try { cache.put(MASTER_CACHE_KEY, JSON.stringify(data), MASTER_CACHE_TTL); } catch(e) {}
  return data;
}

// ---- 原価計算 ----
// 商品ごとに BOM を展開して原価を算出

function getCostByProduct() {
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

  // 商品（type=商品）のみ計算
  const topProducts = products.filter(p => p.type === '商品');

  return topProducts.map(product => {
    const ingTotals = {}; // ingredient_id -> grams
    collectCostIngredients_(product.id, true, 1, 0, recipeMap, ingTotals);

    let totalCost = 0;
    const breakdown = Object.entries(ingTotals).map(([ingId, grams]) => {
      const ing = ingMap[ingId];
      const unitCost = Number(ing?.unit_cost || 0); // 円/g
      const cost = unitCost * grams;
      totalCost += cost;
      return {
        ingredient_id:   ingId,
        ingredient_name: ing?.name || ingId,
        grams:           Math.round(grams * 10) / 10,
        unit_cost:       unitCost,
        cost:            Math.round(cost * 100) / 100
      };
    });

    return {
      product_id:   product.id,
      product_name: product.name,
      total_cost:   Math.round(totalCost * 100) / 100,
      breakdown
    };
  });
}

function collectCostIngredients_(itemId, isProduct, productQty, neededGrams, recipeMap, result) {
  const itemRecipes = recipeMap[itemId] || [];
  const batchYield  = isProduct ? null : itemRecipes.reduce((s, r) => s + Number(r.weight || 0), 0);

  itemRecipes.forEach(recipe => {
    let childNeeded;
    if (isProduct) {
      childNeeded = Number(recipe.weight || 0) * productQty;
    } else {
      const sf = batchYield > 0 ? neededGrams / batchYield : 0;
      childNeeded = Number(recipe.weight || 0) * sf;
    }
    if (childNeeded <= 0) return;

    if (recipe.child_type === '原料') {
      result[recipe.child_id] = (result[recipe.child_id] || 0) + childNeeded;
    } else if (recipe.child_type === '半製品') {
      collectCostIngredients_(recipe.child_id, false, productQty, childNeeded, recipeMap, result);
    }
  });
}
