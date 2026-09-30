
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { FileText, Search, X, Loader2, Save, Printer, ArrowLeft, Plus, Trash2, Image as ImageIcon, Clock, Check, Edit3 } from 'lucide-react';
import { ShippingReportSubCategory, ShippingReportItem, ShippingReportRow, ViewState, UserAccount, ShippingReportRevision } from '../types';
import { saveSingleDoc, pushStateToCloud, deleteSingleDoc, uploadImageToStorage } from '../supabase';
import { printHtmlContent } from '../utils/printHelper';

const normalizeSub = (s: string): string => {
  if (s === '출하보고서작성' || s === 'shipment_create') return 'shipment_create';
  if (s === '출하보고서 임시' || s === 'shipment_draft') return 'shipment_draft';
  if (s === '출하보고서 완료' || s === 'shipment_complete') return 'shipment_complete';
  return s;
};

const generateUUID = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'sr-row-' + Date.now() + '-' + Math.random().toString(36).substring(2, 11);
};

const GLOBAL_SUB_LABELS: Record<string, string> = {
  'shipment_create': 'Create Shipment',
  'shipment_draft': 'Draft Shipments',
  'shipment_complete': 'Completed Shipments',
  '출하보고서작성': 'Create Shipment',
  '출하보고서 임시': 'Draft Shipments',
  '출하보고서 완료': 'Completed Shipments'
};

// Deterministic pastel color palette for initials
export const getInitialsColor = (initials?: string) => {
  if (!initials) return {
    bg: 'bg-slate-100',
    border: 'border-slate-300',
    text: 'text-slate-700',
    badgeBg: 'bg-slate-200',
    cellBg: '#f8fafc',
    dot: 'bg-slate-400'
  };

  const colors = [
    { bg: 'bg-sky-50', border: 'border-sky-300', text: 'text-sky-900', badgeBg: 'bg-sky-200', cellBg: '#e0f2fe', dot: 'bg-sky-500' },
    { bg: 'bg-amber-50', border: 'border-amber-300', text: 'text-amber-900', badgeBg: 'bg-amber-200', cellBg: '#fef3c7', dot: 'bg-amber-500' },
    { bg: 'bg-emerald-50', border: 'border-emerald-300', text: 'text-emerald-900', badgeBg: 'bg-emerald-200', cellBg: '#d1fae5', dot: 'bg-emerald-500' },
    { bg: 'bg-purple-50', border: 'border-purple-300', text: 'text-purple-900', badgeBg: 'bg-purple-200', cellBg: '#f3e8ff', dot: 'bg-purple-500' },
    { bg: 'bg-rose-50', border: 'border-rose-300', text: 'text-rose-900', badgeBg: 'bg-rose-200', cellBg: '#ffe4e6', dot: 'bg-rose-500' },
    { bg: 'bg-indigo-50', border: 'border-indigo-300', text: 'text-indigo-900', badgeBg: 'bg-indigo-200', cellBg: '#e0e7ff', dot: 'bg-indigo-500' },
    { bg: 'bg-teal-50', border: 'border-teal-300', text: 'text-teal-900', badgeBg: 'bg-teal-200', cellBg: '#ccfbf1', dot: 'bg-teal-500' },
    { bg: 'bg-orange-50', border: 'border-orange-300', text: 'text-orange-900', badgeBg: 'bg-orange-200', cellBg: '#ffedd5', dot: 'bg-orange-500' },
  ];

  let hash = 0;
  for (let i = 0; i < initials.length; i++) {
    hash = initials.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % colors.length;
  return colors[index];
};

interface ShippingReportViewProps {
  sub: ShippingReportSubCategory;
  currentUser: UserAccount;
  setView: (v: ViewState) => void;
  dataVersion: number;
}

const ShippingReportView: React.FC<ShippingReportViewProps> = ({ sub, currentUser, setView, dataVersion }) => {
  const [items, setItems] = useState<ShippingReportItem[]>([]);
  const [activeItem, setActiveItem] = useState<ShippingReportItem | null>(null);
  const [originalSnapshot, setOriginalSnapshot] = useState<ShippingReportItem | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Form State
  const [formData, setFormData] = useState<ShippingReportItem>({
    id: `sr-${Date.now()}`,
    status: ShippingReportSubCategory.TEMPORARY,
    authorId: currentUser.initials,
    createdAt: new Date().toISOString(),
    dataDate: new Date().toLocaleDateString('en-GB'), // 15/04 format
    model: '',
    rows: []
  });

  const [history, setHistory] = useState<ShippingReportItem[]>([]);
  const [focusedCell, setFocusedCell] = useState<{rowId: string, field: string} | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('ajin_shipping_reports');
      if (saved) {
        const allItems: ShippingReportItem[] = JSON.parse(saved) || [];
        setItems(allItems.filter(i => normalizeSub(i.status || '') === normalizeSub(sub)));
      }
    } catch (e) {
      console.error('Error loading shipping reports', e);
    }
  }, [sub, dataVersion]);

  const handleCreateNew = () => {
    const newItem: ShippingReportItem = {
      id: `sr-${Date.now()}`,
      status: ShippingReportSubCategory.TEMPORARY,
      authorId: currentUser.initials,
      createdAt: new Date().toISOString(),
      dataDate: new Date().toLocaleDateString('en-GB'),
      model: '',
      rows: Array.from({ length: 10 }, (_, i) => ({
        id: generateUUID(),
        no: String(i + 1),
        hsCode: '',
        itemNo: '',
        itemName: '',
        qty: '',
        image: '',
        size: '',
        remarks: '',
        boxInfo: '',
        boxQty: '',
        memo: ''
      }))
    };
    setFormData(newItem);
    setActiveItem(newItem);
    setOriginalSnapshot(JSON.parse(JSON.stringify(newItem)));
    setHistory([]);
  };

  const handleEdit = (item: ShippingReportItem) => {
    const sanitizedItem: ShippingReportItem = JSON.parse(JSON.stringify(item));
    if (!sanitizedItem.rows) {
      sanitizedItem.rows = [];
    }
    setFormData(sanitizedItem);
    setActiveItem(item);
    setOriginalSnapshot(JSON.parse(JSON.stringify(sanitizedItem)));
    setHistory([]);
  };

  useEffect(() => {
    if (activeItem) {
      // Small timeout to ensure DOM is ready for resizing
      setTimeout(() => {
        const textareas = document.querySelectorAll('textarea');
        textareas.forEach(ta => {
          ta.style.height = 'auto';
          ta.style.height = ta.scrollHeight + 'px';
        });
      }, 100);
    }
  }, [activeItem]);

  const formatNumberWithCommas = (value: string) => {
    const raw = value.replace(/,/g, '');
    if (raw === '' || isNaN(Number(raw))) return raw;
    return Number(raw).toLocaleString();
  };

  const handleRowChange = (rowId: string, field: keyof ShippingReportRow, value: string) => {
    let finalValue = value;
    if (field === 'qty') {
      finalValue = formatNumberWithCommas(value);
    }

    setHistory([...history, JSON.parse(JSON.stringify(formData))]);
    setFormData(prev => {
      const updatedRows = prev.rows.map(row => {
        if (row.id === rowId) {
          const updatedRow = { ...row, [field]: finalValue };
          
          // Requirement 5: Auto-populate from COMPLETED documents if itemNo is entered
          if (field === 'itemNo' && finalValue.trim().length >= 3) {
            const val = finalValue.trim();
            // Search in Shipping Reports (COMPLETED)
            const shippingReports = JSON.parse(localStorage.getItem('ajin_shipping_reports') || '[]');
            const completedReports = shippingReports.filter((r: any) => normalizeSub(r.status || '') === normalizeSub(ShippingReportSubCategory.COMPLETED));
            
            let found = false;
            for (const doc of completedReports) {
                const match = doc.rows?.find((r: any) => r.itemNo === val);
                if (match) {
                    updatedRow.itemName = match.itemName || updatedRow.itemName;
                    updatedRow.hsCode = match.hsCode || updatedRow.hsCode;
                    updatedRow.qty = match.qty || updatedRow.qty;
                    updatedRow.size = match.size || updatedRow.size;
                    updatedRow.remarks = match.remarks || updatedRow.remarks;
                    updatedRow.boxInfo = match.boxInfo || updatedRow.boxInfo;
                    updatedRow.boxQty = match.boxQty || updatedRow.boxQty;
                    updatedRow.image = match.image || updatedRow.image;
                    found = true;
                    break;
                }
            }

            if (!found) {
                // Search in Injection Orders as fallback
                const masterData = JSON.parse(localStorage.getItem('ajin_injection_orders') || '[]');
                for (const doc of masterData) {
                    const match = (doc.rows || []).find((r: any) => r.itemNo === val);
                    if (match) {
                        updatedRow.itemName = match.itemName || updatedRow.itemName;
                        updatedRow.hsCode = match.hsCode || updatedRow.hsCode;
                        break;
                    }
                }
            }
          }
          return updatedRow;
        }
        return row;
      });
      return { ...prev, rows: updatedRows };
    });
  };

  const handlePaste = (e: React.ClipboardEvent, startRowId: string, startField: keyof ShippingReportRow) => {
    const text = e.clipboardData.getData('text');
    if (!text || (!text.includes('\t') && !text.includes('\n'))) return; // Let default handler handle single cell paste if no separators
    
    e.preventDefault();
    const rows = text.split(/\r?\n/).filter(r => r.trim() !== '');
    const data = rows.map(r => r.split('\t'));

    const fields: (keyof ShippingReportRow)[] = ['hsCode', 'itemNo', 'itemName', 'qty', 'size', 'remarks', 'boxInfo', 'boxQty'];
    const startFieldIdx = fields.indexOf(startField);
    const startRowIdx = formData.rows.findIndex(r => r.id === startRowId);

    if (startRowIdx === -1 || startFieldIdx === -1) return;

    setHistory([...history, JSON.parse(JSON.stringify(formData))]);

    setFormData(prev => {
        const newRows = [...prev.rows];
        const shippingReports = JSON.parse(localStorage.getItem('ajin_shipping_reports') || '[]');
        const completedReports = shippingReports.filter((r: any) => normalizeSub(r.status || '') === normalizeSub(ShippingReportSubCategory.COMPLETED));
        const masterData = JSON.parse(localStorage.getItem('ajin_injection_orders') || '[]');

        data.forEach((rowData, rOffset) => {
            const targetRowIdx = startRowIdx + rOffset;
            
            if (!newRows[targetRowIdx]) {
                newRows.push({
                    id: generateUUID(),
                    no: String(newRows.length + 1),
                    hsCode: '',
                    itemNo: '',
                    itemName: '',
                    qty: '',
                    image: '',
                    size: '',
                    remarks: '',
                    boxInfo: '',
                    boxQty: '',
                    memo: ''
                });
            }

            rowData.forEach((cellData, cOffset) => {
                const targetFieldIdx = startFieldIdx + cOffset;
                if (targetFieldIdx < fields.length) {
                    const field = fields[targetFieldIdx];
                    newRows[targetRowIdx][field] = cellData.trim();
                }
            });

            // Perform itemNo lookup for the pasted row if itemNo was pasted or present
            const targetItemNo = newRows[targetRowIdx].itemNo;
            if (targetItemNo && targetItemNo.length >= 3) {
                let foundMatch = false;
                for (const doc of completedReports) {
                    const match = doc.rows?.find((r: any) => r.itemNo === targetItemNo);
                    if (match) {
                        newRows[targetRowIdx].itemName = match.itemName || newRows[targetRowIdx].itemName;
                        newRows[targetRowIdx].hsCode = match.hsCode || newRows[targetRowIdx].hsCode;
                        newRows[targetRowIdx].qty = match.qty || newRows[targetRowIdx].qty;
                        newRows[targetRowIdx].size = match.size || newRows[targetRowIdx].size;
                        newRows[targetRowIdx].remarks = match.remarks || newRows[targetRowIdx].remarks;
                        newRows[targetRowIdx].boxInfo = match.boxInfo || newRows[targetRowIdx].boxInfo;
                        newRows[targetRowIdx].boxQty = match.boxQty || newRows[targetRowIdx].boxQty;
                        newRows[targetRowIdx].image = match.image || newRows[targetRowIdx].image;
                        foundMatch = true;
                        break;
                    }
                }
                if (!foundMatch) {
                    for (const doc of masterData) {
                        const match = (doc.rows || []).find((r: any) => r.itemNo === targetItemNo);
                        if (match) {
                            newRows[targetRowIdx].itemName = match.itemName || newRows[targetRowIdx].itemName;
                            newRows[targetRowIdx].hsCode = match.hsCode || newRows[targetRowIdx].hsCode;
                            break;
                        }
                    }
                }
            }
        });

        const finalRows = newRows.map((r, i) => ({ ...r, no: String(i + 1) }));
        return { ...prev, rows: finalRows };
    });
  };

  const addRowBelow = (idx: number) => {
    setHistory([...history, JSON.parse(JSON.stringify(formData))]);
    setFormData(prev => {
        const newRows = [...prev.rows];
        newRows.splice(idx + 1, 0, {
            id: generateUUID(),
            no: '',
            hsCode: '',
            itemNo: '',
            itemName: '',
            qty: '',
            image: '',
            size: '',
            remarks: '',
            boxInfo: '',
            boxQty: '',
            memo: ''
        });
        return { ...prev, rows: newRows.map((r, i) => ({ ...r, no: String(i + 1) })) };
    });
  };

  const deleteRow = (idx: number) => {
    if (formData.rows.length <= 1) return;
    setHistory([...history, JSON.parse(JSON.stringify(formData))]);
    setFormData(prev => {
        const newRows = prev.rows.filter((_, i) => i !== idx);
        return { ...prev, rows: newRows.map((r, i) => ({ ...r, no: String(i + 1) })) };
    });
  };

  const compressImage = (base64Str: string, maxWidth = 800, maxHeight = 800): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = base64Str;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height *= maxWidth / width;
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width *= maxHeight / height;
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.7)); 
      };
      img.onerror = () => resolve(base64Str);
    });
  };

  const handleImagePaste = (rowId: string, e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
            const blob = items[i].getAsFile();
            if (blob) {
                const reader = new FileReader();
                reader.onload = async (event) => {
                    const base64 = event.target?.result as string;
                    const compressed = await compressImage(base64);
                    handleRowChange(rowId, 'image', compressed);
                };
                reader.readAsDataURL(blob);
            }
        }
    }
  };

  // Regular Save (New / Draft / Complete Initial)
  const handleSave = async (status: ShippingReportSubCategory) => {
    if (!formData.model) {
      alert('Model명을 입력해주세요.');
      return;
    }

    // 저장 시점에 등록된 실사용 이미지들만 Supabase Storage로 업로드
    const processedRows = [...(formData.rows || [])];
    for (let i = 0; i < processedRows.length; i++) {
      const row = processedRows[i];
      if (row.image && row.image.startsWith('data:image/')) {
        try {
          const publicUrl = await uploadImageToStorage('shipment', row.image);
          if (publicUrl) {
            processedRows[i] = { ...row, image: publicUrl };
          }
        } catch (e) {
          console.error('[Upload image error in Saving ShippingReport]', e);
        }
      }
    }

    const itemToSave: ShippingReportItem = {
      ...formData,
      rows: processedRows,
      status: status,
      createdAt: formData.createdAt || new Date().toISOString()
    };

    try {
      const allItems = JSON.parse(localStorage.getItem('ajin_shipping_reports') || '[]');
      const filtered = allItems.filter((i: any) => i.id !== itemToSave.id);
      const newList = [itemToSave, ...filtered];
      localStorage.setItem('ajin_shipping_reports', JSON.stringify(newList));
      setItems(newList.filter(i => normalizeSub(i.status || '') === normalizeSub(sub)));
      
      // Save to Supabase (Requirement 6)
      await saveSingleDoc('na_invoice_image', itemToSave);
      
      alert(status === ShippingReportSubCategory.COMPLETED ? '작성완료 되었습니다.' : '임시저장 되었습니다.');
      setActiveItem(null);
      setView({ type: 'SHIPPING_REPORT', sub: status });
      pushStateToCloud();
    } catch (e) {
      console.error(e);
      alert('저장 중 오류가 발생했습니다.');
    }
  };

  // Update Completed Document (Tracking cells, modifiers, and revision sequence)
  const handleUpdateCompletedSave = async () => {
    if (!formData.model) {
      alert('Model명을 입력해주세요.');
      return;
    }

    const nowFormatted = new Date().toLocaleString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });

    const baseData = originalSnapshot || activeItem;
    let modifiedCellCount = 0;

    const fieldsToCheck: (keyof ShippingReportRow)[] = ['hsCode', 'itemNo', 'itemName', 'qty', 'image', 'size', 'remarks', 'boxInfo', 'boxQty', 'memo'];

    // Process rows and track cell changes
    const processedRows = formData.rows.map((currentRow, rIdx) => {
      const origRow = baseData?.rows?.[rIdx];
      const newModifications = { ...(currentRow.modifications || {}) };

      fieldsToCheck.forEach(field => {
        const currentVal = String(currentRow[field] || '').trim();
        const origVal = origRow ? String(origRow[field] || '').trim() : '';

        if (origRow && currentVal !== origVal) {
          newModifications[field] = {
            initials: currentUser.initials,
            date: nowFormatted,
            prevValue: origVal
          };
          modifiedCellCount++;
        }
      });

      return {
        ...currentRow,
        modifications: Object.keys(newModifications).length > 0 ? newModifications : undefined
      };
    });

    // Model and Date changes
    if (baseData && (formData.model !== baseData.model || formData.dataDate !== baseData.dataDate)) {
      modifiedCellCount++;
    }

    // Upload any newly added base64 images
    for (let i = 0; i < processedRows.length; i++) {
      const row = processedRows[i];
      if (row.image && row.image.startsWith('data:image/')) {
        try {
          const publicUrl = await uploadImageToStorage('shipment', row.image);
          if (publicUrl) {
            processedRows[i] = { ...row, image: publicUrl };
          }
        } catch (e) {
          console.error('[Upload image error in Saving ShippingReport]', e);
        }
      }
    }

    const updatedRevisionHistory: ShippingReportRevision[] = [...(formData.revisionHistory || [])];
    if (modifiedCellCount > 0 || updatedRevisionHistory.length === 0) {
      updatedRevisionHistory.push({
        initials: currentUser.initials,
        date: nowFormatted,
        changeCount: modifiedCellCount > 0 ? modifiedCellCount : undefined,
        action: '수정'
      });
    }

    const itemToSave: ShippingReportItem = {
      ...formData,
      rows: processedRows,
      status: ShippingReportSubCategory.COMPLETED,
      lastModifiedBy: currentUser.initials,
      lastModifiedAt: new Date().toISOString(),
      revisionHistory: updatedRevisionHistory
    };

    try {
      const allItems = JSON.parse(localStorage.getItem('ajin_shipping_reports') || '[]');
      const filtered = allItems.filter((i: any) => i.id !== itemToSave.id);
      const newList = [itemToSave, ...filtered];
      localStorage.setItem('ajin_shipping_reports', JSON.stringify(newList));
      setItems(newList.filter(i => normalizeSub(i.status || '') === normalizeSub(sub)));

      await saveSingleDoc('na_invoice_image', itemToSave);

      setFormData(itemToSave);
      setActiveItem(itemToSave);
      setOriginalSnapshot(JSON.parse(JSON.stringify(itemToSave)));
      pushStateToCloud();
      alert('수정사항이 성공적으로 저장되었습니다.');
    } catch (e) {
      console.error(e);
      alert('저장 중 오류가 발생했습니다.');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const allItems = JSON.parse(localStorage.getItem('ajin_shipping_reports') || '[]');
      const itemToDelete = allItems.find((i: any) => i.id === id);
      
      if (itemToDelete && normalizeSub(itemToDelete.status || '') === normalizeSub(ShippingReportSubCategory.COMPLETED)) {
        if (currentUser.initials.toUpperCase() !== 'MASTER') {
          alert('완료된 문서는 마스터만 삭제할 수 있습니다.');
          return;
        }
      }

      if (itemToDelete && normalizeSub(itemToDelete.status || '') === normalizeSub(ShippingReportSubCategory.TEMPORARY)) {
        const isAuthor = (itemToDelete.authorId || '').toUpperCase() === (currentUser.initials || '').toUpperCase() ||
          (itemToDelete.authorId || '').toUpperCase() === (currentUser.id || '').toUpperCase() ||
          (itemToDelete.authorId || '').toUpperCase() === (currentUser.loginId || '').toUpperCase();
        if (currentUser.initials.toUpperCase() !== 'MASTER' && currentUser.loginId !== 'AJ5200' && !isAuthor) {
          alert('임시저장 된 문서는 작성자만 삭제할 수 있습니다.');
          return;
        }
      }

      if (!confirm('정말 삭제하시겠습니까?')) return;
      
      const updated = allItems.filter((i: any) => i.id !== id);
      localStorage.setItem('ajin_shipping_reports', JSON.stringify(updated));
      await deleteSingleDoc('na_invoice_image', id, itemToDelete);
      setItems(updated.filter(i => normalizeSub(i.status || '') === normalizeSub(sub)));
      pushStateToCloud();
    } catch (e) {
      console.error(e);
    }
  };

  const handleUndo = () => {
    if (history.length > 0) {
      const last = history[history.length - 1];
      setFormData(last);
      setHistory(history.slice(0, -1));
    }
  };

  const autoResize = (e: React.ChangeEvent<HTMLTextAreaElement> | React.FocusEvent<HTMLTextAreaElement> | null, target?: HTMLTextAreaElement) => {
    const el = target || (e?.target as HTMLTextAreaElement);
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  };

  const handleKeyDown = (e: React.KeyboardEvent, rowId: string, rowIdx: number, field: keyof ShippingReportRow) => {
    const fields: (keyof ShippingReportRow)[] = ['hsCode', 'itemNo', 'itemName', 'qty', 'size', 'remarks', 'boxInfo', 'boxQty', 'memo'];
    const fieldIdx = fields.indexOf(field);

    const targetEl = e.currentTarget as HTMLTextAreaElement | HTMLInputElement;
    const hasText = targetEl && targetEl.value && targetEl.value.length > 0;

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      let nextFieldIdx = fieldIdx + 1;
      let nextRowIdx = rowIdx;
      if (nextFieldIdx >= fields.length) {
        nextFieldIdx = 0;
        nextRowIdx++;
      }
      if (nextRowIdx < formData.rows.length) {
        const nextField = fields[nextFieldIdx];
        const nextRow = formData.rows[nextRowIdx];
        const nextId = `input-${nextRow.id}-${nextField}`;
        const el = document.getElementById(nextId);
        if (el) el.focus();
      }
      return;
    }

    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      if (hasText && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        return;
      }
      
      let nextRowIdx = rowIdx;
      let nextFieldIdx = fieldIdx;

      if (e.key === 'ArrowRight') nextFieldIdx++;
      if (e.key === 'ArrowLeft') nextFieldIdx--;
      if (e.key === 'ArrowUp') nextRowIdx--;
      if (e.key === 'ArrowDown') nextRowIdx++;

      if (nextFieldIdx >= 0 && nextFieldIdx < fields.length && nextRowIdx >= 0 && nextRowIdx < formData.rows.length) {
        e.preventDefault();
        const nextField = fields[nextFieldIdx];
        const nextRow = formData.rows[nextRowIdx];
        const nextId = `input-${nextRow.id}-${nextField}`;
        const el = document.getElementById(nextId);
        if (el) el.focus();
      }
    }
  };

  const handlePrint = () => {
    // Filter rows to only show those with at least one field filled
    const printableRows = formData.rows.filter(r => 
      r.hsCode || r.itemNo || r.itemName || r.qty || r.size || r.remarks || r.boxInfo || r.boxQty || r.image
    );

    const totalQty = printableRows.reduce((acc, r) => acc + (parseFloat(r.qty.replace(/,/g, '')) || 0), 0);

    const modelName = formData.model || 'Report';
    const docDate = formData.dataDate || '';
    const filename = `${modelName}${docDate ? `_${docDate}` : ''}`.replace(/[/\\?%*:|"<>]/g, '-');

    const lastRevision = formData.revisionHistory && formData.revisionHistory.length > 0 
      ? formData.revisionHistory[formData.revisionHistory.length - 1] 
      : null;

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>${filename}</title>
          <script src="https://cdn.tailwindcss.com"></script>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Nanum+Gothic&display=swap');
            @page { size: A4 landscape; margin: 10mm; }
            body { 
              font-family: 'Gulim', '굴림', 'Nanum Gothic', sans-serif;
            }
            table { border-collapse: collapse; width: 100%; border: 2px solid black; table-layout: fixed; }
            th, td { border: 1px solid black; padding: 4px; text-align: center; word-break: break-all; }
            th { font-size: 11px; background-color: #fde6d2 !important; -webkit-print-color-adjust: exact; }
            td { font-size: 12px; }
            .bg-yellow-200 { background-color: #fef08a !important; -webkit-print-color-adjust: exact; }
            img { max-width: 150px; max-height: 100px; object-fit: contain; display: block; margin: 0 auto; }
            .no-print { display: none !important; }
            .text-left { text-align: left !important; }
            .box-info-cell { 
              position: relative; 
              text-align: left !important; 
              padding-left: 12px !important; 
            }
            .font-black { font-weight: 900; }
            .font-bold { font-weight: 700; }
          </style>
        </head>
        <body>
          <div class="p-4">
            <h1 class="text-3xl font-black mb-4">출하 보고서 / Báo cáo xuất hàng</h1>
            <div class="flex justify-between items-center mb-4 text-sm font-bold">
              <div class="flex gap-8">
                <div>Data : ${formData.dataDate}</div>
                <div>Model : ${formData.model}</div>
              </div>
              <div class="text-xs text-gray-600">
                <span>최초작성: ${formData.authorId} (${new Date(formData.createdAt).toLocaleDateString('ko-KR')})</span>
                ${lastRevision ? `<span class="ml-3">| 최종수정: ${lastRevision.initials} (${lastRevision.date})</span>` : ''}
              </div>
            </div>
            <table>
              <thead>
                <tr>
                  <th style="width: 30px">No</th>
                  <th style="width: 100px">HS Code</th>
                  <th style="width: 100px">Item No.</th>
                  <th style="width: 200px">Item</th>
                  <th style="width: 100px">수량/Số Lượng</th>
                  <th style="width: 200px">이미지/Hình Ảnh</th>
                  <th style="width: 100px">크기/Kích thước</th>
                  <th style="width: 250px">참고사항/Ghi chú</th>
                  <th style="width: 250px">상자크기, 무게/kích thước thùng, cân nặng</th>
                  <th style="width: 80px">상자 수/Số thùng</th>
                </tr>
              </thead>
              <tbody>
                ${printableRows.map((row, idx) => `
                  <tr>
                    <td>${idx + 1}</td>
                    <td>${row.hsCode}</td>
                    <td>${row.itemNo}</td>
                    <td class="font-bold">${row.itemName}</td>
                    <td class="font-black">${row.qty}</td>
                    <td>${row.image ? `<img src="${row.image}" />` : ''}</td>
                    <td>${row.size}</td>
                    <td class="text-left" style="white-space: pre-wrap;">${row.remarks}</td>
                    <td class="box-info-cell" style="white-space: pre-wrap;">${row.boxInfo}</td>
                    <td>${row.boxQty}</td>
                  </tr>
                `).join('')}
                <tr class="bg-yellow-200">
                  <td colspan="4" class="font-bold">Total</td>
                  <td class="font-black text-blue-700">${totalQty.toLocaleString()}</td>
                  <td colspan="5"></td>
                </tr>
              </tbody>
            </table>
          </div>
        </body>
      </html>
    `;
    printHtmlContent(html, filename);
  };

  const isCompleted = normalizeSub(formData.status || '') === normalizeSub(ShippingReportSubCategory.COMPLETED);

  const filteredItems = useMemo(() => {
    return items
      .filter(i => 
        i.model.toLowerCase().includes(searchTerm.toLowerCase()) || 
        i.authorId.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (i.lastModifiedBy && i.lastModifiedBy.toLowerCase().includes(searchTerm.toLowerCase()))
      )
      .sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return dateB - dateA;
      });
  }, [items, searchTerm]);

  // Helper renderer for table cell with modifier color & tooltip
  const renderCell = (
    row: ShippingReportRow,
    rowIdx: number,
    field: keyof ShippingReportRow,
    options: {
      textClass?: string;
      isBold?: boolean;
      isBlack?: boolean;
      placeholder?: string;
      align?: 'center' | 'left' | 'right';
      isMemo?: boolean;
    } = {}
  ) => {
    const mod = row.modifications?.[field];
    const modColor = mod ? getInitialsColor(mod.initials) : null;
    const isFocused = focusedCell?.rowId === row.id && focusedCell?.field === field;

    return (
      <td
        className={`border-r border-black relative group/cell transition-colors ${options.isMemo ? 'no-print' : ''} ${isFocused ? 'ring-2 ring-blue-500 z-20' : ''}`}
        style={{
          backgroundColor: isFocused ? '#e0f2fe' : (modColor ? modColor.cellBg : undefined)
        }}
      >
        {/* Modifier initials badge in cell corner */}
        {mod && (
          <span
            className={`absolute top-0.5 right-0.5 text-[8px] font-black px-1 py-0.2 rounded border shadow-xs pointer-events-none no-print z-10 ${modColor?.badgeBg} ${modColor?.text} ${modColor?.border}`}
            title={`수정: [${mod.initials}]`}
          >
            {mod.initials}
          </span>
        )}

        {/* Hover Tooltip showing modifier details */}
        {mod && (
          <div className="absolute left-1/2 bottom-full -translate-x-1/2 mb-1.5 hidden group-hover/cell:flex flex-col gap-0.5 bg-slate-900 text-white text-[10px] py-1.5 px-2.5 rounded-lg shadow-2xl z-40 pointer-events-none whitespace-nowrap text-left border border-slate-700 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between gap-3 border-b border-slate-700 pb-1 font-black">
              <span className="text-amber-300 flex items-center gap-1">
                <span className={`w-2 h-2 rounded-full ${modColor?.dot}`}></span>
                수정: [{mod.initials}]
              </span>
              <span className="text-[9px] text-slate-400">{mod.date}</span>
            </div>
            {mod.prevValue !== undefined && mod.prevValue !== '' ? (
              <div className="text-[9px] text-slate-300 mt-0.5">
                이전값: <span className="text-rose-300 line-through max-w-[140px] inline-block truncate align-bottom">{mod.prevValue}</span>
              </div>
            ) : (
              <div className="text-[9px] text-emerald-300 mt-0.5">신규 입력/수정</div>
            )}
            <div className="w-2 h-2 bg-slate-900 border-r border-b border-slate-700 rotate-45 absolute left-1/2 -bottom-1 -translate-x-1/2"></div>
          </div>
        )}

        <textarea
          id={`input-${row.id}-${field}`}
          className={`w-full h-full p-1 resize-none focus:outline-none overflow-hidden bg-transparent ${options.textClass || ''} ${options.align === 'left' ? 'text-left' : 'text-center'} ${options.isBold ? 'font-bold' : ''} ${options.isBlack ? 'font-black' : ''}`}
          rows={1}
          value={(row[field] as string) || ''}
          placeholder={options.placeholder}
          onFocus={(e) => {
            setFocusedCell({ rowId: row.id, field });
            autoResize(null, e.target);
          }}
          onBlur={() => setFocusedCell(null)}
          onInput={(e) => autoResize(null, e.target as HTMLTextAreaElement)}
          onKeyDown={(e) => handleKeyDown(e, row.id, rowIdx, field)}
          onPaste={(e) => handlePaste(e, row.id, field)}
          onChange={(e) => handleRowChange(row.id, field, e.target.value)}
        />
      </td>
    );
  };

  if (activeItem) {
    return (
      <div className="bg-white min-h-screen p-4 md:p-8 space-y-6">
        <div className="flex flex-wrap justify-between items-center gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-200 no-print">
          <div className="flex items-center gap-4">
            <button onClick={() => setActiveItem(null)} className="p-2 hover:bg-white rounded-full transition-colors">
              <ArrowLeft className="w-6 h-6" />
            </button>
            <div>
              <h2 className="text-xl font-black text-slate-800 flex items-center gap-2">
                {isCompleted ? '출하보고서 조회 / 수정' : '출하보고서 작성'}
                {isCompleted && (
                  <span className="text-xs bg-emerald-100 text-emerald-800 border border-emerald-300 px-2 py-0.5 rounded-full font-bold">
                    완료 문서
                  </span>
                )}
              </h2>
            </div>
          </div>
          <div className="flex gap-2 items-center">
            <button 
              onClick={handleUndo} 
              disabled={history.length === 0} 
              className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl font-bold text-sm hover:bg-slate-100 disabled:opacity-50 transition-all"
            >
              되돌리기
            </button>

            {!isCompleted ? (
              <>
                <button onClick={() => handleSave(ShippingReportSubCategory.TEMPORARY)} className="px-4 py-2 bg-amber-500 text-white rounded-xl font-bold text-sm hover:bg-amber-600 shadow-lg shadow-amber-500/20 transition-all">
                  임시저장
                </button>
                <button onClick={() => handleSave(ShippingReportSubCategory.COMPLETED)} className="px-4 py-2 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 shadow-lg shadow-blue-500/20 transition-all">
                  작성완료
                </button>
              </>
            ) : (
              <button 
                onClick={handleUpdateCompletedSave} 
                className="px-5 py-2 bg-emerald-600 text-white rounded-xl font-bold text-sm hover:bg-emerald-700 shadow-lg shadow-emerald-600/20 flex items-center gap-2 transition-all active:scale-95"
                title="수정한 셀들을 이니셜 및 수정일시와 함께 저장합니다"
              >
                <Save className="w-4 h-4" /> 수정저장
              </button>
            )}

            <button onClick={handlePrint} className="px-4 py-2 bg-slate-900 text-white rounded-xl font-bold text-sm hover:bg-black flex items-center gap-2 transition-all shadow-lg shadow-slate-900/10">
              <Printer className="w-4 h-4" /> PDF/인쇄
            </button>
          </div>
        </div>

        {/* Document Header & Modifier Sequence Bar */}
        <div id="shipping-report-print" className="bg-white border-2 border-black p-8 mx-auto overflow-x-auto min-w-[1000px]">
          
          {/* Modifier Sequence History Bar */}
          <div className="mb-4 bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-wrap items-center gap-2 no-print">
            <div className="text-xs font-black text-slate-500 flex items-center gap-1.5 mr-1">
              <Clock className="w-4 h-4 text-slate-400" />
              <span>작성/수정 이력:</span>
            </div>
            
            {/* Initial Author Chip */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-200/80 border border-slate-300 text-slate-700 text-xs font-bold">
              <span className="text-[10px] bg-white text-slate-600 px-1.5 py-0.5 rounded font-black">최초작성</span>
              <span>{formData.authorId}</span>
              <span className="text-[10px] text-slate-500 font-normal">({new Date(formData.createdAt).toLocaleDateString('ko-KR')})</span>
            </div>

            {/* Revision History Sequence (Last item is the final modifier) */}
            {formData.revisionHistory && formData.revisionHistory.map((rev, idx) => {
              const isFinal = idx === (formData.revisionHistory?.length || 0) - 1;
              const color = getInitialsColor(rev.initials);
              return (
                <React.Fragment key={idx}>
                  <span className="text-slate-400 font-bold text-xs">➔</span>
                  <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border ${color.bg} ${color.border} ${color.text} text-xs font-bold shadow-xs ${isFinal ? 'ring-2 ring-emerald-500/50' : ''}`}>
                    <span className={`text-[10px] ${color.badgeBg} ${color.text} px-1.5 py-0.5 rounded font-black`}>
                      {isFinal ? '최종수정' : `${idx + 1}차수정`}
                    </span>
                    <span>{rev.initials}</span>
                    <span className="text-[10px] opacity-75 font-normal">({rev.date})</span>
                    {rev.changeCount && rev.changeCount > 0 && (
                      <span className="text-[9px] bg-white/80 px-1.5 py-0.2 rounded-full font-black ml-0.5 text-slate-600 border border-slate-200">
                        {rev.changeCount}개 수정
                      </span>
                    )}
                  </div>
                </React.Fragment>
              );
            })}
          </div>

          <div className="mb-6">
            <h1 className="text-3xl font-black mb-2">출하 보고서 / Báo cáo xuất hàng</h1>
            <div className="flex gap-8 text-sm font-bold">
              <div className="flex items-center gap-2">
                <span>Data :</span>
                <input 
                  className="border-b border-slate-300 focus:outline-none w-24"
                  value={formData.dataDate}
                  onChange={(e) => setFormData({...formData, dataDate: e.target.value})}
                />
              </div>
              <div className="flex items-center gap-2 flex-1">
                <span className="shrink-0">Model :</span>
                <textarea 
                  className="border-b border-slate-300 focus:outline-none flex-1 font-black text-blue-600 resize-none overflow-hidden bg-transparent"
                  rows={1}
                  value={formData.model}
                  onChange={(e) => {
                    setFormData({...formData, model: e.target.value});
                    autoResize(null, e.target);
                  }}
                  onInput={(e) => autoResize(null, e.target as HTMLTextAreaElement)}
                  onFocus={(e) => autoResize(null, e.target)}
                  placeholder="예: CPH-329R3"
                />
              </div>
            </div>
          </div>

          <table className="w-full border-collapse border border-black">
            <thead className="bg-[#fde6d2]">
              <tr>
                <th className="w-[30px] border border-black">No</th>
                <th className="w-[100px] border border-black">HS Code</th>
                <th className="w-[100px] border border-black">Item No.</th>
                <th className="w-[200px] border border-black">Item</th>
                <th className="w-[100px] border border-black">수량/Số Lượng</th>
                <th className="w-[200px] border border-black">이미지/Hình Ảnh</th>
                <th className="w-[100px] border border-black">크기/Kích thước</th>
                <th className="w-[250px] border border-black">참고사항/Ghi chú</th>
                <th className="w-[250px] border border-black">상자크기, 무게/kích thước thùng, cân nặng</th>
                <th className="w-[80px] border border-black">상자 수/Số thùng</th>
                <th className="w-[150px] border border-black no-print">Memo (Screen Only)</th>
              </tr>
            </thead>
            <tbody>
              {formData.rows.map((row, idx) => {
                const imgMod = row.modifications?.['image'];
                const imgColor = imgMod ? getInitialsColor(imgMod.initials) : null;

                return (
                  <tr key={row.id} className="border-b border-black">
                    <td className="border-r border-black relative group/row text-center">
                      <div className="flex flex-col items-center justify-center p-1 bg-slate-50 border border-slate-200 rounded absolute left-[-40px] top-0 no-print gap-1">
                          <button onClick={() => addRowBelow(idx)} className="p-1 hover:bg-blue-100 text-blue-600 rounded" title="아래에 행 추가"><Plus className="w-3 h-3" /></button>
                          <button onClick={() => deleteRow(idx)} className="p-1 hover:bg-red-100 text-red-600 rounded" title="행 삭제"><Trash2 className="w-3 h-3" /></button>
                      </div>
                      {row.no}
                    </td>

                    {renderCell(row, idx, 'hsCode')}
                    {renderCell(row, idx, 'itemNo')}
                    {renderCell(row, idx, 'itemName', { isBold: true })}
                    {renderCell(row, idx, 'qty', { isBlack: true })}

                    {/* Image Cell */}
                    <td 
                      className="p-1 min-h-[100px] relative group/cell border-r border-black"
                      style={{ backgroundColor: imgColor ? imgColor.cellBg : undefined }}
                      onPaste={(e) => handleImagePaste(row.id, e)}
                    >
                      {imgMod && (
                        <span
                          className={`absolute top-0.5 right-0.5 text-[8px] font-black px-1 py-0.2 rounded border shadow-xs pointer-events-none no-print z-10 ${imgColor?.badgeBg} ${imgColor?.text} ${imgColor?.border}`}
                          title={`수정: [${imgMod.initials}]`}
                        >
                          {imgMod.initials}
                        </span>
                      )}
                      {row.image ? (
                          <div className="relative inline-block w-full h-full">
                              <img src={row.image} className="mx-auto block" style={{maxWidth: '100%', maxHeight: '200px'}} alt="part" />
                              <button onClick={() => handleRowChange(row.id, 'image', '')} className="absolute top-0 right-0 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover/cell:opacity-100 no-print">
                                  <X className="w-3 h-3" />
                              </button>
                          </div>
                      ) : (
                          <div className="flex flex-col items-center justify-center h-20 text-slate-300 border-2 border-dashed border-slate-100 rounded-lg no-print">
                              <ImageIcon className="w-6 h-6 mb-1" />
                              <span className="text-[9px]">Ctrl+V 이미지 붙여넣기</span>
                          </div>
                      )}
                    </td>

                    {renderCell(row, idx, 'size')}
                    {renderCell(row, idx, 'remarks', { align: 'left', textClass: 'text-xs' })}
                    {renderCell(row, idx, 'boxInfo', { align: 'left', textClass: 'text-xs pl-4' })}
                    {renderCell(row, idx, 'boxQty')}
                    {renderCell(row, idx, 'memo', { align: 'left', textClass: 'text-xs', isMemo: true })}
                  </tr>
                );
              })}
              <tr className="bg-yellow-200">
                <td colSpan={4} className="font-bold border border-black text-center">Total</td>
                <td className="font-black text-blue-700 border border-black text-center">
                    {formData.rows.reduce((acc, r) => acc + (parseFloat(r.qty.replace(/,/g, '')) || 0), 0).toLocaleString()}
                </td>
                <td colSpan={5} className="border border-black"></td>
                <td className="border border-black no-print"></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="space-y-1">
          <h1 className="text-3xl font-black text-slate-800 tracking-tight">
            {normalizeSub(sub) === normalizeSub(ShippingReportSubCategory.CREATE) ? 'Create Shipment' : (GLOBAL_SUB_LABELS[sub] || sub)}
          </h1>
          <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">Shipping Report Management</p>
        </div>
        
        {normalizeSub(sub) === normalizeSub(ShippingReportSubCategory.CREATE) && (
          <button 
            onClick={handleCreateNew}
            className="px-8 py-3 bg-slate-900 text-white rounded-2xl font-black text-sm hover:bg-blue-600 transition-all flex items-center gap-2 shadow-lg shadow-slate-900/10"
          >
            <Plus className="w-5 h-5" /> 새 보고서 작성
          </button>
        )}
      </div>

      <div className="bg-white p-6 rounded-[2.5rem] border border-slate-200 shadow-sm">
        <div className="flex flex-col md:flex-row gap-4 mb-8">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input 
              type="text"
              placeholder="제목, 작성자, 수정자 검색..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500 focus:outline-none font-bold"
            />
          </div>
          <div className="flex bg-slate-100 p-1 rounded-2xl">
            <button 
              onClick={() => setViewMode('grid')}
              className={`px-4 py-2 rounded-xl font-bold text-xs transition-all ${viewMode === 'grid' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500'}`}
            >
              아이콘
            </button>
            <button 
              onClick={() => setViewMode('list')}
              className={`px-4 py-2 rounded-xl font-bold text-xs transition-all ${viewMode === 'list' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500'}`}
            >
              리스트
            </button>
          </div>
        </div>

        {viewMode === 'grid' ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {filteredItems.map(item => {
              const lastRev = item.revisionHistory && item.revisionHistory.length > 0 
                ? item.revisionHistory[item.revisionHistory.length - 1] 
                : null;
              const revColor = lastRev ? getInitialsColor(lastRev.initials) : null;

              return (
                <div 
                  key={item.id}
                  className="group bg-white p-4 rounded-2xl border border-slate-100 hover:border-blue-500 hover:shadow-lg transition-all cursor-pointer relative flex flex-col justify-between"
                  onClick={() => handleEdit(item)}
                >
                  <div>
                    <div className="flex justify-between items-start mb-3">
                      <div className="p-2.5 bg-rose-50 rounded-xl text-rose-600 group-hover:bg-rose-500 group-hover:text-white transition-colors">
                        <FileText className="w-5 h-5" />
                      </div>
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleDelete(item.id); }}
                        className="p-1.5 text-slate-300 hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <h3 className="text-sm font-black text-slate-800 line-clamp-1 mb-0.5">{item.model}</h3>
                    <p className="text-[10px] font-bold text-slate-400 mb-2">{item.dataDate}</p>
                  </div>

                  <div className="space-y-1 pt-2 border-t border-slate-50">
                    <div className="flex justify-between items-center">
                      <span className="text-[8px] font-black uppercase tracking-tighter text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-md">{item.authorId}</span>
                      <span className="text-[8px] font-bold text-slate-300">{new Date(item.createdAt).toLocaleDateString()}</span>
                    </div>
                    {lastRev && (
                      <div className="flex justify-between items-center text-[8px] font-bold">
                        <span className={`px-1.5 py-0.2 rounded border ${revColor?.bg} ${revColor?.text} ${revColor?.border}`}>
                          수정: {lastRev.initials}
                        </span>
                        <span className="text-slate-400">{lastRev.date.split(' ')[0]}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="py-4 px-4 text-xs font-black text-slate-400 uppercase tracking-widest">Model</th>
                  <th className="py-4 px-4 text-xs font-black text-slate-400 uppercase tracking-widest">Date</th>
                  <th className="py-4 px-4 text-xs font-black text-slate-400 uppercase tracking-widest">Author</th>
                  <th className="py-4 px-4 text-xs font-black text-slate-400 uppercase tracking-widest">Last Modified</th>
                  <th className="py-4 px-4 text-xs font-black text-slate-400 uppercase tracking-widest">Created</th>
                  <th className="py-4 px-4 text-right text-xs font-black text-slate-400 uppercase tracking-widest">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map(item => {
                  const lastRev = item.revisionHistory && item.revisionHistory.length > 0 
                    ? item.revisionHistory[item.revisionHistory.length - 1] 
                    : null;
                  const revColor = lastRev ? getInitialsColor(lastRev.initials) : null;

                  return (
                    <tr 
                      key={item.id} 
                      className="group border-b border-slate-50 hover:bg-slate-50/50 cursor-pointer transition-colors"
                      onClick={() => handleEdit(item)}
                    >
                      <td className="py-4 px-4"><span className="text-sm font-black text-slate-800">{item.model}</span></td>
                      <td className="py-4 px-4"><span className="text-xs font-bold text-slate-500">{item.dataDate}</span></td>
                      <td className="py-4 px-4"><span className="text-[10px] font-black uppercase text-blue-600 bg-blue-50 px-2 py-0.5 rounded-lg">{item.authorId}</span></td>
                      <td className="py-4 px-4">
                        {lastRev ? (
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded-lg border ${revColor?.bg} ${revColor?.text} ${revColor?.border}`}>
                            {lastRev.initials} ({lastRev.date})
                          </span>
                        ) : (
                          <span className="text-xs text-slate-300">-</span>
                        )}
                      </td>
                      <td className="py-4 px-4"><span className="text-xs font-bold text-slate-400">{new Date(item.createdAt).toLocaleDateString()}</span></td>
                      <td className="py-4 px-4 text-right">
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleDelete(item.id); }}
                          className="p-2 text-slate-300 hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        
        {filteredItems.length === 0 && (
          <div className="py-20 text-center text-slate-300 font-bold italic">
            목록이 비어 있습니다.
          </div>
        )}
      </div>
    </div>
  );
};

export default ShippingReportView;

