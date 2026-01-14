
import React from 'react';

interface HeaderProps {
  userName: string;
  isMaster?: boolean;
  onLogout: () => void;
  onSettings: () => void;
  onHome: () => void;
  onToggleSidebar: () => void;
  isSyncing?: boolean;
}

const Header: React.FC<HeaderProps> = ({ userName, isMaster, onLogout, onSettings, onHome, onToggleSidebar, isSyncing }) => {
  return (
    <header className="h-16 bg-white/80 backdrop-blur-md border-b border-slate-200 flex items-center justify-between px-4 md:px-8 shadow-sm shrink-0 sticky top-0 z-[40]">
      <div className="flex items-center gap-2 md:gap-4">
        <button 
          onClick={onToggleSidebar}
          className="p-2 text-slate-600 hover:bg-slate-100 rounded-xl transition-all active:scale-90"
          aria-label="Menu"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <button 
          onClick={onHome}
          className="font-black text-slate-900 text-lg tracking-tighter hover:text-blue-600 transition-colors hidden sm:block"
        >
          ERP
        </button>
        
        <div className="flex items-center gap-2 ml-2">
          {isSyncing ? (
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 text-blue-600 rounded-full border border-blue-100 animate-pulse">
              <div className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-ping"></div>
              <span className="text-[10px] font-black uppercase tracking-widest">Syncing</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 text-emerald-600 rounded-full border border-emerald-100">
              <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></div>
              <span className="text-[10px] font-black uppercase tracking-widest">Cloud Live</span>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 md:gap-5">
        <div className="hidden md:flex flex-col items-end">
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">User Profile</span>
          <span className="text-sm font-black text-slate-900">{userName}</span>
        </div>
        
        <div className="h-8 w-[1px] bg-slate-200"></div>

        <div className="flex items-center gap-2 md:gap-3">
          {isMaster && (
            <button 
              onClick={onSettings}
              className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
              title="시스템 설정"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          )}
          <button 
            onClick={onLogout}
            className="flex items-center gap-2 px-3 py-1.5 md:px-4 md:py-2 rounded-xl bg-slate-900 text-white hover:bg-red-600 transition-all shadow-lg shadow-slate-200 active:scale-95"
          >
            <span className="text-xs font-bold whitespace-nowrap">Logout</span>
          </button>
        </div>
      </div>
    </header>
  );
};

export default Header;
