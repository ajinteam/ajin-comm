
import React, { useState, useEffect, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { 
  NationalInvoiceSubCategory, 
  UserAccount, 
  ViewState, 
  NationalInvoiceItem, 
  NationalInvoiceRow,
  NationalEntity
} from '../types';
import { saveSingleDoc, deleteSingleDoc, saveRecipient, deleteRecipient } from '../supabase';

const normalizeSub = (s: string): string => {
  if (s === '인보이스임시' || s === 'invoice_draft') return 'invoice_draft';
  if (s === '인보이스완료' || s === 'invoice_complete') return 'invoice_complete';
  if (s === '인보이스작성' || s === 'invoice_create') return 'invoice_create';
  return s;
};

const NATIONAL_INVOICE_LABELS: Record<string, string> = {
  'invoice_create': 'Create Invoice',
  'invoice_draft': 'Draft Invoices',
  'invoice_complete': 'Completed Invoices',
  '인보이스작성': 'Create Invoice',
  '인보이스임시': 'Draft Invoices',
  '인보이스완료': 'Completed Invoices'
};

interface NationalInvoiceProps {
  sub: NationalInvoiceSubCategory;
  editId?: string;
  currentUser: UserAccount;
  setView: (v: ViewState) => void;
  dataVersion: number;
}

const NationalInvoice: React.FC<NationalInvoiceProps> = ({ sub, editId, currentUser, setView, dataVersion }) => {
  const [items, setItems] = useState<NationalInvoiceItem[]>([]);
  const [entities, setEntities] = useState<NationalEntity[]>([]);
  const [isEntityModalOpen, setIsEntityModalOpen] = useState(false);
  const [editingEntity, setEditingEntity] = useState<Partial<NationalEntity> | null>(null);
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'ICON' | 'LIST'>('ICON');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const itemsPerPage = 10;
  const isMaster = currentUser.loginId === 'AJ5200';
  const remarksRef = useRef<HTMLTextAreaElement>(null);
  
  const getInitialFormData = (): Partial<NationalInvoiceItem> => ({
    rows: [
      { id: 'h1', type: 'HEADER', headerLeft: 'TOY TRAIN PARTS SAMPLE', headerRight: 'EX.FACTORY', fontSize: 11, isBold: true, pkgNo: 'ADDRESS', plPkgNo: '' },
      { id: '1', type: 'ITEM', description: '', quantity: '', unit: 'PCS', proc: '', procAmount: '', price: '', amount: '', fontSize: 10.5, isBold: false, pkgNo: '', plPkgNo: '', plProc: '', plProcAmount: '', plPrice: '', plAmount: '' },
      { id: '2', type: 'ITEM', description: '', quantity: '', unit: 'PCS', proc: '', procAmount: '', price: '', amount: '', fontSize: 10.5, isBold: false, pkgNo: '', plPkgNo: '', plProc: '', plProcAmount: '', plPrice: '', plAmount: '' },
      { id: '3', type: 'ITEM', description: '', quantity: '', unit: 'PCS', proc: '', procAmount: '', price: '', amount: '', fontSize: 10.5, isBold: false, pkgNo: '', plPkgNo: '', plProc: '', plProcAmount: '', plPrice: '', plAmount: '' },
      { id: '4', type: 'ITEM', description: '', quantity: '', unit: 'PCS', proc: '', procAmount: '', price: '', amount: '', fontSize: 10.5, isBold: false, pkgNo: '', plPkgNo: '', plProc: '', plProcAmount: '', plPrice: '', plAmount: '' },
      { id: '5', type: 'ITEM', description: '', quantity: '', unit: 'PCS', proc: '', procAmount: '', price: '', amount: '', fontSize: 10.5, isBold: false, pkgNo: '', plPkgNo: '', plProc: '', plProcAmount: '', plPrice: '', plAmount: '' },
      { id: 't1', type: 'TOTAL', description: 'TOTAL', quantity: '0', unit: 'UNIT', proc: '', procAmount: '', price: '', amount: '0', fontSize: 11, isBold: true }
    ],
    invoiceType: 'COMMERCIAL',
    currency: 'USD',
    currencySymbol: '$',
    shipperName: 'AJIN PRECISION MFG., INC.',
    shipperAddress: '#806 Star Valley 99, Digital-ro 9-gil, Geumcheon-Ku, Seoul, Korea',
    idCode: 'KRAJIPRE333SEO',
    invoiceNo: '',
    invoiceDate: new Date().toISOString().split('T')[0],
    pageNo: 'PAGE #1 OF 1',
    consigneeName: '',
    consigneeAddress: '',
    consigneeTaxId: '',
    consigneeTel: '',
    consigneeAttn: '',
    plShipperAddress: '',
    plConsigneeAddress: '',
    plRemarks: '',
    poNo: '',
    factoryOutDate: new Date().toISOString().split('T')[0],
    buyer: 'SAME AS CONSIGNEE',
    otherRef: '',
    departureDate: new Date().toISOString().split('T')[0],
    vesselFlight: 'FEDEX',
    from: 'SEOUL, KOREA',
    to: '',
    deliveryTerms: 'TOY TRAIN PARTS SAMPLE\nCOMMERCIAL VALUE',
    totalQuantity: '0',
    totalAmount: '0',
    totalProcAmount: '0',
    plTotalCtQty: '0',
    plTotalNetWeight: '0',
    plTotalGrossWeight: '0',
    plTotalCbm: '0',
    footerTel: '(82-2) 894-2611',
    footerFax: '(82-2) 802-9941',
    signedBy: 'AJIN PRECISION MFG., INC.',
    signedTitle: 'MANAGING DIRECTOR CHO, MOO-YEON.',
    signatureName: 'MOO YEUN-CHO',
    showTrackingNo: true,
    showRemarks: true,
    showPlRemarks: true,
    showPlExtraRemarks: true,
    shippingMarkType: ''
  });

  const [formData, setFormData] = useState<Partial<NationalInvoiceItem>>(getInitialFormData());
  const [originalData, setOriginalData] = useState<Partial<NationalInvoiceItem> | null>(null);
  const [history, setHistory] = useState<Partial<NationalInvoiceItem>[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const isUndoAction = useRef(false);

  // History tracking
  useEffect(() => {
    if (isUndoAction.current) {
      isUndoAction.current = false;
      return;
    }
    
    const timeoutId = setTimeout(() => {
      setHistory(prev => {
        const last = prev[prev.length - 1];
        if (JSON.stringify(last) === JSON.stringify(formData)) return prev;
        
        const newHistory = prev.slice(0, historyIndex + 1);
        newHistory.push(JSON.parse(JSON.stringify(formData)));
        
        // Limit history size to 50
        if (newHistory.length > 50) newHistory.shift();
        
        setHistoryIndex(newHistory.length - 1);
        return newHistory;
      });
    }, 500); // Debounce to avoid too many history points during typing

    return () => clearTimeout(timeoutId);
  }, [formData]);

  const handleUndo = () => {
    if (historyIndex > 0) {
      const prevIndex = historyIndex - 1;
      isUndoAction.current = true;
      setFormData(JSON.parse(JSON.stringify(history[prevIndex])));
      setHistoryIndex(prevIndex);
    }
  };

  const handleNewInvoice = () => {
    setFormData(getInitialFormData());
    setView({ type: 'NATIONAL_INVOICE', sub: NationalInvoiceSubCategory.CREATE });
  };

  useEffect(() => {
    const savedItems = localStorage.getItem('ajin_national_invoices');
    if (savedItems) setItems(JSON.parse(savedItems));
    
    const savedEntities = localStorage.getItem('ajin_national_entities');
    if (savedEntities) setEntities(JSON.parse(savedEntities));
  }, [dataVersion]);

  useEffect(() => {
    if (sub === NationalInvoiceSubCategory.CREATE) {
      if (editId) {
        const item = items.find(i => i.id === editId);
        if (item && formData.id !== editId) {
          setFormData(item);
          setOriginalData(JSON.parse(JSON.stringify(item)));
        }
      } else {
        // No editId means "New Invoice"
        // Only reset if we are currently showing an existing document
        if (formData.id) {
          setFormData(getInitialFormData());
          setOriginalData(null);
        }
      }
    }
  }, [sub, editId, items]);

  useEffect(() => {
    setCurrentPage(1);
  }, [sub, searchTerm]);

  const saveItems = (newItems: NationalInvoiceItem[], updatedDoc?: NationalInvoiceItem) => {
    setItems(newItems);
    localStorage.setItem('ajin_national_invoices', JSON.stringify(newItems));
    if (updatedDoc) saveSingleDoc('nationalinvoice', updatedDoc);
    
  };

  const saveEntities = (newEntities: NationalEntity[]) => {
    setEntities(newEntities);
    localStorage.setItem('ajin_national_entities', JSON.stringify(newEntities));
    
  };

  const formatNumber = (num: string | number) => {
    if (num === undefined || num === null || num === '') return '';
    const parts = num.toString().split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return parts.join('.');
  };

  const parseNumber = (val: string) => {
    return val.replace(/,/g, '');
  };

  const extractLastNumber = (val: string) => {
    if (!val) return 0;
    const matches = val.toString().match(/(\d+(\.\d+)?)/g);
    if (matches && matches.length > 0) {
      return parseFloat(matches[matches.length - 1]);
    }
    return 0;
  };

  const formatDateToEnglish = (dateStr: string | undefined) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
  };

  const handleAddRow = (type: 'ITEM' | 'HEADER' | 'TOTAL' = 'ITEM', index?: number) => {
    const newRow: NationalInvoiceRow = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
      type,
      description: type === 'TOTAL' ? 'TOTAL' : '',
      pkgNo: type === 'HEADER' ? 'ADDRESS' : '',
      plPkgNo: '',
      quantity: '',
      unit: type === 'ITEM' ? 'PCS' : (type === 'TOTAL' ? 'UNIT' : ''),
      proc: '',
      procAmount: '',
      price: '',
      amount: '',
      plProc: '',
      plProcAmount: '',
      plPrice: '',
      plAmount: '',
      headerLeft: type === 'HEADER' ? '' : undefined,
      headerRight: type === 'HEADER' ? '' : undefined,
      fontSize: type === 'HEADER' || type === 'TOTAL' ? 11 : 10.5,
      isBold: type === 'HEADER' || type === 'TOTAL'
    };
    setFormData(prev => {
      const rows = [...(prev.rows || [])];
      let insertIndex = index;
      
      if (insertIndex === undefined && selectedRowId) {
        insertIndex = rows.findIndex(r => r.id === selectedRowId);
      }

      if (insertIndex !== undefined && insertIndex !== -1) {
        rows.splice(insertIndex + 1, 0, newRow);
      } else {
        rows.push(newRow);
      }
      return { ...prev, rows };
    });
    setSelectedRowId(newRow.id);
  };

  const handleRemoveRow = (id: string) => {
    setFormData(prev => ({
      ...prev,
      rows: (prev.rows || []).filter(r => r.id !== id)
    }));
  };

  const handleRowChange = (id: string, field: keyof NationalInvoiceRow | keyof NationalInvoiceItem, value: any) => {
    setFormData(prev => {
      // If no ID is provided, we assume it's a top-level field update
      if (!id) {
        let val = value;
        if (field === 'totalQuantity' || field === 'totalAmount' || field === 'plTotalCtQty' || field === 'plTotalNetWeight' || field === 'plTotalGrossWeight' || field === 'plTotalCbm') {
          val = parseNumber(value);
        }
        return { ...prev, [field]: val };
      }

      let newRows = (prev.rows || []).map(r => {
        if (r.id === id) {
          let val = value;
          if (field === 'quantity' || field === 'price' || field === 'amount' || field === 'proc' || field === 'procAmount' || 
              field === 'plProc' || field === 'plProcAmount' || field === 'plPrice' || field === 'plAmount') {
            val = parseNumber(value);
          }
          const updated = { ...r, [field]: val };
          if (r.type === 'ITEM' && (field === 'quantity' || field === 'price' || field === 'proc')) {
            const q = parseFloat(parseNumber(updated.quantity || '0')) || 0;
            const p = parseFloat(parseNumber(updated.price || '0')) || 0;
            const prStr = parseNumber(updated.proc || '');
            const pr = parseFloat(prStr) || 0;
            
            updated.amount = (q * p).toFixed(2);
            
            // Only show procAmount if proc is entered (PROC를 입력해야 값이 표시되게)
            if (prStr === '') {
              updated.procAmount = '';
            } else {
              updated.procAmount = (q * pr).toFixed(2);
            }
          }
          return updated;
        }
        return r;
      });
      
      // Recalculate subtotals (TOTAL rows)
      // A TOTAL row sums all ITEM values above it since the previous TOTAL row (or start)
      let runningAmt = 0;
      let runningQty = 0;
      let runningProc = 0;
      let runningProcAmt = 0;
      let runningPrice = 0;
      let runningUnits: { [unit: string]: number } = {};

      let plRunningAmt = 0;
      let plRunningProc = 0;
      let plRunningProcAmt = 0;
      let plRunningPrice = 0;
      
      let blockHasPlProc = false;
      let blockHasPlNet = false;
      let blockHasPlGross = false;
      let blockHasPlCbm = false;

      newRows = newRows.map((r, idx) => {
        if (r.type === 'ITEM') {
          const q = parseFloat(parseNumber(r.quantity || '0')) || 0;
          runningAmt += parseFloat(parseNumber(r.amount || '0')) || 0;
          runningQty += q;
          runningProc += parseFloat(parseNumber(r.proc || '0')) || 0;
          runningProcAmt += parseFloat(parseNumber(r.procAmount || '0')) || 0;
          runningPrice += parseFloat(parseNumber(r.price || '0')) || 0;

          const u = (r.unit || 'PCS').toUpperCase();
          runningUnits[u] = (runningUnits[u] || 0) + q;

          plRunningAmt += parseFloat(parseNumber(r.plAmount || '0')) || 0;
          const currentPlProc = extractLastNumber(r.plProc || '0');
          if (currentPlProc > 0) {
            plRunningProc = Math.max(plRunningProc, currentPlProc);
          }
          plRunningProcAmt += parseFloat(parseNumber(r.plProcAmount || '0')) || 0;
          plRunningPrice += parseFloat(parseNumber(r.plPrice || '0')) || 0;

          if (r.plProc) blockHasPlProc = true;
          if (r.plProcAmount) blockHasPlNet = true;
          if (r.plPrice) blockHasPlGross = true;
          if (r.plAmount) blockHasPlCbm = true;

          return r;
        } else if (r.type === 'TOTAL') {
          const unitEntries = Object.entries(runningUnits).filter(([_, val]) => val > 0);
          let finalUnit = 'UNIT';
          let unitBreakdown = '';
          
          // Always calculate breakdown to include units
          if (unitEntries.length > 0) {
            unitBreakdown = unitEntries.map(([unit, val]) => `${formatNumber(val)} ${unit}`).join(' / ');
          }
          
          if (unitEntries.length === 1) {
            finalUnit = unitEntries[0][0];
          }

          const updated = { 
            ...r, 
            amount: runningAmt.toFixed(2), 
            quantity: runningQty.toString(),
            unit: finalUnit,
            unitBreakdown: unitBreakdown,
            proc: runningProc.toString(),
            procAmount: runningProcAmt.toFixed(2),
            price: runningPrice.toFixed(2),
          };

          // PL independent totals - only update if there's content in specific columns for this block
          if (blockHasPlProc) updated.plProc = plRunningProc.toString();
          else if (r.id !== id) updated.plProc = '';

          if (blockHasPlNet) updated.plProcAmount = plRunningProcAmt.toFixed(2);
          else if (r.id !== id) updated.plProcAmount = '';

          if (blockHasPlGross) updated.plPrice = plRunningPrice.toFixed(2);
          else if (r.id !== id) updated.plPrice = '';

          if (blockHasPlCbm) updated.plAmount = plRunningAmt.toFixed(2);
          else if (r.id !== id) updated.plAmount = '';
          
          // Reset running totals after each subtotal
          runningAmt = 0;
          runningQty = 0;
          runningProc = 0;
          runningProcAmt = 0;
          runningPrice = 0;
          runningUnits = {};

          plRunningAmt = 0;
          plRunningProc = 0;
          plRunningProcAmt = 0;
          plRunningPrice = 0;
          blockHasPlProc = false;
          blockHasPlNet = false;
          blockHasPlGross = false;
          blockHasPlCbm = false;

          return updated;
        }
        return r;
      });

      const grandTotalAmt = newRows.filter(r => r.type === 'ITEM').reduce((acc, r) => acc + (parseFloat(parseNumber(r.amount || '0')) || 0), 0);
      const grandTotalQty = newRows.filter(r => r.type === 'ITEM').reduce((acc, r) => acc + (parseFloat(parseNumber(r.quantity || '0')) || 0), 0);
      const grandTotalProcAmt = newRows.filter(r => r.type === 'ITEM').reduce((acc, r) => acc + (parseFloat(parseNumber(r.procAmount || '0')) || 0), 0);
      
      const totalUnits: { [unit: string]: number } = {};
      newRows.filter(r => r.type === 'ITEM').forEach(r => {
        const q = parseFloat(parseNumber(r.quantity || '0')) || 0;
        const u = (r.unit || 'PCS').toUpperCase();
        totalUnits[u] = (totalUnits[u] || 0) + q;
      });

      const totalUnitEntries = Object.entries(totalUnits).filter(([_, val]) => val > 0);
      let totalQuantityBreakdown = '';
      if (totalUnitEntries.length > 0) {
        totalQuantityBreakdown = totalUnitEntries.map(([unit, val]) => `${formatNumber(val)} ${unit}`).join(' / ');
      }
      
      let plTotalCtQty = prev.plTotalCtQty;
      let plTotalNetWeight = prev.plTotalNetWeight;
      let plTotalGrossWeight = prev.plTotalGrossWeight;
      let plTotalCbm = prev.plTotalCbm;

      const hasPlProc = newRows.some(r => r.type === 'ITEM' && r.plProc);
      const hasPlNet = newRows.some(r => r.type === 'ITEM' && r.plProcAmount);
      const hasPlGross = newRows.some(r => r.type === 'ITEM' && r.plPrice);
      const hasPlCbm = newRows.some(r => r.type === 'ITEM' && r.plAmount);

      // Grand totals per column
      if (hasPlProc) {
        plTotalCtQty = newRows.filter(r => r.type === 'ITEM').reduce((last, r) => {
          const val = extractLastNumber(r.plProc || '0');
          return val > 0 ? Math.max(last, val) : last;
        }, 0).toString();
      } else if (!['plTotalCtQty', 'plTotalNetWeight', 'plTotalGrossWeight', 'plTotalCbm'].includes(field as string)) {
        plTotalCtQty = '';
      }

      if (hasPlNet) {
        plTotalNetWeight = newRows.filter(r => r.type === 'ITEM').reduce((acc, r) => acc + (parseFloat(parseNumber(r.plProcAmount || '0')) || 0), 0).toFixed(2);
      } else if (!['plTotalCtQty', 'plTotalNetWeight', 'plTotalGrossWeight', 'plTotalCbm'].includes(field as string)) {
        plTotalNetWeight = '';
      }

      if (hasPlGross) {
        plTotalGrossWeight = newRows.filter(r => r.type === 'ITEM').reduce((acc, r) => acc + (parseFloat(parseNumber(r.plPrice || '0')) || 0), 0).toFixed(2);
      } else if (!['plTotalCtQty', 'plTotalNetWeight', 'plTotalGrossWeight', 'plTotalCbm'].includes(field as string)) {
        plTotalGrossWeight = '';
      }

      if (hasPlCbm) {
        plTotalCbm = newRows.filter(r => r.type === 'ITEM').reduce((acc, r) => acc + (parseFloat(parseNumber(r.plAmount || '0')) || 0), 0).toFixed(2);
      } else if (!['plTotalCtQty', 'plTotalNetWeight', 'plTotalGrossWeight', 'plTotalCbm'].includes(field as string)) {
        plTotalCbm = '';
      }

      // Manual override handling if currently editing grand totals
      if (['plTotalCtQty', 'plTotalNetWeight', 'plTotalGrossWeight', 'plTotalCbm'].includes(field as string)) {
        const val = parseNumber(value);
        if (field === 'plTotalCtQty') plTotalCtQty = val;
        if (field === 'plTotalNetWeight') plTotalNetWeight = val;
        if (field === 'plTotalGrossWeight') plTotalGrossWeight = val;
        if (field === 'plTotalCbm') plTotalCbm = val;
      }

      return { 
        ...prev, 
        rows: newRows, 
        totalAmount: grandTotalAmt.toFixed(2), 
        totalQuantity: grandTotalQty.toString(),
        totalProcAmount: grandTotalProcAmt.toFixed(2),
        totalQuantityBreakdown,
        plTotalCtQty,
        plTotalNetWeight,
        plTotalGrossWeight,
        plTotalCbm
      };
    });
  };

  const handlePaste = (e: React.ClipboardEvent, rowId: string, startField: string) => {
    const clipboardData = e.clipboardData.getData('Text');
    if (!clipboardData.includes('\t') && !clipboardData.includes('\n')) return;

    e.preventDefault();
    const lines = clipboardData.split(/\r?\n/).filter(line => line.length > 0);
    if (lines.length === 0) return;

    const fieldsOrder: (keyof NationalInvoiceRow)[] = ['pkgNo', 'description', 'quantity', 'proc', 'procAmount', 'price', 'amount'];
    const startIndex = fieldsOrder.indexOf(startField as keyof NationalInvoiceRow);
    if (startIndex === -1) return;

    setFormData(prev => {
      const rows = [...(prev.rows || [])];
      let startIdx = rows.findIndex(r => r.id === rowId);
      if (startIdx === -1) return prev;

      let currentPtr = startIdx;
      lines.forEach((line) => {
        const columns = line.split('\t');
        
        if (currentPtr >= rows.length || rows[currentPtr].type !== 'ITEM') {
          const newRow: NationalInvoiceRow = {
            id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
            type: 'ITEM',
            description: '',
            pkgNo: '',
            quantity: '',
            unit: 'PCS',
            proc: '',
            procAmount: '',
            price: '',
            amount: '',
            fontSize: 10.5,
            isBold: false
          };
          rows.splice(currentPtr, 0, newRow);
        }

        const row = { ...rows[currentPtr] };
        columns.forEach((val, colOffset) => {
          const fieldIdx = startIndex + colOffset;
          if (fieldIdx < fieldsOrder.length) {
            const field = fieldsOrder[fieldIdx];
            if (['quantity', 'price', 'proc', 'procAmount', 'amount'].includes(field as string)) {
              (row as any)[field] = parseNumber(val.trim());
            } else {
              (row as any)[field] = val.trim();
            }
          }
        });

        // Recalculate row amounts
        const q = parseFloat(parseNumber(row.quantity || '0')) || 0;
        const p = parseFloat(parseNumber(row.price || '0')) || 0;
        const pr = parseFloat(parseNumber(row.proc || '0')) || 0;
        row.amount = (q * p).toFixed(2);
        row.procAmount = (q * pr).toFixed(2);
        
        rows[currentPtr] = row;
        currentPtr++;
      });

      // Recalculate all subtotals and grand totals
      let runningAmt = 0;
      let runningQty = 0;
      let runningProc = 0;
      let runningProcAmt = 0;
      let runningPrice = 0;
      let runningUnits: { [unit: string]: number } = {};

      const updatedRows = rows.map((r) => {
        if (r.type === 'ITEM') {
          const q = parseFloat(parseNumber(r.quantity || '0')) || 0;
          runningAmt += parseFloat(parseNumber(r.amount || '0')) || 0;
          runningQty += q;
          runningProc += parseFloat(parseNumber(r.proc || '0')) || 0;
          runningProcAmt += parseFloat(parseNumber(r.procAmount || '0')) || 0;
          runningPrice += parseFloat(parseNumber(r.price || '0')) || 0;

          const u = (r.unit || 'PCS').toUpperCase();
          runningUnits[u] = (runningUnits[u] || 0) + q;

          return r;
        } else if (r.type === 'TOTAL') {
          const unitEntries = Object.entries(runningUnits).filter(([_, val]) => val > 0);
          let finalUnit = 'UNIT';
          let unitBreakdown = '';
          
          // Always calculate breakdown to include units
          if (unitEntries.length > 0) {
            unitBreakdown = unitEntries.map(([unit, val]) => `${formatNumber(val)} ${unit}`).join(' / ');
          }
          
          if (unitEntries.length === 1) {
            finalUnit = unitEntries[0][0];
          }

          const updated = { 
            ...r, 
            amount: runningAmt.toFixed(2), 
            quantity: runningQty.toString(),
            unit: finalUnit,
            unitBreakdown: unitBreakdown,
            proc: runningProc.toString(),
            procAmount: runningProcAmt.toFixed(2),
            price: runningPrice.toFixed(2)
          };
          runningAmt = 0;
          runningQty = 0;
          runningProc = 0;
          runningProcAmt = 0;
          runningPrice = 0;
          runningUnits = {};
          return updated;
        }
        return r;
      });

      const grandTotalAmt = updatedRows.filter(r => r.type === 'ITEM').reduce((acc, r) => acc + (parseFloat(parseNumber(r.amount || '0')) || 0), 0);
      const grandTotalQty = updatedRows.filter(r => r.type === 'ITEM').reduce((acc, r) => acc + (parseFloat(parseNumber(r.quantity || '0')) || 0), 0);
      const grandTotalProcAmt = updatedRows.filter(r => r.type === 'ITEM').reduce((acc, r) => acc + (parseFloat(parseNumber(r.procAmount || '0')) || 0), 0);

      const totalUnits: { [unit: string]: number } = {};
      updatedRows.filter(r => r.type === 'ITEM').forEach(r => {
        const q = parseFloat(parseNumber(r.quantity || '0')) || 0;
        const u = (r.unit || 'PCS').toUpperCase();
        totalUnits[u] = (totalUnits[u] || 0) + q;
      });

      const totalUnitEntries = Object.entries(totalUnits).filter(([_, val]) => val > 0);
      let totalQuantityBreakdown = '';
      if (totalUnitEntries.length > 0) {
        totalQuantityBreakdown = totalUnitEntries.map(([unit, val]) => `${formatNumber(val)} ${unit}`).join(' / ');
      }

      return { ...prev, rows: updatedRows, totalAmount: grandTotalAmt.toFixed(2), totalQuantity: grandTotalQty.toString(), totalProcAmount: grandTotalProcAmt.toFixed(2), totalQuantityBreakdown };
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent, rowId: string, field: string) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter'].includes(e.key)) {
      if (e.key === 'Enter' && e.shiftKey) return;
      
      const target = e.target as HTMLElement;
      const targetEl = e.currentTarget as HTMLTextAreaElement | HTMLInputElement;
      const hasText = targetEl && targetEl.value && targetEl.value.length > 0;
      
      if (hasText && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        return;
      }
      
      const inputs = Array.from(document.querySelectorAll('.invoice-table-input')) as HTMLElement[];
      const currentIndex = inputs.indexOf(target);
      
      if (currentIndex === -1) return;

      const rect = target.getBoundingClientRect();
      const targetCenter = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2
      };

      let bestNext: HTMLElement | null = null;
      let minDistance = Infinity;

      inputs.forEach(input => {
        if (input === target) return;
        const r = input.getBoundingClientRect();
        const c = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        let valid = false;

        if (e.key === 'ArrowDown' || e.key === 'Enter') {
          valid = c.y > targetCenter.y + 5 && Math.abs(c.x - targetCenter.x) < 50;
        } else if (e.key === 'ArrowUp') {
          valid = c.y < targetCenter.y - 5 && Math.abs(c.x - targetCenter.x) < 50;
        } else if (e.key === 'ArrowRight') {
          valid = c.x > targetCenter.x + 5 && Math.abs(c.y - targetCenter.y) < 10;
        } else if (e.key === 'ArrowLeft') {
          valid = c.x < targetCenter.x - 5 && Math.abs(c.y - targetCenter.y) < 10;
        }

        if (valid) {
          const dist = Math.sqrt(Math.pow(c.x - targetCenter.x, 2) + Math.pow(c.y - targetCenter.y, 2));
          if (dist < minDistance) {
            minDistance = dist;
            bestNext = input;
          }
        }
      });

      if (bestNext) {
        e.preventDefault();
        (bestNext as HTMLElement).focus();
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        // Fallback to simple index based if directional search fails
        let nextIndex = -1;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') nextIndex = currentIndex + 1;
        if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') nextIndex = currentIndex - 1;
        
        if (nextIndex >= 0 && nextIndex < inputs.length) {
          e.preventDefault();
          inputs[nextIndex].focus();
        }
      }
    }
  };

  useEffect(() => {
    // Auto-resize all textareas with invoice-textarea class
    const textareas = document.querySelectorAll('.invoice-textarea');
    textareas.forEach(ta => {
      const t = ta as HTMLTextAreaElement;
      t.style.height = 'auto';
      t.style.height = `${t.scrollHeight}px`;
    });
  }, [formData.rows]);

  const isEdited = (field: string, rowId?: string) => {
    const trackingData = formData.originalData || originalData;
    if (normalizeSub(formData.status || '') !== normalizeSub(NationalInvoiceSubCategory.COMPLETED) || !trackingData) return false;
    if (rowId) {
      const currentRow = (formData.rows || []).find(r => r.id === rowId);
      const originalRow = (trackingData.rows || []).find(r => r.id === rowId);
      if (!originalRow) return true;
      return JSON.stringify((currentRow as any)?.[field]) !== JSON.stringify((originalRow as any)?.[field]);
    }
    return JSON.stringify((formData as any)[field]) !== JSON.stringify((trackingData as any)[field]);
  };

  const getEditedColor = (field: string, rowId?: string) => {
    return isEdited(field, rowId) ? 'text-red-500 print:text-black' : '';
  };

  const handleCurrencyChange = (curr: 'USD' | 'EUR' | 'KRW' | 'JPY' | 'VND') => {
    const symbols = { USD: '$', EUR: '€', KRW: '₩', JPY: '¥', VND: '₫' };
    setFormData(prev => ({ ...prev, currency: curr, currencySymbol: symbols[curr] }));
  };

  const handleSave = async (status: NationalInvoiceSubCategory) => {
    const isUpdate = !!formData.id;
    const isCompleting = status === NationalInvoiceSubCategory.COMPLETED;
    const wasAlreadyCompleted = normalizeSub(formData.status || '') === normalizeSub(NationalInvoiceSubCategory.COMPLETED);
    
    const newItem: NationalInvoiceItem = {
      ...(formData as NationalInvoiceItem),
      id: isUpdate ? formData.id! : `ni-${Date.now()}`,
      status,
      authorId: currentUser.id,
      createdAt: isUpdate ? formData.createdAt! : new Date().toISOString(),
      ...(isCompleting && !wasAlreadyCompleted ? {
        completedByInitials: currentUser.initials,
        completedAt: new Date().toISOString(),
        originalData: JSON.parse(JSON.stringify(formData))
      } : {}),
      ...(isUpdate && wasAlreadyCompleted ? {
        modifiedByInitials: currentUser.initials,
        modifiedAt: new Date().toISOString()
      } : {})
    };
    
    const newItems = isUpdate 
      ? items.map(item => item.id === newItem.id ? newItem : item)
      : [newItem, ...items];
      
    saveItems(newItems, newItem);
    alert(`${status === NationalInvoiceSubCategory.TEMPORARY ? '임시저장' : '작성완료'} 되었습니다.`);
    setView({ type: 'NATIONAL_INVOICE', sub: status });
  };

  const handleDeleteDocument = (id: string) => {
    const itemToDelete = items.find(it => it.id === id);
    const isAuthor = itemToDelete && itemToDelete.status === NationalInvoiceSubCategory.TEMPORARY && (
      (itemToDelete.authorId || '').toUpperCase() === (currentUser.id || '').toUpperCase() ||
      (itemToDelete.authorId || '').toUpperCase() === (currentUser.initials || '').toUpperCase() ||
      (itemToDelete.authorId || '').toUpperCase() === (currentUser.loginId || '').toUpperCase()
    );
    if (!isMaster && !isAuthor) {
      alert('삭제 권한이 없습니다.');
      return;
    }
    const updated = items.filter(it => it.id !== id);
    saveItems(updated);
    deleteSingleDoc('nationalinvoice', id, itemToDelete);
    setDeletingId(null);
    alert('삭제되었습니다.');
  };

  const handleEntitySelect = (entity: NationalEntity) => {
    if (entity.type === 'SHIPPER') {
      let tel = '(82-2) 894-2611';
      let fax = '(82-2) 802-9941';
      
      if ((entity.name || '').includes('AJIN TRAIN VINA')) {
        tel = '070-4121-6200';
        fax = '';
      }
      
      setFormData(prev => ({ 
        ...prev, 
        shipperName: entity.name, 
        shipperAddress: entity.content, 
        plShipperAddress: entity.content,
        idCode: entity.extra || '',
        footerTel: tel,
        footerFax: fax
      }));
    } else if (entity.type === 'CONSIGNEE') {
      setFormData(prev => ({ 
        ...prev, 
        consigneeName: entity.name, 
        consigneeAddress: entity.content,
        plConsigneeAddress: entity.content,
        consigneeTaxId: entity.taxId || '',
        consigneeTel: entity.tel || '',
        consigneeAttn: entity.attn || ''
      }));
    } else if (entity.type === 'SIGNATURE') {
      setFormData(prev => ({ ...prev, signedBy: entity.name, signedTitle: entity.content, signatureName: entity.extra || '' }));
    }
  };

  const handleAddEntity = () => {
    if (!editingEntity?.name || !editingEntity?.content) return;
    const newEntity: NationalEntity = {
      id: editingEntity.id || `${editingEntity.type?.toLowerCase() || 'consignee'}-${Date.now()}`,
      type: editingEntity.type as any,
      name: editingEntity.name,
      content: editingEntity.content,
      extra: editingEntity.extra,
      taxId: editingEntity.taxId,
      tel: editingEntity.tel,
      attn: editingEntity.attn
    };
    
    const newEntities = editingEntity.id 
      ? entities.map(e => e.id === editingEntity.id ? newEntity : e)
      : [...entities, newEntity];
      
    saveEntities(newEntities);
    
    // Supabase recipients 테이블에 저장
    saveRecipient({
      id: newEntity.id,
      name: newEntity.name,
      tel: newEntity.tel,
      fax: newEntity.taxId,
      remark: `${newEntity.content}${newEntity.extra ? ` | ${newEntity.extra}` : ''}${newEntity.attn ? ` | Attn: ${newEntity.attn}` : ''}`,
      category: 'NATIONAL_ENTITY'
    });

    setEditingEntity(null);
    setIsEntityModalOpen(false);
  };

  useEffect(() => {
    if (remarksRef.current) {
      remarksRef.current.style.height = 'auto';
      remarksRef.current.style.height = `${remarksRef.current.scrollHeight}px`;
    }
  }, [formData.remarks]);

  const renderShippingMark = (row: NationalInvoiceRow, rowIdx: number, isPL: boolean = false) => {
    const valKey = isPL ? 'plPkgNo' : 'pkgNo';
    const currentVal = row[valKey] !== undefined ? row[valKey] : row.pkgNo;
    const isFirstRow = rowIdx === 0;
    
    if (isFirstRow && formData.shippingMarkType) {
      const markText = formData.shippingMarkType === 'TOMY' ? 'TOMY' : 'LEMKE';
      return (
        <div className="flex flex-col items-center py-2 justify-center h-full">
          <svg width="100" height="50" viewBox="0 0 100 50" className="drop-shadow-sm">
            <polygon points="50,2 98,25 50,48 2,25" fill="none" stroke="black" strokeWidth="2" />
            <text x="50" y="32" fontSize="16" fontWeight="900" textAnchor="middle" fill="black" style={{ fontFamily: 'Arial, sans-serif' }}>{markText}</text>
          </svg>
        </div>
      );
    }

    return (
      <div className="flex items-center min-h-[22px]">
        {isPL ? (
          <textarea 
            className={`invoice-table-input invoice-textarea text-center focus:bg-sky-100 overflow-hidden resize-none p-0 flex items-center ${getEditedColor('plPkgNo', row.id)}`} 
            style={{ fontSize: `${row.fontSize}px`, fontWeight: row.isBold ? 'bold' : 'normal' }}
            value={currentVal || ''} 
            onChange={(e) => handleRowChange(row.id, 'plPkgNo', e.target.value)}
            onKeyDown={(e) => handleKeyDown(e, row.id, 'plPkgNo')}
            onFocus={() => setSelectedRowId(row.id)}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = 'auto';
              target.style.height = `${target.scrollHeight}px`;
            }}
          />
        ) : (
          <textarea 
            className={`invoice-table-input invoice-textarea text-center font-black focus:bg-sky-100 overflow-hidden resize-none p-0 flex items-center ${getEditedColor('pkgNo', row.id)}`} 
            style={{ fontSize: `${row.fontSize}px`, fontWeight: row.isBold ? 'bold' : 'normal' }}
            value={currentVal || ''} 
            onChange={(e) => handleRowChange(row.id, 'pkgNo', e.target.value)} 
            onKeyDown={(e) => handleKeyDown(e, row.id, 'pkgNo')}
            onFocus={() => setSelectedRowId(row.id)}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = 'auto';
              target.style.height = `${target.scrollHeight}px`;
            }}
          />
        )}
      </div>
    );
  };

  const handlePrint = useCallback(() => {
    const win = window.open('', '_blank');
    if (win) {
      const getShippingMarkHtml = (type: string) => {
        const markText = type === 'TOMY' ? 'TOMY' : 'LEMKE';
        return `
          <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; margin-bottom: 5px;">
            <svg width="80" height="40" viewBox="0 0 100 50">
              <polygon points="50,2 98,25 50,48 2,25" fill="none" stroke="black" stroke-width="2" />
              <text x="50" y="32" font-size="16" font-weight="900" text-anchor="middle" fill="black" style="font-family: Arial, sans-serif;">${markText}</text>
            </svg>
          </div>
        `;
      };

      const rowsHtml = (formData.rows || []).map((row, idx) => {
        const rowStyle = `font-size: ${row.fontSize || 10.5}px; font-weight: ${row.isBold ? 'bold' : 'normal'}; min-height: ${row.fontSize ? row.fontSize * 2.5 : 25}px;`;
        const borderStyle = `none;`; 
        
        const hasMark = !!formData.shippingMarkType;
        const shouldSkipMark = hasMark && (idx === 1 || idx === 2);
        const rowSpan = (idx === 0 && hasMark) ? 'rowspan="3"' : '';
        const markHtml = (idx === 0 && hasMark) ? getShippingMarkHtml(formData.shippingMarkType) : '';
        const shippingMarkCell = !shouldSkipMark ? `<td ${rowSpan} style="${borderStyle} padding: 4px 8px; text-align: center; vertical-align: middle; white-space: pre-wrap;">${markHtml}${row.pkgNo || ''}</td>` : '';
        
        if (row.type === 'HEADER') {
          return `
            <tr style="${rowStyle}">
              ${shippingMarkCell}
              <td style="${borderStyle} padding: 4px 8px; text-decoration: underline; vertical-align: middle;">
                ${row.headerLeft || ''}
              </td>
              <td style="${borderStyle} padding: 4px 8px; vertical-align: middle;"></td>
              <td colspan="4" style="${borderStyle} padding: 4px 8px; text-align: left; text-decoration: underline; vertical-align: middle;">
                ${row.headerRight || ''}
              </td>
            </tr>
          `;
        } else if (row.type === 'TOTAL') {
          const totalBorderStyle = `border: none; border-top: 1px solid black;`;
          const amountVal = parseFloat(parseNumber(row.amount || '0'));
          const formattedAmount = amountVal !== 0 ? `${formData.currencySymbol}${formatNumber(row.amount)}` : '0.00';
          
          const procAmtSum = parseFloat(parseNumber(row.procAmount || '0'));
          const formattedProcAmt = procAmtSum !== 0 ? `${formData.currencySymbol}${formatNumber(row.procAmount)}` : '';
          
          const qtyText = row.unitBreakdown || `${formatNumber(row.quantity) || '0'} ${row.unit || 'UNIT'}`;

          return `
            <tr style="${rowStyle}">
              <td colspan="3" style="${totalBorderStyle} padding: 4px 8px; text-align: left; vertical-align: middle; font-weight: 900;">
                <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                  <span>${row.description || 'TOTAL'}</span>
                  <span style="flex-grow: 1; text-align: right; padding-right: 2px;">${qtyText}</span>
                </div>
              </td>
              <td style="${totalBorderStyle} padding: 4px 8px; vertical-align: middle;"></td>
              <td style="${totalBorderStyle} padding: 4px 8px; text-align: right; vertical-align: middle; font-weight: 900;">${formattedProcAmt}</td>
              <td style="${totalBorderStyle} padding: 4px 8px; vertical-align: middle;"></td>
              <td style="${totalBorderStyle} padding: 4px 8px; text-align: right; vertical-align: middle; font-weight: 900;">${formattedAmount}</td>
            </tr>
          `;
        }
        
        return `
          <tr style="${rowStyle}">
            ${shippingMarkCell}
            <td style="${borderStyle} padding: 4px 8px; white-space: pre-wrap; vertical-align: middle;">${row.description || ''}</td>
            <td style="${borderStyle} padding: 4px 8px; text-align: right; vertical-align: middle;">${formatNumber(row.quantity) || ''} ${row.unit || ''}</td>
            <td style="${borderStyle} padding: 4px 8px; text-align: right; vertical-align: middle;">${row.unit ? formatNumber(row.proc) : ''}</td>
            <td style="${borderStyle} padding: 4px 8px; text-align: right; vertical-align: middle;">${row.unit ? formatNumber(row.procAmount) : ''}</td>
            <td style="${borderStyle} padding: 4px 8px; text-align: right; vertical-align: middle;">${row.unit ? formatNumber(row.price) : ''}</td>
            <td style="${borderStyle} padding: 4px 8px; text-align: right; vertical-align: middle;">${row.unit ? formatNumber(row.amount) : ''}</td>
          </tr>
        `;
      }).join('');

      const packingRowsHtml = (formData.rows || []).map((row, idx) => {
        const rowStyle = `font-size: ${row.fontSize || 10.5}px; font-weight: ${row.isBold ? 'bold' : 'normal'}; min-height: ${row.fontSize ? row.fontSize * 2.5 : 25}px;`;
        const borderStyle = `none;`; 
        
        const hasMark = !!formData.shippingMarkType;
        const shouldSkipMark = hasMark && (idx === 1 || idx === 2);
        const rowSpan = (idx === 0 && hasMark) ? 'rowspan="3"' : '';
        const markHtml = (idx === 0 && hasMark) ? getShippingMarkHtml(formData.shippingMarkType) : '';
        const plPkgNo = row.plPkgNo !== undefined ? row.plPkgNo : row.pkgNo;
        const shippingMarkCell = !shouldSkipMark ? `<td ${rowSpan} style="${borderStyle} padding: 4px 1px; text-align: center; vertical-align: middle; white-space: pre-wrap;">${markHtml}${plPkgNo || ''}</td>` : '';

        if (row.type === 'HEADER') {
          return `
            <tr style="${rowStyle}">
              ${shippingMarkCell}
              <td style="${borderStyle} padding: 4px 8px; text-decoration: underline; vertical-align: middle;">
                ${row.headerLeft || ''}
              </td>
              <td style="${borderStyle} padding: 4px 8px; vertical-align: middle;"></td>
              <td colspan="4" style="${borderStyle} padding: 4px 8px; text-align: left; text-decoration: underline; vertical-align: middle;">
                ${row.headerRight || ''}
              </td>
            </tr>
          `;
        } else if (row.type === 'TOTAL') {
          const totalBorderStyle = `border: none; border-top: 1px solid black;`;
          const qtyText = row.unitBreakdown || `${formatNumber(row.quantity) || '0'} ${row.unit || 'UNIT'}`;

          return `
            <tr style="${rowStyle}">
              <td colspan="3" style="${totalBorderStyle} padding: 4px 8px; text-align: left; vertical-align: middle; font-weight: 900;">
                <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                  <span>${row.description || 'TOTAL'}</span>
                  <span style="flex-grow: 1; text-align: right; padding-right: 2px;">${qtyText}</span>
                </div>
              </td>
              <td style="${totalBorderStyle} padding: 4px 8px; text-align: right; vertical-align: middle;">${formatNumber(row.plProc) || ''}</td>
              <td style="${totalBorderStyle} padding: 4px 8px; text-align: right; vertical-align: middle;">${formatNumber(row.plProcAmount) || ''}</td>
              <td style="${totalBorderStyle} padding: 4px 8px; text-align: right; vertical-align: middle;">${formatNumber(row.plPrice) || ''}</td>
              <td style="${totalBorderStyle} padding: 4px 8px; text-align: right; vertical-align: middle;">${formatNumber(row.plAmount) || ''}</td>
            </tr>
          `;
        }
        return `
          <tr style="${rowStyle}">
            ${shippingMarkCell}
            <td style="${borderStyle} padding: 4px 8px; white-space: pre-wrap; vertical-align: middle;">${row.description || ''}</td>
            <td style="${borderStyle} padding: 4px 8px; text-align: right; vertical-align: middle;">${formatNumber(row.quantity) || ''} ${row.unit || ''}</td>
            <td style="${borderStyle} padding: 4px 8px; text-align: right; vertical-align: middle;">${formatNumber(row.plProc) || ''}</td>
            <td style="${borderStyle} padding: 4px 8px; text-align: right; vertical-align: middle;">${formatNumber(row.plProcAmount) || ''}</td>
            <td style="${borderStyle} padding: 4px 8px; text-align: right; vertical-align: middle;">${formatNumber(row.plPrice) || ''}</td>
            <td style="${borderStyle} padding: 4px 8px; text-align: right; vertical-align: middle;">${formatNumber(row.plAmount) || ''}</td>
          </tr>
        `;
      }).join('');

      const plTotalCtQty = formData.plTotalCtQty || '';
      const plTotalNetWeight = formData.plTotalNetWeight || '';
      const plTotalGrossWeight = formData.plTotalGrossWeight || '';
      const plTotalCbm = formData.plTotalCbm || '';

     win.document.write(`
  <html>
    <head>
      <title>${formData.invoiceNo || 'NoNumber'}_${formData.consigneeName || 'Client'}_INVOICE</title>
      <style>
        /* 1. 굵기 데이터(700, 900)를 명시적으로 모두 호출 */
        @import url('https://fonts.googleapis.com/css2?family=Great+Vibes&family=Inter:wght@400;700;900&family=Noto+Sans+KR:wght@400;700;900&display=swap');
        
        @page { 
          size: A4 portrait; 
          margin: 15mm 10mm; 
        }
        
        /* 2. 인쇄 보정 속성 추가 */
        body { 
          /* 굴림 대신 굵기 표현이 정확한 Noto Sans를 우선 적용 */
          font-family: 'Inter', 'Noto Sans KR', sans-serif; 
          color: black; 
          line-height: 1.2; 
          font-size: 11px; 
          margin: 0; 
          padding: 0;
          -webkit-print-color-adjust: exact; /* 인쇄 시 색상/굵기 강제 유지 */
          print-color-adjust: exact;
          -webkit-font-smoothing: antialiased;
          box-sizing: border-box;
        }

        /* 3. 각 클래스에 !important를 붙여 굵기 고정 */
        .header-title { 
          text-align: center; 
          font-size: 24px; 
          font-weight: 900 !important; 
          text-decoration: underline; 
          margin-bottom: 20px; 
          letter-spacing: 2px; 
        }

        .label { 
          font-size: 10px; 
          font-weight: 800 !important; 
          text-transform: uppercase; 
          margin-bottom: 2px; 
          display: block; 
        }

        .content-bold { 
          font-size: 16px; 
          font-weight: 900 !important; 
          text-transform: uppercase; 
          white-space: pre-wrap; 
          margin-bottom: 2px; 
        }

        .content-large { 
          font-size: 20px; 
          font-weight: 900 !important; 
          text-transform: uppercase; 
          text-align: center; 
        }

        .content-medium { 
          font-weight: 400 !important; /* 600보다 확실한 700 권장 */
          font-size: 10.5px; 
        }

        /* 테이블 헤더(TH) 굵기 강화 */
        th { 
          border: none; 
          border-bottom: none; 
          padding: 2px 8px; 
          background: transparent; 
          font-size: 10.5px; 
          font-weight: 900 !important; 
          text-align: left; 
        }

        /* 1. 상단 그리드 컨테이너 전체 설정 (전부 1px로 통일) */
.grid-container {
          display: grid;
          grid-template-columns: 1.5fr 1fr 1.5fr 1fr;
          border-top: 1px solid black !important;
          border-left: 1px solid black !important;
          border-collapse: collapse !important;
        }

        .cell {
          border: none !important;
          border-right: 1px solid black !important;
          border-bottom: 1px solid black !important;
          padding: 2px; min-height : 16px;
          vertical-align: middle !important;
        }

        .invoice-grid {
          display: grid;
          grid-template-columns: 1.5fr 1fr 1.5fr 1fr;
          border-top: 1px solid black !important;
          border-left: 1px solid black !important;
          border-collapse: collapse !important;
        }

        .invoice-cell {
          border: none !important;
          border-right: 1px solid black !important;
          border-bottom: 1px solid black !important;
          padding: 2px;
          min-height: 16px;
          vertical-align: middle !important;
        }

        table td, table th {
          vertical-align: middle !important;
        }


        .sub-label { font-size: 9px; font-weight: 700 !important; color: #000; margin-bottom: 4px; display: block; }
        .content-normal { font-weight: 400; white-space: pre-wrap; font-size: 9.5px; }
        
        table { width: 100%; border-collapse: collapse; margin-top: 10px; border: none; }
        
        .signature-box { border: 1px solid black; padding: 10px; width: 280px; }
        .signature-font { font-family: 'Brush Script Std', cursive; font-size: 12px; color: #000; }
        .footer-info { font-size: 11px; font-weight: bold; color: #000; }
        .clear { clear: both; }

        /* 자동 페이지 번호 표시를 위한 설정 */
        body {
          counter-reset: page;
        }
        .page-number::after {
          counter-increment: page;
          content: counter(page);
        }
        /* Chrome specific: counter(pages) is not always reliable in body, we'll use JS for total */
      </style>
          </head>
          <body onload="
            // Calculate Invoice Pages
            const invoice = document.getElementById('invoice-content');
            if (invoice) {
              const invoiceTotal = Math.ceil(invoice.scrollHeight / 1050); 
              invoice.querySelectorAll('.page-total').forEach(el => el.textContent = invoiceTotal);
            }
            
            // Calculate Packing List Pages
            const pl = document.getElementById('packing-list-content');
            if (pl) {
              const plTotal = Math.ceil(pl.scrollHeight / 1050); 
              pl.querySelectorAll('.page-total').forEach(el => el.textContent = plTotal);
            }
            
            window.print(); 
            window.close();
          ">
            <div id="invoice-content" style="display: flex; flex-direction: column; min-height: 260mm;">
              <div class="header-title">${formData.invoiceType} INVOICE</div>
              
              <div class="grid-container" style="display: grid; grid-template-columns: 1.5fr 1fr 1.5fr 1fr; margin-bottom: 10px;">
                <div class="cell" style="grid-column: 1 / span 2; grid-row: 1 / span 2; display: flex; flex-direction: column; position: relative;">
                  <span class="label">SHIPPER/ SELLER</span>
                  <span class="sub-label">EXPORTER, IMPORTER & MANUFACTURER</span>
                  <div class="content-bold">${formData.shipperName || ''}</div>
                  <div class="content-normal" style="width: 80%;">${formData.shipperAddress || ''}</div>
                  <div style="position: absolute; top: 6px; right: 10px; text-align: right; width: 120px;">
                    <span class="label" style="margin-bottom: 2px;">ID CODE</span>
                    <div class="content-medium">${formData.idCode || ''}</div>
                  </div>
                </div>

                <div class="cell" style="grid-column: 3; grid-row: 1;">
                  <span class="label">INVOICE NO. AND DATE</span>
                  <div class="content-medium">${formData.invoiceNo || ''} & ${formatDateToEnglish(formData.invoiceDate)}</div>
                </div>

                <div class="cell" style="grid-column: 4; grid-row: 1; display: flex; flex-direction: column; justify-content: center; align-items: center;">
                  <span class="label" style="text-align: center;">PAGE</span>
                  <div class="content-medium" style="font-weight: 900 !important;">
                    PAGE #<span class="page-number"></span> OF <span class="page-total">1</span>
                  </div>
                </div>

                <div class="cell" style="grid-column: 3; grid-row: 2;">
                  <span class="label">P/O NO. AND DATE</span>
                  <div class="content-medium" style="white-space: pre-wrap;">${formData.poNo || ''}</div>
                </div>

                <div class="cell" style="grid-column: 4; grid-row: 2;">
                  <span class="label">DATE OF FACTORY OUT</span>
                  <div class="content-medium">${formatDateToEnglish(formData.factoryOutDate)}</div>
                </div>
                            
                <div class="cell" style="grid-column: 1 / span 2; grid-row: 3 / span 3;">
                  <span class="label">CONSIGNEE</span>
                  <div class="content-bold">${formData.consigneeName || ''}</div>
                  <div class="content-normal" style="line-height: 1.2;">${formData.consigneeAddress || ''}</div>
                  <div style="margin-top: 2px; line-height: 1.1;">
                    ${formData.consigneeTaxId ? `<div class="content-normal">TAX ID: ${formData.consigneeTaxId}</div>` : ''}
                    ${formData.consigneeTel ? `<div class="content-normal">TEL: ${formData.consigneeTel}</div>` : ''}
                    ${formData.consigneeAttn ? `<div class="content-normal">ATTN: <span style="font-weight: 900;">${formData.consigneeAttn}</span></div>` : ''}
                  </div>
                </div>
                
                <div class="cell" style="grid-column: 3 / span 2;">
                  <span class="label">BUYER (IF OTHER THAN CONSIGNEE)</span>
                  <div class="content-medium" style="text-align: center; margin-top: 15px;">${formData.buyer || ''}</div>
                </div>
                
                <div class="cell" style="grid-column: 3 / span 2; grid-row: 4 / span 3;">
                  <span class="label">OTHER REFERENCE</span>
                  <div class="content-medium" style="white-space: pre-wrap; min-height: 60px;">${formData.otherRef || ''}</div>
                </div>
                
                <div class="cell" style="grid-column: 1 / span 2; grid-row: 6;">
                  <span class="label">DEPARTURE DATE</span>
                  <div class="content-medium" style="text-align: center; font-weight: 900; margin-top: 3px;">${formatDateToEnglish(formData.departureDate)}</div>
                </div>
                
                <div class="cell" style="grid-column: 1;">
                  <span class="label">VESSEL/ FLIGHT</span>
                  <div class="content-medium" style="text-align: center; margin-top: 2px;">${formData.vesselFlight || ''}</div>
                </div>
                <div class="cell" style="grid-column: 2;">
                  <span class="label">FROM</span>
                  <div class="content-medium" style="text-align: center; margin-top: 2px;">${formData.from || ''}</div>
                </div>
                
                <div class="cell" style="grid-column: 3 / span 2; grid-row: 7 / span 2;">
                  <span class="label">TERMS OF DELIVERY AND PAYMENT</span>
                  <div class="content-medium" style="text-align: center; white-space: pre-wrap; margin-top: 2px;">${formData.deliveryTerms || ''}</div>
                </div>
                
                <div class="cell" style="grid-column: 1 / span 2;">
                  <span class="label">TO</span>
                  <div class="content-medium" style="text-align: center; margin-top: 2px;">${formData.to || ''}</div>
                </div>
              </div>

              <table style="width: 100%; border-collapse: collapse; margin-top: 0; border: none;">
                <thead>
                  <tr>
                    <th style="width: 20%;">SHIPPING MARK</th>
                    <th style="width: 35%;">NO. & KINDS OF PKGS; GOODS DESCRIPTION</th>
                    <th style="width: 10%;">QUANTITY</th>
                    <th style="width: 10%;">PROC (${formData.currencySymbol})</th>
                    <th style="width: 10%;">PROC AMT (${formData.currencySymbol})</th>
                    <th style="width: 7%;">PRICE (${formData.currencySymbol})</th>
                    <th style="width: 8%;">AMOUNT (${formData.currencySymbol})</th>
                  </tr>
                </thead>
                <tbody>
                  ${rowsHtml}
                  <tr style="font-weight: 900; border-top: 1.5px solid black; font-size: 11px;">
                    <td colspan="3" style="padding: 11px 8px; text-align: left; vertical-align: middle;">
                      <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                        <span>GRAND TOTAL</span>
                        <span style="flex-grow: 1; text-align: right;">${formData.totalQuantityBreakdown || `${formatNumber(formData.totalQuantity) || ''}`}</span>
                      </div>
                    </td>
                    <td style="padding: 11px 8px;"></td>
                    <td style="padding: 11px 8px; text-align: right;">${(parseFloat(parseNumber(formData.totalProcAmount || '0')) !== 0) ? `${formData.currencySymbol}${formatNumber(formData.totalProcAmount)}` : ''}</td>
                    <td style="padding: 11px 8px;"></td>
                    <td style="padding: 11px 8px; text-align: right;">${formData.currencySymbol}${formatNumber(formData.totalAmount) || ''}</td>
                  </tr>
                </tbody>
              </table>

              ${formData.showTrackingNo !== false ? `<div style="margin-top: 15px; text-align: center; font-weight: 900; border-top: 1px solid #eee; border-bottom: 1px solid #eee; padding: 8px 0;">${formData.trackingNo || ''}</div>` : ''}
              
              ${formData.showRemarks !== false ? `<div style="margin-top: 8px; font-size: 8px; color: #000; white-space: pre-wrap;">${formData.remarks || ''}</div>` : ''}

              <div style="margin-top: auto; padding-top: 10px;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; width: 100%; border-top: 1px solid black; padding-top: 10px;">
                  <div style="font-size: 10px; font-weight: bold; line-height: 1.2; margin-top: 2px;">
                    <div>TELEPHONE NO.: ${formData.footerTel || ''}</div>
                    <div>FACIMILE NO.: ${formData.footerFax || ''}</div>
                  </div>
                  
                  <div style="border-left: 1px solid black; padding-left: 15px; width: 400px;">
                    <div style="font-weight: 900; font-size: 11px; margin-bottom: 1px;">SIGNED BY <span style="font-size: 16px;">${formData.signedBy || ''}</span></div>
                    <div style="display: flex; align-items: center; gap: 15px; margin-top: 0px;">
                      <div style="font-weight: bold; font-size: 11.5px; white-space: nowrap;">
                        ${formData.signedTitle || ''}
                      </div>
                      <span class="signature-font" style="font-size: 16px; opacity: 0.9;">${formData.signatureName || ''}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- PACKING LIST PAGE BREAK -->
            <div style="page-break-before: always;"></div>

            <div id="packing-list-content" style="display: flex; flex-direction: column; min-height: 260mm; counter-reset: page;">
              <div class="header-title">PACKING LIST</div>

              <div class="grid-container">
                <div class="cell" style="grid-column: 1 / span 2; grid-row: 1 / span 2; display: flex; flex-direction: column; position: relative;">
                  <span class="label">SHIPPER/ SELLER</span>
                  <span class="sub-label">EXPORTER, IMPORTER & MANUFACTURER</span>
                  <div class="content-bold">${formData.shipperName || ''}</div>
                  <div class="content-normal" style="width: 80%;">${formData.plShipperAddress || ''}</div>
                  <div style="position: absolute; top: 6px; right: 10px; text-align: right; width: 120px;">
                    <span class="label" style="margin-bottom: 2px;">ID CODE</span>
                    <div class="content-medium">${formData.idCode || ''}</div>
                  </div>
                </div>
                <div class="cell" style="grid-column: 3; grid-row: 1;">
                  <span class="label">PACKING LIST NO. AND DATE</span>
                  <div class="content-medium">${formData.invoiceNo || ''} & ${formatDateToEnglish(formData.invoiceDate)}</div>
                </div>
                <div class="cell" style="grid-column: 4; grid-row: 1; display: flex; flex-direction: column; justify-content: center; align-items: center;">
                  <span class="label" style="text-align: center;">PAGE</span>
                  <div class="content-medium" style="font-weight: 900 !important;">
                    PAGE #<span class="page-number"></span> OF <span class="page-total">1</span>
                  </div>
                </div>
                <div class="cell" style="grid-column: 3; grid-row: 2;">
                  <span class="label">P/O NO. AND DATE</span>
                  <div class="content-medium" style="white-space: pre-wrap;">${formData.poNo || ''}</div>
                </div>
                <div class="cell" style="grid-column: 4; grid-row: 2;">
                  <span class="label">DATE OF FACTORY OUT</span>
                  <div class="content-medium">${formatDateToEnglish(formData.factoryOutDate)}</div>
                </div>
                
                <div class="cell" style="grid-column: 1 / span 2; grid-row: 3 / span 3;">
                  <span class="label">CONSIGNEE</span>
                  <div class="content-bold">${formData.consigneeName || ''}</div>
                  <div class="content-normal" style="line-height: 1.2;">${formData.plConsigneeAddress || ''}</div>
                  <div style="margin-top: 2px; line-height: 1.1;">
                    ${formData.consigneeTaxId ? `<div class="content-normal">TAX ID: ${formData.consigneeTaxId}</div>` : ''}
                    ${formData.consigneeTel ? `<div class="content-normal">TEL: ${formData.consigneeTel}</div>` : ''}
                    ${formData.consigneeAttn ? `<div class="content-normal">ATTN: <span style="font-weight: 900;">${formData.consigneeAttn}</span></div>` : ''}
                  </div>
                </div>
                
                <div class="cell" style="grid-column: 3 / span 2;">
                  <span class="label">BUYER (IF OTHER THAN CONSIGNEE)</span>
                  <div class="content-medium" style="text-align: center; margin-top: 15px;">${formData.buyer || ''}</div>
                </div>
                
                <div class="cell" style="grid-column: 3 / span 2; grid-row: 4 / span 3;">
                  <span class="label">OTHER REFERENCE</span>
                  <div class="content-medium" style="white-space: pre-wrap; min-height: 60px;">${formData.otherRef || ''}</div>
                </div>
                
                <div class="cell" style="grid-column: 1 / span 2; grid-row: 6;">
                  <span class="label">DEPARTURE DATE</span>
                  <div class="content-medium" style="text-align: center; font-weight: 900; margin-top: 3px;">${formatDateToEnglish(formData.departureDate)}</div>
                </div>
                
                <div class="cell" style="grid-column: 1;">
                  <span class="label">VESSEL/ FLIGHT</span>
                  <div class="content-medium" style="text-align: center; margin-top: 2px;">${formData.vesselFlight || ''}</div>
                </div>
                <div class="cell" style="grid-column: 2;">
                  <span class="label">FROM</span>
                  <div class="content-medium" style="text-align: center; margin-top: 2px;">${formData.from || ''}</div>
                </div>
                
                <div class="cell" style="grid-column: 3 / span 2; grid-row: 7 / span 2;">
                  <span class="label">TERMS OF DELIVERY AND PAYMENT</span>
                  <div class="content-medium" style="text-align: center; white-space: pre-wrap; margin-top: 2px;">${formData.deliveryTerms || ''}</div>
                </div>
                
                <div class="cell" style="grid-column: 1 / span 2;">
                  <span class="label">TO</span>
                  <div class="content-medium" style="text-align: center; margin-top: 2px;">${formData.to || ''}</div>
                </div>
              </div>

              <table style="width: 100%; border-collapse: collapse;">
                <thead>
                  <tr>
                    <th style="width: 20%; font-size: 10.5px; vertical-align: middle;">SHIPPING MARK</th>
                    <th style="width: 35%; font-size: 10.5px; vertical-align: middle;">NO. & KINDS OF PKGS; GOODS DESCRIPTION</th>
                    <th style="width: 10%; font-size: 10.5px; vertical-align: middle;">QUANTITY</th>
                    <th style="width: 10%; font-size: 10.5px; vertical-align: middle;">C/T Q'TY</th>
                    <th style="width: 10%; font-size: 10.5px; vertical-align: middle;">NET WEIGHT (kg)</th>
                    <th style="width: 8%; font-size: 10.5px; vertical-align: middle;">GROSS WEIGHT (kg)</th>
                    <th style="width: 7%; font-size: 10.5px; vertical-align: middle;">CBM (M3)</th>
                  </tr>
                </thead>
                <tbody>
                  ${packingRowsHtml}
                  <tr style="font-weight: 900; border-top: 1.5px solid black; font-size: 11px;">
                    <td colspan="3" style="padding: 11px 8px; text-align: left; vertical-align: middle;">
                      <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                        <span>GRAND TOTAL</span>
                        <span style="flex-grow: 1; text-align: right;">${formData.totalQuantityBreakdown || `${formatNumber(formData.totalQuantity) || ''}`}</span>
                      </div>
                    </td>
                    <td style="padding: 11px 8px; text-align: right; vertical-align: middle;">${formatNumber(plTotalCtQty) || ''}</td>
                    <td style="padding: 11px 8px; text-align: right; vertical-align: middle;">${formatNumber(plTotalNetWeight) || ''}</td>
                    <td style="padding: 11px 8px; text-align: right; vertical-align: middle;">${formatNumber(plTotalGrossWeight) || ''}</td>
                    <td style="padding: 11px 8px; text-align: right; vertical-align: middle;">${formatNumber(plTotalCbm) || ''}</td>
                  </tr>
                </tbody>
              </table>

              ${formData.showPlExtraRemarks !== false ? `<div style="margin-top: 15px; text-align: left; font-weight: 900; border-top: 1px solid #eee; border-bottom: 1px solid #eee; padding: 8px 0; white-space: pre-wrap;">${formData.plExtraRemarks || ''}</div>` : ''}
              
              ${formData.showPlRemarks !== false ? `<div style="margin-top: 8px; font-size: 8px; color: #000; white-space: pre-wrap;">${formData.plRemarks || ''}</div>` : ''}

              <div style="margin-top: auto; padding-top: 10px;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; width: 100%; border-top: 1px solid black; padding-top: 10px;">
                  <div style="font-size: 10px; font-weight: bold; line-height: 1.2; margin-top: 2px;">
                    <div>TELEPHONE NO.: ${formData.footerTel || ''}</div>
                    <div>FACIMILE NO.: ${formData.footerFax || ''}</div>
                  </div>
                  
                  <div style="border-left: 1px solid black; padding-left: 15px; width: 400px;">
                    <div style="font-weight: 900; font-size: 11px; margin-bottom: 1px;">SIGNED BY <span style="font-size: 16px;">${formData.signedBy || ''}</span></div>
                    <div style="display: flex; align-items: center; gap: 15px; margin-top: 0px;">
                      <div style="font-weight: bold; font-size: 11.5px; white-space: nowrap;">
                        ${formData.signedTitle || ''}
                      </div>
                      <span class="signature-font" style="font-size: 16px; opacity: 0.9;">${formData.signatureName || ''}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </body>
        </html>
      `);
      win.document.close();
    }
  }, [formData, formatNumber]);

  const handleExportExcel = useCallback(async () => {
    const workbook = new ExcelJS.Workbook();
    
    const createSheet = (isPL: boolean) => {
      const sheet = workbook.addWorksheet(isPL ? "PACKING LIST" : "INVOICE");
      
      // Page setup for A4 Portrait
      sheet.pageSetup = {
        paperSize: 9, // A4
        orientation: 'portrait',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        margins: { left: 0.4, right: 0.2, top: 0.5, bottom: 0.5, header: 0, footer: 0 }
      };

      sheet.views = [{ showGridLines: false }];

      // Total width for A4 portrait: approx 75-80 units
      sheet.columns = [
        { width: 12 }, // A: SHIPPING MARK
        { width: 32 }, // B: DESCRIPTION
        { width: 12 }, // C: QUANTITY
        { width: 8 },  // D: PROC
        { width: 9 },  // E: PROC AMT
        { width: 8 },  // F: PRICE
        { width: 10 }, // G: AMOUNT
      ];

      const borderThin = {
        top: { style: 'thin' as ExcelJS.BorderStyle },
        left: { style: 'thin' as ExcelJS.BorderStyle },
        bottom: { style: 'thin' as ExcelJS.BorderStyle },
        right: { style: 'thin' as ExcelJS.BorderStyle }
      };

      const applyStyle = (cell: ExcelJS.Cell, opts: { bold?: boolean, size?: number, align?: string, border?: boolean, wrap?: boolean, topAlign?: boolean } = {}) => {
        if (opts.border !== false) cell.border = borderThin;
        cell.font = { name: 'Arial', size: opts.size || 9, bold: opts.bold || false };
        cell.alignment = { 
          vertical: opts.topAlign ? 'top' : 'middle', 
          horizontal: (opts.align || 'left') as ExcelJS.Alignment['horizontal'], 
          wrapText: opts.wrap !== false 
        };
      };

      // 1. Title
      sheet.getRow(1).height = 45;
      sheet.mergeCells('A1:G1');
      const titleCell = sheet.getCell('A1');
      titleCell.value = (isPL ? "PACKING LIST" : `${formData.invoiceType} INVOICE`).toUpperCase();
      applyStyle(titleCell, { bold: true, size: 24, align: 'center', border: false });
      titleCell.font.underline = true;

      // 2. Info Boxes
      // Row 3-8: Shipper/Invoice Area
      // Shipper Seller Box
      sheet.mergeCells('A3:D8');
      const cShipper = sheet.getCell('A3');
      const sAddr = isPL ? (formData.plShipperAddress || formData.shipperAddress || "") : (formData.shipperAddress || "");
      cShipper.value = `SHIPPER/ SELLER\nEXPORTER, IMPORTER & MANUFACTURER\n\n${(formData.shipperName || "").toUpperCase()}\n${sAddr}`;
      applyStyle(cShipper, { topAlign: true, size: 8 });

      // ID CODE
      sheet.mergeCells('E3:E4');
      const cIdCode = sheet.getCell('E3');
      cIdCode.value = `ID CODE\n${formData.idCode || ""}`;
      applyStyle(cIdCode, { topAlign: true, size: 8 });

      // Invoice No & Date
      sheet.mergeCells('F3:F4');
      const cInvNo = sheet.getCell('F3');
      const iDate = formatDateToEnglish(formData.invoiceDate);
      cInvNo.value = (isPL ? "PACKING LIST NO\n" : "INVOICE NO\n") + `${formData.invoiceNo || ""}\n${iDate}`;
      applyStyle(cInvNo, { topAlign: true, size: 8 });

      // Page
      sheet.mergeCells('G3:G4');
      const cPage = sheet.getCell('G3');
      cPage.value = "PAGE\nPAGE # 1 OF 1";
      applyStyle(cPage, { topAlign: true, align: 'center', size: 8 });

      // PO No and Date (Repeating middle section)
      sheet.mergeCells('E5:F6');
      const cPo = sheet.getCell('E5');
      cPo.value = `P/O NO. AND DATE\n${formData.poNo || ""}`;
      applyStyle(cPo, { topAlign: true, size: 8 });

      // Date of Factory Out
      sheet.mergeCells('G5:G6');
      const cFacOut = sheet.getCell('G5');
      cFacOut.value = `DATE OF FACTORY OUT\n${formatDateToEnglish(formData.factoryOutDate)}`;
      applyStyle(cFacOut, { topAlign: true, align: 'center', size: 8 });

      // Rows 9-14: Consignee Area
      sheet.mergeCells('A9:D14');
      const cConsignee = sheet.getCell('A9');
      const cAddr = isPL ? (formData.plConsigneeAddress || formData.consigneeAddress || "") : (formData.consigneeAddress || "");
      cConsignee.value = `CONSIGNEE\n\n${(formData.consigneeName || "").toUpperCase()}\n${cAddr}\nTAX ID: ${formData.consigneeTaxId || ''}\nTEL: ${formData.consigneeTel || ''}  ATTN: ${formData.consigneeAttn || ''}`;
      applyStyle(cConsignee, { topAlign: true, size: 8 });

      // Buyer area
      sheet.mergeCells('E9:G9');
      const cBuyerLabel = sheet.getCell('E9');
      cBuyerLabel.value = "BUYER (IF OTHER THAN CONSIGNEE)";
      applyStyle(cBuyerLabel, { bold: true, size: 8 });

      sheet.mergeCells('E10:G10');
      const cBuyerVal = sheet.getCell('E10');
      cBuyerVal.value = formData.buyer || "SAME AS CONSIGNEE";
      applyStyle(cBuyerVal, { align: 'center' });

      // Other Reference
      sheet.mergeCells('E11:G14');
      const cOtherRef = sheet.getCell('E11');
      cOtherRef.value = "OTHER REFERENCE\n\n" + (formData.otherRef || "");
      applyStyle(cOtherRef, { topAlign: true, size: 8 });

      // Rows 15-20: Departure Area
      sheet.mergeCells('A15:D16');
      const cDeparture = sheet.getCell('A15');
      cDeparture.value = "DEPARTURE DATE\n\n" + formatDateToEnglish(formData.departureDate);
      applyStyle(cDeparture, { topAlign: true, size: 8 });

      sheet.mergeCells('E15:G17');
      const cDelivery = sheet.getCell('E15');
      cDelivery.value = "TERMS OF DELIVERY AND PAYMENT\n\n" + (formData.deliveryTerms || "");
      applyStyle(cDelivery, { topAlign: true, align: 'center', size: 8 });

      sheet.mergeCells('A17:B18');
      const cVessel = sheet.getCell('A17');
      cVessel.value = "VESSEL/ FLIGHT\n\n" + (formData.vesselFlight || "");
      applyStyle(cVessel, { topAlign: true, size: 8 });

      sheet.mergeCells('C17:D18');
      const cFrom = sheet.getCell('C17');
      cFrom.value = "FROM\n\n" + (formData.from || "");
      applyStyle(cFrom, { topAlign: true, size: 8 });

      sheet.mergeCells('A19:G20');
      const cTo = sheet.getCell('A19');
      cTo.value = "TO\n" + (formData.to || "");
      applyStyle(cTo, { topAlign: true, size: 8 });

      // 3. Table Header
      const hRowIdx = 22;
      sheet.getRow(hRowIdx).height = 35;
      const headers = isPL 
        ? ["SHIPPING MARK", "NO. & KINDS OF PKGS; GOODS DESCRIPTION", "QUANTITY", "C/T Q'TY", "NET WEI (kg)", "GROSS WEI (kg)", "CBM (M3)"]
        : ["SHIPPING MARK", "NO. & KINDS OF PKGS; GOODS DESCRIPTION", "QUANTITY", `PROC (${formData.currencySymbol})`, `PROC AMT (${formData.currencySymbol})`, `PRICE (${formData.currencySymbol})`, `AMOUNT (${formData.currencySymbol})`];

      headers.forEach((h, i) => {
        const cell = sheet.getRow(hRowIdx).getCell(i + 1);
        cell.value = h;
        applyStyle(cell, { bold: true, size: 8, align: 'center' });
      });

      // 4. Data Rows
      let currentRowIdx = hRowIdx + 1;
      (formData.rows || []).forEach(row => {
        const r = sheet.getRow(currentRowIdx);
        r.height = 20;
        
        if (row.type === 'HEADER') {
          const pkg = isPL ? (row.plPkgNo || row.pkgNo || '') : (row.pkgNo || '');
          r.getCell(1).value = pkg;
          r.getCell(2).value = row.headerLeft || '';
          r.getCell(2).font = { bold: true, underline: true, size: 9 };
          r.getCell(7).value = row.headerRight || '';
          r.getCell(7).font = { bold: true, underline: true, size: 9 };
        } else if (row.type === 'TOTAL') {
          r.getCell(2).value = row.description || 'TOTAL';
          r.getCell(2).alignment = { horizontal: 'left', vertical: 'middle' };
          r.getCell(2).font = { bold: true, size: 9 };
          r.getCell(3).value = row.unitBreakdown || (row.unit ? `${formatNumber(row.quantity)} ${row.unit}` : '');
          r.getCell(3).alignment = { horizontal: 'right', vertical: 'middle', wrapText: true };
          
          if (isPL) {
            r.getCell(4).value = formatNumber(row.plProc);
            r.getCell(5).value = formatNumber(row.plProcAmount);
            r.getCell(6).value = formatNumber(row.plPrice);
            r.getCell(7).value = formatNumber(row.plAmount);
          } else {
            const amountVal = parseFloat(parseNumber(row.amount || '0'));
            r.getCell(5).value = formatNumber(row.procAmount);
            r.getCell(7).value = amountVal !== 0 ? `${formData.currencySymbol}${formatNumber(row.amount)}` : '0.00';
          }
          [4,5,6,7].forEach(c => r.getCell(c).alignment = { horizontal: 'right', vertical: 'middle' });
          for(let i=1; i<=7; i++) r.getCell(i).border = { top: { style: 'thin' } };
        } else {
          // Normal Item - NO vertical borders for descriptions usually in these forms
          const vList = isPL ? 
            [row.plPkgNo || '', row.description || '', `${formatNumber(row.quantity)} ${row.unit || ''}`, row.plProc, row.plProcAmount, row.plPrice, row.plAmount] :
            [row.pkgNo || '', row.description || '', row.unit ? `${formatNumber(row.quantity)} ${row.unit || ''}` : '', row.proc, row.procAmount, row.price, row.amount];
          
          vList.forEach((v, i) => {
            const cell = r.getCell(i + 1);
            cell.value = (i >= 3 && typeof v === 'number') ? formatNumber(v) : v;
            cell.font = { name: 'Arial', size: 9 };
            cell.alignment = { 
              horizontal: (i >= 2 ? 'right' : 'left'), 
              vertical: 'middle', 
              wrapText: true 
            };
            // Vertical borders only for the outer edges? 
            // In the PDF there are no middle lines.
            if (i === 0) cell.border = { left: { style: 'thin' } };
            if (i === 6) cell.border = { right: { style: 'thin' } };
          });
        }
        currentRowIdx++;
      });

      // 5. Grand Total
      currentRowIdx++;
      const gtRow = sheet.getRow(currentRowIdx);
      gtRow.height = 30;
      gtRow.getCell(2).value = "GRAND TOTAL";
      applyStyle(gtRow.getCell(2), { bold: true, size: 10, align: 'left', border: false });
      
      gtRow.getCell(3).value = formData.totalQuantityBreakdown || formatNumber(formData.totalQuantity);
      gtRow.getCell(3).alignment = { horizontal: 'right', vertical: 'middle', wrapText: true };
      gtRow.getCell(3).font = { bold: true };
      
      if (isPL) {
        [4,5,6,7].forEach((cNum, i) => {
          const val = [formData.plTotalCtQty, formData.plTotalNetWeight, formData.plTotalGrossWeight, formData.plTotalCbm][i];
          gtRow.getCell(cNum).value = formatNumber(val);
          applyStyle(gtRow.getCell(cNum), { bold: true, align: 'right', border: false });
        });
      } else {
        gtRow.getCell(5).value = formatNumber(formData.totalProcAmount);
        applyStyle(gtRow.getCell(5), { bold: true, align: 'right', border: false });
        gtRow.getCell(7).value = `${formData.currencySymbol}${formatNumber(formData.totalAmount)}`;
        applyStyle(gtRow.getCell(7), { bold: true, align: 'right', border: false });
      }
      // Top line for total
      for(let i=1; i<=7; i++) gtRow.getCell(i).border = { top: { style: 'thin' } };
      
      // 6. Footer
      currentRowIdx += 5;
      sheet.mergeCells(`A${currentRowIdx}:G${currentRowIdx}`);
      sheet.getCell(`A${currentRowIdx}`).border = { top: { style: 'medium' } };

      currentRowIdx++;
      sheet.getRow(currentRowIdx).height = 20;
      sheet.getCell(`A${currentRowIdx}`).value = "TELEPHONE NO.: " + (formData.footerTel || '');
      applyStyle(sheet.getCell(`A${currentRowIdx}`), { size: 8, border: false });

      sheet.mergeCells(`E${currentRowIdx}:G${currentRowIdx}`);
      const sig1 = sheet.getCell(`E${currentRowIdx}`);
      sig1.value = "SIGNED BY " + (formData.signedBy || '').toUpperCase();
      applyStyle(sig1, { bold: true, size: 11, align: 'center', border: false });
      sig1.border = { left: { style: 'thin' } };

      currentRowIdx++;
      sheet.getCell(`A${currentRowIdx}`).value = "FACIMILE NO.: " + (formData.footer_fax || formData.footerFax || '');
      applyStyle(sheet.getCell(`A${currentRowIdx}`), { size: 8, border: false });

      sheet.mergeCells(`E${currentRowIdx}:G${currentRowIdx}`);
      const sig2 = sheet.getCell(`E${currentRowIdx}`);
      sig2.value = (formData.signedTitle || '') + "  " + (formData.signatureName || '');
      applyStyle(sig2, { size: 9, align: 'center', border: false });
      sig2.border = { left: { style: 'thin' } };
    };

    createSheet(false);
    createSheet(true);

    const buffer = await workbook.xlsx.writeBuffer();
    saveAs(new Blob([buffer]), `${formData.invoiceNo || 'INV'}_${formData.consigneeName || 'EXPORT'}.xlsx`);
  }, [formData, formatNumber]);

  const renderListView = () => {
    const filtered = items.filter(item => {
      if (normalizeSub(item.status || '') !== normalizeSub(sub)) return false;
      if (!searchTerm) return true;
      
      const term = searchTerm.toLowerCase();
      const matchConsignee = (item.consigneeName || '').toLowerCase().includes(term);
      const matchInvoiceNo = (item.invoiceNo || '').toLowerCase().includes(term);
      const matchItems = (item.rows || []).some(row => (row.description || '').toLowerCase().includes(term));
      
      return matchConsignee || matchInvoiceNo || matchItems;
    }).sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return dateB - dateA;
    });

    const totalPages = Math.ceil(filtered.length / itemsPerPage);
    const paginatedItems = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    return (
      <div className="space-y-6 text-left pb-12">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
          <div>
            <h2 className="text-3xl font-black text-slate-900">{NATIONAL_INVOICE_LABELS[sub] || sub}</h2>
            <div className="flex items-center gap-4 mt-2">
              <p className="text-slate-500 text-sm">총 {filtered.length}건</p>
              <div className="h-4 w-[1px] bg-slate-300"></div>
              <div className="flex bg-slate-200 p-1 rounded-lg">
                <button 
                  onClick={() => setViewMode('ICON')}
                  className={`px-3 py-1 rounded-md text-[10px] font-bold transition-all ${viewMode === 'ICON' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  아이콘
                </button>
                <button 
                  onClick={() => setViewMode('LIST')}
                  className={`px-3 py-1 rounded-md text-[10px] font-bold transition-all ${viewMode === 'LIST' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  리스트
                </button>
              </div>
            </div>
          </div>
          
          <div className="relative w-full md:max-w-sm">
            <input 
              type="text" 
              placeholder="PARTS OR CONSIGNEE SEARCH..." 
              className="w-full px-4 py-2.5 rounded-2xl border focus:ring-2 focus:ring-blue-500 outline-none text-sm font-medium bg-white shadow-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="bg-white p-12 rounded-3xl border border-slate-200 text-center">
            <p className="text-slate-400 font-medium">데이터가 없습니다.</p>
          </div>
        ) : viewMode === 'ICON' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {paginatedItems.map(item => (
              <div key={item.id} className="relative group">
                <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all cursor-pointer group relative overflow-hidden h-full" onClick={() => {
                  setView({ type: 'NATIONAL_INVOICE', sub: NationalInvoiceSubCategory.CREATE, editId: item.id });
                }}>
                  <div className="absolute top-0 right-0 w-24 h-24 bg-blue-50/50 rounded-full -mr-12 -mt-12 transition-transform group-hover:scale-150" />
                  
                  <div className="relative">
                    <div className="flex justify-between items-start mb-6">
                      <div className="flex flex-col">
                        <span className="text-[10px] font-black text-blue-600 bg-blue-50 px-2.5 py-1 rounded-lg uppercase tracking-widest w-fit mb-1">{item.invoiceNo || 'NO-NUMBER'}</span>
                        <span className="text-[10px] font-bold text-slate-400 ml-1">{new Date(item.createdAt).toLocaleDateString()}</span>
                      </div>
                      <div className="w-10 h-10 bg-slate-50 rounded-2xl flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </div>
                    </div>

                    <h3 className="text-lg font-black text-slate-900 mb-2 truncate group-hover:text-blue-600 transition-colors">{item.consigneeName}</h3>
                    <p className="text-xs font-bold text-slate-500 mb-6 line-clamp-2 leading-relaxed h-8">{item.shipperName}</p>
                    
                    <div className="flex justify-between items-end pt-5 border-t border-slate-100">
                      <div className="flex flex-col">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-tighter mb-0.5">Total Amount</span>
                        <span className="text-xl font-black text-slate-900 tracking-tight">{item.currencySymbol}{formatNumber(item.totalAmount)}</span>
                      </div>
                      <div className="flex flex-col items-end">
                        <div className="flex items-center gap-1.5 mb-1">
                          <div className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center border border-slate-200">
                            <span className="text-[8px] font-black text-slate-500">{item.authorId.slice(0, 2)}</span>
                          </div>
                          <span className="text-[10px] font-black text-slate-600 uppercase">{item.authorId}</span>
                        </div>
                        {item.completedByInitials && (
                          <div className="flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            <span className="text-[9px] font-black text-emerald-600 uppercase tracking-tighter">
                              {item.completedByInitials} {item.modifiedByInitials ? '(MOD)' : '(DONE)'}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                {(isMaster || (item.status === NationalInvoiceSubCategory.TEMPORARY && (
                  (item.authorId || '').toUpperCase() === (currentUser.id || '').toUpperCase() ||
                  (item.authorId || '').toUpperCase() === (currentUser.initials || '').toUpperCase() ||
                  (item.authorId || '').toUpperCase() === (currentUser.loginId || '').toUpperCase()
                ))) && (
                  <button 
                    onClick={(e) => { e.stopPropagation(); setDeletingId(item.id); }} 
                    className="absolute -top-2 -right-2 bg-red-600 text-white w-8 h-8 rounded-full shadow-lg hover:bg-red-700 flex items-center justify-center z-10"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-[2rem] border border-slate-200 overflow-hidden shadow-sm overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-100">
                  <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">날짜</th>
                  <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Invoice No</th>
                  <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Consignee</th>
                  <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">금액</th>
                  <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">상태 / 관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {paginatedItems.map(item => (
                  <tr 
                    key={item.id} 
                    className="hover:bg-blue-50/30 cursor-pointer transition-all group"
                    onClick={() => {
                      setView({ type: 'NATIONAL_INVOICE', sub: NationalInvoiceSubCategory.CREATE, editId: item.id });
                    }}
                  >
                    <td className="px-8 py-5">
                      <span className="text-xs font-bold text-slate-500 font-mono">{new Date(item.createdAt).toLocaleDateString()}</span>
                    </td>
                    <td className="px-8 py-5">
                      <span className="text-[10px] font-black text-blue-600 bg-blue-50 px-2.5 py-1 rounded-lg uppercase tracking-widest">{item.invoiceNo || 'NO-NUMBER'}</span>
                    </td>
                    <td className="px-8 py-5">
                      <div className="font-black text-slate-900 group-hover:text-blue-600 transition-colors">{item.consigneeName}</div>
                      <div className="text-[10px] font-bold text-slate-400 truncate max-w-[250px] mt-0.5">{item.shipperName}</div>
                    </td>
                    <td className="px-8 py-5">
                      <span className="text-sm font-black text-slate-900 tracking-tight">{item.currencySymbol}{formatNumber(item.totalAmount)}</span>
                    </td>
                    <td className="px-8 py-5 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <div className="flex flex-col items-end">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-black text-slate-600 uppercase tracking-tighter">{item.authorId}</span>
                            <div className="w-6 h-6 rounded-lg bg-slate-100 flex items-center justify-center border border-slate-200 group-hover:border-blue-200 transition-colors">
                              <span className="text-[9px] font-black text-slate-500">{item.authorId.slice(0, 2)}</span>
                            </div>
                          </div>
                          {item.completedByInitials && (
                            <div className="flex items-center gap-1 mt-1">
                              <span className="text-[9px] font-black text-emerald-600 uppercase tracking-tighter">
                                {item.completedByInitials} {item.modifiedByInitials ? '(수정완료)' : '(작성완료)'}
                              </span>
                              <span className="w-1 h-1 rounded-full bg-emerald-400" />
                            </div>
                          )}
                        </div>
                        {(isMaster || (item.status === NationalInvoiceSubCategory.TEMPORARY && (
                          (item.authorId || '').toUpperCase() === (currentUser.id || '').toUpperCase() ||
                          (item.authorId || '').toUpperCase() === (currentUser.initials || '').toUpperCase() ||
                          (item.authorId || '').toUpperCase() === (currentUser.loginId || '').toUpperCase()
                        ))) && (
                          <button 
                            onClick={(e) => { e.stopPropagation(); setDeletingId(item.id); }} 
                            className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
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
                <button key={num} onClick={() => setCurrentPage(num)} className={`w-10 h-10 rounded-xl font-black text-sm transition-all ${currentPage === num ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' : 'bg-white border border-slate-200 text-slate-400 hover:bg-slate-50'}`}>{num}</button>
              ))}
            </div>
            <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="w-10 h-10 flex items-center justify-center bg-white border border-slate-200 rounded-xl disabled:opacity-30 hover:bg-slate-50 transition-all shadow-sm">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7"/></svg>
            </button>
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

  if (sub !== NationalInvoiceSubCategory.CREATE) return renderListView();

  return (
    <div className="max-w-[1600px] mx-auto space-y-8 pb-20 animate-in fade-in duration-500 px-4 font-sans">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Great+Vibes&display=swap');
        .signature-font { font-family: 'Brush Script Std', cursive; }
        .invoice-grid { display: grid; grid-template-columns: 1.5fr 1fr 1.5fr 1fr; border: 1px solid #000; }
        .invoice-cell { border: 1px solid #000; padding: 10px; font-size: 13px; }
        .invoice-label { font-size: 11px; font-weight: 900; text-transform: uppercase; margin-bottom: 6px; display: block; }
        .invoice-input { width: 100%; border: none; outline: none; background: transparent; font-weight: 700; font-size: 13px; }
        .invoice-input-bold { width: 100%; border: none; outline: none; background: transparent; font-size: 22px; font-weight: 900; text-transform: uppercase; }
        .invoice-input-large { width: 100%; border: none; outline: none; background: transparent; font-size: 28px; font-weight: 900; text-align: center; }
        .invoice-textarea { width: 100%; border: none; outline: none; background: transparent; font-weight: 400; resize: none; min-height: 40px; font-size: 13px; }
        .invoice-textarea-bold { width: 100%; border: none; outline: none; background: transparent; font-size: 22px; font-weight: 900; text-transform: uppercase; resize: none; min-height: 80px; }
        .invoice-table-input { font-size: 13px !important; }
      `}</style>

      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 no-print mb-4">
        <div className="flex flex-wrap items-center gap-4">
          <button 
            onClick={() => setView({ type: 'NATIONAL_INVOICE', sub: normalizeSub(formData.status || NationalInvoiceSubCategory.TEMPORARY) as NationalInvoiceSubCategory })}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl font-bold text-sm hover:bg-slate-50 transition-all shadow-sm"
          >
            ← 닫기
          </button>
          <div className="flex items-center gap-3">
            <select 
              className="text-2xl md:text-4xl font-black text-slate-900 tracking-tighter bg-transparent border-none outline-none cursor-pointer hover:text-blue-600 transition-colors"
              value={formData.invoiceType || 'COMMERCIAL'}
              onChange={(e) => setFormData(prev => ({ ...prev, invoiceType: e.target.value as any }))}
            >
              <option value="SAMPLE">SAMPLE</option>
              <option value="COMMERCIAL">COMMERCIAL</option>
            </select>
            <h1 className="text-2xl md:text-4xl font-black text-slate-900 tracking-tighter">INVOICE</h1>
          </div>

          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl no-print">
            {(['USD', 'EUR', 'KRW', 'JPY', 'VND'] as const).map(c => (
              <button 
                key={c}
                onClick={() => handleCurrencyChange(c)}
                className={`px-2.5 py-1 rounded-lg text-[9px] md:text-[10px] font-black transition-all ${formData.currency === c ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 w-full lg:w-auto">
          <button 
            onClick={handleUndo} 
            disabled={historyIndex <= 0}
            className={`px-3 py-1.5 bg-white border border-slate-200 text-slate-700 rounded-xl font-bold text-xs md:text-sm transition-colors flex items-center gap-1.5 ${historyIndex <= 0 ? 'opacity-30 cursor-not-allowed' : 'hover:bg-slate-50'}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
            되돌리기 (Undo)
          </button>
          <button onClick={handlePrint} className="px-3 py-1.5 bg-white border border-slate-200 text-slate-700 rounded-xl font-bold text-xs md:text-sm hover:bg-slate-50 transition-colors flex items-center gap-1.5">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
            인쇄 / PDF
          </button>
          <button onClick={handleExportExcel} className="px-3 py-1.5 bg-white border border-slate-200 text-emerald-700 rounded-xl font-bold text-xs md:text-sm hover:bg-slate-50 transition-colors flex items-center gap-1.5">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            엑셀 내보내기
          </button>
          <button onClick={() => { setEditingEntity({ type: 'SHIPPER' }); setIsEntityModalOpen(true); }} className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded-xl font-bold text-xs md:text-sm hover:bg-slate-200 transition-colors">보관함 관리</button>
          {normalizeSub(formData.status || '') !== normalizeSub(NationalInvoiceSubCategory.COMPLETED) && (
            <button onClick={() => handleSave(NationalInvoiceSubCategory.TEMPORARY)} className="px-3 py-1.5 bg-amber-500 text-white rounded-xl font-bold text-xs md:text-sm shadow-lg shadow-amber-500/20">임시저장</button>
          )}
          <button onClick={() => handleSave(NationalInvoiceSubCategory.COMPLETED)} className="px-5 py-1.5 bg-blue-600 text-white rounded-xl font-bold text-xs md:text-sm shadow-lg shadow-blue-500/20">작성완료</button>
        </div>
      </div>

      <div className="bg-white shadow-2xl rounded-sm border border-slate-200 p-3 md:p-8 lg:p-12 flex flex-col space-y-12 min-h-[2500px] overflow-x-auto">
        <div className="min-w-[1020px] xl:min-w-0 w-full flex flex-col space-y-12">
          <div className="national-invoice-print flex flex-col min-h-[1123px]">
          <div className="text-center mb-8">
            <h2 className="text-5xl font-black underline tracking-widest">{formData.invoiceType} INVOICE</h2>
          </div>

          <div className="invoice-grid">
          {/* Row 1 & 2 Left: Shipper + ID CODE 병합 영역 */}
<div className="invoice-cell relative" style={{ gridColumn: '1 / span 2', gridRow: '1 / span 2', minHeight: '150px' }}>
  <div className="flex justify-between items-start">
    <div className="w-full">
      <label className="invoice-label">SHIPPER/ SELLER</label>
      <span className="text-[8px] font-bold text-slate-400 uppercase block mb-1">EXPORTER, IMPORTER & MANUFACTURER</span>
      
      {/* 회사명 입력 */}
      <input 
        className={`invoice-input-bold w-full ${getEditedColor('shipperName')}`}
        value={formData.shipperName || ''} 
        onChange={(e) => setFormData(prev => ({ ...prev, shipperName: e.target.value }))}
        placeholder="COMPANY NAME"
      />
      
      {/* 주소 입력 (병합되어 이제 가로로 더 넓게 쓸 수 있습니다) */}
      <textarea 
        className={`invoice-textarea w-full ${getEditedColor('shipperAddress')}`}
        style={{ height: '80px' }}
        value={formData.shipperAddress || ''} 
        onChange={(e) => setFormData(prev => ({ ...prev, shipperAddress: e.target.value }))}
        placeholder="ADDRESS & CONTACT"
      />
    </div>

    {/* 보관함 선택 버튼 (기존 위치 유지) */}
    <select 
      className="text-[9px] bg-slate-50 border border-slate-200 rounded px-1 no-print absolute left-[120px] top-[6px]"
      value=""
      onChange={(e) => {
        const ent = entities.find(ent => ent.id === e.target.value);
        if (ent) handleEntitySelect(ent);
      }}
    >
      <option value="">보관함에서 선택</option>
      {entities.filter(e => e.type === 'SHIPPER').map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
    </select>
  </div>

  {/* [수정] ID CODE를 우측 상단에 절대 위치(absolute)로 배치 */}
  <div className="absolute top-[8px] right-[10px] text-right" style={{ width: '120px', borderLeft: '0.5px solid #e2e8f0', paddingLeft: '10px' }}>
    <label className="invoice-label !mb-0">ID CODE</label>
    <input 
      className={`invoice-input text-right !bg-transparent font-bold ${getEditedColor('idCode')}`}
      value={formData.idCode || ''} 
      onChange={(e) => setFormData(prev => ({ ...prev, idCode: e.target.value }))} 
    />
  </div>
</div>

{/* [삭제] 기존에 따로 있던 ID CODE div는 삭제하세요 */}

{/* Row 1 Right: INVOICE NO (그리드 번호 3번으로 고정) */}
<div className="invoice-cell" style={{ gridColumn: '3' }}>
  <label className="invoice-label">INVOICE NO. AND DATE</label>
  <div className="flex gap-1">
    <input className={`invoice-input ${getEditedColor('invoiceNo')}`} value={formData.invoiceNo || ''} onChange={(e) => setFormData(prev => ({ ...prev, invoiceNo: e.target.value }))} placeholder="AJI-2001004" />
    <div className="flex flex-col items-end">
      <input type="date" className={`invoice-input text-[10px] ${getEditedColor('invoiceDate')}`} value={formData.invoiceDate || ''} onChange={(e) => setFormData(prev => ({ ...prev, invoiceDate: e.target.value }))} />
      <span className="text-[9px] text-blue-500 font-bold">{formatDateToEnglish(formData.invoiceDate || '')}</span>
    </div>
  </div>
</div>

{/* Row 1 Far Right: PAGE (그리드 번호 4번으로 고정) */}
<div className="invoice-cell" style={{ gridColumn: '4', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
  <label className="invoice-label text-center">PAGE</label>
  <div className="text-[10px] font-black text-center text-blue-600 bg-blue-50 py-1 rounded">자동 (출력 시 반영)</div>
</div>

{/* Row 2 Middle: P/O NO (INVOICE NO 아래인 3번 위치로 이동) */}
<div className="invoice-cell" style={{ gridColumn: '3', gridRow: '2' }}>
  <label className="invoice-label">P/O NO. AND DATE</label>
  <textarea 
    className={`invoice-textarea w-full overflow-hidden resize-none ${getEditedColor('poNo')}`} 
    value={formData.poNo || ''} 
    onChange={(e) => setFormData(prev => ({ ...prev, poNo: e.target.value }))}
    onInput={(e) => {
      const target = e.target as HTMLTextAreaElement;
      target.style.height = 'auto';
      target.style.height = `${target.scrollHeight}px`;
    }}
  />
</div>

{/* Row 2 Right: FACTORY OUT (PAGE 아래인 4번 위치로 고정) */}
<div className="invoice-cell" style={{ gridColumn: '4', gridRow: '2' }}>
  <label className="invoice-label text-center">DATE OF FACTORY OUT</label>
  <div className="flex flex-col items-center">
    <input type="date" className={`invoice-input-medium text-lg ${getEditedColor('factoryOutDate')}`} value={formData.factoryOutDate || ''} onChange={(e) => setFormData(prev => ({ ...prev, factoryOutDate: e.target.value }))} />
    <span className="text-[10px] text-blue-500 font-bold">{formatDateToEnglish(formData.factoryOutDate || '')}</span>
  </div>
</div>

            {/* Row 3-5 Left: Consignee */}
            <div className="invoice-cell" style={{ gridColumn: '1 / span 2', gridRow: '3 / span 3' }}>
              <div className="flex justify-between items-start">
                <label className="invoice-label">CONSIGNEE</label>
                <select 
                  className="text-[9px] bg-slate-50 border border-slate-200 rounded px-1 no-print"
                  value=""
                  onChange={(e) => {
                    const ent = entities.find(ent => ent.id === e.target.value);
                    if (ent) handleEntitySelect(ent);
                  }}
                >
                  <option value="">보관함에서 선택</option>
                  {entities.filter(e => e.type === 'CONSIGNEE').map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>
              <input 
                className={`invoice-input-bold ${getEditedColor('consigneeName')}`} 
                value={formData.consigneeName || ''} 
                onChange={(e) => setFormData(prev => ({ ...prev, consigneeName: e.target.value }))}
                placeholder="COMPANY NAME"
              />
              <textarea className={`invoice-textarea ${getEditedColor('consigneeAddress')}`} value={formData.consigneeAddress || ''} onChange={(e) => setFormData(prev => ({ ...prev, consigneeAddress: e.target.value }))} placeholder="ADDRESS & CONTACT" />
              <div className="mt-1 space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-black text-slate-400 w-12">TAX ID:</span>
                  <input className={`invoice-input font-bold ${getEditedColor('consigneeTaxId')}`} value={formData.consigneeTaxId || ''} onChange={(e) => setFormData(prev => ({ ...prev, consigneeTaxId: e.target.value }))} placeholder="TAX ID" />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-black text-slate-400 w-12">TEL:</span>
                  <input className={`invoice-input font-bold ${getEditedColor('consigneeTel')}`} value={formData.consigneeTel || ''} onChange={(e) => setFormData(prev => ({ ...prev, consigneeTel: e.target.value }))} placeholder="TEL" />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-black text-slate-400 w-12">ATTN:</span>
                  <input className={`invoice-input font-black ${getEditedColor('consigneeAttn')}`} value={formData.consigneeAttn || ''} onChange={(e) => setFormData(prev => ({ ...prev, consigneeAttn: e.target.value }))} placeholder="ATTN" />
                </div>
              </div>
            </div>

            {/* Row 3 Right: Buyer */}
            <div className="invoice-cell" style={{ gridColumn: '3 / span 2' }}>
              <label className="invoice-label">BUYER (IF OTHER THAN CONSIGNEE)</label>
              <textarea className={`invoice-textarea min-h-[30px] text-center ${getEditedColor('buyer')}`} value={formData.buyer || ''} onChange={(e) => setFormData(prev => ({ ...prev, buyer: e.target.value }))} />
            </div>

            {/* Row 4-6 Right: Other Reference */}
            <div className="invoice-cell" style={{ gridColumn: '3 / span 2', gridRow: '4 / span 3' }}>
              <label className="invoice-label">OTHER REFERENCE</label>
              <textarea 
                className={`invoice-textarea w-full overflow-hidden resize-none min-h-[80px] ${getEditedColor('otherRef')}`} 
                value={formData.otherRef || ''} 
                onChange={(e) => setFormData(prev => ({ ...prev, otherRef: e.target.value }))}
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement;
                  target.style.height = 'auto';
                  target.style.height = `${target.scrollHeight}px`;
                }}
              />
            </div>

            {/* Row 6 Left: Departure Date */}
            <div className="invoice-cell" style={{ gridColumn: '1 / span 2', gridRow: '6' }}>
              <label className="invoice-label">DEPARTURE DATE</label>
              <div className="flex flex-col items-center">
                <input type="date" className={`invoice-input text-center font-black text-lg ${getEditedColor('departureDate')}`} value={formData.departureDate || ''} onChange={(e) => setFormData(prev => ({ ...prev, departureDate: e.target.value }))} />
                <span className="text-[10px] text-blue-500 font-bold">{formatDateToEnglish(formData.departureDate || '')}</span>
              </div>
            </div>

            <div className="invoice-cell" style={{ gridColumn: '1' }}>
              <div className="flex justify-between items-center mb-1">
                <label className="invoice-label mb-0">VESSEL/FLIGHT</label>
                <select className="text-[8px] bg-slate-50 border border-slate-200 rounded px-1 no-print" value={formData.vesselFlight || ''} onChange={(e) => setFormData(prev => ({ ...prev, vesselFlight: e.target.value }))}>
                  <option value="">선택</option>
                  <option value="FEDEX">FEDEX</option>
                  <option value="DHL">DHL</option>
                  <option value="UPS">UPS</option>
                  <option value="BY SEA">BY SEA</option>
                  <option value="BY AIR">BY AIR</option>
                </select>
              </div>
              <input className={`invoice-input text-center ${getEditedColor('vesselFlight')}`} value={formData.vesselFlight || ''} onChange={(e) => setFormData(prev => ({ ...prev, vesselFlight: e.target.value }))} placeholder="FEDEX" />
            </div>
            <div className="invoice-cell" style={{ gridColumn: '2' }}>
              <div className="flex justify-between items-center mb-1">
                <label className="invoice-label mb-0">FROM</label>
                <select className="text-[8px] bg-slate-50 border border-slate-200 rounded px-1 no-print" value={formData.from || ''} onChange={(e) => setFormData(prev => ({ ...prev, from: e.target.value }))}>
                  <option value="">선택</option>
                  <option value="SEOUL, KOREA">SEOUL, KOREA</option>
                  <option value="HANOI, VIETNAM">HANOI, VIETNAM</option>
                  <option value="VINH PHUC, VIETNAM">VINH PHUC, VIETNAM</option>
                  <option value="BORYEONG, KOREA">BORYEONG, KOREA</option>
                </select>
              </div>
              <input className={`invoice-input text-center ${getEditedColor('from')}`} value={formData.from || ''} onChange={(e) => setFormData(prev => ({ ...prev, from: e.target.value }))} />
            </div>

            {/* Row 7-8 Right: Terms */}
            <div className="invoice-cell" style={{ gridColumn: '3 / span 2', gridRow: '7 / span 2' }}>
              <div className="flex justify-between items-center mb-1">
                <label className="invoice-label mb-0">TERMS OF DELIVERY AND PAYMENT</label>
                <select 
                  className="text-[8px] bg-slate-50 border border-slate-200 rounded px-1 no-print max-w-[120px]" 
                  value="" 
                  onChange={(e) => setFormData(prev => ({ ...prev, deliveryTerms: e.target.value }))}
                >
                  <option value="">옵션 선택</option>
                  <option value={"PROCESSING TOY TRAIN PARTS\nCIF HANOI & NO COMMERCIAL VALUE"}>1. PROCESSING TOY TRAIN PARTS (CIF HANOI...)</option>
                  <option value={"EX. FACTORY & T/T BASE\nWITHIN 2 WEEKS AFTER RECEIT OF B/L DATE"}>2. EX. FACTORY & T/T BASE (WITHIN 2 WEEKS...)</option>
                  <option value="EX. FACTORY & T/T BASE">3. EX. FACTORY & T/T BASE</option>
                  <option value={"TOY TRAIN SAMPLE\nNO COMMERCIAL VALUE"}>4. TOY TRAIN SAMPLE (NO COMMERCIAL...)</option>
                </select>
              </div>
              <textarea 
                className={`invoice-textarea w-full text-center whitespace-pre-wrap ${getEditedColor('deliveryTerms')}`} 
                value={formData.deliveryTerms || ''} 
                onChange={(e) => setFormData(prev => ({ ...prev, deliveryTerms: e.target.value }))} 
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement;
                  target.style.height = 'auto';
                  target.style.height = `${target.scrollHeight}px`;
                }}
              />
            </div>

            {/* Row 8 Left: To */}
            <div className="invoice-cell" style={{ gridColumn: '1 / span 2' }}>
              <div className="flex justify-between items-center mb-1">
                <label className="invoice-label mb-0">TO</label>
                <select className="text-[8px] bg-slate-50 border border-slate-200 rounded px-1 no-print" value={formData.to || ''} onChange={(e) => setFormData(prev => ({ ...prev, to: e.target.value }))}>
                  <option value="">선택</option>
                  <option value="TOKYO, JAPAN">TOKYO, JAPAN</option>
                  <option value="OSAKA, JAPAN">OSAKA, JAPAN</option>
                  <option value="SEOUL, KOREA">SEOUL, KOREA</option>
                  <option value="HANOI, VIETNAM">HANOI, VIETNAM</option>
                  <option value="VINH PHUC, VIETNAM">VINH PHUC, VIETNAM</option>
                  <option value="SCHLLABRUCH 34A, GERMANY">SCHLLABRUCH 34A, GERMANY</option>
                  <option value="TSURUGASHIMA-SHI, SAITAMA, JAPAN">TSURUGASHIMA-SHI, JAPAN</option>
                </select>
              </div>
              <input className={`invoice-input text-center ${getEditedColor('to')}`} value={formData.to || ''} onChange={(e) => setFormData(prev => ({ ...prev, to: e.target.value }))} />
            </div>
          </div>

          <table className="w-full border-collapse border border-black mt-4 font-['Gulim',_sans-serif]">
            <thead>
              <tr className="bg-slate-50">
                <th className="border border-black p-1 text-[10.5px] font-black w-32 relative group/mark">
                  <div className="flex flex-col items-center gap-1">
                    <span>SHIPPING MARK</span>
                    <select 
                      className="text-[8px] bg-white border border-slate-200 rounded px-1 no-print font-normal w-[90%]"
                      value={formData.shippingMarkType || ''}
                      onChange={(e) => {
                        const newType = e.target.value;
                        setFormData(prev => {
                          const newRows = [...(prev.rows || [])];
                          if (newType && newRows[0]?.pkgNo === 'ADDRESS') {
                            newRows[0] = { ...newRows[0], pkgNo: '' };
                          }
                          return { ...prev, shippingMarkType: newType, rows: newRows };
                        });
                      }}
                    >
                      <option value="">옵션 선택</option>
                      <option value="TOMY">1. TOMY 마크</option>
                      <option value="LEMKE">2. LEMKE 마크</option>
                    </select>
                  </div>
                </th>
                <th className="border border-black p-2 text-[10.5px] font-black">NO. & KINDS OF PKGS; GOODS DESCRIPTION</th>
                <th className="border border-black p-2 text-[10.5px] font-black w-32">QUANTITY</th>
                <th className="border border-black p-2 text-[10.5px] font-black w-20">PROC ({formData.currencySymbol})</th>
                <th className="border border-black p-2 text-[10.5px] font-black w-20">PROC AMT ({formData.currencySymbol})</th>
                <th className="border border-black p-2 text-[10.5px] font-black w-20">PRICE ({formData.currencySymbol})</th>
                <th className="border border-black p-2 text-[10.5px] font-black w-24">AMOUNT ({formData.currencySymbol})</th>
              </tr>
            </thead>
            <tbody>
              {(formData.rows || []).map((row, idx) => {
                const isFirstRow = idx === 0;
                const hasMark = !!formData.shippingMarkType;
                const shouldSkipMark = hasMark && (idx === 1 || idx === 2);
                
                return (
                  <tr key={row.id} className={`group/row ${selectedRowId === row.id ? 'bg-sky-50/30' : ''}`}>
                    {row.type === 'HEADER' ? (
                      <>
                        {!shouldSkipMark && (
                          <td 
                            className="border border-black p-1 align-middle"
                            rowSpan={(isFirstRow && hasMark) ? 3 : 1}
                          >
                            {renderShippingMark(row, idx)}
                          </td>
                        )}
                        <td className="border border-black p-1 align-middle">
                          <div className="flex items-center min-h-[22px]">
                            <div className="flex justify-between font-black underline w-full">
                              <input 
                                className={`invoice-table-input invoice-input focus:bg-sky-100 ${getEditedColor('headerLeft', row.id)}`} 
                                style={{ fontSize: `${row.fontSize}px`, fontWeight: row.isBold ? 'bold' : 'normal', minHeight: row.fontSize ? row.fontSize * 2 : 20 }}
                                value={row.headerLeft || ''} 
                                onChange={(e) => handleRowChange(row.id, 'headerLeft', e.target.value)} 
                                onKeyDown={(e) => handleKeyDown(e, row.id, 'headerLeft')}
                                onFocus={() => setSelectedRowId(row.id)}
                                placeholder="HEADER LEFT" 
                              />
                            </div>
                          </div>
                        </td>
                        <td className="border border-black p-1 align-middle"></td>
                        <td colSpan={4} className="border border-black p-1 align-middle">
                          <div className="flex items-center min-h-[22px]">
                            <input 
                              className={`invoice-table-input invoice-input text-left font-black underline focus:bg-sky-100 ${getEditedColor('headerRight', row.id)}`} 
                              style={{ fontSize: `${row.fontSize}px`, fontWeight: row.isBold ? 'bold' : 'normal', minHeight: row.fontSize ? row.fontSize * 2 : 20 }}
                              value={row.headerRight || ''} 
                              onChange={(e) => handleRowChange(row.id, 'headerRight', e.target.value)} 
                              onKeyDown={(e) => handleKeyDown(e, row.id, 'headerRight')}
                              onFocus={() => setSelectedRowId(row.id)}
                              placeholder="HEADER RIGHT" 
                            />
                          </div>
                        </td>
                        <td className="relative w-0 p-0 border-none align-middle">
                          <div className={`absolute -right-10 top-1/2 -translate-y-1/2 flex items-center gap-1 transition-opacity no-print bg-white p-1 rounded-lg shadow-sm border border-slate-200 z-20 ${selectedRowId === row.id ? 'opacity-100' : 'opacity-0 group-hover/row:opacity-100'}`}>
                            <button onClick={() => handleRowChange(row.id, 'isBold', !row.isBold)} className={`p-1 w-6 rounded text-[10px] font-black ${row.isBold ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-900'}`}>B</button>
                          </div>
                        </td>
                      </>
                    ) : row.type === 'TOTAL' ? (
                      <>
                        <td colSpan={3} className="border border-black border-t-2 p-1 font-black text-left align-middle">
                          <div className="flex items-center justify-between w-full">
                            <input 
                              className={`invoice-table-input invoice-input focus:bg-sky-100 text-left w-32 ${getEditedColor('description', row.id)}`} 
                              style={{ fontSize: `10.5px`, fontWeight: 'bold', minHeight: '18px' }}
                              value={row.description || 'TOTAL'} 
                              onChange={(e) => handleRowChange(row.id, 'description', e.target.value)} 
                              onKeyDown={(e) => handleKeyDown(e, row.id, 'description')}
                              onFocus={() => setSelectedRowId(row.id)}
                            />
                            <div className="text-[10.5px] font-black whitespace-nowrap leading-tight text-right pr-2">
                              {row.unitBreakdown || (row.quantity && row.quantity !== '0' ? `${formatNumber(row.quantity)} ${row.unit || 'UNIT'}` : '')}
                            </div>
                          </div>
                        </td>
                        <td className="border border-black border-t-2 p-1"></td>
                        <td className="border border-black border-t-2 p-1 text-right font-black" style={{ fontSize: '10.5px' }}>{formatNumber(row.procAmount) || ''}</td>
                        <td className="border border-black border-t-2 p-1"></td>
                        <td className="border border-black border-t-2 p-1 relative">
                          <div className="text-right font-black" style={{ fontSize: `10.5px`, fontWeight: 'bold' }}>{formData.currencySymbol}{formatNumber(row.amount) || '0'}</div>
                          <div className={`absolute -right-10 top-1/2 -translate-y-1/2 flex items-center gap-1 transition-opacity no-print bg-white p-1 rounded-lg shadow-sm border border-slate-200 z-20 ${selectedRowId === row.id ? 'opacity-100' : 'opacity-0 group-hover/row:opacity-100'}`}>
                            <button onClick={() => handleRowChange(row.id, 'isBold', !row.isBold)} className={`p-1 w-6 rounded text-[10px] font-black ${row.isBold ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-900'}`}>B</button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        {!shouldSkipMark && (
                          <td 
                            className="border border-black p-1 align-middle"
                            rowSpan={(isFirstRow && hasMark) ? 3 : 1}
                          >
                            <div className="flex items-center min-h-[22px]">
                              <textarea 
                                className={`invoice-table-input invoice-textarea text-center focus:bg-sky-100 overflow-hidden resize-none ${getEditedColor('pkgNo', row.id)}`} 
                                style={{ fontSize: `${row.fontSize}px`, fontWeight: row.isBold ? 'bold' : 'normal', minHeight: '18px' }}
                                value={row.pkgNo || ''} 
                                onChange={(e) => handleRowChange(row.id, 'pkgNo', e.target.value)} 
                                onKeyDown={(e) => handleKeyDown(e, row.id, 'pkgNo')}
                                onPaste={(e) => handlePaste(e, row.id, 'pkgNo')}
                                onFocus={() => setSelectedRowId(row.id)}
                                onInput={(e) => {
                                  const target = e.target as HTMLTextAreaElement;
                                  target.style.height = 'auto';
                                  target.style.height = `${target.scrollHeight}px`;
                                }}
                              />
                            </div>
                          </td>
                        )}
                        <td className="border border-black p-1 relative align-middle">
                        <div className="flex items-center min-h-[22px]">
                          <textarea 
                            className={`invoice-table-input invoice-textarea focus:bg-sky-100 overflow-hidden resize-none ${getEditedColor('description', row.id)}`} 
                            style={{ fontSize: `${row.fontSize}px`, fontWeight: row.isBold ? 'bold' : 'normal', minHeight: '18px' }}
                            value={row.description || ''} 
                            onChange={(e) => handleRowChange(row.id, 'description', e.target.value)} 
                            onKeyDown={(e) => handleKeyDown(e, row.id, 'description')}
                            onPaste={(e) => handlePaste(e, row.id, 'description')}
                            onFocus={() => setSelectedRowId(row.id)}
                            onInput={(e) => {
                              const target = e.target as HTMLTextAreaElement;
                              target.style.height = 'auto';
                              target.style.height = `${target.scrollHeight}px`;
                            }}
                          />
                        </div>
                      </td>
                      <td className="border border-black p-1 align-middle text-right">
                        <div className="flex gap-1 justify-end items-center min-h-[22px] w-full">
                          <input 
                            className={`invoice-table-input invoice-input text-right focus:bg-sky-100 flex-grow ${getEditedColor('quantity', row.id)}`} 
                            style={{ fontSize: `${row.fontSize}px`, fontWeight: row.isBold ? 'bold' : 'normal', minHeight: row.fontSize ? row.fontSize * 2 : 20 }}
                            value={formatNumber(row.quantity) || ''} 
                            onChange={(e) => handleRowChange(row.id, 'quantity', e.target.value)} 
                            onKeyDown={(e) => handleKeyDown(e, row.id, 'quantity')}
                            onPaste={(e) => handlePaste(e, row.id, 'quantity')}
                            onFocus={() => setSelectedRowId(row.id)}
                          />
                          <div className="relative group/unit flex items-center">
                            <input 
                              className={`invoice-table-input invoice-input text-[10.5px] w-10 uppercase focus:bg-sky-100 ${getEditedColor('unit', row.id)}`} 
                              value={row.unit || ''} 
                              onChange={(e) => handleRowChange(row.id, 'unit', e.target.value)} 
                              onKeyDown={(e) => handleKeyDown(e, row.id, 'unit')}
                              onPaste={(e) => handlePaste(e, row.id, 'unit')}
                              onFocus={() => setSelectedRowId(row.id)}
                              placeholder="UNIT" 
                            />
                            <div className="absolute left-0 top-full hidden group-focus-within/unit:block bg-white border shadow-lg z-10 min-w-[60px] no-print">
                              {['PCS', 'PKG', 'UNIT', 'SET', 'CTN', 'BOX', 'EA', 'SHEET', 'PART'].map(u => (
                                <button key={u} onClick={() => handleRowChange(row.id, 'unit', u)} className="block w-full text-left px-2 py-1 text-[10px] hover:bg-slate-100">{u}</button>
                              ))}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="border border-black p-1 align-middle">
                        <div className="flex items-center justify-end min-h-[22px]">
                          <input 
                            className={`invoice-table-input invoice-input text-right focus:bg-sky-100 ${getEditedColor('proc', row.id)}`} 
                            style={{ fontSize: `${row.fontSize}px`, fontWeight: row.isBold ? 'bold' : 'normal', minHeight: row.fontSize ? row.fontSize * 2 : 20 }}
                            value={formatNumber(row.proc) || ''} 
                            onChange={(e) => handleRowChange(row.id, 'proc', e.target.value)} 
                            onKeyDown={(e) => handleKeyDown(e, row.id, 'proc')}
                            onPaste={(e) => handlePaste(e, row.id, 'proc')}
                            onFocus={() => setSelectedRowId(row.id)}
                          />
                        </div>
                      </td>
                      <td className="border border-black p-1 align-middle">
                        <div className="flex items-center justify-end min-h-[22px]">
                          <input 
                            className={`invoice-table-input invoice-input text-right focus:bg-sky-100 ${getEditedColor('procAmount', row.id)}`} 
                            style={{ fontSize: `${row.fontSize}px`, fontWeight: row.isBold ? 'bold' : 'normal', minHeight: row.fontSize ? row.fontSize * 2 : 20 }}
                            value={formatNumber(row.procAmount) || ''} 
                            onChange={(e) => handleRowChange(row.id, 'procAmount', e.target.value)} 
                            onKeyDown={(e) => handleKeyDown(e, row.id, 'procAmount')}
                            onPaste={(e) => handlePaste(e, row.id, 'procAmount')}
                            onFocus={() => setSelectedRowId(row.id)}
                          />
                        </div>
                      </td>
                      <td className="border border-black p-1 align-middle">
                        <div className="flex items-center justify-end min-h-[22px]">
                          <input 
                            className={`invoice-table-input invoice-input text-right focus:bg-sky-100 ${getEditedColor('price', row.id)}`} 
                            style={{ fontSize: `${row.fontSize}px`, fontWeight: row.isBold ? 'bold' : 'normal', minHeight: row.fontSize ? row.fontSize * 2 : 20 }}
                            value={formatNumber(row.price) || ''} 
                            onChange={(e) => handleRowChange(row.id, 'price', e.target.value)} 
                            onKeyDown={(e) => handleKeyDown(e, row.id, 'price')}
                            onPaste={(e) => handlePaste(e, row.id, 'price')}
                            onFocus={() => setSelectedRowId(row.id)}
                          />
                        </div>
                      </td>
                      <td className="border border-black p-1 text-right relative align-middle">
                        <div className={`font-bold flex items-center justify-end min-h-[22px] ${getEditedColor('amount', row.id)}`} style={{ fontSize: `${row.fontSize}px`, fontWeight: row.isBold ? 'bold' : 'normal' }}>
                          {row.unit ? formatNumber(row.amount) : ''}
                        </div>
                        <div className={`absolute -right-10 top-1/2 -translate-y-1/2 flex items-center gap-1 transition-opacity no-print bg-white p-1 rounded-lg shadow-sm border border-slate-200 z-20 ${selectedRowId === row.id ? 'opacity-100' : 'opacity-0 group-hover/row:opacity-100'}`}>
                          <button onClick={() => handleRowChange(row.id, 'isBold', !row.isBold)} className={`p-1 w-6 rounded text-[10px] font-black ${row.isBold ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-900'}`}>B</button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              )})}
              <tr className="bg-slate-50">
                <td colSpan={3} className="border border-black p-1 font-black text-[10.5px] align-middle text-left">
                  <div className="flex items-center justify-between w-full">
                    <span>GRAND TOTAL</span>
                    <div className="whitespace-nowrap leading-tight text-right pr-2">
                      {formData.totalQuantityBreakdown || (formData.totalQuantity && formData.totalQuantity !== '0' ? `${formatNumber(formData.totalQuantity)} UNIT` : '')}
                    </div>
                  </div>
                </td>
                <td className="border border-black p-1 align-middle"></td>
                <td className="border border-black p-1 text-right font-black text-[10.5px] align-middle">{formatNumber(formData.totalProcAmount) || ''}</td>
                <td className="border border-black p-1 align-middle"></td>
                <td className="border border-black p-1 text-right font-black text-[10.5px] bg-slate-100 align-middle">
                  <div className={`flex items-center justify-end min-h-[22px] ${getEditedColor('totalAmount')}`}>
                    {formData.currencySymbol}{formatNumber(formData.totalAmount) || '0'}
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
          <div className="flex gap-4 mt-2 no-print">
            <button onClick={() => handleAddRow('ITEM')} className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" /></svg>
              품목 추가
            </button>
            <button onClick={() => handleAddRow('HEADER')} className="text-xs font-bold text-emerald-600 hover:underline flex items-center gap-1">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" /></svg>
              구분(Header) 추가
            </button>
            <button onClick={() => handleAddRow('TOTAL')} className="text-xs font-bold text-amber-600 hover:underline flex items-center gap-1">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" /></svg>
              소계(Total) 추가
            </button>
            {selectedRowId && (
              <button onClick={() => handleRemoveRow(selectedRowId)} className="text-xs font-bold text-rose-600 hover:underline flex items-center gap-1">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M20 12H4" /></svg>
                행 삭제 (-)
              </button>
            )}
          </div>

          <div className="mt-8 space-y-4">
            {formData.showTrackingNo !== false ? (
              <div className="relative group">
                <div className="text-center py-4 border-y border-slate-100">
                  <input className={`invoice-input text-center text-sm font-black ${getEditedColor('trackingNo')}`} value={formData.trackingNo || ''} onChange={(e) => setFormData(prev => ({ ...prev, trackingNo: e.target.value }))} placeholder="*** TRACKING NO. ***" />
                </div>
                <button 
                  onClick={() => setFormData(prev => ({ ...prev, showTrackingNo: false }))} 
                  className="absolute right-0 top-0 mt-1 mr-1 p-1 bg-rose-50 text-rose-600 rounded opacity-0 group-hover:opacity-100 transition-opacity no-print"
                  title="Tracking No 삭제"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            ) : (
              <div className="flex justify-center no-print">
                <button 
                  onClick={() => setFormData(prev => ({ ...prev, showTrackingNo: true }))} 
                  className="text-xs font-bold text-blue-600 bg-blue-50 px-3 py-1 rounded hover:bg-blue-100"
                >
                  + TRACKING NO 복구
                </button>
              </div>
            )}

            {formData.showRemarks !== false ? (
              <div className="relative group">
                <textarea 
                  ref={remarksRef}
                  className={`invoice-textarea w-full text-[10.5px] text-slate-800 overflow-hidden resize-none ${getEditedColor('remarks')}`} 
                  value={formData.remarks || ''} 
                  onChange={(e) => setFormData(prev => ({ ...prev, remarks: e.target.value }))} 
                  onInput={(e) => {
                    const target = e.target as HTMLTextAreaElement;
                    target.style.height = 'auto';
                    target.style.height = `${target.scrollHeight}px`;
                  }}
                  placeholder="REMARKS / FREE OF CHARGE ITEMS..." 
                />
                <button 
                  onClick={() => setFormData(prev => ({ ...prev, showRemarks: false }))} 
                  className="absolute right-0 top-0 mt-1 mr-1 p-1 bg-rose-50 text-rose-600 rounded opacity-0 group-hover:opacity-100 transition-opacity no-print"
                  title="Remarks 삭제"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            ) : (
              <div className="flex justify-center no-print">
                <button 
                  onClick={() => setFormData(prev => ({ ...prev, showRemarks: true }))} 
                  className="text-xs font-bold text-blue-600 bg-blue-50 px-3 py-1 rounded hover:bg-blue-100"
                >
                  + REMARKS 복구
                </button>
              </div>
            )}
          </div>

          <div className="mt-6 flex justify-between items-start border-t border-slate-200 pt-4 mt-auto">
            <div className="text-[10px] font-bold text-slate-800 space-y-0.5 mt-1">
              <div className="flex items-center gap-2">
                <span className="whitespace-nowrap">TELEPHONE NO.:</span>
                <input 
                  className={`invoice-input font-bold p-0 min-w-[150px] ${getEditedColor('footerTel')}`} 
                  value={formData.footerTel || ''} 
                  onChange={(e) => setFormData(prev => ({ ...prev, footerTel: e.target.value }))} 
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="whitespace-nowrap">FACIMILE NO.:</span>
                <input 
                  className={`invoice-input font-bold p-0 min-w-[150px] ${getEditedColor('footerFax')}`} 
                  value={formData.footerFax || ''} 
                  onChange={(e) => setFormData(prev => ({ ...prev, footerFax: e.target.value }))} 
                />
              </div>
            </div>
            <div className="border-l border-black pl-4 w-[420px] relative">
              <div className="flex justify-between items-start mb-0.5">
                <label className="text-[9px] font-black uppercase">SIGNED BY</label>
                <select 
                  className="text-[9px] bg-slate-50 border border-slate-200 rounded px-1 no-print"
                  value=""
                  onChange={(e) => {
                    const ent = entities.find(ent => ent.id === e.target.value);
                    if (ent) handleEntitySelect(ent);
                  }}
                >
                  <option value="">보관함에서 선택</option>
                  {entities.filter(e => e.type === 'SIGNATURE').map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>
              <input className={`invoice-input text-sm font-black mb-0.5 ${getEditedColor('signedBy')}`} value={formData.signedBy || ''} onChange={(e) => setFormData(prev => ({ ...prev, signedBy: e.target.value }))} placeholder="AJIN PRECISION MFG., INC." />
              
              <div className="flex items-center gap-4 mt-0.5">
                <input className={`invoice-input text-[11px] font-bold flex-1 ${getEditedColor('signedTitle')}`} value={formData.signedTitle || ''} onChange={(e) => setFormData(prev => ({ ...prev, signedTitle: e.target.value }))} placeholder="MANAGING DIRECTOR CHO, MOO-YEON." />
                <div className="w-32 flex justify-end pr-2">
                  <span className={`signature-font text-xl text-blue-800 opacity-80 ${getEditedColor('signatureName')}`}>{formData.signatureName || ''}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* PACKING LIST SECTION */}
        <div className="mt-20 pt-20 border-t-4 border-double border-slate-300 flex flex-col min-h-[1123px]">
          <div className="text-center mb-8">
            <h2 className="text-5xl font-black underline tracking-widest">PACKING LIST</h2>
          </div>

          <div className="invoice-grid">
            {/* Row 1 & 2 Left: Shipper + ID CODE 병합 영역 */}
            <div className="invoice-cell relative" style={{ gridColumn: '1 / span 2', gridRow: '1 / span 2', minHeight: '150px' }}>
              <div className="flex justify-between items-start">
                <div className="w-full">
                  <label className="invoice-label">SHIPPER/ SELLER</label>
                  <span className="text-[8px] font-bold text-slate-400 uppercase block mb-1">EXPORTER, IMPORTER & MANUFACTURER</span>
                  <input className={`invoice-input-bold w-full ${getEditedColor('shipperName')}`} value={formData.shipperName || ''} readOnly />
                  <textarea 
                    className={`invoice-textarea w-full ${getEditedColor('plShipperAddress')}`} 
                    style={{ height: '80px' }} 
                    value={formData.plShipperAddress || ''} 
                    onChange={(e) => setFormData(prev => ({ ...prev, plShipperAddress: e.target.value }))}
                    placeholder="PACKING LIST SHIPPER ADDRESS"
                  />
                </div>
              </div>
              <div className="absolute top-[8px] right-[10px] text-right" style={{ width: '120px', borderLeft: '0.5px solid #e2e8f0', paddingLeft: '10px' }}>
                <label className="invoice-label !mb-0">ID CODE</label>
                <div className={`text-right font-bold text-[10.5px] py-1 ${getEditedColor('idCode')}`}>{formData.idCode || ''}</div>
              </div>
            </div>

            {/* Row 1 Right: INVOICE NO (그리드 번호 3번으로 고정) */}
            <div className="invoice-cell" style={{ gridColumn: '3' }}>
              <label className="invoice-label">PACKING LIST NO. AND DATE</label>
              <div className="flex gap-1">
                <div className={`font-bold text-[10.5px] flex-1 ${getEditedColor('invoiceNo')}`}>{formData.invoiceNo || ''}</div>
                <div className="flex flex-col items-end">
                  <div className={`font-bold text-[10.5px] ${getEditedColor('invoiceDate')}`}>{formData.invoiceDate || ''}</div>
                  <span className="text-[9px] text-blue-500 font-bold">{formatDateToEnglish(formData.invoiceDate || '')}</span>
                </div>
              </div>
            </div>

            {/* Row 1 Far Right: PAGE (그리드 번호 4번으로 고정) */}
            <div className="invoice-cell" style={{ gridColumn: '4', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <label className="invoice-label text-center">PAGE</label>
              <div className="text-[10px] font-black text-center text-blue-600 bg-blue-50 py-1 rounded">자동</div>
            </div>

            {/* Row 2 Middle: P/O NO */}
            <div className="invoice-cell" style={{ gridColumn: '3', gridRow: '2' }}>
              <label className="invoice-label">P/O NO. AND DATE</label>
              <div className={`font-bold text-[10.5px] whitespace-pre-wrap ${getEditedColor('poNo')}`}>{formData.poNo || ''}</div>
            </div>

            {/* Row 2 Right: FACTORY OUT */}
            <div className="invoice-cell" style={{ gridColumn: '4', gridRow: '2' }}>
              <label className="invoice-label text-center">DATE OF FACTORY OUT</label>
              <div className="flex flex-col items-center">
                <div className={`font-bold text-[10.5px] ${getEditedColor('factoryOutDate')}`}>{formData.factoryOutDate || ''}</div>
                <span className="text-[10px] text-blue-500 font-bold">{formatDateToEnglish(formData.factoryOutDate || '')}</span>
              </div>
            </div>

            {/* Row 3-5 Left: Consignee */}
            <div className="invoice-cell" style={{ gridColumn: '1 / span 2', gridRow: '3 / span 3' }}>
              <label className="invoice-label">CONSIGNEE</label>
              <div className={`font-black text-[18px] uppercase ${getEditedColor('consigneeName')}`}>{formData.consigneeName || ''}</div>
              <textarea 
                className={`invoice-textarea w-full text-[10.5px] whitespace-pre-wrap ${getEditedColor('plConsigneeAddress')}`} 
                style={{ minHeight: '60px' }}
                value={formData.plConsigneeAddress || ''} 
                onChange={(e) => setFormData(prev => ({ ...prev, plConsigneeAddress: e.target.value }))}
                placeholder="PACKING LIST CONSIGNEE ADDRESS"
              />
              <div className="mt-1 space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-black text-slate-400 w-12">TAX ID:</span>
                  <div className={`text-[10.5px] font-bold ${getEditedColor('consigneeTaxId')}`}>{formData.consigneeTaxId || ''}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-black text-slate-400 w-12">TEL:</span>
                  <div className={`text-[10.5px] font-bold ${getEditedColor('consigneeTel')}`}>{formData.consigneeTel || ''}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-black text-slate-400 w-12">ATTN:</span>
                  <div className={`text-[10.5px] font-black ${getEditedColor('consigneeAttn')}`}>{formData.consigneeAttn || ''}</div>
                </div>
              </div>
            </div>

            {/* Row 3 Right: Buyer */}
            <div className="invoice-cell" style={{ gridColumn: '3 / span 2' }}>
              <label className="invoice-label">BUYER (IF OTHER THAN CONSIGNEE)</label>
              <div className={`text-[10.5px] text-center min-h-[18px] uppercase ${getEditedColor('buyer')}`}>{formData.buyer || ''}</div>
            </div>

            {/* Row 4-6 Right: Other Reference */}
            <div className="invoice-cell" style={{ gridColumn: '3 / span 2', gridRow: '4 / span 3' }}>
              <label className="invoice-label">OTHER REFERENCE</label>
              <div className={`text-[10.5px] whitespace-pre-wrap min-h-[80px] ${getEditedColor('otherRef')}`}>{formData.otherRef || ''}</div>
            </div>

            {/* Row 6 Left: Departure Date */}
            <div className="invoice-cell" style={{ gridColumn: '1 / span 2', gridRow: '6' }}>
              <label className="invoice-label">DEPARTURE DATE</label>
              <div className="flex flex-col items-center">
                <div className={`font-black text-[10.5px] ${getEditedColor('departureDate')}`}>{formData.departureDate || ''}</div>
                <span className="text-[10px] text-blue-500 font-bold">{formatDateToEnglish(formData.departureDate || '')}</span>
              </div>
            </div>

            {/* Row 7 Left: Vessel & From */}
            <div className="invoice-cell" style={{ gridColumn: '1' }}>
              <label className="invoice-label">VESSEL/ FLIGHT</label>
              <div className={`text-center font-bold text-[10.5px] ${getEditedColor('vesselFlight')}`}>{formData.vesselFlight || ''}</div>
            </div>
            <div className="invoice-cell" style={{ gridColumn: '2' }}>
              <label className="invoice-label">FROM</label>
              <div className={`text-center font-bold text-[10.5px] ${getEditedColor('from')}`}>{formData.from || ''}</div>
            </div>

            {/* Row 7-8 Right: Terms */}
            <div className="invoice-cell" style={{ gridColumn: '3 / span 2', gridRow: '7 / span 2' }}>
              <label className="invoice-label">TERMS OF DELIVERY AND PAYMENT</label>
              <div className={`text-[10.5px] text-center min-h-[60px] whitespace-pre-wrap ${getEditedColor('deliveryTerms')}`}>{formData.deliveryTerms || ''}</div>
            </div>

            {/* Row 8 Left: To */}
            <div className="invoice-cell" style={{ gridColumn: '1 / span 2' }}>
              <label className="invoice-label">TO</label>
              <div className={`text-center font-bold text-[10.5px] ${getEditedColor('to')}`}>{formData.to || ''}</div>
            </div>
          </div>

          <table className="w-full border-collapse border border-black mt-4 font-['Gulim',_sans-serif]">
            <thead>
              <tr className="bg-slate-50">
                <th className="border border-black p-1 text-[10.5px] font-black w-32 relative group/mark">
                  <div className="flex flex-col items-center gap-1">
                    <span>SHIPPING MARK</span>
                    <select 
                      className="text-[8px] bg-white border border-slate-200 rounded px-1 no-print font-normal w-[90%]"
                      value={formData.shippingMarkType || ''}
                      onChange={(e) => {
                        const newType = e.target.value;
                        setFormData(prev => {
                          const newRows = [...(prev.rows || [])];
                          if (newType && newRows[0]?.pkgNo === 'ADDRESS') {
                            newRows[0] = { ...newRows[0], pkgNo: '' };
                          }
                          return { ...prev, shippingMarkType: newType, rows: newRows };
                        });
                      }}
                    >
                      <option value="">옵션 선택</option>
                      <option value="TOMY">1. TOMY 마크</option>
                      <option value="LEMKE">2. LEMKE 마크</option>
                    </select>
                  </div>
                </th>
                <th className="border border-black p-2 text-[10.5px] font-black">NO. & KINDS OF PKGS; GOODS DESCRIPTION</th>
                <th className="border border-black p-2 text-[10.5px] font-black w-32">QUANTITY</th>
                <th className="border border-black p-2 text-[10.5px] font-black w-20">C/T Q'TY</th>
                <th className="border border-black p-2 text-[10.5px] font-black w-20">NET WEIGHT (kg)</th>
                <th className="border border-black p-2 text-[10.5px] font-black w-20">GROSS WEIGHT (kg)</th>
                <th className="border border-black p-2 text-[10.5px] font-black w-24">CBM (M3)</th>
              </tr>
            </thead>
            <tbody>
              {(formData.rows || []).map((row, idx) => {
                const isFirstRow = idx === 0;
                const hasMark = !!formData.shippingMarkType;
                const shouldSkipMark = hasMark && (idx === 1 || idx === 2);

                return (
                  <tr key={`${row.id}-pk`} className={`group/row`}>
                    {row.type === 'HEADER' ? (
                      <>
                        {!shouldSkipMark && (
                          <td 
                            className="border border-black p-1 text-center font-black underline align-middle" 
                            style={{ fontSize: `${row.fontSize}px` }}
                            rowSpan={(isFirstRow && hasMark) ? 3 : 1}
                          >
                            {renderShippingMark(row, idx, true)}
                          </td>
                        )}
                        <td className="border border-black p-1 font-black underline align-middle" style={{ fontSize: `${row.fontSize}px` }}>
                          <div className="flex items-center min-h-[22px]">{row.headerLeft}</div>
                        </td>
                        <td className="border border-black p-1 font-black underline align-middle" style={{ fontSize: `${row.fontSize}px` }}></td>
                        <td colSpan={4} className="border border-black p-1 text-left font-black underline align-middle" style={{ fontSize: `${row.fontSize}px` }}>
                          <div className="flex items-center min-h-[22px] text-left">{row.headerRight}</div>
                        </td>
                      </>
                    ) : row.type === 'TOTAL' ? (
                      <>
                        <td colSpan={3} className={`border border-black border-t-2 p-1 font-black text-[10.5px] align-middle text-left`}>
                          <div className="flex items-center justify-between w-full">
                            <input className={`invoice-table-input invoice-input font-black text-left w-24 ${getEditedColor('description', row.id)}`} value={row.description || 'TOTAL'} onChange={(e) => handleRowChange(row.id, 'description', e.target.value)} />
                            <div className="flex items-center justify-end gap-1 flex-grow">
                              {row.unitBreakdown ? (
                                <div className="text-right font-black whitespace-nowrap leading-tight">{row.unitBreakdown}</div>
                              ) : (
                                <>
                                  <input className={`invoice-table-input invoice-input text-right font-black flex-grow ${getEditedColor('quantity', row.id)}`} value={formatNumber(row.quantity) || ''} onChange={(e) => handleRowChange(row.id, 'quantity', e.target.value)} />
                                  <span className={`${getEditedColor('unit', row.id)}`}>{row.unit}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="border border-black border-t-2 p-1 text-right font-black text-[10.5px] align-middle">
                          <input className={`invoice-table-input invoice-input text-right font-black ${getEditedColor('plProc', row.id)}`} value={formatNumber(row.plProc) || ''} onChange={(e) => handleRowChange(row.id, 'plProc', e.target.value)} />
                        </td>
                        <td className="border border-black border-t-2 p-1 text-right font-black text-[10.5px] align-middle">
                          <input className={`invoice-table-input invoice-input text-right font-black ${getEditedColor('plProcAmount', row.id)}`} value={formatNumber(row.plProcAmount) || ''} onChange={(e) => handleRowChange(row.id, 'plProcAmount', e.target.value)} />
                        </td>
                        <td className="border border-black border-t-2 p-1 text-right font-black text-[10.5px] align-middle">
                          <input className={`invoice-table-input invoice-input text-right font-black ${getEditedColor('plPrice', row.id)}`} value={formatNumber(row.plPrice) || ''} onChange={(e) => handleRowChange(row.id, 'plPrice', e.target.value)} />
                        </td>
                        <td className="border border-black border-t-2 p-1 text-right font-black text-[10.5px] align-middle">
                          <input className={`invoice-table-input invoice-input text-right font-black ${getEditedColor('plAmount', row.id)}`} value={formatNumber(row.plAmount) || ''} onChange={(e) => handleRowChange(row.id, 'plAmount', e.target.value)} />
                        </td>
                      </>
                    ) : (
                      <>
                        {!shouldSkipMark && (
                          <td 
                            className="border border-black p-1 text-center text-[10.5px] align-middle"
                            rowSpan={(isFirstRow && hasMark) ? 3 : 1}
                          >
                            <textarea 
                              className={`invoice-table-input invoice-textarea text-center focus:bg-sky-100 overflow-hidden resize-none p-0 ${getEditedColor('plPkgNo', row.id)}`} 
                              style={{ fontSize: `${row.fontSize}px`, fontWeight: row.isBold ? 'bold' : 'normal' }}
                              value={row.plPkgNo !== undefined ? row.plPkgNo : ''} 
                              onChange={(e) => handleRowChange(row.id, 'plPkgNo', e.target.value)}
                              onKeyDown={(e) => handleKeyDown(e, row.id, 'plPkgNo')}
                              onInput={(e) => {
                                const target = e.target as HTMLTextAreaElement;
                                target.style.height = 'auto';
                                target.style.height = `${target.scrollHeight}px`;
                              }}
                            />
                          </td>
                        )}
                        <td className="border border-black p-1 text-[10.5px] align-middle">
                        <textarea 
                          className={`invoice-table-input invoice-textarea focus:bg-sky-100 overflow-hidden resize-none p-0 ${getEditedColor('description', row.id)}`} 
                          style={{ fontSize: `${row.fontSize}px`, fontWeight: row.isBold ? 'bold' : 'normal' }}
                          value={row.description} 
                          onChange={(e) => handleRowChange(row.id, 'description', e.target.value)}
                          onKeyDown={(e) => handleKeyDown(e, row.id, 'description')}
                          onFocus={() => setSelectedRowId(row.id)}
                          onInput={(e) => {
                            const target = e.target as HTMLTextAreaElement;
                            target.style.height = 'auto';
                            target.style.height = `${target.scrollHeight}px`;
                          }}
                        />
                      </td>
                      <td className="border border-black p-1 text-right text-[10.5px] font-bold align-middle">
                        <div className="flex items-center justify-end min-h-[22px] w-full">
                          <input 
                            className={`invoice-table-input invoice-input text-right flex-grow ${getEditedColor('quantity', row.id)}`} 
                            value={formatNumber(row.quantity) || ''} 
                            onChange={(e) => handleRowChange(row.id, 'quantity', e.target.value)}
                            onKeyDown={(e) => handleKeyDown(e, row.id, 'quantity')} 
                            onFocus={() => setSelectedRowId(row.id)}
                          /> <span className={`${getEditedColor('unit', row.id)}`}>{row.unit}</span>
                        </div>
                      </td>
                      <td className="border border-black p-1 text-right text-[10.5px] align-middle">
                        <div className="flex items-center justify-end min-h-[22px]">
                          <input className={`invoice-table-input invoice-input text-right ${getEditedColor('plProc', row.id)}`} value={formatNumber(row.plProc) || ''} onChange={(e) => handleRowChange(row.id, 'plProc', e.target.value)} onKeyDown={(e) => handleKeyDown(e, row.id, 'plProc')} />
                        </div>
                      </td>
                      <td className="border border-black p-1 text-right text-[10.5px] align-middle">
                        <div className="flex items-center justify-end min-h-[22px]">
                          <input className={`invoice-table-input invoice-input text-right ${getEditedColor('plProcAmount', row.id)}`} value={formatNumber(row.plProcAmount) || ''} onChange={(e) => handleRowChange(row.id, 'plProcAmount', e.target.value)} onKeyDown={(e) => handleKeyDown(e, row.id, 'plProcAmount')} />
                        </div>
                      </td>
                      <td className="border border-black p-1 text-right text-[10.5px] align-middle">
                        <div className="flex items-center justify-end min-h-[22px]">
                          <input className={`invoice-table-input invoice-input text-right ${getEditedColor('plPrice', row.id)}`} value={formatNumber(row.plPrice) || ''} onChange={(e) => handleRowChange(row.id, 'plPrice', e.target.value)} onKeyDown={(e) => handleKeyDown(e, row.id, 'plPrice')} />
                        </div>
                      </td>
                      <td className="border border-black p-1 text-right text-[10.5px] font-bold align-middle">
                        <div className="flex items-center justify-end min-h-[22px]">
                          <input className={`invoice-table-input invoice-input text-right ${getEditedColor('plAmount', row.id)}`} value={formatNumber(row.plAmount) || ''} onChange={(e) => handleRowChange(row.id, 'plAmount', e.target.value)} onKeyDown={(e) => handleKeyDown(e, row.id, 'plAmount')} />
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              )})}
              <tr className="bg-slate-50">
                <td colSpan={3} className={`border border-black p-1 font-black text-[10.5px] align-middle text-left`}>
                  <div className="flex items-center justify-between w-full">
                    <span>GRAND TOTAL</span>
                    {formData.totalQuantityBreakdown ? (
                      <div className="text-right font-black whitespace-nowrap leading-tight">{formData.totalQuantityBreakdown}</div>
                    ) : (
                      <div className="flex items-center justify-end min-h-[22px]">
                        <input className={`invoice-table-input invoice-input text-right font-black ${getEditedColor('totalQuantity')}`} value={formatNumber(formData.totalQuantity) || ''} onChange={(e) => handleRowChange('', 'totalQuantity' as any, e.target.value)} />
                      </div>
                    )}
                  </div>
                </td>
                <td className="border border-black p-1 text-right font-black text-[10.5px] align-middle">
                  <input className={`invoice-table-input invoice-input text-right font-black ${getEditedColor('plTotalCtQty')}`} value={formatNumber(formData.plTotalCtQty) || ''} onChange={(e) => handleRowChange('', 'plTotalCtQty' as any, e.target.value)} />
                </td>
                <td className="border border-black p-1 text-right font-black text-[10.5px] align-middle">
                  <input className={`invoice-table-input invoice-input text-right font-black ${getEditedColor('plTotalNetWeight')}`} value={formatNumber(formData.plTotalNetWeight) || ''} onChange={(e) => handleRowChange('', 'plTotalNetWeight' as any, e.target.value)} />
                </td>
                <td className="border border-black p-1 text-right font-black text-[10.5px] align-middle">
                  <input className={`invoice-table-input invoice-input text-right font-black ${getEditedColor('plTotalGrossWeight')}`} value={formatNumber(formData.plTotalGrossWeight) || ''} onChange={(e) => handleRowChange('', 'plTotalGrossWeight' as any, e.target.value)} />
                </td>
                <td className="border border-black p-1 text-right font-black text-[10.5px] bg-slate-100 align-middle">
                  <input className={`invoice-table-input invoice-input text-right font-black ${getEditedColor('plTotalCbm')}`} value={formatNumber(formData.plTotalCbm) || ''} onChange={(e) => handleRowChange('', 'plTotalCbm' as any, e.target.value)} />
                </td>
              </tr>
            </tbody>
          </table>
          <div className="flex gap-4 mt-2 no-print">
            <button onClick={() => handleAddRow('ITEM')} className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" /></svg>
              품목 추가
            </button>
            <button onClick={() => handleAddRow('HEADER')} className="text-xs font-bold text-emerald-600 hover:underline flex items-center gap-1">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" /></svg>
              구분(Header) 추가
            </button>
            <button onClick={() => handleAddRow('TOTAL')} className="text-xs font-bold text-amber-600 hover:underline flex items-center gap-1">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" /></svg>
              소계(Total) 추가
            </button>
            {selectedRowId && (
              <button onClick={() => handleRemoveRow(selectedRowId)} className="text-xs font-bold text-rose-600 hover:underline flex items-center gap-1">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M20 12H4" /></svg>
                행 삭제 (-)
              </button>
            )}
          </div>

          <div className="mt-8 space-y-4">
            {formData.showPlExtraRemarks !== false ? (
              <div className="relative group text-left">
                <div className="py-4 border-y border-slate-100 flex justify-start">
                  <textarea 
                    className="invoice-textarea w-full text-[10.5px] text-slate-800 overflow-hidden resize-none text-left" 
                    style={{ minHeight: '30px' }}
                    value={formData.plExtraRemarks || ''} 
                    onChange={(e) => setFormData(prev => ({ ...prev, plExtraRemarks: e.target.value }))} 
                    placeholder="ADDITIONAL REMARKS..." 
                    onInput={(e) => {
                      const target = e.target as HTMLTextAreaElement;
                      target.style.height = 'auto';
                      target.style.height = `${target.scrollHeight}px`;
                    }}
                  />
                </div>
                <button 
                  onClick={() => setFormData(prev => ({ ...prev, showPlExtraRemarks: false }))} 
                  className="absolute right-0 top-0 mt-1 mr-1 p-1 bg-rose-50 text-rose-600 rounded opacity-0 group-hover:opacity-100 transition-opacity no-print"
                  title="Extra Remarks 삭제"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            ) : (
              <div className="flex justify-center no-print">
                <button 
                  onClick={() => setFormData(prev => ({ ...prev, showPlExtraRemarks: true }))} 
                  className="text-xs font-bold text-blue-600 bg-blue-50 px-3 py-1 rounded hover:bg-blue-100"
                >
                  + EXTRA REMARKS 복구
                </button>
              </div>
            )}

            {formData.showPlRemarks !== false ? (
              <div className="relative group">
                <textarea 
                  className="invoice-textarea w-full text-[10.5px] text-slate-800 overflow-hidden resize-none" 
                  style={{ minHeight: '40px' }}
                  value={formData.plRemarks || ''} 
                  onChange={(e) => setFormData(prev => ({ ...prev, plRemarks: e.target.value }))} 
                  placeholder="PACKING LIST REMARKS..." 
                  onInput={(e) => {
                    const target = e.target as HTMLTextAreaElement;
                    target.style.height = 'auto';
                    target.style.height = `${target.scrollHeight}px`;
                  }}
                />
                <button 
                  onClick={() => setFormData(prev => ({ ...prev, showPlRemarks: false }))} 
                  className="absolute right-0 top-0 mt-1 mr-1 p-1 bg-rose-50 text-rose-600 rounded opacity-0 group-hover:opacity-100 transition-opacity no-print"
                  title="Packing Remarks 삭제"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            ) : (
              <div className="flex justify-center no-print">
                <button 
                  onClick={() => setFormData(prev => ({ ...prev, showPlRemarks: true }))} 
                  className="text-xs font-bold text-blue-600 bg-blue-50 px-3 py-1 rounded hover:bg-blue-100"
                >
                  + PACKING REMARKS 복구
                </button>
              </div>
            )}
          </div>

          <div className="mt-6 flex justify-between items-start border-t border-slate-200 pt-4 mt-auto">
            <div className="text-[10px] font-bold text-slate-800 space-y-0.5 mt-1 text-left">
              <div>TELEPHONE NO.: {formData.footerTel}</div>
              <div>FACIMILE NO.: {formData.footerFax}</div>
            </div>
            <div className="border-l border-black pl-4 w-[420px] text-left relative">
              <div className="flex justify-between items-start mb-0.5">
                <label className="text-[9px] font-black uppercase">SIGNED BY</label>
                <select 
                  className="text-[9px] bg-slate-50 border border-slate-200 rounded px-1 no-print"
                  value=""
                  onChange={(e) => {
                    const ent = entities.find(ent => ent.id === e.target.value);
                    if (ent) handleEntitySelect(ent);
                  }}
                >
                  <option value="">보관함에서 선택</option>
                  {entities.filter(e => e.type === 'SIGNATURE').map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>
              <div className="text-sm font-black mb-0.5">{formData.signedBy || 'AJIN PRECISION MFG., INC.'}</div>
              <div className="flex items-center gap-4 mt-0.5">
                <div className="text-[11px] font-bold flex-1">{formData.signedTitle || ''}</div>
                <div className="w-32 flex justify-end pr-2">
                  <span className="signature-font text-xl text-blue-800 opacity-80">{formData.signatureName || ''}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Metadata display (non-printing) */}
        <div className="mt-4 pt-4 border-t border-slate-100 flex flex-wrap gap-y-4 justify-between items-center text-[10px] font-bold text-slate-400 no-print">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <div className="flex items-center gap-1">
              <span className="uppercase tracking-widest">Created At:</span>
              <span className="text-slate-600">{new Date(formData.createdAt!).toLocaleString()}</span>
            </div>
            {formData.completedByInitials && (
              <>
                <div className="flex items-center gap-1">
                  <span className="uppercase tracking-widest">Completed By:</span>
                  <span className="text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">{formData.completedByInitials}</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="uppercase tracking-widest">Completed At:</span>
                  <span className="text-slate-600">{new Date(formData.completedAt!).toLocaleString()}</span>
                </div>
              </>
            )}
            {formData.modifiedByInitials && (
              <>
                <div className="flex items-center gap-1">
                  <span className="uppercase tracking-widest text-blue-500">Modified By:</span>
                  <span className="text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">{formData.modifiedByInitials}</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="uppercase tracking-widest text-blue-500">Modified At:</span>
                  <span className="text-slate-600">{new Date(formData.modifiedAt!).toLocaleString()}</span>
                </div>
              </>
            )}
          </div>
        </div>
        </div>
      </div>

      {/* Entity Management Modal */}
      {isEntityModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col shadow-2xl">
            <div className="p-8 border-b border-slate-100 flex justify-between items-center">
              <h2 className="text-2xl font-black text-slate-900">보관함 관리</h2>
              <button onClick={() => setIsEntityModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-900 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
              <div className="bg-slate-50 p-6 rounded-3xl border border-slate-200 space-y-4">
                <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest">새 항목 추가 / 수정</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">구분</label>
                    <div className="flex gap-2">
                      {['SHIPPER', 'CONSIGNEE', 'SIGNATURE'].map(t => (
                        <button 
                          key={t}
                          onClick={() => setEditingEntity(prev => ({ ...prev, type: t as any }))}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${editingEntity?.type === t ? 'bg-blue-600 text-white shadow-md' : 'bg-white text-slate-500 border border-slate-200'}`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">이름 / 업체명</label>
                    <input className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold" value={editingEntity?.name || ''} onChange={(e) => setEditingEntity(prev => ({ ...prev, name: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">{editingEntity?.type === 'SIGNATURE' ? '서명' : 'ID CODE / 추가정보'}</label>
                    <input className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold" value={editingEntity?.extra || ''} onChange={(e) => setEditingEntity(prev => ({ ...prev, extra: e.target.value }))} />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">{editingEntity?.type === 'SIGNATURE' ? 'BY 직함' : '주소 / 상세내용'}</label>
                    <textarea className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold min-h-[80px]" value={editingEntity?.content || ''} onChange={(e) => setEditingEntity(prev => ({ ...prev, content: e.target.value }))} />
                  </div>
                  {editingEntity?.type === 'CONSIGNEE' && (
                    <>
                      <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">TAX ID</label>
                        <input className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold" value={editingEntity?.taxId || ''} onChange={(e) => setEditingEntity(prev => ({ ...prev, taxId: e.target.value }))} />
                      </div>
                      <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">TEL</label>
                        <input className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold" value={editingEntity?.tel || ''} onChange={(e) => setEditingEntity(prev => ({ ...prev, tel: e.target.value }))} />
                      </div>
                      <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">ATTN</label>
                        <input className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold" value={editingEntity?.attn || ''} onChange={(e) => setEditingEntity(prev => ({ ...prev, attn: e.target.value }))} />
                      </div>
                    </>
                  )}
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  {editingEntity && <button onClick={() => setEditingEntity(null)} className="px-4 py-2 text-slate-400 font-bold text-xs uppercase">취소</button>}
                  <button onClick={handleAddEntity} className="px-6 py-2 bg-slate-900 text-white rounded-xl font-bold text-xs uppercase tracking-widest shadow-lg shadow-slate-900/10">저장</button>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest">저장된 항목</h3>
                <div className="space-y-2">
                  {entities.map(ent => (
                    <div key={ent.id} className="bg-white p-4 rounded-2xl border border-slate-100 flex justify-between items-center group">
                      <div className="flex items-center gap-4">
                        <span className={`text-[9px] font-black px-2 py-1 rounded uppercase tracking-tighter ${ent.type === 'SHIPPER' ? 'bg-blue-50 text-blue-600' : ent.type === 'CONSIGNEE' ? 'bg-emerald-50 text-emerald-600' : 'bg-indigo-50 text-indigo-600'}`}>{ent.type}</span>
                        <div>
                          <p className="text-sm font-black text-slate-800">{ent.name}</p>
                          <p className="text-[10px] text-slate-400 truncate max-w-[300px]">{ent.content}</p>
                          {ent.type === 'CONSIGNEE' && (
                            <div className="flex flex-wrap gap-2 mt-1">
                              {ent.taxId && <span className="text-[9px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-500 font-bold">TAX ID: {ent.taxId}</span>}
                              {ent.tel && <span className="text-[9px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-500 font-bold">TEL: {ent.tel}</span>}
                              {ent.attn && <span className="text-[9px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-500 font-bold">ATTN: {ent.attn}</span>}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => setEditingEntity(ent)} className="p-2 text-slate-400 hover:text-blue-600"><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg></button>
                        <button onClick={() => { 
                          const filtered = entities.filter(e => e.id !== ent.id);
                          saveEntities(filtered); 
                          deleteRecipient(ent.id);
                        }} className="p-2 text-slate-400 hover:text-rose-600"><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default NationalInvoice;
