
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
import { pullStateFromCloud, pushStateToCloud, supabase } from './supabase';

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(() => {
    const saved = localStorage.getItem('ajin_active_user');
    return saved ? JSON.parse(saved) : null;
  });
  
  const [view, setView] = useState<ViewState>({ type: 'DASHBOARD' });
  const [userAccounts, setUserAccounts] = useState<UserAccount[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [dataVersion, setDataVersion] = useState(0);

  // 초기 앱 기동 시 클라우드 데이터 우선 로드
  useEffect(() => {
    const initApp = async () => {
      setIsSyncing(true);
      await pullStateFromCloud();
      setIsSyncing(false);
      
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

  // PC-모바일 실시간 교차 동기화 로직
  useEffect(() => {
    if (!supabase) return;

    // 1. Supabase Realtime 구독
    const channel = supabase
      .channel('db-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ajin-comm-backup' },
        async () => {
          console.log('[Cloud Sync] DB Change Detected');
          setIsSyncing(true);
          await pullStateFromCloud();
          setDataVersion(v => v + 1);
          setIsSyncing(false);
        }
      )
      .subscribe();

    // 2. Window Focus 기반 동기화 (PC에서 수정 후 모바일에서 열었을 때 즉시 반영)
    const handleFocus = async () => {
      if (!currentUser) return;
      console.log('[Cloud Sync] Focus detected, syncing data...');
      setIsSyncing(true);
      const updated = await pullStateFromCloud();
      if (updated) {
        setDataVersion(v => v + 1);
      }
      setIsSyncing(false);
    };

    window.addEventListener('focus', handleFocus);

    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener('focus', handleFocus);
    };
  }, [currentUser]);

  const handleSetView = async (v: ViewState) => {
    // 메뉴 이동 시 현재 작업 내용 클라우드 강제 동기화
    setIsSyncing(true);
    await pushStateToCloud();
    setIsSyncing(false);
    
    setView(v);
    setIsSidebarOpen(false);
  };

  const handleLogin = (loginId: string) => {
    const normalizedId = loginId.trim().toUpperCase();
    const found = userAccounts.find(u => u.loginId === normalizedId);
    
    if (found) {
      setCurrentUser(found);
      localStorage.setItem('ajin_active_user', JSON.stringify(found));
      setView({ type: 'DASHBOARD' });
    } else {
      alert('등록되지 않은 번호입니다.');
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('ajin_active_user');
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
    await pushStateToCloud();
    setIsSyncing(false);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white p-6">
        <div className="w-16 h-16 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin mb-6"></div>
        <h1 className="text-xl font-black tracking-widest uppercase mb-2">AJIN COMMUNICATIONS</h1>
        <p className="text-slate-500 text-sm font-bold animate-pulse">Syncing Cloud Data...</p>
      </div>
    );
  }

  if (!currentUser) {
    return <AuthView onLogin={handleLogin} />;
  }

  const isMaster = currentUser.loginId === 'AJ5200';

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden relative selection:bg-blue-100 selection:text-blue-900">
      <Sidebar 
        currentView={view} 
        setView={handleSetView} 
        user={currentUser} 
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />
      
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header 
          userName={currentUser.initials} 
          isMaster={isMaster}
          onLogout={handleLogout} 
          onSettings={() => {
            if (isMaster) handleSetView({ type: 'SETTINGS' });
            else alert('설정 권한이 없습니다.');
          }}
          onHome={() => { handleSetView({ type: 'DASHBOARD' }); }}
          onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
          isSyncing={isSyncing}
        />
        
        <main className="flex-1 overflow-y-auto p-4 md:p-10 custom-scrollbar scroll-smooth">
          <div className="max-w-7xl mx-auto">
            {view.type === 'DASHBOARD' && <Dashboard user={currentUser} setView={handleSetView} key={`dash-${dataVersion}`} />}
            {view.type === 'ORDER' && (
              <OrderView 
                key={`order-${view.sub}-${dataVersion}`}
                sub={view.sub} 
                currentUser={currentUser}
                userAccounts={userAccounts}
                setView={handleSetView}
              />
            )}
            {view.type === 'INVOICE' && (
              <InvoiceView 
                key={`invoice-${view.sub}-${dataVersion}`}
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
          </div>
        </main>
      </div>
      
      {isSyncing && (
        <div className="fixed bottom-4 right-4 md:bottom-8 md:right-8 z-[100] animate-bounce">
          <div className="bg-blue-600 text-white px-4 py-2 rounded-2xl shadow-2xl flex items-center gap-2 border border-blue-400">
            <svg className="animate-spin h-3 w-3 text-white" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span className="text-[10px] font-black uppercase tracking-wider">Sync Active</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
