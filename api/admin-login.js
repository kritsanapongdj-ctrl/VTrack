import process from 'node:process';
import { Buffer } from 'node:buffer';
import { timingSafeEqual } from 'node:crypto';

// ตรวจรหัสแอดมินฝั่งเซิร์ฟเวอร์ (รหัสอยู่ใน env ADMIN_PIN ไม่ส่งไปกับโค้ดเบราว์เซอร์)
// shortcut: ยังไม่จำกัดจำนวนครั้งที่ลองรหัส และไม่ออก token ให้ Firestore, ถ้าต้องกันการเขียนฐานข้อมูลตรงๆ ให้เพิ่ม custom token + Firestore rules
export default function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  const expected = process.env.ADMIN_PIN;
  if (!expected) return res.status(500).json({ ok: false, error: 'not-configured' });

  const given = String(req.body?.pin ?? '');
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  const ok = a.length === b.length && timingSafeEqual(a, b);
  return res.status(ok ? 200 : 401).json({ ok });
}
