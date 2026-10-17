/**
 * สั่งพิมพ์ "ใบ" ใบเดียวจากหน้าจอ (ใบ QR โต๊ะ / ใบเช็คบิล) ลงเครื่องพิมพ์สลิปความร้อน
 *
 * วิธีทำ: ก๊อปโหนดที่จะพิมพ์ออกมาวางนอก #root แล้วซ่อนแอปทั้งตัวด้วย display:none
 * (ซ่อนด้วย visibility เฉย ๆ ไม่พอ เนื้อหายังกินพื้นที่ จะได้กระดาษเปล่าตามมาอีกแผ่น)
 * สไตล์ตอนพิมพ์อยู่ใน styles.css ที่บล็อก @media print
 */

/**
 * ขนาดกระดาษ — ตั้งให้ตรงกับที่ไดรเวอร์เครื่องพิมพ์มีจริง ไม่งั้นเบราว์เซอร์จะเดาขนาดใกล้เคียงให้เอง
 * EASY PRINT ES-8803 (ไดรเวอร์ POSPrinter POS-80) ใช้ "80(72)mm x 210 mm" — ม้วน 58mm ใช้ { w: 58, h: 210 }
 * ต้องระบุทั้งกว้างและสูง CSS ไม่รับ `size: 80mm auto` (ผิดสเปก เบราว์เซอร์จะทิ้งทั้งบรรทัดแล้วกลับไปใช้ A4)
 */
export const SLIP_MM = { w: 80, h: 210 };

/**
 * รอให้ QR กับบาร์โค้ดวาดเสร็จก่อน
 * ทั้งคู่สร้างรูปแบบ async ถ้าสั่งพิมพ์เร็วไปจะก๊อปไปตอนยังเป็นช่องว่าง ได้ใบที่ไม่มี QR
 */
function waitForImages(node, timeoutMs = 3000) {
  const ready = () =>
    !node.querySelector('.empty') &&
    [...node.querySelectorAll('img')].every((img) => img.complete && img.naturalWidth > 0);

  return new Promise((resolve) => {
    const deadline = Date.now() + timeoutMs;
    const tick = () => {
      // หมดเวลาแล้วก็พิมพ์ไปตามที่มี ดีกว่าค้างไม่ยอมพิมพ์
      if (ready() || Date.now() > deadline) return resolve();
      setTimeout(tick, 100);
    };
    tick();
  });
}

/** ก๊อป node ไปพิมพ์เป็นใบเดี่ยว ๆ แล้วเก็บกวาดให้เรียบร้อยเมื่อพิมพ์เสร็จหรือกดยกเลิก */
export async function printSlipNode(node) {
  if (!node) return;
  await waitForImages(node);

  const holder = document.createElement('div');
  holder.id = 'print-slip-holder';
  holder.appendChild(node.cloneNode(true));

  const page = document.createElement('style');
  page.textContent = `@page { size: ${SLIP_MM.w}mm ${SLIP_MM.h}mm; margin: 4mm; }`;

  document.body.append(holder, page);
  document.body.classList.add('print-slip');

  const done = () => {
    document.body.classList.remove('print-slip');
    holder.remove();
    page.remove();
    window.removeEventListener('afterprint', done);
  };
  window.addEventListener('afterprint', done);
  window.print();
}
