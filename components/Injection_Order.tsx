import React, { useState, useCallback, useMemo, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { pushStateToCloud, saveSingleDoc, supabase, sendJandiNotification, deleteSingleDoc } from '../supabase';
import { OrderRow, UserAccount, ViewState, InjectionOrderSubCategory, StampInfo } from '../types';
import InjectionTake from './injection_order/injection_take';

interface InjectionOrderViewProps {
  sub: InjectionOrderSubCategory;
  currentUser: UserAccount;
  userAccounts: UserAccount[];
  setView: (v: ViewState) => void;
  dataVersion: number;
}

const InjectionOrderView: React.FC<InjectionOrderViewProps> = ({ sub, currentUser, userAccounts, setView, dataVersion }) => {
  const [items, setItems] = useState<any[]>([]);
  const [activeItem, setActiveItem] = useState<any | null>(null);
  const [excelData, setExcelData] = useState<OrderRow[]>([]);
  const [headerInfoRows, setHeaderInfoRows] = useState<any[][]>([]);
  const [footerText, setFooterText] = useState<string[]>([]);
  const [fileName, setFileName] = useState<string>('');
  const [viewMode, setViewMode] = useState<'icon' | 'list'>('icon');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [showInjectionTake, setShowInjectionTake] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);
  
  // Load items from local storage
  useEffect(() => {
    const saved = localStorage.getItem('ajin_injection_orders');
    if (saved) {
      const allItems = JSON.parse(saved);
      const filtered = allItems.filter((item: any) => item.status === sub);
      setItems(filtered);
    }
  }, [sub, dataVersion]);

  useEffect(() => {
    setCurrentPage(1);
    setActiveItem(null);
    setSelectedRoom(null);
  }, [sub, searchTerm]);

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
                model: String(row[idxMold] || ''),
                dept: String(row[idxDn] || ''),
                itemName: String(row[idxPartName] || ''),
                s: String(row[idxS] || ''),
                cty: String(row[idxCty] || ''),
                qty: String(row[idxQty] || ''),
                material: String(row[idxMaterial] || ''),
                vendor: String(row[idxVendor] || ''),
                injectionVendor: String(row[idxInjectionVendor] || ''),
                orderQty: String(row[idxOrderQty] || ''),
                unitPrice: String(row[idxUnitPrice] || ''),
                price: String(row[idxPrice] || ''),
                remarks: String(row[idxRemarksRSP] || ''), // Keep remarks for compatibility if needed
                extra: String(row[idxExtra] || ''),
                extraAmount: String(row[idxExtraAmount] || ''),
                remarksRSP: String(row[idxRemarksRSP] || ''),
              });
            }
          }

          setExcelData(tableRows);
          setFooterText(footerRows);
        } else {
          alert('엑셀 파일에서 헤더(MOLD, DN 등)를 찾을 수 없습니다.');
        }
      };
      reader.readAsArrayBuffer(file);
    }
  }, []);

  const totals = useMemo(() => {
    const priceSubtotal = excelData.reduce((acc, row) => acc + (parseFloat(String(row.price || '0').replace(/,/g, '')) || 0), 0);
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

  const formatNum = (val: any) => {
    if (val === undefined || val === null || val === '') return '';
    const str = String(val).replace(/,/g, '').trim();
    if (str === '') return '';
    const num = parseFloat(str);
    if (isNaN(num)) return val;
    return num.toLocaleString();
  };

  const handleApprove = async (role: string) => {
    if (!activeItem) return;

    // Strict initial check
    const allowedInitials: Record<string, string> = {
      design: 'H-CHUN',
      director: 'M-YEUN',
      ceo: 'DAVID'
    };

    const userInit = currentUser.initials.toUpperCase();
    const targetInit = allowedInitials[role];

    if (userInit !== targetInit && userInit !== 'MASTER') {
      alert(`해당 직위(${role === 'design' ? '설계' : role === 'director' ? '이사' : '대표'}) 승인 권한이 없습니다. (필요: ${targetInit} 또는 MASTER)`);
      return;
    }

    // Sequence check
    if (role === 'director' && !activeItem.stamps?.design) {
      alert('설계 승인이 먼저 완료되어야 합니다.');
      return;
    }
    if (role === 'ceo' && !activeItem.stamps?.director) {
      alert('이사 승인이 먼저 완료되어야 합니다.');
      return;
    }

    if (!window.confirm(`${role === 'design' ? '설계' : role === 'director' ? '이사' : '대표'} 승인하시겠습니까?`)) return;

    try {
      const now = new Date();
      const timestamp = now.toLocaleString();
      
      const isInj = activeItem.id?.startsWith('inj-');
      const isFinalStep = isInj ? role === 'director' : role === 'ceo';

      const updatedItem = {
        ...activeItem,
        status: isFinalStep ? InjectionOrderSubCategory.APPROVED : activeItem.status,
        stamps: {
          ...activeItem.stamps,
          [role]: { userId: currentUser.initials, timestamp },
          ...(isFinalStep ? { final: { userId: currentUser.initials, timestamp } } : {})
        }
      };

      // Update Local Storage
      const allItems = JSON.parse(localStorage.getItem('ajin_injection_orders') || '[]');
      const updatedItems = allItems.map((item: any) => item.id === activeItem.id ? updatedItem : item);
      localStorage.setItem('ajin_injection_orders', JSON.stringify(updatedItems));

      // Update State
      setItems(updatedItems.filter((item: any) => item.status === sub));
      
      if (isFinalStep) {
        alert(`${role === 'director' ? '이사' : '대표'} 승인이 완료되어 결재완료 목록으로 이동합니다.`);
        setActiveItem(null);
        setView({ type: 'INJECTION_ORDER_MAIN', sub: InjectionOrderSubCategory.APPROVED });
      } else {
        alert('승인되었습니다.');
        setActiveItem(null);
      }

      // Update Supabase
      const tableName = activeItem.id?.startsWith('inj-') ? 'Injection_Take' : 'Injection_Order';
      await saveSingleDoc(tableName, updatedItem);
      
      // JANDI Notification
      let nextRecipient = '';
      if (role === 'design') nextRecipient = 'DIRECTOR';
      else if (role === 'director') nextRecipient = 'CEO';
      
      if (nextRecipient) {
        sendJandiNotification('KR_PO', 'APPROVE', `[사출] ${activeItem.title}`, nextRecipient, now.toISOString().split('T')[0]);
      }

      pushStateToCloud();
    } catch (err) {
      console.error('Error approving:', err);
      alert('승인 처리 중 오류가 발생했습니다.');
    }
  };

  const handleFinalConfirm = async () => {
    if (!activeItem) return;
    if (!window.confirm('최종 확인하여 결재완료로 이동하시겠습니까?')) return;

    try {
      const now = new Date();
      const timestamp = now.toLocaleString();
      
      const updatedItem = {
        ...activeItem,
        status: InjectionOrderSubCategory.APPROVED,
        stamps: {
          ...activeItem.stamps,
          final: { userId: currentUser.initials, timestamp }
        }
      };

      // Update Local Storage
      const allItems = JSON.parse(localStorage.getItem('ajin_injection_orders') || '[]');
      const updatedItems = allItems.map((item: any) => item.id === activeItem.id ? updatedItem : item);
      localStorage.setItem('ajin_injection_orders', JSON.stringify(updatedItems));

      // Update Supabase
      const tableName = activeItem.id?.startsWith('inj-') ? 'Injection_Take' : 'Injection_Order';
      await saveSingleDoc(tableName, updatedItem);
      
      alert('최종 확인되었습니다. 사출 결재완료 목록으로 이동합니다.');
      setActiveItem(null);
      setView({ type: 'INJECTION_ORDER_MAIN', sub: InjectionOrderSubCategory.APPROVED });
      pushStateToCloud();
    } catch (err) {
      console.error('Error confirming:', err);
      alert('확인 처리 중 오류가 발생했습니다.');
    }
  };

  const handleMoveToDestination = async () => {
    if (!activeItem) return;
    if (!window.confirm('AJ사출발주 목록으로 이동하시겠습니까?')) return;

    try {
      const now = new Date();
      const updatedItem = {
        ...activeItem,
        status: InjectionOrderSubCategory.DESTINATION,
      };

      // Update Local Storage
      const allItems = JSON.parse(localStorage.getItem('ajin_injection_orders') || '[]');
      const updatedItems = allItems.map((item: any) => item.id === activeItem.id ? updatedItem : item);
      localStorage.setItem('ajin_injection_orders', JSON.stringify(updatedItems));

      // Update Supabase
      const tableName = activeItem.id?.startsWith('inj-') ? 'Injection_Take' : 'Injection_Order';
      await saveSingleDoc(tableName, updatedItem);
      
      alert('AJ사출발주 목록으로 이동되었습니다.');
      setActiveItem(null);
      setView({ type: 'INJECTION_ORDER_MAIN', sub: InjectionOrderSubCategory.DESTINATION });
      pushStateToCloud();
    } catch (err) {
      console.error('Error moving to destination:', err);
      alert('이동 처리 중 오류가 발생했습니다.');
    }
  };

  const handleMoveToInbox = async () => {
    if (!activeItem) return;
    if (!window.confirm('사출 수신함 목록으로 이동하시겠습니까?')) return;

    try {
      const now = new Date();
      const updatedItem = {
        ...activeItem,
        status: InjectionOrderSubCategory.INBOX,
      };

      // Update Local Storage
      const allItems = JSON.parse(localStorage.getItem('ajin_injection_orders') || '[]');
      const updatedItems = allItems.map((item: any) => item.id === activeItem.id ? updatedItem : item);
      localStorage.setItem('ajin_injection_orders', JSON.stringify(updatedItems));

      // Update Supabase
      const tableName = activeItem.id?.startsWith('inj-') ? 'Injection_Take' : 'Injection_Order';
      await saveSingleDoc(tableName, updatedItem);
      
      alert('사출 수신함 목록으로 이동되었습니다.');
      setActiveItem(null);
      setView({ type: 'INJECTION_ORDER_MAIN', sub: InjectionOrderSubCategory.INBOX });
      pushStateToCloud();
    } catch (err) {
      console.error('Error moving to inbox:', err);
      alert('이동 처리 중 오류가 발생했습니다.');
    }
  };

  const handleReject = async () => {
    if (!activeItem) return;
    const reason = window.prompt('반송 사유를 입력해 주세요:');
    if (reason === null) return;

    try {
      const now = new Date();
      const timestamp = now.toLocaleString();
      
      const updatedItem = {
        ...activeItem,
        status: InjectionOrderSubCategory.REJECTED,
        rejectReason: reason,
        rejectLog: { userId: currentUser.initials, timestamp }
      };

      const allItems = JSON.parse(localStorage.getItem('ajin_injection_orders') || '[]');
      const updatedItems = allItems.map((item: any) => item.id === activeItem.id ? updatedItem : item);
      localStorage.setItem('ajin_injection_orders', JSON.stringify(updatedItems));

      const tableName = activeItem.id?.startsWith('inj-') ? 'Injection_Take' : 'Injection_Order';
      await saveSingleDoc(tableName, updatedItem);
      
      alert('반송되었습니다.');
      setActiveItem(null);
      pushStateToCloud();
    } catch (err) {
      console.error('Error rejecting:', err);
    }
  };

  const handleDelete = async (id: string) => {
    const allItems = JSON.parse(localStorage.getItem('ajin_injection_orders') || '[]');
    const targetItem = allItems.find((item: any) => item.id === id);
    
    if (targetItem && targetItem.status === InjectionOrderSubCategory.REJECTED) {
      const userInit = (currentUser.initials || '').toUpperCase();
      if (userInit !== 'MASTER' && userInit !== 'M-SUK') {
        alert('반송 문서는 마스터 또는 M-SUK 권한자만 삭제할 수 있습니다.');
        return;
      }
    }

    if (!window.confirm('정말로 삭제하시겠습니까?')) return;
    try {
      const updatedItems = allItems.filter((item: any) => item.id !== id);
      localStorage.setItem('ajin_injection_orders', JSON.stringify(updatedItems));
      
      const tableName = id.startsWith('inj-') ? 'Injection_Take' : 'Injection_Order';
      await deleteSingleDoc(tableName, id);
      
      setItems(prev => prev.filter(item => item.id !== id));
      alert('삭제되었습니다.');
    } catch (err) {
      console.error('Error deleting:', err);
    }
  };

  const handleComplete = useCallback(async () => {
    if (excelData.length === 0) {
      alert('업로드된 데이터가 없습니다.');
      return;
    }

    if (!window.confirm('작성완료 하시겠습니까? 사출 결재대기로 이동됩니다.')) return;

    try {
      const now = new Date();
      const timestamp = now.toLocaleString();
      
      const newPO: any = {
        id: `po-${Date.now()}`,
        code: `PO-${Date.now()}`,
        title: fileName || 'Injection Order',
        type: 'INJECTION', 
        status: InjectionOrderSubCategory.PENDING,
        authorId: currentUser.initials,
        date: now.toISOString().split('T')[0],
        createdAt: now.toISOString(),
        rows: excelData,
        headerInfoRows,
        footerText,
        stamps: {
          writer: { userId: currentUser.initials, timestamp: timestamp }
        }
      };

      // 1. Injection Orders 전용 로컬 저장
      const existingInjections = JSON.parse(localStorage.getItem('ajin_injection_orders') || '[]');
      localStorage.setItem('ajin_injection_orders', JSON.stringify([newPO, ...existingInjections]));

      // 2. Supabase 저장
      saveSingleDoc('Injection_Order', newPO);

      // 3. 전체 클라우드 동기화
      pushStateToCloud();
      
      // JANDI 알림
      sendJandiNotification('KR_PO', 'REQUEST', `[사출] ${fileName || 'Injection Order'}`, 'H-CHUN', now.toISOString().split('T')[0]);

      alert('작성완료 되었습니다. 사출 결재대기 목록에서 확인하실 수 있습니다.');
      
      // 이동 처리
      setView({ type: 'INJECTION_ORDER_MAIN', sub: InjectionOrderSubCategory.PENDING });
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
              @page { size: A4 portrait; margin: 20mm 10mm 15mm 10mm; }
              body { font-family: 'inter', sans-serif; background: white; width: 100%; margin: 0; padding: 0; }
              * { color: black !important; border-color: black !important; print-color-adjust: exact; }
              .no-print { display: none !important; }
              table { border-collapse: collapse; width: 100%; border: 1.5px solid black; table-layout: fixed; }
              th { border: 0.5px solid black; padding: 4px 2px; vertical-align: middle; word-break: break-all; font-size: 9px; font-weight: 900; background-color: #f8fafc !important; }
              td { border-left: 0.5px solid black; border-right: 0.5px solid black; border-top: none; border-bottom: none; padding: 4px 2px; vertical-align: middle; word-break: break-all; font-size: 9px; font-weight: 600; }
              .document-wrapper { padding: 0; box-sizing: border-box; }
              .approval-box { width: 80px; height: 80px; border: 1px solid black; display: flex; flex-direction: column; align-items: center; justify-content: center; }
              .border-t-bold { border-top: 1.5px solid black !important; }
              .border-b-bold { border-bottom: 1.5px solid black !important; }
              .border-t-thin { border-top: 0.5px solid black !important; }
              .border-b-thin { border-bottom: 0.5px solid black !important; }
              
              /* Page numbering footer */
              .footer {
                position: fixed;
                bottom: 0mm;
                left: 0;
                right: 0;
                text-align: center;
                font-size: 9px;
                padding: 5px 0;
                display: none;
              }
              .document-wrapper {padding-bottom: 10mm; width: 100%
             }
                @media print {
               .footer { display: block; }
              }
                table { 
                page-break-inside: auto; 
              }
                tr { 
                page-break-inside: avoid; 
                page-break-after: auto; 
                }
              }
              
            </style>
          </head>
          <body onload="window.print(); window.close();">
            <div class="document-wrapper">${content}</div>
            <div class="footer">
              ${fileName}
            </div>
          </body>
        </html>
      `);
      win.document.close();
  
    }
  }, [fileName]);

  const renderDetail = (item: any) => {
    const data = item.rows || [];
    const stamps = item.stamps || {};
    const headerInfo = item.headerInfoRows || [];
    const footer = item.footerText || [];
    const isOrderStyle = item.id?.startsWith('po-');
    
    const itemTotals = data.reduce((acc: any, row: any) => {
      const p = parseFloat(String(row.price || '0').replace(/,/g, '')) || 0;
      const e = parseFloat(String(row.extraAmount || '0').replace(/,/g, '')) || 0;
      return { price: acc.price + p, extra: acc.extra + e };
    }, { price: 0, extra: 0 });

    const pVat = Math.floor(itemTotals.price * 0.1);
    const eVat = Math.floor(itemTotals.extra * 0.1);

    return (
      <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar bg-slate-50">
        <div className="flex justify-between items-start no-print">
          <button onClick={() => setActiveItem(null)} className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 font-bold text-sm flex items-center shadow-sm">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
            </svg>
            닫기
          </button>
          
          <div className="flex gap-2">
            {sub === InjectionOrderSubCategory.PENDING && (
              <button onClick={handleReject} className="px-4 py-2 bg-rose-500 text-white rounded-lg hover:bg-rose-600 font-bold text-sm shadow-lg shadow-rose-500/20">반송</button>
            )}
            {sub === InjectionOrderSubCategory.APPROVED && (
              <>
                {activeItem.id?.startsWith('inj-') && (
                  <button onClick={handleMoveToInbox} className="px-6 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 font-black text-sm shadow-lg shadow-orange-500/20">확인 (사출 수신함 이동)</button>
                )}
                {!activeItem.id?.startsWith('inj-') && (
                  <button onClick={handleMoveToDestination} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-black text-sm shadow-lg shadow-blue-500/20">AJ사출발주 이동</button>
                )}
              </>
            )}
            {sub === InjectionOrderSubCategory.DESTINATION && (
              <button onClick={handleMoveToInbox} className="px-6 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 font-black text-sm shadow-lg shadow-orange-500/20">수신 (사출 수신함 이동)</button>
            )}
            <button onClick={() => {
              const selector = item.id?.startsWith('po-') ? '.injection-order-print-detail-order' : '.injection-order-print-detail-hidden';
              const content = document.querySelector(selector)?.innerHTML;
              if (!content) return;
              const win = window.open('', '_blank');
              if (win) {
                win.document.write(`
                  <html>
                    <head>
                      <title>Injection_Order_${item.item || item.title || 'Document'}</title>
                      <script src="https://cdn.tailwindcss.com"></script>
                      <style>
                        @page { size: A4 portrait; margin: 20mm 10mm 15mm 10mm; }
                        body { font-family: 'inter', sans-serif; background: white; width: 100%; margin: 0; padding: 0; }
                        * { color: black !important; border-color: black !important; print-color-adjust: exact; }
                        .no-print { display: none !important; }
                        table { border-collapse: collapse; width: 100%; border: 1.5px solid black; table-layout: fixed; }
                        th { border: 0.5px solid black; padding: 4px 2px; vertical-align: middle; word-break: break-all; font-size: 9px; font-weight: 900; background-color: #f8fafc !important; }
                        td { border-left: 0.5px solid black; border-right: 0.5px solid black; border-top: none; border-bottom: none; padding: 4px 2px; vertical-align: middle; word-break: break-all; font-size: 9px; font-weight: 600; }
                        .document-wrapper { padding: 0; box-sizing: border-box; }
                        .approval-box { width: 80px; height: 80px; border: 1px solid black; display: flex; flex-direction: column; align-items: center; justify-content: center; }
                        .border-t-bold { border-top: 1.5px solid black !important; }
                        .border-b-bold { border-bottom: 1.5px solid black !important; }
                        .border-t-thin { border-top: 0.5px solid black !important; }
                        .border-b-thin { border-bottom: 0.5px solid black !important; }
                        
                        /* Page numbering footer */
                        .footer {
                          position: fixed;
                          bottom: 0mm;
                          left: 0;
                          right: 0;
                          text-align: center;
                          font-size: 9px;
                          padding: 5px 0;
                          display: none;
                        }
                        .document-wrapper {padding-bottom: 10mm; width: 100%
                        }
                        @media print {
                          .footer { display: block; }
                        }
                        table { 
                        page-break-inside: auto; 
                        }
                        tr { 
                        page-break-inside: avoid; 
                        page-break-after: auto; 
                        }
                       }
                      </style>
                    </head>
                    <body onload="window.print(); window.close();">
                      <div class="document-wrapper">${content}</div>
                      <div class="footer">
                        ${item.item || item.title} 
                      </div>
                    </body>
                  </html>
                `);
                win.document.close();
              }
            }} className="px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 font-bold text-sm flex items-center shadow-sm">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M5 4v3H4a2 2 0 00-2 2v3a2 2 0 002 2h1v2a2 2 0 002 2h6a2 2 0 002-2v-2h1a2 2 0 002-2V9a2 2 0 00-2-2h-1V4a2 2 0 00-2-2H7a2 2 0 00-2 2zm8 0H7v3h6V4zm0 8H7v4h6v-4z" clipRule="evenodd" />
              </svg>
              PDF저장 / 인쇄
            </button>
          </div>
        </div>

        <div className="space-y-8">
          {isOrderStyle ? (
            /* Order Style Header */
            <div className="bg-white border-[1px] border-slate-200 shadow-sm p-8 rounded-2xl">
              <div className="flex flex-col items-center">
                <h1 className="text-2xl font-black underline mb-8 text-black">사출 발주서 (INJECTION ORDER)</h1>
                
                <div className="w-full flex justify-between items-start mb-8">
                  <div className="text-sm font-bold text-black">
                    <p>파일명: {item.item || item.title}</p>
                    <p>작성일: {item.date || new Date().toLocaleDateString()}</p>
                  </div>
                  
                  <div className="flex border border-black divide-x divide-black">
                    {['writer', 'design', 'director', 'ceo'].map((slot, idx) => {
                      const label = slot === 'writer' ? '담당' : slot === 'design' ? '설계' : slot === 'director' ? '이사' : '대표';
                      const stamp = stamps[slot];
                      const isClickable = !stamp && slot !== 'writer' && sub === InjectionOrderSubCategory.PENDING;
                      return (
                        <div 
                          key={idx} 
                          className={`w-20 h-24 flex flex-col border-black ${isClickable ? 'cursor-pointer hover:bg-blue-50 transition-colors' : ''}`}
                          onClick={() => isClickable && handleApprove(slot)}
                        >
                          <div className="h-7 border-b border-black flex items-center justify-center text-[10px] font-black bg-slate-50 text-black">{label}</div>
                          <div className="flex-1 flex flex-col items-center justify-center leading-tight">
                            {stamp ? (
                              <div className="flex flex-col items-center justify-center leading-tight">
                                <span className="font-black text-[11px] text-blue-700">{stamp.userId}</span>
                                <span className="text-[7px] text-slate-400 mt-0.5 text-center w-full break-keep whitespace-pre-line">{stamp.timestamp}</span>
                              </div>
                            ) : (
                              <div className="flex items-center justify-center h-full text-center">
                                <span className="text-[10px] text-slate-200 font-bold italic">승인대기</span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Take Style Header */
            <div className="bg-white border-[1px] border-slate-200 shadow-sm p-8 rounded-2xl">
              {/* Company Info */}
              <div className="flex flex-col items-center mb-4 border-b-2 border-black pb-4">
                <h1 className="text-3xl font-black tracking-[0.5rem] mb-2 uppercase text-black">주 식 회 사 아 진 정 공</h1>
                <p className="text-xs font-bold text-slate-500">(우;08510) 서울시 금천구 디지털로9길 99, 스타밸리 806호</p>
                <p className="text-xs font-bold text-slate-500">☎ (02) 894-2611 FAX (02) 802-9941 <span className="ml-4 text-blue-600 underline">misuk.kim@ajinpre.net</span></p>
              </div>

              {/* Title & Approval */}
              <div className="flex justify-between items-end mb-6 border-b border-black pb-4">
                <div className="text-4xl font-black tracking-[2rem] uppercase leading-none ml-10 text-black">사출 발주서</div>
                <table className="border-collapse border-black border-[1px] text-center text-[11px] w-auto">
                  <tbody>
                    <tr>
                      {['writer', 'design', 'director'].map(slot => (
                        <td key={slot} className="border border-black py-1 px-4 bg-slate-50 font-bold text-slate-600 min-w-[70px]">
                          {slot === 'writer' ? '담 당' : slot === 'design' ? '설 계' : '이 사'}
                        </td>
                      ))}
                    </tr>
                    <tr className="h-14">
                      {['writer', 'design', 'director'].map(slot => {
                        const stamp = stamps[slot];
                        const isClickable = !stamp && slot !== 'writer' && sub === InjectionOrderSubCategory.PENDING;
                        return (
                          <td 
                            key={slot}
                            onClick={() => isClickable && handleApprove(slot)}
                            className={`border border-black p-1 align-middle relative ${isClickable ? 'cursor-pointer hover:bg-blue-50 transition-colors' : ''}`}
                          >
                            {stamp ? (
                              <div className="flex flex-col items-center justify-center leading-tight">
                                <span className="font-black text-[11px] text-blue-700">{stamp.userId}</span>
                                <span className="text-[7px] text-slate-400 mt-0.5 text-center w-full break-keep whitespace-pre-line">{stamp.timestamp}</span>
                              </div>
                            ) : (
                              <div className="flex items-center justify-center h-full text-center">
                                <span className="text-[10px] text-slate-200 font-bold italic">승인대기</span>
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Recipient / Sender Info */}
              <div className="grid grid-cols-2 gap-x-12 mb-6 text-sm leading-tight text-black">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 border-b border-black pb-1">
                    <span className="font-bold whitespace-nowrap">수 신 :</span>
                    <span className="font-black text-x1">{item.recipient || ''} 귀중</span>
                  </div>
                  <div className="flex items-center gap-2 pb-1">
                    <span className="font-bold whitespace-nowrap">참 조 :</span>
                    <span className="font-medium">{item.reference || ''}</span>
                  </div>
                  <div className="flex items-center gap-2 pb-1">
                    <span className="font-bold whitespace-nowrap">TEL / FAX :</span>
                    <span className="font-medium">{item.telFax || ''}</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex gap-4 pb-1">
                    <span className="w-16 font-bold">발 신 :</span>
                    <span className="font-black">{item.senderName || '아진정공'}</span>
                  </div>
                  <div className="flex gap-4 pb-1">
                    <span className="w-16 font-bold">담 당 :</span>
                    <span className="font-medium">{item.senderPerson || ''}</span>
                  </div>
                  <div className="flex gap-4 items-center pb-1">
                    <span className="w-16 font-bold">작성일자 :</span>
                    <span className="font-medium">{item.date || ''}</span>
                  </div>
                </div>
              </div>

              {/* Model Line */}
              <div className="flex items-center border-b-2 border-black pb-2 mb-6">
                <span className="font-black text-2xl mr-4 uppercase text-black">기 종 :</span>
                <span className="text-2xl font-black text-blue-600">{item.item || item.title || ''}</span>
              </div>
            </div>
          )}

          {/* Header Info Section */}
          {headerInfo.length > 0 && (
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm max-w-4xl overflow-hidden">
              <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">업로드 파일 정보 (3~5행)</h2>
              <div className="space-y-1.5">
                {headerInfo.map((row: any[], idx: number) => (
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
              <span className="text-[10px] font-bold text-slate-400 bg-white px-2 py-1 rounded-md border border-slate-200">TOTAL: {data.length} ITEMS</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="bg-slate-50/80 border-b-2 border-slate-300 text-black">
                    <th className="w-[6%] px-1 py-3 text-[13px] font-black uppercase tracking-tighter border-r border-slate-200">MOLD</th>
                    <th className="w-[6%] px-1 py-3 text-[13px] font-black uppercase tracking-tighter border-r border-slate-200">DN</th>
                    <th className="w-[3%] px-0 py-3 text-[13px] font-black uppercase tracking-tighter border-r border-slate-200 text-center">S</th>
                    <th className="w-[18%] px-1 py-3 text-[13px] font-black uppercase tracking-tighter border-r border-slate-200">PART NAME</th>
                    <th className="w-[4%] px-0 py-3 text-[13px] font-black uppercase tracking-tighter border-r border-slate-200 text-center">CTY</th>
                    <th className="w-[4%] px-0 py-3 text-[13px] font-black uppercase tracking-tighter border-r border-slate-200 text-center">QTY</th>
                    <th className="w-[10%] px-1 py-3 text-[13px] font-black uppercase tracking-tighter border-r border-slate-200">MATERIAL</th>
                    <th className="w-[5%] px-0 py-3 text-[13px] font-black uppercase tracking-tighter border-r border-slate-200 text-center leading-tight">금형<br/>업체</th>
                    <th className="w-[5%] px-0 py-3 text-[13px] font-black uppercase tracking-tighter border-r border-slate-200 text-center leading-tight">사출<br/>업체</th>
                    <th className="w-[6%] px-0 py-3 text-[13px] font-black uppercase tracking-tighter border-r border-slate-200 text-center leading-tight">주문<br/>수량</th>
                    <th className="w-[8%] px-1 py-3 text-[13px] font-black uppercase tracking-tighter border-r border-slate-200 text-center">단가</th>
                    <th className="w-[9%] px-1 py-3 text-[13px] font-black uppercase tracking-tighter border-r border-slate-200 text-center">금액</th>
                    <th className="w-[5%] px-0 py-3 text-[13px] font-black uppercase tracking-tighter border-r border-slate-200 text-center">추가</th>
                    <th className="w-[9%] px-1 py-3 text-[13px] font-black uppercase tracking-tighter border-r border-slate-200 text-center">추가금액</th>
                    <th className="w-[6%] px-1 py-3 text-[13px] font-black uppercase tracking-tighter">비고 R.S/P</th>
                  </tr>
                </thead>
                <tbody className="text-black">
                  {data.map((row: any, index: number) => {
                    const hasMold = !!row.model && row.model.trim() !== '';
                    const nextRowHasMold = index < data.length - 1 && !!data[index + 1].model && data[index + 1].model.trim() !== '';
                    const isLastRow = index === data.length - 1;
                    
                    const borderTopClass = hasMold ? 'border-t-2 border-slate-400' : '';
                    const borderBottomClass = (nextRowHasMold || isLastRow) ? 'border-b-2 border-slate-400' : '';

                    const unitPriceStr = row.unitPrice && row.unitPrice.trim() !== '' ? `@ ${formatNum(row.unitPrice)}` : '';

                    return (
                      <tr key={index} className={`hover:bg-slate-50/50 transition-colors group ${borderTopClass} ${borderBottomClass}`}>
                        <td className="px-1 py-2 text-[15px] font-bold border-r border-slate-100 break-words">{row.model}</td>
                        <td className="px-1 py-2 text-[15px] border-r border-slate-100 break-words">{row.dept}</td>
                        <td className="px-0 py-2 text-[15px] border-r border-slate-100 text-center">{row.s}</td>
                        <td className="px-1 py-2 text-[15px] font-medium border-r border-slate-100 break-words">{row.itemName}</td>
                        <td className="px-0 py-2 text-[15px] border-r border-slate-100 text-center">{row.cty}</td>
                        <td className="px-0 py-2 text-[15px] border-r border-slate-100 text-center">{formatNum(row.qty)}</td>
                        <td className="px-1 py-2 text-[15px] border-r border-slate-100 break-words">{row.material}</td>
                        <td className="px-0 py-2 text-[15px] border-r border-slate-100 text-center">{row.vendor}</td>
                        <td className="px-0 py-2 text-[15px] border-r border-slate-100 text-center">{row.injectionVendor}</td>
                        <td className="px-0 py-2 text-[15px] border-r border-slate-100 text-center">{formatNum(row.orderQty)}</td>
                        <td className="px-1 py-2 text-[15px] border-r border-slate-100 text-right whitespace-normal break-all">{unitPriceStr}</td>
                        <td className="px-1 py-2 text-[15px] font-bold border-r border-slate-100 text-right">{formatNum(row.price)}</td>
                        <td className="px-0 py-2 text-[15px] border-r border-slate-100 text-center">{formatNum(row.extra)}</td>
                        <td className="px-1 py-2 text-[15px] border-r border-slate-100 text-right">{formatNum(row.extraAmount)}</td>
                        <td className="px-1 py-2 text-[15px] italic text-slate-500 break-words">{row.remarksRSP}</td>
                      </tr>
                    );
                  })}
                  {/* Summary Rows */}
                  <tr className="bg-slate-50/30 font-bold text-black border-t-2 border-slate-400">
                    <td colSpan={11} className="px-4 py-3 text-right text-[13px] uppercase tracking-widest border-r border-slate-100">합계 (Subtotal)</td>
                    <td className="px-1 py-3 text-[15px] text-right border-r border-slate-100">{itemTotals.price.toLocaleString()}</td>
                    <td className="px-0 py-3 border-r border-slate-100"></td>
                    <td className="px-1 py-3 text-[15px] text-right border-r border-slate-100">{itemTotals.extra.toLocaleString()}</td>
                    <td className="px-1 py-3"></td>
                  </tr>
                  <tr className="bg-slate-50/30 font-bold text-black">
                    <td colSpan={11} className="px-4 py-3 text-right text-[13px] uppercase tracking-widest border-r border-slate-100">부가세 (VAT 10%)</td>
                    <td className="px-1 py-3 text-[15px] text-right border-r border-slate-100">{pVat.toLocaleString()}</td>
                    <td className="px-0 py-3 border-r border-slate-100"></td>
                    <td className="px-1 py-3 text-[15px] text-right border-r border-slate-100">{eVat.toLocaleString()}</td>
                    <td className="px-1 py-3"></td>
                  </tr>
                  <tr className="bg-blue-50/50 font-black text-black border-b-2 border-slate-400">
                    <td colSpan={11} className="px-4 py-3 text-right text-[13px] text-blue-600 uppercase tracking-widest border-r border-slate-100">총액 (Grand Total)</td>
                    <td className="px-1 py-3 text-[16px] text-blue-700 text-right border-r border-slate-100">{(itemTotals.price + pVat).toLocaleString()}</td>
                    <td className="px-0 py-3 border-r border-slate-100"></td>
                    <td className="px-1 py-3 text-[16px] text-blue-700 text-right border-r border-slate-100">{(itemTotals.extra + eVat).toLocaleString()}</td>
                    <td className="px-1 py-3"></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Footer Text Section */}
          {footer.length > 0 && (
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <h2 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-4">추가 정보 (Footer Text)</h2>
              <div className="space-y-1">
                {footer.map((line: string, idx: number) => (
                  <p key={idx} className="text-[15px] text-slate-600 font-medium">{line}</p>
                ))}
              </div>
            </div>
          )}

          {/* Hidden Print Content (take Style) */}
          <div className="hidden">
            <div className="injection-order-print-detail-hidden">
              <div className="flex flex-col items-center">
                {/* Company Info */}
                <div className="w-full flex flex-col items-center mb-1 border-b-2 border-black pb-1">
                  <h1 className="text-2xl font-black tracking-[0.3rem] mb-1 uppercase">주 식 회 사 아 진 정 공</h1>
                  <p className="text-[9px] font-bold text-slate-500">서울시 금천구 디지털로9길 99, 스타밸리 806호 / ☎ (02) 894-2611 FAX (02) 802-9941</p>
                </div>

                {/* Title & Approval */}
                <div className="w-full flex justify-between items-end mb-2 border-b border-black pb-1">
                  <div className="text-3xl font-black tracking-[1.5rem] uppercase leading-none ml-10">사출 발주서</div>
                  <div className="flex border border-black divide-x divide-black">
                    {['writer', 'design', 'director'].map((slot, idx) => {
                      const label = slot === 'writer' ? '담당' : slot === 'design' ? '설계' : '이사';
                      const stamp = stamps[slot];
                      return (
                        <div key={idx} className="w-14 h-16 flex flex-col">
                          <div className="h-5 border-b border-black flex items-center justify-center text-[7px] font-black bg-slate-50">{label}</div>
                          <div className="flex-1 flex flex-col items-center justify-center leading-tight">
                            {stamp && (
                              <>
                                <span className="font-black text-[9px] text-blue-700">{stamp.userId}</span>
                                <span className="text-[5px] text-slate-500 text-center w-full">{stamp.timestamp}</span>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Recipient / Sender Info */}
                <div className="w-full grid grid-cols-2 gap-x-10 mb-2 text-[13px] leading-tight">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 border-b border-black pb-0.5">
                      <span className="font-bold">수 신 :</span>
                      <span className="font-black">{item.recipient} 귀중</span>
                    </div>
                    <div className="flex items-center gap-2 pb-0.5">
                      <span className="font-bold">참 조 :</span>
                      <span>{item.reference}</span>
                    </div>
                    <div className="flex items-center gap-2 pb-0.5">
                      <span className="font-bold">TEL/FAX :</span>
                      <span>{item.telFax}</span>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="flex gap-2 pb-0.5">
                      <span className="w-10 font-bold">발 신 :</span>
                      <span className="font-black">{item.senderName || '아진정공'}</span>
                    </div>
                    <div className="flex gap-2 pb-0.5">
                      <span className="w-10 font-bold">담 당 :</span>
                      <span>{item.senderPerson}</span>
                    </div>
                    <div className="flex gap-2 items-center pb-0.5">
                      <span className="w-10 font-bold">작성일자 :</span>
                      <span>{item.date}</span>
                    </div>
                  </div>
                </div>

                {/* Model Line */}
                <div className="w-full flex items-center border-b-2 border-black pb-1 mb-4">
                  <span className="font-black text-lg mr-4 uppercase">기 종 :</span>
                  <span className="text-lg font-black text-blue-600">{item.item || item.title}</span>
                </div>

                {/* Excel Rows 3-5 Info */}
                {headerInfo.length > 0 && (
                  <div className="w-full mb-4 p-2 bg-slate-50/30">
                    {headerInfo.map((row: any[], idx: number) => (
                      <div key={idx} className="flex gap-4 text-[9px] font-medium py-0.5">
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
                      <th className="w-[55px] border border-black px-1 py-1 text-[9px] font-black">MOLD</th>
                      <th className="w-[40px] border border-black px-1 py-1 text-[9px] font-black">DN</th>
                      <th className="w-[15px] border border-black px-0 py-1 text-[9px] font-black">S</th>
                      <th className="w-[155px] border border-black px-1 py-1 text-[9px] font-black">PART NAME</th>
                      <th className="w-[25px] border border-black px-0 py-1 text-[9px] font-black">CTY</th>
                      <th className="w-[25px] border border-black px-0 py-1 text-[9px] font-black">QTY</th>
                      <th className="w-[60px] border border-black px-1 py-1 text-[9px] font-black">MATERIAL</th>
                      <th className="w-[35px] border border-black px-0 py-1 text-[9px] font-black leading-tight">금형<br/>업체</th>
                      
                      <th className="w-[40px] border border-black px-0 py-1 text-[9px] font-black leading-tight">주문<br/>수량</th>
                      <th className="w-[50px] border border-black px-1 py-1 text-[9px] font-black">단가</th>
                      <th className="w-[65px] border border-black px-1 py-1 text-[9px] font-black">금액</th>
                      <th className="w-[25px] border border-black px-1 py-1 text-[9px] font-black">추가</th>
                      <th className="w-[65px] border border-black px-1 py-1 text-[9px] font-black">추가금액</th>
                      <th className="w-[45px] border border-black px-1 py-1 text-[9px] font-black">비고 R.S/P</th>
                    </tr>
                  </thead>
                  <tbody className="text-black">
                    {data.map((row: any, idx: number) => {
                      const hasMold = !!row.model && row.model.trim() !== '';
                      const nextRowHasMold = idx < data.length - 1 && !!data[idx + 1].model && data[idx + 1].model.trim() !== '';
                      const isLastRow = idx === data.length - 1;
                      
                      const borderTopClass = hasMold ? 'border-t-bold' : '';
                      const borderBottomClass = (nextRowHasMold || isLastRow) ? 'border-b-bold' : '';

                      const unitPriceStr = row.unitPrice && row.unitPrice.trim() !== '' ? `@ ${formatNum(row.unitPrice)}` : '';

                      return (
                        <tr key={idx} className={`${borderTopClass} ${borderBottomClass}`}>
                          <td className="px-1 py-1 text-[9px] font-bold">{row.model}</td>
                          <td className="px-1 py-1 text-[9px]">{row.dept}</td>
                          <td className="px-0 py-1 text-[9px] text-center">{row.s}</td>
                          <td className="px-1 py-1 text-[9px] font-medium">{row.itemName}</td>
                          <td className="px-0 py-1 text-[9px] text-center">{row.cty}</td>
                          <td className="px-0 py-1 text-[9px] text-center">{formatNum(row.qty)}</td>
                          <td className="px-1 py-1 text-[9px]">{row.material}</td>
                          <td className="px-0 py-1 text-[9px] text-center">{row.vendor}</td>
                          
                          <td className="px-0 py-1 text-[9px] text-center">{formatNum(row.orderQty)}</td>
                          <td className="px-1 py-1 text-[9px] text-right whitespace-normal break-all">{unitPriceStr}</td>
                          <td className="px-1 py-1 text-[9px] font-bold text-right">{formatNum(row.price)}</td>
                          <td className="px-0 py-1 text-[9px] text-center">{formatNum(row.extra)}</td>
                          <td className="px-1 py-1 text-[9px] text-right">{formatNum(row.extraAmount)}</td>
                          <td className="px-1 py-1 text-[9px] italic text-slate-500">{row.remarksRSP}</td>
                        </tr>
                      );
                    })}
                    <tr className="border-t-bold">
                      <td colSpan={10} className="border border-black px-2 py-1 text-[9px] text-right font-bold">합계 (Subtotal)</td>
                      <td className="border border-black px-1 py-1 text-[9px] font-bold text-right">{itemTotals.price.toLocaleString()}</td>
                      <td className="border border-black px-0 py-1"></td>
                      <td className="border border-black px-1 py-1 text-[9px] font-bold text-right">{itemTotals.extra.toLocaleString()}</td>
                      <td className="border border-black px-1 py-1"></td>
                    </tr>
                    <tr className="border-t-thin border-b-thin">
                      <td colSpan={10} className="border border-black px-2 py-1 text-[9px] text-right font-bold">부가세 (VAT 10%)</td>
                      <td className="border border-black px-1 py-1 text-[9px] font-bold text-right">{pVat.toLocaleString()}</td>
                      <td className="border border-black px-0 py-1"></td>
                      <td className="border border-black px-1 py-1 text-[9px] font-bold text-right">{eVat.toLocaleString()}</td>
                      <td className="border border-black px-1 py-1"></td>
                    </tr>
                    <tr className="bg-slate-50 border-b-bold">
                      <td colSpan={10} className="border border-black px-2 py-1 text-[9px] text-right font-black">총액 (Grand Total)</td>
                      <td className="border border-black px-1 py-1 text-[9px] font-black text-right">{(itemTotals.price + pVat).toLocaleString()}</td>
                      <td className="border border-black px-0 py-1"></td>
                      <td className="border border-black px-1 py-1 text-[9px] font-black text-right">{(itemTotals.extra + eVat).toLocaleString()}</td>
                      <td className="border border-black px-1 py-1"></td>
                    </tr>
                  </tbody>
                </table>

                {/* Footer Text for Print */}
                {footer.length > 0 && (
                  <div className="w-full mt-4 text-[9px] space-y-1">
                    {footer.map((line: string, idx: number) => (
                      <p key={idx} className="font-medium">{line}</p>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Hidden Print Content (order Style) */}
          <div className="hidden">
            <div className="injection-order-print-detail-order">
              <div className="flex flex-col items-center">
                <h1 className="text-xl font-black underline mb-8">사출 발주서 (INJECTION ORDER)</h1>
                
                <div className="w-full flex justify-between items-start mb-8">
                  <div className="text-lg font-bold">
                    <p>파일명: {item.item || item.title}</p>
                    <p>작성일: {new Date().toLocaleDateString()}</p>
                  </div>
                  
                  <div className="flex border border-black divide-x divide-black">
                    {['writer', 'design', 'director', 'ceo'].map((slot, idx) => {
                      const label = slot === 'writer' ? '담당' : slot === 'design' ? '설계' : slot === 'director' ? '이사' : '대표';
                      const stamp = stamps[slot];
                      return (
                        <div key={idx} className="w-16 h-20 flex flex-col">
                          <div className="h-6 border-b border-black flex items-center justify-center text-[7px] font-black bg-slate-50">{label}</div>
                          <div className="flex-1 flex flex-col items-center justify-center leading-tight">
                            {stamp && (
                              <>
                                <span className="font-black text-[10px] text-blue-700">{stamp.userId}</span>
                                <span className="text-[6px] text-slate-500 mt-0.5 text-center w-full break-keep whitespace-pre-line">{stamp.timestamp}</span>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Excel Rows 3-5 Info */}
                {headerInfo.length > 0 && (
                  <div className="w-full mb-4 p-2 bg-slate-50/30">
                    {headerInfo.map((row: any[], idx: number) => (
                      <div key={idx} className="flex gap-4 text-[9px] font-medium py-0.5">
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
                      <th className="w-[55px] border border-black px-1 py-1 text-[9px] font-black">MOLD</th>
                      <th className="w-[40px] border border-black px-1 py-1 text-[9px] font-black">DN</th>
                      <th className="w-[15px] border border-black px-0 py-1 text-[9px] font-black">S</th>
                      <th className="w-[120px] border border-black px-1 py-1 text-[9px] font-black">PART NAME</th>
                      <th className="w-[25px] border border-black px-0 py-1 text-[9px] font-black">CTY</th>
                      <th className="w-[25px] border border-black px-0 py-1 text-[9px] font-black">QTY</th>
                      <th className="w-[60px] border border-black px-1 py-1 text-[9px] font-black">MATERIAL</th>
                      <th className="w-[35px] border border-black px-0 py-1 text-[9px] font-black leading-tight">금형<br/>업체</th>
                      <th className="w-[35px] border border-black px-0 py-1 text-[9px] font-black leading-tight">사출<br/>업체</th>
                      <th className="w-[40px] border border-black px-0 py-1 text-[9px] font-black leading-tight">주문<br/>수량</th>
                      <th className="w-[50px] border border-black px-1 py-1 text-[9px] font-black">단가</th>
                      <th className="w-[65px] border border-black px-1 py-1 text-[9px] font-black">금액</th>
                      <th className="w-[25px] border border-black px-1 py-1 text-[9px] font-black">추가</th>
                      <th className="w-[65px] border border-black px-1 py-1 text-[9px] font-black">추가금액</th>
                      <th className="w-[45px] border border-black px-1 py-1 text-[9px] font-black">비고 R.S/P</th>
                    </tr>
                  </thead>
                  <tbody className="text-black">
                    {data.map((row: any, idx: number) => {
                      const hasMold = !!row.model && row.model.trim() !== '';
                      const nextRowHasMold = idx < data.length - 1 && !!data[idx + 1].model && data[idx + 1].model.trim() !== '';
                      const isLastRow = idx === data.length - 1;
                      
                      const borderTopClass = hasMold ? 'border-t-bold' : '';
                      const borderBottomClass = (nextRowHasMold || isLastRow) ? 'border-b-bold' : '';

                      const unitPriceStr = row.unitPrice && row.unitPrice.trim() !== '' ? `@ ${formatNum(row.unitPrice)}` : '';

                      return (
                        <tr key={idx} className={`${borderTopClass} ${borderBottomClass}`}>
                          <td className="px-1 py-1 text-[9px] font-bold">{row.model}</td>
                          <td className="px-1 py-1 text-[9px]">{row.dept}</td>
                          <td className="px-0 py-1 text-[9px] text-center">{row.s}</td>
                          <td className="px-1 py-1 text-[9px] font-medium">{row.itemName}</td>
                          <td className="px-0 py-1 text-[9px] text-center">{row.cty}</td>
                          <td className="px-0 py-1 text-[9px] text-center">{formatNum(row.qty)}</td>
                          <td className="px-1 py-1 text-[9px]">{row.material}</td>
                          <td className="px-0 py-1 text-[9px] text-center">{row.vendor}</td>
                          <td className="px-0 py-1 text-[9px] text-center">{row.injectionVendor}</td>
                          <td className="px-0 py-1 text-[9px] text-center">{formatNum(row.orderQty)}</td>
                          <td className="px-1 py-1 text-[9px] text-right whitespace-normal break-all">{unitPriceStr}</td>
                          <td className="px-1 py-1 text-[9px] font-bold text-right">{formatNum(row.price)}</td>
                          <td className="px-1 py-1 text-[9px] text-center">{formatNum(row.extra)}</td>
                          <td className="px-1 py-1 text-[9px] text-right">{formatNum(row.extraAmount)}</td>
                          <td className="px-1 py-1 text-[9px] italic">{row.remarksRSP}</td>
                        </tr>
                      );
                    })}
                    {/* Summary Rows for Print */}
                    <tr className="border-t-bold">
                      <td colSpan={11} className="border border-black px-2 py-1 text-[9px] text-right font-bold">합계 (Subtotal)</td>
                      <td className="border border-black px-1 py-1 text-[9px] font-bold text-right">{itemTotals.price.toLocaleString()}</td>
                      <td className="border border-black px-0 py-1"></td>
                      <td className="border border-black px-1 py-1 text-[9px] font-bold text-right">{itemTotals.extra.toLocaleString()}</td>
                      <td className="border border-black px-1 py-1"></td>
                    </tr>
                    <tr className="border-t-thin border-b-thin">
                      <td colSpan={11} className="border border-black px-2 py-1 text-[9px] text-right font-bold">부가세 (VAT 10%)</td>
                      <td className="border border-black px-1 py-1 text-[9px] font-bold text-right">{pVat.toLocaleString()}</td>
                      <td className="border border-black px-0 py-1"></td>
                      <td className="border border-black px-1 py-1 text-[9px] font-bold text-right">{eVat.toLocaleString()}</td>
                      <td className="border border-black px-1 py-1"></td>
                    </tr>
                    <tr className="bg-slate-50 border-b-bold">
                      <td colSpan={11} className="border border-black px-2 py-1 text-[9px] text-right font-black">총액 (Grand Total)</td>
                      <td className="border border-black px-1 py-1 text-[9px] font-black text-right">{(itemTotals.price + pVat).toLocaleString()}</td>
                      <td className="border border-black px-0 py-1"></td>
                      <td className="border border-black px-1 py-1 text-[9px] font-black text-right">{(itemTotals.extra + eVat).toLocaleString()}</td>
                      <td className="border border-black px-1 py-1"></td>
                    </tr>
                  </tbody>
                </table>

                {/* Footer Text for Print */}
                {footer.length > 0 && (
                  <div className="w-full mt-4 text-[9px] space-y-1">
                    {footer.map((line: string, idx: number) => (
                      <p key={idx} className="font-medium">{line}</p>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderList = () => {
    const filteredItems = items
      .filter(item => {
        const matchesSearch = (item.title || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
          (item.item || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
          (item.authorId || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
          (item.recipient || '').toLowerCase().includes(searchTerm.toLowerCase());
        
        if (sub === InjectionOrderSubCategory.INBOX && selectedRoom) {
          return matchesSearch && (item.recipient || 'Unknown') === selectedRoom;
        }
        return matchesSearch;
      })
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

    if (sub === InjectionOrderSubCategory.INBOX && !selectedRoom) {
      const rooms = Array.from(new Set(filteredItems.map(item => item.recipient || 'Unknown')));
      return (
        <div className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar bg-slate-50">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-3xl font-black text-slate-900 tracking-tight">사출 수신함 (Rooms)</h2>
              <p className="text-slate-500 font-bold mt-1">수신처별로 분류된 발주서 보관함입니다.</p>
            </div>
            <div className="relative w-80">
              <input 
                type="text"
                placeholder="수신처 검색..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-4 pr-10 py-2.5 bg-white border border-slate-200 rounded-full text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {rooms.map(room => {
              const roomItems = filteredItems.filter(item => (item.recipient || 'Unknown') === room);
              return (
                <div 
                  key={room} 
                  onClick={() => setSelectedRoom(room)}
                  className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all cursor-pointer group relative overflow-hidden"
                >
                  <div className="absolute top-0 left-0 w-full h-2 bg-orange-500" />
                  <div className="flex items-center justify-between mb-6">
                    <div className="p-4 bg-orange-50 text-orange-600 rounded-2xl group-hover:scale-110 transition-transform">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                      </svg>
                    </div>
                    <span className="px-3 py-1 bg-slate-100 text-slate-600 rounded-full text-xs font-black">{roomItems.length} ITEMS</span>
                  </div>
                  <h3 className="text-xl font-black text-slate-900 mb-2 group-hover:text-orange-600 transition-colors">{room}</h3>
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">수신처 발주서</p>
                  
                  <div className="mt-6 flex -space-x-2 overflow-hidden">
                    {roomItems.slice(0, 4).map((item, i) => (
                      <div key={i} className="inline-block h-8 w-8 rounded-full ring-2 ring-white bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-500">
                        {item.authorId?.charAt(0)}
                      </div>
                    ))}
                    {roomItems.length > 4 && (
                      <div className="flex items-center justify-center h-8 w-8 rounded-full ring-2 ring-white bg-slate-100 text-[10px] font-bold text-slate-400">
                        +{roomItems.length - 4}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    const itemsPerPage = 10;
    const totalPages = Math.ceil(filteredItems.length / itemsPerPage);
    const paginatedItems = filteredItems.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    return (
      <div className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar bg-white">
        {/* Header Section */}
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            {sub === InjectionOrderSubCategory.INBOX && selectedRoom && (
              <button 
                onClick={() => setSelectedRoom(null)}
                className="p-2 bg-slate-100 text-slate-600 rounded-full hover:bg-slate-200 transition-all"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
                </svg>
              </button>
            )}
            <h2 className="text-3xl font-black text-slate-900 tracking-tight">
              {sub === InjectionOrderSubCategory.INBOX && selectedRoom ? `${selectedRoom} 수신함` : sub}
            </h2>
          </div>
          
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <span className="text-sm font-bold text-slate-500">
                총 {filteredItems.length}건
              </span>
              <div className="h-4 w-[1px] bg-slate-200" />
              <div className="flex bg-slate-100 p-1 rounded-lg">
                <button 
                  onClick={() => setViewMode('icon')}
                  className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${
                    viewMode === 'icon' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  아이콘
                </button>
                <button 
                  onClick={() => setViewMode('list')}
                  className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${
                    viewMode === 'list' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  리스트
                </button>
              </div>
            </div>
            
            <div className="relative w-full md:w-80">
              <input 
                type="text"
                placeholder="제목 또는 수신처 검색..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-4 pr-10 py-2.5 bg-white border border-slate-200 rounded-full text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-sm"
              />
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          </div>
        </div>
        
        {filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 bg-slate-50/50 rounded-3xl border-2 border-dashed border-slate-200">
            <p className="text-slate-400 font-bold italic">데이터가 없습니다.</p>
          </div>
        ) : viewMode === 'icon' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {paginatedItems.map((item) => (
              <div key={item.id} onClick={() => setActiveItem(item)} className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all cursor-pointer group relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full bg-blue-500 opacity-0 group-hover:opacity-100 transition-all" />
                <div className="flex justify-between items-start mb-4">
                  <div className={`p-3 rounded-2xl transition-colors ${
                    item.status === InjectionOrderSubCategory.REJECTED ? 'bg-rose-50 text-rose-600' : 
                    item.id?.startsWith('inj-') ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600'
                  }`}>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A1 1 0 0111.293 2.707l3 3a1 1 0 01.293.707V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{item.date}</span>
                    <span className={`px-2 py-1 rounded-lg text-[10px] font-black tracking-wider uppercase ${
                      item.status === InjectionOrderSubCategory.APPROVED ? 'bg-emerald-50 text-emerald-600' :
                      item.status === InjectionOrderSubCategory.REJECTED ? 'bg-rose-50 text-rose-600' :
                      'bg-blue-50 text-blue-600'
                    }`}>
                      {item.status}
                    </span>
                  </div>
                </div>
                <h3 className="text-base font-black text-slate-900 mb-1 truncate leading-tight">
                  {item.item || item.title}
                  {item.id?.startsWith('inj-') && (item.recipient || item.title) && (
                    <span className="ml-2 px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-[15px] font-black align-middle">
                      {item.recipient || item.title}
                    </span>
                  )}
                </h3>
                <p className="text-xs text-slate-500 font-bold mb-4">작성자: {item.authorId}</p>
                
                {item.status === InjectionOrderSubCategory.REJECTED && item.rejectReason && (
                  <div className="mb-4 p-3 bg-rose-50 rounded-2xl border border-rose-100">
                    <p className="text-[10px] font-black text-rose-400 uppercase tracking-widest mb-1">반송 사유</p>
                    <p className="text-xs text-rose-600 font-bold line-clamp-2 leading-relaxed">{item.rejectReason}</p>
                  </div>
                )}
                
                <div className="flex items-center gap-2 mt-auto pt-4 border-t border-slate-50">
                  {(item.id?.startsWith('inj-') ? ['writer', 'design', 'director'] : ['writer', 'design', 'director', 'ceo']).map(slot => (
                    <div key={slot} className={`w-6 h-6 rounded-full border-2 border-white shadow-sm ${item.stamps?.[slot] ? (item.id?.startsWith('inj-') ? 'bg-amber-500' : 'bg-blue-500') : 'bg-slate-100'}`} title={slot} />
                  ))}
                </div>

                {(!(item.status === InjectionOrderSubCategory.REJECTED) || (currentUser.initials?.toUpperCase() === 'MASTER' || currentUser.initials?.toUpperCase() === 'M-SUK')) && (
                  <button onClick={(e) => { e.stopPropagation(); handleDelete(item.id); }} className="absolute bottom-4 right-4 p-2 text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-all transform translate-y-2 group-hover:translate-y-0">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-6 py-4 text-xs font-black text-slate-500 uppercase tracking-widest">상태</th>
                  <th className="px-6 py-4 text-xs font-black text-slate-500 uppercase tracking-widest">제목</th>
                  <th className="px-6 py-4 text-xs font-black text-slate-500 uppercase tracking-widest">작성자</th>
                  <th className="px-6 py-4 text-xs font-black text-slate-500 uppercase tracking-widest">날짜</th>
                  <th className="px-6 py-4 text-xs font-black text-slate-500 uppercase tracking-widest">결재현황</th>
                  <th className="px-6 py-4 text-xs font-black text-slate-500 uppercase tracking-widest text-right">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedItems.map((item) => (
                  <tr key={item.id} onClick={() => setActiveItem(item)} className="hover:bg-slate-50 transition-colors cursor-pointer group">
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded-lg text-[10px] font-black tracking-wider uppercase ${
                        item.status === InjectionOrderSubCategory.APPROVED ? 'bg-emerald-50 text-emerald-600' :
                        item.status === InjectionOrderSubCategory.REJECTED ? 'bg-rose-50 text-rose-600' :
                        'bg-blue-50 text-blue-600'
                      }`}>
                        {item.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${item.id?.startsWith('inj-') ? 'bg-amber-500' : 'bg-blue-500'}`} />
                          <span className="text-sm font-black text-slate-900 group-hover:text-blue-600 transition-colors">
                            {item.item || item.title}
                            {item.id?.startsWith('inj-') && (item.recipient || item.title) && (
                              <span className="ml-2 px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-[10px] font-black align-middle">
                                {item.recipient || item.title}
                              </span>
                            )}
                          </span>
                        </div>
                        {item.status === InjectionOrderSubCategory.REJECTED && item.rejectReason && (
                          <span className="text-[10px] text-rose-500 font-bold mt-1">반송: {item.rejectReason}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm font-bold text-slate-600">{item.authorId}</td>
                    <td className="px-6 py-4 text-sm font-bold text-slate-400">{item.date}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        {(item.id?.startsWith('inj-') ? ['writer', 'design', 'director'] : ['writer', 'design', 'director', 'ceo']).map(slot => (
                          <div key={slot} className={`w-4 h-4 rounded-full ${item.stamps?.[slot] ? (item.id?.startsWith('inj-') ? 'bg-amber-500' : 'bg-blue-500') : 'bg-slate-100'}`} />
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      {(!(item.status === InjectionOrderSubCategory.REJECTED) || (currentUser.initials?.toUpperCase() === 'MASTER' || currentUser.initials?.toUpperCase() === 'M-SUK')) && (
                        <button onClick={(e) => { e.stopPropagation(); handleDelete(item.id); }} className="p-2 text-slate-300 hover:text-rose-500 transition-colors">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                          </svg>
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination UI */}
        {totalPages > 1 && (
          <div className="flex justify-center items-center gap-2 mt-8 pb-4">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
              <button
                key={pageNum}
                onClick={() => setCurrentPage(pageNum)}
                className={`w-8 h-8 rounded-lg text-xs font-bold transition-all ${
                  currentPage === pageNum
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                }`}
              >
                {pageNum}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  if (sub !== InjectionOrderSubCategory.CREATE) {
    if (activeItem && sub === InjectionOrderSubCategory.TEMPORARY) {
      return (
        <div className="h-full flex flex-col overflow-hidden bg-slate-50 rounded-xl border border-slate-200 shadow-sm">
          <InjectionTake 
            currentUser={currentUser} 
            setView={setView} 
            dataVersion={dataVersion} 
            initialData={activeItem}
            onClose={() => setActiveItem(null)}
          />
        </div>
      );
    }
    return (
      <div className="h-full flex flex-col overflow-hidden bg-slate-50 rounded-xl border border-slate-200 shadow-sm">
        {activeItem ? renderDetail(activeItem) : renderList()}
      </div>
    );
  }

  if (showInjectionTake) {
    return (
      <div className="h-full flex flex-col overflow-hidden bg-slate-50 rounded-xl border border-slate-200 shadow-sm">
        <div className="p-4 bg-white border-b border-slate-200 flex justify-between items-center">
          <button 
            onClick={() => setShowInjectionTake(false)}
            className="flex items-center text-slate-500 hover:text-slate-800 font-bold text-sm"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
            </svg>
            뒤로가기
          </button>
          <h2 className="text-lg font-black text-slate-800">사출발주서 불러오기</h2>
          <div className="w-20"></div>
        </div>
        <div className="flex-1 overflow-auto">
          <InjectionTake 
            currentUser={currentUser} 
            setView={setView} 
            dataVersion={dataVersion}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden bg-slate-50 rounded-xl border border-slate-200 shadow-sm">
      {/* Header Section */}
      <div className="p-6 bg-white border-b border-slate-200 shrink-0">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">사출 발주서 (Injection Order)</h1>
            <p className="text-sm text-slate-500 font-medium">엑셀 파일을 업로드하여 발주서를 작성하고 승인합니다.</p>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setShowInjectionTake(true)}
              className="flex items-center px-5 py-2.5 bg-slate-800 text-white rounded-xl hover:bg-slate-900 transition-all shadow-lg shadow-slate-500/20 font-bold text-sm"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" viewBox="0 0 20 20" fill="currentColor">
                <path d="M7 3a1 1 0 000 2h6a1 1 0 100-2H7zM4 7a1 1 0 011-1h10a1 1 0 110 2H5a1 1 0 01-1-1zM2 11a2 2 0 012-2h12a2 2 0 012 2v4a2 2 0 01-2 2H4a2 2 0 01-2-2v-4z" />
              </svg>
              불러오기
            </button>
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
                  PDF저장 / 인쇄
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
                          <div className="flex flex-col items-center justify-center h-full text-center">
                            <span className="font-black text-blue-600 text-sm">{currentUser.initials}</span>
                            <span className="text-[9px] text-slate-400 font-bold mt-1 leading-tight">{new Date().toLocaleString()}</span>
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
                      <th className="w-[18%] px-1 py-3 text-[13px] font-black uppercase tracking-tighter border-r border-slate-200">PART NAME</th>
                      <th className="w-[4%] px-0 py-3 text-[13px] font-black uppercase tracking-tighter border-r border-slate-200 text-center">CTY</th>
                      <th className="w-[4%] px-0 py-3 text-[13px] font-black uppercase tracking-tighter border-r border-slate-200 text-center">QTY</th>
                      <th className="w-[10%] px-1 py-3 text-[13px] font-black uppercase tracking-tighter border-r border-slate-200">MATERIAL</th>
                      <th className="w-[5%] px-0 py-3 text-[13px] font-black uppercase tracking-tighter border-r border-slate-200 text-center leading-tight">금형<br/>업체</th>
                      <th className="w-[5%] px-0 py-3 text-[13px] font-black uppercase tracking-tighter border-r border-slate-200 text-center leading-tight">사출<br/>업체</th>
                      <th className="w-[6%] px-0 py-3 text-[13px] font-black uppercase tracking-tighter border-r border-slate-200 text-center leading-tight">주문<br/>수량</th>
                      <th className="w-[8%] px-1 py-3 text-[13px] font-black uppercase tracking-tighter border-r border-slate-200 text-center">단가</th>
                      <th className="w-[9%] px-1 py-3 text-[13px] font-black uppercase tracking-tighter border-r border-slate-200 text-center">금액</th>
                      <th className="w-[5%] px-0 py-3 text-[13px] font-black uppercase tracking-tighter border-r border-slate-200 text-center">추가</th>
                      <th className="w-[9%] px-1 py-3 text-[13px] font-black uppercase tracking-tighter border-r border-slate-200 text-center">추가금액</th>
                      <th className="w-[6%] px-1 py-3 text-[13px] font-black uppercase tracking-tighter">비고 R.S/P</th>
                    </tr>
                  </thead>
                  <tbody className="text-black">
                    {excelData.map((row, index) => {
                      const hasMold = !!row.model && row.model.trim() !== '';
                      const nextRowHasMold = index < excelData.length - 1 && !!excelData[index + 1].model && excelData[index + 1].model.trim() !== '';
                      const isLastRow = index === excelData.length - 1;
                      
                      const borderTopClass = hasMold ? 'border-t-2 border-slate-400' : '';
                      const borderBottomClass = (nextRowHasMold || isLastRow) ? 'border-b-2 border-slate-400' : '';

                      const unitPriceStr = row.unitPrice && row.unitPrice.trim() !== '' ? `@ ${formatNum(row.unitPrice)}` : '';

                      return (
                        <tr key={row.id || index} className={`hover:bg-slate-50/50 transition-colors group ${borderTopClass} ${borderBottomClass}`}>
                          <td className="px-1 py-2 text-[15px] font-bold border-r border-slate-100 break-words">{row.model}</td>
                          <td className="px-1 py-2 text-[15px] border-r border-slate-100 break-words">{row.dept}</td>
                          <td className="px-0 py-2 text-[15px] border-r border-slate-100 text-center">{row.s}</td>
                          <td className="px-1 py-2 text-[15px] font-medium border-r border-slate-100 break-words">{row.itemName}</td>
                          <td className="px-0 py-2 text-[15px] border-r border-slate-100 text-center">{row.cty}</td>
                          <td className="px-0 py-2 text-[15px] border-r border-slate-100 text-center">{formatNum(row.qty)}</td>
                          <td className="px-1 py-2 text-[15px] border-r border-slate-100 break-words">{row.material}</td>
                          <td className="px-0 py-2 text-[15px] border-r border-slate-100 text-center">{row.vendor}</td>
                          <td className="px-0 py-2 text-[15px] border-r border-slate-100 text-center">{row.injectionVendor}</td>
                          <td className="px-0 py-2 text-[15px] border-r border-slate-100 text-center">{formatNum(row.orderQty)}</td>
                          <td className="px-1 py-2 text-[15px] border-r border-slate-100 text-right whitespace-normal break-all">{unitPriceStr}</td>
                          <td className="px-1 py-2 text-[15px] font-bold border-r border-slate-100 text-right">{formatNum(row.price)}</td>
                          <td className="px-0 py-2 text-[15px] border-r border-slate-100 text-center">{formatNum(row.extra)}</td>
                          <td className="px-1 py-2 text-[15px] border-r border-slate-100 text-right">{formatNum(row.extraAmount)}</td>
                          <td className="px-1 py-2 text-[15px] italic text-slate-500 break-words">{row.remarksRSP}</td>
                        </tr>
                      );
                    })}
                    {/* Summary Rows */}
                    <tr className="bg-slate-50/30 font-bold text-black border-t-2 border-slate-400">
                      <td colSpan={11} className="px-4 py-3 text-right text-[13px] uppercase tracking-widest border-r border-slate-100">합계 (Subtotal)</td>
                      <td className="px-1 py-3 text-[15px] text-right border-r border-slate-100">{totals.price.subtotal.toLocaleString()}</td>
                      <td className="px-0 py-3 border-r border-slate-100"></td>
                      <td className="px-1 py-3 text-[15px] text-right border-r border-slate-100">{totals.extra.subtotal.toLocaleString()}</td>
                      <td className="px-1 py-3"></td>
                    </tr>
                    <tr className="bg-slate-50/30 font-bold text-black">
                      <td colSpan={11} className="px-4 py-3 text-right text-[13px] uppercase tracking-widest border-r border-slate-100">부가세 (VAT 10%)</td>
                      <td className="px-1 py-3 text-[15px] text-right border-r border-slate-100">{totals.price.vat.toLocaleString()}</td>
                      <td className="px-0 py-3 border-r border-slate-100"></td>
                      <td className="px-1 py-3 text-[15px] text-right border-r border-slate-100">{totals.extra.vat.toLocaleString()}</td>
                      <td className="px-1 py-3"></td>
                    </tr>
                    <tr className="bg-blue-50/50 font-black text-black border-b-2 border-slate-400">
                      <td colSpan={11} className="px-4 py-3 text-right text-[13px] text-blue-600 uppercase tracking-widest border-r border-slate-100">총액 (Grand Total)</td>
                      <td className="px-1 py-3 text-[16px] text-blue-700 text-right border-r border-slate-100">{totals.price.total.toLocaleString()}</td>
                      <td className="px-0 py-3 border-r border-slate-100"></td>
                      <td className="px-1 py-3 text-[16px] text-blue-700 text-right border-r border-slate-100">{totals.extra.total.toLocaleString()}</td>
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

            {/* Hidden Print Content (order Style) */}
            <div className="hidden">
              <div className="injection-order-print">
                <div className="flex flex-col items-center">
                  <h1 className="text-xl font-black underline mb-8">사출 발주서 (INJECTION ORDER)</h1>
                  
                  <div className="w-full flex justify-between items-start mb-8">
                    <div className="text-lg font-bold">
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
                                  <span className="text-[6px] text-slate-500 mt-0.5 text-center w-full break-keep whitespace-pre-line">{new Date().toLocaleString()}</span>
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
                    <div className="w-full mb-4 p-2 bg-slate-50/30">
                      {headerInfoRows.map((row, idx) => (
                        <div key={idx} className="flex gap-4 text-[9px] font-medium py-0.5">
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
                        <th className="w-[55px] border border-black px-1 py-1 text-[9px] font-black">MOLD</th>
                        <th className="w-[40px] border border-black px-1 py-1 text-[9px] font-black">DN</th>
                        <th className="w-[15px] border border-black px-0 py-1 text-[9px] font-black">S</th>
                        <th className="w-[120px] border border-black px-1 py-1 text-[9px] font-black">PART NAME</th>
                        <th className="w-[25px] border border-black px-0 py-1 text-[9px] font-black">CTY</th>
                        <th className="w-[25px] border border-black px-0 py-1 text-[9px] font-black">QTY</th>
                        <th className="w-[60px] border border-black px-1 py-1 text-[9px] font-black">MATERIAL</th>
                        <th className="w-[35px] border border-black px-0 py-1 text-[9px] font-black leading-tight">금형<br/>업체</th>
                        <th className="w-[35px] border border-black px-0 py-1 text-[9px] font-black leading-tight">사출<br/>업체</th>
                        <th className="w-[40px] border border-black px-0 py-1 text-[9px] font-black leading-tight">주문<br/>수량</th>
                        <th className="w-[50px] border border-black px-1 py-1 text-[9px] font-black">단가</th>
                        <th className="w-[65px] border border-black px-1 py-1 text-[9px] font-black">금액</th>
                        <th className="w-[25px] border border-black px-1 py-1 text-[9px] font-black">추가</th>
                        <th className="w-[65px] border border-black px-1 py-1 text-[9px] font-black">추가금액</th>
                        <th className="w-[45px] border border-black px-1 py-1 text-[9px] font-black">비고 R.S/P</th>
                      </tr>
                    </thead>
                    <tbody className="text-black">
                      {excelData.map((row, idx) => {
                        const hasMold = !!row.model && row.model.trim() !== '';
                        const nextRowHasMold = idx < excelData.length - 1 && !!excelData[idx + 1].model && excelData[idx + 1].model.trim() !== '';
                        const isLastRow = idx === excelData.length - 1;
                        
                        const borderTopClass = hasMold ? 'border-t-bold' : '';
                        const borderBottomClass = (nextRowHasMold || isLastRow) ? 'border-b-bold' : '';

                        const unitPriceStr = row.unitPrice && row.unitPrice.trim() !== '' ? `@ ${formatNum(row.unitPrice)}` : '';

                        return (
                          <tr key={idx} className={`${borderTopClass} ${borderBottomClass}`}>
                            <td className="px-1 py-1 text-[9px] font-bold">{row.model}</td>
                            <td className="px-1 py-1 text-[9px]">{row.dept}</td>
                            <td className="px-0 py-1 text-[9px] text-center">{row.s}</td>
                            <td className="px-1 py-1 text-[9px] font-medium">{row.itemName}</td>
                            <td className="px-0 py-1 text-[9px] text-center">{row.cty}</td>
                            <td className="px-0 py-1 text-[9px] text-center">{formatNum(row.qty)}</td>
                            <td className="px-1 py-1 text-[9px]">{row.material}</td>
                            <td className="px-0 py-1 text-[9px] text-center">{row.vendor}</td>
                            <td className="px-0 py-1 text-[9px] text-center">{row.injectionVendor}</td>
                            <td className="px-0 py-1 text-[9px] text-center">{formatNum(row.orderQty)}</td>
                            <td className="px-1 py-1 text-[9px] text-right whitespace-normal break-all">{unitPriceStr}</td>
                            <td className="px-1 py-1 text-[9px] font-bold text-right">{formatNum(row.price)}</td>
                            <td className="px-1 py-1 text-[9px] text-center">{formatNum(row.extra)}</td>
                            <td className="px-1 py-1 text-[9px] text-right">{formatNum(row.extraAmount)}</td>
                            <td className="px-1 py-1 text-[9px] italic">{row.remarksRSP}</td>
                          </tr>
                        );
                      })}
                      {/* Summary Rows for Print */}
                      <tr className="border-t-bold">
                        <td colSpan={11} className="border border-black px-2 py-1 text-[9px] text-right font-bold">합계 (Subtotal)</td>
                        <td className="border border-black px-1 py-1 text-[9px] font-bold text-right">{totals.price.subtotal.toLocaleString()}</td>
                        <td className="border border-black px-0 py-1"></td>
                        <td className="border border-black px-1 py-1 text-[9px] font-bold text-right">{totals.extra.subtotal.toLocaleString()}</td>
                        <td className="border border-black px-1 py-1"></td>
                      </tr>
                      <tr className="border-t-thin border-b-thin">
                        <td colSpan={11} className="border border-black px-2 py-1 text-[9px] text-right font-bold">부가세 (VAT 10%)</td>
                        <td className="border border-black px-1 py-1 text-[9px] font-bold text-right">{totals.price.vat.toLocaleString()}</td>
                        <td className="border border-black px-0 py-1"></td>
                        <td className="border border-black px-1 py-1 text-[9px] font-bold text-right">{totals.extra.vat.toLocaleString()}</td>
                        <td className="border border-black px-1 py-1"></td>
                      </tr>
                      <tr className="bg-slate-50 border-b-bold">
                        <td colSpan={11} className="border border-black px-2 py-1 text-[9px] text-right font-black">총액 (Grand Total)</td>
                        <td className="border border-black px-1 py-1 text-[9px] font-black text-right">{totals.price.total.toLocaleString()}</td>
                        <td className="border border-black px-0 py-1"></td>
                        <td className="border border-black px-1 py-1 text-[9px] font-black text-right">{totals.extra.total.toLocaleString()}</td>
                        <td className="border border-black px-1 py-1"></td>
                      </tr>
                    </tbody>
                  </table>

                  {/* Footer Text for Print */}
                  {footerText.length > 0 && (
                    <div className="w-full mt-4 text-[9px] space-y-1">
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
