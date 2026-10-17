/**
 * รัน API server กับชุดทดสอบใน process เดียว เพื่อให้ c8 วัด coverage ของโค้ด backend ได้
 *   npm run test:coverage   (ต้องมีฐานข้อมูลที่ migrate แล้ว — ใช้ฐานข้อมูลทดสอบ อย่าใช้ของร้านจริง)
 */
process.env.PORT ||= '4100';
process.env.API_BASE ||= `http://localhost:${process.env.PORT}/api`;
process.env.JWT_SECRET ||= 'coverage-test-only-secret';

await import('../src/server.js');

for (let i = 0; i < 50; i++) {
  try {
    if ((await fetch(`${process.env.API_BASE}/health`)).ok) break;
  } catch { /* server ยังไม่พร้อม */ }
  await new Promise((r) => setTimeout(r, 200));
}

await import('./api.test.mjs');
