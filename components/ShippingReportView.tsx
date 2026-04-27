
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { FileText, Search, X, Loader2, Save, Printer, ArrowLeft, Plus, Trash2, Image as ImageIcon } from 'lucide-react';
import { ShippingReportSubCategory, ShippingReportItem, ShippingReportRow, ViewState, UserAccount } from '../types';
import { saveSingleDoc, pushStateToCloud, deleteSingleDoc } from '../supabase';

interface ShippingReportViewProps {
  sub: ShippingReportSubCategory;
  currentUser: UserAccount;
  setView: (v: ViewState) => void;
  dataVersion: number;
}

const ShippingReportView: React.FC<ShippingReportViewProps> = ({ sub, currentUser, setView, dataVersion }) => {
  const [items, setItems] = useState<ShippingReportItem[]>([]);
  const [activeItem, setActiveItem] = useState<ShippingReportItem | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

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
    const saved = localStorage.getItem('ajin_shipping_reports');
    if (saved) {
      const allItems: ShippingReportItem[] = JSON.parse(saved);
      setItems(allItems.filter(i => i.status === sub));
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
        id: crypto.randomUUID(),
        no: String(i + 1),
        hsCode: '',
        itemNo: '',
        itemName: '',
        qty: '',
        image: '',
        size: '',
        remarks: '',
        boxInfo: '',
        boxQty: ''
      }))
    };
    setFormData(newItem);
    setActiveItem(newItem);
    setHistory([]);
  };

  const handleEdit = (item: ShippingReportItem) => {
    setFormData(JSON.parse(JSON.stringify(item)));
    setActiveItem(item);
    setHistory([]);
  };

  const handleRowChange = (rowId: string, field: keyof ShippingReportRow, value: string) => {
    setHistory([...history, JSON.parse(JSON.stringify(formData))]);
    setFormData(prev => {
      const updatedRows = prev.rows.map(row => {
        if (row.id === rowId) {
          const updatedRow = { ...row, [field]: value };
          
          // Requirement 5: Auto-populate from COMPLETED documents if itemNo is entered
          if (field === 'itemNo' && value.trim().length >= 3) {
            const val = value.trim();
            // Search in Shipping Reports (COMPLETED)
            const shippingReports = JSON.parse(localStorage.getItem('ajin_shipping_reports') || '[]');
            const completedReports = shippingReports.filter((r: any) => r.status === ShippingReportSubCategory.COMPLETED);
            
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
        const completedReports = shippingReports.filter((r: any) => r.status === ShippingReportSubCategory.COMPLETED);
        const masterData = JSON.parse(localStorage.getItem('ajin_injection_orders') || '[]');

        data.forEach((rowData, rOffset) => {
            const targetRowIdx = startRowIdx + rOffset;
            
            if (!newRows[targetRowIdx]) {
                newRows.push({
                    id: crypto.randomUUID(),
                    no: String(newRows.length + 1),
                    hsCode: '',
                    itemNo: '',
                    itemName: '',
                    qty: '',
                    image: '',
                    size: '',
                    remarks: '',
                    boxInfo: '',
                    boxQty: ''
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
            id: crypto.randomUUID(),
            no: '',
            hsCode: '',
            itemNo: '',
            itemName: '',
            qty: '',
            image: '',
            size: '',
            remarks: '',
            boxInfo: '',
            boxQty: ''
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

  const handleImagePaste = (rowId: string, e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
            const blob = items[i].getAsFile();
            if (blob) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    const base64 = event.target?.result as string;
                    handleRowChange(rowId, 'image', base64);
                };
                reader.readAsDataURL(blob);
            }
        }
    }
  };

  const handleSave = async (status: ShippingReportSubCategory) => {
    if (!formData.model) {
      alert('Model명을 입력해주세요.');
      return;
    }

    const itemToSave = {
      ...formData,
      status: status,
      createdAt: new Date().toISOString()
    };

    try {
      const allItems = JSON.parse(localStorage.getItem('ajin_shipping_reports') || '[]');
      const filtered = allItems.filter((i: any) => i.id !== itemToSave.id);
      const newList = [itemToSave, ...filtered];
      localStorage.setItem('ajin_shipping_reports', JSON.stringify(newList));
      
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

  const handleDelete = async (id: string) => {
    if (!confirm('정말 삭제하시겠습니까?')) return;
    try {
      const allItems = JSON.parse(localStorage.getItem('ajin_shipping_reports') || '[]');
      const updated = allItems.filter((i: any) => i.id !== id);
      localStorage.setItem('ajin_shipping_reports', JSON.stringify(updated));
      await deleteSingleDoc('na_invoice_image', id);
      setItems(updated.filter(i => i.status === sub));
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
    const fields: (keyof ShippingReportRow)[] = ['hsCode', 'itemNo', 'itemName', 'qty', 'size', 'remarks', 'boxInfo', 'boxQty'];
    const fieldIdx = fields.indexOf(field);

    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      // Only move if cursor is at the beginning/end or if it's up/down (which is harder to check in textarea)
      // Actually, for better UX in Excel-like tools, some people prefer moving only with specific modifiers or simple move if not in "edit mode".
      // But standard requirement "상하좌우 방향키로 이동" usually implies moving between cells.
      
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
    const win = window.open('', '_blank');
    if (!win) return;
    
    // Filter rows to only show those with at least one field filled
    const printableRows = formData.rows.filter(r => 
      r.hsCode || r.itemNo || r.itemName || r.qty || r.size || r.remarks || r.boxInfo || r.boxQty || r.image
    );

    const totalQty = printableRows.reduce((acc, r) => acc + (parseFloat(r.qty.replace(/,/g, '')) || 0), 0);

    win.document.write(`
      <html>
        <head>
          <title>Shipping Report - ${formData.model}</title>
          <script src="https://cdn.tailwindcss.com"></script>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Nanum+Gothic&display=swap');
            @page { size: A4 landscape; margin: 10mm; }
            body { 
              font-family: 'Gulim', '굴림', 'Nanum Gothic', sans-serif;
            }
            table { border-collapse: collapse; width: 100%; border: 2px solid black; table-layout: fixed; }
            th, td { border: 1px solid black; padding: 4px; font-size: 10px; text-align: center; word-break: break-all; }
            th { background-color: #fde6d2 !important; -webkit-print-color-adjust: exact; }
            .bg-yellow-200 { background-color: #fef08a !important; -webkit-print-color-adjust: exact; }
            img { max-width: 150px; max-height: 100px; object-fit: contain; display: block; margin: 0 auto; }
            .no-print { display: none !important; }
            .text-left { text-align: left !important; }
            .font-black { font-weight: 900; }
            .font-bold { font-weight: 700; }
          </style>
        </head>
        <body onload="window.print()">
          <div class="p-4">
            <h1 class="text-3xl font-black mb-4">출하 보고서 / Báo cáo xuất hàng</h1>
            <div class="flex gap-8 mb-4 text-sm font-bold">
              <div>Data : ${formData.dataDate}</div>
              <div>Model : ${formData.model}</div>
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
                    <td class="text-left" style="font-size: 9px; white-space: pre-wrap;">${row.remarks}</td>
                    <td class="text-center" style="font-size: 9px; white-space: pre-wrap;">${row.boxInfo}</td>
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
    `);
    win.document.close();
  };

  const isCompleted = formData.status === ShippingReportSubCategory.COMPLETED;

  if (activeItem) {
    return (
      <div className="bg-white min-h-screen p-4 md:p-8 space-y-6">
        <div className="flex flex-wrap justify-between items-center gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-200 no-print">
          <div className="flex items-center gap-4">
            <button onClick={() => setActiveItem(null)} className="p-2 hover:bg-white rounded-full transition-colors">
              <ArrowLeft className="w-6 h-6" />
            </button>
            <h2 className="text-xl font-black text-slate-800">
                {isCompleted ? '출하보고서 조회' : '출하보고서 작성'}
            </h2>
          </div>
          <div className="flex gap-2">
            {!isCompleted && (
                <>
                    <button onClick={handleUndo} disabled={history.length === 0} className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl font-bold text-sm hover:bg-slate-100 disabled:opacity-50 transition-all">되돌리기</button>
                    <button onClick={() => handleSave(ShippingReportSubCategory.TEMPORARY)} className="px-4 py-2 bg-amber-500 text-white rounded-xl font-bold text-sm hover:bg-amber-600 shadow-lg shadow-amber-500/20 transition-all">임시저장</button>
                    <button onClick={() => handleSave(ShippingReportSubCategory.COMPLETED)} className="px-4 py-2 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 shadow-lg shadow-blue-500/20 transition-all">작성완료</button>
                </>
            )}
            <button onClick={handlePrint} className="px-4 py-2 bg-slate-900 text-white rounded-xl font-bold text-sm hover:bg-black flex items-center gap-2 transition-all shadow-lg shadow-slate-900/10">
              <Printer className="w-4 h-4" /> PDF/인쇄
            </button>
          </div>
        </div>

        <div id="shipping-report-print" className="bg-white border-2 border-black p-8 mx-auto overflow-x-auto min-w-[1000px]">
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
              <div className="flex items-center gap-2">
                <span>Model :</span>
                <input 
                  className="border-b border-slate-300 focus:outline-none w-48 font-black text-blue-600"
                  value={formData.model}
                  onChange={(e) => setFormData({...formData, model: e.target.value})}
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
              </tr>
            </thead>
            <tbody>
              {formData.rows.map((row, idx) => (
                <tr key={row.id} className="border-b border-black">
                  <td className="border-r border-black relative group/row">
                    <div className="flex flex-col items-center justify-center p-1 bg-slate-50 border border-slate-200 rounded absolute left-[-40px] top-0 no-print gap-1">
                        <button onClick={() => addRowBelow(idx)} className="p-1 hover:bg-blue-100 text-blue-600 rounded" title="아래에 행 추가"><Plus className="w-3 h-3" /></button>
                        <button onClick={() => deleteRow(idx)} className="p-1 hover:bg-red-100 text-red-600 rounded" title="행 삭제"><Trash2 className="w-3 h-3" /></button>
                    </div>
                    {row.no}
                  </td>
                  <td className={`border-r border-black ${focusedCell?.rowId === row.id && focusedCell?.field === 'hsCode' ? 'bg-sky-100' : ''}`}><textarea id={`input-${row.id}-hsCode`} className="w-full h-full p-1 resize-none focus:outline-none text-center overflow-hidden bg-transparent" rows={1} value={row.hsCode} onFocus={(e) => { setFocusedCell({rowId: row.id, field: 'hsCode'}); autoResize(null, e.target); }} onBlur={() => setFocusedCell(null)} onInput={(e) => autoResize(null, e.target as HTMLTextAreaElement)} onKeyDown={(e) => handleKeyDown(e, row.id, idx, 'hsCode')} onPaste={(e) => handlePaste(e, row.id, 'hsCode')} onChange={(e) => handleRowChange(row.id, 'hsCode', e.target.value)} /></td>
                  <td className={`border-r border-black ${focusedCell?.rowId === row.id && focusedCell?.field === 'itemNo' ? 'bg-sky-100' : ''}`}><textarea id={`input-${row.id}-itemNo`} className="w-full h-full p-1 resize-none focus:outline-none text-center overflow-hidden bg-transparent" rows={1} value={row.itemNo} onFocus={(e) => { setFocusedCell({rowId: row.id, field: 'itemNo'}); autoResize(null, e.target); }} onBlur={() => setFocusedCell(null)} onInput={(e) => autoResize(null, e.target as HTMLTextAreaElement)} onKeyDown={(e) => handleKeyDown(e, row.id, idx, 'itemNo')} onPaste={(e) => handlePaste(e, row.id, 'itemNo')} onChange={(e) => handleRowChange(row.id, 'itemNo', e.target.value)} /></td>
                  <td className={`border-r border-black ${focusedCell?.rowId === row.id && focusedCell?.field === 'itemName' ? 'bg-sky-100' : ''}`}><textarea id={`input-${row.id}-itemName`} className="w-full h-full p-1 resize-none focus:outline-none text-center font-bold overflow-hidden bg-transparent" rows={1} value={row.itemName} onFocus={(e) => { setFocusedCell({rowId: row.id, field: 'itemName'}); autoResize(null, e.target); }} onBlur={() => setFocusedCell(null)} onInput={(e) => autoResize(null, e.target as HTMLTextAreaElement)} onKeyDown={(e) => handleKeyDown(e, row.id, idx, 'itemName')} onPaste={(e) => handlePaste(e, row.id, 'itemName')} onChange={(e) => handleRowChange(row.id, 'itemName', e.target.value)} /></td>
                  <td className={`border-r border-black ${focusedCell?.rowId === row.id && focusedCell?.field === 'qty' ? 'bg-sky-100' : ''}`}><textarea id={`input-${row.id}-qty`} className="w-full h-full p-1 resize-none focus:outline-none text-center font-black overflow-hidden bg-transparent" rows={1} value={row.qty} onFocus={(e) => { setFocusedCell({rowId: row.id, field: 'qty'}); autoResize(null, e.target); }} onBlur={() => setFocusedCell(null)} onInput={(e) => autoResize(null, e.target as HTMLTextAreaElement)} onKeyDown={(e) => handleKeyDown(e, row.id, idx, 'qty')} onPaste={(e) => handlePaste(e, row.id, 'qty')} onChange={(e) => handleRowChange(row.id, 'qty', e.target.value)} /></td>
                  <td 
                    className="p-1 min-h-[100px] relative group border-r border-black"
                    onPaste={(e) => handleImagePaste(row.id, e)}
                  >
                    {row.image ? (
                        <div className="relative inline-block w-full h-full">
                            <img src={row.image} className="mx-auto block" style={{maxWidth: '100%', maxHeight: '200px'}} alt="part" />
                            <button onClick={() => handleRowChange(row.id, 'image', '')} className="absolute top-0 right-0 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 no-print">
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
                  <td className={`border-r border-black ${focusedCell?.rowId === row.id && focusedCell?.field === 'size' ? 'bg-sky-100' : ''}`}><textarea id={`input-${row.id}-size`} className="w-full h-full p-1 resize-none focus:outline-none text-center overflow-hidden bg-transparent" rows={1} value={row.size} onFocus={(e) => { setFocusedCell({rowId: row.id, field: 'size'}); autoResize(null, e.target); }} onBlur={() => setFocusedCell(null)} onInput={(e) => autoResize(null, e.target as HTMLTextAreaElement)} onKeyDown={(e) => handleKeyDown(e, row.id, idx, 'size')} onPaste={(e) => handlePaste(e, row.id, 'size')} onChange={(e) => handleRowChange(row.id, 'size', e.target.value)} /></td>
                  <td className={`border-r border-black ${focusedCell?.rowId === row.id && focusedCell?.field === 'remarks' ? 'bg-sky-100' : ''}`}><textarea id={`input-${row.id}-remarks`} className="w-full h-full p-1 resize-none focus:outline-none text-xs text-left overflow-hidden bg-transparent" rows={1} value={row.remarks} onFocus={(e) => { setFocusedCell({rowId: row.id, field: 'remarks'}); autoResize(null, e.target); }} onBlur={() => setFocusedCell(null)} onInput={(e) => autoResize(null, e.target as HTMLTextAreaElement)} onKeyDown={(e) => handleKeyDown(e, row.id, idx, 'remarks')} onPaste={(e) => handlePaste(e, row.id, 'remarks')} onChange={(e) => handleRowChange(row.id, 'remarks', e.target.value)} /></td>
                  <td className={`border-r border-black ${focusedCell?.rowId === row.id && focusedCell?.field === 'boxInfo' ? 'bg-sky-100' : ''}`}><textarea id={`input-${row.id}-boxInfo`} className="w-full h-full p-1 resize-none focus:outline-none text-xs text-center overflow-hidden bg-transparent" rows={1} value={row.boxInfo} onFocus={(e) => { setFocusedCell({rowId: row.id, field: 'boxInfo'}); autoResize(null, e.target); }} onBlur={() => setFocusedCell(null)} onInput={(e) => autoResize(null, e.target as HTMLTextAreaElement)} onKeyDown={(e) => handleKeyDown(e, row.id, idx, 'boxInfo')} onPaste={(e) => handlePaste(e, row.id, 'boxInfo')} onChange={(e) => handleRowChange(row.id, 'boxInfo', e.target.value)} /></td>
                  <td className={`${focusedCell?.rowId === row.id && focusedCell?.field === 'boxQty' ? 'bg-sky-100' : ''}`}><textarea id={`input-${row.id}-boxQty`} className="w-full h-full p-1 resize-none focus:outline-none text-center overflow-hidden bg-transparent" rows={1} value={row.boxQty} onFocus={(e) => { setFocusedCell({rowId: row.id, field: 'boxQty'}); autoResize(null, e.target); }} onBlur={() => setFocusedCell(null)} onInput={(e) => autoResize(null, e.target as HTMLTextAreaElement)} onKeyDown={(e) => handleKeyDown(e, row.id, idx, 'boxQty')} onPaste={(e) => handlePaste(e, row.id, 'boxQty')} onChange={(e) => handleRowChange(row.id, 'boxQty', e.target.value)} /></td>
                </tr>
              ))}
              <tr className="bg-yellow-200">
                <td colSpan={4} className="font-bold border border-black">Total</td>
                <td className="font-black text-blue-700 border border-black">
                    {formData.rows.reduce((acc, r) => acc + (parseFloat(r.qty.replace(/,/g, '')) || 0), 0).toLocaleString()}
                </td>
                <td colSpan={5} className="border border-black"></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  const filteredItems = items.filter(i => 
    i.model.toLowerCase().includes(searchTerm.toLowerCase()) || 
    i.authorId.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-6 space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="space-y-1">
          <h1 className="text-3xl font-black text-slate-800 tracking-tight">
            {sub === ShippingReportSubCategory.CREATE ? '출하보고서 작성' : sub}
          </h1>
          <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">Shipping Report Management</p>
        </div>
        
        {sub === ShippingReportSubCategory.CREATE && (
          <button 
            onClick={handleCreateNew}
            className="px-8 py-3 bg-slate-900 text-white rounded-2xl font-black text-sm hover:bg-blue-600 transition-all flex items-center gap-2 shadow-lg shadow-slate-900/10"
          >
            <Plus className="w-5 h-5" /> 새 보고서 작성
          </button>
        )}
      </div>

      <div className="bg-white p-6 rounded-[2.5rem] border border-slate-200 shadow-sm">
        <div className="relative mb-8">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input 
            type="text"
            placeholder="제목 또는 작성자 검색..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500 focus:outline-none font-bold"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredItems.map(item => (
            <div 
              key={item.id}
              className="group bg-white p-6 rounded-3xl border border-slate-100 hover:border-blue-500 hover:shadow-xl transition-all cursor-pointer relative"
              onClick={() => handleEdit(item)}
            >
              <div className="flex justify-between items-start mb-4">
                <div className="p-3 bg-rose-50 rounded-2xl text-rose-600 group-hover:bg-rose-500 group-hover:text-white transition-colors">
                  <FileText className="w-6 h-6" />
                </div>
                <button 
                  onClick={(e) => { e.stopPropagation(); handleDelete(item.id); }}
                  className="p-2 text-slate-300 hover:text-red-500 transition-colors"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
              <h3 className="text-xl font-black text-slate-800 line-clamp-1 mb-1">{item.model}</h3>
              <p className="text-xs font-bold text-slate-400 mb-4">{item.dataDate}</p>
              <div className="flex justify-between items-center pt-4 border-t border-slate-50">
                <span className="text-[10px] font-black uppercase tracking-tighter text-blue-600 bg-blue-50 px-2.5 py-1 rounded-lg">{item.authorId}</span>
                <span className="text-[10px] font-bold text-slate-300">{new Date(item.createdAt).toLocaleDateString()}</span>
              </div>
            </div>
          ))}
          {filteredItems.length === 0 && (
            <div className="col-span-full py-20 text-center text-slate-300 font-bold italic">
              목록이 비어 있습니다.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ShippingReportView;
