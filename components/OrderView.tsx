
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { OrderSubCategory, OrderItem, OrderRow, UserAccount, ViewState } from '../types';
import { GoogleGenAI, Type } from "@google/genai";
import { pushStateToCloud } from '../supabase';

interface OrderViewProps {
  sub: OrderSubCategory;
  currentUser: UserAccount;
  userAccounts: UserAccount[];
  setView: (v: ViewState) => void;
}

const AutoExpandingTextarea = React.memo(({ 
  value, onChange, disabled, className, placeholder, onKeyDown, dataRow, dataCol
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
      disabled={disabled}
      placeholder={placeholder}
      data-row={dataRow}
      data-col={dataCol}
      className={`w-full bg-transparent resize-none overflow-hidden outline-none p-1 block ${className}`}
      rows={1}
    />
  );
});

const formatAmPm = (timeStr: string) => {
  if (!timeStr) return '';
  return timeStr.replace('오전', 'am').replace('오후', 'pm');
};

const RenderDocumentTable = React.memo(({ 
  rows, isCreate, order, isPreviewing, formLocation, formTitle, formDate,
  setFormDate, setFormTitle, setFormLocation, updateRowField, handleRowKeyDown,
  handleCreateSubmit, handleRowEdit, handleRowDelete, handleStampAction,
  handleFinalComplete, suggestionTarget, suggestions, selectSuggestion, userAccounts,
  isVietnameseLabels, translatedLocation
}: any) => {
  const location = isCreate ? formLocation : order?.location;
  const stamps = isCreate ? {} : order?.stamps;
  const getInitials = (userId?: string) => {
    if (!userId) return '';
    return userAccounts.find((u: UserAccount) => u.loginId === userId)?.initials || userId;
  };
  const isCompleted = !isCreate && order?.stamps?.final;
  
  const isLocked = !isCreate;
  const isFinalApproved = !isCreate && order && (
    order.status === OrderSubCategory.APPROVED || 
    order.status.includes('완료')
  );

  const showManager = location === 'SEOUL';
  const showDirector = location === 'SEOUL';

  const labels = isVietnameseLabels ? {
    mainTitle: 'ĐƠN ĐẶT HÀNG',
    approval: 'Phê duyệt',
    writer: 'Người lập',
    manager: 'Trưởng phòng',
    head: 'Giám đốc',
    director: 'Giám đốc ĐH',
    date: 'Ngày',
    location: 'Nơi mua',
    title: 'Tiêu đề',
    dept: 'Bộ phận',
    model: 'Model/Sử dụng',
    itemName: 'Tên hàng',
    qty: 'Số lượng',
    unitPrice: 'Đơn giá',
    remarks: 'Ghi chú',
    manage: 'Quản lý'
  } : {
    mainTitle: '주 문 서',
    approval: '결재',
    writer: '작성',
    manager: '과장',
    head: '법인장',
    director: '이사',
    date: '날짜',
    location: '구매처',
    title: '제목',
    dept: '부서',
    model: '기종/사용',
    itemName: '품명',
    qty: '수량',
    unitPrice: '단가',
    remarks: '비고',
    manage: '관리'
  };

  const displayLocation = isVietnameseLabels && translatedLocation ? translatedLocation : (location === 'SEOUL' ? '서울' : location === 'DAECHEON' ? '대천' : '베트남');

  return (
    <div className="bg-white border border-slate-300 shadow-xl mx-auto p-4 md:p-12 min-h-[297mm] w-full max-w-[1000px] text-slate-800 font-gulim relative document-print-content text-left overflow-x-auto">
      <div className="min-w-[700px]">
        <div className="flex justify-between items-start mb-10">
          <div className="text-3xl md:text-5xl font-bold underline decoration-2 underline-offset-8 uppercase">{labels.mainTitle}</div>
          <table className="border-collapse border-2 border-slate-900 text-center text-[10px] w-auto min-w-[300px]">
            <tbody>
              <tr>
                <td rowSpan={2} className="border-2 border-slate-900 px-2 py-2 bg-slate-50 font-bold w-8 text-[11px] leading-tight whitespace-pre-wrap">{labels.approval}</td>
                <td className="border-2 border-slate-900 px-4 py-1 bg-slate-50 w-24 font-bold">{labels.writer}</td>
                {showManager && <td className="border-2 border-slate-900 px-4 py-1 bg-slate-50 w-24 font-bold">{labels.manager}</td>}
                <td className="border-2 border-slate-900 px-4 py-1 bg-slate-50 w-24 font-bold">{labels.head}</td>
                {showDirector && <td className="border-2 border-slate-900 px-4 py-1 bg-slate-50 w-24 font-bold">{labels.director}</td>}
              </tr>
              <tr className="h-16">
                <td className="border-2 border-slate-900 p-1 align-middle">
                  {stamps?.writer && <div className="flex flex-col items-center"><span className="font-bold text-blue-700 text-[11px]">{getInitials(stamps.writer.userId)}</span><span className="text-[8px] opacity-70 leading-tight mt-0.5">{formatAmPm(stamps.writer.timestamp)}</span></div>}
                </td>
                {showManager && (
                  <td className={`border-2 border-slate-900 p-1 align-middle transition-colors ${!isCreate && !stamps?.manager && stamps?.head && order?.status === OrderSubCategory.PENDING ? 'cursor-pointer hover:bg-amber-50' : ''}`} onClick={() => !isCreate && !stamps?.manager && stamps?.head && order?.status === OrderSubCategory.PENDING && handleStampAction(order!, 'manager')}>
                    {stamps?.manager ? <div className="flex flex-col items-center"><span className="font-bold text-green-700 text-[11px]">{getInitials(stamps.manager.userId)}</span><span className="text-[8px] opacity-70 leading-tight mt-0.5">{formatAmPm(stamps.manager.timestamp)}</span></div> : (!isCreate && order?.status === OrderSubCategory.PENDING && stamps?.head) ? <span className="text-[9px] text-slate-400">승인</span> : null}
                  </td>
                )}
                <td className={`border-2 border-slate-900 p-1 align-middle transition-colors ${!isCreate && !stamps?.head && order?.status === OrderSubCategory.PENDING ? 'cursor-pointer hover:bg-amber-50' : ''}`} onClick={() => !isCreate && !stamps?.head && order?.status === OrderSubCategory.PENDING && handleStampAction(order!, 'head')}>
                  {stamps?.head ? <div className="flex flex-col items-center"><span className="font-bold text-green-700 text-[11px]">{getInitials(stamps.head.userId)}</span><span className="text-[8px] opacity-70 leading-tight mt-0.5">{formatAmPm(stamps.head.timestamp)}</span></div> : (!isCreate && order?.status === OrderSubCategory.PENDING) ? <span className="text-[9px] text-slate-400">승인</span> : null}
                </td>
                {showDirector && (
                  <td className={`border-2 border-slate-900 p-1 align-middle transition-colors ${!isCreate && !stamps?.director && stamps?.manager && order?.status === OrderSubCategory.PENDING ? 'cursor-pointer hover:bg-amber-50' : ''}`} onClick={() => !isCreate && !stamps?.director && stamps?.manager && order?.status === OrderSubCategory.PENDING && handleStampAction(order!, 'director')}>
                    {stamps?.director ? <div className="flex flex-col items-center"><span className="font-bold text-green-700 text-[11px]">{getInitials(stamps.director.userId)}</span><span className="text-[8px] opacity-70 leading-tight mt-0.5">{formatAmPm(stamps.director.timestamp)}</span></div> : (!isCreate && order?.status === OrderSubCategory.PENDING && stamps?.manager) ? <span className="text-[9px] text-slate-400">승인</span> : null}
                  </td>
                )}
              </tr>
            </tbody>
          </table>
        </div>

        <div className="space-y-1 mb-4 text-base w-[400px] max-w-full">
          <div className="flex border-b-2 border-slate-900 pb-0.5 items-center h-8">
            <span className="w-24 font-bold">{labels.date}</span>
            {isCreate ? <input type="text" value={formDate} onChange={(e) => setFormDate(e.target.value)} className="flex-1 bg-transparent outline-none font-medium border-b border-transparent hover:border-slate-200 focus:border-blue-500 transition-all py-0.5"/> : <span>{order?.date}</span>}
          </div>
          <div className="flex border-b-2 border-slate-900 pb-0.5 items-center gap-4 md:gap-8 h-8">
            <span className="w-24 font-bold">{labels.location}</span>
            {isCreate ? (
              <div className="flex gap-2 md:gap-4 overflow-x-auto">
                <label className="flex items-center gap-1 md:gap-1.5 cursor-pointer text-xs md:text-sm whitespace-nowrap"><input type="radio" className="w-3 h-3 md:w-4 md:h-4" checked={formLocation === 'SEOUL'} onChange={() => setFormLocation('SEOUL')} />서울</label>
                <label className="flex items-center gap-1 md:gap-1.5 cursor-pointer text-xs md:text-sm whitespace-nowrap"><input type="radio" className="w-3 h-3 md:w-4 md:h-4" checked={formLocation === 'DAECHEON'} onChange={() => setFormLocation('DAECHEON')} />대천</label>
                <label className="flex items-center gap-1 md:gap-1.5 cursor-pointer text-xs md:text-sm whitespace-nowrap"><input type="radio" className="w-3 h-3 md:w-4 md:h-4" checked={formLocation === 'VIETNAM'} onChange={() => setFormLocation('VIETNAM')} />베트남</label>
              </div>
            ) : <span className="font-bold text-blue-800">{displayLocation}</span>}
          </div>
          <div className="flex border-b-2 border-slate-900 pb-0.5 items-center h-8">
            <span className="w-24 font-bold">{labels.title}</span>
            {isCreate ? <AutoExpandingTextarea className="flex-1 px-2 py-0.5 rounded bg-slate-50 font-bold" value={formTitle} onChange={(e: any) => setFormTitle(e.target.value)} placeholder="문서 제목 입력"/> : <span className="font-bold underline flex-1 whitespace-pre-wrap">{order?.title}</span>}
          </div>
        </div>

        <table className="w-full border-collapse border-2 border-slate-900 text-xs md:text-sm">
          <thead className="bg-slate-100">
            <tr>
              <th className="border-2 border-slate-900 p-1 md:p-2 w-[10%]">{labels.dept}</th>
              <th className="border-2 border-slate-900 p-1 md:p-2 w-[15%]">{labels.model}</th>
              <th className="border-2 border-slate-900 p-1 md:p-2 flex-1">{labels.itemName}</th>
              <th className="border-2 border-slate-900 p-1 md:p-2 w-16">{labels.qty}</th>
              <th className="border-2 border-slate-900 p-1 md:p-2 w-20">{labels.unitPrice}</th>
              <th className="border-2 border-slate-900 p-1 md:p-2 w-[18%]">{labels.remarks}</th>
              {!isPreviewing && <th className="border-2 border-slate-900 p-1 md:p-2 w-20 md:w-24 no-print">{labels.manage}</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row: OrderRow, idx: number) => {
              const isRowEditableInLockedDoc = row.id && typeof row.id === 'string' && row.id.startsWith('NEW-') && !isFinalApproved;
              const finalDisabled = isPreviewing || row.isDeleted || (isLocked && !isRowEditableInLockedDoc);

              return (
                <tr key={row.id} className={`${row.isDeleted ? 'bg-red-50' : ''} relative`}>
                  <td className="border-2 border-slate-900 p-0 align-top relative">
                    <AutoExpandingTextarea value={row.dept} dataRow={idx} dataCol={0} disabled={finalDisabled} onChange={(e: any) => isCreate ? updateRowField(row.id, 'dept', e.target.value) : handleRowEdit(order!, row.id, 'dept', e.target.value)} onKeyDown={(e: any) => handleRowKeyDown(e, idx, 0)} className={row.isDeleted ? 'text-red-600 line-through' : ''}/>
                  </td>
                  <td className="border-2 border-slate-900 p-0 align-top relative">
                    <AutoExpandingTextarea value={row.model} dataRow={idx} dataCol={1} disabled={finalDisabled} onChange={(e: any) => isCreate ? updateRowField(row.id, 'model', e.target.value) : handleRowEdit(order!, row.id, 'model', e.target.value)} onKeyDown={(e: any) => handleRowKeyDown(e, idx, 1)} className={row.isDeleted ? 'text-red-600 line-through' : ''}/>
                  </td>
                  <td className="border-2 border-slate-900 p-0 align-top relative">
                    <AutoExpandingTextarea value={row.itemName} dataRow={idx} dataCol={2} disabled={finalDisabled} onChange={(e: any) => isCreate ? updateRowField(row.id, 'itemName', e.target.value) : handleRowEdit(order!, row.id, 'itemName', e.target.value)} onKeyDown={(e: any) => handleRowKeyDown(e, idx, 2)} className={row.isDeleted ? 'text-red-600 line-through' : ''}/>
                    {isCreate && suggestionTarget?.rowId === row.id && suggestionTarget?.field === 'itemName' && suggestions.length > 0 && (
                      <div className="absolute left-0 right-0 top-full bg-white border border-slate-300 shadow-2xl z-50 rounded-b-lg overflow-hidden max-h-48 overflow-y-auto">
                        {suggestions.map((item: OrderRow, sIdx: number) => (
                          <button key={sIdx} onClick={() => selectSuggestion(row.id, item)} className="w-full text-left px-3 py-2 text-[10px] md:text-xs hover:bg-blue-50 border-b border-slate-100 last:border-0 flex flex-col">
                            <span className="font-bold text-blue-700">{item.itemName}</span>
                            <span className="text-[8px] md:text-[10px] text-slate-500">{item.model} | {item.dept}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="border-2 border-slate-900 p-0 align-top">
                    <AutoExpandingTextarea value={row.price} dataRow={idx} dataCol={3} disabled={finalDisabled} onChange={(e: any) => isCreate ? updateRowField(row.id, 'price', e.target.value) : handleRowEdit(order!, row.id, 'price', e.target.value)} onKeyDown={(e: any) => handleRowKeyDown(e, idx, 3)} className={row.isDeleted ? 'text-red-600 line-through' : ''}/>
                  </td>
                  <td className="border-2 border-slate-900 p-0 align-top">
                    <AutoExpandingTextarea value={row.unitPrice} dataRow={idx} dataCol={4} disabled={finalDisabled} onChange={(e: any) => isCreate ? updateRowField(row.id, 'unitPrice', e.target.value) : handleRowEdit(order!, row.id, 'unitPrice', e.target.value)} onKeyDown={(e: any) => handleRowKeyDown(e, idx, 4)} className={row.isDeleted ? 'text-red-600 line-through' : ''}/>
                  </td>
                  <td className="border-2 border-slate-900 p-0 align-top">
                    <AutoExpandingTextarea value={row.remarks} dataRow={idx} dataCol={5} disabled={finalDisabled} onChange={(e: any) => isCreate ? updateRowField(row.id, 'remarks', e.target.value) : handleRowEdit(order!, row.id, 'remarks', e.target.value)} onKeyDown={(e: any) => handleRowKeyDown(e, idx, 5)} className={row.isDeleted ? 'text-red-600 line-through' : ''}/>
                  </td>
                  {!isPreviewing && (
                    <td className="border-2 border-slate-900 p-2 text-center align-middle bg-slate-50/30 no-print">
                      {!isCreate && (order?.status === OrderSubCategory.PENDING || order?.status === OrderSubCategory.REJECTED) && !row.isDeleted && (row.model || row.itemName || (row.id && row.id.startsWith('NEW-'))) && (
                        <button onClick={() => handleRowDelete(order!, row.id, idx)} className="text-[10px] px-2 py-1 bg-red-100 text-red-600 hover:bg-red-600 hover:text-white rounded font-bold shadow-sm">삭제</button>
                      )}
                      {row.modLog && <div className="text-[8px] md:text-[9px] text-slate-500 mt-1 leading-tight font-sans"><span className="font-bold">{row.modLog.type === 'DELETE' ? 'DEL' : 'MOD'}:</span> {getInitials(row.modLog.userId)}<br/>{formatAmPm(row.modLog.timestamp)}</div>}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="mt-4 flex justify-end px-2 text-[10px] md:text-[11px] font-bold text-black tracking-widest uppercase">
          <span>AJIN PRE / AJIN VINA</span>
        </div>

        {isCreate && (
          <div className="mt-8 md:mt-12 flex justify-center no-print pb-8">
            <button onClick={handleCreateSubmit} className="px-8 md:px-12 py-3 md:py-4 bg-slate-900 text-white rounded-lg font-black text-xl md:text-2xl hover:bg-blue-600 shadow-2xl transition-all active:scale-95">작 성 완 료</button>
          </div>
        )}

        {!isCreate && order?.status === OrderSubCategory.APPROVED && !order.stamps?.final && (
          <div className="mt-8 md:mt-12 flex flex-col items-center justify-center no-print pt-10 border-t border-slate-100 pb-8">
            <button onClick={() => handleFinalComplete(order)} className="px-10 md:px-16 py-4 md:py-5 bg-blue-600 text-white rounded-2xl font-black text-xl md:text-2xl hover:bg-blue-700 shadow-2xl transition-all active:scale-95">완 료</button>
            <p className="mt-4 text-blue-500 text-xs md:text-sm font-bold tracking-tight text-center px-4">지정된 구매처({location === 'SEOUL' ? '서울' : location === 'DAECHEON' ? '대천' : '베트남'}) 폴더로 보관됩니다.</p>
          </div>
        )}

        {isCompleted && (
          <div className="mt-8 md:mt-12 flex flex-col md:flex-row justify-end items-end md:items-center gap-4 text-xs font-bold no-print pb-8">
            <div className="bg-slate-100 px-4 md:px-5 py-2 md:py-3 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
              <div><span className="text-slate-400 mr-2 tracking-tighter uppercase">완료:</span><span className="text-blue-600">{getInitials(order.stamps.final?.userId)}</span></div>
              <div className="w-[1px] h-3 bg-slate-300"></div>
              <div><span className="text-slate-400 mr-2 tracking-tighter uppercase">완료일:</span><span className="text-slate-800 tracking-tighter">{formatAmPm(order.stamps.final?.timestamp || '')}</span></div>
            </div>
            <div className="bg-green-100 text-green-700 px-4 py-2 md:py-3 rounded-xl border border-green-200 uppercase tracking-widest text-[10px] shadow-sm">ARCHIVED</div>
          </div>
        )}
      </div>
    </div>
  );
});

const createInitialRows = (count: number): OrderRow[] => 
  Array(count).fill(null).map(() => ({
    id: Math.random().toString(36).substr(2, 9),
    dept: '', model: '', itemName: '', price: '', unitPrice: '', remarks: ''
  }));

const OrderView: React.FC<OrderViewProps> = ({ sub, currentUser, userAccounts, setView }) => {
  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [activeOrder, setActiveOrder] = useState<OrderItem | null>(null);
  const [originalOrder, setOriginalOrder] = useState<OrderItem | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [rejectingOrder, setRejectingOrder] = useState<OrderItem | null>(null);
  const [deletingFileId, setDeletingFileId] = useState<string | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);
  const [isVietnameseLabels, setIsVietnameseLabels] = useState(false);
  const [translatedLocation, setTranslatedLocation] = useState('');
  const [suggestions, setSuggestions] = useState<OrderRow[]>([]);
  const [suggestionTarget, setSuggestionTarget] = useState<{rowId: string, field: string} | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'ICON' | 'DETAIL'>('ICON');

  const isMaster = currentUser.loginId === 'AJ5200';
  const [formLocation, setFormLocation] = useState<'SEOUL' | 'DAECHEON' | 'VIETNAM'>('SEOUL');
  const [formTitle, setFormTitle] = useState('');
  const [formDate, setFormDate] = useState(new Date().toLocaleDateString('ko-KR'));
  const [formRows, setFormRows] = useState<OrderRow[]>(createInitialRows(6));

  const getCurrentTime = () => {
    return new Date().toLocaleString('ko-KR', { hour12: true });
  };

  useEffect(() => {
    const saved = localStorage.getItem('ajin_orders');
    if (saved) setOrders(JSON.parse(saved));
  }, []);

  const saveOrders = (items: OrderItem[]) => {
    setOrders(items);
    localStorage.setItem('ajin_orders', JSON.stringify(items));
    pushStateToCloud();
  };

  const handleTranslateToVietnam = async () => {
    if (!activeOrder) return;
    if (isVietnameseLabels && originalOrder) {
      setActiveOrder(originalOrder);
      setOriginalOrder(null);
      setIsVietnameseLabels(false);
      setTranslatedLocation('');
      return;
    }
    setIsTranslating(true);
    setOriginalOrder({...activeOrder});
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const prompt = `Translate the following order document into Vietnamese.
      CRITICAL: Keep English text (product codes, names like 'AJIN', 'MASTER', brand names) exactly as they are.
      Translate fields: title, location_name (Seoul, Daecheon, Vietnam), and the table rows (dept, model, itemName, price, remarks).
      Input: ${JSON.stringify({ 
        title: activeOrder.title, 
        location_name: (activeOrder.location === 'SEOUL' ? '서울' : activeOrder.location === 'DAECHEON' ? '대천' : '베트남'),
        rows: activeOrder.rows 
      })}`;

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: { 
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              location_name: { type: Type.STRING },
              rows: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    dept: { type: Type.STRING },
                    model: { type: Type.STRING },
                    itemName: { type: Type.STRING },
                    price: { type: Type.STRING },
                    remarks: { type: Type.STRING }
                  }
                }
              }
            }
          }
        }
      });

      const translatedData = JSON.parse(response.text.trim());
      setTranslatedLocation(translatedData.location_name);
      const updatedOrder = {
        ...activeOrder,
        title: translatedData.title,
        rows: activeOrder.rows.map((row, idx) => ({
          ...row,
          dept: translatedData.rows[idx]?.dept || row.dept,
          model: translatedData.rows[idx]?.model || row.model,
          itemName: translatedData.rows[idx]?.itemName || row.itemName,
          price: translatedData.rows[idx]?.price || row.price,
          remarks: translatedData.rows[idx]?.remarks || row.remarks,
        }))
      };
      setActiveOrder(updatedOrder);
      setIsVietnameseLabels(true);
      alert('베트남어 번역이 완료되었습니다.');
    } catch (e) {
      console.error(e);
      alert('번역 중 오류가 발생했습니다. API 키 설정을 확인해 주세요.');
    } finally {
      setIsTranslating(false);
    }
  };

  const approvedLibrary = useMemo(() => {
    const library: OrderRow[] = [];
    const seen = new Set<string>();
    orders.filter(o => 
      o.status === OrderSubCategory.APPROVED_SEOUL || 
      o.status === OrderSubCategory.APPROVED_DAECHEON || 
      o.status === OrderSubCategory.APPROVED_VIETNAM || 
      o.status === OrderSubCategory.APPROVED
    ).forEach(order => {
      order.rows.forEach(row => {
        const key = row.itemName.trim().toLowerCase();
        if (key && !seen.has(key) && !row.isDeleted) {
          library.push({ ...row, id: Math.random().toString(36).substr(2, 9) });
          seen.add(key);
        }
      });
    });
    return library;
  }, [orders]);

  const handleCreateSubmit = () => {
    if (!formTitle.trim()) { alert('제목을 입력해주세요.'); return; }
    const newOrder: OrderItem = {
      id: `ORD-${Date.now()}`, 
      title: formTitle, 
      location: formLocation, 
      status: OrderSubCategory.PENDING, 
      authorId: currentUser.initials, 
      date: formDate, 
      rows: formRows.filter(r => r.dept.trim() || r.model.trim() || r.itemName.trim() || r.price.trim()), 
      stamps: { 
        writer: { userId: currentUser.initials, timestamp: getCurrentTime() } 
      }, 
      createdAt: new Date().toISOString()
    };
    saveOrders([newOrder, ...orders]);
    alert('작성이 완료되었습니다.');
    setView({ type: 'DASHBOARD' });
  };

  const updateRowField = useCallback((rowId: string, field: keyof OrderRow, value: string) => {
    setFormRows(prev => prev.map(row => row.id === rowId ? { ...row, [field]: value } : row));
    if (field === 'itemName') {
      const query = value.toLowerCase().trim();
      if (query.length > 0) {
        const filtered = approvedLibrary.filter(item => item.itemName.toLowerCase().includes(query)).slice(0, 10);
        setSuggestions(filtered);
        setSuggestionTarget({ rowId, field });
      } else {
        setSuggestions([]);
        setSuggestionTarget(null);
      }
    }
  }, [approvedLibrary]);

  const selectSuggestion = (rowId: string, item: OrderRow) => {
    setFormRows(prev => prev.map(row => row.id === rowId ? { 
      ...row, 
      dept: item.dept || row.dept,
      model: item.model || row.model,
      itemName: item.itemName,
      price: item.price || row.price,
      unitPrice: item.unitPrice || row.unitPrice,
      remarks: item.remarks || row.remarks
    } : row));
    setSuggestions([]);
    setSuggestionTarget(null);
  };

  const handleRowKeyDown = (e: React.KeyboardEvent, rowIdx: number, colIdx: number) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const nextColIdx = colIdx + 1;
      const targetRows = sub === OrderSubCategory.CREATE ? formRows : (activeOrder?.rows || []);
      if (nextColIdx <= 5) {
        (document.querySelector(`[data-row="${rowIdx}"][data-col="${nextColIdx}"]`) as HTMLTextAreaElement)?.focus();
      } else {
        const nextRowIdx = rowIdx + 1;
        if (nextRowIdx >= targetRows.length) {
          if (sub === OrderSubCategory.CREATE) {
            const newRow = { id: Math.random().toString(36).substr(2, 9), dept: '', model: '', itemName: '', price: '', unitPrice: '', remarks: '' };
            setFormRows(prev => [...prev, newRow]);
          } else if (activeOrder) {
            handleRowDelete(activeOrder, 'NEW_ROW_REQUEST');
          }
          setTimeout(() => (document.querySelector(`[data-row="${nextRowIdx}"][data-col="0"]`) as HTMLTextAreaElement)?.focus(), 50);
        } else (document.querySelector(`[data-row="${nextRowIdx}"][data-col="0"]`) as HTMLTextAreaElement)?.focus();
      }
    }
  };

  const handleStampAction = (order: OrderItem, type: 'head' | 'manager' | 'director') => {
    const userInit = currentUser.initials.toLowerCase().trim();
    const isMaster = currentUser.loginId === 'AJ5200';
    if (type === 'head' && !isMaster && userInit !== 'u-sun') { alert('법인장 결재 권한이 없습니다. (u-sun 전용)'); return; }
    if (type === 'manager' && !isMaster && userInit !== 'j-sung') { alert('과장 결재 권한이 없습니다. (j-sung 전용)'); return; }
    if (type === 'director' && !isMaster && userInit !== 'm-yeun') { alert('이사 결재 권한이 없습니다. (m-yeun 전용)'); return; }
    
    const updatedStamps = { ...order.stamps, [type]: { userId: currentUser.initials, timestamp: getCurrentTime() } };
    let nextStatus = order.status;
    const isSeoul = order.location === 'SEOUL';
    const isFullApproved = isSeoul ? (updatedStamps.writer && updatedStamps.head && updatedStamps.manager && updatedStamps.director) : (updatedStamps.writer && updatedStamps.head);
    if (isFullApproved) nextStatus = OrderSubCategory.APPROVED;
    const updatedOrders = orders.map(o => o.id === order.id ? { ...o, stamps: updatedStamps, status: nextStatus } : o);
    saveOrders(updatedOrders);
    if (activeOrder?.id === order.id) setActiveOrder({...order, stamps: updatedStamps, status: nextStatus});
    if (nextStatus === OrderSubCategory.APPROVED) { alert('최종 결재가 승인되어 결재완료 폴더로 이동되었습니다.'); setActiveOrder(null); }
  };

  const handleFinalComplete = (order: OrderItem) => {
    const updatedStamps = { ...order.stamps, final: { userId: currentUser.initials, timestamp: getCurrentTime() } };
    let nextStatus = OrderSubCategory.APPROVED;
    if (order.location === 'SEOUL') nextStatus = OrderSubCategory.APPROVED_SEOUL;
    else if (order.location === 'DAECHEON') nextStatus = OrderSubCategory.APPROVED_DAECHEON;
    else if (order.location === 'VIETNAM') nextStatus = OrderSubCategory.APPROVED_VIETNAM;
    const updatedOrders = orders.map(o => o.id === order.id ? { ...o, stamps: updatedStamps, status: nextStatus } : o);
    saveOrders(updatedOrders);
    alert('최종 보관 처리가 완료되었습니다.');
    setActiveOrder(null);
  };

  const handleRejectAction = (order: OrderItem) => {
    const updatedOrders = orders.map(o => o.id === order.id ? { ...o, status: OrderSubCategory.REJECTED } : o);
    saveOrders(updatedOrders);
    setRejectingOrder(null); setActiveOrder(null);
  };

  const handleFileDelete = (orderId: string) => {
    if (!isMaster) return;
    saveOrders(orders.filter(o => o.id !== orderId));
    setDeletingFileId(null); setActiveOrder(null);
  };

  const handleRowEdit = (order: OrderItem, rowId: string, field: keyof OrderRow, value: string) => {
    const updatedOrders = orders.map(o => o.id === order.id ? { ...o, rows: o.rows.map(r => r.id === rowId ? { ...r, [field]: value, modLog: { userId: currentUser.initials, timestamp: getCurrentTime(), type: 'EDIT' as const } } : r) } : o);
    saveOrders(updatedOrders);
    if (activeOrder?.id === order.id) {
      const updatedOrder = updatedOrders.find(uo => uo.id === order.id);
      if (updatedOrder) setActiveOrder(updatedOrder);
    }
  };

  const handleRowDelete = (order: OrderItem, rowId: string, index?: number) => {
    const updatedOrders = orders.map(o => {
      if (o.id === order.id) {
        let updatedRows = [...o.rows];
        const isNewRequest = rowId === 'NEW_ROW_REQUEST';
        
        if (!isNewRequest) {
          updatedRows = updatedRows.map(r => 
            r.id === rowId ? { 
              ...r, 
              isDeleted: true, 
              modLog: { userId: currentUser.initials, timestamp: getCurrentTime(), type: 'DELETE' as const } 
            } : r
          );
        }
        
        const newRow = { 
          id: `NEW-${Math.random().toString(36).substr(2, 9)}`, 
          dept: '', model: '', itemName: '', price: '', unitPrice: '', remarks: '' 
        };

        if (isNewRequest) {
          updatedRows.push(newRow);
        } else if (typeof index === 'number') {
          updatedRows.splice(index + 1, 0, newRow);
        } else {
          updatedRows.push(newRow);
        }
        
        return { ...o, rows: updatedRows };
      }
      return o;
    });
    saveOrders(updatedOrders);
    if (activeOrder?.id === order.id) {
      const updatedOrder = updatedOrders.find(uo => uo.id === order.id);
      if (updatedOrder) setActiveOrder(updatedOrder);
    }
  };

  const handlePrint = () => {
    const printContent = document.querySelector('.document-print-content')?.innerHTML;
    if (!printContent) return;
    const filename = `${activeOrder?.title || '주문서'}_${activeOrder?.date || ''}`.replace(/[/\\?%*:|"<>]/g, '-');
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`<html><head><title>${filename}</title><script src="https://cdn.tailwindcss.com"></script><style>body { font-family: 'Gulim', sans-serif; padding: 20px; background: white; } .no-print { display: none !important; } .bg-red-50 { background-color: #fef2f2 !important; } .text-red-600 { color: #dc2626 !important; } .line-through { text-decoration: line-through !important; } table { border-collapse: collapse; width: 100%; border: 2px solid black !important; } th, td { border: 2px solid black !important; padding: 6px; vertical-align: top; } @page { size: A4 landscape; margin: 10mm; } .document-print-content { width: 100% !important; box-shadow: none !important; border: none !important; }</style></head><body onload="window.print();"><div>${printContent}</div></body></html>`);
      printWindow.document.close();
    } else alert('팝업이 차단되었습니다.');
  };

  const getLocationColor = (location: 'SEOUL' | 'DAECHEON' | 'VIETNAM') => {
    switch(location) {
      case 'SEOUL': return { bg: 'bg-blue-50', text: 'text-blue-500', groupHover: 'group-hover:bg-blue-100' };
      case 'DAECHEON': return { bg: 'bg-emerald-50', text: 'text-emerald-500', groupHover: 'group-hover:bg-emerald-100' };
      case 'VIETNAM': return { bg: 'bg-amber-50', text: 'text-amber-500', groupHover: 'group-hover:bg-amber-100' };
      default: return { bg: 'bg-slate-50', text: 'text-slate-500', groupHover: 'group-hover:bg-slate-100' };
    }
  };

  if (sub === OrderSubCategory.CREATE) return <div className="py-4 md:py-8 bg-slate-200 min-h-screen overflow-x-auto"><RenderDocumentTable rows={formRows} isCreate={true} formLocation={formLocation} formTitle={formTitle} formDate={formDate} setFormDate={setFormDate} setFormTitle={setFormTitle} setFormLocation={setFormLocation} updateRowField={updateRowField} handleRowKeyDown={handleRowKeyDown} handleCreateSubmit={handleCreateSubmit} suggestionTarget={suggestionTarget} suggestions={suggestions} selectSuggestion={selectSuggestion} userAccounts={userAccounts} isVietnameseLabels={false}/></div>;
  
  if (!activeOrder) {
    const isSearchableFolder = sub.includes('(완료)');
    const filtered = orders.filter(o => o.status === sub);
    
    // 2. 파일은 수정날짜(createdAt) 순으로 10개씩 순차적으로 보관되게 (정렬 및 슬라이스 추가)
    const sortedAndLimited = [...filtered]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 10);

    const searchFiltered = sortedAndLimited.filter(o => {
      if (!searchTerm.trim()) return true;
      const lowerSearch = searchTerm.toLowerCase();
      const hasMatchInRows = o.rows.some(r => r.model.toLowerCase().includes(lowerSearch) || r.itemName.toLowerCase().includes(lowerSearch));
      return o.title.toLowerCase().includes(lowerSearch) || hasMatchInRows;
    });

    return (
      <div className="space-y-4 md:space-y-6 text-left">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h2 className="text-2xl md:text-3xl font-black text-slate-900">{sub}</h2>
            <div className="flex flex-wrap items-center gap-2 md:gap-4 mt-2">
              <p className="text-slate-500 text-xs md:text-sm">총 {searchFiltered.length}건{searchTerm && ' (검색됨)'}</p>
              <div className="hidden md:block h-4 w-[1px] bg-slate-300"></div>
              <div className="flex bg-slate-200 p-1 rounded-lg">
                <button 
                  onClick={() => setViewMode('ICON')}
                  className={`px-3 py-1 rounded-md text-[10px] font-bold transition-all ${viewMode === 'ICON' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  아이콘
                </button>
                <button 
                  onClick={() => setViewMode('DETAIL')}
                  className={`px-3 py-1 rounded-md text-[10px] font-bold transition-all ${viewMode === 'DETAIL' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  리스트
                </button>
              </div>
            </div>
          </div>
          {isSearchableFolder && (
            <div className="relative w-full md:max-w-sm">
              <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="기종/품목 검색..." className="w-full px-4 md:px-5 py-2.5 md:py-3 rounded-xl md:rounded-2xl border border-slate-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-sm font-medium"/>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 md:h-5 md:w-5 absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
            </div>
          )}
        </div>

        {viewMode === 'ICON' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-8">
            {searchFiltered.length === 0 ? (
              <div className="col-span-full py-16 md:py-32 text-center text-slate-400 border-4 border-dashed rounded-3xl bg-white/50 text-sm md:text-lg">{searchTerm ? '검색 결과가 없습니다.' : '폴더가 비어 있습니다.'}</div>
            ) : (
              searchFiltered.map(o => {
                const colors = getLocationColor(o.location);
                return (
                  <div key={o.id} className="relative group">
                    <button onClick={() => { setActiveOrder(o); setOriginalOrder(null); setIsVietnameseLabels(false); setTranslatedLocation(''); }} className="w-full bg-white p-6 md:p-8 rounded-2xl md:rounded-3xl shadow-sm border-2 border-slate-100 hover:border-blue-500 hover:shadow-xl transition-all flex flex-col items-center relative overflow-hidden">
                      <div className={`w-12 h-16 md:w-16 md:h-20 ${colors.bg} ${colors.groupHover} rounded-lg shadow-inner mb-4 md:mb-6 flex items-center justify-center border border-slate-100 transition-colors relative`}>
                        <svg xmlns="http://www.w3.org/2000/svg" className={`h-6 w-6 md:h-8 md:w-8 ${colors.text} opacity-60`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                      </div>
                      <h3 className="font-black text-slate-800 text-sm md:text-base truncate w-full text-center mb-1">{o.title}</h3>
                      <p className="text-[10px] md:text-[11px] text-slate-400 uppercase font-bold tracking-widest">{o.date}</p>

                      {o.status === OrderSubCategory.PENDING && (
                        <div className="flex gap-1.5 md:gap-2.5 mt-4 md:mt-5">
                          <div className="w-4 h-4 md:w-5 md:h-5 rounded-full bg-blue-500 shadow-md border-2 border-white" title="작성완료"></div>
                          <div className={`w-4 h-4 md:w-5 md:h-5 rounded-full shadow-md border-2 border-white transition-colors ${o.stamps.head ? 'bg-green-500' : 'bg-slate-200'}`} title="법인장 결재"></div>
                          {o.location === 'SEOUL' && (
                            <>
                              <div className={`w-4 h-4 md:w-5 md:h-5 rounded-full shadow-md border-2 border-white transition-colors ${o.stamps.manager ? 'bg-green-500' : 'bg-slate-200'}`} title="과장 결재"></div>
                              <div className={`w-4 h-4 md:w-5 md:h-5 rounded-full shadow-md border-2 border-white transition-colors ${o.stamps.director ? 'bg-green-500' : 'bg-slate-200'}`} title="이사 결재"></div>
                            </>
                          )}
                        </div>
                      )}
                    </button>
                    {isMaster && (
                      <button onClick={(e) => { e.stopPropagation(); setDeletingFileId(o.id); }} className="absolute -top-2 -right-2 bg-red-600 text-white w-7 h-7 md:w-8 md:h-8 rounded-full shadow-lg hover:bg-red-700 flex items-center justify-center z-10"><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg></button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        ) : (
          <div className="bg-white rounded-xl md:rounded-2xl border border-slate-200 overflow-x-auto shadow-sm">
            <table className="w-full text-left min-w-[600px]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-4 md:px-6 py-3 md:py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">날짜</th>
                  <th className="px-4 md:px-6 py-3 md:py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">제목</th>
                  <th className="px-4 md:px-6 py-3 md:py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">구매처</th>
                  <th className="px-4 md:px-6 py-3 md:py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">작성자</th>
                  <th className="px-4 md:px-6 py-3 md:py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">상태</th>
                  <th className="px-4 md:px-6 py-3 md:py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {searchFiltered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-slate-400 font-medium italic">데이터가 없습니다.</td>
                  </tr>
                ) : (
                  searchFiltered.map(o => {
                    const colors = getLocationColor(o.location);
                    return (
                      <tr key={o.id} className="hover:bg-slate-50 transition-colors cursor-pointer group" onClick={() => setActiveOrder(o)}>
                        <td className="px-4 md:px-6 py-3 md:py-4 text-xs font-mono text-slate-500 whitespace-nowrap">{o.date}</td>
                        <td className="px-4 md:px-6 py-3 md:py-4 text-xs md:text-sm font-black text-slate-800">{o.title}</td>
                        <td className="px-4 md:px-6 py-3 md:py-4 text-center">
                          <span className={`inline-block px-2 md:px-3 py-0.5 md:py-1 rounded-full text-[9px] md:text-[10px] font-bold border ${colors.bg} ${colors.text} border-transparent whitespace-nowrap`}>
                            {o.location === 'SEOUL' ? '서울' : o.location === 'DAECHEON' ? '대천' : '베트남'}
                          </span>
                        </td>
                        <td className="px-4 md:px-6 py-3 md:py-4 text-center text-[10px] md:text-xs font-bold text-slate-600 uppercase tracking-tighter">
                          {o.authorId}
                        </td>
                        <td className="px-4 md:px-6 py-3 md:py-4 text-center">
                          <span className={`inline-block px-2 py-0.5 rounded text-[8px] md:text-[9px] font-black tracking-tighter uppercase whitespace-nowrap ${o.status.includes('(완료)') ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                            {o.status}
                          </span>
                        </td>
                        <td className="px-4 md:px-6 py-3 md:py-4 text-right">
                          <div className="flex justify-end items-center gap-3">
                            <span className="text-[10px] font-bold text-blue-600 hidden md:inline opacity-0 group-hover:opacity-100 transition-opacity">보기 →</span>
                            {isMaster && (
                              <button 
                                onClick={(e) => { e.stopPropagation(); setDeletingFileId(o.id); }} 
                                className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {deletingFileId && <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4"><div className="bg-white rounded-3xl p-6 md:p-8 max-w-sm w-full shadow-2xl"><h3 className="text-xl font-black text-slate-900 mb-4 text-center">파일 영구 삭제</h3><p className="text-slate-600 mb-8 leading-relaxed text-center text-sm">삭제된 데이터는 복구할 수 없습니다.</p><div className="flex gap-4"><button onClick={() => setDeletingFileId(null)} className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold">취소</button><button onClick={() => handleFileDelete(deletingFileId)} className="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold">삭제</button></div></div></div>}
      </div>
    );
  }

  return (
    <div className={`py-4 md:py-8 bg-slate-200 min-h-screen ${isPreviewing ? 'fixed inset-0 z-[100] bg-slate-900 overflow-y-auto' : ''}`}>
      <div className="max-w-[1000px] mx-auto mb-4 md:mb-6 flex flex-col md:flex-row justify-between items-start md:items-center px-4 no-print gap-4">
        {isPreviewing ? (
          <div>
            <h2 className="text-xl md:text-2xl font-black text-white">PDF 저장 미리보기</h2>
            <p className="text-slate-400 text-[10px] md:text-sm italic">인쇄창의 대상에서 [PDF로 저장]을 선택해 보관하세요.</p>
          </div>
        ) : (
          <button onClick={() => setActiveOrder(null)} className="bg-white px-4 md:px-6 py-2.5 md:py-3 rounded-xl font-bold shadow-lg hover:bg-slate-50 border border-slate-300 transition-all flex items-center gap-2 text-sm md:text-base">← 목록으로</button>
        )}
        <div className="flex flex-wrap gap-2 md:gap-3 w-full md:w-auto">
          {isPreviewing ? (
            <>
              <button onClick={() => setIsPreviewing(false)} className="flex-1 md:flex-none bg-slate-700 text-white px-4 md:px-6 py-2.5 md:py-3 rounded-xl font-bold hover:bg-slate-600 transition-all text-sm">닫기</button>
              <button onClick={handlePrint} className="flex-1 md:flex-none bg-blue-500 text-white px-6 md:px-8 py-2.5 md:py-3 rounded-xl font-black shadow-2xl hover:bg-blue-400 flex items-center justify-center gap-2 transition-all text-sm">저장하기</button>
            </>
          ) : (
            <>
              {(activeOrder.status === OrderSubCategory.APPROVED_VIETNAM || activeOrder.location === 'VIETNAM' || sub.includes('(완료)')) && <button onClick={handleTranslateToVietnam} disabled={isTranslating} className={`flex-1 md:flex-none px-4 md:px-6 py-2.5 md:py-3 rounded-xl font-black shadow-lg flex items-center justify-center gap-2 transition-all text-[10px] md:text-xs ${isVietnameseLabels ? 'bg-amber-500 text-white hover:bg-amber-600' : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50'}`}>{isTranslating ? '...' : (isVietnameseLabels ? '한글' : 'VIET')}</button>}
              {activeOrder.status === OrderSubCategory.PENDING && <button onClick={() => setRejectingOrder(activeOrder)} className="flex-1 md:flex-none px-4 md:px-6 py-2.5 md:py-3 bg-red-100 text-red-600 rounded-xl font-bold hover:bg-red-600 hover:text-white border border-red-200 transition-all text-[10px] md:text-xs">반송</button>}
              <button onClick={() => setIsPreviewing(true)} className="flex-1 md:flex-none bg-blue-600 text-white px-4 md:px-8 py-2.5 md:py-3 rounded-xl font-black shadow-lg hover:bg-blue-700 flex items-center justify-center gap-2 transition-all text-[10px] md:text-xs">PDF 저장</button>
            </>
          )}
        </div>
      </div>
      <div className="print-area overflow-x-auto">
        <RenderDocumentTable rows={activeOrder.rows} isCreate={false} order={activeOrder} isPreviewing={isPreviewing} handleRowEdit={handleRowEdit} handleRowDelete={handleRowDelete} handleRowKeyDown={handleRowKeyDown} handleStampAction={handleStampAction} handleFinalComplete={handleFinalComplete} userAccounts={userAccounts} isVietnameseLabels={isVietnameseLabels} translatedLocation={translatedLocation} />
      </div>
      {rejectingOrder && <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4"><div className="bg-white rounded-3xl p-6 md:p-8 max-sm w-full shadow-2xl"><h3 className="text-lg md:text-xl font-black text-slate-900 mb-4 text-center">결재 반송 확인</h3><div className="flex gap-4"><button onClick={() => setRejectingOrder(null)} className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold">취소</button><button onClick={() => handleRejectAction(rejectingOrder)} className="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold">반송</button></div></div></div>}
    </div>
  );
};

export default OrderView;
