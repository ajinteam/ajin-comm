
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

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(null);
  const [view, setView] = useState<ViewState>({ type: 'DASHBOARD' });
  const [userAccounts, setUserAccounts] = useState<UserAccount[]>([]);

  // Load accounts from local storage on mount
  useEffect(() => {
    const saved = localStorage.getItem('ajin_accounts');
    let accounts: UserAccount[] = saved ? JSON.parse(saved) : [];
    
    // Ensure AJ5200 (Master Account) always exists
    const masterId = 'AJ5200';
    if (!accounts.find(u => u.loginId === masterId)) {
      accounts.unshift({ 
        id: 'master-001', 
        loginId: masterId, 
        initials: 'MASTER',
        createdAt: new Date().toISOString(),
        allowedMenus: [] // Master has all anyway
      });
    }

    setUserAccounts(accounts);
    localStorage.setItem('ajin_accounts', JSON.stringify(accounts));
  }, []);

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
    setCurrentUser(null);
    setView({ type: 'DASHBOARD' });
  };

  const updateAccounts = (newAccounts: UserAccount[]) => {
    setUserAccounts(prev => {
      const masterId = 'AJ5200';
      // Ensure master is never lost during updates
      const masterExists = newAccounts.some(u => u.loginId === masterId);
      let finalAccounts = [...newAccounts];
      
      if (!masterExists) {
        const masterAcc = prev.find(u => u.loginId === masterId);
        if (masterAcc) finalAccounts.unshift(masterAcc);
      }
      
      localStorage.setItem('ajin_accounts', JSON.stringify(finalAccounts));
      return finalAccounts;
    });
  };

  if (!currentUser) {
    return <AuthView onLogin={handleLogin} />;
  }

  const isMaster = currentUser.loginId === 'AJ5200';

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      <Sidebar currentView={view} setView={setView} user={currentUser} />
      
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header 
          userName={currentUser.loginId} 
          isMaster={isMaster}
          onLogout={handleLogout} 
          onSettings={() => {
            if (isMaster) setView({ type: 'SETTINGS' });
            else alert('설정 권한이 없습니다.');
          }}
          onHome={() => setView({ type: 'DASHBOARD' })}
        />
        
        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          {view.type === 'DASHBOARD' && <Dashboard user={currentUser} setView={setView} />}
          {view.type === 'ORDER' && (
            <OrderView 
              sub={view.sub} 
              currentUser={currentUser}
              userAccounts={userAccounts}
              setView={setView}
            />
          )}
          {view.type === 'INVOICE' && (
            <InvoiceView 
              sub={view.sub} 
              currentUser={currentUser} 
            />
          )}
          {view.type === 'SETTINGS' && isMaster && (
            <SettingsView 
              accounts={userAccounts} 
              onUpdate={updateAccounts}
              setView={setView}
            />
          )}
        </main>
      </div>
    </div>
  );
};

export default App;
