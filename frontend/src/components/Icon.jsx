/**
 * ชุดไอคอนเส้นของระบบ (SVG ในตัว ไม่ต้องโหลดไฟล์/ฟอนต์เพิ่ม)
 * เส้นหนาเท่ากันทุกตัว ใช้สีตามตัวอักษรรอบข้าง (currentColor)
 * ใช้: <Icon name="floor" />
 */
const PATHS = {
  // ผังร้าน: ตารางโต๊ะ 4 ช่อง
  floor: (
    <>
      <rect x="3" y="3" width="7.5" height="7.5" rx="1.5" />
      <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" />
      <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" />
    </>
  ),
  // หน้าจอครัว: หมวกเชฟ
  kitchen: (
    <>
      <path d="M7 14.5a4 4 0 0 1-.9-7.9 6 6 0 0 1 11.8 0 4 4 0 0 1-.9 7.9" />
      <path d="M7 14.5V20a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-5.5" />
      <path d="M7 17.5h10" />
    </>
  ),
  // บิลทั้งหมด: ใบเสร็จขอบหยัก
  receipt: (
    <>
      <path d="M5 3h14v18l-2.3-1.5L14.3 21 12 19.5 9.7 21l-2.4-1.5L5 21z" />
      <path d="M9 8h6M9 12h6M9 16h3" />
    </>
  ),
  // คลังวัตถุดิบ: กล่องพัสดุ
  stock: (
    <>
      <path d="M21 8 12 3 3 8v8l9 5 9-5z" />
      <path d="m3 8 9 5 9-5M12 13v8" />
      <path d="m7.5 5.5 9 5" />
    </>
  ),
  // จัดการเมนู: ช้อนส้อม
  menu: (
    <>
      <path d="M6 3v7a2 2 0 0 0 2 2 2 2 0 0 0 2-2V3M8 3v18" />
      <path d="M17 21V3c-2.2 0-4 2.5-4 6v4h4" />
    </>
  ),
  // รายงาน: กราฟแท่ง
  report: (
    <>
      <path d="M3 3v16a2 2 0 0 0 2 2h16" />
      <path d="M8 17v-4M12.5 17V8M17 17v-6" />
    </>
  ),
  // QR Code
  qr: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <path d="M14 14h3v3h-3zM20 14v.01M17 20h4M20 17v3M14 20v1" />
    </>
  ),
  // หน้าลูกค้า: มือถือ
  phone: (
    <>
      <rect x="6" y="2.5" width="12" height="19" rx="2.5" />
      <path d="M11 18h2" />
    </>
  ),
  // ไอคอนหมวดเมนู (ใช้แทนรูปเมื่อเมนูยังไม่มีรูป)
  // หมูกระทะ: กระทะทรงโดมบนเตา
  grill: (
    <>
      <path d="M4 12a8 8 0 0 1 16 0z" />
      <path d="M8 9.5h8M9.5 7h5" />
      <path d="M3 12h18M7 12l-1.5 8M17 12l1.5 8M9 16h6" />
    </>
  ),
  // อาหารทานเล่น: เฟรนช์ฟรายส์ในกล่อง
  snack: (
    <>
      <path d="M5.5 10h13l-1.6 10.2a1 1 0 0 1-1 .8H8.1a1 1 0 0 1-1-.8z" />
      <path d="M8 10 7 4M11 10V3M14 10l.5-6M17 10l1-5" />
    </>
  ),
  // เครื่องดื่ม: แก้วมีหลอด
  drink: (
    <>
      <path d="M5 7h14l-1.6 13.1a1 1 0 0 1-1 .9H7.6a1 1 0 0 1-1-.9z" />
      <path d="M13 7l2-4h3M6 12h12" />
    </>
  ),
  // น้ำแข็ง: ก้อนน้ำแข็ง
  ice: (
    <>
      <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z" />
      <path d="m4 7.5 8 4.5 8-4.5M12 12v9" />
      <path d="M8 8.2l2 1.1" />
    </>
  ),
  // โหมดสว่าง / มืด
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  moon: <path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11z" />,
  'chevrons-left': <path d="m11 17-5-5 5-5M18 17l-5-5 5-5" />,
  'chevrons-right': <path d="m6 17 5-5-5-5M13 17l5-5-5-5" />,
};

export default function Icon({ name, size = 18, className = 'icon', ...rest }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true" focusable="false" {...rest}>
      {PATHS[name]}
    </svg>
  );
}
