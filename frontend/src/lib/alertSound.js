/**
 * เสียงเตือนออเดอร์ใหม่ — สร้างเสียงด้วย Web Audio ไม่ต้องใช้ไฟล์เสียง
 *
 * เบราว์เซอร์ไม่ยอมเล่นเสียงจนกว่าผู้ใช้จะแตะหน้าเว็บสักครั้ง
 * จึงปลดล็อกเสียงให้อัตโนมัติเมื่อมีการแตะ/คลิกครั้งแรก
 */
let ctx = null;

function audio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  return ctx;
}

/** ต้องเรียกจากการแตะ/คลิกของผู้ใช้ เบราว์เซอร์ถึงจะยอมให้เล่นเสียง */
export function unlockSound() {
  const a = audio();
  return a?.state === 'suspended' ? a.resume().catch(() => {}) : Promise.resolve();
}

window.addEventListener('pointerdown', () => unlockSound(), { once: true });

/** เบราว์เซอร์ยังไม่อนุญาตให้เล่นเสียง (ยังไม่มีใครแตะหน้าเว็บ) */
export const soundLocked = () => ctx?.state !== 'running';

// สวิตช์เปิด/ปิดเสียงเตือน จำไว้ในเครื่อง (ค่าเริ่มต้น = เปิด)
const ENABLED_KEY = 'alert_sound';
export function soundEnabled() {
  try { return localStorage.getItem(ENABLED_KEY) !== 'off'; } catch { return true; }
}
export function setSoundEnabled(on) {
  try { localStorage.setItem(ENABLED_KEY, on ? 'on' : 'off'); } catch { /* ไม่เป็นไร */ }
}

/** เสียง "ติ๊ง-ต่อง" สองจังหวะ (ไม่ดังถ้าปิดสวิตช์ไว้) */
export function playAlert({ force = false } = {}) {
  if (!force && !soundEnabled()) return;
  const a = audio();
  if (a?.state !== 'running') return;

  const tone = (freq, start, dur) => {
    const osc = a.createOscillator();
    const gain = a.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, a.currentTime + start);
    gain.gain.exponentialRampToValueAtTime(0.35, a.currentTime + start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + start + dur);
    osc.connect(gain).connect(a.destination);
    osc.start(a.currentTime + start);
    osc.stop(a.currentTime + start + dur + 0.05);
  };
  tone(880, 0, 0.22);
  tone(1320, 0.2, 0.32);
}
