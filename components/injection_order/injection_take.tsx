
import React, { useState, useEffect, useCallback } from 'react';
import { Undo2, Redo2 } from 'lucide-react';
import { UserAccount, ViewState, InjectionOrderSubCategory, PurchaseOrderSubCategory, PurchaseOrderItem } from '../../types';
import { saveSingleDoc, pushStateToCloud, sendJandiNotification, saveRecipient as supabaseSaveRecipient, deleteRecipient as supabaseDeleteRecipient } from '../../supabase';

interface Recipient {
  id: string;
  name: string;
  telFax: string;
  reference: string;
  remarks: string;
}

interface InjectionTakeProps {
  currentUser: UserAccount;
  setView: (v: ViewState) => void;
  dataVersion: number;
  initialData?: any;
  onClose?: () => void;
}

const InjectionTake: React.FC<InjectionTakeProps> = ({ currentUser, setView, dataVersion, initialData, onClose }) => {
  const [po1Items, setPo1Items] = useState<PurchaseOrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Suggestions
  const [po1TitleSuggestions, setPo1TitleSuggestions] = useState<string[]>([]);
  const [showPo1Suggestions, setShowPo1Suggestions] = useState(false);

  // Recipient Management
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [showRecipientManager, setShowRecipientManager] = useState(false);
  const [editingRecipient, setEditingRecipient] = useState<Recipient | null>(null);

  const [selectedRecipientId, setSelectedRecipientId] = useState('direct');

  // Loaded Data
  const [loadedRows, setLoadedRows] = useState<any[]>(initialData?.rows || []);
  const [history, setHistory] = useState<any[][]>(initialData?.rows ? [JSON.parse(JSON.stringify(initialData.rows))] : []);
  const [historyIndex, setHistoryIndex] = useState(initialData?.rows ? 0 : -1);
  const [loadedMerges, setLoadedMerges] = useState<any>(initialData?.merges || {});
  const [loadedAligns, setLoadedAligns] = useState<any>(initialData?.aligns || {});
  const [loadedWeights, setLoadedWeights] = useState<any>(initialData?.weights || {});
  const [loadedHeaders, setLoadedHeaders] = useState<string[]>(initialData?.headerInfoRows?.map((h: any[]) => h.join(' ')) || []);
  const [footerText, setFooterText] = useState(initialData?.footerText?.join('\n') || '');

  // Form fields for display
  const [po2Reference, setPo2Reference] = useState(initialData?.reference || '');
  const [po2TelFax, setPo2TelFax] = useState(initialData?.telFax || '');
  const [po2SenderName, setPo2SenderName] = useState(initialData?.senderName || '아진정공');
  const [po2SenderPerson, setPo2SenderPerson] = useState(initialData?.senderPerson || '김미숙 010-9252-1565');
  const [po2Date, setPo2Date] = useState(initialData?.date || new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }).replace(/년 |월 /g, '. ').replace('일', '.'));

  const [searchTerm, setSearchTerm] = useState(initialData?.item || '');
  const [vendorSearch, setVendorSearch] = useState(initialData?.recipient || '');

  // Totals
  const [totalAmount, setTotalAmount] = useState(0);
  const [vat, setVat] = useState(0);
  const [grandTotal, setGrandTotal] = useState(0);

  const [extraTotalAmount, setExtraTotalAmount] = useState(0);
  const [extraVat, setExtraVat] = useState(0);
  const [extraGrandTotal, setExtraGrandTotal] = useState(0);

  const [selectedCell, setSelectedCell] = useState<{ rowIndex: number, field: string } | null>(null);

  const fields = ['model', 'dept', 's', 'itemName', 'cty', 'qty', 'material', 'injectionVendor', 'orderQty', 'unitPrice', 'price', 'extra', 'extraAmount', 'remarks', 'remarksRSP'];

  const pushToHistory = (newRows: any[]) => {
    const nextHistory = history.slice(0, historyIndex + 1);
    nextHistory.push(JSON.parse(JSON.stringify(newRows)));
    
    if (nextHistory.length > 50) {
      nextHistory.shift();
    }
    
    setHistory(nextHistory);
    setHistoryIndex(nextHistory.length - 1);
  };

  const undo = () => {
    if (historyIndex > 0) {
      const prevIndex = historyIndex - 1;
      const prevState = JSON.parse(JSON.stringify(history[prevIndex]));
      setLoadedRows(prevState);
      setHistoryIndex(prevIndex);
    }
  };

  const redo = () => {
    if (historyIndex < history.length - 1) {
      const nextIndex = historyIndex + 1;
      const nextState = JSON.parse(JSON.stringify(history[nextIndex]));
      setLoadedRows(nextState);
      setHistoryIndex(nextIndex);
    }
  };

  const handleKeyDown = useCallback((e: React.KeyboardEvent, rowIndex: number, fieldIndex: number) => {
    if (e.key === 'ArrowUp') {
      if (rowIndex > 0) setSelectedCell({ rowIndex: rowIndex - 1, field: fields[fieldIndex] });
    } else if (e.key === 'ArrowDown') {
      if (rowIndex < loadedRows.length - 1) setSelectedCell({ rowIndex: rowIndex + 1, field: fields[fieldIndex] });
    } else if (e.key === 'ArrowLeft') {
      if (fieldIndex > 0) setSelectedCell({ rowIndex, field: fields[fieldIndex - 1] });
    } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
      if (fieldIndex < fields.length - 1) {
        setSelectedCell({ rowIndex, field: fields[fieldIndex + 1] });
      } else if (rowIndex < loadedRows.length - 1) {
        setSelectedCell({ rowIndex: rowIndex + 1, field: fields[0] });
      }
      if (e.key === 'Enter') e.preventDefault();
    }
  }, [loadedRows.length, fields]);

  const updateCellValue = (rowIndex: number, field: string, value: any) => {
    const newRows = [...loadedRows];
    newRows[rowIndex] = { ...newRows[rowIndex], [field]: value };
    setLoadedRows(newRows);
    pushToHistory(newRows);
  };

  const addRowBelow = (index?: number) => {
    const targetIndex = index !== undefined ? index : selectedCell?.rowIndex;
    if (targetIndex === undefined) return;
    const newRows = [...loadedRows];
    const emptyRow = {
      id: `new-${Date.now()}-${Math.random()}`,
      model: '', dept: '', s: '', itemName: '', cty: '', qty: '', material: '',
      injectionVendor: '', orderQty: '', unitPrice: '', price: '',
      extra: '', extraAmount: '', remarks: '', remarksRSP: ''
    };
    newRows.splice(targetIndex + 1, 0, emptyRow);
    setLoadedRows(newRows);
    pushToHistory(newRows);
  };

  const deleteRow = (index?: number) => {
    const targetIndex = index !== undefined ? index : selectedCell?.rowIndex;
    if (targetIndex === undefined) return;
    const newRows = [...loadedRows];
    newRows.splice(targetIndex, 1);
    setLoadedRows(newRows);
    setSelectedCell(null);
    pushToHistory(newRows);
  };

  // Recalculate totals when loadedRows changes
  useEffect(() => {
    let sum = 0;
    let extraSum = 0;
    loadedRows.forEach(row => {
      const p = parseFloat(String(row.price || '0').replace(/,/g, ''));
      if (!isNaN(p)) sum += p;
      const e = parseFloat(String(row.extraAmount || '0').replace(/,/g, ''));
      if (!isNaN(e)) extraSum += e;
    });
    setTotalAmount(sum);
    setVat(Math.floor(sum * 0.1));
    setGrandTotal(sum + Math.floor(sum * 0.1));

    setExtraTotalAmount(extraSum);
    setExtraVat(Math.floor(extraSum * 0.1));
    setExtraGrandTotal(extraSum + Math.floor(extraSum * 0.1));
  }, [loadedRows]);

  useEffect(() => {
    const loadData = () => {
      setLoading(true);
      try {
        // Load AJ Injection Orders (Source from Supabase/Local)
        const savedInjections = localStorage.getItem('ajin_injection_orders');
        let allSourceItems: any[] = [];
        if (savedInjections) {
          const parsed = JSON.parse(savedInjections);
          // Only load approved or destination items as source
          const ajInjections = parsed.filter((item: any) => 
            item.status === InjectionOrderSubCategory.DESTINATION || 
            item.status === InjectionOrderSubCategory.APPROVED
          );
          allSourceItems = [...ajInjections];
        }
        
        setPo1Items(allSourceItems);

        const savedRecipients = localStorage.getItem('ajin_injection_recipients');
        if (savedRecipients) {
          setRecipients(JSON.parse(savedRecipients));
        }
      } catch (err) {
        console.error('Failed to load data:', err);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [dataVersion]);

  const handleModelChange = (val: string) => {
    setSearchTerm(val);
    if (val.trim()) {
      const matches = Array.from(new Set(po1Items
        .filter(item => (item.title || '').toLowerCase().includes(val.toLowerCase()))
        .map(item => item.title || '')
      )).slice(0, 10);
      setPo1TitleSuggestions(matches);
      setShowPo1Suggestions(matches.length > 0);
    } else {
      setShowPo1Suggestions(false);
    }
  };

  const selectVendor = (v: string) => {
    setVendorSearch(v);
    
    // Auto-fill TEL/FAX and Reference if found in Recipient Manager
    const recipient = recipients.find(r => r.name === v);
    if (recipient) {
      setPo2TelFax(recipient.telFax);
      setPo2Reference(recipient.reference);
      setSelectedRecipientId(recipient.id);
      setFooterText(recipient.remarks || '');
    } else {
      setSelectedRecipientId('direct');
    }
  };

  const handleLoadData = () => {
    if (!searchTerm.trim()) {
      alert('기종을 입력하거나 선택해주세요.');
      return;
    }

    const titleNormalized = searchTerm.trim().toLowerCase();
    const vendorNormalized = vendorSearch.trim().toLowerCase();

    const matchingDocs = po1Items.filter(item => 
      (item.title || '').toLowerCase() === titleNormalized
    );

    if (matchingDocs.length === 0) {
      alert('일치하는 기종의 문서를 찾을 수 없습니다.');
      return;
    }

    let finalRows: any[] = [];
    let foundMerges: any = {};
    let foundAligns: any = {};
    let foundWeights: any = {};
    let sourceHeaderRows: string[] = [];

    matchingDocs.forEach(doc => {
      const info = (doc as any).headerInfoRows || [];
      if (info.length > 0) {
        sourceHeaderRows = info.map((row: any[]) => row.join(' '));
      }

      doc.rows.forEach((row, rIdx) => {
        const rowVendor = (row.injectionVendor || row.vendor || '').toLowerCase();
        if (rowVendor.includes(vendorNormalized)) {
          const newRowId = `load-${Date.now()}-${Math.random()}`;
          const currentRowIdx = finalRows.length;
          
          // Ensure all fields are explicitly mapped to avoid missing data
          finalRows.push({ 
            ...row, 
            id: newRowId,
            extra: row.extra || '',
            extraAmount: row.extraAmount || '',
            remarks: row.remarks || '',
            remarksRSP: row.remarksRSP || ''
          });

          if (doc.merges) {
            Object.entries(doc.merges).forEach(([key, m]) => {
              const [mr, mc] = key.split('-').map(Number);
              if (mr === rIdx) foundMerges[`${currentRowIdx}-${mc}`] = m;
            });
          }
          if (doc.aligns) {
            Object.entries(doc.aligns).forEach(([key, a]) => {
              const [ar, ac] = key.split('-').map(Number);
              if (ar === rIdx) foundAligns[`${currentRowIdx}-${ac}`] = a;
            });
          }
          if (doc.weights) {
            Object.entries(doc.weights).forEach(([key, w]) => {
              const [wr, wc] = key.split('-').map(Number);
              if (wr === rIdx) foundWeights[`${currentRowIdx}-${wc}`] = w;
            });
          }
        }
      });
    });

    if (finalRows.length === 0) {
      alert('해당 사출업체에 해당하는 품목이 없습니다.');
      return;
    }

    setLoadedRows(finalRows);
    setHistory([JSON.parse(JSON.stringify(finalRows))]);
    setHistoryIndex(0);
    setLoadedMerges(foundMerges);
    setLoadedAligns(foundAligns);
    setLoadedWeights(foundWeights);
    setLoadedHeaders(sourceHeaderRows);

    // Sync recipient info if found
    const recipient = recipients.find(r => r.name.toLowerCase() === vendorNormalized);
    if (recipient) {
      if (!po2TelFax) setPo2TelFax(recipient.telFax);
      if (!po2Reference) setPo2Reference(recipient.reference);
      if (!footerText) setFooterText(recipient.remarks || '');
    }

    // Calculate Totals
    let sum = 0;
    let extraSum = 0;
    finalRows.forEach(row => {
      const p = parseFloat(String(row.price || '0').replace(/,/g, ''));
      if (!isNaN(p)) sum += p;
      const e = parseFloat(String(row.extraAmount || '0').replace(/,/g, ''));
      if (!isNaN(e)) extraSum += e;
    });
    setTotalAmount(sum);
    setVat(Math.floor(sum * 0.1));
    setGrandTotal(sum + Math.floor(sum * 0.1));

    setExtraTotalAmount(extraSum);
    setExtraVat(Math.floor(extraSum * 0.1));
    setExtraGrandTotal(extraSum + Math.floor(extraSum * 0.1));
    
    alert('데이터를 성공적으로 불러왔습니다.');
  };

  const handleComplete = async () => {
    if (loadedRows.length === 0) {
      alert('불러온 데이터가 없습니다. 먼저 데이터를 불러와주세요.');
      return;
    }

    if (!window.confirm('작성완료 하시겠습니까? 사출 결재대기로 이동됩니다.')) return;

    try {
      const now = new Date();
      const timestamp = now.toLocaleString();
      
      const newPO: any = {
        ...initialData,
        id: initialData?.id || `inj-${Date.now()}`,
        title: vendorSearch.trim(),
        item: searchTerm.trim(),
        type: 'INJECTION_PARTHER',
        status: InjectionOrderSubCategory.PENDING,
        authorId: currentUser.initials,
        date: now.toISOString().split('T')[0],
        createdAt: initialData?.createdAt || now.toISOString(),
        rows: loadedRows,
        merges: loadedMerges,
        aligns: loadedAligns,
        weights: loadedWeights,
        headerInfoRows: loadedHeaders.map(h => [h]),
        recipient: vendorSearch,
        telFax: po2TelFax,
        reference: po2Reference,
        senderName: po2SenderName,
        senderPerson: po2SenderPerson,
        footerText: footerText.split('\n').filter(line => line.trim() !== ''),
        stamps: {
          ...(initialData?.stamps || {}),
          writer: { userId: currentUser.initials, timestamp: timestamp }
        }
      };

      const existingInjections = JSON.parse(localStorage.getItem('ajin_injection_orders') || '[]');
      let updatedInjections;
      if (initialData?.id) {
        updatedInjections = existingInjections.map((item: any) => item.id === initialData.id ? newPO : item);
      } else {
        updatedInjections = [newPO, ...existingInjections];
      }
      localStorage.setItem('ajin_injection_orders', JSON.stringify(updatedInjections));

      // Auto-save recipient if new
      const existingRecipient = recipients.find(r => r.name === vendorSearch);
      if (!existingRecipient && vendorSearch.trim()) {
        await saveRecipient({
          name: vendorSearch,
          telFax: po2TelFax,
          reference: po2Reference,
          remarks: ''
        });
      }

      await saveSingleDoc('Injection_Take', newPO);
      pushStateToCloud();
      
      sendJandiNotification('KR_PO', 'REQUEST', `[사출] ${newPO.title}`, 'H-CHUN', now.toISOString().split('T')[0]);

      alert('작성완료 되었습니다. 사출 결재대기 목록으로 이동합니다.');
      if (onClose) {
        onClose();
      }
      setView({ type: 'INJECTION_ORDER_MAIN', sub: InjectionOrderSubCategory.PENDING });
    } catch (err) {
      console.error('Error completing injection order:', err);
      alert('저장 중 오류가 발생했습니다.');
    }
  };

  const handleTemporarySave = async () => {
    if (loadedRows.length === 0) {
      alert('불러온 데이터가 없습니다. 먼저 데이터를 불러와주세요.');
      return;
    }

    if (!window.confirm('사출임시 목록으로 저장하시겠습니까?')) return;

    try {
      const now = new Date();
      const timestamp = now.toLocaleString();
      
      const newPO: any = {
        ...initialData,
        id: initialData?.id || `inj-temp-${Date.now()}`,
        title: vendorSearch.trim(),
        item: searchTerm.trim(),
        type: 'INJECTION_PARTHER',
        status: InjectionOrderSubCategory.TEMPORARY,
        authorId: currentUser.initials,
        date: now.toISOString().split('T')[0],
        createdAt: initialData?.createdAt || now.toISOString(),
        rows: loadedRows,
        merges: loadedMerges,
        aligns: loadedAligns,
        weights: loadedWeights,
        headerInfoRows: loadedHeaders.map(h => [h]),
        recipient: vendorSearch,
        telFax: po2TelFax,
        reference: po2Reference,
        senderName: po2SenderName,
        senderPerson: po2SenderPerson,
        footerText: footerText.split('\n').filter(line => line.trim() !== ''),
        stamps: {
          ...(initialData?.stamps || {}),
          writer: { userId: currentUser.initials, timestamp: timestamp }
        }
      };

      const existingInjections = JSON.parse(localStorage.getItem('ajin_injection_orders') || '[]');
      let updatedInjections;
      if (initialData?.id) {
        updatedInjections = existingInjections.map((item: any) => item.id === initialData.id ? newPO : item);
      } else {
        updatedInjections = [newPO, ...existingInjections];
      }
      localStorage.setItem('ajin_injection_orders', JSON.stringify(updatedInjections));

      await saveSingleDoc('Injection_Take', newPO);
      pushStateToCloud();
      
      alert('사출임시 목록으로 저장되었습니다.');
      if (onClose) {
        onClose();
      }
      setView({ type: 'INJECTION_ORDER_MAIN', sub: InjectionOrderSubCategory.TEMPORARY });
    } catch (err) {
      console.error('Error saving temporary injection order:', err);
      alert('저장 중 오류가 발생했습니다.');
    }
  };

  const handlePrint = useCallback(() => {
    if (loadedRows.length === 0) {
      alert('인쇄할 데이터가 없습니다.');
      return;
    }

    const win = window.open('', '_blank');
    if (!win) return;

    const title = `${searchTerm}`.trim();

    win.document.write(`
      <html>
        <head>
          <title>사출발주서_${title}</title>
          <script src="https://cdn.tailwindcss.com"></script>
          <style>
            @page { size: A4 portrait; margin: 10mm; }
            body { font-family: 'Gulim', sans-serif; }
            table { border-collapse: collapse; width: 100%; }
            th, td { border: 1px solid black; padding: 4px; font-size: 10px; }
            .no-border { border: none !important; }
          </style>
        </head>
        <body onload="window.print(); window.close();">
          <div class="p-4">
            <div class="flex flex-col items-center mb-4">
              <h1 class="text-3xl font-bold tracking-widest mb-1">주 식 회 사 아 진 정 공</h1>
              <p class="text-[10px]">서울시 금천구 디지털로9길 99, 스타밸리 806호 / TEL: (02) 894-2611 FAX: (02) 802-9941</p>
              <div class="w-full h-[2px] bg-black mt-2"></div>
            </div>

            <div class="flex justify-between items-end mb-4">
              <div class="text-4xl font-bold tracking-[1rem] ml-10">사 출 발 주 서</div>
              <table class="w-auto text-center">
                <tr>
                  <td rowspan="2" class="bg-gray-100 font-bold w-8">결재</td>
                  <td class="bg-gray-100 font-bold w-16">담당</td>
                  <td class="bg-gray-100 font-bold w-16">설계</td>
                  <td class="bg-gray-100 font-bold w-16">이사</td>
                </tr>
                <tr class="h-12">
                  <td>${currentUser.initials}<br/><span class="text-[7px]">${new Date().toLocaleDateString()}</span></td>
                  <td></td>
                  <td></td>
                </tr>
              </table>
            </div>

            <div class="grid grid-cols-2 gap-8 mb-4 text-sm">
              <div class="space-y-1">
                <div class="flex">
                  <span class="font-bold w-20">수 신 :</span>
                  <span>${vendorSearch} 귀중</span>
                </div>
                <div class="flex">
                  <span class="font-bold w-20">참 조 :</span>
                  <span>${po2Reference}</span>
                </div>
                <div class="flex">
                  <span class="font-bold w-20">TEL/FAX :</span>
                  <span>${po2TelFax}</span>
                </div>
              </div>
              <div class="space-y-1">
                <div class="flex">
                  <span class="font-bold w-20">발 신 :</span>
                  <span>${po2SenderName}</span>
                </div>
                <div class="flex">
                  <span class="font-bold w-20">담 당 :</span>
                  <span>${po2SenderPerson}</span>
                </div>
                <div class="flex">
                  <span class="font-bold w-20">작성일자 :</span>
                  <span>${po2Date}</span>
                </div>
              </div>
            </div>

            <div class="mb-2 font-bold text-xl border-b-2 border-black pb-1">기 종 : ${searchTerm}</div>

            ${loadedHeaders.length > 0 ? `
              <div class="w-full mb-4 p-2 bg-gray-50/30 text-[9px]">
                ${loadedHeaders.map(row => `
                  <div class="flex gap-4 font-medium py-0.5">
                    ${Array.isArray(row) ? row.map(cell => `<span>${cell}</span>`).join('') : `<span>${row}</span>`}
                  </div>
                `).join('')}
              </div>
            ` : ''}

                <table class="w-full text-[9px]">
                  <thead>
                    <tr class="bg-gray-50">
                      <th class="w-[55px]">MOLD</th>
                      <th class="w-[40px]">DN</th>
                      <th class="w-[15px]">S</th>
                      <th class="w-[120px]">PART NAME</th>
                      <th class="w-[25px]">CTY</th>
                      <th class="w-[25px]">QTY</th>
                      <th class="w-[60px]">MATERIAL</th>
                      <th class="w-[35px]">사출업체</th>
                      <th class="w-[40px]">주문수량</th>
                      <th class="w-[50px]">단가</th>
                      <th class="w-[65px]">금액</th>
                      <th class="w-[25px]">추가</th>
                      <th class="w-[65px]">추가금액</th>
                      <th class="w-[45px]">비고 R.S/P</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${loadedRows.map(row => `
                      <tr>
                        <td>${row.model || ''}</td>
                        <td>${row.dept || ''}</td>
                        <td class="text-center">${row.s || ''}</td>
                        <td>${row.itemName || ''}</td>
                        <td class="text-center">${row.cty || ''}</td>
                        <td class="text-center">${row.qty || ''}</td>
                        <td>${row.material || ''}</td>
                        <td class="text-center">${row.injectionVendor || ''}</td>
                        <td class="text-center">${row.orderQty || ''}</td>
                        <td class="text-right">${row.unitPrice || ''}</td>
                        <td class="text-right">${row.price || ''}</td>
                        <td class="text-center">${row.extra || ''}</td>
                        <td class="text-right">${row.extraAmount || ''}</td>
                        <td class="italic">${row.remarksRSP || ''}</td>
                      </tr>
                    `).join('')}
                    <!-- Summary Rows -->
                    <tr class="border-t-2 border-black">
                      <td colspan="10" class="text-right font-bold px-2">합계 (Subtotal)</td>
                      <td class="text-right font-bold">${totalAmount.toLocaleString()}</td>
                      <td></td>
                      <td class="text-right font-bold">${extraTotalAmount.toLocaleString()}</td>
                      <td></td>
                    </tr>
                    <tr>
                      <td colspan="10" class="text-right font-bold px-2">부가세 (VAT 10%)</td>
                      <td class="text-right font-bold">${vat.toLocaleString()}</td>
                      <td></td>
                      <td class="text-right font-bold">${extraVat.toLocaleString()}</td>
                      <td></td>
                    </tr>
                    <tr class="bg-gray-50 border-b-2 border-black">
                      <td colspan="10" class="text-right font-black px-2">총액 (Grand Total)</td>
                      <td class="text-right font-black">${grandTotal.toLocaleString()}</td>
                      <td></td>
                      <td class="text-right font-black">${extraGrandTotal.toLocaleString()}</td>
                      <td></td>
                    </tr>
                  </tbody>
                </table>

            ${footerText ? `
              <div class="mt-4 p-2 border border-black min-h-[100px] text-[10px] whitespace-pre-wrap">
                <div class="font-bold border-b border-black mb-1 pb-1">비고:</div>
                ${footerText}
              </div>
            ` : ''}
          </div>
        </body>
      </html>
    `);
    win.document.close();
  }, [loadedRows, searchTerm, vendorSearch, po2Reference, po2TelFax, po2SenderName, po2SenderPerson, po2Date, currentUser, footerText]);

  const saveRecipient = async (r: Partial<Recipient>) => {
    let updated;
    let finalRecipient: Recipient;

    if (editingRecipient && editingRecipient.id) {
      finalRecipient = { ...editingRecipient, ...r };
      updated = recipients.map(item => item.id === editingRecipient.id ? finalRecipient : item);
    } else {
      // Sequential ID generation
      const maxId = recipients.reduce((max, rec) => {
        const idStr = rec.id.toString();
        const num = parseInt(idStr.replace('rec-', ''));
        return isNaN(num) ? max : Math.max(max, num);
      }, 0);
      const newId = `rec-${maxId + 1}`;
      
      finalRecipient = {
        id: newId,
        name: r.name || '',
        telFax: r.telFax || '',
        reference: r.reference || '',
        remarks: r.remarks || ''
      };
      updated = [finalRecipient, ...recipients];
    }

    setRecipients(updated);
    localStorage.setItem('ajin_injection_recipients', JSON.stringify(updated));
    
    // Sync to Supabase
    await supabaseSaveRecipient({
      id: finalRecipient.id,
      name: finalRecipient.name,
      tel: finalRecipient.telFax,
      fax: finalRecipient.reference,
      remark: finalRecipient.remarks,
      category: 'INJECTION_RECIPIENT'
    });

    setEditingRecipient(null);
  };

  const deleteRecipient = async (id: string) => {
    if (!window.confirm('정말로 삭제하시겠습니까?')) return;
    const updated = recipients.filter(r => r.id !== id);
    setRecipients(updated);
    localStorage.setItem('ajin_injection_recipients', JSON.stringify(updated));
    
    // Sync to Supabase
    await supabaseDeleteRecipient(id);
  };

  const handleQuickSaveRecipient = () => {
    if (!vendorSearch.trim()) return;
    const existing = recipients.find(r => r.name === vendorSearch);
    if (existing) {
      alert('이미 등록된 수신처입니다.');
      return;
    }
    saveRecipient({
      name: vendorSearch,
      telFax: po2TelFax,
      reference: po2Reference,
      remarks: ''
    });
    alert('수신처가 저장되었습니다.');
  };

  return (
    <div className="flex flex-col h-full bg-slate-200 overflow-y-auto custom-scrollbar relative">
      {/* Top Action Buttons */}
      <div className="sticky top-0 z-[110] bg-slate-200/80 backdrop-blur-sm p-4 flex justify-between items-center max-w-[1000px] mx-auto w-full">
        <div className="flex items-center">
          {onClose && (
            <button 
              onClick={onClose}
              className="px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg font-black text-sm shadow-sm hover:bg-slate-50 transition-all flex items-center gap-1"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              뒤로가기
            </button>
          )}
        </div>
        <div className="flex gap-2">
          <button 
            onClick={handleComplete}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg font-black text-sm shadow-lg hover:bg-blue-700 transition-all"
          >
            작성완료
          </button>
          <button 
            onClick={() => setShowRecipientManager(true)}
            className="px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg font-black text-sm shadow-sm hover:bg-slate-50 transition-all"
          >
            수신처관리
          </button>
          <button 
            onClick={handleTemporarySave}
            className="px-4 py-2 bg-pink border border-slate-300 text-slate-700 rounded-lg font-black text-sm shadow-sm hover:bg-slate-50 transition-all"
          >
            사출임시
          </button>
        </div>
      </div>

      {/* PO Form Style Header */}
      <div className="bg-white border-[1px] border-slate-200 shadow-2xl mx-auto p-4 md:p-12 w-full max-w-[1000px] text-black font-gulim text-left mt-2 mb-4">
        <div className="min-w-[800px] md:min-w-0">
          {/* Company Info */}
          <div className="flex flex-col items-center mb-1">
            <h1 className="text-4xl font-black tracking-[0.5rem] mb-2 uppercase">주 식 회 사 아 진 정 공</h1>
            <p className="text-sm font-bold text-slate-500">(우;08510) 서울시 금천구 디지털로9길 99, 스타밸리 806호</p>
            <p className="text-sm font-bold text-slate-500">☎ (02) 894-2611 FAX (02) 802-9941 <span className="ml-4 text-blue-600 underline">misuk.kim@ajinpre.net</span></p>
            <div className="w-full h-1 bg-black mt-2"></div>
            <div className="w-full h-[1px] bg-black mt-0.5"></div>
          </div>

          {/* Title & Approval */}
          <div className="flex justify-between items-end mb-1 relative border-b border-black pb-0">
            <div className="text-5xl font-black tracking-[2rem] uppercase leading-none pb-4 ml-20 whitespace-nowrap">발 주 서</div>
            <table className="border-collapse border-black border-[1px] text-center text-[11px] w-auto">
              <tbody>
                <tr>
                  <td rowSpan={2} className="border border-black px-1 py-4 bg-slate-50 font-bold w-10">결 재</td>
                  <td className="border border-black py-1 px-4 bg-slate-50 font-bold min-w-[60px]">담 당</td>
                  <td className="border border-black py-1 px-4 bg-slate-50 font-bold min-w-[60px]">설 계</td>
                  <td className="border border-black py-1 px-4 bg-slate-50 font-bold min-w-[60px]">이 사</td>
                </tr>
                <tr className="h-16">
                  <td className="border border-black p-1 align-middle"></td>
                  <td className="border border-black p-1 align-middle"></td>
                  <td className="border border-black p-1 align-middle"></td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Recipient / Sender Info */}
          <div className="grid grid-cols-2 gap-x-20 mb-3 text-lg leading-tight">
            <div className="space-y-1">
              <div className="flex items-center gap-2 border-b border-black pb-0 relative">
                <span className="font-bold whitespace-nowrap">수 신 :</span>
                <div className="flex-1 flex gap-2 items-center relative">
                  <select 
                    className="border border-slate-200 rounded px-1 py-0.5 text-xs font-bold outline-none bg-slate-50"
                    value={selectedRecipientId}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSelectedRecipientId(val);
                      if (val === 'direct') {
                        setVendorSearch('');
                        setPo2TelFax('');
                        setPo2Reference('');
                        setFooterText('');
                      } else {
                        const r = recipients.find(item => item.id === val);
                        if (r) {
                          setVendorSearch(r.name);
                          setPo2TelFax(r.telFax);
                          setPo2Reference(r.reference);
                          setFooterText(r.remarks || '');
                        }
                      }
                    }}
                  >
                    <option value="direct">직접입력</option>
                    {recipients.map(r => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                  <input 
                    type="text" 
                    value={vendorSearch} 
                    onChange={(e) => {
                      const val = e.target.value;
                      setVendorSearch(val);
                      const r = recipients.find(item => item.name === val);
                      if (r) {
                        setSelectedRecipientId(r.id);
                        setPo2TelFax(r.telFax);
                        setPo2Reference(r.reference);
                        if (!footerText) setFooterText(r.remarks || '');
                      } else {
                        setSelectedRecipientId('direct');
                      }
                    }} 
                    placeholder="수신처 명칭" 
                    className="flex-1 outline-none font-bold bg-transparent" 
                  />
                  <span className="font-bold">귀중</span>
                </div>
              </div>
              <div className="flex items-center gap-2 border-b border-black pb-0">
                <span className="font-bold whitespace-nowrap">참 조 :</span>
                <input 
                  type="text" 
                  value={po2Reference} 
                  onChange={(e) => setPo2Reference(e.target.value)} 
                  placeholder="참조 내용" 
                  className="flex-1 outline-none bg-transparent" 
                />
              </div>
              <div className="flex items-center gap-2 border-b border-black pb-0">
                <span className="font-bold whitespace-nowrap">TEL / FAX :</span>
                <input 
                  type="text" 
                  value={po2TelFax} 
                  onChange={(e) => setPo2TelFax(e.target.value)} 
                  placeholder="연락처 정보" 
                  className="flex-1 outline-none bg-transparent" 
                />
              </div>
            </div>
            <div className="space-y-1">
              <div className="flex gap-4 border-b border-black pb-0">
                <span className="w-16 font-bold">발 신 :</span>
                <input 
                  type="text" 
                  value={po2SenderName} 
                  onChange={(e) => setPo2SenderName(e.target.value)} 
                  className="flex-1 outline-none font-bold bg-transparent" 
                />
              </div>
              <div className="flex gap-4 border-b border-black pb-0">
                <span className="w-16 font-bold">담 당 :</span>
                <input 
                  type="text" 
                  value={po2SenderPerson} 
                  onChange={(e) => setPo2SenderPerson(e.target.value)} 
                  className="flex-1 outline-none bg-transparent" 
                />
              </div>
              <div className="flex gap-4 items-center border-b border-black pb-0">
                <span className="w-16 font-bold">작성일자 :</span>
                <input 
                  type="text" 
                  value={po2Date} 
                  onChange={(e) => setPo2Date(e.target.value)} 
                  className="flex-1 outline-none bg-transparent" 
                />
              </div>
            </div>
          </div>

          {/* Injection Vendor Search Bar */}
          <div className="mb-3 flex items-center border-b border-black pb-1 gap-4">
            <span className="font-bold text-sm text-slate-500 w-24">사출업체 검색 :</span>
            <div className="flex-1 flex gap-2">
              <input 
                type="text" 
                value={vendorSearch} 
                onChange={(e) => setVendorSearch(e.target.value)} 
                placeholder="사출업체명을 입력하세요" 
                className="flex-1 outline-none text-sm font-bold bg-slate-50 px-2 py-0.5 rounded border border-slate-200" 
                onKeyDown={(e) => e.key === 'Enter' && handleLoadData()}
              />
              <button 
                onClick={handleLoadData}
                className="px-4 py-1 bg-amber-600 text-white rounded text-xs font-black hover:bg-amber-700 transition-all shadow-sm"
              >
                데이터 불러오기
              </button>
            </div>
          </div>

          {/* Model Input Line */}
          <div className="mb-4 flex items-center border-b border-black pb-1 relative">
            <span className="font-black text-2xl mr-4 uppercase">기 종 :</span>
            <div className="flex-1 relative">
              <input 
                type="text" 
                value={searchTerm} 
                onChange={(e) => handleModelChange(e.target.value)} 
                onFocus={() => searchTerm && setShowPo1Suggestions(true)}
                onBlur={() => setTimeout(() => setShowPo1Suggestions(false), 200)}
                placeholder="기종을 입력하십시오 (필수)" 
                className="w-full outline-none text-2xl font-bold placeholder:text-red-300 bg-transparent" 
              />
              {showPo1Suggestions && (
                <div className="absolute left-0 right-0 top-full bg-white border border-slate-200 shadow-xl rounded-xl mt-1 z-[100] overflow-hidden">
                  {po1TitleSuggestions.map((s, i) => (
                    <button 
                      key={i} 
                      type="button"
                      onClick={() => { setSearchTerm(s); setShowPo1Suggestions(false); }}
                      className="w-full text-left px-4 py-3 hover:bg-slate-50 text-lg font-bold border-b border-slate-50 last:border-0"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Loaded Data Display (Excel 3-5 rows and Items) */}
          {loadedRows.length > 0 && (
            <div className="mt-6 border-t-2 border-black pt-4">
              {/* Excel Rows 3-5 Content */}
              {loadedHeaders.length > 0 && (
                <div className="mb-4 p-4 bg-slate-100/50 border border-slate-200 rounded text-slate-700 whitespace-pre-wrap leading-relaxed">
                  <div className="text-[10px] font-bold text-slate-400 mb-2 uppercase">[EXCEL ROWS 3-5 CONTENT]</div>
                  {loadedHeaders.map((h, i) => (
                    <div key={i} className="text-[12px] font-medium">
                      {Array.isArray(h) ? h.join(' ') : h}
                    </div>
                  ))}
                </div>
              )}

              {/* Items Table */}
              {/* Table Toolbar */}
              <div className="flex gap-2 mb-2">
                <button 
                  onClick={addRowBelow}
                  disabled={!selectedCell}
                  className="px-3 py-1.5 bg-sky-500 text-white text-[11px] font-bold rounded hover:bg-sky-600 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  선택행 아래 행 추가
                </button>
                <button 
                  onClick={deleteRow}
                  disabled={!selectedCell}
                  className="px-3 py-1.5 bg-rose-500 text-white text-[11px] font-bold rounded hover:bg-rose-600 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  선택행 삭제
                </button>
                <button 
                  onClick={undo}
                  disabled={historyIndex <= 0}
                  className="px-4 py-1.5 bg-white border border-slate-300 text-slate-700 rounded shadow-sm hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed text-[11px] font-bold transition-all"
                  title="되돌리기 (Undo)"
                >
                  UNDO
                </button>
                <button 
                  onClick={redo}
                  disabled={historyIndex >= history.length - 1}
                  className="px-4 py-1.5 bg-white border border-slate-300 text-slate-700 rounded shadow-sm hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed text-[11px] font-bold transition-all"
                  title="다시실행 (Redo)"
                >
                  REDO
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-[11px] border-collapse border-black border-[1px]">
                  <thead>
                    <tr className="bg-slate-100">
                      <th className="border border-black p-1 w-[30px]">+/-</th>
                      <th className="border border-black p-1 w-[8%]">MOLD</th>
                      <th className="border border-black p-1 w-[6%]">DN</th>
                      <th className="border border-black p-1 w-[3%]">S</th>
                      <th className="border border-black p-1 w-[15%]">PART NAME</th>
                      <th className="border border-black p-1 w-[4%]">CTY</th>
                      <th className="border border-black p-1 w-[4%]">QTY</th>
                      <th className="border border-black p-1 w-[10%]">MATERIAL</th>
                      <th className="border border-black p-1 w-[7%]">사출업체</th>
                      <th className="border border-black p-1 w-[7%]">주문수량</th>
                      <th className="border border-black p-1 w-[7%]">단가</th>
                      <th className="border border-black p-1 w-[7%]">금액</th>
                      <th className="border border-black p-1 w-[5%]">추가</th>
                      <th className="border border-black p-1 w-[7%]">추가금액</th>
                      <th className="border border-black p-1 w-[5%]">비고</th>
                      <th className="border border-black p-1 w-[5%]">R.S/P</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadedRows.map((row, idx) => (
                      <tr key={row.id || idx}>
                        <td className="border border-black p-1 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1">
                            <button 
                              onClick={() => addRowBelow(idx)} 
                              className="w-5 h-5 flex items-center justify-center bg-blue-50 text-blue-600 rounded border border-blue-200 hover:bg-blue-600 hover:text-white transition-all text-xs font-bold"
                              title="아래에 행 추가"
                            >
                              +
                            </button>
                            <button 
                              onClick={() => deleteRow(idx)} 
                              className="w-5 h-5 flex items-center justify-center bg-red-50 text-red-600 rounded border border-red-200 hover:bg-red-600 hover:text-white transition-all text-xs font-bold"
                              title="행 삭제"
                            >
                              -
                            </button>
                          </div>
                        </td>
                        <td 
                          className={`border border-black p-1 cursor-pointer ${selectedCell?.rowIndex === idx && selectedCell?.field === 'model' ? 'bg-sky-100' : ''}`}
                          onClick={() => setSelectedCell({ rowIndex: idx, field: 'model' })}
                        >
                          {selectedCell?.rowIndex === idx && selectedCell?.field === 'model' ? (
                            <input 
                              autoFocus
                              onFocus={(e) => e.target.select()}
                              className="w-full bg-transparent outline-none"
                              value={row.model || ''}
                              onChange={(e) => updateCellValue(idx, 'model', e.target.value)}
                              onKeyDown={(e) => handleKeyDown(e, idx, 0)}
                            />
                          ) : (
                            row.model || ''
                          )}
                        </td>
                        <td 
                          className={`border border-black p-1 cursor-pointer ${selectedCell?.rowIndex === idx && selectedCell?.field === 'dept' ? 'bg-sky-100' : ''}`}
                          onClick={() => setSelectedCell({ rowIndex: idx, field: 'dept' })}
                        >
                          {selectedCell?.rowIndex === idx && selectedCell?.field === 'dept' ? (
                            <input 
                              autoFocus
                              onFocus={(e) => e.target.select()}
                              className="w-full bg-transparent outline-none"
                              value={row.dept || ''}
                              onChange={(e) => updateCellValue(idx, 'dept', e.target.value)}
                              onKeyDown={(e) => handleKeyDown(e, idx, 1)}
                            />
                          ) : (
                            row.dept || ''
                          )}
                        </td>
                        <td 
                          className={`border border-black p-1 text-center cursor-pointer ${selectedCell?.rowIndex === idx && selectedCell?.field === 's' ? 'bg-sky-100' : ''}`}
                          onClick={() => setSelectedCell({ rowIndex: idx, field: 's' })}
                        >
                          {selectedCell?.rowIndex === idx && selectedCell?.field === 's' ? (
                            <input 
                              autoFocus
                              onFocus={(e) => e.target.select()}
                              className="w-full bg-transparent outline-none text-center"
                              value={row.s || ''}
                              onChange={(e) => updateCellValue(idx, 's', e.target.value)}
                              onKeyDown={(e) => handleKeyDown(e, idx, 2)}
                            />
                          ) : (
                            row.s || ''
                          )}
                        </td>
                        <td 
                          className={`border border-black p-1 cursor-pointer ${selectedCell?.rowIndex === idx && selectedCell?.field === 'itemName' ? 'bg-sky-100' : ''}`}
                          onClick={() => setSelectedCell({ rowIndex: idx, field: 'itemName' })}
                        >
                          {selectedCell?.rowIndex === idx && selectedCell?.field === 'itemName' ? (
                            <input 
                              autoFocus
                              onFocus={(e) => e.target.select()}
                              className="w-full bg-transparent outline-none"
                              value={row.itemName || ''}
                              onChange={(e) => updateCellValue(idx, 'itemName', e.target.value)}
                              onKeyDown={(e) => handleKeyDown(e, idx, 3)}
                            />
                          ) : (
                            row.itemName || ''
                          )}
                        </td>
                        <td 
                          className={`border border-black p-1 text-center cursor-pointer ${selectedCell?.rowIndex === idx && selectedCell?.field === 'cty' ? 'bg-sky-100' : ''}`}
                          onClick={() => setSelectedCell({ rowIndex: idx, field: 'cty' })}
                        >
                          {selectedCell?.rowIndex === idx && selectedCell?.field === 'cty' ? (
                            <input 
                              autoFocus
                              onFocus={(e) => e.target.select()}
                              className="w-full bg-transparent outline-none text-center"
                              value={row.cty || ''}
                              onChange={(e) => updateCellValue(idx, 'cty', e.target.value)}
                              onKeyDown={(e) => handleKeyDown(e, idx, 4)}
                            />
                          ) : (
                            row.cty || ''
                          )}
                        </td>
                        <td 
                          className={`border border-black p-1 text-center cursor-pointer ${selectedCell?.rowIndex === idx && selectedCell?.field === 'qty' ? 'bg-sky-100' : ''}`}
                          onClick={() => setSelectedCell({ rowIndex: idx, field: 'qty' })}
                        >
                          {selectedCell?.rowIndex === idx && selectedCell?.field === 'qty' ? (
                            <input 
                              autoFocus
                              onFocus={(e) => e.target.select()}
                              className="w-full bg-transparent outline-none text-center"
                              value={row.qty || ''}
                              onChange={(e) => updateCellValue(idx, 'qty', e.target.value)}
                              onKeyDown={(e) => handleKeyDown(e, idx, 5)}
                            />
                          ) : (
                            row.qty || ''
                          )}
                        </td>
                        <td 
                          className={`border border-black p-1 cursor-pointer ${selectedCell?.rowIndex === idx && selectedCell?.field === 'material' ? 'bg-sky-100' : ''}`}
                          onClick={() => setSelectedCell({ rowIndex: idx, field: 'material' })}
                        >
                          {selectedCell?.rowIndex === idx && selectedCell?.field === 'material' ? (
                            <input 
                              autoFocus
                              onFocus={(e) => e.target.select()}
                              className="w-full bg-transparent outline-none"
                              value={row.material || ''}
                              onChange={(e) => updateCellValue(idx, 'material', e.target.value)}
                              onKeyDown={(e) => handleKeyDown(e, idx, 6)}
                            />
                          ) : (
                            row.material || ''
                          )}
                        </td>
                        <td 
                          className={`border border-black p-1 text-center cursor-pointer ${selectedCell?.rowIndex === idx && selectedCell?.field === 'injectionVendor' ? 'bg-sky-100' : ''}`}
                          onClick={() => setSelectedCell({ rowIndex: idx, field: 'injectionVendor' })}
                        >
                          {selectedCell?.rowIndex === idx && selectedCell?.field === 'injectionVendor' ? (
                            <input 
                              autoFocus
                              onFocus={(e) => e.target.select()}
                              className="w-full bg-transparent outline-none text-center"
                              value={row.injectionVendor || ''}
                              onChange={(e) => updateCellValue(idx, 'injectionVendor', e.target.value)}
                              onKeyDown={(e) => handleKeyDown(e, idx, 7)}
                            />
                          ) : (
                            row.injectionVendor || ''
                          )}
                        </td>
                        <td 
                          className={`border border-black p-1 text-center cursor-pointer ${selectedCell?.rowIndex === idx && selectedCell?.field === 'orderQty' ? 'bg-sky-100' : ''}`}
                          onClick={() => setSelectedCell({ rowIndex: idx, field: 'orderQty' })}
                        >
                          {selectedCell?.rowIndex === idx && selectedCell?.field === 'orderQty' ? (
                            <input 
                              autoFocus
                              onFocus={(e) => e.target.select()}
                              className="w-full bg-transparent outline-none text-center"
                              value={row.orderQty || ''}
                              onChange={(e) => updateCellValue(idx, 'orderQty', e.target.value)}
                              onKeyDown={(e) => handleKeyDown(e, idx, 8)}
                            />
                          ) : (
                            row.orderQty || ''
                          )}
                        </td>
                        <td 
                          className={`border border-black p-1 text-right cursor-pointer ${selectedCell?.rowIndex === idx && selectedCell?.field === 'unitPrice' ? 'bg-sky-100' : ''}`}
                          onClick={() => setSelectedCell({ rowIndex: idx, field: 'unitPrice' })}
                        >
                          {selectedCell?.rowIndex === idx && selectedCell?.field === 'unitPrice' ? (
                            <input 
                              autoFocus
                              onFocus={(e) => e.target.select()}
                              className="w-full bg-transparent outline-none text-right"
                              value={row.unitPrice || ''}
                              onChange={(e) => updateCellValue(idx, 'unitPrice', e.target.value)}
                              onKeyDown={(e) => handleKeyDown(e, idx, 9)}
                            />
                          ) : (
                            row.unitPrice || ''
                          )}
                        </td>
                        <td 
                          className={`border border-black p-1 text-right cursor-pointer ${selectedCell?.rowIndex === idx && selectedCell?.field === 'price' ? 'bg-sky-100' : ''}`}
                          onClick={() => setSelectedCell({ rowIndex: idx, field: 'price' })}
                        >
                          {selectedCell?.rowIndex === idx && selectedCell?.field === 'price' ? (
                            <input 
                              autoFocus
                              onFocus={(e) => e.target.select()}
                              className="w-full bg-transparent outline-none text-right"
                              value={row.price || ''}
                              onChange={(e) => updateCellValue(idx, 'price', e.target.value)}
                              onKeyDown={(e) => handleKeyDown(e, idx, 10)}
                            />
                          ) : (
                            row.price || ''
                          )}
                        </td>
                        <td 
                          className={`border border-black p-1 text-center cursor-pointer ${selectedCell?.rowIndex === idx && selectedCell?.field === 'extra' ? 'bg-sky-100' : ''}`}
                          onClick={() => setSelectedCell({ rowIndex: idx, field: 'extra' })}
                        >
                          {selectedCell?.rowIndex === idx && selectedCell?.field === 'extra' ? (
                            <input 
                              autoFocus
                              onFocus={(e) => e.target.select()}
                              className="w-full bg-transparent outline-none text-center"
                              value={row.extra || ''}
                              onChange={(e) => updateCellValue(idx, 'extra', e.target.value)}
                              onKeyDown={(e) => handleKeyDown(e, idx, 11)}
                            />
                          ) : (
                            row.extra || ''
                          )}
                        </td>
                        <td 
                          className={`border border-black p-1 text-right cursor-pointer ${selectedCell?.rowIndex === idx && selectedCell?.field === 'extraAmount' ? 'bg-sky-100' : ''}`}
                          onClick={() => setSelectedCell({ rowIndex: idx, field: 'extraAmount' })}
                        >
                          {selectedCell?.rowIndex === idx && selectedCell?.field === 'extraAmount' ? (
                            <input 
                              autoFocus
                              onFocus={(e) => e.target.select()}
                              className="w-full bg-transparent outline-none text-right"
                              value={row.extraAmount || ''}
                              onChange={(e) => updateCellValue(idx, 'extraAmount', e.target.value)}
                              onKeyDown={(e) => handleKeyDown(e, idx, 12)}
                            />
                          ) : (
                            row.extraAmount || ''
                          )}
                        </td>
                        <td 
                          className={`border border-black p-1 cursor-pointer ${selectedCell?.rowIndex === idx && selectedCell?.field === 'remarks' ? 'bg-sky-100' : ''}`}
                          onClick={() => setSelectedCell({ rowIndex: idx, field: 'remarks' })}
                        >
                          {selectedCell?.rowIndex === idx && selectedCell?.field === 'remarks' ? (
                            <input 
                              autoFocus
                              onFocus={(e) => e.target.select()}
                              className="w-full bg-transparent outline-none"
                              value={row.remarks || ''}
                              onChange={(e) => updateCellValue(idx, 'remarks', e.target.value)}
                              onKeyDown={(e) => handleKeyDown(e, idx, 13)}
                            />
                          ) : (
                            row.remarks || ''
                          )}
                        </td>
                        <td 
                          className={`border border-black p-1 text-center cursor-pointer ${selectedCell?.rowIndex === idx && selectedCell?.field === 'remarksRSP' ? 'bg-sky-100' : ''}`}
                          onClick={() => setSelectedCell({ rowIndex: idx, field: 'remarksRSP' })}
                        >
                          {selectedCell?.rowIndex === idx && selectedCell?.field === 'remarksRSP' ? (
                            <input 
                              autoFocus
                              onFocus={(e) => e.target.select()}
                              className="w-full bg-transparent outline-none text-center"
                              value={row.remarksRSP || ''}
                              onChange={(e) => updateCellValue(idx, 'remarksRSP', e.target.value)}
                              onKeyDown={(e) => handleKeyDown(e, idx, 14)}
                            />
                          ) : (
                            row.remarksRSP || ''
                          )}
                        </td>
                      </tr>
                    ))}
                    {/* Summary Rows */}
                    <tr className="bg-slate-50 font-bold">
                      <td colSpan={11} className="border border-black p-2 text-right text-xs uppercase tracking-tighter">합계 (Subtotal)</td>
                      <td className="border border-black p-2 text-right text-sm">{totalAmount.toLocaleString()}</td>
                      <td className="border border-black p-2"></td>
                      <td className="border border-black p-2 text-right text-sm">{extraTotalAmount.toLocaleString()}</td>
                      <td colSpan={2} className="border border-black p-2"></td>
                    </tr>
                    <tr className="bg-slate-50 font-bold">
                      <td colSpan={11} className="border border-black p-2 text-right text-xs uppercase tracking-tighter">부가세 (VAT 10%)</td>
                      <td className="border border-black p-2 text-right text-sm">{vat.toLocaleString()}</td>
                      <td className="border border-black p-2"></td>
                      <td className="border border-black p-2 text-right text-sm">{extraVat.toLocaleString()}</td>
                      <td colSpan={2} className="border border-black p-2"></td>
                    </tr>
                    <tr className="bg-blue-50 font-black text-blue-700">
                      <td colSpan={11} className="border border-black p-2 text-right text-xs uppercase tracking-tighter">총액 (Grand Total)</td>
                      <td className="border border-black p-2 text-right text-base">{grandTotal.toLocaleString()}</td>
                      <td className="border border-black p-2"></td>
                      <td className="border border-black p-2 text-right text-base">{extraGrandTotal.toLocaleString()}</td>
                      <td colSpan={2} className="border border-black p-2"></td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Editable Footer */}
              <div className="mt-6">
                <div className="font-bold text-sm mb-1 uppercase tracking-tighter">비고 (Footer)</div>
                <textarea 
                  value={footerText}
                  onChange={(e) => setFooterText(e.target.value)}
                  placeholder="발주서 하단에 표시될 내용을 입력하세요."
                  className="w-full h-24 p-3 border border-slate-300 rounded-lg text-sm outline-none focus:border-blue-500 bg-slate-50 font-medium"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Recipient Manager Modal */}
      {showRecipientManager && (
        <div className="fixed inset-0 z-[200] bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
              <h2 className="text-xl font-black text-slate-800">수신처 관리</h2>
              <button onClick={() => { setShowRecipientManager(false); setEditingRecipient(null); }} className="text-slate-400 hover:text-slate-600">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="p-6 space-y-4 overflow-y-auto custom-scrollbar">
              {/* Add/Edit Form */}
              <div className="bg-slate-50 p-4 rounded-xl space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-slate-400 ml-1">ID</label>
                    <input 
                      type="text" 
                      placeholder="ID" 
                      className="px-3 py-2 border border-slate-200 rounded-lg text-sm font-bold outline-none bg-slate-100 text-slate-500"
                      value={editingRecipient?.id || `rec-${recipients.reduce((max, rec) => {
                        const idStr = rec.id.toString();
                        const num = parseInt(idStr.replace('rec-', ''));
                        return isNaN(num) ? max : Math.max(max, num);
                      }, 0) + 1}`}
                      readOnly
                    />
                  </div>
                  <div className="flex flex-col gap-1 col-span-2">
                    <label className="text-[10px] font-bold text-slate-400 ml-1">수신처명</label>
                    <input 
                      type="text" 
                      placeholder="수신처명" 
                      className="px-3 py-2 border border-slate-200 rounded-lg text-sm font-bold outline-none focus:border-blue-500"
                      value={editingRecipient?.name || ''}
                      onChange={(e) => setEditingRecipient(prev => ({ ...(prev || { id: '', name: '', telFax: '', reference: '', remarks: '' }), name: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-slate-400 ml-1">TEL/FAX</label>
                    <input 
                      type="text" 
                      placeholder="TEL/FAX" 
                      className="px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-500"
                      value={editingRecipient?.telFax || ''}
                      onChange={(e) => setEditingRecipient(prev => ({ ...(prev || { id: '', name: '', telFax: '', reference: '', remarks: '' }), telFax: e.target.value }))}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-slate-400 ml-1">참고</label>
                    <input 
                      type="text" 
                      placeholder="참고" 
                      className="px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-500"
                      value={editingRecipient?.reference || ''}
                      onChange={(e) => setEditingRecipient(prev => ({ ...(prev || { id: '', name: '', telFax: '', reference: '', remarks: '' }), reference: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-slate-400 ml-1">비고 (발주서에 미표시)</label>
                  <textarea 
                    placeholder="비고 (발주서에 미표시)" 
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-500 h-20"
                    value={editingRecipient?.remarks || ''}
                    onChange={(e) => setEditingRecipient(prev => ({ ...(prev || { id: '', name: '', telFax: '', reference: '', remarks: '' }), remarks: e.target.value }))}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  {editingRecipient && (
                    <button 
                      onClick={() => setEditingRecipient(null)}
                      className="px-4 py-2 bg-slate-200 text-slate-600 rounded-lg text-xs font-bold hover:bg-slate-300"
                    >
                      취소
                    </button>
                  )}
                  <button 
                    onClick={() => editingRecipient && saveRecipient(editingRecipient)}
                    disabled={!editingRecipient?.name}
                    className="px-6 py-2 bg-blue-600 text-white rounded-lg text-xs font-black hover:bg-blue-700 disabled:opacity-50"
                  >
                    {editingRecipient?.id ? '수정 저장' : '새 수신처 추가'}
                  </button>
                </div>
              </div>

              {/* List */}
              <div className="space-y-2">
                {recipients.map(r => (
                  <div key={r.id} className="flex items-center justify-between p-3 border border-slate-100 rounded-xl hover:bg-slate-50 transition-colors group">
                    <div className="flex-1 cursor-pointer" onClick={() => selectVendor(r.name)}>
                      <div className="font-bold text-slate-800">{r.name}</div>
                      <div className="text-[10px] text-slate-400 font-medium">{r.telFax} | {r.reference}</div>
                      {r.remarks && <div className="text-[10px] text-amber-600 mt-1 italic">비고: {r.remarks}</div>}
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => setEditingRecipient(r)}
                        className="p-2 text-blue-500 hover:bg-blue-50 rounded-lg"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button 
                        onClick={() => deleteRecipient(r.id)}
                        className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
                {recipients.length === 0 && (
                  <div className="text-center py-12 text-slate-300 font-bold italic">등록된 수신처가 없습니다.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-orange-600 mb-4"></div>
          <p className="text-sm text-slate-400 font-bold">데이터를 불러오는 중...</p>
        </div>
      )}
    </div>
  );
};

export default InjectionTake;
