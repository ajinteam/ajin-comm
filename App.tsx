
import React, { useState, useEffect } from 'react';
import { 
  OrderSubCategory, 
  UserAccount, 
  ViewState 
} from './types';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import OrderView from './components/OrderView';
import InvoiceView from './components/InvoiceView';
import SettingsView from './components/SettingsView';
import AuthView from './components/AuthView';
import Dashboard from './components/Dashboard';
import { pullStateFromCloud, pushStateToCloud } from './supabase';

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(null);
  const [view, setView] = useState<ViewState>({ type: 'DASHBOARD' });
  const [userAccounts, setUserAccounts] = useState<UserAccount[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);

  // Load from Supabase (Pull) then Local Storage
  useEffect(() => {
    const initApp = async () => {
      await pullStateFromCloud();
      
      const saved = localStorage.getItem('ajin_accounts');
      let accounts: UserAccount[] = saved ? JSON.parse(saved) : [];
      
      const masterId = 'AJ5200';
      if (!accounts.find(u => u.loginId === masterId)) {
        accounts.unshift({ 
          id: 'master-001', 
          loginId: masterId, 
          initials: 'MASTER',
          createdAt: new Date().toISOString(),
          allowedMenus: []
        });
      }

      setUserAccounts(accounts);
      localStorage.setItem('ajin_accounts', JSON.stringify(accounts));
      setIsLoading(false);
    };
    initApp();
  }, []);

  // Prevent browser exit during sync
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isSyncing) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isSyncing]);

  const handleSetView = async (v: ViewState) => {
    if (isSyncing) return;
    
    // Sync to cloud automatically when moving between categories
    setIsSyncing(true);
    try {
      await pushStateToCloud();
    } catch (error) {
      console.error('Auto-sync failed:', error);
    } finally {
      setIsSyncing(false);
      setView(v);
      closeSidebar();
    }
  };

  const handleLogin = (loginId: string) => {
    const normalizedId = loginId.trim().toUpperCase();
    const found = userAccounts.find(u => u.loginId === normalizedId);
    
    if (found) {
      setCurrentUser(found);
      setView({ type: 'DASHBOARD' });
    } else {
      alert('등록되지 않은 번호입니다.');
    }
  };

  const handleLogout = () => {
    if (isSyncing) return;
    setCurrentUser(null);
    setView({ type: 'DASHBOARD' });
    setIsSidebarOpen(false);
  };

  const updateAccounts = async (newAccounts: UserAccount[]) => {
    const masterId = 'AJ5200';
    const masterExists = newAccounts.some(u => u.loginId === masterId);
    let finalAccounts = [...newAccounts];
    
    if (!masterExists) {
      const masterAcc = userAccounts.find(u => u.loginId === masterId);
      if (masterAcc) finalAccounts.unshift(masterAcc);
    }
    
    setUserAccounts(finalAccounts);
    localStorage.setItem('ajin_accounts', JSON.stringify(finalAccounts));
    
    setIsSyncing(true);
    await pushStateToCloud(); // Sync to Supabase
    setIsSyncing(false);
  };

  const closeSidebar = () => setIsSidebarOpen(false);
  const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);

  if (isLoading) {
    return <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white font-bold">ERP 데이터 동기화 중...</div>;
  }

  if (!currentUser) {
    return <AuthView onLogin={handleLogin} />;
  }

  const isMaster = currentUser.loginId === 'AJ5200';

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden relative">
      {/* Sync Overlay */}
      {isSyncing && (
        <div className="fixed inset-0 bg-white/40 backdrop-blur-[1px] z-[9999] flex flex-col items-center justify-center cursor-wait">
          <div className="bg-slate-900 text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 animate-pulse">
            <svg className="animate-spin h-5 w-5 text-blue-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span className="font-bold text-sm tracking-tight">클라우드 동기화 중...</span>
          </div>
          <p className="mt-4 text-slate-500 text-xs font-medium">동기화 중에는 종료할 수 없습니다.</p>
        </div>
      )}

      <Sidebar 
        currentView={view} 
        setView={handleSetView} 
        user={currentUser} 
        isOpen={isSidebarOpen}
        onClose={closeSidebar}
      />
      
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header 
          userName={currentUser.loginId} 
          isMaster={isMaster}
          onLogout={handleLogout} 
          onSettings={() => {
            if (isMaster) handleSetView({ type: 'SETTINGS' });
            else alert('설정 권한이 없습니다.');
          }}
          onHome={() => { handleSetView({ type: 'DASHBOARD' }); }}
          onToggleSidebar={toggleSidebar}
          isSyncing={isSyncing}
        />
        
        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          {view.type === 'DASHBOARD' && <Dashboard user={currentUser} setView={handleSetView} />}
          {view.type === 'ORDER' && (
            <OrderView 
              sub={view.sub} 
              currentUser={currentUser}
              userAccounts={userAccounts}
              setView={handleSetView}
            />
          )}
          {view.type === 'INVOICE' && (
            <InvoiceView 
              sub={view.sub} 
              currentUser={currentUser} 
              setView={handleSetView}
            />
          )}
          {view.type === 'SETTINGS' && isMaster && (
            <SettingsView 
              accounts={userAccounts} 
              onUpdate={updateAccounts}
              setView={handleSetView}
            />
          )}
        </main>
      </div>
    </div>
  );
};

export default App;
