
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { InvoiceSubCategory, InvoiceItem, InvoiceRow, UserAccount, ViewState, MainCategory } from '../types';
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

const InvoiceView: React.FC<InvoiceViewProps> = ({ sub, currentUser, setView, dataVersion }) => {
  const [invoices, setInvoices] = useState<InvoiceItem[]>([]);
  const [activeInvoice, setActiveInvoice] = useState<InvoiceItem | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestionTarget, setSuggestionTarget] = useState<{rowId: string, field: string} | null>(null);
  const [viewMode, setViewMode] = useState<'ICON' | 'DETAIL'>('ICON');
  
  const [undoStack, setUndoStack] = useState<string[]>([]);
  const [selection, setSelection] = useState<{ sR: number, sC: number, eR: number, eC: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [merges, setMerges] = useState<Record<string, { rS: number, cS: number }>>({});
  const [aligns, setAligns] = useState<Record<string, 'left' | 'center' | 'right'>>({});
  const [borders, setBorders] = useState<Record<string, { t?: string, b?: string, l?: string, r?: string }>>({});
  const [activeBorderStyle, setActiveBorderStyle] = useState<string>('solid');

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
    
  const [formRows, setFormRows] = useState<InvoiceRow[]>(createInitialRows(10));

  useEffect(() => {
    const saved = localStorage.getItem('ajin_invoices');
    if (saved) {
      const parsedInvoices = JSON.parse(saved);
      setInvoices(parsedInvoices);
      if (activeInvoice) {
        const updatedActive = parsedInvoices.find((i: InvoiceItem) => i.id === activeInvoice.id);
        if (updatedActive) {
          setActiveInvoice(updatedActive);
          setMerges(updatedActive.merges || {});
          setAligns(updatedActive.aligns || {});
          setBorders(updatedActive.borders || {});
        }
      }
    }
  }, [dataVersion]);
  
  useEffect(() => {
    setCurrentPage(1);
  }, [sub, searchTerm]);

  const takeSnapshot = useCallback(() => {
    const data = JSON.stringify({
      rows: activeInvoice ? activeInvoice.rows : formRows,
      merges: merges,
      aligns: aligns,
      borders: borders,
      formCargo,
      formWeight,
      formBoxQty,
      formDate,
      formRecipient
    });
    setUndoStack(prev => {
      if (prev.length > 0 && prev[0] === data) return prev;
      return [data, ...prev].slice(0, 100);
    });
  }, [activeInvoice, formRows, merges, aligns, borders, formCargo, formWeight, formBoxQty, formDate, formRecipient]);

  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    const [last, ...rest] = undoStack;
    try {
      const data = JSON.parse(last);
      if (activeInvoice) {
        const currentFullList = JSON.parse(localStorage.getItem('ajin_invoices') || '[]');
        const updated = currentFullList.map((inv: InvoiceItem) => 
          inv.id === activeInvoice.id ? { ...inv, rows: data.rows, merges: data.merges, aligns: data.aligns, borders: data.borders } : inv
        );
        localStorage.setItem('ajin_invoices', JSON.stringify(updated));
        setInvoices(updated);
        const nextActive = updated.find((i: InvoiceItem) => i.id === activeInvoice.id);
        if (nextActive) setActiveInvoice(nextActive);
      } else {
        setFormRows(data.rows);
        setFormCargo(data.formCargo || '');
        setFormWeight(data.formWeight || '');
        setFormBoxQty(data.formBoxQty || '');
        setFormDate(data.formDate || '');
        setFormRecipient(data.formRecipient || 'SEOUL');
      }
      setMerges(data.merges || {});
      setAligns(data.aligns || {});
      setBorders(data.borders || {});
      setUndoStack(rest);
    } catch (e) { console.error('Undo failed', e); }
  }, [undoStack, activeInvoice]);

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
    if (!activeInvoice) {
      setFormRows(prev => prev.map(row => row.id === rowId ? { ...row, [field]: value } : row));
    } else {
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
      localStorage.setItem('ajin_invoices', JSON.stringify(updatedList));
      setInvoices(updatedList);
      const currentActive = updatedList.find((i: InvoiceItem) => i.id === activeInvoice.id);
      if (currentActive) setActiveInvoice(currentActive);
      pushStateToCloud();
    }
    if (field === 'itemName') {
      const query = value.toLowerCase().trim();
      if (query.length > 0) {
        const filtered = itemLibrary.filter(name => name.toLowerCase().includes(query)).slice(0, 10);
        setSuggestions(filtered);
        setSuggestionTarget({ rowId, field });
      } else {
        setSuggestions([]); setSuggestionTarget(null);
      }
    }
  }, [itemLibrary, currentUser, activeInvoice]);

  const handleBorderApply = useCallback((target: 'outer' | 'inner', style: string) => {
    if (!selection) return;
    takeSnapshot();
    const { sR, sC, eR, eC } = selection;
    const minR = Math.min(sR, eR), maxR = Math.max(sR, eR);
    const minC = Math.min(sC, eC), maxC = Math.max(sC, eC);
    const newBorders = { ...borders };

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
    setBorders(newBorders);
    if (activeInvoice) {
      const currentFullList = JSON.parse(localStorage.getItem('ajin_invoices') || '[]');
      const updated = currentFullList.map((inv: InvoiceItem) => inv.id === activeInvoice.id ? { ...inv, borders: newBorders } : inv);
      localStorage.setItem('ajin_invoices', JSON.stringify(updated));
      setInvoices(updated);
      pushStateToCloud();
    }
  }, [selection, borders, takeSnapshot, activeInvoice]);

  const handlePaste = (e: React.ClipboardEvent, startRowIdx: number, startColIdx: number) => {
    const pasteData = e.clipboardData.getData('text');
    if (!pasteData.includes('\t') && !pasteData.includes('\n')) return;
    e.preventDefault();
    takeSnapshot();
    const lines = pasteData.split(/\r?\n/).filter(line => line.length > 0);
    const grid = lines.map(row => row.split('\t'));
    const fields: (keyof InvoiceRow)[] = ['model', 'drawingNo', 'itemName', 'qty', 'qtyExtra', 'completionExtra', 'completionStatus', 'remarks'];

    if (activeInvoice) {
      const currentFullList = JSON.parse(localStorage.getItem('ajin_invoices') || '[]');
      const updatedList = currentFullList.map((inv: InvoiceItem) => {
        if (inv.id === activeInvoice.id) {
          let newRows = [...inv.rows];
          grid.forEach((pRow, rOffset) => {
            const rIdx = startRowIdx + rOffset;
            if (!newRows[rIdx]) newRows[rIdx] = { id: Math.random().toString(36).substr(2, 9), model: '', drawingNo: '', itemName: '', qty: '', qtyExtra: '', completionExtra: '', completionStatus: '', remarks: '' };
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
          if (!newRows[rIdx]) newRows[rIdx] = { id: Math.random().toString(36).substr(2, 9), model: '', drawingNo: '', itemName: '', qty: '', qtyExtra: '', completionExtra: '', completionStatus: '', remarks: '' };
          pRow.forEach((pCell, cOffset) => {
            const cIdx = startColIdx + cOffset;
            if (cIdx < fields.length) {
              const field = fields[cIdx];
              newRows[rIdx] = { ...newRows[rIdx], [field]: pCell } as InvoiceRow;
            }
          });
        });
        return newRows;
      });
    }
  };

  const handleRowKeyDown = (e: React.KeyboardEvent, rowIdx: number, colIdx: number) => {
    const validCols = [0, 1, 2, 3, 4, 5, 6, 7];
    const currentIndex = validCols.indexOf(colIdx);
    
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (currentIndex < validCols.length - 1) {
        const nextCol = validCols[currentIndex + 1];
        (document.querySelector(`[data-row="${rowIdx}"][data-col="${nextCol}"]`) as HTMLTextAreaElement)?.focus();
      } else {
        const nextRowIdx = rowIdx + 1;
        const targetRows = activeInvoice ? activeInvoice.rows : formRows;
        if (nextRowIdx >= targetRows.length) {
          const newRow = { id: Math.random().toString(36).substr(2, 9), model: '', drawingNo: '', itemName: '', qty: '', qtyExtra: '', completionExtra: '', completionStatus: '', remarks: '' };
          if (!activeInvoice) {
            takeSnapshot();
            setFormRows(prev => [...prev, newRow]);
          } else {
            takeSnapshot();
            const currentFullList = JSON.parse(localStorage.getItem('ajin_invoices') || '[]');
            const updated = currentFullList.map((inv: InvoiceItem) => inv.id === activeInvoice.id ? { ...inv, rows: [...inv.rows, newRow] } : inv);
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
    } else if (['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft'].includes(e.key)) {
      e.preventDefault();
      let nR = rowIdx, nC = colIdx;
      if (e.key === 'ArrowDown') nR++;
      else if (e.key === 'ArrowUp') nR--;
      else if (e.key === 'ArrowRight') nC = currentIndex < validCols.length - 1 ? validCols[currentIndex + 1] : colIdx;
      else if (e.key === 'ArrowLeft') nC = currentIndex > 0 ? validCols[currentIndex - 1] : colIdx;
      
      const target = document.querySelector(`[data-row="${nR}"][data-col="${nC}"]`) as HTMLTextAreaElement;
      if (target) {
        target.focus();
        setSelection({ sR: nR, sC: nC, eR: nR, eC: nC });
      }
    }
  };

  const handleMerge = useCallback(() => {
    if (!selection) return;
    const { sR, sC, eR, eC } = selection;
    const minR = Math.min(sR, eR), maxR = Math.max(sR, eR);
    const minC = Math.min(sC, eC), maxC = Math.max(sC, eC);
    if (minR === maxR && minC === maxC) return;
    takeSnapshot();
    const newMerges = { ...merges };
    const rowSpan = maxR - minR + 1;
    const colSpan = maxC - minC + 1;
    for (let r = minR; r <= maxR; r++) { for (let c = minC; c <= maxC; c++) { delete newMerges[`${r}-${c}`]; } }
    newMerges[`${minR}-${minC}`] = { rS: rowSpan, cS: colSpan };
    setMerges(newMerges);
    if (activeInvoice) {
      const currentFullList = JSON.parse(localStorage.getItem('ajin_invoices') || '[]');
      const updated = currentFullList.map((inv: InvoiceItem) => inv.id === activeInvoice.id ? { ...inv, merges: newMerges } : inv);
      localStorage.setItem('ajin_invoices', JSON.stringify(updated));
      setInvoices(updated);
      pushStateToCloud();
    }
    setSelection(null);
  }, [selection, merges, takeSnapshot, activeInvoice]);

  const handleUnmerge = useCallback(() => {
    if (!selection) return;
    const { sR, sC, eR, eC } = selection;
    const minR = Math.min(sR, eR), maxR = Math.max(sR, eR);
    const minC = Math.min(sC, eC), maxC = Math.max(sC, eC);
    takeSnapshot();
    const newMerges = { ...merges };
    for (let r = minR; r <= maxR; r++) {
      for (let c = minC; c <= maxC; c++) {
        delete newMerges[`${r}-${c}`];
      }
    }
    setMerges(newMerges);
    if (activeInvoice) {
      const currentFullList = JSON.parse(localStorage.getItem('ajin_invoices') || '[]');
      const updated = currentFullList.map((inv: InvoiceItem) => inv.id === activeInvoice.id ? { ...inv, merges: newMerges } : inv);
      localStorage.setItem('ajin_invoices', JSON.stringify(updated));
      setInvoices(updated);
      pushStateToCloud();
    }
    setSelection(null);
  }, [selection, merges, takeSnapshot, activeInvoice]);

  const handleAlign = useCallback((align: 'left' | 'center' | 'right') => {
    if (!selection) return;
    const { sR, sC, eR, eC } = selection;
    const minR = Math.min(sR, eR), maxR = Math.max(sR, eR);
    const minC = Math.min(sC, eC), maxC = Math.max(sC, eC);
    takeSnapshot();
    const newAligns = { ...aligns };
    for (let r = minR; r <= maxR; r++) { for (let c = minC; c <= maxC; c++) { newAligns[`${r}-${c}`] = align; } }
    setAligns(newAligns);
    if (activeInvoice) {
      const currentFullList = JSON.parse(localStorage.getItem('ajin_invoices') || '[]');
      const updated = currentFullList.map((inv: InvoiceItem) => inv.id === activeInvoice.id ? { ...inv, aligns: newAligns } : inv);
      localStorage.setItem('ajin_invoices', JSON.stringify(updated));
      setInvoices(updated);
      pushStateToCloud();
    }
  }, [selection, aligns, takeSnapshot, activeInvoice]);

  const handleClearSelectionText = useCallback(() => {
    if (!selection) return;
    const { sR, sC, eR, eC } = selection;
    const minR = Math.min(sR, eR), maxR = Math.max(sR, eR);
    const minC = Math.min(sC, eC), maxC = Math.max(sC, eC);
    const fields: (keyof InvoiceRow)[] = ['model', 'drawingNo', 'itemName', 'qty', 'qtyExtra', 'completionExtra', 'completionStatus', 'remarks'];
    
    takeSnapshot();
    if (!activeInvoice) {
      setFormRows(prev => {
        const next = [...prev];
        for (let r = minR; r <= maxR; r++) {
          if (!next[r]) continue;
          for (let c = minC; c <= maxC; c++) {
            if (c < fields.length) next[r] = { ...next[r], [fields[c]]: '' };
          }
        }
        return next;
      });
    } else {
      const currentFullList = JSON.parse(localStorage.getItem('ajin_invoices') || '[]');
      const updatedList = currentFullList.map((inv: InvoiceItem) => {
        if (inv.id === activeInvoice.id) {
          const nextRows = [...inv.rows];
          for (let r = minR; r <= maxR; r++) {
            if (!nextRows[r]) continue;
            for (let c = minC; c <= maxC; c++) {
              if (c < fields.length) nextRows[r] = { ...nextRows[r], [fields[c]]: '', modLog: { userId: currentUser.initials, timestamp: getCurrentAmPmTime(), type: 'EDIT' as const } };
            }
          }
          return { ...inv, rows: nextRows };
        }
        return inv;
      });
      localStorage.setItem('ajin_invoices', JSON.stringify(updatedList));
      setInvoices(updatedList);
      const nextActive = updatedList.find((i: InvoiceItem) => i.id === activeInvoice.id);
      if (nextActive) setActiveInvoice(nextActive);
      pushStateToCloud();
    }
    setSelection(null);
  }, [selection, activeInvoice, takeSnapshot, currentUser.initials]);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F4' && (sub === InvoiceSubCategory.CREATE || activeInvoice)) { e.preventDefault(); handleMerge(); }
      if (e.key === 'Delete' && (sub === InvoiceSubCategory.CREATE || activeInvoice) && selection) { e.preventDefault(); handleClearSelectionText(); }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [handleMerge, handleClearSelectionText, sub, activeInvoice, selection]);

  const isCellSelected = (r: number, c: number) => {
    if (!selection) return false;
    const { sR, sC, eR, eC } = selection;
    const minR = Math.min(sR, eR), maxR = Math.max(sR, eR), minC = Math.min(sC, eC), maxC = Math.max(sC, eC);
    return r >= minR && r <= maxR && c >= minC && c <= maxC;
  };

  const handleCellMouseDown = (r: number, c: number) => { setSelection({ sR: r, sC: c, eR: r, eC: c }); setIsDragging(true); };
  const handleCellMouseEnter = (r: number, c: number) => { if (isDragging && selection) setSelection({ ...selection, eR: r, eC: c }); };
  const handleMouseUp = () => setIsDragging(false);

  useEffect(() => {
    window.addEventListener('mouseup', handleMouseUp);
    return () => window.removeEventListener('mouseup', handleMouseUp);
  }, []);

  const handleInsertRow = (idx: number) => {
    takeSnapshot();
    const newRow = { id: Math.random().toString(36).substr(2, 9), model: '', drawingNo: '', itemName: '', qty: '', qtyExtra: '', completionExtra: '', completionStatus: '', remarks: '' };
    if (!activeInvoice) {
      const updated = [...formRows];
      updated.splice(idx + 1, 0, newRow);
      setFormRows(updated);
    } else {
      const currentFullList = JSON.parse(localStorage.getItem('ajin_invoices') || '[]');
      const updated = currentFullList.map((inv: InvoiceItem) => {
        if (inv.id === activeInvoice.id) {
          const updatedRows = [...inv.rows];
          updatedRows.splice(idx + 1, 0, newRow);
          return { ...inv, rows: updatedRows };
        }
        return inv;
      });
      localStorage.setItem('ajin_invoices', JSON.stringify(updated));
      setInvoices(updated);
      const current = updated.find((i: InvoiceItem) => i.id === activeInvoice.id);
      if (current) setActiveInvoice(current);
      pushStateToCloud();
    }
  };

  const handleDeleteTableRow = (idx: number) => {
    const targetRows = activeInvoice ? activeInvoice.rows : formRows;
    if (targetRows.length <= 1) return;
    takeSnapshot();
    if (!activeInvoice) {
      setFormRows(prev => prev.filter((_, i) => i !== idx));
    } else {
      const currentFullList = JSON.parse(localStorage.getItem('ajin_invoices') || '[]');
      const updated = currentFullList.map((inv: InvoiceItem) => {
        if (inv.id === activeInvoice.id) {
          return { ...inv, rows: inv.rows.filter((_, i) => i !== idx) };
        }
        return inv;
      });
      localStorage.setItem('ajin_invoices', JSON.stringify(updated));
      setInvoices(updated);
      const current = updated.find((i: InvoiceItem) => i.id === activeInvoice.id);
      if (current) setActiveInvoice(current);
      pushStateToCloud();
    }
  };

  const handleQtyConfirm = (rowId: string) => {
    if (sub === InvoiceSubCategory.CREATE || activeInvoice?.isTemporary) return;
    const isAlreadyConfirmed = activeInvoice?.rows.find(r => r.id === rowId)?.qtyConfirm;
    if (isAlreadyConfirmed) return;
    setModal({
      type: 'ADD_ROW_CONFIRM', message: '수량 확인을 하셨습니까?',
      onConfirm: () => {
        const currentFullList = JSON.parse(localStorage.getItem('ajin_invoices') || '[]');
        let allConfirmed = false;
        let finalUpdated = currentFullList.map((inv: InvoiceItem) => {
          if (inv.id === activeInvoice?.id) {
            const updatedRows = inv.rows.map(row => row.id === rowId ? { ...row, qtyConfirm: { userId: currentUser.initials, timestamp: getCurrentAmPmTime() } } : row) as InvoiceRow[];
            const activeRows = updatedRows.filter(r => !r.isDeleted && (r.model?.trim() || r.itemName?.trim()));
            allConfirmed = activeRows.length > 0 && activeRows.every(r => !!r.qtyConfirm);
            return { ...inv, rows: updatedRows, stamps: allConfirmed ? { ...inv.stamps, final: { userId: currentUser.initials, timestamp: getCurrentAmPmTime() } } : inv.stamps } as InvoiceItem;
          }
          return inv;
        });
        localStorage.setItem('ajin_invoices', JSON.stringify(finalUpdated));
        setInvoices(finalUpdated);
        if (allConfirmed) {
          setModal({ type: 'ALERT', message: '모든 확인이 완료되어 해당 수신처 폴더로 저장(분류)되었습니다.', onConfirm: () => { setModal(null); setActiveInvoice(null); } });
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
      type: 'DELETE_SAVED', id: rowId, index: index, message: '수정 하시겠습니까?',
      onConfirm: () => {
        takeSnapshot();
        const currentFullList = JSON.parse(localStorage.getItem('ajin_invoices') || '[]');
        const updated = currentFullList.map((inv: InvoiceItem) => {
          if (inv.id === activeInvoice?.id) {
            let updatedRows = inv.rows.map(row => row.id === rowId ? { ...row, isDeleted: true, modLog: { userId: currentUser.initials, timestamp: getCurrentAmPmTime(), type: 'DELETE' as const } } : row) as InvoiceRow[];
            const newRow = { id: `NEW-${Math.random().toString(36).substr(2, 9)}`, model: '', drawingNo: '', itemName: '', qty: '', qtyExtra: '', completionExtra: '', completionStatus: '', remarks: '' };
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

  const handleCreateSubmit = (isTemp: boolean = false) => {
    const validRows = (activeInvoice ? activeInvoice.rows : formRows).filter(r => !r.isDeleted && (r.model.trim() || r.itemName.trim()));
    if (validRows.length === 0) { setModal({ type: 'ALERT', message: '입력된 내용이 없습니다.' }); return; }
    const firstRow = validRows[0];
    const newTitle = `${firstRow.model} ${firstRow.itemName}`.trim() || '무제 송장';
    
    if (activeInvoice) {
      const currentFullList = JSON.parse(localStorage.getItem('ajin_invoices') || '[]');
      const updated = currentFullList.map((inv: InvoiceItem) => {
        if (inv.id === activeInvoice.id) {
          return {
            ...inv, title: newTitle, date: formDate, recipient: formRecipient, cargoInfo: formCargo, 
            rows: isTemp ? activeInvoice.rows : validRows, 
            weight: formWeight, boxQty: formBoxQty, isTemporary: isTemp,
            merges: merges, aligns: aligns, borders: borders,
            stamps: { ...inv.stamps, writer: { userId: currentUser.initials, timestamp: getCurrentAmPmTime() } }
          };
        }
        return inv;
      });
      saveInvoices(updated);
    } else {
      const newInvoice: InvoiceItem = {
        id: `INV-${Date.now()}`, title: newTitle, date: formDate, recipient: formRecipient, cargoInfo: formCargo, 
        rows: isTemp ? formRows : validRows, 
        weight: formWeight, boxQty: formBoxQty, authorId: currentUser.initials, createdAt: new Date().toISOString(), merges: merges, aligns: aligns, borders: borders, isTemporary: isTemp,
        stamps: { writer: { userId: currentUser.initials, timestamp: getCurrentAmPmTime() } }
      };
      saveInvoices([newInvoice, ...invoices]);
    }

    setFormRows(createInitialRows(10)); setFormCargo(''); setFormWeight(''); setFormBoxQty(''); setFormDate(new Date().toLocaleDateString('ko-KR')); setMerges({}); setAligns({}); setBorders({}); setUndoStack([]); setModal(null);
    alert(isTemp ? '임시 저장이 완료되었습니다.' : '송장 작성이 완료되었습니다.');
    setView({ type: 'INVOICE', sub: isTemp ? InvoiceSubCategory.TEMPORARY : InvoiceSubCategory.COMPLETED }); 
  };

  const handleFileDelete = (invoiceId: string) => {
    if (!isMaster) return;
    const filtered = invoices.filter(inv => inv.id !== invoiceId);
    saveInvoices(filtered); setModal(null); setActiveInvoice(null);
    alert('송장 파일이 영구 삭제되었습니다.');
  };

  // Add helper function to get color for specific locations
  const getLocationColor = (location: 'SEOUL' | 'DAECHEON' | 'VIETNAM') => {
    switch(location) {
      case 'SEOUL': return { bg: 'bg-blue-50', text: 'text-blue-500', groupHover: 'group-hover:bg-blue-100' };
      case 'DAECHEON': return { bg: 'bg-emerald-50', text: 'text-emerald-500', groupHover: 'group-hover:bg-emerald-100' };
      case 'VIETNAM': return { bg: 'bg-amber-50', text: 'text-amber-500', groupHover: 'group-hover:bg-amber-100' };
      default: return { bg: 'bg-slate-50', text: 'text-slate-500', groupHover: 'group-hover:bg-slate-100' };
    }
  };

  // Add function to handle document printing for invoices
  const handlePrint = () => {
    const printContent = document.querySelector('.document-print-content')?.innerHTML;
    if (!printContent) return;
    const filename = `${activeInvoice?.title || '송장'}_${activeInvoice?.date || ''}`.replace(/[/\\?%*:|"<>]/g, '-');
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`<html><head><title>${filename}</title><script src="https://cdn.tailwindcss.com"></script><style>body { font-family: 'Gulim', sans-serif; padding: 20px; background: white; } .no-print { display: none !important; } .bg-red-50 { background-color: #fef2f2 !important; } .text-red-600 { color: #dc2626 !important; } .line-through { text-decoration: line-through !important; } table { border-collapse: collapse; width: 100%; border: 1px solid black !important; } th, td { border: 1px solid black !important; padding: 6px; vertical-align: top; } @page { size: A4 portrait; margin: 10mm; } .document-print-content { width: 100% !important; box-shadow: none !important; border: none !important; }</style></head><body onload="window.print();"><div>${printContent}</div></body></html>`);
      printWindow.document.close();
    } else alert('팝업이 차단되었습니다.');
  };

  const renderInvoiceForm = (isReadOnly: boolean = false, data?: InvoiceItem) => {
    const rows = isReadOnly ? (data?.rows || []) : formRows;
    const isTempDoc = data?.isTemporary;
    const recipient = (isReadOnly && !isTempDoc) ? data?.recipient : formRecipient;
    const date = (isReadOnly && !isTempDoc) ? data?.date : formDate;
    const cargo = (isReadOnly && !isTempDoc) ? data?.cargoInfo : formCargo;
    const weight = (isReadOnly && !isTempDoc) ? data?.weight : formWeight;
    const boxQty = (isReadOnly && !isTempDoc) ? data?.boxQty : formBoxQty;
    const currentMerges = isReadOnly ? (data?.merges || {}) : merges;
    const currentAligns = isReadOnly ? (data?.aligns || {}) : aligns;
    const currentBorders = isReadOnly ? (data?.borders || {}) : borders;
    const stamps = data?.stamps;

    return (
      <div className={`bg-white border-[1px] border-slate-300 shadow-2xl mx-auto p-4 md:p-12 min-h-[297mm] w-full max-w-[210mm] text-slate-800 font-gulim relative document-print-content text-left overflow-x-auto`}>
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
              {isReadOnly && !isTempDoc ? <span>{date}</span> : <input type="text" value={date} onChange={(e) => { takeSnapshot(); setFormDate(e.target.value); }} className="flex-1 bg-transparent outline-none"/>}
            </div>
            <div className="flex border-b border-slate-900 pb-1 items-center gap-2">
              <span className="w-16 font-bold whitespace-nowrap">화물발송</span>
              {isReadOnly && !isTempDoc ? <span>{cargo}</span> : (
                <div className="flex flex-1 items-center gap-2">
                  <select className="bg-slate-50 border rounded px-1 py-0.5 text-[10px] md:text-xs outline-none w-16 md:w-auto" onChange={(e) => { takeSnapshot(); setFormCargo(e.target.value); }} value={cargoOptions.includes(formCargo) ? formCargo : ''}><option value="">직접</option>{cargoOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}</select>
                  <input type="text" value={formCargo} onChange={(e) => { takeSnapshot(); setFormCargo(e.target.value); }} onFocus={takeSnapshot} placeholder="정보 입력" className="flex-1 bg-transparent outline-none border-l border-slate-200 pl-2 min-w-0"/>
                </div>
              )}
            </div>
            <div className="flex border-b border-slate-900 pb-1 items-center">
              <span className="w-16 font-bold">수신처</span>
              {isReadOnly && !isTempDoc ? <span className="font-bold text-blue-700">{recipient === 'SEOUL' ? '서울' : recipient === 'DAECHEON' ? '대천' : '베트남'}</span> : (
                <div className="flex gap-2 md:gap-4 overflow-x-auto">{['SEOUL', 'DAECHEON', 'VIETNAM'].map(loc => (<label key={loc} className="flex items-center gap-1 cursor-pointer text-[10px] md:text-xs whitespace-nowrap"><input type="radio" checked={formRecipient === loc} onChange={() => { takeSnapshot(); setFormRecipient(loc as any); }}/>{loc === 'SEOUL' ? '서울' : loc === 'DAECHEON' ? '대천' : '베트남'}</label>))}</div>
              )}
            </div>
          </div>

          <table className="w-full border-collapse border border-slate-900 text-[10px] md:text-[11px] select-none">
            <thead className="bg-slate-50">
              <tr>
                <th className="border border-slate-900 p-1 md:p-2 w-[11%] text-center">기종</th>
                <th className="border border-slate-900 p-1 md:p-2 w-[10%] text-center">도 번</th>
                <th className="border border-slate-900 p-1 md:p-2 flex-1 min-w-[120px] text-center">품 목</th>
                <th className="border border-slate-900 p-1 md:p-2 w-[12%] text-center">수 량</th>
                <th className="border border-slate-900 p-1 md:p-2 w-[9%] text-center leading-tight">완료</th>
                <th className="border border-slate-900 p-1 md:p-2 w-[13%] text-center">확인</th>
                <th className="border border-slate-900 p-1 md:p-2 w-[15%] text-center">비고</th>
                <th className="border border-slate-900 p-1 md:p-2 w-14 text-center no-print">관리</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => {
                const rowCells = [
                  { f: 'model', c: 0 }, { f: 'drawingNo', c: 1 }, { f: 'itemName', c: 2 },
                  { f: 'qty_group', c: 3 }, { f: 'completion_group', c: 5 },
                  { f: 'confirm', c: 7 }, { f: 'remarks', c: 8 }
                ];
                
                return (
                  <tr key={row.id} className={row.isDeleted ? 'bg-red-50' : ''}>
                    {rowCells.map(cell => {
                      const merge = currentMerges[`${idx}-${cell.c}`];
                      const isSkipped = Object.entries(currentMerges).some(([key, m]: [string, any]) => {
                        const [mr, mc] = key.split('-').map(Number);
                        return idx >= mr && idx < mr + m.rS && cell.c >= mc && cell.c < mc + m.cS && !(idx === mr && cell.c === mc);
                      });
                      if (isSkipped) return null;

                      const isSelected = isCellSelected(idx, cell.c);
                      const isRowEditableInLockedDoc = row.id && typeof row.id === 'string' && row.id.startsWith('NEW-');
                      const finalDisabled = row.isDeleted || !!row.qtyConfirm || (isReadOnly && !isRowEditableInLockedDoc && !isTempDoc);
                      const textAlign = currentAligns[`${idx}-${cell.c}`] || 'left';
                      const borderStyles = getCellBorderStyle(idx, cell.c, currentBorders);

                      return (
                        <td 
                          key={cell.c} 
                          rowSpan={merge?.rS || 1} 
                          colSpan={merge?.cS || 1}
                          onMouseDown={() => !isReadOnly && handleCellMouseDown(idx, cell.c)}
                          onMouseEnter={() => !isReadOnly && handleCellMouseEnter(idx, cell.c)}
                          style={{ ...borderStyles }}
                          className={`border border-slate-900 p-0 relative transition-all ${isSelected ? 'bg-blue-100 ring-1 ring-blue-400 z-10' : ''}`}
                        >
                          {cell.f === 'model' && <AutoExpandingTextarea value={row.model} dataRow={idx} dataCol={0} disabled={finalDisabled} onFocus={() => { takeSnapshot(); setSelection({ sR: idx, sC: 0, eR: idx, eC: 0 }); }} onChange={(e: any) => updateRowField(row.id, 'model', e.target.value)} onKeyDown={(e: any) => handleRowKeyDown(e, idx, 0)} onPaste={(e: any) => handlePaste(e, idx, 0)} style={{ textAlign }} className={row.isDeleted ? 'text-red-600 line-through' : ''}/>}
                          {cell.f === 'drawingNo' && <AutoExpandingTextarea value={row.drawingNo} dataRow={idx} dataCol={1} disabled={finalDisabled} onFocus={() => { takeSnapshot(); setSelection({ sR: idx, sC: 1, eR: idx, eC: 1 }); }} onChange={(e: any) => updateRowField(row.id, 'drawingNo', e.target.value)} onKeyDown={(e: any) => handleRowKeyDown(e, idx, 1)} onPaste={(e: any) => handlePaste(e, idx, 1)} style={{ textAlign: 'center' }} className={`text-center ${row.isDeleted ? 'text-red-600 line-through' : ''}`}/>}
                          {cell.f === 'itemName' && (
                            <div className="relative">
                              <AutoExpandingTextarea value={row.itemName} dataRow={idx} dataCol={2} disabled={finalDisabled} onFocus={() => { takeSnapshot(); setSelection({ sR: idx, sC: 2, eR: idx, eC: 2 }); }} onChange={(e: any) => updateRowField(row.id, 'itemName', e.target.value)} onKeyDown={(e: any) => handleRowKeyDown(e, idx, 2)} onPaste={(e: any) => handlePaste(e, idx, 2)} style={{ textAlign }} className={row.isDeleted ? 'text-red-600 line-through' : ''}/>
                              {suggestionTarget?.rowId === row.id && suggestions.length > 0 && (
                                <div className="absolute left-0 right-0 top-full bg-white border border-slate-300 shadow-xl z-50 rounded-b overflow-hidden max-h-32 overflow-y-auto no-print">
                                  {suggestions.map((name, sIdx) => (<button key={sIdx} onClick={() => { takeSnapshot(); updateRowField(row.id, 'itemName', name); setSuggestions([]); setSuggestionTarget(null); }} className="w-full text-left px-3 py-1.5 text-[9px] md:text-[10px] hover:bg-blue-50 border-b last:border-0 border-slate-100 font-bold">{name}</button>))}
                                </div>
                              )}
                            </div>
                          )}
                          {cell.f === 'qty_group' && (
                            <div className="grid grid-cols-7 h-full min-h-[30px] items-center">
                              <div className="col-span-5 h-full flex items-center border-r border-slate-300"><AutoExpandingTextarea value={row.qty} dataRow={idx} dataCol={3} disabled={finalDisabled} onFocus={() => { takeSnapshot(); setSelection({ sR: idx, sC: 3, eR: idx, eC: 3 }); }} onChange={(e: any) => updateRowField(row.id, 'qty', e.target.value)} onKeyDown={(e: any) => handleRowKeyDown(e, idx, 3)} onPaste={(e: any) => handlePaste(e, idx, 3)} className={`text-center ${row.isDeleted ? 'text-red-600 line-through' : ''}`}/></div>
                              <div className="col-span-2 h-full flex items-center"><AutoExpandingTextarea value={row.qtyExtra} dataRow={idx} dataCol={4} disabled={finalDisabled} onFocus={() => { takeSnapshot(); setSelection({ sR: idx, sC: 4, eR: idx, eC: 4 }); }} onChange={(e: any) => updateRowField(row.id, 'qtyExtra', e.target.value)} onKeyDown={(e: any) => handleRowKeyDown(e, idx, 4)} onPaste={(e: any) => handlePaste(e, idx, 4)} className={`text-center ${row.isDeleted ? 'text-red-600 line-through' : ''}`}/></div>
                            </div>
                          )}
                          {cell.f === 'completion_group' && (
                            <div className="grid grid-cols-7 h-full min-h-[30px] items-center">
                              <div className="col-span-2 h-full flex items-center border-r border-slate-300"><AutoExpandingTextarea value={row.completionExtra} dataRow={idx} dataCol={5} disabled={finalDisabled} onFocus={() => { takeSnapshot(); setSelection({ sR: idx, sC: 5, eR: idx, eC: 5 }); }} onChange={(e: any) => updateRowField(row.id, 'completionExtra', e.target.value)} onKeyDown={(e: any) => handleRowKeyDown(e, idx, 5)} onPaste={(e: any) => handlePaste(e, idx, 5)} className={`text-center ${row.isDeleted ? 'text-red-600 line-through' : ''}`}/></div>
                              <div className="col-span-5 h-full flex items-center"><AutoExpandingTextarea value={row.completionStatus} dataRow={idx} dataCol={6} disabled={finalDisabled} onFocus={() => { takeSnapshot(); setSelection({ sR: idx, sC: 6, eR: idx, eC: 6 }); }} onChange={(e: any) => updateRowField(row.id, 'completionStatus', e.target.value)} onKeyDown={(e: any) => handleRowKeyDown(e, idx, 6)} onPaste={(e: any) => handlePaste(e, idx, 6)} className={`text-center ${row.isDeleted ? 'text-red-600 line-through' : ''}`}/></div>
                            </div>
                          )}
                          {cell.f === 'confirm' && (
                            <div className={`w-full h-full min-h-[30px] flex items-center justify-center transition-colors ${row.qtyConfirm ? 'bg-blue-50/30' : ''} ${isReadOnly && !row.isDeleted && !isTempDoc ? 'cursor-pointer hover:bg-slate-50' : ''}`} onClick={() => isReadOnly && !row.isDeleted && handleQtyConfirm(row.id)}>
                              {row.qtyConfirm ? <div className="flex flex-col items-center scale-90"><span className="font-bold text-blue-600 leading-tight whitespace-nowrap">{row.qtyConfirm.userId}</span><span className="text-[7px] text-slate-400 leading-tight mt-0.5 whitespace-nowrap">{formatAmPm(row.qtyConfirm.timestamp)}</span></div> : <span className="text-slate-300 text-[9px]">{isReadOnly && !row.isDeleted && !isTempDoc ? '확인' : ''}</span>}
                            </div>
                          )}
                          {cell.f === 'remarks' && <AutoExpandingTextarea value={row.remarks} dataRow={idx} dataCol={8} disabled={finalDisabled} onFocus={() => { takeSnapshot(); setSelection({ sR: idx, sC: 8, eR: idx, eC: 8 }); }} onChange={(e: any) => updateRowField(row.id, 'remarks', e.target.value)} onKeyDown={(e: any) => handleRowKeyDown(e, idx, 8)} onPaste={(e: any) => handlePaste(e, idx, 8)} style={{ textAlign }} className={row.isDeleted ? 'text-red-600 line-through' : ''}/>}
                        </td>
                      );
                    })}
                    <td className="border border-slate-900 p-1 text-center no-print align-middle whitespace-nowrap">
                      {isReadOnly && !isTempDoc ? (
                        <div className="flex flex-col items-center gap-1">
                          {(row.model || row.itemName) && !row.isDeleted && <button onClick={() => handleDeleteSavedRow(row.id, idx)} className="px-1.5 py-0.5 rounded text-[8px] md:text-[9px] font-bold bg-red-50 text-red-500 hover:bg-red-500 hover:text-white transition-all">수정</button>}
                          {row.modLog && (
                            <div className="text-[7px] md:text-[8px] text-slate-500 leading-tight font-sans">
                              <span className="font-bold">{row.modLog.type === 'DELETE' ? 'DEL' : 'MOD'}:</span> {row.modLog.userId}<br/>{formatAmPm(row.modLog.timestamp)}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => handleInsertRow(idx)} className="w-5 h-5 flex items-center justify-center bg-blue-50 text-blue-600 rounded-full hover:bg-blue-600 hover:text-white transition-all text-xs font-bold" title="행 삽입">+</button>
                          <button onClick={() => handleDeleteTableRow(idx)} className="w-5 h-5 flex items-center justify-center bg-red-50 text-red-600 rounded-full hover:bg-red-600 hover:text-white transition-all text-xs font-bold" title="행 삭제">-</button>
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
                <tr><td className="border border-slate-900 p-1 bg-slate-50 font-bold w-16 md:w-20 text-center whitespace-nowrap">무게(KG)</td><td className="border border-slate-900 p-0">{isReadOnly && !isTempDoc ? <span className="px-2">{weight}</span> : <input type="text" value={weight} onChange={(e) => { takeSnapshot(); setFormWeight(e.target.value); }} onFocus={takeSnapshot} className="w-full bg-transparent outline-none p-1 text-center"/>}</td></tr>
                <tr><td className="border border-slate-900 p-1 bg-slate-50 font-bold w-16 md:w-20 text-center whitespace-nowrap">수량(BOX)</td><td className="border border-slate-900 p-0">{isReadOnly && !isTempDoc ? <span className="px-2">{boxQty}</span> : <input type="text" value={boxQty} onChange={(e) => { takeSnapshot(); setFormBoxQty(e.target.value); }} onFocus={takeSnapshot} className="w-full bg-transparent outline-none p-1 text-center"/>}</td></tr>
              </tbody>
            </table>
          </div>

          {stamps && (
            <div className="mt-8 flex flex-wrap justify-end items-center gap-4 md:gap-6 text-[9px] md:text-[10px] no-print">
              {stamps.writer && <div className="flex items-center gap-2"><span className="text-slate-400 font-bold uppercase">작성:</span><span className="text-blue-600 font-black">{stamps.writer.userId}</span><span className="text-slate-400 whitespace-nowrap">{formatAmPm(stamps.writer.timestamp)}</span></div>}
              {stamps.final && <div className="flex items-center gap-2 border-l border-slate-200 pl-4"><span className="text-slate-400 font-bold uppercase">완료:</span><span className="text-emerald-600 font-black">{stamps.final.userId}</span><span className="text-slate-400 whitespace-nowrap">{formatAmPm(stamps.final.timestamp)}</span></div>}
            </div>
          )}

          <div className="mt-8 flex justify-end px-2 text-[9px] md:text-[10px] font-bold text-slate-400 tracking-widest uppercase italic pb-8">AJIN PRE / AJIN VINA</div>

          {(!isReadOnly || isTempDoc) && (
            <div className="mt-8 md:mt-12 flex justify-center gap-4 no-print pb-8">
              <button onClick={() => handleCreateSubmit(true)} className="px-10 md:px-16 py-3 md:py-4 bg-slate-400 text-white rounded-xl font-black text-lg md:text-xl hover:bg-slate-500 shadow-xl transition-all active:scale-95">임 시 저 장</button>
              <button onClick={() => handleCreateSubmit(false)} className="px-10 md:px-16 py-3 md:py-4 bg-slate-900 text-white rounded-xl font-black text-lg md:text-xl hover:bg-blue-600 shadow-2xl transition-all active:scale-95">작 성 완 료</button>
            </div>
          )}
        </div>

        {modal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[9999] p-4 no-print">
            <div className="bg-white rounded-2xl shadow-2xl p-6 md:p-8 max-w-sm w-full border border-slate-200 animate-in fade-in zoom-in duration-200">
              <h3 className={`text-lg md:text-xl font-black mb-4 ${modal.type === 'DELETE' || modal.type === 'DELETE_SAVED' || modal.type === 'DELETE_FILE' ? 'text-red-600' : 'text-slate-900'} text-center`}>{modal.type === 'ALERT' ? '알림' : '확인'}</h3>
              <p className="text-slate-600 mb-8 font-medium leading-relaxed text-sm md:text-base text-center">{modal.message}</p>
              <div className="flex gap-3">
                {modal.type === 'ALERT' ? <button onClick={() => { if (modal.onConfirm) modal.onConfirm(); else setModal(null); }} className="flex-1 py-3 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition-all">확인</button> : <><button onClick={() => setModal(null)} className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-all">취소</button><button onClick={() => modal.onConfirm && modal.onConfirm()} className={`flex-1 py-3 text-white rounded-xl font-bold transition-all shadow-lg ${modal.type.includes('DELETE') || modal.type === 'DELETE_SAVED' || modal.type === 'DELETE_FILE' ? 'bg-red-600 hover:bg-red-700 shadow-red-100' : 'bg-blue-600 hover:bg-blue-700 shadow-blue-100'}`}>확인</button></>}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  if (sub === InvoiceSubCategory.CREATE) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center max-w-[210mm] mx-auto no-print px-4">
          <button onClick={handleUndo} disabled={undoStack.length === 0} className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl font-black text-sm shadow-xl transition-all active:scale-95 ${undoStack.length > 0 ? 'bg-slate-700 text-white hover:bg-slate-900' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>되돌리기 ({undoStack.length})</button>
          <div className="flex gap-2">
            <button onClick={() => { takeSnapshot(); setFormRows([...formRows, { id: Math.random().toString(36).substr(2, 9), model: '', drawingNo: '', itemName: '', qty: '', qtyExtra: '', completionExtra: '', completionStatus: '', remarks: '' }]); }} className="px-4 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold hover:bg-slate-50">+ 행 추가</button>
          </div>
        </div>
        {selection && (
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
            <button onClick={handleClearSelectionText} className="px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-xs font-bold hover:bg-red-600 hover:text-white transition-all whitespace-nowrap">글자 삭제 (Del)</button>
            <button onClick={() => setSelection(null)} className="p-1 text-slate-400 hover:text-slate-900 ml-2"><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12"/></svg></button>
          </div>
        )}
        <div className="py-4 md:py-8 bg-slate-200 min-h-screen overflow-x-auto">{renderInvoiceForm(false)}</div>
      </div>
    );
  }

  const locationFilter = sub === InvoiceSubCategory.SEOUL ? 'SEOUL' : sub === InvoiceSubCategory.DAECHEON ? 'DAECHEON' : 'VIETNAM';
  const filtered = useMemo(() => {
    if (sub === InvoiceSubCategory.TEMPORARY) return invoices.filter(inv => !!inv.isTemporary);
    const nonTempInvoices = invoices.filter(inv => !inv.isTemporary);
    if (sub === InvoiceSubCategory.COMPLETED) {
      return nonTempInvoices.filter(inv => { 
        const activeRows = inv.rows.filter(r => !r.isDeleted && (r.model?.trim() || r.itemName?.trim())); 
        if (activeRows.length === 0) return true; 
        return !activeRows.every(r => !!r.qtyConfirm); 
      });
    }
    return nonTempInvoices.filter(inv => { 
      if (inv.recipient !== locationFilter) return false; 
      const activeRows = inv.rows.filter(r => !r.isDeleted && (r.model?.trim() || r.itemName?.trim())); 
      if (activeRows.length === 0) return false; 
      return activeRows.every(r => !!r.qtyConfirm); 
    });
  }, [invoices, sub, locationFilter]);

  const sortedAll = [...filtered].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const searchFiltered = sortedAll.filter(inv => { if (!searchTerm.trim()) return true; const lower = searchTerm.toLowerCase(); const hasItem = inv.rows.some(r => r.itemName.toLowerCase().includes(lower) || r.model.toLowerCase().includes(lower)); return (inv.title && inv.title.toLowerCase().includes(lower)) || hasItem; });
  const totalItems = searchFiltered.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const paginatedItems = searchFiltered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  if (activeInvoice) {
    const isDocCompleted = !!activeInvoice.stamps?.final;
    return (
      <div className={`py-4 md:py-8 bg-slate-200 min-h-screen ${isPreviewing ? 'fixed inset-0 z-[100] bg-slate-900 overflow-y-auto' : ''}`}>
        <div className="max-w-[1000px] mx-auto mb-4 md:mb-6 flex flex-col md:flex-row justify-between items-center px-4 no-print gap-4">
          {isPreviewing ? (<div><h2 className="text-xl md:text-2xl font-black text-white">PDF 저장 미리보기</h2></div>) : (
            <div className="flex gap-2">
              <button onClick={() => setActiveInvoice(null)} className="bg-white px-4 md:px-6 py-2.5 md:py-3 rounded-xl font-bold shadow-lg hover:bg-slate-50 border border-slate-300 transition-all flex items-center gap-2 text-sm">← 목록으로</button>
              <button onClick={handleUndo} disabled={undoStack.length === 0} className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-black text-xs shadow-xl transition-all ${undoStack.length > 0 ? 'bg-slate-700 text-white hover:bg-slate-900' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}>Undo ({undoStack.length})</button>
            </div>
          )}
          {selection && (activeInvoice.isTemporary || !isDocCompleted) && (
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
              <button onClick={handleClearSelectionText} className="px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-xs font-bold hover:bg-red-600 hover:text-white transition-all whitespace-nowrap">글자 삭제 (Del)</button>
              <button onClick={() => setSelection(null)} className="p-1 text-slate-400 hover:text-slate-900 ml-2"><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12"/></svg></button>
            </div>
          )}
          <div className="flex gap-2 md:gap-3 w-full md:w-auto">{isPreviewing ? (<><button onClick={() => setIsPreviewing(false)} className="flex-1 md:flex-none bg-slate-700 text-white px-4 md:px-6 py-2.5 md:py-3 rounded-xl font-bold hover:bg-slate-600 transition-all text-sm">닫기</button><button onClick={handlePrint} className="flex-1 md:flex-none bg-blue-500 text-white px-6 md:px-8 py-2.5 md:py-3 rounded-xl font-black shadow-2xl hover:bg-blue-400 flex items-center justify-center gap-2 transition-all text-sm">저장 / 인쇄</button></>) : (<button onClick={() => setIsPreviewing(true)} className="flex-1 md:flex-none bg-blue-600 text-white px-4 md:px-8 py-2.5 md:py-3 rounded-xl font-black shadow-lg hover:bg-blue-700 flex items-center justify-center gap-2 transition-all text-sm">PDF 저장 / 인쇄</button>)}</div>
        </div>
        <div className="print-area">{renderInvoiceForm(true, activeInvoice)}</div>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6 text-left pb-12">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div><h2 className="text-2xl md:text-3xl font-black text-slate-900">{sub} 송장 관리</h2><div className="flex flex-wrap items-center gap-2 md:gap-4 mt-2"><p className="text-slate-500 text-sm">총 {totalItems}건의 송장</p><div className="hidden md:block h-4 w-[1px] bg-slate-300"></div><div className="flex bg-slate-200 p-1 rounded-lg"><button onClick={() => setViewMode('ICON')} className={`px-3 py-1 rounded-md text-[10px] font-bold transition-all ${viewMode === 'ICON' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>아이콘</button><button onClick={() => setViewMode('DETAIL')} className={`px-3 py-1 rounded-md text-[10px] font-bold transition-all ${viewMode === 'DETAIL' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>리스트</button></div></div></div>
        <div className="relative w-full md:max-w-sm"><input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="기종 또는 품목으로 찾기..." className="w-full px-4 md:px-5 py-2.5 md:py-3 rounded-xl md:rounded-2xl border border-slate-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-sm font-medium"/><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 md:h-5 md:w-5 absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg></div>
      </div>
      {viewMode === 'ICON' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-8">
          {paginatedItems.length === 0 ? (<div className="col-span-full py-16 md:py-32 text-center text-slate-400 border-4 border-dashed rounded-3xl bg-white/50 text-sm md:text-lg">{searchTerm ? '검색 결과가 없습니다.' : '보관된 송장이 없습니다.'}</div>) : (paginatedItems.map(inv => {
            const colors = getLocationColor(inv.recipient);
            return (
              <div key={inv.id} className="relative group">
                <button onClick={() => { 
                  setActiveInvoice(inv); 
                  setSelection({ sR: 0, sC: 0, eR: 0, eC: 0 }); // Reset selection highlight
                  setFormDate(inv.date);
                  setFormRecipient(inv.recipient);
                  setFormCargo(inv.cargoInfo);
                  setFormWeight(inv.weight);
                  setFormBoxQty(inv.boxQty);
                  setMerges(inv.merges || {});
                  setAligns(inv.aligns || {});
                  setBorders(inv.borders || {});
                }} className="w-full bg-white p-6 md:p-8 rounded-2xl md:rounded-3xl shadow-sm border-2 border-slate-100 hover:border-blue-500 hover:shadow-xl transition-all flex flex-col items-center relative overflow-hidden text-center h-full">
                  <div className={`absolute top-2 right-2 md:top-3 md:right-3 px-1.5 py-0.5 rounded text-[8px] md:text-[9px] font-bold border ${colors.bg} ${colors.text} border-current opacity-70 z-10`}>
                    {inv.recipient === 'SEOUL' ? '서울' : inv.recipient === 'DAECHEON' ? '대천' : '베트남'}
                  </div>
                  <div className={`w-12 h-16 md:w-16 md:h-20 ${colors.bg} ${colors.groupHover} rounded-lg shadow-inner mb-4 md:mb-6 flex items-center justify-center border border-slate-100 transition-colors relative`}>
                    <svg xmlns="http://www.w3.org/2000/svg" className={`h-6 w-6 md:h-8 md:w-8 ${colors.text} opacity-60`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={inv.isTemporary ? "M12 6v6m0 0v6m0-6h6m-6 0H6" : "M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"} />
                    </svg>
                    {inv.isTemporary && <div className="absolute top-1 right-1 bg-amber-500 w-2 h-2 rounded-full animate-pulse"></div>}
                  </div>
                  <h3 className="font-black text-slate-800 text-xs md:text-sm truncate w-full mb-1 leading-tight px-2">{inv.title || '무제 송장'}</h3><p className="text-[9px] md:text-[10px] text-slate-400 font-bold mb-1">{inv.date}</p><p className="text-[9px] md:text-[10px] text-blue-600 uppercase font-bold tracking-widest opacity-70 truncate w-full">{inv.cargoInfo || '-'}</p>
                </button>
                {isMaster && <button onClick={(e) => { e.stopPropagation(); setModal({ type: 'DELETE_FILE', message: '해당 송장 파일을 영구 삭제하시겠습니까? (복구 불가)', onConfirm: () => handleFileDelete(inv.id) }); }} className="absolute -top-2 -right-2 bg-red-600 text-white w-7 h-7 md:w-8 md:h-8 rounded-full shadow-lg hover:bg-red-700 flex items-center justify-center z-20"><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg></button>}
              </div>
            );
          }))}
        </div>
      ) : (
        <div className="bg-white rounded-xl md:rounded-2xl border border-slate-200 overflow-x-auto shadow-sm">
          <table className="w-full text-left min-w-[700px]">
            <thead><tr className="bg-slate-50 border-b border-slate-200"><th className="px-4 md:px-6 py-3 md:py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">날짜</th><th className="px-4 md:px-6 py-3 md:py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">송장 제목</th><th className="px-4 md:px-6 py-3 md:py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">수신처</th><th className="px-4 md:px-6 py-3 md:py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">작성자</th><th className="px-4 md:px-6 py-3 md:py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">화물정보</th><th className="px-4 md:px-6 py-3 md:py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">관리</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{paginatedItems.length === 0 ? (<tr><td colSpan={6} className="px-6 py-12 text-center text-slate-400 font-medium italic">송장이 없습니다.</td></tr>) : (paginatedItems.map(inv => { const colors = getLocationColor(inv.recipient); return (<tr key={inv.id} className="hover:bg-slate-50 transition-colors cursor-pointer group" onClick={() => {
                  setActiveInvoice(inv); 
                  setSelection({ sR: 0, sC: 0, eR: 0, eC: 0 }); // Reset selection highlight
                  setFormDate(inv.date);
                  setFormRecipient(inv.recipient);
                  setFormCargo(inv.cargoInfo);
                  setFormWeight(inv.weight);
                  setFormBoxQty(inv.boxQty);
                  setMerges(inv.merges || {});
                  setAligns(inv.aligns || {});
                  setBorders(inv.borders || {});
                }}><td className="px-4 md:px-6 py-3 md:py-4 text-xs font-mono text-slate-500 whitespace-nowrap">{inv.date}</td><td className="px-4 md:px-6 py-3 md:py-4 text-xs md:text-sm font-black text-slate-800">{inv.isTemporary && <span className="mr-2 text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded text-[9px] uppercase border border-amber-200">임시</span>}{inv.title || '무제 송장'}</td><td className="px-4 md:px-6 py-3 md:py-4 text-center"><span className={`inline-block px-2 md:px-3 py-0.5 md:py-1 rounded-full text-[9px] md:text-[10px] font-bold border ${colors.bg} ${colors.text} border-transparent whitespace-nowrap`}>{inv.recipient === 'SEOUL' ? '서울' : inv.recipient === 'DAECHEON' ? '대천' : '베트남'}</span></td><td className="px-4 md:px-6 py-3 md:py-4 text-center text-[10px] md:text-xs font-bold text-slate-600 uppercase tracking-tighter">{inv.authorId}</td><td className="px-4 md:px-6 py-3 md:py-4 text-center text-[10px] md:text-xs font-bold text-slate-600 uppercase tracking-tighter">{inv.cargoInfo || '-'}</td><td className="px-4 md:px-6 py-3 md:py-4 text-right"><div className="flex justify-end items-center gap-3"><span className="text-[10px] font-bold text-blue-600 hidden md:inline opacity-0 group-hover:opacity-100 transition-opacity">{inv.isTemporary ? '수정 →' : '보기 →'}</span>{isMaster && <button onClick={(e) => { e.stopPropagation(); setModal({ type: 'DELETE_FILE', message: '해당 송장 파일을 영구 삭제하시겠습니까? (복구 불가)', onConfirm: () => handleFileDelete(inv.id) }); }} className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>}</div></td></tr>); }))}</tbody>
          </table>
        </div>
      )}
      {totalPages > 1 && (<div className="flex justify-center items-center gap-4 mt-8 no-print pb-10"><button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="px-4 py-2 bg-white border border-slate-300 rounded-xl font-bold text-slate-700 disabled:opacity-30 hover:bg-slate-50 transition-all shadow-sm">이전</button><div className="flex gap-2">{Array.from({ length: totalPages }, (_, i) => i + 1).map(pageNum => (<button key={pageNum} onClick={() => setCurrentPage(pageNum)} className={`w-10 h-10 rounded-xl font-black transition-all ${currentPage === pageNum ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' : 'bg-white border border-slate-200 text-slate-400 hover:bg-slate-50'}`}>{pageNum}</button>))}</div><button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="px-4 py-2 bg-white border border-slate-300 rounded-xl font-bold text-slate-700 disabled:opacity-30 hover:bg-slate-50 transition-all shadow-sm">다음</button></div>)}

      {modal && (modal.type === 'DELETE' || modal.type === 'DELETE_SAVED' || modal.type === 'DELETE_FILE' || modal.type === 'ADD_ROW_CONFIRM' || modal.type === 'ALERT') && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[9999] p-4 no-print">
          <div className="bg-white rounded-2xl shadow-2xl p-6 md:p-8 max-w-sm w-full border border-slate-200 animate-in fade-in zoom-in duration-200 text-center">
            <h3 className={`text-xl font-black mb-4 ${modal.type.includes('DELETE') ? 'text-red-600' : 'text-slate-900'}`}>{modal.type === 'ALERT' ? '알림' : '확인'}</h3>
            <p className="text-slate-600 mb-8 font-medium leading-relaxed text-sm md:text-base">{modal.message}</p>
            <div className="flex gap-3">
              {modal.type === 'ALERT' ? <button onClick={() => { if (modal.onConfirm) modal.onConfirm(); else setModal(null); }} className="flex-1 py-3 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition-all">확인</button> : <><button onClick={() => setModal(null)} className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-all">취소</button><button onClick={() => modal.onConfirm && modal.onConfirm()} className={`flex-1 py-3 text-white rounded-xl font-bold transition-all shadow-lg ${modal.type.includes('DELETE') || modal.type === 'DELETE_SAVED' || modal.type === 'DELETE_FILE' ? 'bg-red-600 hover:bg-red-700 shadow-red-100' : 'bg-blue-600 hover:bg-blue-700 shadow-blue-100'}`}>확인</button></>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InvoiceView;
