
import React, { useState, useEffect } from 'react';
import { UserAccount, OrderSubCategory, InvoiceSubCategory, ViewState, Announcement } from '../types';
import { pushStateToCloud } from '../supabase';

interface DashboardProps {
  user: UserAccount;
  // Updated to allow Promise as it is passed from App.tsx handleSetView
  setView: (v: ViewState) => void | Promise<void>;
  // Added dataVersion to match the props passed from App.tsx
  dataVersion?: number;
}

const Dashboard: React.FC<DashboardProps> = ({ user, setView, dataVersion }) => {
  const isMaster = user.loginId === 'AJ5200';
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [newNotice, setNewNotice] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  const [pendingOrdersCount, setPendingOrdersCount] = useState(0);
  const [approvedOrdersCount, setApprovedOrdersCount] = useState(0);
  const [completedInvoicesCount, setCompletedInvoicesCount] = useState(0);

  useEffect(() => {
    // 공지사항 로드
    const savedNotices = localStorage.getItem('ajin_notices');
    if (savedNotices) {
      setAnnouncements(JSON.parse(savedNotices));
    } else {
      const initial = [
        { id: '1', content: 'AJ5200 마스터 권한 기능이 활성화되었습니다.', date: '2024.03.01', isNew: true },
        { id: '2', content: '신규 시스템 업데이트 안내 (1)', date: '2024.03.01' }
      ];
      setAnnouncements(initial);
      localStorage.setItem('ajin_notices', JSON.stringify(initial));
    }

    // 데이터 카운트 로드
    const savedOrders = localStorage.getItem('ajin_orders');
    if (savedOrders) {
      const orders = JSON.parse(savedOrders);
      setPendingOrdersCount(orders.filter((o: any) => o.status === OrderSubCategory.PENDING).length);
      setApprovedOrdersCount(orders.filter((o: any) => o.status === OrderSubCategory.APPROVED).length);
    }

    const savedInvoices = localStorage.getItem('ajin_invoices');
    if (savedInvoices) {
      const invoices = JSON.parse(savedInvoices);
      const pendingInvoices = invoices.filter((inv: any) => {
        const activeRows = inv.rows.filter((r: any) => !r.isDeleted && (r.model?.trim() || r.itemName?.trim()));
        if (activeRows.length === 0) return true;
        return !activeRows.every((r: any) => !!r.qtyConfirm);
      });
      setCompletedInvoicesCount(pendingInvoices.length);
    }
    // Added dataVersion to dependency array to refresh counts when synced from cloud
  }, [dataVersion]);

  const saveNotices = (notices: Announcement[]) => {
    setAnnouncements(notices);
    localStorage.setItem('ajin_notices', JSON.stringify(notices));
    pushStateToCloud(); // Sync to Supabase
  };

  const handleAddNotice = () => {
    if (!newNotice.trim()) return;
    if (editingId) {
      const updated = announcements.map(n => n.id === editingId ? { ...n, content: newNotice } : n);
      saveNotices(updated);
      setEditingId(null);
    } else {
      const notice: Announcement = {
        id: Date.now().toString(),
        content: newNotice,
        date: new Date().toLocaleDateString('ko-KR').replace(/\.$/, ''),
        isNew: true
      };
      saveNotices([notice, ...announcements]);
    }
    setNewNotice('');
  };

  const handleDeleteNotice = (id: string) => {
    if (!confirm('정말 삭제하시겠습니까?')) return;
    saveNotices(announcements.filter(n => n.id !== id));
  };

  const startEdit = (n: Announcement) => {
    setNewNotice(n.content);
    setEditingId(n.id);
  };

  return (
    <div className="space-y-6 md:space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-extrabold text-slate-900 mb-1 md:mb-2">대시보드</h2>
          <p className="text-slate-500 text-sm">업무 관리 시스템에 오신 것을 환영합니다.</p>
        </div>
        {isMaster && (
          <div className="animate-pulse bg-amber-500 text-white px-3 md:px-4 py-1.5 md:py-2 rounded-xl text-[10px] md:text-xs font-black shadow-lg shadow-amber-200 uppercase tracking-widest">
            Master Mode Active
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        <button 
          onClick={() => setView({ type: 'ORDER', sub: OrderSubCategory.PENDING })}
          className="bg-white p-5 md:p-6 rounded-2xl shadow-sm border border-slate-200 hover:border-blue-500 hover:shadow-md transition-all text-left"
        >
          <p className="text-slate-500 text-xs md:text-sm font-medium mb-1">결재 대기</p>
          <p className={`text-2xl md:text-3xl font-bold text-slate-900 ${pendingOrdersCount > 0 ? 'animate-blink text-red-600' : ''}`}>처리 대기중</p>
          <p className="text-blue-600 text-[10px] md:text-xs mt-4 font-semibold uppercase tracking-wider">상세보기 →</p>
        </button>

        <button 
          onClick={() => setView({ type: 'ORDER', sub: OrderSubCategory.APPROVED })}
          className="bg-white p-5 md:p-6 rounded-2xl shadow-sm border border-slate-200 hover:border-blue-500 hover:shadow-md transition-all text-left"
        >
          <p className="text-slate-500 text-xs md:text-sm font-medium mb-1">결재 완료</p>
          <p className={`text-2xl md:text-3xl font-bold text-slate-900 ${approvedOrdersCount > 0 ? 'animate-blink text-blue-600' : ''}`}>데이터 확인</p>
          <p className="text-blue-600 text-[10px] md:text-xs mt-4 font-semibold uppercase tracking-wider">상세보기 →</p>
        </button>

        <button 
          onClick={() => setView({ type: 'INVOICE', sub: InvoiceSubCategory.COMPLETED })}
          className="bg-white p-5 md:p-6 rounded-2xl shadow-sm border border-slate-200 hover:border-blue-500 hover:shadow-md transition-all text-left"
        >
          <p className="text-slate-500 text-xs md:text-sm font-medium mb-1">송장 완료</p>
          <p className={`text-2xl md:text-3xl font-bold text-slate-900 ${completedInvoicesCount > 0 ? 'animate-blink text-emerald-600' : ''}`}>
            {completedInvoicesCount > 0 ? '확인 필요' : '데이터 확인'}
          </p>
          <p className="text-blue-600 text-[10px] md:text-xs mt-4 font-semibold uppercase tracking-wider">상세보기 →</p>
        </button>

        <div className={`p-5 md:p-6 rounded-2xl shadow-sm text-white flex flex-col justify-between ${isMaster ? 'bg-gradient-to-br from-amber-600 to-amber-900' : 'bg-slate-900'}`}>
          <div>
            <p className="text-white/60 text-[10px] md:text-sm mb-1">로그인 계정</p>
            <p className="text-lg md:text-xl font-mono font-bold tracking-tight flex items-center gap-2 truncate">
              {user.initials}
              {isMaster && <span className="text-[8px] md:text-[10px] bg-white/20 px-1.5 md:px-2 py-0.5 rounded backdrop-blur-sm">MASTER</span>}
            </p>
          </div>
          <div className="mt-4 pt-4 border-t border-white/10 flex justify-between items-center">
            <span className="text-[9px] md:text-[10px] text-white/40">{new Date().toLocaleDateString()}</span>
            <span className="text-[8px] md:text-[9px] bg-green-500/20 text-green-400 px-1.5 md:px-2 py-0.5 md:py-1 rounded uppercase font-bold tracking-tighter">Online</span>
          </div>
        </div>
      </div>

      <div className="bg-white p-6 md:p-8 rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-base md:text-lg font-bold flex items-center gap-2">
            <div className="w-1.5 md:w-2 h-5 md:h-6 bg-blue-600 rounded-full"></div>
            공지사항
          </h3>
        </div>

        {isMaster && (
          <div className="mb-6 md:mb-8 p-3 md:p-4 bg-slate-50 rounded-xl border border-slate-200">
            <p className="text-[10px] md:text-xs font-bold text-slate-500 mb-2 uppercase tracking-tight">공지 관리</p>
            <div className="flex flex-col sm:flex-row gap-2">
              <input 
                type="text" 
                value={newNotice} 
                onChange={(e) => setNewNotice(e.target.value)}
                placeholder="공지 내용 입력"
                className="flex-1 px-4 py-2 text-sm rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <div className="flex gap-2">
                <button 
                  onClick={handleAddNotice}
                  className="flex-1 sm:flex-none px-4 md:px-6 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 transition-all text-sm"
                >
                  {editingId ? '수정' : '추가'}
                </button>
                {editingId && (
                  <button 
                    onClick={() => { setEditingId(null); setNewNotice(''); }}
                    className="flex-1 sm:flex-none px-3 md:px-4 py-2 bg-slate-200 text-slate-600 rounded-lg font-bold text-sm"
                  >
                    취소
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        <ul className="space-y-1">
          {announcements.map(n => (
            <li key={n.id} className="group flex flex-col sm:flex-row sm:items-center justify-between py-2.5 md:py-3 px-3 md:px-4 border border-transparent hover:border-slate-100 hover:bg-slate-50 rounded-xl transition-all gap-2">
              <div className="flex items-center gap-2 md:gap-4 overflow-hidden">
                <span className="text-slate-700 font-medium text-xs md:text-sm truncate">{n.content}</span>
                {n.isNew && <span className="shrink-0 text-[8px] md:text-[10px] bg-amber-100 text-amber-600 px-1.5 md:px-2 py-0.5 rounded-full font-black">NEW</span>}
              </div>
              <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0">
                <span className="text-[10px] md:text-xs text-slate-400 tabular-nums">{n.date}</span>
                {isMaster && (
                  <div className="flex gap-3 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => startEdit(n)} className="text-[10px] md:text-xs font-bold text-blue-600 hover:underline">수정</button>
                    <button onClick={() => handleDeleteNotice(n.id)} className="text-[10px] md:text-xs font-bold text-red-500 hover:underline">삭제</button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default Dashboard;
