import { api } from './api';

export const isLocalHost = (url) => /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(url);

const withPort = (host) => {
  const port = location.port ? ':' + location.port : '';
  return `${location.protocol}//${host}${port}`;
};

/** ที่อยู่ตั้งต้น: ค่าที่บันทึกไว้ > ที่อยู่ที่เปิดอยู่ (ถ้าไม่ใช่ localhost) > IP ของเครื่องในวง LAN */
export function defaultBase(saved, lan) {
  if (saved) return saved;
  if (!isLocalHost(location.origin)) return location.origin;
  if (lan.length) return withPort(lan[0]);
  return location.origin;
}

export const lanUrl = withPort;

/**
 * ที่อยู่เว็บที่มือถือลูกค้าเปิดได้ ใช้สร้าง QR
 * ถามเซิร์ฟเวอร์ใหม่ทุกครั้ง ไม่จำไว้ในหน้าเว็บ เพราะลิงก์ tunnel เปลี่ยนได้ระหว่างที่หน้าร้านเปิดค้างไว้
 */
export async function getCustomerBase() {
  return (await getQrInfo()).base;
}

/** ที่อยู่ที่ใช้อยู่ + ค่าที่บันทึกไว้ + IP ของเครื่องในวง LAN (ใช้ในช่องตั้งค่าที่อยู่เว็บ) */
export async function getQrInfo() {
  const r = await api.get('/tables/qr-info');
  const lan = r.data.lan_addresses || [];
  let base = defaultBase(r.data.customer_base_url, lan);
  while (base.endsWith('/')) base = base.slice(0, -1);
  return { base, saved: r.data.customer_base_url, lan };
}

/** ลิงก์หน้าสั่งอาหารของโต๊ะ ถ้าใส่รหัสมาด้วย ลูกค้าสแกนแล้วเข้าได้เลยไม่ต้องกรอก */
export const customerUrl = (base, tableNo, code) => {
  const query = code ? '?code=' + encodeURIComponent(code) : '';
  return `${base}/customer/${encodeURIComponent(tableNo)}${query}`;
};
