
import React, { useState, useEffect } from 'react';
import { 
  UserAccount, 
  OrderSubCategory, 
  InvoiceSubCategory, 
  PurchaseOrderSubCategory, 
  VietnamSubCategory,
  InjectionOrderSubCategory,
  ViewState, 
  Announcement,
  MainCategory 
} from '../types';
import { pushStateToCloud, saveRecipient, deleteRecipient } from '../supabase';

interface DashboardProps {
  user: UserAccount;
  setView: (v: ViewState) => void | Promise<void>;
  dataVersion?: number;
}

const Dashboard: React.FC<DashboardProps> = ({ user, setView, dataVersion }) => {
  const isMaster = user.loginId === 'AJ5200';
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [newNotice, setNewNotice] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  // 카운트 상태 관리
  const [counts, setCounts] = useState({
    order: { pending: 0, rejected: 0, approved: 0 },
    invoice: { completed: 0 },
    purchase: { pending: 0, rejected: 0, approved: 0 },
    injection: { pending: 0, rejected: 0, approved: 0, inbox: 0 },
    vietnam: { pending: 0, rejected: 0, completed: 0 }
  });

  useEffect(() => {
    // 공지 / 요청사항 로드
    const savedNotices = localStorage.getItem('ajin_notices');
    if (savedNotices) {
      setAnnouncements(JSON.parse(savedNotices));
    }

    // 모든 문서 데이터 로드 및 카운트 집계
    const orders = JSON.parse(localStorage.getItem('ajin_orders') || '[]');
    const invoices = JSON.parse(localStorage.getItem('ajin_invoices') || '[]');
    const pOrders = JSON.parse(localStorage.getItem('ajin_purchase_orders') || '[]');
    const vOrders = JSON.parse(localStorage.getItem('ajin_vietnam_orders') || '[]');
    const injectionOrders = JSON.parse(localStorage.getItem('ajin_injection_orders') || '[]');

    setCounts({
      order: {
        pending: orders.filter((o: any) => o.status === OrderSubCategory.PENDING).length,
        rejected: orders.filter((o: any) => o.status === OrderSubCategory.REJECTED).length,
        approved: orders.filter((o: any) => o.status === OrderSubCategory.APPROVED).length
      },
      invoice: {
        completed: invoices.filter((inv: any) => 
      inv.status === '결재대기' && 
      (!inv.type || inv.type === '일반' || inv.type === InvoiceSubCategory.COMPLETED)
    ).length
  },
      purchase: {
        pending: pOrders.filter((o: any) => o.code !== 'INJECTION' && o.status === PurchaseOrderSubCategory.PENDING).length,
        rejected: pOrders.filter((o: any) => o.code !== 'INJECTION' && o.status === PurchaseOrderSubCategory.REJECTED).length,
        approved: pOrders.filter((o: any) => 
    o.code !== 'INJECTION' &&
    o.status === PurchaseOrderSubCategory.APPROVED && 
    (!o.type || o.type === '일반' || o.type === PurchaseOrderSubCategory.APPROVED)
  ).length
},
      injection: {
        pending: injectionOrders.filter((o: any) => o.status === InjectionOrderSubCategory.PENDING).length,
        rejected: injectionOrders.filter((o: any) => o.status === InjectionOrderSubCategory.REJECTED).length,
        approved: injectionOrders.filter((o: any) => o.status === InjectionOrderSubCategory.APPROVED).length,
        inbox: injectionOrders.filter((o: any) => o.status === InjectionOrderSubCategory.INBOX).length
      },
      vietnam: {
        pending: vOrders.filter((o: any) => o.status === VietnamSubCategory.PENDING).length,
        rejected: vOrders.filter((o: any) => o.status === VietnamSubCategory.REJECTED).length,
        completed: vOrders.filter((o: any) => o.status === VietnamSubCategory.COMPLETED_ROOT).length
      }
    });
  }, [dataVersion]);

  const isVisible = (menuName: string) => {
    if (isMaster) return true;
    if (user.allowedMenus?.includes(menuName)) return true;

    // Check if it's a sub-category and its parent is allowed
    const orderSubs = Object.values(OrderSubCategory) as string[];
    const invoiceSubs = Object.values(InvoiceSubCategory) as string[];
    const purchaseSubs = Object.values(PurchaseOrderSubCategory) as string[];
    const vietnamSubs = Object.values(VietnamSubCategory) as string[];
    const injectionSubs = Object.values(InjectionOrderSubCategory) as string[];

    if (orderSubs.includes(menuName) && user.allowedMenus?.includes(MainCategory.ORDER)) return true;
    if (invoiceSubs.includes(menuName) && user.allowedMenus?.includes(MainCategory.INVOICE)) return true;
    if (purchaseSubs.includes(menuName) && user.allowedMenus?.includes(MainCategory.PURCHASE)) return true;
    if (injectionSubs.includes(menuName) && user.allowedMenus?.includes(MainCategory.INJECTION_ORDER_MAIN)) return true;
    if (vietnamSubs.includes(menuName) && user.allowedMenus?.includes(MainCategory.VIETNAM)) return true;

    return false;
  };

  const saveNotices = (notices: Announcement[]) => {
    setAnnouncements(notices);
    localStorage.setItem('ajin_notices', JSON.stringify(notices));
    pushStateToCloud(); // 공지 / 요청사항은 즉시 반영
  };

  const handleAddNotice = async () => {
    if (!newNotice.trim()) return;
    if (editingId) {
      const updated = announcements.map(n => n.id === editingId ? { ...n, content: newNotice } : n);
      
      // Supabase recipients 테이블에 먼저 저장 (동기화 레이스 컨디션 방지)
      await saveRecipient({
        id: `notice-${editingId}`,
        name: 'NOTICE',
        remark: newNotice,
        category: 'NOTICE'
      });

      saveNotices(updated);
      setEditingId(null);
    } else {
      const id = Date.now().toString();
      const notice: Announcement = {
        id,
        content: newNotice,
        date: new Date().toLocaleDateString('ko-KR').replace(/\.$/, ''),
        isNew: true
      };

      // Supabase recipients 테이블에 먼저 저장 (동기화 레이스 컨디션 방지)
      await saveRecipient({
        id: `notice-${id}`,
        name: 'NOTICE',
        remark: newNotice,
        category: 'NOTICE'
      });

      saveNotices([notice, ...announcements]);
    }
    setNewNotice('');
  };

  const handleDeleteNotice = async (id: string) => {
    if (!confirm('정말 삭제하시겠습니까?')) return;
    await deleteRecipient(`notice-${id}`);
    saveNotices(announcements.filter(n => n.id !== id));
  };

  const startEdit = (n: Announcement) => {
    setNewNotice(n.content);
    setEditingId(n.id);
  };

  const StatCard = ({ title, count, onClick, colorClass, statusLabel }: any) => {
    if (!isVisible(statusLabel)) return null;
    return (
      <button 
        onClick={onClick}
        className={`bg-white p-3 md:p-5 landscape:p-2.5 rounded-xl md:rounded-2xl shadow-sm border border-slate-200 hover:border-${colorClass}-500 hover:shadow-md transition-all text-left group`}
      >
        <p className="text-slate-400 text-[9px] md:text-xs landscape:text-[8px] font-bold uppercase tracking-wider mb-1">{title}</p>
        <div className="flex items-end justify-between">
          <p className={`text-lg md:text-2xl landscape:text-base font-black text-slate-900 ${count > 0 ? 'animate-blink' : ''}`}>
            {count} <span className="text-xs md:sm landscape:text-[10px] font-medium text-slate-400">건</span>
          </p>
          <div className={`w-7 h-7 md:w-8 md:h-8 landscape:w-6 landscape:h-6 rounded-lg bg-${colorClass}-50 flex items-center justify-center group-hover:bg-${colorClass}-500 transition-colors`}>
            <svg xmlns="http://www.w3.org/2000/svg" className={`h-3.5 w-3.5 md:h-4 md:w-4 landscape:h-3 landscape:w-3 text-${colorClass}-600 group-hover:text-white`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </div>
      </button>
    );
  };

  const CategorySection = ({ title, mainCat, children }: any) => {
    if (!isVisible(mainCat)) return null;
    return (
      <div className="space-y-2 md:space-y-3">
        <h3 className="text-[10px] md:text-xs font-black text-slate-400 uppercase tracking-[0.2em] ml-1">{title}</h3>
        <div className="grid grid-cols-2 landscape:grid-cols-3 sm:grid-cols-2 lg:grid-cols-3 gap-2 md:gap-4">
          {children}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4 md:space-y-12 animate-in fade-in duration-700">
      <div className="flex flex-col landscape:flex-row md:flex-row justify-between items-start gap-4 mb-4 md:mb-10">
        <div className="space-y-1">
          <h2 className="text-xl md:text-4xl font-black text-slate-900 tracking-tight">대시보드</h2>
          <p className="text-slate-500 text-[9px] md:text-sm font-medium uppercase tracking-wider">System Status & Announcements</p>
        </div>
        <div className={`w-full md:w-auto px-3 py-1.5 md:px-4 md:py-2 rounded-xl md:rounded-2xl border flex items-center justify-between md:justify-start gap-2 md:gap-3 ${isMaster ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-200'}`}>
          <div className="flex items-center gap-2">
            <div className={`w-1 h-1 md:w-2 md:h-2 rounded-full ${isMaster ? 'bg-amber-500 animate-ping' : 'bg-emerald-500 animate-pulse'}`}></div>
            <span className="text-[9px] md:text-xs font-black text-slate-700 uppercase tracking-tight">{user.initials} {isMaster && '(MASTER)'}</span>
          </div>
          <span className="md:hidden text-[7px] font-bold text-slate-400 uppercase tracking-widest">Active Session</span>
        </div>
      </div>

      <div className="space-y-6 md:space-y-12">
        {/* 사출발주서 섹션 */}
        <CategorySection title="사출발주서 현황" mainCat={MainCategory.INJECTION_ORDER_MAIN}>
          <StatCard title="사출 결재대기" count={counts.injection.pending} colorClass="orange" statusLabel={InjectionOrderSubCategory.PENDING} onClick={() => setView({ type: 'INJECTION_ORDER_MAIN', sub: InjectionOrderSubCategory.PENDING })} />
          <StatCard title="사출 결재반송" count={counts.injection.rejected} colorClass="rose" statusLabel={InjectionOrderSubCategory.REJECTED} onClick={() => setView({ type: 'INJECTION_ORDER_MAIN', sub: InjectionOrderSubCategory.REJECTED })} />
          <StatCard title="사출 결재완료" count={counts.injection.approved} colorClass="amber" statusLabel={InjectionOrderSubCategory.APPROVED} onClick={() => setView({ type: 'INJECTION_ORDER_MAIN', sub: InjectionOrderSubCategory.APPROVED })} />
        </CategorySection>

        {/* 주문서 섹션 */}
        <CategorySection title="주문서 현황" mainCat={MainCategory.ORDER}>
          <StatCard title="결재대기" count={counts.order.pending} colorClass="blue" statusLabel={OrderSubCategory.PENDING} onClick={() => setView({ type: 'ORDER', sub: OrderSubCategory.PENDING })} />
          <StatCard title="결재반송" count={counts.order.rejected} colorClass="red" statusLabel={OrderSubCategory.REJECTED} onClick={() => setView({ type: 'ORDER', sub: OrderSubCategory.REJECTED })} />
          <StatCard title="결재완료" count={counts.order.approved} colorClass="indigo" statusLabel={OrderSubCategory.APPROVED} onClick={() => setView({ type: 'ORDER', sub: OrderSubCategory.APPROVED })} />
        </CategorySection>

        {/* 송장 섹션 */}
        <CategorySection title="송장 현황" mainCat={MainCategory.INVOICE}>
          <StatCard title="송장완료" count={counts.invoice.completed} colorClass="emerald" statusLabel={InvoiceSubCategory.COMPLETED} onClick={() => setView({ type: 'INVOICE', sub: InvoiceSubCategory.COMPLETED })} />
        </CategorySection>

        {/* 발주서 섹션 */}
        <CategorySection title="발주서 현황" mainCat={MainCategory.PURCHASE}>
          <StatCard title="PO 결재대기" count={counts.purchase.pending} colorClass="amber" statusLabel={PurchaseOrderSubCategory.PENDING} onClick={() => setView({ type: 'PURCHASE', sub: PurchaseOrderSubCategory.PENDING })} />
          <StatCard title="PO 결재반송" count={counts.purchase.rejected} colorClass="orange" statusLabel={PurchaseOrderSubCategory.REJECTED} onClick={() => setView({ type: 'PURCHASE', sub: PurchaseOrderSubCategory.REJECTED })} />
          <StatCard title="PO 결재완료" count={counts.purchase.approved} colorClass="yellow" statusLabel={PurchaseOrderSubCategory.APPROVED} onClick={() => setView({ type: 'PURCHASE', sub: PurchaseOrderSubCategory.APPROVED })} />
        </CategorySection>

        {/* 베트남 섹션 */}
        <CategorySection title="VN베트남 현황" mainCat={MainCategory.VIETNAM}>
          <StatCard title="VN 결재대기" count={counts.vietnam.pending} colorClass="indigo" statusLabel={VietnamSubCategory.PENDING} onClick={() => setView({ type: 'VIETNAM', sub: VietnamSubCategory.PENDING })} />
          <StatCard title="VN 결재반송" count={counts.vietnam.rejected} colorClass="rose" statusLabel={VietnamSubCategory.REJECTED} onClick={() => setView({ type: 'VIETNAM', sub: VietnamSubCategory.REJECTED })} />
          <StatCard title="VN 결재완료" count={counts.vietnam.completed} colorClass="violet" statusLabel={VietnamSubCategory.COMPLETED_ROOT} onClick={() => setView({ type: 'VIETNAM', sub: VietnamSubCategory.COMPLETED_ROOT })} />
        </CategorySection>
      </div>

      <div className="bg-white p-6 md:p-8 rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex justify-between items-center mb-8">
          <h3 className="text-xl font-black flex items-center gap-3">
            <div className="w-2 h-6 bg-slate-900 rounded-full"></div>
            공지 / 요청사항
          </h3>
        </div>

        <div className="mb-8 p-5 bg-slate-50 rounded-2xl border border-slate-200">
          <p className="text-[10px] font-black text-slate-400 mb-3 uppercase tracking-widest">Notice & Request Administration</p>
          <div className="flex flex-col sm:flex-row gap-3">
            <input 
              type="text" 
              value={newNotice} 
              onChange={(e) => setNewNotice(e.target.value)}
              placeholder="공지 또는 요청 내용을 입력해 주세요."
              className="flex-1 px-5 py-3 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
            />
            <div className="flex gap-2">
              <button 
                onClick={handleAddNotice}
                className="flex-1 sm:flex-none px-8 py-3 bg-slate-900 text-white rounded-xl font-bold hover:bg-blue-600 transition-all text-sm whitespace-nowrap"
              >
                {editingId ? '수정' : '요청'}
              </button>
              {editingId && (
                <button 
                  onClick={() => { setEditingId(null); setNewNotice(''); }}
                  className="flex-1 sm:flex-none px-4 py-3 bg-slate-200 text-slate-600 rounded-xl font-bold text-sm"
                >
                  취소
                </button>
              )}
            </div>
          </div>
        </div>

        <ul className="space-y-2">
          {announcements.length === 0 ? (
            <li className="py-12 text-center text-slate-400 font-medium italic">등록된 공지 / 요청사항이 없습니다.</li>
          ) : (
            announcements.map(n => (
              <li key={n.id} className="group flex flex-col sm:flex-row sm:items-center justify-between py-3.5 px-5 border border-transparent hover:border-slate-100 hover:bg-slate-50 rounded-2xl transition-all gap-3">
                <div className="flex items-center gap-3 overflow-hidden">
                  {n.isNew && <span className="shrink-0 text-[9px] bg-blue-600 text-white px-2 py-0.5 rounded-full font-black tracking-tighter">NEW</span>}
                  <span className="text-slate-700 font-bold text-sm truncate">{n.content}</span>
                </div>
                <div className="flex items-center justify-between sm:justify-end gap-6 shrink-0">
                  <span className="text-[11px] text-slate-400 font-mono font-bold">{n.date}</span>
                  <div className="flex gap-4 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => startEdit(n)} className="text-[11px] font-black text-blue-600 hover:underline">수정</button>
                    <button onClick={() => handleDeleteNotice(n.id)} className="text-[11px] font-black text-red-500 hover:underline">삭제</button>
                  </div>
                </div>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
};

export default Dashboard;
