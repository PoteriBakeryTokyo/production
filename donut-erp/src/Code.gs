// ============================================================
// ドーナツ工場ERP - Code.gs（エントリポイント・共通ユーティリティ）
// ============================================================

const ADMIN_PASSWORD = 'donut2024';

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

// ---- エントリポイント ----

function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('ドーナツ工場ERP')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ---- スプレッドシート管理 ----

function getSpreadsheet_() {
  const props = PropertiesService.getScriptProperties();
  let ssId = props.getProperty('SPREADSHEET_ID');
  if (!ssId) {
    const ss = SpreadsheetApp.create('ドーナツ工場ERP データ');
    ssId = ss.getId();
    props.setProperty('SPREADSHEET_ID', ssId);
    initAllSheets_(ss);
    return ss;
  }
  return SpreadsheetApp.openById(ssId);
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
