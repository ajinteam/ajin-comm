
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { VietnamSubCategory, VietnamOrderItem, VietnamOrderRow, UserAccount, ViewState } from '../types';
import { pushStateToCloud } from '../supabase';

interface VietnamOrderViewProps {
  sub: VietnamSubCategory;
  currentUser: UserAccount;
  setView: (v: ViewState) => void;
  dataVersion: number;
}

const AutoExpandingTextarea = React.memo(({ 
  value, onChange, disabled, className, placeholder, onKeyDown, onPaste, onFocus, dataRow, dataCol, style
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
      onFocus={onFocus}
      disabled={disabled}
      placeholder={placeholder}
      data-row={dataRow}
      data-col={dataCol}
      style={style}
      className={`w-full bg-transparent resize-none overflow-hidden outline-none block whitespace-pre-wrap font-bold ${className}`}
      rows={1}
    />
  );
});

const getCellBorderStyle = (r: number, c: number, borderData: any) => {
  const b = borderData?.[`${r}-${c}`];
  if (!b) return {};
  const styles: any = {};
  const getS = (s?: string) => s === 'none' ? 'none' : (s === 'dotted' ? 'dotted' : 'solid');
  const getW = (s?: string) => s === 'none' ? '0px' : '1px';
  if (b.t) { styles.borderTopStyle = getS(b.t); styles.borderTopWidth = getW(b.t); }
  if (b.b) { styles.borderBottomStyle = getS(b.b); styles.borderBottomWidth = getW(b.b); }
  if (b.l) { styles.borderLeftStyle = getS(b.l); styles.borderLeftWidth = getW(b.l); }
  if (b.r) { styles.borderRightStyle = getS(b.r); styles.borderRightWidth = getW(b.r); }
  return styles;
};

const VietnamOrderView: React.FC<VietnamOrderViewProps> = ({ sub, currentUser, setView, dataVersion }) => {
  const [items, setItems] = useState<VietnamOrderItem[]>([]);
  const [activeItem, setActiveItem] = useState<VietnamOrderItem | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'ICON' | 'LIST'>('ICON');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  
  const isMaster = currentUser.loginId === 'AJ5200';

  // 폼 공통 상태
  const [vTitle, setVTitle] = useState('ĐƠN ĐẶT HÀNG (PO)');
  const [vDate, setVDate] = useState(new Date().toLocaleDateString('ko-KR'));
  const [vClientName, setVClientName] = useState('');
  const [vClientAddress, setVClientAddress] = useState('');
  const [vTaxId, setVTaxId] = useState('');
  const [vDeliveryAddress, setVDeliveryAddress] = useState('Cty Toàn Thắng Lô 2 KCN Bình xuyên -TT Hương Canh - Bình Xuyên, Vĩnh Phúc -');
  const [vRows, setVRows] = useState<VietnamOrderRow[]>([]);
  
  // 지불요청서 전용 상태
  const [vBeneficiary, setVBeneficiary] = useState('');
  const [vAccountNo, setVAccountNo] = useState('');
  const [vBank, setVBank] = useState('');
  const [vBankAddr, setVBankAddr] = useState('');
  const [vVatRate, setVVatRate] = useState(10); // 기본 10%
  const [vRemark, setVRemark] = useState('');

  // Rejection state
  const [rejectingItem, setRejectingItem] = useState<VietnamOrderItem | null>(null);
  const [rejectReasonText, setRejectReasonText] = useState('');

  // Deletion state
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Editing state (from rejection or temporary)
  const [editingId, setEditingId] = useState<string | null>(null);

  // Cell Tools 상태
  const [selection, setSelection] = useState<{ sR: number, sC: number, eR: number, eC: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [merges, setMerges] = useState<Record<string, { rS: number, cS: number }>>({});
  const [aligns, setAligns] = useState<Record<string, 'left' | 'center' | 'right'>>({});
  const [weights, setWeights] = useState<Record<string, 'normal' | 'bold'>>({});
  const [borders, setBorders] = useState<Record<string, { t?: string, b?: string, l?: string, r?: string }>>({});
  const [activeBorderStyle, setActiveBorderStyle] = useState<string>('solid');
  const [undoStack, setUndoStack] = useState<string[]>([]);

  const createEmptyRow = () => ({
    id: Math.random().toString(36).substr(2, 9),
    itemName: '', image: '', unit: '', qty: '', unitPrice: '', amount: '', remarks: ''
  });

  useEffect(() => {
    const saved = localStorage.getItem('ajin_vietnam_orders');
    if (saved) setItems(JSON.parse(saved));
  }, [dataVersion]);

  useEffect(() => {
    setCurrentPage(1);
    if (sub === VietnamSubCategory.ORDER || sub === VietnamSubCategory.PAYMENT) {
      setVRows(Array(sub === VietnamSubCategory.PAYMENT ? 3 : 5).fill(null).map(createEmptyRow));
      setMerges({}); setAligns({}); setWeights({}); setBorders({}); setUndoStack([]);
      setEditingId(null);
      setVRemark('');
      
      if (sub === VietnamSubCategory.PAYMENT) {
        setVTitle('ĐỀ NGHỊ THANH TOÁN (지불 요청서)');
      } else {
        setVTitle('ĐƠN ĐẶT HÀNG (PO)');
      }
    }
  }, [sub]);

  const takeSnapshot = useCallback(() => {
    const snapshot = JSON.stringify({ vRows, merges, aligns, weights, borders, vTitle, vClientName, vClientAddress, vTaxId, vDeliveryAddress, vBeneficiary, vAccountNo, vBank, vBankAddr, vVatRate, vRemark });
    setUndoStack(prev => [snapshot, ...prev].slice(0, 50));
  }, [vRows, merges, aligns, weights, borders, vTitle, vClientName, vClientAddress, vTaxId, vDeliveryAddress, vBeneficiary, vAccountNo, vBank, vBankAddr, vVatRate, vRemark]);

  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const [last, ...rest] = undoStack;
    try {
      const data = JSON.parse(last);
      setVRows(data.vRows); setMerges(data.merges); setAligns(data.aligns); setWeights(data.weights); setBorders(data.borders);
      setVTitle(data.vTitle); setVClientName(data.vClientName); setVClientAddress(data.vClientAddress); setVTaxId(data.vTaxId); setVDeliveryAddress(data.vDeliveryAddress);
      setVBeneficiary(data.vBeneficiary || ''); setVAccountNo(data.vAccountNo || ''); setVBank(data.vBank || ''); setVBankAddr(data.vBankAddr || ''); setVVatRate(data.vVatRate || 10);
      setVRemark(data.vRemark || '');
      setUndoStack(rest);
    } catch (e) { console.error('Undo failed', e); }
  };

  const calculateAmount = (row: VietnamOrderRow) => {
    const q = parseFloat(String(row.qty).replace(/[,.]/g, '')) || 0;
    const u = parseFloat(String(row.unitPrice).replace(/[,.]/g, '')) || 0;
    if (u === 0) return row.amount || ''; 
    return (q * u).toLocaleString();
  };

  const getSubtotal = (rows: VietnamOrderRow[]) => {
    return rows.reduce((acc, row) => {
      const amt = calculateAmount(row);
      return acc + (parseFloat(String(amt).replace(/[,.]/g, '')) || 0);
    }, 0);
  };

  const getTotal = (rows: VietnamOrderRow[], vatRate: number = 0) => {
    const subtotal = getSubtotal(rows);
    const vat = Math.floor(subtotal * (vatRate / 100));
    return { subtotal, vat, total: subtotal + vat };
  };

  const updateRowField = (id: string, field: keyof VietnamOrderRow, value: string) => {
    setVRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  };

  const handleInsertRow = (idx: number) => {
    takeSnapshot();
    const newRows = [...vRows];
    newRows.splice(idx + 1, 0, createEmptyRow());
    setVRows(newRows);
  };

  const handleDeleteRow = (idx: number) => {
    if (vRows.length <= 1) return;
    takeSnapshot();
    setVRows(vRows.filter((_, i) => i !== idx));
  };

  const handleRowKeyDown = (e: React.KeyboardEvent, rowIdx: number, colIdx: number, docType: 'ORDER' | 'PAYMENT') => {
    const validColsPo = [1, 2, 3, 4, 5, 6, 7];
    const validColsPay = [1, 3, 4, 5, 6, 7];
    const validCols = docType === 'PAYMENT' ? validColsPay : validColsPo;
    
    const currentIndex = validCols.indexOf(colIdx);
    
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (currentIndex < validCols.length - 1) {
        const nextCol = validCols[currentIndex + 1];
        (document.querySelector(`[data-row="${rowIdx}"][data-col="${nextCol}"]`) as HTMLElement)?.focus();
      } else {
        const nextRowIdx = rowIdx + 1;
        if (nextRowIdx < vRows.length) {
          (document.querySelector(`[data-row="${nextRowIdx}"][data-col="${validCols[0]}"]`) as HTMLElement)?.focus();
        }
      }
    } else if (['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft'].includes(e.key)) {
      e.preventDefault();
      let nR = rowIdx, nC = colIdx;
      if (e.key === 'ArrowDown') nR++;
      else if (e.key === 'ArrowUp') nR--;
      else if (e.key === 'ArrowRight') {
          const nextIdx = currentIndex + 1;
          if (nextIdx < validCols.length) nC = validCols[nextIdx];
      }
      else if (e.key === 'ArrowLeft') {
          const prevIdx = currentIndex - 1;
          if (prevIdx >= 0) nC = validCols[prevIdx];
      }
      
      const target = document.querySelector(`[data-row="${nR}"][data-col="${nC}"]`) as HTMLElement;
      if (target) {
        target.focus();
        setSelection({ sR: nR, sC: nC, eR: nR, eC: nC });
      }
    }
  };

  const handleImagePaste = (e: React.ClipboardEvent, id: string) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        takeSnapshot();
        const blob = items[i].getAsFile();
        if (blob) {
          const reader = new FileReader();
          reader.onload = (event) => {
            const base64 = event.target?.result as string;
            setVRows(prev => prev.map(r => r.id === id ? { ...r, image: base64 } : r));
          };
          reader.readAsDataURL(blob);
        }
      }
    }
  };

  const handleCellMouseDown = (r: number, c: number) => { setSelection({ sR: r, sC: c, eR: r, eC: c }); setIsDragging(true); };
  const handleCellMouseEnter = (r: number, c: number) => { if (isDragging && selection) setSelection({ ...selection, eR: r, eC: c }); };
  const handleMouseUp = () => setIsDragging(false);
  useEffect(() => { window.addEventListener('mouseup', handleMouseUp); return () => window.removeEventListener('mouseup', handleMouseUp); }, []);

  const handleMerge = useCallback(() => {
    if (!selection) return;
    const { sR, sC, eR, eC } = selection;
    const minR = Math.min(sR, eR), maxR = Math.max(sR, eR), minC = Math.min(sC, eC), maxC = Math.max(sC, eC);
    if (minR === maxR && minC === maxC) return;
    takeSnapshot();
    const newMerges = { ...merges };
    const rS = maxR - minR + 1, cS = maxC - minC + 1;
    for (let r = minR; r <= maxR; r++) { for (let c = minC; c <= maxC; c++) delete newMerges[`${r}-${c}`]; }
    newMerges[`${minR}-${minC}`] = { rS, cS };
    setMerges(newMerges); setSelection(null);
  }, [selection, merges, takeSnapshot]);

  const handleUnmerge = () => {
    if (!selection) return;
    const { sR, sC, eR, eC } = selection;
    const minR = Math.min(sR, eR), maxR = Math.max(sR, eR), minC = Math.min(sC, eC), maxC = Math.max(sC, eC);
    takeSnapshot();
    const newMerges = { ...merges };
    for (let r = minR; r <= maxR; r++) {
      for (let c = minC; c <= maxC; c++) {
        delete newMerges[`${r}-${c}`];
      }
    }
    setMerges(newMerges);
    setSelection(null);
  };

  const handleClearText = () => {
    if (!selection) return;
    takeSnapshot();
    const { sR, sC, eR, eC } = selection;
    const minR = Math.min(sR, eR), maxR = Math.max(sR, eR), minC = Math.min(sC, eC), maxC = Math.max(sC, eC);
    const fields: (keyof VietnamOrderRow)[] = ['itemName', 'image', 'unit', 'qty', 'unitPrice', 'amount', 'remarks'];
    setVRows(prev => {
      const next = [...prev];
      for (let r = minR; r <= maxR; r++) {
        if (!next[r]) continue;
        for (let c = minC; c <= maxC; c++) {
            const field = fields[c - 1]; 
            if (field) next[r] = { ...next[r], [field]: '' };
        }
      }
      return next;
    });
    setSelection(null);
  };

  const handleBorderApply = (target: 'outer' | 'inner', style: string) => {
    if (!selection) return;
    takeSnapshot();
    const { sR, sC, eR, eC } = selection;
    const minR = Math.min(sR, eR), maxR = Math.max(sR, eR), minC = Math.min(sC, eC), maxC = Math.max(sC, eC);
    const newBorders = { ...borders };
    const setB = (r: number, c: number, side: 't'|'b'|'l'|'r', s: string) => {
      const key = `${r}-${c}`; if (!newBorders[key]) newBorders[key] = {};
      newBorders[key] = { ...newBorders[key], [side]: s };
    };
    if (target === 'outer') {
      for (let c = minC; c <= maxC; c++) { setB(minR, c, 't', style); setB(maxR, c, 'b', style); }
      for (let r = minR; r <= maxR; r++) { setB(r, minC, 'l', style); setB(r, maxC, 'r', style); }
    } else {
      for (let r = minR; r < maxR; r++) for (let c = minC; c <= maxC; c++) { setB(r, c, 'b', style); setB(r+1, c, 't', style); }
      for (let c = minC; c < maxC; c++) for (let r = minR; r <= maxR; r++) { setB(r, c, 'r', style); setB(r, c+1, 'l', style); }
    }
    setBorders(newBorders);
  };

  const handleApplyWeight = (w: 'normal'|'bold') => {
    if (!selection) return; takeSnapshot();
    const { sR, sC, eR, eC } = selection;
    const minR = Math.min(sR, eR), maxR = Math.max(sR, eR), minC = Math.min(sC, eC), maxC = Math.max(sC, eC);
    const newWeights = { ...weights };
    for (let r = minR; r <= maxR; r++) for (let c = minC; c <= maxC; c++) newWeights[`${r}-${c}`] = w;
    setWeights(newWeights);
  };

  const handleApplyAlign = (a: 'left'|'center'|'right') => {
    if (!selection) return; takeSnapshot();
    const { sR, sC, eR, eC } = selection;
    const minR = Math.min(sR, eR), maxR = Math.max(sR, eR), minC = Math.min(sC, eC), maxC = Math.max(sC, eC);
    const newAligns = { ...aligns };
    for (let r = minR; r <= maxR; r++) for (let c = minC; c <= maxC; c++) newAligns[`${r}-${c}`] = a;
    setAligns(newAligns);
  };

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const isEditable = sub === VietnamSubCategory.ORDER || sub === VietnamSubCategory.PAYMENT || editingId;
      if (e.key === 'F4' && isEditable && selection) {
        e.preventDefault();
        handleMerge();
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [handleMerge, selection, sub, editingId]);

  const handlePrint = () => {
    const content = document.querySelector('.vietnam-order-print')?.innerHTML;
    if (!content) return;
    const win = window.open('', '_blank');
    if (win) {
      win.document.write(`
        <html><head><title>VN_${activeItem?.type || 'DOC'}_${vDate}</title><script src="https://cdn.tailwindcss.com"></script>
        <style>
          @page { size: A4 portrait; margin: 0; }
          body { font-family: 'Inter', sans-serif; background: white; width: 210mm; margin: 0; padding: 0; }
          .font-gulim { font-family: 'Gulim', 'Dotum', sans-serif; }
          * { color: black !important; border-color: black !important; print-color-adjust: exact; font-weight: 700 !important; }
          .no-print { display: none !important; }
          table { border-collapse: collapse; width: 100%; table-layout: fixed; }
          th, td { border: 1px solid black; padding: 2px 4px; vertical-align: middle; word-break: break-all; overflow: hidden; }
          .document-wrapper { padding: 10mm; box-sizing: border-box; }
          .info-row { border-bottom: none !important; }
        </style>
        </head><body onload="window.print();">
          <div class="document-wrapper">${content}</div>
        </body></html>
      `);
      win.document.close();
    }
  };

  const handleSubmit = (isTemp: boolean = false) => {
    if (!vClientName.trim()) { alert('수신처(Khách hàng)를 입력해 주세요.'); return; }
    
    // 임시 저장 또는 수정 시 기존 타입 유지, 신규 작성 시 현재 sub에 따라 결정
    let docType: 'ORDER' | 'PAYMENT' = 'ORDER';
    if (editingId) {
        const original = items.find(it => it.id === editingId);
        if (original) docType = original.type;
    } else {
        docType = sub === VietnamSubCategory.PAYMENT ? 'PAYMENT' : 'ORDER';
    }

    const targetStatus = isTemp ? VietnamSubCategory.TEMPORARY : VietnamSubCategory.PENDING;

    if (editingId) {
        const updated = items.map(it => it.id === editingId ? {
            ...it, title: vTitle, date: vDate, clientName: vClientName, clientAddress: vClientAddress, taxId: vTaxId, deliveryAddress: vDeliveryAddress,
            beneficiary: vBeneficiary, accountNo: vAccountNo, bank: vBank, bankAddr: vBankAddr, vatRate: vVatRate, remark: vRemark,
            rows: vRows.filter(r => r.itemName.trim() || r.image), status: targetStatus,
            rejectReason: isTemp ? it.rejectReason : undefined, 
            rejectLog: isTemp ? it.rejectLog : undefined, 
            merges, aligns, weights, borders,
            stamps: isTemp ? it.stamps : { writer: { userId: currentUser.initials, timestamp: new Date().toLocaleString() } }
        } : it);
        saveVietnamItems(updated);
        alert(isTemp ? '임시저장되었습니다.' : '수정 완료되어 결재 대기로 재전송되었습니다.');
        setEditingId(null);
    } else {
        const newItem: VietnamOrderItem = {
            id: `VN${docType === 'PAYMENT' ? 'PAY' : 'PO'}-${Date.now()}`, title: vTitle, type: docType, date: vDate, clientName: vClientName, clientAddress: vClientAddress, taxId: vTaxId, deliveryAddress: vDeliveryAddress,
            beneficiary: vBeneficiary, accountNo: vAccountNo, bank: vBank, bankAddr: vBankAddr, vatRate: vVatRate, remark: vRemark,
            rows: vRows.filter(r => r.itemName.trim() || r.image), status: targetStatus, authorId: currentUser.initials, createdAt: new Date().toISOString(),
            merges, aligns, weights, borders,
            stamps: isTemp ? {} : { writer: { userId: currentUser.initials, timestamp: new Date().toLocaleString() } }
        };
        const updated = [newItem, ...items];
        saveVietnamItems(updated);
        alert(isTemp ? '임시저장되었습니다.' : '작성 결재가 완료되어 결재 대기로 전송되었습니다.');
    }
    setView({ type: 'VIETNAM', sub: targetStatus });
  };

  const saveVietnamItems = (updated: VietnamOrderItem[]) => {
    setItems(updated);
    localStorage.setItem('ajin_vietnam_orders', JSON.stringify(updated));
    pushStateToCloud();
  };

  const handleStampAction = (item: VietnamOrderItem, type: 'head' | 'ceo') => {
    const userInit = currentUser.initials.toLowerCase().trim();
    const isMaster = currentUser.loginId === 'AJ5200';
    
    if (type === 'head' && !isMaster && userInit !== 'u-sun') { alert('법인장 결재 권한이 없습니다. (U-SUN 전용)'); return; }
    if (type === 'ceo' && !isMaster && userInit !== 'k-yeun') { alert('대표 결재 권한이 없습니다. (K-YEUN 전용)'); return; }

    const updatedStamps = { ...item.stamps, [type]: { userId: currentUser.initials, timestamp: new Date().toLocaleString() } };
    
    const isPay = item.type === 'PAYMENT';
    const isFullApproved = isPay ? (updatedStamps.head && updatedStamps.ceo) : !!updatedStamps.head;

    const updated = items.map(it => it.id === item.id ? { 
        ...it, stamps: updatedStamps, status: isFullApproved ? VietnamSubCategory.COMPLETED_ROOT : it.status 
    } : it);
    saveVietnamItems(updated);
    alert(`${type === 'head' ? '법인장' : '대표'} 결재가 완료되었습니다.`);
    
    const currentActive = updated.find(it => it.id === item.id);
    if (currentActive) setActiveItem(currentActive);
    if (isFullApproved) setActiveItem(null);
  };

  const handleRejectAction = () => {
    if (!rejectingItem || !rejectReasonText.trim()) { alert('반송 사유를 입력해 주세요.'); return; }
    const updated = items.map(it => it.id === rejectingItem.id ? {
        ...it, status: VietnamSubCategory.REJECTED, rejectReason: rejectReasonText,
        rejectLog: { userId: currentUser.initials, timestamp: new Date().toLocaleString() }
    } : it);
    saveVietnamItems(updated);
    alert('문서가 반송 처리되었습니다.');
    setRejectingItem(null);
    setRejectReasonText('');
    setActiveItem(null);
  };
// --- [승인 함수] ---
const handleApprove = async (id: string) => {
  try {
    const { error } = await supabase.from('vietnam_orders').update({ status: 'approved' }).eq('id', id);
    if (error) throw error;

    // ✅ 승인 알림 전송
    await fetch('/api/jandi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mainCategory: "VIETNAM",
        subCategory: "APPROVE",
        status: "request", // 다음 결재자에게 알림
        // ... 생략
      })
    });

    await fetchOrders();
    toast.success('승인되었습니다.');
  } catch (error) { 승인실패 }
};

// --- [반려 함수] ---
const handleReject = async (id: string) => {
  try {
    const { error } = await supabase.from('vietnam_orders').update({ status: 'rejected' }).eq('id', id);
    if (error) throw error;

    // ✅ 반려 알림 전송
    await fetch('/api/jandi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mainCategory: "VIETNAM",
        subCategory: "REJECT",
        status: "complete", // 반려로 종결됨을 알림
        // ... 생략
      })
    });

    await fetchOrders();
    toast.error('반송되었습니다.');
  } catch (error) { 반송실패 }
};
  const handleDeleteDocument = (id: string) => {
    const updated = items.filter(it => it.id !== id);
    saveVietnamItems(updated);
    setDeletingId(null);
    alert('삭제되었습니다.');
  };

  const handleFinalVerify = (item: VietnamOrderItem) => {
    const updatedStamps = { ...item.stamps, final: { userId: currentUser.initials, timestamp: new Date().toLocaleString() } };
    const nextStatus = item.type === 'PAYMENT' ? VietnamSubCategory.PAYMENT_COMPLETED : VietnamSubCategory.ORDER_COMPLETED;
    const updated = items.map(it => it.id === item.id ? {
        ...it, stamps: updatedStamps, status: nextStatus
    } : it);
    saveVietnamItems(updated);
    alert('확인 처리가 완료되어 보관함으로 이동되었습니다.');
    setActiveItem(null);
  };

  const handleEditItem = (item: VietnamOrderItem) => {
    setEditingId(item.id);
    setVTitle(item.title);
    setVDate(item.date);
    setVClientName(item.clientName);
    setVClientAddress(item.clientAddress);
    setVTaxId(item.taxId);
    setVDeliveryAddress(item.deliveryAddress);
    setVBeneficiary(item.beneficiary || '');
    setVAccountNo(item.accountNo || '');
    setVBank(item.bank || '');
    setVBankAddr(item.bankAddr || '');
    setVVatRate(item.vatRate || 10);
    setVRemark(item.remark || '');
    setVRows(item.rows.length >= (item.type === 'PAYMENT' ? 3 : 5) ? item.rows : [...item.rows, ...Array((item.type === 'PAYMENT' ? 3 : 5) - item.rows.length).fill(null).map(createEmptyRow)]);
    setMerges(item.merges || {});
    setAligns(item.aligns || {});
    setWeights(item.weights || {});
    setBorders(item.borders || {});
    setUndoStack([]);
    setActiveItem(null);
  };

  // VN작성(CREATE_ROOT) 메인 화면
  if (sub === VietnamSubCategory.CREATE_ROOT) {
    const vnTypes = [
      { id: VietnamSubCategory.ORDER, label: 'VN주문서', desc: '베트남용 물품 주문서 작성', icon: '01' },
      { id: VietnamSubCategory.PAYMENT, label: 'VN지불요청서', desc: '베트남용 지불 요청서 작성', icon: '02' },
      { id: VietnamSubCategory.TEMPORARY, label: 'VN임시저장', desc: '작성 중인 문서 보관함', icon: '03' }
    ];

    return (
      <div className="space-y-8 py-12 animate-in fade-in zoom-in duration-500">
        <div className="text-center max-w-2xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-black text-black mb-3 tracking-tight">VN작성 하위 목록</h2>
          <p className="text-slate-500 font-medium text-lg px-4">작성하고자 하는 서식을 선택하십시오.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto px-4 mt-12">
          {vnTypes.map((type) => (
            <button 
              key={type.id} 
              onClick={() => setView({ type: 'VIETNAM', sub: type.id })}
              className="group bg-white p-10 rounded-[2.5rem] border-2 border-slate-100 hover:shadow-2xl transition-all duration-300 flex flex-col items-center text-center relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                <span className="text-8xl font-black text-black select-none">{type.icon}</span>
              </div>
              <div className={`w-20 h-20 ${type.id === VietnamSubCategory.TEMPORARY ? 'bg-amber-50 text-amber-600 group-hover:bg-amber-600' : (type.id === VietnamSubCategory.PAYMENT ? 'bg-rose-50 text-rose-600 group-hover:bg-rose-600' : 'bg-indigo-50 text-indigo-600 group-hover:bg-indigo-600')} rounded-3xl flex items-center justify-center mb-6 transition-all shadow-inner group-hover:text-white`}>
                <span className="text-2xl font-black">VN</span>
              </div>
              <h3 className={`text-2xl font-black text-black transition-colors mb-2 ${type.id === VietnamSubCategory.TEMPORARY ? 'group-hover:text-amber-600' : (type.id === VietnamSubCategory.PAYMENT ? 'group-hover:text-rose-600' : 'group-hover:text-indigo-600')}`}>{type.label}</h3>
              <p className="text-slate-400 text-sm font-medium mb-6">{type.desc}</p>
              <div className="mt-auto inline-flex items-center gap-2 px-6 py-2.5 bg-slate-50 text-slate-500 group-hover:bg-slate-900 group-hover:text-white rounded-full text-xs font-black uppercase tracking-widest transition-all">
                {type.id === VietnamSubCategory.TEMPORARY ? '보관함 열기' : '작성 시작'}
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // 문서 상세 뷰 렌더러
  const renderDocument = (data: VietnamOrderItem, isReadOnly: boolean = true) => {
    const isPayDoc = data.type === 'PAYMENT';
    const dRows = isReadOnly ? data.rows : vRows;
    const dTitle = isReadOnly ? data.title : vTitle;
    const dDate = isReadOnly ? data.date : vDate;
    const dClient = isReadOnly ? data.clientName : vClientName;
    const dAddress = isReadOnly ? data.clientAddress : vClientAddress;
    const dTaxId = isReadOnly ? data.taxId : vTaxId;
    const dDelivery = isReadOnly ? data.deliveryAddress : vDeliveryAddress;
    
    // 지불요청서 전용
    const dBeneficiary = isReadOnly ? data.beneficiary : vBeneficiary;
    const dAccountNo = isReadOnly ? data.accountNo : vAccountNo;
    const dBank = isReadOnly ? data.bank : vBank;
    const dBankAddr = isReadOnly ? data.bankAddr : vBankAddr;
    const dVatRate = isReadOnly ? (data.vatRate || 0) : vVatRate;
    const dRemark = isReadOnly ? data.remark : vRemark;

    const dMerges = isReadOnly ? (data.merges || {}) : merges;
    const dAligns = isReadOnly ? (data.aligns || {}) : aligns;
    const dBorders = isReadOnly ? (data.borders || {}) : borders;
    const dWeights = isReadOnly ? (data.weights || {}) : weights;

    const { subtotal, vat, total } = getTotal(dRows, dVatRate);

    return (
      <div className="bg-white border border-slate-300 shadow-2xl mx-auto p-4 md:p-12 min-h-[297mm] w-full max-w-[210mm] text-black font-gulim relative vietnam-order-print text-left overflow-x-auto font-bold flex flex-col items-center">
        <div className="w-full font-bold">
          <div className="flex justify-between items-start mb-2 font-bold w-full">
            <div className="flex flex-col flex-1 mt-0">
              <h2 className="text-xl font-black tracking-tight uppercase m-0 leading-tight">CÔNG TY TNHH AJIN TRAIN VINA</h2>
              <div className="mt-8">
                {isReadOnly ? (
                    <h1 className="text-2xl font-black uppercase underline decoration-2 underline-offset-4">{dTitle}</h1>
                ) : (
                    <input value={vTitle} onChange={e => setVTitle(e.target.value)} className="text-2xl font-black outline-none hover:bg-slate-50 focus:bg-slate-50 transition-all uppercase w-full max-w-lg" />
                )}
              </div>
            </div>
            
            <table className="border-collapse border border-black text-center text-[10px] w-auto shrink-0">
                <tbody className="font-bold">
                    <tr className="bg-slate-50 font-black text-[11px]">
                        <td className="border border-black w-20 py-1">
                          <div className="flex flex-col items-center leading-tight">
                            <span>Người lập</span>
                            <span className="text-[9px] font-bold opacity-80">(작성)</span>
                          </div>
                        </td>
                        <td className="border border-black w-20 py-1">
                          <div className="flex flex-col items-center leading-tight">
                            <span>Phê duyệt</span>
                            <span className="text-[9px] font-bold opacity-80">(법인장)</span>
                          </div>
                        </td>
                        {isPayDoc && <td className="border border-black w-20 py-1">
                          <div className="flex flex-col items-center leading-tight">
                            <span>Giám đốc</span>
                            <span className="text-[9px] font-bold opacity-80">(대표)</span>
                          </div>
                        </td>}
                    </tr>
                    <tr className="h-20">
                        <td className="border border-black p-1 align-middle">
                          {data.stamps.writer && (
                            <div className="flex flex-col items-center">
                              <span className="font-black text-blue-700 text-xs">{data.stamps.writer.userId}</span>
                              <span className="text-[8px] opacity-60 mt-1">{data.stamps.writer.timestamp}</span>
                            </div>
                          )}
                        </td>
                        <td className={`border border-black p-1 align-middle ${!isReadOnly ? '' : (sub === VietnamSubCategory.PENDING && !data.stamps.head ? 'cursor-pointer hover:bg-amber-50' : '')}`} onClick={() => isReadOnly && sub === VietnamSubCategory.PENDING && handleStampAction(data, 'head')}>
                          {data.stamps.head ? (
                            <div className="flex flex-col items-center">
                                <span className="font-black text-green-700 text-xs">{data.stamps.head.userId}</span>
                                <span className="text-[8px] opacity-60 mt-1">{data.stamps.head.timestamp}</span>
                            </div>
                          ) : (isReadOnly && sub === VietnamSubCategory.PENDING ? <span className="text-[10px] text-slate-300">승인</span> : null)}
                        </td>
                        {isPayDoc && (
                          <td className={`border border-black p-1 align-middle ${!isReadOnly ? '' : (sub === VietnamSubCategory.PENDING && data.stamps.head && !data.stamps.ceo ? 'cursor-pointer hover:bg-amber-50' : '')}`} onClick={() => isReadOnly && sub === VietnamSubCategory.PENDING && data.stamps.head && handleStampAction(data, 'ceo')}>
                            {data.stamps.ceo ? (
                              <div className="flex flex-col items-center">
                                  <span className="font-black text-red-700 text-xs">{data.stamps.ceo.userId}</span>
                                  <span className="text-[8px] opacity-60 mt-1">{data.stamps.ceo.timestamp}</span>
                              </div>
                            ) : (isReadOnly && sub === VietnamSubCategory.PENDING && data.stamps.head ? <span className="text-[10px] text-slate-300">승인</span> : null)}
                          </td>
                        )}
                    </tr>
                </tbody>
            </table>
          </div>

          <div className="space-y-0.5 mb-6 text-[12px] font-bold w-full">
            <div className="flex items-center py-0.5 border-b border-slate-100 info-row">
                <span className="w-52 font-black">Ngày (날짜):</span>
                {isReadOnly ? <span>{dDate}</span> : <input type="text" value={vDate} onChange={e => setVDate(e.target.value)} className="flex-1 outline-none font-black bg-slate-50/20 px-2"/>}
            </div>
            <div className="flex items-center py-0.5 border-b border-slate-100 info-row">
                <span className="w-52 font-black">Khách hàng/Tên (수신):</span>
                {isReadOnly ? <span>{dClient}</span> : <input value={vClientName} onChange={e => setVClientName(e.target.value)} className="flex-1 outline-none font-black bg-slate-50/20 px-2" placeholder="수신처 상호명"/>}
            </div>
            <div className="flex items-center py-0.5 border-b border-slate-100 info-row">
                <span className="w-52 font-black">Địa chỉ (수신 주소):</span>
                {isReadOnly ? <span>{dAddress}</span> : <input value={vClientAddress} onChange={e => setVClientAddress(e.target.value)} className="flex-1 outline-none font-bold bg-slate-50/20 px-2" placeholder="수신처 주소"/>}
            </div>
            <div className="flex items-center py-0.5 border-b border-slate-100 info-row">
                <span className="w-52 font-black">Mã số thuế (사업자번호):</span>
                {isReadOnly ? <span className="font-mono">{dTaxId}</span> : <input value={vTaxId} onChange={e => setVTaxId(e.target.value)} className="flex-1 outline-none font-mono font-black bg-slate-50/20 px-2" placeholder="Tax ID"/>}
            </div>
            <div className="flex items-start py-0.5">
                <span className="w-52 font-black shrink-0">Địa chỉ nhận hàng (배송지):</span>
                {isReadOnly ? <span className="flex-1 whitespace-pre-wrap">{dDelivery}</span> : <AutoExpandingTextarea value={vDeliveryAddress} onChange={(e: any) => setVDeliveryAddress(e.target.value)} className="flex-1 outline-none font-bold bg-slate-50/20 px-2 py-0 min-h-0" placeholder="배송 주소"/>}
            </div>
          </div>

          <div className="w-full flex justify-center">
            <table className="w-full border-collapse border border-black text-[12px] font-bold table-fixed">
                <thead className="bg-slate-100 font-black text-center">
                    <tr>
                        <th className={`border border-black w-10 ${isPayDoc ? 'py-1' : 'py-2'}`}>STT</th>
                        <th className="border border-black flex-1 min-w-[120px]">
                          <div className="flex flex-col items-center leading-tight py-0.5">
                            <span>TÊN VẬT TƯ</span>
                            <span className="text-[10px] font-bold opacity-80">(구매품목)</span>
                          </div>
                        </th>
                        {!isPayDoc && <th className="border border-black w-32">
                          <div className="flex flex-col items-center leading-tight py-0.5">
                            <span>HÌNH ẢNH</span>
                            <span className="text-[10px] font-bold opacity-80">(사진)</span>
                          </div>
                        </th>}
                        <th className="border border-black w-14">
                          <div className="flex flex-col items-center leading-tight py-0.5">
                            <span>ĐVT</span>
                            <span className="text-[10px] font-bold opacity-80">(단위)</span>
                          </div>
                        </th>
                        <th className="border border-black w-14">
                          <div className="flex flex-col items-center leading-tight py-0.5 text-[10px]">
                            <span>SỐ LƯỢNG</span>
                            <span className="text-[9px] font-bold opacity-80">(수량)</span>
                          </div>
                        </th>
                        <th className="border border-black w-24">
                          <div className="flex flex-col items-center leading-tight py-0.5">
                            <span>Đơn giá</span>
                            <span className="text-[10px] font-bold opacity-80">(단가)</span>
                          </div>
                        </th>
                        <th className="border border-black w-24">
                          <div className="flex flex-col items-center leading-tight py-0.5">
                            <span>Thành tiền</span>
                            <span className="text-[10px] font-bold opacity-80">(금액)</span>
                          </div>
                        </th>
                        <th className="border border-black w-24">
                          <div className="flex flex-col items-center leading-tight py-0.5">
                            <span>Ghi chú</span>
                            <span className="text-[10px] font-bold opacity-80">(비고)</span>
                          </div>
                        </th>
                        {!isReadOnly && <th className="border border-black w-14 no-print">Manage</th>}
                    </tr>
                </thead>
                <tbody>
                    {dRows.map((row, rIdx) => (
                        <tr key={row.id}>
                            <td className="border border-black text-center font-black">{rIdx + 1}</td>
                            {[
                                { f: 'itemName', c: 1 }, 
                                ...(isPayDoc ? [] : [{ f: 'image', c: 2 }]), 
                                { f: 'unit', c: 3 }, { f: 'qty', c: 4 }, { f: 'unitPrice', c: 5 }, { f: 'amount', c: 6 }, { f: 'remarks', c: 7 }
                            ].map(cell => {
                                const merge = dMerges[`${rIdx}-${cell.c}`];
                                const isSkipped = Object.entries(dMerges).some(([key, m]: [string, any]) => {
                                    const [mr, mc] = key.split('-').map(Number);
                                    // Fix: Change undefined 'idx' to 'rIdx' to correctly handle row index comparison in merged cell logic
                                    return rIdx >= mr && rIdx < mr + m.rS && cell.c >= mc && cell.c < mc + m.cS && !(rIdx === mr && cell.c === mc);
                                });
                                if (isSkipped) return null;

                                const isSelected = selection && rIdx >= Math.min(selection.sR, selection.eR) && rIdx <= Math.max(selection.sR, selection.eR) && cell.c >= Math.min(selection.sC, selection.eC) && cell.c <= Math.max(selection.sC, selection.eC);
                                const align = dAligns[`${rIdx}-${cell.c}`] || (cell.f === 'itemName' ? 'left' : 'center');
                                const weight = dWeights[`${rIdx}-${cell.c}`] || 'bold';
                                const borderS = getCellBorderStyle(rIdx, cell.c, dBorders);

                                return (
                                    <td 
                                        key={cell.c} rowSpan={merge?.rS || 1} colSpan={merge?.cS || 1}
                                        onMouseDown={() => !isReadOnly && handleCellMouseDown(rIdx, cell.c)}
                                        onMouseEnter={() => !isReadOnly && handleCellMouseEnter(rIdx, cell.c)}
                                        style={{ ...borderS }}
                                        className={`border border-black p-0 relative ${isSelected ? 'bg-blue-50 ring-1 ring-blue-300 z-10' : ''}`}
                                    >
                                        {cell.f === 'image' ? (
                                            <div 
                                                className={`w-full ${isPayDoc ? 'min-h-[30px]' : 'min-h-[80px]'} flex items-center justify-center p-1 bg-slate-50/30 relative`}
                                                onPaste={(e) => !isReadOnly && handleImagePaste(e, row.id)}
                                                tabIndex={isReadOnly ? -1 : 0}
                                                data-row={rIdx} data-col={cell.c}
                                                onFocus={() => !isReadOnly && setSelection({ sR: rIdx, sC: cell.c, eR: rIdx, eC: cell.c })}
                                            >
                                                {row.image ? (
                                                    <img src={row.image} alt="product" className={`max-w-full ${isPayDoc ? 'max-h-[50px]' : 'max-h-[120px]'} object-contain`}/>
                                                ) : (
                                                    !isReadOnly && <span className="text-[8px] opacity-20">PASTE IMAGE</span>
                                                )}
                                            </div>
                                        ) : (
                                            isReadOnly ? (
                                                <div className={`p-0.5 w-full font-bold ${isPayDoc ? 'text-[11px]' : ''}`} style={{ textAlign: align as any }}>
                                                    {cell.f === 'amount' ? calculateAmount(row) : row[cell.f as keyof VietnamOrderRow]}
                                                </div>
                                            ) : (
                                                cell.f === 'amount' ? (
                                                    <div 
                                                        className={`w-full text-right px-1 font-mono font-black py-0.5 ${isPayDoc ? 'text-[11px]' : ''}`}
                                                        data-row={rIdx} data-col={cell.c} tabIndex={0}
                                                        onFocus={() => setSelection({ sR: rIdx, sC: cell.c, eR: rIdx, eC: cell.c })}
                                                    >
                                                        {calculateAmount(row)}
                                                    </div>
                                                ) : (
                                                    <AutoExpandingTextarea 
                                                        value={row[cell.f as keyof VietnamOrderRow]} dataRow={rIdx} dataCol={cell.c}
                                                        onChange={(e: any) => updateRowField(row.id, cell.f as keyof VietnamOrderRow, e.target.value)} 
                                                        onFocus={() => { takeSnapshot(); setSelection({ sR: rIdx, sC: cell.c, eR: rIdx, eC: cell.c }); }}
                                                        onKeyDown={(e: any) => handleRowKeyDown(e, rIdx, cell.c, isPayDoc ? 'PAYMENT' : 'ORDER')}
                                                        onPaste={(e: any) => handleImagePaste(e, row.id)}
                                                        style={{ textAlign: align, fontWeight: 'bold' }}
                                                        className={`${cell.f === 'qty' || cell.f === 'unitPrice' ? 'font-mono' : ''} ${isPayDoc ? 'p-0 text-[11px]' : 'p-1'}`}
                                                    />
                                                )
                                            )
                                        )}
                                    </td>
                                );
                            })}
                            {!isReadOnly && (
                                <td className="border border-black p-1 text-center no-print align-middle">
                                    <div className="flex items-center justify-center gap-1">
                                      <button onClick={() => handleInsertRow(rIdx)} className="w-5 h-5 flex items-center justify-center bg-blue-50 text-blue-600 rounded-full hover:bg-blue-600 hover:text-white transition-all text-sm font-bold">+</button>
                                      <button onClick={() => handleDeleteRow(rIdx)} className="w-5 h-5 flex items-center justify-center bg-red-50 text-red-600 rounded-full hover:bg-red-600 hover:text-white transition-all text-sm font-bold">-</button>
                                    </div>
                                </td>
                            )}
                        </tr>
                    ))}
                    
                    <tr className={`bg-slate-50 font-black ${isPayDoc ? 'h-5' : ''}`}>
                        <td colSpan={isPayDoc ? 5 : 6} className={`border border-black p-1 text-center ${isPayDoc ? 'text-xs' : 'text-sm'} tracking-wider uppercase font-black`}>Cộng (합계 금액)부가세 제외</td>
                        <td colSpan={2} className={`border border-black p-1 text-right font-mono ${isPayDoc ? 'text-sm' : 'text-base'} font-black`}>{subtotal.toLocaleString()}</td>
                        {!isReadOnly && <td className="border border-black no-print"></td>}
                    </tr>
                    {isPayDoc && (
                      <>
                        <tr className="bg-slate-50 font-black h-5">
                            <td colSpan={5} className="border border-black p-1 text-center text-xs tracking-wider uppercase font-black">
                                <div className="flex items-center justify-center gap-2">
                                    <span>Thuế</span>
                                    {isReadOnly ? <span>{dVatRate}</span> : <input type="number" value={vVatRate} onChange={e => setVVatRate(parseInt(e.target.value) || 0)} className="w-12 px-1 border rounded text-center"/>}
                                    <span>% 부가세</span>
                                </div>
                            </td>
                            <td colSpan={2} className="border border-black p-1 text-right font-mono text-sm font-black">{vat.toLocaleString()}</td>
                            {!isReadOnly && <td className="border border-black no-print"></td>}
                        </tr>
                        <tr className="bg-slate-100 font-black h-5">
                            <td colSpan={5} className="border border-black p-1 text-center text-xs tracking-wider uppercase font-black">Tổng (총금액)</td>
                            <td colSpan={2} className="border border-black p-1 text-right font-mono text-sm font-black">{total.toLocaleString()}</td>
                            {!isReadOnly && <td className="border border-black no-print"></td>}
                        </tr>
                      </>
                    )}
                </tbody>
            </table>
          </div>

          {isPayDoc && (
            <>
              <div className="mt-6 w-full border-2 border-slate-300 p-4 rounded-xl text-[12px] space-y-1">
                  <div className="flex items-center">
                      <span className="w-48 font-black">Người thụ hưởng (수익자):</span>
                      {isReadOnly ? <span className="flex-1 font-black text-blue-800">{dBeneficiary}</span> : <input value={vBeneficiary} onChange={e => setVBeneficiary(e.target.value)} className="flex-1 outline-none font-black bg-slate-50/50 px-2 border-b border-dotted" placeholder="수익자 성명/업체명"/>}
                  </div>
                  <div className="flex items-center">
                      <span className="w-48 font-black">Số tài khoản (계좌번호):</span>
                      {isReadOnly ? <span className="flex-1 font-mono text-blue-800">{dAccountNo}</span> : <input value={vAccountNo} onChange={e => setVAccountNo(e.target.value)} className="flex-1 outline-none font-mono font-black bg-slate-50/50 px-2 border-b border-dotted text-blue-800" placeholder="은행 계좌번호"/>}
                  </div>
                  <div className="flex items-center">
                      <span className="w-48 font-black">Ngân hàng (은행):</span>
                      {isReadOnly ? <span className="flex-1 font-black">{dBank}</span> : <input value={vBank} onChange={e => setVBank(e.target.value)} className="flex-1 outline-none font-black bg-slate-50/50 px-2 border-b border-dotted" placeholder="은행명 (예: VCB, VietinBank)"/>}
                  </div>
                  <div className="flex items-center">
                      <span className="w-48 font-black">Địa chỉ ngân hàng (은행주소):</span>
                      {isReadOnly ? <span className="flex-1">{dBankAddr}</span> : <input value={vBankAddr} onChange={e => setVBankAddr(e.target.value)} className="flex-1 outline-none font-black bg-slate-50/50 px-2 border-b border-dotted" placeholder="지점명 또는 주소"/>}
                  </div>
              </div>

              <div className="mt-4 w-full text-left">
                  <div className="text-[12px] font-black mb-1 px-1">REMARK (메모):</div>
                  {isReadOnly ? (
                    <div className="w-full min-h-[60px] p-3 bg-slate-50 border border-slate-200 rounded-xl text-[12px] font-bold whitespace-pre-wrap">
                        {dRemark || "내역 없음"}
                    </div>
                  ) : (
                    <textarea 
                        value={vRemark} 
                        onChange={e => setVRemark(e.target.value)} 
                        placeholder="지불 관련 특이사항을 입력하십시오..." 
                        className="w-full min-h-[80px] p-3 bg-white border border-slate-300 rounded-xl text-[12px] font-bold outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  )}
              </div>
            </>
          )}

          {!isReadOnly && (
              <div className="mt-8 flex justify-center gap-4 no-print pb-8">
                  <button onClick={() => handleSubmit(true)} className="px-10 py-4 bg-slate-400 text-white rounded-2xl font-black text-xl shadow-xl hover:bg-slate-500 active:scale-95 transition-all">임시 저장</button>
                  <button onClick={() => handleSubmit(false)} className="px-16 py-4 bg-indigo-600 text-white rounded-2xl font-black text-xl shadow-xl hover:bg-indigo-700 active:scale-95 transition-all">VN {isPayDoc ? '지불요청' : '주문서'} 작성완료</button>
              </div>
          )}

          {isReadOnly && data.stamps.final && (
            <div className="mt-12 pt-4 border-t border-slate-100 flex justify-end gap-6 text-[10px] font-bold text-slate-400 no-print">
                <span>확인: {data.stamps.final.userId}</span>
                <span>확인일시: {data.stamps.final.timestamp}</span>
            </div>
          )}

          <div className="mt-12 flex justify-end px-4 text-[11px] font-black tracking-widest uppercase italic opacity-60 w-full">
            AJIN TRAIN VINA
          </div>
        </div>
      </div>
    );
  };

  if (sub === VietnamSubCategory.ORDER || sub === VietnamSubCategory.PAYMENT || editingId) {
    let docType: 'ORDER' | 'PAYMENT' = 'ORDER';
    if (editingId) {
        docType = items.find(it => it.id === editingId)?.type || 'ORDER';
    } else {
        docType = sub === VietnamSubCategory.PAYMENT ? 'PAYMENT' : 'ORDER';
    }

    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center max-w-[210mm] mx-auto no-print px-4">
          <div className="flex gap-2 items-center">
            {editingId && (
                <button onClick={() => { 
                    setEditingId(null); 
                    setVRows([]); 
                    setVTitle(''); 
                    setMerges({}); 
                    setAligns({}); 
                    setBorders({}); 
                    setUndoStack([]); 
                    const prevStatus = items.find(it => it.id === editingId)?.status || VietnamSubCategory.ORDER;
                    setView({ type: 'VIETNAM', sub: prevStatus }); 
                }} className="px-5 py-2.5 bg-white border rounded-xl font-bold text-sm shadow-sm">← 목록으로</button>
            )}
            <button onClick={handleUndo} disabled={undoStack.length === 0} className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-black text-xs shadow-xl transition-all ${undoStack.length > 0 ? 'bg-slate-700 text-white hover:bg-black' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}>Undo ({undoStack.length})</button>
            {editingId && (
              <span className={`px-3 py-1 rounded-full text-[10px] font-black animate-pulse border uppercase ${items.find(it => it.id === editingId)?.status === VietnamSubCategory.TEMPORARY ? 'bg-amber-50 text-amber-600 border-amber-200' : 'bg-red-50 text-red-600 border-red-200'}`}>
                {items.find(it => it.id === editingId)?.status === VietnamSubCategory.TEMPORARY ? '임시저장 수정 중' : '반송 건 수정 중'}
              </span>
            )}
          </div>
          <button onClick={handlePrint} className="px-6 py-2 bg-blue-600 text-white rounded-xl font-black text-xs shadow-lg hover:bg-blue-700">PDF 저장 / 인쇄</button>
        </div>

        {selection && (
          <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[100] no-print bg-white/90 backdrop-blur shadow-2xl border border-slate-200 p-3 rounded-2xl flex items-center gap-3 animate-in slide-in-from-bottom-5">
            <button onClick={handleMerge} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-bold shadow-sm transition-all whitespace-nowrap">셀 병합</button>
            <button onClick={handleUnmerge} className="px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-xs font-bold shadow-sm transition-all whitespace-nowrap">병합 해제</button>
            <div className="flex bg-slate-100 p-1 rounded-lg">
                <button onClick={() => handleApplyAlign('left')} className="p-1.5 hover:bg-white rounded transition-all"><svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor"><path d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 5a1 1 0 011-1h6a1 1 0 110 2H4a1 1 0 01-1-1zm0 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z"/></svg></button>
                <button onClick={() => handleApplyAlign('center')} className="p-1.5 hover:bg-white rounded transition-all"><svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor"><path d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 5a1 1 0 011-1h6a1 1 0 110 2H4a1 1 0 01-1-1zm0 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z"/></svg></button>
            </div>
            <div className="flex bg-slate-100 p-1 rounded-lg gap-1">
                <select value={activeBorderStyle} onChange={(e) => setActiveBorderStyle(e.target.value)} className="text-[10px] font-bold border rounded px-1"><option value="solid">실선</option><option value="dotted">점선</option><option value="none">없음</option></select>
                <button onClick={() => handleBorderApply('outer', activeBorderStyle)} className="px-2 py-1 bg-white border rounded text-[10px] font-bold">외측</button>
                <button onClick={() => handleBorderApply('inner', activeBorderStyle)} className="px-2 py-1 bg-white border rounded text-[10px] font-bold">내측</button>
            </div>
            <button onClick={handleClearText} className="px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-xs font-bold hover:bg-red-600 hover:text-white transition-all">글자 삭제</button>
            <button onClick={() => setSelection(null)} className="p-1 text-slate-400 hover:text-black ml-2"><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12"/></svg></button>
          </div>
        )}

        <div className="py-8 bg-slate-200 min-h-screen overflow-x-auto">
          {renderDocument({ id: 'preview', type: docType, stamps: { writer: { userId: currentUser.initials, timestamp: new Date().toLocaleString() } } } as any, false)}
        </div>
      </div>
    );
  }

  // 목록 뷰 필터링 및 정렬
  const filtered = items
    .filter(it => it.status === sub)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .filter(it => it.clientName.toLowerCase().includes(searchTerm.toLowerCase()) || it.title.toLowerCase().includes(searchTerm.toLowerCase()));

  const totalPages = Math.ceil(filtered.length / itemsPerPage);
  const paginatedItems = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  
  return (
    <div className="space-y-6 text-left pb-12">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
                <h2 className="text-3xl font-black text-slate-900">{sub}</h2>
                <div className="flex items-center gap-4 mt-2">
                    <p className="text-slate-500 text-sm">총 {filtered.length}건</p>
                    <div className="h-4 w-[1px] bg-slate-300"></div>
                    <div className="flex bg-slate-200 p-1 rounded-lg no-print">
                        <button onClick={() => setViewMode('ICON')} className={`px-3 py-1 rounded-md text-[10px] font-bold transition-all ${viewMode === 'ICON' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>아이콘</button>
                        <button onClick={() => setViewMode('LIST')} className={`px-3 py-1 rounded-md text-[10px] font-bold transition-all ${viewMode === 'LIST' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>리스트</button>
                    </div>
                </div>
            </div>
            <div className="relative w-full md:max-w-sm">
                <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="제목 또는 수신처 검색..." className="w-full px-4 py-2.5 rounded-2xl border focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-medium bg-white shadow-sm"/>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
            </div>
        </div>

        {viewMode === 'ICON' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                {paginatedItems.length === 0 ? (<div className="col-span-full py-24 text-center text-slate-400 bg-white rounded-3xl border-4 border-dashed border-slate-100 text-lg font-medium italic">데이터가 없습니다.</div>) : (
                    paginatedItems.map(item => (
                        <div key={item.id} className="relative group">
                            <button onClick={() => {
                                if (sub === VietnamSubCategory.REJECTED || sub === VietnamSubCategory.TEMPORARY) {
                                    handleEditItem(item);
                                } else {
                                    setActiveItem(item);
                                }
                            }} className="w-full bg-white p-6 rounded-3xl border-2 border-slate-100 hover:border-indigo-500 hover:shadow-xl transition-all flex flex-col items-center text-center group relative overflow-hidden h-full">
                                <div className={`absolute top-0 left-0 w-full h-1 transition-opacity ${item.status === VietnamSubCategory.REJECTED ? 'bg-red-500' : item.status === VietnamSubCategory.TEMPORARY ? 'bg-amber-500' : (item.type === 'PAYMENT' ? 'bg-rose-500' : 'bg-indigo-500')}`}></div>
                                <div className={`w-16 h-20 ${item.status === VietnamSubCategory.TEMPORARY ? 'bg-amber-50 text-amber-600' : (item.type === 'PAYMENT' ? 'bg-rose-50 text-rose-600' : 'bg-indigo-50 text-indigo-600')} rounded-xl flex items-center justify-center mb-4 group-hover:scale-105 transition-transform border border-transparent`}>
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.status === VietnamSubCategory.TEMPORARY ? "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" : "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"}/>
                                    </svg>
                                </div>
                                <div className={`absolute top-2 right-2 px-2 py-0.5 rounded-full text-[8px] font-black uppercase ${item.type === 'PAYMENT' ? 'bg-rose-100 text-rose-600' : 'bg-indigo-100 text-indigo-600'}`}>
                                    {item.type === 'PAYMENT' ? 'PAY' : 'PO'}
                                </div>
                                <h3 className="font-black text-sm truncate w-full mb-1">{item.clientName}</h3>
                                <p className="text-[10px] text-slate-400 font-bold uppercase">{item.date}</p>
                                
                                <div className="flex gap-2 mt-4">
                                    <div className={`w-4 h-4 rounded-full ${item.stamps.writer ? 'bg-indigo-500' : 'bg-slate-200'}`} title="작성"></div>
                                    <div className={`w-4 h-4 rounded-full ${item.stamps.head ? 'bg-indigo-500' : 'bg-slate-200'}`} title="법인장"></div>
                                    {item.type === 'PAYMENT' && <div className={`w-4 h-4 rounded-full ${item.stamps.ceo ? 'bg-red-500' : 'bg-slate-200'}`} title="대표"></div>}
                                    <div className={`w-4 h-4 rounded-full ${item.stamps.final ? 'bg-emerald-500' : 'bg-slate-200'}`} title="확인"></div>
                                </div>

                                {(item.status === VietnamSubCategory.REJECTED || item.rejectReason) && (
                                    <div className="mt-4 p-2 bg-red-50 border border-red-100 rounded-xl text-left w-full">
                                        <p className="text-[8px] font-black text-red-600 uppercase mb-0.5">반송사유</p>
                                        <p className="text-[10px] text-red-700 leading-tight line-clamp-2">{item.rejectReason || "사유 없음"}</p>
                                    </div>
                                )}
                                
                                {item.status === VietnamSubCategory.TEMPORARY && (
                                    <div className="mt-4 px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-[9px] font-black uppercase tracking-widest">
                                        임시 저장 중
                                    </div>
                                )}
                            </button>
                            {isMaster && (
                                <button 
                                    onClick={(e) => { e.stopPropagation(); setDeletingId(item.id); }} 
                                    className="absolute -top-2 -right-2 bg-red-600 text-white w-7 h-7 md:w-8 md:h-8 rounded-full shadow-lg hover:bg-red-700 flex items-center justify-center z-10"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
                                </button>
                            )}
                        </div>
                    ))
                )}
            </div>
        ) : (
            <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden overflow-x-auto shadow-sm">
                <table className="w-full text-left min-w-[800px]">
                    <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                            <th className="px-6 py-4">작성일</th>
                            <th className="px-6 py-4">수신처</th>
                            <th className="px-6 py-4">유형</th>
                            <th className="px-6 py-4 text-center">결재상태</th>
                            <th className="px-6 py-4 text-right">관리</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {paginatedItems.length === 0 ? (
                            <tr><td colSpan={5} className="px-6 py-12 text-center text-slate-400 italic font-medium">데이터가 없습니다.</td></tr>
                        ) : (
                            paginatedItems.map(item => (
                                <tr key={item.id} className="hover:bg-slate-50 transition-colors cursor-pointer group" onClick={() => {
                                    if (sub === VietnamSubCategory.REJECTED || sub === VietnamSubCategory.TEMPORARY) handleEditItem(item);
                                    else setActiveItem(item);
                                }}>
                                    <td className="px-6 py-4 text-xs font-mono text-slate-500 whitespace-nowrap">{item.date}</td>
                                    <td className="px-6 py-4">
                                        <div className="font-black text-sm text-slate-800">{item.clientName}</div>
                                        <div className="text-[10px] text-slate-400 truncate max-w-xs">{item.title}</div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-black ${item.type === 'PAYMENT' ? 'bg-rose-100 text-rose-600' : 'bg-indigo-100 text-indigo-600'}`}>
                                            {item.type === 'PAYMENT' ? 'PAYMENT' : 'ORDER'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <span className={`px-2.5 py-1 rounded-full text-[9px] font-black tracking-tighter uppercase ${item.status === VietnamSubCategory.REJECTED ? 'bg-red-100 text-red-600' : item.status.includes('임시') ? 'bg-amber-100 text-amber-700' : (item.status.includes('완료') ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700')}`}>
                                            {item.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex justify-end items-center gap-3">
                                            <span className="text-[10px] font-bold text-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity">
                                                {(sub === VietnamSubCategory.REJECTED || sub === VietnamSubCategory.TEMPORARY) ? '편집하기 →' : '보기 →'}
                                            </span>
                                            {isMaster && (
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); setDeletingId(item.id); }} 
                                                    className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        )}

        {totalPages > 1 && (
            <div className="flex justify-center items-center gap-3 mt-8 no-print pb-10">
                <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="w-10 h-10 flex items-center justify-center bg-white border border-slate-200 rounded-xl disabled:opacity-30 hover:bg-slate-50 transition-all shadow-sm">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7"/></svg>
                </button>
                <div className="flex gap-2">
                    {Array.from({length: totalPages}, (_, i) => i + 1).map(num => (
                        <button key={num} onClick={() => setCurrentPage(num)} className={`w-10 h-10 rounded-xl font-black text-sm transition-all ${currentPage === num ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' : 'bg-white border border-slate-200 text-slate-400 hover:bg-slate-50'}`}>{num}</button>
                    ))}
                </div>
                <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="w-10 h-10 flex items-center justify-center bg-white border border-slate-200 rounded-xl disabled:opacity-30 hover:bg-slate-50 transition-all shadow-sm">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7"/></svg>
                </button>
            </div>
        )}

        {activeItem && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] p-4 md:p-8 overflow-y-auto">
                <div className="max-w-[1000px] mx-auto">
                    <div className="flex justify-between mb-4 no-print">
                        <button onClick={() => setActiveItem(null)} className="px-6 py-2 bg-white rounded-xl font-bold shadow-lg">← 닫기</button>
                        <div className="flex gap-2">
                            {activeItem.status === VietnamSubCategory.PENDING && (
                                <button onClick={() => { setRejectingItem(activeItem); setRejectReasonText(''); }} className="px-6 py-2 bg-red-100 text-red-600 rounded-xl font-bold shadow-lg hover:bg-red-600 hover:text-white transition-all">반송</button>
                            )}
                            {activeItem.status === VietnamSubCategory.REJECTED && (
                                <button onClick={() => handleEditItem(activeItem)} className="px-6 py-2 bg-amber-500 text-white rounded-xl font-bold shadow-lg">수정하여 재제출</button>
                            )}
                            {activeItem.status === VietnamSubCategory.COMPLETED_ROOT && (
                                <button onClick={() => handleFinalVerify(activeItem)} className="px-8 py-2 bg-emerald-600 text-white rounded-xl font-black shadow-lg animate-pulse">확 인</button>
                            )}
                            <button onClick={handlePrint} className="px-6 py-2 bg-blue-600 text-white rounded-xl font-bold shadow-lg">PDF 저장 / 인쇄</button>
                        </div>
                    </div>
                    <div className="py-4">
                        {renderDocument(activeItem, true)}
                    </div>
                </div>
            </div>
        )}

        {rejectingItem && (
            <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-[300] flex items-center justify-center p-4">
                <div className="bg-white rounded-[2rem] p-8 max-w-md w-full shadow-2xl animate-in zoom-in duration-300">
                    <h3 className="text-2xl font-black text-black mb-4">반송 사유 입력</h3>
                    <textarea 
                        value={rejectReasonText} 
                        onChange={(e) => setRejectReasonText(e.target.value)} 
                        placeholder="상세한 반송 사유를 입력하십시오..." 
                        className="w-full h-40 p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-red-500 font-bold mb-8"
                    />
                    <div className="flex gap-4">
                        <button onClick={() => setRejectingItem(null)} className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-xl font-black transition-all">취소</button>
                        <button onClick={handleRejectAction} className="flex-1 py-4 bg-red-600 text-white rounded-xl font-black transition-all shadow-lg hover:bg-red-700">반송 처리</button>
                    </div>
                </div>
            </div>
        )}

        {deletingId && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[500] flex items-center justify-center p-4">
                <div className="bg-white rounded-3xl p-6 md:p-8 max-w-sm w-full shadow-2xl animate-in zoom-in duration-300">
                    <h3 className="text-lg md:text-xl font-black text-slate-900 mb-4 text-center">문서 영구 삭제</h3>
                    <p className="text-slate-600 mb-8 leading-relaxed text-center text-sm font-medium">삭제된 데이터는 복구할 수 없습니다.<br/>정말 삭제하시겠습니까?</p>
                    <div className="flex gap-4">
                        <button onClick={() => setDeletingId(null)} className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-all">취소</button>
                        <button onClick={() => handleDeleteDocument(deletingId)} className="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-all shadow-lg shadow-red-100">삭제</button>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};

export default VietnamOrderView;