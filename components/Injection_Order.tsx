
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { 
  InjectionOrderSubCategory, 
  UserAccount, 
  ViewState, 
  PurchaseOrderItem,
  OrderRow,
  PurchaseOrderSubCategory
} from '../types';
import { pushStateToCloud, saveSingleDoc, supabase, sendJandiNotification } from '../supabase';

interface InjectionOrderMainProps {
  sub: InjectionOrderSubCategory;
  currentUser: UserAccount;
  userAccounts: UserAccount[];
  setView: (v: ViewState) => void;
  dataVersion: number;
}

// --- Create View Component (Logic from previous InjectionOrder.tsx) ---
const InjectionOrderCreateView: React.FC<{
  currentUser: UserAccount;
  setView: (v: ViewState) => void;
  fileName: string;
  setFileName: (n: string) => void;
  excelData: OrderRow[];
  setExcelData: (d: OrderRow[]) => void;
  headerInfoRows: any[][];
  setHeaderInfoRows: (r: any[][]) => void;
  footerText: string[];
  setFooterText: (t: string[]) => void;
}> = ({ 
  currentUser, 
  setView, 
  fileName, 
  setFileName, 
  excelData, 
  setExcelData, 
  headerInfoRows, 
  setHeaderInfoRows, 
  footerText, 
  setFooterText 
}) => {
  const formatNum = (val: any) => {
    if (val === undefined || val === null || val === '') return '';
    const str = String(val).replace(/,/g, '').trim();
    if (str === '') return '';
    const num = parseFloat(str);
    if (isNaN(num)) return val;
    return num.toLocaleString();
  };

  const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const nameWithoutExt = file.name.replace(/\.[^/.]+$/, "");
      setFileName(nameWithoutExt);
      const reader = new FileReader();
      reader.onload = (e) => {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const json: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        const infoRows = json.slice(2, 5).filter(row => row && row.length > 0);
        setHeaderInfoRows(infoRows);

        let headerIndex = -1;
        for (let i = 0; i < json.length; i++) {
          const row = json[i];
          if (row && Array.isArray(row) && (row.includes('MOLD') || row.includes('DN'))) {
            headerIndex = i;
            break;
          }
        }

        if (headerIndex !== -1 && json.length > headerIndex + 1) {
          const headers: any[] = json[headerIndex].map(h => String(h || '').replace(/\s/g, ''));
          const findIndex = (patterns: string[]) => headers.findIndex(h => patterns.some(p => h.includes(p)));

          const idxMold = findIndex(['MOLD']);
          const idxDn = findIndex(['DN']);
          const idxPartName = findIndex(['PARTNAME']);
          const idxS = findIndex(['S']);
          const idxCty = findIndex(["C'TY", 'CTY']);
          const idxQty = findIndex(["Q'TY", 'QTY']);
          const idxMaterial = findIndex(['MATERIAL']);
          const idxVendor = findIndex(['금형업체', '금형']);
          const idxInjectionVendor = findIndex(['사출업체', '사출']);
          const idxOrderQty = findIndex(['주문수량', '주문']);
          const idxUnitPrice = findIndex(['단가']);
          const idxPrice = findIndex(['금액']);
          const idxExtra = findIndex(['추가']);
          const idxExtraAmount = findIndex(['추가금액']);
          const idxRemarksRSP = findIndex(['비고/R.SP', 'R.S/P', '비고']);

          const tableRows: OrderRow[] = [];
          const footerRows: string[] = [];
          let foundOldMold = false;

          const rawRows = json.slice(headerIndex + 1);
          for (let i = 0; i < rawRows.length; i++) {
            const row = rawRows[i];
            if (!row || row.length === 0) continue;
            const rowStr = row.join(' ').toLowerCase();
            if (rowStr.includes('old mold')) foundOldMold = true;
            if (foundOldMold) {
              footerRows.push(row.filter(cell => cell != null).join(' '));
              continue;
            }
            if (row[idxMold] || row[idxDn]) {
              tableRows.push({
                id: crypto.randomUUID ? crypto.randomUUID() : `injection-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                dept: String(row[idxMold] || ''),
                model: String(row[idxDn] || ''),
                itemName: String(row[idxPartName] || ''),
                s: String(row[idxS] || ''),
                cty: String(row[idxCty] || ''),
                qty: String(row[idxQty] || ''),
                price: String(row[idxQty] || ''),
                material: String(row[idxMaterial] || ''),
                vendor: String(row[idxVendor] || ''),
                injectionVendor: String(row[idxInjectionVendor] || ''),
                orderQty: String(row[idxOrderQty] || ''),
                unitPrice: String(row[idxUnitPrice] || ''),
                amount: String(row[idxPrice] || ''),
                remarks: String(row[idxRemarksRSP] || ''),
                extra: String(row[idxExtra] || ''),
                extraAmount: String(row[idxExtraAmount] || ''),
                remarksRSP: String(row[idxRemarksRSP] || ''),
              });
            }
          }
          const extraFooterLines = tableRows
            .filter(r => (r.extra && r.extra.trim() !== '') || (r.extraAmount && r.extraAmount.trim() !== '0' && r.extraAmount.trim() !== ''))
            .map(r => `[${r.itemName}] 추가: ${r.extra || '-'}, 추가금액: ${formatNum(r.extraAmount) || '0'}`);

          setExcelData(tableRows);
          setFooterText([...footerRows, ...extraFooterLines]);
        } else {
          alert('엑셀 파일에서 헤더(MOLD, DN 등)를 찾을 수 없습니다.');
        }
      };
      reader.readAsArrayBuffer(file);
    }
  }, [setFileName, setHeaderInfoRows, setExcelData, setFooterText]);

  const totals = useMemo(() => {
    const priceSubtotal = excelData.reduce((acc, row) => acc + (parseFloat(String(row.amount || '0').replace(/,/g, '')) || 0), 0);
    const extraSubtotal = excelData.reduce((acc, row) => acc + (parseFloat(String(row.extraAmount || '0').replace(/,/g, '')) || 0), 0);
    const priceVat = Math.floor(priceSubtotal * 0.1);
    const extraVat = Math.floor(extraSubtotal * 0.1);
    const priceTotal = priceSubtotal + priceVat;
    const extraTotal = extraSubtotal + extraVat;
    return { 
      price: { subtotal: priceSubtotal, vat: priceVat, total: priceTotal },
      extra: { subtotal: extraSubtotal, vat: extraVat, total: extraTotal }
    };
  }, [excelData]);

  const handleComplete = useCallback(async () => {
    if (excelData.length === 0) {
      alert('업로드된 데이터가 없습니다.');
      return;
    }
    if (!window.confirm('작성완료 하시겠습니까? 사출 결재대기로 이동됩니다.')) return;

    try {
      const now = new Date();
      const timestamp = now.toLocaleString();
      const newPO: PurchaseOrderItem = {
        id: `po-${Date.now()}`,
        code: 'INJECTION',
        title: fileName || 'Injection Order',
        type: PurchaseOrderSubCategory.PO1 as any,
        status: InjectionOrderSubCategory.PENDING as any,
        authorId: currentUser.initials,
        date: now.toISOString().split('T')[0],
        createdAt: now.toISOString(),
        rows: excelData,
        headerRows: headerInfoRows.map(row => row.filter(cell => cell != null).join(' ')),
        notes: footerText.map(line => ({ label: '기타', content: line })),
        stamps: {
          writer: { userId: currentUser.initials, timestamp: timestamp }
        }
      };

      const updateLocal = (key: string) => {
        const existing = JSON.parse(localStorage.getItem(key) || '[]');
        localStorage.setItem(key, JSON.stringify([newPO, ...existing]));
      };
      updateLocal('ajin_purchase_orders');
      updateLocal('ajin_injection_orders');
      saveSingleDoc('Injection_Order', newPO);
      sendJandiNotification('KR_PO', 'REQUEST', `[사출] ${fileName || 'Injection Order'}`, 'H-CHUN', now.toISOString().split('T')[0]);

      alert('작성완료 되었습니다. 사출 결재대기 목록에서 확인하실 수 있습니다.');
      setView({ type: 'INJECTION_ORDER_MAIN', sub: InjectionOrderSubCategory.PENDING });
    } catch (err) {
      console.error('Error completing injection order:', err);
      alert('저장 중 오류가 발생했습니다.');
    }
  }, [excelData, fileName, currentUser, setView, headerInfoRows, footerText]);

  const handlePrint = useCallback(() => {
    const content = document.querySelector('.injection-order-print')?.innerHTML;
    if (!content) return;
    const win = window.open('', '_blank');
    if (win) {
      win.document.write(`
        <html>
          <head>
            <title>Injection_Order_${fileName || 'Document'}</title>
            <script src="https://cdn.tailwindcss.com"></script>
            <style>
              @page { size: A4 portrait; margin: 10mm; }
              body { font-family: 'Inter', sans-serif; background: white; width: 100%; margin: 0; padding: 0; }
              * { color: black !important; border-color: black !important; print-color-adjust: exact; }
              table { border-collapse: collapse; width: 100%; border: 1.5px solid black; table-layout: fixed; }
              th { border: 0.5px solid black; padding: 4px 2px; vertical-align: middle; word-break: break-all; font-size: 8px; font-weight: 900; background-color: #f8fafc !important; }
              td { border-left: 0.5px solid black; border-right: 0.5px solid black; border-top: none; border-bottom: none; padding: 4px 2px; vertical-align: middle; word-break: break-all; font-size: 8px; font-weight: 600; }
              .border-t-bold { border-top: 1.5px solid black !important; }
              .border-b-bold { border-bottom: 1.5px solid black !important; }
            </style>
          </head>
          <body onload="window.print(); window.close();">
            <div class="p-4">${content}</div>
          </body>
        </html>
      `);
      win.document.close();
    }
  }, [fileName]);

  return (
    <div className="h-full flex flex-col overflow-hidden bg-slate-50 rounded-xl border border-slate-200 shadow-sm">
      <div className="p-6 bg-white border-b border-slate-200 shrink-0">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">사출 발주서 작성</h1>
            <p className="text-sm text-slate-500 font-medium">엑셀 파일을 업로드하여 발주서를 작성합니다.</p>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center px-5 py-2.5 bg-blue-600 text-white rounded-xl cursor-pointer hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/20 font-bold text-sm">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
              </svg>
              엑셀 업로드
              <input type="file" accept=".xlsx, .xls" onChange={handleFileUpload} className="hidden" />
            </label>
            {excelData.length > 0 && (
              <>
                <button onClick={handleComplete} className="px-5 py-2.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-all font-bold text-sm flex items-center shadow-lg shadow-emerald-500/20">
                  작성완료
                </button>
                <button onClick={handlePrint} className="px-5 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 transition-all font-bold text-sm flex items-center shadow-sm">
                  인쇄 / PDF
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
        {excelData.length > 0 ? (
          <>
            <div className="flex justify-end">
              <table className="border-collapse border-slate-300 border-[1px] text-center text-[11px] w-auto bg-white shadow-sm rounded-lg overflow-hidden">
                <tbody>
                  <tr>
                    <td rowSpan={2} className="border border-slate-300 px-2 py-4 bg-slate-50 font-black text-slate-500 w-10 uppercase tracking-tighter">결 재</td>
                    {['담 당', '설 계', '이 사', '대 표'].map(label => (
                      <td key={label} className="border border-slate-300 py-1 px-4 bg-slate-50 font-bold text-slate-600 min-w-[80px]">{label}</td>
                    ))}
                  </tr>
                  <tr className="h-16">
                    <td className="border border-slate-300 p-1 align-middle min-w-[80px]">
                      <div className="flex flex-col items-center">
                        <span className="font-black text-blue-600 text-sm">{currentUser.initials}</span>
                        <span className="text-[9px] text-slate-400 font-bold mt-1">{new Date().toLocaleString()}</span>
                      </div>
                    </td>
                    <td className="border border-slate-300 p-1 align-middle min-w-[80px]"></td>
                    <td className="border border-slate-300 p-1 align-middle min-w-[80px]"></td>
                    <td className="border border-slate-300 p-1 align-middle min-w-[80px]"></td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="bg-slate-50/80 border-b-2 border-slate-300 text-black">
                      <th className="px-1 py-3 text-[13px] font-black border-r border-slate-200">MOLD</th>
                      <th className="px-1 py-3 text-[13px] font-black border-r border-slate-200">DN</th>
                      <th className="px-1 py-3 text-[13px] font-black border-r border-slate-200">PART NAME</th>
                      <th className="px-1 py-3 text-[13px] font-black border-r border-slate-200 text-center">QTY</th>
                      <th className="px-1 py-3 text-[13px] font-black border-r border-slate-200 text-center">단가</th>
                      <th className="px-1 py-3 text-[13px] font-black border-r border-slate-200 text-center">금액</th>
                      <th className="px-1 py-3 text-[13px] font-black">비고</th>
                    </tr>
                  </thead>
                  <tbody>
                    {excelData.map((row, index) => (
                      <tr key={index} className="border-b border-slate-100">
                        <td className="px-1 py-2 text-[14px] font-bold border-r border-slate-100">{row.dept}</td>
                        <td className="px-1 py-2 text-[14px] border-r border-slate-100">{row.model}</td>
                        <td className="px-1 py-2 text-[14px] border-r border-slate-100">{row.itemName}</td>
                        <td className="px-1 py-2 text-[14px] border-r border-slate-100 text-center">{formatNum(row.qty)}</td>
                        <td className="px-1 py-2 text-[14px] border-r border-slate-100 text-right">{formatNum(row.unitPrice)}</td>
                        <td className="px-1 py-2 text-[14px] font-bold border-r border-slate-100 text-right">{formatNum(row.amount)}</td>
                        <td className="px-1 py-2 text-[14px]">{row.remarksRSP}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <p>엑셀 파일을 업로드해 주세요.</p>
          </div>
        )}
      </div>

      {/* Hidden Print Content */}
      <div className="hidden">
        <div className="injection-order-print">
          <h1 className="text-center text-xl font-black underline mb-8">사출 발주서 (INJECTION ORDER)</h1>
          <table className="w-full border-collapse border border-black">
            <thead>
              <tr>
                <th className="border border-black p-1 text-[8px]">MOLD</th>
                <th className="border border-black p-1 text-[8px]">DN</th>
                <th className="border border-black p-1 text-[8px]">PART NAME</th>
                <th className="border border-black p-1 text-[8px]">QTY</th>
                <th className="border border-black p-1 text-[8px]">단가</th>
                <th className="border border-black p-1 text-[8px]">금액</th>
              </tr>
            </thead>
            <tbody>
              {excelData.map((row, idx) => (
                <tr key={idx}>
                  <td className="border border-black p-1 text-[8px]">{row.dept}</td>
                  <td className="border border-black p-1 text-[8px]">{row.model}</td>
                  <td className="border border-black p-1 text-[8px]">{row.itemName}</td>
                  <td className="border border-black p-1 text-[8px] text-center">{formatNum(row.qty)}</td>
                  <td className="border border-black p-1 text-[8px] text-right">{formatNum(row.unitPrice)}</td>
                  <td className="border border-black p-1 text-[8px] text-right">{formatNum(row.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// --- Main Component ---
const Injection_Order: React.FC<InjectionOrderMainProps> = ({ 
  sub, 
  currentUser, 
  userAccounts, 
  setView, 
  dataVersion 
}) => {
  const [orders, setOrders] = useState<PurchaseOrderItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Creation state
  const [fileName, setFileName] = useState<string>('');
  const [excelData, setExcelData] = useState<OrderRow[]>([]);
  const [headerInfoRows, setHeaderInfoRows] = useState<any[][]>([]);
  const [footerText, setFooterText] = useState<string[]>([]);

  useEffect(() => {
    const saved = localStorage.getItem('ajin_purchase_orders');
    if (saved) {
      const allOrders: PurchaseOrderItem[] = JSON.parse(saved);
      const injectionOrders = allOrders.filter(o => o.code === 'INJECTION');
      setOrders(injectionOrders);
    }
  }, [dataVersion, sub]);

  const filteredOrders = orders.filter(order => {
    const matchesSearch = order.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         order.recipient?.toLowerCase().includes(searchTerm.toLowerCase());
    if (!matchesSearch) return false;

    if (sub === InjectionOrderSubCategory.PENDING) return order.status === InjectionOrderSubCategory.PENDING;
    if (sub === InjectionOrderSubCategory.REJECTED) return order.status === InjectionOrderSubCategory.REJECTED;
    if (sub === InjectionOrderSubCategory.APPROVED) return order.status === InjectionOrderSubCategory.APPROVED;
    if (sub === InjectionOrderSubCategory.TEMPORARY) return order.status.includes('임시저장');
    if (sub === InjectionOrderSubCategory.DESTINATION) return !!order.stamps.final;
    return true;
  });

  const handleRowClick = (order: PurchaseOrderItem) => {
    setView({ type: 'PURCHASE', sub: order.status as any });
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 overflow-hidden">
      {sub === InjectionOrderSubCategory.CREATE ? (
        <InjectionOrderCreateView 
          currentUser={currentUser}
          setView={setView}
          fileName={fileName}
          setFileName={setFileName}
          excelData={excelData}
          setExcelData={setExcelData}
          headerInfoRows={headerInfoRows}
          setHeaderInfoRows={setHeaderInfoRows}
          footerText={footerText}
          setFooterText={setFooterText}
        />
      ) : (
        <>
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
                <p>표시할 데이터가 없습니다.</p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default Injection_Order;
