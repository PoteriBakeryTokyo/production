// ============================================================
// ドーナツ工場ERP - Code.gs（エントリポイント・共通ユーティリティ）
// ============================================================

const ADMIN_PASSWORD = 'Poteri1235';

const SHEET_NAMES = {
  INGREDIENTS:     '原料マスタ',
  STORES:          '店舗マスタ',
  PRODUCTS:        '商品マスタ',
  RECIPES:         'レシピマスタ',
  FIXED_RECIPES:   '固定レシピ',
  PRODUCTION_PLAN: '生産計画',
  INVENTORY:       '在庫',
  EXPORT:          '生産計画_エクスポート'
};

const SHEET_HEADERS = {
  '原料マスタ':          ['id','name','supplier','unit_cost','display_order'],
  '店舗マスタ':          ['id','name','display_order'],
  '商品マスタ':          ['id','name','type','fixed_display','display_order'],
  'レシピマスタ':        ['id','parent_id','child_id','child_type','weight','work_days_before','display_order'],
  '固定レシピ':          ['id','item_id','child_id','child_type','weight','display_order'],
  '生産計画':            ['id','shipping_date','store_id','product_id','quantity'],
  '在庫':                ['ingredient_id','quantity','last_updated'],
  '生産計画_エクスポート':['id','shipping_date','store_id','product_id','quantity']
};

// ---- エントリポイント（API） ----

function doGet(e) {
  const action = e && e.parameter && e.parameter.action;
  try {
    switch (action) {
      case 'getAllMasterData':
        return respond({ status: 'ok', result: getAllMasterData() });
      case 'getProductionPlan':
        return respond({ status: 'ok', result: getProductionPlan(e.parameter.start, e.parameter.end) });
      case 'getWorkSchedule':
        return respond({ status: 'ok', result: getWorkSchedule(e.parameter.workDate) });
      case 'getInventory':
        return respond({ status: 'ok', result: getInventory() });
      case 'getInventoryProjection':
        return respond({ status: 'ok', result: getInventoryProjection(e.parameter.start, e.parameter.end) });
      case 'getOrderSummary':
        return respond({ status: 'ok', result: getOrderSummary(e.parameter.start, e.parameter.end) });
      case 'getCostByProduct':
        return respond({ status: 'ok', result: getCostByProduct() });
      default:
        return respond({ status: 'ok', message: 'API稼働中' });
    }
  } catch (err) {
    return respond({ status: 'error', message: err.message });
  }
}

function doPost(e) {
  let raw = '';
  if (e.parameter && e.parameter.payload) {
    raw = e.parameter.payload;
  } else if (e.postData && e.postData.contents) {
    const match = e.postData.contents.match(/(?:^|&)payload=([^&]*)/);
    raw = match ? decodeURIComponent(match[1].replace(/\+/g, ' ')) : e.postData.contents;
  }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch (err) {
    return respond({ status: 'error', message: 'JSONパースエラー: ' + err.message });
  }

  const action = payload.action;
  try {
    switch (action) {
      case 'saveIngredient':            return respond({ status: 'ok', result: saveIngredient(payload.data) });
      case 'deleteIngredient':          return respond({ status: 'ok', result: deleteIngredient(payload.id) });
      case 'saveStore':                 return respond({ status: 'ok', result: saveStore(payload.data) });
      case 'deleteStore':               return respond({ status: 'ok', result: deleteStore(payload.id) });
      case 'saveProduct':               return respond({ status: 'ok', result: saveProduct(payload.data) });
      case 'deleteProduct':             return respond({ status: 'ok', result: deleteProduct(payload.id) });
      case 'saveRecipe':                return respond({ status: 'ok', result: saveRecipe(payload.data) });
      case 'deleteRecipe':              return respond({ status: 'ok', result: deleteRecipe(payload.id) });
      case 'saveFixedRecipe':           return respond({ status: 'ok', result: saveFixedRecipe(payload.data) });
      case 'deleteFixedRecipe':         return respond({ status: 'ok', result: deleteFixedRecipe(payload.id) });
      case 'saveProductionPlanItems':   return respond({ status: 'ok', result: saveProductionPlanItems(payload.items, payload.password) });
      case 'deleteProductionPlanItems': return respond({ status: 'ok', result: deleteProductionPlanItems(payload.ids, payload.password) });
      case 'exportProductionPlan':      return respond({ status: 'ok', result: exportProductionPlan() });
      case 'importProductionPlan':      return respond({ status: 'ok', result: importProductionPlan(payload.password) });
      case 'updateInventoryItem':       return respond({ status: 'ok', result: updateInventoryItem(payload.ingredientId, payload.quantity) });
      case 'verifyPassword':            return respond({ status: 'ok', result: verifyPassword(payload.password) });
      default:
        return respond({ status: 'error', message: '不明なaction: ' + action });
    }
  } catch (err) {
    return respond({ status: 'error', message: err.message });
  }
}

function respond(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ---- スプレッドシート管理 ----

let _cachedSs_ = null;

function getSpreadsheet_() {
  if (_cachedSs_) return _cachedSs_;
  const props = PropertiesService.getScriptProperties();
  let ssId = props.getProperty('SPREADSHEET_ID');
  if (!ssId) {
    _cachedSs_ = SpreadsheetApp.create('ドーナツ工場ERP データ');
    ssId = _cachedSs_.getId();
    props.setProperty('SPREADSHEET_ID', ssId);
    initAllSheets_(_cachedSs_);
    return _cachedSs_;
  }
  _cachedSs_ = SpreadsheetApp.openById(ssId);
  return _cachedSs_;
}

function getSheet_(name) {
  const ss = getSpreadsheet_();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    const headers = SHEET_HEADERS[name];
    if (headers) {
      sheet.appendRow(headers);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
      sheet.setFrozenRows(1);
    }
  }
  return sheet;
}

function initAllSheets_(ss) {
  Object.values(SHEET_NAMES).forEach(name => {
    let sheet = ss.getSheetByName(name);
    if (!sheet) sheet = ss.insertSheet(name);
    const headers = SHEET_HEADERS[name];
    if (headers && sheet.getLastRow() === 0) {
      sheet.appendRow(headers);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
      sheet.setFrozenRows(1);
    }
  });
  ['Sheet1', 'シート1'].forEach(n => {
    const s = ss.getSheetByName(n);
    if (s && ss.getSheets().length > 1) ss.deleteSheet(s);
  });
}

// ---- データ変換ユーティリティ ----

function sheetToObjects_(sheet) {
  const lr = sheet.getLastRow();
  const lc = sheet.getLastColumn();
  if (lr <= 1 || lc === 0) return [];
  const data = sheet.getRange(1, 1, lr, lc).getValues();
  const headers = data[0];
  return data.slice(1)
    .filter(row => row.some(cell => cell !== ''))
    .map(row => {
      const obj = {};
      headers.forEach((h, i) => {
        const v = row[i];
        obj[h] = v instanceof Date ? Utilities.formatDate(v, 'Asia/Tokyo', 'yyyy-MM-dd') : (v === null ? '' : v);
      });
      return obj;
    });
}

function objectsToSheet_(sheet, objects) {
  const headers = SHEET_HEADERS[sheet.getName()];
  if (!headers) return;
  const lr = sheet.getLastRow();
  if (lr > 1) sheet.deleteRows(2, lr - 1);
  if (objects.length > 0) {
    const rows = objects.map(obj => headers.map(h => (obj[h] !== undefined && obj[h] !== null) ? obj[h] : ''));
    sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  }
}

function generateId_() {
  return Utilities.getUuid();
}

function formatDate_(date) {
  return Utilities.formatDate(date, 'Asia/Tokyo', 'yyyy-MM-dd');
}

function subtractDays_(dateStr, days) {
  const d = new Date(dateStr + 'T12:00:00+09:00');
  d.setDate(d.getDate() - Number(days || 0));
  return formatDate_(d);
}

function verifyPassword(password) {
  return password === ADMIN_PASSWORD;
}

// ---- BOM再帰展開（在庫・発注共用） ----
// result: { "YYYY-MM-DD|||ingredient_id" -> grams }

function collectIngredientConsumption_(itemId, isProduct, productQty, neededGrams, shippingDate, recipeMap, result) {
  const itemRecipes = recipeMap[itemId] || [];
  if (itemRecipes.length === 0) return;

  const batchYield = isProduct
    ? null
    : itemRecipes.reduce((s, r) => s + Number(r.weight || 0), 0);

  itemRecipes.forEach(recipe => {
    let childNeeded;
    if (isProduct) {
      childNeeded = Number(recipe.weight || 0) * productQty;
    } else {
      const sf = batchYield > 0 ? neededGrams / batchYield : 0;
      childNeeded = Number(recipe.weight || 0) * sf;
    }
    if (childNeeded <= 0) return;

    const workDate = subtractDays_(shippingDate, recipe.work_days_before);

    if (recipe.child_type === '原料') {
      const key = workDate + '|||' + recipe.child_id;
      result[key] = (result[key] || 0) + childNeeded;
    } else if (recipe.child_type === '半製品') {
      collectIngredientConsumption_(
        recipe.child_id, false, productQty, childNeeded,
        shippingDate, recipeMap, result
      );
    }
  });
}

// ---- スプレッドシートURL取得 ----

function getSpreadsheetUrl() {
  const ssId = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  return ssId ? 'https://docs.google.com/spreadsheets/d/' + ssId : null;
}

// ---- スプレッドシートID設定（初回1回だけ実行） ----

function setupSpreadsheetId() {
  PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', '1n8DTO3G4OL3jkMGV85_PGB2E0UcRXQTrvdYryU5-r7c');
  Logger.log('SPREADSHEET_ID を設定しました: 1n8DTO3G4OL3jkMGV85_PGB2E0UcRXQTrvdYryU5-r7c');
}

// ---- ID欠損修正（手動入力データのid列が空の場合に1回実行） ----

function fixMissingIds() {
  const targets = [
    SHEET_NAMES.INGREDIENTS,
    SHEET_NAMES.STORES,
    SHEET_NAMES.PRODUCTS,
    SHEET_NAMES.RECIPES,
    SHEET_NAMES.FIXED_RECIPES,
    SHEET_NAMES.PRODUCTION_PLAN
  ];
  targets.forEach(name => {
    const sheet = getSheet_(name);
    const lr = sheet.getLastRow();
    if (lr <= 1) return;
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const idCol = headers.indexOf('id') + 1;
    if (idCol === 0) return;
    let fixed = 0;
    for (let r = 2; r <= lr; r++) {
      const cell = sheet.getRange(r, idCol);
      if (!cell.getValue()) {
        cell.setValue(Utilities.getUuid());
        fixed++;
      }
    }
    Logger.log(name + ': ' + fixed + '件のIDを補完しました');
  });
}
