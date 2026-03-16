import React, { useState, useCallback, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { pushStateToCloud, saveSingleDoc, supabase, sendJandiNotification } from '../supabase';
import { OrderSubCategory, OrderRow, UserAccount, ViewState, PurchaseOrderItem, PurchaseOrderSubCategory, StampInfo } from '../types';

interface InjectionOrderViewProps {
  sub: OrderSubCategory;
  currentUser: UserAccount;
  userAccounts: UserAccount[];
  setView: (v: ViewState) => void;
  dataVersion: number;
}

const InjectionOrderView: React.FC<InjectionOrderViewProps> = ({ sub, currentUser, userAccounts, setView, dataVersion }) => {
  const [excelData, setExcelData] = useState<OrderRow[]>([]);
  const [headerInfoRows, setHeaderInfoRows] = useState<any[][]>([]);
  const [footerText, setFooterText] = useState<string[]>([]);
  const [fileName, setFileName] = useState<string>('');
  const [approvalStatus, setApprovalStatus] = useState<Record<string, any>>({
    manager: { approved: false },
    designer: { approved: false },
    director: { approved: false },
    ceo: { approved: false },
  });

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

        // Capture rows 3-5 (indices 2, 3, 4)
        const infoRows = json.slice(2, 5).filter(row => row && row.length > 0);
        setHeaderInfoRows(infoRows);

        // Find the header row (the one containing 'MOLD' or 'DN')
        let headerIndex = -1;
        for (let i = 0; i < json.length; i++) {
          const row = json[i];
          if (row && Array.isArray(row) && (row.includes('MOLD') || row.includes('DN'))) {
            headerIndex = i;
            break;
          }
        }

        if (headerIndex !== -1 && json.length > headerIndex + 1) {
          const headers: any[] = json[headerIndex].map(h => String(h || '').replace(/\s/g, '')); // Remove whitespace and newlines for matching
          
          const findIndex = (patterns: string[]) => {
            return headers.findIndex(h => patterns.some(p => h.includes(p)));
          };

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
            if (rowStr.includes('old mold')) {
              foundOldMold = true;
            }

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
                price: String(row[idxQty] || ''), // PurchaseOrderView expects QTY in 'price' field for PO1
                material: String(row[idxMaterial] || ''),
                vendor: String(row[idxVendor] || ''),
                injectionVendor: String(row[idxInjectionVendor] || ''),
                orderQty: String(row[idxOrderQty] || ''),
                unitPrice: String(row[idxUnitPrice] || ''),
                amount: String(row[idxPrice] || ''), // PurchaseOrderView expects Total in 'amount' field for PO1
                remarks: String(row[idxRemarksRSP] || ''),
                extra: String(row[idxExtra] || ''),
                extraAmount: String(row[idxExtraAmount] || ''),
                remarksRSP: String(row[idxRemarksRSP] || ''),
              });
            }
          }

          // Move extra information to footer
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
  }, []);

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

    if (!window.confirm('작성완료 하시겠습니까? PO 결재대기로 이동됩니다.')) return;

    try {
      const now = new Date();
      const timestamp = now.toLocaleString();
      
      const newPO: PurchaseOrderItem = {
        id: `po-${Date.now()}`,
        code: `PO-${Date.now()}`,
        title: fileName || 'Injection Order',
        type: PurchaseOrderSubCategory.PO1,
        status: PurchaseOrderSubCategory.PENDING,
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

      // [최적화] 1. Local Storage 업데이트 (목록 이동 시 즉시 반영용)
      const updateLocal = (key: string) => {
        const existing = JSON.parse(localStorage.getItem(key) || '[]');
        localStorage.setItem(key, JSON.stringify([newPO, ...existing]));
      };
      
      updateLocal('ajin_purchase_orders');
      updateLocal('ajin_injection_orders');

      // [최적화] 2. Supabase 개별 저장 (전체 백업 대신 이 건만 전송)
      saveSingleDoc('injectionorder', newPO);
      
      // JANDI 알림: 사출발주서 작성 완료 시 한국 결재자인 'H-CHUN'(설계)에게 요청
      sendJandiNotification('KR_PO', 'REQUEST', `[사출] ${fileName || 'Injection Order'}`, 'H-CHUN', now.toISOString().split('T')[0]);

      alert('작성완료 되었습니다. PO 결재대기 목록에서 확인하실 수 있습니다.');
      
      // 이동 처리
      // If we are in Injection Order Main, go back to its pending list
      setView({ type: 'INJECTION_ORDER_MAIN', sub: '사출 결재대기' as any });
    } catch (err) {
      console.error('Error completing injection order:', err);
      alert('저장 중 오류가 발생했습니다.');
    }
  }, [excelData, fileName, currentUser, setView]);

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
              .no-print { display: none !important; }
              table { border-collapse: collapse; width: 100%; border: 1.5px solid black; table-layout: fixed; }
              th { border: 0.5px solid black; padding: 4px 2px; vertical-align: middle; word-break: break-all; font-size: 8px; font-weight: 900; background-color: #f8fafc !important; }
              td { border-left: 0.5px solid black; border-right: 0.5px solid black; border-top: none; border-bottom: none; padding: 4px 2px; vertical-align: middle; word-break: break-all; font-size: 8px; font-weight: 600; }
              .document-wrapper { padding: 0; box-sizing: border-box; }
              .approval-box { width: 80px; height: 80px; border: 1px solid black; display: flex; flex-direction: column; align-items: center; justify-content: center; }
              .border-t-bold { border-top: 1.5px solid black !important; }
              .border-b-bold { border-bottom: 1.5px solid black !important; }
              .border-t-thin { border-top: 0.5px solid black !important; }
              .border-b-thin { border-bottom: 0.5px solid black !important; }
              
              /* Page numbering footer */
              .footer {
                position: fixed;
                bottom: 0;
                left: 0;
                right: 0;
                text-align: center;
                font-size: 8px;
                padding: 5px 0;
                display: none;
              }
              @media print {
                .footer { display: block; }
                @page { margin-bottom: 20mm; }
              }
              .page-number:after {
                content: "Page " counter(page);
              }
            </style>
          </head>
          <body onload="window.print(); window.close();">
            <div class="document-wrapper">${content}</div>
            <div class="footer">
              ${fileName} - <span class="page-number"></span>
            </div>
          </body>
        </html>
      `);
      win.document.close();
    }
  }, [fileName]);

  return (
    <div className="h-full flex flex-col overflow-hidden bg-slate-50 rounded-xl border border-slate-200 shadow-sm">
      {/* Header Section */}
      <div className="p-6 bg-white border-b border-slate-200 shrink-0">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setView({ type: 'DASHBOARD' })}
              className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-600"
              title="닫기"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">사출 발주서 (Injection Order)</h1>
              <p className="text-sm text-slate-500 font-medium">엑셀 파일을 업로드하여 발주서를 작성하고 승인합니다.</p>
            </div>
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
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  작성완료
                </button>
                <button onClick={handlePrint} className="px-5 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 transition-all font-bold text-sm flex items-center shadow-sm">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M5 4v3H4a2 2 0 00-2 2v3a2 2 0 002 2h1v2a2 2 0 002 2h6a2 2 0 002-2v-2h1a2 2 0 002-2V9a2 2 0 00-2-2h-1V4a2 2 0 00-2-2H7a2 2 0 00-2 2zm8 0H7v3h6V4zm0 8H7v4h6v-4z" clipRule="evenodd" />
                  </svg>
                  인쇄 / PDF
                </button>
              </>
            )}
          </div>
        </div>
        {fileName && (
          <div className="mt-3 inline-flex items-center px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-bold border border-blue-100">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1.5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A1 1 0 0111.293 2.707l3 3a1 1 0 01.293.707V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
            </svg>
            {fileName}
          </div>
        )}
      </div>

      {/* Main Content - Scrollable */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {excelData.length > 0 ? (
          <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
            {/* Approval Section */}
            <div className="flex justify-end">
              <table className="border-collapse border-slate-300 border-[1px] text-center text-[11px] w-auto bg-white shadow-sm rounded-lg overflow-hidden">
                <tbody>
                  <tr>
                    <td rowSpan={2} className="border border-slate-300 px-2 py-4 bg-slate-50 font-black text-slate-500 w-10 uppercase tracking-tighter">결 재</td>
                    {['writer', 'design', 'director', 'ceo'].map(slot => (
                      <td key={slot} className="border border-slate-300 py-1 px-4 bg-slate-50 font-bold text-slate-600 min-w-[80px]">
                        {slot === 'writer' ? '담 당' : slot === 'design' ? '설 계' : slot === 'director' ? '이 사' : '대 표'}
                      </td>
                    ))}
                  </tr>
                  <tr className="h-16">
                    {['writer', 'design', 'director', 'ceo'].map(slot => (
                      <td key={slot} className="border border-slate-300 p-1 align-middle min-w-[80px]">
                        {slot === 'writer' ? (
                          <div className="flex flex-col items-center">
                            <span className="font-black text-blue-600 text-sm">{currentUser.initials}</span>
                            <span className="text-[9px] text-slate-400 font-bold mt-1">{new Date().toLocaleString()}</span>
                          </div>
                        ) : null}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Excel Rows 3-5 Info (UI View) */}
            {headerInfoRows.length > 0 && (
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm max-w-4xl overflow-hidden">
                <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">업로드 파일 정보 (3~5행)</h2>
                <div className="space-y-1.5">
                  {headerInfoRows.map((row, idx) => (
                    <div key={idx} className="flex flex-wrap gap-x-6 gap-y-1 text-[13px] font-bold text-slate-700 border-b border-slate-50 last:border-0 pb-1.5 last:pb-0">
                      {row.map((cell, cIdx) => (
                        <span key={cIdx} className="inline-block">{String(cell || '')}</span>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Data Table Section */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
              <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                <h2 className="text-sm font-black text-slate-900 uppercase tracking-widest">발주 품목 리스트</h2>
                <span className="text-[10px] font-bold text-slate-400 bg-white px-2 py-1 rounded-md border border-slate-200">TOTAL: {excelData.length} ITEMS</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="bg-slate-50/80 border-b-2 border-slate-300 text-black">
                      <th className="w-[6%] px-1 py-3 text-[13px] font-black uppercase tracking-tighter border-r border-slate-200">MOLD</th>
                      <th className="w-[6%] px-1 py-3 text-[13px] font-black uppercase tracking-tighter border-r border-slate-200">DN</th>
                      <th className="w-[3%] px-0 py-3 text-[13px] font-black uppercase tracking-tighter border-r border-slate-200 text-center">S</th>
                      <th className="w-[25%] px-1 py-3 text-[13px] font-black uppercase tracking-tighter border-r border-slate-200">PART NAME</th>
                      <th className="w-[4%] px-0 py-3 text-[13px] font-black uppercase tracking-tighter border-r border-slate-200 text-center">CTY</th>
                      <th className="w-[4%] px-0 py-3 text-[13px] font-black uppercase tracking-tighter border-r border-slate-200 text-center">QTY</th>
                      <th className="w-[10%] px-1 py-3 text-[13px] font-black uppercase tracking-tighter border-r border-slate-200">MATERIAL</th>
                      <th className="w-[5%] px-0 py-3 text-[13px] font-black uppercase tracking-tighter border-r border-slate-200 text-center leading-tight">금형<br/>업체</th>
                      <th className="w-[5%] px-0 py-3 text-[13px] font-black uppercase tracking-tighter border-r border-slate-200 text-center leading-tight">사출<br/>업체</th>
                      <th className="w-[6%] px-0 py-3 text-[13px] font-black uppercase tracking-tighter border-r border-slate-200 text-center leading-tight">주문<br/>수량</th>
                      <th className="w-[8%] px-1 py-3 text-[13px] font-black uppercase tracking-tighter border-r border-slate-200 text-center">단가</th>
                      <th className="w-[9%] px-1 py-3 text-[13px] font-black uppercase tracking-tighter border-r border-slate-200 text-center">금액</th>
                      <th className="w-[9%] px-1 py-3 text-[13px] font-black uppercase tracking-tighter">비고 R.S/P</th>
                    </tr>
                  </thead>
                  <tbody className="text-black">
                    {excelData.map((row, index) => {
                      const hasMold = !!row.dept && row.dept.trim() !== '';
                      const nextRowHasMold = index < excelData.length - 1 && !!excelData[index + 1].dept && excelData[index + 1].dept.trim() !== '';
                      const isLastRow = index === excelData.length - 1;
                      
                      const borderTopClass = hasMold ? 'border-t-2 border-slate-400' : '';
                      const borderBottomClass = (nextRowHasMold || isLastRow) ? 'border-b-2 border-slate-400' : '';

                      const unitPriceStr = row.unitPrice && row.unitPrice.trim() !== '' ? `@ ${formatNum(row.unitPrice)}` : '';

                      return (
                        <tr key={row.id || index} className={`hover:bg-slate-50/50 transition-colors group ${borderTopClass} ${borderBottomClass}`}>
                          <td className="px-1 py-2 text-[15px] font-bold border-r border-slate-100 break-words">{row.dept}</td>
                          <td className="px-1 py-2 text-[15px] border-r border-slate-100 break-words">{row.model}</td>
                          <td className="px-0 py-2 text-[15px] border-r border-slate-100 text-center">{row.s}</td>
                          <td className="px-1 py-2 text-[15px] font-medium border-r border-slate-100 break-words">{row.itemName}</td>
                          <td className="px-0 py-2 text-[15px] border-r border-slate-100 text-center">{row.cty}</td>
                          <td className="px-0 py-2 text-[15px] border-r border-slate-100 text-center">{formatNum(row.price)}</td>
                          <td className="px-1 py-2 text-[15px] border-r border-slate-100 break-words">{row.material}</td>
                          <td className="px-0 py-2 text-[15px] border-r border-slate-100 text-center">{row.vendor}</td>
                          <td className="px-0 py-2 text-[15px] border-r border-slate-100 text-center">{row.injectionVendor}</td>
                          <td className="px-0 py-2 text-[15px] border-r border-slate-100 text-center">{formatNum(row.orderQty)}</td>
                          <td className="px-1 py-2 text-[15px] border-r border-slate-100 text-right whitespace-normal break-all">{unitPriceStr}</td>
                          <td className="px-1 py-2 text-[15px] font-bold border-r border-slate-100 text-right">{formatNum(row.amount)}</td>
                          <td className="px-1 py-2 text-[15px] italic text-slate-500 break-words">{row.remarksRSP}</td>
                        </tr>
                      );
                    })}
                    {/* Summary Rows */}
                    <tr className="bg-slate-50/30 font-bold text-black border-t-2 border-slate-400">
                      <td colSpan={11} className="px-4 py-3 text-right text-[13px] uppercase tracking-widest border-r border-slate-100">합계 (Subtotal)</td>
                      <td className="px-1 py-3 text-[15px] text-right border-r border-slate-100">{totals.price.subtotal.toLocaleString()}</td>
                      <td className="px-1 py-3"></td>
                    </tr>
                    <tr className="bg-slate-50/30 font-bold text-black">
                      <td colSpan={11} className="px-4 py-3 text-right text-[13px] uppercase tracking-widest border-r border-slate-100">부가세 (VAT 10%)</td>
                      <td className="px-1 py-3 text-[15px] text-right border-r border-slate-100">{totals.price.vat.toLocaleString()}</td>
                      <td className="px-1 py-3"></td>
                    </tr>
                    <tr className="bg-blue-50/50 font-black text-black border-b-2 border-slate-400">
                      <td colSpan={11} className="px-4 py-3 text-right text-[13px] text-blue-600 uppercase tracking-widest border-r border-slate-100">총액 (Grand Total)</td>
                      <td className="px-1 py-3 text-[16px] text-blue-700 text-right border-r border-slate-100">{totals.price.total.toLocaleString()}</td>
                      <td className="px-1 py-3"></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Footer Text Section */}
            {footerText.length > 0 && (
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <h2 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-4">추가 정보 (Footer Text)</h2>
                <div className="space-y-1">
                  {footerText.map((line, idx) => (
                    <p key={idx} className="text-[15px] text-slate-600 font-medium">{line}</p>
                  ))}
                </div>
              </div>
            )}

            {/* Hidden Print Content (VN Style) */}
            <div className="hidden">
              <div className="injection-order-print">
                <div className="flex flex-col items-center">
                  <h1 className="text-xl font-black underline mb-8">사출 발주서 (INJECTION ORDER)</h1>
                  
                  <div className="w-full flex justify-between items-start mb-8">
                    <div className="text-sm font-bold">
                      <p>파일명: {fileName}</p>
                      <p>작성일: {new Date().toLocaleDateString()}</p>
                    </div>
                    
                    <div className="flex border border-black divide-x divide-black">
                      {['writer', 'design', 'director', 'ceo'].map((slot, idx) => {
                        const label = slot === 'writer' ? '담당' : slot === 'design' ? '설계' : slot === 'director' ? '이사' : '대표';
                        return (
                          <div key={idx} className="w-16 h-20 flex flex-col">
                            <div className="h-6 border-b border-black flex items-center justify-center text-[7px] font-black bg-slate-50">{label}</div>
                            <div className="flex-1 flex flex-col items-center justify-center leading-tight">
                              {slot === 'writer' && (
                                <>
                                  <span className="font-black text-[10px] text-blue-700">{currentUser.initials}</span>
                                  <span className="text-[6px] text-slate-500 mt-0.5">{new Date().toLocaleString()}</span>
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Excel Rows 3-5 Info */}
                  {headerInfoRows.length > 0 && (
                    <div className="w-full mb-4 border border-black p-2 bg-slate-50/30">
                      {headerInfoRows.map((row, idx) => (
                        <div key={idx} className="flex gap-4 text-[9px] font-medium border-b border-black/5 last:border-0 py-0.5">
                          {row.map((cell, cIdx) => (
                            <span key={cIdx}>{String(cell || '')}</span>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}

                  <table className="w-full border-collapse border border-black">
                    <thead>
                      <tr className="bg-slate-50 text-black">
                        <th className="w-[55px] border border-black px-1 py-1 text-[8px] font-black">MOLD</th>
                        <th className="w-[40px] border border-black px-1 py-1 text-[8px] font-black">DN</th>
                        <th className="w-[15px] border border-black px-0 py-1 text-[8px] font-black">S</th>
                        <th className="w-[150px] border border-black px-1 py-1 text-[8px] font-black">PART NAME</th>
                        <th className="w-[25px] border border-black px-0 py-1 text-[8px] font-black">CTY</th>
                        <th className="w-[25px] border border-black px-0 py-1 text-[8px] font-black">QTY</th>
                        <th className="w-[60px] border border-black px-1 py-1 text-[8px] font-black">MATERIAL</th>
                        <th className="w-[35px] border border-black px-0 py-1 text-[8px] font-black leading-tight">금형<br/>업체</th>
                        <th className="w-[35px] border border-black px-0 py-1 text-[8px] font-black leading-tight">사출<br/>업체</th>
                        <th className="w-[40px] border border-black px-0 py-1 text-[8px] font-black leading-tight">주문<br/>수량</th>
                        <th className="w-[50px] border border-black px-1 py-1 text-[8px] font-black">단가</th>
                        <th className="w-[65px] border border-black px-1 py-1 text-[8px] font-black">금액</th>
                        <th className="w-[65px] border border-black px-1 py-1 text-[8px] font-black">비고 R.S/P</th>
                      </tr>
                    </thead>
                    <tbody className="text-black">
                      {excelData.map((row, idx) => {
                        const hasMold = !!row.dept && row.dept.trim() !== '';
                        const nextRowHasMold = idx < excelData.length - 1 && !!excelData[idx + 1].dept && excelData[idx + 1].dept.trim() !== '';
                        const isLastRow = idx === excelData.length - 1;
                        
                        const borderTopClass = hasMold ? 'border-t-bold' : '';
                        const borderBottomClass = (nextRowHasMold || isLastRow) ? 'border-b-bold' : '';

                        const unitPriceStr = row.unitPrice && row.unitPrice.trim() !== '' ? `@ ${formatNum(row.unitPrice)}` : '';

                        return (
                          <tr key={idx} className={`${borderTopClass} ${borderBottomClass}`}>
                            <td className="px-1 py-1 text-[8px] font-bold">{row.dept}</td>
                            <td className="px-1 py-1 text-[8px]">{row.model}</td>
                            <td className="px-0 py-1 text-[8px] text-center">{row.s}</td>
                            <td className="px-1 py-1 text-[8px] font-medium">{row.itemName}</td>
                            <td className="px-0 py-1 text-[8px] text-center">{row.cty}</td>
                            <td className="px-0 py-1 text-[8px] text-center">{formatNum(row.price)}</td>
                            <td className="px-1 py-1 text-[8px]">{row.material}</td>
                            <td className="px-0 py-1 text-[8px] text-center">{row.vendor}</td>
                            <td className="px-0 py-1 text-[8px] text-center">{row.injectionVendor}</td>
                            <td className="px-0 py-1 text-[8px] text-center">{formatNum(row.orderQty)}</td>
                            <td className="px-1 py-1 text-[8px] text-right whitespace-normal break-all">{unitPriceStr}</td>
                            <td className="px-1 py-1 text-[8px] font-bold text-right">{formatNum(row.amount)}</td>
                            <td className="px-1 py-1 text-[8px] italic">{row.remarksRSP}</td>
                          </tr>
                        );
                      })}
                      {/* Summary Rows for Print */}
                      <tr className="border-t-bold">
                        <td colSpan={11} className="border border-black px-2 py-1 text-[8px] text-right font-bold">합계 (Subtotal)</td>
                        <td className="border border-black px-1 py-1 text-[8px] font-bold text-right">{totals.price.subtotal.toLocaleString()}</td>
                        <td className="border border-black px-1 py-1"></td>
                      </tr>
                      <tr className="border-t-thin border-b-thin">
                        <td colSpan={11} className="border border-black px-2 py-1 text-[8px] text-right font-bold">부가세 (VAT 10%)</td>
                        <td className="border border-black px-1 py-1 text-[8px] font-bold text-right">{totals.price.vat.toLocaleString()}</td>
                        <td className="border border-black px-1 py-1"></td>
                      </tr>
                      <tr className="bg-slate-50 border-b-bold">
                        <td colSpan={11} className="border border-black px-2 py-1 text-[8px] text-right font-black">총액 (Grand Total)</td>
                        <td className="border border-black px-1 py-1 text-[8px] font-black text-right">{totals.price.total.toLocaleString()}</td>
                        <td className="border border-black px-1 py-1"></td>
                      </tr>
                    </tbody>
                  </table>

                  {/* Footer Text for Print */}
                  {footerText.length > 0 && (
                    <div className="w-full mt-4 text-[8px] space-y-1">
                      {footerText.map((line, idx) => (
                        <p key={idx} className="font-medium">{line}</p>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center bg-slate-50/50">
            <div className="w-24 h-24 bg-white rounded-[2rem] border-2 border-slate-100 flex items-center justify-center mb-6 shadow-sm">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 className="text-xl font-black text-slate-900 mb-2">데이터가 없습니다.</h3>
            <p className="text-slate-500 font-medium max-w-xs mx-auto mb-8">엑셀 파일을 업로드하여 발주서 작성을 시작하십시오.</p>
            <label className="inline-flex items-center px-8 py-3 bg-slate-900 text-white rounded-2xl cursor-pointer hover:bg-black transition-all shadow-xl shadow-slate-900/10 font-black text-sm uppercase tracking-widest">
              파일 선택하기
              <input type="file" accept=".xlsx, .xls" onChange={handleFileUpload} className="hidden" />
            </label>
          </div>
        )}
      </div>
    </div>
  );
};

export default InjectionOrderView;
