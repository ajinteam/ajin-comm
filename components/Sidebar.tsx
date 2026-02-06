
import React, { useState } from 'react';
import { 
  OrderSubCategory, 
  InvoiceSubCategory, 
  PurchaseOrderSubCategory,
  VietnamSubCategory,
  ViewState,
  UserAccount,
  MainCategory
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
  const [isPOWritingExpanded, setIsPOWritingExpanded] = useState(false);
  const [isVNWritingExpanded, setIsVNWritingExpanded] = useState(false);
  const [isVNCompletedExpanded, setIsVNCompletedExpanded] = useState(false);

  const isVisible = (menuName: string) => {
    if (isMaster) return true;
    return user.allowedMenus?.includes(menuName);
  };

  const renderSubMenu = (sub: string, type: 'ORDER' | 'INVOICE' | 'PURCHASE' | 'VIETNAM', isNested: boolean = false) => {
    if (!isVisible(sub)) return null;

    const isActive = (currentView.type === type && (currentView as any).sub === sub);
    
    let activeBg = 'bg-blue-600';
    if (type === 'INVOICE') activeBg = 'bg-emerald-600';
    if (type === 'PURCHASE') activeBg = 'bg-amber-600';
    if (type === 'VIETNAM') activeBg = 'bg-indigo-600';

    const isExpandable = (sub === PurchaseOrderSubCategory.CREATE || sub === VietnamSubCategory.CREATE_ROOT || sub === VietnamSubCategory.COMPLETED_ROOT);

    return (
      <button
        key={sub}
        onClick={() => {
          if (sub === PurchaseOrderSubCategory.CREATE) setIsPOWritingExpanded(!isPOWritingExpanded);
          if (sub === VietnamSubCategory.CREATE_ROOT) setIsVNWritingExpanded(!isVNWritingExpanded);
          if (sub === VietnamSubCategory.COMPLETED_ROOT) setIsVNCompletedExpanded(!isVNCompletedExpanded);

          setView({ type, sub } as ViewState);
          if (!isNested && !isExpandable) {
            onClose();
          }
        }}
        className={`w-full text-left px-4 py-2 text-sm font-semibold rounded-xl transition-all flex items-center justify-between ${
          isActive
            ? `${activeBg} text-white shadow-lg translate-x-1`
            : 'text-slate-400 hover:bg-slate-800 hover:text-white'
        } ${isNested ? 'ml-4 w-[calc(100%-1rem)] text-xs' : ''}`}
      >
        <div className="flex items-center">
          {isNested && <span className="mr-2 opacity-30">└</span>}
          {sub}
        </div>
        {isExpandable && (
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            className={`h-3 w-3 transition-transform duration-300 ${
              (sub === PurchaseOrderSubCategory.CREATE && isPOWritingExpanded) || 
              (sub === VietnamSubCategory.CREATE_ROOT && isVNWritingExpanded) ||
              (sub === VietnamSubCategory.COMPLETED_ROOT && isVNCompletedExpanded) ? 'rotate-180' : ''
            }`} 
            fill="none" 
            viewBox="0 0 24 24" 
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </button>
    );
  };

  return (
    <>
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden transition-opacity" 
          onClick={onClose}
        />
      )}

      <div className={`
        fixed inset-y-0 left-0 w-72 bg-slate-950 text-slate-300 flex flex-col z-50 transition-transform duration-500 md:relative md:translate-x-0 border-r border-slate-800
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

        <nav className="flex-1 px-4 space-y-6 mt-4 overflow-y-auto pb-8 custom-scrollbar">
          {isVisible(MainCategory.ORDER) && (
            <div className="space-y-1">
              <div className="flex items-center gap-2 px-3 py-2 bg-slate-900/50 rounded-xl border border-slate-800 mb-2">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <h2 className="text-xs font-black text-slate-200 uppercase tracking-widest">주문서</h2>
              </div>
              <div className="space-y-0.5 ml-2 border-l border-slate-800">
                {renderSubMenu(OrderSubCategory.CREATE, 'ORDER')}
                {renderSubMenu(OrderSubCategory.PENDING, 'ORDER')}
                <div className="transition-opacity">
                  {renderSubMenu(OrderSubCategory.REJECTED, 'ORDER')}
                  {renderSubMenu(OrderSubCategory.APPROVED, 'ORDER')}
                  <div className="mt-2 pl-4 border-l border-slate-800/50">
                    {renderSubMenu(OrderSubCategory.APPROVED_SEOUL, 'ORDER', true)}
                    {renderSubMenu(OrderSubCategory.APPROVED_DAECHEON, 'ORDER', true)}
                    {renderSubMenu(OrderSubCategory.APPROVED_VIETNAM, 'ORDER', true)}
                  </div>
                </div>
              </div>
            </div>
          )}

          {isVisible(MainCategory.INVOICE) && (
            <div className="space-y-1">
              <div className="flex items-center gap-2 px-3 py-2 bg-slate-900/50 rounded-xl border border-slate-800 mb-2">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <h2 className="text-xs font-black text-slate-200 uppercase tracking-widest">송장</h2>
              </div>
              <div className="space-y-0.5 ml-2 border-l border-slate-800">
                {renderSubMenu(InvoiceSubCategory.CREATE, 'INVOICE')}
                {renderSubMenu(InvoiceSubCategory.TEMPORARY, 'INVOICE')}
                <div className="transition-opacity">
                  {renderSubMenu(InvoiceSubCategory.COMPLETED, 'INVOICE')}
                  <div className="mt-2 pl-4 border-l border-slate-800/50">
                    {renderSubMenu(InvoiceSubCategory.SEOUL, 'INVOICE', true)}
                    {renderSubMenu(InvoiceSubCategory.DAECHEON, 'INVOICE', true)}
                    {renderSubMenu(InvoiceSubCategory.VIETNAM, 'INVOICE', true)}
                  </div>
                </div>
              </div>
            </div>
          )}

          {isVisible(MainCategory.PURCHASE) && (
            <div className="space-y-1">
              <div className="flex items-center gap-2 px-3 py-2 bg-slate-900/50 rounded-xl border border-slate-800 mb-2">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
                <h2 className="text-xs font-black text-slate-200 uppercase tracking-widest">발주서</h2>
              </div>
              <div className="space-y-0.5 ml-2 border-l border-slate-800">
                {renderSubMenu(PurchaseOrderSubCategory.CREATE, 'PURCHASE')}
                {isPOWritingExpanded && (
                  <div className="space-y-0.5 overflow-hidden animate-in slide-in-from-top-2 duration-300">
                    {renderSubMenu(PurchaseOrderSubCategory.PO1, 'PURCHASE', true)}
                    {renderSubMenu(PurchaseOrderSubCategory.PO1_TEMP, 'PURCHASE', true)}
                    {renderSubMenu(PurchaseOrderSubCategory.PO2, 'PURCHASE', true)}
                    {renderSubMenu(PurchaseOrderSubCategory.PO2_TEMP, 'PURCHASE', true)}
                    {renderSubMenu(PurchaseOrderSubCategory.PO3, 'PURCHASE', true)}
                    {renderSubMenu(PurchaseOrderSubCategory.PO3_TEMP, 'PURCHASE', true)}
                  </div>
                )}
                {renderSubMenu(PurchaseOrderSubCategory.PENDING, 'PURCHASE')}
                {renderSubMenu(PurchaseOrderSubCategory.REJECTED, 'PURCHASE')}
                {renderSubMenu(PurchaseOrderSubCategory.APPROVED, 'PURCHASE')}
                {renderSubMenu(PurchaseOrderSubCategory.ARCHIVE, 'PURCHASE')}
              </div>
            </div>
          )}

          {isVisible(MainCategory.VIETNAM) && (
            <div className="space-y-1">
              <div className="flex items-center gap-2 px-3 py-2 bg-slate-900/50 rounded-xl border border-slate-800 mb-2">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <h2 className="text-xs font-black text-slate-200 uppercase tracking-widest">VN베트남</h2>
              </div>
              <div className="space-y-0.5 ml-2 border-l border-slate-800">
                {renderSubMenu(VietnamSubCategory.CREATE_ROOT, 'VIETNAM')}
                {isVNWritingExpanded && (
                  <div className="space-y-0.5 overflow-hidden animate-in slide-in-from-top-2 duration-300">
                    {renderSubMenu(VietnamSubCategory.ORDER, 'VIETNAM', true)}
                    {renderSubMenu(VietnamSubCategory.PAYMENT, 'VIETNAM', true)}
                    {renderSubMenu(VietnamSubCategory.TEMPORARY, 'VIETNAM', true)}
                  </div>
                )}
                {renderSubMenu(VietnamSubCategory.PENDING, 'VIETNAM')}
                {renderSubMenu(VietnamSubCategory.REJECTED, 'VIETNAM')}
                {renderSubMenu(VietnamSubCategory.COMPLETED_ROOT, 'VIETNAM')}
                {isVNCompletedExpanded && (
                  <div className="space-y-0.5 overflow-hidden animate-in slide-in-from-top-2 duration-300">
                    {renderSubMenu(VietnamSubCategory.ORDER_COMPLETED, 'VIETNAM', true)}
                    {renderSubMenu(VietnamSubCategory.PAYMENT_COMPLETED, 'VIETNAM', true)}
                  </div>
                )}
              </div>
            </div>
          )}

          {isVisible(MainCategory.STORAGE) && (
            <div className="space-y-1">
              <div className="flex items-center gap-2 px-3 py-2 bg-slate-900/50 rounded-xl border border-slate-800 mb-2">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                <h2 className="text-xs font-black text-slate-200 uppercase tracking-widest">파일관리</h2>
              </div>
              <div className="space-y-0.5 ml-2 border-l border-slate-800">
                <button
                  onClick={() => {
                    setView({ type: 'STORAGE' });
                    onClose();
                  }}
                  className={`w-full text-left px-4 py-2 text-sm font-semibold rounded-xl transition-all flex items-center justify-between ${
                    currentView.type === 'STORAGE'
                      ? 'bg-rose-600 text-white shadow-lg translate-x-1'
                      : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  파일 업로드
                </button>
              </div>
            </div>
          )}
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