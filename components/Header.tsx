
import React from 'react';

interface HeaderProps {
  userName: string;
  isMaster?: boolean;
  onLogout: () => void;
  onSettings: () => void;
  onHome: () => void;
  onToggleSidebar: () => void;
}

const Header: React.FC<HeaderProps> = ({ userName, isMaster, onLogout, onSettings, onHome, onToggleSidebar }) => {
  return (
    <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 md:px-8 shadow-sm shrink-0">
      <div className="flex items-center gap-2 md:gap-4">
        <button 
          onClick={onToggleSidebar}
          className="md:hidden p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          aria-label="Menu"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <button 
          onClick={onHome}
          className="font-bold text-slate-900 md:text-lg"
        >
          ERP
        </button>
        <div className="hidden md:block h-6 w-[1px] bg-slate-200 mx-2"></div>
        <div className="flex items-center gap-1 md:gap-2">
          <span className="text-slate-500 text-xs md:text-sm">반갑습니다, <strong className="text-slate-900">{userName}</strong>님</span>
          {isMaster && (
            <span className="bg-amber-100 text-amber-700 text-[8px] md:text-[10px] font-bold px-1.5 md:px-2 py-0.5 rounded-full border border-amber-200 whitespace-nowrap">
              MASTER
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 md:gap-4">
        <button 
          onClick={onSettings}
          className="text-xs md:text-sm font-medium text-slate-600 hover:text-blue-600 transition-colors"
        >
          설정
        </button>
        <button 
          onClick={onLogout}
          className="text-xs md:text-sm font-medium px-3 md:px-4 py-1.5 md:py-2 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 hover:text-red-600 transition-all"
        >
          나가기
        </button>
      </div>
    </header>
  );
};

export default Header;
