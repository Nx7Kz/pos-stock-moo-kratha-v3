# คู่มือ API — ระบบ POS & Stock ร้านย่างให้หมูกระทะ บ้านน้องโฟค

Base URL : `http://localhost:4000/api`

ทุกปลายทางยกเว้น `/health`, `/auth/login` และ `/public/*` ต้องแนบ header

```
Authorization: Bearer <token>
```

## รูปแบบผลลัพธ์

สำเร็จ

```json
{ "ok": true, "data": { } }
```

ผิดพลาด

```json
{ "ok": false, "error": "ข้อความอธิบายเป็นภาษาไทย", "details": { } }
```

| รหัส | ความหมาย |
|---|---|
| 200 / 201 | สำเร็จ |
| 400 | ข้อมูลที่ส่งมาไม่ครบหรือผิดรูปแบบ |
| 401 | ยังไม่เข้าสู่ระบบ หรือ token หมดอายุ |
| 403 | สิทธิ์ไม่พอ (เช่น พนักงานพยายามแก้สูตรอาหาร) |
| 404 | ไม่พบข้อมูล |
| 409 | ขัดแย้งกับสถานะปัจจุบัน เช่น วัตถุดิบไม่พอ หรือโต๊ะมีบิลค้างอยู่แล้ว |

---

## 1. Authentication

| Method | Path | คำอธิบาย |
|---|---|---|
| POST | `/auth/login` | เข้าสู่ระบบ รับ JWT (อายุ 12 ชั่วโมง) |
| GET | `/auth/me` | ข้อมูลผู้ใช้ที่ล็อกอินอยู่ |
| GET | `/auth/users` | รายชื่อผู้ใช้ *(OWNER)* |
| POST | `/auth/users` | เพิ่มผู้ใช้ *(OWNER)* |
| PATCH | `/auth/users/:id` | แก้ไข / ปิดการใช้งานผู้ใช้ *(OWNER)* |

```http
POST /api/auth/login
{ "username": "owner", "password": "owner123" }
```

```json
{
  "ok": true,
  "token": "eyJhbGciOi...",
  "user": { "id": 1, "username": "owner", "full_name": "นายพงศพัทธ์ ดวงจิตต์", "role": "OWNER" }
}
```

---

## 2. ผังโต๊ะ

| Method | Path | คำอธิบาย |
|---|---|---|
| GET | `/tables` | ผังสถานะโต๊ะทั้ง 20 โต๊ะ · กรองด้วย `?status=FREE\|OCCUPIED\|BILLING` `?zone=` · `new_items` = จำนวนรายการที่ลูกค้าสั่งเองแต่พนักงานยังไม่เปิดดู |
| GET | `/tables/:id` | สถานะโต๊ะเดียว |
| PATCH | `/tables/:id` | แก้จำนวนที่นั่ง / โซน *(OWNER)* |

ผลลัพธ์มี `summary` สรุปจำนวนโต๊ะแต่ละสถานะและยอดเงินคงค้างรวม

---

## 3. เมนูอาหารและสูตร BOM

| Method | Path | คำอธิบาย |
|---|---|---|
| GET | `/menu/categories` | หมวดหมู่เมนู |
| GET | `/menu` | รายการเมนู · `?category=BBQ` `?q=หมู` `?available=true` `?with_stock=true` |
| GET | `/menu/:id` | เมนู 1 รายการ พร้อมสูตร BOM ต้นทุน และกำไรต่อหน่วย |
| POST | `/menu` | เพิ่มเมนูใหม่ (แนบ `recipe` มาพร้อมได้) *(OWNER)* |
| PATCH | `/menu/:id` | แก้ราคา / ชื่อ / เปิด-ปิดการขาย *(OWNER)* |
| PUT | `/menu/:id/recipe` | กำหนดสูตร BOM ใหม่ทั้งชุด *(OWNER)* |
| DELETE | `/menu/:id` | ปิดการขายเมนู *(OWNER)* |
| POST | `/menu/:id/image` | อัปโหลดรูปเมนู (แทนรูปเดิม) · body `{ "data": "data:image/jpeg;base64,..." }` JPG/PNG/WEBP ไม่เกิน 2 MB *(OWNER)* |
| DELETE | `/menu/:id/image` | ลบรูปเมนู กลับไปแสดงไอคอนหมวด *(OWNER)* |

รูปเมนูเปิดดูได้ที่ `image_url` เช่น `/media/samples/mn-b01.jpg` (รูปตัวอย่างที่มากับระบบ)
หรือ `/media/uploads/mn-b04.jpg?v=...` (รูปที่ร้านอัปโหลด เก็บที่ `backend/media/uploads` ชื่อไฟล์ = รหัสเมนู และขึ้น git ด้วย)
ตอนเปิดระบบ เมนูที่มีไฟล์ใน `uploads/` จะถูกผูกกับรูปนั้นอัตโนมัติ — clone ไปเครื่องใหม่ก็เห็นรูปที่ร้านอัปโหลดไว้
`?v=` คือเวลาแก้ไฟล์ เปลี่ยนรูปแล้วเบราว์เซอร์โหลดรูปใหม่ทันที

`?with_stock=true` จะเพิ่มฟิลด์ **`max_servable`** = จำนวนสูงสุดที่ทำได้จากวัตถุดิบคงเหลือ ณ ตอนนี้
(หน้าจอใช้ค่านี้ตัดสินว่าจะขึ้นป้าย "วัตถุดิบหมด" หรือ "เหลือ n")

---

## 4. วัตถุดิบ

| Method | Path | คำอธิบาย |
|---|---|---|
| GET | `/ingredients` | วัตถุดิบคงเหลือ real-time · `?grp=MEAT` `?status=LOW` `?q=` |
| GET | `/ingredients/:id` | วัตถุดิบ 1 รายการ + ประวัติ 50 รายการล่าสุด + เมนูที่ใช้วัตถุดิบนี้ |
| POST | `/ingredients` | เพิ่มวัตถุดิบใหม่ *(OWNER)* |
| PATCH | `/ingredients/:id` | แก้ชื่อ / หน่วย / จุดสั่งซื้อขั้นต่ำ / ต้นทุน *(OWNER)* |

> แก้ `qty_on_hand` ตรง ๆ ไม่ได้ ต้องผ่าน `/stock/*` เสมอ เพื่อให้มีบันทึกใน ledger ทุกครั้ง

---

## 5. ออเดอร์

| Method | Path | คำอธิบาย |
|---|---|---|
| GET | `/orders` | ค้นหาบิล · `?status=` `?table_no=` `?from=` `?to=` `?limit=` |
| GET | `/orders/:id` | บิล 1 ใบ พร้อมรายการอาหารและการชำระเงิน |
| POST | `/orders` | เปิดบิลใหม่ (แนบ `items` สั่งพร้อมกันได้) |
| POST | `/orders/:id/items` | **สั่งอาหารเพิ่ม — ตัดสต็อกตาม BOM ทันที** |
| PATCH | `/orders/:id/items/:itemId` | แก้จำนวน (ปรับสต็อกตามส่วนต่าง) |
| DELETE | `/orders/:id/items/:itemId` | ยกเลิกรายการ (คืนสต็อก) |
| PATCH | `/orders/:id` | แก้ส่วนลด / จำนวนลูกค้า / หมายเหตุ |
| POST | `/orders/:id/bill` | เรียกเช็คบิล → โต๊ะเปลี่ยนเป็น "รอชำระเงิน" |
| POST | `/orders/:id/void` | ยกเลิกทั้งบิล (คืนสต็อกทุกรายการ) |
| POST | `/orders/:id/access-code` | สุ่มรหัสโต๊ะ 4 หลักใหม่ รหัสเดิมใช้ไม่ได้ทันที |
| POST | `/orders/:id/seen` | พนักงานเปิดดูบิลแล้ว — ล้างตัวนับออเดอร์ใหม่ (`new_items`) ของโต๊ะนี้ |

### เปิดบิลพร้อมสั่งอาหาร

```http
POST /api/orders
{
  "table_no": "T05",
  "guest_count": 4,
  "items": [
    { "menu_sku": "MN-B02", "qty": 1 },
    { "menu_sku": "MN-D02", "qty": 4 }
  ]
}
```

```json
{
  "ok": true,
  "message": "เปิดบิล OD20260827-0001 เรียบร้อย",
  "order": { "id": 1, "order_no": "OD20260827-0001", "grand_total": 649, "items": [ ] },
  "stock_alerts": [
    { "sku": "ING-V06", "name_th": "เห็ดออรินจิ", "balance_after": 3.2, "min_qty": 4, "is_low": true }
  ]
}
```

`stock_alerts` คือวัตถุดิบที่**ตกลงมาต่ำกว่าจุดสั่งซื้อขั้นต่ำหลังการขายครั้งนี้** ใช้แสดงข้อความแจ้งเตือนหน้าร้าน

### กรณีวัตถุดิบไม่พอ

```json
{
  "ok": false,
  "error": "วัตถุดิบไม่พอสำหรับ \"กุ้งสด\" จำนวน 999 จาน: กุ้งขาวสด (เหลือ 8 กก. ต้องใช้ 179.82)",
  "details": [ { "sku": "ING-M05", "name_th": "กุ้งขาวสด", "qty_on_hand": 8, "required": 179.82 } ]
}
```

ระบบจะไม่บันทึกรายการและไม่แตะสต็อกเลย (ทั้งหมดอยู่ในทรานแซกชันเดียว)

---

## 5.1 หน้าจอครัว

| Method | Path | คำอธิบาย |
|---|---|---|
| GET | `/kitchen` | รายการที่ยังไม่เสิร์ฟ (`ORDERED`) จากทุกโต๊ะที่เปิดอยู่ เรียงจากสั่งก่อน |
| POST | `/kitchen/serve` | ครัวส่งอาหารแล้ว · body `{ "item_ids": [12, 13] }` → สถานะเป็น `SERVED` |
| POST | `/kitchen/unserve` | ย้อนกลับเมื่อกดเสิร์ฟพลาด · body เหมือนด้านบน |

ปรับได้เฉพาะรายการในบิลที่ยังเปิดอยู่ กดซ้ำจะไม่นับซ้ำ (ผลลัพธ์ `served: 0`)

---

## 6. การชำระเงิน

| Method | Path | คำอธิบาย |
|---|---|---|
| POST | `/payments` | รับชำระเงินและปิดบิล |
| GET | `/payments` | ประวัติการรับชำระ · `?from=` `?to=` `?method=` |
| GET | `/payments/qr/:orderId` | สตริง QR พร้อมเพย์ (มาตรฐาน EMVCo) ของบิลนี้ |
| GET | `/payments/receipt/:orderId` | ข้อมูลใบเสร็จรับเงินสำหรับพิมพ์ |

```http
POST /api/payments
{ "order_id": 1, "method": "CASH", "received": 1000 }
```

- ไม่ส่ง `amount` = ชำระเต็มยอดคงเหลือ
- `method: "CASH"` พร้อม `received` → ระบบคำนวณเงินทอนให้ และปฏิเสธถ้าเงินไม่พอ
- `method: "TRANSFER"` หรือ `"QR"` ใส่ `reference_no` เก็บเลขอ้างอิงสลิปได้
- ชำระครบแล้วบิลเปลี่ยนเป็น `PAID` และโต๊ะกลับเป็น `FREE` อัตโนมัติ
- รองรับการชำระแบ่งหลายครั้ง — บิลจะปิดเมื่อยอดคงเหลือเป็นศูนย์

`qr_payload` ที่คืนมาเป็นสตริงมาตรฐาน EMVCo นำไป render เป็นภาพ QR ได้ทันที
(ฝั่งหน้าเว็บใช้ไลบรารี `qrcode` แปลงเป็นรูป)

---

## 7. คลังวัตถุดิบ

| Method | Path | คำอธิบาย |
|---|---|---|
| POST | `/stock/in` | บันทึกการรับเข้าวัตถุดิบ (Stock In) |
| POST | `/stock/issue` | บันทึกการเบิกใช้วัตถุดิบ |
| POST | `/stock/adjust` | ปรับยอดให้ตรงกับที่นับได้จริง *(OWNER)* |
| GET | `/stock/low` | **วัตถุดิบใกล้หมด / หมด (Low Stock Alert)** |
| GET | `/stock/movements` | ประวัติการเคลื่อนไหว · `?type=` `?ingredient_id=` `?from=` `?to=` |
| GET | `/stock/docs` | เอกสารรับเข้า/เบิกใช้ · `?type=IN\|ISSUE` |
| GET | `/stock/docs/:id` | เอกสาร 1 ใบพร้อมรายการ |

```http
POST /api/stock/in
{
  "supplier": "ตลาดสดเทศบาลกาญจนบุรี",
  "lines": [
    { "ingredient_sku": "ING-M01", "qty": 20, "unit_cost": 150 },
    { "ingredient_sku": "ING-V01", "qty": 15, "unit_cost": 30 }
  ]
}
```

การรับเข้าจะอัปเดต `cost_per_unit` ของวัตถุดิบเป็นต้นทุนล่าสุดด้วย

---

## 8. รายงาน

| Method | Path | คำอธิบาย |
|---|---|---|
| GET | `/reports/dashboard` | สรุปภาพรวม: ยอดขายวันนี้/เดือนนี้ สถานะโต๊ะ วัตถุดิบใกล้หมด เมนูขายดี 5 อันดับ |
| GET | `/reports/sales` | ยอดขาย · `?group=day\|week\|month` `?from=` `?to=` |
| GET | `/reports/top-menu` | อันดับเมนูขายดี · `?limit=` `?category=` |
| GET | `/reports/stock` | วัตถุดิบคงเหลือ · `?grp=` `?only_low=true` |
| GET | `/reports/stock-movements` | การรับเข้าและเบิกใช้ · `?type=` |
| GET | `/reports/bills` | บิลขายรายใบ |
| GET | `/reports/payment-methods` | สัดส่วนช่องทางการชำระเงิน |

ทุกรายงานเติม **`?format=csv`** เพื่อดาวน์โหลดไฟล์เปิดใน MS-Excel
(ไฟล์นำหน้าด้วย UTF-8 BOM หัวตารางเป็นภาษาไทย)

ถ้าไม่ระบุ `from`/`to` ระบบจะใช้ **วันนี้** ตามเวลาไทยเป็นค่าเริ่มต้น

---

## 9. ฝั่งลูกค้า (ไม่ต้องล็อกอิน)

| Method | Path | คำอธิบาย |
|---|---|---|
| GET | `/public/menu` | เมนูที่เปิดขาย พร้อมธง `sold_out` เมื่อวัตถุดิบไม่พอ |
| GET | `/public/tables/:tableNo` | ตรวจรหัสโต๊ะ + สรุปย่อของบิลที่เปิดอยู่ |
| POST | `/public/tables/:tableNo/order` | ลูกค้าสั่งอาหารเอง |
| GET | `/public/tables/:tableNo/bill` | สรุปรายการและยอดเงินของโต๊ะ |
| POST | `/public/tables/:tableNo/bill` | ลูกค้ากดเช็คบิล แล้วไปชำระที่เคาน์เตอร์ |

**พนักงานต้องเปิดโต๊ะก่อน** (`POST /orders`) ระบบจะสุ่ม `access_code` 4 หลักให้บิลนั้น
ทุกปลายทางยกเว้น `/public/menu` ต้องแนบรหัสนี้มาใน header

```
X-Table-Code: 1234
```

รหัสใช้ได้เฉพาะตอนบิลยังเปิดอยู่ พอชำระเงินหรือยกเลิกบิลแล้วรหัสเดิมจะใช้ไม่ได้ทันที
ถ้ามีปัญหา ระบบตอบกลับพร้อม `details.reason`:

| reason | status | ความหมาย |
|---|---|---|
| `TABLE_NOT_OPEN` | 404 | โต๊ะยังไม่ได้เปิด หรือบิลปิดไปแล้ว |
| `CODE_REQUIRED` | 403 | ไม่ได้ส่งรหัสโต๊ะ |
| `CODE_INVALID` | 403 | รหัสโต๊ะไม่ถูกต้อง |
| `TOO_MANY_TRIES` | 429 | กรอกรหัสผิดเกิน 10 ครั้งใน 10 นาที |

เมื่อโต๊ะเช็คบิลแล้วลูกค้าจะสั่งเพิ่มเองไม่ได้ (ต้องแจ้งพนักงาน)

---

## 10. ตั้งค่าระบบ

| Method | Path | คำอธิบาย |
|---|---|---|
| GET | `/api/health` | ตรวจว่า API และฐานข้อมูลพร้อมใช้งาน (ไม่ต้องล็อกอิน) |
| GET | `/api/settings` | ค่าตั้งค่าร้านทั้งหมด |
| PATCH | `/api/settings` | แก้ค่าตั้งค่า *(OWNER)* |

ค่าที่ตั้งได้: `shop_name` `shop_branch` `shop_address` `shop_phone` `shop_taxid`
`vat_rate` `vat_included` `service_rate` `promptpay_id` `low_stock_alert`
`customer_base_url` (ที่อยู่เว็บที่มือถือลูกค้าเปิดได้ ใช้สร้าง QR)

> ค่าเริ่มต้น `vat_rate = 0` (ไม่คิด VAT) ถ้าร้านจดทะเบียน VAT ให้ตั้งเป็น `7`
> และกำหนด `vat_included` ว่าราคาที่ตั้งไว้รวม VAT แล้วหรือยัง
