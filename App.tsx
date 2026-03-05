
import React, { useState, useEffect } from 'react';
import { 
  OrderSubCategory, 
  UserAccount, 
  ViewState,
  PurchaseOrderSubCategory,
  VietnamSubCategory
} from './types';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import OrderView from './components/OrderView';
import InvoiceView from './components/InvoiceView';
import PurchaseOrderView from './components/PurchaseOrderView';
import VietnamOrderView from './components/VietnamOrderView';
import SettingsView from './components/SettingsView';
import AuthView from './components/AuthView';
import Dashboard from './components/Dashboard';
import { pullStateFromCloud, pushStateToCloud, supabase } from './supabase';

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(null);
  const [view, setView] = useState<ViewState>({ type: 'DASHBOARD' });
  const [userAccounts, setUserAccounts] = useState<UserAccount[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [dataVersion, setDataVersion] = useState(0);

  useEffect(() => {
    const initApp = async () => {
      setIsSyncing(true);
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
      setIsSyncing(false);
    };
    initApp();
  }, []);

  useEffect(() => {
    if (!supabase) return;

    const channel = supabase
      .channel('db-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ajin-comm-backup' },
        async () => {
          setIsSyncing(true);
          await pullStateFromCloud();
          setDataVersion(v => v + 1);
          setIsSyncing(false);
        }
      )
      .subscribe();

    const handleSync = async () => {
      if (!currentUser) return;
      setIsSyncing(true);
      const updated = await pullStateFromCloud();
      if (updated) setDataVersion(v => v + 1);
      setIsSyncing(false);
    };

    window.addEventListener('focus', handleSync);
    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener('focus', handleSync);
    };
  }, [currentUser]);

  const handleSetView = async (v: ViewState) => {
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
    } else alert('등록되지 않은 번호입니다.');
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('ajin_active_user');
    setView({ type: 'DASHBOARD' });
    setIsSidebarOpen(false);
  };

  const updateAccounts = async (newAccounts: UserAccount[]) => {
    const masterId = 'AJ5200';
    let finalAccounts = [...newAccounts];
    if (!newAccounts.some(u => u.loginId === masterId)) {
      const masterAcc = userAccounts.find(u => u.loginId === masterId);
      if (masterAcc) finalAccounts.unshift(masterAcc);
    }
    setUserAccounts(finalAccounts);
    localStorage.setItem('ajin_accounts', JSON.stringify(finalAccounts));
    setIsSyncing(true);
    await pushStateToCloud();
    setIsSyncing(false);
  };

  if (isLoading) return <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white"><div className="w-16 h-16 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin mb-4"></div><p>AJIN COMM. ERP Loading...</p></div>;
  if (!currentUser) return <AuthView onLogin={handleLogin} />;
  const isMaster = currentUser.loginId === 'AJ5200';

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden relative">
      <Sidebar currentView={view} setView={handleSetView} user={currentUser} isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header userName={currentUser.initials} isMaster={isMaster} onLogout={handleLogout} onSettings={() => isMaster && handleSetView({ type: 'SETTINGS' })} onHome={() => handleSetView({ type: 'DASHBOARD' })} onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)} isSyncing={isSyncing} />
        <main className="flex-1 overflow-y-auto p-4 md:p-10 custom-scrollbar">
          <div className="max-w-7xl mx-auto">
            {view.type === 'DASHBOARD' && <Dashboard user={currentUser} setView={handleSetView} dataVersion={dataVersion} key={`dash-${dataVersion}`} />}
            {view.type === 'ORDER' && <OrderView key={`order-${view.sub}`} sub={view.sub} currentUser={currentUser} userAccounts={userAccounts} setView={handleSetView} dataVersion={dataVersion} />}
            {view.type === 'INVOICE' && <InvoiceView key={`invoice-${view.sub}`} sub={view.sub} currentUser={currentUser} setView={handleSetView} dataVersion={dataVersion} />}
            {view.type === 'PURCHASE' && <PurchaseOrderView key={`purchase-${view.sub}`} sub={view.sub} currentUser={currentUser} setView={handleSetView} dataVersion={dataVersion} />}
            {view.type === 'VIETNAM' && <VietnamOrderView key={`vietnam-${view.sub}`} sub={view.sub} currentUser={currentUser} setView={handleSetView} dataVersion={dataVersion} />}
            {view.type === 'STORAGE' && <PurchaseOrderView key="storage-view" sub={PurchaseOrderSubCategory.UPLOAD} currentUser={currentUser} setView={handleSetView} dataVersion={dataVersion} />}
            {view.type === 'SETTINGS' && isMaster && <SettingsView accounts={userAccounts} onUpdate={updateAccounts} setView={handleSetView} />}
          </div>
        </main>
      </div>
    </div>
  );
};

export default App;
