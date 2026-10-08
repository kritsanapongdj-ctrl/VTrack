/* eslint-disable */
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  LayoutDashboard, FileText, Settings, Calendar as CalendarIcon, PlusCircle, 
  Upload, Search, Edit, Trash2, X, AlertCircle, Menu, ChevronLeft, ChevronRight, 
  User, Filter, CalendarDays, FileDown, Printer, Trash, MapPin, Building2, Briefcase,
  Paperclip, PenTool, CheckCircle2, Clock, AlertTriangle, ArrowRight, Download,
  Lock, Unlock, HardDrive, History, Eye, RotateCcw, ShieldCheck, DollarSign, Radio, Sparkles, Loader2, Image as ImageIcon,
  Mail, Send, Copy, Check
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, getDoc, setDoc, onSnapshot, addDoc, updateDoc, deleteDoc, getDocs } from 'firebase/firestore';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

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
  { id: 1, name: 'รอใบเสนอราคา', color: '#94A3B8', bgColor: '#F1F5F9' },
  { id: 2, name: 'อยู่ระหว่างตรวจสอบใบเสนอราคา', color: '#F59E0B', bgColor: '#FEF3C7' },
  { id: 3, name: 'อนุมัติใบเสนอราคาแล้ว', color: '#6366F1', bgColor: '#EEF2FF' },
  { id: 4, name: 'เปิดใบงานในระบบแล้ว', color: '#3B82F6', bgColor: '#DBEAFE' },
  { id: 5, name: 'จบงานและรอรับเอกสารวางบิล', color: '#A855F7', bgColor: '#F3E8FF' },
  { id: 6, name: 'ได้รับเอกสารวางบิลแล้ว', color: '#EC4899', bgColor: '#FCE7F3' },
  { id: 7, name: 'ส่งเอกสารเบิกจ่ายแล้ว', color: '#10B981', bgColor: '#D1FAE5' },
  { id: 8, name: 'ยกเลิก', color: '#EF4444', bgColor: '#FEE2E2' }
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

const stampSignatureOnPdf = async (pdfUrlOrId, signaturePngBase64) => {
  const dataUrl = await getFileDataUrl(pdfUrlOrId);
  if (!dataUrl) throw new Error("ไม่พบไฟล์เอกสารสำหรับเซ็นต์");

  const base64Content = dataUrl.split(';base64,')[1];
  const binaryString = atob(base64Content);
  const len = binaryString.length;
  const existingPdfBytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    existingPdfBytes[i] = binaryString.charCodeAt(i);
  }

  const pdfDoc = await PDFDocument.load(existingPdfBytes);

  const pngImage = await pdfDoc.embedPng(signaturePngBase64);
  const pages = pdfDoc.getPages();
  const lastPage = pages[pages.length - 1];
  const { width } = lastPage.getSize();

  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const helveticaRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const stampW = 210;
  const stampH = 75;
  const stampX = Math.max(20, width - stampW - 25);
  const stampY = 30;

  lastPage.drawRectangle({
    x: stampX,
    y: stampY,
    width: stampW,
    height: stampH,
    color: rgb(0.97, 0.98, 1.0),
    borderColor: rgb(0.39, 0.4, 0.95),
    borderWidth: 1.5,
  });

  lastPage.drawText('APPROVED & VERIFIED', {
    x: stampX + 12,
    y: stampY + stampH - 16,
    size: 8.5,
    font: helveticaBold,
    color: rgb(0.2, 0.25, 0.6),
  });

  const signDateStr = new Date().toLocaleDateString('th-TH');
  lastPage.drawText(`Signed: ${signDateStr}`, {
    x: stampX + 12,
    y: stampY + stampH - 28,
    size: 7.5,
    font: helveticaRegular,
    color: rgb(0.35, 0.35, 0.45),
  });

  const imgW = pngImage.width || 85;
  const imgH = pngImage.height || 48;
  const maxBoxW = 85;
  const maxBoxH = 48;
  const scale = Math.min(maxBoxW / imgW, maxBoxH / imgH);
  const drawW = imgW * scale;
  const drawH = imgH * scale;
  const drawX = (stampX + stampW - 95) + (maxBoxW - drawW) / 2;
  const drawY = (stampY + 8) + (maxBoxH - drawH) / 2;

  lastPage.drawImage(pngImage, {
    x: drawX,
    y: drawY,
    width: drawW,
    height: drawH,
  });

  return await pdfDoc.save();
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
    var data = JSON.parse(e.postData.contents);
    var toEmail = data.toEmail;
    var subject = data.subject || ("V-Track แจ้งเตือน: " + (data.taskNo || ''));
    var event = data.event;
    
    if (!toEmail) {
      return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "No recipient email" }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    var htmlBody = "";
    if (event === "quotation_uploaded") {
      htmlBody = '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">' +
        '<div style="background-color: #003366; color: #ffffff; padding: 16px; border-radius: 8px; text-align: center;">' +
        '<h2 style="margin: 0; letter-spacing: 1px;">V-TRACK SYSTEM</h2>' +
        '<p style="margin: 4px 0 0 0; font-size: 13px; color: #C5A059; font-weight: bold;">แจ้งเตือน: ผู้รับเหมาแนบใบเสนอราคาใหม่</p>' +
        '</div>' +
        '<div style="padding: 20px 0; color: #334155; line-height: 1.6;">' +
        '<p>เรียน เจ้าหน้าที่ผู้ดูแลระบบ,</p>' +
        '<p>ผู้รับเหมาได้ทำการแนบไฟล์ใบเสนอราคาสำหรับงานในระบบเรียบร้อยแล้ว มีรายละเอียดดังนี้:</p>' +
        '<table style="width: 100%; border-collapse: collapse; margin: 16px 0;">' +
        '<tr><td style="padding: 8px; border-bottom: 1px solid #f1f5f9; font-weight: bold; width: 140px; color: #64748b;">เลขที่ใบงาน:</td><td style="padding: 8px; border-bottom: 1px solid #f1f5f9; color: #003366; font-weight: bold;">' + (data.taskNo || '-') + '</td></tr>' +
        '<tr><td style="padding: 8px; border-bottom: 1px solid #f1f5f9; font-weight: bold; color: #64748b;">โครงการ:</td><td style="padding: 8px; border-bottom: 1px solid #f1f5f9;">' + (data.project || '-') + '</td></tr>' +
        '<tr><td style="padding: 8px; border-bottom: 1px solid #f1f5f9; font-weight: bold; color: #64748b;">บริษัท/ผู้รับเหมา:</td><td style="padding: 8px; border-bottom: 1px solid #f1f5f9; font-weight: bold;">' + (data.company || '-') + '</td></tr>' +
        '<tr><td style="padding: 8px; border-bottom: 1px solid #f1f5f9; font-weight: bold; color: #64748b;">ชื่อไฟล์ที่แนบ:</td><td style="padding: 8px; border-bottom: 1px solid #f1f5f9;">' + (data.fileName || '-') + '</td></tr>' +
        '<tr><td style="padding: 8px; border-bottom: 1px solid #f1f5f9; font-weight: bold; color: #64748b;">สถานะปัจจุบัน:</td><td style="padding: 8px; border-bottom: 1px solid #f1f5f9; color: #d97706; font-weight: bold;">อยู่ระหว่างตรวจสอบใบเสนอราคา</td></tr>' +
        '</table>' +
        '<p style="margin-top: 20px; font-size: 13px; color: #475569;">กรุณาเข้าสู่ระบบ V-Track เพื่อตรวจสอบความถูกต้องและดำเนินการอนุมัติหรือออกใบงานต่อไป</p>' +
        '</div>' +
        '<div style="text-align: center; color: #94a3b8; font-size: 11px; border-top: 1px solid #e2e8f0; padding-top: 12px;">' +
        'อีเมลฉบับนี้ส่งโดยระบบอัตโนมัติ V-Track Operation System' +
        '</div>' +
        '</div>';
    } else if (event === "task_order_attached") {
      htmlBody = '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">' +
        '<div style="background-color: #003366; color: #ffffff; padding: 16px; border-radius: 8px; text-align: center;">' +
        '<h2 style="margin: 0; letter-spacing: 1px;">V-TRACK SYSTEM</h2>' +
        '<p style="margin: 4px 0 0 0; font-size: 13px; color: #C5A059; font-weight: bold;">แจ้งมอบหมายใบงานแจ้งซ่อม / กำหนดเข้าทำงาน</p>' +
        '</div>' +
        '<div style="padding: 20px 0; color: #334155; line-height: 1.6;">' +
        '<p>เรียน ผู้รับเหมา (' + (data.company || '') + '),</p>' +
        '<p>ทางเจ้าหน้าที่ได้ทำการออกใบงานแจ้งซ่อมและกำหนดช่วงเวลาปฏิบัติงานเรียบร้อยแล้ว มีรายละเอียดดังนี้:</p>' +
        '<table style="width: 100%; border-collapse: collapse; margin: 16px 0;">' +
        '<tr><td style="padding: 8px; border-bottom: 1px solid #f1f5f9; font-weight: bold; width: 140px; color: #64748b;">เลขที่ใบงาน:</td><td style="padding: 8px; border-bottom: 1px solid #f1f5f9; color: #003366; font-weight: bold;">' + (data.taskNo || '-') + '</td></tr>' +
        '<tr><td style="padding: 8px; border-bottom: 1px solid #f1f5f9; font-weight: bold; color: #64748b;">โครงการ:</td><td style="padding: 8px; border-bottom: 1px solid #f1f5f9;">' + (data.project || '-') + '</td></tr>' +
        '<tr><td style="padding: 8px; border-bottom: 1px solid #f1f5f9; font-weight: bold; color: #64748b;">ช่วงวันเข้าทำงาน:</td><td style="padding: 8px; border-bottom: 1px solid #f1f5f9; color: #059669; font-weight: bold;">' + (data.startDate || '-') + ' ถึง ' + (data.endDate || '-') + '</td></tr>' +
        '<tr><td style="padding: 8px; border-bottom: 1px solid #f1f5f9; font-weight: bold; color: #64748b;">พื้นที่หน้างาน:</td><td style="padding: 8px; border-bottom: 1px solid #f1f5f9;">' + (data.area || '-') + '</td></tr>' +
        '<tr><td style="padding: 8px; border-bottom: 1px solid #f1f5f9; font-weight: bold; color: #64748b;">ไฟล์ใบงานแจ้งซ่อม:</td><td style="padding: 8px; border-bottom: 1px solid #f1f5f9;">' + (data.fileName || '-') + '</td></tr>' +
        '</table>' +
        '<p style="margin-top: 20px; font-size: 13px; color: #475569;">ท่านสามารถเข้าสู่ระบบ V-Track เพื่อเปิดดูและดาวน์โหลดไฟล์ใบงานแจ้งซ่อมเก็บไว้ปฏิบัติงานได้ทันที</p>' +
        '</div>' +
        '<div style="text-align: center; color: #94a3b8; font-size: 11px; border-top: 1px solid #e2e8f0; padding-top: 12px;">' +
        'อีเมลฉบับนี้ส่งโดยระบบอัตโนมัติ V-Track Operation System' +
        '</div>' +
        '</div>';
    } else {
      htmlBody = '<div style="font-family: Arial, sans-serif; padding: 20px;"><h3 style="color:#003366;">V-TRACK SYSTEM</h3><p>' + (data.message || 'ทดสอบการส่งอีเมลแจ้งเตือนสำเร็จ') + '</p></div>';
    }
    
    MailApp.sendEmail({
      to: toEmail,
      subject: subject,
      htmlBody: htmlBody
    });
    
    return ContentService.createTextOutput(JSON.stringify({ status: "success", message: "Email sent to " + toEmail }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}`;

const triggerEmailNotification = async (task, eventType, extraData = {}, currentSettings = null) => {
  const webhookUrl = currentSettings?.webhookUrl || GOOGLE_SHEETS_WEBHOOK_URL;
  if (!webhookUrl) {
    console.log('Email notification skipped: No Webhook URL configured in Settings');
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
      details: task?.details || '',
      ...extraData,
      timestamp: new Date().toISOString()
    };
    await fetch(webhookUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
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
  if (!task) return '';
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
    <div className="relative inline-block w-full max-w-[160px]">
      <select 
        value={task.status} 
        onChange={handleChange}
        className="w-full appearance-none px-3 py-1.5 rounded-[5px] text-[10px] font-bold border-t border-t-white/40 border-b-2 border-b-black/20 shadow-2xs cursor-pointer outline-none focus:ring-2 focus:ring-[#C5A059]"
        style={{backgroundColor: s?.bgColor || '#f3f4f6', color: s?.color || '#374151'}}
      >
        {STATUSES.map(st => (
          <option key={st.id} value={st.name}>{st.name}</option>
        ))}
      </select>
      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-500">
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
      if (prevStatus === 'รอใบเสนอราคา' || !task.quoteFileUrl) {
        if (settings?.notificationEmail) {
          notifiedAdmin = await triggerEmailNotification(updatedData, 'quotation_uploaded', {
            toEmail: settings.notificationEmail,
            subject: `[V-Track แจ้งเตือน] ผู้รับเหมาแนบใบเสนอราคา - ใบงาน #${task.taskNo} (${task.project})`,
            fileName: saveRes.fileName,
            fileUrl: saveRes.fileUrl,
            fileSize: saveRes.fileSize,
            recipientType: 'admin'
          }, settings);
        }
      }
      alert("แนบใบเสนอราคาเรียบร้อยแล้ว สถานะเปลี่ยนเป็น 'อยู่ระหว่างตรวจสอบใบเสนอราคา'" + (notifiedAdmin ? "\n(ส่งอีเมลแจ้งเตือนเจ้าหน้าที่ตรวจสอบแล้ว)" : ""));
    } catch (err) {
      console.error("Upload quote error:", err);
      alert("เกิดข้อผิดพลาดในการแนบใบเสนอราคา: " + err.message);
    }
  };

  const handleConfirmSign = async (task, signaturePngDataUrl) => {
    const fileSource = task.quoteFileUrl || task.quoteFileId;
    if (!fileSource) {
      alert("ไม่พบไฟล์ใบเสนอราคาต้นฉบับ");
      return;
    }
    try {
      const signedPdfBytes = await stampSignatureOnPdf(fileSource, signaturePngDataUrl);
      const signedFileName = `signed_${task.quoteFileName || 'quotation.pdf'}`;
      const saveRes = await saveFileToStore(signedPdfBytes, signedFileName, 'application/pdf');

      const updatedTimeline = appendTimelineEvent(task.timeline, {
        type: 'signed',
        by: 'เจ้าหน้าที่',
        note: 'ตรวจรับและเซ็นต์อนุมัติใบเสนอราคาเรียบร้อย'
      });

      const updatedData = {
        ...task,
        signedFileUrl: saveRes.fileUrl,
        signedFileId: saveRes.fileId,
        signedFileName: saveRes.fileName,
        signedFileSize: saveRes.fileSize,
        signedAt: Date.now(),
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
      const contractorEmail = settings?.companyEmails?.[task.company];
      let notifiedContractor = false;
      if (contractorEmail) {
        notifiedContractor = await triggerEmailNotification(updatedData, 'task_order_attached', {
          toEmail: contractorEmail,
          subject: `[V-Track แจ้งงาน] มอบหมายใบงานแจ้งซ่อม #${taskNo} - โครงการ ${task.project}`,
          fileName: saveRes.fileName,
          fileUrl: saveRes.fileUrl,
          fileSize: saveRes.fileSize,
          startDate,
          endDate,
          recipientType: 'contractor'
        }, settings);
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

  if (systemError) return <div className="p-8 text-center text-red-500 font-bold">{systemError}</div>;
  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="w-12 h-12 border-4 border-[#003366]/10 border-t-[#C5A059] rounded-full animate-spin"></div></div>;

  if (isPrinting && printData) {
    return <PrintReport tasks={tasks} printData={printData} onDone={() => setIsPrinting(false)} />;
  }

  return (
    <div className="flex flex-col md:flex-row h-screen bg-[#FDFDFD] text-gray-900 font-sans overflow-hidden">
      <aside className={`hidden md:flex ${isSidebarOpen ? 'w-64' : 'w-20'} flex-col bg-[#003366] text-white transition-all duration-300 relative overflow-hidden`}>
        <div className="h-20 flex items-center justify-between px-6 border-b border-white/5">
          {isSidebarOpen && <span className="font-bold text-xl tracking-tighter">V<span className="text-[#C5A059]">-TRACK</span></span>}
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 hover:bg-white/10 rounded-xl"><Menu size={20}/></button>
        </div>
        <nav className="flex-1 p-4 space-y-2">
          <NavItem id="dashboard" icon={LayoutDashboard} label="แดชบอร์ด" active={activeTab} set={setActiveTab} open={isSidebarOpen}/>
          <NavItem id="add" icon={PlusCircle} label="เพิ่มใบงาน" active={activeTab} set={setActiveTab} open={isSidebarOpen}/>
          <NavItem id="management" icon={FileText} label="จัดการข้อมูล" active={activeTab} set={setActiveTab} open={isSidebarOpen}/>
          <NavItem id="calendar" icon={CalendarIcon} label="ปฏิทินงาน" active={activeTab} set={setActiveTab} open={isSidebarOpen}/>
          <div className="pt-4 border-t border-white/5"><NavItem id="settings" icon={Settings} label="ตั้งค่าระบบ" active={activeTab} set={setActiveTab} open={isSidebarOpen}/></div>
        </nav>
      </aside>

      <main className="flex-1 flex flex-col h-full overflow-hidden relative">
        <header className="h-16 md:h-20 bg-white/90 backdrop-blur-md border-b border-gray-100 flex items-center justify-between px-6 sticky top-0 z-20">
          <h2 className="text-lg font-bold text-[#003366]">ระบบจัดการใบงาน V-TRACK</h2>
          <div className="flex items-center space-x-3">
            {isUnlocked && <button onClick={() => setIsUnlocked(false)} className="text-[10px] bg-red-50 text-red-500 px-2 py-1 rounded-md border border-red-100 font-bold">LOCK</button>}
            <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-[#003366]"><User size={18}/></div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto pb-24 md:pb-8 p-4 md:p-8 custom-scrollbar">
          <div className="max-w-6xl mx-auto">
            {['add', 'management', 'settings'].includes(activeTab) && !isUnlocked ? (
              <PinLock onUnlock={() => setIsUnlocked(true)} />
            ) : (
              <>
                {activeTab === 'dashboard' && (
                  <Dashboard 
                    tasks={tasks} 
                    settings={settings} 
                    onViewDetail={(t) => setViewDetailTask(t)}
                    onOpenReschedule={(t) => setRescheduleModalTask(t)}
                  />
                )}
                {activeTab === 'add' && (
                  <TaskForm 
                    settings={settings} 
                    onSave={saveTask} 
                    onSuccess={() => setActiveTab('management')} 
                  />
                )}
                {activeTab === 'management' && (
                  <Management 
                    tasks={tasks} 
                    settings={settings} 
                    onSave={saveTask} 
                    onDelete={(t) => setCancelModalTask(t)}
                    onViewDetail={(t) => setViewDetailTask(t)}
                    onRequestCancel={(t) => setCancelModalTask(t)}
                    onRequestDisbursement={(t) => setDisbursementModalTask(t)}
                  />
                )}
                {activeTab === 'calendar' && (
                  <CalendarView 
                    tasks={tasks} 
                    settings={settings} 
                    onViewDetail={(t) => setViewDetailTask(t)}
                  />
                )}
                {activeTab === 'settings' && (
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

        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-gray-100 flex justify-around items-center h-16 z-30 shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
          <MobileNavItem id="dashboard" icon={LayoutDashboard} label="แดชบอร์ด" active={activeTab} set={setActiveTab} />
          <MobileNavItem id="add" icon={PlusCircle} label="เพิ่ม" active={activeTab} set={setActiveTab} />
          <MobileNavItem id="management" icon={FileText} label="รายการ" active={activeTab} set={setActiveTab} />
          <MobileNavItem id="calendar" icon={CalendarIcon} label="ปฏิทิน" active={activeTab} set={setActiveTab} />
          <MobileNavItem id="settings" icon={Settings} label="ตั้งค่า" active={activeTab} set={setActiveTab} />
        </nav>
      </main>

      {/* Global Modals for V2 Operations */}
      {viewDetailTask && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-end md:items-center justify-center z-[70] p-0 md:p-4 overflow-y-auto">
          <div className="relative w-full max-w-3xl mt-16 md:mt-0 animate-in slide-in-from-bottom-full md:zoom-in-95 duration-300">
            <button 
              onClick={() => setViewDetailTask(null)} 
              className={`absolute top-6 right-6 md:top-8 md:right-8 z-20 p-2 rounded-full shadow-sm transition-colors ${!isUnlocked ? 'bg-black/60 text-pink-300 hover:bg-black/90 hover:text-white border border-pink-500/40' : 'bg-gray-100 hover:bg-gray-200 text-gray-600'}`}
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
    <button onClick={() => set(id)} className={`w-full flex items-center space-x-3 px-4 py-3 rounded-2xl transition-all duration-300 ${isAct ? 'bg-[#C5A059] text-white shadow-lg' : 'text-white/60 hover:bg-white/5 hover:text-white'}`}>
      <Icon size={20} strokeWidth={isAct ? 2.5 : 2} />
      {open && <span className="text-sm font-semibold">{label}</span>}
    </button>
  );
}

function MobileNavItem({ id, icon: Icon, label, active, set }) {
  return (
    <button onClick={() => set(id)} className={`flex flex-col items-center justify-center flex-1 h-full transition-colors ${active === id ? 'text-[#C5A059]' : 'text-gray-400'}`}>
      <Icon size={20} strokeWidth={active === id ? 2.5 : 2} />
      <span className="text-[10px] mt-1 font-bold">{label}</span>
    </button>
  );
}

function PinLock({ onUnlock }) {
  const [v, setV] = useState('');
  const sub = (e) => { e.preventDefault(); if (v === '1312') onUnlock(); else setV(''); };
  return (
    <div className="flex flex-col items-center pt-12 animate-in fade-in zoom-in duration-500">
      <div className="bg-white p-8 rounded-[2.5rem] shadow-2xl border border-gray-100 w-full max-w-xs text-center">
        <div className="w-16 h-16 bg-[#003366]/5 rounded-full flex items-center justify-center mx-auto mb-6 text-[#003366]"><Settings size={28}/></div>
        <h3 className="font-bold text-gray-800 text-xl mb-2">Admin Login</h3>
        <p className="text-xs text-gray-400 mb-8 font-medium">กรุณาระบุรหัสผ่านเพื่อเข้าใช้งานส่วนนี้</p>
        <form onSubmit={sub}>
          <input type="password" value={v} onChange={e=>setV(e.target.value)} maxLength={4} placeholder="••••" className="w-full text-center text-3xl tracking-[0.5em] p-4 bg-gray-50 rounded-2xl mb-8 border-none focus:ring-2 focus:ring-[#C5A059]" autoFocus />
          <button type="submit" className="w-full bg-[#003366] text-white py-4 rounded-2xl font-bold active:scale-95 transition-transform">ยืนยันรหัสผ่าน</button>
        </form>
      </div>
    </div>
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
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[110] p-4 animate-in fade-in duration-200">
      <div className="bg-white p-8 rounded-[2.5rem] shadow-2xl border border-gray-100 w-full max-w-sm text-center relative">
        <button onClick={onClose} className="absolute top-6 right-6 p-2 bg-gray-50 rounded-full text-gray-400 hover:bg-gray-100"><X size={18}/></button>
        <div className="w-16 h-16 bg-[#003366]/5 rounded-full flex items-center justify-center mx-auto mb-4 text-[#003366]"><Lock size={26}/></div>
        <h3 className="font-bold text-gray-800 text-lg mb-1">ยืนยันสิทธิ์ผู้ดูแล (Admin)</h3>
        <p className="text-xs text-gray-400 mb-6 font-medium">{title}</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input 
            type="password" 
            value={pin} 
            onChange={e => setPin(e.target.value)} 
            maxLength={4} 
            placeholder="••••" 
            className="w-full text-center text-3xl tracking-[0.5em] p-3.5 bg-gray-50 rounded-2xl border-none focus:ring-2 focus:ring-[#C5A059]" 
            autoFocus 
          />
          {err && <p className="text-xs text-red-500 font-bold">{err}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="flex-1 py-3.5 rounded-xl font-bold text-xs bg-gray-100 text-gray-600 hover:bg-gray-200">ยกเลิก</button>
            <button type="submit" className="flex-1 py-3.5 rounded-xl font-bold text-xs bg-[#003366] text-white hover:bg-[#002244]">ยืนยันรหัส</button>
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
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[110] p-4 animate-in fade-in duration-200">
      <div className="bg-white p-6 md:p-8 rounded-[2.5rem] shadow-2xl border border-emerald-100 w-full max-w-md text-left relative">
        <button onClick={onClose} className="absolute top-6 right-6 p-2 bg-gray-50 rounded-full text-gray-400 hover:bg-gray-100"><X size={18}/></button>
        
        <div className="flex items-center space-x-3 mb-4">
          <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center shrink-0 border border-emerald-100 shadow-sm">
            <DollarSign size={24}/>
          </div>
          <div>
            <h3 className="font-bold text-gray-800 text-lg">ระบุวันที่ทำจ่าย</h3>
            <p className="text-xs text-gray-400">สถานะ: ส่งเอกสารเบิกจ่ายแล้ว</p>
          </div>
        </div>

        {/* Task summary */}
        <div className="p-3.5 bg-gray-50 rounded-2xl border border-gray-100 mb-4 space-y-1">
          <div className="flex justify-between items-center text-xs">
            <span className="font-bold text-[#003366]">{task.taskNo}</span>
            <span className="font-bold text-emerald-600">
              {task.cost ? `฿ ${isNaN(task.cost) ? task.cost : Number(task.cost).toLocaleString()}` : 'ไม่ระบุยอดเงิน'}
            </span>
          </div>
          <div className="text-[11px] text-gray-500 truncate">{task.project} • {task.company}</div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block ml-1">
              วันที่ทำจ่าย (วันที่จะได้รับเงิน) *
            </label>
            <input 
              type="date" 
              required 
              value={payDate} 
              onChange={e => setPayDate(e.target.value)} 
              className="w-full p-3.5 bg-gray-50 rounded-2xl border-none focus:ring-2 focus:ring-emerald-500 text-sm font-semibold text-gray-800" 
            />
            {/* Quick date presets */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              <button type="button" onClick={() => setPreset(0)} className="text-[10px] px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg font-medium">วันนี้</button>
              <button type="button" onClick={() => setPreset(7)} className="text-[10px] px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg font-medium">+7 วัน</button>
              <button type="button" onClick={() => setPreset(15)} className="text-[10px] px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg font-medium">+15 วัน</button>
              <button type="button" onClick={setEndOfMonth} className="text-[10px] px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg font-medium">สิ้นเดือนนี้</button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block ml-1">
              หมายเหตุการทำจ่าย (ถ้ามี)
            </label>
            <input 
              type="text" 
              value={note} 
              onChange={e => setNote(e.target.value)} 
              placeholder="เช่น รอบโอนวันที่ 15, โอนผ่าน KTB" 
              className="w-full p-3.5 bg-gray-50 rounded-2xl border-none focus:ring-2 focus:ring-emerald-500 text-sm text-gray-700" 
            />
          </div>

          <div className="p-3 bg-emerald-50/60 rounded-xl border border-emerald-100/60 text-[11px] text-emerald-800">
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
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4 animate-in fade-in duration-200">
      <div className="bg-white p-8 rounded-[2.5rem] shadow-2xl border border-red-100 w-full max-w-md text-left relative">
        <button onClick={onClose} className="absolute top-6 right-6 p-2 bg-gray-50 rounded-full text-gray-400 hover:bg-gray-100"><X size={18}/></button>
        <div className="flex items-center space-x-3 mb-4">
          <div className="w-12 h-12 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center shrink-0"><AlertTriangle size={24}/></div>
          <div>
            <h3 className="font-bold text-lg text-gray-900">ยกเลิกใบงาน #{task.taskNo}</h3>
            <p className="text-xs text-gray-400">ระบบจะทำการลบไฟล์ PDF ทั้งหมดใน Storage เพื่อประหยัดพื้นที่</p>
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
              className="w-full p-3.5 bg-gray-50 rounded-2xl text-xs md:text-sm border-none focus:ring-2 focus:ring-red-400 resize-none"
            />
          </div>
          <div className="bg-amber-50 p-3.5 rounded-xl border border-amber-200/60 text-amber-800 text-[11px] leading-relaxed">
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
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex flex-col items-center justify-center z-[120] p-2 md:p-6 animate-in fade-in duration-200">
      <div className="bg-[#1e293b] border border-gray-700 w-full max-w-5xl h-[92vh] rounded-[2rem] flex flex-col overflow-hidden shadow-2xl relative">
        {/* Header bar */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-[#0f172a] border-b border-gray-800 text-white shrink-0">
          <div className="flex items-center space-x-3 truncate">
            <div className="w-8 h-8 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center shrink-0">
              <FileText size={18} />
            </div>
            <div className="truncate text-left">
              <h3 className="font-bold text-sm truncate text-white">{title || fileName || 'เอกสาร PDF'}</h3>
              <p className="text-[10px] text-gray-400">พรีวิวอ่านเอกสารในระบบ (ไม่บันทึกลงหน่วยความจำเครื่อง)</p>
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
              className="p-1.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
              title="ปิด"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 bg-slate-900 flex items-center justify-center relative overflow-hidden">
          {loading && (
            <div className="flex flex-col items-center space-y-3 text-gray-400">
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
  const [signing, setSigning] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setHasDrawn(false);
    setUploadedImage(null);
    setUploadedImageName('');
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
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    setHasDrawn(false);
  };

  const handleImageFileChange = async (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setUploadedImageName(file.name);
      try {
        const pngDataUrl = await convertImageToPngDataUrl(file);
        setUploadedImage(pngDataUrl);
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

      await onConfirm(task, finalSignatureDataUrl);
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
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4 animate-in fade-in duration-200">
      <div className="bg-white p-6 md:p-8 rounded-[2.5rem] shadow-2xl border border-indigo-100 w-full max-w-lg text-left relative">
        <button onClick={onClose} className="absolute top-6 right-6 p-2 bg-gray-50 rounded-full text-gray-400 hover:bg-gray-100"><X size={18}/></button>
        <div className="flex items-center space-x-3 mb-4">
          <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center shrink-0"><PenTool size={22}/></div>
          <div>
            <h3 className="font-bold text-lg text-gray-900">ตรวจรับและเซ็นต์อนุมัติใบเสนอราคา</h3>
            <p className="text-xs text-gray-400">ใบงาน #{task.taskNo} ({task.company})</p>
          </div>
        </div>

        {/* Mode Switcher Tabs */}
        <div className="flex bg-indigo-50/70 p-1 rounded-2xl mb-4 border border-indigo-100">
          <button
            type="button"
            onClick={() => setSignMode('draw')}
            className={`flex-1 py-2 rounded-xl text-xs font-bold flex items-center justify-center space-x-1.5 transition-all ${signMode === 'draw' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-indigo-600'}`}
          >
            <PenTool size={14} />
            <span>วาดลายเซ็นต์ (สไตลัส/สัมผัส)</span>
          </button>
          <button
            type="button"
            onClick={() => setSignMode('image')}
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

            <div className="relative border-2 border-dashed border-indigo-200 rounded-2xl bg-indigo-50/20 overflow-hidden touch-none h-48 flex items-center justify-center">
              <canvas
                ref={canvasRef}
                className="w-full h-full cursor-crosshair"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
              />
              {!hasDrawn && (
                <div className="pointer-events-none absolute text-center text-gray-300">
                  <PenTool size={24} className="mx-auto mb-1 opacity-40"/>
                  <span className="text-xs font-medium">เซ็นต์ชื่อที่นี่...</span>
                </div>
              )}
            </div>
            <p className="text-[11px] text-gray-400">ระบบจะทำการ Stamp ลายเซ็นต์ลงในหน้าสุดท้ายของใบเสนอราคา PDF (Fixed Zone) พร้อมบันทึกหลักฐานการอนุมัติ</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex justify-between items-center text-xs font-bold text-gray-500">
              <span>เลือกไฟล์รูปภาพลายเซ็นต์ทางการ</span>
              {uploadedImage && (
                <button onClick={() => { setUploadedImage(null); setUploadedImageName(''); }} type="button" className="text-red-500 hover:underline flex items-center gap-1">
                  <RotateCcw size={12}/> เปลี่ยนรูปภาพ
                </button>
              )}
            </div>

            {!uploadedImage ? (
              <label className="border-2 border-dashed border-indigo-200 hover:border-indigo-400 rounded-2xl bg-indigo-50/20 hover:bg-indigo-50/40 p-6 flex flex-col items-center justify-center cursor-pointer transition-all h-48 text-center">
                <ImageIcon size={32} className="text-indigo-400 mb-2 opacity-80" />
                <span className="text-xs font-bold text-indigo-700">คลิกเพื่อเลือกไฟล์รูปลายเซ็นต์</span>
                <span className="text-[10px] text-gray-400 mt-1">รองรับ PNG (แนะนำพื้นหลังโปร่งแสง), JPG, JPEG, WebP</span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/jpg"
                  className="hidden"
                  onChange={handleImageFileChange}
                />
              </label>
            ) : (
              <div className="border border-indigo-200 rounded-2xl bg-indigo-50/10 p-4 flex flex-col items-center justify-center h-48 relative">
                <img
                  src={uploadedImage}
                  alt="ลายเซ็นต์ที่แนบ"
                  className="max-h-36 max-w-full object-contain filter drop-shadow-sm"
                />
                <span className="absolute bottom-2 left-3 right-3 text-[10px] font-mono text-gray-500 text-center truncate">
                  ✓ {uploadedImageName || 'รูปลายเซ็นต์พร้อมใช้งาน'}
                </span>
              </div>
            )}
            <p className="text-[11px] text-gray-400">รูปภาพจะถูกปรับขนาดและสแตมป์ลงในกล่องอนุมัติ (Fixed Zone) หน้าสุดท้ายของ PDF อัตโนมัติ</p>
          </div>
        )}

        <div className="flex gap-2 pt-4">
          <button type="button" onClick={onClose} disabled={signing} className="flex-1 py-3.5 rounded-xl font-bold text-xs bg-gray-100 text-gray-600 hover:bg-gray-200">ยกเลิก</button>
          <button 
            type="button" 
            onClick={handleConfirm} 
            disabled={!canConfirm || signing} 
            className="flex-1 py-3.5 rounded-xl font-bold text-xs bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center space-x-1.5"
          >
            {signing ? <span className="animate-spin mr-1">⏳</span> : <ShieldCheck size={16}/>}
            <span>{signing ? 'กำลังประทับลง PDF...' : 'ยืนยันและเซ็นต์อนุมัติ'}</span>
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
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4 animate-in fade-in duration-200">
      <div className="bg-white p-6 md:p-8 rounded-[2.5rem] shadow-2xl border border-blue-100 w-full max-w-md text-left relative">
        <button onClick={onClose} className="absolute top-6 right-6 p-2 bg-gray-50 rounded-full text-gray-400 hover:bg-gray-100"><X size={18}/></button>
        <div className="flex items-center space-x-3 mb-4">
          <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center shrink-0"><FileText size={22}/></div>
          <div>
            <h3 className="font-bold text-lg text-gray-900">แนบใบงานแจ้งซ่อม & เปิดงานในระบบ</h3>
            <p className="text-xs text-gray-400">{task.project} — {task.company}</p>
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
              className="w-full p-2.5 bg-gray-50 rounded-2xl text-xs border border-gray-200 file:mr-3 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-[#003366] file:text-white hover:file:bg-[#002244]"
            />
            {file && <span className="text-[11px] text-green-600 block mt-1">✓ เลือกไฟล์: {file.name} ({(file.size / 1024).toFixed(1)} KB)</span>}
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-gray-700">เลขที่ใบงานจริง (Task No.) <span className="text-red-500">*</span></label>
            <input 
              type="text"
              required
              value={taskNo}
              onChange={e => setTaskNo(e.target.value)}
              placeholder="เช่น JOB-69/001"
              className="w-full p-3 bg-gray-50 rounded-2xl text-xs md:text-sm border-none focus:ring-2 focus:ring-blue-400"
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
                className="w-full p-3 bg-gray-50 rounded-2xl text-xs border-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-700">วันจบงาน <span className="text-red-500">*</span></label>
              <input 
                type="date"
                required
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="w-full p-3 bg-gray-50 rounded-2xl text-xs border-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
          </div>

          <div className="flex gap-2 pt-3">
            <button type="button" onClick={onClose} disabled={uploading} className="flex-1 py-3.5 rounded-xl font-bold text-xs bg-gray-100 text-gray-600 hover:bg-gray-200">ยกเลิก</button>
            <button 
              type="submit" 
              disabled={uploading} 
              className="flex-1 py-3.5 rounded-xl font-bold text-xs bg-[#003366] text-white hover:bg-[#002244] disabled:opacity-50 flex items-center justify-center space-x-1.5"
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
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4 animate-in fade-in duration-200">
      <div className="bg-white p-6 md:p-8 rounded-[2.5rem] shadow-2xl border border-amber-100 w-full max-w-md text-left relative">
        <button onClick={onClose} className="absolute top-6 right-6 p-2 bg-gray-50 rounded-full text-gray-400 hover:bg-gray-100"><X size={18}/></button>
        <div className="flex items-center space-x-3 mb-4">
          <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center shrink-0"><CalendarDays size={22}/></div>
          <div>
            <h3 className="font-bold text-lg text-gray-900">ขอเลื่อนวันเริ่ม / วันจบงาน</h3>
            <p className="text-xs text-gray-400">ใบงาน #{task.taskNo}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="p-3 bg-gray-50 rounded-xl text-xs text-gray-600 space-y-1">
            <p><strong>แผนงานเดิม:</strong> {task.startDate || task.aptDate || '-'} ถึง {task.endDate || task.aptDate || '-'}</p>
            {task.originalEndDate && <p className="text-gray-400 text-[11px]">กำหนดการแรกสุดที่ตั้งไว้: {task.originalEndDate}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-700">วันเริ่มงานใหม่ <span className="text-red-500">*</span></label>
              <input 
                type="date"
                required
                value={newStartDate}
                onChange={e => setNewStartDate(e.target.value)}
                className="w-full p-3 bg-gray-50 rounded-2xl text-xs border-none focus:ring-2 focus:ring-amber-400"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-700">วันจบงานใหม่ <span className="text-red-500">*</span></label>
              <input 
                type="date"
                required
                value={newEndDate}
                onChange={e => setNewEndDate(e.target.value)}
                className="w-full p-3 bg-gray-50 rounded-2xl text-xs border-none focus:ring-2 focus:ring-amber-400"
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
              className="w-full p-3.5 bg-gray-50 rounded-2xl text-xs md:text-sm border-none focus:ring-2 focus:ring-amber-400 resize-none"
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
      <div className="p-6 text-center text-gray-300 border border-dashed border-gray-100 rounded-2xl">
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
        return { icon: Clock, color: 'text-gray-600', bg: 'bg-gray-50', border: 'border-gray-200' };
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
            <div className="flex-1 bg-gray-50/80 p-3.5 rounded-2xl border border-gray-100 text-left">
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
                <span className="text-[10px] text-gray-400 font-medium">{timeStr}</span>
              </div>
              {ev.fileName && <p className="text-[11px] text-gray-600 flex items-center gap-1 mt-0.5"><Paperclip size={11}/> ไฟล์: {ev.fileName}</p>}
              {ev.reason && <p className="text-[11px] text-red-600 font-medium mt-1">สาเหตุ: {ev.reason}</p>}
              {ev.note && <p className="text-[11px] text-gray-500 mt-0.5">{ev.note}</p>}
              {ev.toStart && <p className="text-[11px] text-orange-600 font-medium mt-0.5">แผนงานใหม่: {ev.toStart} ถึง {ev.toEnd}</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// -------------------------------------------------------------
// Component: หน้ารายละเอียดสไตล์ 80's สำหรับผู้ใช้งานทั่วไป / ร้านค้า
// -------------------------------------------------------------
function Retro80sTaskDetailView({ 
  task, 
  onClose, 
  onUploadQuote, 
  onRequestDownload, 
  onPreviewPdf,
  onOpenReschedule,
  onRequestDisbursement,
  onSwitchToClassic,
  isUnlocked 
}) {
  const [activeSubTab, setActiveSubTab] = useState('info'); // 'info' | 'timeline'
  const [isUploadingQuote, setIsUploadingQuote] = useState(false);
  const isOverdueTask = isScheduleOverdue(task);

  const formatThaiDate = (dateStr) => {
    if (!dateStr) return '-';
    try {
      return new Intl.DateTimeFormat('th-TH', { dateStyle: 'long' }).format(new Date(dateStr));
    } catch {
      return dateStr;
    }
  };

  return (
    <div 
      className="p-6 md:p-8 rounded-t-[2.5rem] md:rounded-[2.5rem] border-2 border-stone-300 shadow-[0_25px_60px_rgba(0,0,0,0.18)] space-y-6 w-full max-w-3xl mx-auto text-left max-h-[90vh] overflow-y-auto custom-scrollbar relative font-sans text-stone-900 bg-[#FAF8F5]"
      style={{
        backgroundImage: 'radial-gradient(rgba(120, 113, 108, 0.15) 1px, transparent 1px)',
        backgroundSize: '20px 20px',
        backgroundPosition: '0 0'
      }}
    >
      {/* 80's Classic Retro Color Stripe Accent */}
      <div className="absolute top-0 left-0 right-0 h-2.5 flex rounded-t-[2.5rem] overflow-hidden">
        <div className="flex-1 bg-[#DC2626]" />
        <div className="flex-1 bg-[#EA580C]" />
        <div className="flex-1 bg-[#F59E0B]" />
        <div className="flex-1 bg-[#059669]" />
        <div className="flex-1 bg-[#2563EB]" />
      </div>

      {/* Top Bar with 80's Vintage System Branding & Mode Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b-2 border-stone-200 pb-4 pt-1">
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-lg bg-stone-200 border-t border-white border-b-2 border-stone-400 flex items-center justify-center text-stone-700 shadow-xs">
            <Radio size={16} />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-[11px] font-mono tracking-wider text-stone-700 font-bold uppercase">
                📻 V-TRACK CLASSIC 80 // WORK ORDER
              </span>
              <span className="text-[9px] font-mono px-2 py-0.5 rounded-[3px] bg-emerald-100 text-emerald-800 border-t border-emerald-200 border-b border-emerald-400 font-bold flex items-center gap-1 shadow-2xs">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" /> READY
              </span>
            </div>
          </div>
        </div>

        {/* View Switcher & Sub-tabs */}
        <div className="flex items-center space-x-2 self-end sm:self-center">
          <div className="flex bg-stone-200/90 border border-stone-300 p-1 rounded-xl shadow-inner">
            <button 
              onClick={() => setActiveSubTab('info')}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all ${activeSubTab === 'info' ? 'bg-white text-stone-900 shadow-xs border-t border-white border-b border-stone-300' : 'text-stone-600 hover:text-stone-900'}`}
            >
              🕹️ ข้อมูลงาน
            </button>
            <button 
              onClick={() => setActiveSubTab('timeline')}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all ${activeSubTab === 'timeline' ? 'bg-white text-stone-900 shadow-xs border-t border-white border-b border-stone-300' : 'text-stone-600 hover:text-stone-900'}`}
            >
              ⏱️ ไทม์ไลน์ ({task.timeline?.length || 0})
            </button>
          </div>

          {onSwitchToClassic && (
            <button 
              onClick={onSwitchToClassic}
              title="สลับไปมุมมองมาตรฐาน"
              className="text-[11px] font-mono text-stone-600 hover:text-stone-900 px-3 py-1.5 rounded-xl border border-stone-300 hover:border-stone-400 bg-white shadow-2xs flex items-center space-x-1 transition-all"
            >
              <span>🏢 Classic View</span>
            </button>
          )}
        </div>
      </div>

      {/* Task Identity Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h3 className="font-black text-2xl md:text-3xl text-stone-900 font-mono tracking-tight">
              {task.taskNo}
            </h3>
            <StatusTag label={task.status} />
          </div>
          <p className="text-xs font-mono text-stone-600 mt-1 uppercase tracking-wider">
            PROJECT: <span className="text-stone-900 font-bold">{task.project}</span> • VENDOR: <span className="text-stone-900 font-bold">{task.company}</span>
          </p>
        </div>
      </div>

      {/* Overdue Alert in 80's Vintage Warning Styling */}
      {isOverdueTask && (
        <div className="p-4 bg-red-50 border-2 border-red-400 shadow-xs rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-red-900 animate-in fade-in">
          <div className="flex items-center space-x-2.5">
            <AlertTriangle className="text-red-600 shrink-0" size={22} />
            <div className="text-xs font-mono">
              <span className="font-black text-red-700 block uppercase tracking-wider">⚠️ แจ้งเตือนงานเลยกำหนด (OVERDUE)</span>
              <span className="text-red-800">แผนงานระบุจบงานภายใน {task.endDate} แต่ยังไม่ได้ปรับสถานะเป็นจบงาน</span>
            </div>
          </div>
          {onOpenReschedule && (
            <button 
              onClick={() => onOpenReschedule(task)}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-mono font-bold shrink-0 flex items-center space-x-1.5 shadow-xs uppercase tracking-wider active:scale-95 transition-all border-t border-red-400 border-b-2 border-red-800"
            >
              <CalendarDays size={14}/>
              <span>ขอเลื่อนวันเริ่ม/วันจบ</span>
            </button>
          )}
        </div>
      )}

      {/* Tab 1: Info (80's Classic Style) */}
      {activeSubTab === 'info' && (
        <div className="space-y-6">
          {/* ⭐ HERO CARDS: HIGHLIGHTING PAYMENT DATE & APPOINTMENT DATE ⭐ */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* 1. HERO CARD: วันที่ทำจ่าย (วันที่จะได้รับเงิน) */}
            <div className="relative p-5 rounded-2xl border-2 border-amber-300 bg-[#FFFDF7] shadow-xs text-left flex flex-col justify-between overflow-hidden">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2 text-amber-900 font-bold text-xs uppercase tracking-wider">
                    <DollarSign size={18} className="text-amber-700" />
                    <span>วันที่ทำจ่าย (วันที่จะได้รับเงิน)</span>
                  </div>
                  <span className="text-[9px] font-mono font-bold tracking-wider px-2 py-0.5 rounded-[3px] bg-amber-800 text-white shadow-2xs border-t border-amber-600 border-b border-amber-950">
                    PAYMENT DATE
                  </span>
                </div>

                {task.payDate ? (
                  <div className="mt-2">
                    <div className="text-2xl sm:text-3xl font-black text-emerald-800 font-mono tracking-tight">
                      {task.payDate}
                    </div>
                    <p className="text-xs text-emerald-700 font-semibold mt-1">
                      {formatThaiDate(task.payDate)}
                    </p>
                    <div className="text-[11px] text-emerald-800 font-mono mt-1.5 flex items-center space-x-1.5">
                      <CheckCircle2 size={13} className="text-emerald-600"/>
                      <span>ยืนยันวันทำจ่ายแล้ว (ได้รับเงินตามกำหนดนี้)</span>
                    </div>
                  </div>
                ) : (
                  <div className="mt-2">
                    <div className="text-lg sm:text-xl font-bold text-stone-700 font-mono tracking-wider">
                      ⏳ อยู่ระหว่างรอบเบิกจ่าย
                    </div>
                    <div className="text-[11px] text-stone-500 font-mono mt-1">
                      ยังไม่ได้ระบุวันทำจ่าย (รอฝ่ายการเงินแจ้งกำหนดการ)
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-4 pt-3 border-t border-amber-200/80 flex justify-between items-center text-xs">
                <span className="text-stone-500 uppercase font-mono tracking-widest text-[10px]">ยอดเงินค่าใช้จ่าย</span>
                <span className="text-lg font-black text-amber-900 font-mono">
                  ฿ {task.cost ? (isNaN(task.cost) ? task.cost : Number(task.cost).toLocaleString()) : '0'}
                </span>
              </div>
            </div>

            {/* 2. HERO CARD: วันที่นัดหมาย (กำหนดเข้าทำงาน) */}
            <div className="relative p-5 rounded-2xl border-2 border-sky-300 bg-[#F8FAFC] shadow-xs text-left flex flex-col justify-between overflow-hidden">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2 text-sky-900 font-bold text-xs uppercase tracking-wider">
                    <CalendarDays size={18} className="text-sky-700" />
                    <span>วันที่นัดหมาย (กำหนดเข้าทำงาน)</span>
                  </div>
                  <span className="text-[9px] font-mono font-bold tracking-wider px-2 py-0.5 rounded-[3px] bg-sky-800 text-white shadow-2xs border-t border-sky-600 border-b border-sky-950">
                    APPOINTMENT
                  </span>
                </div>

                {task.startDate && task.endDate ? (
                  <div className="mt-2">
                    <div className="text-xl sm:text-2xl font-black text-slate-900 font-mono tracking-tight">
                      {task.startDate} ถึง {task.endDate}
                    </div>
                    <p className="text-xs text-slate-600 font-semibold mt-1">
                      {formatThaiDate(task.startDate)} - {formatThaiDate(task.endDate)}
                    </p>
                    <div className="text-[11px] text-slate-700 font-mono mt-1.5 flex items-center space-x-1.5">
                      <Clock size={13} className="text-sky-700"/>
                      <span>ปฏิบัติงานต่อเนื่อง {Math.max(1, Math.round((new Date(task.endDate) - new Date(task.startDate)) / (1000 * 60 * 60 * 24)) + 1)} วัน</span>
                    </div>
                  </div>
                ) : (
                  <div className="mt-2">
                    <div className="text-2xl sm:text-3xl font-black text-slate-900 font-mono tracking-tight">
                      {task.aptDate || 'ยังไม่กำหนดวัน'}
                    </div>
                    {task.aptDate && (
                      <p className="text-xs text-slate-600 font-semibold mt-1">
                        {formatThaiDate(task.aptDate)}
                      </p>
                    )}
                    <div className="text-[11px] text-slate-500 font-mono mt-1.5">
                      {task.aptDate ? 'วันที่นัดหมายเข้าปฏิบัติงาน' : 'ยังไม่มีการระบุวันนัดหมายในระบบ'}
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-4 pt-3 border-t border-sky-200/80 flex justify-between items-center text-xs">
                <span className="text-stone-500 uppercase font-mono tracking-widest text-[10px]">พื้นที่หน้างาน</span>
                <span className="text-xs font-bold text-sky-900 font-mono truncate pl-2">
                  📍 {task.area || '-'}
                </span>
              </div>
            </div>

          </div>

          {/* Quick Action Button for Vendor / Contractor */}
          <div className="p-4 bg-white rounded-2xl border-2 border-stone-200 shadow-2xs flex flex-wrap items-center gap-3">
            <label className={`px-5 py-3 bg-[#1D4ED8] hover:bg-[#1E40AF] text-white rounded-xl text-xs font-mono font-bold cursor-pointer flex items-center space-x-2 shadow-xs uppercase tracking-wider transition-all active:scale-95 border-t border-blue-400 border-b-2 border-blue-900 ${isUploadingQuote ? 'opacity-70 pointer-events-none' : ''}`}>
              {isUploadingQuote ? <Loader2 size={15} className="animate-spin" /> : <Paperclip size={15}/>}
              <span>{isUploadingQuote ? 'กำลังอัปโหลด...' : ((task.quoteFileUrl || task.quoteFileId) ? '📎 แนบใบเสนอราคาใหม่ (PDF)' : '📎 แนบใบเสนอราคา (PDF)')}</span>
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

            {isUnlocked && onRequestDisbursement && (
              <button 
                onClick={() => onRequestDisbursement(task)}
                className="px-4 py-3 bg-[#047857] hover:bg-[#065F46] text-white rounded-xl text-xs font-mono font-bold flex items-center space-x-1.5 shadow-xs transition-all border-t border-emerald-400 border-b-2 border-emerald-900"
              >
                <DollarSign size={14}/>
                <span>{task.status === 'ส่งเอกสารเบิกจ่ายแล้ว' ? 'แก้ไขวันทำจ่าย' : 'ส่งเอกสารเบิกจ่าย (ระบุวัน)'}</span>
              </button>
            )}

            <div className="text-[11px] text-stone-500 font-mono ml-auto">
              💡 ผู้รับเหมา/ร้านค้า สามารถแนบใบเสนอราคาได้โดยตรง
            </div>
          </div>

          {/* Work Details in 80's Typewriter Memo Box */}
          <div className="bg-white border-2 border-stone-200 rounded-2xl p-4 text-left shadow-2xs">
            <div className="flex items-center justify-between border-b border-stone-200 pb-2 mb-3 text-[10px] font-mono text-stone-600">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-stone-500" />
                MEMORANDUM // WORK_ORDER_DETAILS
              </span>
              <span>TYPEWRITER // TEXT</span>
            </div>
            <p className="text-xs text-stone-800 font-mono leading-relaxed whitespace-pre-wrap">
              {task.details || 'ไม่มีรายละเอียดเพิ่มเติม'}
            </p>
          </div>

          {/* Attached Documents in 80's Index Cards */}
          <div className="space-y-3 pt-2">
            <h4 className="text-xs font-mono font-bold text-stone-700 uppercase tracking-wider flex items-center gap-1.5">
              <Paperclip size={14}/> เอกสารแนบในระบบ (เปิดดูและดาวน์โหลดได้)
            </h4>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* 1. ใบเสนอราคา */}
              <div className="p-4 bg-white rounded-2xl border-2 border-amber-200 flex flex-col justify-between shadow-2xs">
                <div>
                  <span className="text-[10px] font-mono font-bold text-amber-800 uppercase tracking-widest block mb-1">1. ใบเสนอราคา</span>
                  {(task.quoteFileUrl || task.quoteFileId) ? (
                    <div>
                      <p className="text-xs font-mono font-bold text-stone-800 truncate" title={task.quoteFileName}>{task.quoteFileName || 'ใบเสนอราคา.pdf'}</p>
                      <span className="text-[10px] text-emerald-700 font-mono font-bold">✓ แนบไฟล์แล้ว</span>
                    </div>
                  ) : (
                    <span className="text-xs text-stone-400 font-mono italic">ยังไม่มีไฟล์แนบ</span>
                  )}
                </div>
                {(task.quoteFileUrl || task.quoteFileId) && (
                  <div className="mt-3 flex items-center gap-1.5">
                    <button 
                      onClick={() => onPreviewPdf && onPreviewPdf(task.quoteFileUrl || task.quoteFileId, `ใบเสนอราคา: ${task.quoteFileName || 'quotation.pdf'}`, task.quoteFileName)}
                      className="flex-1 py-2 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded-xl text-xs font-mono font-bold text-amber-900 flex items-center justify-center space-x-1.5 transition-colors shadow-2xs active:scale-95"
                    >
                      <Eye size={13}/>
                      <span>เปิดดูเอกสาร</span>
                    </button>
                    <button 
                      onClick={() => onRequestDownload(task.quoteFileUrl || task.quoteFileId, task.quoteFileName)}
                      className="p-2 bg-stone-100 hover:bg-stone-200 border border-stone-300 rounded-xl text-stone-700 transition-colors shadow-2xs"
                      title="ดาวน์โหลดเก็บไว้ในเครื่อง"
                    >
                      <Download size={13}/>
                    </button>
                  </div>
                )}
              </div>

              {/* 2. ใบเสนอราคาที่เซ็นต์อนุมัติ */}
              <div className="p-4 bg-white rounded-2xl border-2 border-indigo-200 flex flex-col justify-between shadow-2xs">
                <div>
                  <span className="text-[10px] font-mono font-bold text-indigo-800 uppercase tracking-widest block mb-1">2. ลายเซ็นต์อนุมัติ</span>
                  {(task.signedFileUrl || task.signedFileId) ? (
                    <div>
                      <p className="text-xs font-mono font-bold text-stone-800 truncate" title={task.signedFileName}>{task.signedFileName || 'signed_quote.pdf'}</p>
                      <span className="text-[10px] text-indigo-700 font-mono font-bold">✓ ประทับตราแล้ว</span>
                    </div>
                  ) : (
                    <span className="text-xs text-stone-400 font-mono italic">ยังไม่ได้รับการเซ็นต์</span>
                  )}
                </div>
                {(task.signedFileUrl || task.signedFileId) && (
                  <div className="mt-3 flex items-center gap-1.5">
                    <button 
                      onClick={() => onPreviewPdf && onPreviewPdf(task.signedFileUrl || task.signedFileId, `ฉบับเซ็นต์อนุมัติ: ${task.signedFileName || 'signed_quote.pdf'}`, task.signedFileName)}
                      className="flex-1 py-2 bg-indigo-50 hover:bg-indigo-100 border border-indigo-300 rounded-xl text-xs font-mono font-bold text-indigo-900 flex items-center justify-center space-x-1.5 transition-colors shadow-2xs active:scale-95"
                    >
                      <Eye size={13}/>
                      <span>ดูฉบับมีลายเซ็น</span>
                    </button>
                    <button 
                      onClick={() => onRequestDownload(task.signedFileUrl || task.signedFileId, task.signedFileName)}
                      className="p-2 bg-stone-100 hover:bg-stone-200 border border-stone-300 rounded-xl text-stone-700 transition-colors shadow-2xs"
                      title="ดาวน์โหลดเก็บไว้ในเครื่อง"
                    >
                      <Download size={13}/>
                    </button>
                  </div>
                )}
              </div>

              {/* 3. ใบงานแจ้งซ่อม */}
              <div className="p-4 bg-white rounded-2xl border-2 border-sky-200 flex flex-col justify-between shadow-2xs">
                <div>
                  <span className="text-[10px] font-mono font-bold text-sky-800 uppercase tracking-widest block mb-1">3. ใบงานแจ้งซ่อม</span>
                  {(task.taskFileUrl || task.taskFileId) ? (
                    <div>
                      <p className="text-xs font-mono font-bold text-stone-800 truncate" title={task.taskFileName}>{task.taskFileName || 'task_order.pdf'}</p>
                      <span className="text-[10px] text-sky-700 font-mono font-bold">✓ แนบใบงานแล้ว</span>
                    </div>
                  ) : (
                    <span className="text-xs text-stone-400 font-mono italic">ยังไม่มีใบงาน</span>
                  )}
                </div>
                {(task.taskFileUrl || task.taskFileId) && (
                  <div className="mt-3 flex items-center gap-1.5">
                    <button 
                      onClick={() => onPreviewPdf && onPreviewPdf(task.taskFileUrl || task.taskFileId, `ใบงานแจ้งซ่อม: ${task.taskFileName || 'task_order.pdf'}`, task.taskFileName)}
                      className="flex-1 py-2 bg-sky-50 hover:bg-sky-100 border border-sky-300 rounded-xl text-xs font-mono font-bold text-sky-900 flex items-center justify-center space-x-1.5 transition-colors shadow-2xs active:scale-95"
                    >
                      <Eye size={13}/>
                      <span>เปิดดูใบงาน</span>
                    </button>
                    <button 
                      onClick={() => onRequestDownload(task.taskFileUrl || task.taskFileId, task.taskFileName)}
                      className="p-2 bg-stone-100 hover:bg-stone-200 border border-stone-300 rounded-xl text-stone-700 transition-colors shadow-2xs"
                      title="ดาวน์โหลดเก็บไว้ในเครื่อง"
                    >
                      <Download size={13}/>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Activity Timeline */}
      {activeSubTab === 'timeline' && (
        <div className="pt-2">
          <div className="p-4 bg-white border-2 border-stone-200 rounded-2xl shadow-2xs">
            <TimelineView timeline={task.timeline} />
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="flex justify-between items-center pt-4 border-t-2 border-stone-200">
        <span className="text-[10px] font-mono text-stone-500 uppercase">
          V-TRACK OPERATION SYSTEM // 1980s EDITION
        </span>
        <button 
          onClick={onClose} 
          className="px-8 py-3 rounded-xl text-stone-800 font-mono font-bold bg-stone-200 hover:bg-stone-300 border-t border-white border-b-2 border-stone-400 text-xs uppercase tracking-wider transition-all shadow-xs active:scale-95"
        >
          [ ปิดหน้าต่าง (CLOSE) ]
        </button>
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// Component สำหรับเปิดดูรายละเอียด & ปฏิบัติการใบงาน (Task Operations)
// -------------------------------------------------------------
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
  const [viewMode, setViewMode] = useState(!isUnlocked ? '80s' : 'classic');
  const [activeSubTab, setActiveSubTab] = useState('info'); // 'info' | 'timeline'
  const [isUploadingQuote, setIsUploadingQuote] = useState(false);
  const isOverdueTask = isScheduleOverdue(task);

  if (viewMode === '80s') {
    return (
      <Retro80sTaskDetailView 
        task={task} 
        onClose={onClose} 
        onUploadQuote={onUploadQuote} 
        onRequestDownload={onRequestDownload} 
        onPreviewPdf={onPreviewPdf}
        onOpenReschedule={onOpenReschedule}
        onRequestDisbursement={onRequestDisbursement}
        onSwitchToClassic={() => setViewMode('classic')}
        isUnlocked={isUnlocked}
      />
    );
  }

  return (
    <div className="bg-white p-6 md:p-10 rounded-t-[2.5rem] md:rounded-[2.5rem] shadow-sm border border-gray-100 space-y-6 w-full max-w-3xl mx-auto text-left max-h-[90vh] overflow-y-auto custom-scrollbar">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 pb-4">
        <div className="flex items-center space-x-4">
          <div className="w-12 h-12 bg-[#003366] text-white rounded-2xl flex items-center justify-center shrink-0 shadow-lg shadow-[#003366]/20">
            <FileText size={24}/>
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="font-bold text-xl md:text-2xl text-[#003366]">{task.taskNo}</h3>
              <StatusTag label={task.status} />
            </div>
            <p className="text-xs text-gray-400 mt-0.5">{task.project} • {task.company}</p>
          </div>
        </div>
        <div className="flex items-center space-x-2 self-end sm:self-center">
          <button 
            onClick={() => setViewMode('80s')}
            className="px-3 py-1.5 rounded-lg text-xs font-mono font-bold bg-stone-100 text-stone-800 hover:bg-stone-200 border border-stone-300 transition-all flex items-center space-x-1 shadow-2xs"
          >
            <span>📻 มุมมอง 80's คลาสสิก</span>
          </button>
          <div className="flex bg-gray-100 p-1 rounded-xl">
            <button 
              onClick={() => setActiveSubTab('info')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${activeSubTab === 'info' ? 'bg-white text-[#003366] shadow-sm' : 'text-gray-400'}`}
            >
              ข้อมูล & เอกสาร
            </button>
            <button 
              onClick={() => setActiveSubTab('timeline')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${activeSubTab === 'timeline' ? 'bg-white text-[#003366] shadow-sm' : 'text-gray-400'}`}
            >
              ไทม์ไลน์ ({task.timeline?.length || 0})
            </button>
          </div>
        </div>
      </div>

      {/* Overdue Warning Banner */}
      {isOverdueTask && (
        <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-amber-900 animate-in fade-in">
          <div className="flex items-center space-x-2.5">
            <AlertTriangle className="text-amber-600 shrink-0" size={20} />
            <div className="text-xs">
              <span className="font-bold block">แจ้งเตือน: เกินกำหนดวันจบงานแล้ว!</span>
              <span className="text-amber-700/80">แผนงานระบุจบงานภายใน {task.endDate} แต่ยังไม่ได้ปรับสถานะเป็นจบงาน</span>
            </div>
          </div>
          <button 
            onClick={() => onOpenReschedule(task)}
            className="px-4 py-2 bg-amber-600 text-white rounded-xl text-xs font-bold hover:bg-amber-700 shrink-0 flex items-center space-x-1.5 shadow-sm"
          >
            <CalendarDays size={14}/>
            <span>ขอเลื่อนวันเริ่ม/วันจบ</span>
          </button>
        </div>
      )}

      {/* Tab 1: Info & Documents */}
      {activeSubTab === 'info' && (
        <div className="space-y-6">
          {/* Quick Action Buttons Bar */}
          <div className="flex flex-wrap gap-2.5 p-4 bg-gray-50/70 rounded-2xl border border-gray-100">
            {/* 1. แนบใบเสนอราคา (สามารถอัปโหลดได้ตลอด) */}
            <label className={`px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold cursor-pointer flex items-center space-x-1.5 shadow-sm transition-all active:scale-95 ${isUploadingQuote ? 'opacity-70 pointer-events-none' : ''}`}>
              {isUploadingQuote ? <Loader2 size={14} className="animate-spin" /> : <Paperclip size={14}/>}
              <span>{isUploadingQuote ? 'กำลังอัปโหลด...' : ((task.quoteFileUrl || task.quoteFileId) ? 'แนบใบเสนอราคาใหม่' : 'แนบใบเสนอราคา (PDF)')}</span>
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

            {/* 2. เซ็นต์อนุมัติใบเสนอราคา (แสดงเมื่อมีไฟล์ใบเสนอราคา และยังไม่ถึงขั้นเปิดงาน) */}
            {(task.quoteFileUrl || task.quoteFileId) && (
              <button 
                onClick={() => onOpenSign(task)}
                className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center space-x-1.5 shadow-sm transition-all active:scale-95"
              >
                <PenTool size={14}/>
                <span>{(task.signedFileUrl || task.signedFileId) ? 'เซ็นต์อนุมัติใหม่อีกครั้ง' : 'ตรวจรับและเซ็นต์อนุมัติ'}</span>
              </button>
            )}

            {/* 3. แนบใบงานแจ้งซ่อม & เปิดงาน */}
            <button 
              onClick={() => onOpenTaskOrder(task)}
              className="px-4 py-2.5 bg-[#003366] hover:bg-[#002244] text-white rounded-xl text-xs font-bold flex items-center space-x-1.5 shadow-sm transition-all active:scale-95"
            >
              <FileText size={14}/>
              <span>{(task.taskFileUrl || task.taskFileId) ? 'แนบใบงานแจ้งซ่อมใหม่' : 'แนบใบงานแจ้งซ่อม & เปิดงาน'}</span>
            </button>

            {/* 4. ขอเลื่อนวัน */}
            {(task.startDate || task.endDate || task.aptDate) && (
              <button 
                onClick={() => onOpenReschedule(task)}
                className="px-4 py-2.5 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-xl text-xs font-bold flex items-center space-x-1.5 transition-all"
              >
                <CalendarDays size={14}/>
                <span>ขอเลื่อนกำหนดงาน</span>
              </button>
            )}

            {/* 5. ส่งเอกสารเบิกจ่าย & ระบุวันทำจ่าย */}
            {onRequestDisbursement && (
              <button 
                onClick={() => onRequestDisbursement(task)}
                className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center space-x-1.5 shadow-sm transition-all active:scale-95"
              >
                <DollarSign size={14}/>
                <span>{task.status === 'ส่งเอกสารเบิกจ่ายแล้ว' ? 'แก้ไขวันทำจ่าย' : 'ส่งเอกสารเบิกจ่าย (ระบุวัน)'}</span>
              </button>
            )}

            {/* 6. ยกเลิกใบงาน */}
            {task.status !== 'ยกเลิก' && (
              <button 
                onClick={() => onRequestCancel(task)}
                className="px-4 py-2.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl text-xs font-bold flex items-center space-x-1.5 transition-all ml-auto"
              >
                <Trash2 size={14}/>
                <span>ยกเลิกใบงาน</span>
              </button>
            )}
          </div>

          {/* Details Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <DetailField label="เลขที่ใบงาน" value={task.taskNo} />
            <DetailField label="สถานะการดำเนินงาน">
              <div className="mt-1"><StatusTag label={task.status} /></div>
            </DetailField>
            <DetailField label="โครงการ" value={task.project} />
            <DetailField label="บริษัท/ร้านค้า" value={task.company} />
            <DetailField label="พื้นที่" value={task.area} />
            
            {/* Highlighted Appointment Date */}
            <div className="p-3.5 bg-blue-50/80 rounded-2xl border border-blue-200 text-left">
              <label className="block text-[10px] font-bold text-blue-700 uppercase tracking-widest ml-1 mb-1">
                📅 กำหนดการทำงานตามแผน / วันนัดหมาย
              </label>
              <div className="text-sm font-black text-blue-900">
                {task.startDate && task.endDate ? `${task.startDate} ถึง ${task.endDate}` : (task.aptDate || 'ยังไม่กำหนดวัน')}
              </div>
            </div>

            {/* Highlighted Payment Date */}
            <div className="p-3.5 bg-emerald-50/80 rounded-2xl border border-emerald-200 text-left">
              <label className="block text-[10px] font-bold text-emerald-700 uppercase tracking-widest ml-1 mb-1">
                💰 วันทำจ่าย (วันที่จะได้รับเงิน)
              </label>
              <div className="text-sm font-black text-emerald-800">
                {task.payDate ? `✓ ${task.payDate}` : 'ยังไม่ระบุวันทำจ่าย (รอรอบเบิกจ่าย)'}
              </div>
            </div>

            <DetailField label="ค่าใช้จ่าย (บาท)" value={task.cost ? (isNaN(task.cost) ? task.cost : Number(task.cost).toLocaleString()) : '-'} />
            <div className="md:col-span-2">
              <DetailField label="รายละเอียดงาน" value={task.details} />
            </div>
            {task.cancelReason && (
              <div className="md:col-span-2 p-4 bg-red-50 rounded-2xl border border-red-100 text-red-700 text-xs">
                <strong>สาเหตุการยกเลิก:</strong> {task.cancelReason}
              </div>
            )}
          </div>

          {/* Attached Files Section */}
          <div className="space-y-3 pt-4 border-t border-gray-100">
            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
              <Paperclip size={14}/> เอกสารแนบในระบบ (เปิดดูและดาวน์โหลดได้)
            </h4>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* 1. ใบเสนอราคา */}
              <div className="p-4 bg-gray-50/80 rounded-2xl border border-gray-100 flex flex-col justify-between">
                <div>
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1">1. ใบเสนอราคา</span>
                  {(task.quoteFileUrl || task.quoteFileId) ? (
                    <div>
                      <p className="text-xs font-bold text-gray-800 truncate" title={task.quoteFileName}>{task.quoteFileName || 'ใบเสนอราคา.pdf'}</p>
                      <span className="text-[10px] text-green-600 font-medium">✓ แนบไฟล์แล้ว</span>
                    </div>
                  ) : (
                    <span className="text-xs text-gray-400 italic">ยังไม่มีไฟล์แนบ</span>
                  )}
                </div>
                {(task.quoteFileUrl || task.quoteFileId) && (
                  <div className="mt-3 flex items-center gap-1.5">
                    <button 
                      onClick={() => onPreviewPdf && onPreviewPdf(task.quoteFileUrl || task.quoteFileId, `ใบเสนอราคา: ${task.quoteFileName || 'quotation.pdf'}`, task.quoteFileName)}
                      className="flex-1 py-2 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-xl text-xs font-bold text-amber-800 flex items-center justify-center space-x-1.5 shadow-2xs transition-colors active:scale-95"
                    >
                      <Eye size={13}/>
                      <span>เปิดดูเอกสาร</span>
                    </button>
                    <button 
                      onClick={() => onRequestDownload(task.quoteFileUrl || task.quoteFileId, task.quoteFileName)}
                      className="p-2 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl text-gray-600 transition-colors shadow-2xs"
                      title="ดาวน์โหลดเก็บไว้ในเครื่อง"
                    >
                      <Download size={13}/>
                    </button>
                  </div>
                )}
              </div>

              {/* 2. ใบเสนอราคาที่เซ็นต์อนุมัติ */}
              <div className="p-4 bg-gray-50/80 rounded-2xl border border-gray-100 flex flex-col justify-between">
                <div>
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1">2. ลายเซ็นต์อนุมัติ</span>
                  {(task.signedFileUrl || task.signedFileId) ? (
                    <div>
                      <p className="text-xs font-bold text-indigo-700 truncate" title={task.signedFileName}>{task.signedFileName || 'signed_quote.pdf'}</p>
                      <span className="text-[10px] text-indigo-600 font-medium">✓ ประทับตราแล้ว</span>
                    </div>
                  ) : (
                    <span className="text-xs text-gray-400 italic">ยังไม่ได้รับการเซ็นต์</span>
                  )}
                </div>
                {(task.signedFileUrl || task.signedFileId) && (
                  <div className="mt-3 flex items-center gap-1.5">
                    <button 
                      onClick={() => onPreviewPdf && onPreviewPdf(task.signedFileUrl || task.signedFileId, `ฉบับเซ็นต์อนุมัติ: ${task.signedFileName || 'signed_quote.pdf'}`, task.signedFileName)}
                      className="flex-1 py-2 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-xl text-xs font-bold text-indigo-700 flex items-center justify-center space-x-1.5 shadow-2xs transition-colors active:scale-95"
                    >
                      <Eye size={13}/>
                      <span>ดูฉบับมีลายเซ็น</span>
                    </button>
                    <button 
                      onClick={() => onRequestDownload(task.signedFileUrl || task.signedFileId, task.signedFileName)}
                      className="p-2 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl text-gray-600 transition-colors shadow-2xs"
                      title="ดาวน์โหลดเก็บไว้ในเครื่อง"
                    >
                      <Download size={13}/>
                    </button>
                  </div>
                )}
              </div>

              {/* 3. ใบงานแจ้งซ่อม */}
              <div className="p-4 bg-gray-50/80 rounded-2xl border border-gray-100 flex flex-col justify-between">
                <div>
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1">3. ใบงานแจ้งซ่อม</span>
                  {(task.taskFileUrl || task.taskFileId) ? (
                    <div>
                      <p className="text-xs font-bold text-blue-700 truncate" title={task.taskFileName}>{task.taskFileName || 'task_order.pdf'}</p>
                      <span className="text-[10px] text-blue-600 font-medium">✓ แนบใบงานแล้ว</span>
                    </div>
                  ) : (
                    <span className="text-xs text-gray-400 italic">ยังไม่มีใบงาน</span>
                  )}
                </div>
                {(task.taskFileUrl || task.taskFileId) && (
                  <div className="mt-3 flex items-center gap-1.5">
                    <button 
                      onClick={() => onPreviewPdf && onPreviewPdf(task.taskFileUrl || task.taskFileId, `ใบงานแจ้งซ่อม: ${task.taskFileName || 'task_order.pdf'}`, task.taskFileName)}
                      className="flex-1 py-2 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-xl text-xs font-bold text-blue-700 flex items-center justify-center space-x-1.5 shadow-2xs transition-colors active:scale-95"
                    >
                      <Eye size={13}/>
                      <span>เปิดดูใบงาน</span>
                    </button>
                    <button 
                      onClick={() => onRequestDownload(task.taskFileUrl || task.taskFileId, task.taskFileName)}
                      className="p-2 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl text-gray-600 transition-colors shadow-2xs"
                      title="ดาวน์โหลดเก็บไว้ในเครื่อง"
                    >
                      <Download size={13}/>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Activity Timeline */}
      {activeSubTab === 'timeline' && (
        <div className="pt-2">
          <TimelineView timeline={task.timeline} />
        </div>
      )}
      
      {/* Footer */}
      <div className="flex justify-end pt-4 border-t border-gray-100">
        <button onClick={onClose} className="px-8 py-3 rounded-2xl text-gray-600 font-bold bg-gray-100 hover:bg-gray-200 transition-colors text-xs">
          ปิดหน้าต่าง
        </button>
      </div>
    </div>
  );
}

function DetailField({ label, value, children }) {
  return (
    <div className="space-y-1 text-left">
      <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">{label}</label>
      {children ? children : <div className="p-4 bg-gray-50 rounded-2xl text-sm font-semibold text-gray-700 min-h-[52px] break-words">{value || '-'}</div>}
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
        <div className="border border-gray-300 p-6 rounded-lg break-inside-avoid shadow-sm">
          <h3 className="font-bold text-center mb-4 text-base uppercase tracking-wide bg-gray-100 py-2 rounded">สรุปภาพรวมตามตัวกรอง</h3>
          <div className="text-sm mb-6 text-gray-700 bg-gray-50 p-4 rounded border border-gray-200">
            <p className="mb-2"><strong>ประจำเดือน:</strong> {selectedMonth ? new Intl.DateTimeFormat('th-TH', { month: 'long', year: 'numeric' }).format(new Date(selectedMonth)) : 'ทุกเดือน'}</p>
            <p className="mb-2"><strong>โครงการ:</strong> {filterProj || 'ทั้งหมด'} | <strong>ร้านค้า:</strong> {filterComp || 'ทั้งหมด'}</p>
            <p><strong>สถานะ:</strong> {filterStatus || 'ทุกสถานะ'}</p>
          </div>
          <div className="flex flex-col md:flex-row items-center justify-center gap-10">
            <div className="relative w-40 h-40 rounded-full border border-gray-200 shadow-inner flex-shrink-0" style={pieStyle}>
               <div className="absolute inset-4 bg-white rounded-full flex flex-col items-center justify-center">
                  <span className="font-bold text-3xl">{filteredTasks.length}</span>
               </div>
            </div>
            <div className="text-sm w-full md:w-1/2">
               <p className="font-bold mb-3 border-b pb-2 text-gray-800 text-base">รวม {filteredTasks.length} รายการ</p>
               <table className="w-full text-left">
                 <tbody>
                   {filteredStats.filter(s => s.count > 0).map(s => (
                     <tr key={s.id} className="border-b border-dashed border-gray-200 last:border-0">
                       <td className="py-3 flex items-center gap-2 truncate"><div className="w-4 h-4 rounded-sm border border-gray-200 shadow-sm" style={{backgroundColor: s.color}}></div>{s.name}</td>
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
        <h3 className="font-bold text-lg md:text-xl mb-4 flex items-center text-black border-b border-gray-300 pb-2">
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
                  <td className="border border-gray-400 p-2 text-center font-semibold text-[11px] whitespace-nowrap">{t.status}</td>
                  <td className="border border-gray-400 p-2 text-center text-xs whitespace-nowrap">{t.cost ? (isNaN(t.cost) ? t.cost : Number(t.cost).toLocaleString()) : '-'}</td>
                  <td className="border border-gray-400 p-2 text-gray-700 text-xs">{t.details || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-8 text-center border border-dashed border-gray-400 bg-gray-50">
            <p className="text-gray-600 italic">-- ไม่มีรายการใบงานในตัวกรองนี้ --</p>
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

function Dashboard({ tasks, settings, onViewDetail, onOpenReschedule }) {
  const availableMonths = useMemo(() => {
    const months = tasks.map(t => getEffectiveMonth(t)).filter(m => m !== '');
    return [...new Set([new Date().toISOString().slice(0, 7), ...months])].sort().reverse();
  }, [tasks]);

  const [selectedMonth, setSelectedMonth] = useState(availableMonths[0] || new Date().toISOString().slice(0, 7));
  const [filterProj, setFilterProj] = useState('');
  const [filterComp, setFilterComp] = useState('');

  const filteredTasks = useMemo(() => {
    return tasks.filter(t => {
      const tMonth = getEffectiveMonth(t);
      return !t.isDeleted && tMonth === selectedMonth && (filterProj ? t.project === filterProj : true) && (filterComp ? t.company === filterComp : true);
    });
  }, [tasks, selectedMonth, filterProj, filterComp]);

  const stats = STATUSES.map(s => {
    const count = filteredTasks.filter(t => t.status === s.name).length;
    const percent = filteredTasks.length > 0 ? Math.round((count / filteredTasks.length) * 100) : 0;
    return { ...s, count, percent };
  });

  let cumulativePercent = 0;
  const conicStops = stats.filter(s => s.count > 0).map(s => {
    const start = cumulativePercent;
    const slicePercent = (s.count / filteredTasks.length) * 100;
    cumulativePercent += slicePercent;
    return `${s.color} ${start}% ${cumulativePercent}%`;
  }).join(', ');
  
  const pieStyle = filteredTasks.length > 0 ? { background: `conic-gradient(${conicStops})` } : { background: '#F8F9FA' };

  return (
    <div className="space-y-6 animate-in fade-in duration-700">
      <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
          <div className="col-span-2 md:col-span-1 space-y-1">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1 flex items-center"><CalendarDays size={12} className="mr-1"/> ประจำเดือน</label>
            <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className="w-full p-3 bg-gray-50 rounded-2xl border-none focus:ring-2 focus:ring-[#C5A059] text-sm font-semibold">
              {availableMonths.map(m => <option key={m} value={m}>{new Intl.DateTimeFormat('th-TH', { month: 'long', year: 'numeric' }).format(new Date(m))}</option>)}
            </select>
          </div>
          <div className="space-y-1">
             <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1 flex items-center"><Filter size={12} className="mr-1"/> กรองตามโครงการ</label>
             <select value={filterProj} onChange={e => setFilterProj(e.target.value)} className="w-full p-3 bg-gray-50 rounded-2xl border-none focus:ring-2 focus:ring-[#C5A059] text-sm font-semibold">
               <option value="">ทุกโครงการ</option>
               {settings.projects.map(p => <option key={p} value={p}>{p}</option>)}
             </select>
          </div>
          <div className="space-y-1">
             <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1 flex items-center"><Filter size={12} className="mr-1"/> กรองตามร้านค้า</label>
             <select value={filterComp} onChange={e => setFilterComp(e.target.value)} className="w-full p-3 bg-gray-50 rounded-2xl border-none focus:ring-2 focus:ring-[#C5A059] text-sm font-semibold">
               <option value="">ทุกร้านค้า</option>
               {settings.companies.map(c => <option key={c} value={c}>{c}</option>)}
             </select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white p-8 rounded-[2rem] border border-gray-100 shadow-sm flex flex-col">
          <h4 className="w-full text-sm font-bold text-gray-400 mb-8 uppercase tracking-widest text-center">สัดส่วนสถานะงาน</h4>
          
          <div className="relative w-48 h-48 mb-8 mx-auto rounded-full shadow-md flex items-center justify-center transition-all duration-500" style={pieStyle}>
            <div className="w-32 h-32 bg-white rounded-full flex flex-col items-center justify-center shadow-inner z-10">
              <span className="text-4xl font-bold text-[#003366]">{filteredTasks.length}</span>
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">ใบงานทั้งหมด</span>
            </div>
          </div>

          <div className="w-full space-y-3 mt-2">
             <p className="text-[10px] font-bold text-gray-300 uppercase mb-3 tracking-tighter">ความหมายของสีสถานะ</p>
            {stats.map(s => (
              <div key={s.id} className={`flex items-center justify-between text-[11px] font-medium transition-opacity ${s.count > 0 ? 'text-gray-600' : 'text-gray-300 opacity-50'}`}>
                <div className="flex items-center space-x-3">
                  <div className="w-3.5 h-3.5 rounded-full shadow-sm" style={{backgroundColor: s.color}}></div>
                  <span className="truncate">{s.name}</span>
                </div>
                <div className="flex items-center space-x-2 pl-2">
                  <span className="font-bold text-[#003366] text-sm">{s.count}</span>
                  <span className="text-[10px] bg-gray-50 px-1.5 py-0.5 rounded text-gray-500 w-9 text-right">{s.percent}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-2 bg-white rounded-[2rem] border border-gray-100 shadow-sm overflow-hidden flex flex-col">
          <div className="p-6 md:p-8 border-b border-gray-50 bg-gray-50/30 flex justify-between items-center">
            <div className="flex flex-col">
              <h4 className="text-sm font-bold text-gray-400 uppercase tracking-widest">รายการใบงานประจำเดือน</h4>
              <p className="text-[10px] text-[#C5A059] font-bold mt-0.5">{new Intl.DateTimeFormat('th-TH', { month: 'long', year: 'numeric' }).format(new Date(selectedMonth))}</p>
            </div>
            <span className="text-[10px] bg-white px-4 py-1.5 rounded-full border border-gray-100 text-gray-500 font-bold shadow-sm">{filteredTasks.length} รายการ</span>
          </div>
          <div className="flex-1 overflow-auto max-h-[500px]">
            {filteredTasks.length > 0 ? (
               <div className="flex flex-col gap-4 p-4 bg-gray-50/30 rounded-2xl">
                 {filteredTasks.map(t => {
                   const isSchedOver = isScheduleOverdue(t);
                   return (
                    <div 
                      key={t.id} 
                      onClick={() => onViewDetail(t)}
                      className="group relative p-5 md:p-6 bg-white/80 backdrop-blur-md rounded-2xl border border-gray-100/80 shadow-[0_4px_20px_rgba(0,0,0,0.02)] hover:shadow-[0_8px_30px_rgba(197,160,89,0.15)] hover:border-[#C5A059]/30 hover:-translate-y-1 transition-all duration-300 cursor-pointer overflow-hidden flex flex-col md:flex-row md:items-center justify-between text-left gap-4"
                    >
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-[#C5A059] to-[#003366] opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                      
                      <div className="flex flex-col min-w-0 flex-1 pl-2 md:pl-0">
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <span className="font-bold text-[#003366] text-base md:text-lg tracking-tight bg-clip-text group-hover:text-transparent group-hover:bg-gradient-to-r group-hover:from-[#003366] group-hover:to-[#C5A059] transition-all duration-300">
                            {t.taskNo}
                          </span>
                          {isSchedOver && (
                            <span className="bg-amber-500/10 text-amber-700 border border-amber-500/30 text-[9px] px-2.5 py-1 rounded-full font-bold flex items-center gap-1 shadow-2xs">
                              ⚠️ เลยกำหนดวันจบงาน
                            </span>
                          )}
                          {!isSchedOver && isOverdue(t) && (
                            <span className="bg-red-500/10 text-red-500 border border-red-500/20 text-[9px] px-2.5 py-1 rounded-full font-bold uppercase tracking-wider shadow-[0_0_10px_rgba(239,68,68,0.2)]">
                              เลยกำหนด
                            </span>
                          )}
                          {isCarryOver(t) && (
                            <span className="bg-orange-500/10 text-orange-600 border border-orange-500/20 text-[9px] px-2.5 py-1 rounded-full font-bold tracking-wider shadow-[0_0_10px_rgba(249,115,22,0.15)]">
                              งานค้างจากเดือน {getOriginalMonthStr(t)}
                            </span>
                          )}
                        </div>
                        
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-1 text-gray-500">
                          <div className="flex items-center space-x-1.5 bg-gray-50 px-2 py-1 rounded-lg border border-gray-100">
                            <Briefcase size={12} className="text-[#C5A059]" />
                            <span className="text-[10px] font-bold uppercase tracking-wider truncate max-w-[120px]">{t.company}</span>
                          </div>
                          <div className="flex items-center space-x-1.5 bg-gray-50 px-2 py-1 rounded-lg border border-gray-100">
                            <Building2 size={12} className="text-[#003366]" />
                            <span className="text-[11px] font-medium truncate max-w-[150px]">{t.project}</span>
                          </div>
                          {t.startDate && t.endDate ? (
                            <div className="flex items-center space-x-1 bg-gray-50 px-2 py-1 rounded-lg border border-gray-100 text-[10px] font-semibold text-gray-500">
                              <CalendarDays size={11} className="text-[#C5A059]" />
                              <span>{t.startDate} ถึง {t.endDate}</span>
                            </div>
                          ) : (
                            t.aptDate && (
                              <div className="flex items-center space-x-1 bg-gray-50 px-2 py-1 rounded-lg border border-gray-100 text-[10px] font-semibold text-gray-500">
                                <CalendarDays size={11} className="text-[#C5A059]" />
                                <span>{t.aptDate}</span>
                              </div>
                            )
                          )}
                        </div>

                        {/* File Attachment Badges */}
                        <div className="flex flex-wrap gap-1.5 mt-2.5">
                          {t.quoteFileUrl && (
                            <span className="bg-amber-100/90 text-amber-900 text-[9px] px-2 py-0.5 rounded-[3px] font-bold flex items-center gap-1 border-t border-amber-200 border-b-2 border-amber-400 shadow-2xs">
                              <Paperclip size={9}/> มีใบเสนอราคา
                            </span>
                          )}
                          {t.signedFileUrl && (
                            <span className="bg-indigo-100/90 text-indigo-900 text-[9px] px-2 py-0.5 rounded-[3px] font-bold flex items-center gap-1 border-t border-indigo-200 border-b-2 border-indigo-400 shadow-2xs">
                              <ShieldCheck size={9}/> เซ็นต์อนุมัติแล้ว
                            </span>
                          )}
                          {t.taskFileUrl && (
                            <span className="bg-blue-100/90 text-blue-900 text-[9px] px-2 py-0.5 rounded-[3px] font-bold flex items-center gap-1 border-t border-blue-200 border-b-2 border-blue-400 shadow-2xs">
                              <FileText size={9}/> มีใบงาน
                            </span>
                          )}
                        </div>
                        
                        {t.status === 'จบงานและรอรับเอกสารวางบิล' && (
                          <div className="mt-3 inline-flex items-center space-x-1.5 bg-orange-50 text-orange-600 px-3 py-1.5 rounded-lg border border-orange-100/50 w-max animate-pulse">
                            <AlertCircle size={12} />
                            <span className="text-[10px] font-bold tracking-wide">กรุณาส่งเอกสารวางบิลภายในวันที่ 15</span>
                          </div>
                        )}
                      </div>
                      
                      <div className="flex flex-row md:flex-col items-center md:items-end justify-between mt-2 md:mt-0 shrink-0 pl-2 md:pl-0 border-t md:border-t-0 border-gray-50 pt-3 md:pt-0">
                         <div className="group-hover:scale-105 transition-transform duration-300 shadow-sm">
                           <StatusTag label={t.status} />
                         </div>
                         <div className="flex items-center space-x-1 mt-0 md:mt-2 bg-gray-50/80 px-2.5 py-1 rounded-full border border-gray-100">
                           <MapPin size={10} className="text-gray-400" />
                           <span className="text-[10px] text-gray-500 font-bold tracking-wide">{t.area}</span>
                         </div>
                      </div>
                    </div>
                   );
                 })}
               </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center py-24 text-gray-300">
                <CalendarDays size={48} className="mb-3 opacity-10"/>
                <p className="text-sm font-bold">ไม่พบข้อมูลใบงานในเดือนนี้</p>
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
    <form onSubmit={sub} className={`bg-white p-6 md:p-10 rounded-[2.5rem] shadow-sm border border-gray-100 space-y-6 w-full max-w-3xl mx-auto ${isModal ? '' : 'mb-24'}`}>
      <div className="flex items-center space-x-4 mb-2">
        <div className="w-12 h-12 bg-[#003366] text-white rounded-2xl flex items-center justify-center shrink-0">
          {initialData ? <Edit size={24}/> : <PlusCircle size={24}/>}
        </div>
        <h3 className="font-bold text-xl md:text-2xl text-[#003366] text-left">{initialData ? 'แก้ไขข้อมูลใบงาน' : 'เปิดรายการใหม่ (รอใบเสนอราคา)'}</h3>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2 text-left">
          <Field label="เลขที่ใบงาน / รหัสอ้างอิง">
            <input required className="input-style" value={d.taskNo} onChange={e=>setD({...d, taskNo: e.target.value})} placeholder="ระบุเลขที่ใบงาน..."/>
          </Field>
          {!initialData && (
            <span className="text-[10px] text-amber-600 block pl-1">
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
            <span className="text-[10px] text-emerald-700 font-bold block pl-1">
              💰 สถานะส่งเอกสารเบิกจ่าย: กรุณาระบุวันที่คาดว่าจะได้รับเงิน
            </span>
          )}
        </div>
        <Field label="ค่าใช้จ่าย (บาท)"><input type="text" className="input-style" value={d.cost || ''} onChange={handleCostChange} placeholder="ระบุค่าใช้จ่าย (ถ้ามี)"/></Field>
        
        <div className="md:col-span-2"><Field label="รายละเอียด"><textarea rows="3" className="input-style resize-none" value={d.details} onChange={e=>setD({...d, details: e.target.value})}></textarea></Field></div>
      </div>
      
      <div className="flex flex-col sm:flex-row justify-end gap-3 pt-6">
        {onCancel && <button type="button" onClick={onCancel} className="px-8 py-4 rounded-2xl text-gray-400 font-bold hover:bg-gray-50 order-2 sm:order-1">ยกเลิก</button>}
        <button type="submit" className="bg-[#003366] text-white px-12 py-4 rounded-2xl font-bold order-1 sm:order-2">บันทึกข้อมูล</button>
      </div>
      <style>{`.input-style { @apply w-full p-4 bg-gray-50 rounded-2xl border-none focus:ring-2 focus:ring-[#C5A059] transition-all text-sm font-semibold text-gray-700 placeholder:text-gray-300; }`}</style>
    </form>
  );
}

function Field({ label, children }) {
  return <div className="space-y-2 text-left"><label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">{label}</label>{children}</div>;
}

// -----------------------------------------------------------------

function Management({ tasks, settings, onSave, onDelete, onViewDetail, onRequestCancel, onRequestDisbursement }) {
  const [edit, setEdit] = useState(null);
  const [search, setSearch] = useState('');
  const [filterMonth, setFilterMonth] = useState('');
  const [filterProject, setFilterProject] = useState('');
  const [filterCompany, setFilterCompany] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const availableMonths = useMemo(() => {
    const months = tasks.map(t => getEffectiveMonth(t)).filter(m => m !== '');
    return [...new Set(months)].sort().reverse();
  }, [tasks]);
  
  const filtered = useMemo(() => {
    return tasks.filter(t => {
      if (t.isDeleted) return false;
      const matchSearch = search === '' || t.taskNo.toLowerCase().includes(search.toLowerCase()) || t.project.toLowerCase().includes(search.toLowerCase());
      const tMonth = getEffectiveMonth(t);
      const matchMonth = filterMonth === '' || tMonth === filterMonth;
      const matchProj = filterProject === '' || t.project === filterProject;
      const matchComp = filterCompany === '' || t.company === filterCompany;
      const matchStat = filterStatus === '' || t.status === filterStatus;
      return matchSearch && matchMonth && matchProj && matchComp && matchStat;
    });
  }, [tasks, search, filterMonth, filterProject, filterCompany, filterStatus]);

  useEffect(() => { setCurrentPage(1); }, [search, filterMonth, filterProject, filterCompany, filterStatus]);

  const totalPages = Math.ceil(filtered.length / itemsPerPage);
  const currentItems = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  if (edit) return <TaskForm settings={settings} initialData={edit} onSave={onSave} onSuccess={()=>setEdit(null)} onCancel={()=>setEdit(null)} />;

  return (
    <div className="space-y-6 animate-in fade-in duration-500 mb-20">
      <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-gray-100 flex flex-col gap-4">
        <div className="relative">
          <Search size={18} className="absolute left-6 top-1/2 transform -translate-y-1/2 text-gray-400" />
          <input placeholder="ค้นหาใบงาน..." className="w-full pl-14 pr-6 py-4 bg-gray-50 rounded-2xl focus:ring-2 focus:ring-[#C5A059] text-sm" value={search} onChange={e=>setSearch(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          <select value={filterMonth} onChange={e=>setFilterMonth(e.target.value)} className="p-3.5 bg-gray-50 rounded-2xl text-sm"><option value="">ทุกเดือน</option>{availableMonths.map(m => <option key={m} value={m}>{new Intl.DateTimeFormat('th-TH', { month: 'long', year: 'numeric' }).format(new Date(m))}</option>)}</select>
          <select value={filterProject} onChange={e=>setFilterProject(e.target.value)} className="p-3.5 bg-gray-50 rounded-2xl text-sm"><option value="">ทุกโครงการ</option>{settings.projects.map(p => <option key={p} value={p}>{p}</option>)}</select>
          <select value={filterCompany} onChange={e=>setFilterCompany(e.target.value)} className="p-3.5 bg-gray-50 rounded-2xl text-sm"><option value="">ทุกร้านค้า</option>{settings.companies.map(c => <option key={c} value={c}>{c}</option>)}</select>
          <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)} className="p-3.5 bg-gray-50 rounded-2xl text-sm"><option value="">ทุกสถานะ</option>{STATUSES.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}</select>
        </div>
      </div>

      <div className="bg-white rounded-[2.5rem] shadow-sm border border-gray-100 overflow-hidden">
        {/* Table Desktop: Fixed Layout */}
        <div className="hidden md:block w-full">
          <table className="w-full text-left text-sm table-fixed">
            <thead className="bg-gray-50 text-gray-400 text-[10px] uppercase font-bold border-b border-gray-100">
              <tr>
                <th className="w-2/12 px-6 py-5">เลขที่ใบงาน</th>
                <th className="w-3/12 px-6 py-5">โครงการ / แผนงาน</th>
                <th className="w-2/12 px-6 py-5">รายละเอียด</th>
                <th className="w-1/12 px-6 py-5 text-right">ค่าใช้จ่าย</th>
                <th className="w-2/12 px-6 py-5 text-center">สถานะ</th>
                <th className="w-2/12 px-6 py-5 text-center">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {currentItems.map(t=>{
                const isSchedOver = isScheduleOverdue(t);
                return (
                  <tr key={t.id} className="hover:bg-gray-50">
                    <td className="px-6 py-5 font-bold text-[#003366] truncate pr-2">
                      <div className="flex items-center space-x-1.5">
                        <span className="truncate">{t.taskNo}</span>
                      </div>
                      {isSchedOver && <span className="bg-amber-100 text-amber-700 text-[9px] px-2 py-0.5 rounded-md mt-1 w-max block font-bold">⚠️ เกินกำหนดจบงาน</span>}
                      {!isSchedOver && isOverdue(t) && <span className="bg-red-100 text-red-600 text-[9px] px-2 py-0.5 rounded-md mt-1 w-max block">เกินกำหนด</span>}
                      {isCarryOver(t) && <span className="bg-orange-100 text-orange-600 text-[9px] px-2 py-0.5 rounded-md mt-1 w-max block">งานค้างจาก {getOriginalMonthStr(t)}</span>}
                      
                      {/* Attached files icons */}
                      <div className="flex gap-1 mt-1.5">
                        {t.quoteFileUrl && <span title="มีใบเสนอราคา" className="text-amber-500"><Paperclip size={12}/></span>}
                        {t.signedFileUrl && <span title="เซ็นต์อนุมัติแล้ว" className="text-indigo-600"><ShieldCheck size={12}/></span>}
                        {t.taskFileUrl && <span title="มีใบงานแจ้งซ่อม" className="text-blue-600"><FileText size={12}/></span>}
                      </div>
                    </td>
                    <td className="px-6 py-5 text-gray-700 truncate pr-2" title={t.project}>
                      <span className="font-semibold block truncate">{t.project}</span>
                      <span className="text-xs text-gray-400 block truncate">{t.company}</span>
                      {t.startDate && t.endDate ? (
                        <span className="text-[10px] text-gray-400 font-mono mt-0.5 block">{t.startDate} ถึง {t.endDate}</span>
                      ) : (
                        t.aptDate && <span className="text-[10px] text-gray-400 font-mono mt-0.5 block">{t.aptDate}</span>
                      )}
                    </td>
                    <td className="px-6 py-5 text-gray-500 text-xs truncate pr-2" title={t.details}>{t.details || '-'}</td>
                    <td className="px-6 py-5 text-right font-semibold text-[#003366] whitespace-nowrap">{t.cost ? (isNaN(t.cost) ? t.cost : Number(t.cost).toLocaleString()) : '-'}</td>
                    <td className="px-6 py-5 text-center">
                      <InlineStatusSelect task={t} onSave={onSave} onRequestCancel={onRequestCancel} onRequestDisbursement={onRequestDisbursement} />
                    </td>
                    <td className="px-6 py-5 text-center space-x-1.5">
                      <button onClick={()=>onViewDetail(t)} title="ดูรายละเอียด & เอกสาร" className="p-2 text-gray-400 hover:text-[#003366] transition-colors"><Eye size={18}/></button>
                      <button onClick={()=>setEdit(t)} title="แก้ไขข้อมูล" className="p-2 text-gray-400 hover:text-[#C5A059] transition-colors"><Edit size={18}/></button>
                      <button onClick={()=>onRequestCancel(t)} title="ยกเลิกใบงาน" className="p-2 text-gray-400 hover:text-red-500 transition-colors"><Trash2 size={18}/></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile View */}
        <div className="md:hidden p-4 space-y-4 bg-gray-50/30 text-left">
          {currentItems.map(t => {
            const isSchedOver = isScheduleOverdue(t);
            return (
              <div key={t.id} className="group relative p-5 bg-white/80 backdrop-blur-md rounded-2xl border border-gray-100/80 shadow-[0_4px_20px_rgba(0,0,0,0.02)] overflow-hidden flex flex-col gap-3">
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-[#C5A059] to-[#003366]"></div>
                
                <div className="flex justify-between items-start pl-2">
                  <div className="flex flex-col min-w-0 pr-2">
                    <div className="flex items-center space-x-2 mb-1">
                      <span className="font-bold text-[#003366] text-base truncate">{t.taskNo}</span>
                      {isSchedOver && <span className="bg-amber-500/10 text-amber-700 text-[9px] px-2 py-0.5 rounded-md font-bold">⚠️ เลยกำหนด</span>}
                      {!isSchedOver && isOverdue(t) && <span className="bg-red-500/10 text-red-500 text-[9px] px-2 py-0.5 rounded-md font-bold">เลยกำหนด</span>}
                      {isCarryOver(t) && <span className="bg-orange-500/10 text-orange-600 text-[9px] px-2 py-0.5 rounded-md font-bold">งานค้างจาก {getOriginalMonthStr(t)}</span>}
                    </div>
                    <div className="text-[11px] text-gray-500 truncate flex items-center space-x-1"><Building2 size={10} className="text-[#003366]"/><span>{t.project} ({t.company})</span></div>
                    {t.startDate && t.endDate && (
                      <div className="text-[10px] text-gray-400 mt-0.5 font-mono">{t.startDate} - {t.endDate}</div>
                    )}
                  </div>
                  <div className="shrink-0 mt-1"><InlineStatusSelect task={t} onSave={onSave} onRequestCancel={onRequestCancel} onRequestDisbursement={onRequestDisbursement} /></div>
                </div>

                {/* Badges for attachments on mobile */}
                <div className="flex flex-wrap gap-1 pl-2">
                  {t.quoteFileUrl && <span className="text-[9px] bg-amber-100/90 text-amber-900 px-1.5 py-0.5 rounded-[3px] font-bold border-t border-amber-200 border-b border-amber-400 shadow-2xs">ใบเสนอราคา</span>}
                  {t.signedFileUrl && <span className="text-[9px] bg-indigo-100/90 text-indigo-900 px-1.5 py-0.5 rounded-[3px] font-bold border-t border-indigo-200 border-b border-indigo-400 shadow-2xs">เซ็นต์แล้ว</span>}
                  {t.taskFileUrl && <span className="text-[9px] bg-blue-100/90 text-blue-900 px-1.5 py-0.5 rounded-[3px] font-bold border-t border-blue-200 border-b border-blue-400 shadow-2xs">มีใบงาน</span>}
                </div>
                
                {t.details && <div className="text-xs text-gray-500 bg-gray-50/80 p-3 rounded-xl border border-gray-100 line-clamp-2 pl-2 mx-2">{t.details}</div>}
                
                <div className="flex justify-between items-center mt-2 pl-2">
                  <div className="flex gap-2">
                    <div className="text-[10px] text-gray-400 font-bold bg-gray-50 px-2 py-1.5 rounded-lg flex items-center space-x-1 border border-gray-100"><MapPin size={10}/><span>{t.area}</span></div>
                    {t.cost && <div className="text-[10px] text-green-600 font-bold bg-green-50 px-2 py-1.5 rounded-lg flex items-center space-x-1 border border-green-100"><span>฿ {isNaN(t.cost) ? t.cost : Number(t.cost).toLocaleString()}</span></div>}
                  </div>
                  <div className="flex space-x-1.5">
                    <button onClick={()=>onViewDetail(t)} title="ดูรายละเอียด" className="p-2.5 bg-gray-50 rounded-xl text-gray-500 hover:text-[#003366] hover:bg-gray-100 transition-colors"><Eye size={16}/></button>
                    <button onClick={()=>setEdit(t)} title="แก้ไข" className="p-2.5 bg-gray-50 rounded-xl text-gray-500 hover:text-[#C5A059] hover:bg-gray-100 transition-colors"><Edit size={16}/></button>
                    <button onClick={()=>onRequestCancel(t)} title="ยกเลิก" className="p-2.5 bg-red-50 rounded-xl text-red-400 hover:text-red-600 hover:bg-red-100 transition-colors"><Trash2 size={16}/></button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex flex-col sm:flex-row items-center justify-between px-6 py-4 bg-gray-50/30">
            <span className="text-[11px] font-bold text-gray-400 mb-4 sm:mb-0">
              แสดง {((currentPage - 1) * itemsPerPage) + 1} - {Math.min(currentPage * itemsPerPage, filtered.length)} จาก {filtered.length}
            </span>
            <div className="flex items-center space-x-1.5">
              <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="w-8 h-8 flex items-center justify-center rounded-xl bg-white border border-gray-200 disabled:opacity-30"><ChevronLeft size={16}/></button>
              {[...Array(totalPages)].map((_, i) => {
                const pageNum = i + 1;
                if (totalPages > 5 && (pageNum < currentPage - 2 || pageNum > currentPage + 2)) {
                  if (pageNum === 1 || pageNum === totalPages) return <span key={i} className="text-gray-300 text-xs">...</span>;
                  return null;
                }
                return (
                  <button key={i} onClick={() => setCurrentPage(pageNum)} className={`w-8 h-8 rounded-xl text-xs font-bold ${currentPage === pageNum ? 'bg-[#003366] text-white' : 'bg-white border border-gray-200 text-gray-500'}`}>{pageNum}</button>
                );
              })}
              <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="w-8 h-8 flex items-center justify-center rounded-xl bg-white border border-gray-200 disabled:opacity-30"><ChevronRight size={16}/></button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusTag({ label }) {
  const s = STATUSES.find(x => x.name === label);
  // 80's Classic Embossed DYMO Tape Style: High contrast, tactile bevels, crisp white font, zero synthwave blur
  const tapeStyles = {
    'รอใบเสนอราคา': { bg: '#475569', top: '#64748B', bottom: '#1E293B', dot: '#CBD5E1' },
    'อยู่ระหว่างตรวจสอบใบเสนอราคา': { bg: '#B45309', top: '#D97706', bottom: '#78350F', dot: '#FDE68A' },
    'อนุมัติใบเสนอราคาแล้ว': { bg: '#4338CA', top: '#6366F1', bottom: '#312E81', dot: '#C7D2FE' },
    'เปิดใบงานในระบบแล้ว': { bg: '#1D4ED8', top: '#3B82F6', bottom: '#1E3A8A', dot: '#BFDBFE' },
    'จบงานและรอรับเอกสารวางบิล': { bg: '#6D28D9', top: '#8B5CF6', bottom: '#4C1D95', dot: '#DDD6FE' },
    'ได้รับเอกสารวางบิลแล้ว': { bg: '#BE185D', top: '#EC4899', bottom: '#831843', dot: '#FBCFE8' },
    'ส่งเอกสารเบิกจ่ายแล้ว': { bg: '#047857', top: '#10B981', bottom: '#064E3B', dot: '#A7F3D0' },
    'ยกเลิก': { bg: '#B91C1C', top: '#EF4444', bottom: '#7F1D1D', dot: '#FECACA' }
  };

  const tape = tapeStyles[label] || { 
    bg: s?.color || '#334155', 
    top: '#64748B', 
    bottom: '#1E293B', 
    dot: '#E2E8F0' 
  };

  return (
    <span 
      className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-[4px] text-[10px] font-bold tracking-wider text-white whitespace-nowrap shadow-[0_1px_2px_rgba(0,0,0,0.2)] select-none shrink-0"
      style={{
        backgroundColor: tape.bg,
        borderTop: `1.5px solid ${tape.top}`,
        borderBottom: `2px solid ${tape.bottom}`,
        borderLeft: '1px solid rgba(0,0,0,0.12)',
        borderRight: '1px solid rgba(0,0,0,0.12)',
        textShadow: '0 1px 1px rgba(0,0,0,0.4)',
        letterSpacing: '0.03em'
      }}
      title={`สถานะ: ${label}`}
    >
      <span className="w-1.5 h-1.5 rounded-full inline-block shrink-0" style={{ backgroundColor: tape.dot }} />
      <span>{label}</span>
    </span>
  );
}

function CalendarView({ tasks, onViewDetail }) {
  const [now, setNow] = useState(new Date());
  const [selectedDayTasks, setSelectedDayTasks] = useState(null);
  
  const y = now.getFullYear(); const m = now.getMonth();
  const daysIn = new Date(y, m + 1, 0).getDate();
  const first = new Date(y, m, 1).getDay();
  const grid = [...Array(first).fill(null), ...Array(daysIn).keys()].map(i => i === null ? null : i + 1);

  return (
    <div className="bg-white p-5 md:p-10 rounded-[2.5rem] shadow-sm border border-gray-100 animate-in fade-in duration-700 mb-20 relative">
      <div className="flex justify-between items-center mb-8">
        <button onClick={()=>setNow(new Date(y, m-1, 1))} className="p-3 bg-gray-50 rounded-2xl text-gray-400 hover:bg-gray-100"><ChevronLeft size={18}/></button>
        <div className="text-center">
          <h4 className="font-bold text-[#003366] md:text-lg">{new Intl.DateTimeFormat('th-TH', { month: 'long', year: 'numeric' }).format(now)}</h4>
          <span className="text-[10px] text-gray-400 font-medium">ปฏิทินแผนงานต่อเนื่อง (Multi-day View)</span>
        </div>
        <button onClick={()=>setNow(new Date(y, m+1, 1))} className="p-3 bg-gray-50 rounded-2xl text-gray-400 hover:bg-gray-100"><ChevronRight size={18}/></button>
      </div>

      <div className="grid grid-cols-7 gap-px bg-gray-100 rounded-[1.5rem] overflow-hidden border border-gray-100">
        {['อา','จ','อ','พ','พฤ','ศ','ส'].map(d=><div key={d} className="bg-white p-3 text-center text-[10px] text-gray-300 font-bold uppercase">{d}</div>)}
        {grid.map((d, i) => {
          const dateStr = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
          const tks = tasks.filter(t => {
            if (t.isDeleted || t.status === 'ยกเลิก') return false;
            if (t.startDate && t.endDate) {
              return dateStr >= t.startDate && dateStr <= t.endDate;
            }
            return t.aptDate === dateStr;
          });

          return (
            <div 
              key={i} 
              onClick={() => d && setSelectedDayTasks({ date: dateStr, displayDate: d, tks })} 
              className={`bg-white min-h-[75px] md:min-h-[120px] p-1 md:p-2 text-left transition-colors ${d ? 'cursor-pointer hover:bg-gray-50/80' : 'bg-gray-50/20'}`}
            >
              {d && <div className="text-[10px] md:text-xs mb-1 font-bold text-gray-700">{d}</div>}
              <div className="space-y-1">
                {tks.slice(0, 3).map(t => {
                  const isMultiDay = t.startDate && t.endDate && t.startDate !== t.endDate;
                  const isStart = !isMultiDay || dateStr === t.startDate;
                  const isEnd = !isMultiDay || dateStr === t.endDate;
                  const sObj = STATUSES.find(s => s.name === t.status);
                  const isOver = isScheduleOverdue(t) || isOverdue(t);
                  
                  return (
                    <div 
                      key={t.id} 
                      onClick={(e) => { e.stopPropagation(); onViewDetail(t); }}
                      className={`text-[8.5px] text-white py-1 px-1.5 truncate font-bold shadow-2xs transition-transform hover:scale-[1.02] ${isStart ? 'rounded-l-lg ml-0.5' : 'rounded-l-none -ml-1 border-l border-white/20'} ${isEnd ? 'rounded-r-lg mr-0.5' : 'rounded-r-none -mr-1'}`}
                      style={{ backgroundColor: isOver ? '#EF4444' : (sObj?.color || '#003366') }}
                      title={`${t.taskNo} (${t.project}) - ${t.status} [${t.startDate || t.aptDate} ถึง ${t.endDate || t.aptDate}]`}
                    >
                      {isStart ? `${t.taskNo} ${isMultiDay ? '→' : ''}` : (d === 1 ? t.taskNo : '•')}
                    </div>
                  );
                })}
                {tks.length > 3 && <div className="text-[9px] text-gray-400 font-bold text-center mt-0.5">+{tks.length - 3} งาน</div>}
              </div>
            </div>
          );
        })}
      </div>

      {/* PopUp on Day Click */}
      {selectedDayTasks && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end md:items-center justify-center z-[60] p-0 md:p-4 animate-in fade-in duration-200">
          <div className="bg-white p-6 md:p-8 rounded-t-[2.5rem] md:rounded-[2rem] w-full max-w-md shadow-2xl animate-in slide-in-from-bottom-full md:zoom-in-95 duration-300 max-h-[85vh] flex flex-col">
            <div className="flex justify-between items-center mb-6">
               <h3 className="font-bold text-xl text-[#003366]">วันที่ {selectedDayTasks.displayDate} {new Intl.DateTimeFormat('th-TH', { month: 'long' }).format(now)}</h3>
               <button onClick={() => setSelectedDayTasks(null)} className="p-2 bg-gray-50 rounded-full text-gray-400 hover:bg-gray-100"><X size={18}/></button>
            </div>
            <div className="space-y-4 max-h-[60vh] overflow-y-auto text-left pr-2 custom-scrollbar">
               {selectedDayTasks.tks.length > 0 ? selectedDayTasks.tks.map(t => (
                  <div key={t.id} className="p-5 border border-gray-100 rounded-2xl bg-gray-50/50 space-y-2">
                     <div className="flex items-center justify-between">
                        <span className="font-bold text-[#003366] text-lg">{t.taskNo}</span>
                        <StatusTag label={t.status} />
                     </div>
                     <div className="text-xs text-gray-500 font-medium">{t.project} — {t.company}</div>
                     {t.startDate && t.endDate && (
                       <div className="text-[11px] text-gray-400 flex items-center gap-1 font-mono"><CalendarDays size={12}/> {t.startDate} ถึง {t.endDate}</div>
                     )}
                     <button 
                       onClick={() => { onViewDetail(t); setSelectedDayTasks(null); }} 
                       className="w-full mt-2 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-bold text-[#003366] hover:bg-gray-50 flex items-center justify-center space-x-1.5 transition-colors shadow-2xs"
                     >
                       <Eye size={14}/>
                       <span>ดูรายละเอียด & จัดการเอกสาร</span>
                     </button>
                  </div>
               )) : (<div className="text-center text-gray-400 py-10"><p className="text-sm font-bold">ไม่มีรายการงานในวันนี้</p></div>)}
            </div>
          </div>
        </div>
      )}
    </div>
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
  const [companyEmails, setCompanyEmails] = useState(settings.companyEmails || {});
  const [showGasModal, setShowGasModal] = useState(false);
  const [testEmailStatus, setTestEmailStatus] = useState('');
  const [isTestingEmail, setIsTestingEmail] = useState(false);
  const [copiedGas, setCopiedGas] = useState(false);
  const [editingComp, setEditingComp] = useState(null);
  const [editEmailVal, setEditEmailVal] = useState('');

  useEffect(() => {
    setNotificationEmail(settings.notificationEmail || '');
    setWebhookUrl(settings.webhookUrl || '');
    setCompanyEmails(settings.companyEmails || {});
  }, [settings]);
  
  const availableMonths = useMemo(() => {
    const months = tasks.map(t => getEffectiveMonth(t)).filter(m => m !== '');
    return [...new Set([new Date().toISOString().slice(0, 7), ...months])].sort().reverse();
  }, [tasks]);

  const [reportMonth, setReportMonth] = useState(availableMonths[0] || new Date().toISOString().slice(0, 7));
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
    await updateSettings({
      ...settings,
      notificationEmail: notificationEmail.trim(),
      webhookUrl: webhookUrl.trim()
    });
    alert('บันทึกการตั้งค่าอีเมลแจ้งเตือนเรียบร้อยแล้ว!');
  };

  const handleTestEmail = async () => {
    if (!notificationEmail.trim()) {
      alert('กรุณากรอก "อีเมลสำหรับรับแจ้งเตือน (เจ้าหน้าที่)" ก่อนทำการทดสอบ');
      return;
    }
    const currentWebhook = webhookUrl.trim() || GOOGLE_SHEETS_WEBHOOK_URL;
    if (!currentWebhook) {
      alert('กรุณากรอก "Google Apps Script Webhook URL" ก่อนทดสอบ (สามารถกดปุ่ม "ดูโค้ด & วิธีติดตั้ง Webhook ฟรี" เพื่อสร้างได้ฟรีใน 1 นาที)');
      return;
    }
    setIsTestingEmail(true);
    setTestEmailStatus('กำลังส่งอีเมลทดสอบ...');
    try {
      const ok = await triggerEmailNotification({
        taskNo: 'TEST-001',
        project: 'ทดสอบระบบแจ้งเตือน V-Track',
        company: 'บริษัท ทดสอบ จำกัด',
        status: 'ทดสอบการส่งอีเมล'
      }, 'test_notification', {
        toEmail: notificationEmail.trim(),
        subject: '[V-Track Test] ทดสอบการเชื่อมต่อระบบแจ้งเตือนทางอีเมล',
        message: 'ยินดีด้วย! ระบบแจ้งเตือนทางอีเมลของ V-Track เชื่อมต่อกับ Google Apps Script สำเร็จเรียบร้อยแล้ว สามารถใช้งานส่งอีเมลแจ้งเตือนอัตโนมัติได้ทันที'
      }, { webhookUrl: currentWebhook });

      if (ok) {
        setTestEmailStatus('ส่งคำขอทดสอบสำเร็จ! กรุณาตรวจสอบอีเมลที่ ' + notificationEmail.trim());
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

  const handleAdd = async (type) => {
    if (type === 'P') { 
      if (!p.trim()) return; 
      await updateSettings({ ...settings, projects: [...settings.projects, p.trim()] }); 
      setP(''); 
    } else { 
      if (!c.trim()) return; 
      const compName = c.trim();
      const updatedCompanies = settings.companies.includes(compName) ? settings.companies : [...settings.companies, compName];
      const updatedCompanyEmails = { ...companyEmails };
      if (compEmail.trim()) {
        updatedCompanyEmails[compName] = compEmail.trim();
      }
      setCompanyEmails(updatedCompanyEmails);
      await updateSettings({ 
        ...settings, 
        companies: updatedCompanies,
        companyEmails: updatedCompanyEmails
      }); 
      setC(''); 
      setCompEmail('');
    }
  };

  const handleDeleteCompany = async (item) => {
    const updatedCompanies = settings.companies.filter(x => x !== item);
    const updatedCompanyEmails = { ...companyEmails };
    delete updatedCompanyEmails[item];
    setCompanyEmails(updatedCompanyEmails);
    await updateSettings({
      ...settings,
      companies: updatedCompanies,
      companyEmails: updatedCompanyEmails
    });
  };

  const handleSaveCompEmail = async (compName) => {
    const updated = { ...companyEmails };
    if (editEmailVal.trim()) {
      updated[compName] = editEmailVal.trim();
    } else {
      delete updated[compName];
    }
    setCompanyEmails(updated);
    setEditingComp(null);
    setEditEmailVal('');
    await updateSettings({
      ...settings,
      companyEmails: updated
    });
  };

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
        await updateSettings({ projects: newP, companies: newC }); setSt(`สำเร็จ ${count} รายการ`);
      }
    });
  };

  return (
    <div className="space-y-8 mb-24 animate-in fade-in text-left">
      {/* 1. Storage Usage Indicator (สถานะพื้นที่ Firebase Storage) */}
      <div className="bg-white p-6 md:p-8 rounded-[2.5rem] border border-gray-100 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center">
              <HardDrive size={20}/>
            </div>
            <div>
              <h4 className="text-xs md:text-sm font-bold text-gray-800">พื้นที่จัดเก็บเอกสาร Firebase Storage</h4>
              <p className="text-[10px] text-gray-400">แผนบริการฟรี Spark (โควตา 5,120 MB)</p>
            </div>
          </div>
          <span className="text-xs font-bold text-[#003366] bg-indigo-50 px-3 py-1 rounded-full">
            {storageStats.percent}% ใช้งาน
          </span>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-gray-100 h-3.5 rounded-full overflow-hidden mb-2">
          <div 
            className="h-full bg-gradient-to-r from-blue-500 via-indigo-500 to-[#C5A059] transition-all duration-500 rounded-full"
            style={{ width: `${Math.max(2, storageStats.percent)}%` }}
          />
        </div>

        <div className="flex justify-between items-center text-[11px] text-gray-500 font-medium">
          <span>ใช้งานไป <strong>{storageStats.totalMb} MB</strong> จาก {storageStats.quotaMb} MB</span>
          <span>เอกสารในระบบทั้งหมด <strong>{storageStats.fileCount} ไฟล์</strong></span>
        </div>
      </div>

      {/* 2. ระบบออกรายงานและสำรองข้อมูล */}
      <div className="bg-white p-6 md:p-8 rounded-[2.5rem] border border-gray-100 shadow-sm flex flex-col">
        <h4 className="text-[10px] md:text-xs font-bold text-[#003366] mb-6 uppercase tracking-widest flex items-center"><Printer size={16} className="mr-2"/> ระบบออกรายงานและสำรองข้อมูล</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-6">
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">ประจำเดือน</label>
            <select value={reportMonth} onChange={e=>setReportMonth(e.target.value)} className="w-full p-3 bg-gray-50 rounded-2xl text-xs md:text-sm border-none focus:ring-2 focus:ring-[#C5A059]"><option value="">ทุกเดือน</option>{availableMonths.map(m => <option key={m} value={m}>{new Intl.DateTimeFormat('th-TH', { month: 'long', year: 'numeric' }).format(new Date(m))}</option>)}</select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">โครงการ</label>
            <select value={reportProj} onChange={e=>setReportProj(e.target.value)} className="w-full p-3 bg-gray-50 rounded-2xl text-xs md:text-sm border-none focus:ring-2 focus:ring-[#C5A059]"><option value="">ทุกโครงการ</option>{settings.projects.map(p => <option key={p} value={p}>{p}</option>)}</select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">ร้านค้า</label>
            <select value={reportComp} onChange={e=>setReportComp(e.target.value)} className="w-full p-3 bg-gray-50 rounded-2xl text-xs md:text-sm border-none focus:ring-2 focus:ring-[#C5A059]"><option value="">ทุกร้านค้า</option>{settings.companies.map(c => <option key={c} value={c}>{c}</option>)}</select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">สถานะ</label>
            <select value={reportStatus} onChange={e=>setReportStatus(e.target.value)} className="w-full p-3 bg-gray-50 rounded-2xl text-xs md:text-sm border-none focus:ring-2 focus:ring-[#C5A059]"><option value="">ทุกสถานะ</option>{STATUSES.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}</select>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-4">
          <button onClick={() => triggerPrint({ selectedMonth: reportMonth, filterProj: reportProj, filterComp: reportComp, filterStatus: reportStatus })} className="flex-1 py-4 bg-[#003366] text-white rounded-2xl font-bold flex items-center justify-center space-x-2"><Printer size={18}/><span>พิมพ์รายงาน PDF</span></button>
          <button onClick={handleExportExcel} className="flex-1 py-4 bg-[#10B981] text-white rounded-2xl font-bold flex items-center justify-center space-x-2"><FileDown size={18}/><span>ดาวน์โหลด Backup Excel</span></button>
        </div>
      </div>

      {/* 3. คลังรายการที่ยกเลิก (Cancelled Tasks Archive) */}
      <div className="bg-white p-6 md:p-8 rounded-[2.5rem] border border-gray-100 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-red-50 text-red-600 rounded-xl flex items-center justify-center">
              <History size={20}/>
            </div>
            <div>
              <h4 className="text-xs md:text-sm font-bold text-gray-800">คลังรายการที่ยกเลิก (Cancelled Tasks)</h4>
              <p className="text-[10px] text-gray-400">รายการที่ถูกยกเลิกและนำออกจากหน้ากระดานหลัก ({cancelledTasks.length} รายการ)</p>
            </div>
          </div>
          <button 
            onClick={() => setShowCancelledArchive(!showCancelledArchive)}
            className="text-xs font-bold text-[#003366] hover:underline"
          >
            {showCancelledArchive ? 'ซ่อนรายการ' : 'แสดงรายการ'}
          </button>
        </div>

        {showCancelledArchive && (
          <div className="mt-6 border-t border-gray-100 pt-4">
            {cancelledTasks.length > 0 ? (
              <div className="space-y-3 max-h-72 overflow-y-auto pr-1 custom-scrollbar">
                {cancelledTasks.map(t => {
                  const dateStr = t.cancelledAt ? new Intl.DateTimeFormat('th-TH', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(t.cancelledAt)) : '-';
                  return (
                    <div key={t.id} className="p-4 bg-gray-50 rounded-2xl border border-gray-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="font-bold text-gray-800 text-sm">#{t.taskNo}</span>
                          <span className="text-[10px] text-red-600 bg-red-50 px-2 py-0.5 rounded font-bold">ยกเลิกแล้ว</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">{t.project} — {t.company}</p>
                        <p className="text-xs text-red-600 font-medium mt-1"><strong>สาเหตุ:</strong> {t.cancelReason || 'ไม่ระบุ'}</p>
                        <span className="text-[10px] text-gray-400 font-mono mt-0.5 block">ยกเลิกเมื่อ: {dateStr}</span>
                      </div>
                      <button 
                        onClick={() => onRestoreTask(t)}
                        className="px-4 py-2 bg-white hover:bg-gray-100 border border-gray-200 rounded-xl text-xs font-bold text-[#003366] shrink-0 flex items-center space-x-1 shadow-2xs"
                      >
                        <RotateCcw size={13}/>
                        <span>กู้คืนใบงาน</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-gray-400 italic text-center py-4">ไม่มีรายการที่ถูกยกเลิก</p>
            )}
          </div>
        )}
      </div>

      {/* 4. ระบบการแจ้งเตือนทางอีเมลอัตโนมัติ (Email Notifications) */}
      <div className="bg-white p-6 md:p-8 rounded-[2.5rem] border border-gray-100 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-blue-50 text-[#003366] rounded-xl flex items-center justify-center">
              <Mail size={20}/>
            </div>
            <div>
              <h4 className="text-xs md:text-sm font-bold text-gray-800">ระบบการแจ้งเตือนทางอีเมลอัตโนมัติ (Email Notifications)</h4>
              <p className="text-[10px] text-gray-400">ส่งอีเมลแจ้งเตือนเจ้าหน้าที่เมื่อมีใบเสนอราคา และแจ้งเตือนผู้รับเหมาเมื่อมีใบแจ้งซ่อม (ฟรี 100% ผ่าน Google Apps Script)</p>
            </div>
          </div>
          <button 
            type="button"
            onClick={() => setShowGasModal(true)}
            className="px-3.5 py-2 bg-blue-50 hover:bg-blue-100 text-[#003366] border border-blue-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 self-start sm:self-center shadow-2xs"
          >
            <span>📜 ดูโค้ด Webhook & วิธีตั้งค่าฟรี</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1">
              <Mail size={12}/> อีเมลสำหรับรับแจ้งเตือน (เจ้าหน้าที่)
            </label>
            <input 
              type="email" 
              placeholder="e.g. admin@vtrack.com, officer@company.com" 
              value={notificationEmail} 
              onChange={e => setNotificationEmail(e.target.value)}
              className="w-full p-3.5 bg-gray-50 rounded-2xl text-xs border border-gray-200 focus:bg-white focus:ring-2 focus:ring-[#003366] outline-none font-medium text-gray-800"
            />
            <p className="text-[10px] text-gray-400">
              * เมื่อผู้รับเหมาแนบใบเสนอราคาในรายการสถานะ <strong>'รอใบเสนอราคา'</strong> ระบบจะส่งอีเมลแจ้งเตือนมาที่นี่ทันที
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1">
              <span>🔗</span> Google Apps Script Webhook URL (ฟรี 100%)
            </label>
            <input 
              type="url" 
              placeholder="https://script.google.com/macros/s/.../exec" 
              value={webhookUrl} 
              onChange={e => setWebhookUrl(e.target.value)}
              className="w-full p-3.5 bg-gray-50 rounded-2xl text-xs border border-gray-200 focus:bg-white focus:ring-2 focus:ring-[#003366] outline-none font-mono text-gray-700"
            />
            <p className="text-[10px] text-gray-400">
              * URL เว็บบริการจาก Google Apps Script (ส่งอีเมลฟรี 100 ฉบับ/วัน ไม่ต้องใช้บัตรเครดิต)
            </p>
          </div>
        </div>

        {testEmailStatus && (
          <div className={`p-3 rounded-xl text-xs font-medium flex items-center gap-2 ${testEmailStatus.includes('สำเร็จ') ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : testEmailStatus.includes('กำลัง') ? 'bg-blue-50 text-blue-800' : 'bg-red-50 text-red-800'}`}>
            {isTestingEmail && <Loader2 size={14} className="animate-spin" />}
            <span>{testEmailStatus}</span>
          </div>
        )}

        <div className="flex flex-wrap gap-3 pt-2">
          <button 
            type="button"
            onClick={handleSaveEmailSettings}
            className="px-6 py-3 bg-[#003366] hover:bg-[#002244] text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-xs active:scale-95"
          >
            <CheckCircle2 size={15}/>
            <span>บันทึกการตั้งค่าอีเมล</span>
          </button>

          <button 
            type="button"
            disabled={isTestingEmail}
            onClick={handleTestEmail}
            className="px-5 py-3 bg-white hover:bg-gray-50 border border-gray-300 text-gray-700 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-2xs active:scale-95 disabled:opacity-50"
          >
            {isTestingEmail ? <Loader2 size={14} className="animate-spin"/> : <Send size={14}/>}
            <span>{isTestingEmail ? 'กำลังส่งทดสอบ...' : 'ทดสอบส่งอีเมล (Test)'}</span>
          </button>
        </div>
      </div>

      {/* 5. การจัดการโครงการ & ร้านค้า/ผู้รับเหมา */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-6 md:p-8 rounded-[2.5rem] border border-gray-100 shadow-sm flex flex-col">
          <h4 className="text-[10px] font-bold text-gray-400 mb-4 uppercase tracking-widest">โครงการ</h4>
          <div className="flex space-x-2 mb-4">
            <input 
              className="flex-1 p-3 bg-gray-50 rounded-2xl text-xs border border-gray-200 focus:bg-white outline-none" 
              placeholder="ชื่อโครงการใหม่"
              value={p} 
              onChange={e=>setP(e.target.value)}
            />
            <button onClick={()=>handleAdd('P')} className="bg-[#003366] text-white px-5 rounded-2xl text-xs font-bold">เพิ่ม</button>
          </div>
          <div className="space-y-1.5 max-h-60 overflow-auto pr-1 custom-scrollbar">
            {settings.projects.map(item => (
              <div key={item} className="p-3 bg-gray-50 rounded-xl flex justify-between items-center">
                <span className="text-xs font-bold text-gray-700">{item}</span>
                <button onClick={()=>updateSettings({...settings, projects: settings.projects.filter(x=>x!==item)})} className="text-red-300 hover:text-red-500">
                  <X size={14}/>
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white p-6 md:p-8 rounded-[2.5rem] border border-gray-100 shadow-sm flex flex-col">
          <div className="flex justify-between items-center mb-4">
            <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">ร้านค้า / ผู้รับเหมา</h4>
            <span className="text-[9px] text-gray-400 font-medium">ผูกอีเมลสำหรับส่งใบแจ้งซ่อม</span>
          </div>
          
          <div className="space-y-2 mb-4 bg-gray-50/70 p-3 rounded-2xl border border-gray-100">
            <input 
              className="w-full p-2.5 bg-white rounded-xl text-xs border border-gray-200 focus:ring-1 focus:ring-[#003366] outline-none" 
              placeholder="ชื่อบริษัท / ร้านค้า" 
              value={c} 
              onChange={e=>setC(e.target.value)}
            />
            <div className="flex space-x-2">
              <input 
                type="email"
                className="flex-1 p-2.5 bg-white rounded-xl text-xs border border-gray-200 focus:ring-1 focus:ring-[#003366] outline-none" 
                placeholder="อีเมลผู้รับเหมา (ถ้ามี)" 
                value={compEmail} 
                onChange={e=>setCompEmail(e.target.value)}
              />
              <button onClick={()=>handleAdd('C')} className="bg-[#003366] text-white px-5 rounded-xl text-xs font-bold shrink-0">
                เพิ่ม
              </button>
            </div>
          </div>

          <div className="space-y-2 max-h-60 overflow-auto pr-1 custom-scrollbar">
            {settings.companies.map(item => {
              const email = companyEmails[item];
              const isEditing = editingComp === item;
              return (
                <div key={item} className="p-3 bg-gray-50 rounded-xl border border-gray-100 flex flex-col gap-1.5">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-gray-800">{item}</span>
                    <button onClick={()=>handleDeleteCompany(item)} className="text-red-300 hover:text-red-500" title="ลบร้านค้านี้">
                      <X size={14}/>
                    </button>
                  </div>
                  
                  {isEditing ? (
                    <div className="flex gap-1.5 mt-1">
                      <input 
                        type="email"
                        value={editEmailVal}
                        onChange={e => setEditEmailVal(e.target.value)}
                        placeholder="อีเมลผู้รับเหมา"
                        className="flex-1 p-1.5 text-xs bg-white rounded-lg border border-gray-300"
                        autoFocus
                      />
                      <button 
                        onClick={() => handleSaveCompEmail(item)}
                        className="px-2.5 py-1 bg-emerald-600 text-white rounded-lg text-xs font-bold"
                      >
                        บันทึก
                      </button>
                      <button 
                        onClick={() => { setEditingComp(null); setEditEmailVal(''); }}
                        className="px-2 py-1 bg-gray-200 text-gray-600 rounded-lg text-xs"
                      >
                        ยกเลิก
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between text-[11px]">
                      {email ? (
                        <span className="text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md font-mono flex items-center gap-1 border border-blue-100">
                          <Mail size={10}/> {email}
                        </span>
                      ) : (
                        <span className="text-gray-400 italic">ยังไม่ระบุอีเมล</span>
                      )}
                      <button 
                        onClick={() => { setEditingComp(item); setEditEmailVal(email || ''); }}
                        className="text-[10px] text-gray-500 hover:text-[#003366] font-medium underline ml-auto"
                      >
                        {email ? 'แก้ไขอีเมล' : '+ เพิ่มอีเมล'}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 6. พื้นที่อันตราย */}
      <div className="bg-red-50 p-10 rounded-[2.5rem] border border-red-100 shadow-sm text-center">
        <h4 className="text-[10px] font-bold text-red-400 mb-4 uppercase tracking-widest">พื้นที่อันตราย</h4>
        <button onClick={() => setShowClearConfirm(true)} className="bg-red-500 text-white px-12 py-4 rounded-2xl font-bold flex items-center mx-auto"><Trash size={18} className="mr-2"/> ล้างฐานข้อมูล</button>
        {showClearConfirm && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-50 p-6">
            <div className="bg-white p-10 rounded-[3rem] w-full max-w-sm text-center">
              <h3 className="font-bold text-gray-800 text-2xl mb-2">ยืนยันลบข้อมูลทั้งหมด?</h3>
              <div className="flex gap-4 mt-8">
                <button onClick={() => setShowClearConfirm(false)} className="flex-1 py-4 bg-gray-100 rounded-2xl font-bold">ยกเลิก</button>
                <button onClick={async () => { await onClear(); setShowClearConfirm(false); }} className="flex-1 py-4 bg-red-500 text-white rounded-2xl font-bold">ลบทั้งหมด</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modal: Google Apps Script Code & Setup Instructions */}
      {showGasModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in">
          <div className="bg-white p-6 md:p-8 rounded-[2rem] w-full max-w-2xl max-h-[90vh] overflow-y-auto text-left space-y-5 custom-scrollbar shadow-2xl">
            <div className="flex justify-between items-center border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-50 text-[#003366] flex items-center justify-center font-bold text-xs">
                  GAS
                </div>
                <div>
                  <h3 className="font-bold text-gray-800 text-base">วิธีติดตั้ง Google Apps Script (ส่งอีเมลฟรี 100%)</h3>
                  <p className="text-[10px] text-gray-400">ทำตาม 4 ขั้นตอนง่ายๆ ใช้เวลาไม่เกิน 1 นาที</p>
                </div>
              </div>
              <button onClick={() => setShowGasModal(false)} className="p-2 hover:bg-gray-100 rounded-full text-gray-400"><X size={18}/></button>
            </div>

            <div className="space-y-3 text-xs text-gray-600 leading-relaxed">
              <div className="p-3 bg-blue-50/60 rounded-xl border border-blue-100 space-y-1">
                <p className="font-bold text-[#003366]">ขั้นตอนที่ 1:</p>
                <p>เปิดเบราว์เซอร์ไปที่ <a href="https://script.google.com" target="_blank" rel="noreferrer" className="text-blue-600 underline font-bold">script.google.com</a> (ล็อกอินด้วยบัญชี Google ของท่าน) แล้วกดปุ่ม <strong>"+ โครงการใหม่ (New project)"</strong></p>
              </div>

              <div className="p-3 bg-blue-50/60 rounded-xl border border-blue-100 space-y-1">
                <p className="font-bold text-[#003366]">ขั้นตอนที่ 2:</p>
                <p>ลบโค้ดเดิมในหน้าจอออกทั้งหมด แล้วกดปุ่ม <strong>"คัดลอกโค้ด Google Apps Script"</strong> ด้านล่างนี้ นำไปวางแทนที่</p>
              </div>

              <div className="p-3 bg-blue-50/60 rounded-xl border border-blue-100 space-y-1">
                <p className="font-bold text-[#003366]">ขั้นตอนที่ 3:</p>
                <p>กดปุ่ม <strong>"การทำให้ใช้งานได้ (Deploy)"</strong> ด้านบนขวา ➔ เลือก <strong>"การทำให้ใช้งานได้รายการใหม่ (New deployment)"</strong> ➔ เลือกประเภทเป็น <strong>"เว็บแอป (Web app)"</strong>:</p>
                <ul className="list-disc list-inside pl-2 space-y-0.5 text-gray-700">
                  <li>เรียกใช้ในฐานะ (Execute as): <strong>ฉัน (Me)</strong></li>
                  <li>ผู้ที่มีสิทธิ์เข้าถึง (Who has access): <strong>ทุกคน (Anyone)</strong></li>
                </ul>
              </div>

              <div className="p-3 bg-blue-50/60 rounded-xl border border-blue-100 space-y-1">
                <p className="font-bold text-[#003366]">ขั้นตอนที่ 4:</p>
                <p>กด <strong>"ทำให้ใช้งานได้"</strong> และอนุญาตสิทธิ์เข้าถึง (Authorize) จากนั้นคัดลอก <strong>URL เว็บแอป (Web app URL)</strong> ที่ได้ นำมาวางลงในช่อง Webhook URL ในหน้าตั้งค่าของ V-Track เป็นอันเสร็จสมบูรณ์!</p>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-gray-700 font-mono">CODE: Code.gs</span>
                <button 
                  onClick={handleCopyGasCode}
                  className="px-3.5 py-1.5 bg-[#003366] hover:bg-[#002244] text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-all active:scale-95"
                >
                  {copiedGas ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                  <span>{copiedGas ? 'คัดลอกโค้ดแล้ว!' : 'คัดลอกโค้ดทั้งหมด'}</span>
                </button>
              </div>
              <pre className="p-4 bg-gray-900 text-gray-100 rounded-2xl text-[11px] font-mono overflow-x-auto max-h-60 custom-scrollbar leading-normal">
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