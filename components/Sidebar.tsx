
import React from 'react';
import { 
  MainCategory, 
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
        onClick={() => setView({ type, sub } as ViewState)}
        className={`w-full text-left px-3 py-2 text-sm font-medium rounded-md transition-colors ${
          isActive
            ? 'bg-blue-600 text-white shadow-sm'
            : 'hover:bg-slate-800 hover:text-white'
        } ${isNested ? 'ml-4 w-[calc(100%-1rem)] text-xs opacity-80' : ''}`}
      >
        {isNested && <span className="mr-2 opacity-40">└</span>}
        {sub}
      </button>
    );
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 md:hidden" 
          onClick={onClose}
        />
      )}

      {/* Sidebar Content */}
      <div className={`
        fixed inset-y-0 left-0 w-64 bg-slate-900 text-slate-300 flex flex-col z-50 transition-transform duration-300 ease-in-out md:relative md:translate-x-0
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="p-6 flex items-center justify-between">
          <button 
            onClick={() => setView({ type: 'DASHBOARD' })}
            className="text-xl font-bold text-white tracking-wider hover:text-blue-400 transition-colors text-left"
          >
            AJIN COMM.
          </button>
          <button onClick={onClose} className="md:hidden text-slate-400 hover:text-white">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <nav className="flex-1 px-4 space-y-8 mt-4 overflow-y-auto pb-8">
          {/* Orders Category */}
          <div>
            <h2 className="px-2 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              {MainCategory.ORDER}
            </h2>
            <div className="space-y-1">
              {renderSubMenu(OrderSubCategory.CREATE, 'ORDER')}
              {renderSubMenu(OrderSubCategory.PENDING, 'ORDER')}
              {renderSubMenu(OrderSubCategory.REJECTED, 'ORDER')}
              {renderSubMenu(OrderSubCategory.APPROVED, 'ORDER')}
              
              {/* Hierarchical sub-folders for archiving */}
              <div className="mt-1 space-y-1">
                {renderSubMenu(OrderSubCategory.APPROVED_SEOUL, 'ORDER', true)}
                {renderSubMenu(OrderSubCategory.APPROVED_DAECHEON, 'ORDER', true)}
                {renderSubMenu(OrderSubCategory.APPROVED_VIETNAM, 'ORDER', true)}
              </div>
            </div>
          </div>

          {/* Invoice Category */}
          <div>
            <h2 className="px-2 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              {MainCategory.INVOICE}
            </h2>
            <div className="space-y-1">
              {renderSubMenu(InvoiceSubCategory.CREATE, 'INVOICE')}
              {renderSubMenu(InvoiceSubCategory.COMPLETED, 'INVOICE')}
              <div className="mt-1 space-y-1">
                {renderSubMenu(InvoiceSubCategory.SEOUL, 'INVOICE', true)}
                {renderSubMenu(InvoiceSubCategory.DAECHEON, 'INVOICE', true)}
                {renderSubMenu(InvoiceSubCategory.VIETNAM, 'INVOICE', true)}
              </div>
            </div>
          </div>
        </nav>
        
        <div className="p-4 border-t border-slate-800">
          <p className="text-[10px] text-slate-500 text-center">© 2024 AJIN COMMUNICATIONS</p>
        </div>
      </div>
    </>
  );
};

export default Sidebar;
