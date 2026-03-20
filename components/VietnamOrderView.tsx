
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { VietnamSubCategory, VietnamOrderItem, VietnamOrderRow, UserAccount, ViewState, VnVendorInfo, VnBankVendorInfo } from '../types';
import { sendJandiNotification, saveSingleDoc, deleteSingleDoc, supabase, saveRecipient, deleteRecipient } from '../supabase';

interface StorageFile {
  name: string;
  id: string;
  updated_at: string;
  created_at: string;
  last_accessed_at: string;
  metadata: {
    size: number;
    mimetype: string;
  };
  isMock?: boolean;
  base64?: string; 
}

interface VietnamOrderViewProps {
  sub: VietnamSubCategory;
  currentUser: UserAccount;
  setView: (v: ViewState) => void;
  dataVersion: number;
}

const AutoExpandingTextarea = React.memo(({ 
  value, onChange, disabled, className, placeholder, onKeyDown, onPaste, onFocus, onClick, dataRow, dataCol, style
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
      onClick={onClick}
      disabled={disabled}
      placeholder={placeholder}
      data-row={dataRow}
      data-col={dataCol}
      style={style}
      className={`w-full bg-transparent resize-none overflow-hidden outline-none p-1 block whitespace-pre-wrap brake-all font-gulim ${className}`}
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

  // 베트남 수신처 관리 상태 (Khách hàng)
  const [vnVendors, setVnVendors] = useState<VnVendorInfo[]>([]);
  const [isVnVendorManagerOpen, setIsVnVendorManagerOpen] = useState(false);
  const [newVnVendor, setNewVnVendor] = useState<VnVendorInfo>({ name: '', address: '', taxId: '', tel: '' });

  // 베트남 은행 수신처 관리 상태 (Thụ hưởng/Ngân hàng)
  const [vnBankVendors, setVnBankVendors] = useState<VnBankVendorInfo[]>([]);
  const [isVnBankVendorManagerOpen, setIsVnBankVendorManagerOpen] = useState(false);
  const [newVnBankVendor, setNewVnBankVendor] = useState<VnBankVendorInfo>({ beneficiary: '', accountNo: '', bank: '', bankAddr: '' });

  // 폼 공통 상태
  const [vTitle, setVTitle] = useState('ĐƠN ĐẶT HÀNG (PO)');
  const [vDate, setVDate] = useState(new Date().toLocaleDateString('ko-KR'));
  const [vClientName, setVClientName] = useState('');
  const [vClientAddress, setVClientAddress] = useState('');
  const [vTaxId, setVTaxId] = useState('');
  const [vDeliveryAddress, setVDeliveryAddress] = useState('Cty Toàn Thắng Lô 2 KCN Bình xuyên -TT Hương Canh - Bình Xuyên, Vĩnh Phúc -');
  const [vRows, setVRows] = useState<VietnamOrderRow[]>([]);
  const [vClientTel, setVClientTel] = useState('');
  const [vWriterName, setVWriterName] = useState('Khanh 000-0000-0000');
  const [vModelName, setVModelName] = useState('');
  
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

  // File selection state for Alt + Click linking
  const [files, setFiles] = useState<StorageFile[]>([]);
  const [isFileSelectorOpen, setIsFileSelectorOpen] = useState(false);
  const [targetRowIdForFile, setTargetRowIdForFile] = useState<string | null>(null);
  const [isFilesLoading, setIsFilesLoading] = useState(false);
  const [fileSearchTerm, setFileSearchTerm] = useState('');

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

  // Cell Tools Draggable State
  const [toolPos, setToolPos] = useState({ x: 0, y: 0 });
  const [isDraggingTool, setIsDraggingTool] = useState(false);
  const dragStartPos = useRef({ x: 0, y: 0 });

  const handleToolMouseDown = (e: React.MouseEvent) => {
    setIsDraggingTool(true);
    dragStartPos.current = {
      x: e.clientX - toolPos.x,
      y: e.clientY - toolPos.y
    };
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingTool) return;
      setToolPos({
        x: e.clientX - dragStartPos.current.x,
        y: e.clientY - dragStartPos.current.y
      });
    };
    const handleMouseUp = () => setIsDraggingTool(false);

    if (isDraggingTool) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingTool]);

  const createEmptyRow = () => ({
    id: Math.random().toString(36).substr(2, 9),
    itemName: '', drawingNo: '', specification: '', image: '', unit: '', qty: '', unitPrice: '', amount: '', remarks: ''
  });

  useEffect(() => {
    const saved = localStorage.getItem('ajin_vietnam_orders');
    if (saved) setItems(JSON.parse(saved));
    const savedVendors = localStorage.getItem('ajin_vn_vendors');
    if (savedVendors) setVnVendors(JSON.parse(savedVendors));
    const savedBankVendors = localStorage.getItem('ajin_vn_bank_vendors');
    if (savedBankVendors) setVnBankVendors(JSON.parse(savedBankVendors));
  }, [dataVersion]);

  useEffect(() => {
    setCurrentPage(1);
    if (sub === VietnamSubCategory.ORDER || sub === VietnamSubCategory.PAYMENT || sub === VietnamSubCategory.METAL_ORDER) {
      setVRows(Array(sub === VietnamSubCategory.PAYMENT ? 3 : 5).fill(null).map(createEmptyRow));
      setMerges({}); setAligns({}); setWeights({}); setBorders({}); setUndoStack([]);
      setEditingId(null);
      setVClientTel('');
      setVWriterName('Khanh 000-0000-0000');
      setVModelName('');
      
      if (sub === VietnamSubCategory.PAYMENT) {
        setVTitle('ĐỀ NGHỊ THANH TOÁN (지불 요청서)');
        setVRemark('');
      } else if (sub === VietnamSubCategory.METAL_ORDER) {
        setVTitle('VN METAL 발주서');
        setVRemark('1. Delivery Place: AJIN TRAIN VINA\n2. Attach Drawings\n3. Comply with drawing dimensions / Strict concentricity\n4. Extra quantity 1.5%');
      } else if (sub === VietnamSubCategory.ORDER) {
        setVTitle('ĐƠN ĐẶT HÀNG (PO)');
        setVRemark('');
      }
    }
  }, [sub]);

  const handleSaveVnVendor = () => {
    if (!newVnVendor.name.trim()) return;
    const updated = vnVendors.filter(v => v.name !== newVnVendor.name);
    const final = [...updated, newVnVendor];
    setVnVendors(final);
    localStorage.setItem('ajin_vn_vendors', JSON.stringify(final));
    
    // Supabase recipients 테이블에 저장
    saveRecipient({
      id: `vn-vendor-${newVnVendor.name}`,
      name: newVnVendor.name,
      tel: newVnVendor.tel,
      fax: newVnVendor.taxId,
      remark: newVnVendor.address,
      category: 'VN_RECIPIENT'
    });

    setNewVnVendor({ name: '', address: '', taxId: '', tel: '' });
    
  };

  const handleVnVendorSelect = (name: string) => {
    takeSnapshot();
    const vendor = vnVendors.find(v => v.name === name);
    if (vendor) {
      setVClientName(vendor.name);
      setVClientAddress(vendor.address);
      setVTaxId(vendor.taxId);
      setVClientTel(vendor.tel || '');
    } else {
      setVClientName(name);
    }
  };

  const handleSaveVnBankVendor = () => {
    if (!newVnBankVendor.beneficiary.trim()) return;
    const updated = vnBankVendors.filter(v => v.beneficiary !== newVnBankVendor.beneficiary);
    const final = [...updated, newVnBankVendor];
    setVnBankVendors(final);
    localStorage.setItem('ajin_vn_bank_vendors', JSON.stringify(final));
    
    // Supabase recipients 테이블에 저장
    saveRecipient({
      id: `vn-bank-${newVnBankVendor.beneficiary}`,
      name: newVnBankVendor.beneficiary,
      tel: newVnBankVendor.accountNo,
      fax: newVnBankVendor.bank,
      remark: newVnBankVendor.bankAddr,
      category: 'VN_BANK'
    });

    setNewVnBankVendor({ beneficiary: '', accountNo: '', bank: '', bankAddr: '' });
    
  };

  const handleVnBankVendorSelect = (beneficiary: string) => {
    takeSnapshot();
    const bankVendor = vnBankVendors.find(v => v.beneficiary === beneficiary);
    if (bankVendor) {
      setVBeneficiary(bankVendor.beneficiary);
      setVAccountNo(bankVendor.accountNo);
      setVBank(bankVendor.bank);
      setVBankAddr(bankVendor.bankAddr);
    } else {
      setVBeneficiary(beneficiary);
    }
  };

  const takeSnapshot = useCallback(() => {
    const snapshot = JSON.stringify({ vRows, merges, aligns, weights, borders, vTitle, vClientName, vClientAddress, vTaxId, vDeliveryAddress, vClientTel, vWriterName, vModelName, vBeneficiary, vAccountNo, vBank, vBankAddr, vVatRate, vRemark });
    setUndoStack(prev => [snapshot, ...prev].slice(0, 50));
  }, [vRows, merges, aligns, weights, borders, vTitle, vClientName, vClientAddress, vTaxId, vDeliveryAddress, vClientTel, vWriterName, vModelName, vBeneficiary, vAccountNo, vBank, vBankAddr, vVatRate, vRemark]);

  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const [last, ...rest] = undoStack;
    try {
      const data = JSON.parse(last);
      setVRows(data.vRows); setMerges(data.merges); setAligns(data.aligns); setWeights(data.weights); setBorders(data.borders);
      setVTitle(data.vTitle); setVClientName(data.vClientName); setVClientAddress(data.vClientAddress); setVTaxId(data.vTaxId); setVDeliveryAddress(data.vDeliveryAddress);
      setVClientTel(data.vClientTel || ''); setVWriterName(data.vWriterName || ''); setVModelName(data.vModelName || '');
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

  const formatNumber = (val: any) => {
    if (!val && val !== 0) return '';
    const num = parseFloat(String(val).replace(/,/g, ''));
    if (isNaN(num)) return val;
    return num.toLocaleString();
  };

  const handleRowKeyDown = (e: React.KeyboardEvent, rowIdx: number, colIdx: number, docType: 'ORDER' | 'PAYMENT' | 'METAL') => {
    const validColsPo = [1, 2, 3, 4, 5, 6, 7];
    const validColsPay = [1, 3, 4, 5, 6, 7];
    const validColsMetal = [0, 1, 2, 3, 4, 5, 6, 7];
    let validCols = validColsPo;
    if (docType === 'PAYMENT') validCols = validColsPay;
    else if (docType === 'METAL') validCols = validColsMetal;
    
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

  // 파일 업로드 데이터 로드 (Supabase + LocalStorage Fallback)
  const fetchStorageFiles = useCallback(async () => {
    setIsFilesLoading(true);
    try {
      let combinedFiles: StorageFile[] = [];
      if (supabase) {
        const { data, error } = await supabase.storage.from('ajin-pdfdata').list('', {
          limit: 1000,
          offset: 0,
          sortBy: { column: 'created_at', order: 'desc' }
        });
        if (!error && data) {
          combinedFiles = [...data.filter(f => f.id !== null) as any];
        }
      }
      const mockStorage = localStorage.getItem('ajin_mock_storage');
      if (mockStorage) {
        const mockData: StorageFile[] = JSON.parse(mockStorage);
        combinedFiles = [...combinedFiles, ...mockData];
      }
      setFiles(combinedFiles);
    } catch (err) {
      console.error('Error fetching files:', err);
    } finally {
      setIsFilesLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStorageFiles();
  }, [fetchStorageFiles]);

  const handleLinkFileToRow = (file: StorageFile) => {
    if (!targetRowIdForFile) return;
    let fileUrl = "";
    if (file.isMock && file.base64) {
      fileUrl = file.base64;
    } else if (supabase) {
      const { data } = supabase.storage.from('ajin-pdfdata').getPublicUrl(file.name);
      fileUrl = data.publicUrl;
    }
    
    // Case 1: Editing mode (vRows)
    setVRows(prev => prev.map(row => 
      row.id === targetRowIdForFile ? { ...row, fileUrl } : row
    ));

    // Case 2: Viewing mode (activeItem)
    if (activeItem) {
      const updatedRows = activeItem.rows.map(row => 
        row.id === targetRowIdForFile ? { ...row, fileUrl } : row
      );
      const updatedItem = { ...activeItem, rows: updatedRows };
      setActiveItem(updatedItem);
      
      // Save to global items and Supabase
      const updatedItems = items.map(it => it.id === activeItem.id ? updatedItem : it);
      saveVietnamItems(updatedItems, updatedItem);
    }

    setIsFileSelectorOpen(false);
    setTargetRowIdForFile(null);
    alert('파일이 품명에 링크되었습니다.');
  };

  const handlePaste = (e: React.ClipboardEvent, rowId: string, field: keyof VietnamOrderRow, isMetal: boolean) => {
    const text = e.clipboardData.getData('text');
    
    if (text && (text.includes('\t') || text.includes('\n') || text.includes('\r'))) {
      e.preventDefault();
      takeSnapshot();
      
      const lines = text.split(/\r\n|\n|\r/);
      // Remove trailing empty line from Excel
      if (lines.length > 1 && lines[lines.length - 1].trim() === '') {
        lines.pop();
      }

      const fields: (keyof VietnamOrderRow)[] = isMetal 
        ? ['drawingNo', 'itemName', 'specification', 'unit', 'qty', 'unitPrice', 'remarks']
        : ['itemName', 'unit', 'qty', 'unitPrice', 'remarks'];
      
      const startFieldIdx = fields.indexOf(field);
      if (startFieldIdx === -1) return;

      setVRows(prev => {
        const startRowIdx = prev.findIndex(r => r.id === rowId);
        if (startRowIdx === -1) return prev;

        const newRows = [...prev];
        lines.forEach((line, rOffset) => {
          const targetRowIdx = startRowIdx + rOffset;
          
          while (targetRowIdx >= newRows.length) {
            newRows.push(createEmptyRow());
          }

          const cells = line.split('\t');
          cells.forEach((cellText, cOffset) => {
            const targetFieldIdx = startFieldIdx + cOffset;
            if (targetFieldIdx >= fields.length) return;
            const targetField = fields[targetFieldIdx];
            newRows[targetRowIdx] = { ...newRows[targetRowIdx], [targetField]: cellText.trim() };
          });
        });
        return newRows;
      });
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
    const isMetal = sub === VietnamSubCategory.METAL_ORDER || (editingId && items.find(it => it.id === editingId)?.type === 'METAL');
    const fields: (any)[] = isMetal
        ? ['drawingNo', 'itemName', 'specification', 'unit', 'qty', 'unitPrice', 'amount', 'remarks']
        : [null, 'itemName', 'image', 'unit', 'qty', 'unitPrice', 'amount', 'remarks'];
    setVRows(prev => {
      const next = [...prev];
      for (let r = minR; r <= maxR; r++) {
        if (!next[r]) continue;
        for (let c = minC; c <= maxC; c++) {
            const field = fields[c]; 
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
      const isEditable = sub === VietnamSubCategory.ORDER || sub === VietnamSubCategory.PAYMENT || sub === VietnamSubCategory.METAL_ORDER || editingId;
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

    let printTitle = '';
    if (activeItem) {
      printTitle = activeItem.type === 'METAL' ? `${activeItem.clientName}_${activeItem.modelName}` : `VN_${activeItem.type}_${activeItem.date}`;
    } else {
      let docType: 'ORDER' | 'PAYMENT' | 'METAL' = 'ORDER';
      if (editingId) {
        docType = items.find(it => it.id === editingId)?.type || 'ORDER';
      } else {
        if (sub === VietnamSubCategory.PAYMENT) docType = 'PAYMENT';
        else if (sub === VietnamSubCategory.METAL_ORDER) docType = 'METAL';
        else if (sub === VietnamSubCategory.ORDER) docType = 'ORDER';
      }
      printTitle = docType === 'METAL' ? `${vClientName}_${vModelName}` : `VN_${docType}_${vDate}`;
    }

    const win = window.open('', '_blank');
    if (win) {
      win.document.write(`
        <html><head><title>${printTitle}</title><script src="https://cdn.tailwindcss.com"></script>
        <style>
          @page { size: A4 portrait; margin: 0; }
          body { font-family: 'Inter', sans-serif; background: white; width: 210mm; margin: 0; padding: 0; }
          .font-gulim { font-family: 'Gulim', 'Dotum', sans-serif; }
          * { color: black !important; border-color: black !important; print-color-adjust: exact; }
          .font-bold-print { font-weight: 700 !important; }
          .font-normal-print { font-weight: 400 !important; }
          .no-print { display: none !important; }
          table { border-collapse: collapse; width: 100%; table-layout: fixed; }
         th { 
  border: 1px solid black; 
  padding: 2px 4px; 
  vertical-align: middle; 
  font-size: 11px;
}

td { 
  border: 1px solid black; 
  padding: 2px 4px; 
  vertical-align: middle; 
  word-break: break-all; 
  overflow: hidden; 
  font-size: 10px;
}
          .document-wrapper { padding: 25mm 10mm 10mm 10mm;}
          .info-row { border-bottom: none !important; }
        </style>
        </head><body onload="window.print(); window.close();">
          <div class="document-wrapper">${content}</div>
        </body></html>
      `);
      win.document.close();
    }
  };

  const handleSubmit = (isTemp: boolean = false) => {
    if (!vClientName.trim()) { alert('수신처(Khách hàng)를 입력해 주세요.'); return; }
    
    let docType: 'ORDER' | 'PAYMENT' | 'METAL' = 'ORDER';
    if (editingId) {
        const original = items.find(it => it.id === editingId);
        if (original) docType = original.type;
    } else {
        if (sub === VietnamSubCategory.PAYMENT) docType = 'PAYMENT';
        else if (sub === VietnamSubCategory.METAL_ORDER) docType = 'METAL';
        else if (sub === VietnamSubCategory.ORDER) docType = 'ORDER';
    }

    const targetStatus = isTemp ? VietnamSubCategory.TEMPORARY : VietnamSubCategory.PENDING;

    if (docType === 'METAL' && !vModelName.trim()) { alert('기종(Model)을 입력해 주세요.'); return; }

    const finalTitle = (docType === 'METAL' && !isTemp) ? `${vClientName}_${vModelName}` : vTitle;

    if (editingId) {
        let updatedDoc: VietnamOrderItem | undefined;
        const updated = items.map(it => {
          if (it.id === editingId) {
            updatedDoc = {
              ...it, title: finalTitle, date: vDate, clientName: vClientName, clientAddress: vClientAddress, taxId: vTaxId, deliveryAddress: vDeliveryAddress,
              clientTel: vClientTel, writerName: vWriterName, modelName: vModelName,
              beneficiary: vBeneficiary, accountNo: vAccountNo, bank: vBank, bankAddr: vBankAddr, vatRate: vVatRate, remark: vRemark,
              rows: vRows.filter(r => r.itemName.trim() || r.image), status: targetStatus,
              rejectReason: isTemp ? it.rejectReason : undefined, 
              rejectLog: isTemp ? it.rejectLog : undefined, 
              merges, aligns, weights, borders,
              stamps: isTemp ? it.stamps : { writer: { userId: currentUser.initials, timestamp: new Date().toLocaleString() } }
            };
            return updatedDoc;
          }
          return it;
        });
        saveVietnamItems(updated, updatedDoc);
        
        // JANDI 알림: 재제출 시 법인장(U-SUN)에게 결재 요청
        if (!isTemp) {
          sendJandiNotification('VN', 'REQUEST', finalTitle, 'U-SUN', vDate);
        }
        
        alert(isTemp ? '임시저장되었습니다.' : '수정 완료되어 결재 대기로 재전송되었습니다.');
        setEditingId(null);
    } else {
        const newItem: VietnamOrderItem = {
            id: `VN${docType === 'PAYMENT' ? 'PAY' : (docType === 'METAL' ? 'MET' : 'PO')}-${Date.now()}`, title: finalTitle, type: docType, date: vDate, clientName: vClientName, clientAddress: vClientAddress, taxId: vTaxId, deliveryAddress: vDeliveryAddress,
            clientTel: vClientTel, writerName: vWriterName, modelName: vModelName,
            beneficiary: vBeneficiary, accountNo: vAccountNo, bank: vBank, bankAddr: vBankAddr, vatRate: vVatRate, remark: vRemark,
            rows: vRows.filter(r => r.itemName.trim() || r.image), status: targetStatus, authorId: currentUser.initials, createdAt: new Date().toISOString(),
            merges, aligns, weights, borders,
            stamps: isTemp ? {} : { writer: { userId: currentUser.initials, timestamp: new Date().toLocaleString() } }
        };
        const updated = [newItem, ...items];
        saveVietnamItems(updated, newItem);
        
        // JANDI 알림: 신규 작성 완료 시 법인장(U-SUN)에게 결재 요청
        if (!isTemp) {
          sendJandiNotification('VN', 'REQUEST', finalTitle, 'U-SUN', vDate);
        }
        
        alert(isTemp ? '임시저장되었습니다.' : '작성 결재가 완료되어 결재 대기로 전송되었습니다.');
    }
    setView({ type: 'VIETNAM', sub: targetStatus });
  };

  const saveVietnamItems = (updated: VietnamOrderItem[], updatedDoc?: VietnamOrderItem) => {
    setItems(updated);
    localStorage.setItem('ajin_vietnam_orders', JSON.stringify(updated));
    
    // 개별 문서 저장 (트래픽 절감)
    if (updatedDoc) {
      saveSingleDoc('vn_purchase_orders', updatedDoc);
    }
    
    
  };

  const handleStampAction = (item: VietnamOrderItem, type: 'head' | 'ceo') => {
    const userInit = currentUser.initials.toLowerCase().trim();
    const isMaster = currentUser.loginId === 'AJ5200';
    
    if (type === 'head' && !isMaster && userInit !== 'u-sun') { alert('법인장 결재 권한이 없습니다. (U-SUN 전용)'); return; }
    if (type === 'ceo' && !isMaster && userInit !== 'david') { alert('대표 결재 권한이 없습니다. (DAVID 전용)'); return; }

    const updatedStamps = { ...item.stamps, [type]: { userId: currentUser.initials, timestamp: new Date().toLocaleString() } };
    
    const isPay = item.type === 'PAYMENT';
    const isMetal = item.type === 'METAL';
    const isOrder = item.type === 'ORDER';
    const isFullApproved = (isMetal || isOrder) ? (updatedStamps.head && updatedStamps.ceo) : !!updatedStamps.head;

    let updatedDoc: VietnamOrderItem | undefined;
    const updated = items.map(it => {
      if (it.id === item.id) {
        const completedStatus = VietnamSubCategory.COMPLETED_ROOT;
        updatedDoc = { ...it, stamps: updatedStamps, status: isFullApproved ? completedStatus : it.status };
        return updatedDoc;
      }
      return it;
    });
    saveVietnamItems(updated, updatedDoc);

    // JANDI 알림 로직
    if (isFullApproved) {
        // 최종 승인 완료 시 작성자에게 알림
        sendJandiNotification('VN', 'COMPLETE', item.title, item.authorId, item.date);
    } else {
        // 법인장 승인 후, 대표(DAVID)에게 결재 요청 (METAL 및 ORDER 발주서 해당)
        if (type === 'head' && (isMetal || isOrder)) {
            sendJandiNotification('VN', 'REQUEST', item.title, 'DAVID', item.date);
        }
    }

    alert(`${type === 'head' ? '법인장' : '대표'} 결재가 완료되었습니다.`);
    setActiveItem(null);
  };

  const handleRejectAction = () => {
    if (!rejectingItem || !rejectReasonText.trim()) { alert('반송 사유를 입력해 주세요.'); return; }
    let updatedDoc: VietnamOrderItem | undefined;
    const updated = items.map(it => {
      if (it.id === rejectingItem.id) {
        updatedDoc = {
          ...it, status: VietnamSubCategory.REJECTED, rejectReason: rejectReasonText,
          rejectLog: { userId: currentUser.initials, timestamp: new Date().toLocaleString() }
        };
        return updatedDoc;
      }
      return it;
    });
    saveVietnamItems(updated, updatedDoc);
    
    // JANDI 알림: 반송 시 작성자에게 알림
    sendJandiNotification('VN', 'REJECT', rejectingItem.title, rejectingItem.authorId, rejectingItem.date);

    alert('문서가 반송 처리되었습니다.');
    setRejectingItem(null);
    setRejectReasonText('');
    setActiveItem(null);
  };

  const handleDeleteDocument = (id: string) => {
    const itemToDelete = items.find(it => it.id === id);
    const updated = items.filter(it => it.id !== id);
    saveVietnamItems(updated);
    deleteSingleDoc('vn_purchase_orders', id, itemToDelete);
    setDeletingId(null);
    alert('삭제되었습니다.');
  };

  const handleFinalVerify = (item: VietnamOrderItem) => {
    const updatedStamps = { ...item.stamps, final: { userId: currentUser.initials, timestamp: new Date().toLocaleString() } };
    let nextStatus = item.type === 'PAYMENT' ? VietnamSubCategory.PAYMENT_COMPLETED : VietnamSubCategory.ORDER_COMPLETED;
    if (item.type === 'METAL') nextStatus = VietnamSubCategory.METAL_ORDER_COMPLETED;
    
    let updatedDoc: VietnamOrderItem | undefined;
    const updated = items.map(it => {
      if (it.id === item.id) {
        updatedDoc = { ...it, stamps: updatedStamps, status: nextStatus };
        return updatedDoc;
      }
      return it;
    });
    saveVietnamItems(updated, updatedDoc);
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
    setVClientTel(item.clientTel || '');
    setVWriterName(item.writerName || '');
    setVModelName(item.modelName || '');
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
      { id: VietnamSubCategory.METAL_ORDER, label: 'VN METAL발주서', desc: '베트남용 메탈 발주서 작성', icon: '02' },
      { id: VietnamSubCategory.PAYMENT, label: 'VN지불요청서', desc: '베트남용 지불 요청서 작성', icon: '03' },
      { id: VietnamSubCategory.TEMPORARY, label: 'VN임시저장', desc: '작성 중인 문서 보관함', icon: '04' }
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


  // New: Consolidate File Selector Modal rendering
  const renderFileSelectorModal = () => {
    if (!isFileSelectorOpen) return null;
    
    console.log('Rendering File Selector Modal, isFilesLoading:', isFilesLoading, 'files count:', files.length);

    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[500] flex items-center justify-center p-4 no-print">
        <div className="bg-white rounded-[2rem] p-8 w-full max-w-3xl shadow-2xl animate-in fade-in zoom-in duration-300 flex flex-col max-h-[80vh] min-h-[400px]">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h3 className="text-2xl font-black text-black">파일 링크 선택</h3>
              <p className="text-sm text-slate-500 font-bold mt-1">품명(Item)에 연결할 PDF 도면 파일을 선택하세요.</p>
            </div>
            <button onClick={() => { setIsFileSelectorOpen(false); setTargetRowIdForFile(null); }} className="p-2 text-slate-400 hover:text-black">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>
          
          <div className="mb-4">
            <input 
              type="text" 
              placeholder="파일명 검색..." 
              className="w-full px-5 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500 font-bold"
              value={fileSearchTerm}
              onChange={(e) => setFileSearchTerm(e.target.value)}
            />
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 relative">
            {isFilesLoading ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/80 z-10">
                <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
                <p className="text-slate-600 font-bold animate-pulse">파일 목록을 불러오는 중입니다...</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2">
                {files.filter(f => f.name.toLowerCase().includes(fileSearchTerm.toLowerCase())).map(file => {
                  const displayFileName = file.name.split('_').slice(1).join('_') || file.name;
                  return (
                    <button 
                      key={file.id} 
                      onClick={() => handleLinkFileToRow(file)}
                      className="flex items-center justify-between p-4 bg-slate-50 border border-slate-100 rounded-2xl hover:bg-blue-50 hover:border-blue-300 transition-all text-left"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-red-50 text-red-500 rounded-xl flex items-center justify-center font-black text-[10px]">PDF</div>
                        <div>
                          <p className="font-black text-black text-sm">{displayFileName}</p>
                          <p className="text-[10px] text-slate-400 font-bold uppercase">{new Date(file.created_at).toLocaleDateString()}</p>
                        </div>
                      </div>
                      <span className="px-4 py-1 bg-white border rounded-lg text-[10px] font-black text-blue-600 uppercase tracking-widest">선택</span>
                    </button>
                  );
                })}
                {files.length === 0 && <div className="py-20 text-center text-slate-400 font-bold italic">업로드된 파일이 없습니다.</div>}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // 문서 상세 뷰 렌더러
  const renderDocument = (data: VietnamOrderItem, isReadOnly: boolean = true) => {
    const isPayDoc = data.type === 'PAYMENT';
    const isMetalDoc = data.type === 'METAL';
    const isOrderDoc = data.type === 'ORDER';
    const dRows = isReadOnly ? data.rows : vRows;
    const dTitle = isReadOnly ? data.title : vTitle;
    const dDate = isReadOnly ? data.date : vDate;
    const dClient = isReadOnly ? data.clientName : vClientName;
    const dAddress = isReadOnly ? data.clientAddress : vClientAddress;
    const dTaxId = isReadOnly ? data.taxId : vTaxId;
    const dDelivery = isReadOnly ? data.deliveryAddress : vDeliveryAddress;
    
    // 지불요청서 및 메탈발주서 공통/전용
    const dBeneficiary = isReadOnly ? data.beneficiary : vBeneficiary;
    const dAccountNo = isReadOnly ? data.accountNo : vAccountNo;
    const dBank = isReadOnly ? data.bank : vBank;
    const dBankAddr = isReadOnly ? data.bankAddr : vBankAddr;
    const dVatRate = isReadOnly ? (data.vatRate || 0) : vVatRate;
    const dRemark = isReadOnly ? data.remark : vRemark;
    
    const dClientTel = isReadOnly ? data.clientTel : vClientTel;
    const dWriterName = isReadOnly ? data.writerName : vWriterName;
    const dModelName = isReadOnly ? data.modelName : vModelName;

    const dMerges = isReadOnly ? (data.merges || {}) : merges;
    const dAligns = isReadOnly ? (data.aligns || {}) : aligns;
    const dBorders = isReadOnly ? (data.borders || {}) : borders;
    const dWeights = isReadOnly ? (data.weights || {}) : weights;

    const { subtotal, vat, total } = getTotal(dRows, dVatRate);

    return (
      <div className="bg-white border border-slate-300 shadow-2xl mx-auto p-4 md:p-12 min-h-[297mm] w-full max-w-5xl text-black font-gulim relative vietnam-order-print text-left overflow-x-auto font-bold flex flex-col items-center">
        <div className="w-full font-bold">
          <div className="flex justify-between items-start mb-2 font-bold w-full">
            <div className="flex flex-col flex-1 mt-0">
              <h2 className="text-xl font-black tracking-tight uppercase m-0 leading-tight">CÔNG TY TNHH AJIN TRAIN VINA</h2>
              {isMetalDoc && <p className="text-[11px] font-bold text-black">Cty Toàn Thắng Lô 2 KCN Bình xuyên -TT Hương Canh - Bình Xuyên, Vĩnh Phúc - <br /> TEL: 070-4121-6200 / E-MAIL : phungthekhanh10011982@gmail.com </p>}
              <div className="mt-2">
                {isReadOnly ? (
                    <h1 className="text-2xl font-black uppercase underline decoration-2 underline-offset-4">{isMetalDoc ? 'PURCHASE ORDER' : dTitle}</h1>
                ) : (
                    <input value={isMetalDoc ? 'PURCHASE ORDER' : vTitle} onChange={e => !isMetalDoc && setVTitle(e.target.value)} disabled={isMetalDoc} className="text-2xl font-black outline-none hover:bg-slate-50 focus:bg-slate-50 transition-all uppercase w-full max-w-lg" />
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
                        {(isMetalDoc || isOrderDoc) && <td className="border border-black w-20 py-1">
                          <div className="flex flex-col items-center leading-tight">
                            <span>Giám đốc</span>
                            <span className="text-[9px] font-bold opacity-80">(대표)</span>
                          </div>
                        </td>}
                    </tr>
                    <tr className="h-15">
                        <td className="border border-black p-1 align-middle">
                          {data.stamps.writer && (
                            <div className="flex flex-col items-center">
                              <span className="font-black text-blue-700 text-xs">{data.stamps.writer.userId}</span>
                              <span className="text-[8px] opacity-60 mt-1">{data.stamps.writer.timestamp}</span>
                            </div>
                          )}
                        </td>
                        <td className={`border border-black p-1 align-middle ${!isReadOnly ? '' : (sub === VietnamSubCategory.PENDING && !data.stamps.head ? 'cursor-pointer hover:bg-amber-50' : '')}`} onClick={() => isReadOnly && sub === VietnamSubCategory.PENDING && !data.stamps.head && handleStampAction(data, 'head')}>
                          {data.stamps.head ? (
                            <div className="flex flex-col items-center">
                                <span className="font-black text-green-700 text-xs">{data.stamps.head.userId}</span>
                                <span className="text-[8px] opacity-60 mt-1">{data.stamps.head.timestamp}</span>
                            </div>
                          ) : (isReadOnly && sub === VietnamSubCategory.PENDING ? <span className="text-[10px] text-slate-300">승인</span> : null)}
                        </td>
                        {(isMetalDoc || isOrderDoc) && (
                          <td className={`border border-black p-1 align-middle ${!isReadOnly ? '' : (sub === VietnamSubCategory.PENDING && data.stamps.head && !data.stamps.ceo ? 'cursor-pointer hover:bg-amber-50' : '')}`} onClick={() => isReadOnly && sub === VietnamSubCategory.PENDING && data.stamps.head && !data.stamps.ceo && handleStampAction(data, 'ceo')}>
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

          <div className="space-y-0 mb-2 text-[12px] font-bold w-full">
            <div className="flex items-center border-b border-slate-100 info-row w-full">
                <div className="flex w-1/2 items-center">
                    <span className="w-52 font-bold-print">Ngày (날짜):</span>
                    {isReadOnly ? <span className="font-normal-print">{dDate}</span> : <input type="text" value={vDate} onChange={e => setVDate(e.target.value)} className="flex-1 outline-none font-normal-print bg-slate-50/20 px-2"/>}
                </div>
            </div>
            <div className="flex items-center border-b border-slate-100 info-row w-full">
                <div className="flex w-full items-center">
                    <span className="w-52 font-bold-print shrink-0">Khách hàng/Tên (수신):</span>
                    {isReadOnly ? <span className="flex-1 font-normal-print">{dClient}</span> : (
                      <div className="flex flex-1 gap-2 items-center min-w-0">
                        <select 
                          value={vnVendors.find(v => v.name === vClientName) ? vClientName : ""} 
                          onChange={(e) => handleVnVendorSelect(e.target.value)}
                          className="bg-slate-50 border rounded px-1 py-0.5 text-[10px] outline-none w-20 shrink-0 no-print"
                        >
                          <option value="">직접입력</option>
                          {vnVendors.map(v => <option key={v.name} value={v.name}>{v.name}</option>)}
                        </select>
                        <input value={vClientName} onChange={e => { takeSnapshot(); setVClientName(e.target.value); }} className="flex-1 outline-none font-normal-print bg-slate-50/20 px-2 min-w-0" placeholder="수신처 상호명"/>
                      </div>
                    )}
                </div>
            </div>
            <div className="flex items-center border-b border-slate-100 info-row w-full">
                <div className="flex w-full items-center">
                    <span className="w-52 font-bold-print">Địa chỉ (수신 주소):</span>
                    {isReadOnly ? <span className="font-normal-print">{dAddress}</span> : <input value={vClientAddress} onChange={e => setVClientAddress(e.target.value)} className="flex-1 outline-none font-normal-print bg-slate-50/20 px-2" placeholder="수신처 주소"/>}
                </div>
            </div>
            {isMetalDoc ? (
              <>
                <div className="flex border-b border-slate-100 info-row w-full">
                  <div className="flex w-1/2 items-center">
                    <span className="w-52 font-bold-print">TEL:</span>
                    {isReadOnly ? <span className="font-normal-print">{dClientTel}</span> : <input value={vClientTel} onChange={e => setVClientTel(e.target.value)} className="flex-1 outline-none font-normal-print bg-slate-50/20 px-2" placeholder="수신처 연락처"/>}
                  </div>
                  <div className="flex w-1/2 items-center ml-2 pl-2">
                    <span className="w-40 font-bold-print">Mã số thuế (사업자번호):</span>
                    {isReadOnly ? <span className="font-mono font-normal-print">{dTaxId}</span> : <input value={vTaxId} onChange={e => setVTaxId(e.target.value)} className="flex-1 outline-none font-mono font-normal-print bg-slate-50/20 px-2" placeholder="Tax ID"/>}
                  </div>
                </div>
                <div className="w-full border-t border-black mt-1 mb-3"></div>
                <div className="flex border-b border-slate-100 info-row w-full">
                  <div className="flex w-1/2 items-center">
                    <span className="w-52 font-bold-print text-[15px]">MODEL (기종):</span>
                    {isReadOnly ? <span className="text-[15px] font-normal-print">{dModelName}</span> : <input value={vModelName} onChange={e => setVModelName(e.target.value)} className="flex-1 outline-none font-normal-print bg-slate-50/20 print:bg-transparent px-2 text-[15px]" placeholder="기종 입력 (필수)"/>}
                  </div>
                  <div className="flex w-1/2 items-center ml-2 pl-2">
                    <span className="w-40 font-bold-print">Người lập (작성자):</span>
                    {isReadOnly ? <span className="font-normal-print">{dWriterName}</span> : <input value={vWriterName} onChange={e => setVWriterName(e.target.value)} className="flex-1 outline-none font-normal-print bg-slate-50/20 px-2" placeholder="작성자 성명"/>}
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center border-b border-slate-100 info-row w-full">
                    <div className="flex w-full items-center">
                        <span className="w-52 font-bold-print">Mã số thuế (사업자번호):</span>
                        {isReadOnly ? <span className="font-mono font-normal-print">{dTaxId}</span> : <input value={vTaxId} onChange={e => setVTaxId(e.target.value)} className="flex-1 outline-none font-mono font-normal-print bg-slate-50/20 px-2" placeholder="Tax ID"/>}
                    </div>
                </div>
                <div className="flex items-start w-full">
                    <span className="w-52 font-bold-print shrink-0">Địa chỉ nhận hàng (배송지):</span>
                    {isReadOnly ? <span className="flex-1 whitespace-pre-wrap font-normal-print">{dDelivery}</span> : <AutoExpandingTextarea value={vDeliveryAddress} onChange={(e: any) => setVDeliveryAddress(e.target.value)} className="flex-1 outline-none font-normal-print bg-slate-50/20 px-2 py-0 min-h-0" placeholder="배송 주소"/>}
                </div>
              </>
            )}
          </div>

          <div className="w-full flex justify-center">
            <table className="w-full border-collapse border border-black text-[12px] font-bold">
                <thead className="bg-slate-100 print:bg-white font-black text-center">
                    <tr>
                        <th className={`border border-black w-8 ${isPayDoc || isMetalDoc ? 'py-1' : 'py-2'}`}>STT</th>
                        {isMetalDoc && (
                          <th className="border border-black w-20 text-black">
                            <div className="flex flex-col items-center leading-tight py-0.5">
                              <span>số bản vẽ</span>
                              <span className="text-[10px] font-bold opacity-80">(도번)</span>
                            </div>
                          </th>
                        )}
                        <th className="border border-black w-[35%] min-w-[180px]">
                          <div className="flex flex-col items-center leading-tight py-0.5">
                            <span>TÊN VẬT TƯ</span>
                            <span className="text-[10px] font-bold opacity-80">({isMetalDoc ? '품목' : '구매품목'})</span>
                          </div>
                        </th>
                        {!isPayDoc && !isMetalDoc && <th className="border border-black w-28">
                          <div className="flex flex-col items-center leading-tight py-0.5">
                            <span>HÌNH ẢNH</span>
                            <span className="text-[10px] font-bold opacity-80">(사진)</span>
                          </div>
                        </th>}
                        <th className={`border border-black ${isMetalDoc ? 'w-32' : 'w-16'}`}>
                          <div className="flex flex-col items-center leading-tight py-0.5">
                            <span>{isMetalDoc ? 'QUY CÁCH' : 'ĐVT'}</span>
                            <span className="text-[10px] font-bold opacity-80">({isMetalDoc ? '규격' : '단위'})</span>
                          </div>
                        </th>
                        {isMetalDoc && (
                          <th className="border border-black w-16">
                            <div className="flex flex-col items-center leading-tight py-0.5">
                              <span>ĐVT</span>
                              <span className="text-[10px] font-bold opacity-80">(단위)</span>
                            </div>
                          </th>
                        )}
                        <th className="border border-black w-16">
                          <div className="flex flex-col items-center leading-tight py-0.5 text-[10px]">
                            <span>SỐ LƯỢNG</span>
                            <span className="text-[9px] font-bold opacity-80">(수량)</span>
                          </div>
                        </th>
                        <th className={`border border-black ${isMetalDoc ? 'w-16' : 'w-24'}`}>
                          <div className="flex flex-col items-center leading-tight py-0.5">
                            <span>Đơn giá</span>
                            <span className="text-[10px] font-bold opacity-80">(단가)</span>
                          </div>
                        </th>
                        <th className={`border border-black ${isMetalDoc ? 'w-24' : 'w-24'}`}>
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
                            <td className="border border-black text-center font-normal">{rIdx + 1}</td>
                            {[
                                ...(isMetalDoc ? [{ f: 'drawingNo', c: 0 }, { f: 'itemName', c: 1 }, { f: 'specification', c: 2 }] : [
                                    { f: 'itemName', c: 1 },
                                    ...(isPayDoc ? [] : [{ f: 'image', c: 2 }])
                                ]), 
                                { f: 'unit', c: 3 }, { f: 'qty', c: 4 }, { f: 'unitPrice', c: 5 }, { f: 'amount', c: 6 }, { f: 'remarks', c: 7 }
                            ].map(cell => {
                                const merge = dMerges[`${rIdx}-${cell.c}`];
                                const isSkipped = Object.entries(dMerges).some(([key, m]: [string, any]) => {
                                    const [mr, mc] = key.split('-').map(Number);
                                    return rIdx >= mr && rIdx < mr + m.rS && cell.c >= mc && cell.c < mc + m.cS && !(rIdx === mr && cell.c === mc);
                                });
                                if (isSkipped) return null;

                                const isSelected = selection && rIdx >= Math.min(selection.sR, selection.eR) && rIdx <= Math.max(selection.sR, selection.eR) && cell.c >= Math.min(selection.sC, selection.eC) && cell.c <= Math.max(selection.sC, selection.eC);
                                const align = dAligns[`${rIdx}-${cell.c}`] || (cell.f === 'itemName' ? 'left' : 'center');
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
                                                className={`w-full ${isPayDoc ? 'min-h-[30px]' : 'min-h-[80px]'} flex items-center justify-center p-1 bg-slate-50/30 print:bg-transparent relative`}
                                                onPaste={(e) => !isReadOnly && handlePaste(e, row.id, 'image' as any, isMetalDoc)}
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
                                                <div 
                                                  className={`p-0.5 w-full font-normal-print relative group/fileicon cursor-pointer ${isPayDoc ? 'text-[11px]' : ''}`} 
                                                  style={{ textAlign: align as any }}
                                                  onClick={(e) => {
                                                    // Request: Alt + Click to open file storage link even in read-only mode
                                                    if (e.altKey && (cell.f === 'itemName' || cell.f === 'drawingNo' || cell.f === 'specification')) {
                                                      e.preventDefault();
                                                      console.log('Alt+Click detected in Read-Only mode for row:', row.id);
                                                      fetchStorageFiles(); // Refresh file list
                                                      setTargetRowIdForFile(row.id);
                                                      setIsFileSelectorOpen(true);
                                                    }
                                                  }}
                                                >
                                                    {cell.f === 'amount' ? formatNumber(calculateAmount(row)) : (
                                                        (cell.f === 'qty' || cell.f === 'unitPrice') ? formatNumber(row[cell.f as keyof VietnamOrderRow]) : row[cell.f as keyof VietnamOrderRow]
                                                    )}
                                                    {cell.f === 'itemName' && row.fileUrl && (
                                                      <button 
                                                        onClick={(e) => { e.stopPropagation(); window.open(row.fileUrl, '_blank'); }}
                                                        className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center justify-center no-print"
                                                        title="도면 파일 보기"
                                                      >
                                                        <div className="w-2.5 h-2.5 bg-red-500 rounded-full shadow-[0_0_5px_rgba(239,68,68,0.5)] hover:scale-125 transition-transform"></div>
                                                      </button>
                                                    )}
                                                </div>
                                            ) : (
                                                cell.f === 'amount' ? (
                                                    <div 
                                                        className={`w-full text-right px-1 font-mono font-normal py-0.5 ${isPayDoc ? 'text-[11px]' : ''}`}
                                                        data-row={rIdx} data-col={cell.c} tabIndex={0}
                                                        onFocus={() => setSelection({ sR: rIdx, sC: cell.c, eR: rIdx, eC: cell.c })}
                                                    >
                                                        {formatNumber(calculateAmount(row))}
                                                    </div>
                                                ) : (
                                                    <div className="relative group/fileicon">
                                                      <AutoExpandingTextarea 
                                                          value={(cell.f === 'qty' || cell.f === 'unitPrice') ? formatNumber(row[cell.f as keyof VietnamOrderRow]) : row[cell.f as keyof VietnamOrderRow]} dataRow={rIdx} dataCol={cell.c}
                                                          onChange={(e: any) => {
                                                              let val = e.target.value;
                                                              if (cell.f === 'qty' || cell.f === 'unitPrice') {
                                                                  val = val.replace(/,/g, '');
                                                              }
                                                              updateRowField(row.id, cell.f as keyof VietnamOrderRow, val);
                                                          }} 
                                                          onFocus={() => { takeSnapshot(); setSelection({ sR: rIdx, sC: cell.c, eR: rIdx, eC: cell.c }); }}
                                                          onKeyDown={(e: any) => handleRowKeyDown(e, rIdx, cell.c, isPayDoc ? 'PAYMENT' : (isMetalDoc ? 'METAL' : 'ORDER'))}
                                                          onPaste={(e: any) => handlePaste(e, row.id, cell.f as keyof VietnamOrderRow, isMetalDoc)}
                                                          onClick={(e: React.MouseEvent) => {
                                                            // Request: Alt + Click to open file storage link
                                                            if (e.altKey && (cell.f === 'itemName' || cell.f === 'drawingNo' || cell.f === 'specification')) {
                                                              e.preventDefault();
                                                              console.log('Alt+Click detected in Editable mode for row:', row.id);
                                                              fetchStorageFiles(); // Refresh file list
                                                              setTargetRowIdForFile(row.id);
                                                              setIsFileSelectorOpen(true);
                                                            }
                                                          }}
                                                          style={{ textAlign: align, fontWeight: '400' }}
                                                          className={`${cell.f === 'qty' || cell.f === 'unitPrice' ? 'font-mono' : ''} ${isPayDoc ? 'p-0 text-[11px]' : 'p-1'} font-normal-print ${cell.f === 'itemName' ? 'pr-6' : ''}`}
                                                      />
                                                      {cell.f === 'itemName' && row.fileUrl && (
                                                        <button 
                                                          onClick={(e) => { e.stopPropagation(); window.open(row.fileUrl, '_blank'); }}
                                                          className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center justify-center no-print"
                                                          title="도면 파일 보기"
                                                        >
                                                          <div className="w-2.5 h-2.5 bg-red-500 rounded-full shadow-[0_0_5px_rgba(239,68,68,0.5)] hover:scale-125 transition-transform"></div>
                                                        </button>
                                                      )}
                                                    </div>
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
                    
                    <tr className={`bg-slate-50 print:bg-white ${isPayDoc || isMetalDoc || isOrderDoc ? 'h-5' : ''}`}>
                        <td colSpan={isPayDoc ? 5 : 6} className={`border border-black p-1 text-center ${isPayDoc || isMetalDoc || isOrderDoc ? 'text-xs' : 'text-sm'} tracking-wider uppercase font-bold-print`}>Cộng (합계 금액)부가세 제외</td>
                        <td colSpan={2} className={`border border-black p-1 text-right font-mono ${isPayDoc || isMetalDoc || isOrderDoc ? 'text-sm' : 'text-base'} font-bold-print`}>{formatNumber(subtotal)}</td>
                        {!isReadOnly && <td className="border border-black no-print"></td>}
                    </tr>
                    {(isPayDoc || isMetalDoc || isOrderDoc) && (
                      <>
                        <tr className="bg-slate-50 print:bg-white h-5">
                            <td colSpan={isPayDoc ? 5 : 6} className="border border-black p-1 text-center text-xs tracking-wider uppercase font-bold-print">
                                <div className="flex items-center justify-center gap-2">
                                    <span>Thuế</span>
                                    {isReadOnly ? <span className="font-normal-print">{dVatRate}</span> : <input type="number" value={vVatRate} onChange={e => setVVatRate(parseInt(e.target.value) || 0)} className="w-12 px-1 border rounded text-center font-normal-print"/>}
                                    <span>% 부가세</span>
                                </div>
                            </td>
                            <td colSpan={2} className="border border-black p-1 text-right font-mono text-sm font-bold-print">{formatNumber(vat)}</td>
                            {!isReadOnly && <td className="border border-black no-print"></td>}
                        </tr>
                        <tr className="bg-slate-100 print:bg-white h-5">
                            <td colSpan={isPayDoc ? 5 : 6} className="border border-black p-1 text-center text-xs tracking-wider uppercase font-bold-print">Tổng (총금액)</td>
                            <td colSpan={2} className="border border-black p-1 text-right font-mono text-sm font-bold-print">{formatNumber(total)}</td>
                            {!isReadOnly && <td className="border border-black no-print"></td>}
                        </tr>
                      </>
                    )}
                </tbody>
            </table>
          </div>

          {(isPayDoc || isMetalDoc || isOrderDoc) && (
            <>
              {isPayDoc && (
                <div className="mt-6 w-full border-2 border-slate-300 p-4 rounded-xl text-[12px] space-y-1">
                    <div className="flex items-center">
                        <span className="w-48 font-black shrink-0">Người thụ hưởng (수익자):</span>
                        {isReadOnly ? <span className="flex-1 font-black text-blue-800">{dBeneficiary}</span> : (
                          <div className="flex-1 flex gap-2 items-center">
                            <select 
                              value={vnBankVendors.find(v => v.beneficiary === vBeneficiary) ? vBeneficiary : ""} 
                              onChange={(e) => handleVnBankVendorSelect(e.target.value)}
                              className="bg-slate-50 border rounded px-1 py-0.5 text-[10px] outline-none w-20 shrink-0"
                            >
                              <option value="">직접입력</option>
                              {vnBankVendors.map(v => <option key={v.beneficiary} value={v.beneficiary}>{v.beneficiary}</option>)}
                            </select>
                            <input value={vBeneficiary} onChange={e => setVBeneficiary(e.target.value)} className="flex-1 outline-none font-black bg-slate-50/50 px-2 border-b border-dotted" placeholder="수익자 성명/업체명"/>
                          </div>
                        )}
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
              )}

              <div className="mt-4 w-full text-left">
                  <div className="text-[12px] font-black mb-1 px-1">REMARK (메모):</div>
                  {isReadOnly ? (
                    <div className="w-full min-h-[60px] p-1 text-[12px] font-bold whitespace-pre-wrap">
                        {dRemark || "내역 없음"}
                    </div>
                  ) : (
                    <AutoExpandingTextarea 
                        value={vRemark} 
                        onChange={(e: any) => setVRemark(e.target.value)} 
                        placeholder="특이사항을 입력하십시오..." 
                        className="w-full min-h-[80px] p-3 bg-white border border-slate-300 rounded-xl text-[12px] font-bold outline-none focus:ring-2 focus:ring-blue-500 print:border-none print:p-0"
                    />
                  )}
              </div>
            </>
          )}

          {!isReadOnly && (
              <div className="mt-8 flex justify-center gap-4 no-print pb-8">
                  <button onClick={() => handleSubmit(true)} className="px-10 py-4 bg-slate-400 text-white rounded-2xl font-black text-xl shadow-xl hover:bg-slate-500 active:scale-95 transition-all">임시 저장</button>
                  <button onClick={() => handleSubmit(false)} className="px-16 py-4 bg-indigo-600 text-white rounded-2xl font-black text-xl shadow-xl hover:bg-indigo-700 active:scale-95 transition-all">VN {isPayDoc ? '지불요청' : (isMetalDoc ? 'METAL 발주' : '주문서')} 작성완료</button>
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

  if (sub === VietnamSubCategory.ORDER || sub === VietnamSubCategory.PAYMENT || sub === VietnamSubCategory.METAL_ORDER || editingId) {
    let docType: 'ORDER' | 'PAYMENT' | 'METAL' = 'ORDER';
    if (editingId) {
        docType = items.find(it => it.id === editingId)?.type || 'ORDER';
    } else {
        if (sub === VietnamSubCategory.PAYMENT) docType = 'PAYMENT';
        else if (sub === VietnamSubCategory.METAL_ORDER) docType = 'METAL';
        else if (sub === VietnamSubCategory.ORDER) docType = 'ORDER';
    }

    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center max-w-5xl mx-auto no-print px-4">
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
                }} className="px-5 py-2.5 bg-white border rounded-xl font-bold text-sm shadow-sm">← 닫기</button>
            )}
            <button onClick={handleUndo} disabled={undoStack.length === 0} className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-black text-xs shadow-xl transition-all ${undoStack.length > 0 ? 'bg-slate-700 text-white hover:bg-black' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}>Undo ({undoStack.length})</button>
            {editingId && (
              <span className={`px-3 py-1 rounded-full text-[10px] font-black animate-pulse border uppercase ${items.find(it => it.id === editingId)?.status === VietnamSubCategory.TEMPORARY ? 'bg-amber-50 text-amber-600 border-amber-200' : 'bg-red-50 text-red-600 border-red-200'}`}>
                {items.find(it => it.id === editingId)?.status === VietnamSubCategory.TEMPORARY ? '임시저장 수정 중' : '반송 건 수정 중'}
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={() => setIsVnVendorManagerOpen(true)} className="px-5 py-2 bg-slate-900 text-white rounded-xl font-black text-xs shadow-lg hover:bg-slate-700 active:scale-95 transition-all">Khách hàng (수신처 관리)</button>
            {docType === 'PAYMENT' && (
              <button onClick={() => setIsVnBankVendorManagerOpen(true)} className="px-5 py-2 bg-indigo-600 text-white rounded-xl font-black text-xs shadow-lg hover:bg-indigo-700 active:scale-95 transition-all">Thụ hưởng (은행 관리)</button>
            )}
            <button onClick={handlePrint} className="px-6 py-2 bg-blue-600 text-white rounded-xl font-black text-xs shadow-lg hover:bg-blue-700">PDF 저장 / 인쇄</button>
          </div>
        </div>

        {isVnVendorManagerOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[150] flex items-center justify-center p-4 no-print">
            <div className="bg-white rounded-[2.5rem] p-8 w-full max-w-2xl shadow-2xl animate-in fade-in zoom-in duration-300 flex flex-col max-h-[85vh]">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-2xl font-black text-black">베트남 수신처(Khách hàng) 관리</h3>
                <button onClick={() => setIsVnVendorManagerOpen(false)} className="p-2 text-slate-400 hover:text-black">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
              </div>
              <div className="space-y-3 mb-6 p-6 bg-slate-50 rounded-3xl border border-slate-200">
                <input type="text" value={newVnVendor.name} onChange={e => setNewVnVendor({...newVnVendor, name: e.target.value})} placeholder="수신처 상호명" className="w-full px-4 py-2 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 font-bold"/>
                <input type="text" value={newVnVendor.address} onChange={e => setNewVnVendor({...newVnVendor, address: e.target.value})} placeholder="수신처 주소" className="w-full px-4 py-2 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 font-bold"/>
                <input type="text" value={newVnVendor.taxId} onChange={e => setNewVnVendor({...newVnVendor, taxId: e.target.value})} placeholder="Mã số thuế (사업자번호)" className="w-full px-4 py-2 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 font-bold"/>
                <input type="text" value={newVnVendor.tel} onChange={e => setNewVnVendor({...newVnVendor, tel: e.target.value})} placeholder="Số điện thoại (연락처)" className="w-full px-4 py-2 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 font-bold"/>
                <button onClick={handleSaveVnVendor} className="w-full py-3 bg-indigo-600 text-white rounded-xl font-black text-sm hover:bg-indigo-700 transition-all">수신처 저장</button>
              </div>
              <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar pr-2">
                {vnVendors.length === 0 ? (
                  <div className="py-12 text-center text-slate-400 italic font-bold">등록된 수신처가 없습니다.</div>
                ) : (
                  vnVendors.map(v => (
                    <div key={v.name} className="flex justify-between items-center p-4 bg-white border border-slate-100 rounded-2xl hover:bg-indigo-50 transition-colors group">
                      <div className="flex-1 min-w-0 pr-4">
                        <p className="font-black text-black truncate">{v.name}</p>
                        <p className="text-[10px] text-slate-400 truncate">{v.address}</p>
                        <div className="flex gap-3">
                          <p className="text-[10px] text-indigo-500 font-bold">MST: {v.taxId}</p>
                          {v.tel && <p className="text-[10px] text-rose-500 font-bold">TEL: {v.tel}</p>}
                        </div>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button onClick={() => setNewVnVendor(v)} className="text-xs font-bold text-indigo-600 hover:underline">편집</button>
                        <button onClick={() => { 
                          const filtered = vnVendors.filter(vendor => vendor.name !== v.name);
                          setVnVendors(filtered); 
                          localStorage.setItem('ajin_vn_vendors', JSON.stringify(filtered)); 
                          deleteRecipient(`vn-vendor-${v.name}`);
                          
                        }} className="text-xs font-bold text-red-500 hover:underline">삭제</button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {isVnBankVendorManagerOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[150] flex items-center justify-center p-4 no-print">
            <div className="bg-white rounded-[2.5rem] p-8 w-full max-w-2xl shadow-2xl animate-in fade-in zoom-in duration-300 flex flex-col max-h-[85vh]">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-2xl font-black text-black">베트남 은행 수신처(Thụ hưởng) 관리</h3>
                <button onClick={() => setIsVnBankVendorManagerOpen(false)} className="p-2 text-slate-400 hover:text-black">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
              </div>
              <div className="space-y-3 mb-6 p-6 bg-slate-50 rounded-3xl border border-slate-200">
                <input type="text" value={newVnBankVendor.beneficiary} onChange={e => setNewVnBankVendor({...newVnBankVendor, beneficiary: e.target.value})} placeholder="수익자 성명/업체명" className="w-full px-4 py-2 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 font-bold"/>
                <input type="text" value={newVnBankVendor.accountNo} onChange={e => setNewVnBankVendor({...newVnBankVendor, accountNo: e.target.value})} placeholder="은행 계좌번호" className="w-full px-4 py-2 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 font-bold"/>
                <div className="grid grid-cols-2 gap-3">
                  <input type="text" value={newVnBankVendor.bank} onChange={e => setNewVnBankVendor({...newVnBankVendor, bank: e.target.value})} placeholder="은행명 (예: VCB)" className="px-4 py-2 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 font-bold"/>
                  <input type="text" value={newVnBankVendor.bankAddr} onChange={e => setNewVnBankVendor({...newVnBankVendor, bankAddr: e.target.value})} placeholder="지점명 또는 주소" className="px-4 py-2 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 font-bold"/>
                </div>
                <button onClick={handleSaveVnBankVendor} className="w-full py-3 bg-indigo-600 text-white rounded-xl font-black text-sm hover:bg-indigo-700 transition-all">은행 수신처 저장</button>
              </div>
              <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar pr-2">
                {vnBankVendors.length === 0 ? (
                  <div className="py-12 text-center text-slate-400 italic font-bold">등록된 은행 수신처가 없습니다.</div>
                ) : (
                  vnBankVendors.map(v => (
                    <div key={v.beneficiary} className="flex justify-between items-center p-4 bg-white border border-slate-100 rounded-2xl hover:bg-indigo-50 transition-colors group">
                      <div className="flex-1 min-w-0 pr-4">
                        <p className="font-black text-black truncate">{v.beneficiary}</p>
                        <p className="text-[10px] text-blue-600 font-bold">{v.accountNo} | {v.bank}</p>
                        <p className="text-[10px] text-slate-400 truncate">{v.bankAddr}</p>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button onClick={() => setNewVnBankVendor(v)} className="text-xs font-bold text-indigo-600 hover:underline">편집</button>
                        <button onClick={() => { 
                          const filtered = vnBankVendors.filter(vendor => vendor.beneficiary !== v.beneficiary);
                          setVnBankVendors(filtered); 
                          localStorage.setItem('ajin_vn_bank_vendors', JSON.stringify(filtered)); 
                          deleteRecipient(`vn-bank-${v.beneficiary}`);
                          
                        }} className="text-xs font-bold text-red-500 hover:underline">삭제</button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {selection && (
          <div 
            style={{ transform: `translate(calc(-50% + ${toolPos.x}px), ${toolPos.y}px)` }}
            className="fixed bottom-10 landscape:bottom-2 left-1/2 z-[100] no-print bg-white/90 backdrop-blur shadow-2xl border border-slate-200 p-3 landscape:p-1.5 rounded-2xl flex items-center gap-3 animate-in slide-in-from-bottom-5"
          >
            <span 
              onMouseDown={handleToolMouseDown}
              className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2 border-r border-slate-100 hidden landscape:block cursor-move select-none active:text-blue-600 transition-colors"
            >
              Cell Tools
            </span>
            <button onClick={handleMerge} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-bold shadow-sm transition-all whitespace-nowrap">셀 병합</button>
            <button onClick={handleUnmerge} className="px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-xs font-bold shadow-sm transition-all whitespace-nowrap">병합 해제</button>
            <div className="flex bg-slate-100 p-1 rounded-lg">
                <button onClick={() => handleApplyAlign('left')} className="p-1.5 hover:bg-white rounded transition-all"><svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor"><path d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 5a1 1 0 011-1h6a1 1 0 110 2H4a1 1 0 01-1-1zm0 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z"/></svg></button>
                <button onClick={() => handleApplyAlign('center')} className="p-1.5 hover:bg-white rounded transition-all"><svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor"><path d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3 5a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm-3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z"/></svg></button>
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

        <div className="py-8 landscape:py-2 bg-slate-200 min-h-screen overflow-x-auto">
          {renderDocument({ id: 'preview', type: docType, stamps: { writer: { userId: currentUser.initials, timestamp: new Date().toLocaleString() } } } as any, false)}
        </div>

        {renderFileSelectorModal()}
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
            <div className="grid grid-cols-2 landscape:grid-cols-6 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-6">
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
                                <div className={`absolute top-0 left-0 w-full h-1 transition-opacity ${item.status === VietnamSubCategory.REJECTED ? 'bg-red-500' : item.status === VietnamSubCategory.TEMPORARY ? 'bg-amber-500' : (item.type === 'PAYMENT' ? 'bg-rose-500' : (item.type === 'METAL' ? 'bg-emerald-500' : 'bg-indigo-500'))}`}></div>
                                <div className={`w-16 h-20 ${item.status === VietnamSubCategory.TEMPORARY ? 'bg-amber-50 text-amber-600' : (item.type === 'PAYMENT' ? 'bg-rose-50 text-rose-600' : (item.type === 'METAL' ? 'bg-emerald-50 text-emerald-600' : 'bg-indigo-50 text-indigo-600'))} rounded-xl flex items-center justify-center mb-4 group-hover:scale-105 transition-transform border border-transparent`}>
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.status === VietnamSubCategory.TEMPORARY ? "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" : "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"}/>
                                    </svg>
                                </div>
                                <div className={`absolute top-2 right-2 px-2 py-0.5 rounded-full text-[8px] font-black uppercase ${item.type === 'PAYMENT' ? 'bg-rose-100 text-rose-600' : (item.type === 'METAL' ? 'bg-emerald-100 text-emerald-600' : 'bg-indigo-100 text-indigo-600')}`}>
                                    {item.type === 'PAYMENT' ? 'PAY' : (item.type === 'METAL' ? 'ORDER' : 'PO')}
                                </div>
                                <h3 className="font-black text-sm truncate w-full mb-0.5">{item.clientName}</h3>
                                {item.modelName && <p className="text-[11px] font-black text-indigo-600 truncate w-full mb-1">{item.modelName}</p>}
                                <p className="text-[10px] text-slate-400 font-bold uppercase">{item.date}</p>
                                
                                <div className="flex gap-2 mt-4">
                                    <div className={`w-4 h-4 rounded-full ${item.stamps.writer ? 'bg-indigo-500' : 'bg-slate-200'}`} title="작성"></div>
                                    <div className={`w-4 h-4 rounded-full ${item.stamps.head ? 'bg-indigo-500' : 'bg-slate-200'}`} title="법인장"></div>
                                    {(item.type === 'METAL' || item.type === 'ORDER') && <div className={`w-4 h-4 rounded-full ${item.stamps.ceo ? 'bg-red-500' : 'bg-slate-200'}`} title="대표"></div>}
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
                                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${item.type === 'PAYMENT' ? 'bg-rose-100 text-rose-600' : (item.type === 'METAL' ? 'bg-emerald-100 text-emerald-600' : 'bg-indigo-100 text-indigo-600')}`}>
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

        {renderFileSelectorModal()}
    </div>
  );
};

export default VietnamOrderView;
