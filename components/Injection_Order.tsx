
import React, { useState, useEffect, useCallback } from 'react';
import { 
  InjectionOrderSubCategory, 
  UserAccount, 
  ViewState, 
  PurchaseOrderItem,
  OrderRow
} from '../types';
import InjectionOrderView from './InjectionOrder.tsx';
import PurchaseOrderView from './PurchaseOrderView.tsx'; // Reusing for lists if possible

interface InjectionOrderMainProps {
  sub: InjectionOrderSubCategory;
  currentUser: UserAccount;
  userAccounts: UserAccount[];
  setView: (v: ViewState) => void;
  dataVersion: number;
}

const Injection_Order: React.FC<InjectionOrderMainProps> = ({ 
  sub, 
  currentUser, 
  userAccounts, 
  setView, 
  dataVersion 
}) => {
  const [orders, setOrders] = useState<PurchaseOrderItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    // Load all purchase orders and filter for injection type
    const saved = localStorage.getItem('ajin_purchase_orders');
    if (saved) {
      const allOrders: PurchaseOrderItem[] = JSON.parse(saved);
      const injectionOrders = allOrders.filter(o => o.type === '사출발주서' || o.type === 'PO1');
      setOrders(injectionOrders);
    }
  }, [dataVersion, sub]);

  // Filter orders based on subcategory
  const filteredOrders = orders.filter(order => {
    const matchesSearch = order.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         order.recipient?.toLowerCase().includes(searchTerm.toLowerCase());
    
    if (!matchesSearch) return false;

    if (sub === InjectionOrderSubCategory.PENDING) return order.status === 'PO 결재대기';
    if (sub === InjectionOrderSubCategory.REJECTED) return order.status === 'PO 결재반송';
    if (sub === InjectionOrderSubCategory.APPROVED) return order.status === 'PO 결재완료';
    if (sub === InjectionOrderSubCategory.TEMPORARY) return order.status.includes('임시저장');
    if (sub === InjectionOrderSubCategory.DESTINATION) return order.status === '수신처별 보관함';
    
    return true;
  });

  if (sub === InjectionOrderSubCategory.CREATE) {
    return (
      <InjectionOrderView 
        sub={null as any} 
        currentUser={currentUser}
        userAccounts={userAccounts}
        setView={setView}
        dataVersion={dataVersion}
      />
    );
  }

  const handleRowClick = (order: PurchaseOrderItem) => {
    // Navigate to PurchaseOrderView for editing/viewing
    // We need to map the subcategory back to PurchaseOrderSubCategory
    setView({ type: 'PURCHASE', sub: order.status as any });
    // Note: This might not work perfectly if the status string doesn't match the enum exactly
    // but PurchaseOrderView seems to handle strings too.
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 overflow-hidden">
      <div className="p-6 bg-white border-b border-slate-200 shrink-0">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">{sub}</h1>
            <p className="text-sm text-slate-500 font-medium">사출발주서 관리 시스템</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <input 
                type="text" 
                placeholder="검색어 입력..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2 bg-slate-100 border-none rounded-xl text-sm focus:ring-2 focus:ring-orange-500 w-64 font-medium"
              />
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          </div>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
        {filteredOrders.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredOrders.map(order => (
              <button 
                key={order.id}
                onClick={() => handleRowClick(order)}
                className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:border-orange-500 transition-all text-left group"
              >
                <div className="flex justify-between items-start mb-3">
                  <span className="px-2 py-1 bg-orange-50 text-orange-600 text-[10px] font-black rounded-md uppercase tracking-wider border border-orange-100">
                    {order.type}
                  </span>
                  <span className="text-[10px] font-mono text-slate-400 font-bold">{order.date}</span>
                </div>
                <h3 className="text-lg font-black text-slate-900 mb-1 group-hover:text-orange-600 transition-colors line-clamp-1">{order.title}</h3>
                <p className="text-xs text-slate-500 font-bold mb-4 flex items-center gap-1">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  {order.authorId}
                </p>
                <div className="flex justify-between items-center pt-3 border-t border-slate-50">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{order.recipient || '수신처 미지정'}</span>
                  <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center group-hover:bg-orange-500 transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-400 group-hover:text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-slate-400 italic py-20">
            <div className="w-20 h-20 bg-white rounded-3xl border border-slate-100 flex items-center justify-center mb-4 shadow-sm">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-slate-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <p>표시할 데이터가 없습니다.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Injection_Order;
