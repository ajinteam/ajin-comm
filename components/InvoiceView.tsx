
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { InvoiceSubCategory, InvoiceItem, InvoiceRow, UserAccount, ViewState } from '../types';
import { pushStateToCloud } from '../supabase';

interface InvoiceViewProps {
  sub: InvoiceSubCategory;
  currentUser: UserAccount;
  setView: (v: ViewState) => void;
  dataVersion: number;
}

const formatAmPm = (timeStr: string) => {
  if (!timeStr) return '';
  return timeStr.replace('오전', 'am').replace('오후', 'pm');
};

const getCurrentAmPmTime = () => {
  return new Date().toLocaleString('ko-KR', { hour12: true });
};

const AutoExpandingTextarea = React.memo(({ 
  value, onChange, disabled, className, placeholder, onKeyDown, onPaste, dataRow, dataCol
}: any) => {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (ref.current) {
      ref.current.style.height = 'auto';
      ref.current.style.height = ref.current.scrollHeight + 'px';
    }
  }, [value]);
  return (
    <textarea
      ref={ref}
      value={value || ''}
      onChange={onChange}
      onKeyDown={onKeyDown}
      onPaste={onPaste}
      disabled={disabled}
      placeholder={placeholder}
      data-row={dataRow}
      data-col={dataCol}
      className={`w-full bg-transparent resize-none overflow-hidden outline-none p-1 block ${className}`}
      rows={1}
    />
  );
});

const InvoiceView: React.FC<InvoiceViewProps> = ({ sub, currentUser, setView, dataVersion }) => {
  const [invoices, setInvoices] = useState<InvoiceItem[]>([]);
  const [activeInvoice, setActiveInvoice] = useState<InvoiceItem | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestionTarget, setSuggestionTarget] = useState<{rowId: string, field: string} | null>(null);
  const [viewMode, setViewMode] = useState<'ICON' | 'DETAIL'>('ICON');
  const [deletingInvoiceId, setDeletingInvoiceId] = useState<string | null>(null);

  // 페이지네이션 상태 추가
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const isMaster = currentUser.loginId === 'AJ5200';

  const [modal, setModal] = useState<{
    type: 'DELETE' | 'ADD_ROW_CONFIRM' | 'DELETE_SAVED' | 'ALERT' | 'DELETE_FILE';
    id?: string;
    index?: number;
    message?: string;
    onConfirm?: () => void;
  } | null>(null);

  const [formDate, setFormDate] = useState(new Date().toLocaleDateString('ko-KR'));
  const [formRecipient, setFormRecipient] = useState<'SEOUL' | 'DAECHEON' | 'VIETNAM'>('SEOUL');
  const [formCargo, setFormCargo] = useState('');
  const [formWeight, setFormWeight] = useState('');
  const [formBoxQty, setFormBoxQty] = useState('');
  
  const cargoOptions = ['대신화물', '경동화물', '우리해운항공'];

  const createInitialRows = (count: number): InvoiceRow[] => 
    Array(count).fill(null).map(() => ({
      id: Math.random().toString(36).substr(2, 9),
      model: '', drawingNo: '', itemName: '', qty: '', qtyExtra: '', completionExtra: '', completionStatus: '', remarks: ''
    }));
    
  const [formRows, setFormRows] = useState<InvoiceRow[]>(createInitialRows(5));

  // dataVersion 변경 시 데이터를 재로드하여 동기화 반영
  useEffect(() => {
    const saved = localStorage.getItem('ajin_invoices');
    if (saved) {
      const parsedInvoices = JSON.parse(saved);
      setInvoices(parsedInvoices);
      if (activeInvoice) {
        const updatedActive = parsedInvoices.find((i: InvoiceItem) => i.id === activeInvoice.id);
        if (updatedActive) setActiveInvoice(updatedActive);
      }
    }
  }, [dataVersion]);
  
  // 카테고리나 검색어 변경 시 1페이지로 리셋
  useEffect(() => {
    setCurrentPage(1);
  }, [sub, searchTerm]);

  const saveInvoices = (items: InvoiceItem[]) => {
    setInvoices(items);
    localStorage.setItem('ajin_invoices', JSON.stringify(items));
    pushStateToCloud();
  };

  const itemLibrary = useMemo(() => {
    const names = new Set<string>();
    invoices.forEach(inv => {
      inv.rows.forEach(row => {
        if (row.itemName.trim()) names.add(row.itemName.trim());
      });
    });
    return Array.from(names);
  }, [invoices]);

  const updateRowField = useCallback((rowId: string, field: keyof InvoiceRow, value: any) => {
    // 편집 중인 폼 데이터 업데이트
    if (!activeInvoice) {
      setFormRows(prev => prev.map(row => row.id === rowId ? { ...row, [field]: value } : row));
    }

    // 저장된 문서 편집 시 동기화 강화
    if (activeInvoice) {
      const currentFullList = JSON.parse(localStorage.getItem('ajin_invoices') || '[]');
      const updatedList = currentFullList.map((inv: InvoiceItem) => {
        if (inv.id === activeInvoice.id) {
          const updatedRows = inv.rows.map(row => {
            if (row.id === rowId) {
              return { 
                ...row, 
                [field]: value, 
                modLog: { userId: currentUser.initials, timestamp: getCurrentAmPmTime(), type: 'EDIT' as const } 
              } as InvoiceRow;
            }
            return row;
          });
          return { ...inv, rows: updatedRows } as InvoiceItem;
        }
        return inv;
      });

      // 1. LocalStorage 즉시 업데이트
      localStorage.setItem('ajin_invoices', JSON.stringify(updatedList));
      // 2. State 업데이트
      setInvoices(updatedList);
      const currentActive = updatedList.find((i: InvoiceItem) => i.id === activeInvoice.id);
      if (currentActive) setActiveInvoice(currentActive);
      // 3. 클라우드 전송 트리거
      pushStateToCloud();
    }
    
    if (field === 'itemName') {
      const query = value.toLowerCase().trim();
      if (query.length > 0) {
        const filtered = itemLibrary.filter(name => name.toLowerCase().includes(query)).slice(0, 10);
        setSuggestions(filtered);
        setSuggestionTarget({ rowId, field });
      } else {
        setSuggestions([]);
        setSuggestionTarget(null);
      }
    }
  }, [itemLibrary, currentUser, activeInvoice]);

  const handlePaste = (e: React.ClipboardEvent, startRowIdx: number, startColIdx: number) => {
    const pasteData = e.clipboardData.getData('text');
    if (!pasteData.includes('\t') && !pasteData.includes('\n')) return;

    e.preventDefault();
    const rows = pasteData.split(/\r?\n/).filter(line => line.length > 0);
    const grid = rows.map(row => row.split('\t'));

    const fields: (keyof InvoiceRow)[] = ['model', 'drawingNo', 'itemName', 'qty', 'qtyExtra', 'completionExtra', 'completionStatus', 'remarks'];

    if (activeInvoice) {
      const currentFullList = JSON.parse(localStorage.getItem('ajin_invoices') || '[]');
      const updatedList = currentFullList.map((inv: InvoiceItem) => {
        if (inv.id === activeInvoice.id) {
          let newRows = [...inv.rows];
          grid.forEach((pRow, rOffset) => {
            const rIdx = startRowIdx + rOffset;
            if (!newRows[rIdx]) {
              newRows[rIdx] = { id: Math.random().toString(36).substr(2, 9), model: '', drawingNo: '', itemName: '', qty: '', qtyExtra: '', completionExtra: '', completionStatus: '', remarks: '' };
            }
            pRow.forEach((pCell, cOffset) => {
              const cIdx = startColIdx + cOffset;
              if (cIdx < fields.length) {
                const field = fields[cIdx];
                newRows[rIdx] = { ...newRows[rIdx], [field]: pCell, modLog: { userId: currentUser.initials, timestamp: getCurrentAmPmTime(), type: 'EDIT' as const } } as InvoiceRow;
              }
            });
          });
          return { ...inv, rows: newRows } as InvoiceItem;
        }
        return inv;
      });
      localStorage.setItem('ajin_invoices', JSON.stringify(updatedList));
      setInvoices(updatedList);
      const current = updatedList.find((i: InvoiceItem) => i.id === activeInvoice.id);
      if (current) setActiveInvoice(current);
      pushStateToCloud();
    } else {
      setFormRows(prev => {
        let newRows = [...prev];
        grid.forEach((pRow, rOffset) => {
          const rIdx = startRowIdx + rOffset;
          if (!newRows[rIdx]) {
            newRows[rIdx] = { id: Math.random().toString(36).substr(2, 9), model: '', drawingNo: '', itemName: '', qty: '', qtyExtra: '', completionExtra: '', completionStatus: '', remarks: '' };
          }
          pRow.forEach((pCell, cOffset) => {
            const cIdx = startColIdx + cOffset;
            if (cIdx < fields.length) {
              const field = fields[cIdx];
              newRows[rIdx] = { ...newRows[rIdx], [field]: pCell, modLog: { userId: currentUser.initials, timestamp: getCurrentAmPmTime(), type: 'EDIT' as const } } as InvoiceRow;
            }
          });
        });
        return newRows;
      });
    }
  };

  const handleRowKeyDown = (e: React.KeyboardEvent, rowIdx: number, colIdx: number) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const nextColIdx = colIdx + 1;
      const targetRows = activeInvoice ? activeInvoice.rows : formRows;
      if (nextColIdx <= 7) {
        (document.querySelector(`[data-row="${rowIdx}"][data-col="${nextColIdx}"]`) as HTMLTextAreaElement)?.focus();
      } else {
        const nextRowIdx = rowIdx + 1;
        if (nextRowIdx >= targetRows.length) {
          const newRow = { id: Math.random().toString(36).substr(2, 9), model: '', drawingNo: '', itemName: '', qty: '', qtyExtra: '', completionExtra: '', completionStatus: '', remarks: '' };
          if (!activeInvoice) {
            setFormRows(prev => [...prev, newRow]);
          } else {
            const currentFullList = JSON.parse(localStorage.getItem('ajin_invoices') || '[]');
            const updated = currentFullList.map((inv: InvoiceItem) => {
              if (inv.id === activeInvoice.id) {
                return { ...inv, rows: [...inv.rows, newRow] } as InvoiceItem;
              }
              return inv;
            });
            localStorage.setItem('ajin_invoices', JSON.stringify(updated));
            setInvoices(updated);
            const current = updated.find((i: InvoiceItem) => i.id === activeInvoice.id);
            if (current) setActiveInvoice(current);
            pushStateToCloud();
          }
          setTimeout(() => (document.querySelector(`[data-row="${nextRowIdx}"][data-col="0"]`) as HTMLTextAreaElement)?.focus(), 50);
        } else {
          (document.querySelector(`[data-row="${nextRowIdx}"][data-col="0"]`) as HTMLTextAreaElement)?.focus();
        }
      }
    }
  };

  const handleDeleteRow = (rowId: string, index: number) => {
    setModal({
      type: 'DELETE',
      id: rowId,
      index: index,
      message: '정말 삭제하시겠습니까?',
      onConfirm: () => {
        setFormRows(prev => {
          const updated = prev.map(row => 
            row.id === rowId ? { 
              ...row, 
              isDeleted: true, 
              modLog: { userId: currentUser.initials, timestamp: getCurrentAmPmTime(), type: 'DELETE' as const } 
            } : row
          ) as InvoiceRow[];
          const newRow = { id: Math.random().toString(36).substr(2, 9), model: '', drawingNo: '', itemName: '', qty: '', qtyExtra: '', completionExtra: '', completionStatus: '', remarks: '' };
          updated.splice(index + 1, 0, newRow);
          setModal(null);
          return updated;
        });
      }
    });
  };

  const handleQtyConfirm = (rowId: string) => {
    if (sub === InvoiceSubCategory.CREATE) return;
    
    const isAlreadyConfirmed = activeInvoice?.rows.find(r => r.id === rowId)?.qtyConfirm;
    if (isAlreadyConfirmed) return;

    setModal({
      type: 'ADD_ROW_CONFIRM',
      message: '수량 확인을 실행하시겠습니까? 확인 후에는 해당 행의 수정이 불가능합니다.',
      onConfirm: () => {
        const currentFullList = JSON.parse(localStorage.getItem('ajin_invoices') || '[]');
        let allConfirmed = false;
        let finalUpdated = currentFullList.map((inv: InvoiceItem) => {
          if (inv.id === activeInvoice?.id) {
            const updatedRows = inv.rows.map(row => 
              row.id === rowId ? { 
                ...row, 
                qtyConfirm: { userId: currentUser.initials, timestamp: getCurrentAmPmTime() } 
              } : row
            ) as InvoiceRow[];
            
            const activeRows = updatedRows.filter(r => !r.isDeleted && (r.model?.trim() || r.itemName?.trim()));
            allConfirmed = activeRows.length > 0 && activeRows.every(r => !!r.qtyConfirm);
            
            return { 
              ...inv, 
              rows: updatedRows,
              stamps: allConfirmed ? { ...inv.stamps, final: { userId: currentUser.initials, timestamp: getCurrentAmPmTime() } } : inv.stamps
            } as InvoiceItem;
          }
          return inv;
        });

        localStorage.setItem('ajin_invoices', JSON.stringify(finalUpdated));
        setInvoices(finalUpdated);
        
        if (allConfirmed) {
          setModal({
            type: 'ALERT',
            message: '모든 수량확인이 완료되어 해당 수신처 폴더로 저장(분류)되었습니다.',
            onConfirm: () => {
              setModal(null);
              setActiveInvoice(null);
            }
          });
        } else {
          const currentActive = finalUpdated.find((i: InvoiceItem) => i.id === activeInvoice?.id);
          if (currentActive) setActiveInvoice(currentActive);
          setModal(null);
        }
        pushStateToCloud();
      }
    });
  };

  const handleDeleteSavedRow = (rowId: string, index: number) => {
    if (sub === InvoiceSubCategory.CREATE) return;
    setModal({
      type: 'DELETE_SAVED',
      id: rowId,
      index: index,
      message: '정말 삭제하시겠습니까?',
      onConfirm: () => {
        const currentFullList = JSON.parse(localStorage.getItem('ajin_invoices') || '[]');
        const updated = currentFullList.map((inv: InvoiceItem) => {
          if (inv.id === activeInvoice?.id) {
            let updatedRows = inv.rows.map(row => 
              row.id === rowId ? { 
                ...row, 
                isDeleted: true, 
                modLog: { userId: currentUser.initials, timestamp: getCurrentAmPmTime(), type: 'DELETE' as const } 
              } : row
            ) as InvoiceRow[];
            const newRow = { 
              id: `NEW-${Math.random().toString(36).substr(2, 9)}`, 
              model: '', drawingNo: '', itemName: '', qty: '', qtyExtra: '', completionExtra: '', completionStatus: '', remarks: '' 
            };
            updatedRows.splice(index + 1, 0, newRow);
            return { ...inv, rows: updatedRows } as InvoiceItem;
          }
          return inv;
        });
        
        localStorage.setItem('ajin_invoices', JSON.stringify(updated));
        setInvoices(updated);
        const currentActive = updated.find((i: InvoiceItem) => i.id === activeInvoice?.id);
        if (currentActive) setActiveInvoice(currentActive);
        pushStateToCloud();
        setModal(null);
      }
    });
  };

  const handleCreateSubmit = () => {
    const validRows = formRows.filter(r => !r.isDeleted && (r.model.trim() || r.itemName.trim()));
    if (validRows.length === 0) {
      setModal({ type: 'ALERT', message: '입력된 내용이 없습니다.' });
      return;
    }

    const firstRow = validRows[0];
    const newTitle = `${firstRow.model} ${firstRow.itemName}`.trim() || '무제 송장';

    const newInvoice: InvoiceItem = {
      id: `INV-${Date.now()}`,
      title: newTitle,
      date: formDate,
      recipient: formRecipient,
      cargoInfo: formCargo,
      rows: validRows,
      weight: formWeight,
      boxQty: formBoxQty,
      authorId: currentUser.initials,
      createdAt: new Date().toISOString(),
      stamps: {
        writer: { userId: currentUser.initials, timestamp: getCurrentAmPmTime() }
      }
    };

    saveInvoices([newInvoice, ...invoices]);
    setFormRows(createInitialRows(5));
    setFormCargo('');
    setFormWeight('');
    setFormBoxQty('');
    setFormDate(new Date().toLocaleDateString('ko-KR'));
    setModal(null);
    alert('송장 작성이 완료되었습니다.');
    setView({ type: 'DASHBOARD' }); 
  };

  const handleFileDelete = (invoiceId: string) => {
    if (!isMaster) return;
    const filtered = invoices.filter(inv => inv.id !== invoiceId);
    saveInvoices(filtered);
    setModal(null);
    setActiveInvoice(null);
    alert('송장 파일이 영구 삭제되었습니다.');
  };

  const handlePrint = () => {
    const printContent = document.querySelector('.document-print-content')?.innerHTML;
    if (!printContent) return;
    const filename = `${activeInvoice?.title || '송장'}_${activeInvoice?.date || ''}`.replace(/[/\\?%*:|"<>]/g, '-');
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`<html><head><title>${filename}</title><script src="https://cdn.tailwindcss.com"></script><style>body { font-family: 'Gulim', sans-serif; padding: 20px; background: white; } .no-print { display: none !important; } .bg-red-50 { background-color: #fef2f2 !important; } .text-red-600 { color: #dc2626 !important; } .line-through { text-decoration: line-through !important; } table { border-collapse: collapse; width: 100%; border: 2px solid black !important; } th, td { border: 2px solid black !important; padding: 6px; vertical-align: top; } @page { size: A4 portrait; margin: 10mm; } .document-print-content { width: 100% !important; box-shadow: none !important; border: none !important; }</style></head><body onload="window.print();"><div>${printContent}</div></body></html>`);
      printWindow.document.close();
    }
  };

  const getLocationColor = (loc: string) => {
    switch(loc) {
      case 'SEOUL': return { bg: 'bg-blue-50', text: 'text-blue-500', groupHover: 'group-hover:bg-blue-100' };
      case 'DAECHEON': return { bg: 'bg-emerald-50', text: 'text-emerald-500', groupHover: 'group-hover:bg-emerald-100' };
      case 'VIETNAM': return { bg: 'bg-amber-50', text: 'text-amber-500', groupHover: 'group-hover:bg-amber-100' };
      default: return { bg: 'bg-slate-50', text: 'text-slate-500', groupHover: 'group-hover:bg-slate-100' };
    }
  };

  const renderInvoiceForm = (isReadOnly: boolean = false, data?: InvoiceItem) => {
    const rows = isReadOnly ? (data?.rows || []) : formRows;
    const recipient = isReadOnly ? data?.recipient : formRecipient;
    const date = isReadOnly ? data?.date : formDate;
    const cargo = isReadOnly ? data?.cargoInfo : formCargo;
    const weight = isReadOnly ? data?.weight : formWeight;
    const boxQty = isReadOnly ? data?.boxQty : formBoxQty;
    const stamps = data?.stamps;

    return (
      <div className={`bg-white border border-slate-300 shadow-2xl mx-auto p-4 md:p-12 min-h-[297mm] w-full max-w-[210mm] text-slate-800 font-gulim relative document-print-content text-left overflow-x-auto ${isPreviewing ? 'scale-[1.0] origin-top' : ''}`}>
        <div className="min-w-[650px]">
          <div className="flex justify-between items-start mb-8">
            <div className="text-3xl md:text-5xl font-bold uppercase tracking-widest">송 장</div>
            <div className="text-right">
              <div className="font-bold text-lg md:text-xl mb-1">AJIN PRECISION MFG., INC.</div>
              <div className="text-[9px] md:text-[10px] text-slate-500">#806 Star Valley 99, Digital-ro 9-gil, Geumcheon-Ku, Seoul, Korea</div>
              <div className="text-[9px] md:text-[10px] text-slate-500">TEL : 070-4121-2611</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-8 md:gap-x-12 gap-y-2 mb-6 text-xs md:text-sm">
            <div className="flex border-b border-slate-900 pb-1 items-center">
              <span className="w-16 font-bold">날짜</span>
              {isReadOnly ? <span>{date}</span> : (
                <input type="text" value={date} onChange={(e) => setFormDate(e.target.value)} className="flex-1 bg-transparent outline-none"/>
              )}
            </div>
            <div className="flex border-b border-slate-900 pb-1 items-center gap-2">
              <span className="w-16 font-bold whitespace-nowrap">화물발송</span>
              {isReadOnly ? <span>{cargo}</span> : (
                <div className="flex flex-1 items-center gap-2">
                  <select 
                    className="bg-slate-50 border rounded px-1 py-0.5 text-[10px] md:text-xs outline-none w-16 md:w-auto"
                    onChange={(e) => setFormCargo(e.target.value)}
                    value={cargoOptions.includes(formCargo) ? formCargo : ''}
                  >
                    <option value="">직접</option>
                    {cargoOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                  <input 
                    type="text" 
                    value={formCargo} 
                    onChange={(e) => setFormCargo(e.target.value)} 
                    placeholder="정보 입력"
                    className="flex-1 bg-transparent outline-none border-l border-slate-200 pl-2 min-w-0"
                  />
                </div>
              )}
            </div>
            <div className="flex border-b border-slate-900 pb-1 items-center">
              <span className="w-16 font-bold">수신처</span>
              {isReadOnly ? <span className="font-bold text-blue-700">{recipient === 'SEOUL' ? '서울' : recipient === 'DAECHEON' ? '대천' : '베트남'}</span> : (
                <div className="flex gap-2 md:gap-4 overflow-x-auto">
                  {['SEOUL', 'DAECHEON', 'VIETNAM'].map(loc => (
                    <label key={loc} className="flex items-center gap-1 cursor-pointer text-[10px] md:text-xs whitespace-nowrap">
                      <input type="radio" checked={formRecipient === loc} onChange={() => setFormRecipient(loc as any)}/>
                      {loc === 'SEOUL' ? '서울' : loc === 'DAECHEON' ? '대천' : '베트남'}
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>

          <table className="w-full border-collapse border-2 border-slate-900 text-[10px] md:text-[11px]">
            <thead className="bg-slate-50">
              <tr>
                <th className="border border-slate-900 p-1 md:p-2 w-[11%] text-center">기종</th>
                <th className="border border-slate-900 p-1 md:p-2 w-[10%] text-center">도 번</th>
                <th className="border border-slate-900 p-1 md:p-2 flex-1 min-w-[120px] text-center">품 목</th>
                <th className="border border-slate-900 p-1 md:p-2 w-[12%] text-center">수 량</th>
                <th className="border border-slate-900 p-1 md:p-2 w-[9%] text-center leading-tight">완료</th>
                <th className="border border-slate-900 p-1 md:p-2 w-[13%] text-center">확인</th>
                <th className="border border-slate-900 p-1 md:p-2 w-[15%] text-center">비고</th>
                <th className="border border-slate-900 p-1 md:p-2 w-[8%] text-center no-print">관리</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => {
                const isRowEditableInLockedDoc = row.id && typeof row.id === 'string' && row.id.startsWith('NEW-');
                const finalDisabled = row.isDeleted || !!row.qtyConfirm || (isReadOnly && !isRowEditableInLockedDoc);

                return (
                  <tr key={row.id} className={row.isDeleted ? 'bg-red-50' : ''}>
                    <td className="border border-slate-900 p-0 relative">
                      <AutoExpandingTextarea value={row.model} dataRow={idx} dataCol={0} disabled={finalDisabled} onChange={(e: any) => updateRowField(row.id, 'model', e.target.value)} onKeyDown={(e: any) => handleRowKeyDown(e, idx, 0)} onPaste={(e: any) => handlePaste(e, idx, 0)} className={row.isDeleted ? 'text-red-600 line-through' : ''}/>
                    </td>
                    <td className="border border-slate-900 p-0 relative">
                      <AutoExpandingTextarea value={row.drawingNo} dataRow={idx} dataCol={1} disabled={finalDisabled} onChange={(e: any) => updateRowField(row.id, 'drawingNo', e.target.value)} onKeyDown={(e: any) => handleRowKeyDown(e, idx, 1)} onPaste={(e: any) => handlePaste(e, idx, 1)} className={`text-center ${row.isDeleted ? 'text-red-600 line-through' : ''}`}/>
                    </td>
                    <td className="border border-slate-900 p-0 relative">
                      <AutoExpandingTextarea value={row.itemName} dataRow={idx} dataCol={2} disabled={finalDisabled} onChange={(e: any) => updateRowField(row.id, 'itemName', e.target.value)} onKeyDown={(e: any) => handleRowKeyDown(e, idx, 2)} onPaste={(e: any) => handlePaste(e, idx, 2)} className={row.isDeleted ? 'text-red-600 line-through' : ''}/>
                      {suggestionTarget?.rowId === row.id && suggestions.length > 0 && (
                        <div className="absolute left-0 right-0 top-full bg-white border border-slate-300 shadow-xl z-50 rounded-b overflow-hidden max-h-32 overflow-y-auto">
                          {suggestions.map((name, sIdx) => (
                            <button key={sIdx} onClick={() => { updateRowField(row.id, 'itemName', name); setSuggestions([]); setSuggestionTarget(null); }} className="w-full text-left px-3 py-1.5 text-[9px] md:text-[10px] hover:bg-blue-50 border-b last:border-0 border-slate-100 font-bold">{name}</button>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="border border-slate-900 p-0 relative">
                      <div className="grid grid-cols-7 h-full min-h-[30px] items-center">
                        <div className="col-span-5 h-full flex items-center">
                          <AutoExpandingTextarea value={row.qty} dataRow={idx} dataCol={3} disabled={finalDisabled} onChange={(e: any) => updateRowField(row.id, 'qty', e.target.value)} onKeyDown={(e: any) => handleRowKeyDown(e, idx, 3)} onPaste={(e: any) => handlePaste(e, idx, 3)} className={`text-center ${row.isDeleted ? 'text-red-600 line-through' : ''}`}/>
                        </div>
                        <div className="col-span-2 border-l border-slate-900 h-full flex items-center">
                           <AutoExpandingTextarea value={row.qtyExtra} dataRow={idx} dataCol={4} disabled={finalDisabled} onChange={(e: any) => updateRowField(row.id, 'qtyExtra', e.target.value)} onKeyDown={(e: any) => handleRowKeyDown(e, idx, 4)} onPaste={(e: any) => handlePaste(e, idx, 4)} className={`text-center ${row.isDeleted ? 'text-red-600 line-through' : ''}`}/>
                        </div>
                      </div>
                    </td>
                    <td className="border border-slate-900 p-0 relative">
                      <div className="grid grid-cols-7 h-full min-h-[30px] items-center">
                        <div className="col-span-2 h-full flex items-center">
                          <AutoExpandingTextarea value={row.completionExtra} dataRow={idx} dataCol={5} disabled={finalDisabled} onChange={(e: any) => updateRowField(row.id, 'completionExtra', e.target.value)} onKeyDown={(e: any) => handleRowKeyDown(e, idx, 5)} onPaste={(e: any) => handlePaste(e, idx, 5)} className={`text-center ${row.isDeleted ? 'text-red-600 line-through' : ''}`}/>
                        </div>
                        <div className="col-span-5 border-l border-slate-900 h-full flex items-center">
                           <AutoExpandingTextarea value={row.completionStatus} dataRow={idx} dataCol={6} disabled={finalDisabled} onChange={(e: any) => updateRowField(row.id, 'completionStatus', e.target.value)} onKeyDown={(e: any) => handleRowKeyDown(e, idx, 6)} onPaste={(e: any) => handlePaste(e, idx, 6)} className={`text-center ${row.isDeleted ? 'text-red-600 line-through' : ''}`}/>
                        </div>
                      </div>
                    </td>
                    <td className={`border border-slate-900 p-1 text-center transition-colors ${row.qtyConfirm ? 'bg-blue-50/30' : ''} ${isReadOnly && !row.isDeleted ? 'cursor-pointer hover:bg-slate-50' : ''}`} onClick={() => isReadOnly && !row.isDeleted && handleQtyConfirm(row.id)}>
                       {row.qtyConfirm ? (
                         <div className="flex flex-col items-center scale-90">
                           <span className="font-bold text-blue-600 leading-tight whitespace-nowrap">{row.qtyConfirm.userId}</span>
                           <span className="text-[7px] text-slate-400 leading-tight mt-0.5 whitespace-nowrap">{formatAmPm(row.qtyConfirm.timestamp)}</span>
                         </div>
                       ) : <span className="text-slate-300 text-[9px]">{isReadOnly && !row.isDeleted ? '확인' : ''}</span>}
                    </td>
                    <td className="border border-slate-900 p-0 relative">
                      <AutoExpandingTextarea value={row.remarks} dataRow={idx} dataCol={7} disabled={finalDisabled} onChange={(e: any) => updateRowField(row.id, 'remarks', e.target.value)} onKeyDown={(e: any) => handleRowKeyDown(e, idx, 7)} onPaste={(e: any) => handlePaste(e, idx, 7)} className={row.isDeleted ? 'text-red-600 line-through' : ''}/>
                    </td>
                    <td className="border border-slate-900 p-1 text-center no-print min-w-[40px]">
                      {isReadOnly ? (
                        (row.model || row.itemName) && (
                          <button 
                            onClick={() => handleDeleteSavedRow(row.id, idx)} 
                            disabled={row.isDeleted}
                            className={`px-1.5 py-0.5 rounded text-[8px] md:text-[9px] font-bold transition-all ${row.isDeleted ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-red-50 text-red-500 hover:bg-red-500 hover:text-white'}`}
                          >
                            삭제
                          </button>
                        )
                      ) : (
                        sub !== InvoiceSubCategory.CREATE && (
                          <button onClick={() => handleDeleteRow(row.id, idx)} className={`text-[8px] md:text-[9px] font-bold text-red-500 hover:underline ${row.isDeleted ? 'opacity-30 pointer-events-none' : ''}`}>삭제</button>
                        )
                      )}
                      {row.modLog && (
                        <div className="text-[7px] text-slate-400 mt-1 leading-tight font-sans">
                          <span className="font-bold">{row.modLog.type === 'DELETE' ? 'DEL' : 'MOD'}:</span> {row.modLog.userId}<br/>{formatAmPm(row.modLog.timestamp)}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="flex justify-end mt-4">
            <table className="border-collapse border border-slate-900 text-[10px] md:text-[11px] w-40 md:w-48">
              <tbody>
                <tr>
                  <td className="border border-slate-900 p-1 bg-slate-50 font-bold w-16 md:w-20 text-center whitespace-nowrap">무게(KG)</td>
                  <td className="border border-slate-900 p-0">
                    {isReadOnly ? <span className="px-2">{weight}</span> : <input type="text" value={weight} onChange={(e) => setFormWeight(e.target.value)} className="w-full bg-transparent outline-none p-1 text-center"/>}
                  </td>
                </tr>
                <tr>
                  <td className="border border-slate-900 p-1 bg-slate-50 font-bold w-16 md:w-20 text-center whitespace-nowrap">수량(BOX)</td>
                  <td className="border border-slate-900 p-0">
                    {isReadOnly ? <span className="px-2">{boxQty}</span> : <input type="text" value={boxQty} onChange={(e) => setFormBoxQty(e.target.value)} className="w-full bg-transparent outline-none p-1 text-center"/>}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {stamps && (
            <div className="mt-8 flex flex-wrap justify-end items-center gap-4 md:gap-6 text-[9px] md:text-[10px] no-print">
              {stamps.writer && (
                <div className="flex items-center gap-2">
                  <span className="text-slate-400 font-bold uppercase">작성:</span>
                  <span className="text-blue-600 font-black">{stamps.writer.userId}</span>
                  <span className="text-slate-400 whitespace-nowrap">{formatAmPm(stamps.writer.timestamp)}</span>
                </div>
              )}
              {stamps.final && (
                <div className="flex items-center gap-2 border-l border-slate-200 pl-4">
                  <span className="text-slate-400 font-bold uppercase">완료:</span>
                  <span className="text-emerald-600 font-black">{stamps.final.userId}</span>
                  <span className="text-slate-400 whitespace-nowrap">{formatAmPm(stamps.final.timestamp)}</span>
                </div>
              )}
            </div>
          )}

          <div className="mt-8 flex justify-end px-2 text-[9px] md:text-[10px] font-bold text-slate-400 tracking-widest uppercase italic pb-8">
            AJIN PRE / AJIN VINA
          </div>

          {!isReadOnly && (
            <div className="mt-8 md:mt-12 flex justify-center no-print pb-8">
              <button onClick={handleCreateSubmit} className="px-10 md:px-16 py-3 md:py-4 bg-slate-900 text-white rounded-xl font-black text-lg md:text-xl hover:bg-blue-600 shadow-2xl transition-all active:scale-95">작 성 완 료</button>
            </div>
          )}
        </div>

        {modal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[9999] p-4 no-print">
            <div className="bg-white rounded-2xl shadow-2xl p-6 md:p-8 max-w-sm w-full border border-slate-200 animate-in fade-in zoom-in duration-200">
              <h3 className={`text-lg md:text-xl font-black mb-4 ${modal.type === 'DELETE' || modal.type === 'DELETE_SAVED' || modal.type === 'DELETE_FILE' ? 'text-red-600' : 'text-slate-900'} text-center`}>
                {modal.type === 'ALERT' ? '알림' : '확인'}
              </h3>
              <p className="text-slate-600 mb-8 font-medium leading-relaxed text-sm md:text-base text-center">{modal.message}</p>
              <div className="flex gap-3">
                {modal.type === 'ALERT' ? (
                  <button 
                    onClick={() => { if (modal.onConfirm) modal.onConfirm(); else setModal(null); }}
                    className="flex-1 py-3 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition-all"
                  >
                    확인
                  </button>
                ) : (
                  <>
                    <button 
                      onClick={() => setModal(null)}
                      className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-all"
                    >
                      취소
                    </button>
                    <button 
                      onClick={() => modal.onConfirm && modal.onConfirm()}
                      className={`flex-1 py-3 text-white rounded-xl font-bold transition-all shadow-lg ${modal.type === 'DELETE' || modal.type === 'DELETE_SAVED' || modal.type === 'DELETE_FILE' ? 'bg-red-600 hover:bg-red-700 shadow-red-100' : 'bg-blue-600 hover:bg-blue-700 shadow-blue-100'}`}
                    >
                      확인
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  if (sub === InvoiceSubCategory.CREATE) {
    return (
      <div className="py-4 md:py-8 bg-slate-200 min-h-screen overflow-x-auto">
        {renderInvoiceForm(false)}
      </div>
    );
  }

  const locationFilter = sub === InvoiceSubCategory.SEOUL ? 'SEOUL' : sub === InvoiceSubCategory.DAECHEON ? 'DAECHEON' : 'VIETNAM';
  
  const filtered = sub === InvoiceSubCategory.COMPLETED 
    ? invoices.filter(inv => {
        const activeRows = inv.rows.filter(r => !r.isDeleted && (r.model?.trim() || r.itemName?.trim()));
        if (activeRows.length === 0) return true;
        return !activeRows.every(r => !!r.qtyConfirm);
      })
    : invoices.filter(inv => {
        if (inv.recipient !== locationFilter) return false;
        const activeRows = inv.rows.filter(r => !r.isDeleted && (r.model?.trim() || r.itemName?.trim()));
        if (activeRows.length === 0) return false;
        return activeRows.every(r => !!r.qtyConfirm);
      });

  // 수정날짜(createdAt) 기준 내림차순 정렬 (최신순)
  const sortedAll = [...filtered].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  // 검색 필터링 적용
  const searchFiltered = sortedAll.filter(inv => {
    if (!searchTerm.trim()) return true;
    const lower = searchTerm.toLowerCase();
    const hasItem = inv.rows.some(r => r.itemName.toLowerCase().includes(lower) || r.model.toLowerCase().includes(lower));
    return (inv.title && inv.title.toLowerCase().includes(lower)) || hasItem;
  });
  
  // 페이지네이션 적용
  const totalItems = searchFiltered.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const paginatedItems = searchFiltered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  if (activeInvoice) {
    return (
      <div className={`py-4 md:py-8 bg-slate-200 min-h-screen ${isPreviewing ? 'fixed inset-0 z-[100] bg-slate-900 overflow-y-auto' : ''}`}>
        <div className="max-w-[1000px] mx-auto mb-4 md:mb-6 flex flex-col md:flex-row justify-between items-start md:items-center px-4 no-print gap-4">
          {isPreviewing ? (
            <div>
              <h2 className="text-xl md:text-2xl font-black text-white">PDF 저장 미리보기</h2>
              <p className="text-slate-400 text-[10px] md:text-sm italic">인쇄창의 대상에서 [PDF로 저장]을 선택해 보관하세요.</p>
            </div>
          ) : (
            <button onClick={() => setActiveInvoice(null)} className="bg-white px-4 md:px-6 py-2.5 md:py-3 rounded-xl font-bold shadow-lg hover:bg-slate-50 border border-slate-300 transition-all flex items-center gap-2 text-sm">← 목록으로</button>
          )}
          <div className="flex gap-2 md:gap-3 w-full md:w-auto">
            {isPreviewing ? (
              <>
                <button onClick={() => setIsPreviewing(false)} className="flex-1 md:flex-none bg-slate-700 text-white px-4 md:px-6 py-2.5 md:py-3 rounded-xl font-bold hover:bg-slate-600 transition-all text-sm">닫기</button>
                <button onClick={handlePrint} className="flex-1 md:flex-none bg-blue-500 text-white px-6 md:px-8 py-2.5 md:py-3 rounded-xl font-black shadow-2xl hover:bg-blue-400 flex items-center justify-center gap-2 transition-all text-sm">
                  저장 / 인쇄
                </button>
              </>
            ) : (
              <button onClick={() => setIsPreviewing(true)} className="flex-1 md:flex-none bg-blue-600 text-white px-6 md:px-8 py-2.5 md:py-3 rounded-xl font-black shadow-lg hover:bg-blue-700 flex items-center justify-center gap-2 transition-all text-sm">PDF 저장 / 인쇄</button>
            )}
          </div>
        </div>
        <div className="print-area">
          {renderInvoiceForm(true, activeInvoice)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6 text-left pb-12">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-black text-slate-900">{sub} 송장 관리</h2>
          <div className="flex flex-wrap items-center gap-2 md:gap-4 mt-2">
            <p className="text-slate-500 text-xs md:text-sm">총 {totalItems}건의 송장</p>
            <div className="hidden md:block h-4 w-[1px] bg-slate-300"></div>
            <div className="flex bg-slate-200 p-1 rounded-lg">
              <button 
                onClick={() => setViewMode('ICON')}
                className={`px-3 py-1 rounded-md text-[10px] font-bold transition-all ${viewMode === 'ICON' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                아이콘
              </button>
              <button 
                onClick={() => setViewMode('DETAIL')}
                className={`px-3 py-1 rounded-md text-[10px] font-bold transition-all ${viewMode === 'DETAIL' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                리스트
              </button>
            </div>
          </div>
        </div>
        <div className="relative w-full md:max-w-sm">
          <input 
            type="text" 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="기종 또는 품목으로 찾기..."
            className="w-full px-4 md:px-5 py-2.5 md:py-3 rounded-xl md:rounded-2xl border border-slate-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-sm font-medium"
          />
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 md:h-5 md:w-5 absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
      </div>

      {viewMode === 'ICON' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-8">
          {paginatedItems.length === 0 ? (
            <div className="col-span-full py-16 md:py-32 text-center text-slate-400 border-4 border-dashed rounded-3xl bg-white/50 text-sm md:text-lg">
              {searchTerm ? '검색 결과가 없습니다.' : '보관된 송장이 없습니다.'}
            </div>
          ) : (
            paginatedItems.map(inv => {
              const colors = getLocationColor(inv.recipient);
              return (
                <div key={inv.id} className="relative group">
                  <button 
                    onClick={() => setActiveInvoice(inv)} 
                    className="w-full bg-white p-6 md:p-8 rounded-2xl md:rounded-3xl shadow-sm border-2 border-slate-100 hover:border-blue-500 hover:shadow-xl transition-all flex flex-col items-center relative overflow-hidden text-center"
                  >
                    <div className={`w-12 h-16 md:w-16 md:h-20 ${colors.bg} ${colors.groupHover} rounded-lg shadow-inner mb-4 md:mb-6 flex items-center justify-center border border-slate-100 transition-colors relative`}>
                      <svg xmlns="http://www.w3.org/2000/svg" className={`h-6 w-6 md:h-8 md:w-8 ${colors.text} opacity-60`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <h3 className="font-black text-slate-800 text-xs md:text-sm truncate w-full mb-1 leading-tight px-2">{inv.title || '무제 송장'}</h3>
                    <p className="text-[9px] md:text-[10px] text-slate-400 font-bold mb-1">{inv.date}</p>
                    <p className="text-[9px] md:text-[10px] text-blue-600 uppercase font-bold tracking-widest opacity-70 truncate w-full">{inv.cargoInfo || '-'}</p>
                  </button>
                  {isMaster && (
                    <button 
                      onClick={(e) => { 
                        e.stopPropagation(); 
                        setModal({
                          type: 'DELETE_FILE',
                          message: '해당 송장 파일을 영구 삭제하시겠습니까? (복구 불가)',
                          onConfirm: () => handleFileDelete(inv.id)
                        });
                      }} 
                      className="absolute -top-2 -right-2 bg-red-600 text-white w-7 h-7 md:w-8 md:h-8 rounded-full shadow-lg hover:bg-red-700 flex items-center justify-center z-10"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl md:rounded-2xl border border-slate-200 overflow-x-auto shadow-sm">
          <table className="w-full text-left min-w-[700px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-4 md:px-6 py-3 md:py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">날짜</th>
                <th className="px-4 md:px-6 py-3 md:py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">송장 제목</th>
                <th className="px-4 md:px-6 py-3 md:py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">수신처</th>
                <th className="px-4 md:px-6 py-3 md:py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">작성자</th>
                <th className="px-4 md:px-6 py-3 md:py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">화물정보</th>
                <th className="px-4 md:px-6 py-3 md:py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedItems.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-400 font-medium italic">송장이 없습니다.</td>
                </tr>
              ) : (
                paginatedItems.map(inv => {
                  const colors = getLocationColor(inv.recipient);
                  return (
                    <tr key={inv.id} className="hover:bg-slate-50 transition-colors cursor-pointer group" onClick={() => setActiveInvoice(inv)}>
                      <td className="px-4 md:px-6 py-3 md:py-4 text-xs font-mono text-slate-500 whitespace-nowrap">{inv.date}</td>
                      <td className="px-4 md:px-6 py-3 md:py-4 text-xs md:text-sm font-black text-slate-800">{inv.title || '무제 송장'}</td>
                      <td className="px-4 md:px-6 py-3 md:py-4 text-center">
                        <span className={`inline-block px-2 md:px-3 py-0.5 md:py-1 rounded-full text-[9px] md:text-[10px] font-bold border ${colors.bg} ${colors.text} border-transparent whitespace-nowrap`}>
                          {inv.recipient === 'SEOUL' ? '서울' : inv.recipient === 'DAECHEON' ? '대천' : '베트남'}
                        </span>
                      </td>
                      <td className="px-4 md:px-6 py-3 md:py-4 text-center text-[10px] md:text-xs font-bold text-slate-600 uppercase tracking-tighter">
                        {inv.authorId}
                      </td>
                      <td className="px-4 md:px-6 py-3 md:py-4 text-center text-[10px] md:text-xs font-bold text-slate-600 uppercase tracking-tighter">
                        {inv.cargoInfo || '-'}
                      </td>
                      <td className="px-4 md:px-6 py-3 md:py-4 text-right">
                        <div className="flex justify-end items-center gap-3">
                          <span className="text-[10px] font-bold text-blue-600 hidden md:inline opacity-0 group-hover:opacity-100 transition-opacity">보기 →</span>
                          {isMaster && (
                            <button 
                              onClick={(e) => { 
                                e.stopPropagation(); 
                                setModal({
                                  type: 'DELETE_FILE',
                                  message: '해당 송장 파일을 영구 삭제하시겠습니까? (복구 불가)',
                                  onConfirm: () => handleFileDelete(inv.id)
                                });
                              }} 
                              className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
      
      {/* 페이지네이션 컨트롤 */}
      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-4 mt-8 no-print pb-10">
          <button 
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))} 
            disabled={currentPage === 1}
            className="px-4 py-2 bg-white border border-slate-300 rounded-xl font-bold text-slate-700 disabled:opacity-30 hover:bg-slate-50 transition-all shadow-sm"
          >
            이전
          </button>
          <div className="flex gap-2">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(pageNum => (
              <button
                key={pageNum}
                onClick={() => setCurrentPage(pageNum)}
                className={`w-10 h-10 rounded-xl font-black transition-all ${currentPage === pageNum ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' : 'bg-white border border-slate-200 text-slate-400 hover:bg-slate-50'}`}
              >
                {pageNum}
              </button>
            ))}
          </div>
          <button 
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} 
            disabled={currentPage === totalPages}
            className="px-4 py-2 bg-white border border-slate-300 rounded-xl font-bold text-slate-700 disabled:opacity-30 hover:bg-slate-50 transition-all shadow-sm"
          >
            다음
          </button>
        </div>
      )}

      {modal && modal.type === 'DELETE_FILE' && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[9999] p-4 no-print">
          <div className="bg-white rounded-2xl shadow-2xl p-6 md:p-8 max-w-sm w-full border border-slate-200 animate-in fade-in zoom-in duration-200 text-center">
            <h3 className="text-xl font-black mb-4 text-red-600">확인</h3>
            <p className="text-slate-600 mb-8 font-medium leading-relaxed text-sm md:text-base">{modal.message}</p>
            <div className="flex gap-3">
              <button 
                onClick={() => setModal(null)}
                className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-all"
              >
                취소
              </button>
              <button 
                onClick={() => modal.onConfirm && modal.onConfirm()}
                className="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold transition-all shadow-lg shadow-red-100 hover:bg-red-700"
              >
                영구 삭제
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InvoiceView;
