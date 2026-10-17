/**
 * จำรหัสโต๊ะ 4 หลักไว้ในเครื่องลูกค้า เพื่อไม่ต้องกรอกใหม่ทุกหน้า
 * ถ้าอ่าน/เขียนที่เก็บไม่ได้ (โหมดส่วนตัว) ลูกค้าแค่ต้องกรอกรหัสใหม่ ไม่ทำให้หน้าพัง
 */
const key = (tableNo) => `table_code:${tableNo}`;

export function getCode(tableNo) {
  try { return localStorage.getItem(key(tableNo)) || ''; } catch { return ''; }
}

export function setCode(tableNo, code) {
  try { localStorage.setItem(key(tableNo), code); } catch { /* ไม่เป็นไร */ }
}

export function clearCode(tableNo) {
  try { localStorage.removeItem(key(tableNo)); } catch { /* ไม่เป็นไร */ }
}

/** ตัวเลือกสำหรับเรียก API ฝั่งลูกค้า: ไม่ใช้ token พนักงาน แต่แนบรหัสโต๊ะไปแทน */
export const publicOpts = (tableNo) => ({ noAuth: true, headers: { 'X-Table-Code': getCode(tableNo) } });

/** error ที่เกี่ยวกับรหัสโต๊ะ / โต๊ะยังไม่เปิด -> คืน { reason, message } ให้หน้าเว็บแสดงหน้ากรอกรหัส */
export function sessionProblem(err) {
  const reason = err?.details?.reason;
  return reason ? { reason, message: err.message } : null;
}

// ------------------------------------------------ ตะกร้าที่ยังไม่ได้กดสั่ง
// เก็บไว้ในเครื่อง เผลอรีเฟรชหรือปิดแท็บแล้วเปิดใหม่ ของที่เลือกไว้ยังอยู่
const cartKey = (tableNo) => `table_cart:${tableNo}`;
const CART_TTL_MS = 6 * 60 * 60 * 1000;   // เกิน 6 ชั่วโมงถือว่าเป็นตะกร้าของมื้อก่อน ทิ้งไป

function readCart(tableNo) {
  try {
    const saved = JSON.parse(localStorage.getItem(cartKey(tableNo)) || 'null');
    return saved && Date.now() - saved.at <= CART_TTL_MS ? saved : null;
  } catch {
    return null;
  }
}

/** { menu_item_id: qty } */
export function loadCart(tableNo) {
  return readCart(tableNo)?.items || {};
}

/** { menu_item_id: "ไม่ใส่พริก" } หมายเหตุที่พิมพ์ไว้ในตะกร้า */
export function loadCartNotes(tableNo) {
  return readCart(tableNo)?.notes || {};
}

export function saveCart(tableNo, items, notes = {}) {
  try {
    if (Object.keys(items).length) localStorage.setItem(cartKey(tableNo), JSON.stringify({ items, notes, at: Date.now() }));
    else localStorage.removeItem(cartKey(tableNo));
  } catch { /* ไม่เป็นไร */ }
}

export function clearCart(tableNo) {
  try { localStorage.removeItem(cartKey(tableNo)); } catch { /* ไม่เป็นไร */ }
}
