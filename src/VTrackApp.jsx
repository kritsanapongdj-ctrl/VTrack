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
// --- Webhook สำหรับ Google Sheets ---
const GOOGLE_SHEETS_WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbz2DN-XH3p30nbHo86YxagcVVYdW-E9wWmxC6HuztvCRAlKVXdG9QsgIsfEZr8IE4BZAA/exec';
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

// --- Constants ---
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
    const unsubscribe = onAuthStateChanged(auth, setUser);
    signInAnonymously(auth).catch(e => setSystemError("Auth Failed"));
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    const tasksRef = collection(db, 'artifacts', appId, 'public', 'data', 'vtrack_tasks');
    const settingsRef = doc(db, 'artifacts', appId, 'public', 'data', 'vtrack_settings', 'general');

    onSnapshot(settingsRef, (docSnap) => {
      if (docSnap.exists()) setSettings(docSnap.data());
    });

    onSnapshot(tasksRef, (snapshot) => {
      const data = [];
      snapshot.forEach((doc) => data.push({ id: doc.id, ...doc.data() }));
      data.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setTasks(data);
      setLoading(false);
    });
  }, [user]);

  const saveTask = async (taskData, isEdit = false, taskId = null) => {
    const tasksRef = collection(db, 'artifacts', appId, 'public', 'data', 'vtrack_tasks');
    if (isEdit && taskId) {
      await updateDoc(doc(tasksRef, taskId), { ...taskData, updatedAt: Date.now() });
    } else {
      await addDoc(tasksRef, { ...taskData, isDeleted: false, createdAt: Date.now() });
    }
  };

  const softDeleteTask = async (taskId, reason) => {
    await updateDoc(doc(collection(db, 'artifacts', appId, 'public', 'data', 'vtrack_tasks'), taskId), { isDeleted: true, deleteReason: reason, deletedAt: Date.now() });
  };

  const clearAllData = async () => {
    const snapshot = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'vtrack_tasks'));
    await Promise.all(snapshot.docs.map(d => deleteDoc(d.ref)));
  };

  const updateSettings = async (newSet) => await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'vtrack_settings', 'general'), newSet);

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-white"><div className="w-12 h-12 border-4 border-[#003366]/10 border-t-[#C5A059] rounded-full animate-spin"></div></div>;

  return (
    <div className="flex flex-col md:flex-row h-screen bg-[#FDFDFD] text-gray-900 font-sans overflow-hidden">
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

      <main className="flex-1 flex flex-col h-full overflow-hidden relative">
        <header className="h-16 md:h-20 bg-white/90 backdrop-blur-md border-b border-gray-100 flex items-center justify-between px-6 sticky top-0 z-20">
          <h2 className="text-lg font-bold text-[#003366] truncate">{activeTab.toUpperCase()}</h2>
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

        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 flex justify-around items-center h-16 z-30 shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
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

function NavItem({ id, icon: Icon, label, active, set, open }) {
  const isAct = active === id;
  return (
    <button onClick={() => set(id)} className={`w-full flex items-center space-x-3 px-4 py-3 rounded-2xl transition-all ${isAct ? 'bg-[#C5A059] text-white shadow-lg' : 'text-white/60 hover:bg-white/5 hover:text-white'}`}>
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
        <h3 className="font-bold text-gray-800 text-xl mb-6">Admin Login</h3>
        <form onSubmit={sub}>
          <input type="password" value={v} onChange={e=>setV(e.target.value)} maxLength={4} placeholder="••••" className="w-full text-center text-3xl tracking-[0.5em] p-4 bg-gray-50 rounded-2xl mb-6 border-none focus:ring-2 focus:ring-[#C5A059]" autoFocus />
          <button type="submit" className="w-full bg-[#003366] text-white py-4 rounded-2xl font-bold shadow-xl shadow-[#003366]/20">ยืนยัน</button>
        </form>
      </div>
    </div>
  );
}

function Dashboard({ tasks, settings }) {
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [filterProj, setFilterProj] = useState('');
  const [filterComp, setFilterComp] = useState('');

  const filteredTasks = tasks.filter(t => !t.isDeleted && new Date(t.createdAt).toISOString().slice(0, 7) === selectedMonth && (filterProj ? t.project === filterProj : true) && (filterComp ? t.company === filterComp : true));
  const stats = STATUSES.map(s => ({ ...s, count: filteredTasks.filter(t => t.status === s.name).length }));

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm grid grid-cols-1 md:grid-cols-3 gap-4">
        <select value={selectedMonth} onChange={e=>setSelectedMonth(e.target.value)} className="p-3 bg-gray-50 rounded-2xl border-none text-sm font-bold">{[...new Set(tasks.map(t=>new Date(t.createdAt).toISOString().slice(0,7)))].sort().reverse().map(m=><option key={m} value={m}>{m}</option>)}</select>
        <select value={filterProj} onChange={e=>setFilterProj(e.target.value)} className="p-3 bg-gray-50 rounded-2xl border-none text-sm"><option value="">ทุกโครงการ</option>{settings.projects.map(p=><option key={p} value={p}>{p}</option>)}</select>
        <select value={filterComp} onChange={e=>setFilterComp(e.target.value)} className="p-3 bg-gray-50 rounded-2xl border-none text-sm"><option value="">ทุกร้านค้า</option>{settings.companies.map(c=><option key={c} value={c}>{c}</option>)}</select>
      </div>
      <div className="bg-white p-6 rounded-[2rem] border border-gray-100">
        <h3 className="font-bold mb-4">รายการใบงานประจำเดือน</h3>
        <div className="divide-y divide-gray-50">
          {filteredTasks.map(t => (
            <div key={t.id} className="py-4 flex justify-between items-center text-sm">
              <div><span className="font-bold text-[#003366]">{t.taskNo}</span><span className="text-gray-400 text-xs ml-2">{t.project}</span></div>
              {t.status === 'จบงานและรอรับเอกสารวางบิล' && <span className="text-[10px] text-orange-500 font-bold">* ส่งวางบิลภายในวันที่ 15</span>}
              {isOverdue(t.aptDate) && <span className="bg-red-50 text-red-600 px-2 py-0.5 rounded text-[10px] font-bold">งานเกินกำหนด</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Management({ tasks, settings, onSave, onDelete }) {
  const [edit, setEdit] = useState(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const itemsPerPage = 10;
  
  const filtered = useMemo(() => tasks.filter(t => !t.isDeleted && (t.taskNo.toLowerCase().includes(search.toLowerCase()) || t.project.toLowerCase().includes(search.toLowerCase()))), [tasks, search]);
  const paginated = filtered.slice((page - 1) * itemsPerPage, page * itemsPerPage);
  const totalPages = Math.ceil(filtered.length / itemsPerPage);

  if (edit) return <div className="p-8"><form onSubmit={async(e)=>{e.preventDefault(); await onSave(edit, true, edit.id); setEdit(null);}} className="bg-white p-8 rounded-2xl space-y-4 shadow-sm"><input className="w-full p-3 bg-gray-50 rounded-xl" value={edit.taskNo} onChange={e=>setEdit({...edit, taskNo: e.target.value})}/><textarea className="w-full p-3 bg-gray-50 rounded-xl" value={edit.details || ''} onChange={e=>setEdit({...edit, details: e.target.value})} placeholder="รายละเอียด..."></textarea><div className="flex gap-2"><button type="submit" className="bg-[#003366] text-white px-6 py-2 rounded-xl">บันทึก</button><button type="button" onClick={()=>setEdit(null)} className="px-6 py-2">ยกเลิก</button></div></form></div>;

  return (
    <div className="space-y-6">
      <input placeholder="ค้นหา..." className="w-full p-4 bg-white rounded-2xl border" onChange={e=>setSearch(e.target.value)}/>
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full table-fixed text-left text-sm">
          <thead className="bg-gray-50 uppercase text-[10px] font-bold text-gray-400">
            <tr><th className="px-6 py-4 w-1/5">เลขที่ใบงาน</th><th className="px-1/5 py-4">โครงการ</th><th className="px-6 py-4 w-1/5">รายละเอียด</th><th className="px-6 py-4 w-1/5">สถานะ</th><th className="px-6 py-4 w-1/5">จัดการ</th></tr>
          </thead>
          <tbody className="divide-y">
            {paginated.map(t=>(
              <tr key={t.id}>
                <td className="px-6 py-4 font-bold text-[#003366]">{t.taskNo}</td>
                <td className="px-6 py-4">{t.project}</td>
                <td className="px-6 py-4 truncate" title={t.details}>{t.details || '-'}</td>
                <td className="px-6 py-4"><span className="px-2 py-1 rounded-full text-[10px] font-bold" style={{backgroundColor: STATUSES.find(s=>s.name===t.status)?.bgColor, color: STATUSES.find(s=>s.name===t.status)?.color}}>{t.status}</span></td>
                <td className="px-6 py-4 space-x-2"><button onClick={()=>setEdit(t)} className="text-gray-400"><Edit size={16}/></button><button onClick={()=>onDelete(t.id, 'Delete')} className="text-red-400"><Trash2 size={16}/></button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex justify-center p-4 gap-2">
          {Array.from({length: totalPages}, (_, i) => <button key={i} onClick={()=>setPage(i+1)} className={`px-4 py-2 rounded-xl ${page === i+1 ? 'bg-[#003366] text-white' : 'bg-gray-100'}`}>{i+1}</button>)}
        </div>
      </div>
    </div>
  );
}

function CalendarView({ tasks }) {
  const [now, setNow] = useState(new Date());
  const y = now.getFullYear(); const m = now.getMonth();
  const daysIn = new Date(y, m + 1, 0).getDate();
  const grid = [...Array(new Date(y, m, 1).getDay()).fill(null), ...Array(daysIn).keys()].map(i => i === null ? null : i + 1);

  return (
    <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
      <div className="grid grid-cols-7 gap-2">
        {grid.map((d, i) => (
          <div key={i} className="min-h-[80px] p-2 border rounded-xl">
             <div className="text-xs font-bold text-gray-300">{d}</div>
             {d && tasks.filter(t => !t.isDeleted && t.aptDate === `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`).map(t => (
               <div key={t.id} className="text-[8px] truncate bg-[#003366] text-white p-1 rounded mt-1">{t.taskNo}</div>
             ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function SettingsPanel({ settings, updateSettings, onClear }) {
  return (
    <div className="p-8 bg-white rounded-2xl shadow-sm border border-gray-100">
        <button onClick={()=>{if(confirm('ลบข้อมูลทั้งหมด?')) onClear()}} className="bg-red-500 text-white px-6 py-3 rounded-2xl">ล้างข้อมูลทั้งหมด</button>
    </div>
  );
}