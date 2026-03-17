
import React, { useState, useEffect, useCallback } from 'react';
import { UserAccount, ViewState, InjectionOrderSubCategory, PurchaseOrderSubCategory, PurchaseOrderItem } from '../../types';
import { saveSingleDoc, pushStateToCloud, sendJandiNotification } from '../../supabase';

interface Recipient {
  id: string;
  name: string;
  telFax: string;
  reference: string;
  remarks: string;
}

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
  const [vendorSuggestions, setVendorSuggestions] = useState<string[]>([]);
  const [showVendorSuggestions, setShowVendorSuggestions] = useState(false);

  // Recipient Management
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [showRecipientManager, setShowRecipientManager] = useState(false);
  const [editingRecipient, setEditingRecipient] = useState<Recipient | null>(null);

  // Form fields for display
  const [po2Reference, setPo2Reference] = useState('');
  const [po2TelFax, setPo2TelFax] = useState('');
  const [po2SenderName, setPo2SenderName] = useState('주식회사 아진정공');
  const [po2SenderPerson, setPo2SenderPerson] = useState('김미숙 010-9252-1565');
  const [po2Date, setPo2Date] = useState(new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }).replace(/년 |월 /g, '. ').replace('일', '.'));

  // Loaded Data
  const [loadedRows, setLoadedRows] = useState<any[]>([]);
  const [loadedMerges, setLoadedMerges] = useState<any>({});
  const [loadedAligns, setLoadedAligns] = useState<any>({});
  const [loadedWeights, setLoadedWeights] = useState<any>({});
  const [loadedHeaders, setLoadedHeaders] = useState<string[]>([]);

  useEffect(() => {
    const loadPo1Data = () => {
      setLoading(true);
      try {
        const saved = localStorage.getItem('ajin_purchase_orders');
        if (saved) {
          const parsed: PurchaseOrderItem[] = JSON.parse(saved);
          const po1s = parsed.filter(item => 
            item.stamps?.final && 
            (item.type === PurchaseOrderSubCategory.PO1 || item.type === '사출발주서')
          );
          setPo1Items(po1s);
        }

        const savedRecipients = localStorage.getItem('ajin_injection_recipients');
        if (savedRecipients) {
          setRecipients(JSON.parse(savedRecipients));
        }
      } catch (err) {
        console.error('Failed to load data:', err);
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

  const handleVendorChange = (val: string) => {
    setVendorSearch(val);
    if (val.trim()) {
      // Get vendors from PO1 items
      const po1Vendors = po1Items.flatMap(item => 
        (item.rows || []).map(row => row.injectionVendor || row.vendor || '')
      ).filter(v => v.toLowerCase().includes(val.toLowerCase()));

      // Get vendors from Recipient Manager
      const managedVendors = recipients
        .filter(r => r.name.toLowerCase().includes(val.toLowerCase()))
        .map(r => r.name);

      const matches = Array.from(new Set([...po1Vendors, ...managedVendors])).slice(0, 10);
      setVendorSuggestions(matches);
      setShowVendorSuggestions(matches.length > 0);
    } else {
      setShowVendorSuggestions(false);
    }
  };

  const selectVendor = (v: string) => {
    setVendorSearch(v);
    setShowVendorSuggestions(false);
    
    // Auto-fill TEL/FAX and Reference if found in Recipient Manager
    const recipient = recipients.find(r => r.name === v);
    if (recipient) {
      setPo2TelFax(recipient.telFax);
      setPo2Reference(recipient.reference);
    }
  };

  const handleLoadData = () => {
    if (!searchTerm.trim()) {
      alert('기종을 입력하거나 선택해주세요.');
      return;
    }

    const titleNormalized = searchTerm.trim().toLowerCase();
    const vendorNormalized = vendorSearch.trim().toLowerCase();

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
      if (doc.headerRows) {
        const relevantHeaders = doc.headerRows.slice(2, 5); 
        sourceHeaderRows = [...new Set([...sourceHeaderRows, ...relevantHeaders])];
      }

      doc.rows.forEach((row, rIdx) => {
        const rowVendor = (row.injectionVendor || row.vendor || '').toLowerCase();
        if (rowVendor.includes(vendorNormalized)) {
          const newRowId = `load-${Date.now()}-${Math.random()}`;
          const currentRowIdx = finalRows.length;
          finalRows.push({ ...row, id: newRowId });

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

    setLoadedRows(finalRows);
    setLoadedMerges(foundMerges);
    setLoadedAligns(foundAligns);
    setLoadedWeights(foundWeights);
    setLoadedHeaders(sourceHeaderRows);
    
    alert('데이터를 성공적으로 불러왔습니다.');
  };

  const handleComplete = async () => {
    if (loadedRows.length === 0) {
      alert('불러온 데이터가 없습니다. 먼저 데이터를 불러와주세요.');
      return;
    }

    if (!window.confirm('작성완료 하시겠습니까? 사출 결재대기로 이동됩니다.')) return;

    try {
      const now = new Date();
      const timestamp = now.toLocaleString();
      
      const newPO: any = {
        id: `inj-${Date.now()}`,
        title: `${searchTerm} ${vendorSearch}`.trim(),
        type: 'INJECTION',
        status: InjectionOrderSubCategory.PENDING,
        authorId: currentUser.initials,
        date: now.toISOString().split('T')[0],
        createdAt: now.toISOString(),
        rows: loadedRows,
        merges: loadedMerges,
        aligns: loadedAligns,
        weights: loadedWeights,
        headerRows: loadedHeaders,
        recipient: vendorSearch,
        telFax: po2TelFax,
        reference: po2Reference,
        senderName: po2SenderName,
        senderPerson: po2SenderPerson,
        stamps: {
          writer: { userId: currentUser.initials, timestamp: timestamp }
        }
      };

      const existingInjections = JSON.parse(localStorage.getItem('ajin_injection_orders') || '[]');
      localStorage.setItem('ajin_injection_orders', JSON.stringify([newPO, ...existingInjections]));

      await saveSingleDoc('Injection_Order', newPO);
      pushStateToCloud();
      
      sendJandiNotification('KR_PO', 'REQUEST', `[사출] ${newPO.title}`, 'H-CHUN', now.toISOString().split('T')[0]);

      alert('작성완료 되었습니다. 사출 결재대기 목록으로 이동합니다.');
      setView({ type: 'INJECTION_ORDER_MAIN', sub: InjectionOrderSubCategory.PENDING });
    } catch (err) {
      console.error('Error completing injection order:', err);
      alert('저장 중 오류가 발생했습니다.');
    }
  };

  const handlePrint = useCallback(() => {
    if (loadedRows.length === 0) {
      alert('인쇄할 데이터가 없습니다.');
      return;
    }

    const win = window.open('', '_blank');
    if (!win) return;

    const title = `${searchTerm} ${vendorSearch}`.trim();

    win.document.write(`
      <html>
        <head>
          <title>사출발주서_${title}</title>
          <script src="https://cdn.tailwindcss.com"></script>
          <style>
            @page { size: A4 portrait; margin: 10mm; }
            body { font-family: 'Gulim', sans-serif; }
            table { border-collapse: collapse; width: 100%; }
            th, td { border: 1px solid black; padding: 4px; font-size: 10px; }
            .no-border { border: none !important; }
          </style>
        </head>
        <body onload="window.print(); window.close();">
          <div class="p-4">
            <div class="flex flex-col items-center mb-4">
              <h1 class="text-3xl font-bold tracking-widest mb-1">주 식 회 사 아 진 정 공</h1>
              <p class="text-[10px]">서울시 금천구 디지털로9길 99, 스타밸리 806호 / TEL: (02) 894-2611 FAX: (02) 802-9941</p>
              <div class="w-full h-[2px] bg-black mt-2"></div>
            </div>

            <div class="flex justify-between items-end mb-4">
              <div class="text-4xl font-bold tracking-[1rem] ml-10">발 주 서</div>
              <table class="w-auto text-center">
                <tr>
                  <td rowspan="2" class="bg-gray-100 font-bold w-8">결재</td>
                  <td class="bg-gray-100 font-bold w-16">담당</td>
                  <td class="bg-gray-100 font-bold w-16">설계</td>
                  <td class="bg-gray-100 font-bold w-16">이사</td>
                </tr>
                <tr class="h-12">
                  <td>${currentUser.initials}<br/><span class="text-[7px]">${new Date().toLocaleDateString()}</span></td>
                  <td></td>
                  <td></td>
                </tr>
              </table>
            </div>

            <div class="grid grid-cols-2 gap-8 mb-4 text-sm">
              <div class="space-y-1">
                <div class="flex border-b border-black">
                  <span class="font-bold w-20">수 신 :</span>
                  <span>${vendorSearch} 귀중</span>
                </div>
                <div class="flex border-b border-black">
                  <span class="font-bold w-20">참 조 :</span>
                  <span>${po2Reference}</span>
                </div>
                <div class="flex border-b border-black">
                  <span class="font-bold w-20">TEL/FAX :</span>
                  <span>${po2TelFax}</span>
                </div>
              </div>
              <div class="space-y-1">
                <div class="flex border-b border-black">
                  <span class="font-bold w-20">발 신 :</span>
                  <span>${po2SenderName}</span>
                </div>
                <div class="flex border-b border-black">
                  <span class="font-bold w-20">담 당 :</span>
                  <span>${po2SenderPerson}</span>
                </div>
                <div class="flex border-b border-black">
                  <span class="font-bold w-20">작성일자 :</span>
                  <span>${po2Date}</span>
                </div>
              </div>
            </div>

            <div class="mb-2 font-bold text-xl border-b-2 border-black pb-1">기 종 : ${searchTerm}</div>

            <table class="w-full text-[9px]">
              <thead>
                <tr class="bg-gray-50">
                  <th class="w-[10%]">MOLD</th>
                  <th class="w-[8%]">DN</th>
                  <th class="w-[4%]">S</th>
                  <th class="w-[20%]">PART NAME</th>
                  <th class="w-[5%]">CTY</th>
                  <th class="w-[5%]">QTY</th>
                  <th class="w-[12%]">MATERIAL</th>
                  <th class="w-[8%]">사출업체</th>
                  <th class="w-[8%]">주문수량</th>
                  <th class="w-[10%]">단가</th>
                  <th class="w-[10%]">금액</th>
                </tr>
              </thead>
              <tbody>
                ${loadedRows.map(row => `
                  <tr>
                    <td>${row.model || ''}</td>
                    <td>${row.dept || ''}</td>
                    <td class="text-center">${row.s || ''}</td>
                    <td>${row.itemName || ''}</td>
                    <td class="text-center">${row.cty || ''}</td>
                    <td class="text-center">${row.qty || ''}</td>
                    <td>${row.material || ''}</td>
                    <td class="text-center">${row.injectionVendor || ''}</td>
                    <td class="text-center">${row.orderQty || ''}</td>
                    <td class="text-right">${row.unitPrice || ''}</td>
                    <td class="text-right">${row.price || ''}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </body>
      </html>
    `);
    win.document.close();
  }, [loadedRows, searchTerm, vendorSearch, po2Reference, po2TelFax, po2SenderName, po2SenderPerson, po2Date, currentUser]);

  const saveRecipient = (r: Partial<Recipient>) => {
    let updated;
    if (editingRecipient) {
      updated = recipients.map(item => item.id === editingRecipient.id ? { ...editingRecipient, ...r } : item);
    } else {
      const newR: Recipient = {
        id: `rec-${Date.now()}`,
        name: r.name || '',
        telFax: r.telFax || '',
        reference: r.reference || '',
        remarks: r.remarks || ''
      };
      updated = [newR, ...recipients];
    }
    setRecipients(updated);
    localStorage.setItem('ajin_injection_recipients', JSON.stringify(updated));
    setEditingRecipient(null);
  };

  const deleteRecipient = (id: string) => {
    if (!window.confirm('정말로 삭제하시겠습니까?')) return;
    const updated = recipients.filter(r => r.id !== id);
    setRecipients(updated);
    localStorage.setItem('ajin_injection_recipients', JSON.stringify(updated));
  };

  return (
    <div className="flex flex-col h-full bg-slate-200 overflow-y-auto custom-scrollbar relative">
      {/* Top Action Buttons */}
      <div className="sticky top-0 z-[110] bg-slate-200/80 backdrop-blur-sm p-4 flex justify-end gap-2 max-w-[1000px] mx-auto w-full">
        <button 
          onClick={handleComplete}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg font-black text-sm shadow-lg hover:bg-blue-700 transition-all"
        >
          작성완료
        </button>
        <button 
          onClick={() => setShowRecipientManager(true)}
          className="px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg font-black text-sm shadow-sm hover:bg-slate-50 transition-all"
        >
          수신처관리
        </button>
        <button 
          onClick={handlePrint}
          className="px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg font-black text-sm shadow-sm hover:bg-slate-50 transition-all"
        >
          PDF 저장 / 인쇄
        </button>
      </div>

      {/* PO Form Style Header */}
      <div className="bg-white border-[1px] border-slate-200 shadow-2xl mx-auto p-4 md:p-12 w-full max-w-[1000px] text-black font-gulim text-left mt-2 mb-4">
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
              <div className="flex items-center gap-2 border-b border-black pb-0 relative">
                <span className="font-bold whitespace-nowrap">수 신 :</span>
                <div className="flex-1 flex gap-2 items-center relative">
                  <input 
                    type="text" 
                    value={vendorSearch} 
                    onChange={(e) => handleVendorChange(e.target.value)} 
                    onFocus={() => vendorSearch && setShowVendorSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowVendorSuggestions(false), 200)}
                    placeholder="수신처(업체명) 검색" 
                    className="flex-1 outline-none font-bold bg-transparent" 
                  />
                  <span className="font-bold">귀중</span>
                  {showVendorSuggestions && (
                    <div className="absolute left-0 right-0 top-full bg-white border border-slate-200 shadow-xl rounded-lg mt-1 z-[120] overflow-hidden">
                      {vendorSuggestions.map((v, i) => (
                        <button 
                          key={i} 
                          type="button"
                          onClick={() => selectVendor(v)}
                          className="w-full text-left px-3 py-2 hover:bg-slate-50 text-sm font-bold border-b border-slate-50 last:border-0"
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                  )}
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
                onChange={(e) => handleVendorChange(e.target.value)} 
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

      {/* Recipient Manager Modal */}
      {showRecipientManager && (
        <div className="fixed inset-0 z-[200] bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
              <h2 className="text-xl font-black text-slate-800">수신처 관리</h2>
              <button onClick={() => { setShowRecipientManager(false); setEditingRecipient(null); }} className="text-slate-400 hover:text-slate-600">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="p-6 space-y-4 overflow-y-auto custom-scrollbar">
              {/* Add/Edit Form */}
              <div className="bg-slate-50 p-4 rounded-xl space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <input 
                    type="text" 
                    placeholder="수신처명" 
                    className="px-3 py-2 border border-slate-200 rounded-lg text-sm font-bold outline-none focus:border-blue-500"
                    value={editingRecipient?.name || ''}
                    onChange={(e) => setEditingRecipient(prev => ({ ...(prev || { id: '', name: '', telFax: '', reference: '', remarks: '' }), name: e.target.value }))}
                  />
                  <input 
                    type="text" 
                    placeholder="TEL/FAX" 
                    className="px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-500"
                    value={editingRecipient?.telFax || ''}
                    onChange={(e) => setEditingRecipient(prev => ({ ...(prev || { id: '', name: '', telFax: '', reference: '', remarks: '' }), telFax: e.target.value }))}
                  />
                </div>
                <input 
                  type="text" 
                  placeholder="참고" 
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-500"
                  value={editingRecipient?.reference || ''}
                  onChange={(e) => setEditingRecipient(prev => ({ ...(prev || { id: '', name: '', telFax: '', reference: '', remarks: '' }), reference: e.target.value }))}
                />
                <textarea 
                  placeholder="비고 (발주서에 미표시)" 
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-500 h-20"
                  value={editingRecipient?.remarks || ''}
                  onChange={(e) => setEditingRecipient(prev => ({ ...(prev || { id: '', name: '', telFax: '', reference: '', remarks: '' }), remarks: e.target.value }))}
                />
                <div className="flex justify-end gap-2">
                  {editingRecipient && (
                    <button 
                      onClick={() => setEditingRecipient(null)}
                      className="px-4 py-2 bg-slate-200 text-slate-600 rounded-lg text-xs font-bold hover:bg-slate-300"
                    >
                      취소
                    </button>
                  )}
                  <button 
                    onClick={() => editingRecipient && saveRecipient(editingRecipient)}
                    disabled={!editingRecipient?.name}
                    className="px-6 py-2 bg-blue-600 text-white rounded-lg text-xs font-black hover:bg-blue-700 disabled:opacity-50"
                  >
                    {editingRecipient?.id ? '수정 저장' : '새 수신처 추가'}
                  </button>
                </div>
              </div>

              {/* List */}
              <div className="space-y-2">
                {recipients.map(r => (
                  <div key={r.id} className="flex items-center justify-between p-3 border border-slate-100 rounded-xl hover:bg-slate-50 transition-colors group">
                    <div className="flex-1 cursor-pointer" onClick={() => selectVendor(r.name)}>
                      <div className="font-bold text-slate-800">{r.name}</div>
                      <div className="text-[10px] text-slate-400 font-medium">{r.telFax} | {r.reference}</div>
                      {r.remarks && <div className="text-[10px] text-amber-600 mt-1 italic">비고: {r.remarks}</div>}
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => setEditingRecipient(r)}
                        className="p-2 text-blue-500 hover:bg-blue-50 rounded-lg"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button 
                        onClick={() => deleteRecipient(r.id)}
                        className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
                {recipients.length === 0 && (
                  <div className="text-center py-12 text-slate-300 font-bold italic">등록된 수신처가 없습니다.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

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
