/**
 * ย่อรูปในเบราว์เซอร์ก่อนอัปโหลด (รูปจากมือถือมักใหญ่หลาย MB)
 * คืนค่าเป็น data URL แบบ JPEG ด้านยาวไม่เกิน maxSide
 */
export function resizeImage(file, maxSide = 900, quality = 0.82) {
  return new Promise((resolve, reject) => {
    if (!file?.type?.startsWith('image/')) return reject(new Error('กรุณาเลือกไฟล์รูปภาพ'));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';   // รูป PNG พื้นใส -> พื้นขาว
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('เปิดไฟล์รูปนี้ไม่ได้')); };
    img.src = url;
  });
}
