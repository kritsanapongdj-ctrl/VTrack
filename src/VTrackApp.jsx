/* eslint-disable */
import React, { useState, useEffect, useMemo } from 'react';
import { 
  LayoutDashboard, 
  FileText, 
  Settings, 
  Calendar as CalendarIcon, 
  PlusCircle, 
  Upload, 
  Search, 
  Edit, 
  Trash2, 
  X, 
  Download,
  AlertCircle,
  Menu,
  ChevronLeft,
  ChevronRight,
  User,
  Filter,
  CalendarDays,
  FileDown,
  Printer,
  Trash
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, onSnapshot, addDoc, updateDoc, deleteDoc, getDocs } from 'firebase/firestore';

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

const firebaseConfig = typeof __firebase_config !== 'undefined' 
  ? JSON.parse(__firebase_config) 
  : userFirebaseConfig;

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'v-track-system';

// --- Constants ---
const AREAS = ['รังสิต', 'ร่มเกล้า', 'พระราม 9', 'รามอินทรา'];

const STATUSES = [
  { id: 1, name: 'รอใบเสนอราคา', color: '#9CA3AF', bgColor: '#F3F4F6' },
  { id: 2, name: 'อยู่ระหว่างตรวจสอบใบเสนอราคา', color: '#F59E0B', bgColor: '#FEF3C7' },
  { id: 3, name: 'เปิดใบงานในระบบแล้ว', color: '#3B82F6', bgColor: '#DBEAFE' },
  { id: 4, name: 'จบงานและรอรับเอกสารวางบิล', color: '#8B5CF6', bgColor: '#EDE9FE' },
  { id: 5, name: 'ได้รับเอกสารวางบิลแล้ว', color: '#14B8A6', bgColor: '#CCFBF1' },
  { id: 6, name: 'ส่งเอกสารเบิกจ่ายแล้ว', color: '#10B981', bgColor: '#D1FAE5' }
];

// --- Main Application Component ---
export default function App() {
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [tasks, setTasks] = useState([]);
  const [settings, setSettings] = useState({ projects: [], companies: [] });
  const [loading, setLoading] = useState(true);
  const [systemError, setSystemError] = useState('');

  // Load external scripts (xlsx, jspdf)
  useEffect(() => {
    const loadScript = (id, src) => {
      if (!document.getElementById(id)) {
        const s = document.createElement('script');
        s.id = id;
        s.src = src;
        document.body.appendChild(s);
      }
    };
    loadScript('papaparse-script', 'https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.3.2/papaparse.min.js');
    loadScript('xlsx-script', 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');
  }, []);

  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token && typeof __firebase_config !== 'undefined') {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (error) {
        try {
          await signInAnonymously(auth);
        } catch (fbErr) {
          setSystemError("Authentication Failed: Please check your Firebase settings.");
          setLoading(false);
        }
      }
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
        setSettings({ projects: data.projects || [], companies: data.companies || [] });
      } else {
        const def = { projects: ['หมู่บ้าน A'], companies: ['ร้าน ก'] };
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
    }, (err) => {
      setSystemError("Permission Denied: Check Firestore Rules.");
      setLoading(false);
    });

    return () => { unsubSettings(); unsubTasks(); };
  }, [user]);

  const saveTask = async (taskData, isEdit = false, taskId = null) => {
    const tasksRef = collection(db, 'artifacts', appId, 'public', 'data', 'vtrack_tasks');
    if (isEdit && taskId) {
      const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'vtrack_tasks', taskId);
      await updateDoc(docRef, { ...taskData, updatedAt: Date.now() });
    } else {
      await addDoc(tasksRef, { ...taskData, isDeleted: false, createdAt: Date.now() });
    }
  };

  const softDeleteTask = async (taskId, reason) => {
    const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'vtrack_tasks', taskId);
    await updateDoc(docRef, { isDeleted: true, deleteReason: reason, deletedAt: Date.now() });
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

  if (systemError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6 text-center">
        <div className="bg-white p-8 rounded-3xl shadow-xl border border-red-100 max-w-sm">
          <AlertCircle size={50} className="mx-auto mb-4 text-red-500" />
          <h2 className="text-xl font-bold text-gray-800 mb-2">เกิดข้อผิดพลาด</h2>
          <p className="text-sm text-gray-500">{systemError}</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="w-12 h-12 border-4 border-[#003366]/10 border-t-[#C5A059] rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="flex flex-col md:flex-row h-screen bg-[#FDFDFD] text-gray-900 font-sans">
      
      {/* Sidebar - Desktop */}
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
          <div className="pt-4 border-t border-white/5">
            <NavItem id="settings" icon={Settings} label="ตั้งค่าระบบ" active={activeTab} set={setActiveTab} open={isSidebarOpen}/>
          </div>
        </nav>
      </aside>

      {/* Main Container */}
      <main className="flex-1 flex flex-col h-full overflow-hidden relative">
        <header className="h-16 md:h-20 bg-white border-b border-gray-100 flex items-center justify-between px-6 sticky top-0 z-10">
          <h2 className="text-lg font-semibold text-[#003366] truncate">
            {activeTab === 'dashboard' && 'แดชบอร์ด'}
            {activeTab === 'add' && 'สร้างใบงานใหม่'}
            {activeTab === 'management' && 'รายการใบงาน'}
            {activeTab === 'calendar' && 'ตารางนัดหมาย'}
            {activeTab === 'settings' && 'การตั้งค่า'}
          </h2>
          <div className="flex items-center space-x-3">
            {isUnlocked && <button onClick={() => setIsUnlocked(false)} className="text-[10px] bg-red-50 text-red-500 px-2 py-1 rounded-md border border-red-100">LOCK</button>}
            <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-[#003366]"><User size={18}/></div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto pb-24 md:pb-8 p-4 md:p-8 custom-scrollbar">
          <div className="max-w-6xl mx-auto h-full">
            {['add', 'management', 'settings'].includes(activeTab) && !isUnlocked ? (
              <PinLock onUnlock={() => setIsUnlocked(true)} />
            ) : (
              <>
                {activeTab === 'dashboard' && <Dashboard tasks={tasks} settings={settings} />}
                {activeTab === 'add' && <TaskForm settings={settings} onSave={saveTask} onSuccess={() => setActiveTab('management')} />}
                {activeTab === 'management' && <Management tasks={tasks} settings={settings} onSave={saveTask} onDelete={softDeleteTask} />}
                {activeTab === 'calendar' && <CalendarView tasks={tasks} />}
                {activeTab === 'settings' && <SettingsPanel settings={settings} updateSettings={updateSettings} tasks={tasks} onSave={saveTask} onClear={clearAllData} />}
              </>
            )}
          </div>
        </div>

        {/* Mobile Bottom Nav */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 flex justify-around items-center h-16 z-30 shadow-lg">
          <MobileNavItem id="dashboard" icon={LayoutDashboard} label="แดชบอร์ด" active={activeTab} set={setActiveTab} />
          <MobileNavItem id="add" icon={PlusCircle} label="เพิ่ม" active={activeTab} set={setActiveTab} />
          <MobileNavItem id="management" icon={FileText} label="รายการ" active={activeTab} set={setActiveTab} />
          <MobileNavItem id="calendar" icon={CalendarIcon} label="ปฏิทิน" active={activeTab} set={setActiveTab} />
          <MobileNavItem id="settings" icon={Settings} label="ตั้งค่า" active={activeTab} set={setActiveTab} />
        </nav>
      </main>
    </div>
  );
}

// --- UI Sub-Components ---

function NavItem({ id, icon: Icon, label, active, set, open }) {
  const isAct = active === id;
  return (
    <button onClick={() => set(id)} className={`w-full flex items-center space-x-3 px-4 py-3 rounded-2xl transition-all ${isAct ? 'bg-[#C5A059] text-white shadow-lg' : 'text-white/60 hover:bg-white/5 hover:text-white'}`}>
      <Icon size={20} strokeWidth={isAct ? 2.5 : 2} />
      {open && <span className="text-sm font-medium">{label}</span>}
    </button>
  );
}

function MobileNavItem({ id, icon: Icon, label, active, set }) {
  const isAct = active === id;
  return (
    <button onClick={() => set(id)} className={`flex flex-col items-center justify-center flex-1 h-full ${isAct ? 'text-[#C5A059]' : 'text-gray-400'}`}>
      <Icon size={20} strokeWidth={isAct ? 2.5 : 2} />
      <span className="text-[10px] mt-1 font-medium">{label}</span>
    </button>
  );
}

function PinLock({ onUnlock }) {
  const [v, setV] = useState('');
  const sub = (e) => { e.preventDefault(); if (v === '1312') onUnlock(); else setV(''); };
  return (
    <div className="flex flex-col items-center pt-16 animate-in fade-in">
      <div className="bg-white p-8 rounded-[2rem] shadow-2xl border border-gray-100 w-full max-w-xs text-center">
        <h3 className="font-bold text-gray-800 mb-6">Admin Login</h3>
        <form onSubmit={sub}>
          <input type="password" value={v} onChange={e=>setV(e.target.value)} maxLength={4} placeholder="••••" className="w-full text-center text-3xl tracking-[0.5em] p-4 bg-gray-50 rounded-2xl mb-6 border-none focus:ring-2 focus:ring-[#C5A059]" autoFocus />
          <button type="submit" className="w-full bg-[#003366] text-white py-4 rounded-2xl font-bold shadow-lg">ยืนยันรหัส</button>
        </form>
      </div>
    </div>
  );
}

function Dashboard({ tasks, settings }) {
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [filterProj, setFilterProj] = useState('');
  const [filterComp, setFilterComp] = useState('');

  const availableMonths = useMemo(() => {
    const months = tasks.map(t => new Date(t.createdAt).toISOString().slice(0, 7));
    return [...new Set([new Date().toISOString().slice(0, 7), ...months])].sort().reverse();
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    return tasks.filter(t => {
      const tMonth = new Date(t.createdAt).toISOString().slice(0, 7);
      return !t.isDeleted && tMonth === selectedMonth && (filterProj ? t.project === filterProj : true) && (filterComp ? t.company === filterComp : true);
    });
  }, [tasks, selectedMonth, filterProj, filterComp]);

  const stats = STATUSES.map(s => {
    const count = filteredTasks.filter(t => t.status === s.name).length;
    const percent = filteredTasks.length > 0 ? Math.round((count / filteredTasks.length) * 100) : 0;
    return { ...s, count, percent };
  });

  const exportExcel = () => {
    if (!window.XLSX) return;
    const ws = window.XLSX.utils.json_to_sheet(tasks.filter(t => !t.isDeleted));
    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, "Tasks");
    window.XLSX.writeFile(wb, `VTrack_Backup_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const exportPDF = () => {
    const printContent = document.getElementById('report-section').innerHTML;
    const printWindow = window.open('', '', 'height=600,width=800');
    printWindow.document.write('<html><head><title>รายงานสรุปใบงาน</title>');
    printWindow.document.write('<link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">');
    printWindow.document.write('</head><body class="p-10">');
    printWindow.document.write(printContent);
    printWindow.document.write('</body></html>');
    printWindow.document.close();
    printWindow.print();
  };

  return (
    <div className="space-y-6 animate-in fade-in">
      {/* Filters & Actions */}
      <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">ประจำเดือน</label>
            <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className="w-full p-3 bg-gray-50 rounded-2xl border-none focus:ring-2 focus:ring-[#C5A059] text-sm">
              {availableMonths.map(m => <option key={m} value={m}>{new Intl.DateTimeFormat('th-TH', { month: 'long', year: 'numeric' }).format(new Date(m))}</option>)}
            </select>
          </div>
          <div className="space-y-1">
             <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">โครงการ</label>
             <select value={filterProj} onChange={e => setFilterProj(e.target.value)} className="w-full p-3 bg-gray-50 rounded-2xl border-none focus:ring-2 focus:ring-[#C5A059] text-sm">
               <option value="">ทุกโครงการ</option>
               {settings.projects.map(p => <option key={p} value={p}>{p}</option>)}
             </select>
          </div>
          <div className="space-y-1">
             <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">ร้านค้า</label>
             <select value={filterComp} onChange={e => setFilterComp(e.target.value)} className="w-full p-3 bg-gray-50 rounded-2xl border-none focus:ring-2 focus:ring-[#C5A059] text-sm">
               <option value="">ทุกร้านค้า</option>
               {settings.companies.map(c => <option key={c} value={c}>{c}</option>)}
             </select>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 pt-2">
          <button onClick={exportPDF} className="flex-1 flex items-center justify-center space-x-2 bg-[#003366] text-white py-3 px-4 rounded-2xl text-xs font-bold shadow-md"><Printer size={16}/><span>Export PDF</span></button>
          <button onClick={exportExcel} className="flex-1 flex items-center justify-center space-x-2 bg-[#10B981] text-white py-3 px-4 rounded-2xl text-xs font-bold shadow-md"><FileDown size={16}/><span>Export Excel</span></button>
        </div>
      </div>

      <div id="report-section" className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white p-8 rounded-[2rem] border border-gray-100 shadow-sm flex flex-col items-center text-center">
          <h4 className="w-full text-sm font-bold text-gray-400 mb-8 uppercase tracking-widest">สรุปภาพรวม</h4>
          <div className="relative w-44 h-44 mb-10 mx-auto">
            <svg viewBox="0 0 32 32" className="w-full h-full transform -rotate-90">
              <circle r="16" cx="16" cy="16" fill="transparent" stroke="#F8F9FA" strokeWidth="32" />
              {stats.reduce((acc, s) => {
                const dash = (s.count / (filteredTasks.length || 1)) * 100;
                const off = acc.off;
                acc.el.push(<circle key={s.id} r="16" cx="16" cy="16" fill="transparent" stroke={s.color} strokeWidth="32" strokeDasharray={`${dash} 100`} strokeDashoffset={`-${off}`} />);
                acc.off += dash;
                return acc;
              }, { el: [], off: 0 }).el}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-bold text-[#003366]">{filteredTasks.length}</span>
              <span className="text-[9px] font-bold text-gray-300 uppercase">รวมใบงาน</span>
            </div>
          </div>
          <div className="w-full space-y-2">
            {stats.filter(s => s.count > 0).map(s => (
              <div key={s.id} className="flex items-center justify-between text-[11px]">
                <div className="flex items-center space-x-2"><div className="w-2 h-2 rounded-full" style={{backgroundColor: s.color}}></div><span>{s.name}</span></div>
                <span className="font-bold">{s.count} ({s.percent}%)</span>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-2 bg-white rounded-[2rem] border border-gray-100 shadow-sm overflow-hidden flex flex-col">
          <div className="p-6 border-b border-gray-50 bg-gray-50/50 flex justify-between items-center">
            <h4 className="text-sm font-bold text-gray-400 uppercase tracking-widest">รายการใบงาน</h4>
          </div>
          <div className="flex-1 overflow-auto max-h-[400px]">
            {filteredTasks.length > 0 ? (
               <div className="divide-y divide-gray-50">
                 {filteredTasks.map(t => (
                    <div key={t.id} className="p-4 md:p-6 flex items-center justify-between">
                      <div className="flex flex-col min-w-0 mr-4 text-left">
                        <span className="font-bold text-[#003366] text-sm">{t.taskNo}</span>
                        <span className="text-[10px] text-gray-400 uppercase truncate">{t.project} | {t.company}</span>
                      </div>
                      <span className="px-2 py-1 rounded-full text-[9px] font-bold shrink-0" style={{backgroundColor: STATUSES.find(s=>s.name===t.status)?.bgColor, color: STATUSES.find(s=>s.name===t.status)?.color}}>{t.status}</span>
                    </div>
                 ))}
               </div>
            ) : <div className="p-20 text-center text-gray-300 text-xs">ไม่พบข้อมูลใบงานในเดือนนี้</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

function TaskForm({ settings, onSave, onSuccess, initialData = null, onCancel = null }) {
  const [d, setD] = useState(initialData || { taskNo: '', project: '', company: '', area: AREAS[0], status: STATUSES[0].name, aptDate: '', payDate: '', details: '' });
  const sub = async (e) => { e.preventDefault(); await onSave(d, !!initialData, initialData?.id); onSuccess(); };
  return (
    <form onSubmit={sub} className="bg-white p-6 md:p-10 rounded-[2.5rem] shadow-sm border border-gray-100 space-y-6 max-w-3xl mx-auto mb-20 text-left">
      <h3 className="font-bold text-xl mb-4 text-[#003366]">{initialData ? 'แก้ไขข้อมูล' : 'เพิ่มใบงานใหม่'}</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <Field label="เลขที่ใบงาน"><input required className="input-style" value={d.taskNo} onChange={e=>setD({...d, taskNo: e.target.value})}/></Field>
        <Field label="โครงการ"><select required className="input-style" value={d.project} onChange={e=>setD({...d, project: e.target.value})}><option value="">เลือกโครงการ</option>{settings.projects.map(p=><option key={p} value={p}>{p}</option>)}</select></Field>
        <Field label="บริษัท/ร้านค้า"><select required className="input-style" value={d.company} onChange={e=>setD({...d, company: e.target.value})}><option value="">เลือกร้านค้า</option>{settings.companies.map(c=><option key={c} value={c}>{c}</option>)}</select></Field>
        <Field label="พื้นที่"><select className="input-style" value={d.area} onChange={e=>setD({...d, area: e.target.value})}>{AREAS.map(a=><option key={a} value={a}>{a}</option>)}</select></Field>
        <div className="md:col-span-2"><Field label="สถานะ"><select className="input-style" value={d.status} onChange={e=>setD({...d, status: e.target.value})}>{STATUSES.map(s=><option key={s.id} value={s.name}>{s.name}</option>)}</select></Field></div>
        <Field label="วันนัดหมาย"><input type="date" className="input-style" value={d.aptDate} onChange={e=>setD({...d, aptDate: e.target.value})}/></Field>
        <Field label="วันทำจ่าย"><input type="date" className="input-style" value={d.payDate} onChange={e=>setD({...d, payDate: e.target.value})}/></Field>
        <div className="md:col-span-2">
          <Field label="รายละเอียด">
            <textarea rows="3" className="input-style" value={d.details} onChange={e=>setD({...d, details: e.target.value})}></textarea>
          </Field>
        </div>
      </div>
      <div className="flex justify-end gap-3 pt-4">
        {onCancel && <button type="button" onClick={onCancel} className="px-6 py-2 text-gray-400 font-bold">ยกเลิก</button>}
        <button type="submit" className="bg-[#003366] text-white px-10 py-3 rounded-2xl font-bold shadow-lg shadow-[#003366]/20">บันทึกข้อมูล</button>
      </div>
      <style>{`.input-style { @apply w-full p-4 bg-gray-50 rounded-2xl border-none focus:ring-1 focus:ring-[#C5A059] text-sm font-medium text-gray-700; }`}</style>
    </form>
  );
}

function Field({ label, children }) {
  return <div className="space-y-1"><label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">{label}</label>{children}</div>;
}

function Management({ tasks, settings, onSave, onDelete }) {
  const [edit, setEdit] = useState(null);
  const [search, setSearch] = useState('');
  const filtered = tasks.filter(t => !t.isDeleted && (t.taskNo.toLowerCase().includes(search.toLowerCase()) || t.project.toLowerCase().includes(search.toLowerCase())));

  if (edit) return <TaskForm settings={settings} initialData={edit} onSave={onSave} onSuccess={()=>setEdit(null)} onCancel={()=>setEdit(null)} />;

  return (
    <div className="space-y-6">
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex items-center relative">
        <Search size={18} className="absolute left-7 text-gray-300" />
        <input placeholder="ค้นหาเลขใบงาน หรือโครงการ..." className="w-full pl-12 pr-4 py-3 bg-gray-50 rounded-xl border-none text-sm" value={search} onChange={e=>setSearch(e.target.value)} />
      </div>
      <div className="bg-white rounded-[2rem] border border-gray-100 overflow-hidden shadow-sm">
        <div className="hidden md:block">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-[10px] uppercase font-bold text-gray-400 tracking-widest">
              <tr><th className="px-8 py-5">เลขที่ใบงาน</th><th className="px-8 py-5">โครงการ</th><th className="px-8 py-5 text-right">จัดการ</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(t=>(
                <tr key={t.id} className="hover:bg-gray-50">
                  <td className="px-8 py-6 font-bold text-[#003366]">{t.taskNo}</td>
                  <td className="px-8 py-6 text-gray-500">{t.project}</td>
                  <td className="px-8 py-6 text-right space-x-2">
                    <button onClick={()=>setEdit(t)} className="text-gray-300 hover:text-[#C5A059]"><Edit size={16}/></button>
                    <button onClick={()=>onDelete(t.id, 'User Delete')} className="text-gray-300 hover:text-red-500"><Trash2 size={16}/></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="md:hidden divide-y divide-gray-50 text-left">
          {filtered.map(t => (
            <div key={t.id} className="p-5 flex justify-between items-center">
              <div><p className="font-bold text-[#003366]">{t.taskNo}</p><p className="text-[10px] text-gray-400">{t.project}</p></div>
              <div className="flex space-x-2"><button onClick={()=>setEdit(t)} className="p-2 bg-gray-50 rounded-xl text-gray-400"><Edit size={16}/></button><button onClick={()=>onDelete(t.id, 'User Delete')} className="p-2 bg-red-50 rounded-xl text-red-300"><Trash2 size={16}/></button></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CalendarView({ tasks }) {
  const [now, setNow] = useState(new Date());
  const y = now.getFullYear(); const m = now.getMonth();
  const daysIn = new Date(y, m + 1, 0).getDate();
  const first = new Date(y, m, 1).getDay();
  const grid = [...Array(first).fill(null), ...Array(daysIn).keys()].map(i => i === null ? null : i + 1);

  return (
    <div className="bg-white p-6 md:p-10 rounded-[2.5rem] shadow-sm border border-gray-100">
      <div className="flex justify-between items-center mb-8 px-4">
        <button onClick={()=>setNow(new Date(y, m-1, 1))} className="p-2 hover:bg-gray-50 rounded-xl"><ChevronLeft/></button>
        <h4 className="font-bold text-[#003366]">{new Intl.DateTimeFormat('th-TH', { month: 'long', year: 'numeric' }).format(now)}</h4>
        <button onClick={()=>setNow(new Date(y, m+1, 1))} className="p-2 hover:bg-gray-50 rounded-xl"><ChevronRight/></button>
      </div>
      <div className="grid grid-cols-7 gap-px bg-gray-100 rounded-[1.5rem] overflow-hidden border border-gray-100">
        {['อา','จ','อ','พ','พฤ','ศ','ส'].map(d=><div key={d} className="bg-white p-3 text-center text-[10px] text-gray-300 font-bold uppercase">{d}</div>)}
        {grid.map((d, i) => {
          const dateStr = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
          const tks = tasks.filter(t => !t.isDeleted && t.aptDate === dateStr);
          return (
            <div key={i} className="bg-white min-h-[60px] md:min-h-[100px] p-2 text-left">
              {d && <div className="text-[10px] text-gray-300 mb-1">{d}</div>}
              {tks.map(t=><div key={t.id} className="text-[8px] bg-[#003366] text-white p-1 rounded mb-0.5 truncate">{t.taskNo}</div>)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SettingsPanel({ settings, updateSettings, tasks, onSave, onClear }) {
  const [p, setP] = useState(''); const [c, setC] = useState(''); const [st, setSt] = useState('');
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const handleAdd = (type) => {
    if (type === 'P') { if(!p) return; updateSettings({...settings, projects: [...settings.projects, p]}); setP(''); }
    else { if(!c) return; updateSettings({...settings, companies: [...settings.companies, c]}); setC(''); }
  };

  const handleImport = (e) => {
    const file = e.target.files[0]; if (!file || !window.Papa) return;
    setSt('กำลังนำเข้า...');
    window.Papa.parse(file, { header: true, complete: async (res) => {
      let count = 0; const newP = [...settings.projects]; const newC = [...settings.companies];
      for (const row of res.data) {
        const getV = (ks) => { const k = Object.keys(row).find(x => ks.includes(x.trim())); return k ? row[k].toString().trim() : ''; };
        const tNo = getV(['เลขที่ใบงาน', 'taskNo', 'เลขที่']); if (!tNo) continue;
        const tData = { taskNo: tNo, project: getV(['โครงการ', 'project']), company: getV(['บริษัท', 'company']), area: getV(['พื้นที่', 'area']) || AREAS[0], status: getV(['สถานะ', 'status']) || STATUSES[0].name, aptDate: getV(['วันนัดหมาย']), payDate: getV(['วันทำจ่าย']), details: getV(['รายละเอียด']) };
        if (tData.project && !newP.includes(tData.project)) newP.push(tData.project);
        if (tData.company && !newC.includes(tData.company)) newC.push(tData.company);
        const ex = tasks.find(t => t.taskNo === tNo && !t.isDeleted);
        await onSave(tData, !!ex, ex?.id); count++;
      }
      await updateSettings({ projects: newP, companies: newC }); setSt(`สำเร็จ ${count} รายการ`);
    }});
  };

  return (
    <div className="space-y-8 mb-20 animate-in fade-in text-left">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm">
          <h4 className="text-[10px] font-bold text-gray-400 mb-4 uppercase tracking-widest">โครงการ</h4>
          <div className="flex space-x-2 mb-4"><input className="flex-1 p-3 bg-gray-50 rounded-xl text-sm border-none focus:ring-1 focus:ring-[#C5A059]" value={p} onChange={e=>setP(e.target.value)} /><button onClick={()=>handleAdd('P')} className="bg-[#003366] text-white px-4 rounded-xl text-sm font-bold shadow-sm">เพิ่ม</button></div>
          <div className="space-y-1 max-h-40 overflow-auto">{settings.projects.map(item => <div key={item} className="p-2 bg-gray-50 rounded-lg flex justify-between text-xs font-medium"><span>{item}</span><button onClick={()=>updateSettings({...settings, projects: settings.projects.filter(x=>x!==item)})} className="text-red-300 hover:text-red-500"><X size={14}/></button></div>)}</div>
        </div>
        <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm">
          <h4 className="text-[10px] font-bold text-gray-400 mb-4 uppercase tracking-widest">ร้านค้า</h4>
          <div className="flex space-x-2 mb-4"><input className="flex-1 p-3 bg-gray-50 rounded-xl text-sm border-none focus:ring-1 focus:ring-[#C5A059]" value={c} onChange={e=>setC(e.target.value)} /><button onClick={()=>handleAdd('C')} className="bg-[#003366] text-white px-4 rounded-xl text-sm font-bold shadow-sm">เพิ่ม</button></div>
          <div className="space-y-1 max-h-40 overflow-auto">{settings.companies.map(item => <div key={item} className="p-2 bg-gray-50 rounded-lg flex justify-between text-xs font-medium"><span>{item}</span><button onClick={()=>updateSettings({...settings, companies: settings.companies.filter(x=>x!==item)})} className="text-red-300 hover:text-red-500"><X size={14}/></button></div>)}</div>
        </div>
      </div>

      <div className="bg-white p-8 rounded-[2rem] border border-gray-100 shadow-sm text-center">
        <h4 className="text-[10px] font-bold text-gray-400 mb-4 uppercase tracking-widest">นำเข้าข้อมูล (CSV)</h4>
        <div className="border-2 border-dashed border-gray-100 rounded-[2rem] p-10 hover:bg-gray-50 relative cursor-pointer group transition-all">
          <input type="file" accept=".csv" onChange={handleImport} className="absolute inset-0 opacity-0 cursor-pointer z-10" />
          <Upload size={32} className="mx-auto mb-2 text-gray-300 group-hover:text-[#C5A059]"/>
          <p className="text-sm text-gray-400 font-medium">คลิกเพื่อเลือกไฟล์ Backup (.csv)</p>
        </div>
        {st && <div className="mt-4 text-xs font-bold text-[#003366]">{st}</div>}
      </div>

      <div className="bg-red-50 p-8 rounded-[2rem] border border-red-100 shadow-sm text-center">
        <h4 className="text-[10px] font-bold text-red-400 mb-4 uppercase tracking-widest">Danger Zone</h4>
        <p className="text-xs text-red-600/60 mb-6 font-medium">ระวัง: การล้างข้อมูลจะลบใบงานทั้งหมดถาวร ไม่สามารถกู้คืนได้</p>
        <button onClick={() => setShowClearConfirm(true)} className="bg-red-500 text-white px-10 py-4 rounded-2xl font-bold shadow-lg shadow-red-500/20 hover:bg-red-600 transition-all flex items-center mx-auto">
          <Trash size={18} className="mr-2"/> ล้างข้อมูลใบงานทั้งหมด
        </button>

        {showClearConfirm && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-6">
            <div className="bg-white p-8 rounded-[2.5rem] max-w-sm w-full shadow-2xl animate-in zoom-in duration-300">
              <AlertCircle size={48} className="text-red-500 mx-auto mb-4" />
              <h3 className="font-bold text-gray-800 text-lg mb-2 text-center">ยืนยันการลบทั้งหมด?</h3>
              <p className="text-sm text-gray-500 mb-8 text-center">ข้อมูลใบงานทั้งหมดจะหายไป คุณแน่ใจหรือไม่?</p>
              <div className="flex gap-3">
                <button onClick={() => setShowClearConfirm(false)} className="flex-1 py-4 bg-gray-100 rounded-2xl font-bold text-gray-400">ยกเลิก</button>
                <button onClick={async () => { await onClear(); setShowClearConfirm(false); }} className="flex-1 py-4 bg-red-500 rounded-2xl font-bold text-white shadow-lg shadow-red-500/20">ลบทั้งหมด</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}