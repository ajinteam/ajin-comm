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
  // Mock 데이터를 위한 필드
  isMock?: boolean;
  base64?: string; 
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

  // 파일 업로드 관련 상태
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
  
  // New: File selection state for Alt + Click linking
  const [isFileSelectorOpen, setIsFileSelectorOpen] = useState(false);
  const [targetRowIdForFile, setTargetRowIdForFile] = useState<string | null>(null);

  const [modal, setModal] = useState<{
    type: 'DELETE_FILE' | 'DELETE_STORAGE_FILE' | 'ALERT';
    message: string;
    onConfirm: () => void;
  } | null>(null);

  // Helper to determine approval slots
  const getApprovalSlots = useCallback((type: string, recipient: string) => {
    const isPO1 = type === PurchaseOrderSubCategory.PO1 || type === PurchaseOrderSubCategory.PO1_TEMP || type === '사출발주서';
    const isAjin = recipient?.trim().toUpperCase() === 'AJIN';
    
    if (isPO1) {
      // AJIN이면 담당-설계-이사-대표, 아니면 담당-설계-이사
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

  // 파일 업로드 데이터 로드 (Supabase + LocalStorage Fallback)
  const fetchStorageFiles = useCallback(async () => {
    setIsFilesLoading(true);
    try {
      let combinedFiles: StorageFile[] = [];

      // 1. Supabase에서 데이터 가져오기 시도
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

      // 2. LocalStorage(가상 저장소) 데이터 가져오기
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

  // Always fetch files on mount or when writing to ensure the selector has data
  useEffect(() => {
    fetchStorageFiles();
  }, [fetchStorageFiles]);

  useEffect(() => {
    if (sub === PurchaseOrderSubCategory.UPLOAD) {
      fetchStorageFiles();
    }
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
      
      // Supabase 연동이 되어있을 때
      if (supabase) {
        const { error } = await supabase.storage
          .from('ajin-pdfdata')
          .upload(fileName, file);
        if (error) throw error;
      } else {
        // Supabase 연동 전: LocalStorage에 가상 저장 (Preview 테스트용)
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64data = reader.result as string;
          const mockFile: StorageFile = {
            id: `mock-${Date.now()}`,
            name: fileName,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            last_accessed_at: new Date().toISOString(),
            metadata: {
              size: file.size,
              mimetype: file.type
            },
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
        // 가상 저장소 다운로드
        const link = document.createElement('a');
        link.href = file.base64;
        link.download = file.name.split('_').slice(1).join('_') || file.name;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } else if (supabase) {
        // 실제 Supabase 다운로드
        const { data, error } = await supabase.storage
          .from('ajin-pdfdata')
          .download(file.name);
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
            const { error } = await supabase.storage
              .from('ajin-pdfdata')
              .remove([file.name]);
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

  const isPO1 = sub === PurchaseOrderSubCategory.PO1;
  const isPO2 = sub === PurchaseOrderSubCategory.PO2;
  const isPO3 = sub === PurchaseOrderSubCategory.PO3;
  const isPO1_TEMP = sub === PurchaseOrderSubCategory.PO1_TEMP;
  const isPO2_TEMP = sub === PurchaseOrderSubCategory.PO2_TEMP;
  const isPO3_TEMP = sub === PurchaseOrderSubCategory.PO3_TEMP;
  const isWritingAnyPO = isPO1 || isPO2 || isPO3;
  
  const [po2Title, setPo2Title] = useState('');
  const [po2Recipient, setPo2Recipient] = useState('');
  const [po2TelFax, setPo2TelFax] = useState('');
  const [po2Reference, setPo2Reference] = useState('');
  const [po2SenderName, setPo2SenderName] = useState('㈜ 아진정공');
  const [po2SenderPerson, setPo2SenderPerson] = useState('');
  const [po2Date, setPo2Date] = useState(new Date().toLocaleDateString('ko-KR'));
  const [po2Rows, setPo2Rows] = useState<OrderRow[]>([]);

  const [injectionSearch, setInjectionSearch] = useState('');
  const [hideInjectionColumn, setHideInjectionColumn] = useState(false);

  const [po1Selection, setPo1Selection] = useState<{ sR: number, sC: number, eR: number, eC: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [po1Merges, setPo1Merges] = useState<Record<string, { rS: number, cS: number }>>({});
  const [po1Aligns, setPo1Aligns] = useState<Record<string, 'left' | 'center' | 'right'>>({});
  const [po1Weights, setPo1Weights] = useState<Record<string, 'normal' | 'bold'>>({});
  const [po1Borders, setPo1Borders] = useState<Record<string, { t?: string, b?: string, l?: string, r?: string }>>({});
  const [activeBorderStyle, setActiveBorderStyle] = useState<string>('solid');
  
  const [po1HeaderRows, setPo1HeaderRows] = useState<string[]>([]);
  
  const [undoStack, setUndoStack] = useState<string[]>([]);

  // defaultNotes와 po2Notes 선언을 takeSnapshot 호출부보다 위로 이동하여 참조 오류를 수정했습니다.
  const defaultNotes = [
    { label: '납품장소', content: '㈜ 아진정공 대천공장 (충남 보령시 대해로 425-23 (요암동 63번지) TEL 041-931-4496)' },
    { label: '납기일자', content: '2026년   월   일' },
    { label: '지불조건', content: '양산납품 후 세금계산서 기준일자 30일이내에 현금결재 (무통장입금)' },
    { label: '별 첨', content: '도면 첨부' },
    { label: '기타사항(유의)', content: '이물질 없도록 주의 바랍니다.' },
    { label: '금형용 기준', content: '도면참조' }
  ];

  const [po2Notes, setPo2Notes] = useState<PurchaseOrderNote[]>(defaultNotes);

  const takeSnapshot = useCallback(() => {
    const isEditingMode = isWritingAnyPO || !!editingItemId;
    if (!isEditingMode) return;
    const snapshot = JSON.stringify({
      po2Rows, po1Merges, po1Aligns, po1Weights, po1Borders, po1HeaderRows, po2Title, po2Recipient, po2TelFax, po2Reference, hideInjectionColumn, po2Notes
    });
    setUndoStack(prev => [snapshot, ...prev].slice(0, 50));
  }, [isWritingAnyPO, editingItemId, po2Rows, po1Merges, po1Aligns, po1Weights, po1Borders, po1HeaderRows, po2Title, po2Recipient, po2TelFax, po2Reference, hideInjectionColumn, po2Notes]);

  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    const [last, ...rest] = undoStack;
    try {
      const data = JSON.parse(last);
      setPo2Rows(data.po2Rows);
      setPo1Merges(data.po1Merges);
      setPo1Aligns(data.po1Aligns);
      setPo1Weights(data.po1Weights || {});
      setPo1Borders(data.po1Borders || {});
      setPo1HeaderRows(data.po1HeaderRows);
      setPo2Title(data.po2Title);
      setPo2Recipient(data.po2Recipient);
      setPo2TelFax(data.po2TelFax);
      setPo2Reference(data.po2Reference);
      setHideInjectionColumn(data.hideInjectionColumn || false);
      if (data.po2Notes) setPo2Notes(data.po2Notes);
      setUndoStack(rest);
    } catch (e) {
      console.error('Undo failed', e);
    }
  }, [undoStack]);

  const createEmptyRow = () => ({
    id: Math.random().toString(36).substr(2, 9),
    dept: '', model: '', itemName: '', price: '', unitPrice: '', amount: '', remarks: '',
    s: '', cty: '', material: '', vendor: '', injectionVendor: '', orderQty: '',
    changedFields: []
  });

  const isFieldChanged = useCallback((current: any, original: any) => {
    if (!editingItemId || !originalRejectedItem) return false;
    // 오직 반송된 문서를 수정할 때만 강조 표시
    if (originalRejectedItem.status !== PurchaseOrderSubCategory.REJECTED) return false;
    return (current || '').toString().trim() !== (original || '').toString().trim();
  }, [editingItemId, originalRejectedItem]);

  // 주문서(OrderView) 로직과 동일하게 Row 필드 변경 감지
  const updatePo2RowField = useCallback((rowId: string, field: keyof OrderRow, value: string) => {
    setPo2Rows(prev => prev.map(row => {
      if (row.id === rowId) {
        let updatedFields = row.changedFields ? [...row.changedFields] : [];
        // 오직 반송된 문서를 수정할 때만 변경 필드를 추적하여 강조
        if (originalRejectedItem && originalRejectedItem.status === PurchaseOrderSubCategory.REJECTED) {
          const oriRow = originalRejectedItem.rows.find(r => r.id === rowId);
          const oriValue = oriRow ? (oriRow[field] || '') : '';
          if (String(value).trim() !== String(oriValue).trim()) {
            if (!updatedFields.includes(field)) updatedFields.push(field);
          } else {
            updatedFields = updatedFields.filter(f => f !== field);
          }
        } else {
          // 신규 작성이나 임시 저장 문서 수정 시에는 강조 이력을 남기지 않음
          updatedFields = [];
        }
        return { ...row, [field]: value, changedFields: updatedFields };
      }
      return row;
    }));
  }, [originalRejectedItem]);

  const isNoteChanged = useCallback((nIdx: number, field: keyof PurchaseOrderNote, current: any) => {
    if (!editingItemId || !originalRejectedItem || !originalRejectedItem.notes) return false;
    // 오직 반송된 문서를 수정할 때만 강조
    if (originalRejectedItem.status !== PurchaseOrderSubCategory.REJECTED) return false;
    const oriNote = originalRejectedItem.notes[nIdx];
    if (!oriNote) return true; 
    return (current || '').toString().trim() !== (oriNote[field] || '').toString().trim();
  }, [editingItemId, originalRejectedItem]);

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
        let defaultPerson = '';
        if (sub === PurchaseOrderSubCategory.PO1) defaultPerson = '김미숙 010-9252-1565';
        else if (sub === PurchaseOrderSubCategory.PO3) defaultPerson = '이재성 010-6342-5656';
        else defaultPerson = '이상구 010-6212-6945';
        setPo2SenderPerson(data.senderPerson || defaultPerson);
        setPo2Rows(data.rows || []); setPo2Notes(data.notes || []); setPo1HeaderRows(data.headerRows || (sub === PurchaseOrderSubCategory.PO1 ? ['', ''] : [])); setPo1Merges(data.merges || {}); setPo1Aligns(data.aligns || {}); setPo1Weights(data.weights || {}); setPo1Borders(data.borders || {}); setHideInjectionColumn(data.hideInjectionColumn || false);
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

  useEffect(() => {
    setCurrentPage(1);
    setFilePage(1);
  }, [sub, selectedArchiveVendor, searchTerm]);

  const saveItems = (newItems: PurchaseOrderItem[]) => {
    setItems(newItems);
    localStorage.setItem('ajin_purchase_orders', JSON.stringify(newItems));
    pushStateToCloud();
  };

  const handleSaveVendor = () => {
    if (!newVendor.name.trim()) return;
    const updated = vendors.filter(v => v.name !== newVendor.name);
    const final = [...updated, newVendor];
    setVendors(final);
    localStorage.setItem('ajin_vendors', JSON.stringify(final));
    setNewVendor({ name: '', tel: '', remarks: '' });
    pushStateToCloud();
  };

  const handleRecipientSelect = (name: string) => {
    takeSnapshot();
    const vendor = vendors.find(v => v.name === name);
    if (vendor) {
      setPo2Recipient(vendor.name);
      setPo2TelFax(vendor.tel);
    } else {
      setPo2Recipient(name);
    }
  };

  const handlePaste = (e: React.ClipboardEvent, startRowIdx: number, startColIdx: number) => {
    const pasteData = e.clipboardData.getData('text');
    if (!pasteData.includes('\t') && !pasteData.includes('\n')) return;
    e.preventDefault();
    takeSnapshot();
    const rowsText = pasteData.split(/\r?\n(?=(?:(?:[^"]*"){2})*[^"]*$)/);
    const grid = rowsText.map(row => {
      return row.split('\t').map(cell => {
        let clean = cell.trim();
        if (clean.startsWith('"') && clean.endsWith('"')) {
          clean = clean.substring(1, clean.length - 1);
        }
        return clean.replace(/""/g, '"');
      });
    });

    const getColToField = () => {
      const currentItemType = editingItemId ? items.find(i => i.id === editingItemId)?.type : sub;
      if (currentItemType === PurchaseOrderSubCategory.PO1) return { 0: 'dept', 1: 'model', 2: 's', 3: 'itemName', 4: 'cty', 5: 'price', 6: 'material', 7: 'vendor', 8: 'injectionVendor', 9: 'orderQty', 10: 'unitPrice', 11: 'amount', 12: 'remarks' };
      if (currentItemType === PurchaseOrderSubCategory.PO3) return { 0: 'dept', 1: 'itemName', 2: 'model', 3: 'price', 4: 'unitPrice', 5: 'amount', 6: 'remarks' };
      return { 0: 'itemName', 1: 'model', 2: 'price', 3: 'unitPrice', 4: 'amount', 5: 'remarks' };
    };

    const colToField: any = getColToField();
    const validCols = Object.keys(colToField).map(Number).sort((a, b) => a - b);

    setPo2Rows(prev => {
      let newRows = [...prev];
      grid.forEach((pRow, rOffset) => {
        const rIdx = startRowIdx + rOffset;
        if (rIdx >= 200) return;
        if (!newRows[rIdx]) newRows[rIdx] = createEmptyRow();
        const startValidIdx = validCols.indexOf(startColIdx);
        if (startValidIdx !== -1) {
          pRow.forEach((pCell, cOffset) => {
            const currentValidIdx = startValidIdx + cOffset;
            if (currentValidIdx < validCols.length) {
              const targetColIdx = validCols[currentValidIdx];
              const field = colToField[targetColIdx];
              if (field) {
                let updatedFields = newRows[rIdx].changedFields ? [...newRows[rIdx].changedFields] : [];
                if (originalRejectedItem && originalRejectedItem.status === PurchaseOrderSubCategory.REJECTED) {
                  const oriRow = originalRejectedItem.rows.find(or => or.id === newRows[rIdx].id);
                  const oriValue = oriRow ? (oriRow[field] || '') : '';
                  if (String(pCell).trim() !== String(oriValue).trim()) {
                    if (!updatedFields.includes(field)) updatedFields.push(field);
                  } else {
                    updatedFields = updatedFields.filter(f => f !== field);
                  }
                }
                newRows[rIdx] = { ...newRows[rIdx], [field]: pCell, changedFields: updatedFields };
              }
            }
          });
        }
      });
      return newRows;
    });
  };

  const handleRowKeyDown = (e: React.KeyboardEvent, rowIdx: number, colIdx: number) => {
    const getValidCols = () => {
      const currentItemType = editingItemId ? items.find(i => i.id === editingItemId)?.type : sub;
      const baseCols = currentItemType === PurchaseOrderSubCategory.PO1 ? [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] : (currentItemType === PurchaseOrderSubCategory.PO3 ? [0, 1, 2, 3, 4, 5, 6] : [0, 1, 2, 3, 4, 5]);
      if (currentItemType === PurchaseOrderSubCategory.PO1 && hideInjectionColumn) return baseCols.filter(c => c !== 8);
      return baseCols;
    };
    const validCols = getValidCols();
    const currentIndex = validCols.indexOf(colIdx);
    if (e.key === 'Enter') {
      if (e.shiftKey) return;
      e.preventDefault();
      if (currentIndex < validCols.length - 1) {
        const nextCol = validCols[currentIndex + 1];
        (document.querySelector(`[data-row="${rowIdx}"][data-col="${nextCol}"]`) as HTMLTextAreaElement)?.focus();
      } else {
        const nextRowIdx = rowIdx + 1;
        if (nextRowIdx < po2Rows.length) {
          (document.querySelector(`[data-row="${nextRowIdx}"][data-col="${validCols[0]}"]`) as HTMLTextAreaElement)?.focus();
        }
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const nextRowIdx = rowIdx + 1;
      if (nextRowIdx < po2Rows.length) (document.querySelector(`[data-row="${nextRowIdx}"][data-col="${colIdx}"]`) as HTMLTextAreaElement)?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prevRowIdx = rowIdx - 1;
      if (prevRowIdx >= 0) (document.querySelector(`[data-row="${prevRowIdx}"][data-col="${colIdx}"]`) as HTMLTextAreaElement)?.focus();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      if (currentIndex < validCols.length - 1) {
        const nextCol = validCols[currentIndex + 1];
        (document.querySelector(`[data-row="${rowIdx}"][data-col="${nextCol}"]`) as HTMLTextAreaElement)?.focus();
      }
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      if (currentIndex > 0) {
        const prevCol = validCols[currentIndex - 1];
        (document.querySelector(`[data-row="${rowIdx}"][data-col="${prevCol}"]`) as HTMLTextAreaElement)?.focus();
      }
    }
  };

  const calculateAmount = useCallback((row: any, forcePO1?: boolean) => {
    if (row.unitPrice === '0' || row.unitPrice === 0) {
      return parseFloat(String(row.amount || '0').replace(/,/g, '')) || 0;
    }
    const currentItemType = editingItemId ? items.find(i => i.id === editingItemId)?.type : sub;
    const effectiveIsPO1 = forcePO1 !== undefined ? forcePO1 : (currentItemType === PurchaseOrderSubCategory.PO1 || currentItemType === PurchaseOrderSubCategory.PO1_TEMP);
    const qStr = effectiveIsPO1 ? row.orderQty : row.price;
    const q = parseFloat(String(qStr || '0').replace(/,/g, '')) || 0;
    const u = parseFloat(String(row.unitPrice || '0').replace(/,/g, '')) || 0;
    return q * u;
  }, [editingItemId, items, sub]);

  const getTotals = (rows: OrderRow[], forcePO1?: boolean) => {
    const subtotal = rows.reduce((acc, row) => acc + calculateAmount(row, forcePO1), 0);
    const vat = Math.floor(subtotal * 0.1);
    const total = subtotal + vat;
    return { subtotal, vat, total };
  };

  const handleLoadInjectionData = () => {
    if (!isPO1) return;
    if (!po2Title.trim() || !injectionSearch.trim()) { alert('기종과 사출업체 검색어를 모두 입력해 주세요.'); return; }
    takeSnapshot();
    const normalize = (str: string) => (str || '').replace(/[\r\n\s]/g, '').toLowerCase();
    const searchNormalized = normalize(injectionSearch);
    const titleNormalized = normalize(po2Title);
    const ajinArchivedDocs = items.filter(item => item.recipient === 'AJIN' && item.stamps.final && normalize(item.title).includes(titleNormalized));
    if (ajinArchivedDocs.length === 0) { alert('수신처 AJIN 보관함에서 일치하는 기종의 문서를 찾을 수 없습니다.'); return; }
    const foundRows: OrderRow[] = [];
    const foundMerges: Record<string, { rS: number, cS: number }> = {};
    const foundAligns: Record<string, 'left' | 'center' | 'right'> = {};
    const foundWeights: Record<string, 'normal' | 'bold'> = {};
    let sourceHeaderRows: string[] = [];
    let foundAny = false;
    let currentRowOffset = 0;
    ajinArchivedDocs.forEach(doc => {
      const docRows = doc.rows;
      const docMerges = doc.merges || {};
      let docHasMatch = false;
      for (let r = 0; r < docRows.length; r++) {
        const row = docRows[r];
        const mergeKey = `${r}-8`;
        const merge = docMerges[mergeKey];
        const vendorVal = normalize(row.injectionVendor);
        if (vendorVal.includes(searchNormalized)) {
          const rowCount = merge ? merge.rS : 1;
          for (let i = 0; i < rowCount; i++) {
            const targetIdx = r + i;
            if (docRows[targetIdx]) {
              foundRows.push({ ...docRows[targetIdx], id: Math.random().toString(36).substr(2, 9), injectionVendor: '', modLog: undefined, changedFields: [] });
              Object.entries(docMerges).forEach(([key, m]) => {
                const [mr, mc] = key.split('-').map(Number);
                if (mr === targetIdx) foundMerges[`${currentRowOffset + i}-${mc}`] = m as any;
              });
              Object.entries(doc.aligns || {}).forEach(([key, align]) => {
                const [ar, ac] = key.split('-').map(Number);
                if (ar === targetIdx) foundAligns[`${currentRowOffset + i}-${ac}`] = align as any;
              });
              Object.entries(doc.weights || {}).forEach(([key, weight]) => {
                const [wr, wc] = key.split('-').map(Number);
                if (wr === targetIdx) foundWeights[`${currentRowOffset + i}-${wc}`] = weight as any;
              });
            }
          }
          currentRowOffset += rowCount; docHasMatch = true; foundAny = true;
          if (merge) r += (merge.rS - 1);
        }
      }
      if (docHasMatch && sourceHeaderRows.length === 0) sourceHeaderRows = doc.headerRows || [];
    });
    if (!foundAny) { alert(`기종 '${po2Title}' 내에 사출업체 '${injectionSearch}'가 포함된 항목이 없습니다.`); return; }
    const finalRows = [...foundRows];
    while (finalRows.length < 12) finalRows.push(createEmptyRow());
    setPo2Rows(finalRows); setPo1Merges(foundMerges); setPo1Aligns(foundAligns); setPo1Weights(foundWeights); setPo1Borders({}); setPo1HeaderRows(sourceHeaderRows); setHideInjectionColumn(true);
    alert(`${foundRows.length}개의 행을 불러왔으며, 병합 정보가 적용되었습니다.`);
  };

  const handlePo2Submit = (isTemp: boolean = false) => {
    if (!po2Title.trim()) {
      const currentItemType = editingItemId ? items.find(i => i.id === editingItemId)?.type : sub;
      alert(`${currentItemType === PurchaseOrderSubCategory.PO3 || currentItemType === PurchaseOrderSubCategory.PO1 ? '기종' : '제목'}을 입력해야 작성을 완료할 수 있습니다.`);
      return;
    }
    
    let targetStatus: PurchaseOrderSubCategory;
    const currentType = editingItemId ? items.find(i => i.id === editingItemId)?.type : sub;

    if (isTemp) {
      if (currentType === PurchaseOrderSubCategory.PO1) targetStatus = PurchaseOrderSubCategory.PO1_TEMP;
      else if (currentType === PurchaseOrderSubCategory.PO3) targetStatus = PurchaseOrderSubCategory.PO3_TEMP;
      else targetStatus = PurchaseOrderSubCategory.PO2_TEMP;
    } else {
      targetStatus = PurchaseOrderSubCategory.PENDING;
    }

    if (editingItemId) {
      const updated = items.map(item => {
        if (item.id === editingItemId) {
          const isFromTemp = originalRejectedItem?.status.includes('임시저장');
          return {
            ...item, title: po2Title, recipient: po2Recipient, telFax: po2TelFax, reference: po2Reference, senderName: po2SenderName, senderPerson: po2SenderPerson, status: targetStatus, date: po2Date,
            rows: po2Rows.filter(r => r.itemName?.trim() || r.model?.trim() || (r as any).dept?.trim() || (r as any).s?.trim()).map(r => {
              // 임시 저장 문서에서 온 경우 변경 필드 이력을 비움 (신규 작성과 동일 처리)
              if (isFromTemp) return { ...r, changedFields: [] };
              return r;
            }),
            notes: po2Notes, headerRows: po1HeaderRows.filter(r => r.trim() !== ''), merges: po1Merges, aligns: po1Aligns, weights: po1Weights, borders: po1Borders, isResubmitted: targetStatus === PurchaseOrderSubCategory.PENDING && item.status === PurchaseOrderSubCategory.REJECTED, hideInjectionColumn: hideInjectionColumn,
            stamps: { writer: { userId: currentUser.initials, timestamp: new Date().toLocaleString() } },
            rejectReason: undefined, rejectLog: undefined
          };
        }
        return item;
      });
      saveItems(updated); alert(isTemp ? "임시 저장되었습니다." : "수정이 완료되어 결재대기로 이동되었습니다."); 
      setEditingItemId(null); setOriginalRejectedItem(null);
    } else {
      const newItem: PurchaseOrderItem = {
        id: `${currentType}-${Date.now()}`, code: '', title: po2Title, type: currentType as string, recipient: po2Recipient, telFax: po2TelFax, reference: po2Reference, senderName: po2SenderName, senderPerson: po2SenderPerson, status: targetStatus, authorId: currentUser.initials, date: po2Date, createdAt: new Date().toISOString(),
        rows: po2Rows.filter(r => r.itemName?.trim() || r.model?.trim() || (r as any).dept?.trim() || (r as any).s?.trim()),
        notes: po2Notes, stamps: { writer: { userId: currentUser.initials, timestamp: new Date().toLocaleString() } }, headerRows: po1HeaderRows.filter(r => r.trim() !== ''), merges: po1Merges, aligns: po1Aligns, weights: po1Weights, borders: po1Borders, hideInjectionColumn: hideInjectionColumn
      };
      saveItems([newItem, ...items]); alert(isTemp ? "임시 저장되었습니다." : "작성이 완료되어 결재대기로 이동되었습니다.");
    }
    setView({ type: 'PURCHASE', sub: targetStatus });
    setPo2Title(''); setPo2Recipient(''); setPo2TelFax(''); setPo2Reference(''); setPo2Rows([]); setPo1HeaderRows([]); setPo1Merges({}); setPo1Aligns({}); setPo1Weights({}); setPo1Borders({}); setUndoStack([]); setHideInjectionColumn(false);
  };

  const handleAddNoteRow = () => { takeSnapshot(); setPo2Notes([...po2Notes, { label: '', content: '' }]); };
  const handleDeleteNoteRow = (idx: number) => { takeSnapshot(); setPo2Notes(po2Notes.filter((_, i) => i !== idx)); };
  const handleNoteChange = (idx: number, field: 'label' | 'content', value: string) => {
    const updated = [...po2Notes];
    updated[idx] = { ...updated[idx], [field]: value };
    setPo2Notes(updated);
  };

  const handleInsertRow = (idx: number) => { takeSnapshot(); const newRows = [...po2Rows]; newRows.splice(idx + 1, 0, createEmptyRow()); setPo2Rows(newRows); };
  const handleDeleteTableRow = (idx: number) => { if (po2Rows.length <= 1) return; takeSnapshot(); setPo2Rows(po2Rows.filter((_, i) => i !== idx)); };
  const handleAddHeaderRow = () => { takeSnapshot(); setPo1HeaderRows([...po1HeaderRows, '']); };
  const handleRemoveHeaderRow = (idx: number) => { takeSnapshot(); setPo1HeaderRows(po1HeaderRows.filter((_, i) => i !== idx)); };
  const handleUpdateHeaderRow = (idx: number, val: string) => { const newRows = [...po1HeaderRows]; newRows[idx] = val; setPo1HeaderRows(newRows); };

  const handleCellMouseDown = (r: number, c: number) => { setPo1Selection({ sR: r, sC: c, eR: r, eC: c }); setIsDragging(true); };
  const handleCellMouseEnter = (r: number, c: number) => { if (isDragging && po1Selection) { setPo1Selection({ ...po1Selection, eR: r, eC: c }); } };
  const handleMouseUp = () => setIsDragging(false);

  useEffect(() => {
    window.addEventListener('mouseup', handleMouseUp);
    return () => window.removeEventListener('mouseup', handleMouseUp);
  }, []);

  const isCellSelected = (r: number, c: number) => {
    if (!po1Selection) return false;
    const { sR, sC, eR, eC } = po1Selection;
    const minR = Math.min(sR, eR), maxR = Math.max(sR, eR);
    const minC = Math.min(sC, eC), maxC = Math.max(sC, eC);
    return r >= minR && r <= maxR && c >= minC && c <= maxC;
  };

  const handleMerge = useCallback(() => {
    if (!po1Selection) return;
    const { sR, sC, eR, eC } = po1Selection;
    const minR = Math.min(sR, eR), maxR = Math.max(sR, eR);
    const minC = Math.min(sC, eC), maxC = Math.max(sC, eC);
    if (minR === maxR && minC === maxC) return;
    takeSnapshot();
    const newMerges = { ...po1Merges };
    const rowSpan = maxR - minR + 1;
    const colSpan = maxC - minC + 1;
    for (let r = minR; r <= maxR; r++) { for (let c = minC; c <= maxC; c++) { delete newMerges[`${r}-${c}`]; } }
    newMerges[`${minR}-${minC}`] = { rS: rowSpan, cS: colSpan };
    setPo1Merges(newMerges); setPo1Selection(null);
  }, [po1Selection, po1Merges, takeSnapshot]);

  const handleClearSelectionText = useCallback(() => {
    if (!po1Selection) return;
    const { sR, sC, eR, eC } = po1Selection;
    const minR = Math.min(sR, eR), maxR = Math.max(sR, eR);
    const minC = Math.min(sC, eC), maxC = Math.max(sC, eC);
    
    takeSnapshot();
    
    const currentItemType = editingItemId ? items.find(i => i.id === editingItemId)?.type : sub;
    const getColToField = () => {
        if (currentItemType === PurchaseOrderSubCategory.PO1 || currentItemType === PurchaseOrderSubCategory.PO1_TEMP) return { 0: 'dept', 1: 'model', 2: 's', 3: 'itemName', 4: 'cty', 5: 'price', 6: 'material', 7: 'vendor', 8: 'injectionVendor', 9: 'orderQty', 10: 'unitPrice', 11: 'amount', 12: 'remarks' };
        if (currentItemType === PurchaseOrderSubCategory.PO3 || currentItemType === PurchaseOrderSubCategory.PO3_TEMP) return { 0: 'dept', 1: 'itemName', 2: 'model', 3: 'price', 4: 'unitPrice', 5: 'amount', 6: 'remarks' };
        return { 0: 'itemName', 1: 'model', 2: 'price', 3: 'unitPrice', 4: 'amount', 5: 'remarks' };
    };
    const colToField: any = getColToField();

    setPo2Rows(prev => {
        const newRows = [...prev];
        for (let r = minR; r <= maxR; r++) {
            if (!newRows[r]) continue;
            let updatedFields = newRows[r].changedFields ? [...newRows[r].changedFields] : [];
            for (let c = minC; c <= maxC; c++) {
                const field = colToField[c];
                if (field) {
                    if (originalRejectedItem && originalRejectedItem.status === PurchaseOrderSubCategory.REJECTED) {
                      const oriRow = originalRejectedItem.rows.find(or => or.id === newRows[r].id);
                      const oriValue = oriRow ? (oriRow[field as keyof OrderRow] || '') : '';
                      if (String(oriValue).trim() !== '') {
                        if (!updatedFields.includes(field)) updatedFields.push(field);
                      } else {
                        updatedFields = updatedFields.filter(f => f !== field);
                      }
                    } else {
                      updatedFields = [];
                    }
                    newRows[r] = { ...newRows[r], [field]: '', changedFields: updatedFields };
                }
            }
        }
        return newRows;
    });
    setPo1Selection(null);
  }, [po1Selection, takeSnapshot, editingItemId, items, sub, originalRejectedItem]);

  const handleBorderApply = useCallback((target: 'outer' | 'inner', style: string) => {
    if (!po1Selection) return;
    takeSnapshot();
    const { sR, sC, eR, eC } = po1Selection;
    const minR = Math.min(sR, eR), maxR = Math.max(sR, eR);
    const minC = Math.min(sC, eC), maxC = Math.max(sC, eC);
    const newBorders = { ...po1Borders };

    const setBorder = (r: number, c: number, side: 't' | 'b' | 'l' | 'r', s: string) => {
      const key = `${r}-${c}`;
      if (!newBorders[key]) newBorders[key] = {};
      newBorders[key] = { ...newBorders[key], [side]: s };
    };

    if (target === 'outer') {
      for (let c = minC; c <= maxC; c++) { setBorder(minR, c, 't', style); setBorder(maxR, c, 'b', style); }
      for (let r = minR; r <= maxR; r++) { setBorder(r, minC, 'l', style); setBorder(r, maxC, 'r', style); }
    } else {
      for (let r = minR; r < maxR; r++) {
        for (let c = minC; c <= maxC; c++) { setBorder(r, c, 'b', style); setBorder(r + 1, c, 't', style); }
      }
      for (let c = minC; c < maxC; c++) {
        for (let r = minR; r <= maxR; r++) { setBorder(r, c, 'r', style); setBorder(r, c + 1, 'l', style); }
      }
    }
    setPo1Borders(newBorders);
  }, [po1Selection, po1Borders, takeSnapshot]);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const canEdit = isWritingAnyPO || !!editingItemId;
      if (canEdit) {
          if (e.key === 'F4') {
              e.preventDefault(); handleMerge();
          }
          if (e.key === 'Delete' && po1Selection) {
              e.preventDefault(); handleClearSelectionText();
          }
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [handleMerge, handleClearSelectionText, isWritingAnyPO, editingItemId, po1Selection]);

  const handleUnmerge = () => {
    if (!po1Selection) return;
    const { sR, sC, eR, eC } = po1Selection;
    const minR = Math.min(sR, eR), maxR = Math.max(sR, eR);
    const minC = Math.min(sC, eC), maxC = Math.max(sC, eC);
    takeSnapshot();
    const newMerges = { ...po1Merges };
    for (let r = minR; r <= maxR; r++) { for (let c = minC; c <= maxC; c++) { delete newMerges[`${r}-${c}`]; } }
    setPo1Merges(newMerges);
  };

  const handleAlign = (align: 'left' | 'center' | 'right') => {
    if (!po1Selection) return;
    const { sR, sC, eR, eC } = po1Selection;
    const minR = Math.min(sR, eR), maxR = Math.max(sR, eR);
    const minC = Math.min(sC, eC), maxC = Math.max(sC, eC);
    takeSnapshot();
    const newAligns = { ...po1Aligns };
    for (let r = minR; r <= maxR; r++) { for (let c = minC; c <= maxC; c++) { newAligns[`${r}-${c}`] = align; } }
    setPo1Aligns(newAligns);
  };

  const handleWeight = (weight: 'normal' | 'bold') => {
    if (!po1Selection) return;
    const { sR, sC, eR, eC } = po1Selection;
    const minR = Math.min(sR, eR), maxR = Math.max(sR, eR);
    const minC = Math.min(sC, eC), maxC = Math.max(sC, eC);
    takeSnapshot();
    const newWeights = { ...po1Weights };
    for (let r = minR; r <= maxR; r++) { for (let c = minC; c <= maxC; c++) { newWeights[`${r}-${c}`] = weight; } }
    setPo1Weights(newWeights);
  };

  const openRejectModal = (id: string) => { setItemToReject(id); setRejectReasonText(''); setIsRejectModalOpen(true); };
  const confirmReject = () => {
    if (!itemToReject) return;
    if (!rejectReasonText.trim()) { alert('반송 사유를 입력해 주세요.'); return; }
    
    const updated = items.map(item => {
      if (item.id === itemToReject) {
        let currentTitle = item.title;
        const match = currentTitle.match(/\s*\((\d+)\)$/);
        let nextCount = 1;
        let baseTitle = currentTitle;
        if (match) {
          nextCount = parseInt(match[1]) + 1;
          baseTitle = currentTitle.replace(/\s*\(\d+\)$/, "");
        }
        const newTitle = `${baseTitle} (${nextCount})`;
        
        return { 
          ...item, 
          title: newTitle,
          status: PurchaseOrderSubCategory.REJECTED, 
          rejectReason: rejectReasonText, 
          rejectLog: { userId: currentUser.initials, timestamp: new Date().toLocaleString() } 
        };
      }
      return item;
    });
    saveItems(updated);
    setIsRejectModalOpen(false); 
    setItemToReject(null); 
    setActiveItem(null); 
    setView({ type: 'PURCHASE', sub: PurchaseOrderSubCategory.REJECTED });
  };

  const handleApprove = (id: string, stampType: keyof PurchaseOrderItem['stamps']) => {
    const userInit = currentUser.initials.toLowerCase().trim();
    const isMaster = currentUser.loginId === 'AJ5200';
    if (stampType === 'design' && !isMaster && userInit !== 'h-chun') { alert('설계 결재 권한이 없습니다. (h-chun 전용)'); return; }
    if (stampType === 'director' && !isMaster && userInit !== 'm-yeun') { alert('이사 결재 권한이 없습니다. (m-yeun 전용)'); return; }
    if (stampType === 'ceo' && !isMaster && userInit !== 'k-yeun') { alert('대표 결재 권한이 없습니다. (k-yeun 전용)'); return; }
    
    const updated = items.map(item => {
      if (item.id === id) {
        const newStamps = { ...item.stamps, [stampType]: { userId: currentUser.initials, timestamp: new Date().toLocaleString() } };
        
        // Completion logic based on dynamic path
        const slots = getApprovalSlots(item.type, item.recipient || '');
        const isComplete = slots.every(slot => !!newStamps[slot as keyof PurchaseOrderItem['stamps']]);
        
        return { ...item, stamps: newStamps, status: isComplete ? PurchaseOrderSubCategory.APPROVED : item.status };
      }
      return item;
    });
    saveItems(updated);
    const updatedActive = updated.find(i => i.id === id);
    if (updatedActive) setActiveItem(updatedActive);
    if (updatedActive?.status === PurchaseOrderSubCategory.APPROVED) { alert("최종 결재가 완료되어 PO 결재완료 목록으로 이동되었습니다."); setActiveItem(null); }
  };

  const handleFinalArchive = (order: PurchaseOrderItem) => {
    const updatedStamps = { ...order.stamps, final: { userId: currentUser.initials, timestamp: new Date().toISOString() } };
    const updatedOrders = items.map(o => o.id === order.id ? { ...o, stamps: updatedStamps } : o);
    saveItems(updatedOrders); alert('최종 보관 처리가 완료되어 수신처 보관함으로 이동되었습니다.'); setActiveItem(null); setView({ type: 'PURCHASE', sub: PurchaseOrderSubCategory.ARCHIVE });
  };

  const handleCopyOrder = (item: PurchaseOrderItem) => {
    const copiedRows = item.rows.map(row => ({ ...row, id: Math.random().toString(36).substr(2, 9), changedFields: [] }));
    while (copiedRows.length < 10) copiedRows.push(createEmptyRow());
    const copyData = {
      title: `[복사] ${item.title}`, recipient: item.recipient || '', telFax: item.telFax || '', reference: item.reference || '', senderName: item.senderName || '㈜ 아진정공',
      senderPerson: item.senderPerson || (item.type === PurchaseOrderSubCategory.PO3 ? '이재성 010-6342-5656' : item.type === PurchaseOrderSubCategory.PO1 ? '김미숙 010-9252-1565' : '이상구 010-6212-6945'),
      rows: copiedRows, notes: item.notes || [], headerRows: item.headerRows || [], merges: item.merges || {}, aligns: item.aligns || {}, weights: item.weights || {}, borders: item.borders || {}, hideInjectionColumn: item.hideInjectionColumn || false
    };
    localStorage.setItem('ajin_po_copy_buffer', JSON.stringify(copyData)); setView({ type: 'PURCHASE', sub: item.type as PurchaseOrderSubCategory }); setActiveItem(null); alert('발주서 내역이 신규 작성폼으로 복사되었습니다.');
  };

  const handleDeleteItemFromList = useCallback((id: string) => {
    if (!isMaster) return;
    setModal({
      type: 'DELETE_FILE',
      message: '해당 발주서 파일을 영구 삭제하시겠습니까? (복구 불가)',
      onConfirm: () => {
        const updated = items.filter(i => i.id !== id);
        saveItems(updated);
        setModal(null);
        alert('발주서가 삭제되었습니다.');
      }
    });
  }, [isMaster, items]);

  const handlePrint = () => {
    const printContent = document.querySelector('.document-print-content')?.innerHTML;
    if (!printContent) return;
    const filename = `${activeItem?.title || '발주서'}_${activeItem?.date || ''}`.replace(/[/\\?%*:|"<>]/g, '-');
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head>
            <title>${filename}</title>
            <script src="https://cdn.tailwindcss.com"></script>
            <style>
              @page { 
                size: A4 portrait; 
                margin: 5mm; 
              }
              body { 
                font-family: 'Gulim', sans-serif; 
                padding: 0; 
                margin: 0;
                background: white; 
                width: 210mm;
              }
              /* Force basic content to be black for professional printing, but allow internal classes to define font weight/size */
              * {
                color: black !important;
                border-color: black !important;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
              }
              .no-print { display: none !important; }
              table { 
                border-collapse: collapse; 
                width: 100%; 
                border: 1px solid black;
                table-layout: fixed;
              }
              th, td { 
                border: 1px solid black; 
                padding: 2px 4px; 
                vertical-align: middle;
                word-break: break-all;
                overflow: hidden;
              }
              .total-row { 
                background-color: white !important; 
              }
              .print-table-row { display: table-row !important; }
              .document-print-content { 
                width: 210mm !important; 
                box-shadow: none !important; 
                border: none !important; 
                padding: 10mm !important;
                margin: 0 auto !important;
                box-sizing: border-box;
              }
              /* Do not force specific font sizes globally in table to respect internal font-black, font-bold, text-xs classes */
              .document-print-content h1 {
                /* font-size: 24px; */
              }
            </style>
          </head>
          <body onload="window.print();">
            <div class="document-print-content">${printContent}</div>
          </body>
        </html>
      `);
      printWindow.document.close();
    }
  };

  const handleEditItem = (item: PurchaseOrderItem) => {
    setEditingItemId(item.id); 
    setOriginalRejectedItem(item); 
    setPo2Title(item.title); setPo2Recipient(item.recipient || ''); setPo2TelFax(item.telFax || ''); setPo2Reference(item.reference || ''); setPo2SenderName(item.senderName || '㈜ 아진정공'); setPo2SenderPerson(item.senderPerson || ''); setPo2Date(item.date);
    setPo2Rows(item.rows.length >= 10 ? item.rows : [...item.rows, ...Array(10 - item.rows.length).fill(null).map(createEmptyRow)]);
    setPo2Notes(item.notes || []); setPo1HeaderRows(item.headerRows || []); setPo1Merges(item.merges || {}); setPo1Aligns(item.aligns || {}); setPo1Weights(item.weights || {}); setPo1Borders(item.borders || {}); setHideInjectionColumn(item.hideInjectionColumn || false); setActiveItem(null);
  };

  const archivedItems = useMemo(() => items.filter(o => !!o.stamps.final), [items]);
  const archivedVendors = useMemo(() => { const vendorsSet = new Set<string>(); archivedItems.forEach(item => { if (item.recipient) vendorsSet.add(item.recipient); }); return Array.from(vendorsSet).sort(); }, [archivedItems]);
  const getPOTheme = (type: string) => { switch(type) { case PurchaseOrderSubCategory.PO1: case PurchaseOrderSubCategory.PO1_TEMP: return 'amber'; case PurchaseOrderSubCategory.PO2: case PurchaseOrderSubCategory.PO2_TEMP: return 'blue'; case PurchaseOrderSubCategory.PO3: case PurchaseOrderSubCategory.PO3_TEMP: return 'emerald'; default: return 'slate'; } };

  // New: Handle file link selection
  const handleLinkFileToRow = (file: StorageFile) => {
    if (!targetRowIdForFile) return;
    
    // Determine the URL
    let fileUrl = "";
    if (file.isMock && file.base64) {
      fileUrl = file.base64;
    } else if (supabase) {
      // Create a persistent link (using Supabase public URL if bucket is public, or we'll generate one)
      const { data } = supabase.storage.from('ajin-pdfdata').getPublicUrl(file.name);
      fileUrl = data.publicUrl;
    }
    
    setPo2Rows(prev => prev.map(row => 
      row.id === targetRowIdForFile ? { ...row, fileUrl } : row
    ));
    
    setIsFileSelectorOpen(false);
    setTargetRowIdForFile(null);
    alert('파일이 품명에 링크되었습니다.');
  };

  if (sub === PurchaseOrderSubCategory.UPLOAD) {
    const filteredFiles = files
      .filter(f => {
        const name = f.name.split('_').slice(1).join('_') || f.name;
        return name.toLowerCase().includes(searchTerm.toLowerCase());
      })
      .sort((a, b) => {
        if (fileSortField === 'name') {
          return sortOrder === 'ASC' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
        } else if (fileSortField === 'size') {
          const sizeA = a.metadata?.size || 0;
          const sizeB = b.metadata?.size || 0;
          return sortOrder === 'ASC' ? sizeA - sizeB : sizeB - sizeA;
        } else {
          return sortOrder === 'ASC' ? new Date(a.created_at).getTime() - new Date(b.created_at).getTime() : new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        }
      });

    const totalFilesPages = Math.ceil(filteredFiles.length / itemsPerPage);
    const paginatedFiles = filteredFiles.slice((filePage - 1) * itemsPerPage, filePage * itemsPerPage);

    return (
      <div className="space-y-6 text-left pb-12 animate-in fade-in duration-500">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h2 className="text-2xl md:text-3xl font-black text-black">PDF 파일 업로드 관리</h2>
            <div className="flex items-center gap-4 mt-2">
              <p className="text-slate-500 text-sm">총 {filteredFiles.length}건의 파일</p>
              <div className="h-4 w-[1px] bg-slate-200" />
              <div className="flex bg-slate-100 p-1 rounded-lg">
                <button onClick={() => { setFileSortField('created_at'); setSortOrder(sortOrder === 'DESC' ? 'ASC' : 'DESC'); }} className={`px-3 py-1 rounded-md text-[10px] font-bold transition-all ${fileSortField === 'created_at' ? 'bg-white text-black shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>날짜 {fileSortField === 'created_at' && (sortOrder === 'DESC' ? '↓' : '↑')}</button>
                <button onClick={() => { setFileSortField('name'); setSortOrder(sortOrder === 'DESC' ? 'ASC' : 'DESC'); }} className={`px-3 py-1 rounded-md text-[10px] font-bold transition-all ${fileSortField === 'name' ? 'bg-white text-black shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>이름 {fileSortField === 'name' && (sortOrder === 'DESC' ? '↓' : '↑')}</button>
                <button onClick={() => { setFileSortField('size'); setSortOrder(sortOrder === 'DESC' ? 'ASC' : 'DESC'); }} className={`px-3 py-1 rounded-md text-[10px] font-bold transition-all ${fileSortField === 'size' ? 'bg-white text-black shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>용량 {fileSortField === 'size' && (sortOrder === 'DESC' ? '↓' : '↑')}</button>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 w-full md:w-auto">
            <div className="relative flex-1 md:w-64">
              <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="파일명 검색..." className="w-full px-5 py-2.5 rounded-2xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none text-sm font-medium bg-white shadow-sm"/>
            </div>
            <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".pdf" className="hidden"/>
            <button 
              onClick={() => fileInputRef.current?.click()} 
              disabled={isUploading} 
              className="px-6 py-2.5 bg-blue-600 text-white rounded-2xl font-black text-sm shadow-xl hover:bg-blue-700 transition-all active:scale-95 flex items-center gap-2"
            >
              {isUploading ? (
                <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
              )}
              파일 업로드
            </button>
          </div>
        </div>

        {!supabase && (
          <div className="bg-blue-50 border border-blue-200 p-4 rounded-2xl mb-4 flex items-center gap-3">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <p className="text-sm font-bold text-blue-800">현재 Preview 환경입니다. 업로드한 파일은 브라우저(LocalStorage)에 임시 저장되며, 나중에 Supabase 연동 시 서버에 저장됩니다.</p>
          </div>
        )}

        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden overflow-x-auto">
          <table className="w-full text-left min-w-[800px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">파일 형식</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">파일명</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">용량</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">업로드 일시</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isFilesLoading ? (
                <tr><td colSpan={5} className="px-6 py-12 text-center text-slate-400"><div className="flex flex-col items-center gap-3"><div className="w-8 h-8 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin"></div><span className="font-bold">파일 목록을 불러오는 중...</span></div></td></tr>
              ) : filteredFiles.length === 0 ? (
                <tr><td colSpan={5} className="px-6 py-12 text-center text-slate-400 italic">저장된 파일이 없습니다.</td></tr>
              ) : (
                paginatedFiles.map(file => {
                  const displayFileName = file.name.split('_').slice(1).join('_') || file.name;
                  const sizeMB = file.metadata?.size ? (file.metadata.size / (1024 * 1024)).toFixed(2) : '0.00';
                  return (
                    <tr key={file.id} className="hover:bg-slate-50 transition-colors group">
                      <td className="px-6 py-4">
                        <div className="w-10 h-10 bg-red-50 text-red-500 rounded-xl flex items-center justify-center font-black text-[10px]">PDF</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                           <span className="text-sm font-black text-black break-all">{displayFileName}</span>
                           {file.isMock && <span className="text-[9px] text-blue-500 font-bold uppercase tracking-tighter">Local Mock File</span>}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="text-xs font-bold text-slate-500">{sizeMB} MB</span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="text-xs font-mono text-slate-400">{new Date(file.created_at).toLocaleString('ko-KR')}</span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          <button onClick={() => handleFileDownload(file)} className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold hover:bg-blue-600 hover:text-white transition-all">다운로드</button>
                          {isMaster && <button onClick={() => handleFileDeleteFromStorage(file)} className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {totalFilesPages > 1 && (
          <div className="flex justify-center items-center gap-3 mt-8 no-print pb-10">
            <button onClick={() => setFilePage(p => Math.max(1, p - 1))} disabled={filePage === 1} className="w-10 h-10 flex items-center justify-center bg-white border border-slate-200 rounded-xl disabled:opacity-30 hover:bg-slate-50 transition-all shadow-sm">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7"/></svg>
            </button>
            <div className="flex gap-2">
              {Array.from({length: totalFilesPages}, (_, i) => i + 1).map(num => (
                <button key={num} onClick={() => setFilePage(num)} className={`w-10 h-10 rounded-xl font-black text-sm transition-all ${filePage === num ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' : 'bg-white border border-slate-200 text-slate-400 hover:bg-slate-50'}`}>{num}</button>
              ))}
            </div>
            <button onClick={() => setFilePage(p => Math.min(totalFilesPages, p + 1))} disabled={filePage === totalFilesPages} className="w-10 h-10 flex items-center justify-center bg-white border border-slate-200 rounded-xl disabled:opacity-30 hover:bg-slate-50 transition-all shadow-sm">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7"/></svg>
            </button>
          </div>
        )}

        {modal && (modal.type === 'DELETE_FILE' || modal.type === 'DELETE_STORAGE_FILE' || modal.type === 'ALERT') && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[9999] p-4 no-print text-center">
            <div className="bg-white rounded-3xl shadow-2xl p-8 max-sm w-full border border-slate-200 animate-in fade-in zoom-in duration-200">
              <h3 className={`text-xl font-black mb-4 ${modal.type.includes('DELETE') ? 'text-red-600' : 'text-black'}`}>{modal.type === 'ALERT' ? '알림' : '확인'}</h3>
              <p className="text-slate-600 mb-8 font-medium leading-relaxed text-sm md:text-base text-center">{modal.message}</p>
              <div className="flex gap-3">
                {modal.type === 'ALERT' ? <button onClick={modal.onConfirm} className="flex-1 py-3 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition-all">확인</button> : <><button onClick={() => setModal(null)} className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-all">취소</button><button onClick={modal.onConfirm} className={`flex-1 py-3 text-white rounded-xl font-bold transition-all shadow-lg ${modal.type.includes('DELETE') ? 'bg-red-600 hover:bg-red-700 shadow-red-100' : 'bg-blue-600 hover:bg-blue-700 shadow-blue-100'}`}>확인</button></>}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (sub === PurchaseOrderSubCategory.CREATE) {
    const poTypes = [
      { id: PurchaseOrderSubCategory.PO1, icon: '01', desc: '사출 부품 발주(도번)', theme: 'amber' },
      { id: PurchaseOrderSubCategory.PO2, icon: '02', desc: '인쇄/스티커/주문 발주', theme: 'blue' },
      { id: PurchaseOrderSubCategory.PO3, icon: '03', desc: '메탈 부품 발주(도번)', theme: 'emerald' }
    ];
    return (
      <div className="space-y-8 py-12 animate-in fade-in zoom-in duration-500">
        <div className="text-center max-w-2xl mx-auto"><h2 className="text-3xl md:text-4xl font-black text-black mb-3 tracking-tight">PO 발주서 작성 하위 목록</h2><p className="text-slate-500 font-medium text-lg px-4">작성하고자 하는 발주서 양식을 선택하십시오.</p></div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto px-4 mt-12">
          {poTypes.map((po) => {
            const themeClasses = { amber: 'border-amber-100 hover:border-amber-500 bg-amber-50 text-amber-600 group-hover:bg-amber-500', blue: 'border-blue-100 hover:border-blue-500 bg-blue-50 text-blue-600 group-hover:bg-blue-500', emerald: 'border-emerald-100 hover:border-emerald-500 bg-emerald-50 text-emerald-600 group-hover:bg-emerald-500' }[po.theme as 'amber' | 'blue' | 'emerald'];
            return (
              <button key={po.id} onClick={() => setView({ type: 'PURCHASE', sub: po.id })} className="group bg-white p-10 rounded-[2.5rem] border-2 border-slate-100 hover:shadow-2xl transition-all duration-300 flex flex-col items-center text-center relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity"><span className="text-8xl font-black text-black select-none">{po.icon}</span></div>
                <div className={`w-20 h-20 rounded-3xl flex items-center justify-center mb-6 transition-all shadow-inner ${themeClasses} group-hover:text-white`}><span className="text-2xl font-black">PO</span></div>
                <h3 className={`text-2xl font-black text-black transition-colors mb-2 group-hover:text-${po.theme}-600`}>{po.id}</h3>
                <p className="text-slate-400 text-sm font-medium mb-6">{po.desc}</p>
                <div className="mt-auto inline-flex items-center gap-2 px-6 py-2.5 bg-slate-50 text-slate-500 group-hover:bg-slate-900 group-hover:text-white rounded-full text-xs font-black uppercase tracking-widest transition-all">작성 시작</div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if (isWritingAnyPO || !!editingItemId) {
    const { subtotal, vat, total } = getTotals(po2Rows);
    const currentItemType = editingItemId ? items.find(i => i.id === editingItemId)?.type : sub;
    const isPO1Now = currentItemType === PurchaseOrderSubCategory.PO1 || currentItemType === PurchaseOrderSubCategory.PO1_TEMP;
    const isPO3Now = currentItemType === PurchaseOrderSubCategory.PO3 || currentItemType === PurchaseOrderSubCategory.PO3_TEMP;
    const emailAddr = isPO1Now ? 'misuk.kim@ajinpre.net' : (isPO3Now ? 'jaesung.lee@ajinpre.net' : 'sangku.lee@ajinpre.net');
    const isEditingRejected = originalRejectedItem?.status === PurchaseOrderSubCategory.REJECTED;

    const getColumns = () => {
      if (isPO1Now) {
        const baseCols = [{ f: 'dept', cIdx: 0, label: 'MOLD', w: 'w-[6%]' }, { f: 'model', cIdx: 1, label: 'DN', w: 'w-[6%]' }, { f: 's', cIdx: 2, label: 'S', w: 'w-6' }, { f: 'itemName', cIdx: 3, label: 'PART NAME', w: 'flex-1' }, { f: 'cty', cIdx: 4, label: 'C\'TY', w: 'w-8' }, { f: 'price', cIdx: 5, label: 'Q\'TY', w: 'w-8' }, { f: 'material', cIdx: 6, label: 'MATERIAL', w: 'w-[10%]' }, { f: 'vendor', cIdx: 7, label: '금형업체', w: 'w-[5%]' }, { f: 'injectionVendor', cIdx: 8, label: '사출업체', w: 'w-[5%]' }, { f: 'orderQty', cIdx: 9, label: '주문수량', w: 'w-[5.3%]' }, { f: 'unitPrice', cIdx: 10, label: '단가', w: 'w-[5%]' }, { f: 'amount', cIdx: 11, label: '금액', w: 'w-[8%]' }, { f: 'remarks', cIdx: 12, label: '비고', w: 'w-[10%]' }];
        return hideInjectionColumn ? baseCols.filter(c => c.f !== 'injectionVendor') : baseCols;
      }
      if (isPO3Now) return [{ f: 'dept', cIdx: 0, label: '도 번', w: 'w-[11%]' }, { f: 'itemName', cIdx: 1, label: '품 명', w: 'flex-1' }, { f: 'model', cIdx: 2, label: '규 격', w: 'w-[13.3%]' }, { f: 'price', cIdx: 3, label: '수 량', w: 'w-[8%]' }, { f: 'unitPrice', cIdx: 4, label: '단 가', w: 'w-[9.6%]' }, { f: 'amount', cIdx: 5, label: '금 액', w: 'w-[15%]' }, { f: 'remarks', cIdx: 6, label: '비 고', w: 'w-[15%]' }];
      return [{ f: 'itemName', cIdx: 0, label: '품 명', w: 'flex-1' }, { f: 'model', cIdx: 1, label: '규 격', w: 'w-[20%]' }, { f: 'price', cIdx: 2, label: '수 량', w: 'w-[10%]' }, { f: 'unitPrice', cIdx: 3, label: '단 가', w: 'w-[12%]' }, { f: 'amount', cIdx: 4, label: '금 액', w: 'w-[15%]' }, { f: 'remarks', cIdx: 5, label: '비 고', w: 'w-[15%]' }];
    };
    const tableCols = getColumns();
    const upColIdx = tableCols.findIndex(c => c.f === 'unitPrice');

    const visibleSlots = getApprovalSlots(currentItemType as string, po2Recipient);

    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center max-w-[1000px] mx-auto no-print px-4">
          <div className="flex gap-2 items-center">
            {editingItemId && (
              <button onClick={() => { setEditingItemId(null); setOriginalRejectedItem(null); setView({ type: 'PURCHASE', sub: originalRejectedItem?.status || PurchaseOrderSubCategory.PENDING }); }} className="flex items-center gap-2 px-5 py-2.5 bg-white border border-slate-300 rounded-2xl font-bold text-sm shadow-sm hover:bg-slate-50 transition-all active:scale-95">← 목록으로</button>
            )}
            <button onClick={handleUndo} disabled={undoStack.length === 0} className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl font-black text-sm shadow-xl transition-all active:scale-95 ${undoStack.length > 0 ? 'bg-slate-700 text-white hover:bg-slate-900' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>되돌리기 ({undoStack.length})</button>
            {editingItemId && <span className="bg-red-50 text-red-600 px-3 py-1 rounded-full text-xs font-black animate-pulse border border-red-200">반송 건 수정 중</span>}
          </div>
          <button onClick={() => setIsVendorManagerOpen(!isVendorManagerOpen)} className="flex items-center gap-2 px-6 py-2.5 bg-slate-900 text-white rounded-2xl font-black text-sm shadow-xl hover:bg-slate-700 transition-all active:scale-95"><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>수신처 관리</button>
        </div>
        {isVendorManagerOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 no-print">
            <div className="bg-white rounded-[2.5rem] p-8 w-full max-w-2xl shadow-2xl animate-in fade-in zoom-in duration-300">
              <div className="flex justify-between items-center mb-6"><h3 className="text-2xl font-black text-black">수신처(업체) 관리</h3><button onClick={() => setIsVendorManagerOpen(false)} className="p-2 text-slate-400 hover:text-black"><svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12"/></svg></button></div>
              <div className="space-y-4 mb-8 p-6 bg-slate-50 rounded-3xl border border-slate-200">
                <div className="grid grid-cols-2 gap-4"><input type="text" value={newVendor.name} onChange={e => setNewVendor({...newVendor, name: e.target.value})} placeholder="수신처 이름" className="px-4 py-2 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-amber-500 font-bold"/><input type="text" value={newVendor.tel} onChange={e => setNewVendor({...newVendor, tel: e.target.value})} placeholder="TEL / FAX" className="px-4 py-2 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-amber-500 font-bold"/></div>
                <input type="text" value={newVendor.remarks} onChange={e => setNewVendor({...newVendor, remarks: e.target.value})} placeholder="비고" className="w-full px-4 py-2 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-amber-500 font-bold"/><button onClick={handleSaveVendor} className="w-full py-3 bg-amber-600 text-white rounded-xl font-black text-sm hover:bg-amber-700 transition-all">수신처 저장</button>
              </div>
              <div className="max-h-64 overflow-y-auto space-y-2 custom-scrollbar">{vendors.map(v => (<div key={v.name} className="flex justify-between items-center p-4 bg-white border border-slate-100 rounded-2xl hover:bg-amber-50 transition-colors"><div><p className="font-black text-black">{v.name}</p><p className="text-xs text-slate-400">{v.tel} | {v.remarks}</p></div><div className="flex gap-2"><button onClick={() => setNewVendor(v)} className="text-xs font-bold text-amber-600 hover:underline">편집</button><button onClick={() => { setVendors(vendors.filter(vendor => vendor.name !== v.name)); localStorage.setItem('ajin_vendors', JSON.stringify(vendors.filter(vendor => vendor.name !== v.name))); }} className="text-xs font-bold text-red-500 hover:underline">삭제</button></div></div>))}</div>
            </div>
          </div>
        )}
        {po1Selection && (
          <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[100] no-print bg-white/90 backdrop-blur shadow-2xl border border-slate-200 p-3 rounded-2xl flex items-center gap-3 animate-in slide-in-from-bottom-5">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2 border-r border-slate-100">Cell Tools (F4: Merge, Del: Clear)</span>
            <button onClick={handleMerge} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 shadow-sm transition-all whitespace-nowrap">셀 병합</button>
            <button onClick={handleUnmerge} className="px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-xs font-bold hover:bg-slate-200 shadow-sm transition-all whitespace-nowrap">병합 해제</button>
            <div className="h-6 w-[1px] bg-slate-200 mx-1"></div>
            <div className="flex bg-slate-100 p-1 rounded-lg">
              <button onClick={() => handleAlign('left')} className="p-1.5 hover:bg-white rounded transition-all"><svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 5a1 1 0 011-1h6a1 1 0 110 2H4a1 1 0 01-1-1zm0 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" /></svg></button>
              <button onClick={() => handleAlign('center')} className="p-1.5 hover:bg-white rounded transition-all"><svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3 5a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm-3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" /></svg></button>
              <button onClick={() => handleAlign('right')} className="p-1.5 hover:bg-white rounded transition-all"><svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm6 5a1 1 0 011-1h6a1 1 0 110 2h-6a1 1 0 01-1-1zm-6 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" /></svg></button>
            </div>
            <div className="h-6 w-[1px] bg-slate-200 mx-1"></div>
            <div className="flex bg-slate-100 p-1 rounded-lg">
                <button onClick={() => handleWeight('bold')} className="p-1.5 hover:bg-white rounded transition-all" title="Bold"><span className="font-bold text-xs">B</span></button>
                <button onClick={() => handleWeight('normal')} className="p-1.5 hover:bg-white rounded transition-all" title="Normal"><span className="font-normal text-xs">N</span></button>
            </div>
            <div className="h-6 w-[1px] bg-slate-200 mx-1"></div>
            {/* Border Control Section */}
            <div className="flex bg-slate-100 p-1 rounded-lg gap-1">
              <select value={activeBorderStyle} onChange={(e) => setActiveBorderStyle(e.target.value)} className="text-[10px] font-bold bg-white border border-slate-200 rounded px-1 outline-none">
                <option value="solid">실선</option>
                <option value="dotted">점선</option>
                <option value="none">선없음</option>
              </select>
              <button onClick={() => handleBorderApply('outer', activeBorderStyle)} className="px-2 py-1 bg-white hover:bg-blue-50 text-[10px] font-bold border border-slate-200 rounded transition-all shadow-sm">외측</button>
              <button onClick={() => handleBorderApply('inner', activeBorderStyle)} className="px-2 py-1 bg-white hover:bg-blue-50 text-[10px] font-bold border border-slate-200 rounded transition-all shadow-sm">내측</button>
            </div>
            <div className="h-6 w-[1px] bg-slate-200 mx-1"></div>
            <button onClick={handleClearSelectionText} className="px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-xs font-bold hover:bg-red-600 hover:text-white shadow-sm transition-all whitespace-nowrap">글자 삭제</button>
            <button onClick={() => setPo1Selection(null)} className="p-1 text-slate-400 hover:text-black ml-2"><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12"/></svg></button>
          </div>
        )}
        <div className="py-4 md:py-8 bg-slate-200 min-h-screen overflow-x-auto overflow-y-auto">
          <div className="bg-white border-[1px] border-slate-200 shadow-2xl mx-auto p-4 md:p-12 min-h-[297mm] w-full max-w-[1000px] text-black font-gulim text-left overflow-x-auto animate-in slide-in-from-bottom-8 duration-500">
            <div className="min-w-[800px]">
              <div className="flex flex-col items-center mb-1">
                <h1 className="text-4xl font-black tracking-[0.5rem] mb-2 uppercase">주 식 회 사 아 진 정 공</h1>
                <p className="text-sm font-bold text-slate-500">(우;08510) 서울시 금천구 디지털로9길 99, 스타밸리 806호</p>
                <p className="text-sm font-bold text-slate-500">☎ (02) 894-2611 FAX (02) 802-9941 <span className="ml-4 text-blue-600 underline">{emailAddr}</span></p>
                <div className="w-full h-1 bg-black mt-2"></div>
                <div className="w-full h-[1px] bg-black mt-0.5"></div>
              </div>
              <div className="flex justify-between items-end mb-1 relative border-b border-black pb-0">
                <div className="text-5xl font-black tracking-[2rem] uppercase leading-none pb-4 ml-20">발 주 서</div>
                <table className="border-collapse border-black border-[1px] text-center text-[11px] w-auto">
                  <tbody>
                    <tr>
                      <td rowSpan={2} className="border border-black px-1 py-4 bg-slate-50 font-bold w-10">결 재</td>
                      {visibleSlots.map(slot => (<td key={slot} className="border border-black py-1 px-4 bg-slate-50 font-bold min-w-[60px]">{getStampLabel(slot)}</td>))}
                    </tr>
                    <tr className="h-16">
                      {visibleSlots.map(slot => (<td key={slot} className="border border-black p-1 align-middle">{slot === 'writer' ? <div className="flex flex-col items-center"><span className="font-bold text-blue-700 text-xs">{currentUser.initials}</span><span className="text-[8px] text-slate-400 mt-1">{new Date().toLocaleDateString()}</span></div> : null}</td>))}
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="grid grid-cols-2 gap-x-20 mb-3 text-lg leading-tight"><div className="space-y-1"><div className="flex items-center gap-2 border-b border-black pb-0"><span className="font-bold whitespace-nowrap">수 신 :</span><div className="flex-1 flex gap-2 items-center"><select value={vendors.find(v => v.name === po2Recipient) ? po2Recipient : ""} onChange={(e) => handleRecipientSelect(e.target.value)} className="bg-slate-50 border rounded px-1 py-0.5 text-xs outline-none w-20"><option value="">직접입력</option>{vendors.map(v => <option key={v.name} value={v.name}>{v.name}</option>)}</select><input type="text" value={po2Recipient} onChange={(e) => { takeSnapshot(); setPo2Recipient(e.target.value); }} placeholder="수신처 명칭" className={`flex-1 outline-none font-bold ${isFieldChanged(po2Recipient, originalRejectedItem?.recipient) ? 'text-red-600' : ''}`} /><span className="font-bold">귀중</span></div></div><div className="flex items-center gap-2 border-b border-black pb-0"><span className="font-bold whitespace-nowrap">참 조 :</span><input type="text" value={po2Reference} onChange={(e) => { takeSnapshot(); setPo2Reference(e.target.value); }} placeholder="참조 내용" className={`flex-1 outline-none ${isFieldChanged(po2Reference, originalRejectedItem?.reference) ? 'text-red-600' : ''}`} /></div><div className="flex items-center gap-2 border-b border-black pb-0"><span className="font-bold whitespace-nowrap">TEL / FAX :</span><input type="text" value={po2TelFax} onChange={(e) => { takeSnapshot(); setPo2TelFax(e.target.value); }} placeholder="연락처 정보" className={`flex-1 outline-none ${isFieldChanged(po2TelFax, originalRejectedItem?.telFax) ? 'text-red-600' : ''}`} /></div></div><div className="space-y-1"><div className="flex gap-4 border-b border-black pb-0"><span className="w-16 font-bold">발 신 :</span><input type="text" value={po2SenderName} onChange={(e) => setPo2SenderName(e.target.value)} className={`flex-1 outline-none font-bold ${isFieldChanged(po2SenderName, originalRejectedItem?.senderName) ? 'text-red-600' : ''}`} /></div><div className="flex gap-4 border-b border-black pb-0"><span className="w-16 font-bold">담 당 :</span><input type="text" value={po2SenderPerson} onChange={(e) => setPo2SenderPerson(e.target.value)} className={`flex-1 outline-none ${isFieldChanged(po2SenderPerson, originalRejectedItem?.senderPerson) ? 'text-red-600' : ''}`} /></div><div className="flex gap-4 items-center border-b border-black pb-0"><span className="w-16 font-bold">작성일자 :</span><input type="text" value={po2Date} onChange={(e) => setPo2Date(e.target.value)} className={`flex-1 outline-none ${isFieldChanged(po2Date, originalRejectedItem?.date) ? 'text-red-600' : ''}`} /></div></div></div>
              {isPO1Now && (
                <div className="mb-3 flex items-center border-b border-black pb-1 gap-4">
                  <span className="font-bold text-sm text-slate-500 w-24">사출업체 검색 :</span>
                  <div className="flex-1 flex gap-2"><input type="text" value={injectionSearch} onChange={(e) => setInjectionSearch(e.target.value)} placeholder="사출업체명을 입력하세요 (AJIN 보관함 검색 - 줄바꿈 인식)" className="flex-1 outline-none text-sm font-bold bg-slate-50 px-2 py-0.5 rounded border border-slate-200" onKeyDown={(e) => e.key === 'Enter' && handleLoadInjectionData()}/><button onClick={handleLoadInjectionData} className="px-4 py-1 bg-amber-600 text-white rounded text-xs font-black hover:bg-amber-700 transition-all shadow-sm">데이터 불러오기</button>{hideInjectionColumn && (<button onClick={() => { takeSnapshot(); setHideInjectionColumn(false); }} className="px-4 py-1 bg-slate-200 text-slate-600 rounded text-xs font-black hover:bg-slate-300 transition-all shadow-sm">사출열 보이기</button>)}</div>
                </div>
              )}
              <div className="mb-4 flex items-center border-b border-black pb-1"><span className={`font-black text-2xl mr-4 uppercase`}>{isPO3Now || isPO1Now ? '기 종' : '제 목'} :</span><input type="text" value={po2Title} onChange={(e) => { takeSnapshot(); setPo2Title(e.target.value); }} placeholder={`${isPO3Now || isPO1Now ? '기종' : '발주서 제목'}을 입력하십시오 (필수)`} className={`flex-1 outline-none text-2xl font-bold placeholder:text-red-300 ${isFieldChanged(po2Title, originalRejectedItem?.title) ? 'text-red-600' : ''}`} /></div>
              {!isPO1Now && <p className={`mb-2 font-bold text-lg leading-tight`}>아래와 같이 주문 합니다.</p>}
              {isPO1Now && (
                <div className="mb-4 space-y-1 no-print">
                  {po1HeaderRows.map((val, idx) => (<div key={idx} className="flex gap-2 items-center group"><input value={val} onChange={(e) => handleUpdateHeaderRow(idx, e.target.value)} placeholder={`문구 입력 (${idx + 1})`} className={`flex-1 border-b border-slate-100 hover:border-blue-300 outline-none focus:border-blue-500 font-bold py-0.5 text-base ${(isEditingRejected && originalRejectedItem?.headerRows && originalRejectedItem.headerRows[idx] !== val) ? 'text-red-600' : ''}`} /><button onClick={() => handleRemoveHeaderRow(idx)} className="opacity-0 group-hover:opacity-100 text-red-500 text-xs px-2 py-1 font-bold">삭제</button></div>))}
                  <div className="pt-1"><button onClick={handleAddHeaderRow} className="text-blue-600 text-xs font-black uppercase tracking-widest">+ 문구 행 추가</button></div>
                </div>
              )}
              {isPO1Now && po1HeaderRows.map((val, idx) => val.trim() && (<p key={idx} className={`mb-1 font-bold text-base leading-tight hidden print-block ${(isEditingRejected && originalRejectedItem?.headerRows && originalRejectedItem.headerRows[idx] !== val) ? 'text-red-600' : ''}`}>{val}</p>))}
              <table className={`w-full border-collapse border-black border-[1px] text-[11px] md:text-[12px] select-none`}>
                <thead className="bg-slate-100"><tr>{tableCols.map(col => <th key={col.f} className={`border border-black p-1 ${col.w} text-center`}>{col.label}</th>)}<th className="border border-black p-1 w-14 text-center no-print text-black">관리</th></tr></thead>
                <tbody>
                  {po2Rows.map((row: any, rIdx) => (
                      <tr key={row.id}>
                        {tableCols.map(cell => {
                          const merge = po1Merges[`${rIdx}-${cell.cIdx}`];
                          const isSkipped = Object.entries(po1Merges).some(([key, m]: [string, any]) => {
                            const [mr, mc] = key.split('-').map(Number);
                            return rIdx >= mr && rIdx < mr + m.rS && cell.cIdx >= mc && cell.cIdx < mc + m.cS && !(rIdx === mr && cell.cIdx === mc);
                          });
                          if (isSkipped) return null;
                          let defaultAlign = 'center';
                          if (cell.f === 'itemName') defaultAlign = 'left';
                          if (cell.f === 'amount' || cell.f === 'unitPrice') defaultAlign = 'right';
                          const textAlign = po1Aligns[`${rIdx}-${cell.cIdx}`] || defaultAlign;
                          const textWeight = po1Weights[`${rIdx}-${cell.cIdx}`] || 'normal';
                          const isSelected = isCellSelected(rIdx, cell.cIdx);
                          const isChanged = row.changedFields?.includes(cell.f);
                          const borderStyles = getCellBorderStyle(rIdx, cell.cIdx, po1Borders);
                          
                          return (
                            <td key={cell.cIdx} rowSpan={merge?.rS || 1} colSpan={merge?.cS || 1} onMouseDown={() => handleCellMouseDown(rIdx, cell.cIdx)} onMouseEnter={() => handleCellMouseEnter(rIdx, cell.cIdx)} style={{ ...borderStyles }} className={`border border-black p-0 relative group/cell ${isSelected ? 'bg-blue-100 ring-2 ring-blue-400 z-10' : ''}`}>
                              {cell.f === 'amount' ? (
                                (row.unitPrice === '0' || row.unitPrice === 0) ? (
                                  <AutoExpandingTextarea value={row.amount} dataRow={rIdx} dataCol={cell.cIdx} onFocus={() => setPo1Selection({ sR: rIdx, sC: cell.cIdx, eR: rIdx, eC: cell.cIdx })} onChange={(e: any) => { takeSnapshot(); updatePo2RowField(row.id, 'amount', e.target.value); }} onKeyDown={(e: any) => handleRowKeyDown(e, rIdx, cell.cIdx)} style={{ textAlign: 'right', fontWeight: textWeight }} className={`font-mono text-right ${isChanged ? 'text-red-600' : ''}`} />
                                ) : (
                                  <div className={`w-full h-full flex items-center justify-end px-1 font-mono bg-slate-50/50 ${isChanged ? 'text-red-600' : ''}`} style={{ textAlign: textAlign as any, fontWeight: textWeight }}>{calculateAmount(row).toLocaleString()}</div>
                                )
                              ) : (
                                <div className="relative group/fileicon">
                                  <AutoExpandingTextarea 
                                    value={row[cell.f]} 
                                    dataRow={rIdx} 
                                    dataCol={cell.cIdx} 
                                    onFocus={() => setPo1Selection({ sR: rIdx, sC: cell.cIdx, eR: rIdx, eC: cell.cIdx })} 
                                    onChange={(e: any) => { takeSnapshot(); updatePo2RowField(row.id, cell.f as keyof OrderRow, e.target.value); }} 
                                    onKeyDown={(e: any) => handleRowKeyDown(e, rIdx, cell.cIdx)} 
                                    onPaste={(e: any) => handlePaste(e, rIdx, cell.cIdx)}
                                    onClick={(e: React.MouseEvent) => {
                                      // Request: Alt + Click to open file storage link
                                      if (e.altKey && cell.f === 'itemName') {
                                        e.preventDefault();
                                        setTargetRowIdForFile(row.id);
                                        setIsFileSelectorOpen(true);
                                      }
                                    }}
                                    style={{ textAlign, fontWeight: textWeight }} 
                                    className={`${isChanged ? 'text-red-600' : ''} ${cell.f === 'itemName' ? 'pr-6' : ''}`} 
                                  />
                                  {cell.f === 'itemName' && row.fileUrl && (
                                    <button 
                                      onClick={() => window.open(row.fileUrl, '_blank')}
                                      className="absolute right-0.5 top-0.5 text-red-500 hover:scale-110 transition-transform no-print"
                                      title="도면 파일 보기"
                                    >
                                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9v-2h2v2zm0-4H9V7h2v5z"/></svg>
                                    </button>
                                  )}
                                </div>
                              )}
                            </td>
                          );
                        })}
                        <td className="border border-black p-1 text-center no-print align-middle whitespace-nowrap text-black"><div className="flex items-center justify-center gap-1"><button onClick={() => handleInsertRow(rIdx)} className="w-5 h-5 flex items-center justify-center bg-blue-50 text-blue-600 rounded-full hover:bg-blue-600 hover:text-white transition-all text-sm font-bold" title="행 삽입">+</button><button onClick={() => handleDeleteTableRow(rIdx)} className="w-5 h-5 flex items-center justify-center bg-red-50 text-red-600 rounded-full hover:bg-red-600 hover:text-white transition-all text-sm font-bold" title="행 삭제">-</button></div></td>
                      </tr>
                  ))}
                  <tr className="bg-slate-50 font-black text-xs leading-tight">
                    <td colSpan={upColIdx} className="border border-black p-1 text-center tracking-widest text-black">합 계</td>
                    <td colSpan={2} className="border border-black p-1 text-right pr-2 font-mono">{subtotal.toLocaleString()}</td>
                    <td className="border border-black"></td>
                    <td className="border border-black no-print"></td>
                  </tr>
                  <tr className="bg-slate-50 font-black text-xs leading-tight">
                    <td colSpan={upColIdx} className="border border-black p-1 text-center tracking-widest text-black">부 가 세</td>
                    <td colSpan={2} className="border border-black p-1 text-right pr-2 font-mono">{vat.toLocaleString()}</td>
                    <td className="border border-black"></td>
                    <td className="border border-black no-print"></td>
                  </tr>
                  <tr className="bg-slate-900 text-white font-black text-xs leading-tight no-print">
                    <td colSpan={upColIdx} className="border border-black p-1 text-center tracking-widest">총 액</td>
                    <td colSpan={2} className="border border-black p-1 text-right pr-2 font-mono">{total.toLocaleString()}</td>
                    <td className="border border-black"></td>
                    <td className="border border-black"></td>
                  </tr>
                  <tr className="bg-white text-black font-black text-xs leading-tight hidden print-table-row">
                    <td colSpan={upColIdx} className="border border-black p-1 text-center tracking-widest">총 액</td>
                    <td colSpan={2} className="border border-black p-1 text-right pr-2 font-mono">{total.toLocaleString()}</td>
                    <td className="border border-black"></td>
                    <td className="border border-black"></td>
                  </tr>
                </tbody>
              </table>
              <div className={`mt-8 space-y-1 text-base font-bold text-slate-700 leading-tight`}>{po2Notes.map((note, idx) => (<div key={idx} className="flex gap-2 items-center group/note"><span className="shrink-0 w-6">{idx + 1}.</span><input type="text" value={note.label} onChange={(e) => handleNoteChange(idx, 'label', e.target.value)} placeholder="항목 제목" className={`w-32 outline-none border-b border-slate-200 hover:border-amber-300 focus:border-amber-500 transition-all bg-transparent font-black ${isNoteChanged(idx, 'label', note.label) ? 'text-red-600' : 'text-black'}`}/><span className="shrink-0">:</span><input type="text" value={note.content} onChange={(e) => handleNoteChange(idx, 'content', e.target.value)} placeholder="내용 입력" className={`flex-1 outline-none border-b border-slate-100 hover:border-slate-300 focus:border-amber-500 transition-all bg-transparent px-2 ${isNoteChanged(idx, 'content', note.content) ? 'text-red-600' : ''}`}/><div className="flex gap-1 no-print opacity-0 group-hover/note:opacity-100 transition-opacity"><button onClick={() => handleDeleteNoteRow(idx)} className="p-1 text-red-400 hover:text-red-600"><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 12H9m12 0a9 9 0 11-18 0 a9 9 0 0118 0z" /></svg></button></div></div>))}<div className="pt-2 no-print"><button onClick={handleAddNoteRow} className="flex items-center gap-1 text-blue-600 hover:text-blue-800 text-xs font-black uppercase tracking-widest"><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 a9 9 0 0118 0z" /></svg>비고/유의 항목 추가</button></div></div>
              <div className="mt-12 flex justify-center gap-4 no-print">
                  <button onClick={() => handlePo2Submit(true)} disabled={!po2Title.trim()} className="px-10 py-5 rounded-2xl font-black text-2xl bg-slate-400 text-white hover:bg-slate-500 transition-all shadow-xl active:scale-95 disabled:opacity-30">임 시 저 장</button>
                  <button onClick={() => handlePo2Submit(false)} disabled={!po2Title.trim()} className="px-16 py-5 rounded-2xl font-black text-2xl bg-slate-900 text-white hover:bg-amber-600 transition-all shadow-2xl active:scale-95 disabled:opacity-30">{editingItemId && !originalRejectedItem?.status.includes('임시저장') ? '수 정 완 로 (재제출)' : '작 성 완 료'}</button>
              </div>
            </div>
          </div>
        </div>
        
        {/* New: File Selector Modal for linking PDF files */}
        {isFileSelectorOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[150] flex items-center justify-center p-4 no-print">
            <div className="bg-white rounded-[2rem] p-8 w-full max-w-3xl shadow-2xl animate-in fade-in zoom-in duration-300 flex flex-col max-h-[80vh]">
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
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
                <div className="grid grid-cols-1 gap-2">
                  {files.filter(f => f.name.toLowerCase().includes(searchTerm.toLowerCase())).map(file => {
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
              </div>
            </div>
          </div>
        )}

        {isRejectModalOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl animate-in fade-in zoom-in duration-300">
              <h3 className="text-2xl font-black text-black mb-4">반송 사유 입력</h3>
              <p className="text-slate-500 text-sm mb-6 font-medium">결재권자에게 전달할 반송 사유를 상세히 입력해 주세요.</p>
              <textarea 
                value={rejectReasonText} 
                onChange={(e) => setRejectReasonText(e.target.value)} 
                placeholder="여기에 사유를 입력하십시오..." 
                className="w-full h-40 p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-red-500 font-bold mb-8"
              />
              <div className="flex gap-4">
                <button onClick={() => { setIsRejectModalOpen(false); setItemToReject(null); }} className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-xl font-black transition-all">취소</button>
                <button onClick={confirmReject} className="flex-1 py-4 bg-red-600 text-white rounded-xl font-black transition-all shadow-lg hover:bg-red-700">반송 처리</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (activeItem) {
    const isPOForm = activeItem.type === PurchaseOrderSubCategory.PO1 || activeItem.type === PurchaseOrderSubCategory.PO2 || activeItem.type === PurchaseOrderSubCategory.PO3 || activeItem.type === '사출발주서' || activeItem.type === '인쇄발주서' || activeItem.type === '메탈발주서';
    const isPO1Active = activeItem.type === PurchaseOrderSubCategory.PO1 || activeItem.type === '사출발주서';
    const isPO3Active = activeItem.type === PurchaseOrderSubCategory.PO3 || activeItem.type === '메탈발주서';
    const { subtotal, vat, total } = getTotals(activeItem.rows, isPO1Active);
    const stamps = activeItem.stamps;
    const emailAddrActive = isPO1Active ? 'misuk.kim@ajinpre.net' : (isPO3Active ? 'jaesung.lee@ajinpre.net' : 'sangku.lee@ajinpre.net');
    const headerRows = activeItem.headerRows || [];
    const merges = activeItem.merges || {};
    const aligns = activeItem.aligns || {};
    const weights = activeItem.weights || {};
    const borders = activeItem.borders || {};
    const activeHideInjection = activeItem.hideInjectionColumn || false;
    const tableColsActive = isPO1Active ? 
      (activeHideInjection ? 
        [{ f: 'dept', cIdx: 0, label: 'MOLD', w: 'w-[6%]' }, { f: 'model', cIdx: 1, label: 'DN', w: 'w-[6%]' }, { f: 's', cIdx: 2, label: 'S', w: 'w-6' }, { f: 'itemName', cIdx: 3, label: 'PART NAME', w: 'flex-1' }, { f: 'cty', cIdx: 4, label: 'C\'TY', w: 'w-8' }, { f: 'price', cIdx: 5, label: 'Q\'TY', w: 'w-8' }, { f: 'material', cIdx: 6, label: 'MATERIAL', w: 'w-[10%]' }, { f: 'vendor', cIdx: 7, label: '금형업체', w: 'w-[5%]' }, { f: 'orderQty', cIdx: 9, label: '주문수량', w: 'w-[5.3%]' }, { f: 'unitPrice', cIdx: 10, label: '단가', w: 'w-[5%]' }, { f: 'amount', cIdx: 11, label: '금액', w: 'w-[8%]' }, { f: 'remarks', cIdx: 12, label: '비고', w: 'w-[10%]' }] :
        [{ f: 'dept', cIdx: 0, label: 'MOLD', w: 'w-[6%]' }, { f: 'model', cIdx: 1, label: 'DN', w: 'w-[6%]' }, { f: 's', cIdx: 2, label: 'S', w: 'w-6' }, { f: 'itemName', cIdx: 3, label: 'PART NAME', w: 'flex-1' }, { f: 'cty', cIdx: 4, label: 'C\'TY', w: 'w-8' }, { f: 'price', cIdx: 5, label: 'Q\'TY', w: 'w-8' }, { f: 'material', cIdx: 6, label: 'MATERIAL', w: 'w-[10%]' }, { f: 'vendor', cIdx: 7, label: '금형업체', w: 'w-[5%]' }, { f: 'injectionVendor', cIdx: 8, label: '사출업체', w: 'w-[5%]' }, { f: 'orderQty', cIdx: 9, label: '주문수량', w: 'w-[5.3%]' }, { f: 'unitPrice', cIdx: 10, label: '단가', w: 'w-[5%]' }, { f: 'amount', cIdx: 11, label: '금액', w: 'w-[8%]' }, { f: 'remarks', cIdx: 12, label: '비고', w: 'w-[10%]' }]
      ) : (isPO3Active ? [{ f: 'dept', cIdx: 0, label: '도 번', w: 'w-[11%]' }, { f: 'itemName', cIdx: 1, label: '품 명', w: 'flex-1' }, { f: 'model', cIdx: 2, label: '규 격', w: 'w-[13.3%]' }, { f: 'price', cIdx: 3, label: '수 량', w: 'w-[8%]' }, { f: 'unitPrice', cIdx: 4, label: '단 가', w: 'w-[9.6%]' }, { f: 'amount', cIdx: 5, label: '금 액', w: 'w-[15%]' }, { f: 'remarks', cIdx: 6, label: '비 고', w: 'w-[15%]' }] : [{ f: 'itemName', cIdx: 0, label: '품 명', w: 'flex-1' }, { f: 'model', cIdx: 1, label: '규 격', w: 'w-[20%]' }, { f: 'price', cIdx: 2, label: '수 량', w: 'w-[10%]' }, { f: 'unitPrice', cIdx: 3, label: '단 가', w: 'w-[12%]' }, { f: 'amount', cIdx: 4, label: '금 액', w: 'w-[15%]' }, { f: 'remarks', cIdx: 5, label: '비 고', w: 'w-[15%]' }]);
    
    const upColIdxActive = tableColsActive.findIndex(c => c.f === 'unitPrice');
    const visibleSlots = getApprovalSlots(activeItem.type, activeItem.recipient || '');

    return (
      <div className="py-8 bg-slate-200 min-h-screen">
        <div className="max-w-[1000px] mx-auto mb-6 flex flex-wrap justify-between items-center px-4 no-print gap-4">
          <button onClick={() => setActiveItem(null)} className="bg-white px-6 py-2.5 rounded-xl font-bold shadow-lg border border-slate-300 flex items-center gap-2 text-sm">← 목록으로</button>
<div className="flex flex-wrap gap-3">
  {activeItem.status === PurchaseOrderSubCategory.PENDING && (
    <button onClick={() => openRejectModal(activeItem.id)} className="px-6 py-2.5 bg-red-100 text-red-600 rounded-xl font-bold hover:bg-red-600 hover:text-white border border-red-200 shadow-lg transition-all uppercase tracking-widest text-xs">
      반송
    </button>
  )}
  {activeItem.status === PurchaseOrderSubCategory.APPROVED && !stamps.final && (
    <button onClick={() => handleFinalArchive(activeItem)} className="px-10 py-2.5 bg-emerald-600 text-white rounded-xl font-black shadow-lg hover:bg-emerald-700 transition-all active:scale-95 text-xs">
      완 료
    </button>
  )}
  {stamps.final && (
    <button onClick={() => handleCopyOrder(activeItem)} className="px-8 py-2.5 bg-amber-500 text-white rounded-xl font-black shadow-lg hover:bg-amber-600 transition-all active:scale-95 text-xs">
      발주서 복사하기
    </button>
  )}
  <button onClick={handlePrint} className="bg-blue-600 text-white px-8 py-2.5 rounded-xl font-black shadow-lg hover:bg-blue-700 text-xs">
    PDF 저장 / 인쇄
  </button>
</div>        </div>
        <div className="bg-white border-[1px] border-slate-200 shadow-2xl mx-auto p-4 md:p-12 min-h-[297mm] w-full max-w-[1000px] text-black font-gulim text-left overflow-x-auto document-print-content"><div className="min-w-[800px]">{isPOForm ? (<><div className="flex flex-col items-center mb-1 text-base"><h1 className="text-4xl font-black tracking-[0.5rem] mb-2 uppercase">주 식 회 사 아 진 정 공</h1><p className="font-bold text-slate-500">(우;08510) 서울시 금천구 디지털로9길 99, 스타밸리 806호</p><p className="font-bold text-slate-500">☎ (02) 894-2611 FAX (02) 802-9941 <span className="ml-4 text-blue-600 underline">{emailAddrActive}</span></p><div className="w-full h-1 bg-black mt-2"></div></div><div className="flex justify-between items-end mb-1 relative border-b border-black pb-0"><div className="text-5xl font-black tracking-[2rem] uppercase leading-none pb-4 ml-20">발 주 서</div><table className="border-collapse border-black border-[1px] text-center text-[11px] w-auto"><tbody><tr><td rowSpan={2} className="border border-black px-1 py-4 bg-slate-50 font-bold w-10">결 재</td>{visibleSlots.map(slot => (<td key={slot} className="border border-black py-1 px-4 bg-slate-50 font-bold min-w-[60px]">{getStampLabel(slot)}</td>))}</tr><tr className="h-16">{visibleSlots.map(slot => (<td key={slot} className={`border border-black p-1 align-middle ${activeItem.status === PurchaseOrderSubCategory.PENDING && slot !== 'writer' && !stamps[slot as keyof PurchaseOrderItem['stamps']] ? 'cursor-pointer hover:bg-amber-50' : ''}`} onClick={() => slot !== 'writer' && !stamps[slot as keyof PurchaseOrderItem['stamps']] && activeItem.status === PurchaseOrderSubCategory.PENDING && handleApprove(activeItem.id, slot as any)}>{stamps[slot as keyof PurchaseOrderItem['stamps']] ? <div className="flex flex-col items-center"><span className={`font-bold text-xs ${slot==='writer'?'text-blue-700':slot==='ceo'?'text-red-700':'text-green-700'}`}>{stamps[slot as keyof PurchaseOrderItem['stamps']]?.userId}</span><span className="text-[7px] text-slate-400 mt-0.5">{stamps[slot as keyof PurchaseOrderItem['stamps']]?.timestamp}</span></div> : (activeItem.status === PurchaseOrderSubCategory.PENDING ? <span className="text-[9px] text-slate-300 no-print">승인</span> : null)}</td>))}</tr></tbody></table></div><div className="grid grid-cols-2 gap-x-20 mb-3 text-lg leading-tight"><div className="space-y-1"><div className="flex items-center gap-2 border-b border-black pb-0"><span className="font-bold">수 신 :</span><span className="font-bold text-blue-800">{activeItem.recipient || "-"} 귀중</span></div>{activeItem.reference && (<div className="flex items-center gap-2 border-b border-black pb-0"><span className="font-bold">참 조 :</span><span className="font-medium text-slate-700">{activeItem.reference}</span></div>)}<div className="flex items-center gap-2 border-b border-black pb-0"><span className="font-bold">연락처 :</span><span>{activeItem.telFax || "-"}</span></div><div className="flex items-center gap-2 border-b border-black pb-0"><span className="font-bold">작성일자 :</span><span>{activeItem.date}</span></div></div><div className="space-y-1"><div className="flex gap-4 border-b border-black pb-0"><span className="w-16 font-bold">발 신 :</span> <span className="font-bold">{activeItem.senderName || "㈜ 아진정공"}</span></div><div className="flex gap-4 border-b border-black pb-0"><span className="w-16 font-bold">담 당 :</span> <span>{activeItem.senderPerson || (activeItem.type === PurchaseOrderSubCategory.PO3 ? "이재성 010-6342-5656" : activeItem.type === PurchaseOrderSubCategory.PO1 ? "김미숙 010-9252-1565" : "이상구 010-6212-6945")}</span></div></div></div><div className={`mb-4 flex items-center border-b border-black pb-1 font-black text-xl underline underline-offset-4 decoration-slate-300 uppercase`}>{isPO3Active || isPO1Active ? '기 종' : '제 목'} : {activeItem.title}</div>{isPO1Active ? (<div className="mb-4">{headerRows.map((row: string, idx: number) => (<p key={idx} className={`mb-1 font-bold text-base leading-tight`}>{row}</p>))}</div>) : (<p className={`mb-2 font-bold text-lg leading-tight`}>아래와 같이 주문 합니다.</p>)}<table className={`w-full border-collapse border-black border-[1px] text-[11px] md:text-[12px]`}><thead className="bg-slate-100"><tr>{tableColsActive.map(col => <th key={col.f} className={`border border-black p-1 ${col.w} text-center text-black`}>{col.label}</th>)}</tr></thead><tbody>{activeItem.rows.map((row: any, rIdx: number) => (<tr key={row.id}>{tableColsActive.map(cell => { const merge = merges[`${rIdx}-${cell.cIdx}`]; const isSkipped = Object.entries(merges).some(([key, m]: [string, any]) => { const [mr, mc] = key.split('-').map(Number); return rIdx >= mr && rIdx < mr + m.rS && cell.cIdx >= mc && cell.cIdx < mc + m.cS && !(rIdx === mr && cell.cIdx === mc); }); if (isSkipped) return null; let defaultAlign = 'center'; if (cell.f === 'itemName') defaultAlign = 'left'; if (cell.f === 'amount' || cell.f === 'unitPrice') defaultAlign = 'right'; const textAlign = aligns[`${rIdx}-${cell.cIdx}`] || defaultAlign; const textWeight = weights[`${rIdx}-${cell.cIdx}`] || 'normal'; const isChanged = row.changedFields?.includes(cell.f); const borderStyles = getCellBorderStyle(rIdx, cell.cIdx, borders); return (<td key={cell.cIdx} rowSpan={merge?.rS || 1} colSpan={merge?.cS || 1} style={{ ...borderStyles, textAlign: textAlign as any, fontWeight: textWeight }} className={`border border-black p-1 relative ${isChanged ? 'text-red-600' : ''}`}>{cell.f === 'amount' ? ((row.unitPrice === '0' || row.unitPrice === 0) ? (row.amount || '0') : calculateAmount(row, isPO1Active).toLocaleString()) : (<div className="whitespace-pre-wrap relative group/activefile">{row[cell.f]}{cell.f === 'itemName' && row.fileUrl && (<button onClick={() => window.open(row.fileUrl, '_blank')} className="absolute right-0 top-0 text-red-500 hover:scale-110 transition-transform no-print" title="파일 보기"><svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9v-2h2v2zm0-4H9V7h2v5z"/></svg></button>)}</div>)}</td>); })}</tr>))}
                <tr className="bg-slate-50 font-black text-xs leading-tight">
                  <td colSpan={upColIdxActive} className="border border-black p-1 text-center tracking-widest text-black">합 계</td>
                  <td colSpan={2} className="border border-black p-1 text-right pr-2 font-mono">{subtotal.toLocaleString()}</td>
                  <td className="border border-black"></td>
                </tr>
                <tr className="bg-slate-50 font-black text-xs leading-tight">
                  <td colSpan={upColIdxActive} className="border border-black p-1 text-center tracking-widest text-black">부 가 세</td>
                  <td colSpan={2} className="border border-black p-1 text-right pr-2 font-mono">{vat.toLocaleString()}</td>
                  <td className="border border-black"></td>
                </tr>
                <tr className="bg-slate-900 text-white font-black text-xs leading-tight no-print">
                  <td colSpan={upColIdxActive} className="border border-black p-1 text-center tracking-widest">총 액</td>
                  <td colSpan={2} className="border border-black p-1 text-right pr-2 font-mono">{total.toLocaleString()}</td>
                  <td className="border border-black"></td>
                </tr>
                <tr className="bg-white text-black font-black text-xs leading-tight hidden print-table-row total-row">
                  <td colSpan={upColIdxActive} className="border border-black p-1 text-center tracking-widest">총 액</td>
                  <td colSpan={2} className="border border-black p-1 text-right pr-2 font-mono">{total.toLocaleString()}</td>
                  <td className="border border-black"></td>
                </tr>
              </tbody></table><div className={`mt-8 space-y-1 text-base font-bold text-slate-700 leading-tight`}>{activeItem.notes?.map((note, idx) => (<div key={idx} className="flex gap-2"><span className="shrink-0 w-6">{idx + 1}.</span><span className={`shrink-0 w-32 tracking-tighter ${activeItem.isResubmitted && originalRejectedItem?.notes && (originalRejectedItem.notes[idx]?.label !== note.label) ? 'text-red-600' : ''}`}>{note.label}</span><span className="shrink-0">:</span><span className={`flex-1 ${activeItem.isResubmitted && originalRejectedItem?.notes && (originalRejectedItem.notes[idx]?.content !== note.content) ? 'text-red-600' : ''}`}>{note.content}</span></div>)) || (<p className="text-slate-300 italic">추가 항목 없음</p>)}</div>{activeItem.stamps.final && (<div className="mt-12 pt-4 border-t border-slate-100 flex items-center gap-3 text-xs md:text-sm font-bold text-blue-400"><span className="text-slate-400 uppercase">완료:</span><span className="text-blue-500 uppercase">{activeItem.stamps.final.userId}</span><span className="tabular-nums">{formatCompletionDate(activeItem.stamps.final.timestamp)}</span></div>)}</>) : (<div className="p-10 text-center italic text-slate-400">양식 준비중</div>)}</div></div>
        
        {isRejectModalOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl animate-in fade-in zoom-in duration-300">
              <h3 className="text-2xl font-black text-black mb-4">반송 사유 입력</h3>
              <p className="text-slate-500 text-sm mb-6 font-medium">결재권자에게 전달할 반송 사유를 상세히 입력해 주세요.</p>
              <textarea 
                value={rejectReasonText} 
                onChange={(e) => setRejectReasonText(e.target.value)} 
                placeholder="여기에 사유를 입력하십시오..." 
                className="w-full h-40 p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-red-500 font-bold mb-8"
              />
              <div className="flex gap-4">
                <button onClick={() => { setIsRejectModalOpen(false); setItemToReject(null); }} className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-xl font-black transition-all">취소</button>
                <button onClick={confirmReject} className="flex-1 py-4 bg-red-600 text-white rounded-xl font-black transition-all shadow-lg hover:bg-red-700">반송 처리</button>
              </div>
            </div>
          </div>
        )}
      </div>);
  }

  if (sub === PurchaseOrderSubCategory.ARCHIVE && !selectedArchiveVendor) {
    return (
      <div className="space-y-8 py-12 animate-in fade-in zoom-in duration-500">
        <div className="text-center max-w-2xl mx-auto"><h2 className="text-3xl md:text-4xl font-black text-black mb-3 tracking-tight">수신처별 보관함</h2><p className="text-slate-500 font-medium text-lg px-4">보관된 발주서가 있는 수신처 목록입니다.</p></div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6 max-w-6xl mx-auto px-4 mt-12">{archivedVendors.length === 0 ? (<div className="col-span-full py-20 text-center text-slate-400 font-bold italic">보관된 내역이 없습니다.</div>) : (archivedVendors.map(vendor => (<button key={vendor} onClick={() => setSelectedArchiveVendor(vendor)} className="group bg-white p-6 rounded-3xl border-2 border-slate-100 hover:border-amber-500 hover:shadow-xl transition-all flex flex-col items-center gap-3 relative"><div className="w-16 h-16 bg-amber-50 rounded-2xl flex items-center justify-center group-hover:bg-amber-500 group-hover:text-white transition-all text-amber-600"><svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 012-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg></div><span className="font-black text-black text-sm truncate w-full text-center">{vendor}</span><span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">{archivedItems.filter(i => i.recipient === vendor).length} Documents</span></button>)))}</div>
      </div>
    );
  }

  const filtered = sub === PurchaseOrderSubCategory.ARCHIVE ? archivedItems.filter(item => item.recipient === selectedArchiveVendor) : items.filter(item => item.status === sub && !item.stamps.final);
  const sorted = [...filtered].sort((a, b) => { const timeA = new Date(a.createdAt).getTime(); const timeB = new Date(b.createdAt).getTime(); return sortOrder === 'DESC' ? timeB - timeA : timeA - timeB; });
  const searchFiltered = sorted.filter(item => item.title.toLowerCase().includes(searchTerm.toLowerCase()) || (item.recipient && item.recipient.toLowerCase().includes(searchTerm.toLowerCase())));
  const totalPages = Math.ceil(searchFiltered.length / itemsPerPage);
  const paginated = searchFiltered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  const renderApprovalSteps = (item: PurchaseOrderItem) => {
    const slots = getApprovalSlots(item.type, item.recipient || '');
    const steps = slots.map(s => ({ id: s, label: getStampLabel(s), info: item.stamps[s as keyof PurchaseOrderItem['stamps']] }));
    
    let currentStepIdx = 0;
    for(let i=0; i<steps.length; i++) {
        if(steps[i].info) currentStepIdx = i+1;
        else break;
    }
    
    return (<div className="flex gap-4 mt-6">{steps.map((step, idx) => { let dotColor = 'bg-slate-200'; if (step.info) dotColor = 'bg-green-500 shadow-sm'; else if (idx === currentStepIdx) dotColor = item.isResubmitted ? 'bg-red-500 animate-pulse ring-4 ring-red-100' : 'bg-blue-500 animate-pulse ring-4 ring-blue-100'; return (<div key={step.id} className="group/step relative"><div className={`w-6 h-6 rounded-full transition-all duration-300 ${dotColor}`} /><div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 px-2 py-1 bg-slate-900 text-white text-[9px] font-black rounded opacity-0 group-hover/step:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-20 uppercase tracking-tighter shadow-2xl">{step.label} {step.info ? `(${step.info.userId})` : idx === currentStepIdx ? '(대기)' : ''}</div></div>); })}</div>);
  };

  return (
    <div className="space-y-6 text-left pb-12 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-4">{sub === PurchaseOrderSubCategory.ARCHIVE && selectedArchiveVendor && (<button onClick={() => setSelectedArchiveVendor(null)} className="p-2 bg-white border border-slate-200 rounded-xl shadow-sm hover:bg-slate-50 text-slate-600 transition-all"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7"/></svg></button>)}<div><h2 className="text-2xl md:text-3xl font-black text-black">{sub === PurchaseOrderSubCategory.ARCHIVE ? (selectedArchiveVendor ? `${selectedArchiveVendor} 보관함` : sub) : sub}</h2><div className="flex items-center gap-4 mt-1"><p className="text-slate-500 text-sm">총 {searchFiltered.length}건의 항목</p><div className="h-4 w-[1px] bg-slate-200" /><div className="flex bg-slate-100 p-1 rounded-lg no-print"><button onClick={() => setViewMode('ICON')} className={`px-3 py-1 rounded-md text-[10px] font-bold transition-all ${viewMode === 'ICON' ? 'bg-white text-black shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>아이콘</button><button onClick={() => setViewMode('LIST')} className={`px-3 py-1 rounded-md text-[10px] font-bold transition-all ${viewMode === 'LIST' ? 'bg-white text-black shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>리스트</button></div><div className="flex bg-slate-100 p-1 rounded-lg no-print"><button onClick={() => setSortOrder('DESC')} className={`px-3 py-1 rounded-md text-[10px] font-bold transition-all ${sortOrder === 'DESC' ? 'bg-white text-black shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>최신순</button><button onClick={() => setSortOrder('ASC')} className={`px-3 py-1 rounded-md text-[10px] font-bold transition-all ${sortOrder === 'ASC' ? 'bg-white text-black shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>과거순</button></div></div></div></div>
        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto"><div className="relative flex-1 sm:w-64"><input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder={`${isPO2 ? '제목' : '기종'} 또는 수신처 검색...`} className="w-full px-5 py-2.5 rounded-2xl border border-slate-200 focus:ring-2 focus:ring-amber-500 outline-none text-sm font-medium bg-white shadow-sm"/></div></div>
      </div>
      {viewMode === 'ICON' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
          {paginated.length === 0 ? (<div className="col-span-full py-24 text-center text-slate-400 bg-white rounded-3xl border-4 border-dashed border-slate-100 text-lg font-medium italic">데이터가 없습니다.</div>) : (paginated.map(item => {
            const theme = getPOTheme(item.type);
            const themeColors: any = { amber: 'bg-amber-50 border-amber-100 text-amber-600', blue: 'bg-blue-50 border-blue-100 text-blue-600', emerald: 'bg-emerald-50 border-emerald-100 text-emerald-600', slate: 'bg-slate-50 border-slate-100 text-slate-600' };
            const isTemp = item.status.includes('임시저장');
            return (
              <div key={item.id} className="relative group">
                <button onClick={() => { if (sub === PurchaseOrderSubCategory.REJECTED || isTemp) handleEditItem(item); else setActiveItem(item); }} className="w-full bg-white p-6 rounded-3xl shadow-sm border-2 border-slate-100 hover:border-slate-400 hover:shadow-xl transition-all flex flex-col items-center relative overflow-hidden text-center h-full">
                  <div className={`absolute top-0 left-0 w-full h-1.5 ${theme === 'amber' ? 'bg-amber-500' : theme === 'blue' ? 'bg-blue-500' : theme === 'emerald' ? 'bg-emerald-500' : 'bg-slate-500'} opacity-0 group-hover:opacity-100 transition-opacity`}></div>
                  <div className="w-full flex justify-between items-start mb-4"><span className={`text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-tighter ${item.status === PurchaseOrderSubCategory.REJECTED ? 'bg-red-100 text-red-600' : isTemp ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>{item.status}</span><span className={`text-[8px] font-black ${themeColors[theme]} px-2 py-0.5 rounded-full uppercase tracking-tighter`}>{item.type}</span></div>
                  <div className={`w-16 h-20 ${themeColors[theme]} rounded-xl flex items-center justify-center mb-4 border group-hover:scale-105 transition-transform`}><svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg></div>
                  <div className="w-full text-center px-2 mb-2"><h3 className={`font-black text-sm truncate w-full mb-1 leading-tight ${item.isResubmitted ? 'text-blue-600' : 'text-black'}`}>{item.isResubmitted && <span className="mr-1">[수정본]</span>}{item.title}</h3><p className="text-[10px] text-slate-500 font-bold truncate mb-1">{item.recipient || "-"}</p><p className="text-[10px] text-slate-400 font-bold uppercase tabular-nums tracking-tight">{item.date}</p>{sub === PurchaseOrderSubCategory.REJECTED && item.rejectReason && (<div className="mt-3 p-2 bg-red-50 border border-red-100 rounded-lg text-left"><p className="text-[9px] font-black text-red-600 uppercase mb-0.5 tracking-tighter">반송사유</p><p className="text-[10px] text-red-700 leading-tight font-medium line-clamp-2">{item.rejectReason}</p></div>)}</div>
                  {item.status === PurchaseOrderSubCategory.PENDING && renderApprovalSteps(item)}
                </button>
                {isMaster && (
                  <button onClick={(e) => { e.stopPropagation(); handleDeleteItemFromList(item.id); }} className="absolute -top-2 -right-2 bg-red-600 text-white w-7 h-7 md:w-8 md:h-8 rounded-full shadow-lg hover:bg-red-700 flex items-center justify-center z-10" title="항목 삭제"><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12"/></svg></button>
                )}
              </div>
            )
          }))}
        </div>
      ) : (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden overflow-x-auto"><table className="w-full text-left min-w-[800px]"><thead><tr className="bg-slate-50 border-b border-slate-200"><th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">날짜</th><th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">{isPO2 ? '제목' : '기종'}</th><th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">수신처</th><th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">결재상태</th><th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">작업</th></tr></thead><tbody className="divide-y divide-slate-100">{paginated.length === 0 ? (<tr><td colSpan={5} className="px-6 py-12 text-center text-slate-400 italic">데이터가 없습니다.</td></tr>) : (paginated.map(item => (<tr key={item.id} className="hover:bg-slate-50 transition-colors group cursor-pointer" onClick={() => { if (sub === PurchaseOrderSubCategory.REJECTED || item.status.includes('임시저장')) handleEditItem(item); else setActiveItem(item); }}><td className="px-4 md:px-6 py-3 md:py-4 text-xs font-mono text-slate-500 whitespace-nowrap">{item.date}</td><td className="px-4 md:px-6 py-3 md:py-4 text-xs md:text-sm font-black text-black">{item.isResubmitted && <span className="text-red-600">[수정본] </span>}{item.title}</td><td className="px-4 md:px-6 py-3 md:py-4 text-center"><span className="text-xs font-bold text-slate-600">{item.recipient || "-"}</span></td><td className="px-4 md:px-6 py-3 md:py-4 text-center"><span className={`inline-block px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-tighter ${item.status === PurchaseOrderSubCategory.REJECTED ? 'bg-red-100 text-red-600' : item.status.includes('임시저장') ? 'bg-amber-100 text-amber-700' : item.status === PurchaseOrderSubCategory.APPROVED ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-500'}`}>{item.status}</span></td><td className="px-4 md:px-6 py-3 md:py-4 text-right"><div className="flex justify-end gap-3" onClick={e => e.stopPropagation()}><span className="text-[10px] font-bold text-amber-600 opacity-0 group-hover:opacity-100 transition-opacity">{(sub === PurchaseOrderSubCategory.REJECTED || item.status.includes('임시저장')) ? '편집하기 →' : '보기 →'}</span>{isMaster && (<button onClick={() => handleDeleteItemFromList(item.id)} className="text-red-400 hover:text-red-600 p-1"><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>)}</div></td></tr>)))}</tbody></table></div>
      )}
      {totalPages > 1 && (<div className="flex justify-center items-center gap-3 mt-12 no-print pb-10"><button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="w-10 h-10 flex items-center justify-center bg-white border border-slate-200 rounded-xl disabled:opacity-30 hover:bg-slate-50 transition-all shadow-sm"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7"/></svg></button><div className="flex gap-2">{Array.from({length: totalPages}, (_, i) => i + 1).map(num => (<button key={num} onClick={() => setCurrentPage(num)} className={`w-10 h-10 rounded-xl font-black text-sm transition-all ${currentPage === num ? 'bg-amber-600 text-white shadow-lg shadow-amber-200' : 'bg-white border border-slate-200 text-slate-400 hover:bg-slate-50'}`}>{num}</button>))}</div><button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="w-10 h-10 flex items-center justify-center bg-white border border-slate-200 rounded-xl disabled:opacity-30 hover:bg-slate-50 transition-all shadow-sm"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7"/></svg></button></div>)}
      
      {modal && (modal.type === 'DELETE_FILE' || modal.type === 'DELETE_STORAGE_FILE' || modal.type === 'ALERT') && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[9999] p-4 no-print text-center">
          <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-sm w-full border border-slate-200 animate-in fade-in zoom-in duration-200">
            <h3 className={`text-xl font-black mb-4 ${modal.type.includes('DELETE') ? 'text-red-600' : 'text-black'}`}>{modal.type === 'ALERT' ? '알림' : '확인'}</h3>
            <p className="text-slate-600 mb-8 font-medium leading-relaxed text-sm md:text-base text-center">{modal.message}</p>
            <div className="flex gap-3">
              {modal.type === 'ALERT' ? <button onClick={modal.onConfirm} className="flex-1 py-3 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition-all">확인</button> : <><button onClick={() => setModal(null)} className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-all">취소</button><button onClick={modal.onConfirm} className={`flex-1 py-3 text-white rounded-xl font-bold transition-all shadow-lg ${modal.type.includes('DELETE') ? 'bg-red-600 hover:bg-red-700 shadow-red-100' : 'bg-blue-600 hover:bg-blue-700 shadow-blue-100'}`}>확인</button></>}
            </div>
          </div>
        </div>
      )}

      {isRejectModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl animate-in fade-in zoom-in duration-300">
            <h3 className="text-2xl font-black text-black mb-4">반송 사유 입력</h3>
            <p className="text-slate-500 text-sm mb-6 font-medium">결재권자에게 전달할 반송 사유를 상세히 입력해 주세요.</p>
            <textarea 
              value={rejectReasonText} 
              onChange={(e) => setRejectReasonText(e.target.value)} 
              placeholder="여기에 사유를 입력하십시오..." 
              className="w-full h-40 p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-red-500 font-bold mb-8"
            />
            <div className="flex gap-4">
              <button onClick={() => { setIsRejectModalOpen(false); setItemToReject(null); }} className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-xl font-black transition-all">취소</button>
              <button onClick={confirmReject} className="flex-1 py-4 bg-red-600 text-white rounded-xl font-black transition-all shadow-lg hover:bg-red-700">반송 처리</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PurchaseOrderView;