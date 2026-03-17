
import React, { useState, useEffect } from 'react';
import { UserAccount, ViewState, InjectionOrderSubCategory, PurchaseOrderSubCategory, PurchaseOrderItem } from '../../types';

interface InjectionTakeProps {
  currentUser: UserAccount;
  setView: (v: ViewState) => void;
  dataVersion: number;
  onSelect: (item: any) => void;
}

const InjectionTake: React.FC<InjectionTakeProps> = ({ currentUser, setView, dataVersion, onSelect }) => {
  const [po1Items, setPo1Items] = useState<PurchaseOrderItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [vendorSearch, setVendorSearch] = useState('');
  const [loading, setLoading] = useState(true);
  
  // Suggestions
  const [po1TitleSuggestions, setPo1TitleSuggestions] = useState<string[]>([]);
  const [showPo1Suggestions, setShowPo1Suggestions] = useState(false);

  // Form fields for display
  const [po2Reference, setPo2Reference] = useState('');
  const [po2TelFax, setPo2TelFax] = useState('');
  const [po2SenderName, setPo2SenderName] = useState('주식회사 아진정공');
  const [po2SenderPerson, setPo2SenderPerson] = useState('김미숙 010-0000-0000');
  const [po2Date, setPo2Date] = useState(new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }).replace(/년 |월 /g, '. ').replace('일', '.'));

  useEffect(() => {
    const loadPo1Data = () => {
      setLoading(true);
      try {
        const saved = localStorage.getItem('ajin_purchase_orders');
        if (saved) {
          const parsed: PurchaseOrderItem[] = JSON.parse(saved);
          // Filter for AJ Injection Orders (PO1)
          const po1s = parsed.filter(item => 
            item.stamps?.final && 
            (item.type === PurchaseOrderSubCategory.PO1 || item.type === '사출발주서')
          );
          setPo1Items(po1s);
        }
      } catch (err) {
        console.error('Failed to load PO1 data:', err);
      } finally {
        setLoading(false);
      }
    };

    loadPo1Data();
  }, [dataVersion]);

  const handleModelChange = (val: string) => {
    setSearchTerm(val);
    if (val.trim()) {
      const matches = Array.from(new Set(po1Items
        .filter(item => (item.title || '').toLowerCase().includes(val.toLowerCase()))
        .map(item => item.title || '')
      )).slice(0, 10);
      setPo1TitleSuggestions(matches);
      setShowPo1Suggestions(matches.length > 0);
    } else {
      setShowPo1Suggestions(false);
    }
  };

  const handleLoadData = () => {
    if (!searchTerm.trim()) {
      alert('기종을 입력하거나 선택해주세요.');
      return;
    }

    const titleNormalized = searchTerm.trim().toLowerCase();
    const vendorNormalized = vendorSearch.trim().toLowerCase();

    // Find matching PO1 documents
    const matchingDocs = po1Items.filter(item => 
      (item.title || '').toLowerCase() === titleNormalized
    );

    if (matchingDocs.length === 0) {
      alert('일치하는 기종의 문서를 찾을 수 없습니다.');
      return;
    }

    let finalRows: any[] = [];
    let foundMerges: any = {};
    let foundAligns: any = {};
    let foundWeights: any = {};
    let sourceHeaderRows: string[] = [];

    matchingDocs.forEach(doc => {
      // 1. Extract header rows 3~5 (index 2, 3, 4)
      if (doc.headerRows) {
        // We take rows 3, 4, 5 if they exist. 
        // Usually headerRows is an array of strings.
        const relevantHeaders = doc.headerRows.slice(2, 5); 
        sourceHeaderRows = [...new Set([...sourceHeaderRows, ...relevantHeaders])];
      }

      // 2. Extract rows matching injection vendor
      doc.rows.forEach((row, rIdx) => {
        const rowVendor = (row.injectionVendor || row.vendor || '').toLowerCase();
        if (rowVendor.includes(vendorNormalized)) {
          const newRowId = `load-${Date.now()}-${Math.random()}`;
          const currentRowIdx = finalRows.length;
          finalRows.push({ ...row, id: newRowId });

          // Copy formatting
          if (doc.merges) {
            Object.entries(doc.merges).forEach(([key, m]) => {
              const [mr, mc] = key.split('-').map(Number);
              if (mr === rIdx) foundMerges[`${currentRowIdx}-${mc}`] = m;
            });
          }
          if (doc.aligns) {
            Object.entries(doc.aligns).forEach(([key, a]) => {
              const [ar, ac] = key.split('-').map(Number);
              if (ar === rIdx) foundAligns[`${currentRowIdx}-${ac}`] = a;
            });
          }
          if (doc.weights) {
            Object.entries(doc.weights).forEach(([key, w]) => {
              const [wr, wc] = key.split('-').map(Number);
              if (wr === rIdx) foundWeights[`${currentRowIdx}-${wc}`] = w;
            });
          }
        }
      });
    });

    if (finalRows.length === 0) {
      alert('해당 사출업체에 해당하는 품목이 없습니다.');
      return;
    }

    // Construct the order object to return
    // "사출업체 입력란에 입력한 사출업체를 ... 문서의 기종 하단에 붙여넣기"
    const resultOrder = {
      title: `${searchTerm} ${vendorSearch}`.trim(),
      rows: finalRows,
      merges: foundMerges,
      aligns: foundAligns,
      weights: foundWeights,
      headerRows: sourceHeaderRows,
      recipient: vendorSearch,
      date: new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }).replace(/년 |월 /g, '. ').replace('일', '.'),
      status: InjectionOrderSubCategory.TEMPORARY,
      // Footer text is explicitly excluded (no notes)
    };

    onSelect(resultOrder);
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
                onKeyDown={(e) => e.key === 'Enter' && handleLoadData()}
              />
              <button 
                onClick={handleLoadData}
                className="px-4 py-1 bg-amber-600 text-white rounded text-xs font-black hover:bg-amber-700 transition-all shadow-sm"
              >
                데이터 불러오기
              </button>
            </div>
          </div>

          {/* Model Input Line */}
          <div className="mb-4 flex items-center border-b border-black pb-1 relative">
            <span className="font-black text-2xl mr-4 uppercase">기 종 :</span>
            <div className="flex-1 relative">
              <input 
                type="text" 
                value={searchTerm} 
                onChange={(e) => handleModelChange(e.target.value)} 
                onFocus={() => searchTerm && setShowPo1Suggestions(true)}
                onBlur={() => setTimeout(() => setShowPo1Suggestions(false), 200)}
                placeholder="기종을 입력하십시오 (필수)" 
                className="w-full outline-none text-2xl font-bold placeholder:text-red-300 bg-transparent" 
              />
              {showPo1Suggestions && (
                <div className="absolute left-0 right-0 top-full bg-white border border-slate-200 shadow-xl rounded-xl mt-1 z-[100] overflow-hidden">
                  {po1TitleSuggestions.map((s, i) => (
                    <button 
                      key={i} 
                      type="button"
                      onClick={() => { setSearchTerm(s); setShowPo1Suggestions(false); }}
                      className="w-full text-left px-4 py-3 hover:bg-slate-50 text-lg font-bold border-b border-slate-50 last:border-0"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-orange-600 mb-4"></div>
          <p className="text-sm text-slate-400 font-bold">데이터를 불러오는 중...</p>
        </div>
      )}
    </div>
  );
};

export default InjectionTake;
