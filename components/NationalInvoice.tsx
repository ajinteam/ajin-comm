
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  NationalInvoiceSubCategory, 
  UserAccount, 
  ViewState, 
  NationalInvoiceItem, 
  NationalInvoiceRow,
  NationalEntity
} from '../types';
import { saveSingleDoc, deleteSingleDoc, saveRecipient, deleteRecipient } from '../supabase';

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
      { id: 'h1', type: 'HEADER', headerLeft: 'TOY TRAIN PARTS SAMPLE', headerRight: 'EX.FACTORY', fontSize: 11, isBold: true, pkgNo: 'ADDRESS' },
      { id: '1', type: 'ITEM', description: '', quantity: '', unit: 'PCS', price: '', amount: '', fontSize: 10.5, isBold: false, pkgNo: '' },
      { id: '2', type: 'ITEM', description: '', quantity: '', unit: 'PCS', price: '', amount: '', fontSize: 10.5, isBold: false, pkgNo: '' },
      { id: '3', type: 'ITEM', description: '', quantity: '', unit: 'PCS', price: '', amount: '', fontSize: 10.5, isBold: false, pkgNo: '' },
      { id: '4', type: 'ITEM', description: '', quantity: '', unit: 'PCS', price: '', amount: '', fontSize: 10.5, isBold: false, pkgNo: '' },
      { id: '5', type: 'ITEM', description: '', quantity: '', unit: 'PCS', price: '', amount: '', fontSize: 10.5, isBold: false, pkgNo: '' },
      { id: 't1', type: 'TOTAL', description: 'TOTAL', quantity: '0', unit: 'UNIT', price: '', amount: '0', fontSize: 11, isBold: true }
    ],
    invoiceType: 'COMMERCIAL',
    currency: 'JPY',
    currencySymbol: '¥',
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
    footerTel: '(82-2) 894-2611',
    footerFax: '(82-2) 802-9941',
    signedBy: 'AJIN PRECISION MFG., INC.',
    signedTitle: 'MANAGING DIRECTOR CHO, MOO-YEON.',
    signatureName: 'MOO YEUN-CHO'
  });

  const [formData, setFormData] = useState<Partial<NationalInvoiceItem>>(getInitialFormData());

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
        }
      } else {
        // No editId means "New Invoice"
        // Only reset if we are currently showing an existing document
        if (formData.id) {
          setFormData(getInitialFormData());
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
      quantity: '',
      unit: type === 'ITEM' ? 'PCS' : (type === 'TOTAL' ? 'UNIT' : ''),
      price: '',
      amount: '',
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

  const handleRowChange = (id: string, field: keyof NationalInvoiceRow, value: any) => {
    setFormData(prev => {
      let newRows = (prev.rows || []).map(r => {
        if (r.id === id) {
          let val = value;
          if (field === 'quantity' || field === 'price' || field === 'amount') {
            val = parseNumber(value);
          }
          const updated = { ...r, [field]: val };
          if (r.type === 'ITEM' && (field === 'quantity' || field === 'price')) {
            const q = parseFloat(parseNumber(updated.quantity || '0')) || 0;
            const p = parseFloat(parseNumber(updated.price || '0')) || 0;
            updated.amount = (q * p).toFixed(2);
          }
          return updated;
        }
        return r;
      });
      
      // Recalculate subtotals (TOTAL rows)
      // A TOTAL row sums all ITEM amounts above it since the previous TOTAL row (or start)
      let runningAmt = 0;
      let runningQty = 0;
      newRows = newRows.map((r, idx) => {
        if (r.type === 'ITEM') {
          runningAmt += parseFloat(parseNumber(r.amount || '0')) || 0;
          runningQty += parseFloat(parseNumber(r.quantity || '0')) || 0;
          return r;
        } else if (r.type === 'TOTAL') {
          const updated = { ...r, amount: runningAmt.toFixed(2), quantity: runningQty.toString() };
          // Reset running totals after each subtotal
          runningAmt = 0;
          runningQty = 0;
          return updated;
        }
        return r;
      });

      const grandTotalAmt = newRows.filter(r => r.type === 'ITEM').reduce((acc, r) => acc + (parseFloat(parseNumber(r.amount || '0')) || 0), 0);
      const grandTotalQty = newRows.filter(r => r.type === 'ITEM').reduce((acc, r) => acc + (parseFloat(parseNumber(r.quantity || '0')) || 0), 0);
      
      return { ...prev, rows: newRows, totalAmount: grandTotalAmt.toFixed(2), totalQuantity: grandTotalQty.toString() };
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent, rowId: string, field: string) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter'].includes(e.key)) {
      if (e.key === 'Enter' && e.shiftKey) return;
      
      const inputs = Array.from(document.querySelectorAll('.invoice-table-input')) as HTMLInputElement[];
      const currentIndex = inputs.indexOf(e.target as HTMLInputElement);
      
      if (currentIndex === -1) return;

      let nextIndex = -1;
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        // Find input in the same column in the next row
        // This is tricky with varying row types. Let's just go to the next input.
        nextIndex = currentIndex + 1;
      } else if (e.key === 'ArrowUp') {
        nextIndex = currentIndex - 1;
      } else if (e.key === 'ArrowRight') {
        nextIndex = currentIndex + 1;
      } else if (e.key === 'ArrowLeft') {
        nextIndex = currentIndex - 1;
      }

      if (nextIndex >= 0 && nextIndex < inputs.length) {
        e.preventDefault();
        inputs[nextIndex].focus();
      }
    }
  };

  const handleCurrencyChange = (curr: 'USD' | 'EUR' | 'KRW' | 'JPY' | 'VND') => {
    const symbols = { USD: '$', EUR: '€', KRW: '₩', JPY: '¥', VND: '₫' };
    setFormData(prev => ({ ...prev, currency: curr, currencySymbol: symbols[curr] }));
  };

  const handleSave = async (status: NationalInvoiceSubCategory) => {
    const isUpdate = !!formData.id;
    const isCompleting = status === NationalInvoiceSubCategory.COMPLETED;
    const wasAlreadyCompleted = formData.status === NationalInvoiceSubCategory.COMPLETED;
    
    const newItem: NationalInvoiceItem = {
      ...(formData as NationalInvoiceItem),
      id: isUpdate ? formData.id! : `ni-${Date.now()}`,
      status,
      authorId: currentUser.id,
      createdAt: isUpdate ? formData.createdAt! : new Date().toISOString(),
      ...(isCompleting && !wasAlreadyCompleted ? {
        completedByInitials: currentUser.initials,
        completedAt: new Date().toISOString()
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
    const updated = items.filter(it => it.id !== id);
    saveItems(updated);
    deleteSingleDoc('nationalinvoice', id);
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
        idCode: entity.extra || '',
        footerTel: tel,
        footerFax: fax
      }));
    } else if (entity.type === 'CONSIGNEE') {
      setFormData(prev => ({ 
        ...prev, 
        consigneeName: entity.name, 
        consigneeAddress: entity.content,
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
      id: editingEntity.id || `ent-${Date.now()}`,
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

  const handlePrint = useCallback(() => {
    const win = window.open('', '_blank');
    if (win) {
      const rowsHtml = (formData.rows || []).map(row => {
        const rowStyle = `font-size: ${row.fontSize || 10.5}px; font-weight: ${row.isBold ? 'bold' : 'normal'}; min-height: ${row.fontSize ? row.fontSize * 2.5 : 25}px;`;
        const borderStyle = `none;`; 
        
        if (row.type === 'HEADER') {
          return `
            <tr style="${rowStyle}">
              <td style="${borderStyle} padding: 4px 8px; text-align: center; text-decoration: underline;">${row.pkgNo || ''}</td>
              <td style="${borderStyle} padding: 4px 8px; text-decoration: underline;">
                ${row.headerLeft || ''}
              </td>
              <td style="${borderStyle} padding: 4px 8px;"></td>
              <td colspan="2" style="${borderStyle} padding: 4px 8px; text-align: left; text-decoration: underline;">
                ${row.headerRight || ''}
              </td>
            </tr>
          `;
        } else if (row.type === 'TOTAL') {
          const totalBorderStyle = `border: none; border-top: 1px solid black;`;
          return `
            <tr style="${rowStyle}">
              <td style="${totalBorderStyle} padding: 4px 8px;"></td>
              <td style="${totalBorderStyle} padding: 4px 8px; text-align: right;">${row.description || 'TOTAL'}</td>
              <td style="${totalBorderStyle} padding: 4px 8px; text-align: right;">${formatNumber(row.quantity) || ''} ${row.unit || ''}</td>
              <td style="${totalBorderStyle} padding: 4px 8px;"></td>
              <td style="${totalBorderStyle} padding: 4px 8px; text-align: right;">${row.unit ? (formData.currencySymbol + (formatNumber(row.amount) || '0.00')) : ''}</td>
            </tr>
          `;
        }
        return `
          <tr style="${rowStyle}">
            <td style="${borderStyle} padding: 4px 8px; text-align: center;">${row.pkgNo || ''}</td>
            <td style="${borderStyle} padding: 4px 8px; white-space: pre-wrap;">${row.description || ''}</td>
            <td style="${borderStyle} padding: 4px 8px; text-align: right;">${formatNumber(row.quantity) || ''} ${row.unit || ''}</td>
            <td style="${borderStyle} padding: 4px 8px; text-align: right;">${row.unit ? (formData.currencySymbol + (formatNumber(row.price) || '')) : ''}</td>
            <td style="${borderStyle} padding: 4px 8px; text-align: right;">${row.unit ? (formData.currencySymbol + (formatNumber(row.amount) || '0.00')) : ''}</td>
          </tr>
        `;
      }).join('');

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
            const total = Math.ceil(document.body.scrollHeight / 1010); 
            document.querySelectorAll('.page-total').forEach(el => el.textContent = total);
            window.print(); 
            window.close();
          ">
            <div class="header-title">${formData.invoiceType} INVOICE</div>
            
            <table style="margin-top: 0; border: none;">
              <thead>
                <tr>
                  <td style="border: none; padding: 0;">
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
                        <div class="content-medium">${formData.poNo || ''}</div>
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
                  </td>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style="border: none; padding: 0;">
                    <table style="margin-top: 0;">
                      <thead>
                        <tr>
                          <th style="width: 20%;">SHIPPING MARK</th>
                          <th style="width: 40%;">NO. & KINDS OF PKGS; GOODS DESCRIPTION</th>
                          <th style="width: 15%;">QUANTITY</th>
                          <th style="width: 10%;">PRICE</th>
                          <th style="width: 15%;">AMOUNT</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${rowsHtml}
                        <tr style="font-weight: 900; border-top: 1.5px solid black; font-size: 11px;">
                          <td colspan="2" style="padding: 11px 8px; text-align: right;">GRAND TOTAL</td>
                          <td style="padding: 11px 8px; text-align: center;">${formatNumber(formData.totalQuantity) || ''}</td>
                          <td style="padding: 11px 8px;"></td>
                          <td style="padding: 11px 8px; text-align: right;">${formData.currencySymbol}${formatNumber(formData.totalAmount) || '0.00'}</td>
                        </tr>
                      </tbody>
                    </table>

                    <div style="margin-top: 15px; text-align: center; font-weight: 900; border-top: 1px solid #eee; border-bottom: 1px solid #eee; padding: 8px 0;">
                      ${formData.trackingNo || ''}
                    </div>
                    
                    <div style="margin-top: 8px; font-size: 8px; color: #000; white-space: pre-wrap;">
                      ${formData.remarks || ''}
                    </div>

                    <div style="height: 40px;"></div> <!-- 문단 사이 한 칸 띄우기 -->

                    <div style="margin-top: 30px; display: flex; justify-content: space-between; align-items: flex-start; width: 100%; border-top: 1px solid black; padding-top: 10px;">
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
                  </td>
                </tr>
              </tbody>
            </table>
          </body>
        </html>
      `);
      win.document.close();
      window.close();
    }
  }, [formData, formatNumber]);

  const renderListView = () => {
    const filtered = items.filter(item => {
      if (item.status !== sub) return false;
      if (!searchTerm) return true;
      
      const term = searchTerm.toLowerCase();
      const matchConsignee = (item.consigneeName || '').toLowerCase().includes(term);
      const matchInvoiceNo = (item.invoiceNo || '').toLowerCase().includes(term);
      const matchItems = (item.rows || []).some(row => (row.description || '').toLowerCase().includes(term));
      
      return matchConsignee || matchInvoiceNo || matchItems;
    }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const totalPages = Math.ceil(filtered.length / itemsPerPage);
    const paginatedItems = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    return (
      <div className="space-y-6 text-left pb-12">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
          <div>
            <h2 className="text-3xl font-black text-slate-900">{sub}</h2>
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
                {isMaster && (
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
                        {isMaster && (
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
    <div className="max-w-5xl mx-auto space-y-8 pb-20 animate-in fade-in duration-500">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Great+Vibes&display=swap');
        .signature-font { font-family: 'Brush Script Std', cursive; }
        .invoice-grid { display: grid; grid-template-columns: 1.5fr 1fr 1.5fr 1fr; border: 1px solid #000; }
        .invoice-cell { border: 1px solid #000; padding: 8px; font-size: 11px; }
        .invoice-label { font-size: 10px; font-weight: 900; text-transform: uppercase; margin-bottom: 4px; display: block; }
        .invoice-input { width: 100%; border: none; outline: none; background: transparent; font-weight: 600; font-size: 10.5px; }
        .invoice-input-bold { width: 100%; border: none; outline: none; background: transparent; font-size: 18px; font-weight: 900; text-transform: uppercase; }
        .invoice-input-large { width: 100%; border: none; outline: none; background: transparent; font-size: 24px; font-weight: 900; text-align: center; }
        .invoice-textarea { width: 100%; border: none; outline: none; background: transparent; font-weight: 400; resize: none; min-height: 40px; font-size: 10.5px; }
        .invoice-textarea-bold { width: 100%; border: none; outline: none; background: transparent; font-size: 18px; font-weight: 900; text-transform: uppercase; resize: none; min-height: 80px; }
        .invoice-table-input { font-size: 10.5px !important; }
      `}</style>

      <div className="flex justify-between items-center no-print">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setView({ type: 'NATIONAL_INVOICE', sub: formData.status || NationalInvoiceSubCategory.TEMPORARY })}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl font-bold text-sm hover:bg-slate-50 transition-all shadow-sm"
          >
            
            ← 닫기
          </button>
          <div className="flex items-center gap-4">
            <select 
              className="text-4xl font-black text-slate-900 tracking-tighter bg-transparent border-none outline-none cursor-pointer hover:text-blue-600 transition-colors"
              value={formData.invoiceType || 'COMMERCIAL'}
              onChange={(e) => setFormData(prev => ({ ...prev, invoiceType: e.target.value as any }))}
            >
              <option value="SAMPLE">SAMPLE</option>
              <option value="COMMERCIAL">COMMERCIAL</option>
            </select>
            <h1 className="text-4xl font-black text-slate-900 tracking-tighter">INVOICE</h1>
          </div>

          <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl no-print">
            {(['USD', 'EUR', 'KRW', 'JPY', 'VND'] as const).map(c => (
              <button 
                key={c}
                onClick={() => handleCurrencyChange(c)}
                className={`px-3 py-1 rounded-lg text-[10px] font-black transition-all ${formData.currency === c ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-3">
          <button onClick={handlePrint} className="px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl font-bold text-sm hover:bg-slate-50 transition-colors flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
            인쇄 / PDF
          </button>
          <button onClick={() => setIsEntityModalOpen(true)} className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-bold text-sm hover:bg-slate-200 transition-colors">보관함 관리</button>
          <button onClick={() => handleSave(NationalInvoiceSubCategory.TEMPORARY)} className="px-4 py-2 bg-amber-500 text-white rounded-xl font-bold text-sm shadow-lg shadow-amber-500/20">임시저장</button>
          <button onClick={() => handleSave(NationalInvoiceSubCategory.COMPLETED)} className="px-6 py-2 bg-blue-600 text-white rounded-xl font-bold text-sm shadow-lg shadow-blue-500/20">작성완료</button>
        </div>
      </div>

      <div className="bg-white shadow-2xl rounded-sm overflow-hidden border border-slate-200 p-10">
        <div className="national-invoice-print">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-black underline tracking-widest">{formData.invoiceType} INVOICE</h2>
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
        className="invoice-input-bold w-full" 
        value={formData.shipperName || ''} 
        onChange={(e) => setFormData(prev => ({ ...prev, shipperName: e.target.value }))}
        placeholder="COMPANY NAME"
      />
      
      {/* 주소 입력 (병합되어 이제 가로로 더 넓게 쓸 수 있습니다) */}
      <textarea 
        className="invoice-textarea w-full" 
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
      className="invoice-input text-right !bg-transparent font-bold" 
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
    <input className="invoice-input" value={formData.invoiceNo || ''} onChange={(e) => setFormData(prev => ({ ...prev, invoiceNo: e.target.value }))} placeholder="AJI-2001004" />
    <div className="flex flex-col items-end">
      <input type="date" className="invoice-input text-[10px]" value={formData.invoiceDate || ''} onChange={(e) => setFormData(prev => ({ ...prev, invoiceDate: e.target.value }))} />
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
  <input className="invoice-input" value={formData.poNo || ''} onChange={(e) => setFormData(prev => ({ ...prev, poNo: e.target.value }))} />
</div>

{/* Row 2 Right: FACTORY OUT (PAGE 아래인 4번 위치로 고정) */}
<div className="invoice-cell" style={{ gridColumn: '4', gridRow: '2' }}>
  <label className="invoice-label text-center">DATE OF FACTORY OUT</label>
  <div className="flex flex-col items-center">
    <input type="date" className="invoice-input-medium text-lg" value={formData.factoryOutDate || ''} onChange={(e) => setFormData(prev => ({ ...prev, factoryOutDate: e.target.value }))} />
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
                className="invoice-input-bold" 
                value={formData.consigneeName || ''} 
                onChange={(e) => setFormData(prev => ({ ...prev, consigneeName: e.target.value }))}
                placeholder="COMPANY NAME"
              />
              <textarea className="invoice-textarea" value={formData.consigneeAddress || ''} onChange={(e) => setFormData(prev => ({ ...prev, consigneeAddress: e.target.value }))} placeholder="ADDRESS & CONTACT" />
              <div className="mt-1 space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-black text-slate-400 w-12">TAX ID:</span>
                  <input className="invoice-input font-bold" value={formData.consigneeTaxId || ''} onChange={(e) => setFormData(prev => ({ ...prev, consigneeTaxId: e.target.value }))} placeholder="TAX ID" />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-black text-slate-400 w-12">TEL:</span>
                  <input className="invoice-input font-bold" value={formData.consigneeTel || ''} onChange={(e) => setFormData(prev => ({ ...prev, consigneeTel: e.target.value }))} placeholder="TEL" />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-black text-slate-400 w-12">ATTN:</span>
                  <input className="invoice-input font-black" value={formData.consigneeAttn || ''} onChange={(e) => setFormData(prev => ({ ...prev, consigneeAttn: e.target.value }))} placeholder="ATTN" />
                </div>
              </div>
            </div>

            {/* Row 3 Right: Buyer */}
            <div className="invoice-cell" style={{ gridColumn: '3 / span 2' }}>
              <label className="invoice-label">BUYER (IF OTHER THAN CONSIGNEE)</label>
              <textarea className="invoice-textarea min-h-[30px] text-center" value={formData.buyer || ''} onChange={(e) => setFormData(prev => ({ ...prev, buyer: e.target.value }))} />
            </div>

            {/* Row 4-6 Right: Other Reference */}
            <div className="invoice-cell" style={{ gridColumn: '3 / span 2', gridRow: '4 / span 3' }}>
              <label className="invoice-label">OTHER REFERENCE</label>
              <textarea className="invoice-textarea min-h-[80px]" value={formData.otherRef || ''} onChange={(e) => setFormData(prev => ({ ...prev, otherRef: e.target.value }))} />
            </div>

            {/* Row 6 Left: Departure Date */}
            <div className="invoice-cell" style={{ gridColumn: '1 / span 2', gridRow: '6' }}>
              <label className="invoice-label">DEPARTURE DATE</label>
              <div className="flex flex-col items-center">
                <input type="date" className="invoice-input text-center font-black text-lg" value={formData.departureDate || ''} onChange={(e) => setFormData(prev => ({ ...prev, departureDate: e.target.value }))} />
                <span className="text-[10px] text-blue-500 font-bold">{formatDateToEnglish(formData.departureDate || '')}</span>
              </div>
            </div>

            {/* Row 7 Left: Vessel & From */}
            <div className="invoice-cell" style={{ gridColumn: '1' }}>
              <label className="invoice-label">VESSEL/ FLIGHT</label>
              <div className="flex gap-1">
                <input className="invoice-input text-center" value={formData.vesselFlight || ''} onChange={(e) => setFormData(prev => ({ ...prev, vesselFlight: e.target.value }))} placeholder="FEDEX" />
                <select className="text-[9px] bg-slate-50 border border-slate-200 rounded px-1 no-print" value={formData.vesselFlight || ''} onChange={(e) => setFormData(prev => ({ ...prev, vesselFlight: e.target.value }))}>
                  <option value="">선택</option>
                  <option value="FEDEX">FEDEX</option>
                  <option value="DHL">DHL</option>
                  <option value="UPS">UPS</option>
                  <option value="BY SEA">BY SEA</option>
                  <option value="BY AIR">BY AIR</option>
                </select>
              </div>
            </div>
            <div className="invoice-cell" style={{ gridColumn: '2' }}>
              <label className="invoice-label">FROM</label>
              <div className="flex gap-1">
                <input className="invoice-input text-center" value={formData.from || ''} onChange={(e) => setFormData(prev => ({ ...prev, from: e.target.value }))} />
                <select className="text-[9px] bg-slate-50 border border-slate-200 rounded px-1 no-print" value={formData.from || ''} onChange={(e) => setFormData(prev => ({ ...prev, from: e.target.value }))}>
                  <option value="">선택</option>
                  <option value="SEOUL, KOREA">SEOUL, KOREA</option>
                  <option value="VINH PHUC, VIETNAM">VINH PHUC, VIETNAM</option>
                  <option value="BORYEONG, KOREA">BORYEONG, KOREA</option>
                </select>
              </div>
            </div>

            {/* Row 7-8 Right: Terms */}
            <div className="invoice-cell" style={{ gridColumn: '3 / span 2', gridRow: '7 / span 2' }}>
              <label className="invoice-label">TERMS OF DELIVERY AND PAYMENT</label>
              <textarea className="invoice-textarea min-h-[60px] text-center" value={formData.deliveryTerms || ''} onChange={(e) => setFormData(prev => ({ ...prev, deliveryTerms: e.target.value }))} />
            </div>

            {/* Row 8 Left: To */}
            <div className="invoice-cell" style={{ gridColumn: '1 / span 2' }}>
              <label className="invoice-label">TO</label>
              <div className="flex gap-1">
                <input className="invoice-input text-center" value={formData.to || ''} onChange={(e) => setFormData(prev => ({ ...prev, to: e.target.value }))} />
                <select className="text-[9px] bg-slate-50 border border-slate-200 rounded px-1 no-print" value={formData.to || ''} onChange={(e) => setFormData(prev => ({ ...prev, to: e.target.value }))}>
                  <option value="">선택</option>
                  <option value="TOKYO, JAPAN">TOKYO, JAPAN</option>
                  <option value="SEOUL, KOREA">SEOUL, KOREA</option>
                  <option value="VINH PHUC, VIETNAM">VINH PHUC, VIETNAM</option>
                  <option value="SCHLLABRUCH 34A, GERMANY">SCHLLABRUCH 34A, GERMANY</option>
                  <option value="TSURUGASHIMA-SHI, SAITAMA, JAPAN">TSURUGASHIMA-SHI, JAPAN</option>
                </select>
              </div>
            </div>
          </div>

          <table className="w-full border-collapse border border-black mt-4 font-['Gulim',_sans-serif]">
            <thead>
              <tr className="bg-slate-50">
                <th className="border border-black p-2 text-[10.5px] font-black w-32">SHIPPING MARK</th>
                <th className="border border-black p-2 text-[10.5px] font-black">NO. & KINDS OF PKGS; GOODS DESCRIPTION</th>
                <th className="border border-black p-2 text-[10.5px] font-black w-32">QUANTITY</th>
                <th className="border border-black p-2 text-[10.5px] font-black w-24">PRICE</th>
                <th className="border border-black p-2 text-[10.5px] font-black w-24">AMOUNT</th>
              </tr>
            </thead>
            <tbody>
              {(formData.rows || []).map((row, idx) => (
                <tr key={row.id} className={`group/row ${selectedRowId === row.id ? 'bg-sky-50/30' : ''}`}>
                  {row.type === 'HEADER' ? (
                    <>
                      <td className="border border-black p-1">
                        <input 
                          className="invoice-table-input invoice-input text-center font-black underline focus:bg-sky-100" 
                          style={{ fontSize: `${row.fontSize}px`, fontWeight: row.isBold ? 'bold' : 'normal' }}
                          value={row.pkgNo || ''} 
                          onChange={(e) => handleRowChange(row.id, 'pkgNo', e.target.value)} 
                          onKeyDown={(e) => handleKeyDown(e, row.id, 'pkgNo')}
                          onFocus={() => setSelectedRowId(row.id)}
                        />
                      </td>
                      <td className="border border-black p-1">
                        <div className="flex justify-between font-black underline">
                          <input 
                            className="invoice-table-input invoice-input focus:bg-sky-100" 
                            style={{ fontSize: `${row.fontSize}px`, fontWeight: row.isBold ? 'bold' : 'normal', minHeight: row.fontSize ? row.fontSize * 2 : 20 }}
                            value={row.headerLeft || ''} 
                            onChange={(e) => handleRowChange(row.id, 'headerLeft', e.target.value)} 
                            onKeyDown={(e) => handleKeyDown(e, row.id, 'headerLeft')}
                            onFocus={() => setSelectedRowId(row.id)}
                            placeholder="HEADER LEFT" 
                          />
                        </div>
                      </td>
                      <td className="border border-black p-1"></td>
                      <td colSpan={2} className="border border-black p-1">
                        <input 
                          className="invoice-table-input invoice-input text-left font-black underline focus:bg-sky-100" 
                          style={{ fontSize: `${row.fontSize}px`, fontWeight: row.isBold ? 'bold' : 'normal', minHeight: row.fontSize ? row.fontSize * 2 : 20 }}
                          value={row.headerRight || ''} 
                          onChange={(e) => handleRowChange(row.id, 'headerRight', e.target.value)} 
                          onKeyDown={(e) => handleKeyDown(e, row.id, 'headerRight')}
                          onFocus={() => setSelectedRowId(row.id)}
                          placeholder="HEADER RIGHT" 
                        />
                      </td>
                      <td className="relative w-0 p-0 border-none">
                        <div className={`absolute -right-10 top-1/2 -translate-y-1/2 flex items-center gap-1 transition-opacity no-print bg-white p-1 rounded-lg shadow-sm border border-slate-200 z-20 ${selectedRowId === row.id ? 'opacity-100' : 'opacity-0 group-hover/row:opacity-100'}`}>
                          <button onClick={() => handleRowChange(row.id, 'isBold', !row.isBold)} className={`p-1 w-6 rounded text-[10px] font-black ${row.isBold ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-900'}`}>B</button>
                        </div>
                      </td>
                    </>
                  ) : row.type === 'TOTAL' ? (
                    <>
                      <td className="border border-black border-t-2 p-1"></td>
                      <td className="border border-black border-t-2 p-1 text-right font-black">
                        <input 
                          className="invoice-table-input invoice-input text-right focus:bg-sky-100" 
                          style={{ fontSize: `10.5px`, fontWeight: 'bold', minHeight: '18px' }}
                          value={row.description || 'TOTAL'} 
                          onChange={(e) => handleRowChange(row.id, 'description', e.target.value)} 
                          onKeyDown={(e) => handleKeyDown(e, row.id, 'description')}
                          onFocus={() => setSelectedRowId(row.id)}
                        />
                      </td>
                      <td className="border border-black border-t-2 p-1">
                        <div className="flex items-center justify-center gap-1">
                          <input 
                            className="invoice-table-input invoice-input text-right font-black focus:bg-sky-100 w-16" 
                            style={{ fontSize: `10.5px`, fontWeight: 'bold' }}
                            value={formatNumber(row.quantity) || '0'} 
                            onChange={(e) => handleRowChange(row.id, 'quantity', e.target.value)} 
                            onKeyDown={(e) => handleKeyDown(e, row.id, 'quantity')}
                            onFocus={() => setSelectedRowId(row.id)}
                          />
                          <span className="text-[10.5px] font-black uppercase">{row.unit || 'UNIT'}</span>
                        </div>
                      </td>
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
                      <td className="border border-black p-1">
                        <textarea 
                          className="invoice-table-input invoice-textarea text-center focus:bg-sky-100" 
                          style={{ fontSize: `${row.fontSize}px`, fontWeight: row.isBold ? 'bold' : 'normal', minHeight: '18px' }}
                          value={row.pkgNo || ''} 
                          onChange={(e) => handleRowChange(row.id, 'pkgNo', e.target.value)} 
                          onKeyDown={(e) => handleKeyDown(e, row.id, 'pkgNo')}
                          onFocus={() => setSelectedRowId(row.id)}
                        />
                      </td>
                      <td className="border border-black p-1 relative">
                        <textarea 
                          className="invoice-table-input invoice-textarea focus:bg-sky-100" 
                          style={{ fontSize: `${row.fontSize}px`, fontWeight: row.isBold ? 'bold' : 'normal', minHeight: '18px' }}
                          value={row.description || ''} 
                          onChange={(e) => handleRowChange(row.id, 'description', e.target.value)} 
                          onKeyDown={(e) => handleKeyDown(e, row.id, 'description')}
                          onFocus={() => setSelectedRowId(row.id)}
                        />
                      </td>
                      <td className="border border-black p-1">
                        <div className="flex gap-1">
                          <input 
                            className="invoice-table-input invoice-input text-right focus:bg-sky-100" 
                            style={{ fontSize: `${row.fontSize}px`, fontWeight: row.isBold ? 'bold' : 'normal', minHeight: row.fontSize ? row.fontSize * 2 : 20 }}
                            value={formatNumber(row.quantity) || ''} 
                            onChange={(e) => handleRowChange(row.id, 'quantity', e.target.value)} 
                            onKeyDown={(e) => handleKeyDown(e, row.id, 'quantity')}
                            onFocus={() => setSelectedRowId(row.id)}
                          />
                          <div className="relative group/unit">
                            <input 
                              className="invoice-table-input invoice-input text-[10.5px] w-10 uppercase focus:bg-sky-100" 
                              value={row.unit || ''} 
                              onChange={(e) => handleRowChange(row.id, 'unit', e.target.value)} 
                              onKeyDown={(e) => handleKeyDown(e, row.id, 'unit')}
                              onFocus={() => setSelectedRowId(row.id)}
                              placeholder="UNIT" 
                            />
                            <div className="absolute left-0 top-full hidden group-focus-within/unit:block bg-white border shadow-lg z-10 min-w-[60px] no-print">
                              {['PCS', 'PKG', 'UNIT', 'SET', 'CTN', 'BOX', 'EA'].map(u => (
                                <button key={u} onClick={() => handleRowChange(row.id, 'unit', u)} className="block w-full text-left px-2 py-1 text-[10px] hover:bg-slate-100">{u}</button>
                              ))}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="border border-black p-1">
                        <div className="flex items-center">
                          <span className="text-[9px] mr-1">{row.unit ? formData.currencySymbol : ''}</span>
                          <input 
                            className="invoice-table-input invoice-input text-right focus:bg-sky-100" 
                            style={{ fontSize: `${row.fontSize}px`, fontWeight: row.isBold ? 'bold' : 'normal', minHeight: row.fontSize ? row.fontSize * 2 : 20 }}
                            value={formatNumber(row.price) || ''} 
                            onChange={(e) => handleRowChange(row.id, 'price', e.target.value)} 
                            onKeyDown={(e) => handleKeyDown(e, row.id, 'price')}
                            onFocus={() => setSelectedRowId(row.id)}
                          />
                        </div>
                      </td>
                      <td className="border border-black p-1 text-right relative">
                        <div className="font-bold" style={{ fontSize: `${row.fontSize}px`, fontWeight: row.isBold ? 'bold' : 'normal' }}>
                          {row.unit ? `${formData.currencySymbol}${formatNumber(row.amount)}` : ''}
                        </div>
                        <div className={`absolute -right-10 top-1/2 -translate-y-1/2 flex items-center gap-1 transition-opacity no-print bg-white p-1 rounded-lg shadow-sm border border-slate-200 z-20 ${selectedRowId === row.id ? 'opacity-100' : 'opacity-0 group-hover/row:opacity-100'}`}>
                          <button onClick={() => handleRowChange(row.id, 'isBold', !row.isBold)} className={`p-1 w-6 rounded text-[10px] font-black ${row.isBold ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-900'}`}>B</button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
              <tr className="bg-slate-50">
                <td colSpan={2} className="border border-black p-1 text-right font-black text-[10.5px]">GRAND TOTAL</td>
                <td className="border border-black p-1 text-center font-black text-[10.5px]">
                  <input className="invoice-table-input invoice-input text-center font-black" value={formatNumber(formData.totalQuantity) || '0'} onChange={(e) => setFormData(prev => ({ ...prev, totalQuantity: parseNumber(e.target.value) }))} />
                </td>
                <td className="border border-black p-1"></td>
                <td className="border border-black p-1 text-right font-black text-[10.5px] bg-slate-100">{formData.currencySymbol}{formatNumber(formData.totalAmount) || '0'}</td>
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
            <div className="text-center py-4 border-y border-slate-100">
              <input className="invoice-input text-center text-sm font-black" value={formData.trackingNo || ''} onChange={(e) => setFormData(prev => ({ ...prev, trackingNo: e.target.value }))} placeholder="*** TRACKING NO. ***" />
            </div>
            <textarea 
              ref={remarksRef}
              className="invoice-textarea w-full text-[10.5px] text-slate-800 overflow-hidden resize-none" 
              value={formData.remarks || ''} 
              onChange={(e) => setFormData(prev => ({ ...prev, remarks: e.target.value }))} 
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = 'auto';
                target.style.height = `${target.scrollHeight}px`;
              }}
              placeholder="REMARKS / FREE OF CHARGE ITEMS..." 
            />
          </div>

          <div className="mt-6 flex justify-between items-start border-t border-slate-200 pt-4">
            <div className="text-[10px] font-bold text-slate-800 space-y-0.5 mt-1">
              <div className="flex items-center gap-2">
                <span className="whitespace-nowrap">TELEPHONE NO.:</span>
                <input 
                  className="invoice-input font-bold p-0 min-w-[150px]" 
                  value={formData.footerTel || ''} 
                  onChange={(e) => setFormData(prev => ({ ...prev, footerTel: e.target.value }))} 
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="whitespace-nowrap">FACIMILE NO.:</span>
                <input 
                  className="invoice-input font-bold p-0 min-w-[150px]" 
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
              <input className="invoice-input text-sm font-black mb-0.5" value={formData.signedBy || ''} onChange={(e) => setFormData(prev => ({ ...prev, signedBy: e.target.value }))} placeholder="AJIN PRECISION MFG., INC." />
              
              <div className="flex items-center gap-4 mt-0.5">
                <input className="invoice-input text-[11px] font-bold flex-1" value={formData.signedTitle || ''} onChange={(e) => setFormData(prev => ({ ...prev, signedTitle: e.target.value }))} placeholder="MANAGING DIRECTOR CHO, MOO-YEON." />
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
                    <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">{editingEntity?.type === 'SIGNATURE' ? '직함' : 'ID CODE / 추가정보'}</label>
                    <input className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold" value={editingEntity?.extra || ''} onChange={(e) => setEditingEntity(prev => ({ ...prev, extra: e.target.value }))} />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">{editingEntity?.type === 'SIGNATURE' ? '서명 텍스트 (필기체로 표시됨)' : '주소 / 상세내용'}</label>
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
