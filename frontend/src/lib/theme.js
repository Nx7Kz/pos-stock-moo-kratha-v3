/**
 * โหมดสว่าง / มืด
 * ยังไม่เคยเลือก = ตามการตั้งค่าของเครื่อง, กดเลือกแล้วจำไว้ในเครื่อง
 * (index.html ใส่ data-theme ให้ก่อนหน้าเว็บแสดง จะได้ไม่กะพริบขาวตอนเปิด)
 */
const KEY = 'theme';
const media = () => window.matchMedia?.('(prefers-color-scheme: dark)');

export function currentTheme() {
  const set = document.documentElement.dataset.theme;
  if (set === 'dark' || set === 'light') return set;
  return media()?.matches ? 'dark' : 'light';
}

export function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem(KEY, theme); } catch { /* ไม่เป็นไร */ }
}

/** เรียก cb เมื่อธีมของเครื่องเปลี่ยน (กรณียังไม่ได้เลือกเอง) */
export function onSystemThemeChange(cb) {
  const m = media();
  if (!m) return () => {};
  m.addEventListener('change', cb);
  return () => m.removeEventListener('change', cb);
}
