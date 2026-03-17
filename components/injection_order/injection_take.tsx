
import React, { useState, useEffect } from 'react';
import { UserAccount, ViewState, InjectionOrderSubCategory } from '../../types';

interface InjectionTakeProps {
  currentUser: UserAccount;
  setView: (v: ViewState) => void;
  dataVersion: number;
  onSelect: (item: any) => void;
}

const InjectionTake: React.FC<InjectionTakeProps> = ({ currentUser, setView, dataVersion, onSelect }) => {
  const [orders, setOrders] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [vendorSearch, setVendorSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadOrders = () => {
      setLoading(true);
      try {
        const saved = localStorage.getItem('ajin_injection_orders');
        if (saved) {
          const parsed = JSON.parse(saved);
          // Show all orders for loading
          setOrders(parsed.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime()));
        }
      } catch (err) {
        console.error('Failed to load injection orders:', err);
      } finally {
        setLoading(false);
      }
    };

    loadOrders();
  }, [dataVersion]);

  const filteredOrders = orders.filter(order => 
    (order.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
     order.id?.toLowerCase().includes(searchTerm.toLowerCase())) &&
    (order.vendor?.toLowerCase().includes(vendorSearch.toLowerCase()) ||
     order.injectionVendor?.toLowerCase().includes(vendorSearch.toLowerCase()))
  );

  const handleSelectOrder = (order: any) => {
    onSelect(order);
  };

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header & Search Form */}
      <div className="p-8 bg-slate-50 border-b border-slate-200">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-orange-500 rounded-xl flex items-center justify-center shadow-lg shadow-orange-500/20">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">사출발주서 불러오기</h1>
              <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">Import Existing Injection Orders</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">기종 / 제목 검색</label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="기종 또는 제목 입력..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all outline-none"
                />
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">업체명 검색</label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="사출업체 또는 금형업체..."
                  value={vendorSearch}
                  onChange={(e) => setVendorSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all outline-none"
                />
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Table Content */}
      <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
        <div className="max-w-5xl mx-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-32">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-orange-600 mb-4"></div>
              <p className="text-sm text-slate-400 font-bold animate-pulse">데이터를 불러오는 중...</p>
            </div>
          ) : filteredOrders.length > 0 ? (
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">상태</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">제목 / 기종</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">업체 정보</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">작성 정보</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">관리</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredOrders.map((order) => (
                    <tr 
                      key={order.id} 
                      onClick={() => handleSelectOrder(order)}
                      className="hover:bg-orange-50/30 transition-colors cursor-pointer group"
                    >
                      <td className="px-6 py-5">
                        <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black tracking-wider uppercase ${
                          order.status === InjectionOrderSubCategory.APPROVED ? 'bg-emerald-50 text-emerald-600' :
                          order.status === InjectionOrderSubCategory.REJECTED ? 'bg-rose-50 text-rose-600' :
                          'bg-amber-50 text-amber-600'
                        }`}>
                          {order.status}
                        </span>
                      </td>
                      <td className="px-6 py-5">
                        <div className="flex flex-col">
                          <span className="text-sm font-black text-slate-900 group-hover:text-orange-600 transition-colors">{order.title || '제목 없음'}</span>
                          <span className="text-[10px] text-slate-400 font-bold mt-0.5 uppercase tracking-tighter">{order.id}</span>
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-black text-slate-300 uppercase w-10">사출</span>
                            <span className="text-xs font-bold text-slate-700">{order.injectionVendor || order.vendor || '-'}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-black text-slate-300 uppercase w-10">금형</span>
                            <span className="text-xs font-bold text-slate-500">{order.vendor || '-'}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-slate-700">{order.writerName || order.authorId || '-'}</span>
                          <span className="text-[10px] text-slate-400 font-medium mt-0.5">{order.date}</span>
                        </div>
                      </td>
                      <td className="px-6 py-5 text-right">
                        <button className="inline-flex items-center px-4 py-2 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-orange-600 transition-all shadow-sm group-hover:shadow-lg group-hover:shadow-orange-500/20">
                          불러오기
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 ml-1.5 group-hover:translate-x-0.5 transition-transform" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-32 bg-slate-50/50 rounded-[3rem] border-2 border-dashed border-slate-200">
              <div className="w-20 h-20 bg-white rounded-3xl flex items-center justify-center mb-6 shadow-sm">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-slate-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <h3 className="text-xl font-black text-slate-900 mb-2">검색 결과가 없습니다.</h3>
              <p className="text-sm text-slate-400 font-bold">다른 검색어를 입력하거나 필터를 조정해 보세요.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default InjectionTake;
