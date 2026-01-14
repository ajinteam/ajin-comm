
import React from 'react';
import { 
  OrderSubCategory, 
  InvoiceSubCategory, 
  ViewState,
  UserAccount
} from '../types';

interface SidebarProps {
  currentView: ViewState;
  setView: (v: ViewState) => void;
  user: UserAccount;
  isOpen: boolean;
  onClose: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ currentView, setView, user, isOpen, onClose }) => {
  const isMaster = user.loginId === 'AJ5200';

  const isVisible = (menuName: string) => {
    if (isMaster) return true;
    return user.allowedMenus?.includes(menuName);
  };

  const renderSubMenu = (sub: string, type: 'ORDER' | 'INVOICE', isNested: boolean = false) => {
    if (!isVisible(sub)) return null;

    const isActive = (currentView.type === type && (currentView as any).sub === sub);

    return (
      <button
        key={sub}
        onClick={() => {
          setView({ type, sub } as ViewState);
          onClose();
        }}
        className={`w-full text-left px-4 py-2.5 text-sm font-semibold rounded-xl transition-all ${
          isActive
            ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20 translate-x-1'
            : 'text-slate-400 hover:bg-slate-800 hover:text-white'
        } ${isNested ? 'ml-4 w-[calc(100%-1rem)] text-xs' : ''}`}
      >
        {isNested && <span className="mr-2 opacity-30">└</span>}
        {sub}
      </button>
    );
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden transition-opacity" 
          onClick={onClose}
        />
      )}

      {/* Sidebar Content */}
      <div className={`
        fixed inset-y-0 left-0 w-72 bg-slate-950 text-slate-300 flex flex-col z-50 transition-transform duration-500 cubic-bezier(0.4, 0, 0.2, 1) md:relative md:translate-x-0 border-r border-slate-800
        ${isOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'}
      `}>
        <div className="p-8 flex items-center justify-between">
          <button 
            onClick={() => { setView({ type: 'DASHBOARD' }); onClose(); }}
            className="group flex items-center gap-3 focus:outline-none"
          >
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20 group-hover:scale-110 transition-transform">
              <span className="text-white font-black text-xl">A</span>
            </div>
            <div className="flex flex-col">
              <span className="text-lg font-black text-white leading-none tracking-tight">AJIN COMM.</span>
              <span className="text-[10px] text-blue-500 font-bold tracking-widest uppercase">ERP System</span>
            </div>
          </button>
          <button onClick={onClose} className="md:hidden p-2 text-slate-500 hover:text-white transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <nav className="flex-1 px-4 space-y-8 mt-4 overflow-y-auto pb-8 custom-scrollbar">
          {/* Order Management Group */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 px-3 mb-2">
              <div className="w-1 h-4 bg-blue-500 rounded-full"></div>
              <h2 className="text-[11px] font-black text-slate-500 uppercase tracking-[0.2em]">
                주문서
              </h2>
            </div>
            <div className="space-y-1">
              {renderSubMenu(OrderSubCategory.CREATE, 'ORDER')}
              {renderSubMenu(OrderSubCategory.PENDING, 'ORDER')}
              {renderSubMenu(OrderSubCategory.REJECTED, 'ORDER')}
              {renderSubMenu(OrderSubCategory.APPROVED, 'ORDER')}
              
              <div className="mt-4 pt-4 border-t border-slate-900/50">
                <p className="px-4 text-[10px] text-slate-600 font-bold mb-2 uppercase tracking-wider">완료 보관함</p>
                {renderSubMenu(OrderSubCategory.APPROVED_SEOUL, 'ORDER', true)}
                {renderSubMenu(OrderSubCategory.APPROVED_DAECHEON, 'ORDER', true)}
                {renderSubMenu(OrderSubCategory.APPROVED_VIETNAM, 'ORDER', true)}
              </div>
            </div>
          </div>

          {/* Invoice Management Group */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 px-3 mb-2">
              <div className="w-1 h-4 bg-emerald-500 rounded-full"></div>
              <h2 className="text-[11px] font-black text-slate-500 uppercase tracking-[0.2em]">
                송장
              </h2>
            </div>
            <div className="space-y-1">
              {renderSubMenu(InvoiceSubCategory.CREATE, 'INVOICE')}
              {renderSubMenu(InvoiceSubCategory.COMPLETED, 'INVOICE')}
              
              <div className="mt-4 pt-4 border-t border-slate-900/50">
                <p className="px-4 text-[10px] text-slate-600 font-bold mb-2 uppercase tracking-wider">지역별 분류</p>
                {renderSubMenu(InvoiceSubCategory.SEOUL, 'INVOICE', true)}
                {renderSubMenu(InvoiceSubCategory.DAECHEON, 'INVOICE', true)}
                {renderSubMenu(InvoiceSubCategory.VIETNAM, 'INVOICE', true)}
              </div>
            </div>
          </div>
        </nav>
        
        <div className="p-6 border-t border-slate-900 bg-slate-950/50">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center border border-slate-700">
              <span className="text-[10px] font-bold text-slate-400">{user.initials.slice(0, 2)}</span>
            </div>
            <div className="flex flex-col overflow-hidden">
              <span className="text-xs font-bold text-white truncate">{user.initials}</span>
              <span className="text-[9px] text-slate-500 uppercase tracking-tighter">Authorized Session</span>
            </div>
          </div>
          <p className="mt-4 text-[9px] text-slate-600 font-medium text-center tracking-tighter uppercase opacity-50">© 2024 AJIN COMMUNICATIONS</p>
        </div>
      </div>
    </>
  );
};

export default Sidebar;
