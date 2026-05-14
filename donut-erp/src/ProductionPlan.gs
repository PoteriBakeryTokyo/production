// ============================================================
// ProductionPlan.gs - 生産計画管理
// ============================================================

function getProductionPlan(startDate, endDate) {
  const all  = sheetToObjects_(getSheet_(SHEET_NAMES.PRODUCTION_PLAN));
  const maps = buildNameMaps_();
  return all.filter(p => {
    if (!p.shipping_date) return false;
    const d = String(p.shipping_date);
    return (!startDate || d >= startDate) && (!endDate || d <= endDate);
  }).map(p => ({
    id:           p.id,
    shipping_date: String(p.shipping_date),
    store_id:     maps.storeByName[p.store_name]?.id  || p.store_name,
    product_id:   maps.prodByName[p.product_name]?.id || p.product_name,
    quantity:     p.quantity
  }));
}

// items: [{id?, shipping_date, store_id, product_id, quantity}, ...]
// 既存IDがあれば上書き、なければ追加
function saveProductionPlanItems(items, password) {
  if (!verifyPassword(password)) throw new Error('パスワードが正しくありません');

  const sheet = getSheet_(SHEET_NAMES.PRODUCTION_PLAN);
  const maps  = buildNameMaps_();
  const all   = sheetToObjects_(sheet);

  items.forEach(item => {
    if (!item.id) item.id = generateId_();
    const toStore = {
      id:           item.id,
      shipping_date: item.shipping_date,
      store_name:   maps.storeById[item.store_id]?.name  || item.store_id,
      product_name: maps.prodById[item.product_id]?.name || item.product_id,
      quantity:     item.quantity
    };
    const idx = all.findIndex(p => p.id === item.id);
    if (idx >= 0) all[idx] = toStore; else all.push(toStore);
  });

  objectsToSheet_(sheet, all.filter(p => p.id));
  return { success: true };
}

// 指定した日付+店舗+商品の行を削除（quantity=0の行クリア用）
function deleteProductionPlanItems(ids, password) {
  if (!verifyPassword(password)) throw new Error('パスワードが正しくありません');

  const sheet = getSheet_(SHEET_NAMES.PRODUCTION_PLAN);
  const all   = sheetToObjects_(sheet).filter(p => !ids.includes(p.id));
  objectsToSheet_(sheet, all);
  return { success: true };
}

// ---- エクスポート ----
// 生産計画を エクスポートシートに書き出してスプレッドシートURLを返す

function exportProductionPlan() {
  const data = sheetToObjects_(getSheet_(SHEET_NAMES.PRODUCTION_PLAN));
  const exportSheet = getSheet_(SHEET_NAMES.EXPORT);
  const headers = SHEET_HEADERS[SHEET_NAMES.EXPORT];

  exportSheet.clearContents();
  exportSheet.appendRow(headers);
  exportSheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');

  if (data.length > 0) {
    exportSheet.getRange(2, 1, data.length, headers.length)
      .setValues(data.map(d => headers.map(h => d[h] !== undefined ? d[h] : '')));
  }

  return {
    success:   true,
    url:       getSpreadsheetUrl(),
    sheetName: SHEET_NAMES.EXPORT,
    count:     data.length
  };
}

// ---- インポート ----
// エクスポートシートの内容で生産計画を上書き

function importProductionPlan(password) {
  if (!verifyPassword(password)) throw new Error('パスワードが正しくありません');

  const exportSheet = getSheet_(SHEET_NAMES.EXPORT);
  const data = sheetToObjects_(exportSheet);
  const mainSheet = getSheet_(SHEET_NAMES.PRODUCTION_PLAN);
  objectsToSheet_(mainSheet, data);

  return { success: true, count: data.length };
}
