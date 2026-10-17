import { useState, useEffect } from 'react';
import { playAlert, soundEnabled, setSoundEnabled, soundLocked, unlockSound } from '../lib/alertSound';

/** สวิตช์เปิด/ปิดเสียงเตือนออเดอร์ใหม่ */
export default function SoundSwitch() {
  const [on, setOn] = useState(soundEnabled);
  const [locked, setLocked] = useState(soundLocked);

  // เบราว์เซอร์ปลดล็อกเสียงเมื่อแตะหน้าจอครั้งแรก -> อัปเดตสถานะให้ตรง
  useEffect(() => {
    if (!locked) return;
    const id = setInterval(() => setLocked(soundLocked()), 1000);
    return () => clearInterval(id);
  }, [locked]);

  function toggle() {
    const next = !on;
    setOn(next);
    setSoundEnabled(next);
    // เปิดแล้วเล่นเสียงให้ฟังหนึ่งครั้ง จะได้รู้ว่าลำโพงดังจริง
    if (next) unlockSound().then(() => { setLocked(soundLocked()); playAlert({ force: true }); });
  }

  const waiting = on && locked;   // เปิดไว้แล้ว แต่เบราว์เซอร์ยังรอให้แตะหน้าจอก่อน
  let title = on ? 'กดเพื่อปิดเสียงเตือน' : 'กดเพื่อเปิดเสียงเตือน';
  let state = on ? 'เปิด' : 'ปิด';
  if (waiting) {
    title = 'แตะหน้าจอหนึ่งครั้งเพื่อให้เสียงเริ่มทำงาน';
    state = 'แตะเพื่อเริ่ม';
  }
  return (
    <button type="button" role="switch" aria-checked={on} onClick={toggle}
      className={`sound-switch${on ? ' on' : ''}${waiting ? ' waiting' : ''}`}
      title={title}>
      <span className="ss-label">{on ? '🔔' : '🔕'} เสียงเตือน</span>
      <span className="ss-track"><span className="ss-knob" /></span>
      <span className="ss-state">{state}</span>
    </button>
  );
}
