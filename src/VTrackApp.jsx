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
import { getFirestore, collection, doc, setDoc, onSnapshot, addDoc, updateDoc, deleteDoc, getDocs, query } from 'firebase/firestore';

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

  // Load external scripts (xlsx, papaparse)
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
        const def = { projects: ['โครงการ A'], companies: ['บริษัท ก'] };
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
    <div className="flex flex-col md:flex-row h-screen bg-[#FDFDFD] text-gray-900 font-sans overflow-hidden">
      
      {/* Sidebar - Desktop Only */}
      <aside className={`hidden md:flex ${isSidebarOpen ? 'w-64' : 'w-20'} flex-col bg-[#003366] text-white transition-all duration-300 relative overflow-hidden`}>
        <div className="h-20 flex items-center justify-between px-6 border-b border-white/5 shadow-sm">
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
        <header className="h-16 md:h-20 bg-white/90 backdrop-blur-md border-b border-gray-100 flex items-center justify-between px-6 sticky top-0 z-20">
          <h2 className="text-lg font-bold text-[#003366] truncate">
            {activeTab === 'dashboard' && 'แดชบอร์ด'}
            {activeTab === 'add' && 'สร้างใบงานใหม่'}
            {activeTab === 'management' && 'รายการใบงาน'}
            {activeTab === 'calendar' && 'ตารางนัดหมาย'}
            {activeTab === 'settings' && 'การตั้งค่า'}
          </h2>
          <div className="flex items-center space-x-3">
            {isUnlocked && <button onClick={() => setIsUnlocked(false)} className="text-[10px] bg-red-50 text-red-500 px-2 py-1 rounded-md border border-red-100 font-bold">LOCK</button>}
            <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-[#003366] border border-gray-200"><User size={18}/></div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto pb-24 md:pb-8 p-4 md:p-8 custom-scrollbar">
          <div className="max-w-6xl mx-auto">
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
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-gray-100 flex justify-around items-center h-16 z-30 shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
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
    <button onClick={() => set(id)} className={`w-full flex items-center space-x-3 px-4 py-3 rounded-2xl transition-all duration-300 ${isAct ? 'bg-[#C5A059] text-white shadow-lg' : 'text-white/60 hover:bg-white/5 hover:text-white'}`}>
      <Icon size={20} strokeWidth={isAct ? 2.5 : 2} />
      {open && <span className="text-sm font-semibold">{label}</span>}
    </button>
  );
}

function MobileNavItem({ id, icon: Icon, label, active, set }) {
  const isAct = active === id;
  return (
    <button onClick={() => set(id)} className={`flex flex-col items-center justify-center flex-1 h-full transition-colors ${isAct ? 'text-[#C5A059]' : 'text-gray-400'}`}>
      <Icon size={20} strokeWidth={isAct ? 2.5 : 2} />
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
          <input type="password" value={v} onChange={e=>setV(e.target.value)} maxLength={4} placeholder="••••" className="w-full text-center text-3xl tracking-[0.5em] p-4 bg-gray-50 rounded-2xl mb-8 border-none focus:ring-2 focus:ring-[#C5A059] transition-all" autoFocus />
          <button type="submit" className="w-full bg-[#003366] text-white py-4 rounded-2xl font-bold shadow-xl shadow-[#003366]/20 active:scale-95 transition-transform">ยืนยันรหัสผ่าน</button>
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
    const ws = window.XLSX.utils.json_to_sheet(tasks.filter(t => !t.isDeleted).map(t => ({
      'เลขที่ใบงาน': t.taskNo,
      'โครงการ': t.project,
      'บริษัท': t.company,
      'พื้นที่': t.area,
      'สถานะ': t.status,
      'นัดหมาย': t.aptDate,
      'วันทำจ่าย': t.payDate,
      'รายละเอียด': t.details
    })));
    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, "VTrack_Backup");
    window.XLSX.writeFile(wb, `VTrack_Backup_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const exportPDF = () => {
    window.print(); // Simple and clean print
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-700">
      {/* Filters & Actions */}
      <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1">
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
        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <button onClick={exportPDF} className="flex-1 flex items-center justify-center space-x-2 bg-[#003366] text-white py-3.5 px-6 rounded-2xl text-xs font-bold shadow-lg shadow-[#003366]/10 active:scale-95 transition-transform"><Printer size={16}/><span>พิมพ์รายงานสรุป (PDF)</span></button>
          <button onClick={exportExcel} className="flex-1 flex items-center justify-center space-x-2 bg-[#10B981] text-white py-3.5 px-6 rounded-2xl text-xs font-bold shadow-lg shadow-[#10B981]/10 active:scale-95 transition-transform"><FileDown size={16}/><span>ดาวน์โหลด Backup (Excel)</span></button>
        </div>
      </div>

      <div id="printable-report" className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Graph Card */}
        <div className="bg-white p-8 rounded-[2rem] border border-gray-100 shadow-sm flex flex-col items-center">
          <h4 className="w-full text-sm font-bold text-gray-400 mb-8 uppercase tracking-widest text-center">สัดส่วนสถานะงาน</h4>
          <div className="relative w-48 h-48 mb-10 mx-auto">
            <svg viewBox="0 0 32 32" className="w-full h-full transform -rotate-90">
              <circle r="16" cx="16" cy="16" fill="transparent" stroke="#F8F9FA" strokeWidth="32" />
              {stats.reduce((acc, s) => {
                const dash = (s.count / (filteredTasks.length || 1)) * 100;
                const off = acc.off;
                acc.el.push(<circle key={s.id} r="16" cx="16" cy="16" fill="transparent" stroke={s.color} strokeWidth="32" strokeDasharray={`${dash} 100`} strokeDashoffset={`-${off}`} className="transition-all duration-1000" />);
                acc.offset += dash;
                return acc;
              }, { el: [], offset: 0 }).el}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-4xl font-bold text-[#003366]">{filteredTasks.length}</span>
              <span className="text-[10px] font-bold text-gray-300 uppercase tracking-widest">ใบงาน</span>
            </div>
          </div>
          <div className="w-full space-y-3">
             <p className="text-[10px] font-bold text-gray-300 uppercase mb-2 tracking-tighter">ความหมายของสีสถานะ</p>
            {stats.filter(s => s.count > 0).map(s => (
              <div key={s.id} className="flex items-center justify-between text-[11px] font-medium text-gray-600">
                <div className="flex items-center space-x-2"><div className="w-2.5 h-2.5 rounded-full" style={{backgroundColor: s.color}}></div><span>{s.name}</span></div>
                <span className="font-bold text-[#003366]">{s.count} ({s.percent}%)</span>
              </div>
            ))}
          </div>
        </div>

        {/* Task Cards/Table List */}
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
               <div className="divide-y divide-gray-50">
                 {filteredTasks.map(t => (
                    <div key={t.id} className="p-5 md:p-6 flex items-center justify-between hover:bg-gray-50 transition-colors cursor-default">
                      <div className="flex flex-col min-w-0 mr-4">
                        <span className="font-bold text-[#003366] text-sm md:text-base">{t.taskNo}</span>
                        <div className="flex items-center space-x-2 mt-1">
                          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter truncate max-w-[80px] sm:max-w-none">{t.company}</span>
                          <span className="text-gray-200 text-[10px]">•</span>
                          <span className="text-[11px] text-gray-500 truncate">{t.project}</span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end shrink-0">
                         <StatusTag label={t.status} />
                         <span className="text-[10px] text-gray-300 mt-1 font-bold">{t.area}</span>
                      </div>
                    </div>
                 ))}
               </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center py-24 text-gray-300">
                <CalendarDays size={48} className="mb-3 opacity-10"/>
                <p className="text-sm font-bold">ไม่พบข้อมูลใบงานในเดือนนี้</p>
                <p className="text-[10px] mt-1 italic">เลือกเดือนอื่นๆ เพื่อตรวจสอบข้อมูลย้อนหลัง</p>
              </div>
            )}
          </div>
        </div>
      </div>
      
      <style>{`
        @media print {
          aside, nav, header, button, .no-print { display: none !important; }
          main { overflow: visible !important; height: auto !important; }
          .flex-1 { overflow: visible !important; }
          #printable-report { display: block !important; }
          #printable-report > div { border: none !important; box-shadow: none !important; width: 100% !important; margin-bottom: 20px; }
          body { background: white !important; font-size: 12pt; }
        }
      `}</style>
    </div>
  );
}

function TaskForm({ settings, onSave, onSuccess, initialData = null, onCancel = null }) {
  const [d, setD] = useState(initialData || { taskNo: '', project: '', company: '', area: AREAS[0], status: STATUSES[0].name, aptDate: '', payDate: '', details: '' });
  
  const sub = async (e) => { 
    e.preventDefault(); 
    await onSave(d, !!initialData, initialData?.id); 
    onSuccess(); 
  };

  return (
    <form onSubmit={sub} className="bg-white p-6 md:p-10 rounded-[2.5rem] shadow-sm border border-gray-100 space-y-6 max-w-3xl mx-auto mb-24 animate-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center space-x-4 mb-2">
        <div className="w-12 h-12 bg-[#003366] text-white rounded-2xl flex items-center justify-center shadow-lg shadow-[#003366]/20">
          {initialData ? <Edit size={24}/> : <PlusCircle size={24}/>}
        </div>
        <h3 className="font-bold text-2xl text-[#003366]">{initialData ? 'แก้ไขข้อมูลใบงาน' : 'เพิ่มใบงานใหม่'}</h3>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Field label="เลขที่ใบงาน">
          <input required className="input-style" value={d.taskNo} onChange={e=>setD({...d, taskNo: e.target.value})} placeholder="ระบุเลขที่ใบงาน..."/>
        </Field>
        
        <Field label="โครงการ">
          <select required className="input-style" value={d.project} onChange={e=>setD({...d, project: e.target.value})}>
            <option value="">เลือกโครงการ</option>
            {settings.projects.map(p=><option key={p} value={p}>{p}</option>)}
          </select>
        </Field>
        
        <Field label="บริษัท/ร้านค้า">
          <select required className="input-style" value={d.company} onChange={e=>setD({...d, company: e.target.value})}>
            <option value="">เลือกร้านค้า</option>
            {settings.companies.map(c=><option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        
        <Field label="พื้นที่">
          <select className="input-style" value={d.area} onChange={e=>setD({...d, area: e.target.value})}>
            {AREAS.map(a=><option key={a} value={a}>{a}</option>)}
          </select>
        </Field>
        
        <div className="md:col-span-2">
          <Field label="สถานะการดำเนินงาน">
            <select className="input-style" value={d.status} onChange={e=>setD({...d, status: e.target.value})}>
              {STATUSES.map(s=><option key={s.id} value={s.name}>{s.name}</option>)}
            </select>
          </Field>
        </div>
        
        <Field label="วันนัดหมายเข้างาน">
          <input type="date" className="input-style" value={d.aptDate} onChange={e=>setD({...d, aptDate: e.target.value})}/>
        </Field>
        
        <Field label="วันทำจ่าย">
          <input type="date" className="input-style" value={d.payDate} onChange={e=>setD({...d, payDate: e.target.value})}/>
        </Field>
        
        <div className="md:col-span-2">
          <Field label="รายละเอียดงาน">
            <textarea rows="4" className="input-style resize-none" value={d.details} onChange={e=>setD({...d, details: e.target.value})} placeholder="ระบุรายละเอียดเพิ่มเติม..."></textarea>
          </Field>
        </div>
      </div>
      
      <div className="flex flex-col sm:flex-row justify-end gap-3 pt-6">
        {onCancel && <button type="button" onClick={onCancel} className="px-8 py-4 rounded-2xl text-gray-400 font-bold hover:bg-gray-50 transition-colors order-2 sm:order-1">ยกเลิก</button>}
        <button type="submit" className="bg-[#003366] text-white px-12 py-4 rounded-2xl font-bold shadow-xl shadow-[#003366]/20 active:scale-95 transition-all order-1 sm:order-2">บันทึกข้อมูลใบงาน</button>
      </div>
      
      <style>{`
        .input-style { 
          @apply w-full p-4 bg-gray-50 rounded-2xl border-none focus:ring-2 focus:ring-[#C5A059] transition-all text-sm font-semibold text-gray-700 placeholder:text-gray-300; 
        }
      `}</style>
    </form>
  );
}

function Field({ label, children }) {
  return (
    <div className="space-y-2 text-left">
      <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">{label}</label>
      {children}
    </div>
  );
}

function Management({ tasks, settings, onSave, onDelete }) {
  const [edit, setEdit] = useState(null);
  const [search, setSearch] = useState('');
  
  const filtered = useMemo(() => {
    return tasks.filter(t => !t.isDeleted && (t.taskNo.toLowerCase().includes(search.toLowerCase()) || t.project.toLowerCase().includes(search.toLowerCase())));
  }, [tasks, search]);

  if (edit) return <TaskForm settings={settings} initialData={edit} onSave={onSave} onSuccess={()=>setEdit(null)} onCancel={()=>setEdit(null)} />;

  return (
    <div className="space-y-6 animate-in fade-in duration-500 mb-20">
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex items-center relative">
        <Search size={18} className="absolute left-7 text-gray-300" />
        <input placeholder="ค้นหาด้วยเลขที่ใบงาน หรือชื่อโครงการ..." className="w-full pl-14 pr-6 py-4 bg-gray-50 rounded-2xl border-none focus:ring-2 focus:ring-[#C5A059] text-sm font-semibold transition-all" value={search} onChange={e=>setSearch(e.target.value)} />
      </div>

      <div className="bg-white rounded-[2.5rem] shadow-sm border border-gray-100 overflow-hidden">
        {/* Table for Desktop */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-gray-400 text-[10px] uppercase font-bold tracking-widest border-b border-gray-100">
              <tr>
                <th className="px-8 py-6">เลขที่ใบงาน</th>
                <th className="px-8 py-6">โครงการ</th>
                <th className="px-8 py-6">รายละเอียด</th>
                <th className="px-8 py-6">สถานะ</th>
                <th className="px-8 py-6 text-right">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(t=>(
                <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-8 py-6 font-bold text-[#003366] whitespace-nowrap">{t.taskNo}</td>
                  <td className="px-8 py-6 text-gray-500 font-medium whitespace-nowrap">{t.project}</td>
                  <td className="px-8 py-6 text-gray-500 text-xs max-w-xs truncate" title={t.details}>{t.details || '-'}</td>
                  <td className="px-8 py-6 whitespace-nowrap"><StatusTag label={t.status}/></td>
                  <td className="px-8 py-6 text-right space-x-3 whitespace-nowrap">
                    <button onClick={()=>setEdit(t)} className="p-2 text-gray-300 hover:text-[#C5A059] transition-colors"><Edit size={18}/></button>
                    <button onClick={()=>{ if(window.confirm('ยืนยันการลบใบงานนี้?')) onDelete(t.id, 'User Delete') }} className="p-2 text-gray-300 hover:text-red-500 transition-colors"><Trash2 size={18}/></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Cards for Mobile */}
        <div className="md:hidden divide-y divide-gray-50 text-left">
          {filtered.map(t => (
            <div key={t.id} className="p-6 space-y-4">
              <div className="flex justify-between items-start">
                <div className="text-left min-w-0 pr-4">
                  <div className="text-base font-bold text-[#003366] truncate">{t.taskNo}</div>
                  <div className="text-[11px] font-bold text-gray-400 mt-1 uppercase tracking-tighter truncate">{t.project}</div>
                </div>
                <div className="shrink-0"><StatusTag label={t.status} /></div>
              </div>
              
              {t.details && (
                <div className="text-xs text-gray-500 bg-gray-50 p-3 rounded-xl line-clamp-2" title={t.details}>
                  {t.details}
                </div>
              )}
              
              <div className="flex justify-between items-center pt-2">
                <div className="text-[10px] text-gray-300 uppercase font-bold tracking-widest bg-gray-50 px-2 py-1 rounded-md">{t.area}</div>
                <div className="flex space-x-3">
                  <button onClick={()=>setEdit(t)} className="p-2.5 bg-gray-50 rounded-xl text-gray-400 active:scale-95 transition-transform"><Edit size={18}/></button>
                  <button onClick={()=>{ if(window.confirm('ยืนยันการลบใบงานนี้?')) onDelete(t.id, 'User Delete') }} className="p-2.5 bg-red-50 rounded-xl text-red-300 active:scale-95 transition-transform"><Trash2 size={18}/></button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="py-24 text-center text-gray-300">
            <FileText size={56} className="mx-auto mb-4 opacity-10"/>
            <p className="text-sm font-bold">ไม่พบข้อมูลที่ต้องการ</p>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusTag({ label }) {
  const s = STATUSES.find(x => x.name === label);
  return <span className="px-3 py-1 rounded-full text-[9px] font-bold whitespace-nowrap border border-white shadow-sm" style={{backgroundColor: s?.bgColor, color: s?.color}}>{label}</span>;
}

function CalendarView({ tasks }) {
  const [now, setNow] = useState(new Date());
  const y = now.getFullYear(); const m = now.getMonth();
  const daysIn = new Date(y, m + 1, 0).getDate();
  const first = new Date(y, m, 1).getDay();
  const grid = [...Array(first).fill(null), ...Array(daysIn).keys()].map(i => i === null ? null : i + 1);

  return (
    <div className="bg-white p-5 md:p-10 rounded-[2.5rem] shadow-sm border border-gray-100 animate-in fade-in duration-700 mb-20">
      <div className="flex justify-between items-center mb-8">
        <button onClick={()=>setNow(new Date(y, m-1, 1))} className="p-3 bg-gray-50 rounded-2xl text-gray-400 hover:bg-gray-100 transition-colors"><ChevronLeft size={18}/></button>
        <h4 className="font-bold text-[#003366] md:text-lg">{new Intl.DateTimeFormat('th-TH', { month: 'long', year: 'numeric' }).format(now)}</h4>
        <button onClick={()=>setNow(new Date(y, m+1, 1))} className="p-3 bg-gray-50 rounded-2xl text-gray-400 hover:bg-gray-100 transition-colors"><ChevronRight size={18}/></button>
      </div>
      <div className="grid grid-cols-7 gap-px bg-gray-100 rounded-[1.5rem] overflow-hidden border border-gray-100 shadow-inner">
        {['อา','จ','อ','พ','พฤ','ศ','ส'].map(d=><div key={d} className="bg-white p-3 text-center text-[10px] text-gray-300 font-bold uppercase">{d}</div>)}
        {grid.map((d, i) => {
          const dateStr = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
          const tks = tasks.filter(t => !t.isDeleted && t.aptDate === dateStr);
          const isToday = new Date().toISOString().split('T')[0] === dateStr;
          return (
            <div key={i} className={`bg-white min-h-[70px] md:min-h-[120px] p-1.5 md:p-3 transition-colors ${d ? 'hover:bg-gray-50/50' : 'bg-gray-50/20'}`}>
              {d && <div className={`text-[10px] md:text-xs mb-1 font-bold ${isToday ? 'text-[#C5A059]' : 'text-gray-300'}`}>{d}</div>}
              <div className="space-y-1">
                {tks.map(t=>(
                  <div key={t.id} className="text-[8px] bg-[#003366] text-white p-1 rounded-md truncate shadow-sm font-bold" title={t.taskNo}>{t.taskNo}</div>
                ))}
              </div>
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
    if (type === 'P') { 
      if(!p || settings.projects.includes(p)) return; 
      updateSettings({...settings, projects: [...settings.projects, p]}); 
      setP(''); 
    } else { 
      if(!c || settings.companies.includes(c)) return; 
      updateSettings({...settings, companies: [...settings.companies, c]}); 
      setC(''); 
    }
  };

  const handleImport = (e) => {
    const file = e.target.files[0]; 
    if (!file || !window.Papa) { setSt('Library Error: PapaParse not found'); return; }
    setSt('กำลังนำเข้าข้อมูล...');
    window.Papa.parse(file, { 
      header: true, 
      skipEmptyLines: true,
      complete: async (res) => {
        let count = 0; 
        const newP = [...settings.projects]; 
        const newC = [...settings.companies];
        
        for (const row of res.data) {
          const getV = (ks) => { 
            const k = Object.keys(row).find(x => ks.includes(x.trim())); 
            return k ? row[k].toString().trim() : ''; 
          };
          
          const tNo = getV(['เลขที่ใบงาน', 'taskNo', 'เลขที่', 'Task No']); 
          if (!tNo) continue;
          
          const tData = { 
            taskNo: tNo, 
            project: getV(['โครงการ', 'project', 'Project Name']), 
            company: getV(['บริษัท', 'company', 'ร้านค้า']), 
            area: getV(['พื้นที่', 'area']) || AREAS[0], 
            status: getV(['สถานะ', 'status']) || STATUSES[0].name, 
            aptDate: getV(['วันนัดหมาย', 'aptDate', 'Date']), 
            payDate: getV(['วันทำจ่าย', 'payDate']), 
            details: getV(['รายละเอียด', 'details', 'Description']) 
          };
          
          if (tData.project && !newP.includes(tData.project)) newP.push(tData.project);
          if (tData.company && !newC.includes(tData.company)) newC.push(tData.company);
          
          const ex = tasks.find(t => t.taskNo === tNo && !t.isDeleted);
          await onSave(tData, !!ex, ex?.id); 
          count++;
        }
        await updateSettings({ projects: newP, companies: newC }); 
        setSt(`นำเข้าสำเร็จ ${count} รายการ`);
      }
    });
  };

  return (
    <div className="space-y-8 mb-24 animate-in fade-in duration-500 text-left">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm flex flex-col">
          <h4 className="text-[10px] font-bold text-gray-400 mb-6 uppercase tracking-widest">จัดการรายชื่อโครงการ</h4>
          <div className="flex space-x-2 mb-6">
            <input className="flex-1 p-3.5 bg-gray-50 rounded-2xl text-sm font-semibold border-none focus:ring-1 focus:ring-[#C5A059]" value={p} onChange={e=>setP(e.target.value)} placeholder="ระบุโครงการ..."/>
            <button onClick={()=>handleAdd('P')} className="bg-[#003366] text-white px-6 rounded-2xl font-bold text-sm shadow-lg shadow-[#003366]/10">เพิ่ม</button>
          </div>
          <div className="space-y-1.5 max-h-60 overflow-auto pr-2 custom-scrollbar">
            {settings.projects.map(item => (
              <div key={item} className="p-3 bg-gray-50 rounded-xl flex justify-between items-center text-xs font-bold group">
                <span className="text-gray-700">{item}</span>
                <button onClick={()=>updateSettings({...settings, projects: settings.projects.filter(x=>x!==item)})} className="text-red-300 hover:text-red-500 transition-colors"><X size={14}/></button>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm flex flex-col">
          <h4 className="text-[10px] font-bold text-gray-400 mb-6 uppercase tracking-widest">จัดการรายชื่อร้านค้า</h4>
          <div className="flex space-x-2 mb-6">
            <input className="flex-1 p-3.5 bg-gray-50 rounded-2xl text-sm font-semibold border-none focus:ring-1 focus:ring-[#C5A059]" value={c} onChange={e=>setC(e.target.value)} placeholder="ระบุร้านค้า..."/>
            <button onClick={()=>handleAdd('C')} className="bg-[#003366] text-white px-6 rounded-2xl font-bold text-sm shadow-lg shadow-[#003366]/10">เพิ่ม</button>
          </div>
          <div className="space-y-1.5 max-h-60 overflow-auto pr-2 custom-scrollbar">
            {settings.companies.map(item => (
              <div key={item} className="p-3 bg-gray-50 rounded-xl flex justify-between items-center text-xs font-bold group">
                <span className="text-gray-700">{item}</span>
                <button onClick={()=>updateSettings({...settings, companies: settings.companies.filter(x=>x!==item)})} className="text-red-300 hover:text-red-500 transition-colors"><X size={14}/></button>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white p-10 rounded-[2.5rem] border border-gray-100 shadow-sm text-center">
        <h4 className="text-[10px] font-bold text-gray-400 mb-8 uppercase tracking-widest">นำเข้าข้อมูลเก่าจากไฟล์ CSV</h4>
        <div className="border-2 border-dashed border-gray-100 rounded-[2rem] p-12 hover:bg-gray-50 relative cursor-pointer group transition-all">
          <input type="file" accept=".csv" onChange={handleImport} className="absolute inset-0 opacity-0 cursor-pointer z-10" />
          <Upload size={40} className="mx-auto mb-4 text-gray-200 group-hover:text-[#C5A059] group-hover:scale-110 transition-all"/>
          <p className="text-sm font-bold text-gray-500">คลิกที่นี่เพื่อเลือกไฟล์ CSV หรือลากไฟล์มาวาง</p>
          <p className="text-[10px] text-gray-300 mt-2 font-medium">ระบบจะรองรับการนำเข้าข้อมูลเดิมโดยระบุเลขที่ใบงานเดิมเพื่อป้องกันข้อมูลซ้ำ</p>
        </div>
        {st && <div className="mt-6 p-4 bg-[#003366]/5 text-[#003366] text-xs font-bold rounded-2xl animate-pulse border border-[#003366]/10">{st}</div>}
      </div>

      {/* Danger Zone */}
      <div className="bg-red-50 p-10 rounded-[2.5rem] border border-red-100 shadow-sm text-center">
        <h4 className="text-[10px] font-bold text-red-400 mb-4 uppercase tracking-widest">พื้นที่อันตราย (Danger Zone)</h4>
        <p className="text-xs text-red-600/60 mb-8 font-bold">การล้างข้อมูลจะลบใบงานทั้งหมดออกจากฐานข้อมูลอย่างถาวรและไม่สามารถกู้คืนได้</p>
        <button onClick={() => setShowClearConfirm(true)} className="bg-red-500 text-white px-12 py-4 rounded-2xl font-bold shadow-xl shadow-red-500/20 hover:bg-red-600 active:scale-95 transition-all flex items-center mx-auto">
          <Trash size={18} className="mr-2"/> ล้างฐานข้อมูลใบงานทั้งหมด
        </button>

        {showClearConfirm && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-50 p-6">
            <div className="bg-white p-10 rounded-[3rem] max-w-sm w-full shadow-2xl animate-in zoom-in duration-300 text-center">
              <div className="w-20 h-20 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6"><AlertCircle size={40} /></div>
              <h3 className="font-bold text-gray-800 text-2xl mb-2">ยืนยันการล้างข้อมูล?</h3>
              <p className="text-sm text-gray-500 mb-10 font-medium leading-relaxed">ใบงานทั้งหมดจะหายไปและไม่สามารถนำกลับมาได้อีก คุณแน่ใจแล้วหรือไม่?</p>
              <div className="flex gap-4">
                <button onClick={() => setShowClearConfirm(false)} className="flex-1 py-4 bg-gray-100 rounded-2xl font-bold text-gray-400 hover:bg-gray-200 transition-colors">ยกเลิก</button>
                <button onClick={async () => { await onClear(); setShowClearConfirm(false); }} className="flex-1 py-4 bg-red-500 rounded-2xl font-bold text-white shadow-xl shadow-red-500/20 hover:bg-red-600 transition-colors">ลบทั้งหมด</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}