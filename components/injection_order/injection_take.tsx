
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
  
  // Form fields for search
  const [po2Reference, setPo2Reference] = useState('');
  const [po2TelFax, setPo2TelFax] = useState('');
  const [po2SenderName, setPo2SenderName] = useState('주식회사 아진정공');
  const [po2SenderPerson, setPo2SenderPerson] = useState(currentUser.name);
  const [po2Date, setPo2Date] = useState(new Date().toLocaleDateString());

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
    <div className="flex flex-col h-full bg-slate-200 overflow-y-auto custom-scrollbar">
      {/* PO Form Style Header */}
      <div className="bg-white border-[1px] border-slate-200 shadow-2xl mx-auto p-4 md:p-12 w-full max-w-[1000px] text-black font-gulim text-left mt-8 mb-4">
        <div className="min-w-[800px] md:min-w-0">
          {/* Company Info */}
          <div className="flex flex-col items-center mb-1">
            <h1 className="text-4xl font-black tracking-[0.5rem] mb-2 uppercase">주 식 회 사 아 진 정 공</h1>
            <p className="text-sm font-bold text-slate-500">(우;08510) 서울시 금천구 디지털로9길 99, 스타밸리 806호</p>
            <p className="text-sm font-bold text-slate-500">☎ (02) 894-2611 FAX (02) 802-9941 <span className="ml-4 text-blue-600 underline">misuk.kim@ajinpre.net</span></p>
            <div className="w-full h-1 bg-black mt-2"></div>
            <div className="w-full h-[1px] bg-black mt-0.5"></div>
          </div>

          {/* Title & Approval */}
          <div className="flex justify-between items-end mb-1 relative border-b border-black pb-0">
            <div className="text-5xl font-black tracking-[2rem] uppercase leading-none pb-4 ml-20 whitespace-nowrap">발 주 서</div>
            <table className="border-collapse border-black border-[1px] text-center text-[11px] w-auto">
              <tbody>
                <tr>
                  <td rowSpan={2} className="border border-black px-1 py-4 bg-slate-50 font-bold w-10">결 재</td>
                  <td className="border border-black py-1 px-4 bg-slate-50 font-bold min-w-[60px]">담 당</td>
                  <td className="border border-black py-1 px-4 bg-slate-50 font-bold min-w-[60px]">설 계</td>
                  <td className="border border-black py-1 px-4 bg-slate-50 font-bold min-w-[60px]">이 사</td>
                </tr>
                <tr className="h-16">
                  <td className="border border-black p-1 align-middle"></td>
                  <td className="border border-black p-1 align-middle"></td>
                  <td className="border border-black p-1 align-middle"></td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Recipient / Sender Info */}
          <div className="grid grid-cols-2 gap-x-20 mb-3 text-lg leading-tight">
            <div className="space-y-1">
              <div className="flex items-center gap-2 border-b border-black pb-0">
                <span className="font-bold whitespace-nowrap">수 신 :</span>
                <div className="flex-1 flex gap-2 items-center">
                  <input 
                    type="text" 
                    value={vendorSearch} 
                    onChange={(e) => setVendorSearch(e.target.value)} 
                    placeholder="수신처(업체명) 검색" 
                    className="flex-1 outline-none font-bold bg-transparent" 
                  />
                  <span className="font-bold">귀중</span>
                </div>
              </div>
              <div className="flex items-center gap-2 border-b border-black pb-0">
                <span className="font-bold whitespace-nowrap">참 조 :</span>
                <input 
                  type="text" 
                  value={po2Reference} 
                  onChange={(e) => setPo2Reference(e.target.value)} 
                  placeholder="참조 내용" 
                  className="flex-1 outline-none bg-transparent" 
                />
              </div>
              <div className="flex items-center gap-2 border-b border-black pb-0">
                <span className="font-bold whitespace-nowrap">TEL / FAX :</span>
                <input 
                  type="text" 
                  value={po2TelFax} 
                  onChange={(e) => setPo2TelFax(e.target.value)} 
                  placeholder="연락처 정보" 
                  className="flex-1 outline-none bg-transparent" 
                />
              </div>
            </div>
            <div className="space-y-1">
              <div className="flex gap-4 border-b border-black pb-0">
                <span className="w-16 font-bold">발 신 :</span>
                <input 
                  type="text" 
                  value={po2SenderName} 
                  onChange={(e) => setPo2SenderName(e.target.value)} 
                  className="flex-1 outline-none font-bold bg-transparent" 
                />
              </div>
              <div className="flex gap-4 border-b border-black pb-0">
                <span className="w-16 font-bold">담 당 :</span>
                <input 
                  type="text" 
                  value={po2SenderPerson} 
                  onChange={(e) => setPo2SenderPerson(e.target.value)} 
                  className="flex-1 outline-none bg-transparent" 
                />
              </div>
              <div className="flex gap-4 items-center border-b border-black pb-0">
                <span className="w-16 font-bold">작성일자 :</span>
                <input 
                  type="text" 
                  value={po2Date} 
                  onChange={(e) => setPo2Date(e.target.value)} 
                  className="flex-1 outline-none bg-transparent" 
                />
              </div>
            </div>
          </div>

          {/* Injection Vendor Search Bar */}
          <div className="mb-3 flex items-center border-b border-black pb-1 gap-4">
            <span className="font-bold text-sm text-slate-500 w-24">사출업체 검색 :</span>
            <div className="flex-1 flex gap-2">
              <input 
                type="text" 
                value={vendorSearch} 
                onChange={(e) => setVendorSearch(e.target.value)} 
                placeholder="사출업체명을 입력하세요" 
                className="flex-1 outline-none text-sm font-bold bg-slate-50 px-2 py-0.5 rounded border border-slate-200" 
              />
              <button className="px-4 py-1 bg-amber-600 text-white rounded text-xs font-black hover:bg-amber-700 transition-all shadow-sm">데이터 불러오기</button>
            </div>
          </div>

          {/* Model Input Line */}
          <div className="mb-4 flex items-center border-b border-black pb-1 relative">
            <span className="font-black text-2xl mr-4 uppercase">기 종 :</span>
            <div className="flex-1 relative">
              <input 
                type="text" 
                value={searchTerm} 
                onChange={(e) => setSearchTerm(e.target.value)} 
                placeholder="기종을 입력하십시오 (필수)" 
                className="w-full outline-none text-2xl font-bold placeholder:text-red-300 bg-transparent" 
              />
            </div>
          </div>
        </div>
      </div>

      {/* Table Content */}
      <div className="p-8 pt-0">
        <div className="max-w-[1000px] mx-auto">
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
            <div className="flex flex-col items-center justify-center py-32 bg-white/50 rounded-[3rem] border-2 border-dashed border-slate-300">
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
