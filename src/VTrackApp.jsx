/* eslint-disable */
import React, { useState, useEffect, useMemo } from 'react';
import { 
  LayoutDashboard, FileText, Settings, Calendar as CalendarIcon, PlusCircle, 
  Upload, Search, Edit, Trash2, X, AlertCircle, Menu, ChevronLeft, ChevronRight, 
  User, Filter, CalendarDays, FileDown, Printer, Trash
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

const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : userFirebaseConfig;
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'v-track-system';

// =====================================================================
// 🔴 จุดใส่ Webhook Google Apps Script 🔴
// ให้นำ URL ที่ได้จาก Google Sheet มาใส่ในเครื่องหมายคำพูดด้านล่างนี้
// =====================================================================
const GOOGLE_SHEETS_WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbz2DN-XH3p30nbHo86YxagcVVYdW-E9wWmxC6HuztvCRAlKVXdG9QsgIsfEZr8IE4BZAA/exec'; 


// --- Constants & Helpers ---
const AREAS = ['รังสิต', 'ร่มเกล้า', 'พระราม 9', 'รามอินทรา'];

const STATUSES = [
  { id: 1, name: 'รอใบเสนอราคา', color: '#94A3B8', bgColor: '#F1F5F9' },
  { id: 2, name: 'อยู่ระหว่างตรวจสอบใบเสนอราคา', color: '#F59E0B', bgColor: '#FEF3C7' },
  { id: 3, name: 'เปิดใบงานในระบบแล้ว', color: '#3B82F6', bgColor: '#DBEAFE' },
  { id: 4, name: 'จบงานและรอรับเอกสารวางบิล', color: '#A855F7', bgColor: '#F3E8FF' },
  { id: 5, name: 'ได้รับเอกสารวางบิลแล้ว', color: '#EC4899', bgColor: '#FCE7F3' },
  { id: 6, name: 'ส่งเอกสารเบิกจ่ายแล้ว', color: '#10B981', bgColor: '#D1FAE5' }
];

const isOverdue = (dateString) => {
  if (!dateString) return false;
  const taskDate = new Date(dateString);
  taskDate.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return taskDate < today;
};

// ฟังก์ชันเซฟวันที่ให้ปลอดภัย (แก้ปัญหาจอดับ)
const getMonthStr = (timestamp) => {
  if (!timestamp) return '';
  try { return new Date(timestamp).toISOString().slice(0, 7); } catch { return ''; }
};

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

  useEffect(() => {
    const loadScript = (id, src) => {
      if (!document.getElementById(id)) {
        const s = document.createElement('script'); s.id = id; s.src = src; document.body.appendChild(s);
      }
    };
    loadScript('papaparse-script', 'https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.3.2/papaparse.min.js');
    loadScript('xlsx-script', 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');
  }, []);

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
    }, (err) => { setSystemError("Permission Denied"); setLoading(false); });

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
    
    // ส่งข้อมูลไป Google Sheet หากมีการตั้ง URL ไว้
    if (GOOGLE_SHEETS_WEBHOOK_URL) {
      try {
        await fetch(GOOGLE_SHEETS_WEBHOOK_URL, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...taskData, action: isEdit ? 'edit' : 'add', id: taskId })
        });
      } catch (e) { console.error('Webhook Error:', e); }
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

  if (systemError) return <div className="p-8 text-center text-red-500 font-bold">{systemError}</div>;
  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="w-12 h-12 border-4 border-[#003366]/10 border-t-[#C5A059] rounded-full animate-spin"></div></div>;

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
                {activeTab === 'dashboard' && <Dashboard tasks={tasks} settings={settings} />}
                {activeTab === 'add' && <TaskForm settings={settings} onSave={saveTask} onSuccess={() => setActiveTab('management')} />}
                {activeTab === 'management' && <Management tasks={tasks} settings={settings} onSave={saveTask} onDelete={softDeleteTask} />}
                {activeTab === 'calendar' && <CalendarView tasks={tasks} settings={settings} onSave={saveTask} />}
                {activeTab === 'settings' && <SettingsPanel settings={settings} updateSettings={updateSettings} tasks={tasks} onSave={saveTask} onClear={clearAllData} />}
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

function Dashboard({ tasks, settings }) {
  const availableMonths = useMemo(() => {
    const months = tasks.map(t => getMonthStr(t.createdAt)).filter(m => m !== '');
    return [...new Set([new Date().toISOString().slice(0, 7), ...months])].sort().reverse();
  }, [tasks]);

  const [selectedMonth, setSelectedMonth] = useState(availableMonths[0] || new Date().toISOString().slice(0, 7));
  const [filterProj, setFilterProj] = useState('');
  const [filterComp, setFilterComp] = useState('');

  const filteredTasks = useMemo(() => {
    return tasks.filter(t => {
      const tMonth = getMonthStr(t.createdAt);
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
            <h4 className="text-sm font-bold text-gray-400 uppercase tracking-widest">รายการใบงาน</h4>
            <span className="text-[10px] bg-white px-4 py-1.5 rounded-full border border-gray-100 text-gray-500 font-bold shadow-sm">{filteredTasks.length} รายการ</span>
          </div>
          <div className="flex-1 overflow-auto max-h-[500px]">
            {filteredTasks.length > 0 ? (
               <div className="divide-y divide-gray-50">
                 {filteredTasks.map(t => (
                    <div key={t.id} className="p-5 flex items-center justify-between hover:bg-gray-50 text-left">
                      <div className="flex flex-col min-w-0 mr-4">
                        <div className="flex items-center space-x-2">
                          <span className="font-bold text-[#003366] text-sm md:text-base">{t.taskNo}</span>
                          {isOverdue(t.aptDate) && <span className="bg-red-100 text-red-600 text-[9px] px-2 py-0.5 rounded-md font-bold">งานเกินกำหนด</span>}
                        </div>
                        <span className="text-[11px] text-gray-500 mt-1">{t.project} • {t.company}</span>
                        {t.status === 'จบงานและรอรับเอกสารวางบิล' && (
                          <span className="text-[10px] text-orange-500 font-bold mt-1.5">* กรุณาส่งเอกสารวางบิลภายในวันที่ 15</span>
                        )}
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
                <p className="text-sm font-bold">ไม่พบข้อมูลใบงาน</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function TaskForm({ settings, onSave, onSuccess, initialData = null, onCancel = null, isModal = false }) {
  const [d, setD] = useState(initialData || { taskNo: '', project: '', company: '', area: AREAS[0], status: STATUSES[0].name, aptDate: '', payDate: '', details: '' });
  const sub = async (e) => { e.preventDefault(); await onSave(d, !!initialData, initialData?.id); onSuccess(); };

  return (
    <form onSubmit={sub} className={`bg-white p-6 md:p-10 rounded-[2.5rem] shadow-sm border border-gray-100 space-y-6 w-full max-w-3xl mx-auto ${isModal ? '' : 'mb-24'}`}>
      <div className="flex items-center space-x-4 mb-2">
        <div className="w-12 h-12 bg-[#003366] text-white rounded-2xl flex items-center justify-center shrink-0">
          {initialData ? <Edit size={24}/> : <PlusCircle size={24}/>}
        </div>
        <h3 className="font-bold text-xl md:text-2xl text-[#003366] text-left">{initialData ? 'แก้ไขข้อมูลใบงาน' : 'เพิ่มใบงานใหม่'}</h3>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Field label="เลขที่ใบงาน"><input required className="w-full p-4 bg-gray-50 rounded-2xl focus:ring-2 focus:ring-[#C5A059] text-sm" value={d.taskNo} onChange={e=>setD({...d, taskNo: e.target.value})}/></Field>
        <Field label="โครงการ"><select required className="w-full p-4 bg-gray-50 rounded-2xl focus:ring-2 focus:ring-[#C5A059] text-sm" value={d.project} onChange={e=>setD({...d, project: e.target.value})}><option value="">เลือกโครงการ</option>{settings.projects.map(p=><option key={p} value={p}>{p}</option>)}</select></Field>
        <Field label="บริษัท/ร้านค้า"><select required className="w-full p-4 bg-gray-50 rounded-2xl focus:ring-2 focus:ring-[#C5A059] text-sm" value={d.company} onChange={e=>setD({...d, company: e.target.value})}><option value="">เลือกร้านค้า</option>{settings.companies.map(c=><option key={c} value={c}>{c}</option>)}</select></Field>
        <Field label="พื้นที่"><select className="w-full p-4 bg-gray-50 rounded-2xl focus:ring-2 focus:ring-[#C5A059] text-sm" value={d.area} onChange={e=>setD({...d, area: e.target.value})}>{AREAS.map(a=><option key={a} value={a}>{a}</option>)}</select></Field>
        <div className="md:col-span-2"><Field label="สถานะการดำเนินงาน"><select className="w-full p-4 bg-gray-50 rounded-2xl focus:ring-2 focus:ring-[#C5A059] text-sm" value={d.status} onChange={e=>setD({...d, status: e.target.value})}>{STATUSES.map(s=><option key={s.id} value={s.name}>{s.name}</option>)}</select></Field></div>
        <Field label="วันนัดหมาย"><input type="date" className="w-full p-4 bg-gray-50 rounded-2xl focus:ring-2 focus:ring-[#C5A059] text-sm" value={d.aptDate} onChange={e=>setD({...d, aptDate: e.target.value})}/></Field>
        <Field label="วันทำจ่าย"><input type="date" className="w-full p-4 bg-gray-50 rounded-2xl focus:ring-2 focus:ring-[#C5A059] text-sm" value={d.payDate} onChange={e=>setD({...d, payDate: e.target.value})}/></Field>
        <div className="md:col-span-2"><Field label="รายละเอียด"><textarea rows="3" className="w-full p-4 bg-gray-50 rounded-2xl focus:ring-2 focus:ring-[#C5A059] text-sm" value={d.details} onChange={e=>setD({...d, details: e.target.value})}></textarea></Field></div>
      </div>
      
      <div className="flex flex-col sm:flex-row justify-end gap-3 pt-6">
        {onCancel && <button type="button" onClick={onCancel} className="px-8 py-4 rounded-2xl text-gray-400 font-bold hover:bg-gray-50 order-2 sm:order-1">ยกเลิก</button>}
        <button type="submit" className="bg-[#003366] text-white px-12 py-4 rounded-2xl font-bold order-1 sm:order-2">บันทึกข้อมูล</button>
      </div>
    </form>
  );
}

function Field({ label, children }) {
  return <div className="space-y-2 text-left"><label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest">{label}</label>{children}</div>;
}

function Management({ tasks, settings, onSave, onDelete }) {
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
    const months = tasks.map(t => getMonthStr(t.createdAt)).filter(m => m !== '');
    return [...new Set(months)].sort().reverse();
  }, [tasks]);
  
  const filtered = useMemo(() => {
    return tasks.filter(t => {
      if (t.isDeleted) return false;
      const matchSearch = search === '' || t.taskNo.toLowerCase().includes(search.toLowerCase()) || t.project.toLowerCase().includes(search.toLowerCase());
      const tMonth = getMonthStr(t.createdAt);
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
                <th className="w-3/12 px-6 py-5">โครงการ</th>
                <th className="w-3/12 px-6 py-5">รายละเอียด</th>
                <th className="w-2/12 px-6 py-5 text-center">สถานะ</th>
                <th className="w-2/12 px-6 py-5 text-center">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {currentItems.map(t=>(
                <tr key={t.id} className="hover:bg-gray-50">
                  <td className="px-6 py-5 font-bold text-[#003366] truncate pr-2">
                    <span className="block truncate">{t.taskNo}</span>
                    {isOverdue(t.aptDate) && <span className="bg-red-100 text-red-600 text-[9px] px-2 py-0.5 rounded-md mt-1 w-max block">เกินกำหนด</span>}
                    {t.status === 'จบงานและรอรับเอกสารวางบิล' && <span className="text-[9px] text-orange-500 mt-1 block">* วางบิลก่อน 15</span>}
                  </td>
                  <td className="px-6 py-5 text-gray-500 truncate pr-2" title={t.project}>{t.project}</td>
                  <td className="px-6 py-5 text-gray-500 text-xs truncate pr-2" title={t.details}>{t.details || '-'}</td>
                  <td className="px-6 py-5 text-center"><StatusTag label={t.status}/></td>
                  <td className="px-6 py-5 text-center space-x-2">
                    <button onClick={()=>setEdit(t)} className="p-2 text-gray-400 hover:text-[#C5A059]"><Edit size={18}/></button>
                    <button onClick={()=>{ if(window.confirm('ลบใบงาน?')) onDelete(t.id, 'User Delete') }} className="p-2 text-gray-400 hover:text-red-500"><Trash2 size={18}/></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile View */}
        <div className="md:hidden divide-y divide-gray-50 text-left">
          {currentItems.map(t => (
            <div key={t.id} className="p-6">
              <div className="flex justify-between items-start mb-2">
                <div className="text-left min-w-0 pr-4">
                  <div className="text-base font-bold text-[#003366] truncate">{t.taskNo}</div>
                  <div className="text-[11px] text-gray-400 truncate">{t.project}</div>
                </div>
                <div className="shrink-0"><StatusTag label={t.status} /></div>
              </div>
              {t.details && <div className="text-xs text-gray-500 bg-gray-50 p-3 rounded-xl line-clamp-2 my-2">{t.details}</div>}
              <div className="flex justify-between items-center mt-3">
                <div className="text-[10px] text-gray-300 uppercase font-bold bg-gray-50 px-2 py-1 rounded-md">{t.area}</div>
                <div className="flex space-x-3">
                  <button onClick={()=>setEdit(t)} className="p-2 text-gray-400"><Edit size={18}/></button>
                  <button onClick={()=>{ if(window.confirm('ลบใบงาน?')) onDelete(t.id, 'User Delete') }} className="p-2 text-red-300"><Trash2 size={18}/></button>
                </div>
              </div>
            </div>
          ))}
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
  return <span className="px-3 py-1 rounded-full text-[9px] font-bold whitespace-nowrap" style={{backgroundColor: s?.bgColor, color: s?.color}}>{label}</span>;
}

function CalendarView({ tasks, settings, onSave }) {
  const [now, setNow] = useState(new Date());
  const [selectedDayTasks, setSelectedDayTasks] = useState(null);
  const [editTask, setEditTask] = useState(null);
  
  const y = now.getFullYear(); const m = now.getMonth();
  const daysIn = new Date(y, m + 1, 0).getDate();
  const first = new Date(y, m, 1).getDay();
  const grid = [...Array(first).fill(null), ...Array(daysIn).keys()].map(i => i === null ? null : i + 1);

  return (
    <div className="bg-white p-5 md:p-10 rounded-[2.5rem] shadow-sm border border-gray-100 animate-in fade-in duration-700 mb-20 relative">
      <div className="flex justify-between items-center mb-8">
        <button onClick={()=>setNow(new Date(y, m-1, 1))} className="p-3 bg-gray-50 rounded-2xl text-gray-400 hover:bg-gray-100"><ChevronLeft size={18}/></button>
        <h4 className="font-bold text-[#003366] md:text-lg">{new Intl.DateTimeFormat('th-TH', { month: 'long', year: 'numeric' }).format(now)}</h4>
        <button onClick={()=>setNow(new Date(y, m+1, 1))} className="p-3 bg-gray-50 rounded-2xl text-gray-400 hover:bg-gray-100"><ChevronRight size={18}/></button>
      </div>
      <div className="grid grid-cols-7 gap-px bg-gray-100 rounded-[1.5rem] overflow-hidden border border-gray-100">
        {['อา','จ','อ','พ','พฤ','ศ','ส'].map(d=><div key={d} className="bg-white p-3 text-center text-[10px] text-gray-300 font-bold uppercase">{d}</div>)}
        {grid.map((d, i) => {
          const dateStr = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
          const tks = tasks.filter(t => !t.isDeleted && t.aptDate === dateStr);
          return (
            <div key={i} onClick={() => d && setSelectedDayTasks({ date: dateStr, displayDate: d, tks })} className={`bg-white min-h-[70px] md:min-h-[120px] p-1.5 md:p-3 text-left ${d ? 'cursor-pointer hover:bg-gray-50/80' : 'bg-gray-50/20'}`}>
              {d && <div className={`text-[10px] md:text-xs mb-1 font-bold`}>{d}</div>}
              <div className="space-y-1">
                {tks.slice(0, 3).map(t=>(<div key={t.id} className={`text-[8px] text-white p-1 rounded-md truncate font-bold ${isOverdue(t.aptDate) ? 'bg-red-500' : 'bg-[#003366]'}`}>{t.taskNo}</div>))}
                {tks.length > 3 && <div className="text-[9px] text-gray-400 font-bold text-center mt-1">+{tks.length - 3}</div>}
              </div>
            </div>
          );
        })}
      </div>

      {selectedDayTasks && !editTask && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white p-6 md:p-8 rounded-[2rem] w-full max-w-md shadow-2xl">
            <div className="flex justify-between items-center mb-6">
               <h3 className="font-bold text-xl text-[#003366]">วันที่ {selectedDayTasks.displayDate} {new Intl.DateTimeFormat('th-TH', { month: 'long' }).format(now)}</h3>
               <button onClick={() => setSelectedDayTasks(null)} className="p-2 bg-gray-50 rounded-full text-gray-400"><X size={18}/></button>
            </div>
            <div className="space-y-4 max-h-[60vh] overflow-y-auto text-left">
               {selectedDayTasks.tks.length > 0 ? selectedDayTasks.tks.map(t => (
                  <div key={t.id} className="p-5 border border-gray-100 rounded-2xl bg-gray-50/50">
                     <span className="font-bold text-[#003366] text-lg">{t.taskNo}</span>
                     <div className="text-[10px] text-gray-400 font-bold uppercase mt-1">{t.project}</div>
                     <div className="mb-4 mt-2"><StatusTag label={t.status} /></div>
                     <button onClick={() => { setEditTask(t); setSelectedDayTasks(null); }} className="w-full py-2 bg-white border border-gray-200 rounded-xl text-xs font-bold text-[#C5A059]">ดูรายละเอียด</button>
                  </div>
               )) : (<div className="text-center text-gray-400 py-10"><p className="text-sm font-bold">ไม่มีรายการนัดหมาย</p></div>)}
            </div>
          </div>
        </div>
      )}

      {editTask && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-start justify-center z-[70] p-4 overflow-y-auto">
          <div className="relative w-full max-w-3xl my-auto">
            <button onClick={() => setEditTask(null)} className="absolute top-6 right-6 z-10 p-2 bg-gray-100 rounded-full"><X size={20}/></button>
            <TaskForm settings={settings} initialData={editTask} onSave={onSave} onSuccess={() => setEditTask(null)} onCancel={() => setEditTask(null)} isModal={true} />
          </div>
        </div>
      )}
    </div>
  );
}

function SettingsPanel({ settings, updateSettings, tasks, onSave, onClear }) {
  const [p, setP] = useState(''); const [c, setC] = useState(''); const [st, setSt] = useState('');
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const handleAdd = (type) => {
    if (type === 'P' && p && !settings.projects.includes(p)) { updateSettings({...settings, projects: [...settings.projects, p]}); setP(''); } 
    else if (type === 'C' && c && !settings.companies.includes(c)) { updateSettings({...settings, companies: [...settings.companies, c]}); setC(''); }
  };

  return (
    <div className="space-y-8 mb-24 animate-in fade-in text-left">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm flex flex-col">
          <h4 className="text-[10px] font-bold text-gray-400 mb-6 uppercase tracking-widest">จัดการรายชื่อโครงการ</h4>
          <div className="flex space-x-2 mb-6"><input className="flex-1 p-3.5 bg-gray-50 rounded-2xl text-sm" value={p} onChange={e=>setP(e.target.value)}/><button onClick={()=>handleAdd('P')} className="bg-[#003366] text-white px-6 rounded-2xl text-sm">เพิ่ม</button></div>
          <div className="space-y-1.5 max-h-60 overflow-auto">{settings.projects.map(item => (<div key={item} className="p-3 bg-gray-50 rounded-xl flex justify-between"><span className="text-xs font-bold text-gray-700">{item}</span><button onClick={()=>updateSettings({...settings, projects: settings.projects.filter(x=>x!==item)})} className="text-red-300"><X size={14}/></button></div>))}</div>
        </div>
        <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm flex flex-col">
          <h4 className="text-[10px] font-bold text-gray-400 mb-6 uppercase tracking-widest">จัดการรายชื่อร้านค้า</h4>
          <div className="flex space-x-2 mb-6"><input className="flex-1 p-3.5 bg-gray-50 rounded-2xl text-sm" value={c} onChange={e=>setC(e.target.value)}/><button onClick={()=>handleAdd('C')} className="bg-[#003366] text-white px-6 rounded-2xl text-sm">เพิ่ม</button></div>
          <div className="space-y-1.5 max-h-60 overflow-auto">{settings.companies.map(item => (<div key={item} className="p-3 bg-gray-50 rounded-xl flex justify-between"><span className="text-xs font-bold text-gray-700">{item}</span><button onClick={()=>updateSettings({...settings, companies: settings.companies.filter(x=>x!==item)})} className="text-red-300"><X size={14}/></button></div>))}</div>
        </div>
      </div>

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
    </div>
  );
}