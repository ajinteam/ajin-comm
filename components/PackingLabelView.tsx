import React, { useState, useEffect, useMemo } from 'react';
import { 
  PackingLabelDoc, 
  PackingLabelBox, 
  PackingLabelItemRow, 
  UserAccount, 
  ViewState, 
  NationalInvoiceSubCategory, 
  NationalInvoiceItem 
} from '../types';
import { printHtmlContent } from '../utils/printHelper';
import { saveSingleDoc, deleteSingleDoc } from '../supabase';

interface PackingLabelViewProps {
  currentUser: UserAccount;
  setView: (v: ViewState) => void;
  dataVersion?: number;
  initialInvoiceId?: string;
}

// Format quantity with thousand separator comma (e.g. 2387 -> 2,387)
export const formatQtyWithComma = (val: string | number | undefined): string => {
  if (val === undefined || val === null || val === '') return '';
  const str = String(val).trim();
  const clean = str.replace(/,/g, '');
  if (/^-?\d+(\.\d+)?$/.test(clean)) {
    const parts = clean.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return parts.join('.');
  }
  return str;
};

export const PackingLabelView: React.FC<PackingLabelViewProps> = ({
  currentUser,
  setView,
  dataVersion = 0,
  initialInvoiceId
}) => {
  const isMaster = currentUser.loginId === 'AJ5200';

  // Documents state
  const [docs, setDocs] = useState<PackingLabelDoc[]>([]);
  const [activeDoc, setActiveDoc] = useState<PackingLabelDoc | null>(null);
  const [viewMode, setViewMode] = useState<'ICON' | 'LIST'>('ICON');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBoxIds, setSelectedBoxIds] = useState<Set<string>>(new Set());

  // Invoice selector modal state
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [availableInvoices, setAvailableInvoices] = useState<NationalInvoiceItem[]>([]);

  // Load packing labels from storage
  const loadDocs = () => {
    try {
      const raw = localStorage.getItem('ajin_packing_labels');
      let list: PackingLabelDoc[] = raw ? JSON.parse(raw) : [];

      // Also check if any packing labels are stored in ajin_national_invoices with category PACKING_LABEL
      const nationalRaw = localStorage.getItem('ajin_national_invoices');
      if (nationalRaw) {
        try {
          const natList: any[] = JSON.parse(nationalRaw);
          const labelInvoices = natList.filter(item => item.status === NationalInvoiceSubCategory.PACKING_LABEL && item.boxes);
          labelInvoices.forEach(lbl => {
            if (!list.some(d => d.id === lbl.id)) {
              list.push(lbl);
            }
          });
        } catch (e) {
          console.error(e);
        }
      }

      setDocs(list);
    } catch (e) {
      console.error('Failed to load packing labels', e);
    }
  };

  // Load invoices for import
  const loadInvoices = () => {
    try {
      const raw = localStorage.getItem('ajin_national_invoices');
      if (raw) {
        const list: NationalInvoiceItem[] = JSON.parse(raw);
        setAvailableInvoices(list);
      }
    } catch (e) {
      console.error('Failed to load invoices', e);
    }
  };

  useEffect(() => {
    loadDocs();
    loadInvoices();
  }, [dataVersion]);

  // When opening an activeDoc, select all boxes by default
  useEffect(() => {
    if (activeDoc && activeDoc.boxes && activeDoc.boxes.length > 0) {
      setSelectedBoxIds(new Set(activeDoc.boxes.map(b => b.id)));
    }
  }, [activeDoc?.id]);

  // If initialInvoiceId is passed, automatically create or open packing label from that invoice
  useEffect(() => {
    if (initialInvoiceId && availableInvoices.length > 0) {
      const targetInv = availableInvoices.find(inv => inv.id === initialInvoiceId);
      if (targetInv) {
        const existing = docs.find(d => d.invoiceId === initialInvoiceId);
        if (existing) {
          setActiveDoc(existing);
        } else {
          createDocFromInvoice(targetInv);
        }
      }
    }
  }, [initialInvoiceId, availableInvoices, docs]);

  // Save all docs helper
  const saveDocsList = (newList: PackingLabelDoc[], updatedItem?: PackingLabelDoc) => {
    setDocs(newList);
    localStorage.setItem('ajin_packing_labels', JSON.stringify(newList));
    if (updatedItem) {
      saveSingleDoc('nationalinvoice', updatedItem, 'PACKING_LABEL');
    }
  };

  // Helper to parse carton rows from invoice
  const parseCartonsFromInvoice = (invoice: NationalInvoiceItem): PackingLabelBox[] => {
    const rows = invoice.packingRows || invoice.rows || [];
    const boxesMap: { [cartonNo: string]: PackingLabelBox } = {};

    let defaultModel = 'MODEL TRAIN PARTS';
    const headerRow = rows.find(r => r.type === 'HEADER' && r.headerLeft);
    if (headerRow && headerRow.headerLeft) {
      defaultModel = headerRow.headerLeft.replace(/^(MODEL|ITEM)\s*[:]?\s*/i, '').trim() || defaultModel;
    }

    rows.forEach(row => {
      if (row.type !== 'ITEM') return;

      const desc = row.description || '';
      const qty = formatQtyWithComma(row.quantity || '0');
      const unit = row.unit || 'PCS';
      const ctnRaw = (row.plProc || row.plPkgNo || row.pkgNo || '').trim();

      const rangeMatch = ctnRaw.match(/^(\d+)\s*[~-]\s*(\d+)$/);
      if (rangeMatch) {
        const start = parseInt(rangeMatch[1], 10);
        const end = parseInt(rangeMatch[2], 10);
        for (let i = start; i <= end; i++) {
          const ctnKey = String(i);
          if (!boxesMap[ctnKey]) {
            boxesMap[ctnKey] = {
              id: `box-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              cartonNo: ctnKey,
              model: defaultModel,
              items: [],
              madeIn: 'KOREA',
              layoutType: '4-UP',
              printCount: 1
            };
          }
          boxesMap[ctnKey].items.push({
            name: desc,
            qty: qty,
            unit: unit
          });
        }
      } else if (ctnRaw) {
        const ctnKey = ctnRaw;
        if (!boxesMap[ctnKey]) {
          boxesMap[ctnKey] = {
            id: `box-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            cartonNo: ctnKey,
            model: defaultModel,
            items: [],
            madeIn: 'KOREA',
            layoutType: '4-UP',
            printCount: 1
          };
        }
        boxesMap[ctnKey].items.push({
          name: desc,
          qty: qty,
          unit: unit
        });
      } else {
        const ctnKey = '1';
        if (!boxesMap[ctnKey]) {
          boxesMap[ctnKey] = {
            id: `box-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            cartonNo: ctnKey,
            model: defaultModel,
            items: [],
            madeIn: 'KOREA',
            layoutType: '4-UP',
            printCount: 1
          };
        }
        boxesMap[ctnKey].items.push({
          name: desc,
          qty: qty,
          unit: unit
        });
      }
    });

    const boxesList = Object.values(boxesMap);

    // Auto layout: If a box has 3 or more items, default to 2-UP
    boxesList.forEach(box => {
      if (box.items.length >= 3) {
        box.layoutType = '2-UP';
      }
    });

    // Sort boxes by carton number
    boxesList.sort((a, b) => {
      const numA = parseInt(a.cartonNo.replace(/\D/g, ''), 10) || 0;
      const numB = parseInt(b.cartonNo.replace(/\D/g, ''), 10) || 0;
      return numA - numB;
    });

    return boxesList.length > 0 ? boxesList : [
      {
        id: `box-1`,
        cartonNo: '1',
        model: defaultModel,
        items: [{ name: '', qty: '', unit: 'PCS' }],
        madeIn: 'KOREA',
        layoutType: '4-UP',
        printCount: 1
      }
    ];
  };

  // Create doc from an invoice
  const createDocFromInvoice = (invoice: NationalInvoiceItem) => {
    const boxes = parseCartonsFromInvoice(invoice);
    const newDoc: PackingLabelDoc = {
      id: `pl-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      status: NationalInvoiceSubCategory.PACKING_LABEL,
      invoiceId: invoice.id,
      invoiceNo: invoice.invoiceNo || '',
      date: invoice.invoiceDate || new Date().toISOString().split('T')[0],
      recipient: invoice.consigneeName || 'CONSIGNEE',
      authorId: currentUser.id || currentUser.loginId,
      authorInitials: currentUser.initials || currentUser.loginId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      defaultLayout: boxes.some(b => b.layoutType === '2-UP') ? '2-UP' : '4-UP',
      boxes: boxes
    };

    const newList = [newDoc, ...docs.filter(d => d.id !== newDoc.id)];
    saveDocsList(newList, newDoc);
    setActiveDoc(newDoc);
    setSelectedBoxIds(new Set(boxes.map(b => b.id)));
    setIsImportModalOpen(false);
  };

  // Create empty new doc
  const createBlankDoc = () => {
    const newDoc: PackingLabelDoc = {
      id: `pl-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      status: NationalInvoiceSubCategory.PACKING_LABEL,
      date: new Date().toISOString().split('T')[0],
      recipient: '',
      authorId: currentUser.id || currentUser.loginId,
      authorInitials: currentUser.initials || currentUser.loginId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      defaultLayout: '4-UP',
      boxes: [
        {
          id: `box-${Date.now()}-1`,
          cartonNo: '1',
          model: 'MODEL TRAIN PARTS',
          items: [{ name: '', qty: '', unit: 'PCS' }],
          madeIn: 'KOREA',
          layoutType: '4-UP',
          printCount: 1
        }
      ]
    };

    const newList = [newDoc, ...docs];
    saveDocsList(newList, newDoc);
    setActiveDoc(newDoc);
    setSelectedBoxIds(new Set(newDoc.boxes.map(b => b.id)));
  };

  // Save active doc edits
  const handleSaveActiveDoc = () => {
    if (!activeDoc) return;
    const updated = {
      ...activeDoc,
      updatedAt: new Date().toISOString()
    };
    const newList = docs.map(d => d.id === updated.id ? updated : d);
    if (!newList.some(d => d.id === updated.id)) {
      newList.unshift(updated);
    }
    saveDocsList(newList, updated);
    alert('패킹 라벨 문서가 안전하게 저장되었습니다.');
  };

  // Delete doc
  const handleDeleteDoc = (id: string) => {
    const docToDelete = docs.find(d => d.id === id);
    const newList = docs.filter(d => d.id !== id);
    saveDocsList(newList);
    if (docToDelete) {
      deleteSingleDoc('nationalinvoice', id, docToDelete);
    }
    if (activeDoc && activeDoc.id === id) {
      setActiveDoc(null);
    }
  };

  // Box selection & layout switch helpers
  const toggleBoxSelection = (boxId: string) => {
    setSelectedBoxIds(prev => {
      const next = new Set(prev);
      if (next.has(boxId)) {
        next.delete(boxId);
      } else {
        next.add(boxId);
      }
      return next;
    });
  };

  const selectAllBoxes = () => {
    if (!activeDoc) return;
    setSelectedBoxIds(new Set(activeDoc.boxes.map(b => b.id)));
  };

  const selectOnly4Up = () => {
    if (!activeDoc) return;
    const matched = activeDoc.boxes.filter(b => b.layoutType !== '2-UP');
    if (matched.length === 0) {
      alert('현재 4칸용지로 지정된 카톤이 없습니다.');
      return;
    }
    setSelectedBoxIds(new Set(matched.map(b => b.id)));
  };

  const selectOnly2Up = () => {
    if (!activeDoc) return;
    const matched = activeDoc.boxes.filter(b => b.layoutType === '2-UP');
    if (matched.length === 0) {
      alert('현재 2칸용지로 지정된 카톤이 없습니다.');
      return;
    }
    setSelectedBoxIds(new Set(matched.map(b => b.id)));
  };

  const clearSelection = () => {
    setSelectedBoxIds(new Set());
  };

  // Set all carton copy counts
  const setAllPrintCounts = (count: number) => {
    if (!activeDoc) return;
    setActiveDoc(prev => prev ? {
      ...prev,
      boxes: prev.boxes.map(b => ({ ...b, printCount: Math.max(1, count) }))
    } : null);
  };

  // Update single carton copy count
  const updateBoxPrintCount = (boxIdx: number, delta: number) => {
    if (!activeDoc) return;
    setActiveDoc(prev => {
      if (!prev) return null;
      const currentBox = prev.boxes[boxIdx];
      const newCount = Math.max(1, Math.min(99, (currentBox.printCount || 1) + delta));
      return {
        ...prev,
        boxes: prev.boxes.map((b, i) => i === boxIdx ? { ...b, printCount: newCount } : b)
      };
    });
  };

  const setBoxPrintCountDirect = (boxIdx: number, val: number) => {
    if (!activeDoc) return;
    const count = Math.max(1, Math.min(99, isNaN(val) ? 1 : val));
    setActiveDoc(prev => prev ? {
      ...prev,
      boxes: prev.boxes.map((b, i) => i === boxIdx ? { ...b, printCount: count } : b)
    } : null);
  };

  // Print Formtec Labels with landscape orientation, outer border removed, and multi-copy expansion
  const handlePrint = (
    docToPrint: PackingLabelDoc, 
    filterMode?: 'ALL' | '4-UP_ONLY' | '2-UP_ONLY'
  ) => {
    const allBoxes = docToPrint.boxes || [];
    if (allBoxes.length === 0) {
      alert('인쇄할 라벨 내용이 없습니다.');
      return;
    }

    // Determine target boxes based on filterMode or current selection
    let baseBoxes = allBoxes;

    if (filterMode === '4-UP_ONLY') {
      baseBoxes = allBoxes.filter(b => b.layoutType !== '2-UP');
      if (baseBoxes.length === 0) {
        alert('인쇄할 4칸 라벨 카톤이 없습니다.');
        return;
      }
    } else if (filterMode === '2-UP_ONLY') {
      baseBoxes = allBoxes.filter(b => b.layoutType === '2-UP');
      if (baseBoxes.length === 0) {
        alert('인쇄할 2칸 라벨 카톤이 없습니다.');
        return;
      }
    } else {
      // General print with active selection
      const activeSelection = selectedBoxIds;
      if (activeSelection && activeSelection.size > 0) {
        baseBoxes = allBoxes.filter(b => activeSelection.has(b.id));
      }
    }

    if (baseBoxes.length === 0) {
      baseBoxes = allBoxes;
      setSelectedBoxIds(new Set(allBoxes.map(b => b.id)));
    }

    // Expand boxes based on their printCount (인쇄 매수만큼 라벨 복제하여 순서대로 채움)
    const expandedBoxes4Up: PackingLabelBox[] = [];
    const expandedBoxes2Up: PackingLabelBox[] = [];

    baseBoxes.forEach(box => {
      const copies = Math.max(1, box.printCount || 1);
      const is2Up = box.layoutType === '2-UP';
      for (let c = 0; c < copies; c++) {
        if (is2Up) {
          expandedBoxes2Up.push(box);
        } else {
          expandedBoxes4Up.push(box);
        }
      }
    });

    // Helper to generate a single label HTML card with outer-border removed and row-compression for many items
    const renderLabelBoxHtml = (box: PackingLabelBox, is2Up: boolean) => {
      const itemCount = box.items.length;
      
      // Dynamic Smart Row Compression
      let baseFontSize = '18px';
      let headerFontSize = '16px';
      let ctnBadgeSize = '20px';
      let modelFontSize = '20px';
      let qtyFontSize = '22px';
      let madeFontSize = '18px';
      let tablePadding = '6px 10px';
      let lineHeight = '1.2';

      if (is2Up) {
        if (itemCount <= 2) {
          baseFontSize = '24px';
          headerFontSize = '21px';
          ctnBadgeSize = '24px';
          modelFontSize = '24px';
          qtyFontSize = '26px';
          madeFontSize = '22px';
          tablePadding = '10px 14px';
          lineHeight = '1.25';
        } else if (itemCount <= 4) {
          baseFontSize = '19px';
          headerFontSize = '17px';
          ctnBadgeSize = '21px';
          modelFontSize = '21px';
          qtyFontSize = '22px';
          madeFontSize = '19px';
          tablePadding = '6px 10px';
          lineHeight = '1.18';
        } else if (itemCount <= 6) {
          baseFontSize = '15px';
          headerFontSize = '14px';
          ctnBadgeSize = '17px';
          modelFontSize = '17px';
          qtyFontSize = '17px';
          madeFontSize = '15px';
          tablePadding = '3.5px 7px';
          lineHeight = '1.1';
        } else if (itemCount <= 8) {
          baseFontSize = '13px';
          headerFontSize = '12px';
          ctnBadgeSize = '15px';
          modelFontSize = '15px';
          qtyFontSize = '14.5px';
          madeFontSize = '13px';
          tablePadding = '2px 5px';
          lineHeight = '1.05';
        } else {
          baseFontSize = '11px';
          headerFontSize = '10.5px';
          ctnBadgeSize = '13px';
          modelFontSize = '13px';
          qtyFontSize = '12px';
          madeFontSize = '11.5px';
          tablePadding = '1.5px 4px';
          lineHeight = '1.0';
        }
      } else {
        if (itemCount <= 1) {
          baseFontSize = '19px';
          headerFontSize = '17px';
          ctnBadgeSize = '21px';
          modelFontSize = '21px';
          qtyFontSize = '22px';
          madeFontSize = '19px';
          tablePadding = '7px 10px';
          lineHeight = '1.2';
        } else if (itemCount === 2) {
          baseFontSize = '14px';
          headerFontSize = '13px';
          ctnBadgeSize = '16px';
          modelFontSize = '16px';
          qtyFontSize = '16px';
          madeFontSize = '14px';
          tablePadding = '3.5px 6px';
          lineHeight = '1.1';
        } else {
          baseFontSize = '11.5px';
          headerFontSize = '11px';
          ctnBadgeSize = '13px';
          modelFontSize = '13px';
          qtyFontSize = '13px';
          madeFontSize = '12px';
          tablePadding = '1.5px 4px';
          lineHeight = '1.0';
        }
      }

      const itemsHtml = box.items.map((item) => {
        const formattedQty = formatQtyWithComma(item.qty);
        return `
          <tr>
            <td class="lbl-th" style="font-size: ${headerFontSize}; padding: ${tablePadding};">NAME</td>
            <td class="lbl-td name-td" style="font-size: ${baseFontSize}; padding: ${tablePadding}; line-height: ${lineHeight};">${item.name || ''}</td>
          </tr>
          <tr>
            <td class="lbl-th" style="font-size: ${headerFontSize}; padding: ${tablePadding};">QTY</td>
            <td class="lbl-td qty-td" style="font-size: ${qtyFontSize}; padding: ${tablePadding}; font-weight: 900;">${formattedQty} ${item.unit || 'PCS'}</td>
          </tr>
        `;
      }).join('');

      return `
        <div class="label-card ${is2Up ? 'label-2up' : 'label-4up'}">
          <div class="ctn-header-badge" style="font-size: ${ctnBadgeSize};">
            <span>CTN NO. ${box.cartonNo || ''}</span>
          </div>
          <table class="label-inner-table">
            <tbody>
              <tr>
                <td class="lbl-th" style="width: 22%; font-size: ${headerFontSize}; padding: ${tablePadding};">MODEL</td>
                <td class="lbl-td model-td" style="width: 78%; font-size: ${modelFontSize}; font-weight: 900; padding: ${tablePadding}; line-height: ${lineHeight};">${box.model || ''}</td>
              </tr>
              ${itemsHtml}
              <tr>
                <td class="lbl-th" style="font-size: ${headerFontSize}; padding: ${tablePadding};">MADE</td>
                <td class="lbl-td made-td" style="font-size: ${madeFontSize}; font-weight: 900; padding: ${tablePadding}; letter-spacing: 2px;">${box.madeIn || 'KOREA'}</td>
              </tr>
            </tbody>
          </table>
        </div>
      `;
    };

    let pagesHtml = '';

    // 1. Render 4-UP Pages (Formtec 4-label on A4 Landscape, 2 columns x 2 rows)
    if (expandedBoxes4Up.length > 0) {
      for (let i = 0; i < expandedBoxes4Up.length; i += 4) {
        const pageBoxes = expandedBoxes4Up.slice(i, i + 4);
        while (pageBoxes.length < 4) {
          pageBoxes.push(null as any);
        }
        pagesHtml += `
          <div class="a4-page page-4up-landscape">
            ${pageBoxes.map(b => b ? renderLabelBoxHtml(b, false) : '<div class="label-card empty-card"></div>').join('')}
          </div>
        `;
      }
    }

    // 2. Render 2-UP Pages (Formtec 2-label on A4 Landscape, 2 columns x 1 row)
    if (expandedBoxes2Up.length > 0) {
      for (let i = 0; i < expandedBoxes2Up.length; i += 2) {
        const b1 = expandedBoxes2Up[i];
        const b2 = expandedBoxes2Up[i + 1];
        pagesHtml += `
          <div class="a4-page page-2up-landscape">
            ${b1 ? renderLabelBoxHtml(b1, true) : '<div class="label-card empty-card"></div>'}
            ${b2 ? renderLabelBoxHtml(b2, true) : '<div class="label-card empty-card"></div>'}
          </div>
        `;
      }
    }

    const docTitle = `PACKING_LABEL_${docToPrint.date}_${docToPrint.recipient || 'CONSIGNEE'}`.replace(/[/\\?%*:|"<>]/g, '-');

    const fullHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>${docTitle}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;700;900&family=Inter:wght@400;700;900&display=swap');
            
            @page {
              size: A4 landscape;
              margin: 7mm 8mm;
            }

            * {
              box-sizing: border-box;
            }

            body {
              font-family: 'Inter', 'Noto Sans KR', sans-serif;
              margin: 0;
              padding: 0;
              background: #fff;
              color: #000;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }

            .a4-page {
              width: 281mm;
              height: 196mm;
              page-break-after: always;
              display: flex;
              flex-direction: column;
              justify-content: space-between;
              margin-bottom: 20px;
            }

            @media print {
              @page {
                size: A4 landscape;
                margin: 7mm 8mm;
              }
              body {
                margin: 0;
                padding: 0;
              }
              .a4-page {
                width: 281mm;
                height: 196mm;
                margin-bottom: 0;
                page-break-after: always;
                break-after: page;
              }
            }

            /* 4-UP Landscape: 2 columns x 2 rows (Formtec 4-label) */
            .page-4up-landscape {
              display: grid;
              grid-template-columns: 1fr 1fr;
              grid-template-rows: 1fr 1fr;
              gap: 6mm 8mm;
              height: 194mm;
            }

            /* 2-UP Landscape: 2 columns x 1 row (Formtec 2-label wide) */
            .page-2up-landscape {
              display: grid;
              grid-template-columns: 1fr 1fr;
              grid-template-rows: 1fr;
              gap: 10mm;
              height: 194mm;
            }

            /* Outer card has NO border to fit Formtec sticker cut-lines cleanly */
            .label-card {
              border: none !important;
              padding: 1mm 2mm;
              display: flex;
              flex-direction: column;
              justify-content: flex-start;
              background: #fff;
              position: relative;
              overflow: hidden;
              height: 100%;
              max-height: 100%;
            }

            .empty-card {
              visibility: hidden;
            }

            .ctn-header-badge {
              display: flex;
              justify-content: flex-end;
              font-weight: 900;
              margin-bottom: 2.5px;
              letter-spacing: 0.5px;
              line-height: 1.1;
            }

            /* Main Table Grid with sharp crisp borders */
            .label-inner-table {
              width: 100%;
              border-collapse: collapse;
              border: 2px solid #000;
              flex-grow: 1;
              table-layout: fixed;
            }

            .label-inner-table td {
              border: 1.5px solid #000;
              vertical-align: middle;
              word-break: break-word;
              overflow-wrap: break-word;
            }

            .lbl-th {
              font-weight: 900;
              text-align: left;
              background-color: #fff;
              white-space: nowrap;
              letter-spacing: 1px;
            }

            .lbl-td {
              font-weight: 700;
              text-align: left;
            }

            .model-td {
              text-transform: uppercase;
              letter-spacing: 0.5px;
            }

            .name-td {
              line-height: 1.15;
            }

            .qty-td {
              font-weight: 900;
              letter-spacing: 0.5px;
            }

            .made-td {
              letter-spacing: 2px;
            }
          </style>
        </head>
        <body>
          ${pagesHtml}
        </body>
      </html>
    `;

    printHtmlContent(fullHtml, docTitle);
  };

  // Filtered documents
  const filteredDocs = useMemo(() => {
    return docs.filter(d => {
      if (!searchTerm) return true;
      const t = searchTerm.toLowerCase();
      const matchRecipient = (d.recipient || '').toLowerCase().includes(t);
      const matchDate = (d.date || '').toLowerCase().includes(t);
      const matchInvoiceNo = (d.invoiceNo || '').toLowerCase().includes(t);
      const matchBoxes = (d.boxes || []).some(b => 
        (b.model || '').toLowerCase().includes(t) ||
        (b.cartonNo || '').toLowerCase().includes(t) ||
        (b.items || []).some(it => (it.name || '').toLowerCase().includes(t))
      );
      return matchRecipient || matchDate || matchInvoiceNo || matchBoxes;
    }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [docs, searchTerm]);

  // If editing an active doc, render editor
  if (activeDoc) {
    const totalBoxesCount = activeDoc.boxes.length;
    
    // Calculate total label copies based on printCount
    const boxes4Up = activeDoc.boxes.filter(b => b.layoutType !== '2-UP');
    const boxes2Up = activeDoc.boxes.filter(b => b.layoutType === '2-UP');
    
    const total4UpCopies = boxes4Up.reduce((sum, b) => sum + (b.printCount || 1), 0);
    const total2UpCopies = boxes2Up.reduce((sum, b) => sum + (b.printCount || 1), 0);

    const selectedBoxes = activeDoc.boxes.filter(b => selectedBoxIds.has(b.id));
    const selectedCopies = selectedBoxes.reduce((sum, b) => sum + (b.printCount || 1), 0);

    return (
      <div className="space-y-6 text-left pb-16">
        {/* Editor Top Bar */}
        <div className="bg-white p-5 rounded-3xl border border-amber-200 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-3">
            {/* <- 닫기 Button */}
            <button
              onClick={() => setActiveDoc(null)}
              className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors flex items-center gap-1.5 font-bold text-xs md:text-sm shadow-2xs"
              title="목록으로 돌아가기"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              <span>닫기</span>
            </button>

            <div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-amber-100 text-amber-800 uppercase tracking-wider">
                  📦 PACKING LABEL
                </span>
                <span className="text-xs font-bold text-slate-400">
                  작성자: {activeDoc.authorInitials || activeDoc.authorId}
                </span>
              </div>
              <h1 className="text-xl md:text-2xl font-black text-slate-900 mt-1">
                {activeDoc.date} / {activeDoc.recipient || '(수신처 미지정)'}
              </h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            {/* Save Button */}
            <button
              onClick={handleSaveActiveDoc}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-black rounded-xl shadow-sm transition-all flex items-center gap-1.5"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
              </svg>
              저장
            </button>

            {/* Direct 4-UP Label Sheet Print */}
            {boxes4Up.length > 0 && (
              <button
                onClick={() => handlePrint(activeDoc, '4-UP_ONLY')}
                className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-black rounded-xl shadow-sm transition-all flex items-center gap-1.5"
                title="4칸 라벨용지에 지정된 매수만큼 인쇄합니다"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
                <span>4칸라벨 인쇄 (총 {total4UpCopies}장)</span>
              </button>
            )}

            {/* Direct 2-UP Label Sheet Print */}
            {boxes2Up.length > 0 && (
              <button
                onClick={() => handlePrint(activeDoc, '2-UP_ONLY')}
                className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-black rounded-xl shadow-sm transition-all flex items-center gap-1.5"
                title="2칸 라벨용지에 지정된 매수만큼 인쇄합니다"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
                <span>2칸라벨 인쇄 (총 {total2UpCopies}장)</span>
              </button>
            )}

            {/* Selected Print Button */}
            <button
              onClick={() => handlePrint(activeDoc, 'ALL')}
              className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-black rounded-xl shadow-md shadow-emerald-700/20 transition-all flex items-center gap-1.5"
              title="현재 선택된 카톤들을 각각의 4칸/2칸 규격에 맞춰 지정된 매수대로 인쇄"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              <span>선택 인쇄 (총 {selectedCopies > 0 ? selectedCopies : total4UpCopies + total2UpCopies}장)</span>
            </button>
          </div>
        </div>

        {/* Basic Document Info */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">인쇄 날짜</label>
            <input
              type="date"
              className="w-full px-3 py-2 border rounded-xl font-bold text-sm bg-slate-50 focus:bg-white outline-none focus:ring-2 focus:ring-amber-500"
              value={activeDoc.date || ''}
              onChange={(e) => setActiveDoc(prev => prev ? { ...prev, date: e.target.value } : null)}
            />
          </div>
          <div>
            <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">수신처 (CONSIGNEE)</label>
            <input
              type="text"
              className="w-full px-3 py-2 border rounded-xl font-bold text-sm bg-slate-50 focus:bg-white outline-none focus:ring-2 focus:ring-amber-500 uppercase"
              value={activeDoc.recipient || ''}
              onChange={(e) => setActiveDoc(prev => prev ? { ...prev, recipient: e.target.value } : null)}
              placeholder="예: AJIN TRAIN VINA CO., LTD"
            />
          </div>
          <div>
            <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">참조 인보이스 번호</label>
            <input
              type="text"
              className="w-full px-3 py-2 border rounded-xl font-bold text-sm bg-slate-50 focus:bg-white outline-none focus:ring-2 focus:ring-amber-500 uppercase"
              value={activeDoc.invoiceNo || ''}
              onChange={(e) => setActiveDoc(prev => prev ? { ...prev, invoiceNo: e.target.value } : null)}
              placeholder="예: AJI-2609027"
            />
          </div>
        </div>

        {/* Carton Boxes Section */}
        <div className="space-y-4">
          {/* Header Bar with Carton Selectors, Copy Batch Tools & Filters */}
          <div className="bg-amber-50/70 border border-amber-200 p-4 rounded-3xl flex flex-col lg:flex-row justify-between items-start lg:items-center gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
                <span>카톤별 라벨 목록</span>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-amber-200 text-amber-900">
                  총 {totalBoxesCount}개 카톤
                </span>
              </h2>
              <span className="text-xs font-bold text-slate-600">
                (4칸용지: <b className="text-blue-700">{boxes4Up.length}개 ({total4UpCopies}장)</b> / 2칸용지: <b className="text-amber-800">{boxes2Up.length}개 ({total2UpCopies}장)</b>)
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
              {/* Batch Copy Count Setters */}
              <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200 shadow-2xs text-[11px] font-bold">
                <span className="text-slate-400 px-1 text-[10px] font-black">매수 일괄:</span>
                <button
                  onClick={() => setAllPrintCounts(1)}
                  className="px-2 py-0.5 rounded-lg text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                  title="모든 카톤의 인쇄 매수를 1장으로 설정"
                >
                  각 1장
                </button>
                <button
                  onClick={() => setAllPrintCounts(2)}
                  className="px-2 py-0.5 rounded-lg text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                  title="모든 카톤의 인쇄 매수를 2장으로 설정"
                >
                  각 2장
                </button>
                <button
                  onClick={() => setAllPrintCounts(3)}
                  className="px-2 py-0.5 rounded-lg text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                  title="모든 카톤의 인쇄 매수를 3장으로 설정"
                >
                  각 3장
                </button>
              </div>

              {/* Filter Selection Buttons */}
              <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-amber-200 shadow-2xs">
                <button
                  onClick={selectAllBoxes}
                  className={`px-2.5 py-1 text-[11px] font-black rounded-lg transition-colors ${
                    selectedBoxIds.size === totalBoxesCount ? 'bg-amber-100 text-amber-900' : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  전체 선택
                </button>
                <button
                  onClick={selectOnly4Up}
                  className="px-2.5 py-1 text-[11px] font-black rounded-lg text-blue-700 hover:bg-blue-50 transition-colors"
                >
                  4칸만 선택
                </button>
                <button
                  onClick={selectOnly2Up}
                  className="px-2.5 py-1 text-[11px] font-black rounded-lg text-amber-800 hover:bg-amber-100 transition-colors"
                >
                  2칸만 선택
                </button>
                <button
                  onClick={clearSelection}
                  className="px-2.5 py-1 text-[11px] font-black rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                >
                  선택 해제
                </button>
              </div>

              <button
                onClick={() => {
                  const nextNo = String(activeDoc.boxes.length + 1);
                  const newBoxId = `box-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
                  const newBox: PackingLabelBox = {
                    id: newBoxId,
                    cartonNo: nextNo,
                    model: activeDoc.boxes[0]?.model || 'MODEL TRAIN PARTS',
                    items: [{ name: '', qty: '', unit: 'PCS' }],
                    madeIn: 'KOREA',
                    layoutType: '4-UP',
                    printCount: 1
                  };
                  setActiveDoc(prev => prev ? {
                    ...prev,
                    boxes: [...prev.boxes, newBox]
                  } : null);
                  setSelectedBoxIds(prev => new Set(prev).add(newBoxId));
                }}
                className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-black transition-all flex items-center gap-1 shadow-xs"
              >
                + 카톤 추가
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {activeDoc.boxes.map((box, boxIdx) => {
              const isSelected = selectedBoxIds.has(box.id);
              const printCopies = box.printCount || 1;

              return (
                <div 
                  key={box.id || boxIdx} 
                  className={`bg-white rounded-3xl border-2 transition-all p-5 shadow-sm space-y-3 relative ${
                    box.layoutType === '2-UP' 
                      ? isSelected ? 'border-amber-500 ring-2 ring-amber-500/20 bg-amber-50/15' : 'border-amber-300 opacity-60 bg-amber-50/5' 
                      : isSelected ? 'border-slate-800 ring-2 ring-slate-800/10' : 'border-slate-200 opacity-60'
                  }`}
                >
                  {/* Carton Header Bar */}
                  <div className="flex flex-wrap justify-between items-center border-b pb-2 gap-2">
                    <div className="flex items-center gap-2">
                      {/* Checkbox for Print selection */}
                      <label className="flex items-center gap-1.5 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleBoxSelection(box.id)}
                          className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 border-slate-300 cursor-pointer"
                        />
                        <span className={`text-xs font-black px-2 py-0.5 rounded-md transition-colors ${isSelected ? 'text-amber-800 bg-amber-200' : 'text-slate-400 bg-slate-100'}`}>
                          CTN #{box.cartonNo}
                        </span>
                      </label>

                      <input
                        type="text"
                        className="w-14 px-1.5 py-0.5 border rounded text-xs font-bold text-center"
                        value={box.cartonNo}
                        onChange={(e) => {
                          const val = e.target.value;
                          setActiveDoc(prev => prev ? {
                            ...prev,
                            boxes: prev.boxes.map((b, i) => i === boxIdx ? { ...b, cartonNo: val } : b)
                          } : null);
                        }}
                        placeholder="카톤"
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Print Copy Counter Stepper */}
                      <div className="flex items-center bg-slate-100 rounded-lg p-0.5 border border-slate-200">
                        <span className="text-[10px] font-black text-slate-500 px-1.5">인쇄</span>
                        <button
                          onClick={() => updateBoxPrintCount(boxIdx, -1)}
                          className="w-5 h-5 flex items-center justify-center rounded bg-white hover:bg-slate-200 text-slate-700 font-black text-xs shadow-2xs"
                          title="인쇄 매수 감소"
                        >
                          -
                        </button>
                        <input
                          type="number"
                          min={1}
                          max={99}
                          value={printCopies}
                          onChange={(e) => setBoxPrintCountDirect(boxIdx, parseInt(e.target.value, 10))}
                          className="w-8 text-center text-xs font-black bg-transparent outline-none py-0.5 text-slate-900"
                        />
                        <button
                          onClick={() => updateBoxPrintCount(boxIdx, 1)}
                          className="w-5 h-5 flex items-center justify-center rounded bg-white hover:bg-slate-200 text-slate-700 font-black text-xs shadow-2xs"
                          title="인쇄 매수 증가"
                        >
                          +
                        </button>
                        <span className="text-[10px] font-bold text-slate-500 pr-1">장</span>
                      </div>

                      {/* Layout Type Toggle: 2칸 라벨 vs 4칸 라벨 */}
                      <button
                        onClick={() => {
                          const newLayout = box.layoutType === '4-UP' ? '2-UP' : '4-UP';
                          setActiveDoc(prev => prev ? {
                            ...prev,
                            boxes: prev.boxes.map((b, i) => i === boxIdx ? { ...b, layoutType: newLayout } : b)
                          } : null);
                        }}
                        className={`text-[10px] font-black px-2 py-1 rounded-lg transition-colors flex items-center gap-1 ${
                          box.layoutType === '2-UP' 
                            ? 'bg-amber-600 text-white shadow-xs' 
                            : 'bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100'
                        }`}
                        title="클릭하여 4칸(4-UP)과 2칸(2-UP) 규격 전환"
                      >
                        <span>{box.layoutType === '2-UP' ? '2칸' : '4칸'}</span>
                      </button>

                      {/* Delete Carton Button */}
                      <button
                        onClick={() => {
                          if (confirm(`카톤 #${box.cartonNo} 라벨을 삭제하시겠습니까?`)) {
                            setActiveDoc(prev => prev ? {
                              ...prev,
                              boxes: prev.boxes.filter((_, i) => i !== boxIdx)
                            } : null);
                            setSelectedBoxIds(prev => {
                              const next = new Set(prev);
                              next.delete(box.id);
                              return next;
                            });
                          }
                        }}
                        className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                        title="카톤 삭제"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {/* Simulated Label Card Table Structure */}
                  <div className="border border-black rounded overflow-hidden">
                    <table className="w-full text-left border-collapse text-xs">
                      <tbody>
                        {/* MODEL ROW */}
                        <tr className="border-b border-black bg-slate-50/50">
                          <td className="w-24 border-r border-black p-2 font-black uppercase text-slate-800 align-middle">
                            MODEL
                          </td>
                          <td className="p-2">
                            <input
                              type="text"
                              className="w-full font-black uppercase outline-none bg-transparent"
                              value={box.model || ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                setActiveDoc(prev => prev ? {
                                  ...prev,
                                  boxes: prev.boxes.map((b, i) => i === boxIdx ? { ...b, model: val } : b)
                                } : null);
                              }}
                              placeholder="MODEL NAME"
                            />
                          </td>
                        </tr>

                        {/* ITEMS ROWS */}
                        {box.items.map((item, itIdx) => (
                          <React.Fragment key={itIdx}>
                            <tr className="border-b border-black">
                              <td className="border-r border-black p-2 font-black uppercase text-slate-800 align-middle flex items-center justify-between">
                                <span>NAME</span>
                                {box.items.length > 1 && (
                                  <button
                                    onClick={() => {
                                      setActiveDoc(prev => prev ? {
                                        ...prev,
                                        boxes: prev.boxes.map((b, i) => i === boxIdx ? {
                                          ...b,
                                          items: b.items.filter((_, idx) => idx !== itIdx)
                                        } : b)
                                      } : null);
                                    }}
                                    className="p-1 rounded text-rose-500 hover:text-rose-700 hover:bg-rose-50 font-black text-sm leading-none transition-colors"
                                    title="품목 삭제"
                                  >
                                    ✕
                                  </button>
                                )}
                              </td>
                              <td className="p-2">
                                <textarea
                                  className="w-full font-bold text-slate-900 outline-none bg-transparent resize-none leading-tight"
                                  rows={2}
                                  value={item.name || ''}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setActiveDoc(prev => prev ? {
                                      ...prev,
                                      boxes: prev.boxes.map((b, i) => i === boxIdx ? {
                                        ...b,
                                        items: b.items.map((it, idx) => idx === itIdx ? { ...it, name: val } : it)
                                      } : b)
                                    } : null);
                                  }}
                                  placeholder="ITEM NAME & DESCRIPTION"
                                />
                              </td>
                            </tr>
                            <tr className="border-b border-black bg-slate-50/30">
                              <td className="border-r border-black p-2 font-black uppercase text-slate-800 align-middle">
                                QTY
                              </td>
                              <td className="p-2 flex items-center gap-2">
                                <input
                                  type="text"
                                  className="font-black text-slate-900 outline-none bg-transparent flex-1"
                                  value={item.qty || ''}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setActiveDoc(prev => prev ? {
                                      ...prev,
                                      boxes: prev.boxes.map((b, i) => i === boxIdx ? {
                                        ...b,
                                        items: b.items.map((it, idx) => idx === itIdx ? { ...it, qty: val } : it)
                                      } : b)
                                    } : null);
                                  }}
                                  onBlur={(e) => {
                                    const formatted = formatQtyWithComma(e.target.value);
                                    if (formatted !== item.qty) {
                                      setActiveDoc(prev => prev ? {
                                        ...prev,
                                        boxes: prev.boxes.map((b, i) => i === boxIdx ? {
                                          ...b,
                                          items: b.items.map((it, idx) => idx === itIdx ? { ...it, qty: formatted } : it)
                                        } : b)
                                      } : null);
                                    }
                                  }}
                                  placeholder="1,200"
                                />
                                <input
                                  type="text"
                                  className="w-16 font-bold text-slate-500 text-center outline-none bg-transparent border-b border-dashed border-slate-300"
                                  value={item.unit || 'PCS'}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setActiveDoc(prev => prev ? {
                                      ...prev,
                                      boxes: prev.boxes.map((b, i) => i === boxIdx ? {
                                        ...b,
                                        items: b.items.map((it, idx) => idx === itIdx ? { ...it, unit: val } : it)
                                      } : b)
                                    } : null);
                                  }}
                                />
                              </td>
                            </tr>
                          </React.Fragment>
                        ))}

                        {/* MADE IN ROW */}
                        <tr className="bg-amber-50/40">
                          <td className="border-r border-black p-2 font-black uppercase text-slate-800 align-middle">
                            MADE
                          </td>
                          <td className="p-2">
                            <input
                              type="text"
                              className="w-full font-black uppercase outline-none bg-transparent tracking-widest text-slate-900"
                              value={box.madeIn || 'KOREA'}
                              onChange={(e) => {
                                const val = e.target.value;
                                setActiveDoc(prev => prev ? {
                                  ...prev,
                                  boxes: prev.boxes.map((b, i) => i === boxIdx ? { ...b, madeIn: val } : b)
                                } : null);
                              }}
                            />
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* Box Item Add Button */}
                  <div className="flex justify-between items-center pt-1">
                    <button
                      onClick={() => {
                        setActiveDoc(prev => prev ? {
                          ...prev,
                          boxes: prev.boxes.map((b, i) => i === boxIdx ? {
                            ...b,
                            items: [...b.items, { name: '', qty: '', unit: 'PCS' }]
                          } : b)
                        } : null);
                      }}
                      className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1"
                    >
                      + 품목 추가 (혼재 박스)
                    </button>

                    <span className="text-[10px] font-bold text-slate-400">
                      {box.items.length}개 품목 포함
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // Document List Screen
  return (
    <div className="space-y-6 text-left pb-16">
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-3">
            <span className="p-2.5 rounded-2xl bg-amber-500 text-white shadow-md shadow-amber-500/20">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
              </svg>
            </span>
            <div>
              <h1 className="text-3xl font-black text-slate-900">PACKING LABEL (패킹 라벨)</h1>
              <p className="text-slate-500 text-xs mt-0.5">폼텍 4칸 / 2칸 라벨용지 카톤박스 부착용 라벨 관리</p>
            </div>
          </div>

          <div className="flex items-center gap-4 mt-4">
            <p className="text-slate-500 text-xs font-bold">총 {filteredDocs.length}개 라벨 문서</p>
            <div className="h-4 w-[1px] bg-slate-300" />
            <div className="flex bg-slate-200 p-1 rounded-xl">
              <button
                onClick={() => setViewMode('ICON')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${viewMode === 'ICON' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
              >
                아이콘 보기
              </button>
              <button
                onClick={() => setViewMode('LIST')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${viewMode === 'LIST' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
              >
                리스트 보기
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto">
          {/* Search */}
          <div className="relative flex-1 sm:w-64">
            <input
              type="text"
              placeholder="날짜, 수신처, 모델명 검색..."
              className="w-full pl-9 pr-4 py-2.5 rounded-2xl border border-slate-200 focus:ring-2 focus:ring-amber-500 outline-none text-xs font-bold bg-white shadow-xs"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>

          {/* Action Buttons */}
          <button
            onClick={() => setIsImportModalOpen(true)}
            className="px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-black rounded-2xl shadow-md shadow-amber-500/20 transition-all flex items-center justify-center gap-1.5 whitespace-nowrap"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            인보이스에서 불러오기
          </button>

          <button
            onClick={createBlankDoc}
            className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-black rounded-2xl shadow-sm transition-all flex items-center justify-center gap-1.5 whitespace-nowrap"
          >
            + 직접 작성
          </button>
        </div>
      </div>

      {/* Document Grid / List */}
      {filteredDocs.length === 0 ? (
        <div className="bg-white p-16 rounded-3xl border border-dashed border-amber-200 text-center space-y-4">
          <div className="w-16 h-16 bg-amber-50 text-amber-500 rounded-3xl flex items-center justify-center mx-auto">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
            </svg>
          </div>
          <div>
            <h3 className="text-lg font-black text-slate-800">등록된 패킹 라벨 문서가 없습니다</h3>
            <p className="text-xs font-bold text-slate-400 mt-1">
              [인보이스에서 불러오기]를 클릭하여 작성된 패킹리스트에서 라벨을 자동 생성하세요.
            </p>
          </div>
          <button
            onClick={() => setIsImportModalOpen(true)}
            className="px-5 py-2.5 bg-amber-500 text-white text-xs font-black rounded-xl hover:bg-amber-600 transition-colors inline-block"
          >
            인보이스 선택하여 라벨 만들기
          </button>
        </div>
      ) : viewMode === 'ICON' ? (
        /* 3/4 Scaled compact Grid */
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filteredDocs.map(doc => {
            const author = doc.authorInitials || doc.authorId || 'AJIN';
            const totalBoxes = (doc.boxes || []).length;
            const modelSummary = doc.boxes[0]?.model || 'MODEL TRAIN PARTS';
            const canDelete = isMaster || doc.authorId === currentUser.id || doc.authorId === currentUser.loginId;

            return (
              <div
                key={doc.id}
                onClick={() => setActiveDoc(doc)}
                className="bg-white rounded-2xl border border-amber-200/90 shadow-2xs hover:shadow-lg hover:-translate-y-0.5 transition-all cursor-pointer flex flex-col justify-between p-4 group relative"
              >
                <div>
                  {/* Top Bar */}
                  <div className="flex justify-between items-start mb-2.5">
                    <div className="flex flex-col">
                      <span className="text-[9px] font-black text-amber-800 bg-amber-100 px-2 py-0.5 rounded uppercase tracking-wider w-fit mb-0.5">
                        {doc.date}
                      </span>
                      {doc.invoiceNo && (
                        <span className="text-[9px] font-bold text-slate-400">
                          INV: {doc.invoiceNo}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1">
                      {/* Delete button cleanly positioned inside top-right, visible and unclipped */}
                      {canDelete && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm(`'${doc.date} / ${doc.recipient}' 라벨 문서를 삭제하시겠습니까?`)) {
                              handleDeleteDoc(doc.id);
                            }
                          }}
                          className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 transition-colors"
                          title="문서 삭제"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      )}

                      <div className="w-7 h-7 bg-amber-50 rounded-xl flex items-center justify-center text-amber-600 group-hover:bg-amber-500 group-hover:text-white transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                        </svg>
                      </div>
                    </div>
                  </div>

                  {/* Recipient / Title */}
                  <h3 className="text-sm font-black text-slate-900 mb-1.5 truncate group-hover:text-amber-600 transition-colors" title={doc.recipient}>
                    {doc.recipient || '(수신처 미지정)'}
                  </h3>

                  {/* Model Summary */}
                  <div className="mb-3 bg-amber-50/70 border border-amber-200/70 rounded-lg px-2.5 py-1.5 flex items-center gap-1.5">
                    <span className="text-[8px] font-black text-amber-900 bg-amber-200 px-1 py-0.2 rounded uppercase tracking-wider shrink-0">
                      MODEL
                    </span>
                    <span className="text-[11px] font-bold text-slate-800 truncate" title={modelSummary}>
                      {modelSummary}
                    </span>
                  </div>
                </div>

                {/* Footer Bar */}
                <div className="flex justify-between items-end pt-2.5 border-t border-slate-100">
                  <div className="flex flex-col">
                    <span className="text-[8px] font-black text-slate-400 uppercase tracking-tighter">카톤 수</span>
                    <span className="text-sm font-black text-slate-900 tracking-tight">
                      {totalBoxes} <span className="text-[10px] font-normal text-slate-500">CTN</span>
                    </span>
                  </div>

                  {/* Author */}
                  <div className="flex items-center gap-1" title={`작성자: ${author}`}>
                    <div className="w-4 h-4 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center border border-amber-200">
                      <span className="text-[7px] font-black">{author.slice(0, 2)}</span>
                    </div>
                    <span className="text-[9px] font-black text-slate-600 uppercase">{author}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-white rounded-3xl border border-amber-200 overflow-hidden shadow-sm overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead>
              <tr className="bg-amber-50/50 border-b border-amber-100">
                <th className="px-6 py-5 text-[10px] font-black text-amber-900 uppercase tracking-widest">날짜</th>
                <th className="px-6 py-5 text-[10px] font-black text-amber-900 uppercase tracking-widest">수신처 (CONSIGNEE)</th>
                <th className="px-6 py-5 text-[10px] font-black text-amber-900 uppercase tracking-widest">참조 인보이스</th>
                <th className="px-6 py-5 text-[10px] font-black text-amber-900 uppercase tracking-widest">대표 모델</th>
                <th className="px-6 py-5 text-[10px] font-black text-amber-900 uppercase tracking-widest">카톤 수</th>
                <th className="px-6 py-5 text-[10px] font-black text-amber-900 uppercase tracking-widest text-right">작성자 / 관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredDocs.map(doc => {
                const author = doc.authorInitials || doc.authorId || 'AJIN';
                const totalBoxes = (doc.boxes || []).length;
                const modelSummary = doc.boxes[0]?.model || 'MODEL TRAIN PARTS';
                const canDelete = isMaster || doc.authorId === currentUser.id || doc.authorId === currentUser.loginId;

                return (
                  <tr
                    key={doc.id}
                    onClick={() => setActiveDoc(doc)}
                    className="hover:bg-amber-50/30 cursor-pointer transition-all group"
                  >
                    <td className="px-6 py-4">
                      <span className="text-xs font-bold text-slate-700 font-mono">{doc.date}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-black text-slate-900 group-hover:text-amber-600 transition-colors">
                        {doc.recipient || '(수신처 미지정)'}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-[10px] font-black text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                        {doc.invoiceNo || 'NO-NUMBER'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-xs font-bold text-slate-700 truncate max-w-[200px] block">
                        {modelSummary}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-xs font-black text-slate-900">{totalBoxes} CTN</span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="flex items-center gap-1">
                          <div className="w-5 h-5 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center border border-amber-200">
                            <span className="text-[8px] font-black">{author.slice(0, 2)}</span>
                          </div>
                          <span className="text-xs font-black text-slate-700 uppercase">{author}</span>
                        </div>
                        {canDelete && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm(`'${doc.date} / ${doc.recipient}' 라벨 문서를 삭제하시겠습니까?`)) {
                                handleDeleteDoc(doc.id);
                              }
                            }}
                            className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                            title="삭제"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Invoice Import Selector Modal */}
      {isImportModalOpen && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden">
            <div className="p-6 border-b flex justify-between items-center bg-amber-50/50">
              <div>
                <h3 className="text-lg font-black text-slate-900">패킹리스트 불러오기</h3>
                <p className="text-xs font-bold text-slate-500 mt-0.5">라벨을 생성할 인보이스 문서를 선택하세요</p>
              </div>
              <button
                onClick={() => setIsImportModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-xl"
              >
                ✕
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-3 flex-1">
              {availableInvoices.length === 0 ? (
                <p className="text-center text-slate-400 py-10 font-bold">저장된 인보이스가 없습니다.</p>
              ) : (
                availableInvoices.map(inv => {
                  const invDate = inv.invoiceDate || inv.createdAt?.split('T')[0] || '';
                  const totalItems = (inv.packingRows || inv.rows || []).filter(r => r.type === 'ITEM').length;

                  return (
                    <div
                      key={inv.id}
                      onClick={() => createDocFromInvoice(inv)}
                      className="p-4 rounded-2xl border border-slate-200 hover:border-amber-500 hover:bg-amber-50/30 transition-all cursor-pointer flex justify-between items-center group"
                    >
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] font-black text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                            {inv.invoiceNo || 'NO-NUMBER'}
                          </span>
                          <span className="text-xs font-bold text-slate-400">{invDate}</span>
                        </div>
                        <h4 className="text-sm font-black text-slate-900 group-hover:text-amber-700">
                          {inv.consigneeName}
                        </h4>
                        <p className="text-[11px] font-bold text-slate-500 mt-0.5">
                          총 {totalItems}개 품목 / {inv.currencySymbol}{inv.totalAmount || '0'}
                        </p>
                      </div>

                      <button className="px-3 py-1.5 bg-amber-500 group-hover:bg-amber-600 text-white rounded-xl text-xs font-black transition-colors">
                        라벨 생성 ➔
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            <div className="p-4 border-t bg-slate-50 flex justify-end">
              <button
                onClick={() => setIsImportModalOpen(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200 rounded-xl"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
