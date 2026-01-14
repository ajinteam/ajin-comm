
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
  // 1. 새로고침 시 로그인 유지 로직
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(() => {
    const saved = localStorage.getItem('ajin_active_user');
    return saved ? JSON.parse(saved) : null;
  });
  
  const [view, setView] = useState<ViewState>({ type: 'DASHBOARD' });
  const [userAccounts, setUserAccounts] = useState<UserAccount[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [dataVersion, setDataVersion] = useState(0); // 실시간 갱신 트리거

  // 초기 앱 로드 및 마스터 계정 보장
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

  // 2. 실시간 동기화 (Supabase Realtime)
  useEffect(() => {
    if (!supabase) return;

    // ajin-comm-backup 테이블의 id=1 로우가 변경될 때마다 데이터를 다시 가져옴
    const channel = supabase
      .channel('realtime-sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ajin-comm-backup' },
        async () => {
          console.log('Detected cloud change, pulling...');
          await pullStateFromCloud();
          setDataVersion(v => v + 1); // 하위 뷰들에게 리로드 알림
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // 새로고침 방지 (동기화 중)
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
      localStorage.setItem('ajin_active_user', JSON.stringify(found));
      setView({ type: 'DASHBOARD' });
    } else {
      alert('등록되지 않은 번호입니다.');
    }
  };

  const handleLogout = () => {
    if (isSyncing) return;
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
          userName={currentUser.initials} 
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
          {/* dataVersion을 key로 활용하여 동기화 시 강제 리렌더링 (구조 유지하면서 갱신) */}
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
        </main>
      </div>
    </div>
  );
};

export default App;
