
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { PurchaseOrderSubCategory, PurchaseOrderItem, OrderRow, UserAccount, ViewState, PurchaseOrderNote } from '../types';
import { pushStateToCloud, supabase } from '../supabase';

interface PurchaseOrderViewProps {
  sub: PurchaseOrderSubCategory;
  currentUser: UserAccount;
  setView: (v: ViewState) => void;
  dataVersion: number;
}

interface VendorInfo {
  name: string;
  tel: string;
  remarks: string;
}

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
      className={`w-full bg-transparent resize-none overflow-hidden outline-none p-1 block whitespace-pre-wrap ${className}`}
      rows={1}
    />
  );
});

const formatCompletionDate = (isoString: string) => {
  const date = new Date(isoString);
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  let hh = date.getHours();
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  const ampm = hh >= 12 ? 'pm' : 'am';
  hh = hh % 12;
  hh = hh ? hh : 12; 
  return `${y}. ${m}. ${d}. ${ampm} ${hh}:${mm}:${ss}`;
};

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

const PurchaseOrderView: React.FC<PurchaseOrderViewProps> = ({ sub, currentUser, setView, dataVersion }) => {
  const [items, setItems] = useState<PurchaseOrderItem[]>([]);
  const [activeItem, setActiveItem] = useState<PurchaseOrderItem | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [filePage, setFilePage] = useState(1);
  const itemsPerPage = 10;
  const isMaster = currentUser.loginId === 'AJ5200';
  const [viewMode, setViewMode] = useState<'ICON' | 'LIST'>('ICON');
  const [sortOrder, setSortOrder] = useState<'DESC' | 'ASC'>('DESC');

  // Add missing state variables for editing and merging
  const [po1HeaderRows, setPo1HeaderRows] = useState<string[]>([]);
  const [po1Merges, setPo1Merges] = useState<Record<string, { rS: number, cS: number }>>({});
  const [po1Aligns, setPo1Aligns] = useState<Record<string, 'left' | 'center' | 'right'>>({});
  const [po1Weights, setPo1Weights] = useState<Record<string, 'normal' | 'bold'>>({});
  const [po1Borders, setPo1Borders] = useState<Record<string, { t?: string, b?: string, l?: string, r?: string }>>({});
  const [po1Selection, setPo1Selection] = useState<{ sR: number, sC: number, eR: number, eC: number } | null>(null);
  const [hideInjectionColumn, setHideInjectionColumn] = useState(false);
  const [injectionSearch, setInjectionSearch] = useState('');
  const [undoStack, setUndoStack] = useState<string[]>([]);

  const [files, setFiles] = useState<StorageFile[]>([]);
  const [isFilesLoading, setIsFilesLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [fileSortField, setFileSortField] = useState<'name' | 'created_at' | 'size'>('created_at');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [vendors, setVendors] = useState<VendorInfo[]>([]);
  const [isVendorManagerOpen, setIsVendorManagerOpen] = useState(false);
  const [newVendor, setNewVendor] = useState<VendorInfo>({ name: '', tel: '', remarks: '' });
  const [selectedArchiveVendor, setSelectedArchiveVendor] = useState<string | null>(null);

  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [rejectReasonText, setRejectReasonText] = useState('');
  const [itemToReject, setItemToReject] = useState<string | null>(null);

  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [originalRejectedItem, setOriginalRejectedItem] = useState<PurchaseOrderItem | null>(null);
  
  const [modal, setModal] = useState<{
    type: 'DELETE_FILE' | 'DELETE_STORAGE_FILE' | 'ALERT';
    message: string;
    onConfirm: () => void;
  } | null>(null);

  const defaultNotes = [
    { label: '납품장소', content: '㈜ 아진정공 대천공장 (충남 보령시 대해로 425-23 (요암동 63번지))' },
    { label: '납기일자', content: '2025년 08월 12일' },
    { label: '지불조건', content: '양산납품 후 세금계산서 기준일자 30일이내에 현금결재 (무통장입금)' },
    { label: '별 첨', content: '도면 첨부' },
    { label: '기타사항(유의)', content: '이물질 없도록 주의 바랍니다.' },
    { label: '금형용 기준', content: '도면참조' }
  ];

  const [po2Title, setPo2Title] = useState('');
  const [po2Recipient, setPo2Recipient] = useState('');
  const [po2TelFax, setPo2TelFax] = useState('');
  const [po2Reference, setPo2Reference] = useState('');
  const [po2SenderName, setPo2SenderName] = useState('㈜ 아진정공');
  const [po2SenderPerson, setPo2SenderPerson] = useState('');
  const [po2Date, setPo2Date] = useState(new Date().toLocaleDateString('ko-KR'));
  const [po2Rows, setPo2Rows] = useState<OrderRow[]>([]);
  const [po2Notes, setPo2Notes] = useState<PurchaseOrderNote[]>(defaultNotes);

  // Define takeSnapshot for undo functionality
  const takeSnapshot = useCallback(() => {
    const data = JSON.stringify({
      title: po2Title,
      recipient: po2Recipient,
      telFax: po2TelFax,
      reference: po2Reference,
      senderName: po2SenderName,
      senderPerson: po2SenderPerson,
      date: po2Date,
      rows: po2Rows,
      notes: po2Notes,
      headerRows: po1HeaderRows,
      merges: po1Merges,
      aligns: po1Aligns,
      weights: po1Weights,
      borders: po1Borders,
      hideInjectionColumn: hideInjectionColumn
    });
    setUndoStack(prev => [data, ...prev].slice(0, 50));
  }, [po2Title, po2Recipient, po2TelFax, po2Reference, po2SenderName, po2SenderPerson, po2Date, po2Rows, po2Notes, po1HeaderRows, po1Merges, po1Aligns, po1Weights, po1Borders, hideInjectionColumn]);

  // Define handleUndo for undo functionality
  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    const [last, ...rest] = undoStack;
    try {
      const data = JSON.parse(last);
      setPo2Title(data.title);
      setPo2Recipient(data.recipient);
      setPo2TelFax(data.telFax);
      setPo2Reference(data.reference);
      setPo2SenderName(data.senderName);
      setPo2SenderPerson(data.senderPerson);
      setPo2Date(data.date);
      setPo2Rows(data.rows);
      setPo2Notes(data.notes);
      setPo1HeaderRows(data.headerRows || []);
      setPo1Merges(data.merges || {});
      setPo1Aligns(data.aligns || {});
      setPo1Weights(data.weights || {});
      setPo1Borders(data.borders || {});
      setHideInjectionColumn(data.hideInjectionColumn || false);
      setUndoStack(rest);
    } catch (e) { console.error('Undo failed', e); }
  }, [undoStack]);

  // Handle changes in the notes section
  const handleNoteChange = (idx: number, field: 'label' | 'content', value: string) => {
    takeSnapshot();
    setPo2Notes(prev => prev.map((n, i) => i === idx ? { ...n, [field]: value } : n));
  };

  // Calculate row amount based on quantity and unit price
  const calculateAmount = (row: OrderRow, isPO1: boolean) => {
    const qStr = isPO1 ? (row.orderQty || '') : (row.price || '');
    const uStr = row.unitPrice || '';
    const q = parseFloat(String(qStr).replace(/[,]/g, '')) || 0;
    const u = parseFloat(String(uStr).replace(/[,]/g, '')) || 0;
    return q * u;
  };

  // Get totals including subtotal, vat, and grand total
  const getTotals = (rows: OrderRow[], isPO1: boolean = false) => {
    const subtotal = rows.reduce((acc, row) => acc + calculateAmount(row, isPO1), 0);
    const vat = Math.floor(subtotal * 0.1);
    return { subtotal, vat, total: subtotal + vat };
  };

  // Open the rejection modal
  const openRejectModal = (id: string) => {
    setItemToReject(id);
    setRejectReasonText('');
    setIsRejectModalOpen(true);
  };

  // Finalize document archiving
  const handleFinalArchive = (item: PurchaseOrderItem) => {
    const updatedStamps = { ...item.stamps, final: { userId: currentUser.initials, timestamp: new Date().toLocaleString() } };
    const updated = items.map(it => it.id === item.id ? { ...it, stamps: updatedStamps, status: PurchaseOrderSubCategory.ARCHIVE } : it);
    saveItems(updated);
    alert('최종 보관 처리가 완료되었습니다.');
    setActiveItem(null);
  };

  // Handle document printing
  const handlePrint = () => {
    const content = document.querySelector('.document-print-content')?.innerHTML;
    if (!content) return;
    const win = window.open('', '_blank');
    if (win) {
      win.document.write(`
        <html><head><title>PO_${activeItem?.title || 'DOC'}</title><script src="https://cdn.tailwindcss.com"></script>
        <style>
          @page { size: A4 portrait; margin: 10mm; }
          body { font-family: 'Gulim', sans-serif; padding: 20px; }
          .no-print { display: none !important; }
          table { border-collapse: collapse; width: 100%; }
          th, td { border: 1px solid black; padding: 4px; vertical-align: middle; }
        </style>
        </head><body onload="window.print();">
          <div>${content}</div>
        </body></html>
      `);
      win.document.close();
    }
  };

  // Delete an item from the list
  const handleDeleteItemFromList = (id: string) => {
    setModal({
      type: 'DELETE_FILE',
      message: '이 발주서를 영구 삭제하시겠습니까? (복구 불가)',
      onConfirm: () => {
        const filtered = items.filter(it => it.id !== id);
        saveItems(filtered);
        setModal(null);
        alert('삭제되었습니다.');
      }
    });
  };

  // Filter for archived items
  const archivedItems = useMemo(() => items.filter(item => item.status === PurchaseOrderSubCategory.ARCHIVE || !!item.stamps.final), [items]);

  const getApprovalSlots = useCallback((type: string, recipient: string) => {
    const isPO1 = type === PurchaseOrderSubCategory.PO1 || type === PurchaseOrderSubCategory.PO1_TEMP || type === '사출발주서';
    const isAjin = recipient?.trim().toUpperCase() === 'AJIN';
    if (isPO1) {
      return isAjin ? ['writer', 'design', 'director', 'ceo'] : ['writer', 'design', 'director'];
    }
    return ['writer', 'design', 'director', 'ceo'];
  }, []);

  const getStampLabel = (key: string) => {
    switch(key) {
      case 'writer': return '담 당';
      case 'design': return '설 계';
      case 'director': return '이 사';
      case 'ceo': return '대 표';
      default: return '';
    }
  };

  const fetchStorageFiles = useCallback(async () => {
    setIsFilesLoading(true);
    try {
      let combinedFiles: StorageFile[] = [];
      if (supabase) {
        const { data, error } = await supabase.storage.from('purchase-orders').list('', {
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
    if (sub === PurchaseOrderSubCategory.UPLOAD) fetchStorageFiles();
  }, [sub, fetchStorageFiles]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== 'application/pdf') {
      alert('PDF 파일만 업로드 가능합니다.');
      return;
    }
    setIsUploading(true);
    try {
      const cleanName = file.name.replace(/[^a-zA-Z0-9ㄱ-ㅎㅏ-ㅣ가-힣._-]/g, '');
      const fileName = `${Date.now()}_${cleanName}`;
      if (supabase) {
        const { error } = await supabase.storage.from('purchase-orders').upload(fileName, file);
        if (error) throw error;
      } else {
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64data = reader.result as string;
          const mockFile: StorageFile = {
            id: `mock-${Date.now()}`,
            name: fileName,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            last_accessed_at: new Date().toISOString(),
            metadata: { size: file.size, mimetype: file.type },
            isMock: true,
            base64: base64data
          };
          const currentMock = JSON.parse(localStorage.getItem('ajin_mock_storage') || '[]');
          localStorage.setItem('ajin_mock_storage', JSON.stringify([mockFile, ...currentMock]));
          alert('가상 저장소(LocalStorage)에 파일이 임시 저장되었습니다.');
          await fetchStorageFiles();
        };
        reader.readAsDataURL(file);
      }
      if (supabase) {
        alert('파일 업로드가 완료되었습니다.');
        await fetchStorageFiles();
      }
    } catch (err: any) {
      console.error('Upload error:', err);
      alert(`업로드 중 오류가 발생했습니다: ${err.message || '알 수 없는 오류'}`);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleFileDownload = async (file: StorageFile) => {
    try {
      if (file.isMock && file.base64) {
        const link = document.createElement('a');
        link.href = file.base64;
        link.download = file.name.split('_').slice(1).join('_') || file.name;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } else if (supabase) {
        const { data, error } = await supabase.storage.from('purchase-orders').download(file.name);
        if (error) throw error;
        const url = URL.createObjectURL(data);
        const link = document.createElement('a');
        link.href = url;
        link.download = file.name.split('_').slice(1).join('_') || file.name;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error('Download error:', err);
      alert('다운로드 중 오류가 발생했습니다.');
    }
  };

  const handleFileDeleteFromStorage = (file: StorageFile) => {
    setModal({
      type: 'DELETE_STORAGE_FILE',
      message: `[${file.name.split('_').slice(1).join('_') || file.name}] 파일을 영구 삭제하시겠습니까?`,
      onConfirm: async () => {
        try {
          if (file.isMock) {
            const currentMock = JSON.parse(localStorage.getItem('ajin_mock_storage') || '[]');
            const updatedMock = currentMock.filter((f: any) => f.name !== file.name);
            localStorage.setItem('ajin_mock_storage', JSON.stringify(updatedMock));
          } else if (supabase) {
            const { error } = await supabase.storage.from('purchase-orders').remove([file.name]);
            if (error) throw error;
          }
          alert('삭제되었습니다.');
          fetchStorageFiles();
        } catch (err) {
          console.error('Delete error:', err);
          alert('삭제 중 오류가 발생했습니다.');
        } finally {
          setModal(null);
        }
      }
    });
  };

  const isWritingAnyPO = sub === PurchaseOrderSubCategory.PO1 || sub === PurchaseOrderSubCategory.PO2 || sub === PurchaseOrderSubCategory.PO3;

  const createEmptyRow = () => ({
    id: Math.random().toString(36).substr(2, 9),
    dept: '', model: '', itemName: '', price: '', unitPrice: '', amount: '', remarks: '',
    s: '', cty: '', material: '', vendor: '', injectionVendor: '', orderQty: '',
    changedFields: []
  });

  const updatePo2RowField = useCallback((rowId: string, field: keyof OrderRow, value: string) => {
    setPo2Rows(prev => prev.map(row => {
      if (row.id === rowId) {
        let updatedFields = row.changedFields ? [...row.changedFields] : [];
        const snapshot = originalRejectedItem?.rejectionSnapshot;
        if (snapshot) {
          const oriRow = snapshot.rows.find(r => r.id === rowId);
          const oriValue = oriRow ? (oriRow[field] || '') : '';
          if (String(value).trim() !== String(oriValue).trim()) {
            if (!updatedFields.includes(field)) updatedFields.push(field);
          } else {
            updatedFields = updatedFields.filter(f => f !== field);
          }
        }
        return { ...row, [field]: value, changedFields: updatedFields };
      }
      return row;
    }));
  }, [originalRejectedItem]);

  const isFieldChangedComp = useCallback((current: any, original: any) => {
    if (!originalRejectedItem || !originalRejectedItem.rejectionSnapshot) return false;
    return (current || '').toString().trim() !== (original || '').toString().trim();
  }, [originalRejectedItem]);

  useEffect(() => {
    if (sub === PurchaseOrderSubCategory.PO2) {
      setPo2SenderPerson('이상구 010-6212-6945');
      setPo2Notes(defaultNotes);
      setPo2Rows(Array(10).fill(null).map(createEmptyRow));
      setPo1HeaderRows([]); setPo1Merges({}); setPo1Aligns({}); setPo1Weights({}); setPo1Borders({}); setUndoStack([]); setEditingItemId(null); setHideInjectionColumn(false); setOriginalRejectedItem(null);
    } else if (sub === PurchaseOrderSubCategory.PO3) {
      setPo2SenderPerson('이재성 010-6342-5656');
      setPo2Notes([{ label: '납품장소', content: '(주) 아진정공' }, { label: '별 첨', content: '도면 첨부' }, { label: '기타사항(유의)', content: '여유수량 3%, 도면치수 준수' }]);
      setPo2Rows(Array(10).fill(null).map(createEmptyRow));
      setPo1HeaderRows([]); setPo1Merges({}); setPo1Aligns({}); setPo1Weights({}); setPo1Borders({}); setUndoStack([]); setEditingItemId(null); setHideInjectionColumn(false); setOriginalRejectedItem(null);
    } else if (sub === PurchaseOrderSubCategory.PO1) {
      setPo2SenderPerson('김미숙 010-9252-1565');
      setPo2Notes([{ label: '주의', content: '제품의 미성형, 수축, 웰드, 바리, 재질 및 치수에 유의' }, { label: '여유', content: '기본 Loss 2%' }, { label: '기타', content: '양산 완료 후 최종 부품을 10ST씩 의뢰합니다.' }]);
      setPo2Rows(Array(12).fill(null).map(createEmptyRow));
      setPo1HeaderRows(['', '']); setPo1Merges({}); setPo1Aligns({}); setPo1Weights({}); setPo1Borders({}); setUndoStack([]); setEditingItemId(null); setInjectionSearch(''); setHideInjectionColumn(false); setOriginalRejectedItem(null);
    }
  }, [sub]);

  useEffect(() => {
    if (isWritingAnyPO) {
      const buffer = localStorage.getItem('ajin_po_copy_buffer');
      if (buffer) {
        const data = JSON.parse(buffer);
        setPo2Title(data.title || ''); setPo2Recipient(data.recipient || ''); setPo2TelFax(data.telFax || ''); setPo2Reference(data.reference || ''); setPo2SenderName(data.senderName || '㈜ 아진정공');
        setPo2SenderPerson(data.senderPerson || '');
        setPo2Rows(data.rows || []); setPo2Notes(data.notes || []); setPo1HeaderRows(data.headerRows || []); setPo1Merges(data.merges || {}); setPo1Aligns(data.aligns || {}); setPo1Weights(data.weights || {}); setPo1Borders(data.borders || {}); setHideInjectionColumn(data.hideInjectionColumn || false);
        localStorage.removeItem('ajin_po_copy_buffer');
      }
    }
  }, [sub]);

  useEffect(() => {
    const saved = localStorage.getItem('ajin_purchase_orders');
    if (saved) setItems(JSON.parse(saved));
    const savedVendors = localStorage.getItem('ajin_vendors');
    if (savedVendors) setVendors(JSON.parse(savedVendors));
  }, [dataVersion]);

  const saveItems = (newItems: PurchaseOrderItem[]) => {
    setItems(newItems);
    localStorage.setItem('ajin_purchase_orders', JSON.stringify(newItems));
    pushStateToCloud();
  };

  const handleRecipientSelect = (name: string) => {
    const vendor = vendors.find(v => v.name === name);
    if (vendor) {
      setPo2Recipient(vendor.name);
      setPo2TelFax(vendor.tel);
    } else setPo2Recipient(name);
  };

  const handlePo2Submit = (isTemp: boolean = false) => {
    if (!po2Title.trim()) {
      alert('기종/제목을 입력해야 합니다.');
      return;
    }
    let targetStatus: PurchaseOrderSubCategory;
    const currentType = editingItemId ? items.find(i => i.id === editingItemId)?.type : sub;
    if (isTemp) {
      if (currentType === PurchaseOrderSubCategory.PO1) targetStatus = PurchaseOrderSubCategory.PO1_TEMP;
      else if (currentType === PurchaseOrderSubCategory.PO3) targetStatus = PurchaseOrderSubCategory.PO3_TEMP;
      else targetStatus = PurchaseOrderSubCategory.PO2_TEMP;
    } else targetStatus = PurchaseOrderSubCategory.PENDING;

    if (editingItemId) {
      const updated = items.map(item => {
        if (item.id === editingItemId) {
          return {
            ...item, title: po2Title, recipient: po2Recipient, telFax: po2TelFax, reference: po2Reference, senderName: po2SenderName, senderPerson: po2SenderPerson, status: targetStatus, date: po2Date,
            rows: po2Rows.filter(r => r.itemName?.trim() || r.model?.trim() || (r as any).dept?.trim()),
            notes: po2Notes, headerRows: po1HeaderRows.filter(r => r.trim() !== ''), merges: po1Merges, aligns: po1Aligns, weights: po1Weights, borders: po1Borders, isResubmitted: !isTemp && item.status === PurchaseOrderSubCategory.REJECTED, hideInjectionColumn: hideInjectionColumn,
            stamps: { writer: { userId: currentUser.initials, timestamp: new Date().toLocaleString() } },
            rejectReason: undefined, rejectLog: undefined
          };
        }
        return item;
      });
      saveItems(updated); alert(isTemp ? "임시 저장되었습니다." : "제출되었습니다."); setEditingItemId(null); setOriginalRejectedItem(null);
    } else {
      const newItem: PurchaseOrderItem = {
        id: `${currentType}-${Date.now()}`, code: '', title: po2Title, type: currentType as string, recipient: po2Recipient, telFax: po2TelFax, reference: po2Reference, senderName: po2SenderName, senderPerson: po2SenderPerson, status: targetStatus, authorId: currentUser.initials, date: po2Date, createdAt: new Date().toISOString(),
        rows: po2Rows.filter(r => r.itemName?.trim() || r.model?.trim() || (r as any).dept?.trim()),
        notes: po2Notes, stamps: { writer: { userId: currentUser.initials, timestamp: new Date().toLocaleString() } }, headerRows: po1HeaderRows.filter(r => r.trim() !== ''), merges: po1Merges, aligns: po1Aligns, weights: po1Weights, borders: po1Borders, hideInjectionColumn: hideInjectionColumn
      };
      saveItems([newItem, ...items]); alert(isTemp ? "임시 저장되었습니다." : "제출되었습니다.");
    }
    setView({ type: 'PURCHASE', sub: targetStatus });
  };

  const confirmReject = () => {
    if (!itemToReject || !rejectReasonText.trim()) return;
    const updated = items.map(item => {
      if (item.id === itemToReject) {
        // Capture snapshot before rejection to highlight future changes
        const snapshot = {
          title: item.title, recipient: item.recipient, telFax: item.telFax, reference: item.reference, senderName: item.senderName, senderPerson: item.senderPerson, date: item.date,
          rows: item.rows, notes: item.notes, headerRows: item.headerRows
        };
        return { 
          ...item, status: PurchaseOrderSubCategory.REJECTED, rejectReason: rejectReasonText, rejectionSnapshot: snapshot,
          rejectLog: { userId: currentUser.initials, timestamp: new Date().toLocaleString() } 
        };
      }
      return item;
    });
    saveItems(updated); setIsRejectModalOpen(false); setItemToReject(null); setActiveItem(null); setView({ type: 'PURCHASE', sub: PurchaseOrderSubCategory.REJECTED });
  };

  const handleEditRejectedItem = (item: PurchaseOrderItem) => {
    setEditingItemId(item.id); setOriginalRejectedItem(item);
    setPo2Title(item.title); setPo2Recipient(item.recipient || ''); setPo2TelFax(item.telFax || ''); setPo2Reference(item.reference || ''); setPo2SenderName(item.senderName || '㈜ 아진정공'); setPo2SenderPerson(item.senderPerson || ''); setPo2Date(item.date);
    setPo2Rows(item.rows.length >= 10 ? item.rows : [...item.rows, ...Array(10 - item.rows.length).fill(null).map(createEmptyRow)]);
    setPo2Notes(item.notes || []); setPo1HeaderRows(item.headerRows || []); setPo1Merges(item.merges || {}); setPo1Aligns(item.aligns || {}); setPo1Weights(item.weights || {}); setPo1Borders(item.borders || {}); setHideInjectionColumn(item.hideInjectionColumn || false); setActiveItem(null);
  };

  const handleMergeAction = useCallback(() => {
    if (!po1Selection) return;
    const { sR, sC, eR, eC } = po1Selection;
    const minR = Math.min(sR, eR), maxR = Math.max(sR, eR), minC = Math.min(sC, eC), maxC = Math.max(sC, eC);
    if (minR === maxR && minC === maxC) return;
    takeSnapshot();
    const newMerges = { ...po1Merges };
    const rowSpan = maxR - minR + 1, colSpan = maxC - minC + 1;
    for (let r = minR; r <= maxR; r++) { for (let c = minC; c <= maxC; c++) delete newMerges[`${r}-${c}`]; }
    newMerges[`${minR}-${minC}`] = { rS: rowSpan, cS: colSpan };
    setPo1Merges(newMerges); setPo1Selection(null);
  }, [po1Selection, po1Merges, takeSnapshot]);

  if (isWritingAnyPO || !!editingItemId) {
    const currentItemType = editingItemId ? items.find(i => i.id === editingItemId)?.type : sub;
    const isPO1Now = currentItemType === PurchaseOrderSubCategory.PO1 || currentItemType === PurchaseOrderSubCategory.PO1_TEMP;
    const isPO3Now = currentItemType === PurchaseOrderSubCategory.PO3 || currentItemType === PurchaseOrderSubCategory.PO3_TEMP;
    const { subtotal, vat, total } = getTotals(po2Rows, isPO1Now);
    const emailAddr = isPO1Now ? 'misuk.kim@ajinpre.net' : (isPO3Now ? 'jaesung.lee@ajinpre.net' : 'sangku.lee@ajinpre.net');
    const tableCols = isPO1Now ? 
      [{ f: 'dept', cIdx: 0, label: 'MOLD', w: 'w-[6%]' }, { f: 'model', cIdx: 1, label: 'DN', w: 'w-[6%]' }, { f: 's', cIdx: 2, label: 'S', w: 'w-6' }, { f: 'itemName', cIdx: 3, label: 'PART NAME', w: 'flex-1' }, { f: 'cty', cIdx: 4, label: 'C\'TY', w: 'w-8' }, { f: 'price', cIdx: 5, label: 'Q\'TY', w: 'w-8' }, { f: 'material', cIdx: 6, label: 'MATERIAL', w: 'w-[10%]' }, { f: 'vendor', cIdx: 7, label: '금형업체', w: 'w-[5%]' }, { f: 'injectionVendor', cIdx: 8, label: '사출업체', w: 'w-[5%]' }, { f: 'orderQty', cIdx: 9, label: '주문수량', w: 'w-[5.3%]' }, { f: 'unitPrice', cIdx: 10, label: '단가', w: 'w-[5%]' }, { f: 'amount', cIdx: 11, label: '금액', w: 'w-[8%]' }, { f: 'remarks', cIdx: 12, label: '비고', w: 'w-[10%]' }] :
      (isPO3Now ? [{ f: 'dept', cIdx: 0, label: '도 번', w: 'w-[11%]' }, { f: 'itemName', cIdx: 1, label: '품 명', w: 'flex-1' }, { f: 'model', cIdx: 2, label: '규 격', w: 'w-[13.3%]' }, { f: 'price', cIdx: 3, label: '수 량', w: 'w-[8%]' }, { f: 'unitPrice', cIdx: 4, label: '단 가', w: 'w-[9.6%]' }, { f: 'amount', cIdx: 5, label: '금 액', w: 'w-[15%]' }, { f: 'remarks', cIdx: 6, label: '비 고', w: 'w-[15%]' }] : 
      [{ f: 'itemName', cIdx: 0, label: '품 명', w: 'flex-1' }, { f: 'model', cIdx: 1, label: '규 격', w: 'w-[20%]' }, { f: 'price', cIdx: 2, label: '수 량', w: 'w-[10%]' }, { f: 'unitPrice', cIdx: 3, label: '단 가', w: 'w-[12%]' }, { f: 'amount', cIdx: 4, label: '금 액', w: 'w-[15%]' }, { f: 'remarks', cIdx: 5, label: '비 고', w: 'w-[15%]' }]);
    
    const visibleSlots = getApprovalSlots(currentItemType as string, po2Recipient);
    const snap = originalRejectedItem?.rejectionSnapshot;

    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center max-w-[1000px] mx-auto no-print px-4">
          <div className="flex gap-2 items-center">
            {editingItemId && <button onClick={() => { setEditingItemId(null); setView({ type: 'PURCHASE', sub: originalRejectedItem?.status || PurchaseOrderSubCategory.REJECTED }); }} className="flex items-center gap-2 px-5 py-2.5 bg-white border border-slate-300 rounded-2xl font-bold text-sm shadow-sm hover:bg-slate-50 transition-all active:scale-95">← 목록으로</button>}
            <button onClick={handleUndo} disabled={undoStack.length === 0} className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl font-black text-sm shadow-xl transition-all active:scale-95 ${undoStack.length > 0 ? 'bg-slate-700 text-white hover:bg-slate-900' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}>되돌리기 ({undoStack.length})</button>
          </div>
          <button onClick={() => setIsVendorManagerOpen(true)} className="flex items-center gap-2 px-6 py-2.5 bg-slate-900 text-white rounded-2xl font-black text-sm shadow-xl hover:bg-slate-700 transition-all active:scale-95">수신처 관리</button>
        </div>
        <div className="py-4 md:py-8 bg-slate-200 min-h-screen overflow-x-auto overflow-y-auto">
          <div className="bg-white border-[1px] border-slate-200 shadow-2xl mx-auto p-4 md:p-12 min-h-[297mm] w-full max-w-[1000px] text-black font-gulim text-left overflow-x-auto">
            <div className="min-w-[800px]">
              <div className="flex flex-col items-center mb-1"><h1 className="text-4xl font-black tracking-[0.5rem] mb-2 uppercase">주 식 회 사 아 진 정 공</h1><p className="text-sm font-bold text-slate-500">☎ (02) 894-2611 FAX (02) 802-9941 <span className="ml-4 text-blue-600 underline">{emailAddr}</span></p><div className="w-full h-1 bg-black mt-2"></div></div>
              <div className="flex justify-between items-end mb-1 relative border-b border-black pb-0"><div className="text-5xl font-black tracking-[2rem] uppercase leading-none pb-4 ml-20">발 주 서</div><table className="border-collapse border-black border-[1px] text-center text-[11px] w-auto"><tbody><tr><td rowSpan={2} className="border border-black px-1 py-4 bg-slate-50 font-bold w-10">결 재</td>{visibleSlots.map(slot => (<td key={slot} className="border border-black py-1 px-4 bg-slate-50 font-bold min-w-[60px]">{getStampLabel(slot)}</td>))}</tr><tr className="h-16">{visibleSlots.map(slot => (<td key={slot} className="border border-black p-1 align-middle">{slot === 'writer' ? <div className="flex flex-col items-center"><span className="font-bold text-blue-700 text-xs">{currentUser.initials}</span><span className="text-[8px] text-slate-400 mt-1">{new Date().toLocaleDateString()}</span></div> : null}</td>))}</tr></tbody></table></div>
              <div className="grid grid-cols-2 gap-x-20 mb-3 text-lg leading-tight"><div className="space-y-1"><div className="flex items-center gap-2 border-b border-black pb-0"><span className="font-bold whitespace-nowrap">수 신 :</span><input type="text" value={po2Recipient} onChange={(e) => { takeSnapshot(); setPo2Recipient(e.target.value); }} className={`flex-1 outline-none font-bold ${isFieldChangedComp(po2Recipient, snap?.recipient) ? 'text-red-600' : ''}`} /></div><div className="flex items-center gap-2 border-b border-black pb-0"><span className="font-bold whitespace-nowrap">참 조 :</span><input type="text" value={po2Reference} onChange={(e) => { takeSnapshot(); setPo2Reference(e.target.value); }} className={`flex-1 outline-none ${isFieldChangedComp(po2Reference, snap?.reference) ? 'text-red-600' : ''}`} /></div><div className="flex items-center gap-2 border-b border-black pb-0"><span className="font-bold whitespace-nowrap">TEL / FAX :</span><input type="text" value={po2TelFax} onChange={(e) => { takeSnapshot(); setPo2TelFax(e.target.value); }} className={`flex-1 outline-none ${isFieldChangedComp(po2TelFax, snap?.telFax) ? 'text-red-600' : ''}`} /></div></div><div className="space-y-1"><div className="flex gap-4 border-b border-black pb-0"><span className="w-16 font-bold">발 신 :</span><input type="text" value={po2SenderName} onChange={(e) => setPo2SenderName(e.target.value)} className={`flex-1 outline-none font-bold ${isFieldChangedComp(po2SenderName, snap?.senderName) ? 'text-red-600' : ''}`} /></div><div className="flex gap-4 border-b border-black pb-0"><span className="w-16 font-bold">담 당 :</span><input type="text" value={po2SenderPerson} onChange={(e) => setPo2SenderPerson(e.target.value)} className={`flex-1 outline-none ${isFieldChangedComp(po2SenderPerson, snap?.senderPerson) ? 'text-red-600' : ''}`} /></div></div></div>
              <div className="mb-4 flex items-center border-b border-black pb-1"><span className={`font-black text-2xl mr-4 uppercase`}>{isPO3Now || isPO1Now ? '기 종' : '제 목'} :</span><input type="text" value={po2Title} onChange={(e) => { takeSnapshot(); setPo2Title(e.target.value); }} className={`flex-1 outline-none text-2xl font-bold ${isFieldChangedComp(po2Title, snap?.title) ? 'text-red-600' : ''}`} /></div>
              <table className="w-full border-collapse border-black border-[1px] text-[11px] md:text-[12px]"><thead><tr className="bg-slate-100">{tableCols.map(col => <th key={col.f} className={`border border-black p-1 ${col.w} text-center`}>{col.label}</th>)}<th className="border border-black p-1 w-14 text-center no-print">관리</th></tr></thead><tbody>{po2Rows.map((row, rIdx) => (<tr key={row.id}>{tableCols.map(cell => { const isChanged = row.changedFields?.includes(cell.f); return (<td key={cell.cIdx} className={`border border-black p-0 relative group/cell`}><AutoExpandingTextarea value={row[cell.f as keyof OrderRow]} onChange={(e: any) => { takeSnapshot(); updatePo2RowField(row.id, cell.f as keyof OrderRow, e.target.value); }} className={`${isChanged ? 'text-red-600 font-black' : ''}`} /></td>); })}</tr>))}</tbody></table>
              <div className="mt-8 space-y-1 text-base font-bold text-slate-700 leading-tight">{po2Notes.map((note, idx) => { const isChangedL = snap?.notes && snap.notes[idx]?.label !== note.label; const isChangedC = snap?.notes && snap.notes[idx]?.content !== note.content; return (<div key={idx} className="flex gap-2 items-center"><span className="shrink-0 w-6">{idx + 1}.</span><input type="text" value={note.label} onChange={(e) => handleNoteChange(idx, 'label', e.target.value)} className={`w-32 outline-none border-b font-black ${isChangedL ? 'text-red-600' : 'text-black'}`}/><span className="shrink-0">:</span><input type="text" value={note.content} onChange={(e) => handleNoteChange(idx, 'content', e.target.value)} className={`flex-1 outline-none border-b ${isChangedC ? 'text-red-600' : ''}`}/></div>); })}</div>
              <div className="mt-12 flex justify-center gap-4 no-print"><button onClick={() => handlePo2Submit(true)} className="px-10 py-5 rounded-2xl font-black text-2xl bg-slate-400 text-white">임 시 저 장</button><button onClick={() => handlePo2Submit(false)} className="px-16 py-5 rounded-2xl font-black text-2xl bg-slate-900 text-white">{editingItemId && !originalRejectedItem?.status.includes('임시저장') ? '수 정 완 료 (재제출)' : '작 성 완 료'}</button></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (activeItem) {
    const isPO1Active = activeItem.type === PurchaseOrderSubCategory.PO1 || activeItem.type === '사출발주서';
    const isPO3Active = activeItem.type === PurchaseOrderSubCategory.PO3 || activeItem.type === '메탈발주서';
    const { subtotal, vat, total } = getTotals(activeItem.rows, isPO1Active);
    const snap = activeItem.rejectionSnapshot;
    const tableColsActive = isPO1Active ? 
      [{ f: 'dept', cIdx: 0, label: 'MOLD', w: 'w-[6%]' }, { f: 'model', cIdx: 1, label: 'DN', w: 'w-[6%]' }, { f: 's', cIdx: 2, label: 'S', w: 'w-6' }, { f: 'itemName', cIdx: 3, label: 'PART NAME', w: 'flex-1' }, { f: 'cty', cIdx: 4, label: 'C\'TY', w: 'w-8' }, { f: 'price', cIdx: 5, label: 'Q\'TY', w: 'w-8' }, { f: 'material', cIdx: 6, label: 'MATERIAL', w: 'w-[10%]' }, { f: 'vendor', cIdx: 7, label: '금형업체', w: 'w-[5%]' }, { f: 'injectionVendor', cIdx: 8, label: '사출업체', w: 'w-[5%]' }, { f: 'orderQty', cIdx: 9, label: '주문수량', w: 'w-[5.3%]' }, { f: 'unitPrice', cIdx: 10, label: '단가', w: 'w-[5%]' }, { f: 'amount', cIdx: 11, label: '금액', w: 'w-[8%]' }, { f: 'remarks', cIdx: 12, label: '비고', w: 'w-[10%]' }] :
      (isPO3Active ? [{ f: 'dept', cIdx: 0, label: '도 번', w: 'w-[11%]' }, { f: 'itemName', cIdx: 1, label: '품 명', w: 'flex-1' }, { f: 'model', cIdx: 2, label: '규 격', w: 'w-[13.3%]' }, { f: 'price', cIdx: 3, label: '수 량', w: 'w-[8%]' }, { f: 'unitPrice', cIdx: 4, label: '단 가', w: 'w-[9.6%]' }, { f: 'amount', cIdx: 5, label: '금 액', w: 'w-[15%]' }, { f: 'remarks', cIdx: 6, label: '비 고', w: 'w-[15%]' }] : 
      [{ f: 'itemName', cIdx: 0, label: '품 명', w: 'flex-1' }, { f: 'model', cIdx: 1, label: '규 격', w: 'w-[20%]' }, { f: 'price', cIdx: 2, label: '수 량', w: 'w-[10%]' }, { f: 'unitPrice', cIdx: 3, label: '단 가', w: 'w-[12%]' }, { f: 'amount', cIdx: 4, label: '금 액', w: 'w-[15%]' }, { f: 'remarks', cIdx: 5, label: '비 고', w: 'w-[15%]' }]);

    return (
      <div className="py-8 bg-slate-200 min-h-screen">
        <div className="max-w-[1000px] mx-auto mb-6 flex flex-wrap justify-between items-center px-4 no-print gap-4">
          <button onClick={() => setActiveItem(null)} className="bg-white px-6 py-2.5 rounded-xl font-bold shadow-lg">← 목록으로</button>
          <div className="flex gap-3">{activeItem.status === PurchaseOrderSubCategory.PENDING && <button onClick={() => openRejectModal(activeItem.id)} className="px-6 py-2.5 bg-red-100 text-red-600 rounded-xl font-bold">반송</button>}{activeItem.status === PurchaseOrderSubCategory.APPROVED && !activeItem.stamps.final && <button onClick={() => handleFinalArchive(activeItem)} className="px-10 py-2.5 bg-emerald-600 text-white rounded-xl font-black shadow-lg">완 료</button>}<button onClick={handlePrint} className="bg-blue-600 text-white px-8 py-2.5 rounded-xl font-black shadow-lg">PDF 저장 / 인쇄</button></div>
        </div>
        <div className="bg-white border-[1px] border-slate-200 shadow-2xl mx-auto p-4 md:p-12 min-h-[297mm] w-full max-w-[1000px] text-black font-gulim text-left overflow-x-auto document-print-content">
          <div className="min-w-[800px]">
            <div className="flex flex-col items-center mb-1"><h1 className="text-4xl font-black uppercase">주 식 회 사 아 진 정 공</h1><div className="w-full h-1 bg-black mt-2"></div></div>
            <div className="grid grid-cols-2 gap-x-20 mb-3 text-lg leading-tight"><div className="space-y-1"><div className="flex items-center gap-2 border-b border-black pb-0"><span className="font-bold">수 신 :</span><span className={`font-bold ${snap && activeItem.recipient !== snap.recipient ? 'text-red-600' : 'text-blue-800'}`}>{activeItem.recipient || "-"} 귀중</span></div><div className="flex items-center gap-2 border-b border-black pb-0"><span className="font-bold">작성일자 :</span><span className={`${snap && activeItem.date !== snap.date ? 'text-red-600' : ''}`}>{activeItem.date}</span></div></div></div>
            <div className={`mb-4 flex items-center border-b border-black pb-1 font-black text-xl uppercase`}>{isPO3Active || isPO1Active ? '기 종' : '제 목'} : <span className={`${snap && activeItem.title !== snap.title ? 'text-red-600' : ''}`}>{activeItem.title}</span></div>
            <table className="w-full border-collapse border-black border-[1px] text-[11px] md:text-[12px]"><thead><tr className="bg-slate-100">{tableColsActive.map(col => <th key={col.f} className="border border-black p-1 text-center">{col.label}</th>)}</tr></thead><tbody>{activeItem.rows.map((row: any, rIdx: number) => (<tr key={row.id}>{tableColsActive.map(cell => { const isChanged = row.changedFields?.includes(cell.f); return (<td key={cell.cIdx} className={`border border-black p-1 ${isChanged ? 'text-red-600 font-black' : ''}`}>{cell.f === 'amount' ? calculateAmount(row, isPO1Active).toLocaleString() : row[cell.f]}</td>); })}</tr>))}</tbody></table>
            <div className="mt-8 space-y-1 text-base font-bold text-slate-700 leading-tight">{activeItem.notes?.map((note, idx) => { const isChangedL = snap?.notes && snap.notes[idx]?.label !== note.label; const isChangedC = snap?.notes && snap.notes[idx]?.content !== note.content; return (<div key={idx} className="flex gap-2"><span className="shrink-0 w-6">{idx + 1}.</span><span className={`shrink-0 w-32 ${isChangedL ? 'text-red-600' : ''}`}>{note.label}</span><span className="shrink-0">:</span><span className={`flex-1 ${isChangedC ? 'text-red-600' : ''}`}>{note.content}</span></div>); })}</div>
          </div>
        </div>
        {isRejectModalOpen && <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4"><div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl"><h3 className="text-2xl font-black text-black mb-4">반송 사유 입력</h3><textarea value={rejectReasonText} onChange={(e) => setRejectReasonText(e.target.value)} className="w-full h-40 p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-red-500 font-bold mb-8" /><div className="flex gap-4"><button onClick={() => setIsRejectModalOpen(false)} className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-xl font-black">취소</button><button onClick={confirmReject} className="flex-1 py-4 bg-red-600 text-white rounded-xl font-black">반송 처리</button></div></div></div>}
      </div>
    );
  }

  const filtered = sub === PurchaseOrderSubCategory.ARCHIVE ? archivedItems.filter(item => item.recipient === selectedArchiveVendor) : items.filter(item => item.status === sub && !item.stamps.final);
  const searchFiltered = filtered.filter(item => item.title.toLowerCase().includes(searchTerm.toLowerCase()) || (item.recipient && item.recipient.toLowerCase().includes(searchTerm.toLowerCase()))).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const paginated = searchFiltered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  return (
    <div className="space-y-6 text-left pb-12 animate-in fade-in duration-500">
      <div className="flex justify-between items-center"><h2 className="text-3xl font-black text-black">{sub}</h2><div className="relative w-full md:max-w-sm"><input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="검색어 입력..." className="w-full px-5 py-2.5 rounded-2xl border outline-none text-sm font-medium bg-white shadow-sm"/></div></div>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6">{paginated.map(item => (<div key={item.id} className="relative"><button onClick={() => { if (sub === PurchaseOrderSubCategory.REJECTED || item.status.includes('임시저장')) handleEditRejectedItem(item); else setActiveItem(item); }} className="w-full bg-white p-6 rounded-3xl shadow-sm border-2 border-slate-100 hover:border-blue-500 hover:shadow-xl transition-all flex flex-col items-center overflow-hidden h-full"><div className="w-16 h-20 bg-slate-50 rounded-xl flex items-center justify-center mb-4 border"><svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg></div><h3 className={`font-black text-sm truncate w-full mb-1 ${item.isResubmitted ? 'text-red-600' : 'text-black'}`}>{item.isResubmitted && '[수정] '}{item.title}</h3><p className="text-[10px] text-slate-400 font-bold">{item.date}</p></button>{isMaster && <button onClick={() => handleDeleteItemFromList(item.id)} className="absolute -top-2 -right-2 bg-red-600 text-white w-8 h-8 rounded-full shadow-lg">×</button>}</div>))}</div>
      {modal && <div className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center"><div className="bg-white p-8 rounded-3xl text-center"><h3 className="text-xl font-black mb-4 text-red-600">삭제 확인</h3><p className="mb-8">{modal.message}</p><div className="flex gap-4"><button onClick={() => setModal(null)} className="flex-1 py-3 bg-slate-100 rounded-xl">취소</button><button onClick={modal.onConfirm} className="flex-1 py-3 bg-red-600 text-white rounded-xl">삭제</button></div></div></div>}
    </div>
  );
};

export default PurchaseOrderView;
