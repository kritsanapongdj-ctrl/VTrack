/* eslint-disable */
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  LayoutDashboard, FileText, Settings, PlusCircle, 
  Upload, Search, Edit, Trash2, X, AlertCircle, Menu, ChevronLeft, ChevronRight, 
  User, Filter, CalendarDays, FileDown, Printer, Trash, MapPin, Building2, Briefcase,
  Paperclip, PenTool, CheckCircle2, Clock, AlertTriangle, ArrowRight, Download,
  Lock, Unlock, HardDrive, History, Eye, RotateCcw, ShieldCheck, DollarSign, Sparkles, Loader2, Image as ImageIcon,
  Mail, Send, Copy, Check
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, getDoc, setDoc, onSnapshot, addDoc, updateDoc, deleteDoc, getDocs } from 'firebase/firestore';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { stampSignatureOnPdfAdvanced, generateStampBadgePng } from './utils/pdfStamper';

// --- Firebase Initialization ---
const userFirebaseConfig = {
  apiKey: "AIzaSyCYiPSZJBmjwCp6z6gPdRpWG6vZT8R2wN8",
  authDomain: "vtrackdb.firebaseapp.com",
  projectId: "vtrackdb",
  storageBucket: "vtrackdb.firebasestorage.app",
  messagingSenderId: "672264007072",
  appId: "1:672264007072:web:06a820a12e71c84cf308c5",
  measurementId: "G-1PYTFGC4YT"
};

const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : userFirebaseConfig;
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'v-track-system';

// =====================================================================
// 🔴 จุดใส่ Webhook Google Apps Script 🔴
// =====================================================================
const GOOGLE_SHEETS_WEBHOOK_URL = ''; 


// --- Constants & Helpers ---
const AREAS = ['รังสิต', 'ร่มเกล้า', 'พระราม 9', 'รามอินทรา'];

const STATUSES = [
  { id: 1, name: 'รอใบเสนอราคา', color: '#64748B', bgColor: '#F1F5F9' },
  { id: 2, name: 'อยู่ระหว่างตรวจสอบใบเสนอราคา', color: '#B45309', bgColor: '#FEF3C7' },
  { id: 3, name: 'อนุมัติใบเสนอราคาแล้ว', color: '#4338CA', bgColor: '#EEF2FF' },
  { id: 4, name: 'เปิดใบงานในระบบแล้ว', color: '#1D4ED8', bgColor: '#DBEAFE' },
  { id: 5, name: 'จบงานและรอรับเอกสารวางบิล', color: '#7E22CE', bgColor: '#F3E8FF' },
  { id: 6, name: 'ได้รับเอกสารวางบิลแล้ว', color: '#BE123C', bgColor: '#FFE4E6' },
  { id: 7, name: 'ส่งเอกสารเบิกจ่ายแล้ว', color: '#047857', bgColor: '#D1FAE5' },
  { id: 8, name: 'ยกเลิก', color: '#B91C1C', bgColor: '#FEE2E2' }
];

const generateRefId = () => {
  const ym = new Date().toISOString().slice(2, 7).replace('-', '');
  const rand = Math.floor(100 + Math.random() * 900);
  return `REQ-${ym}-${rand}`;
};

const appendTimelineEvent = (currentTimeline = [], event) => {
  const newEvent = {
    id: `ev-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    at: Date.now(),
    ...event
  };
  return [...(currentTimeline || []), newEvent];
};

const isOverdue = (task) => {
  if (!task || !task.status || task.status === 'ยกเลิก' || task.status === 'ส่งเอกสารเบิกจ่ายแล้ว') return false;
  if (task.status === 'จบงานและรอรับเอกสารวางบิล') {
    const statusDate = task.statusUpdatedAt || task.updatedAt || task.createdAt;
    if (statusDate) {
      const oneMonthAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
      if (statusDate < oneMonthAgo) return true;
    }
  }
  if (task.endDate) {
    const today = new Date().toISOString().slice(0, 10);
    if (today > task.endDate && !['จบงานและรอรับเอกสารวางบิล', 'ได้รับเอกสารวางบิลแล้ว', 'ส่งเอกสารเบิกจ่ายแล้ว'].includes(task.status)) {
      return true;
    }
  }
  return false;
};

const isScheduleOverdue = (task) => {
  if (!task || !task.endDate || task.status === 'ยกเลิก' || ['จบงานและรอรับเอกสารวางบิล', 'ได้รับเอกสารวางบิลแล้ว', 'ส่งเอกสารเบิกจ่ายแล้ว'].includes(task.status)) return false;
  const today = new Date().toISOString().slice(0, 10);
  return today > task.endDate;
};

// --- Robust Firestore File Storage System ---
const fileToBase64 = (fileOrBytes, mimeType = 'application/pdf') => {
  return new Promise((resolve, reject) => {
    if (fileOrBytes instanceof Uint8Array || fileOrBytes instanceof ArrayBuffer) {
      let binary = '';
      const bytes = new Uint8Array(fileOrBytes);
      const len = bytes.byteLength;
      for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const b64 = btoa(binary);
      resolve(`data:${mimeType};base64,${b64}`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(fileOrBytes);
  });
};

const base64ToBlob = (dataUrl, defaultType = 'application/pdf') => {
  if (!dataUrl) return null;
  const parts = dataUrl.split(';base64,');
  const contentType = parts[0]?.replace('data:', '') || defaultType;
  const raw = atob(parts[1] || parts[0]);
  const rawLength = raw.length;
  const uInt8Array = new Uint8Array(rawLength);
  for (let i = 0; i < rawLength; ++i) {
    uInt8Array[i] = raw.charCodeAt(i);
  }
  return new Blob([uInt8Array], { type: contentType });
};

const saveFileToStore = async (fileOrBytes, fileName, fileType = 'application/pdf') => {
  const fileId = `file_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const base64Data = await fileToBase64(fileOrBytes, fileType);
  const size = fileOrBytes.size || fileOrBytes.byteLength || base64Data.length;
  const chunkSize = 500000;

  const fileRef = doc(db, 'artifacts', appId, 'public', 'data', 'vtrack_files', fileId);

  if (base64Data.length < 800000) {
    await setDoc(fileRef, {
      id: fileId,
      name: fileName,
      type: fileType,
      size,
      isChunked: false,
      data: base64Data,
      createdAt: Date.now()
    });
  } else {
    const totalChunks = Math.ceil(base64Data.length / chunkSize);
    await setDoc(fileRef, {
      id: fileId,
      name: fileName,
      type: fileType,
      size,
      isChunked: true,
      totalChunks,
      createdAt: Date.now()
    });
    const writePromises = [];
    for (let i = 0; i < totalChunks; i++) {
      const chunkRef = doc(db, 'artifacts', appId, 'public', 'data', 'vtrack_files', fileId, 'chunks', String(i));
      writePromises.push(setDoc(chunkRef, {
        index: i,
        data: base64Data.slice(i * chunkSize, (i + 1) * chunkSize)
      }));
    }
    await Promise.all(writePromises);
  }

  return {
    fileId,
    fileName,
    fileSize: size,
    fileUrl: `vtrack-file://${fileId}`
  };
};

const getFileDataUrl = async (fileUrlOrId) => {
  if (!fileUrlOrId) return null;
  if (fileUrlOrId.startsWith('data:') || fileUrlOrId.startsWith('http://') || fileUrlOrId.startsWith('https://')) {
    return fileUrlOrId;
  }
  const fileId = fileUrlOrId.replace('vtrack-file://', '');
  const fileRef = doc(db, 'artifacts', appId, 'public', 'data', 'vtrack_files', fileId);
  const snap = await getDoc(fileRef);
  if (!snap.exists()) {
    throw new Error('ไม่พบเอกสารในระบบ');
  }
  const meta = snap.data();
  if (!meta.isChunked) {
    return meta.data;
  }
  const chunksCol = collection(db, 'artifacts', appId, 'public', 'data', 'vtrack_files', fileId, 'chunks');
  const chunksSnap = await getDocs(chunksCol);
  const chunks = chunksSnap.docs.map(d => d.data()).sort((a, b) => a.index - b.index);
  return chunks.map(c => c.data).join('');
};

const deleteFileFromStore = async (fileUrlOrId) => {
  if (!fileUrlOrId) return;
  try {
    const fileId = fileUrlOrId.replace('vtrack-file://', '');
    const fileRef = doc(db, 'artifacts', appId, 'public', 'data', 'vtrack_files', fileId);
    const snap = await getDoc(fileRef);
    if (snap.exists()) {
      const meta = snap.data();
      if (meta.isChunked) {
        const chunksCol = collection(db, 'artifacts', appId, 'public', 'data', 'vtrack_files', fileId, 'chunks');
        const chunksSnap = await getDocs(chunksCol);
        await Promise.all(chunksSnap.docs.map(d => deleteDoc(d.ref)));
      }
      await deleteDoc(fileRef);
    }
  } catch (err) {
    console.warn("Delete file error ignored:", err);
  }
};

const stampSignatureOnPdf = async (pdfUrlOrId, signaturePngOrOptions) => {
  const dataUrl = await getFileDataUrl(pdfUrlOrId);
  if (!dataUrl) throw new Error("ไม่พบไฟล์เอกสารสำหรับเซ็นต์");

  if (typeof signaturePngOrOptions === 'object' && signaturePngOrOptions !== null) {
    return await stampSignatureOnPdfAdvanced(dataUrl, signaturePngOrOptions);
  }

  // Fallback for legacy signature string calls
  return await stampSignatureOnPdfAdvanced(dataUrl, {
    signatureDataUrl: signaturePngOrOptions,
    signerName: 'เจ้าหน้าที่โครงการ',
    signerRole: 'ผู้ตรวจรับงาน / วิศวกรโครงการ',
    placement: 'bottom-right',
    targetPages: 'last',
    includeSeal: true,
  });
};


const convertImageToPngDataUrl = (fileOrDataUrl) => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || img.width || 300;
      canvas.height = img.naturalHeight || img.height || 150;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = reject;
    if (typeof fileOrDataUrl === 'string') {
      img.src = fileOrDataUrl;
    } else {
      const reader = new FileReader();
      reader.onload = () => { img.src = reader.result; };
      reader.onerror = reject;
      reader.readAsDataURL(fileOrDataUrl);
    }
  });
};

const GAS_DEFAULT_SCRIPT = `function doPost(e) {
  try {
    var rawContents = e.postData ? e.postData.contents : "";
    if (!rawContents && e.parameter && e.parameter.data) {
      rawContents = e.parameter.data;
    }
    var data = {};
    try {
      data = typeof rawContents === "string" ? JSON.parse(rawContents) : (rawContents || {});
    } catch(parseErr) {
      data = e.parameter || {};
    }

    var toEmail = data.toEmail;
    var event = data.event || "general";
    var taskNo = data.taskNo || "-";
    var project = data.project || "-";
    var company = data.company || "-";
    var area = data.area || "-";
    var aptDate = data.aptDate || "-";
    var fileName = data.fileName || "-";
    var fileSizeKb = data.fileSize ? (Math.round(data.fileSize / 1024) + " KB") : "-";
    
    // วันที่และเวลาปัจจุบัน (Bangkok Time)
    var dateStr = Utilities.formatDate(new Date(), "Asia/Bangkok", "dd/MM/yyyy HH:mm 'น.'");
    var refCode = "VT-" + (taskNo.replace(/[^a-zA-Z0-9]/g, "") || "REQ") + "-" + Utilities.formatDate(new Date(), "Asia/Bangkok", "yyMMddHHmm");

    if (!toEmail) {
      return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "No recipient email provided" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    var subject = "แจ้งข้อมูลงาน: ใบงาน " + taskNo + " (" + project + ")";
    var plainBody = "";
    var htmlBody = "";

    // 1. กรณี: ผู้รับเหมาแนบใบเสนอราคา (แจ้งเจ้าหน้าที่)
    if (event === "quotation_uploaded") {
      subject = "แจ้งส่งเอกสารใบเสนอราคา: ใบงาน " + taskNo + " โครงการ " + project;
      
      plainBody = "เรียน เจ้าหน้าที่ผู้รับผิดชอบ,\\n\\n" +
        "ผู้รับเหมา (" + company + ") ได้ทำการแนบเอกสารใบเสนอราคาสำหรับใบงาน " + taskNo + " เรียบร้อยแล้ว มีรายละเอียดดังนี้:\\n\\n" +
        "• เลขที่ใบงาน: " + taskNo + "\\n" +
        "• โครงการ: " + project + "\\n" +
        "• บริษัท/ผู้รับเหมา: " + company + "\\n" +
        "• พื้นที่หน้างาน: " + area + "\\n" +
        "• วันที่นัดหมาย: " + aptDate + "\\n" +
        "• เอกสารแนบ: " + fileName + " (" + fileSizeKb + ")\\n" +
        "• สถานะ: รอตรวจสอบใบเสนอราคา\\n" +
        "• เวลาทำรายการ: " + dateStr + "\\n" +
        "• รหัสอ้างอิง: " + refCode + "\\n\\n" +
        "ท่านสามารถเปิดระบบ V-Track เพื่อตรวจสอบเอกสารและพิจารณาดำเนินการต่อไปได้ครับ\\n" +
        "--------------------------------------------------\\n" +
        "ระบบติดตามงานแจ้งซ่อม V-Track (สามารถตอบกลับอีเมลนี้ได้)";

      htmlBody = '<!DOCTYPE html><html><head><meta charset="utf-8"></head>' +
        '<body style="margin: 0; padding: 20px; background-color: #f8fafc; font-family: \\\'Segoe UI\\\', Tahoma, Arial, sans-serif; color: #1e293b;">' +
        '<table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; border: 1px solid #e2e8f0; box-shadow: 0 2px 6px rgba(0,0,0,0.04);">' +
        '<tr><td style="background-color: #003366; padding: 18px 24px; border-radius: 8px 8px 0 0;">' +
        '<div style="font-size: 16px; font-weight: bold; color: #ffffff;">แจ้งส่งเอกสารใบเสนอราคา</div>' +
        '<div style="font-size: 12px; color: #cbd5e1; margin-top: 2px;">ระบบติดตามงานแจ้งซ่อม V-Track</div>' +
        '</td></tr>' +
        '<tr><td style="padding: 24px;">' +
        '<p style="font-size: 14px; margin-top: 0; color: #1e293b;">เรียน เจ้าหน้าที่ผู้รับผิดชอบ,</p>' +
        '<p style="font-size: 13px; color: #334155; line-height: 1.5;">ผู้รับเหมาได้แนบไฟล์ใบเสนอราคาเข้าสู่ระบบเรียบร้อยแล้ว มีรายละเอียดใบงานดังนี้:</p>' +
        '<table role="presentation" width="100%" border="0" cellpadding="8" cellspacing="0" style="font-size: 13px; border-collapse: collapse; margin: 16px 0; background-color: #f8fafc; border-radius: 6px; border: 1px solid #e2e8f0;">' +
        '<tr><td style="width: 35%; color: #64748b; font-weight: 600; border-bottom: 1px solid #e2e8f0;">เลขที่ใบงาน:</td><td style="color: #003366; font-weight: bold; border-bottom: 1px solid #e2e8f0;">' + taskNo + '</td></tr>' +
        '<tr><td style="color: #64748b; font-weight: 600; border-bottom: 1px solid #e2e8f0;">โครงการ:</td><td style="color: #1e293b; border-bottom: 1px solid #e2e8f0;">' + project + '</td></tr>' +
        '<tr><td style="color: #64748b; font-weight: 600; border-bottom: 1px solid #e2e8f0;">บริษัท/ผู้รับเหมา:</td><td style="color: #1e293b; font-weight: bold; border-bottom: 1px solid #e2e8f0;">' + company + '</td></tr>' +
        '<tr><td style="color: #64748b; font-weight: 600; border-bottom: 1px solid #e2e8f0;">พื้นที่หน้างาน:</td><td style="color: #1e293b; border-bottom: 1px solid #e2e8f0;">' + area + '</td></tr>' +
        '<tr><td style="color: #64748b; font-weight: 600; border-bottom: 1px solid #e2e8f0;">วันนัดหมาย:</td><td style="color: #0369a1; border-bottom: 1px solid #e2e8f0;">' + aptDate + '</td></tr>' +
        '<tr><td style="color: #64748b; font-weight: 600; border-bottom: 1px solid #e2e8f0;">เอกสารแนบ:</td><td style="color: #0f172a; font-weight: bold; border-bottom: 1px solid #e2e8f0;">' + fileName + ' (' + fileSizeKb + ')</td></tr>' +
        '<tr><td style="color: #64748b; font-weight: 600; border-bottom: 1px solid #e2e8f0;">สถานะ:</td><td style="color: #b45309; font-weight: bold; border-bottom: 1px solid #e2e8f0;">รอตรวจสอบใบเสนอราคา</td></tr>' +
        '<tr><td style="color: #64748b; font-weight: 600;">เวลาทำรายการ:</td><td style="color: #475569;">' + dateStr + '</td></tr>' +
        '</table>' +
        '<p style="font-size: 13px; color: #475569; margin-bottom: 0;">ท่านสามารถเปิดเข้าสู่ระบบ V-Track เพื่อตรวจสอบไฟล์ใบเสนอราคาและดำเนินการต่อไปได้ทันทีครับ</p>' +
        '</td></tr>' +
        '<tr><td style="background-color: #f1f5f9; padding: 14px 24px; border-radius: 0 0 8px 8px; font-size: 11px; color: #64748b; border-top: 1px solid #e2e8f0;">' +
        '<div>รหัสอ้างอิง: ' + refCode + ' • ระบบติดตามงาน V-Track</div>' +
        '<div>หากมีข้อสงสัยหรือต้องการสอบถามข้อมูลเพิ่มเติม สามารถตอบกลับอีเมลนี้ได้ครับ</div>' +
        '</td></tr></table>' +
        '</body></html>';

    // 2. กรณี: เจ้าหน้าที่แนบใบแจ้งซ่อมมอบหมายงาน (แจ้งผู้รับเหมา)
    } else if (event === "task_order_attached") {
      var startDate = data.startDate || "-";
      var endDate = data.endDate || "-";
      subject = "แจ้งมอบหมายใบงานแจ้งซ่อม: ใบงาน " + taskNo + " โครงการ " + project;

      plainBody = "เรียน ผู้รับเหมา (" + company + "),\\n\\n" +
        "เจ้าหน้าที่ได้ทำการออกใบงานแจ้งซ่อมและมอบหมายงานสำหรับใบงาน " + taskNo + " เรียบร้อยแล้ว มีรายละเอียดดังนี้:\\n\\n" +
        "• เลขที่ใบงาน: " + taskNo + "\\n" +
        "• โครงการ: " + project + "\\n" +
        "• ช่วงวันเข้าทำงาน: " + startDate + " ถึง " + endDate + "\\n" +
        "• พื้นที่หน้างาน: " + area + "\\n" +
        "• เอกสารใบแจ้งซ่อม: " + fileName + " (" + fileSizeKb + ")\\n" +
        "• เวลาออกใบงาน: " + dateStr + "\\n" +
        "• รหัสอ้างอิง: " + refCode + "\\n\\n" +
        "ท่านสามารถเปิดเข้าสู่ระบบ V-Track เพื่อเปิดดูและดาวน์โหลดเอกสารใบแจ้งซ่อมสำหรับเข้าปฏิบัติงานได้ครับ\\n" +
        "--------------------------------------------------\\n" +
        "ระบบติดตามงานแจ้งซ่อม V-Track (สามารถตอบกลับอีเมลนี้ได้)";

      htmlBody = '<!DOCTYPE html><html><head><meta charset="utf-8"></head>' +
        '<body style="margin: 0; padding: 20px; background-color: #f8fafc; font-family: \\\'Segoe UI\\\', Tahoma, Arial, sans-serif; color: #1e293b;">' +
        '<table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; border: 1px solid #e2e8f0; box-shadow: 0 2px 6px rgba(0,0,0,0.04);">' +
        '<tr><td style="background-color: #003366; padding: 18px 24px; border-radius: 8px 8px 0 0;">' +
        '<div style="font-size: 16px; font-weight: bold; color: #ffffff;">แจ้งมอบหมายใบงานแจ้งซ่อม</div>' +
        '<div style="font-size: 12px; color: #cbd5e1; margin-top: 2px;">ระบบติดตามงานแจ้งซ่อม V-Track</div>' +
        '</td></tr>' +
        '<tr><td style="padding: 24px;">' +
        '<p style="font-size: 14px; margin-top: 0; color: #1e293b;">เรียน ผู้รับเหมา (' + company + '),</p>' +
        '<p style="font-size: 13px; color: #334155; line-height: 1.5;">เจ้าหน้าที่ได้ออกใบงานแจ้งซ่อมและกำหนดวันเข้าปฏิบัติงานเรียบร้อยแล้ว มีรายละเอียดดังนี้:</p>' +
        '<table role="presentation" width="100%" border="0" cellpadding="8" cellspacing="0" style="font-size: 13px; border-collapse: collapse; margin: 16px 0; background-color: #f8fafc; border-radius: 6px; border: 1px solid #e2e8f0;">' +
        '<tr><td style="width: 35%; color: #64748b; font-weight: 600; border-bottom: 1px solid #e2e8f0;">เลขที่ใบงาน:</td><td style="color: #003366; font-weight: bold; border-bottom: 1px solid #e2e8f0;">' + taskNo + '</td></tr>' +
        '<tr><td style="color: #64748b; font-weight: 600; border-bottom: 1px solid #e2e8f0;">โครงการ:</td><td style="color: #1e293b; border-bottom: 1px solid #e2e8f0;">' + project + '</td></tr>' +
        '<tr><td style="color: #64748b; font-weight: 600; border-bottom: 1px solid #e2e8f0;">ช่วงวันเข้าทำงาน:</td><td style="color: #047857; font-weight: bold; border-bottom: 1px solid #e2e8f0;">' + startDate + ' ถึง ' + endDate + '</td></tr>' +
        '<tr><td style="color: #64748b; font-weight: 600; border-bottom: 1px solid #e2e8f0;">พื้นที่หน้างาน:</td><td style="color: #1e293b; border-bottom: 1px solid #e2e8f0;">' + area + '</td></tr>' +
        '<tr><td style="color: #64748b; font-weight: 600; border-bottom: 1px solid #e2e8f0;">ไฟล์ใบแจ้งซ่อม:</td><td style="color: #0f172a; font-weight: bold; border-bottom: 1px solid #e2e8f0;">' + fileName + ' (' + fileSizeKb + ')</td></tr>' +
        '<tr><td style="color: #64748b; font-weight: 600;">เวลาออกใบงาน:</td><td style="color: #475569;">' + dateStr + '</td></tr>' +
        '</table>' +
        '<p style="font-size: 13px; color: #475569; margin-bottom: 0;">ท่านสามารถเปิดเข้าสู่ระบบ V-Track เพื่อเปิดดูและดาวน์โหลดไฟล์ใบแจ้งซ่อมเก็บไว้ได้ครับ</p>' +
        '</td></tr>' +
        '<tr><td style="background-color: #f1f5f9; padding: 14px 24px; border-radius: 0 0 8px 8px; font-size: 11px; color: #64748b; border-top: 1px solid #e2e8f0;">' +
        '<div>รหัสอ้างอิง: ' + refCode + ' • ระบบติดตามงาน V-Track</div>' +
        '<div>หากมีข้อสงสัยหรือต้องการสอบถามข้อมูลเพิ่มเติม สามารถตอบกลับอีเมลนี้ได้ครับ</div>' +
        '</td></tr></table>' +
        '</body></html>';

    // 3. กรณี: ทดสอบการเชื่อมต่อระบบ (Test Notification)
    } else {
      subject = "ทดสอบการเชื่อมต่อระบบแจ้งเตือนอีเมล V-Track";
      var msg = data.message || "ทดสอบการเชื่อมต่อระบบแจ้งเตือนทางอีเมลสำเร็จ";
      
      plainBody = "เรียน ผู้ดูแลระบบ/เจ้าหน้าที่,\\n\\n" +
        "ระบบ V-Track ขอแจ้งผลการทดสอบการส่งอีเมล:\\n\\n" +
        "• สถานะ: เชื่อมต่อสำเร็จ\\n" +
        "• ข้อความ: " + msg + "\\n" +
        "• วันที่และเวลา: " + dateStr + "\\n" +
        "• รหัสอ้างอิง: " + refCode + "\\n\\n" +
        "ระบบพร้อมส่งข้อมูลการแจ้งเตือนใบงานเรียบร้อยแล้วครับ\\n" +
        "--------------------------------------------------\\n" +
        "ระบบติดตามงานแจ้งซ่อม V-Track (สามารถตอบกลับอีเมลนี้ได้)";

      htmlBody = '<!DOCTYPE html><html><head><meta charset="utf-8"></head>' +
        '<body style="margin: 0; padding: 20px; background-color: #f8fafc; font-family: \\\'Segoe UI\\\', Tahoma, Arial, sans-serif; color: #1e293b;">' +
        '<table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; border: 1px solid #e2e8f0;">' +
        '<tr><td style="background-color: #003366; padding: 18px 24px; border-radius: 8px 8px 0 0;">' +
        '<div style="font-size: 16px; font-weight: bold; color: #ffffff;">ทดสอบระบบแจ้งเตือนอีเมล V-Track</div>' +
        '</td></tr>' +
        '<tr><td style="padding: 24px;">' +
        '<p style="font-size: 14px; margin-top: 0; color: #1e293b;">เรียน ผู้ดูแลระบบ/เจ้าหน้าที่,</p>' +
        '<div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; padding: 14px; margin: 14px 0;">' +
        '<strong style="color: #15803d; font-size: 14px;">เชื่อมต่อระบบสำเร็จสมบูรณ์</strong>' +
        '<div style="font-size: 13px; color: #334155; margin-top: 4px;">' + msg + '</div>' +
        '</div>' +
        '<table width="100%" style="font-size: 12px; color: #64748b; margin-top: 14px;">' +
        '<tr><td>ผู้รับ: <strong>' + toEmail + '</strong></td><td style="text-align: right;">เวลา: ' + dateStr + '</td></tr>' +
        '</table>' +
        '</td></tr>' +
        '<tr><td style="background-color: #f1f5f9; padding: 12px 24px; border-radius: 0 0 8px 8px; font-size: 11px; color: #64748b; border-top: 1px solid #e2e8f0;">' +
        'รหัสอ้างอิง: ' + refCode + ' • ระบบติดตามงาน V-Track' +
        '</td></tr></table></body></html>';
    }

    // อนุญาตให้ส่งค่า subject / body / htmlBody แบบกำหนดเองเข้ามาได้
    if (data.subject) subject = data.subject;
    if (data.body) plainBody = data.body;
    if (data.htmlBody) htmlBody = data.htmlBody;

    // ส่งผ่าน GmailApp (มี DKIM/SPF แท้เหมือนคนส่งจาก Gmail) และ Fallback ไปที่ MailApp
    var sendOptions = {
      htmlBody: htmlBody,
      name: "V-Track ระบบแจ้งเตือนงาน"
    };

    try {
      GmailApp.sendEmail(toEmail, subject, plainBody, sendOptions);
    } catch(gmailErr) {
      MailApp.sendEmail({
        to: toEmail,
        subject: subject,
        body: plainBody,
        htmlBody: htmlBody,
        name: "V-Track ระบบแจ้งเตือนงาน"
      });
    }

    return ContentService.createTextOutput(JSON.stringify({ 
      status: "success", 
      message: "Email sent to " + toEmail,
      ref: refCode
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ 
      status: "error", 
      message: err.toString() 
    })).setMimeType(ContentService.MimeType.JSON);
  }
}`;

const triggerEmailNotification = async (task, eventType, extraData = {}, currentSettings = null) => {
  const webhookUrl = currentSettings?.webhookUrl || GOOGLE_SHEETS_WEBHOOK_URL;
  const trimmed = (webhookUrl || '').trim();
  if (!trimmed) {
    console.log('Email notification skipped: No Webhook URL configured in Settings');
    return false;
  }
  if (trimmed.includes('/library/') || !trimmed.includes('/macros/s/') || !trimmed.endsWith('/exec')) {
    console.warn('Email notification skipped: Invalid Webhook URL. It must be a Web App URL ending with /exec, got:', trimmed);
    return false;
  }
  try {
    const payload = {
      event: eventType,
      project: task?.project || '',
      company: task?.company || '',
      taskNo: task?.taskNo || '',
      status: task?.status || '',
      area: task?.area || '',
      cost: task?.cost || '',
      aptDate: task?.aptDate || task?.startDate || '',
      startDate: task?.startDate || '',
      endDate: task?.endDate || '',
      details: task?.details || '',
      ...extraData,
      timestamp: new Date().toISOString()
    };
    await fetch(webhookUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });
    console.log('Email notification dispatched via webhook:', eventType, extraData.toEmail);
    return true;
  } catch (e) {
    console.error('Email Webhook Notification Error:', e);
    return false;
  }
};

const getMonthStr = (timestamp) => {
  if (!timestamp) return '';
  let ts = timestamp;
  if (typeof ts === 'string' && ts.includes('-')) {
    let [y, m, d] = ts.split('-');
    if (y && m && d) {
      let year = parseInt(y, 10);
      if (year < 100) year += 2000;
      else if (year >= 2500) year -= 543;
      if (year < 2000 || year > 2100) year = new Date().getFullYear();
      ts = `${year}-${m}-${d}`;
    }
  }
  try { return new Date(ts).toISOString().slice(0, 7); } catch { return ''; }
};

const getEffectiveMonth = (task) => {
  if (!task || task.isDeleted || task.status === 'ยกเลิก') return '';
  const isCompleted = task.status === 'ส่งเอกสารเบิกจ่ายแล้ว' && !!task.payDate;
  const baseMonth = getMonthStr(task.startDate || task.aptDate || task.createdAt);
  const currentMonth = getMonthStr(Date.now());

  if (isCompleted) {
    return getMonthStr(task.statusUpdatedAt || task.payDate || task.startDate || task.aptDate || task.createdAt);
  } else {
    if (baseMonth && baseMonth < currentMonth) {
      return currentMonth;
    }
    return baseMonth;
  }
};

const isCarryOver = (task) => {
  if (!task) return false;
  const isCompleted = task.status === 'ส่งเอกสารเบิกจ่ายแล้ว' && !!task.payDate;
  if (isCompleted) return false;
  const baseMonth = getMonthStr(task.startDate || task.aptDate || task.createdAt);
  const currentMonth = getMonthStr(Date.now());
  return baseMonth && baseMonth < currentMonth;
};

const getOriginalMonthStr = (task) => {
  if (!task) return '';
  const baseMonth = getMonthStr(task.startDate || task.aptDate || task.createdAt);
  return new Intl.DateTimeFormat('th-TH', { month: 'long', year: 'numeric' }).format(new Date(baseMonth));
};

// อีเมลของร้านค้าเก็บเป็นอาร์เรย์ (ข้อมูลเก่าเป็นสตริงเดียว/คั่นด้วย , จึงรองรับทั้งสองแบบ)
const EMAIL_RE = /^[^@\s,;]+@[^@\s,;]+\.[^@\s,;]+$/;
const toEmailList = (v) => {
  if (Array.isArray(v)) return v.filter(Boolean);
  return typeof v === 'string' ? v.split(/[\s,;]+/).filter(Boolean) : [];
};
const parseEmails = (raw) => {
  const parts = String(raw || '').split(/[\s,;]+/).filter(Boolean);
  return { valid: parts.filter(x => EMAIL_RE.test(x)), invalid: parts.filter(x => !EMAIL_RE.test(x)) };
};

function CompanyRow({ name, emails, onAddEmails, onRemoveEmail, onDelete }) {
  const [val, setVal] = useState('');
  const [err, setErr] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (!val.trim()) return;
    const msg = await onAddEmails(val);
    setErr(msg || '');
    if (!msg) setVal('');
  };

  return (
    <div className="border-2 border-black bg-white">
      <div className="flex items-center justify-between pl-3 border-b-2 border-black bg-[#FFD93D]">
        <span className="text-sm font-black py-2 break-words min-w-0">{name}</span>
        <button onClick={onDelete} className="min-h-12 min-w-12 flex items-center justify-center border-l-2 border-black bg-white hover:bg-[#FF5C5C] shrink-0" title="ลบร้านค้านี้" aria-label={`ลบ ${name}`}>
          <X size={16}/>
        </button>
      </div>
      <div className="p-3 space-y-2">
        {emails.length > 0 ? (
          <ul className="flex flex-wrap gap-2">
            {emails.map(em => (
              <li key={em} className="flex items-center border-2 border-black bg-[#BDE3FF] text-sm font-bold">
                <span className="px-2 py-1 break-all">{em}</span>
                <button onClick={() => onRemoveEmail(em)} className="min-h-9 min-w-9 flex items-center justify-center border-l-2 border-black bg-white hover:bg-[#FF5C5C]" aria-label={`ลบอีเมล ${em}`}>
                  <X size={14}/>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm font-medium opacity-70">ยังไม่มีอีเมล</p>
        )}
        <form onSubmit={submit} className="flex gap-2">
          <input className="field flex-1" placeholder="เพิ่มอีเมล (หลายอีเมลคั่นด้วย , ได้)" value={val} onChange={e => { setVal(e.target.value); setErr(''); }} />
          <button type="submit" className="brut-btn min-h-12 px-4 bg-white text-sm font-extrabold shrink-0">+ เพิ่ม</button>
        </form>
        {err && <p className="text-xs font-bold text-[#B91C1C]">{err}</p>}
      </div>
    </div>
  );
}

function InlineStatusSelect({ task, onSave, onRequestCancel, onRequestDisbursement }) {
  const s = STATUSES.find(x => x.name === task.status);
  
  const handleChange = (e) => {
    const newStatus = e.target.value;
    if (newStatus === task.status) return;
    if (newStatus === 'ยกเลิก') {
      if (onRequestCancel) onRequestCancel(task);
      return;
    }
    if (newStatus === 'ส่งเอกสารเบิกจ่ายแล้ว') {
      if (onRequestDisbursement) {
        onRequestDisbursement(task);
        return;
      }
    }
    const updatedTimeline = appendTimelineEvent(task.timeline, {
      type: 'status_change',
      from: task.status,
      to: newStatus,
      note: `เปลี่ยนสถานะเป็น ${newStatus}`
    });
    onSave({ ...task, status: newStatus, timeline: updatedTimeline }, true, task.id);
  };
  
  return (
    <div className="relative inline-block w-full max-w-[240px]">
      <select 
        value={task.status} 
        onChange={handleChange}
        className="w-full appearance-none pl-3 pr-8 min-h-12 text-sm font-extrabold border-2 border-black cursor-pointer outline-none focus:outline-3 focus:outline-black"
        style={{backgroundColor: s?.bgColor || '#f3f4f6', color: s?.color || '#374151'}}
      >
        {STATUSES.map(st => (
          <option key={st.id} value={st.name}>{st.name}</option>
        ))}
      </select>
      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-black">
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
      </div>
    </div>
  );
}

// --- Main Application Component ---
export default function App() {
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [printData, setPrintData] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [settings, setSettings] = useState({ 
    projects: [], 
    companies: [], 
    notificationEmail: '', 
    webhookUrl: '', 
    companyEmails: {} 
  });
  const [loading, setLoading] = useState(true);
  const [systemError, setSystemError] = useState('');

  // Modals state
  const [cancelModalTask, setCancelModalTask] = useState(null);
  const [signatureModalTask, setSignatureModalTask] = useState(null);
  const [taskOrderModalTask, setTaskOrderModalTask] = useState(null);
  const [rescheduleModalTask, setRescheduleModalTask] = useState(null);
  const [passcodeModal, setPasscodeModal] = useState({ isOpen: false, title: '', onSuccess: null });
  const [disbursementModalTask, setDisbursementModalTask] = useState(null);
  const [viewDetailTask, setViewDetailTask] = useState(null);
  const [editTask, setEditTask] = useState(null);
  const [pdfPreviewModal, setPdfPreviewModal] = useState(null);

  useEffect(() => {
    const initAuth = async () => {
      try { await signInAnonymously(auth); } catch (err) { setSystemError("Auth Failed"); setLoading(false); }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    const tasksRef = collection(db, 'artifacts', appId, 'public', 'data', 'vtrack_tasks');
    const settingsRef = doc(db, 'artifacts', appId, 'public', 'data', 'vtrack_settings', 'general');

    const unsubSettings = onSnapshot(settingsRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setSettings({ 
          projects: data.projects || [], 
          companies: data.companies || [],
          notificationEmail: data.notificationEmail || '',
          webhookUrl: data.webhookUrl || '',
          companyEmails: data.companyEmails || {}
        });
      } else {
        const def = { 
          projects: ['โครงการ A'], 
          companies: ['บริษัท ก'],
          notificationEmail: '',
          webhookUrl: '',
          companyEmails: {}
        };
        setDoc(settingsRef, def).catch(console.error);
        setSettings(def);
      }
    });

    const unsubTasks = onSnapshot(tasksRef, (snapshot) => {
      const data = [];
      snapshot.forEach((doc) => data.push({ id: doc.id, ...doc.data() }));
      data.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setTasks(data);
      setLoading(false);
    }, (err) => { setSystemError("Permission Denied"); setLoading(false); });

    return () => { unsubSettings(); unsubTasks(); };
  }, [user]);

  // Keep viewDetailTask in sync with tasks updates
  useEffect(() => {
    if (viewDetailTask) {
      const updated = tasks.find(t => t.id === viewDetailTask.id);
      if (updated) setViewDetailTask(updated);
    }
  }, [tasks]);

  const saveTask = async (taskData, isEdit = false, taskId = null) => {
    const tasksRef = collection(db, 'artifacts', appId, 'public', 'data', 'vtrack_tasks');
    
    // Normalize dates
    const normD = (dStr) => {
      if (!dStr) return dStr;
      let [y, m, d] = dStr.split('-');
      if (!y || !m || !d) return dStr;
      let year = parseInt(y, 10);
      if (year < 100) year += 2000;
      else if (year >= 2500) year -= 543;
      if (year < 2000 || year > 2100) year = new Date().getFullYear();
      return `${year}-${m}-${d}`;
    };

    let finalData = { ...taskData };
    if (finalData.aptDate) finalData.aptDate = normD(finalData.aptDate);
    if (finalData.startDate) finalData.startDate = normD(finalData.startDate);
    if (finalData.endDate) finalData.endDate = normD(finalData.endDate);
    if (finalData.payDate) finalData.payDate = normD(finalData.payDate);

    if (isEdit && taskId) {
      const oldTask = tasks.find(t => t.id === taskId);
      if (oldTask && oldTask.status !== taskData.status) {
        finalData.statusUpdatedAt = Date.now();
      }
      const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'vtrack_tasks', taskId);
      await updateDoc(docRef, { ...finalData, updatedAt: Date.now() });
    } else {
      finalData.statusUpdatedAt = Date.now();
      const initialTimeline = finalData.timeline || appendTimelineEvent([], {
        type: 'created',
        note: `เปิดรายการใหม่ในระบบ (สถานะ: ${finalData.status || 'รอใบเสนอราคา'})`
      });
      await addDoc(tasksRef, { ...finalData, timeline: initialTimeline, isDeleted: false, createdAt: Date.now() });
    }
    
    if (GOOGLE_SHEETS_WEBHOOK_URL) {
      try {
        await fetch(GOOGLE_SHEETS_WEBHOOK_URL, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...finalData, action: isEdit ? 'edit' : 'add', id: taskId })
        });
      } catch (e) { console.error('Webhook Error:', e); }
    }
  };

  const handleUploadQuote = async (task, file) => {
    if (!file) return;
    try {
      const saveRes = await saveFileToStore(file, file.name, file.type || 'application/pdf');

      const updatedTimeline = appendTimelineEvent(task.timeline, {
        type: 'quote_upload',
        fileName: file.name,
        fileSize: saveRes.fileSize,
        note: `แนบใบเสนอราคา: ${file.name} (${(saveRes.fileSize / 1024).toFixed(1)} KB)`
      });

      const updatedData = {
        ...task,
        quoteFileUrl: saveRes.fileUrl,
        quoteFileId: saveRes.fileId,
        quoteFileName: saveRes.fileName,
        quoteFileSize: saveRes.fileSize,
        status: 'อยู่ระหว่างตรวจสอบใบเสนอราคา',
        statusUpdatedAt: Date.now(),
        timeline: updatedTimeline
      };

      await saveTask(updatedData, true, task.id);
      if (viewDetailTask && viewDetailTask.id === task.id) {
        setViewDetailTask(prev => ({
          ...prev,
          ...updatedData
        }));
      }
      // เงื่อนไข: หากสถานะเดิมคือ 'รอใบเสนอราคา' (หรือยังไม่มีใบเสนอราคามาก่อน) ส่งอีเมลแจ้งเตือนเจ้าหน้าที่
      let notifiedAdmin = false;
      const prevStatus = task?.status || '';
      if (prevStatus === 'รอใบเสนอราคา' || !task?.quoteFileUrl) {
        if (settings?.notificationEmail) {
          try {
            notifiedAdmin = await triggerEmailNotification(updatedData, 'quotation_uploaded', {
              toEmail: settings.notificationEmail,
              subject: `แจ้งส่งเอกสารใบเสนอราคา: ใบงาน #${task.taskNo || 'ไม่ระบุ'} โครงการ ${task.project || 'ไม่ระบุโครงการ'}`,
              fileName: saveRes.fileName,
              fileUrl: saveRes.fileUrl,
              fileSize: saveRes.fileSize,
              recipientType: 'admin'
            }, settings);
          } catch (mailErr) {
            console.warn('Notification email error (safe ignore):', mailErr);
          }
        }
      }
      alert("แนบใบเสนอราคาเรียบร้อยแล้ว สถานะเปลี่ยนเป็น 'อยู่ระหว่างตรวจสอบใบเสนอราคา'" + (notifiedAdmin ? "\n(ส่งอีเมลแจ้งเตือนถึงเจ้าหน้าที่ตรวจสอบแล้ว)" : ""));
    } catch (err) {
      console.error("Upload quote error:", err);
      alert("เกิดข้อผิดพลาดในการแนบใบเสนอราคา: " + err.message);
    }
  };

  const handleConfirmSign = async (task, signPayload) => {
    const fileSource = task.quoteFileUrl || task.quoteFileId;
    if (!fileSource) {
      alert("ไม่พบไฟล์ใบเสนอราคาต้นฉบับ");
      return;
    }
    try {
      const isObjectPayload = typeof signPayload === 'object' && signPayload !== null;
      const signatureDataUrl = isObjectPayload ? signPayload.signatureDataUrl : signPayload;
      const signerName = (isObjectPayload && signPayload.signerName) ? signPayload.signerName : 'เจ้าหน้าที่โครงการ';
      const signerRole = (isObjectPayload && signPayload.signerRole) ? signPayload.signerRole : 'ผู้ตรวจรับงาน';

      const stampOptions = {
        signatureDataUrl,
        signerName,
        signerRole,
        taskNo: task.taskNo,
        company: task.company,
        includeSeal: isObjectPayload && signPayload.includeSeal !== undefined ? signPayload.includeSeal : true,
        placement: (isObjectPayload && signPayload.placement) ? signPayload.placement : 'bottom-right',
        targetPages: (isObjectPayload && signPayload.targetPages) ? signPayload.targetPages : 'last',
      };

      const signedPdfBytes = await stampSignatureOnPdf(fileSource, stampOptions);
      const signedFileName = `signed_${task.quoteFileName || 'quotation.pdf'}`;
      const saveRes = await saveFileToStore(signedPdfBytes, signedFileName, 'application/pdf');

      const updatedTimeline = appendTimelineEvent(task.timeline, {
        type: 'signed',
        by: signerName,
        note: `ตรวจรับและเซ็นต์อนุมัติใบเสนอราคาเรียบร้อย (${signerRole})`
      });

      const updatedData = {
        ...task,
        signedFileUrl: saveRes.fileUrl,
        signedFileId: saveRes.fileId,
        signedFileName: saveRes.fileName,
        signedFileSize: saveRes.fileSize,
        signedAt: Date.now(),
        signedBy: signerName,
        signerRole: signerRole,
        status: 'อนุมัติใบเสนอราคาแล้ว',
        statusUpdatedAt: Date.now(),
        timeline: updatedTimeline
      };

      await saveTask(updatedData, true, task.id);
      if (viewDetailTask && viewDetailTask.id === task.id) {
        setViewDetailTask(prev => ({
          ...prev,
          ...updatedData
        }));
      }
      alert("เซ็นต์ตรวจรับและอนุมัติใบเสนอราคาเรียบร้อยแล้ว!");
    } catch (err) {
      console.error("Signature stamping error:", err);
      alert("เกิดข้อผิดพลาดในการประทับตราลายเซ็น: " + err.message);
    }
  };


  const handleConfirmTaskOrder = async (task, { file, taskNo, startDate, endDate }) => {
    try {
      const saveRes = await saveFileToStore(file, file.name, file.type || 'application/pdf');

      const updatedTimeline = appendTimelineEvent(task.timeline, {
        type: 'task_order_opened',
        taskNo,
        startDate,
        endDate,
        fileName: file.name,
        note: `แนบใบงานแจ้งซ่อม #${taskNo} แผนงาน ${startDate} ถึง ${endDate}`
      });

      const updatedData = {
        ...task,
        taskFileUrl: saveRes.fileUrl,
        taskFileId: saveRes.fileId,
        taskFileName: saveRes.fileName,
        taskFileSize: saveRes.fileSize,
        taskNo,
        startDate,
        endDate,
        originalStartDate: task.originalStartDate || startDate,
        originalEndDate: task.originalEndDate || endDate,
        aptDate: startDate,
        status: 'เปิดใบงานในระบบแล้ว',
        statusUpdatedAt: Date.now(),
        timeline: updatedTimeline
      };

      await saveTask(updatedData, true, task.id);
      if (viewDetailTask && viewDetailTask.id === task.id) {
        setViewDetailTask(prev => ({
          ...prev,
          ...updatedData
        }));
      }
      // ฟังก์ชันที่ 2: ส่งอีเมลแจ้งเตือนไปยังผู้รับเหมาตามอีเมลที่บันทึกไว้ในตั้งค่า (ผูกกับชื่อบริษัท)
            const contractorEmail = toEmailList(settings?.companyEmails?.[task.company]).join(',');
      let notifiedContractor = false;
      if (contractorEmail) {
        try {
          notifiedContractor = await triggerEmailNotification(updatedData, 'task_order_attached', {
            toEmail: contractorEmail,
            subject: `แจ้งมอบหมายใบงานแจ้งซ่อม: ใบงาน #${taskNo || task.taskNo || 'ไม่ระบุ'} โครงการ ${task.project || ''} (${task.company || ''})`,
            fileName: saveRes.fileName,
            fileUrl: saveRes.fileUrl,
            fileSize: saveRes.fileSize,
            startDate,
            endDate,
            recipientType: 'contractor'
          }, settings);
        } catch (mailErr) {
          console.warn("Contractor email trigger error (safe ignore):", mailErr);
        }
      }

      alert("แนบใบงานและเปิดงานในระบบเรียบร้อยแล้ว!" + (notifiedContractor ? `\n(ส่งอีเมลแจ้งผู้รับเหมาที่ ${contractorEmail} เรียบร้อยแล้ว)` : ""));
    } catch (err) {
      console.error("Task order upload error:", err);
      alert("เกิดข้อผิดพลาดในการแนบใบงาน: " + err.message);
    }
  };

  const handleConfirmReschedule = async (task, { newStartDate, newEndDate, reason }) => {
    const updatedTimeline = appendTimelineEvent(task.timeline, {
      type: 'reschedule',
      fromStart: task.startDate || task.aptDate,
      fromEnd: task.endDate || task.aptDate,
      toStart: newStartDate,
      toEnd: newEndDate,
      reason,
      by: 'ผู้ใช้'
    });

    const updatedData = {
      ...task,
      startDate: newStartDate,
      endDate: newEndDate,
      aptDate: newStartDate,
      timeline: updatedTimeline
    };

    await saveTask(updatedData, true, task.id);
    alert("บันทึกการขอเลื่อนวันเริ่ม/วันจบงานเรียบร้อยแล้ว");
  };

  const handleConfirmCancel = async (task, reason) => {
    try {
      if (task.quoteFileUrl || task.quoteFileId) await deleteFileFromStore(task.quoteFileUrl || task.quoteFileId);
      if (task.taskFileUrl || task.taskFileId) await deleteFileFromStore(task.taskFileUrl || task.taskFileId);
      if (task.signedFileUrl || task.signedFileId) await deleteFileFromStore(task.signedFileUrl || task.signedFileId);

      const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'vtrack_tasks', task.id);
      const updatedTimeline = appendTimelineEvent(task.timeline, {
        type: 'cancelled',
        reason,
        by: 'ผู้ใช้'
      });

      await updateDoc(docRef, {
        isDeleted: true,
        status: 'ยกเลิก',
        cancelReason: reason,
        cancelledAt: Date.now(),
        quoteFileUrl: null,
        quoteFileId: null,
        quoteFileName: null,
        quoteFilePath: null,
        taskFileUrl: null,
        taskFileId: null,
        taskFileName: null,
        taskFilePath: null,
        signedFileUrl: null,
        signedFileId: null,
        signedFileName: null,
        signedFilePath: null,
        timeline: updatedTimeline,
        updatedAt: Date.now()
      });

      if (viewDetailTask && viewDetailTask.id === task.id) {
        setViewDetailTask(null);
      }
      alert("ยกเลิกใบงานและทำความสะอาดไฟล์ในพื้นที่จัดเก็บเรียบร้อยแล้ว");
    } catch (err) {
      console.error("Confirm cancel error:", err);
      alert("เกิดข้อผิดพลาดในการยกเลิก: " + err.message);
    }
  };

  const handleRestoreTask = async (task) => {
    const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'vtrack_tasks', task.id);
    const updatedTimeline = appendTimelineEvent(task.timeline, {
      type: 'restored',
      note: 'กู้คืนรายการใบงานจากการยกเลิก'
    });
    await updateDoc(docRef, {
      isDeleted: false,
      status: 'รอใบเสนอราคา',
      timeline: updatedTimeline,
      updatedAt: Date.now()
    });
    alert("กู้คืนรายการใบงานเรียบร้อยแล้ว");
  };

  const handleConfirmDisbursement = async (task, payDate, note) => {
    if (!task || !payDate) return;
    const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'vtrack_tasks', task.id);
    const updatedTimeline = appendTimelineEvent(task.timeline, {
      type: 'status_change',
      from: task.status,
      to: 'ส่งเอกสารเบิกจ่ายแล้ว',
      note: `ส่งเอกสารเบิกจ่ายแล้ว (กำหนดวันทำจ่าย: ${payDate})${note ? ` [หมายเหตุ: ${note}]` : ''}`
    });
    const updatePayload = {
      status: 'ส่งเอกสารเบิกจ่ายแล้ว',
      payDate: payDate,
      statusUpdatedAt: Date.now(),
      updatedAt: Date.now(),
      timeline: updatedTimeline
    };
    if (note) updatePayload.disbursementNote = note;
    await updateDoc(docRef, updatePayload);
    setDisbursementModalTask(null);
    if (viewDetailTask && viewDetailTask.id === task.id) {
      setViewDetailTask(prev => ({
        ...prev,
        ...updatePayload
      }));
    }
  };

  const executeDownload = async (urlOrId, filename) => {
    try {
      if (!urlOrId) return;
      if (urlOrId.startsWith('http://') || urlOrId.startsWith('https://')) {
        window.open(urlOrId, '_blank');
        return;
      }
      const dataUrl = await getFileDataUrl(urlOrId);
      if (!dataUrl) {
        alert("ไม่พบข้อมูลไฟล์ในระบบ");
        return;
      }
      const blob = base64ToBlob(dataUrl);
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename || 'document.pdf';
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 20000);
    } catch (err) {
      console.error("Open file error:", err);
      alert("เกิดข้อผิดพลาดในการเปิดไฟล์: " + err.message);
    }
  };

  const handleRequestDownload = (url, filename) => {
    if (!url) return;
    executeDownload(url, filename);
  };

  const handlePreviewPdf = (url, title, filename) => {
    if (!url) return;
    setPdfPreviewModal({ url, title: title || filename || 'เอกสาร PDF', filename });
  };

  const clearAllData = async () => {
    const tasksRef = collection(db, 'artifacts', appId, 'public', 'data', 'vtrack_tasks');
    const snapshot = await getDocs(tasksRef);
    const deletePromises = snapshot.docs.map(d => deleteDoc(d.ref));
    await Promise.all(deletePromises);
  };

  const updateSettings = async (newSet) => {
    const settingsRef = doc(db, 'artifacts', appId, 'public', 'data', 'vtrack_settings', 'general');
    await setDoc(settingsRef, newSet);
  };

  const lockAdmin = () => {
    setIsUnlocked(false);
    setEditTask(null);
    if (['add', 'settings'].includes(activeTab)) setActiveTab('dashboard');
  };

  if (systemError) return <div className="p-8 text-center text-red-500 font-bold">{systemError}</div>;
  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="w-12 h-12 border-4 border-[#003366]/10 border-t-[#FFD93D] rounded-full animate-spin"></div></div>;

  if (isPrinting && printData) {
    return <PrintReport tasks={tasks} printData={printData} onDone={() => setIsPrinting(false)} />;
  }

  return (
    <div className="flex flex-col md:flex-row h-screen bg-[#FFFBEB] text-black font-sans overflow-hidden relative">
      <aside className={`hidden md:flex ${isSidebarOpen ? 'w-68' : 'w-20'} flex-col bg-black text-white transition-all duration-300 relative z-20 overflow-hidden border-r-4 border-black`}>
        {/* Architectural Subtle Grid Overlay inside Sidebar */}
        {/* Brand Section */}
        <div className="h-20 flex items-center justify-between px-6 border-b border-[#FFD93D]/15 relative z-10">
          {isSidebarOpen ? (
            <div className="flex flex-col">
              <span className=" font-bold text-2xl tracking-wider text-white">
                V<span className="text-[#FFD93D]">-TRACK</span>
              </span>
              <span className="text-xs tracking-[0.2em] font-mono-tech text-[#FFD93D]/80 uppercase">
                LAND & HOUSES • ENG.
              </span>
            </div>
          ) : (
            <span className=" font-bold text-xl text-[#FFD93D] mx-auto">VT</span>
          )}
          <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)} 
            className="p-2 hover:bg-[#FFD93D]/10 text-white/70 hover:text-[#FFD93D] rounded-lg transition-colors border border-transparent hover:border-[#FFD93D]/30"
          >
            <Menu size={18}/>
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-2 relative z-10">
          <NavItem id="dashboard" icon={LayoutDashboard} label="แดชบอร์ด" active={activeTab} set={setActiveTab} open={isSidebarOpen}/>
          {isUnlocked && <NavItem id="add" icon={PlusCircle} label="เพิ่มใบงาน" active={activeTab} set={setActiveTab} open={isSidebarOpen}/>}
          {isUnlocked && (
            <div className="pt-4 mt-2 border-t-2 border-white/20 space-y-2">
              <NavItem id="settings" icon={Settings} label="ตั้งค่าระบบ" active={activeTab} set={setActiveTab} open={isSidebarOpen}/>
            </div>
          )}
        </nav>

        {/* 80s Architectural Edition Stamp in footer */}
        {isSidebarOpen && (
          <div className="p-4 border-t border-[#FFD93D]/15 bg-black border-t-2 border-white/30 relative z-10 text-xs font-mono-tech text-white/50 flex flex-col gap-0.5">
            <div className="flex items-center justify-between text-[#FFD93D]/80 font-semibold">
              <span>LH ARCHITECTURE</span>
              <span>EST. 1983</span>
            </div>
            <span>SYS_VER: 2.8.4 [PROD]</span>
          </div>
        )}
      </aside>

      <main className="flex-1 flex flex-col h-full overflow-hidden relative z-10">
        <header className="h-16 md:h-20 bg-white border-b-4 border-black flex items-center justify-between px-4 md:px-8 sticky top-0 z-30">
          <div className="flex items-center space-x-3">
            <div>
              <h2 className="text-base md:text-xl  font-black text-black tracking-tight">
                ระบบจัดการใบงาน V-TRACK
              </h2>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            {isUnlocked ? (
              <button onClick={lockAdmin} className="brut-btn min-h-12 px-4 bg-[#B8F2C9] text-sm font-extrabold flex items-center gap-2" title="ออกจากโหมดแอดมิน">
                <Unlock size={16}/><span>แอดมิน • ออกจากระบบ</span>
              </button>
            ) : (
              <button
                onClick={() => setPasscodeModal({ isOpen: true, title: 'ใส่รหัสผ่านเพื่อเข้าโหมดแอดมิน', onSuccess: () => { setIsUnlocked(true); setPasscodeModal({ isOpen: false, title: '', onSuccess: null }); } })}
                className="brut-btn min-h-12 px-4 bg-[#FFD93D] text-sm font-extrabold flex items-center gap-2"
              >
                <Lock size={16}/><span>เข้าสู่ระบบแอดมิน</span>
              </button>
            )}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto pb-24 md:pb-8 p-4 md:p-8 custom-scrollbar">
          <div className="max-w-6xl mx-auto">
            {(
              <>
                {activeTab === 'dashboard' && (
                  <Dashboard 
                    tasks={tasks} 
                    settings={settings} 
                    onViewDetail={(t) => setViewDetailTask(t)}
                    onOpenReschedule={(t) => setRescheduleModalTask(t)}
                    isUnlocked={isUnlocked}
                    onSave={saveTask}
                    onEdit={(t) => setEditTask(t)}
                    onRequestCancel={(t) => setCancelModalTask(t)}
                    onRequestDisbursement={(t) => setDisbursementModalTask(t)}
                  />
                )}
                {activeTab === 'add' && isUnlocked && (
                  <TaskForm 
                    settings={settings} 
                    onSave={saveTask} 
                    onSuccess={() => setActiveTab('dashboard')} 
                  />
                )}
                {activeTab === 'settings' && isUnlocked && (
                  <SettingsPanel 
                    settings={settings} 
                    updateSettings={updateSettings} 
                    tasks={tasks} 
                    onSave={saveTask} 
                    onClear={clearAllData} 
                    onRestoreTask={handleRestoreTask}
                    triggerPrint={(d) => { setPrintData(d); setIsPrinting(true); }} 
                  />
                )}
              </>
            )}
          </div>
        </div>

        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white/95 border-t border-black flex justify-around items-center h-16 z-30">
          <MobileNavItem id="dashboard" icon={LayoutDashboard} label="แดชบอร์ด" active={activeTab} set={setActiveTab} />
          {isUnlocked && <MobileNavItem id="add" icon={PlusCircle} label="เพิ่มใบงาน" active={activeTab} set={setActiveTab} />}
          {isUnlocked && <MobileNavItem id="settings" icon={Settings} label="ตั้งค่า" active={activeTab} set={setActiveTab} />}
        </nav>
      </main>

      {/* Global Modals for V2 Operations */}
      {viewDetailTask && (
        <div className="fixed inset-0 bg-black/70 flex items-end md:items-center justify-center z-[70] p-0 md:p-4 overflow-y-auto">
          <div className="relative w-full max-w-3xl mt-16 md:mt-0 animate-in slide-in-from-bottom-full md:zoom-in-95 duration-300">
            <button 
              onClick={() => setViewDetailTask(null)} 
              className="absolute top-4 right-4 md:top-6 md:right-6 z-20 brut-btn min-h-12 min-w-12 bg-white flex items-center justify-center" aria-label="ปิด"
            >
              <X size={20}/>
            </button>
            <TaskDetailView 
              task={viewDetailTask} 
              onClose={() => setViewDetailTask(null)}
              onUploadQuote={handleUploadQuote}
              onOpenSign={(t) => setSignatureModalTask(t)}
              onOpenTaskOrder={(t) => setTaskOrderModalTask(t)}
              onOpenReschedule={(t) => setRescheduleModalTask(t)}
              onRequestCancel={(t) => setCancelModalTask(t)}
              onRequestDownload={handleRequestDownload}
              onPreviewPdf={handlePreviewPdf}
              onRequestDisbursement={(t) => setDisbursementModalTask(t)}
              isUnlocked={isUnlocked}
            />
          </div>
        </div>
      )}

      {editTask && isUnlocked && (
        <div className="fixed inset-0 bg-black/70 z-[75] overflow-y-auto p-0 md:p-6">
          <TaskForm
            settings={settings}
            initialData={editTask}
            onSave={saveTask}
            onSuccess={() => setEditTask(null)}
            onCancel={() => setEditTask(null)}
            isModal
          />
        </div>
      )}

      <PdfViewerModal
        isOpen={!!pdfPreviewModal}
        onClose={() => setPdfPreviewModal(null)}
        fileUrlOrId={pdfPreviewModal?.url}
        title={pdfPreviewModal?.title}
        fileName={pdfPreviewModal?.filename}
        onDownload={() => executeDownload(pdfPreviewModal?.url, pdfPreviewModal?.filename)}
      />

      <SignaturePadModal 
        task={signatureModalTask} 
        isOpen={!!signatureModalTask} 
        onClose={() => setSignatureModalTask(null)} 
        onConfirm={handleConfirmSign} 
      />

      <TaskOrderUploadModal 
        task={taskOrderModalTask} 
        isOpen={!!taskOrderModalTask} 
        onClose={() => setTaskOrderModalTask(null)} 
        onConfirm={handleConfirmTaskOrder} 
      />

      <RescheduleModal 
        task={rescheduleModalTask} 
        isOpen={!!rescheduleModalTask} 
        onClose={() => setRescheduleModalTask(null)} 
        onConfirm={handleConfirmReschedule} 
      />

      <CancelTaskModal 
        task={cancelModalTask} 
        isOpen={!!cancelModalTask} 
        onClose={() => setCancelModalTask(null)} 
        onConfirm={handleConfirmCancel} 
      />

      <AdminPasscodeModal 
        isOpen={passcodeModal.isOpen} 
        onClose={() => setPasscodeModal({ isOpen: false, title: '', onSuccess: null })} 
        onSuccess={passcodeModal.onSuccess} 
        title={passcodeModal.title} 
      />

      <PaymentDateModal 
        task={disbursementModalTask} 
        isOpen={!!disbursementModalTask} 
        onClose={() => setDisbursementModalTask(null)} 
        onConfirm={handleConfirmDisbursement} 
      />
    </div>
  );
}

// --- UI Sub-Components ---
function NavItem({ id, icon: Icon, label, active, set, open }) {
  const isAct = active === id;
  return (
    <button 
      onClick={() => set(id)} 
      className={`w-full flex items-center space-x-3 px-3.5 py-3 transition-all duration-300 relative select-none ${
        isAct 
          ? 'bg-[#FFD93D] text-black font-extrabold border-2 border-black shadow-[3px_3px_0_0_#000]' 
          : 'text-white/70 hover:bg-white/5 hover:text-white rounded-lg'
      }`}
    >
      {isAct && (
        <span className="absolute left-0 top-2 bottom-2 w-1 bg-black rounded-r-sm"></span>
      )}
      <Icon size={18} strokeWidth={isAct ? 2.5 : 2} className={isAct ? 'text-black' : 'text-[#FFD93D]/90'} />
      {open && <span className="text-xs font-semibold tracking-wide">{label}</span>}
    </button>
  );
}

function MobileNavItem({ id, icon: Icon, label, active, set }) {
  const isAct = active === id;
  return (
    <button 
      onClick={() => set(id)} 
      className={`flex flex-col items-center justify-center flex-1 h-full transition-colors relative ${
        isAct ? 'text-black' : 'text-gray-600'
      }`}
    >
      {isAct && <div className="absolute top-0 w-8 h-1 bg-[#FFD93D] rounded-b-full"></div>}
      <Icon size={18} strokeWidth={isAct ? 2.5 : 2} className={isAct ? 'text-[#FFD93D]' : ''} />
      <span className="text-xs mt-1 font-bold">{label}</span>
    </button>
  );
}

// -------------------------------------------------------------
// Modals & Sub-Components for V2 Operational System
// -------------------------------------------------------------

function AdminPasscodeModal({ isOpen, onClose, onSuccess, title = "กรุณากรอกรหัสผ่านผู้ดูแลเพื่อดำเนินการ" }) {
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (pin === '1312') {
      setErr('');
      setPin('');
      onSuccess();
    } else {
      setErr('รหัสผ่านไม่ถูกต้อง');
      setPin('');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[110] p-4 animate-in fade-in duration-200">
      <div className="bg-white p-8 brut-panel w-full max-w-sm text-center relative">
        <button onClick={onClose} className="absolute top-6 right-6 p-2 bg-gray-50 rounded-full text-gray-600 hover:bg-gray-100"><X size={18}/></button>
        <div className="w-16 h-16 bg-black/5 rounded-full flex items-center justify-center mx-auto mb-4 text-black"><Lock size={26}/></div>
        <h3 className="font-bold text-gray-800 text-lg mb-1">ยืนยันสิทธิ์ผู้ดูแล (Admin)</h3>
        <p className="text-xs text-gray-600 mb-6 font-medium">{title}</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input 
            type="password" 
            value={pin} 
            onChange={e => setPin(e.target.value)} 
            maxLength={4} 
            placeholder="••••" 
            className="w-full text-center text-3xl tracking-[0.5em] p-3.5 bg-gray-50 rounded-2xl border-2 border-black focus:ring-2 focus:ring-[#FFD93D]" 
            autoFocus 
          />
          {err && <p className="text-xs text-red-500 font-bold">{err}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="flex-1 py-3.5 rounded-xl font-bold text-xs bg-gray-100 text-gray-600 hover:bg-gray-200">ยกเลิก</button>
            <button type="submit" className="flex-1 py-3.5 rounded-xl font-bold text-xs bg-black text-white hover:bg-[#333]">ยืนยันรหัส</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PaymentDateModal({ task, isOpen, onClose, onConfirm }) {
  const [payDate, setPayDate] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (task) {
      setPayDate(task.payDate || new Date().toISOString().slice(0, 10));
      setNote(task.disbursementNote || '');
    }
  }, [task, isOpen]);

  if (!isOpen || !task) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!payDate) return;
    setLoading(true);
    await onConfirm(task, payDate, note.trim());
    setLoading(false);
    onClose();
  };

  const setPreset = (daysFromNow) => {
    const d = new Date();
    d.setDate(d.getDate() + daysFromNow);
    setPayDate(d.toISOString().slice(0, 10));
  };

  const setEndOfMonth = () => {
    const d = new Date();
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    setPayDate(lastDay.toISOString().slice(0, 10));
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[110] p-4 animate-in fade-in duration-200">
      <div className="bg-white p-6 md:p-8 brut-panel w-full max-w-md text-left relative">
        <button onClick={onClose} className="absolute top-6 right-6 p-2 bg-gray-50 rounded-full text-gray-600 hover:bg-gray-100"><X size={18}/></button>
        
        <div className="flex items-center space-x-3 mb-4">
          <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center shrink-0 border border-emerald-100 shadow-sm">
            <DollarSign size={24}/>
          </div>
          <div>
            <h3 className="font-bold text-gray-800 text-lg">ระบุวันที่ทำจ่าย</h3>
            <p className="text-xs text-gray-600">สถานะ: ส่งเอกสารเบิกจ่ายแล้ว</p>
          </div>
        </div>

        {/* Task summary */}
        <div className="p-3.5 bg-gray-50 rounded-2xl border border-black mb-4 space-y-1">
          <div className="flex justify-between items-center text-xs">
            <span className="font-bold text-black">{task.taskNo}</span>
            <span className="font-bold text-emerald-600">
              {task.cost ? `฿ ${isNaN(task.cost) ? task.cost : Number(task.cost).toLocaleString()}` : 'ไม่ระบุยอดเงิน'}
            </span>
          </div>
          <div className="text-xs text-gray-500 truncate">{task.project} • {task.company}</div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-gray-600 uppercase tracking-widest block ml-1">
              วันที่ทำจ่าย (วันที่จะได้รับเงิน) *
            </label>
            <input 
              type="date" 
              required 
              value={payDate} 
              onChange={e => setPayDate(e.target.value)} 
              className="w-full p-3.5 bg-gray-50 rounded-2xl border-2 border-black focus:ring-2 focus:ring-emerald-500 text-sm font-semibold text-gray-800" 
            />
            {/* Quick date presets */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              <button type="button" onClick={() => setPreset(0)} className="text-xs px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg font-medium">วันนี้</button>
              <button type="button" onClick={() => setPreset(7)} className="text-xs px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg font-medium">+7 วัน</button>
              <button type="button" onClick={() => setPreset(15)} className="text-xs px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg font-medium">+15 วัน</button>
              <button type="button" onClick={setEndOfMonth} className="text-xs px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg font-medium">สิ้นเดือนนี้</button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-gray-600 uppercase tracking-widest block ml-1">
              หมายเหตุการทำจ่าย (ถ้ามี)
            </label>
            <input 
              type="text" 
              value={note} 
              onChange={e => setNote(e.target.value)} 
              placeholder="เช่น รอบโอนวันที่ 15, โอนผ่าน KTB" 
              className="w-full p-3.5 bg-gray-50 rounded-2xl border-2 border-black focus:ring-2 focus:ring-emerald-500 text-sm text-gray-700" 
            />
          </div>

          <div className="p-3 bg-emerald-50/60 rounded-xl border border-emerald-100/60 text-xs text-emerald-800">
            💡 เมื่อระบุวันที่ทำจ่าย รายการนี้จะถือว่าสมบูรณ์ และจะแสดงในรายงานประจำเดือนที่ทำจ่าย
          </div>

          <div className="flex gap-2 pt-2">
            <button 
              type="button" 
              onClick={onClose} 
              disabled={loading}
              className="flex-1 py-3.5 rounded-xl font-bold text-xs bg-gray-100 text-gray-600 hover:bg-gray-200"
            >
              ยกเลิก
            </button>
            <button 
              type="submit" 
              disabled={loading || !payDate}
              className="flex-1 py-3.5 rounded-xl font-bold text-xs bg-emerald-600 text-white hover:bg-emerald-700 shadow-md shadow-emerald-600/20 active:scale-95 transition-transform"
            >
              {loading ? 'กำลังบันทึก...' : 'ยืนยันวันทำจ่าย'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CancelTaskModal({ task, isOpen, onClose, onConfirm }) {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen || !task) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!reason.trim()) return;
    setLoading(true);
    await onConfirm(task, reason.trim());
    setLoading(false);
    setReason('');
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100] p-4 animate-in fade-in duration-200">
      <div className="bg-white p-8 brut-panel w-full max-w-md text-left relative">
        <button onClick={onClose} className="absolute top-6 right-6 p-2 bg-gray-50 rounded-full text-gray-600 hover:bg-gray-100"><X size={18}/></button>
        <div className="flex items-center space-x-3 mb-4">
          <div className="w-12 h-12 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center shrink-0"><AlertTriangle size={24}/></div>
          <div>
            <h3 className="font-bold text-lg text-gray-900">ยกเลิกใบงาน #{task.taskNo}</h3>
            <p className="text-xs text-gray-600">ระบบจะทำการลบไฟล์ PDF ทั้งหมดใน Storage เพื่อประหยัดพื้นที่</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="space-y-1">
            <label className="text-xs font-bold text-gray-700">เหตุผลในการยกเลิก <span className="text-red-500">*จำเป็น</span></label>
            <textarea
              required
              rows={3}
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="ระบุสาเหตุ เช่น ร้านค้าไม่สามารถเข้างานได้, ยกเลิกโครงการ, ฯลฯ"
              className="w-full p-3.5 bg-gray-50 rounded-2xl text-xs md:text-sm border-2 border-black focus:ring-2 focus:ring-red-400 resize-none"
            />
          </div>
          <div className="bg-amber-50 p-3.5 rounded-xl border border-amber-200/60 text-amber-800 text-xs leading-relaxed">
            ⚠️ <strong>หมายเหตุ:</strong> ข้อมูลจะถูกจัดเก็บเข้าคลัง "รายการที่ยกเลิก" สำหรับการตรวจสอบย้อนหลัง โดยจะไม่แสดงบนหน้ากระดานหลักอีก
          </div>
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} disabled={loading} className="flex-1 py-3.5 rounded-xl font-bold text-xs bg-gray-100 text-gray-600 hover:bg-gray-200">ย้อนกลับ</button>
            <button type="submit" disabled={loading} className="flex-1 py-3.5 rounded-xl font-bold text-xs bg-red-600 text-white hover:bg-red-700 flex items-center justify-center space-x-1.5">
              {loading ? <span className="animate-spin mr-1">⏳</span> : <Trash2 size={15}/>}
              <span>ยืนยันยกเลิกใบงาน</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PdfViewerModal({ isOpen, onClose, fileUrlOrId, title, fileName, onDownload }) {
  const [blobUrl, setBlobUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isOpen || !fileUrlOrId) {
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
        setBlobUrl(null);
      }
      setLoading(true);
      setError(null);
      return;
    }

    let isMounted = true;
    let localBlobUrl = null;

    const loadPdf = async () => {
      setLoading(true);
      setError(null);
      try {
        const dUrl = await getFileDataUrl(fileUrlOrId);
        if (!isMounted) return;
        if (!dUrl) {
          throw new Error('ไม่พบข้อมูลไฟล์เอกสารในระบบ');
        }
        const blob = base64ToBlob(dUrl);
        localBlobUrl = URL.createObjectURL(blob);
        setBlobUrl(localBlobUrl);
      } catch (err) {
        if (isMounted) setError(err.message || 'ไม่สามารถเปิดเอกสารได้');
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadPdf();

    return () => {
      isMounted = false;
      if (localBlobUrl) {
        URL.revokeObjectURL(localBlobUrl);
      }
    };
  }, [isOpen, fileUrlOrId]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 flex flex-col items-center justify-center z-[120] p-2 md:p-6 animate-in fade-in duration-200">
      <div className="bg-[#1e293b] border border-gray-700 w-full max-w-5xl h-[92vh] flex flex-col overflow-hidden border-4 border-black relative">
        {/* Header bar */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-[#0f172a] border-b border-gray-800 text-white shrink-0">
          <div className="flex items-center space-x-3 truncate">
            <div className="w-8 h-8 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center shrink-0">
              <FileText size={18} />
            </div>
            <div className="truncate text-left">
              <h3 className="font-bold text-sm truncate text-white">{title || fileName || 'เอกสาร PDF'}</h3>
              <p className="text-xs text-gray-600">พรีวิวอ่านเอกสารในระบบ (ไม่บันทึกลงหน่วยความจำเครื่อง)</p>
            </div>
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            {blobUrl && (
              <a
                href={blobUrl}
                target="_blank"
                rel="noreferrer"
                className="hidden sm:flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-gray-800 hover:bg-gray-700 text-gray-200 transition-colors"
                title="เปิดในแท็บใหม่"
              >
                <Eye size={14} />
                <span>เปิดแท็บใหม่</span>
              </a>
            )}
            {onDownload && (
              <button
                onClick={onDownload}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white transition-colors"
                title="บันทึกไฟล์ลงเครื่อง"
              >
                <Download size={14} />
                <span>ดาวน์โหลด</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-600 hover:text-white transition-colors"
              title="ปิด"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 bg-slate-900 flex items-center justify-center relative overflow-hidden">
          {loading && (
            <div className="flex flex-col items-center space-y-3 text-gray-600">
              <Loader2 size={36} className="animate-spin text-blue-400" />
              <p className="text-xs">กำลังโหลดเอกสารขึ้นอ่าน...</p>
            </div>
          )}

          {error && (
            <div className="p-6 text-center text-red-400 max-w-md">
              <AlertCircle size={36} className="mx-auto mb-2 text-red-400" />
              <p className="text-sm font-bold">{error}</p>
              <button
                onClick={onClose}
                className="mt-4 px-4 py-2 bg-gray-800 text-white rounded-xl text-xs font-bold hover:bg-gray-700"
              >
                ปิดหน้าต่าง
              </button>
            </div>
          )}

          {!loading && !error && blobUrl && (
            <iframe
              src={`${blobUrl}#toolbar=1&navpanes=0`}
              className="w-full h-full border-0 bg-white"
              title={title || 'PDF Preview'}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function SignaturePadModal({ task, isOpen, onClose, onConfirm }) {
  const canvasRef = useRef(null);
  const [signMode, setSignMode] = useState('draw'); // 'draw' | 'image'
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [uploadedImage, setUploadedImage] = useState(null);
  const [uploadedImageName, setUploadedImageName] = useState('');
  const [currentSigPreview, setCurrentSigPreview] = useState('');
  const [signing, setSigning] = useState(false);

  // Signer & Placement Settings
  const [signerName, setSignerName] = useState('เจ้าหน้าที่โครงการ');
  const [signerRole, setSignerRole] = useState('ผู้ตรวจรับงาน / วิศวกรโครงการ');
  const [placement, setPlacement] = useState('bottom-right');
  const [targetPages, setTargetPages] = useState('last');
  const [includeSeal, setIncludeSeal] = useState(true);

  useEffect(() => {
    if (!isOpen) return;
    setHasDrawn(false);
    setUploadedImage(null);
    setUploadedImageName('');
    setCurrentSigPreview('');
    setSignMode('draw');
    const timer = setTimeout(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * 2;
      canvas.height = rect.height * 2;
      ctx.scale(2, 2);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#002244';
      ctx.clearRect(0, 0, rect.width, rect.height);
    }, 100);
    return () => clearTimeout(timer);
  }, [isOpen]);

  if (!isOpen || !task) return null;

  const getCoordinates = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  };

  const handlePointerDown = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const { x, y } = getCoordinates(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
    setHasDrawn(true);
    e.target.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const { x, y } = getCoordinates(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const handlePointerUp = (e) => {
    if (!isDrawing) return;
    setIsDrawing(false);
    try { e.target.releasePointerCapture(e.pointerId); } catch {}
    const canvas = canvasRef.current;
    if (canvas) {
      setCurrentSigPreview(canvas.toDataURL('image/png'));
    }
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    setHasDrawn(false);
    setCurrentSigPreview('');
  };

  const handleImageFileChange = async (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setUploadedImageName(file.name);
      try {
        const pngDataUrl = await convertImageToPngDataUrl(file);
        setUploadedImage(pngDataUrl);
        setCurrentSigPreview(pngDataUrl);
      } catch (err) {
        alert("ไม่สามารถอ่านรูปภาพได้: " + err.message);
      }
    }
  };

  const handleConfirm = async () => {
    if (signMode === 'draw' && !hasDrawn) {
      alert("กรุณาลงลายมือชื่อก่อนยืนยัน");
      return;
    }
    if (signMode === 'image' && !uploadedImage) {
      alert("กรุณาเลือกไฟล์รูปภาพลายเซ็นต์ก่อนยืนยัน");
      return;
    }

    setSigning(true);
    try {
      let finalSignatureDataUrl = '';
      if (signMode === 'draw') {
        const canvas = canvasRef.current;
        if (!canvas) return;
        finalSignatureDataUrl = canvas.toDataURL('image/png');
      } else {
        finalSignatureDataUrl = uploadedImage;
      }

      await onConfirm(task, {
        signatureDataUrl: finalSignatureDataUrl,
        signerName: signerName.trim() || 'เจ้าหน้าที่โครงการ',
        signerRole: signerRole.trim() || 'ผู้ตรวจรับงาน',
        placement,
        targetPages,
        includeSeal,
      });
      onClose();
    } catch (err) {
      console.error("Signature error:", err);
      alert("เกิดข้อผิดพลาดในการประทับลายเซ็น: " + err.message);
    } finally {
      setSigning(false);
    }
  };

  const canConfirm = signMode === 'draw' ? hasDrawn : !!uploadedImage;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100] p-4 animate-in fade-in duration-200">
      <div className="bg-white p-6 md:p-8 brut-panel w-full max-w-2xl text-left relative max-h-[92vh] overflow-y-auto">
        <button onClick={onClose} className="absolute top-6 right-6 p-2 bg-gray-50 rounded-full text-gray-600 hover:bg-gray-100"><X size={18}/></button>
        <div className="flex items-center space-x-3 mb-4">
          <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center shrink-0"><PenTool size={22}/></div>
          <div>
            <h3 className="font-bold text-lg text-gray-900">ตรวจรับและเซ็นต์อนุมัติใบเสนอราคา</h3>
            <p className="text-xs text-gray-600">ใบงาน #{task.taskNo} ({task.company}) • ระบบประทับตราดิจิทัลมาตรฐาน LH</p>
          </div>
        </div>

        {/* Mode Switcher Tabs */}
        <div className="flex bg-indigo-50/70 p-1 rounded-2xl mb-4 border border-indigo-100">
          <button
            type="button"
            onClick={() => {
              setSignMode('draw');
              const canvas = canvasRef.current;
              if (canvas && hasDrawn) {
                setCurrentSigPreview(canvas.toDataURL('image/png'));
              } else {
                setCurrentSigPreview('');
              }
            }}
            className={`flex-1 py-2 rounded-xl text-xs font-bold flex items-center justify-center space-x-1.5 transition-all ${signMode === 'draw' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-indigo-600'}`}
          >
            <PenTool size={14} />
            <span>วาดลายเซ็นต์ (สไตลัส/สัมผัส)</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setSignMode('image');
              if (uploadedImage) {
                setCurrentSigPreview(uploadedImage);
              } else {
                setCurrentSigPreview('');
              }
            }}
            className={`flex-1 py-2 rounded-xl text-xs font-bold flex items-center justify-center space-x-1.5 transition-all ${signMode === 'image' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-indigo-600'}`}
          >
            <ImageIcon size={14} />
            <span>แนบรูปลายเซ็นต์ (PNG/JPG)</span>
          </button>
        </div>

        {signMode === 'draw' ? (
          <div className="space-y-2">
            <div className="flex justify-between items-center text-xs font-bold text-gray-500">
              <span>ลงลายมือชื่อด้านล่าง (รองรับปากกาสไตลัส & สัมผัส)</span>
              <button onClick={clearSignature} type="button" className="text-red-500 hover:underline flex items-center gap-1"><RotateCcw size={12}/> ล้างลายเซ็น</button>
            </div>

            <div className="relative border-2 border-dashed border-indigo-200 rounded-2xl bg-indigo-50/20 overflow-hidden touch-none h-40 flex items-center justify-center">
              <canvas
                ref={canvasRef}
                className="w-full h-full cursor-crosshair"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
              />
              {!hasDrawn && (
                <div className="pointer-events-none absolute text-center text-gray-600">
                  <PenTool size={24} className="mx-auto mb-1 opacity-40"/>
                  <span className="text-xs font-medium">เซ็นต์ชื่อที่นี่...</span>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex justify-between items-center text-xs font-bold text-gray-500">
              <span>เลือกไฟล์รูปภาพลายเซ็นต์ทางการ</span>
              {uploadedImage && (
                <button onClick={() => { setUploadedImage(null); setUploadedImageName(''); setCurrentSigPreview(''); }} type="button" className="text-red-500 hover:underline flex items-center gap-1">
                  <RotateCcw size={12}/> เปลี่ยนรูปภาพ
                </button>
              )}
            </div>

            {!uploadedImage ? (
              <label className="border-2 border-dashed border-indigo-200 hover:border-indigo-400 rounded-2xl bg-indigo-50/20 hover:bg-indigo-50/40 p-6 flex flex-col items-center justify-center cursor-pointer transition-all h-40 text-center">
                <ImageIcon size={32} className="text-indigo-400 mb-2 opacity-80" />
                <span className="text-xs font-bold text-indigo-700">คลิกเพื่อเลือกไฟล์รูปลายเซ็นต์</span>
                <span className="text-xs text-gray-600 mt-1">รองรับ PNG (แนะนำพื้นหลังโปร่งแสง), JPG, JPEG, WebP</span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/jpg"
                  className="hidden"
                  onChange={handleImageFileChange}
                />
              </label>
            ) : (
              <div className="border border-indigo-200 rounded-2xl bg-indigo-50/10 p-3 flex flex-col items-center justify-center h-40 relative">
                <img
                  src={uploadedImage}
                  alt="ลายเซ็นต์ที่แนบ"
                  className="max-h-28 max-w-full object-contain filter drop-shadow-sm"
                />
                <span className="absolute bottom-2 left-3 right-3 text-xs font-mono text-gray-500 text-center truncate">
                  ✓ {uploadedImageName || 'รูปลายเซ็นต์พร้อมใช้งาน'}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Signer Details & Placement Configuration */}
        <div className="mt-4 p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
          <div className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
            <Sparkles size={14} className="text-indigo-600"/> การตั้งค่าข้อมูลผู้ตรวจรับ & ตราประทับ
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="font-semibold text-gray-600 block mb-1 flex items-center gap-1">
                <User size={13} className="text-indigo-500"/> ชื่อผู้ลงนาม / ตรวจรับ
              </label>
              <input
                type="text"
                value={signerName}
                onChange={(e) => setSignerName(e.target.value)}
                placeholder="ชื่อ-นามสกุล ผู้ลงนาม"
                className="w-full px-3 py-2 border border-black rounded-xl focus:ring-2 focus:ring-indigo-500 text-xs bg-white"
              />
            </div>
            <div>
              <label className="font-semibold text-gray-600 block mb-1 flex items-center gap-1">
                <Briefcase size={13} className="text-indigo-500"/> ตำแหน่ง
              </label>
              <input
                type="text"
                value={signerRole}
                onChange={(e) => setSignerRole(e.target.value)}
                placeholder="ตำแหน่ง เช่น วิศวกรโครงการ / จัดซื้อ"
                className="w-full px-3 py-2 border border-black rounded-xl focus:ring-2 focus:ring-indigo-500 text-xs bg-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs pt-1">
            <div>
              <label className="font-semibold text-gray-600 block mb-1">ตำแหน่งบนหน้า PDF</label>
              <select
                value={placement}
                onChange={(e) => setPlacement(e.target.value)}
                className="w-full px-2.5 py-2 border border-black rounded-xl bg-white text-xs"
              >
                <option value="bottom-right">มุมขวาล่าง (แนะนำ)</option>
                <option value="bottom-left">มุมซ้ายล่าง</option>
                <option value="top-right">มุมขวาบน</option>
              </select>
            </div>
            <div>
              <label className="font-semibold text-gray-600 block mb-1">หน้าที่ประทับตรา</label>
              <select
                value={targetPages}
                onChange={(e) => setTargetPages(e.target.value)}
                className="w-full px-2.5 py-2 border border-black rounded-xl bg-white text-xs"
              >
                <option value="last">หน้าสุดท้าย (แนะนำ)</option>
                <option value="first">หน้าแรก</option>
                <option value="all">ทุกหน้า</option>
              </select>
            </div>
            <div className="flex items-center sm:pt-5">
              <label className="flex items-center space-x-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={includeSeal}
                  onChange={(e) => setIncludeSeal(e.target.checked)}
                  className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-black"
                />
                <span className="font-semibold text-gray-700 text-xs">ตราประทับ LH V-Track</span>
              </label>
            </div>
          </div>
        </div>

        {/* Live Badge Preview Card */}
        <div className="mt-4 p-3 bg-indigo-50/40 border border-indigo-100 rounded-2xl">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-indigo-900 flex items-center gap-1.5">
              <Eye size={13} className="text-indigo-600" /> ตัวอย่างตราประทับจริงที่จะประทับลงบนเอกสาร PDF
            </span>
            <span className="text-xs bg-indigo-100 text-indigo-700 font-bold px-2.5 py-0.5 rounded-full">
              {placement === 'bottom-right' ? 'มุมขวาล่าง' : placement === 'bottom-left' ? 'มุมซ้ายล่าง' : 'มุมขวาบน'} • {targetPages === 'last' ? 'หน้าสุดท้าย' : targetPages === 'first' ? 'หน้าแรก' : 'ทุกหน้า'}
            </span>
          </div>

          <div className="bg-white border-2 border-blue-900 rounded-xl overflow-hidden shadow-sm text-left">
            <div className="bg-blue-900 text-white px-3 py-1.5 flex items-center justify-between">
              <span className="text-xs font-bold flex items-center gap-1">
                ✓ อนุมัติใบเสนอราคา (APPROVED QUOTATION)
              </span>
              <span className="text-xs text-blue-200 font-mono">
                JOB #{task.taskNo}
              </span>
            </div>

            <div className="p-3 grid grid-cols-12 gap-3 items-center">
              <div className="col-span-7 space-y-1 text-xs">
                <div className="flex">
                  <span className="text-gray-600 w-24 shrink-0">ผู้ตรวจรับ:</span>
                  <span className="font-bold text-gray-900 truncate">{signerName || 'เจ้าหน้าที่โครงการ'}</span>
                </div>
                <div className="flex">
                  <span className="text-gray-600 w-24 shrink-0">ตำแหน่ง:</span>
                  <span className="font-medium text-gray-700 truncate">{signerRole || 'ผู้ตรวจรับงาน'}</span>
                </div>
                <div className="flex">
                  <span className="text-gray-600 w-24 shrink-0">วันที่อนุมัติ:</span>
                  <span className="font-bold text-blue-900">
                    {new Date().toLocaleDateString('th-TH')}
                  </span>
                </div>
                <div className="text-xs text-gray-600 font-mono pt-1">
                  SECURITY VERIFIED • DIGITAL AUDIT TRAIL LOCK
                </div>
              </div>

              <div className="col-span-5 bg-slate-50 border border-dashed border-slate-300 rounded-lg p-2 flex flex-col items-center justify-center relative min-h-[75px]">
                {includeSeal && (
                  <div className="absolute top-1 right-1 border-2 border-red-500/40 rounded-full w-10 h-10 flex flex-col items-center justify-center text-red-600/75 text-[6px] font-bold leading-none pointer-events-none rotate-[-8deg]">
                    <span>LH V-TRACK</span>
                    <span className="text-xs">ตรวจรับ</span>
                  </div>
                )}
                {currentSigPreview ? (
                  <img src={currentSigPreview} alt="Signature Preview" className="max-h-12 max-w-full object-contain filter drop-shadow-sm" />
                ) : (
                  <span className="text-xs text-gray-600">(ลายเซ็นต์)</span>
                )}
                <div className="w-full border-t border-slate-200 mt-1 text-xs text-gray-600 text-center">
                  (ลายมือชื่อผู้ตรวจรับ)
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-2 pt-5">
          <button type="button" onClick={onClose} disabled={signing} className="flex-1 py-3.5 rounded-xl font-bold text-xs bg-gray-100 text-gray-600 hover:bg-gray-200">ยกเลิก</button>
          <button 
            type="button" 
            onClick={handleConfirm} 
            disabled={!canConfirm || signing} 
            className="flex-1 py-3.5 rounded-xl font-bold text-xs bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center space-x-1.5 shadow-lg shadow-indigo-200"
          >
            {signing ? <span className="animate-spin mr-1">⏳</span> : <ShieldCheck size={16}/>}
            <span>{signing ? 'กำลังประทับตราลง PDF...' : 'ยืนยันและประทับตราอนุมัติ'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function TaskOrderUploadModal({ task, isOpen, onClose, onConfirm }) {
  const [file, setFile] = useState(null);
  const [taskNo, setTaskNo] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (task && isOpen) {
      setTaskNo(task.taskNo || '');
      const today = new Date().toISOString().slice(0, 10);
      setStartDate(task.startDate || task.aptDate || today);
      setEndDate(task.endDate || task.aptDate || today);
      setFile(null);
    }
  }, [task, isOpen]);

  if (!isOpen || !task) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) {
      alert("กรุณาเลือกไฟล์ PDF ใบงานแจ้งซ่อม");
      return;
    }
    if (!taskNo.trim() || !startDate || !endDate) {
      alert("กรุณากรอกข้อมูลให้ครบถ้วน");
      return;
    }
    setUploading(true);
    try {
      await onConfirm(task, { file, taskNo: taskNo.trim(), startDate, endDate });
      onClose();
    } catch (err) {
      alert("เกิดข้อผิดพลาด: " + err.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100] p-4 animate-in fade-in duration-200">
      <div className="bg-white p-6 md:p-8 brut-panel w-full max-w-md text-left relative">
        <button onClick={onClose} className="absolute top-6 right-6 p-2 bg-gray-50 rounded-full text-gray-600 hover:bg-gray-100"><X size={18}/></button>
        <div className="flex items-center space-x-3 mb-4">
          <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center shrink-0"><FileText size={22}/></div>
          <div>
            <h3 className="font-bold text-lg text-gray-900">แนบใบงานแจ้งซ่อม & เปิดงานในระบบ</h3>
            <p className="text-xs text-gray-600">{task.project} — {task.company}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="space-y-1">
            <label className="text-xs font-bold text-gray-700">ไฟล์ใบงานแจ้งซ่อม (PDF) <span className="text-red-500">*</span></label>
            <input 
              type="file" 
              accept=".pdf,application/pdf"
              required
              onChange={e => setFile(e.target.files[0] || null)}
              className="w-full p-2.5 bg-gray-50 rounded-2xl text-xs border border-black file:mr-3 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-black file:text-white hover:file:bg-[#002244]"
            />
            {file && <span className="text-xs text-green-600 block mt-1">✓ เลือกไฟล์: {file.name} ({(file.size / 1024).toFixed(1)} KB)</span>}
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-gray-700">เลขที่ใบงานจริง (Task No.) <span className="text-red-500">*</span></label>
            <input 
              type="text"
              required
              value={taskNo}
              onChange={e => setTaskNo(e.target.value)}
              placeholder="เช่น JOB-69/001"
              className="w-full p-3 bg-gray-50 rounded-2xl text-xs md:text-sm border-2 border-black focus:ring-2 focus:ring-blue-400"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-700">วันเริ่มงาน <span className="text-red-500">*</span></label>
              <input 
                type="date"
                required
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="w-full p-3 bg-gray-50 rounded-2xl text-xs border-2 border-black focus:ring-2 focus:ring-blue-400"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-700">วันจบงาน <span className="text-red-500">*</span></label>
              <input 
                type="date"
                required
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="w-full p-3 bg-gray-50 rounded-2xl text-xs border-2 border-black focus:ring-2 focus:ring-blue-400"
              />
            </div>
          </div>

          <div className="flex gap-2 pt-3">
            <button type="button" onClick={onClose} disabled={uploading} className="flex-1 py-3.5 rounded-xl font-bold text-xs bg-gray-100 text-gray-600 hover:bg-gray-200">ยกเลิก</button>
            <button 
              type="submit" 
              disabled={uploading} 
              className="flex-1 py-3.5 rounded-xl font-bold text-xs bg-black text-white hover:bg-[#333] disabled:opacity-50 flex items-center justify-center space-x-1.5"
            >
              {uploading ? <span className="animate-spin mr-1">⏳</span> : <CheckCircle2 size={16}/>}
              <span>{uploading ? 'กำลังบันทึก...' : 'ยืนยันเปิดใบงาน'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function RescheduleModal({ task, isOpen, onClose, onConfirm }) {
  const [newStartDate, setNewStartDate] = useState('');
  const [newEndDate, setNewEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (task && isOpen) {
      setNewStartDate(task.startDate || task.aptDate || '');
      setNewEndDate(task.endDate || task.aptDate || '');
      setReason('');
    }
  }, [task, isOpen]);

  if (!isOpen || !task) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!newStartDate || !newEndDate || !reason.trim()) {
      alert("กรุณากรอกข้อมูลและระบุเหตุผล");
      return;
    }
    setLoading(true);
    try {
      await onConfirm(task, { newStartDate, newEndDate, reason: reason.trim() });
      onClose();
    } catch (err) {
      alert("เกิดข้อผิดพลาด: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100] p-4 animate-in fade-in duration-200">
      <div className="bg-white p-6 md:p-8 brut-panel w-full max-w-md text-left relative">
        <button onClick={onClose} className="absolute top-6 right-6 p-2 bg-gray-50 rounded-full text-gray-600 hover:bg-gray-100"><X size={18}/></button>
        <div className="flex items-center space-x-3 mb-4">
          <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center shrink-0"><CalendarDays size={22}/></div>
          <div>
            <h3 className="font-bold text-lg text-gray-900">ขอเลื่อนวันเริ่ม / วันจบงาน</h3>
            <p className="text-xs text-gray-600">ใบงาน #{task.taskNo}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="p-3 bg-gray-50 rounded-xl text-xs text-gray-600 space-y-1">
            <p><strong>แผนงานเดิม:</strong> {task.startDate || task.aptDate || '-'} ถึง {task.endDate || task.aptDate || '-'}</p>
            {task.originalEndDate && <p className="text-gray-600 text-xs">กำหนดการแรกสุดที่ตั้งไว้: {task.originalEndDate}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-700">วันเริ่มงานใหม่ <span className="text-red-500">*</span></label>
              <input 
                type="date"
                required
                value={newStartDate}
                onChange={e => setNewStartDate(e.target.value)}
                className="w-full p-3 bg-gray-50 rounded-2xl text-xs border-2 border-black focus:ring-2 focus:ring-amber-400"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-700">วันจบงานใหม่ <span className="text-red-500">*</span></label>
              <input 
                type="date"
                required
                value={newEndDate}
                onChange={e => setNewEndDate(e.target.value)}
                className="w-full p-3 bg-gray-50 rounded-2xl text-xs border-2 border-black focus:ring-2 focus:ring-amber-400"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-gray-700">สาเหตุที่ขอเลื่อนกำหนดการ <span className="text-red-500">*จำเป็น</span></label>
            <textarea
              required
              rows={3}
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="ระบุเหตุผล เช่น รออะไหล่, หน้างานติดปัญหาฝนตก, ร้านค้าขอเลื่อน ฯลฯ"
              className="w-full p-3.5 bg-gray-50 rounded-2xl text-xs md:text-sm border-2 border-black focus:ring-2 focus:ring-amber-400 resize-none"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} disabled={loading} className="flex-1 py-3.5 rounded-xl font-bold text-xs bg-gray-100 text-gray-600 hover:bg-gray-200">ยกเลิก</button>
            <button 
              type="submit" 
              disabled={loading} 
              className="flex-1 py-3.5 rounded-xl font-bold text-xs bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 flex items-center justify-center space-x-1.5"
            >
              {loading ? <span className="animate-spin mr-1">⏳</span> : <CheckCircle2 size={16}/>}
              <span>บันทึกการขอเลื่อน</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function TimelineView({ timeline = [] }) {
  if (!timeline || timeline.length === 0) {
    return (
      <div className="p-6 text-center text-gray-600 border border-dashed border-black rounded-2xl">
        <History size={32} className="mx-auto mb-2 opacity-30"/>
        <p className="text-xs font-medium">ยังไม่มีประวัติการดำเนินงาน</p>
      </div>
    );
  }

  const sorted = [...timeline].sort((a, b) => (b.at || 0) - (a.at || 0));

  const getEventBadge = (type) => {
    switch (type) {
      case 'created':
        return { icon: PlusCircle, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200' };
      case 'quote_upload':
        return { icon: Paperclip, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200' };
      case 'signed':
        return { icon: PenTool, color: 'text-indigo-600', bg: 'bg-indigo-50', border: 'border-indigo-200' };
      case 'task_order_opened':
        return { icon: FileText, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200' };
      case 'reschedule':
        return { icon: CalendarDays, color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-200' };
      case 'status_change':
        return { icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' };
      case 'cancelled':
        return { icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200' };
      case 'restored':
        return { icon: RotateCcw, color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-200' };
      default:
        return { icon: Clock, color: 'text-gray-600', bg: 'bg-gray-50', border: 'border-black' };
    }
  };

  return (
    <div className="space-y-4 relative before:absolute before:inset-0 before:left-5 before:w-0.5 before:bg-gray-100 pl-2">
      {sorted.map((ev, idx) => {
        const badge = getEventBadge(ev.type);
        const Icon = badge.icon;
        const timeStr = ev.at ? new Intl.DateTimeFormat('th-TH', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(ev.at)) : '-';
        return (
          <div key={ev.id || idx} className="relative flex items-start space-x-3 pl-2">
            <div className={`w-8 h-8 rounded-full ${badge.bg} ${badge.color} border ${badge.border} flex items-center justify-center shrink-0 z-10 shadow-sm`}>
              <Icon size={14}/>
            </div>
            <div className="flex-1 bg-gray-50/80 p-3.5 rounded-2xl border border-black text-left">
              <div className="flex justify-between items-center mb-1">
                <span className="font-bold text-xs text-gray-800">
                  {ev.type === 'created' && 'สร้างรายการใหม่'}
                  {ev.type === 'quote_upload' && 'แนบใบเสนอราคา'}
                  {ev.type === 'signed' && 'ตรวจรับและเซ็นต์อนุมัติใบเสนอราคา'}
                  {ev.type === 'task_order_opened' && 'เปิดใบงานในระบบ'}
                  {ev.type === 'reschedule' && 'ขอเลื่อนกำหนดการ'}
                  {ev.type === 'status_change' && `เปลี่ยนสถานะเป็น: ${ev.to || ''}`}
                  {ev.type === 'cancelled' && 'ยกเลิกใบงาน'}
                  {ev.type === 'restored' && 'กู้คืนใบงาน'}
                </span>
                <span className="text-xs text-gray-600 font-medium">{timeStr}</span>
              </div>
              {ev.fileName && <p className="text-xs text-gray-600 flex items-center gap-1 mt-0.5"><Paperclip size={11}/> ไฟล์: {ev.fileName}</p>}
              {ev.reason && <p className="text-xs text-red-600 font-medium mt-1">สาเหตุ: {ev.reason}</p>}
              {ev.note && <p className="text-xs text-gray-500 mt-0.5">{ev.note}</p>}
              {ev.toStart && <p className="text-xs text-orange-600 font-medium mt-0.5">แผนงานใหม่: {ev.toStart} ถึง {ev.toEnd}</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// -------------------------------------------------------------
// Component สำหรับเปิดดูรายละเอียด & ปฏิบัติการใบงาน (Task Operations)
// หน้าต่างเดียวสำหรับทุกบทบาท: ปุ่มจัดการภายใน (เซ็นต์/เปิดงาน/ยกเลิก ฯลฯ) แสดงเมื่อปลดล็อกแล้ว
// -------------------------------------------------------------
const formatThaiDate = (dateStr) => {
  if (!dateStr) return '-';
  try {
    return new Intl.DateTimeFormat('th-TH', { dateStyle: 'long' }).format(new Date(dateStr));
  } catch {
    return dateStr;
  }
};

function DocCard({ index, title, fileName, fallbackName, hasFile, emptyText, okText, previewTitle, previewLabel, onPreview, onDownload, tone }) {
  return (
    <div className={`brut p-4 flex flex-col justify-between ${tone}`}>
      <div>
        <span className="text-xs font-extrabold uppercase tracking-wide block mb-1">{index}. {title}</span>
        {hasFile ? (
          <div>
            <p className="text-sm font-bold truncate" title={fileName}>{fileName || fallbackName}</p>
            <span className="text-xs font-bold">✓ {okText}</span>
          </div>
        ) : (
          <span className="text-sm font-medium opacity-70">{emptyText}</span>
        )}
      </div>
      {hasFile && (
        <div className="mt-3 flex items-stretch gap-2">
          <button onClick={() => onPreview(previewTitle)} className="brut-btn flex-1 min-h-12 bg-white text-sm font-bold flex items-center justify-center gap-1.5">
            <Eye size={16}/>
            <span>{previewLabel}</span>
          </button>
          <button onClick={onDownload} className="brut-btn min-h-12 min-w-12 bg-white flex items-center justify-center" title="ดาวน์โหลดเก็บไว้ในเครื่อง" aria-label="ดาวน์โหลด">
            <Download size={16}/>
          </button>
        </div>
      )}
    </div>
  );
}

function TaskDetailView({ 
  task, 
  onClose,
  onUploadQuote,
  onOpenSign,
  onOpenTaskOrder,
  onOpenReschedule,
  onRequestCancel,
  onRequestDownload,
  onPreviewPdf,
  onRequestDisbursement,
  isUnlocked
}) {
  const [activeSubTab, setActiveSubTab] = useState('info'); // 'info' | 'timeline'
  const [isUploadingQuote, setIsUploadingQuote] = useState(false);
  const isOverdueTask = isScheduleOverdue(task);
  const hasQuote = !!(task.quoteFileUrl || task.quoteFileId);
  const hasSigned = !!(task.signedFileUrl || task.signedFileId);
  const hasTaskFile = !!(task.taskFileUrl || task.taskFileId);
  const cost = task.cost ? (isNaN(task.cost) ? task.cost : Number(task.cost).toLocaleString()) : '0';
  const days = task.startDate && task.endDate
    ? Math.max(1, Math.round((new Date(task.endDate) - new Date(task.startDate)) / 86400000) + 1)
    : null;

  const tabCls = (on) => `px-4 min-h-12 text-sm font-extrabold border-2 border-black ${on ? 'bg-black text-white' : 'bg-white text-black hover:bg-yellow-200'}`;
  const actionCls = 'brut-btn px-4 min-h-12 text-sm font-extrabold flex items-center gap-2';

  return (
    <div className="brut-panel bg-[#FFFBEB] p-5 md:p-8 space-y-6 w-full max-w-3xl mx-auto text-left max-h-[90vh] overflow-y-auto custom-scrollbar text-black">
      {/* Header */}
      <div className="flex flex-col gap-3 border-b-4 border-black pb-4 pr-12">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="num font-black text-3xl md:text-4xl tracking-tight">{task.taskNo}</h3>
          <StatusTag label={task.status} />
        </div>
        <p className="text-sm font-bold">{task.project} • {task.company}</p>
        <div className="flex">
          <button onClick={() => setActiveSubTab('info')} className={tabCls(activeSubTab === 'info')}>ข้อมูล & เอกสาร</button>
          <button onClick={() => setActiveSubTab('timeline')} className={`${tabCls(activeSubTab === 'timeline')} -ml-0.5`}>ไทม์ไลน์ <span className="num">({task.timeline?.length || 0})</span></button>
        </div>
      </div>

      {/* Overdue Warning Banner */}
      {isOverdueTask && (
        <div className="brut bg-[#FF5C5C] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <AlertTriangle className="shrink-0" size={24} />
            <div className="text-sm">
              <span className="font-black block">เกินกำหนดวันจบงานแล้ว!</span>
              <span className="font-medium">แผนงานระบุจบงานภายใน <span className="num font-bold">{task.endDate}</span> แต่ยังไม่ได้ปรับสถานะเป็นจบงาน</span>
            </div>
          </div>
          {onOpenReschedule && (
            <button onClick={() => onOpenReschedule(task)} className={`${actionCls} bg-white shrink-0`}>
              <CalendarDays size={16}/>
              <span>ขอเลื่อนวันเริ่ม/วันจบ</span>
            </button>
          )}
        </div>
      )}

      {activeSubTab === 'info' && (
        <div className="space-y-6">
          {/* Hero: วันทำจ่าย & วันนัดหมาย */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="brut bg-[#B8F2C9] p-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 text-sm font-extrabold">
                  <DollarSign size={18}/>
                  <span>วันที่ทำจ่าย (วันที่จะได้รับเงิน)</span>
                </div>
                {task.payDate ? (
                  <div className="mt-2">
                    <div className="num text-3xl font-black">{task.payDate}</div>
                    <p className="text-sm font-bold mt-1">{formatThaiDate(task.payDate)}</p>
                    <p className="text-xs font-bold mt-1 flex items-center gap-1.5"><CheckCircle2 size={14}/> ยืนยันวันทำจ่ายแล้ว</p>
                  </div>
                ) : (
                  <div className="mt-2">
                    <div className="text-xl font-black">อยู่ระหว่างรอบเบิกจ่าย</div>
                    <p className="text-xs font-bold mt-1">ยังไม่ได้ระบุวันทำจ่าย (รอฝ่ายการเงินแจ้งกำหนดการ)</p>
                  </div>
                )}
              </div>
              <div className="mt-4 pt-3 border-t-2 border-black flex justify-between items-center">
                <span className="text-xs font-extrabold">ยอดเงินค่าใช้จ่าย</span>
                <span className="num text-2xl font-black">฿ {cost}</span>
              </div>
            </div>

            <div className="brut bg-[#BDE3FF] p-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 text-sm font-extrabold">
                  <CalendarDays size={18}/>
                  <span>วันที่นัดหมาย (กำหนดเข้าทำงาน)</span>
                </div>
                {days ? (
                  <div className="mt-2">
                    <div className="num text-xl font-black">{task.startDate} ถึง {task.endDate}</div>
                    <p className="text-sm font-bold mt-1">{formatThaiDate(task.startDate)} - {formatThaiDate(task.endDate)}</p>
                    <p className="text-xs font-bold mt-1 flex items-center gap-1.5"><Clock size={14}/> ปฏิบัติงานต่อเนื่อง <span className="num">{days}</span> วัน</p>
                  </div>
                ) : (
                  <div className="mt-2">
                    <div className="num text-2xl font-black">{task.aptDate || 'ยังไม่กำหนดวัน'}</div>
                    {task.aptDate && <p className="text-sm font-bold mt-1">{formatThaiDate(task.aptDate)}</p>}
                  </div>
                )}
              </div>
              <div className="mt-4 pt-3 border-t-2 border-black flex justify-between items-center gap-2">
                <span className="text-xs font-extrabold">พื้นที่หน้างาน</span>
                <span className="text-sm font-black truncate">{task.area || '-'}</span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-3">
            <label className={`${actionCls} bg-[#FFD93D] cursor-pointer ${isUploadingQuote ? 'opacity-70 pointer-events-none' : ''}`}>
              {isUploadingQuote ? <Loader2 size={16} className="animate-spin" /> : <Paperclip size={16}/>}
              <span>{isUploadingQuote ? 'กำลังอัปโหลด...' : (hasQuote ? 'แนบใบเสนอราคาใหม่' : 'แนบใบเสนอราคา (PDF)')}</span>
              <input 
                type="file" 
                accept=".pdf,application/pdf" 
                className="hidden" 
                disabled={isUploadingQuote}
                onChange={async e => { 
                  if (e.target.files && e.target.files[0]) {
                    const picked = e.target.files[0];
                    e.target.value = '';
                    setIsUploadingQuote(true);
                    try {
                      await onUploadQuote(task, picked);
                    } finally {
                      setIsUploadingQuote(false);
                    }
                  }
                }} 
              />
            </label>

            {isUnlocked && (
              <>
                {hasQuote && (
                  <button onClick={() => onOpenSign(task)} className={`${actionCls} bg-[#C4B5FD]`}>
                    <PenTool size={16}/>
                    <span>{hasSigned ? 'เซ็นต์อนุมัติใหม่อีกครั้ง' : 'ตรวจรับและเซ็นต์อนุมัติ'}</span>
                  </button>
                )}
                <button onClick={() => onOpenTaskOrder(task)} className={`${actionCls} bg-[#BDE3FF]`}>
                  <FileText size={16}/>
                  <span>{hasTaskFile ? 'แนบใบงานแจ้งซ่อมใหม่' : 'แนบใบงานแจ้งซ่อม & เปิดงาน'}</span>
                </button>
                {(task.startDate || task.endDate || task.aptDate) && (
                  <button onClick={() => onOpenReschedule(task)} className={`${actionCls} bg-white`}>
                    <CalendarDays size={16}/>
                    <span>ขอเลื่อนกำหนดงาน</span>
                  </button>
                )}
                {onRequestDisbursement && (
                  <button onClick={() => onRequestDisbursement(task)} className={`${actionCls} bg-[#B8F2C9]`}>
                    <DollarSign size={16}/>
                    <span>{task.status === 'ส่งเอกสารเบิกจ่ายแล้ว' ? 'แก้ไขวันทำจ่าย' : 'ส่งเอกสารเบิกจ่าย (ระบุวัน)'}</span>
                  </button>
                )}
                {task.status !== 'ยกเลิก' && (
                  <button onClick={() => onRequestCancel(task)} className={`${actionCls} bg-[#FF5C5C] sm:ml-auto`}>
                    <Trash2 size={16}/>
                    <span>ยกเลิกใบงาน</span>
                  </button>
                )}
              </>
            )}
          </div>

          {task.cancelReason && (
            <div className="brut bg-[#FF5C5C] p-4 text-sm font-bold">
              สาเหตุการยกเลิก: {task.cancelReason}
            </div>
          )}

          {/* Details */}
          <div className="brut bg-white p-4">
            <h4 className="text-xs font-extrabold uppercase tracking-wide border-b-2 border-black pb-2 mb-3">รายละเอียดงาน</h4>
            <p className="text-base leading-relaxed whitespace-pre-wrap">{task.details || 'ไม่มีรายละเอียดเพิ่มเติม'}</p>
          </div>

          {/* Documents */}
          <div className="space-y-3">
            <h4 className="text-sm font-black flex items-center gap-2">
              <Paperclip size={16}/> เอกสารแนบในระบบ (เปิดดูและดาวน์โหลดได้)
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <DocCard
                index={1} title="ใบเสนอราคา" tone="bg-[#FFF3B0]"
                hasFile={hasQuote} fileName={task.quoteFileName} fallbackName="ใบเสนอราคา.pdf"
                emptyText="ยังไม่มีไฟล์แนบ" okText="แนบไฟล์แล้ว" previewLabel="เปิดดูเอกสาร"
                previewTitle={`ใบเสนอราคา: ${task.quoteFileName || 'quotation.pdf'}`}
                onPreview={(t) => onPreviewPdf && onPreviewPdf(task.quoteFileUrl || task.quoteFileId, t, task.quoteFileName)}
                onDownload={() => onRequestDownload(task.quoteFileUrl || task.quoteFileId, task.quoteFileName)}
              />
              <DocCard
                index={2} title="ลายเซ็นต์อนุมัติ" tone="bg-[#E4DCFF]"
                hasFile={hasSigned} fileName={task.signedFileName} fallbackName="signed_quote.pdf"
                emptyText="ยังไม่ได้รับการเซ็นต์" okText="ประทับตราแล้ว" previewLabel="ดูฉบับมีลายเซ็น"
                previewTitle={`ฉบับเซ็นต์อนุมัติ: ${task.signedFileName || 'signed_quote.pdf'}`}
                onPreview={(t) => onPreviewPdf && onPreviewPdf(task.signedFileUrl || task.signedFileId, t, task.signedFileName)}
                onDownload={() => onRequestDownload(task.signedFileUrl || task.signedFileId, task.signedFileName)}
              />
              <DocCard
                index={3} title="ใบงานแจ้งซ่อม" tone="bg-[#D6EEFF]"
                hasFile={hasTaskFile} fileName={task.taskFileName} fallbackName="task_order.pdf"
                emptyText="ยังไม่มีใบงาน" okText="แนบใบงานแล้ว" previewLabel="เปิดดูใบงาน"
                previewTitle={`ใบงานแจ้งซ่อม: ${task.taskFileName || 'task_order.pdf'}`}
                onPreview={(t) => onPreviewPdf && onPreviewPdf(task.taskFileUrl || task.taskFileId, t, task.taskFileName)}
                onDownload={() => onRequestDownload(task.taskFileUrl || task.taskFileId, task.taskFileName)}
              />
            </div>
          </div>
        </div>
      )}

      {activeSubTab === 'timeline' && (
        <div className="brut bg-white p-4">
          <TimelineView timeline={task.timeline} />
        </div>
      )}

      <div className="flex justify-end pt-4 border-t-4 border-black">
        <button onClick={onClose} className="brut-btn px-8 min-h-12 bg-white text-sm font-extrabold">
          ปิดหน้าต่าง
        </button>
      </div>
    </div>
  );
}

// -------------------------------------------------------------
function PrintReport({ tasks, printData, onDone }) {
  const { selectedMonth, filterProj, filterComp, filterStatus } = printData;
  const activeTasks = tasks.filter(t => !t.isDeleted);
  
  useEffect(() => {
    const timer = setTimeout(() => { window.print(); }, 800);
    const handleAfterPrint = () => { onDone(); };
    window.addEventListener('afterprint', handleAfterPrint);
    return () => { clearTimeout(timer); window.removeEventListener('afterprint', handleAfterPrint); };
  }, [onDone]);

  // Filter tasks based on month/proj/comp/status
  const filteredTasks = activeTasks.filter(t => {
    const tMonth = getEffectiveMonth(t);
    const monthMatch = selectedMonth ? (tMonth === selectedMonth) : true;
    const projMatch = filterProj ? t.project === filterProj : true;
    const compMatch = filterComp ? t.company === filterComp : true;
    const statusMatch = filterStatus ? t.status === filterStatus : true;
    return monthMatch && projMatch && compMatch && statusMatch;
  });

  const allStats = STATUSES.map(s => {
    const count = activeTasks.filter(t => t.status === s.name).length;
    const percent = activeTasks.length > 0 ? Math.round((count / activeTasks.length) * 100) : 0;
    return { ...s, count, percent };
  });

  const filteredStats = STATUSES.map(s => {
    const count = filteredTasks.filter(t => t.status === s.name).length;
    const percent = filteredTasks.length > 0 ? Math.round((count / filteredTasks.length) * 100) : 0;
    return { ...s, count, percent };
  });

  let cumulativePercent = 0;
  const conicStops = filteredStats.filter(s => s.count > 0).map(s => {
    const start = cumulativePercent;
    cumulativePercent += (s.count / filteredTasks.length) * 100;
    return `${s.color} ${start}% ${cumulativePercent}%`;
  }).join(', ');
  const pieStyle = filteredTasks.length > 0 ? { background: `conic-gradient(${conicStops})` } : { background: '#eee' };

  return (
    <div className="bg-white min-h-screen text-black font-sans p-8 md:p-10 max-w-[210mm] mx-auto relative overflow-hidden">
      {/* Formal Header */}
      <div className="border-b-2 border-black pb-4 mb-8 flex flex-col md:flex-row md:justify-between md:items-end">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-black uppercase">รายงานสรุปใบงาน (Detailed Report)</h1>
          <h2 className="text-lg md:text-xl font-bold mt-2 text-gray-800">ระบบการจัดการ V-TRACK</h2>
        </div>
        <div className="text-left md:text-right text-sm mt-4 md:mt-0 text-gray-600">
          <p><strong>พิมพ์เมื่อ:</strong> {new Intl.DateTimeFormat('th-TH', { dateStyle: 'long', timeStyle: 'short' }).format(new Date())}</p>
        </div>
      </div>

      {/* Overview Charts Section */}
      <div className="mb-10">
        <div className="border border-black p-6 rounded-lg break-inside-avoid shadow-sm">
          <h3 className="font-bold text-center mb-4 text-base uppercase tracking-wide bg-gray-100 py-2 rounded">สรุปภาพรวมตามตัวกรอง</h3>
          <div className="text-sm mb-6 text-gray-700 bg-gray-50 p-4 rounded border border-black">
            <p className="mb-2"><strong>ประจำเดือน:</strong> {selectedMonth ? new Intl.DateTimeFormat('th-TH', { month: 'long', year: 'numeric' }).format(new Date(selectedMonth)) : 'ทุกเดือน'}</p>
            <p className="mb-2"><strong>โครงการ:</strong> {filterProj || 'ทั้งหมด'} | <strong>ร้านค้า:</strong> {filterComp || 'ทั้งหมด'}</p>
            <p><strong>สถานะ:</strong> {filterStatus || 'ทุกสถานะ'}</p>
          </div>
          <div className="flex flex-col md:flex-row items-center justify-center gap-10">
            <div className="relative w-40 h-40 rounded-full border border-black shadow-inner flex-shrink-0" style={pieStyle}>
               <div className="absolute inset-4 bg-white rounded-full flex flex-col items-center justify-center">
                  <span className="font-bold text-3xl">{filteredTasks.length}</span>
               </div>
            </div>
            <div className="text-sm w-full md:w-1/2">
               <p className="font-bold mb-3 border-b pb-2 text-gray-800 text-base">รวม {filteredTasks.length} รายการ</p>
               <table className="w-full text-left">
                 <tbody>
                   {filteredStats.filter(s => s.count > 0).map(s => (
                     <tr key={s.id} className="border-b border-dashed border-black last:border-0">
                       <td className="py-3 flex items-center gap-2 truncate"><div className="w-4 h-4 rounded-sm border border-black shadow-sm" style={{backgroundColor: s.color}}></div>{s.name}</td>
                       <td className="py-3 text-right font-bold w-16 text-base">{s.count}</td>
                       <td className="py-3 text-right text-gray-500 w-16">{s.percent}%</td>
                     </tr>
                   ))}
                 </tbody>
               </table>
            </div>
          </div>
        </div>
      </div>

      {/* Filtered Tasks Formal Table */}
      <div className="mt-10">
        <h3 className="font-bold text-lg md:text-xl mb-4 flex items-center text-black border-b border-black pb-2">
          รายละเอียดใบงานทั้งหมด <span className="text-sm md:text-base font-normal text-gray-500 ml-2">({filteredTasks.length} รายการ)</span>
        </h3>
        {filteredTasks.length > 0 ? (
          <table className="w-full text-sm border-collapse border border-gray-400">
            <thead>
              <tr className="bg-gray-100 text-black">
                <th className="border border-gray-400 p-2 text-center w-10">ที่</th>
                <th className="border border-gray-400 p-2 text-center w-24">เลขที่ใบงาน</th>
                <th className="border border-gray-400 p-2 w-32">โครงการ</th>
                <th className="border border-gray-400 p-2 w-32">ร้านค้า</th>
                <th className="border border-gray-400 p-2 text-center w-24">วันนัดหมาย</th>
                <th className="border border-gray-400 p-2 text-center w-24">สถานะล่าสุด</th>
                <th className="border border-gray-400 p-2 text-center w-20">ค่าใช้จ่าย</th>
                <th className="border border-gray-400 p-2">รายละเอียด</th>
              </tr>
            </thead>
            <tbody>
              {filteredTasks.map((t, idx) => (
                <tr key={t.id} className="hover:bg-gray-50 break-inside-avoid">
                  <td className="border border-gray-400 p-2 text-center text-gray-600">{idx + 1}</td>
                  <td className="border border-gray-400 p-2 text-center font-bold text-black whitespace-nowrap">{t.taskNo}</td>
                  <td className="border border-gray-400 p-2">{t.project}</td>
                  <td className="border border-gray-400 p-2">{t.company}</td>
                  <td className="border border-gray-400 p-2 text-center whitespace-nowrap">{t.aptDate}</td>
                  <td className="border border-gray-400 p-2 text-center font-semibold text-xs whitespace-nowrap">{t.status}</td>
                  <td className="border border-gray-400 p-2 text-center text-xs whitespace-nowrap">{t.cost ? (isNaN(t.cost) ? t.cost : Number(t.cost).toLocaleString()) : '-'}</td>
                  <td className="border border-gray-400 p-2 text-gray-700 text-xs">{t.details || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-8 text-center border border-dashed border-gray-400 bg-gray-50">
            <p className="text-gray-600">-- ไม่มีรายการใบงานในตัวกรองนี้ --</p>
          </div>
        )}
      </div>

      <div className="mt-16 text-center print:hidden">
        <button onClick={onDone} className="px-8 py-3 bg-red-50 text-red-600 border border-red-200 rounded-lg font-bold text-sm hover:bg-red-100 transition-colors">
          ยกเลิกการพิมพ์ / กลับสู่หน้าจอหลัก
        </button>
      </div>
    </div>
  );
}

// -------------------------------------------------------------

function Dashboard({ tasks, settings, onViewDetail, onOpenReschedule, isUnlocked, onSave, onEdit, onRequestCancel, onRequestDisbursement }) {
  const currentMonth = useMemo(() => new Date().toISOString().slice(0, 7), []);

  const availableMonths = useMemo(() => {
    const months = tasks
      .filter(t => !t.isDeleted && t.status !== 'ยกเลิก')
      .map(t => getEffectiveMonth(t))
      .filter(m => m !== '');
    return [...new Set([currentMonth, ...months])].sort().reverse();
  }, [tasks, currentMonth]);

  const [selectedMonth, setSelectedMonth] = useState(() => currentMonth);

  useEffect(() => {
    if (availableMonths.length > 0 && !availableMonths.includes(selectedMonth)) {
      setSelectedMonth(availableMonths.includes(currentMonth) ? currentMonth : availableMonths[0]);
    }
  }, [availableMonths, selectedMonth, currentMonth]);

  const [filterProj, setFilterProj] = useState('');
  const [filterComp, setFilterComp] = useState('');
  const [quickFilter, setQuickFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  // 1. Base filter by month, project, and company
  const baseFilteredTasks = useMemo(() => {
    return tasks.filter(t => {
      const tMonth = getEffectiveMonth(t);
      return !t.isDeleted && tMonth === selectedMonth && 
        (filterProj ? t.project === filterProj : true) && 
        (filterComp ? t.company === filterComp : true);
    });
  }, [tasks, selectedMonth, filterProj, filterComp]);

  // 2. Secondary filter by quick status pill & search term
  const finalFilteredTasks = useMemo(() => {
    return baseFilteredTasks.filter(t => {
      // Quick filter logic
      if (quickFilter === 'pending') {
        const isPending = t.status === 'รอใบเสนอราคา' || t.status === 'อยู่ระหว่างตรวจสอบใบเสนอราคา';
        if (!isPending) return false;
      } else if (quickFilter === 'signed') {
        const isSigned = !!t.signedFileUrl || t.status === 'อนุมัติใบเสนอราคาแล้ว' || t.status === 'เปิดใบงานแล้ว';
        if (!isSigned) return false;
      } else if (quickFilter === 'tobill') {
        const isToBill = t.status === 'จบงานและรอรับเอกสารวางบิล' || t.status === 'ได้รับเอกสารวางบิลแล้ว';
        if (!isToBill) return false;
      } else if (quickFilter === 'disbursed') {
        if (t.status !== 'ส่งเอกสารเบิกจ่ายแล้ว') return false;
      } else if (quickFilter === 'overdue') {
        if (!isOverdue(t) && !isScheduleOverdue(t)) return false;
      }

      // Keyword search
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const matchTask = t.taskNo && t.taskNo.toLowerCase().includes(term);
        const matchComp = t.company && t.company.toLowerCase().includes(term);
        const matchProj = t.project && t.project.toLowerCase().includes(term);
        const matchArea = t.area && t.area.toLowerCase().includes(term);
        return matchTask || matchComp || matchProj || matchArea;
      }

      return true;
    });
  }, [baseFilteredTasks, quickFilter, searchTerm]);

  // Executive KPI Aggregations
  const totalTasksCount = baseFilteredTasks.length;
  const pendingQuotesCount = useMemo(() => {
    return baseFilteredTasks.filter(t => t.status === 'รอใบเสนอราคา' || t.status === 'อยู่ระหว่างตรวจสอบใบเสนอราคา').length;
  }, [baseFilteredTasks]);

  const signedQuotesCount = useMemo(() => {
    return baseFilteredTasks.filter(t => t.signedFileUrl || t.status === 'อนุมัติใบเสนอราคาแล้ว' || t.status === 'เปิดใบงานแล้ว').length;
  }, [baseFilteredTasks]);

  const disbursedCount = useMemo(() => {
    return baseFilteredTasks.filter(t => t.status === 'ส่งเอกสารเบิกจ่ายแล้ว').length;
  }, [baseFilteredTasks]);

  const overdueCount = useMemo(() => {
    return baseFilteredTasks.filter(t => isOverdue(t) || isScheduleOverdue(t)).length;
  }, [baseFilteredTasks]);

  const toBillCount = useMemo(() => {
    return baseFilteredTasks.filter(t => t.status === 'จบงานและรอรับเอกสารวางบิล' || t.status === 'ได้รับเอกสารวางบิลแล้ว').length;
  }, [baseFilteredTasks]);

  const { totalMonthBudget, disbursedBudget } = useMemo(() => {
    let total = 0, disbursed = 0;
    for (const t of baseFilteredTasks) {
      const num = parseFloat(String(t.cost || '').replace(/,/g, ''));
      if (isNaN(num)) continue;
      total += num;
      if (t.status === 'ส่งเอกสารเบิกจ่ายแล้ว') disbursed += num;
    }
    return { totalMonthBudget: total, disbursedBudget: disbursed };
  }, [baseFilteredTasks]);

  // Status statistics for Donut chart and spec matrix
  const stats = STATUSES.map(s => {
    const count = baseFilteredTasks.filter(t => t.status === s.name).length;
    const percent = baseFilteredTasks.length > 0 ? Math.round((count / baseFilteredTasks.length) * 100) : 0;
    return { ...s, count, percent };
  });

  let cumulativePercent = 0;
  const conicStops = stats.filter(s => s.count > 0).map(s => {
    const start = cumulativePercent;
    const slicePercent = (s.count / baseFilteredTasks.length) * 100;
    cumulativePercent += slicePercent;
    return `${s.color} ${start}% ${cumulativePercent}%`;
  }).join(', ');
  
  const pieStyle = baseFilteredTasks.length > 0 ? { background: `conic-gradient(${conicStops})` } : { background: '#F0ECE1' };

  const selectedMonthFormatted = useMemo(() => {
    try {
      return new Intl.DateTimeFormat('th-TH', { month: 'long', year: 'numeric' }).format(new Date(selectedMonth));
    } catch {
      return selectedMonth;
    }
  }, [selectedMonth]);

  const todayThaiFormatted = useMemo(() => {
    try {
      return new Intl.DateTimeFormat('th-TH', { dateStyle: 'full' }).format(new Date());
    } catch {
      return '';
    }
  }, []);

  return (
    <div className="space-y-6 animate-in fade-in duration-500 text-left">
      {/* Masthead + KPI */}
      <div className="brut-panel bg-[#FFD93D] p-5 md:p-8 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 bg-black text-[#FFD93D] flex items-center justify-center shrink-0 font-black text-2xl">LH</div>
            <div className="space-y-1">
              <h2 className="text-3xl md:text-4xl font-black tracking-tight leading-tight">V-TRACK ติดตามงานซ่อม</h2>
              <p className="text-sm md:text-base font-semibold max-w-2xl">
                ติดตามใบงาน ตรวจรับใบเสนอราคา และบริหารการเบิกจ่ายโครงการ
              </p>
            </div>
          </div>
          <div className="flex flex-col items-start lg:items-end gap-1">
            <span className="brut bg-white px-3 py-2 text-sm font-bold">
              งวดบัญชี: <span className="num">{selectedMonthFormatted}</span>
            </span>
            <span className="text-sm font-bold">{todayThaiFormatted} • <span className="num">{totalTasksCount}</span> รายการในระบบ</span>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="brut bg-white p-4">
            <div className="text-sm font-extrabold">ใบงานในงวด</div>
            <div className="num text-4xl font-black mt-1">{totalTasksCount} <span className="text-sm font-bold">ใบงาน</span></div>
            <div className="mt-2 pt-2 border-t-2 border-black text-sm font-bold flex justify-between"><span>โครงการทั้งหมด</span><span className="num">{settings.projects.length}</span></div>
          </div>
          <div className="brut bg-[#B8F2C9] p-4">
            <div className="text-sm font-extrabold flex items-center justify-between">ตรวจรับและเซ็นต์แล้ว <ShieldCheck size={18}/></div>
            <div className="num text-4xl font-black mt-1">{signedQuotesCount} <span className="text-sm font-bold">รายการ</span></div>
            <div className="mt-2 pt-2 border-t-2 border-black text-sm font-bold flex justify-between"><span>สัดส่วน</span><span className="num">{totalTasksCount > 0 ? Math.round((signedQuotesCount / totalTasksCount) * 100) : 0}%</span></div>
          </div>
          <div className="brut bg-[#FFB4A2] p-4">
            <div className="text-sm font-extrabold flex items-center justify-between">รอตรวจรับ <Clock size={18}/></div>
            <div className="num text-4xl font-black mt-1">{pendingQuotesCount} <span className="text-sm font-bold">รายการ</span></div>
            <div className="mt-2 pt-2 border-t-2 border-black text-sm font-bold">รอเจ้าหน้าที่อนุมัติ</div>
          </div>
          <div className="brut bg-[#BDE3FF] p-4">
            <div className="text-sm font-extrabold flex items-center justify-between">เบิกจ่ายแล้ว / มูลค่างานในงวด <DollarSign size={18}/></div>
            <div className="num text-xl font-black mt-1 whitespace-nowrap">฿ {disbursedBudget.toLocaleString()} <span className="text-sm font-bold">/ {totalMonthBudget.toLocaleString()}</span></div>
            <div className="mt-2 pt-2 border-t-2 border-black text-sm font-bold flex justify-between"><span>ส่งเบิกจ่ายแล้ว</span><span className="num">{disbursedCount} / {baseFilteredTasks.length} งาน</span></div>
          </div>
        </div>
      </div>

      {/* ============================================================== */}
      {/* 🧭 2. TACTILE CONSOLE & ARCHITECTURAL FILTER BAR               */}
      {/* ============================================================== */}
      <div className="asym-card p-5 md:p-6 border border-black shadow-sm bg-white relative overflow-hidden space-y-4">
        <div className="absolute top-0 right-0 w-48 h-48 bg-drafting-grid opacity-15 pointer-events-none"></div>

        {/* Top Dropdowns: Period, Estate, Contractor + Search */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 relative z-10">
          {/* Period Selector */}
          <div className="space-y-1">
            <label className="text-xs font-mono-tech font-bold text-[#8C7B63] uppercase tracking-wider flex items-center">
              <CalendarDays size={12} className="mr-1 text-[#111]"/> งวดเดือน
            </label>
            <select 
              value={selectedMonth} 
              onChange={e => setSelectedMonth(e.target.value)} 
              className="w-full p-2.5 bg-[#FAF8F5] rounded-xl border border-black focus:border-[#111] focus:ring-1 focus:ring-[#111] text-xs font-semibold text-black transition-all"
            >
              {availableMonths.map(m => (
                <option key={m} value={m}>
                  {new Intl.DateTimeFormat('th-TH', { month: 'long', year: 'numeric' }).format(new Date(m))}
                </option>
              ))}
            </select>
          </div>

          {/* Project / Estate Selector */}
          <div className="space-y-1">
            <label className="text-xs font-mono-tech font-bold text-[#8C7B63] uppercase tracking-wider flex items-center">
              <Building2 size={12} className="mr-1 text-[#111]"/> โครงการ
            </label>
            <select 
              value={filterProj} 
              onChange={e => setFilterProj(e.target.value)} 
              className="w-full p-2.5 bg-[#FAF8F5] rounded-xl border border-black focus:border-[#111] focus:ring-1 focus:ring-[#111] text-xs font-semibold text-black transition-all"
            >
              <option value="">ทุกโครงการ Land & Houses</option>
              {settings.projects.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>

          {/* Vendor / Contractor Selector */}
          <div className="space-y-1">
            <label className="text-xs font-mono-tech font-bold text-[#8C7B63] uppercase tracking-wider flex items-center">
              <Briefcase size={12} className="mr-1 text-[#111]"/> ร้านค้า
            </label>
            <select 
              value={filterComp} 
              onChange={e => setFilterComp(e.target.value)} 
              className="w-full p-2.5 bg-[#FAF8F5] rounded-xl border border-black focus:border-[#111] focus:ring-1 focus:ring-[#111] text-xs font-semibold text-black transition-all"
            >
              <option value="">ทุกร้านค้า / ผู้รับเหมา</option>
              {settings.companies.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* Keyword Search */}
          <div className="space-y-1">
            <label className="text-xs font-mono-tech font-bold text-[#8C7B63] uppercase tracking-wider flex items-center">
              <Search size={12} className="mr-1 text-[#111]"/> ค้นหา
            </label>
            <div className="relative">
              <input 
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="ค้นหาเลขใบงาน, ร้านค้า, พื้นที่..."
                className="w-full p-2.5 pl-8 bg-[#FAF8F5] rounded-xl border border-black focus:border-[#111] focus:ring-1 focus:ring-[#111] text-xs font-medium text-black placeholder:text-gray-600 transition-all"
              />
              <Search size={13} className="absolute left-2.5 top-3 text-gray-600 pointer-events-none" />
              {searchTerm && (
                <button onClick={() => setSearchTerm('')} className="absolute right-2.5 top-3 text-gray-600 hover:text-gray-600">
                  <X size={13} />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Quick Filter Status Switcher Pills (90s Hi-Fi Console Buttons) */}
        <div className="pt-2 border-t border-black flex flex-wrap items-center justify-between gap-2 relative z-10">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-mono-tech text-[#8C7B63] uppercase mr-1 flex items-center">
              <Filter size={11} className="mr-1 text-[#111]" /> กรองด่วน:
            </span>

            <button
              onClick={() => setQuickFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                quickFilter === 'all' 
                  ? 'bg-black text-white shadow-xs' 
                  : 'bg-[#FAF8F5] text-gray-600 hover:bg-gray-100 border border-black'
              }`}
            >
              <span>ทั้งหมด</span>
              <span className="text-xs font-mono-tech opacity-80">({totalTasksCount})</span>
            </button>

            <button
              onClick={() => setQuickFilter('pending')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                quickFilter === 'pending' 
                  ? 'bg-amber-600 text-white shadow-xs' 
                  : 'bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200'
              }`}
            >
              <Clock size={12} />
              <span>รอตรวจรับ</span>
              <span className="text-xs font-mono-tech opacity-80">({pendingQuotesCount})</span>
            </button>

            <button
              onClick={() => setQuickFilter('signed')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                quickFilter === 'signed' 
                  ? 'bg-emerald-700 text-white shadow-xs' 
                  : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200'
              }`}
            >
              <ShieldCheck size={12} />
              <span>เซ็นต์อนุมัติแล้ว</span>
              <span className="text-xs font-mono-tech opacity-80">({signedQuotesCount})</span>
            </button>

            <button
              onClick={() => setQuickFilter('tobill')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                quickFilter === 'tobill' 
                  ? 'bg-orange-600 text-white shadow-xs' 
                  : 'bg-orange-50 text-orange-800 hover:bg-orange-100 border border-orange-200'
              }`}
            >
              <AlertCircle size={12} />
              <span>รอวางบิล</span>
              <span className="text-xs font-mono-tech opacity-80">({toBillCount})</span>
            </button>

            <button
              onClick={() => setQuickFilter('disbursed')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                quickFilter === 'disbursed' 
                  ? 'bg-indigo-700 text-white shadow-xs' 
                  : 'bg-indigo-50 text-indigo-800 hover:bg-indigo-100 border border-indigo-200'
              }`}
            >
              <DollarSign size={12} />
              <span>เบิกจ่ายแล้ว</span>
              <span className="text-xs font-mono-tech opacity-80">({disbursedCount})</span>
            </button>

            {overdueCount > 0 && (
              <button
                onClick={() => setQuickFilter('overdue')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                  quickFilter === 'overdue' 
                    ? 'bg-red-700 text-white shadow-xs' 
                    : 'bg-red-50 text-red-700 hover:bg-red-100 border border-red-200'
                }`}
              >
                <span>⚠️ เลยกำหนด</span>
                <span className="text-xs font-mono-tech font-bold">({overdueCount})</span>
              </button>
            )}
          </div>

          {(filterProj || filterComp || quickFilter !== 'all' || searchTerm) && (
            <button
              onClick={() => {
                setFilterProj('');
                setFilterComp('');
                setQuickFilter('all');
                setSearchTerm('');
              }}
              className="text-xs font-semibold text-[#111] hover:underline flex items-center gap-1 py-1"
            >
              <RotateCcw size={11} /> ล้างตัวกรองทั้งหมด
            </button>
          )}
        </div>
      </div>

      {/* ============================================================== */}
      {/* 📊 3. ASYMMETRIC 5:7 SPLIT: TELEMETRY & OPERATIONS DOSSIER     */}
      {/* ============================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column (5/12 cols): Architectural Status Ratio Matrix */}
        <div className="lg:col-span-5 asym-card p-6 md:p-7 border border-black shadow-sm flex flex-col bg-white relative overflow-hidden">
          {/* Subtle Dynamic Ribbon Curve in Card Background */}
          <svg className="absolute -top-10 -right-10 w-60 h-60 pointer-events-none opacity-20" viewBox="0 0 200 200">
            <path d="M 0,100 C 50,20 150,180 200,100" stroke="#111" strokeWidth="1.5" fill="none" className="animate-wave-flow" />
          </svg>

          <div className="flex items-center justify-between pb-4 border-b border-black mb-5 relative z-10">
            <div>
              <h4 className=" font-bold text-lg md:text-xl text-black">สัดส่วนสถานะงาน</h4>
              <p className="text-xs font-mono-tech text-[#8C7B63] tracking-widest uppercase">DISPATCH METRICS & RATIOS</p>
            </div>
            <span className="text-xs font-mono-tech text-black bg-[#FAF8F5] border border-black px-2.5 py-1 rounded-none font-bold">
              ⊕ {baseFilteredTasks.length} TASKS
            </span>
          </div>
          
          {/* Donut Chart with Precision Brass Ring Rim */}
          <div className="relative my-3 mx-auto flex items-center justify-center z-10">
            <div className="p-3.5 rounded-full border-2 border-[#111]/40 bg-[#FAF8F5] shadow-inner relative">
              <div 
                className="relative w-44 h-44 rounded-full shadow-md flex items-center justify-center transition-all duration-700" 
                style={pieStyle}
              >
                <div className="w-28 h-28 bg-white rounded-full flex flex-col items-center justify-center shadow-sm border border-black z-10">
                  <span className="text-3xl  font-bold text-black">{baseFilteredTasks.length}</span>
                  <span className="text-xs font-mono-tech font-bold text-[#8C7B63] uppercase tracking-wider mt-0.5">ใบงานรวม</span>
                </div>
              </div>
            </div>
          </div>

          {/* Architectural Status Specification Table */}
          <div className="w-full space-y-2 mt-5 relative z-10 border-t border-black pt-4">
            <div className="flex items-center justify-between text-xs font-mono-tech text-[#8C7B63] uppercase tracking-wider pb-1">
              <span>สถานะงาน (SPECIFICATION)</span>
              <span>จำนวน / สัดส่วน</span>
            </div>
            {stats.map(s => {
              const hasItems = s.count > 0;
              return (
                <div 
                  key={s.id} 
                  className={`flex items-center justify-between p-2 rounded-lg transition-all ${
                    hasItems ? 'bg-[#FAF8F5]/80 hover:bg-[#FAF8F5] text-gray-800' : 'text-gray-600 opacity-40'
                  }`}
                >
                  <div className="flex items-center space-x-2.5 min-w-0 pr-2">
                    <div 
                      className="w-3 h-3 rounded-none shrink-0 border border-black/10" 
                      style={{ backgroundColor: s.color }}
                    />
                    <span className="text-xs font-medium truncate">{s.name}</span>
                  </div>
                  <div className="flex items-center space-x-2 shrink-0">
                    <span className="font-mono-tech font-bold text-xs text-black">{s.count}</span>
                    <span className="text-xs font-mono-tech bg-white px-1.5 py-0.5 rounded border border-black text-[#8C7B63] min-w-[36px] text-right">
                      {s.percent}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Schedule & Disbursement Quick Highlights */}
          <div className="mt-5 p-3.5 bg-[#FAF8F5] rounded-xl border border-black space-y-2 relative z-10 text-xs">
            <div className="text-xs font-mono-tech font-bold text-[#111] uppercase tracking-wider flex items-center gap-1">
              <span>⌖ HIGHLIGHTS</span>
              <span className="text-gray-600">• สรุปงวดและนัดหมาย</span>
            </div>
            <div className="flex items-center justify-between text-gray-700">
              <span className="text-xs text-gray-500">งานที่มีวันทำจ่ายยืนยัน:</span>
              <span className="font-mono-tech font-bold text-emerald-800">
                {baseFilteredTasks.filter(t => t.payDate).length} งาน
              </span>
            </div>
            <div className="flex items-center justify-between text-gray-700">
              <span className="text-xs text-gray-500">งานที่มีนัดหมายเข้าทำ:</span>
              <span className="font-mono-tech font-bold text-black">
                {baseFilteredTasks.filter(t => t.startDate || t.aptDate).length} งาน
              </span>
            </div>
          </div>
        </div>

        {/* Right Column (7/12 cols): Architectural Task Stream */}
        <div className="lg:col-span-7 asym-card-inverse bg-white border border-black shadow-sm overflow-hidden flex flex-col">
          <div className="p-5 md:p-6 border-b-2 border-black bg-[#FFD93D] flex justify-between items-center">
            <div className="flex flex-col">
              <span className="tech-stamp">MONTHLY OPERATIONS STREAM</span>
              <h4 className=" font-bold text-lg md:text-xl text-black mt-0.5">
                สารบบใบงานประจำงวด
              </h4>
              <p className="text-xs text-[#111] font-medium">{selectedMonthFormatted}</p>
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-xs font-mono-tech bg-white px-3 py-1.5 rounded-none border border-black text-black font-bold">
                ⊕ {finalFilteredTasks.length} RECORDS
              </span>
            </div>
          </div>

          <div className="flex-1 overflow-auto max-h-[620px] p-4 md:p-6 custom-scrollbar bg-[#F8F6F0]/40">
            {finalFilteredTasks.length > 0 ? (
              <div className="flex flex-col gap-3.5">
                {finalFilteredTasks.map(t => {
                  const isSchedOver = isScheduleOverdue(t);
                  return (
                    <div 
                      key={t.id} 
                      onClick={() => onViewDetail(t)}
                      className="group relative p-4 bg-white border-2 border-black shadow-[4px_4px_0_0_#111] hover:shadow-[6px_6px_0_0_#111] hover:-translate-x-0.5 hover:-translate-y-0.5 active:translate-x-1 active:translate-y-1 active:shadow-none transition-all duration-100 cursor-pointer flex flex-col text-left gap-3"
                    >
                      <div className="flex flex-col min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <span className="num font-black text-black text-xl whitespace-nowrap bg-[#FFD93D] px-2 border-2 border-black">
                            {t.taskNo}
                          </span>
                          {isSchedOver && (
                            <span className="bg-amber-50 text-amber-800 border border-amber-300/60 text-xs font-mono-tech px-2 py-0.5 rounded-none font-bold flex items-center gap-1">
                              ⚠️ เลยกำหนดจบงาน
                            </span>
                          )}
                          {!isSchedOver && isOverdue(t) && (
                            <span className="bg-red-50 text-red-700 border border-red-200 text-xs font-mono-tech px-2 py-0.5 rounded-none font-bold uppercase tracking-wider">
                              เลยกำหนด
                            </span>
                          )}
                          {isCarryOver(t) && (
                            <span className="bg-orange-50 text-orange-700 border border-orange-200 text-xs font-mono-tech px-2 py-0.5 rounded-none font-bold tracking-wider">
                              ยกยอดจาก {getOriginalMonthStr(t)}
                            </span>
                          )}
                        </div>
                        
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-gray-600">
                          <div className="flex items-center space-x-1.5 bg-[#FAF8F5] px-2.5 py-1 rounded-none border border-black">
                            <Briefcase size={12} className="text-[#111]" />
                            <span className="text-xs font-bold uppercase tracking-wider truncate max-w-[130px] text-black">{t.company}</span>
                          </div>
                          <div className="flex items-center space-x-1.5 bg-[#FAF8F5] px-2.5 py-1 rounded-none border border-black">
                            <Building2 size={12} className="text-black" />
                            <span className="text-xs font-medium truncate max-w-[160px] text-gray-700">{t.project}</span>
                          </div>
                          {t.startDate && t.endDate ? (
                            <div className="flex items-center space-x-1 bg-[#FAF8F5] px-2.5 py-1 rounded-none border border-black text-xs font-semibold text-gray-600">
                              <CalendarDays size={11} className="text-[#111]" />
                              <span>{t.startDate} - {t.endDate}</span>
                            </div>
                          ) : (
                            t.aptDate && (
                              <div className="flex items-center space-x-1 bg-[#FAF8F5] px-2.5 py-1 rounded-none border border-black text-xs font-semibold text-gray-600">
                                <CalendarDays size={11} className="text-[#111]" />
                                <span>{t.aptDate}</span>
                              </div>
                            )
                          )}
                        </div>

                        {/* File Attachment Badges */}
                        <div className="flex flex-wrap gap-1.5 mt-2.5">
                          {t.quoteFileUrl && (
                            <span className="bg-[#FAF8F5] text-[#92400E] text-xs px-2 py-0.5 rounded-none font-bold flex items-center gap-1 border border-[#FDE68A]">
                              <Paperclip size={9} className="text-[#B45309]"/> มีใบเสนอราคา
                            </span>
                          )}
                          {t.signedFileUrl && (
                            <span className="bg-[#FAF8F5] text-[#1E3A8A] text-xs px-2 py-0.5 rounded-none font-bold flex items-center gap-1 border border-[#BFDBFE]">
                              <ShieldCheck size={9} className="text-[#1D4ED8]"/> เซ็นต์อนุมัติแล้ว
                            </span>
                          )}
                          {t.taskFileUrl && (
                            <span className="bg-[#FAF8F5] text-[#1E40AF] text-xs px-2 py-0.5 rounded-none font-bold flex items-center gap-1 border border-[#BFDBFE]">
                              <FileText size={9} className="text-[#1D4ED8]"/> มีใบงาน
                            </span>
                          )}
                          {t.payDate && (
                            <span className="bg-emerald-50 text-emerald-800 text-xs px-2 py-0.5 rounded-none font-bold flex items-center gap-1 border border-emerald-200 font-mono-tech">
                              <DollarSign size={9} className="text-emerald-600" /> วันทำจ่าย: {t.payDate}
                            </span>
                          )}
                        </div>
                        
                        {t.status === 'จบงานและรอรับเอกสารวางบิล' && (
                          <div className="mt-3 inline-flex items-center space-x-1.5 bg-orange-50 text-orange-700 px-3 py-1 rounded-none border border-orange-200 w-max animate-pulse">
                            <AlertCircle size={12} className="text-orange-600" />
                            <span className="text-xs font-bold tracking-wide">กรุณาส่งเอกสารวางบิลภายในวันที่ 15</span>
                          </div>
                        )}
                      </div>
                      
                      <div className="flex flex-row flex-wrap items-center justify-between gap-2 border-t-2 border-black pt-3">
                        <div>
                          <StatusTag label={t.status} />
                        </div>
                        <div className="flex items-center space-x-1.5 bg-white px-2.5 py-1 border border-black">
                          <MapPin size={10} className="text-[#111]" />
                          <span className="text-xs text-black font-bold tracking-wide">{t.area}</span>
                        </div>
                      </div>

                      {isUnlocked && (
                        <div
                          onClick={(e) => e.stopPropagation()}
                          className="flex flex-wrap items-center gap-2 border-t-2 border-black pt-3 bg-[#FFFBEB] -mx-4 -mb-4 px-4 pb-4"
                        >
                          <span className="text-xs font-extrabold">แอดมิน:</span>
                          <div className="flex-1 min-w-[180px] max-w-xs">
                            <InlineStatusSelect task={t} onSave={onSave} onRequestCancel={onRequestCancel} onRequestDisbursement={onRequestDisbursement} />
                          </div>
                          <button onClick={() => onEdit(t)} className="brut-btn min-h-12 px-4 bg-white text-sm font-extrabold flex items-center gap-1.5"><Edit size={16}/><span>แก้ไข</span></button>
                          <button onClick={() => onRequestCancel(t)} className="brut-btn min-h-12 px-4 bg-[#FF5C5C] text-sm font-extrabold flex items-center gap-1.5"><Trash2 size={16}/><span>ยกเลิก</span></button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center py-24 text-gray-600">
                <CalendarDays size={48} className="mb-3 text-[#111]/30"/>
                <p className=" text-base font-bold text-black">ไม่พบข้อมูลใบงานตามเงื่อนไขที่เลือก</p>
                <p className="text-xs font-mono-tech text-gray-600 mt-1 uppercase">NO CORRESPONDING RECORDS FOUND</p>
                {(filterProj || filterComp || quickFilter !== 'all' || searchTerm) && (
                  <button
                    onClick={() => {
                      setFilterProj('');
                      setFilterComp('');
                      setQuickFilter('all');
                      setSearchTerm('');
                    }}
                    className="mt-3 text-xs bg-white text-[#111] font-bold px-3 py-1.5 rounded-lg border border-black hover:bg-[#FAF8F5]"
                  >
                    ล้างตัวกรองเพื่อดูทั้งหมด
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ------------------- Editable Form (For Admin) -------------------
function TaskForm({ settings, onSave, onSuccess, initialData = null, onCancel = null, isModal = false }) {
  const [d, setD] = useState(initialData || { 
    taskNo: generateRefId(), 
    project: '', 
    company: '', 
    area: AREAS[0], 
    status: STATUSES[0].name, 
    startDate: '', 
    endDate: '', 
    aptDate: '', 
    payDate: '', 
    cost: '', 
    details: '' 
  });
  
  const sub = async (e) => { 
    e.preventDefault(); 
    if (d.status === 'ส่งเอกสารเบิกจ่ายแล้ว' && !d.payDate) {
      alert('กรุณาระบุวันทำจ่าย (วันที่จะได้รับเงิน) สำหรับสถานะส่งเอกสารเบิกจ่ายแล้ว');
      return;
    }
    await onSave(d, !!initialData, initialData?.id); 
    onSuccess(); 
  };

  const handleCostChange = (e) => {
    let val = e.target.value.replace(/[^0-9.]/g, '');
    if (val) {
      const parts = val.split('.');
      parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      val = parts.join('.');
    }
    setD({ ...d, cost: val });
  };

  return (
    <form onSubmit={sub} className={`brut-panel p-5 md:p-8 space-y-6 w-full max-w-3xl mx-auto bg-white relative ${isModal ? 'md:my-6' : 'mb-24'}`}>
      <div className="flex items-center space-x-4 mb-2 relative z-10 border-b-4 border-black pb-4">
        <div className="w-12 h-12 bg-[#FFD93D] text-black flex items-center justify-center shrink-0 border-2 border-black">
          {initialData ? <Edit size={22}/> : <PlusCircle size={22}/>}
        </div>
        <div>
                    <h3 className=" font-bold text-xl md:text-2xl text-black text-left">
            {initialData ? 'แก้ไขข้อมูลใบงาน' : 'เปิดรายการใหม่ (รอใบเสนอราคา)'}
          </h3>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2 text-left">
          <Field label="เลขที่ใบงาน / รหัสอ้างอิง">
            <input required className="input-style" value={d.taskNo} onChange={e=>setD({...d, taskNo: e.target.value})} placeholder="ระบุเลขที่ใบงาน..."/>
          </Field>
          {!initialData && (
            <span className="text-xs text-amber-600 block pl-1">
              💡 ระบบสร้างรหัสอ้างอิงชั่วคราวให้ สามารถแก้ไขเป็นเลขที่ใบงานจริงได้เมื่อเปิดงาน
            </span>
          )}
        </div>
        <Field label="พื้นที่"><select className="input-style" value={d.area} onChange={e=>setD({...d, area: e.target.value})}>{AREAS.map(a=><option key={a} value={a}>{a}</option>)}</select></Field>
        
        <Field label="โครงการ"><select required className="input-style" value={d.project} onChange={e=>setD({...d, project: e.target.value})}><option value="">เลือกโครงการ</option>{settings.projects.map(p=><option key={p} value={p}>{p}</option>)}</select></Field>
        <Field label="บริษัท/ร้านค้า"><select required className="input-style" value={d.company} onChange={e=>setD({...d, company: e.target.value})}><option value="">เลือกร้านค้า</option>{settings.companies.map(c=><option key={c} value={c}>{c}</option>)}</select></Field>
        
        <div className="md:col-span-2">
          <Field label="สถานะการดำเนินงาน">
            <select 
              className="input-style" 
              value={d.status} 
              onChange={e => {
                const val = e.target.value;
                const today = new Date().toISOString().slice(0, 10);
                if (val === 'ส่งเอกสารเบิกจ่ายแล้ว' && !d.payDate) {
                  setD({ ...d, status: val, payDate: today });
                } else {
                  setD({ ...d, status: val });
                }
              }}
            >
              {STATUSES.map(s=><option key={s.id} value={s.name}>{s.name}</option>)}
            </select>
          </Field>
        </div>
        
        <Field label="วันเริ่มงานตามแผน"><input type="date" className="input-style" value={d.startDate || d.aptDate || ''} onChange={e=>setD({...d, startDate: e.target.value, aptDate: e.target.value})}/></Field>
        <Field label="วันจบงานตามแผน"><input type="date" className="input-style" value={d.endDate || ''} onChange={e=>setD({...d, endDate: e.target.value})}/></Field>
        
        <div className={`space-y-1.5 text-left ${d.status === 'ส่งเอกสารเบิกจ่ายแล้ว' ? 'p-3 bg-emerald-50/80 rounded-2xl border-2 border-emerald-300 transition-all' : ''}`}>
          <Field label="วันทำจ่าย (วันที่จะได้รับเงิน)">
            <input 
              type="date" 
              required={d.status === 'ส่งเอกสารเบิกจ่ายแล้ว'}
              className="input-style" 
              value={d.payDate || ''} 
              onChange={e=>setD({...d, payDate: e.target.value})}
            />
          </Field>
          {d.status === 'ส่งเอกสารเบิกจ่ายแล้ว' && (
            <span className="text-xs text-emerald-700 font-bold block pl-1">
              💰 สถานะส่งเอกสารเบิกจ่าย: กรุณาระบุวันที่คาดว่าจะได้รับเงิน
            </span>
          )}
        </div>
        <Field label="ค่าใช้จ่าย (บาท)"><input type="text" className="input-style" value={d.cost || ''} onChange={handleCostChange} placeholder="ระบุค่าใช้จ่าย (ถ้ามี)"/></Field>
        
        <div className="md:col-span-2"><Field label="รายละเอียด"><textarea rows="3" className="input-style resize-none" value={d.details} onChange={e=>setD({...d, details: e.target.value})}></textarea></Field></div>
      </div>
      
      <div className="flex flex-col sm:flex-row justify-end gap-3 pt-6">
        {onCancel && <button type="button" onClick={onCancel} className="brut-btn px-8 min-h-12 bg-white font-extrabold order-2 sm:order-1">ยกเลิก</button>}
        <button type="submit" className="brut-btn bg-[#FFD93D] px-12 min-h-12 font-extrabold order-1 sm:order-2">บันทึกข้อมูล</button>
      </div>
    </form>
  );
}

function Field({ label, children }) {
  return <div className="space-y-2 text-left"><label className="block text-sm font-extrabold">{label}</label>{children}</div>;
}

function StatusTag({ label }) {
  const s = STATUSES.find(x => x.name === label);
  // Refined 80s Architectural Specification Badge: Tactile, dignified, high contrast, zero glare
  const tapeStyles = {
    'รอใบเสนอราคา': { bg: '#475569', top: '#64748B', bottom: '#1E293B', dot: '#CBD5E1', border: '#334155' },
    'อยู่ระหว่างตรวจสอบใบเสนอราคา': { bg: '#92400E', top: '#B45309', bottom: '#78350F', dot: '#FDE68A', border: '#78350F' },
    'อนุมัติใบเสนอราคาแล้ว': { bg: '#3730A3', top: '#4338CA', bottom: '#312E81', dot: '#C7D2FE', border: '#312E81' },
    'เปิดใบงานในระบบแล้ว': { bg: '#1E40AF', top: '#1D4ED8', bottom: '#1E3A8A', dot: '#BFDBFE', border: '#1E3A8A' },
    'จบงานและรอรับเอกสารวางบิล': { bg: '#6B21A8', top: '#7E22CE', bottom: '#581C87', dot: '#E9D5FF', border: '#581C87' },
    'ได้รับเอกสารวางบิลแล้ว': { bg: '#9F1239', top: '#BE123C', bottom: '#881337', dot: '#FECDD3', border: '#881337' },
    'ส่งเอกสารเบิกจ่ายแล้ว': { bg: '#065F46', top: '#047857', bottom: '#064E3B', dot: '#A7F3D0', border: '#064E3B' },
    'ยกเลิก': { bg: '#991B1B', top: '#B91C1C', bottom: '#7F1D1D', dot: '#FECACA', border: '#7F1D1D' }
  };

  const tape = tapeStyles[label] || { 
    bg: s?.color || '#334155', 
    top: '#64748B', 
    bottom: '#1E293B', 
    dot: '#E2E8F0',
    border: '#1E293B'
  };

  return (
    <span 
      className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-none text-xs font-bold tracking-wider text-white whitespace-nowrap shadow-[0_1px_3px_rgba(0,0,0,0.25)] select-none shrink-0"
      style={{
        backgroundColor: tape.bg,
        borderTop: `1.5px solid ${tape.top}`,
        borderBottom: `2px solid ${tape.bottom}`,
        borderLeft: `1px solid ${tape.border || 'rgba(0,0,0,0.15)'}`,
        borderRight: `1px solid ${tape.border || 'rgba(0,0,0,0.15)'}`,
        textShadow: '0 1px 1px rgba(0,0,0,0.4)',
        letterSpacing: '0.04em'
      }}
      title={`สถานะ: ${label}`}
    >
      <span className="w-1.5 h-1.5 rounded-full inline-block shrink-0 ring-1 ring-white/20" style={{ backgroundColor: tape.dot }} />
      <span>{label}</span>
    </span>
  );
}

function SettingsPanel({ settings, updateSettings, tasks, onSave, onClear, onRestoreTask, triggerPrint }) {
  useEffect(() => {
    const loadScript = (id, src) => {
      if (!document.getElementById(id)) {
        const s = document.createElement('script'); s.id = id; s.src = src; document.body.appendChild(s);
      }
    };
    loadScript('papaparse-script', 'https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.3.2/papaparse.min.js');
    loadScript('xlsx-script', 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');
  }, []);

  const [p, setP] = useState(''); const [c, setC] = useState(''); const [st, setSt] = useState('');
  const [showCancelledArchive, setShowCancelledArchive] = useState(false);
  
  const [notificationEmail, setNotificationEmail] = useState(settings.notificationEmail || '');
  const [webhookUrl, setWebhookUrl] = useState(settings.webhookUrl || '');
  const [compEmail, setCompEmail] = useState('');
  const [tab, setTab] = useState('lists');
  const [compSearch, setCompSearch] = useState('');
  const [emailMsg, setEmailMsg] = useState('');
  const [showGasModal, setShowGasModal] = useState(false);
  const [testEmailStatus, setTestEmailStatus] = useState('');
  const [isTestingEmail, setIsTestingEmail] = useState(false);
  const [copiedGas, setCopiedGas] = useState(false);

  useEffect(() => {
    setNotificationEmail(settings.notificationEmail || '');
    setWebhookUrl(settings.webhookUrl || '');
  }, [settings]);
  
  const currentMonth = useMemo(() => new Date().toISOString().slice(0, 7), []);

  const availableMonths = useMemo(() => {
    const months = tasks
      .filter(t => !t.isDeleted && t.status !== 'ยกเลิก')
      .map(t => getEffectiveMonth(t))
      .filter(m => m !== '');
    return [...new Set([currentMonth, ...months])].sort().reverse();
  }, [tasks, currentMonth]);

  const [reportMonth, setReportMonth] = useState(() => currentMonth);

  useEffect(() => {
    if (availableMonths.length > 0 && !availableMonths.includes(reportMonth)) {
      setReportMonth(availableMonths.includes(currentMonth) ? currentMonth : availableMonths[0]);
    }
  }, [availableMonths, reportMonth, currentMonth]);
  const [reportProj, setReportProj] = useState('');
  const [reportComp, setReportComp] = useState('');
  const [reportStatus, setReportStatus] = useState('');

  // Storage Stats Calculation
  const storageStats = useMemo(() => {
    let fileCount = 0;
    let totalBytes = 0;
    tasks.forEach(t => {
      if (t.quoteFileUrl) { fileCount++; totalBytes += (t.quoteFileSize || 1500000); }
      if (t.signedFileUrl) { fileCount++; totalBytes += (t.signedFileSize || 1500000); }
      if (t.taskFileUrl) { fileCount++; totalBytes += (t.taskFileSize || 1500000); }
    });
    const totalMb = totalBytes / (1024 * 1024);
    const quotaMb = 5120; // 5 GB
    const percent = Math.min(100, Math.round((totalMb / quotaMb) * 100 * 10) / 10);
    return { fileCount, totalMb: totalMb.toFixed(2), quotaMb, percent };
  }, [tasks]);

  const cancelledTasks = useMemo(() => {
    return tasks.filter(t => t.isDeleted || t.status === 'ยกเลิก');
  }, [tasks]);

  const handleExportExcel = () => {
    if (!window.XLSX) return;
    const ws = window.XLSX.utils.json_to_sheet(tasks.filter(t => !t.isDeleted).map(t => ({
      'เลขที่ใบงาน': t.taskNo, 'โครงการ': t.project, 'บริษัท': t.company, 'พื้นที่': t.area,
      'สถานะ': t.status, 'วันเริ่มงาน': t.startDate || t.aptDate, 'วันจบงาน': t.endDate || t.aptDate,
      'วันทำจ่าย': t.payDate, 'ค่าใช้จ่าย': t.cost, 'รายละเอียด': t.details
    })));
    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, "VTrack_Backup");
    window.XLSX.writeFile(wb, `VTrack_Backup_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const handleSaveEmailSettings = async () => {
    const trimmedUrl = webhookUrl.trim();
    if (trimmedUrl) {
      if (trimmedUrl.includes('/library/')) {
        alert('⚠️ URL ไม่ถูกต้อง!\n\nลิงก์ที่คุณนำมาใส่เป็นลิงก์ประเภท "คลัง" (Library) ซึ่งใช้รับส่งข้อมูลไม่ได้ครับ\n\nที่ถูกต้องจะต้องเป็นลิงก์ "เว็บแอป" (Web app) ที่ลงท้ายด้วย /exec เช่น:\nhttps://script.google.com/macros/s/.../exec\n\n(ใน Google Apps Script ให้กด Deploy ➔ Manage deployments ➔ ดูลิงก์ Web app ครับ)');
        return;
      }
      if (!trimmedUrl.includes('/macros/s/') || !trimmedUrl.endsWith('/exec')) {
        alert('⚠️ รูปแบบ Webhook URL ไม่ถูกต้อง!\n\nURL ของ Google Apps Script จะต้องขึ้นต้นด้วย:\nhttps://script.google.com/macros/s/...\nและลงท้ายด้วย /exec เท่านั้นครับ');
        return;
      }
    }
    await updateSettings({
      ...settings,
      notificationEmail: notificationEmail.trim(),
      webhookUrl: trimmedUrl
    });
    alert('บันทึกการตั้งค่าอีเมลแจ้งเตือนเรียบร้อยแล้ว!');
  };

  const handleTestEmail = async () => {
    if (!notificationEmail.trim()) {
      alert('กรุณากรอก "อีเมลสำหรับรับแจ้งเตือน (เจ้าหน้าที่)" ก่อนทำการทดสอบ');
      return;
    }
    const currentWebhook = (webhookUrl.trim() || GOOGLE_SHEETS_WEBHOOK_URL).trim();
    if (!currentWebhook) {
      alert('กรุณากรอก "Google Apps Script Webhook URL" ก่อนทดสอบ (สามารถกดปุ่ม "ดูโค้ด & วิธีติดตั้ง Webhook ฟรี" เพื่อสร้างได้ฟรีใน 1 นาที)');
      return;
    }
    if (currentWebhook.includes('/library/')) {
      alert('⚠️ Webhook URL ไม่ถูกต้อง!\n\nลิงก์นี้เป็นลิงก์ประเภท "คลัง" (Library) ไม่สามารถใช้ส่งอีเมลได้ครับ\n\nต้องเป็นลิงก์ "เว็บแอป" (Web app) ที่ลงท้ายด้วย /exec ครับ');
      return;
    }
    if (!currentWebhook.includes('/macros/s/') || !currentWebhook.endsWith('/exec')) {
      alert('⚠️ รูปแบบ Webhook URL ไม่ถูกต้อง!\n\nต้องขึ้นต้นด้วย https://script.google.com/macros/s/...\nและลงท้ายด้วย /exec ครับ');
      return;
    }
    setIsTestingEmail(true);
    setTestEmailStatus('กำลังส่งอีเมลทดสอบระบบ Task Flow...');
    try {
      const ok = await triggerEmailNotification({
        taskNo: 'REQ-DEMO-01',
        project: 'มัณฑนา มอเตอร์เวย์ - พระราม 9',
        company: 'บจก. กรีนดิส เอ็นจิเนียริ่ง',
        area: 'งานระบบระบายน้ำและบ่อสูบ',
        aptDate: '15/10/2026',
        status: 'รอใบเสนอราคา'
      }, 'test_notification', {
        toEmail: notificationEmail.trim(),
        subject: '[V-Track Test] ทดสอบการเชื่อมต่อระบบแจ้งเตือนทางอีเมล',
        fileName: 'ใบเสนอราคา_ตัวอย่าง.pdf',
        fileSize: 153600,
        message: 'ยินดีด้วย! ระบบแจ้งเตือนทางอีเมล V-Track เชื่อมต่อกับ Google Apps Script สำเร็จเรียบร้อยแล้ว รองรับการส่งอีเมลเข้าเมลองค์กร (เช่น @lh.co.th) ได้อย่างสมบูรณ์'
      }, { webhookUrl: currentWebhook });

      if (ok) {
        setTestEmailStatus('ส่งคำขอทดสอบสำเร็จ! กรุณาตรวจสอบ Inbox/กล่องข้อความที่ ' + notificationEmail.trim());
      } else {
        setTestEmailStatus('เกิดข้อผิดพลาดในการเชื่อมต่อ Webhook');
      }
    } catch (err) {
      setTestEmailStatus('ข้อผิดพลาด: ' + err.message);
    } finally {
      setIsTestingEmail(false);
      setTimeout(() => setTestEmailStatus(''), 7000);
    }
  };

  const handleCopyGasCode = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(GAS_DEFAULT_SCRIPT);
    }
    setCopiedGas(true);
    setTimeout(() => setCopiedGas(false), 3000);
  };

  const handleAddProject = async () => {
    const name = p.trim();
    if (!name || settings.projects.includes(name)) return;
    await updateSettings({ ...settings, projects: [...settings.projects, name] });
    setP('');
  };

  const handleDeleteProject = async (item) => {
    if (!window.confirm(`ลบโครงการ "${item}" ?\n(ใบงานเดิมที่ใช้ชื่อนี้จะยังอยู่)`)) return;
    await updateSettings({ ...settings, projects: settings.projects.filter(x => x !== item) });
  };

  const saveCompanyEmails = (name, list) => {
    const next = { ...(settings.companyEmails || {}) };
    if (list.length) next[name] = list; else delete next[name];
    return updateSettings({ ...settings, companyEmails: next });
  };

  const handleAddCompany = async () => {
    const name = c.trim();
    if (!name) return;
    const { valid, invalid } = parseEmails(compEmail);
    if (invalid.length) { setEmailMsg(`อีเมลไม่ถูกต้อง: ${invalid.join(', ')}`); return; }
    setEmailMsg('');
    const companies = settings.companies.includes(name) ? settings.companies : [...settings.companies, name];
    const companyEmails = { ...(settings.companyEmails || {}) };
    if (valid.length) companyEmails[name] = [...new Set([...toEmailList(companyEmails[name]), ...valid])];
    await updateSettings({ ...settings, companies, companyEmails });
    setC('');
    setCompEmail('');
  };

  const handleDeleteCompany = async (name) => {
    if (!window.confirm(`ลบร้านค้า "${name}" และอีเมลทั้งหมดของร้านนี้?`)) return;
    const companyEmails = { ...(settings.companyEmails || {}) };
    delete companyEmails[name];
    await updateSettings({ ...settings, companies: settings.companies.filter(x => x !== name), companyEmails });
  };

  // คืน null เมื่อสำเร็จ หรือข้อความ error เมื่ออีเมลไม่ถูกต้อง
  const handleAddCompanyEmails = async (name, raw) => {
    const { valid, invalid } = parseEmails(raw);
    if (invalid.length) return `อีเมลไม่ถูกต้อง: ${invalid.join(', ')}`;
    if (!valid.length) return null;
    await saveCompanyEmails(name, [...new Set([...toEmailList(settings.companyEmails?.[name]), ...valid])]);
    return null;
  };

  const handleRemoveCompanyEmail = (name, email) =>
    saveCompanyEmails(name, toEmailList(settings.companyEmails?.[name]).filter(x => x !== email));


  const handleImport = (e) => {
    const file = e.target.files[0]; 
    if (!file || !window.Papa) { setSt('Library Error'); return; }
    setSt('กำลังนำเข้าข้อมูล...');
    window.Papa.parse(file, { 
      header: true, skipEmptyLines: true,
      complete: async (res) => {
        let count = 0; const newP = [...settings.projects]; const newC = [...settings.companies];
        for (const row of res.data) {
          const getV = (ks) => { const k = Object.keys(row).find(x => ks.includes(x.trim())); return k ? row[k].toString().trim() : ''; };
          const tNo = getV(['เลขที่ใบงาน', 'taskNo', 'เลขที่']); if (!tNo) continue;
          const tData = { 
            taskNo: tNo, 
            project: getV(['โครงการ', 'project']), 
            company: getV(['บริษัท', 'company']), 
            area: getV(['พื้นที่', 'area']) || AREAS[0], 
            status: getV(['สถานะ', 'status']) || STATUSES[0].name, 
            startDate: getV(['วันเริ่มงาน', 'startDate']),
            endDate: getV(['วันจบงาน', 'endDate']),
            aptDate: getV(['วันนัดหมาย', 'aptDate']), 
            payDate: getV(['วันทำจ่าย']), 
            cost: getV(['ค่าใช้จ่าย', 'cost']), 
            details: getV(['รายละเอียด', 'details']) 
          };
          if (tData.project && !newP.includes(tData.project)) newP.push(tData.project);
          if (tData.company && !newC.includes(tData.company)) newC.push(tData.company);
          const ex = tasks.find(t => t.taskNo === tNo && !t.isDeleted);
          await onSave(tData, !!ex, ex?.id); count++;
        }
        await updateSettings({ ...settings, projects: newP, companies: newC }); setSt(`สำเร็จ ${count} รายการ`);
      }
    });
  };

  const SETTINGS_TABS = [
    { id: 'lists', label: 'โครงการ & ร้านค้า' },
    { id: 'email', label: 'อีเมลแจ้งเตือน' },
    { id: 'report', label: 'รายงาน & สำรองข้อมูล' },
    { id: 'system', label: 'ระบบ & คลังยกเลิก' },
  ];
  const filteredCompanies = settings.companies.filter(x => x.toLowerCase().includes(compSearch.trim().toLowerCase()));
  const sectionTitle = 'text-lg font-black border-b-4 border-black pb-2 mb-4';

  return (
    <div className="space-y-6 mb-24 animate-in fade-in text-left">
      <div className="flex flex-wrap">
        {SETTINGS_TABS.map((t, i) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`min-h-12 px-4 text-sm font-extrabold border-2 border-black ${i > 0 ? '-ml-0.5' : ''} ${tab === t.id ? 'bg-black text-white' : 'bg-white hover:bg-[#FFD93D]'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'lists' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <div className="brut p-5">
            <h4 className={sectionTitle}>โครงการ <span className="num">({settings.projects.length})</span></h4>
            <form onSubmit={e => { e.preventDefault(); handleAddProject(); }} className="flex gap-2 mb-4">
              <input className="field flex-1" placeholder="ชื่อโครงการใหม่" value={p} onChange={e => setP(e.target.value)} />
              <button type="submit" className="brut-btn min-h-12 px-5 bg-[#FFD93D] font-extrabold text-sm shrink-0">เพิ่ม</button>
            </form>
            <ul className="space-y-2 max-h-96 overflow-auto custom-scrollbar pr-1">
              {settings.projects.map(item => (
                <li key={item} className="border-2 border-black bg-white flex items-center justify-between pl-3">
                  <span className="text-sm font-bold py-2">{item}</span>
                  <button onClick={() => handleDeleteProject(item)} className="min-h-12 min-w-12 flex items-center justify-center border-l-2 border-black hover:bg-[#FF5C5C]" title="ลบโครงการนี้" aria-label={`ลบ ${item}`}>
                    <X size={16} />
                  </button>
                </li>
              ))}
              {settings.projects.length === 0 && <li className="text-sm font-medium opacity-70">ยังไม่มีโครงการ</li>}
            </ul>
          </div>

          <div className="brut p-5">
            <h4 className={sectionTitle}>ร้านค้า / ผู้รับเหมา <span className="num">({settings.companies.length})</span></h4>
            <form onSubmit={e => { e.preventDefault(); handleAddCompany(); }} className="space-y-2 mb-4 border-2 border-black bg-[#FFFBEB] p-3">
              <input className="field" placeholder="ชื่อบริษัท / ร้านค้า" value={c} onChange={e => setC(e.target.value)} />
              <div className="flex gap-2">
                <input className="field flex-1" placeholder="อีเมล (ใส่ได้หลายอีเมล คั่นด้วย , หรือเว้นวรรค)" value={compEmail} onChange={e => setCompEmail(e.target.value)} />
                <button type="submit" className="brut-btn min-h-12 px-5 bg-[#FFD93D] font-extrabold text-sm shrink-0">เพิ่ม</button>
              </div>
              {emailMsg && <p className="text-xs font-bold text-[#B91C1C]">{emailMsg}</p>}
            </form>
            {settings.companies.length > 6 && (
              <div className="relative mb-3">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" />
                <input className="field pl-9" placeholder="ค้นหาร้านค้า..." value={compSearch} onChange={e => setCompSearch(e.target.value)} />
              </div>
            )}
            <div className="space-y-3 max-h-[32rem] overflow-auto custom-scrollbar pr-1">
              {filteredCompanies.map(name => (
                <CompanyRow
                  key={name}
                  name={name}
                  emails={toEmailList(settings.companyEmails?.[name])}
                  onAddEmails={(raw) => handleAddCompanyEmails(name, raw)}
                  onRemoveEmail={(em) => handleRemoveCompanyEmail(name, em)}
                  onDelete={() => handleDeleteCompany(name)}
                />
              ))}
              {filteredCompanies.length === 0 && <p className="text-sm font-medium opacity-70">{settings.companies.length ? 'ไม่พบร้านค้าที่ค้นหา' : 'ยังไม่มีร้านค้า'}</p>}
            </div>
          </div>
        </div>
      )}

      {tab === 'email' && (
        <div className="brut p-5 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b-4 border-black pb-3">
            <div>
              <h4 className="text-lg font-black flex items-center gap-2"><Mail size={20}/> แจ้งเตือนทางอีเมลอัตโนมัติ</h4>
              <p className="text-sm font-medium">แจ้งเจ้าหน้าที่เมื่อมีใบเสนอราคา และแจ้งผู้รับเหมาเมื่อเปิดใบงาน (ส่งผ่าน Google Apps Script ฟรี)</p>
            </div>
            <button type="button" onClick={() => setShowGasModal(true)} className="brut-btn min-h-12 px-4 bg-white font-extrabold text-sm self-start sm:self-center">วิธีตั้งค่า Webhook</button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-1.5">
              <label className="text-sm font-extrabold">อีเมลเจ้าหน้าที่ (รับแจ้งเตือน)</label>
              <input type="text" placeholder="admin@lh.co.th, officer@lh.co.th" value={notificationEmail} onChange={e => setNotificationEmail(e.target.value)} className="field" />
              <p className="text-xs font-medium">ใส่ได้หลายอีเมล คั่นด้วยเครื่องหมายจุลภาค (,) ส่งทันทีเมื่อผู้รับเหมาแนบใบเสนอราคา</p>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-extrabold">Google Apps Script Webhook URL</label>
              <input type="url" placeholder="https://script.google.com/macros/s/.../exec" value={webhookUrl} onChange={e => setWebhookUrl(e.target.value)} className="field num" />
              <p className="text-xs font-medium">ต้องเป็นลิงก์ Web app ที่ลงท้ายด้วย /exec (ส่งฟรี ~100 ฉบับ/วัน)</p>
            </div>
          </div>

          {testEmailStatus && (
            <div className={`border-2 border-black p-3 text-sm font-bold flex items-center gap-2 ${testEmailStatus.includes('สำเร็จ') ? 'bg-[#B8F2C9]' : testEmailStatus.includes('กำลัง') ? 'bg-[#BDE3FF]' : 'bg-[#FF5C5C]'}`}>
              {isTestingEmail && <Loader2 size={14} className="animate-spin" />}
              <span>{testEmailStatus}</span>
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={handleSaveEmailSettings} className="brut-btn min-h-12 px-6 bg-[#FFD93D] font-extrabold text-sm flex items-center gap-2">
              <CheckCircle2 size={16}/><span>บันทึกการตั้งค่า</span>
            </button>
            <button type="button" disabled={isTestingEmail} onClick={handleTestEmail} className="brut-btn min-h-12 px-5 bg-white font-extrabold text-sm flex items-center gap-2 disabled:opacity-50">
              {isTestingEmail ? <Loader2 size={14} className="animate-spin"/> : <Send size={14}/>}
              <span>{isTestingEmail ? 'กำลังส่งทดสอบ...' : 'ทดสอบส่งอีเมล'}</span>
            </button>
          </div>
        </div>
      )}

      {tab === 'report' && (
        <div className="brut p-5">
          <h4 className={sectionTitle}><Printer size={18} className="inline mr-2 -mt-1"/>ออกรายงานและสำรองข้อมูล</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
            <label className="space-y-1 block">
              <span className="text-sm font-extrabold">ประจำเดือน</span>
              <select value={reportMonth} onChange={e => setReportMonth(e.target.value)} className="field"><option value="">ทุกเดือน</option>{availableMonths.map(m => <option key={m} value={m}>{new Intl.DateTimeFormat('th-TH', { month: 'long', year: 'numeric' }).format(new Date(m))}</option>)}</select>
            </label>
            <label className="space-y-1 block">
              <span className="text-sm font-extrabold">โครงการ</span>
              <select value={reportProj} onChange={e => setReportProj(e.target.value)} className="field"><option value="">ทุกโครงการ</option>{settings.projects.map(x => <option key={x} value={x}>{x}</option>)}</select>
            </label>
            <label className="space-y-1 block">
              <span className="text-sm font-extrabold">ร้านค้า</span>
              <select value={reportComp} onChange={e => setReportComp(e.target.value)} className="field"><option value="">ทุกร้านค้า</option>{settings.companies.map(x => <option key={x} value={x}>{x}</option>)}</select>
            </label>
            <label className="space-y-1 block">
              <span className="text-sm font-extrabold">สถานะ</span>
              <select value={reportStatus} onChange={e => setReportStatus(e.target.value)} className="field"><option value="">ทุกสถานะ</option>{STATUSES.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}</select>
            </label>
          </div>
          <div className="flex flex-col sm:flex-row gap-4">
            <button onClick={() => triggerPrint({ selectedMonth: reportMonth, filterProj: reportProj, filterComp: reportComp, filterStatus: reportStatus })} className="brut-btn flex-1 min-h-12 bg-[#FFD93D] font-extrabold flex items-center justify-center gap-2"><Printer size={18}/><span>พิมพ์รายงาน PDF</span></button>
            <button onClick={handleExportExcel} className="brut-btn flex-1 min-h-12 bg-[#B8F2C9] font-extrabold flex items-center justify-center gap-2"><FileDown size={18}/><span>ดาวน์โหลด Backup Excel</span></button>
          </div>
        </div>
      )}

      {tab === 'system' && (
        <div className="space-y-6">
          <div className="brut p-5">
            <h4 className={sectionTitle}><HardDrive size={18} className="inline mr-2 -mt-1"/>พื้นที่จัดเก็บเอกสาร</h4>
            <div className="flex justify-between items-center text-sm font-bold mb-2">
              <span>ใช้ไป <span className="num">{storageStats.totalMb}</span> MB จาก <span className="num">{storageStats.quotaMb}</span> MB (แผน Spark ฟรี)</span>
              <span className="num">{storageStats.percent}%</span>
            </div>
            <div className="w-full h-5 border-2 border-black bg-white">
              <div className="h-full bg-black" style={{ width: `${Math.max(2, storageStats.percent)}%` }} />
            </div>
            <p className="text-sm font-medium mt-2">เอกสารในระบบ <span className="num font-bold">{storageStats.fileCount}</span> ไฟล์</p>
          </div>

          <div className="brut p-5">
            <div className="flex items-center justify-between gap-3">
              <h4 className="text-lg font-black"><History size={18} className="inline mr-2 -mt-1"/>คลังรายการที่ยกเลิก <span className="num">({cancelledTasks.length})</span></h4>
              <button onClick={() => setShowCancelledArchive(!showCancelledArchive)} className="brut-btn min-h-12 px-4 bg-white text-sm font-extrabold">{showCancelledArchive ? 'ซ่อนรายการ' : 'แสดงรายการ'}</button>
            </div>
            {showCancelledArchive && (
              <div className="mt-4 border-t-4 border-black pt-4">
                {cancelledTasks.length > 0 ? (
                  <div className="space-y-3 max-h-80 overflow-y-auto custom-scrollbar pr-1">
                    {cancelledTasks.map(t => {
                      const dateStr = t.cancelledAt ? new Intl.DateTimeFormat('th-TH', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(t.cancelledAt)) : '-';
                      return (
                        <div key={t.id} className="border-2 border-black bg-[#FFE5E0] p-3 flex flex-col sm:flex-row justify-between sm:items-center gap-3">
                          <div className="min-w-0">
                            <p className="num font-black">#{t.taskNo}</p>
                            <p className="text-sm font-medium">{t.project} — {t.company}</p>
                            <p className="text-sm font-bold">สาเหตุ: {t.cancelReason || 'ไม่ระบุ'}</p>
                            <p className="num text-xs font-medium">ยกเลิกเมื่อ {dateStr}</p>
                          </div>
                          <button onClick={() => onRestoreTask(t)} className="brut-btn min-h-12 px-4 bg-white text-sm font-extrabold shrink-0 flex items-center gap-1.5"><RotateCcw size={14}/><span>กู้คืน</span></button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm font-medium">ไม่มีรายการที่ถูกยกเลิก</p>
                )}
              </div>
            )}
          </div>

          <div className="border-4 border-black bg-[#FF5C5C] p-5 shadow-[6px_6px_0_0_#111]">
            <h4 className="text-lg font-black mb-1">พื้นที่อันตราย</h4>
            <p className="text-sm font-bold mb-3">ลบใบงานทั้งหมดในฐานข้อมูล กู้คืนไม่ได้ (สำรอง Excel ก่อนเสมอ)</p>
            <button onClick={() => setShowClearConfirm(true)} className="brut-btn min-h-12 px-8 bg-white font-extrabold flex items-center gap-2"><Trash size={18}/> ล้างฐานข้อมูล</button>
          </div>
        </div>
      )}

      {showClearConfirm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-6">
          <div className="brut-panel bg-white p-8 w-full max-w-sm text-center">
            <h3 className="font-black text-2xl mb-2">ยืนยันลบข้อมูลทั้งหมด?</h3>
            <p className="text-sm font-bold">การลบนี้ไม่สามารถกู้คืนได้</p>
            <div className="flex gap-4 mt-6">
              <button onClick={() => setShowClearConfirm(false)} className="brut-btn flex-1 min-h-12 bg-white font-extrabold">ยกเลิก</button>
              <button onClick={async () => { await onClear(); setShowClearConfirm(false); }} className="brut-btn flex-1 min-h-12 bg-[#FF5C5C] font-extrabold">ลบทั้งหมด</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Google Apps Script Code & Setup Instructions */}
      {showGasModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 animate-in fade-in">
          <div className="bg-white p-6 md:p-8 rounded-none w-full max-w-2xl max-h-[90vh] overflow-y-auto text-left space-y-5 custom-scrollbar brut-panel">
            <div className="flex justify-between items-center border-b border-black pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-50 text-black flex items-center justify-center font-bold text-xs">
                  GAS
                </div>
                <div>
                  <h3 className="font-bold text-gray-800 text-base">วิธีติดตั้ง Google Apps Script (ระบบ Task Flow ทะลุการบล็อคเมลองค์กร)</h3>
                  <p className="text-xs text-gray-600">ส่งอีเมลฟรี 100% ผ่านเกณฑ์ตรวจจับสแปมของเมลองค์กร (เช่น Microsoft 365, Exchange, Google Workspace)</p>
                </div>
              </div>
              <button onClick={() => setShowGasModal(false)} className="p-2 hover:bg-gray-100 rounded-full text-gray-600"><X size={18}/></button>
            </div>

            <div className="space-y-3 text-xs text-gray-600 leading-relaxed">
              <div className="p-3 bg-blue-50/60 rounded-xl border border-blue-100 space-y-1">
                <p className="font-bold text-black">ขั้นตอนที่ 1:</p>
                <p>เปิดเบราว์เซอร์ไปที่ <a href="https://script.google.com" target="_blank" rel="noreferrer" className="text-blue-600 underline font-bold">script.google.com</a> (ล็อกอินด้วยบัญชี Google ของท่าน) แล้วกดปุ่ม <strong>"+ โครงการใหม่ (New project)"</strong></p>
              </div>

              <div className="p-3 bg-blue-50/60 rounded-xl border border-blue-100 space-y-1">
                <p className="font-bold text-black">ขั้นตอนที่ 2:</p>
                <p>ลบโค้ดเดิมในหน้าจอออกทั้งหมด แล้วกดปุ่ม <strong>"คัดลอกโค้ด Google Apps Script"</strong> ด้านล่างนี้ นำไปวางแทนที่</p>
              </div>

              <div className="p-3 bg-blue-50/60 rounded-xl border border-blue-100 space-y-1">
                <p className="font-bold text-black">ขั้นตอนที่ 3:</p>
                <p>กดปุ่ม <strong>"การทำให้ใช้งานได้ (Deploy)"</strong> ด้านบนขวา ➔ เลือก <strong>"การทำให้ใช้งานได้รายการใหม่ (New deployment)"</strong> ➔ เลือกประเภทเป็น <strong>"เว็บแอป (Web app)"</strong>:</p>
                <ul className="list-disc list-inside pl-2 space-y-0.5 text-gray-700">
                  <li>เรียกใช้ในฐานะ (Execute as): <strong>ฉัน (Me)</strong></li>
                  <li>ผู้ที่มีสิทธิ์เข้าถึง (Who has access): <strong>ทุกคน (Anyone)</strong></li>
                </ul>
              </div>

              <div className="p-3 bg-blue-50/60 rounded-xl border border-blue-100 space-y-1">
                <p className="font-bold text-black">ขั้นตอนที่ 4:</p>
                <p>กด <strong>"ทำให้ใช้งานได้"</strong> และอนุญาตสิทธิ์เข้าถึง (Authorize) จากนั้นคัดลอก <strong>URL เว็บแอป (Web app URL)</strong> ที่ได้ นำมาวางลงในช่อง Webhook URL ในหน้าตั้งค่าของ V-Track เป็นอันเสร็จสมบูรณ์!</p>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-gray-700 font-mono">CODE: Code.gs</span>
                <button 
                  onClick={handleCopyGasCode}
                  className="px-3.5 py-1.5 bg-black hover:bg-[#333] text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95"
                >
                  {copiedGas ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                  <span>{copiedGas ? 'คัดลอกโค้ดแล้ว!' : 'คัดลอกโค้ดทั้งหมด'}</span>
                </button>
              </div>
              <pre className="p-4 bg-gray-900 text-gray-100 rounded-2xl text-xs font-mono overflow-x-auto max-h-60 custom-scrollbar leading-normal">
                {GAS_DEFAULT_SCRIPT}
              </pre>
            </div>

            <div className="pt-2 flex justify-end">
              <button 
                onClick={() => setShowGasModal(false)}
                className="px-6 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold"
              >
                ปิดหน้าต่าง
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}