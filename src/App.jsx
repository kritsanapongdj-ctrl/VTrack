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
  Save, 
  Download,
  AlertCircle,
  Menu,
  ChevronLeft,
  ChevronRight,
  MoreVertical
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, onSnapshot, addDoc, updateDoc } from 'firebase/firestore';

// --- Firebase Initialization ---
// นำ Config ของคุณมาใส่ตรงนี้
const firebaseConfig = {
  apiKey: "AIzaSyCYiPSZJBmjwCp6z6gPdRpWG6vZT8R2wN8",
  authDomain: "vtrackdb.firebaseapp.com",
  projectId: "vtrackdb",
  storageBucket: "vtrackdb.firebasestorage.app",
  messagingSenderId: "672264007072",
  appId: "1:672264007072:web:06a820a12e71c84cf308c5",
  measurementId: "G-1PYTFGC4YT"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'v-track-system';

// --- Constants & Styles ---
const AREAS = ['รังสิต', 'ร่มเกล้า', 'พระราม 9', 'รามอินทรา'];

const STATUSES = [
  { id: 1, name: 'รอใบเสนอราคา', color: '#9CA3AF', bgColor: '#F3F4F6' },
  { id: 2, name: 'อยู่ระหว่างตรวจสอบใบเสนอราคา', color: '#F59E0B', bgColor: '#FEF3C7' },
  { id: 3, name: 'เปิดใบงานในระบบแล้ว', color: '#3B82F6', bgColor: '#DBEAFE' },
  { id: 4, name: 'จบงานและรอรับเอกสารวางบิล', color: '#8B5CF6', bgColor: '#EDE9FE' },
  { id: 5, name: 'ได้รับเอกสารวางบิลแล้ว', color: '#14B8A6', bgColor: '#CCFBF1' },
  { id: 6, name: 'ส่งเอกสารเบิกจ่ายแล้ว', color: '#10B981', bgColor: '#D1FAE5' }
];

// --- Webhook สำหรับ Google Sheets ---
// นำ URL ที่ได้จาก Google Apps Script (Deploy as Web App) มาวางที่ตัวแปรนี้
const GOOGLE_SHEETS_WEBHOOK_URL = ''; 

// --- Main Application Component ---
export default function App() {
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  
  // Security State
  const [isUnlocked, setIsUnlocked] = useState(false);
  
  // Data States
  const [tasks, setTasks] = useState([]);
  const [settings, setSettings] = useState({ projects: [], companies: [] });
  const [loading, setLoading] = useState(true);

  // Authentication & Data Fetching
  useEffect(() => {
    const initAuth = async () => {
      try {
        // ตรวจสอบว่ากำลังใช้ Config ของ Canvas หรือของผู้ใช้เอง
        let isCanvasConfig = false;
        if (typeof __firebase_config !== 'undefined') {
          try {
            const envConfig = JSON.parse(__firebase_config);
            if (envConfig.projectId === firebaseConfig.projectId) {
              isCanvasConfig = true;
            }
          } catch (e) {}
        }

        if (isCanvasConfig && typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          // หากเป็น Config ส่วนตัวของผู้ใช้ ให้ใช้ Anonymous Login แทน
          await signInAnonymously(auth);
        }
      } catch (error) {
        // หากเกิดข้อผิดพลาด ให้พยายามล็อกอินแบบ Anonymous อีกครั้งอย่างเงียบๆ
        try {
          await signInAnonymously(auth);
        } catch (fallbackError) {
          console.error("Firebase Auth Error:", fallbackError);
        }
      }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });

    if (!document.getElementById('papaparse-script')) {
      const script = document.createElement('script');
      script.id = 'papaparse-script';
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.3.2/papaparse.min.js';
      document.body.appendChild(script);
    }

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;

    const tasksRef = collection(db, 'artifacts', appId, 'public', 'data', 'vtrack_tasks');
    const settingsRef = doc(db, 'artifacts', appId, 'public', 'data', 'vtrack_settings', 'general');

    const unsubSettings = onSnapshot(settingsRef, (docSnap) => {
      if (docSnap.exists()) {
        setSettings(docSnap.data());
      } else {
        const defaultSettings = {
          projects: ['โครงการหมู่บ้าน A', 'โครงการคอนโด B'],
          companies: ['ร้านวัสดุก่อสร้าง ก', 'บจก. รับเหมา ข']
        };
        setDoc(settingsRef, defaultSettings);
        setSettings(defaultSettings);
      }
    }, (err) => console.error(err));

    const unsubTasks = onSnapshot(tasksRef, (snapshot) => {
      const tasksData = [];
      snapshot.forEach((doc) => {
        tasksData.push({ id: doc.id, ...doc.data() });
      });
      tasksData.sort((a, b) => b.createdAt - a.createdAt);
      setTasks(tasksData);
      setLoading(false);
    }, (err) => console.error(err));

    return () => {
      unsubSettings();
      unsubTasks();
    };
  }, [user]);

  // --- Helper Functions ---
  const syncToGoogleSheet = async (data) => {
    if (!GOOGLE_SHEETS_WEBHOOK_URL) return; // ข้ามการทำงานถ้ายังไม่มี URL
    try {
      await fetch(GOOGLE_SHEETS_WEBHOOK_URL, {
        method: 'POST',
        mode: 'no-cors', // เพื่อป้องกันปัญหา CORS จากฝั่ง Client
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data)
      });
    } catch (error) {
      console.error('Error syncing to Google Sheets:', error);
    }
  };

  const saveTask = async (taskData, isEdit = false, taskId = null) => {
    const tasksRef = collection(db, 'artifacts', appId, 'public', 'data', 'vtrack_tasks');
    let docId = taskId;
    
    if (isEdit && taskId) {
      const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'vtrack_tasks', taskId);
      await updateDoc(docRef, { ...taskData, updatedAt: Date.now() });
    } else {
      const newDocRef = await addDoc(tasksRef, { ...taskData, isDeleted: false, createdAt: Date.now() });
      docId = newDocRef.id;
    }

    // Sync to Google Sheets
    syncToGoogleSheet({ action: isEdit ? 'update' : 'add', id: docId, ...taskData });
  };

  const softDeleteTask = async (taskId, reason) => {
    const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'vtrack_tasks', taskId);
    await updateDoc(docRef, { isDeleted: true, deleteReason: reason, deletedAt: Date.now() });
    
    // Sync to Google Sheets
    syncToGoogleSheet({ action: 'delete', id: taskId, deleteReason: reason });
  };

  const updateSettings = async (newSettings) => {
    const settingsRef = doc(db, 'artifacts', appId, 'public', 'data', 'vtrack_settings', 'general');
    await setDoc(settingsRef, newSettings);
  };

  // --- UI Components ---
  const SidebarItem = ({ icon: Icon, label, id }) => (
    <button
      onClick={() => setActiveTab(id)}
      className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all duration-300 mb-1 ${
        activeTab === id 
          ? 'bg-[#C5A059]/10 text-[#C5A059] font-medium' 
          : 'text-gray-400 hover:bg-white/5 hover:text-white'
      }`}
    >
      <Icon size={20} strokeWidth={activeTab === id ? 2.5 : 1.5} />
      {isSidebarOpen && <span className="text-sm tracking-wide">{label}</span>}
    </button>
  );

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 text-[#003366]">
        <div className="flex flex-col items-center space-y-4">
          <div className="w-12 h-12 border-4 border-[#003366]/20 border-t-[#C5A059] rounded-full animate-spin"></div>
          <p className="text-sm font-medium text-gray-500 tracking-widest uppercase">Loading</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-[#F9FAFB] font-sans text-gray-800">
      {/* Sidebar */}
      <aside className={`${isSidebarOpen ? 'w-64' : 'w-20'} transition-all duration-300 bg-[#003366] text-white flex flex-col z-20`}>
        <div className="h-20 flex items-center justify-between px-6">
          {isSidebarOpen && <h1 className="text-2xl font-semibold tracking-widest text-white">V<span className="text-[#C5A059]">-TRACK</span></h1>}
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 rounded-lg hover:bg-white/10 transition-colors text-gray-300">
            <Menu size={20} />
          </button>
        </div>
        <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto custom-scrollbar">
          <SidebarItem icon={LayoutDashboard} label="แดชบอร์ด" id="dashboard" />
          <SidebarItem icon={PlusCircle} label="เพิ่มใบงานใหม่" id="add" />
          <SidebarItem icon={FileText} label="จัดการใบงาน" id="management" />
          <SidebarItem icon={CalendarIcon} label="ปฏิทินนัดหมาย" id="calendar" />
          <div className="pt-6 mt-6 border-t border-white/10">
            <SidebarItem icon={Settings} label="ตั้งค่าระบบ" id="settings" />
          </div>
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Header */}
        <header className="h-20 bg-white/80 backdrop-blur-md border-b border-gray-100 flex items-center justify-between px-8 z-10 sticky top-0">
          <h2 className="text-xl font-medium text-[#003366]">
            {activeTab === 'dashboard' && 'แดชบอร์ดติดตามสถานะงาน'}
            {activeTab === 'add' && 'เพิ่มใบงานใหม่'}
            {activeTab === 'management' && 'จัดการและค้นหาใบงาน'}
            {activeTab === 'calendar' && 'ปฏิทินนัดหมายเข้าซ่อม'}
            {activeTab === 'settings' && 'ตั้งค่าระบบ'}
          </h2>
          <div className="flex items-center space-x-4">
            {isUnlocked && (
              <button 
                onClick={() => setIsUnlocked(false)}
                className="text-xs font-medium text-red-500 hover:bg-red-50 px-3 py-1.5 rounded-lg border border-red-100 transition-colors"
              >
                ล็อคระบบ
              </button>
            )}
             <span className="text-xs font-medium text-[#10B981] bg-[#10B981]/10 px-3 py-1.5 rounded-full flex items-center">
               <span className="w-1.5 h-1.5 rounded-full bg-[#10B981] mr-2 animate-pulse"></span>
               Real-time
             </span>
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-auto p-8">
          <div className="max-w-7xl mx-auto pb-12">
            {activeTab === 'dashboard' && <DashboardView tasks={tasks} />}
            {activeTab === 'calendar' && <CalendarAppView tasks={tasks} />}
            
            {/* Protected Routes */}
            {['add', 'management', 'settings'].includes(activeTab) && !isUnlocked ? (
               <PinLockView onUnlock={() => setIsUnlocked(true)} />
            ) : (
              <>
                {activeTab === 'add' && <TaskFormView settings={settings} onSave={saveTask} onSuccess={() => setActiveTab('management')} />}
                {activeTab === 'management' && <ManagementView tasks={tasks} settings={settings} onSave={saveTask} onDelete={softDeleteTask} />}
                {activeTab === 'settings' && <SettingsView settings={settings} updateSettings={updateSettings} tasks={tasks} onSave={saveTask} />}
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

// ==========================================
// VIEWS COMPONENTS
// ==========================================

// 0. PIN Lock View
function PinLockView({ onUnlock }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (pin === '1312') {
      onUnlock();
      setError(false);
    } else {
      setError(true);
      setPin('');
    }
  };

  return (
    <div className="flex flex-col items-center justify-center py-20">
      <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 max-w-sm w-full text-center">
        <div className="w-16 h-16 bg-[#003366]/5 rounded-full flex items-center justify-center mx-auto mb-6">
          <Settings size={28} className="text-[#003366]" strokeWidth={1.5} />
        </div>
        <h2 className="text-xl font-medium text-[#003366] mb-2">พื้นที่สำหรับผู้ดูแลระบบ</h2>
        <p className="text-sm text-gray-500 mb-8">กรุณากรอกรหัสผ่านเพื่อเข้าใช้งานส่วนนี้</p>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input 
              type="password" 
              maxLength={4}
              value={pin}
              onChange={(e) => {
                setPin(e.target.value.replace(/\D/g, ''));
                if (error) setError(false);
              }}
              placeholder="••••" 
              className={`w-full text-center tracking-[1em] text-xl p-3 border rounded-xl focus:outline-none focus:ring-2 transition-colors ${error ? 'border-red-300 focus:ring-red-200' : 'border-gray-200 focus:border-[#C5A059] focus:ring-[#C5A059]/30'} bg-gray-50/50`}
              autoFocus
            />
            {error && <p className="text-red-500 text-xs mt-2">รหัสผ่านไม่ถูกต้อง กรุณาลองใหม่</p>}
          </div>
          <button type="submit" className="w-full py-3 text-sm font-medium text-white bg-[#003366] rounded-xl hover:bg-[#002244] transition-colors shadow-sm">
            ยืนยันรหัสผ่าน
          </button>
        </form>
      </div>
    </div>
  );
}

// 1. Dashboard View
function DashboardView({ tasks }) {
  const currentDate = new Date();
  const [selectedMonth, setSelectedMonth] = useState(`${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`);
  const [searchId, setSearchId] = useState('');
  const [filterCompany, setFilterCompany] = useState('');
  const [filterProject, setFilterProject] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const activeTasks = tasks.filter(t => !t.isDeleted);

  const filteredTasks = useMemo(() => {
    return activeTasks.filter(task => {
      const taskDate = task.aptDate ? new Date(task.aptDate) : new Date(task.createdAt);
      const taskMonth = `${taskDate.getFullYear()}-${String(taskDate.getMonth() + 1).padStart(2, '0')}`;
      const matchMonth = taskMonth === selectedMonth;
      
      const matchSearch = task.taskNo.toLowerCase().includes(searchId.toLowerCase());
      const matchCompany = filterCompany ? task.company === filterCompany : true;
      const matchProject = filterProject ? task.project === filterProject : true;
      const matchStatus = filterStatus ? task.status === filterStatus : true;

      return matchMonth && matchSearch && matchCompany && matchProject && matchStatus;
    });
  }, [activeTasks, selectedMonth, searchId, filterCompany, filterProject, filterStatus]);

  const pieData = STATUSES.map(s => ({
    ...s,
    value: filteredTasks.filter(t => t.status === s.name).length
  })).filter(s => s.value > 0);

  const totalTasks = filteredTasks.length;

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="bg-white p-6 rounded-2xl border border-gray-100 flex flex-wrap gap-4 items-end shadow-sm">
        <div className="w-48">
          <label className="block text-xs font-medium text-gray-500 mb-1.5">ประจำเดือน</label>
          <input 
            type="month" 
            value={selectedMonth} 
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="w-full border border-gray-200 rounded-xl p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C5A059]/30 focus:border-[#C5A059] transition-all bg-gray-50/50"
          />
        </div>
        <div className="w-48">
          <label className="block text-xs font-medium text-gray-500 mb-1.5">ค้นหาใบงาน</label>
          <div className="relative">
            <Search className="absolute left-3 top-3 text-gray-400" size={16} strokeWidth={2} />
            <input 
              type="text" 
              placeholder="ระบุเลขที่..." 
              value={searchId}
              onChange={(e) => setSearchId(e.target.value)}
              className="w-full border border-gray-200 rounded-xl p-2.5 pl-10 text-sm focus:outline-none focus:ring-2 focus:ring-[#C5A059]/30 focus:border-[#C5A059] transition-all bg-gray-50/50"
            />
          </div>
        </div>
        <div className="w-48">
          <label className="block text-xs font-medium text-gray-500 mb-1.5">โครงการ</label>
          <select value={filterProject} onChange={(e) => setFilterProject(e.target.value)} className="w-full border border-gray-200 rounded-xl p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C5A059]/30 focus:border-[#C5A059] transition-all bg-gray-50/50 text-gray-700">
            <option value="">ทั้งหมด</option>
            {[...new Set(activeTasks.map(t => t.project))].map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div className="w-48">
          <label className="block text-xs font-medium text-gray-500 mb-1.5">บริษัท/ร้านค้า</label>
          <select value={filterCompany} onChange={(e) => setFilterCompany(e.target.value)} className="w-full border border-gray-200 rounded-xl p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C5A059]/30 focus:border-[#C5A059] transition-all bg-gray-50/50 text-gray-700">
            <option value="">ทั้งหมด</option>
            {[...new Set(activeTasks.map(t => t.company))].map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="w-48">
          <label className="block text-xs font-medium text-gray-500 mb-1.5">สถานะ</label>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="w-full border border-gray-200 rounded-xl p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C5A059]/30 focus:border-[#C5A059] transition-all bg-gray-50/50 text-gray-700">
            <option value="">ทั้งหมด</option>
            {STATUSES.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Pie Chart Card */}
        <div className="bg-white p-8 rounded-2xl border border-gray-100 shadow-sm lg:col-span-1 flex flex-col items-center">
          <h3 className="text-sm font-medium text-gray-500 mb-8 w-full text-left">สัดส่วนสถานะงาน</h3>
          
          <div className="w-full flex flex-col items-center">
            {totalTasks > 0 ? (
              <div className="relative w-48 h-48 mb-8">
                <svg viewBox="0 0 32 32" className="w-full h-full transform -rotate-90">
                  <circle r="16" cx="16" cy="16" fill="transparent" stroke="#F3F4F6" strokeWidth="32" />
                  {pieData.reduce((acc, slice, index) => {
                    const dashArray = (slice.value / totalTasks) * 100;
                    const dashOffset = acc.offset;
                    acc.elements.push(
                      <circle
                        key={index}
                        r="16" cx="16" cy="16"
                        fill="transparent"
                        stroke={slice.color}
                        strokeWidth="32"
                        strokeDasharray={`${dashArray} 100`}
                        strokeDashoffset={`-${dashOffset}`}
                        className="transition-all duration-1000 ease-out"
                      />
                    );
                    acc.offset += dashArray;
                    return acc;
                  }, { elements: [], offset: 0 }).elements}
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="bg-white rounded-full w-32 h-32 flex flex-col items-center justify-center shadow-sm border border-gray-50">
                    <span className="text-3xl font-light text-[#003366]">{totalTasks}</span>
                    <span className="text-[10px] font-medium text-gray-400 uppercase tracking-widest mt-1">Total</span>
                  </div>
                </div>
              </div>
            ) : (
               <div className="h-48 flex items-center justify-center text-gray-400 text-sm w-full bg-gray-50 rounded-full mb-8">ไม่มีข้อมูล</div>
            )}
            
            <div className="w-full space-y-3">
              {pieData.map(s => (
                <div key={s.id} className="flex justify-between items-center group">
                  <div className="flex items-center space-x-3">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }}></span>
                    <span className="text-sm text-gray-600 group-hover:text-gray-900 transition-colors">{s.name}</span>
                  </div>
                  <span className="font-medium text-gray-900 text-sm">{s.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Task List (Read Only) */}
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm lg:col-span-2 flex flex-col overflow-hidden">
          <div className="px-6 py-5 border-b border-gray-100 flex justify-between items-center bg-white">
            <h3 className="text-sm font-medium text-gray-500">รายการใบงาน</h3>
            <span className="text-xs font-medium bg-gray-100 text-gray-600 px-3 py-1 rounded-full">{filteredTasks.length} รายการ</span>
          </div>
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left whitespace-nowrap">
              <thead>
                <tr className="border-b border-gray-100 text-xs text-gray-400 uppercase tracking-wider">
                  <th className="py-4 px-6 font-medium">เลขที่ใบงาน</th>
                  <th className="py-4 px-6 font-medium">โครงการ</th>
                  <th className="py-4 px-6 font-medium">สถานะ</th>
                  <th className="py-4 px-6 font-medium">วันนัดหมาย</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredTasks.length > 0 ? filteredTasks.map(task => {
                  const statusObj = STATUSES.find(s => s.name === task.status);
                  return (
                    <tr key={task.id} className="hover:bg-gray-50/50 transition-colors group">
                      <td className="py-4 px-6 text-sm font-medium text-[#003366]">{task.taskNo}</td>
                      <td className="py-4 px-6 text-sm text-gray-600">{task.project}</td>
                      <td className="py-4 px-6">
                         <span className="px-3 py-1 text-xs font-medium rounded-full inline-block" 
                               style={{ backgroundColor: statusObj?.bgColor || '#f3f4f6', color: statusObj?.color || '#374151' }}>
                           {task.status}
                         </span>
                      </td>
                      <td className="py-4 px-6 text-sm text-gray-500">{task.aptDate || '-'}</td>
                    </tr>
                  )
                }) : (
                  <tr>
                    <td colSpan="4" className="py-16 text-center">
                      <div className="flex flex-col items-center justify-center text-gray-400">
                         <FileText size={32} className="mb-3 opacity-30" strokeWidth={1} />
                         <p className="text-sm">ไม่พบรายการใบงาน</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

// 2. Task Form View (Add/Edit)
function TaskFormView({ settings, onSave, onSuccess, initialData = null, onCancel = null }) {
  const [formData, setFormData] = useState(initialData || {
    taskNo: '', project: '', company: '', area: '', status: STATUSES[0].name, aptDate: '', payDate: '', details: ''
  });
  const [errors, setErrors] = useState({});

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: null }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const newErrors = {};
    if (!formData.taskNo) newErrors.taskNo = 'กรุณาระบุเลขที่ใบงาน';
    if (!formData.project) newErrors.project = 'กรุณาเลือกโครงการ';
    if (!formData.company) newErrors.company = 'กรุณาเลือกบริษัท/ร้านค้า';
    if (!formData.area) newErrors.area = 'กรุณาเลือกพื้นที่';

    if (Object.keys(newErrors).length > 0) { setErrors(newErrors); return; }
    await onSave(formData, !!initialData, initialData?.id);
    if (onSuccess) onSuccess();
  };

  return (
    <div className="bg-white border border-gray-100 shadow-sm max-w-4xl mx-auto rounded-2xl overflow-hidden">
      <div className="px-8 py-6 border-b border-gray-100 flex justify-between items-center bg-white">
        <h2 className="text-lg font-medium text-[#003366]">
          {initialData ? 'แก้ไขใบงาน' : 'เพิ่มใบงานใหม่'}
        </h2>
      </div>
      
      <form onSubmit={handleSubmit} className="p-8 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-2">เลขที่ใบงาน <span className="text-red-400">*</span></label>
            <input type="text" name="taskNo" value={formData.taskNo} onChange={handleChange} 
              className={`w-full p-3 text-sm border rounded-xl focus:outline-none focus:ring-2 focus:ring-[#C5A059]/30 transition-colors bg-gray-50/50 ${errors.taskNo ? 'border-red-300 focus:border-red-400 focus:ring-red-200' : 'border-gray-200 focus:border-[#C5A059]'}`} 
              placeholder="เช่น VT-202604001"
            />
            {errors.taskNo && <p className="text-red-500 text-xs mt-1.5">{errors.taskNo}</p>}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-2">โครงการ <span className="text-red-400">*</span></label>
            <select name="project" value={formData.project} onChange={handleChange} 
              className={`w-full p-3 text-sm border rounded-xl focus:outline-none focus:ring-2 focus:ring-[#C5A059]/30 transition-colors bg-gray-50/50 text-gray-700 ${errors.project ? 'border-red-300' : 'border-gray-200 focus:border-[#C5A059]'}`}>
              <option value="">เลือกโครงการ</option>
              {settings.projects.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-2">บริษัท/ร้านค้า <span className="text-red-400">*</span></label>
            <select name="company" value={formData.company} onChange={handleChange} 
              className={`w-full p-3 text-sm border rounded-xl focus:outline-none focus:ring-2 focus:ring-[#C5A059]/30 transition-colors bg-gray-50/50 text-gray-700 ${errors.company ? 'border-red-300' : 'border-gray-200 focus:border-[#C5A059]'}`}>
              <option value="">เลือกร้านค้า</option>
              {settings.companies.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-2">พื้นที่ <span className="text-red-400">*</span></label>
            <select name="area" value={formData.area} onChange={handleChange} 
              className={`w-full p-3 text-sm border rounded-xl focus:outline-none focus:ring-2 focus:ring-[#C5A059]/30 transition-colors bg-gray-50/50 text-gray-700 ${errors.area ? 'border-red-300' : 'border-gray-200 focus:border-[#C5A059]'}`}>
              <option value="">เลือกพื้นที่</option>
              {AREAS.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-gray-500 mb-2">สถานะงาน</label>
            <select name="status" value={formData.status} onChange={handleChange} 
              className="w-full p-3 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:border-[#C5A059] focus:ring-[#C5A059]/30 transition-colors bg-gray-50/50 text-gray-700">
              {STATUSES.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-2">วันนัดหมายเข้าซ่อม</label>
            <input type="date" name="aptDate" value={formData.aptDate} onChange={handleChange} 
              className="w-full p-3 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:border-[#C5A059] focus:ring-[#C5A059]/30 transition-colors bg-gray-50/50 text-gray-700" />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-2">วันที่ทำจ่าย</label>
            <input type="date" name="payDate" value={formData.payDate} onChange={handleChange} 
              className="w-full p-3 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:border-[#C5A059] focus:ring-[#C5A059]/30 transition-colors bg-gray-50/50 text-gray-700" />
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-gray-500 mb-2">รายละเอียดงาน</label>
            <textarea name="details" value={formData.details} onChange={handleChange} rows="4"
              className="w-full p-3 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:border-[#C5A059] focus:ring-[#C5A059]/30 transition-colors bg-gray-50/50 text-gray-700 resize-none"
              placeholder="ระบุรายละเอียดเพิ่มเติม..."
            ></textarea>
          </div>
        </div>

        <div className="flex justify-end space-x-3 pt-6 mt-6 border-t border-gray-50">
          {onCancel && (
            <button type="button" onClick={onCancel} className="px-6 py-2.5 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
              ยกเลิก
            </button>
          )}
          <button type="submit" className="px-6 py-2.5 text-sm font-medium text-white bg-[#003366] rounded-xl hover:bg-[#002244] transition-colors shadow-sm flex items-center">
            บันทึกข้อมูล
          </button>
        </div>
      </form>
    </div>
  );
}

// 3. Task Management View
function ManagementView({ tasks, settings, onSave, onDelete }) {
  const [filterArea, setFilterArea] = useState('');
  const [filterProject, setFilterProject] = useState('');
  const [editingTask, setEditingTask] = useState(null);
  const [deletingTask, setDeletingTask] = useState(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [deleteError, setDeleteError] = useState('');

  const activeTasks = tasks.filter(t => !t.isDeleted);
  const filteredTasks = activeTasks.filter(task => {
    return (filterArea ? task.area === filterArea : true) && (filterProject ? task.project === filterProject : true);
  });

  const handleDeleteConfirm = () => {
    if (!deleteReason.trim()) { setDeleteError('กรุณาระบุเหตุผลในการลบ'); return; }
    onDelete(deletingTask.id, deleteReason);
    setDeletingTask(null); setDeleteReason(''); setDeleteError('');
  };

  const exportToCSV = () => {
    if (!window.Papa) { alert("Library not ready!"); return; }
    const csv = window.Papa.unparse(activeTasks.map(t => ({
      'เลขที่ใบงาน': t.taskNo, 'โครงการ': t.project, 'บริษัท': t.company, 'พื้นที่': t.area,
      'สถานะ': t.status, 'วันนัดหมาย': t.aptDate, 'วันที่ทำจ่าย': t.payDate, 'รายละเอียด': t.details
    })));
    const blob = new Blob(["\ufeff"+csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `VTrack_Export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
  };

  if (editingTask) return <TaskFormView settings={settings} initialData={editingTask} onSave={(data, isEdit, id) => { onSave(data, isEdit, id); setEditingTask(null); }} onCancel={() => setEditingTask(null)} />;

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-wrap justify-between items-center bg-white px-6 py-4 border border-gray-100 shadow-sm rounded-2xl">
        <div className="flex flex-wrap gap-4 items-center w-full md:w-auto">
          <select value={filterArea} onChange={(e) => setFilterArea(e.target.value)} className="border border-gray-200 text-sm rounded-xl p-2.5 min-w-[140px] focus:outline-none focus:border-[#C5A059] focus:ring-1 focus:ring-[#C5A059]/30 bg-gray-50/50 text-gray-700">
            <option value="">ทุกพื้นที่</option>
            {AREAS.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <select value={filterProject} onChange={(e) => setFilterProject(e.target.value)} className="border border-gray-200 text-sm rounded-xl p-2.5 min-w-[180px] focus:outline-none focus:border-[#C5A059] focus:ring-1 focus:ring-[#C5A059]/30 bg-gray-50/50 text-gray-700">
            <option value="">ทุกโครงการ</option>
            {settings.projects.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        
        <button onClick={exportToCSV} className="mt-4 md:mt-0 px-5 py-2.5 text-sm font-medium bg-white text-gray-700 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors flex items-center shadow-sm">
          <Download size={16} className="mr-2 text-gray-400" /> ส่งออกข้อมูล
        </button>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-100 shadow-sm rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left whitespace-nowrap">
            <thead>
              <tr className="bg-white border-b border-gray-100 text-xs text-gray-400 uppercase tracking-wider">
                <th className="py-4 px-6 font-medium">เลขที่ใบงาน</th>
                <th className="py-4 px-6 font-medium">โครงการ</th>
                <th className="py-4 px-6 font-medium">พื้นที่</th>
                <th className="py-4 px-6 font-medium">สถานะ</th>
                <th className="py-4 px-6 font-medium text-right">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredTasks.length > 0 ? filteredTasks.map(task => {
                const statusObj = STATUSES.find(s => s.name === task.status);
                return (
                  <tr key={task.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="py-4 px-6 text-sm font-medium text-[#003366]">{task.taskNo}</td>
                    <td className="py-4 px-6 text-sm text-gray-600">{task.project}</td>
                    <td className="py-4 px-6 text-sm text-gray-500">{task.area}</td>
                    <td className="py-4 px-6">
                       <span className="px-3 py-1 text-xs font-medium rounded-full inline-block" 
                             style={{ backgroundColor: statusObj?.bgColor || '#f3f4f6', color: statusObj?.color || '#374151' }}>
                         {task.status}
                       </span>
                    </td>
                    <td className="py-4 px-6 flex justify-end space-x-2">
                      <button onClick={() => setEditingTask(task)} className="p-2 text-gray-400 hover:text-[#C5A059] hover:bg-[#C5A059]/10 rounded-lg transition-colors" title="แก้ไข">
                        <Edit size={16} strokeWidth={1.5} />
                      </button>
                      <button onClick={() => setDeletingTask(task)} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="ลบ">
                        <Trash2 size={16} strokeWidth={1.5} />
                      </button>
                    </td>
                  </tr>
                )
              }) : (
                <tr>
                  <td colSpan="5" className="py-16 text-center text-gray-400">
                    <div className="flex flex-col items-center">
                       <FileText size={32} className="mb-3 opacity-30" strokeWidth={1} />
                       <p className="text-sm">ไม่มีข้อมูลใบงาน</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Delete Modal */}
      {deletingTask && (
        <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white w-full max-w-sm rounded-2xl overflow-hidden shadow-xl transform transition-all">
            <div className="p-6">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-4 mx-auto">
                <AlertCircle size={24} className="text-red-500" strokeWidth={1.5} />
              </div>
              <h3 className="text-lg font-medium text-center text-gray-900 mb-2">ยืนยันการลบใบงาน</h3>
              <p className="text-sm text-center text-gray-500 mb-6">
                คุณกำลังจะลบ <strong>{deletingTask.taskNo}</strong>
              </p>
              
              <div>
                <textarea 
                  value={deleteReason} onChange={(e) => setDeleteReason(e.target.value)}
                  className={`w-full p-3 text-sm border rounded-xl focus:outline-none focus:ring-2 transition-colors resize-none ${deleteError ? 'border-red-300 focus:ring-red-200' : 'border-gray-200 focus:border-red-400 focus:ring-red-100'} bg-gray-50/50`}
                  rows="3" placeholder="โปรดระบุเหตุผลในการลบ..."
                ></textarea>
                {deleteError && <p className="text-red-500 text-xs mt-1.5 px-1">{deleteError}</p>}
              </div>
            </div>
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex space-x-3">
              <button onClick={() => setDeletingTask(null)} className="flex-1 py-2.5 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">ยกเลิก</button>
              <button onClick={handleDeleteConfirm} className="flex-1 py-2.5 text-sm font-medium text-white bg-red-500 rounded-xl hover:bg-red-600 transition-colors shadow-sm">ลบใบงาน</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// 4. Calendar View
function CalendarAppView({ tasks }) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [filterArea, setFilterArea] = useState('');
  const activeTasks = tasks.filter(t => !t.isDeleted && t.aptDate);
  const filteredTasks = activeTasks.filter(task => filterArea ? task.area === filterArea : true);

  const getDaysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();
  const getFirstDayOfMonth = (y, m) => new Date(y, m, 1).getDay();

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);

  const monthNames = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
  const dayNames = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];

  const grid = [];
  for (let i = 0; i < firstDay; i++) grid.push(null);
  for (let i = 1; i <= daysInMonth; i++) grid.push(i);

  return (
    <div className="bg-white border border-gray-100 shadow-sm rounded-2xl p-8 flex flex-col h-full min-h-[600px]">
      <div className="flex justify-between items-center mb-8">
        <div className="flex items-center space-x-4">
          <button onClick={() => setCurrentDate(new Date(year, month - 1, 1))} className="p-2 border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-500 transition-colors"><ChevronLeft size={20} strokeWidth={1.5} /></button>
          <h2 className="text-lg font-medium text-[#003366] min-w-[160px] text-center">
            {monthNames[month]} {year + 543}
          </h2>
          <button onClick={() => setCurrentDate(new Date(year, month + 1, 1))} className="p-2 border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-500 transition-colors"><ChevronRight size={20} strokeWidth={1.5} /></button>
        </div>
        
        <div>
          <select value={filterArea} onChange={(e) => setFilterArea(e.target.value)} className="border border-gray-200 text-sm rounded-xl p-2.5 focus:outline-none focus:border-[#C5A059] focus:ring-1 focus:ring-[#C5A059]/30 bg-gray-50/50 text-gray-700">
            <option value="">ทุกพื้นที่</option>
            {AREAS.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-px bg-gray-100 border border-gray-100 flex-1 rounded-xl overflow-hidden shadow-inner">
        {dayNames.map(day => (
          <div key={day} className="bg-white p-3 text-center text-xs font-medium text-gray-400">
            {day}
          </div>
        ))}
        
        {grid.map((day, idx) => {
          if (!day) return <div key={`empty-${idx}`} className="bg-gray-50/50 min-h-[100px]"></div>;
          
          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const dayTasks = filteredTasks.filter(t => t.aptDate === dateStr);
          const isToday = dateStr === new Date().toISOString().split('T')[0];

          return (
            <div key={day} className={`bg-white min-h-[100px] p-2 hover:bg-gray-50/50 transition-colors relative flex flex-col ${isToday ? 'ring-inset ring-1 ring-[#003366]' : ''}`}>
              <div className={`text-sm mb-2 flex justify-between items-center px-1 ${isToday ? 'text-[#003366] font-medium' : 'text-gray-500 font-light'}`}>
                {day}
                {isToday && <span className="w-1.5 h-1.5 bg-[#C5A059] rounded-full"></span>}
              </div>
              <div className="space-y-1.5 overflow-y-auto flex-1 custom-scrollbar pr-1">
                {dayTasks.map(task => {
                  const statusObj = STATUSES.find(s => s.name === task.status);
                  return (
                    <div key={task.id} 
                         className="text-[11px] px-2 py-1 rounded-md truncate cursor-help border border-transparent hover:border-gray-200 transition-colors" 
                         style={{ backgroundColor: statusObj?.bgColor || '#f3f4f6', color: statusObj?.color || '#374151' }}
                         title={`${task.taskNo} - ${task.project} (${task.status})`}
                    >
                      {task.taskNo}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// 5. Settings & Import View
function SettingsView({ settings, updateSettings, tasks, onSave }) {
  const [newProject, setNewProject] = useState('');
  const [newCompany, setNewCompany] = useState('');
  const [importStatus, setImportStatus] = useState('');

  const handleAddProject = () => {
    if (!newProject.trim() || settings.projects.includes(newProject.trim())) return;
    updateSettings({ ...settings, projects: [...settings.projects, newProject.trim()] });
    setNewProject('');
  };
  const handleRemoveProject = (proj) => updateSettings({ ...settings, projects: settings.projects.filter(p => p !== proj) });

  const handleAddCompany = () => {
    if (!newCompany.trim() || settings.companies.includes(newCompany.trim())) return;
    updateSettings({ ...settings, companies: [...settings.companies, newCompany.trim()] });
    setNewCompany('');
  };
  const handleRemoveCompany = (comp) => updateSettings({ ...settings, companies: settings.companies.filter(c => c !== comp) });

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!window.Papa) { setImportStatus('ระบบประมวลผลไฟล์ยังไม่พร้อมใช้งาน'); return; }
    
    setImportStatus('กำลังประมวลผล...');
    window.Papa.parse(file, {
      header: true, skipEmptyLines: true,
      complete: async (results) => {
        const rows = results.data;
        let successCount = 0;
        for (const row of rows) {
          const taskNo = row['เลขที่ใบงาน'] || row['taskNo'];
          if (!taskNo) continue;
          const taskData = {
            taskNo, project: row['โครงการ'] || row['project'] || '', company: row['บริษัท'] || row['บริษัท/ร้านค้า'] || row['company'] || '',
            area: row['พื้นที่'] || row['area'] || AREAS[0], status: row['สถานะ'] || row['status'] || STATUSES[0].name,
            aptDate: row['วันนัดหมาย'] || row['aptDate'] || '', payDate: row['วันที่ทำจ่าย'] || row['payDate'] || '', details: row['รายละเอียด'] || row['details'] || ''
          };
          if (!settings.projects.includes(taskData.project) && taskData.project) settings.projects.push(taskData.project);
          if (!settings.companies.includes(taskData.company) && taskData.company) settings.companies.push(taskData.company);

          const exist = tasks.find(t => t.taskNo === taskNo && !t.isDeleted);
          await onSave(taskData, !!exist, exist?.id);
          successCount++;
        }
        updateSettings({...settings});
        setImportStatus(`นำเข้าสำเร็จ ${successCount} รายการ`);
        e.target.value = null;
        setTimeout(() => setImportStatus(''), 5000);
      },
      error: (err) => setImportStatus(`พบข้อผิดพลาด: ${err.message}`)
    });
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-5xl mx-auto">
      {/* Projects */}
      <div className="bg-white border border-gray-100 shadow-sm rounded-2xl p-6">
        <h3 className="text-sm font-medium text-gray-500 mb-6 flex items-center">
          โครงการ
        </h3>
        <div className="flex space-x-2 mb-6">
          <input 
            type="text" value={newProject} onChange={(e) => setNewProject(e.target.value)}
            placeholder="เพิ่มโครงการใหม่..." 
            className="flex-1 border border-gray-200 rounded-xl p-2.5 text-sm focus:outline-none focus:border-[#C5A059] focus:ring-1 focus:ring-[#C5A059]/30 bg-gray-50/50"
            onKeyPress={e => e.key === 'Enter' && handleAddProject()}
          />
          <button onClick={handleAddProject} className="px-5 py-2.5 bg-gray-50 text-gray-700 text-sm font-medium border border-gray-200 rounded-xl hover:bg-gray-100 transition-colors">เพิ่ม</button>
        </div>
        <ul className="space-y-1.5 max-h-64 overflow-y-auto pr-2 custom-scrollbar">
          {settings.projects.map(proj => (
            <li key={proj} className="flex justify-between items-center p-3 hover:bg-gray-50 rounded-xl transition-colors group">
              <span className="text-sm text-gray-700">{proj}</span>
              <button onClick={() => handleRemoveProject(proj)} className="text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"><X size={16} strokeWidth={2}/></button>
            </li>
          ))}
        </ul>
      </div>

      {/* Companies */}
      <div className="bg-white border border-gray-100 shadow-sm rounded-2xl p-6">
        <h3 className="text-sm font-medium text-gray-500 mb-6 flex items-center">
          บริษัท/ร้านค้า
        </h3>
        <div className="flex space-x-2 mb-6">
          <input 
            type="text" value={newCompany} onChange={(e) => setNewCompany(e.target.value)}
            placeholder="เพิ่มบริษัท/ร้านค้า..." 
            className="flex-1 border border-gray-200 rounded-xl p-2.5 text-sm focus:outline-none focus:border-[#C5A059] focus:ring-1 focus:ring-[#C5A059]/30 bg-gray-50/50"
            onKeyPress={e => e.key === 'Enter' && handleAddCompany()}
          />
          <button onClick={handleAddCompany} className="px-5 py-2.5 bg-gray-50 text-gray-700 text-sm font-medium border border-gray-200 rounded-xl hover:bg-gray-100 transition-colors">เพิ่ม</button>
        </div>
        <ul className="space-y-1.5 max-h-64 overflow-y-auto pr-2 custom-scrollbar">
          {settings.companies.map(comp => (
            <li key={comp} className="flex justify-between items-center p-3 hover:bg-gray-50 rounded-xl transition-colors group">
              <span className="text-sm text-gray-700">{comp}</span>
              <button onClick={() => handleRemoveCompany(comp)} className="text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"><X size={16} strokeWidth={2}/></button>
            </li>
          ))}
        </ul>
      </div>

      {/* Import Data */}
      <div className="bg-white border border-gray-100 shadow-sm rounded-2xl p-8 md:col-span-2">
        <h3 className="text-sm font-medium text-gray-500 mb-2">
          นำเข้าข้อมูล (Import)
        </h3>
        <p className="text-xs text-gray-400 mb-6">อัปโหลดไฟล์ .csv (คอลัมน์: เลขที่ใบงาน, โครงการ, บริษัท, พื้นที่, สถานะ, วันนัดหมาย, วันที่ทำจ่าย, รายละเอียด)</p>
        
        <div className="border border-dashed border-gray-300 bg-gray-50/50 rounded-2xl p-10 text-center hover:bg-gray-50 transition-colors cursor-pointer relative group">
          <input 
            type="file" accept=".csv" onChange={handleFileUpload}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
          />
          <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center mx-auto mb-3 shadow-sm border border-gray-100 group-hover:border-[#C5A059]/30 transition-colors">
            <Upload size={20} className="text-gray-400 group-hover:text-[#C5A059] transition-colors" strokeWidth={1.5} />
          </div>
          <p className="text-sm text-gray-600 font-medium group-hover:text-[#003366] transition-colors">คลิกเพื่อเลือกไฟล์ หรือ ลากไฟล์มาวางที่นี่</p>
        </div>
        
        {importStatus && (
          <div className={`mt-4 p-3 rounded-xl text-xs font-medium text-center ${importStatus.includes('สำเร็จ') ? 'bg-green-50 text-green-600 border border-green-100' : 'bg-[#003366]/5 text-[#003366] border border-[#003366]/10'}`}>
            {importStatus}
          </div>
        )}
      </div>
    </div>
  );
}