# ระบบประทับตราและลงลายมือชื่อดิจิทัล (Digital Signature & PDF Stamping Upgrade) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ยกระดับระบบประทับลายเซ็นต์และตรวจรับใบเสนอราคาบนเอกสาร PDF ใน V-Track ให้เป็นไปตามมาตรฐานสากล โดยใช้แนวทางจากสกิล `pdf`, `pdftk-server`, และ `esign-field-placement` รองรับการระบุชื่อ/ตำแหน่งผู้ลงนาม, ตราประทับดิจิทัล LH V-Track, เลือกตำแหน่งวางพิกัด (Bottom-Right, Bottom-Left, Top-Right), เลือกหน้า (หน้าสุดท้าย, หน้าแรก, ทุกหน้า) และรองรับภาษาไทยคมชัด 100% ผ่าน High-DPI Composite Stamp Badge

**Architecture:** 
- แยก Logic การสร้าง Stamp Badge และการประทับตรา PDF ออกเป็นโมดูลเฉพาะ `src/utils/pdfStamper.js` เพื่อความเป็นสัดส่วนและทดสอบได้ง่าย
- ใช้ HTML5 Canvas เรนเดอร์บัตรรับรองลายเซ็นและตราประทับดิจิทัลความละเอียดสูง (2x Retina Scale) ทำให้ข้อความภาษาไทย (ชื่อ, ตำแหน่ง, วันที่, เลขที่ใบงาน) คมชัดสมบูรณ์แบบโดยไม่ต้องพึ่งฟอนต์ภายนอกใน `pdf-lib` ที่ไม่รองรับภาษาไทย
- ใช้ `pdf-lib` ในการคำนวณพิกัดตามมาตรฐาน `esign-field-placement` ฝังภาพลายเซ็นและตราประทับลงในเอกสาร PDF และ Flatten บันทึกลงระบบไฟล์ของ V-Track
- ปรับปรุง UI ของ `SignaturePadModal` ใน `src/VTrackApp.jsx` ให้มี Live Badge Preview, ฟิลด์กรอกชื่อ/ตำแหน่ง, ตัวเลือกตราประทับ และตัวเลือกพิกัดตำแหน่งวาง

**Tech Stack:** React 19, pdf-lib, HTML5 Canvas API, Tailwind CSS, Lucide Icons, Vite

**Spec:** อ้างอิงคำแนะนำและข้อกำหนดจากสกิล:
- `.agents/skills/pdf/SKILL.md` (PDF manipulation, image embedding, flattening)
- `.agents/skills/pdftk-server/SKILL.md` (Foreground stamp overlaying, attachment preservation)
- `.agents/skills/esign-field-placement/SKILL.md` (Deterministic coordinate calculation & field placement)

---

## Global Constraints
- ต้องไม่กระทบการทำงานเดิมของระบบอัปโหลดใบเสนอราคาและการเซ็นต์อนุมัติ (Backward Compatible)
- ไฟล์ PDF ที่ประทับตราเสร็จต้องมีขนาดเหมาะสม เปิดอ่านได้บนทุกอุปกรณ์ และมีตราประทับพร้อมลายเซ็นต์ที่คมชัด ไม่บิดเบี้ยว
- ข้อความภาษาไทย เช่น "อนุมัติใบเสนอราคา", "ผู้ตรวจรับ", "วันที่ลงนาม" ต้องแสดงผลถูกต้อง วรรณยุกต์ไม่ลอยหรือเพี้ยน
- คำสั่ง Build ต้องผ่าน `npm.cmd run build` โดยไม่มีข้อผิดพลาด

## Review Focus
1. PDF ที่มีหลายหน้า หรือขนาดหน้าต่างจาก A4 มาตรฐาน (เช่น แนวนอน / Landscape) ต้องคำนวณตำแหน่งไม่ให้ตราประทับล้นออกนอกขอบกระดาษ
2. ผู้ใช้งานวาดลายเซ็นต์ด้วยสไตลัส/นิ้วมือ หรืออัปโหลดไฟล์ภาพลายเซ็นต์ PNG/JPG ต้องได้ผลลัพธ์ที่ตัดพื้นหลังและวางในกล่องตราประทับอย่างสวยงาม
3. การกรอกชื่อผู้ตรวจรับและตำแหน่งภาษาไทย ต้องแสดงผลใน Live Preview ทันที
4. การเลือกตำแหน่ง (ขวาล่าง, ซ้ายล่าง, ขวาบน) ต้องสะท้อนลงบนหน้า PDF ตรงจุดที่เลือก
5. การบันทึกและอัปเดตสถานะใบงานใน Firestore และ Local Storage ต้องดำเนินต่อไปได้อย่างราบรื่น

---

### Task 1: สร้างโมดูล `src/utils/pdfStamper.js` สำหรับจัดการ Stamp Badge และพิกัดตำแหน่ง PDF
**Files:**
- Create: `src/utils/pdfStamper.js`
- Test: ทดสอบการทำงานของฟังก์ชันคำนวณพิกัดและการสร้างรูปตราประทับ

**Steps:**
- [x] 1. สร้างไฟล์ `src/utils/pdfStamper.js`
- [x] 2. พัฒนาฟังก์ชัน `calculateStampCoordinates(pageWidth, pageHeight, stampWidth, stampHeight, placement, margin)` ตามมาตรฐาน `esign-field-placement` (รองรับ 'bottom-right', 'bottom-left', 'top-right')
- [x] 3. พัฒนาฟังก์ชัน `generateStampBadgePng({ signatureDataUrl, signerName, signerRole, taskNo, company, dateStr, includeSeal })` โดยใช้ Offscreen Canvas เรนเดอร์การ์ดตราประทับ LH Corporate Approval พร้อมตราประทับวงกลม LH V-Track และลายเซ็นต์ความละเอียดสูง (2x Scale)
- [x] 4. พัฒนาฟังก์ชัน `stampSignatureOnPdfAdvanced(pdfBytesOrDataUrl, stampConfig)` โหลดเอกสารผ่าน `pdf-lib`, คำนวณหน้าเป้าหมาย (`last`, `first`, `all`), วางรูปตราประทับ และส่งคืน PDF bytes ที่สมบูรณ์
- [x] 5. ตรวจสอบ syntax และ export ฟังก์ชันให้พร้อมใช้งาน

---

### Task 2: ปรับปรุง `SignaturePadModal` ใน `src/VTrackApp.jsx` ให้รองรับการตั้งค่าตำแหน่ง, ข้อมูลผู้ลงนาม และ Live Preview
**Files:**
- Modify: `src/VTrackApp.jsx` (ส่วน `SignaturePadModal` และ `handleConfirmSign`)

**Steps:**
- [x] 1. เพิ่ม State ใน `SignaturePadModal` สำหรับ:
  - `signerName`: ชื่อผู้ลงนาม (ค่าเริ่มต้น: 'เจ้าหน้าที่โครงการ' หรือจากผู้ใช้ที่ล็อกอิน)
  - `signerRole`: ตำแหน่ง (ค่าเริ่มต้น: 'ผู้ตรวจรับงาน / วิศวกรโครงการ')
  - `includeSeal`: เปิด/ปิด ตราประทับดิจิทัล (ค่าเริ่มต้น: true)
  - `placement`: ตำแหน่งวาง ('bottom-right', 'bottom-left', 'top-right')
  - `targetPages`: หน้าที่ต้องการประทับ ('last', 'first', 'all')
- [x] 2. เพิ่มส่วน **Live Badge Preview** ในหน้าต่าง Modal แสดงตัวอย่างตราประทับที่จะลงบน PDF แบบเรียลไทม์
- [x] 3. เพิ่มตัวเลือกตั้งค่า (Signer Info & Placement Options) ใน UI ของ Modal ด้วยดีไซน์ที่เรียบหรูตาม LH Design Guidelines
- [x] 4. ปรับฟังก์ชันส่งข้อมูลยืนยัน ให้ส่งทั้งภาพลายเซ็นต์และอ็อบเจ็กต์การตั้งค่าตราประทับไปยัง `handleConfirmSign`

---

### Task 3: เชื่อมต่อ `handleConfirmSign` กับ `stampSignatureOnPdfAdvanced`
**Files:**
- Modify: `src/VTrackApp.jsx` (ส่วน `handleConfirmSign` และนำเข้า `pdfStamper.js`)

**Steps:**
- [x] 1. อัปเดต `handleConfirmSign` ให้รับพารามิเตอร์ `(task, stampOptions)`
- [x] 2. เรียกใช้ `stampSignatureOnPdfAdvanced` แทนของเดิม พร้อมส่งข้อมูล task (เลขที่ใบงาน, ผู้รับเหมา), ข้อมูลผู้ลงนาม, ตราประทับ และตำแหน่งพิกัด
- [x] 3. เก็บข้อมูลชื่อผู้ลงนามและตำแหน่งลงใน `task.timeline` และ `task.signedBy` เพื่อใช้สำหรับ Audit Trail
- [x] 4. ตรวจสอบว่าไฟล์ที่ได้ถูกบันทึกลง IndexedDB / Firestore Storage อย่างถูกต้อง

---

### Task 4: ตรวจสอบและทดสอบระบบทั้งหมด (Verification & Build)
**Files:**
- Run Verification: Build & Type/Lint checking

**Steps:**
- [x] 1. รัน `npm.cmd run build` ตรวจสอบว่า Bundle สำเร็จไม่มีข้อผิดพลาด
- [x] 2. ตรวจสอบการเปิด Modal เซ็นต์เอกสารใน UI ทั้งโหมดสไตลัส/วาดมือ และโหมดอัปโหลดไฟล์ภาพ
- [x] 3. ตรวจสอบการพรีวิวตราประทับและข้อความภาษาไทย
- [x] 4. ยืนยันผลลัพธ์และสรุปส่งมอบให้ผู้ใช้งาน

