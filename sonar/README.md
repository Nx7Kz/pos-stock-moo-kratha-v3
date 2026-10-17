# ตรวจคุณภาพโค้ดด้วย SonarQube

SonarQube อ่านโค้ดทั้งโปรเจกต์ (backend + frontend) แล้วรายงาน Bugs, Vulnerabilities, Security Hotspots,
Code Smells และโค้ดซ้ำ พร้อมเกรด A–E — รันในเครื่องผ่าน Docker แยกจากระบบร้านทั้งหมด

| ไฟล์ | หน้าที่ |
|---|---|
| `docker-compose.yml` | SonarQube server + ฐานข้อมูลของ SonarQube เอง (พอร์ต 9000) |
| `../sonar-project.properties` | ตั้งค่าการตรวจ: โฟลเดอร์ที่ตรวจ / ไฟล์ที่ข้าม |
| `sonar_scan.py` | ตั้งค่าครั้งแรกให้อัตโนมัติ + รัน scanner + สรุปผลบนหน้าจอ |
| `sonar_report.py` | ดึงผลตรวจผ่าน Web API แล้วสร้างรายงาน PDF ภาษาไทย |
| `webhook-sample.json` | ตัวอย่าง JSON ที่ SonarQube ส่งออกทาง webhook เมื่อตรวจเสร็จ (Quality Gate ผ่าน/ไม่ผ่าน) |
| `reports/` | รายงาน PDF ที่สร้างแล้ว |
| `.env` | รหัส admin + token ของ SonarQube (สร้างอัตโนมัติ **ไม่ขึ้น git**) |

## วิธีใช้

ต้องมี Docker Desktop และ Python 3 (ไม่ต้อง pip install อะไร)

```bash
# 1. เปิด SonarQube (ครั้งแรกดาวน์โหลด ~1 GB และรอ 1–2 นาที)
docker compose -f sonar/docker-compose.yml up -d

# 2. วัด coverage ของ back end ก่อนทุกครั้ง (ใช้ฐานข้อมูลทดสอบ ห้ามใช้ของร้าน — ดู README หลัก หัวข้อ "การทดสอบ")
#    ไม่วัดใหม่ = SonarQube ใช้รายงานเก่า และ Quality Gate อาจไม่ผ่าน
cd backend && PGDATABASE=pos_stock_test npm run test:coverage && cd ..

# 3. ตรวจโค้ด (ครั้งแรกจะเปลี่ยนรหัส admin, สร้างโปรเจกต์และ token ให้เอง)
#    บน Windows ต้องตั้ง PYTHONUTF8=1 ไม่งั้นพิมพ์ข้อความภาษาไทยไม่ได้
PYTHONUTF8=1 python sonar/sonar_scan.py

# 4. สร้างรายงาน PDF -> sonar/reports/sonar-report-<วันที่>.pdf
PYTHONUTF8=1 python sonar/sonar_report.py

# 5. ใช้เสร็จแล้วปิด (ผลตรวจยังอยู่)
docker compose -f sonar/docker-compose.yml stop
```

ดูผลละเอียดบนเว็บ: http://localhost:9000/dashboard?id=pos-stock-moo-kratha
(ล็อกอิน `admin` รหัสผ่านอยู่ใน `sonar/.env` บรรทัด `SONAR_ADMIN_PASSWORD`)

## Webhook

ให้ SonarQube ส่งผลตรวจ (JSON แบบ `webhook-sample.json`) ไปยังระบบอื่นทุกครั้งที่ตรวจเสร็จ เช่น แจ้งเตือนทีม:

```bash
SONAR_WEBHOOK_URL=https://example.com/sonar-hook python sonar/sonar_scan.py
```

URL ที่อยู่ในเครื่องเดียวกันให้ใช้ `http://host.docker.internal:<พอร์ต>/...` (SonarQube รันใน Docker)

## หมายเหตุ

- ใช้ RAM ประมาณ 2–3 GB ตอนเปิด
- **Coverage** วัดเฉพาะ `backend/src` จากชุดทดสอบ API (`npm run test:coverage` ด้วย c8 → `backend/coverage/lcov.info`)
  ส่วน `frontend/` และ `backend/scripts/` ยังไม่มีชุดทดสอบอัตโนมัติ จึงตั้งไม่นับ coverage ไว้ใน `sonar-project.properties`
  (ยังตรวจ bug / vulnerability / code smell ตามปกติ) — Quality Gate ต้องการ coverage ของโค้ดใหม่ ≥ 80%
- ข้อยกเว้นที่ตั้งไว้ใน `sonar-project.properties`: กฎ "ไม่มี test" ของ `api.test.mjs` (เป็นสคริปต์ทดสอบที่เขียนเอง)
  และกฎ contrast สีใน `styles.css` (ตัวอักษรขาวบนพื้นโปร่งแสงที่ซ้อนบนสีเข้ม ตัวตรวจคำนวณพื้นหลังผิด)
- ถ้าลบ volume ของ SonarQube (`docker compose -f sonar/docker-compose.yml down -v`) ให้ลบ `sonar/.env` ด้วย แล้วรัน `sonar_scan.py` ใหม่
- กลับกัน ถ้า `sonar/.env` หาย แต่ volume ยังอยู่ สคริปต์จะล็อกอินไม่ได้ (HTTP 401 เพราะรหัส admin ถูกเปลี่ยนไปแล้ว)
  ให้ `down -v` ล้าง SonarQube แล้วเริ่มใหม่ (ประวัติผลตรวจเก่าหาย แต่ไม่กระทบโค้ดหรือข้อมูลร้าน)
