const BASE = process.env.API_BASE || 'http://localhost:4000/api';
let token = '';
let pass = 0, fail = 0;

async function call(method, path, body, opts = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(opts.noAuth ? {} : token ? { Authorization: `Bearer ${token}` } : {}),
      ...opts.headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 200) }; }
  return { status: res.status, json };
}

function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}`, JSON.stringify(extra)?.slice(0, 400)); }
}

const r = (n) => Math.round(n * 100) / 100;

console.log('\n=== 1. Health & Auth ===');
let x = await call('GET', '/health', null, { noAuth: true });
check('GET /health', x.status === 200 && x.json.ok, x.json);

x = await call('POST', '/auth/login', { username: 'owner', password: 'wrong' }, { noAuth: true });
check('login รหัสผิด -> 401', x.status === 401, x.json);

x = await call('POST', '/auth/login', { username: 'owner', password: 'owner123' }, { noAuth: true });
check('login สำเร็จ -> token', x.status === 200 && !!x.json.token, x.json);
token = x.json.token;

x = await call('GET', '/tables', null, { noAuth: true });
check('เรียก /tables โดยไม่มี token -> 401', x.status === 401, x.json);

x = await call('GET', '/auth/me');
check('GET /auth/me', x.status === 200 && x.json.data.username === 'owner', x.json);

console.log('\n=== 2. ผังโต๊ะ / เมนู / วัตถุดิบ ===');
x = await call('GET', '/tables');
check('มีโต๊ะครบ 20 โต๊ะ', x.json.data.length === 20, { n: x.json.data?.length });
check('โต๊ะว่างทั้งหมดตอนเริ่ม', x.json.summary.FREE === 20, x.json.summary);

x = await call('GET', '/menu?with_stock=true');
check('GET /menu = 31 เมนู', x.json.count === 31, { n: x.json.count });
const bbqSet = x.json.data.find((m) => m.sku === 'MN-B01');
check('เมนู MN-B01 มี max_servable', typeof bbqSet.max_servable === 'number', bbqSet);

x = await call('GET', '/menu/' + bbqSet.id);
check('GET /menu/:id มีสูตร BOM 12 รายการ', x.json.data.recipe.length === 12, { n: x.json.data.recipe?.length });
check('คำนวณ food_cost ได้', x.json.data.food_cost > 0, x.json.data.food_cost);

x = await call('GET', '/ingredients');
check('GET /ingredients = 34 รายการ', x.json.data.length === 34, { n: x.json.data?.length });
const porkBefore = x.json.data.find((i) => i.sku === 'ING-M01').qty_on_hand;
check('หมูสไลซ์ตั้งต้น 45 กก.', porkBefore === 45, porkBefore);

console.log('\n=== 3. เปิดบิล + ตัดสต็อกตาม BOM ===');
x = await call('POST', '/orders', {
  table_no: 'T05', guest_count: 4,
  items: [{ menu_sku: 'MN-B02', qty: 1 }, { menu_sku: 'MN-D02', qty: 4 }],
});
check('เปิดบิลโต๊ะ T05 -> 201', x.status === 201, x.json);
const order = x.json.order;
check('บิลมีเลขที่ OD...', /^OD\d{8}-\d{4}$/.test(order.order_no), order.order_no);
check('ยอดบิล = 549 + 4x25 = 649', r(order.grand_total) === 649, order.grand_total);
const orderId = order.id;

x = await call('GET', '/ingredients');
const porkAfter = x.json.data.find((i) => i.sku === 'ING-M01').qty_on_hand;
check('ตัดหมูสไลซ์ 0.8 กก. (45 -> 44.2)', r(porkAfter) === 44.2, { porkBefore, porkAfter });
const cokeAfter = x.json.data.find((i) => i.sku === 'ING-D02').qty_on_hand;
check('ตัดโค้ก 4 กระป๋อง (96 -> 92)', cokeAfter === 92, cokeAfter);

x = await call('GET', '/tables');
check('โต๊ะ T05 เปลี่ยนเป็น OCCUPIED', x.json.data.find((t) => t.table_no === 'T05').status === 'OCCUPIED');
check('สรุปผัง: ว่าง 19 / ใช้งาน 1', x.json.summary.FREE === 19 && x.json.summary.OCCUPIED === 1, x.json.summary);

console.log('\n=== 4. สั่งเพิ่มระหว่างทาน ===');
x = await call('POST', `/orders/${orderId}/items`, {
  items: [{ menu_sku: 'MN-B04', qty: 2, note: 'ไม่ใส่พริก' }, { menu_sku: 'MN-S01', qty: 1 }],
});
check('สั่งเพิ่ม -> 201', x.status === 201, x.json);
check('ยอดใหม่ = 649 + 158 + 69 = 876', r(x.json.order.grand_total) === 876, x.json.order.grand_total);
check('รายการรอบที่ 2 ถูกบันทึก', x.json.order.items.some((i) => i.round_no === 2), x.json.order.items.map((i) => i.round_no));

x = await call('GET', '/ingredients');
const porkAfter2 = x.json.data.find((i) => i.sku === 'ING-M01').qty_on_hand;
check('ตัดหมูเพิ่ม 0.4 กก. (44.2 -> 43.8)', r(porkAfter2) === 43.8, porkAfter2);

console.log('\n=== 5. ยกเลิกรายการ -> คืนสต็อก ===');
const cancelTarget = x.json.data && null;
let full = (await call('GET', `/orders/${orderId}`)).json.data;
const friesItem = full.items.find((i) => i.sku === 'MN-S01');
x = await call('DELETE', `/orders/${orderId}/items/${friesItem.id}`);
check('ยกเลิกเฟรนช์ฟรายส์ -> 200', x.status === 200, x.json);
check('ยอดลดเหลือ 807', r(x.json.data.grand_total) === 807, x.json.data.grand_total);

console.log('\n=== 6. แก้จำนวน ===');
full = (await call('GET', `/orders/${orderId}`)).json.data;
const porkItem = full.items.find((i) => i.sku === 'MN-B04');
x = await call('PATCH', `/orders/${orderId}/items/${porkItem.id}`, { qty: 3 });
check('เพิ่มหมูสไลซ์เป็น 3 จาน', r(x.json.order.grand_total) === 886, x.json.order.grand_total);

x = await call('GET', '/ingredients');
const porkAfter3 = x.json.data.find((i) => i.sku === 'ING-M01').qty_on_hand;
check('ตัดหมูอีก 0.2 กก. (43.8 -> 43.6)', r(porkAfter3) === 43.6, porkAfter3);

console.log('\n=== 7. วัตถุดิบไม่พอ -> ปฏิเสธ ===');
x = await call('POST', `/orders/${orderId}/items`, { items: [{ menu_sku: 'MN-B08', qty: 999 }] });
check('สั่งเกินสต็อก -> 409', x.status === 409, { status: x.status, err: x.json.error });
check('ข้อความบอกวัตถุดิบที่ขาด', /ไม่พอ/.test(x.json.error || ''), x.json.error);

console.log('\n=== 8. เช็คบิล + QR + ชำระเงิน ===');
x = await call('POST', `/orders/${orderId}/bill`);
check('เรียกเช็คบิล -> BILLING', x.json.data.status === 'BILLING', x.json.data?.status);

x = await call('GET', '/tables');
check('โต๊ะ T05 = BILLING (รอชำระเงิน)', x.json.data.find((t) => t.table_no === 'T05').status === 'BILLING');

x = await call('GET', `/payments/qr/${orderId}`);
check('สร้าง QR พร้อมเพย์ได้', x.status === 200 && x.json.data.qr_payload.startsWith('000201'), x.json.data?.qr_payload?.slice(0, 30));
check('QR ระบุยอด 886.00', x.json.data.qr_payload.includes('5406886.00'), x.json.data?.qr_payload);

x = await call('POST', '/payments', { order_id: orderId, method: 'CASH', received: 500 });
check('รับเงินน้อยกว่ายอด -> 400', x.status === 400, { status: x.status, err: x.json.error });

x = await call('POST', '/payments', { order_id: orderId, method: 'CASH', received: 1000 });
check('ชำระเงินสด -> 201', x.status === 201, x.json);
check('เงินทอน = 114', r(x.json.payment.change_amount) === 114, x.json.payment?.change_amount);
check('บิลปิดเป็น PAID', x.json.order.status === 'PAID', x.json.order?.status);
check('มีเลขใบเสร็จ RC...', /^RC\d{8}-\d{4}$/.test(x.json.payment.receipt_no), x.json.payment?.receipt_no);

x = await call('GET', '/tables');
check('โต๊ะ T05 กลับมาว่าง', x.json.data.find((t) => t.table_no === 'T05').status === 'FREE');

x = await call('POST', '/payments', { order_id: orderId, method: 'CASH', received: 1000 });
check('ชำระซ้ำ -> 409', x.status === 409, { status: x.status, err: x.json.error });

x = await call('GET', `/payments/receipt/${orderId}`);
check('ดึงข้อมูลใบเสร็จได้', x.status === 200 && x.json.data.items.length === 3, x.json.data?.items?.length);
check('ใบเสร็จมีชื่อร้าน', !!x.json.data.shop.name, x.json.data?.shop);

console.log('\n=== 9. ฝั่งลูกค้า (ไม่ต้องล็อกอิน) ===');
x = await call('GET', '/public/menu', null, { noAuth: true });
check('ลูกค้าดูเมนูได้โดยไม่ต้องล็อกอิน', x.status === 200 && x.json.count === 31, x.json.count);

x = await call('POST', '/public/tables/T12/order', { items: [{ menu_sku: 'MN-B01', qty: 1 }] }, { noAuth: true });
check('โต๊ะยังไม่เปิด ลูกค้าสั่งเองไม่ได้ -> 404', x.status === 404 && x.json.details?.reason === 'TABLE_NOT_OPEN', x.json);

x = await call('POST', '/orders', { table_no: 'T12', guest_count: 2 });
check('พนักงานเปิดโต๊ะ T12 -> ได้รหัส 4 หลัก', x.status === 201 && /^\d{4}$/.test(x.json.order.access_code), x.json.order?.access_code);
const custOrderId = x.json.order.id;
const tableCode = x.json.order.access_code;
const cust = { noAuth: true, headers: { 'X-Table-Code': tableCode } };

x = await call('GET', '/public/tables/T12', null, { noAuth: true });
check('ไม่ส่งรหัสโต๊ะ -> 403', x.status === 403 && x.json.details?.reason === 'CODE_REQUIRED', x.json);

const wrongCode = tableCode === '0000' ? '1111' : '0000';
x = await call('GET', '/public/tables/T12', null, { noAuth: true, headers: { 'X-Table-Code': wrongCode } });
check('รหัสโต๊ะผิด -> 403', x.status === 403 && x.json.details?.reason === 'CODE_INVALID', x.json);

x = await call('POST', '/public/tables/T12/order', {
  items: [{ menu_sku: 'MN-B01', qty: 1 }, { menu_sku: 'MN-D01', qty: 2 }],
}, cust);
check('ลูกค้าสั่งอาหารเองด้วยรหัสโต๊ะ -> 201', x.status === 201, x.json);
check('รอบแรก', x.json.round_no === 1, x.json.round_no);
check('ยอด = 299 + 30 = 329', r(x.json.order.grand_total) === 329, x.json.order?.grand_total);

const t12New = async () => (await call('GET', '/tables')).json.data.find((t) => t.table_no === 'T12').new_items;
let n = await t12New();
check('ผังร้านแจ้งออเดอร์ใหม่ 2 รายการ', n === 2, n);

x = await call('POST', `/orders/${custOrderId}/seen`);
n = await t12New();
check('พนักงานเปิดดูบิลแล้ว ป้ายออเดอร์ใหม่หายไป', x.status === 200 && n === 0, n);

x = await call('POST', '/public/tables/T12/order', { items: [{ menu_sku: 'MN-B16', qty: 2 }] }, cust);
check('ลูกค้าสั่งเพิ่ม รอบที่ 2', x.json.round_no === 2, x.json.round_no);
check('ยอด = 329 + 30 = 359', r(x.json.order.grand_total) === 359, x.json.order?.grand_total);
n = await t12New();
check('สั่งเพิ่มหลังพนักงานดูแล้ว -> ออเดอร์ใหม่ 1 รายการ', n === 1, n);

console.log('\n=== 9.1 หน้าจอครัว ===');
x = await call('GET', '/kitchen');
const k12 = x.json.data.filter((i) => i.table_no === 'T12');
check('คิวครัวมีรายการของ T12 ครบ 3 รายการ', x.status === 200 && k12.length === 3, k12.map((i) => i.name_th));
check('คิวเรียงจากสั่งก่อน (รอบ 1 มาก่อนรอบ 2)', k12[0].round_no === 1 && k12[2].round_no === 2, k12.map((i) => i.round_no));
const round1 = k12.filter((i) => i.round_no === 1).map((i) => i.id);

x = await call('POST', '/kitchen/serve', { item_ids: round1 });
check('เสิร์ฟครบรอบแรก -> served 2', x.status === 200 && x.json.served === 2, x.json);
x = await call('GET', '/kitchen');
check('คิวเหลือเฉพาะรอบ 2', x.json.data.filter((i) => i.table_no === 'T12').length === 1, x.json.count);

x = await call('POST', '/kitchen/serve', { item_ids: round1 });
check('กดเสิร์ฟซ้ำ -> ไม่นับซ้ำ', x.json.served === 0, x.json);

x = await call('POST', '/kitchen/unserve', { item_ids: [round1[0]] });
check('ย้อนกลับ 1 รายการ -> กลับเข้าคิว', x.json.restored === 1 && (await call('GET', '/kitchen')).json.data.filter((i) => i.table_no === 'T12').length === 2, x.json);

x = await call('POST', '/kitchen/serve', { item_ids: [] });
check('ไม่ระบุ item_ids -> 400', x.status === 400, x.json);

x = await call('GET', '/public/tables/T12/bill', null, cust);
check('ลูกค้าดูสรุปบิลได้', x.status === 200 && x.json.data.grand_total === 359, x.json.data?.grand_total);
check('ลูกค้าเห็นสถานะอาหาร: เสิร์ฟแล้ว 1 / รอทำ 2', x.json.data.items.filter((i) => i.status === 'SERVED').length === 1
  && x.json.data.items.filter((i) => i.status === 'ORDERED').length === 2, x.json.data.items.map((i) => i.status));

x = await call('POST', '/public/tables/T12/bill', null, cust);
check('ลูกค้าเรียกเช็คบิลเอง', x.json.data.status === 'BILLING', x.json.data?.status);

x = await call('POST', '/public/tables/T12/order', { items: [{ menu_sku: 'MN-D01', qty: 1 }] }, cust);
check('เช็คบิลแล้วสั่งเพิ่มไม่ได้ -> 409', x.status === 409, { status: x.status, err: x.json.error });

x = await call('POST', '/payments', { order_id: custOrderId, method: 'QR', reference_no: 'TXN-0099' });
check('ชำระผ่าน QR -> 201', x.status === 201 && x.json.order.status === 'PAID', x.json);

x = await call('POST', '/public/tables/T12/order', { items: [{ menu_sku: 'MN-D01', qty: 1 }] }, cust);
check('ปิดบิลแล้ว รหัสเดิมสั่งกวนไม่ได้ -> 404', x.status === 404 && x.json.details?.reason === 'TABLE_NOT_OPEN', x.json);

console.log('\n=== 10. รับเข้า / เบิกใช้ / ปรับยอดวัตถุดิบ ===');
x = await call('POST', '/stock/in', {
  supplier: 'ตลาดสดเทศบาลกาญจนบุรี',
  lines: [
    { ingredient_sku: 'ING-M01', qty: 20, unit_cost: 150 },
    { ingredient_sku: 'ING-V01', qty: 15, unit_cost: 30 },
  ],
});
check('บันทึกรับเข้า -> 201', x.status === 201, x.json);
check('เลขเอกสาร IN...', /^IN\d{8}-\d{4}$/.test(x.json.data.doc_no), x.json.data?.doc_no);
check('มูลค่ารับเข้า = 3450', r(x.json.data.total_cost) === 3450, x.json.data?.total_cost);

x = await call('GET', '/ingredients');
const porkFinal = x.json.data.find((i) => i.sku === 'ING-M01');
check('หมูสไลซ์เพิ่มเป็น 63.2 กก.', r(porkFinal.qty_on_hand) === 63.2, porkFinal.qty_on_hand);
check('ต้นทุนอัปเดตเป็น 150', porkFinal.cost_per_unit === 150, porkFinal.cost_per_unit);

x = await call('POST', '/stock/issue', { note: 'เบิกไปเตรียมครัว', lines: [{ ingredient_sku: 'ING-V01', qty: 5 }] });
check('บันทึกเบิกใช้ -> 201', x.status === 201 && /^IS/.test(x.json.data.doc_no), x.json.data?.doc_no);

x = await call('POST', '/stock/adjust', { ingredient_sku: 'ING-V06', counted_qty: 2 });
check('ปรับยอดจากการนับ -> 200', x.status === 200, x.json);
check('ยอดหลังปรับ = 2', x.json.data.balance_after === 2, x.json.data?.balance_after);
check('แจ้งว่าต่ำกว่าขั้นต่ำ', x.json.data.is_low === true, x.json.data);

// ค่าว่าง / null / ตัวอักษร ต้องถูกปฏิเสธ ไม่ใช่ถูกนับเป็น 0 แล้วล้างสต็อกทิ้ง
for (const bad of ['', '   ', null, 'abc', true]) {
  x = await call('POST', '/stock/adjust', { ingredient_sku: 'ING-V06', counted_qty: bad });
  check(`ปรับยอดด้วย ${JSON.stringify(bad)} -> 400`, x.status === 400, { status: x.status, err: x.json.error });
}
x = await call('GET', '/ingredients');
check('ยอด ING-V06 ยังเป็น 2 (ไม่ถูกล้างเป็น 0)', x.json.data.find((i) => i.sku === 'ING-V06').qty_on_hand === 2,
  x.json.data.find((i) => i.sku === 'ING-V06')?.qty_on_hand);
x = await call('POST', '/stock/adjust', { ingredient_sku: 'ING-V06', counted_qty: '2.5' });
check('ตัวเลขที่ส่งมาเป็นข้อความ "2.5" ยังใช้ได้', x.status === 200 && x.json.data.balance_after === 2.5, x.json);
x = await call('POST', '/stock/adjust', { ingredient_sku: 'ING-V06', counted_qty: 2 });

console.log('\n=== 11. แจ้งเตือนวัตถุดิบใกล้หมด ===');
x = await call('GET', '/stock/low');
check('GET /stock/low ทำงาน', x.status === 200, x.json);
check('พบวัตถุดิบใกล้หมด', x.json.count > 0, { count: x.json.count, items: x.json.data?.map((d) => d.name_th) });
check('เห็ดออรินจิอยู่ในรายการเตือน', x.json.data.some((d) => d.sku === 'ING-V06'), x.json.data?.map((d) => d.sku));

console.log('\n=== 12. รายงาน ===');
x = await call('GET', '/reports/dashboard');
check('รายงาน dashboard', x.status === 200 && x.json.data.today.bills === 2, x.json.data?.today);
check('ยอดขายวันนี้ = 886 + 359 = 1245', r(x.json.data.today.sales) === 1245, x.json.data?.today?.sales);
check('นับโต๊ะว่าง 20 โต๊ะ', x.json.data.tables.free === 20, x.json.data?.tables);
check('มีจำนวนวัตถุดิบใกล้หมด', x.json.data.low_stock_count > 0, x.json.data?.low_stock_count);

for (const g of ['day', 'week', 'month']) {
  x = await call('GET', `/reports/sales?group=${g}`);
  check(`รายงานยอดขายราย${g}`, x.status === 200 && x.json.totals.grand_total === 1245, { g, t: x.json.totals });
}

x = await call('GET', '/reports/top-menu');
check('รายงานเมนูขายดี', x.status === 200 && x.json.data.length > 0, x.json.count);
check('อันดับ 1 มี rank = 1', x.json.data[0].rank === 1, x.json.data?.[0]);

x = await call('GET', '/reports/stock?only_low=true');
check('รายงานวัตถุดิบใกล้หมด', x.status === 200 && x.json.data.length > 0, x.json.count);

x = await call('GET', '/reports/stock-movements');
check('รายงานการเคลื่อนไหววัตถุดิบ', x.status === 200 && x.json.data.length > 0, x.json.count);
check('มีทั้ง IN / ISSUE / SALE / ADJUST',
  ['IN', 'ISSUE', 'SALE', 'ADJUST'].every((t) => x.json.data.some((r) => r.movement_type === t)),
  [...new Set(x.json.data.map((r) => r.movement_type))]);

x = await call('GET', '/reports/bills');
check('รายงานบิลขาย', x.status === 200 && x.json.data.length === 2, x.json.count);

x = await call('GET', '/reports/payment-methods');
check('รายงานช่องทางชำระเงิน', x.status === 200 && x.json.data.length === 2, x.json.data);

console.log('\n=== 13. ส่งออก CSV (MS-Excel) ===');
const csvRes = await fetch(`${BASE}/reports/top-menu?format=csv`, { headers: { Authorization: `Bearer ${token}` } });
const csvText = await csvRes.text();
check('ส่งออก CSV ได้', csvRes.headers.get('content-type').includes('text/csv'), csvRes.headers.get('content-type'));
const csvBuf = Buffer.from(await (await fetch(`${BASE}/reports/top-menu?format=csv`, { headers: { Authorization: `Bearer ${token}` } })).arrayBuffer());
check('CSV มี BOM ให้ Excel อ่านไทยได้', csvBuf[0] === 0xef && csvBuf[1] === 0xbb && csvBuf[2] === 0xbf, [...csvBuf.slice(0,3)]);
check('CSV มีหัวตารางภาษาไทย', csvText.includes('อันดับ') && csvText.includes('ชื่อเมนู'), csvText.split('\r\n')[0]);

console.log('\n=== 14. สิทธิ์ผู้ใช้ ===');
x = await call('POST', '/auth/login', { username: 'staff1', password: 'staff123' }, { noAuth: true });
const staffToken = x.json.token;
const ownerToken = token;
token = staffToken;
x = await call('POST', '/stock/adjust', { ingredient_sku: 'ING-M01', counted_qty: 10 });
check('พนักงานปรับยอดสต็อกไม่ได้ -> 403', x.status === 403, { status: x.status, err: x.json.error });
x = await call('POST', '/menu', { sku: 'X', name_th: 'x', price: 1, category_code: 'BBQ' });
check('พนักงานเพิ่มเมนูไม่ได้ -> 403', x.status === 403, x.status);
x = await call('POST', '/orders', { table_no: 'T01', items: [{ menu_sku: 'MN-D01', qty: 1 }] });
check('พนักงานเปิดบิลได้ -> 201', x.status === 201, x.status);
await call('POST', `/orders/${x.json.order.id}/void`, { reason: 'ทดสอบระบบ' });
token = ownerToken;

console.log('\n=== 15. ยกเลิกบิล -> คืนสต็อกครบ ===');
x = await call('GET', '/ingredients');
const waterBefore = x.json.data.find((i) => i.sku === 'ING-D01').qty_on_hand;
x = await call('POST', '/orders', { table_no: 'T20', items: [{ menu_sku: 'MN-D01', qty: 5 }] });
const voidId = x.json.order.id;
x = await call('GET', '/ingredients');
check('ตัดน้ำดื่ม 5 ขวด', x.json.data.find((i) => i.sku === 'ING-D01').qty_on_hand === waterBefore - 5);
x = await call('POST', `/orders/${voidId}/void`, { reason: 'ลูกค้ายกเลิก' });
check('ยกเลิกบิล -> VOID', x.json.data.status === 'VOID', x.json.data?.status);
x = await call('GET', '/ingredients');
check('คืนน้ำดื่มครบ 5 ขวด', x.json.data.find((i) => i.sku === 'ING-D01').qty_on_hand === waterBefore, {
  before: waterBefore, after: x.json.data.find((i) => i.sku === 'ING-D01').qty_on_hand,
});
x = await call('GET', '/tables');
check('โต๊ะ T20 กลับมาว่าง', x.json.data.find((t) => t.table_no === 'T20').status === 'FREE');

console.log('\n=== 15.1 รับเงินบางส่วนแล้วลดยอด ต้องไม่ทำให้บิลค้าง ===');
x = await call('POST', '/orders', { table_no: 'T15', items: [{ menu_sku: 'MN-B02', qty: 1 }, { menu_sku: 'MN-D02', qty: 4 }] });
const partId = x.json.order.id;
const setItem = x.json.order.items.find((i) => i.sku === 'MN-B02');
check('เปิดบิล T15 ยอด 649', r(x.json.order.grand_total) === 649, x.json.order?.grand_total);
x = await call('POST', '/payments', { order_id: partId, method: 'CASH', amount: 300 });
check('รับเงินบางส่วน 300 -> คงเหลือ 349', x.status === 201 && r(x.json.order.outstanding) === 349, x.json);
x = await call('POST', `/orders/${partId}/void`, { reason: 'ลองยกเลิก' });
check('ยกเลิกทั้งบิลหลังรับเงินแล้ว -> 409', x.status === 409 && x.json.details?.reason === 'HAS_PAYMENTS', x.json);
x = await call('GET', `/orders/${partId}`);
check('บิลยังเปิดอยู่ ไม่ถูกยกเลิก', x.json.data.status !== 'VOID', x.json.data?.status);
x = await call('PATCH', `/orders/${partId}`, { discount: 400 });
check('ส่วนลดจนยอดต่ำกว่าที่รับไว้ -> 409', x.status === 409 && x.json.details?.reason === 'BELOW_PAID', x.json);
x = await call('DELETE', `/orders/${partId}/items/${setItem.id}`);
check('ยกเลิกรายการจนยอดต่ำกว่าที่รับไว้ -> 409', x.status === 409, x.json);
x = await call('GET', `/orders/${partId}`);
check('ถูกปฏิเสธแล้วบิลไม่เปลี่ยน (ยอด 649 ส่วนลด 0 รายการยังอยู่)',
  r(x.json.data.grand_total) === 649 && Number(x.json.data.discount) === 0
  && x.json.data.items.find((i) => i.id === setItem.id).status !== 'CANCELLED', x.json.data);
x = await call('PATCH', `/orders/${partId}`, { discount: 349 });
check('ส่วนลดให้ยอดเท่ากับที่รับไว้พอดี -> ได้ (คงเหลือ 0)', x.status === 200 && r(x.json.data.outstanding) === 0, x.json);
x = await call('POST', '/payments', { order_id: partId, method: 'CASH' });
check('ปิดบิลได้โดยไม่ต้องรับเงินเพิ่ม -> PAID', x.status === 201 && x.json.order.status === 'PAID' && x.json.payment === null, x.json);
check('ไม่มีรายการรับเงินเพิ่ม (ยังเป็น 1 รายการ 300)', x.json.order.payments.length === 1 && r(x.json.order.paid_amount) === 300, x.json.order?.payments);
x = await call('GET', '/tables');
check('โต๊ะ T15 กลับมาว่าง', x.json.data.find((t) => t.table_no === 'T15').status === 'FREE');

console.log('\n=== 15.2 ปิดบัญชี / เปลี่ยนสิทธิ์ / เปลี่ยนรหัสผ่าน ต้องมีผลทันที ===');
x = await call('POST', '/auth/users', { username: 'temp1', password: 'temp1234', full_name: 'พนักงานชั่วคราว', role: 'STAFF' });
const tempId = x.json.data.id;
x = await call('POST', '/auth/login', { username: 'temp1', password: 'temp1234' }, { noAuth: true });
const tempToken = x.json.token;
const asTemp = (m, p, b) => call(m, p, b, { noAuth: true, headers: { Authorization: `Bearer ${tempToken}` } });
x = await asTemp('GET', '/tables');
check('ผู้ใช้ใหม่เข้าใช้งานได้', x.status === 200, x.status);
x = await asTemp('GET', '/auth/users');
check('พนักงานดูรายชื่อผู้ใช้ไม่ได้ -> 403', x.status === 403, x.status);

await call('PATCH', `/auth/users/${tempId}`, { role: 'OWNER' });
x = await asTemp('GET', '/auth/users');
check('เลื่อนเป็นเจ้าของร้าน -> token เดิมใช้สิทธิ์ใหม่ได้ทันที', x.status === 200, x.status);
await call('PATCH', `/auth/users/${tempId}`, { role: 'STAFF' });
x = await asTemp('GET', '/auth/users');
check('ลดสิทธิ์กลับเป็นพนักงาน -> 403 ทันที', x.status === 403, x.status);

await call('PATCH', `/auth/users/${tempId}`, { is_active: false });
x = await asTemp('GET', '/tables');
check('ปิดบัญชี -> token เดิมโดน 401 ทันที', x.status === 401, x.status);
x = await call('POST', '/auth/login', { username: 'temp1', password: 'temp1234' }, { noAuth: true });
check('ปิดบัญชีแล้วเข้าสู่ระบบไม่ได้', x.status === 401, x.status);
await call('PATCH', `/auth/users/${tempId}`, { is_active: true });

await call('PATCH', `/auth/users/${tempId}`, { password: 'newpass99' });
x = await asTemp('GET', '/tables');
check('เปลี่ยนรหัสผ่าน -> token เดิมโดน 401', x.status === 401, x.status);
x = await call('POST', '/auth/login', { username: 'temp1', password: 'newpass99' }, { noAuth: true });
check('เข้าสู่ระบบด้วยรหัสใหม่ได้', x.status === 200 && !!x.json.token, x.status);
x = await call('GET', '/tables');
check('token ของเจ้าของร้านยังใช้ได้ตามปกติ', x.status === 200, x.status);
await call('PATCH', `/auth/users/${tempId}`, { is_active: false });

console.log('\n=== 15.3 ตั้งค่าร้าน: ค่าผิดรูปแบบต้องไม่ถูกบันทึก ===');
const settingsBefore = (await call('GET', '/settings')).json.data;
for (const [body, why] of [
  [{ vat_rate: 'abc' }, 'vat_rate เป็นตัวอักษร'],
  [{ vat_rate: 150 }, 'vat_rate เกิน 100'],
  [{ service_rate: -5 }, 'service_rate ติดลบ'],
  [{ vat_included: 'yes' }, 'vat_included ไม่ใช่ true/false'],
  [{ promptpay_id: '12345' }, 'พร้อมเพย์ไม่ครบหลัก'],
  [{ shop_name: '   ' }, 'ชื่อร้านว่าง'],
  [{ customer_base_url: 'ftp://x' }, 'ที่อยู่เว็บไม่ใช่ http'],
  [{ hacker_key: '1' }, 'ค่าที่ระบบไม่รู้จัก'],
  [{ service_rate: 10, vat_rate: 'x' }, 'ผิดข้อเดียวในหลายค่า'],
]) {
  x = await call('PATCH', '/settings', body);
  check(`${why} -> 400`, x.status === 400, { status: x.status, err: x.json.error });
}
x = await call('GET', '/settings');
check('ค่าผิดไม่ถูกบันทึกเลยสักค่า (ตั้งค่าเหมือนเดิม)', JSON.stringify(x.json.data) === JSON.stringify(settingsBefore), x.json.data);
x = await call('PATCH', '/settings', { vat_rate: '7', vat_included: true, promptpay_id: '034-000-9991' });
check('ค่าถูกต้องบันทึกได้ และจัดรูปแบบให้', x.status === 200 && x.json.data.vat_rate === '7'
  && x.json.data.vat_included === 'true' && x.json.data.promptpay_id === '0340009991', x.json);
await call('PATCH', '/settings', { vat_rate: settingsBefore.vat_rate, vat_included: settingsBefore.vat_included, promptpay_id: settingsBefore.promptpay_id });
x = await call('POST', '/orders', { table_no: 'T16', items: [{ menu_sku: 'MN-D01', qty: 1 }] });
check('หลังแก้ตั้งค่า เปิดบิลคิดยอดได้ปกติ', x.status === 201 && Number.isFinite(Number(x.json.order.grand_total)), x.json);
await call('POST', `/orders/${x.json.order.id}/void`, { reason: 'cleanup' });

console.log('\n=== 15.4 ส่วนลดต้องไม่เกินยอดรวม ===');
x = await call('POST', '/orders', { table_no: 'T17', items: [{ menu_sku: 'MN-D02', qty: 2 }, { menu_sku: 'MN-D01', qty: 1 }] });
const discId = x.json.order.id;
const cokeLine = x.json.order.items.find((i) => i.sku === 'MN-D02');
check('เปิดบิล T17 ยอด 65', r(x.json.order.subtotal) === 65, x.json.order?.subtotal);
x = await call('PATCH', `/orders/${discId}`, { discount: 70 });
check('ส่วนลด 70 เกินยอด 65 -> 400', x.status === 400 && x.json.details?.reason === 'DISCOUNT_TOO_HIGH' && x.json.details?.max === 65, x.json);
x = await call('PATCH', `/orders/${discId}`, { discount: 'abc' });
check('ส่วนลดเป็นตัวอักษร -> 400', x.status === 400, x.json);
x = await call('PATCH', `/orders/${discId}`, { discount: 65 });
check('ส่วนลดเท่ายอดรวมพอดีได้ (สุทธิ 0)', x.status === 200 && r(x.json.data.grand_total) === 0, x.json);
x = await call('PATCH', `/orders/${discId}`, { discount: 60 });
x = await call('DELETE', `/orders/${discId}/items/${cokeLine.id}`);
check('ยกเลิกรายการจนยอดรวม (15) ต่ำกว่าส่วนลด (60) -> ส่วนลดปรับลงเหลือ 15',
  x.status === 200 && r(x.json.data.discount) === 15 && r(x.json.data.grand_total) === 0, x.json.data);
await call('POST', `/orders/${discId}/void`, { reason: 'cleanup' });

console.log('\n=== 15.5 ปรับยอดสต็อกระหว่างมีการขาย / ยอดตั้งต้น / บันทึกสูตรพร้อมราคา ===');
// ปรับยอดพร้อมกับมีโต๊ะสั่งโค้ก (ตัดสต็อก ING-D02) -> ยอดหลังปรับต้องเท่ากับที่นับได้พอดีทุกครั้ง
x = await call('POST', '/orders', { table_no: 'T16' });
const raceOrderId = x.json.order.id;
let adjustExact = true;
for (let i = 0; i < 5; i++) {
  const [adj] = await Promise.all([
    call('POST', '/stock/adjust', { ingredient_sku: 'ING-D02', counted_qty: 50 }),
    call('POST', `/orders/${raceOrderId}/items`, { items: [{ menu_sku: 'MN-D02', qty: 1 }] }),
  ]);
  if (adj.status !== 200 || (adj.json.data.balance_after !== undefined && adj.json.data.balance_after !== 50)) adjustExact = false;
}
check('ปรับยอดพร้อมกับมีการขาย 5 รอบ -> ยอดหลังปรับ = 50 ทุกครั้ง', adjustExact);
await call('POST', `/orders/${raceOrderId}/void`, { reason: 'cleanup' });

x = await call('POST', '/ingredients', { sku: 'ING-TEST1', name_th: 'วัตถุดิบทดสอบ', unit: 'กก.', qty_on_hand: 5, cost_per_unit: 10 });
check('เพิ่มวัตถุดิบใหม่ ยอดตั้งต้น 5', x.status === 201 && Number(x.json.data.qty_on_hand) === 5, x.json);
x = await call('GET', `/ingredients/${x.json.data.id}`);
check('ยอดตั้งต้นลงประวัติการเคลื่อนไหว (ADJUST +5)',
  x.json.data.movements.length === 1 && x.json.data.movements[0].movement_type === 'ADJUST' && Number(x.json.data.movements[0].qty_change) === 5,
  x.json.data.movements);
x = await call('POST', '/ingredients', { sku: 'ING-TEST2', name_th: 'ทดสอบ', unit: 'กก.', qty_on_hand: 'abc' });
check('ยอดตั้งต้นเป็นตัวอักษร -> 400', x.status === 400, x.json);

const onion = (await call('GET', '/menu?q=หอมใหญ่')).json.data[0];
const onionFull = (await call('GET', `/menu/${onion.id}`)).json.data;
const onionRecipe = onionFull.recipe.map((l) => ({ ingredient_id: l.ingredient_id, qty_per_unit: Number(l.qty_per_unit) }));
x = await call('PUT', `/menu/${onion.id}/recipe`, { price: 55, recipe: [{ ingredient_sku: 'ING-NOPE', qty_per_unit: 1 }] });
check('สูตรผิด (วัตถุดิบไม่มีจริง) -> 404', x.status === 404, x.json);
x = await call('GET', `/menu/${onion.id}`);
check('สูตรผิดแล้วราคาไม่เปลี่ยน (บันทึกพร้อมกันทั้งหมดหรือไม่บันทึกเลย)',
  Number(x.json.data.price) === Number(onionFull.price) && x.json.data.recipe.length === onionFull.recipe.length, x.json.data);
x = await call('PUT', `/menu/${onion.id}/recipe`, { price: 'abc', recipe: onionRecipe });
check('ราคาเป็นตัวอักษร -> 400', x.status === 400, x.json);
x = await call('PUT', `/menu/${onion.id}/recipe`, { price: 55, is_available: true, recipe: onionRecipe });
x = await call('GET', `/menu/${onion.id}`);
check('บันทึกราคา + สูตรพร้อมกันได้', Number(x.json.data.price) === 55 && x.json.data.recipe.length === onionFull.recipe.length, x.json.data);
await call('PUT', `/menu/${onion.id}/recipe`, { price: Number(onionFull.price), recipe: onionRecipe });

console.log('\n=== 16. กติกาความถูกต้องของข้อมูล ===');
x = await call('POST', '/orders', { table_no: 'T07', items: [{ menu_sku: 'MN-D01', qty: 1 }] });
const dupTableOrder = x.json.order.id;
x = await call('POST', '/orders', { table_no: 'T07' });
check('เปิดบิลซ้ำโต๊ะเดิม -> 409', x.status === 409, { status: x.status, err: x.json.error });
await call('POST', `/orders/${dupTableOrder}/void`, { reason: 'cleanup' });

// เปิดบิลหลายโต๊ะพร้อมกัน: เลขบิลต้องไม่ชนกัน (เดิมใช้ MAX+1 โดยไม่ล็อก ทำให้ล้มด้วย "ข้อมูลซ้ำ")
const raceTables = ['T08', 'T09', 'T10', 'T13', 'T14'];
const raced = await Promise.all(raceTables.map((t) => call('POST', '/orders', { table_no: t, items: [{ menu_sku: 'MN-D01', qty: 1 }] })));
check('เปิดบิล 5 โต๊ะพร้อมกัน -> สำเร็จทั้งหมด', raced.every((o) => o.status === 201), raced.map((o) => o.json.error || o.status));
const racedNos = raced.filter((o) => o.status === 201).map((o) => o.json.order.order_no);
check('เลขบิลที่ได้ไม่ซ้ำกัน', new Set(racedNos).size === racedNos.length, racedNos);
for (const o of raced) if (o.status === 201) await call('POST', `/orders/${o.json.order.id}/void`, { reason: 'cleanup' });

x = await call('POST', '/orders', { table_no: 'T99' });
check('โต๊ะไม่มีจริง -> 404', x.status === 404, x.status);
x = await call('POST', '/orders', { guest_count: 2 });
check('ไม่ระบุโต๊ะ -> 400', x.status === 400, x.status);
x = await call('GET', '/orders/999999');
check('บิลไม่มีจริง -> 404', x.status === 404, x.status);
// error ต้องไม่เปิดเผยรายละเอียดภายใน (SQL / ชื่อตาราง / คอลัมน์) ให้หน้าเว็บ
const leaks = (j) => /syntax|relation|column|constraint|Key \(|SELECT|postgres|at .*\.js/i.test(JSON.stringify(j));
x = await call('GET', '/orders/abc');
check('id ไม่ใช่ตัวเลข -> 400 ไม่เปิดเผยข้อความของฐานข้อมูล', x.status === 400 && !x.json.details && !leaks(x.json), x.json);
x = await call('POST', '/auth/users', { username: 'owner', password: 'dup12345', full_name: 'ซ้ำ' });
check('ชื่อผู้ใช้ซ้ำ -> 409 ไม่แนบรายละเอียดคอลัมน์', x.status === 409 && !x.json.details && !leaks(x.json), x.json);
{
  const res = await fetch(BASE + '/orders', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: '{bad json' });
  const j = await res.json();
  check('JSON เสีย -> 400 (ไม่ใช่ 500)', res.status === 400 && !leaks(j), { status: res.status, j });
}

x = await call('GET', '/nope');
check('เส้นทางไม่มีจริง -> 404', x.status === 404, x.status);

console.log(`\n${'='.repeat(50)}`);
console.log(`  ผ่าน ${pass} รายการ / ไม่ผ่าน ${fail} รายการ`);
console.log(`${'='.repeat(50)}\n`);
process.exit(fail ? 1 : 0);
