
import React from 'react';

interface HeaderProps {
  userName: string;
  isMaster?: boolean;
  onLogout: () => void;
  onSettings: () => void;
  onHome: () => void;
}

const Header: React.FC<HeaderProps> = ({ userName, isMaster, onLogout, onSettings, onHome }) => {
  return (
    <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 shadow-sm">
      <div className="flex items-center gap-4">
         <button 
          onClick={onHome}
          className="md:hidden font-bold text-slate-900"
        >
          AJIN COMM.
        </button>
        <div className="hidden md:block h-6 w-[1px] bg-slate-200 mx-2"></div>
        <div className="flex items-center gap-2">
          <span className="text-slate-500 text-sm">반갑습니다, <strong className="text-slate-900">{userName}</strong>님</span>
          {isMaster && (
            <span className="bg-amber-100 text-amber-700 text-[10px] font-bold px-2 py-0.5 rounded-full border border-amber-200">
              MASTER ADMIN
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-4">
        <button 
          onClick={onSettings}
          className="text-sm font-medium text-slate-600 hover:text-blue-600 transition-colors"
        >
          설정
        </button>
        <button 
          onClick={onLogout}
          className="text-sm font-medium px-4 py-2 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 hover:text-red-600 transition-all"
        >
          나가기
        </button>
      </div>
    </header>
  );
};

export default Header;
