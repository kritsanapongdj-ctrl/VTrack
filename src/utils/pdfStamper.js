import { PDFDocument } from 'pdf-lib';

/**
 * คำนวณพิกัดสำหรับวางตราประทับตามแนวทาง esign-field-placement
 * @param {number} pageWidth - ความกว้างหน้าเอกสาร (Points)
 * @param {number} pageHeight - ความสูงหน้าเอกสาร (Points)
 * @param {number} stampW - ความกว้างของตราประทับ (Points)
 * @param {number} stampH - ความสูงของตราประทับ (Points)
 * @param {string} placement - ตำแหน่ง ('bottom-right' | 'bottom-left' | 'top-right' | 'top-left')
 * @param {number} margin - ระยะห่างจากขอบ (Points, ค่าเริ่มต้น 25)
 * @returns {{ x: number, y: number, width: number, height: number }}
 */
export const calculateStampCoordinates = (pageWidth, pageHeight, stampW, stampH, placement = 'bottom-right', margin = 25) => {
  let x = margin;
  let y = margin;

  switch (placement) {
    case 'bottom-left':
      x = margin;
      y = margin;
      break;
    case 'top-right':
      x = Math.max(margin, pageWidth - stampW - margin);
      y = Math.max(margin, pageHeight - stampH - margin);
      break;
    case 'top-left':
      x = margin;
      y = Math.max(margin, pageHeight - stampH - margin);
      break;
    case 'bottom-right':
    default:
      x = Math.max(margin, pageWidth - stampW - margin);
      y = margin;
      break;
  }

  return {
    x: Math.round(x),
    y: Math.round(y),
    width: stampW,
    height: stampH,
  };
};

/**
 * สร้างรูปบัตรรับรองตราประทับและลายเซ็นต์ดิจิทัลความละเอียดสูง (2x Retina) ผ่าน HTML5 Canvas
 * รองรับภาษาไทย 100% พร้อมตราประทับและข้อมูลผู้ลงนาม
 * @param {Object} options
 * @returns {Promise<string>} PNG Data URL
 */
export const generateStampBadgePng = ({
  signatureDataUrl,
  signerName = 'เจ้าหน้าที่โครงการ',
  signerRole = 'ผู้ตรวจรับงาน / วิศวกรโครงการ',
  taskNo = '',
  company = '',
  dateStr = '',
  includeSeal = true,
}) => {
  return new Promise((resolve, reject) => {
    try {
      const width = 640;
      const height = 260;
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        throw new Error('ไม่สามารถสร้าง Canvas Context ได้');
      }

      // Background card with rounded corners
      const radius = 18;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(radius, 0);
      ctx.lineTo(width - radius, 0);
      ctx.quadraticCurveTo(width, 0, width, radius);
      ctx.lineTo(width, height - radius);
      ctx.quadraticCurveTo(width, height, width - radius, height);
      ctx.lineTo(radius, height);
      ctx.quadraticCurveTo(0, height, 0, height - radius);
      ctx.lineTo(0, radius);
      ctx.quadraticCurveTo(0, 0, radius, 0);
      ctx.closePath();
      ctx.clip();

      // Background Fill (Clean corporate gradient)
      const grad = ctx.createLinearGradient(0, 0, width, height);
      grad.addColorStop(0, '#FFFFFF');
      grad.addColorStop(1, '#F8FAFC');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);

      // Top Accent Bar
      ctx.fillStyle = '#1E3A8A'; // Deep Navy
      ctx.fillRect(0, 0, width, 46);

      // Card Outline Border
      ctx.restore();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#1E3A8A';
      ctx.beginPath();
      ctx.moveTo(radius, 0);
      ctx.lineTo(width - radius, 0);
      ctx.quadraticCurveTo(width, 0, width, radius);
      ctx.lineTo(width, height - radius);
      ctx.quadraticCurveTo(width, height, width - radius, height);
      ctx.lineTo(radius, height);
      ctx.quadraticCurveTo(0, height, 0, height - radius);
      ctx.lineTo(0, radius);
      ctx.quadraticCurveTo(0, 0, radius, 0);
      ctx.closePath();
      ctx.stroke();

      // Top Bar Text (Approval Title)
      ctx.font = 'bold 20px "Sarabun", "Prompt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      ctx.fillStyle = '#FFFFFF';
      ctx.textBaseline = 'middle';
      ctx.fillText('✓ อนุมัติใบเสนอราคา (APPROVED QUOTATION)', 20, 23);

      if (taskNo) {
        ctx.font = 'bold 15px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
        ctx.textAlign = 'right';
        ctx.fillStyle = '#BFDBFE';
        ctx.fillText(`JOB: #${taskNo}`, width - 20, 23);
        ctx.textAlign = 'left';
      }

      // Left Column: Metadata Details
      const leftX = 24;
      let textY = 78;
      const lineHeight = 28;

      ctx.font = '14px "Sarabun", "Prompt", sans-serif';
      ctx.fillStyle = '#64748B';
      ctx.fillText('ผู้ตรวจรับ / ผู้ลงนาม:', leftX, textY);
      ctx.font = 'bold 16px "Sarabun", "Prompt", sans-serif';
      ctx.fillStyle = '#0F172A';
      ctx.fillText(signerName || 'เจ้าหน้าที่โครงการ', leftX + 130, textY);

      textY += lineHeight;
      ctx.font = '14px "Sarabun", "Prompt", sans-serif';
      ctx.fillStyle = '#64748B';
      ctx.fillText('ตำแหน่ง:', leftX, textY);
      ctx.font = 'bold 15px "Sarabun", "Prompt", sans-serif';
      ctx.fillStyle = '#1E293B';
      ctx.fillText(signerRole || 'ผู้ตรวจรับงาน', leftX + 130, textY);

      textY += lineHeight;
      ctx.font = '14px "Sarabun", "Prompt", sans-serif';
      ctx.fillStyle = '#64748B';
      ctx.fillText('วันที่อนุมัติ:', leftX, textY);
      ctx.font = 'bold 15px -apple-system, sans-serif';
      ctx.fillStyle = '#1E3A8A';
      const actualDate = dateStr || new Date().toLocaleDateString('th-TH', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
      ctx.fillText(actualDate, leftX + 130, textY);

      textY += lineHeight;
      if (company) {
        ctx.font = '13px "Sarabun", "Prompt", sans-serif';
        ctx.fillStyle = '#94A3B8';
        ctx.fillText(`ร้านค้า/ผรม.: ${company}`, leftX, textY);
      }

      // Security Verification Badge Footer on Left
      ctx.font = 'italic 11px sans-serif';
      ctx.fillStyle = '#94A3B8';
      ctx.fillText('SECURITY VERIFIED • DIGITAL AUDIT TRAIL LOCK', leftX, height - 16);

      // Vertical Separator
      ctx.beginPath();
      ctx.strokeStyle = '#E2E8F0';
      ctx.lineWidth = 1.5;
      ctx.moveTo(375, 56);
      ctx.lineTo(375, height - 20);
      ctx.stroke();

      // Right Column: Official Stamp Seal & Signature
      const rightX = 390;
      const signatureBoxW = width - rightX - 20; // ~230px
      const signatureBoxH = height - 76; // ~184px

      // Background Box for Signature
      ctx.fillStyle = '#F1F5F9';
      ctx.beginPath();
      const sRadius = 10;
      ctx.roundRect 
        ? ctx.roundRect(rightX, 58, signatureBoxW, signatureBoxH, sRadius)
        : ctx.rect(rightX, 58, signatureBoxW, signatureBoxH);
      ctx.fill();

      // Circular Official Seal (ตราประทับตรวจรับ LH)
      if (includeSeal) {
        ctx.save();
        const sealCenterX = rightX + signatureBoxW - 44;
        const sealCenterY = 58 + 44;
        const sealR = 36;

        ctx.strokeStyle = 'rgba(220, 38, 38, 0.45)'; // Official Red ink stamp appearance
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(sealCenterX, sealCenterY, sealR, 0, Math.PI * 2);
        ctx.stroke();

        ctx.strokeStyle = 'rgba(220, 38, 38, 0.35)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(sealCenterX, sealCenterY, sealR - 4, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = 'rgba(220, 38, 38, 0.75)';
        ctx.font = 'bold 8px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('LH V-TRACK', sealCenterX, sealCenterY - 14);
        ctx.font = 'bold 12px "Sarabun", sans-serif';
        ctx.fillText('ตรวจรับแล้ว', sealCenterX, sealCenterY + 1);
        ctx.font = 'bold 7px sans-serif';
        ctx.fillText('VERIFIED & AUDITED', sealCenterX, sealCenterY + 14);
        ctx.restore();
      }

      // Draw Signature Baseline
      ctx.strokeStyle = '#CBD5E1';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(rightX + 15, height - 42);
      ctx.lineTo(rightX + signatureBoxW - 15, height - 42);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.font = '11px "Sarabun", sans-serif';
      ctx.fillStyle = '#94A3B8';
      ctx.textAlign = 'center';
      ctx.fillText('(ลายมือชื่อผู้ตรวจรับ)', rightX + signatureBoxW / 2, height - 26);
      ctx.textAlign = 'left';

      // Load and Draw Signature Image
      if (signatureDataUrl) {
        const sigImg = new Image();
        sigImg.onload = () => {
          const maxW = signatureBoxW - 24;
          const maxH = signatureBoxH - 45;
          const sW = sigImg.naturalWidth || sigImg.width || 200;
          const sH = sigImg.naturalHeight || sigImg.height || 100;
          const scale = Math.min(maxW / sW, maxH / sH);
          const drawW = sW * scale;
          const drawH = sH * scale;
          const drawX = rightX + (signatureBoxW - drawW) / 2;
          const drawY = 58 + 8 + (maxH - drawH) / 2;

          ctx.drawImage(sigImg, drawX, drawY, drawW, drawH);
          resolve(canvas.toDataURL('image/png'));
        };
        sigImg.onerror = () => {
          // If signature image fails to load, resolve canvas with text placeholder
          resolve(canvas.toDataURL('image/png'));
        };
        sigImg.src = signatureDataUrl;
      } else {
        resolve(canvas.toDataURL('image/png'));
      }
    } catch (err) {
      reject(err);
    }
  });
};

/**
 * แปลง Base64 Data URL หรือ ArrayBuffer ให้เป็น Uint8Array ของ PDF
 */
export const toPdfUint8Array = (fileOrBytes) => {
  if (fileOrBytes instanceof Uint8Array) {
    return fileOrBytes;
  }
  if (fileOrBytes instanceof ArrayBuffer) {
    return new Uint8Array(fileOrBytes);
  }
  if (typeof fileOrBytes === 'string') {
    const base64Content = fileOrBytes.includes(';base64,')
      ? fileOrBytes.split(';base64,')[1]
      : fileOrBytes;
    const binaryString = atob(base64Content);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }
  throw new Error('รูปแบบไฟล์เอกสารไม่ถูกต้อง');
};

/**
 * ประทับตราลายเซ็นต์ดิจิทัลลงในเอกสาร PDF ขั้นสูง
 * @param {string|Uint8Array|ArrayBuffer} pdfSource - ข้อมูล PDF ต้นทาง
 * @param {Object} stampOptions
 * @param {string} stampOptions.signatureDataUrl - รูปภาพลายเซ็นต์
 * @param {string} [stampOptions.signerName] - ชื่อผู้ลงนาม
 * @param {string} [stampOptions.signerRole] - ตำแหน่งผู้ลงนาม
 * @param {string} [stampOptions.taskNo] - เลขที่ใบงาน
 * @param {string} [stampOptions.company] - ชื่อร้านค้า/ผู้รับเหมา
 * @param {string} [stampOptions.dateStr] - วันที่แสดงผล
 * @param {boolean} [stampOptions.includeSeal=true] - ประทับตราวงกลมตรวจรับ
 * @param {string} [stampOptions.placement='bottom-right'] - ตำแหน่งวาง ('bottom-right' | 'bottom-left' | 'top-right' | 'top-left')
 * @param {string} [stampOptions.targetPages='last'] - หน้าเป้าหมาย ('last' | 'first' | 'all')
 * @returns {Promise<Uint8Array>} PDF bytes ที่ประทับตราแล้ว
 */
export const stampSignatureOnPdfAdvanced = async (pdfSource, stampOptions) => {
  if (!pdfSource) throw new Error('ไม่พบไฟล์เอกสารสำหรับเซ็นต์');

  const existingPdfBytes = toPdfUint8Array(pdfSource);
  const pdfDoc = await PDFDocument.load(existingPdfBytes);

  // Generate high-resolution composite badge PNG
  const badgePngDataUrl = await generateStampBadgePng(stampOptions);
  const badgeImage = await pdfDoc.embedPng(badgePngDataUrl);

  const pages = pdfDoc.getPages();
  if (pages.length === 0) throw new Error('เอกสารไม่มีหน้าสำหรับประทับตรา');

  // Determine target pages
  let targetPageList = [];
  if (stampOptions.targetPages === 'first') {
    targetPageList = [pages[0]];
  } else if (stampOptions.targetPages === 'all') {
    targetPageList = pages;
  } else {
    // Default to 'last' page
    targetPageList = [pages[pages.length - 1]];
  }

  // Stamp dimensions in PDF points (width: 250pt, height: ~101.5pt with 640x260 ratio)
  const stampWidthPt = 250;
  const stampHeightPt = Math.round(stampWidthPt * (260 / 640)); // ~102pt
  const margin = 20;

  for (const page of targetPageList) {
    const { width, height } = page.getSize();
    const coords = calculateStampCoordinates(
      width,
      height,
      stampWidthPt,
      stampHeightPt,
      stampOptions.placement || 'bottom-right',
      margin
    );

    page.drawImage(badgeImage, {
      x: coords.x,
      y: coords.y,
      width: coords.width,
      height: coords.height,
    });
  }

  // Set PDF metadata for traceability
  try {
    pdfDoc.setTitle(`Approved Quotation - Job #${stampOptions.taskNo || ''}`);
    pdfDoc.setAuthor(stampOptions.signerName || 'Land & Houses V-Track');
    pdfDoc.setSubject('LH Quotation Approval & Verification');
    pdfDoc.setModificationDate(new Date());
  } catch (metaErr) {
    console.warn('PDF metadata error (safe ignore):', metaErr);
  }

  return await pdfDoc.save();
};
