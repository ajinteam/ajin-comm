
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { OrderSubCategory, OrderItem, OrderRow, UserAccount, ViewState } from '../types';
import { GoogleGenAI, Type } from "@google/genai";
import { pushStateToCloud } from '../supabase';

interface OrderViewProps {
  sub: OrderSubCategory;
  currentUser: UserAccount;
  userAccounts: UserAccount[];
  setView: (v: ViewState) => void;
  dataVersion: number;
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
      className={`w-full bg-transparent resize-none overflow-hidden outline-none p-1 block ${className}`}
      rows={1}
    />
  );
});

const formatAmPm = (timeStr: string) => {
  if (!timeStr) return '';
  return timeStr.replace('오전', 'am').replace('오후', 'pm');
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

// Added setSelection to the props destructuring to fix "Cannot find name 'setSelection'" error
const RenderDocumentTable = React.memo(({ 
  rows, isCreate, order, isPreviewing, formLocation, formTitle, formDate,
  setFormDate, setFormTitle, setFormLocation, updateRowField, handleRowKeyDown,
  handleCreateSubmit, handleRowEdit, handleRowDelete, handleStampAction,
  handleFinalComplete, suggestionTarget, suggestions, selectSuggestion, userAccounts,
  isVietnameseLabels, translatedLocation,
  selection, setSelection, handleCellMouseDown, handleCellMouseEnter, merges, aligns, borders, handlePaste, takeSnapshot,
  handleInsertRow, handleDeleteTableRow
}: any) => {
  const location = isCreate ? formLocation : order?.location;
  const stamps = isCreate ? {} : order?.stamps;
  const getInitials = (userId?: string) => {
    if (!userId) return '';
    return userAccounts.find((u: UserAccount) => u.loginId === userId)?.initials || userId;
  };
  
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

  const isCellSelected = (r: number, c: number) => {
    if (!selection) return false;
    const { sR, sC, eR, eC } = selection;
    const minR = Math.min(sR, eR), maxR = Math.max(sR, eR), minC = Math.min(sC, eC), maxC = Math.max(sC, eC);
    return r >= minR && r <= maxR && c >= minC && c <= maxC;
  };

  const currentMerges = merges || {};
  const currentAligns = aligns || {};
  const currentBorders = borders || {};

  return (
    <div className="bg-white border border-slate-300 shadow-xl mx-auto p-4 md:p-12 min-h-[297mm] w-full max-w-[1000px] text-slate-800 font-gulim relative document-print-content text-left overflow-x-auto">
      <div className="min-w-[700px]">
        <div className="flex justify-between items-start mb-10">
          <div className="text-3xl md:text-5xl font-bold underline decoration-2 underline-offset-8 uppercase">{labels.mainTitle}</div>
          <table className="border-collapse border border-slate-900 text-center text-[10px] w-auto min-w-[300px]">
            <tbody>
              <tr>
                <td rowSpan={2} className="border border-slate-900 px-2 py-2 bg-slate-50 font-bold w-8 text-[11px] leading-tight whitespace-pre-wrap">{labels.approval}</td>
                <td className="border border-slate-900 px-4 py-1 bg-slate-50 w-24 font-bold">{labels.writer}</td>
                {showManager && <td className="border border-slate-900 px-4 py-1 bg-slate-50 w-24 font-bold">{labels.manager}</td>}
                <td className="border border-slate-900 px-4 py-1 bg-slate-50 w-24 font-bold">{labels.head}</td>
                {showDirector && <td className="border border-slate-900 px-4 py-1 bg-slate-50 w-24 font-bold">{labels.director}</td>}
              </tr>
              <tr className="h-16">
                <td className="border border-slate-900 p-1 align-middle">
                  {stamps?.writer && <div className="flex flex-col items-center"><span className="font-bold text-blue-700 text-[11px]">{getInitials(stamps.writer.userId)}</span><span className="text-[8px] opacity-70 leading-tight mt-0.5">{formatAmPm(stamps.writer.timestamp)}</span></div>}
                </td>
                {showManager && (
                  <td className={`border border-slate-900 p-1 align-middle transition-colors ${!isCreate && !stamps?.manager && stamps?.head && order?.status === OrderSubCategory.PENDING ? 'cursor-pointer hover:bg-amber-50' : ''}`} onClick={() => !isCreate && !stamps?.manager && stamps?.head && order?.status === OrderSubCategory.PENDING && handleStampAction(order!, 'manager')}>
                    {stamps?.manager ? <div className="flex flex-col items-center"><span className="font-bold text-green-700 text-[11px]">{getInitials(stamps.manager.userId)}</span><span className="text-[8px] opacity-70 leading-tight mt-0.5">{formatAmPm(stamps.manager.timestamp)}</span></div> : (!isCreate && order?.status === OrderSubCategory.PENDING && stamps?.head) ? <span className="text-[9px] text-slate-400">승인</span> : null}
                  </td>
                )}
                <td className={`border border-slate-900 p-1 align-middle transition-colors ${!isCreate && !stamps?.head && order?.status === OrderSubCategory.PENDING ? 'cursor-pointer hover:bg-amber-50' : ''}`} onClick={() => !isCreate && !stamps?.head && order?.status === OrderSubCategory.PENDING && handleStampAction(order!, 'head')}>
                  {stamps?.head ? <div className="flex flex-col items-center"><span className="font-bold text-green-700 text-[11px]">{getInitials(stamps.head.userId)}</span><span className="text-[8px] opacity-70 leading-tight mt-0.5">{formatAmPm(stamps.head.timestamp)}</span></div> : (!isCreate && order?.status === OrderSubCategory.PENDING) ? <span className="text-[9px] text-slate-400">승인</span> : null}
                </td>
                {showDirector && (
                  <td className={`border border-slate-900 p-1 align-middle transition-colors ${!isCreate && !stamps?.director && stamps?.manager && order?.status === OrderSubCategory.PENDING ? 'cursor-pointer hover:bg-amber-50' : ''}`} onClick={() => !isCreate && !stamps?.director && stamps?.manager && order?.status === OrderSubCategory.PENDING && handleStampAction(order!, 'director')}>
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

        <table className="w-full border-collapse border border-slate-900 text-xs md:text-sm">
          <thead className="bg-slate-100">
            <tr>
              <th className="border border-slate-900 p-1 md:p-2 w-[10%]">{labels.dept}</th>
              <th className="border border-slate-900 p-1 md:p-2 w-[15%]">{labels.model}</th>
              <th className="border border-slate-900 p-1 md:p-2 flex-1">{labels.itemName}</th>
              <th className="border border-slate-900 p-1 md:p-2 w-16">{labels.qty}</th>
              <th className="border border-slate-900 p-1 md:p-2 w-20">{labels.unitPrice}</th>
              <th className="border border-slate-900 p-1 md:p-2 w-[18%]">{labels.remarks}</th>
              {!isPreviewing && <th className="border border-slate-900 p-1 md:p-2 w-20 md:w-24 no-print">{labels.manage}</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row: OrderRow, idx: number) => {
              const isRowEditableInLockedDoc = row.id && typeof row.id === 'string' && row.id.startsWith('NEW-');
              const finalDisabled = isPreviewing || row.isDeleted || (isLocked && !isRowEditableInLockedDoc);

              const colFields: (keyof OrderRow)[] = ['dept', 'model', 'itemName', 'price', 'unitPrice', 'remarks'];

              return (
                <tr key={row.id} className={`${row.isDeleted ? 'bg-red-50' : ''} relative`}>
                  {colFields.map((field, cIdx) => {
                    const merge = currentMerges[`${idx}-${cIdx}`];
                    const isSkipped = Object.entries(currentMerges).some(([key, m]: [string, any]) => {
                      const [mr, mc] = key.split('-').map(Number);
                      return idx >= mr && idx < mr + m.rS && cIdx >= mc && cIdx < mc + m.cS && !(idx === mr && cIdx === mc);
                    });
                    if (isSkipped) return null;

                    const isSelected = isCellSelected(idx, cIdx);
                    const textAlign = currentAligns[`${idx}-${cIdx}`] || (field === 'itemName' ? 'left' : 'center');
                    const isChanged = row.changedFields?.includes(field as string);
                    const borderStyles = getCellBorderStyle(idx, cIdx, currentBorders);

                    return (
                      <td 
                        key={cIdx} 
                        rowSpan={merge?.rS || 1} 
                        colSpan={merge?.cS || 1}
                        onMouseDown={() => !isPreviewing && !isLocked && handleCellMouseDown(idx, cIdx)}
                        onMouseEnter={() => !isPreviewing && !isLocked && handleCellMouseEnter(idx, cIdx)}
                        style={{ ...borderStyles }}
                        className={`border border-slate-900 p-0 align-top relative transition-all ${isSelected ? 'bg-blue-100 ring-1 ring-blue-400 z-10' : ''}`}
                      >
                        {/* fixed setSelection being undefined here by adding it to props */}
                        <AutoExpandingTextarea 
                          value={row[field]} 
                          dataRow={idx} 
                          dataCol={cIdx} 
                          disabled={finalDisabled} 
                          onFocus={() => { takeSnapshot(); setSelection({ sR: idx, sC: cIdx, eR: idx, eC: cIdx }); }}
                          onChange={(e: any) => isCreate ? updateRowField(row.id, field, e.target.value) : handleRowEdit(order!, row.id, field, e.target.value)} 
                          onKeyDown={(e: any) => handleRowKeyDown(e, idx, cIdx)} 
                          onPaste={(e: any) => handlePaste(e, idx, cIdx)}
                          style={{ textAlign }}
                          className={`${row.isDeleted ? 'text-red-600 line-through' : ''} ${isChanged ? 'text-red-600 font-bold' : ''}`}
                        />
                        {field === 'itemName' && isCreate && suggestionTarget?.rowId === row.id && suggestionTarget?.field === 'itemName' && suggestions.length > 0 && (
                          <div className="absolute left-0 right-0 top-full bg-white border border-slate-300 shadow-2xl z-50 rounded-b-lg overflow-hidden max-h-48 overflow-y-auto no-print">
                            {suggestions.map((item: OrderRow, sIdx: number) => (
                              <button key={sIdx} onClick={() => selectSuggestion(row.id, item)} className="w-full text-left px-3 py-2 text-[10px] md:text-xs hover:bg-blue-50 border-b border-slate-100 last:border-0 flex flex-col">
                                <span className="font-bold text-blue-700">{item.itemName}</span>
                                <span className="text-[8px] md:text-[10px] text-slate-500">{item.model} | {item.dept}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </td>
                    );
                  })}
                  
                  {!isPreviewing && (
                    <td className="border border-slate-900 p-2 text-center align-middle bg-slate-50/30 no-print">
                      {isCreate ? (
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => handleInsertRow(idx)} className="w-5 h-5 flex items-center justify-center bg-blue-50 text-blue-600 rounded-full hover:bg-blue-600 hover:text-white transition-all text-xs font-bold" title="행 삽입">+</button>
                          <button onClick={() => handleDeleteTableRow(idx)} className="w-5 h-5 flex items-center justify-center bg-red-50 text-red-600 rounded-full hover:bg-red-600 hover:text-white transition-all text-xs font-bold" title="행 삭제">-</button>
                        </div>
                      ) : (
                        <>
                          {(order?.status === OrderSubCategory.PENDING || order?.status === OrderSubCategory.REJECTED) && !row.isDeleted && (row.model || row.itemName || (row.id && row.id.startsWith('NEW-'))) && (
                            <button onClick={() => handleRowDelete(order!, row.id, idx)} className="text-[10px] px-2 py-1 bg-red-100 text-red-600 hover:bg-red-600 hover:text-white rounded font-bold shadow-sm">삭제</button>
                          )}
                          {row.modLog && <div className="text-[8px] md:text-[9px] text-slate-500 mt-1 leading-tight font-sans"><span className="font-bold">{row.modLog.type === 'DELETE' ? 'DEL' : 'MOD'}:</span> {getInitials(row.modLog.userId)}<br/>{formatAmPm(row.modLog.timestamp)}</div>}
                        </>
                      )}
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
            <button onClick={handleCreateSubmit} className="px-8 md:px-12 py-3 md:py-4 bg-slate-900 text-white rounded-lg font-black text-xl md:text-2xl hover:bg-blue-600 shadow-2xl transition-all active:scale-95">{order ? '수 정 완 료 (재제출)' : '주 문 서 작 성 완 료'}</button>
          </div>
        )}

        {!isCreate && order?.status === OrderSubCategory.APPROVED && !order.stamps?.final && (
          <div className="mt-8 md:mt-12 flex flex-col items-center justify-center no-print pt-10 border-t border-slate-100 pb-8">
            <button onClick={() => handleFinalComplete(order)} className="px-10 md:px-16 py-4 md:py-5 bg-blue-600 text-white rounded-2xl font-black text-xl md:text-2xl hover:bg-blue-700 shadow-2xl transition-all active:scale-95">완 료</button>
            <p className="mt-4 text-blue-500 text-xs md:sm font-bold tracking-tight text-center px-4">지정된 구매처({location === 'SEOUL' ? '서울' : location === 'DAECHEON' ? '대천' : '베트남'}) 폴더로 보관됩니다.</p>
          </div>
        )}

        {isFinalApproved && stamps?.final && (
          <div className="mt-8 md:mt-12 flex flex-col md:flex-row justify-end items-end md:items-center gap-4 text-xs font-bold no-print pb-8">
            <div className="bg-slate-100 px-4 md:px-5 py-2 md:py-3 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
              <div><span className="text-slate-400 mr-2 tracking-tighter uppercase">완료:</span><span className="text-blue-600">{getInitials(stamps.final?.userId)}</span></div>
              <div className="w-[1px] h-3 bg-slate-300"></div>
              <div><span className="text-slate-400 mr-2 tracking-tighter uppercase">완료일:</span><span className="text-slate-800 tracking-tighter">{formatAmPm(stamps.final?.timestamp || '')}</span></div>
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

const OrderView: React.FC<OrderViewProps> = ({ sub, currentUser, userAccounts, setView, dataVersion }) => {
  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [activeOrder, setActiveOrder] = useState<OrderItem | null>(null);
  const [originalOrder, setOriginalOrder] = useState<OrderItem | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [rejectingOrder, setRejectingOrder] = useState<OrderItem | null>(null);
  const [rejectReasonText, setRejectReasonText] = useState('');
  const [deletingFileId, setDeletingFileId] = useState<string | null>(null);
  const [rowToDelete, setRowToDelete] = useState<{order: OrderItem, rowId: string, index?: number} | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);
  const [isVietnameseLabels, setIsVietnameseLabels] = useState(false);
  const [translatedLocation, setTranslatedLocation] = useState('');
  const [suggestions, setSuggestions] = useState<OrderRow[]>([]);
  const [suggestionTarget, setSuggestionTarget] = useState<{rowId: string, field: string} | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'ICON' | 'DETAIL'>('ICON');
  
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const isMaster = currentUser.loginId === 'AJ5200';
  const [formLocation, setFormLocation] = useState<'SEOUL' | 'DAECHEON' | 'VIETNAM'>('SEOUL');
  const [formTitle, setFormTitle] = useState('');
  const [formDate, setFormDate] = useState(new Date().toLocaleDateString('ko-KR'));
  const [formRows, setFormRows] = useState<OrderRow[]>(createInitialRows(6));
  
  // 편집(재제출) 모드 상태
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [originalRejectedOrder, setOriginalRejectedOrder] = useState<OrderItem | null>(null);

  // Sync Logic
  const [undoStack, setUndoStack] = useState<string[]>([]);
  const [selection, setSelection] = useState<{ sR: number, sC: number, eR: number, eC: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [merges, setMerges] = useState<Record<string, { rS: number, cS: number }>>({});
  const [aligns, setAligns] = useState<Record<string, 'left' | 'center' | 'right'>>({});
  const [borders, setBorders] = useState<Record<string, { t?: string, b?: string, l?: string, r?: string }>>({});
  const [activeBorderStyle, setActiveBorderStyle] = useState<string>('solid');

  const takeSnapshot = useCallback(() => {
    const data = JSON.stringify({
      rows: (editingOrderId || sub === OrderSubCategory.CREATE) ? formRows : (activeOrder ? activeOrder.rows : formRows),
      merges,
      aligns,
      borders,
      formTitle,
      formDate,
      formLocation
    });
    setUndoStack(prev => {
      if (prev.length > 0 && prev[0] === data) return prev;
      return [data, ...prev].slice(0, 50);
    });
  }, [activeOrder, formRows, merges, aligns, borders, formTitle, formDate, formLocation, editingOrderId, sub]);

  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    const [last, ...rest] = undoStack;
    try {
      const data = JSON.parse(last);
      if (activeOrder && !editingOrderId) {
        const currentFullList = JSON.parse(localStorage.getItem('ajin_orders') || '[]');
        const updated = currentFullList.map((o: OrderItem) => 
          o.id === activeOrder.id ? { ...o, rows: data.rows, merges: data.merges, aligns: data.aligns, borders: data.borders } : o
        );
        localStorage.setItem('ajin_orders', JSON.stringify(updated));
        setOrders(updated);
        const nextActive = updated.find((o: OrderItem) => o.id === activeOrder.id);
        if (nextActive) setActiveOrder(nextActive);
      } else {
        setFormRows(data.rows);
        setFormTitle(data.formTitle || '');
        setFormDate(data.formDate || '');
        setFormLocation(data.formLocation || 'SEOUL');
      }
      setMerges(data.merges || {});
      setAligns(data.aligns || {});
      setBorders(data.borders || {});
      setUndoStack(rest);
    } catch (e) { console.error('Undo failed', e); }
  }, [undoStack, activeOrder, editingOrderId]);

  const getCurrentTime = () => {
    return new Date().toLocaleString('ko-KR', { hour12: true });
  };

  useEffect(() => {
    const saved = localStorage.getItem('ajin_orders');
    if (saved) {
      const parsedOrders = JSON.parse(saved);
      setOrders(parsedOrders);
      if (activeOrder) {
        const updatedActive = parsedOrders.find((o: OrderItem) => o.id === activeOrder.id);
        if (updatedActive) {
          setActiveOrder(updatedActive);
          setMerges(updatedActive.merges || {});
          setAligns(updatedActive.aligns || {});
          setBorders(updatedActive.borders || {});
        }
      }
    }
  }, [dataVersion]);
  
  useEffect(() => {
    setCurrentPage(1);
    // 폴더 이동 시 편집 모드 초기화
    if (sub !== OrderSubCategory.CREATE && sub !== OrderSubCategory.REJECTED) {
      setEditingOrderId(null);
      setOriginalRejectedOrder(null);
    }
  }, [sub, searchTerm]);

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
      const prompt = `Translate the following order document into Vietnamese. Input: ${JSON.stringify({ 
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
      alert('번역 중 오류가 발생했습니다.');
    } finally {
      setIsTranslating(false);
    }
  };

  const approvedLibrary = useMemo(() => {
    const library: OrderRow[] = [];
    const seen = new Set<string>();
    orders.filter(o => 
      o.status.includes('완료') || o.status === OrderSubCategory.APPROVED
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
    const validRows = formRows.filter(r => r.dept.trim() || r.model.trim() || r.itemName.trim() || r.price.trim());
    
    if (editingOrderId) {
      // 기존 반송 주문서 수정(재제출)
      const updatedOrders = orders.map(item => {
        if (item.id === editingOrderId) {
          return {
            ...item,
            title: formTitle,
            location: formLocation,
            date: formDate,
            rows: validRows,
            status: OrderSubCategory.PENDING, // 다시 결재대기로
            rejectReason: undefined, 
            rejectLog: undefined,   
            merges: merges,
            aligns: aligns,
            borders: borders,
            stamps: { 
              writer: { userId: currentUser.initials, timestamp: getCurrentTime() } 
            }
          };
        }
        return item;
      });
      saveOrders(updatedOrders);
      alert('수정이 완료되어 결재대기로 재제출되었습니다.');
      setEditingOrderId(null);
      setOriginalRejectedOrder(null);
      setFormRows(createInitialRows(6));
      setFormTitle('');
      setMerges({});
      setAligns({});
      setBorders({});
      setView({ type: 'ORDER', sub: OrderSubCategory.PENDING });
    } else {
      // 신규 주문서 작성
      const newOrder: OrderItem = {
        id: `ORD-${Date.now()}`, 
        title: formTitle, 
        location: formLocation, 
        status: OrderSubCategory.PENDING, 
        authorId: currentUser.initials, 
        date: formDate, 
        rows: validRows, 
        stamps: { 
          writer: { userId: currentUser.initials, timestamp: getCurrentTime() } 
        }, 
        createdAt: new Date().toISOString(),
        merges,
        aligns,
        borders
      } as any;
      
      saveOrders([newOrder, ...orders]);
      alert('작성이 완료되었습니다.');
      setFormRows(createInitialRows(6));
      setFormTitle('');
      setMerges({});
      setAligns({});
      setBorders({});
      setView({ type: 'DASHBOARD' });
    }
  };

  const updateRowField = useCallback((rowId: string, field: keyof OrderRow, value: string) => {
    setFormRows(prev => prev.map(row => {
      if (row.id === rowId) {
        let updatedFields = row.changedFields ? [...row.changedFields] : [];
        if (originalRejectedOrder) {
          const oriRow = originalRejectedOrder.rows.find(r => r.id === rowId);
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
  }, [approvedLibrary, originalRejectedOrder]);

  const handleRowEdit = useCallback((order: OrderItem, rowId: string, field: keyof OrderRow, value: string) => {
    const currentFullList = JSON.parse(localStorage.getItem('ajin_orders') || '[]');
    const updatedList = currentFullList.map((o: OrderItem) => {
      if (o.id === order.id) {
        const nextRows = o.rows.map(r => 
          r.id === rowId ? { 
            ...r, 
            [field]: value, 
            modLog: { userId: currentUser.initials, timestamp: getCurrentTime(), type: 'EDIT' as const } 
          } : r
        );
        return { ...o, rows: nextRows };
      }
      return o;
    });
    saveOrders(updatedList);
    const nextActive = updatedList.find((o: OrderItem) => o.id === order.id);
    if (nextActive) setActiveOrder(nextActive);
  }, [currentUser.initials]);

  const selectSuggestion = (rowId: string, item: OrderRow) => {
    takeSnapshot();
    setFormRows(prev => prev.map(row => {
      let updatedFields = row.changedFields ? [...row.changedFields] : [];
      const fieldsToCheck: (keyof OrderRow)[] = ['dept', 'model', 'itemName', 'price', 'unitPrice', 'remarks'];
      
      if (row.id === rowId) {
        const newValues: any = { 
          dept: item.dept || row.dept,
          model: item.model || row.model,
          itemName: item.itemName,
          price: item.price || row.price,
          unitPrice: item.unitPrice || row.unitPrice,
          remarks: item.remarks || row.remarks
        };

        if (originalRejectedOrder) {
          const oriRow = originalRejectedOrder.rows.find(r => r.id === rowId);
          fieldsToCheck.forEach(f => {
            const oriValue = oriRow ? (oriRow[f] || '') : '';
            if (String(newValues[f]).trim() !== String(oriValue).trim()) {
              if (!updatedFields.includes(f)) updatedFields.push(f);
            } else {
              updatedFields = updatedFields.filter(field => field !== f);
            }
          });
        }

        return { ...row, ...newValues, changedFields: updatedFields };
      }
      return row;
    }));
    setSuggestions([]);
    setSuggestionTarget(null);
  };

  const handleMerge = useCallback(() => {
    if (!selection) return;
    const { sR, sC, eR, eC } = selection;
    const minR = Math.min(sR, eR), maxR = Math.max(sR, eR), minC = Math.min(sC, eC), maxC = Math.max(sC, eC);
    if (minR === maxR && minC === maxC) return;
    takeSnapshot();
    const newMerges = { ...merges };
    const rowSpan = maxR - minR + 1, colSpan = maxC - minC + 1;
    for (let r = minR; r <= maxR; r++) { for (let c = minC; c <= maxC; c++) { delete newMerges[`${r}-${c}`]; } }
    newMerges[`${minR}-${minC}`] = { rS: rowSpan, cS: colSpan };
    setMerges(newMerges);
    if (activeOrder && !editingOrderId) {
      const currentFullList = JSON.parse(localStorage.getItem('ajin_orders') || '[]');
      const updated = currentFullList.map((o: OrderItem) => o.id === activeOrder.id ? { ...o, merges: newMerges } : o);
      saveOrders(updated);
    }
    setSelection(null);
  }, [selection, merges, takeSnapshot, activeOrder, editingOrderId]);

  const handleUnmerge = useCallback(() => {
    if (!selection) return;
    const { sR, sC, eR, eC } = selection;
    const minR = Math.min(sR, eR), maxR = Math.max(sR, eR), minC = Math.min(sC, eC), maxC = Math.max(sC, eC);
    takeSnapshot();
    const newMerges = { ...merges };
    for (let r = minR; r <= maxR; r++) {
      for (let c = minC; c <= maxC; c++) {
        delete newMerges[`${r}-${c}`];
      }
    }
    setMerges(newMerges);
    if (activeOrder && !editingOrderId) {
      const currentFullList = JSON.parse(localStorage.getItem('ajin_orders') || '[]');
      const updated = currentFullList.map((o: OrderItem) => o.id === activeOrder.id ? { ...o, merges: newMerges } : o);
      saveOrders(updated);
    }
    setSelection(null);
  }, [selection, merges, takeSnapshot, activeOrder, editingOrderId]);

  const handleAlign = useCallback((align: 'left' | 'center' | 'right') => {
    if (!selection) return;
    const { sR, sC, eR, eC } = selection;
    const minR = Math.min(sR, eR), maxR = Math.max(sR, eR), minC = Math.min(sC, eC), maxC = Math.max(sC, eC);
    takeSnapshot();
    const newAligns = { ...aligns };
    for (let r = minR; r <= maxR; r++) { for (let c = minC; c <= maxC; c++) { newAligns[`${r}-${c}`] = align; } }
    setAligns(newAligns);
    if (activeOrder && !editingOrderId) {
      const currentFullList = JSON.parse(localStorage.getItem('ajin_orders') || '[]');
      const updated = currentFullList.map((o: OrderItem) => o.id === activeOrder.id ? { ...o, aligns: newAligns } : o);
      saveOrders(updated);
    }
  }, [selection, aligns, takeSnapshot, activeOrder, editingOrderId]);

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
    if (activeOrder && !editingOrderId) {
      const currentFullList = JSON.parse(localStorage.getItem('ajin_orders') || '[]');
      const updated = currentFullList.map((o: OrderItem) => o.id === activeOrder.id ? { ...o, borders: newBorders } : o);
      saveOrders(updated);
    }
  }, [selection, borders, takeSnapshot, activeOrder, editingOrderId]);

  const handleClearSelectionText = useCallback(() => {
    if (!selection) return;
    const { sR, sC, eR, eC } = selection;
    const minR = Math.min(sR, eR), maxR = Math.max(sR, eR), minC = Math.min(sC, eC), maxC = Math.max(sC, eC);
    const fields: (keyof OrderRow)[] = ['dept', 'model', 'itemName', 'price', 'unitPrice', 'remarks'];
    
    takeSnapshot();
    if (!activeOrder || editingOrderId) {
      setFormRows(prev => {
        const next = [...prev];
        for (let r = minR; r <= maxR; r++) {
          if (!next[r]) continue;
          let row = { ...next[r] };
          let updatedFields = row.changedFields ? [...row.changedFields] : [];
          
          for (let c = minC; c <= maxC; c++) { 
            if (c < fields.length) {
              const field = fields[c];
              (row as any)[field] = '';
              
              if (originalRejectedOrder) {
                const oriRow = originalRejectedOrder.rows.find(or => or.id === row.id);
                const oriValue = oriRow ? (oriRow[field] || '') : '';
                if (String(oriValue).trim() !== '') {
                  if (!updatedFields.includes(field)) updatedFields.push(field);
                } else {
                  updatedFields = updatedFields.filter(f => f !== field);
                }
              }
            }
          }
          row.changedFields = updatedFields;
          next[r] = row;
        }
        return next;
      });
    } else {
      const currentFullList = JSON.parse(localStorage.getItem('ajin_orders') || '[]');
      const updatedList = currentFullList.map((o: OrderItem) => {
        if (o.id === activeOrder.id) {
          const nextRows = [...o.rows];
          for (let r = minR; r <= maxR; r++) {
            if (!nextRows[r]) continue;
            for (let c = minC; c <= maxC; c++) { if (c < fields.length) nextRows[r] = { ...nextRows[r], [fields[c]]: '', modLog: { userId: currentUser.initials, timestamp: getCurrentTime(), type: 'EDIT' as const } }; }
          }
          return { ...o, rows: nextRows };
        }
        return o;
      });
      saveOrders(updatedList);
      // Fixed "Cannot find name 'order'" error by changing it to activeOrder.id
      const nextActive = updatedList.find((o: OrderItem) => o.id === activeOrder.id);
      if (nextActive) setActiveOrder(nextActive);
    }
    setSelection(null);
  }, [selection, activeOrder, takeSnapshot, currentUser.initials, editingOrderId, originalRejectedOrder]);

  const handlePaste = (e: React.ClipboardEvent, startRowIdx: number, startColIdx: number) => {
    const pasteData = e.clipboardData.getData('text');
    if (!pasteData.includes('\t') && !pasteData.includes('\n')) return;
    e.preventDefault();
    takeSnapshot();
    const lines = pasteData.split(/\r?\n/).filter(line => line.length > 0);
    const grid = lines.map(row => row.split('\t'));
    const fields: (keyof OrderRow)[] = ['dept', 'model', 'itemName', 'price', 'unitPrice', 'remarks'];

    if (activeOrder && !editingOrderId) {
      const currentFullList = JSON.parse(localStorage.getItem('ajin_orders') || '[]');
      const updatedList = currentFullList.map((inv: OrderItem) => {
        if (inv.id === activeOrder.id) {
          let newRows = [...inv.rows];
          grid.forEach((pRow, rOffset) => {
            const rIdx = startRowIdx + rOffset;
            if (!newRows[rIdx]) newRows[rIdx] = { id: Math.random().toString(36).substr(2, 9), dept: '', model: '', itemName: '', price: '', unitPrice: '', remarks: '' };
            pRow.forEach((pCell, cOffset) => {
              const cIdx = startColIdx + cOffset;
              if (cIdx < fields.length) {
                const field = fields[cIdx];
                newRows[rIdx] = { ...newRows[rIdx], [field]: pCell, modLog: { userId: currentUser.initials, timestamp: getCurrentTime(), type: 'EDIT' as const } } as any;
              }
            });
          });
          return { ...inv, rows: newRows };
        }
        return inv;
      });
      saveOrders(updatedList);
      const current = updatedList.find((o: OrderItem) => o.id === activeOrder.id);
      if (current) setActiveOrder(current);
    } else {
      setFormRows(prev => {
        let newRows = [...prev];
        grid.forEach((pRow, rOffset) => {
          const rIdx = startRowIdx + rOffset;
          if (!newRows[rIdx]) newRows[rIdx] = { id: Math.random().toString(36).substr(2, 9), dept: '', model: '', itemName: '', price: '', unitPrice: '', remarks: '' };
          pRow.forEach((pCell, cOffset) => {
            const cIdx = startColIdx + cOffset;
            if (cIdx < fields.length) { 
              const field = fields[cIdx];
              let row = { ...newRows[rIdx] };
              (row as any)[field] = pCell;
              
              if (originalRejectedOrder) {
                const oriRow = originalRejectedOrder.rows.find(or => or.id === row.id);
                const oriValue = oriRow ? (oriRow[field] || '') : '';
                let updatedFields = row.changedFields ? [...row.changedFields] : [];
                if (String(pCell).trim() !== String(oriValue).trim()) {
                  if (!updatedFields.includes(field)) updatedFields.push(field);
                } else {
                  updatedFields = updatedFields.filter(f => f !== field);
                }
                row.changedFields = updatedFields;
              }
              newRows[rIdx] = row as any;
            }
          });
        });
        return newRows;
      });
    }
  };

  const handleRowKeyDown = (e: React.KeyboardEvent, rowIdx: number, colIdx: number) => {
    const validCols = [0, 1, 2, 3, 4, 5];
    const currentIndex = validCols.indexOf(colIdx);
    
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (currentIndex < validCols.length - 1) {
        const nextCol = validCols[currentIndex + 1];
        (document.querySelector(`[data-row="${rowIdx}"][data-col="${nextCol}"]`) as HTMLTextAreaElement)?.focus();
      } else {
        const nextRowIdx = rowIdx + 1;
        const isEditingMode = editingOrderId || sub === OrderSubCategory.CREATE;
        const targetRows = isEditingMode ? formRows : (activeOrder?.rows || []);
        if (nextRowIdx >= targetRows.length) {
          if (isEditingMode) {
            handleInsertRow(rowIdx);
          } else if (activeOrder) {
            handleRowDelete(activeOrder, 'NEW_ROW_REQUEST');
          }
          setTimeout(() => (document.querySelector(`[data-row="${nextRowIdx}"][data-col="0"]`) as HTMLTextAreaElement)?.focus(), 50);
        } else (document.querySelector(`[data-row="${nextRowIdx}"][data-col="0"]`) as HTMLTextAreaElement)?.focus();
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

  const handleCellMouseDown = (r: number, c: number) => { setSelection({ sR: r, sC: c, eR: r, eC: c }); setIsDragging(true); };
  const handleCellMouseEnter = (r: number, c: number) => { if (isDragging && selection) setSelection({ ...selection, eR: r, eC: c }); };
  const handleMouseUp = () => setIsDragging(false);

  useEffect(() => {
    window.addEventListener('mouseup', handleMouseUp);
    return () => window.removeEventListener('mouseup', handleMouseUp);
  }, []);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const isEditingMode = editingOrderId || sub === OrderSubCategory.CREATE || activeOrder;
      if (e.key === 'F4' && isEditingMode) { e.preventDefault(); handleMerge(); }
      if (e.key === 'Delete' && isEditingMode && selection) { e.preventDefault(); handleClearSelectionText(); }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [handleMerge, handleClearSelectionText, sub, activeOrder, selection, editingOrderId]);

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

  const handleRejectAction = () => {
    if (!rejectingOrder) return;
    if (!rejectReasonText.trim()) { alert('반송 사유를 입력해 주세요.'); return; }
    
    const updatedOrders = orders.map(item => {
      if (item.id === rejectingOrder.id) {
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
          status: OrderSubCategory.REJECTED, 
          rejectReason: rejectReasonText, 
          rejectLog: { userId: currentUser.initials, timestamp: getCurrentTime() } 
        };
      }
      return item;
    });
    
    saveOrders(updatedOrders);
    setRejectingOrder(null);
    setRejectReasonText('');
    setActiveOrder(null);
    alert('주문서가 반송되었습니다.');
    setView({ type: 'ORDER', sub: OrderSubCategory.REJECTED });
  };

  const handleEditRejected = (order: OrderItem) => {
    setEditingOrderId(order.id);
    setOriginalRejectedOrder(order);
    setFormTitle(order.title);
    setFormLocation(order.location);
    setFormDate(order.date);
    setFormRows(order.rows.length >= 6 ? order.rows : [...order.rows, ...createInitialRows(6 - order.rows.length)]);
    setMerges((order as any).merges || {});
    setAligns((order as any).aligns || {});
    setBorders(order.borders || {});
    setUndoStack([]);
    setActiveOrder(null); 
  };

  const handleFileDelete = (orderId: string) => {
    if (!isMaster) return;
    saveOrders(orders.filter(o => o.id !== orderId));
    setDeletingFileId(null); setActiveOrder(null);
  };

  const executeRowDelete = (order: OrderItem, rowId: string, index?: number) => {
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
    setRowToDelete(null);
  };

  const handleRowDelete = (order: OrderItem, rowId: string, index?: number) => {
    if (rowId === 'NEW_ROW_REQUEST') {
      executeRowDelete(order, rowId, index);
      return;
    }
    setRowToDelete({ order, rowId, index });
  };

  const handleInsertRow = (idx: number) => {
    takeSnapshot();
    const newRow = { id: Math.random().toString(36).substr(2, 9), dept: '', model: '', itemName: '', price: '', unitPrice: '', remarks: '' };
    const updated = [...formRows];
    updated.splice(idx + 1, 0, newRow);
    setFormRows(updated);
  };

  const handleDeleteTableRow = (idx: number) => {
    if (formRows.length <= 1) return;
    takeSnapshot();
    setFormRows(prev => prev.filter((_, i) => i !== idx));
  };

  const handlePrint = () => {
    const printContent = document.querySelector('.document-print-content')?.innerHTML;
    if (!printContent) return;
    const filename = `${activeOrder?.title || '주문서'}_${activeOrder?.date || ''}`.replace(/[/\\?%*:|"<>]/g, '-');
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`<html><head><title>${filename}</title><script src="https://cdn.tailwindcss.com"></script><style>body { font-family: 'Gulim', sans-serif; padding: 20px; background: white; } .no-print { display: none !important; } .bg-red-50 { background-color: #fef2f2 !important; } .text-red-600 { color: #dc2626 !important; } .line-through { text-decoration: line-through !important; } table { border-collapse: collapse; width: 100%; border: 1px solid black !important; } th, td { border: 1px solid black !important; padding: 6px; vertical-align: top; } @page { size: A4 landscape; margin: 10mm; } .document-print-content { width: 100% !important; box-shadow: none !important; border: none !important; }</style></head><body onload="window.print();"><div>${printContent}</div></body></html>`);
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

  const renderApprovalSteps = (item: OrderItem) => {
    const isSeoul = item.location === 'SEOUL';
    const steps = isSeoul 
      ? [
          { id: 'writer', label: '작성', info: item.stamps.writer },
          { id: 'head', label: '법인장', info: item.stamps.head },
          { id: 'manager', label: '과장', info: item.stamps.manager },
          { id: 'director', label: '이사', info: item.stamps.director }
        ]
      : [
          { id: 'writer', label: '작성', info: item.stamps.writer },
          { id: 'head', label: '법인장', info: item.stamps.head }
        ];

    let currentStepIdx = 0;
    if (item.stamps.writer) {
      currentStepIdx = 1; 
      if (item.stamps.head) {
        if (isSeoul) {
          currentStepIdx = 2; 
          if (item.stamps.manager) {
            currentStepIdx = 3; 
          }
        } else {
          currentStepIdx = 2; 
        }
      }
    }

    return (
      <div className="flex gap-3 mt-4">
        {steps.map((step, idx) => {
          let dotColor = 'bg-slate-200';
          if (step.info) {
            dotColor = 'bg-green-500 shadow-sm';
          } else if (idx === currentStepIdx) {
            dotColor = 'bg-blue-500 animate-pulse ring-4 ring-blue-100';
          }
          return (
            <div key={step.id} className="group/step relative">
              <div className={`w-5 h-5 rounded-full transition-all duration-300 ${dotColor}`} />
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-slate-900 text-white text-[8px] font-black rounded opacity-0 group-hover/step:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-20 uppercase tracking-tighter shadow-xl">
                {step.label} {step.info ? `(${userAccounts.find(u => u.loginId === step.info?.userId)?.initials || step.info.userId})` : idx === currentStepIdx ? '(대기)' : ''}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  if (sub === OrderSubCategory.CREATE || editingOrderId) return (
    <div className="space-y-6">
      <div className="flex justify-between items-center max-w-[1000px] mx-auto no-print px-4">
        <div className="flex items-center gap-4">
          {editingOrderId && (
            <button onClick={() => { setEditingOrderId(null); setOriginalRejectedOrder(null); setFormTitle(''); setFormRows(createInitialRows(6)); setMerges({}); setAligns({}); setBorders({}); setView({ type: 'ORDER', sub: OrderSubCategory.REJECTED }); }} className="flex items-center gap-2 px-5 py-2.5 bg-white border border-slate-300 rounded-2xl font-bold text-sm shadow-sm hover:bg-slate-50 transition-all active:scale-95">← 목록으로</button>
          )}
          <button onClick={handleUndo} disabled={undoStack.length === 0} className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl font-black text-sm shadow-xl transition-all active:scale-95 ${undoStack.length > 0 ? 'bg-slate-700 text-white hover:bg-slate-900' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>되돌리기 ({undoStack.length})</button>
          {editingOrderId && <span className="bg-red-50 text-red-600 px-3 py-1 rounded-full text-xs font-black animate-pulse border border-red-200">반송 건 수정 중</span>}
        </div>
        <div className="flex gap-2">
          <button onClick={() => { takeSnapshot(); setFormRows([...formRows, { id: Math.random().toString(36).substr(2, 9), dept: '', model: '', itemName: '', price: '', unitPrice: '', remarks: '' }]); }} className="px-4 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold hover:bg-slate-50">+ 행 추가</button>
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
      <div className="py-4 md:py-8 bg-slate-200 min-h-screen overflow-x-auto">
        <RenderDocumentTable 
          rows={formRows} isCreate={true} formLocation={formLocation} formTitle={formTitle} formDate={formDate} 
          setFormDate={setFormDate} setFormTitle={setFormTitle} setFormLocation={setFormLocation} 
          updateRowField={updateRowField} handleRowKeyDown={handleRowKeyDown} handleCreateSubmit={handleCreateSubmit} 
          suggestionTarget={suggestionTarget} suggestions={suggestions} selectSuggestion={selectSuggestion} 
          userAccounts={userAccounts} isVietnameseLabels={false} order={originalRejectedOrder}
          selection={selection} setSelection={setSelection} handleCellMouseDown={handleCellMouseDown} handleCellMouseEnter={handleCellMouseEnter} 
          merges={merges} aligns={aligns} borders={borders} handlePaste={handlePaste} takeSnapshot={takeSnapshot}
          handleInsertRow={handleInsertRow} handleDeleteTableRow={handleDeleteTableRow}
        />
      </div>
    </div>
  );
  
  if (!activeOrder) {
    const isSearchableFolder = sub.includes('(완료)');
    const filtered = orders.filter(o => o.status === sub);
    const sortedAll = [...filtered].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const searchFiltered = sortedAll.filter(o => {
      if (!searchTerm.trim()) return true;
      const lowerSearch = searchTerm.toLowerCase();
      const hasMatchInRows = o.rows.some(r => r.model.toLowerCase().includes(lowerSearch) || r.itemName.toLowerCase().includes(lowerSearch));
      return o.title.toLowerCase().includes(lowerSearch) || hasMatchInRows;
    });
    const totalItems = searchFiltered.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    const paginatedItems = searchFiltered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    return (
      <div className="space-y-4 md:space-y-6 text-left pb-12">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h2 className="text-2xl md:text-3xl font-black text-slate-900">{sub}</h2>
            <div className="flex flex-wrap items-center gap-2 md:gap-4 mt-2">
              <p className="text-slate-500 text-xs md:sm">총 {totalItems}건</p>
              <div className="hidden md:block h-4 w-[1px] bg-slate-300"></div>
              <div className="flex bg-slate-200 p-1 rounded-lg">
                <button onClick={() => setViewMode('ICON')} className={`px-3 py-1 rounded-md text-[10px] font-bold transition-all ${viewMode === 'ICON' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>아이콘</button>
                <button onClick={() => setViewMode('DETAIL')} className={`px-3 py-1 rounded-md text-[10px] font-bold transition-all ${viewMode === 'DETAIL' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>리스트</button>
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
            {paginatedItems.length === 0 ? (
              <div className="col-span-full py-16 md:py-32 text-center text-slate-400 border-4 border-dashed rounded-3xl bg-white/50 text-sm md:text-lg">폴더가 비어 있습니다.</div>
            ) : (
              paginatedItems.map(o => {
                const colors = getLocationColor(o.location);
                return (
                  <div key={o.id} className="relative group">
                    <button onClick={() => { 
                      if (sub === OrderSubCategory.REJECTED) {
                        handleEditRejected(o);
                      } else {
                        setActiveOrder(o); setOriginalOrder(null); setIsVietnameseLabels(false); setTranslatedLocation(''); 
                        setMerges((o as any).merges || {}); setAligns((o as any).aligns || {}); setBorders(o.borders || {});
                      }
                    }} className="w-full bg-white p-6 md:p-8 rounded-2xl md:rounded-3xl shadow-sm border-2 border-slate-100 hover:border-blue-500 hover:shadow-xl transition-all flex flex-col items-center relative overflow-hidden text-center h-full">
                      <div className={`absolute top-2 right-2 md:top-3 md:right-3 px-1.5 py-0.5 rounded text-[8px] md:text-[9px] font-bold border ${colors.bg} ${colors.text} border-current opacity-70 z-10`}>
                        {o.location === 'SEOUL' ? '서울' : o.location === 'DAECHEON' ? '대천' : '베트남'}
                      </div>
                      <div className={`w-12 h-16 md:w-16 md:h-20 ${colors.bg} ${colors.groupHover} rounded-lg shadow-inner mb-4 md:mb-6 flex items-center justify-center border border-slate-100 transition-colors relative`}>
                        <svg xmlns="http://www.w3.org/2000/svg" className={`h-6 w-6 md:h-8 md:w-8 ${colors.text} opacity-60`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                      </div>
                      <h3 className="font-black text-slate-800 text-sm md:text-base truncate w-full text-center mb-1 leading-tight">{o.title}</h3>
                      <p className="text-[10px] md:text-[11px] text-slate-400 uppercase font-bold tracking-widest">{o.date}</p>
                      
                      {o.status === OrderSubCategory.PENDING && renderApprovalSteps(o)}

                      {sub === OrderSubCategory.REJECTED && o.rejectReason && (
                        <div className="mt-3 p-2 bg-red-50 border border-red-100 rounded-lg text-left w-full">
                          <p className="text-[9px] font-black text-red-600 uppercase mb-0.5 tracking-tighter">반송사유</p>
                          <p className="text-[10px] text-red-700 leading-tight font-medium line-clamp-2">{o.rejectReason}</p>
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
                {paginatedItems.map(o => {
                  const colors = getLocationColor(o.location);
                  return (
                    <tr key={o.id} className="hover:bg-slate-50 transition-colors cursor-pointer group" onClick={() => { 
                      if (sub === OrderSubCategory.REJECTED) {
                        handleEditRejected(o);
                      } else {
                        setActiveOrder(o); setMerges((o as any).merges || {}); setAligns((o as any).aligns || {}); setBorders(o.borders || {});
                      }
                    }}>
                      <td className="px-4 md:px-6 py-3 md:py-4 text-xs font-mono text-slate-500 whitespace-nowrap">{o.date}</td>
                      <td className="px-4 md:px-6 py-3 md:py-4 text-xs md:text-sm font-black text-slate-800">{o.title}</td>
                      <td className="px-4 md:px-6 py-3 md:py-4 text-center"><span className={`inline-block px-2 md:px-3 py-0.5 md:py-1 rounded-full text-[9px] md:text-[10px] font-bold border ${colors.bg} ${colors.text} border-transparent`}>{o.location === 'SEOUL' ? '서울' : o.location === 'DAECHEON' ? '대천' : '베트남'}</span></td>
                      <td className="px-4 md:px-6 py-3 md:py-4 text-center text-[10px] md:text-xs font-bold text-slate-600 uppercase tracking-tighter">{o.authorId}</td>
                      <td className="px-4 md:px-6 py-3 md:py-4 text-center"><span className={`inline-block px-2 py-0.5 rounded text-[8px] md:text-[9px] font-black tracking-tighter uppercase ${o.status.includes('(완료)') ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{o.status}</span></td>
                      <td className="px-4 md:px-6 py-3 md:py-4 text-right"><div className="flex justify-end items-center gap-3"><span className="text-[10px] font-bold text-blue-600 hidden md:inline opacity-0 group-hover:opacity-100 transition-opacity">{sub === OrderSubCategory.REJECTED ? '편집하기 →' : '보기 →'}</span>{isMaster && (<button onClick={(e) => { e.stopPropagation(); setDeletingFileId(o.id); }} className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>)}</div></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        
        {totalPages > 1 && (
          <div className="flex justify-center items-center gap-4 mt-8 no-print pb-10">
            <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="px-4 py-2 bg-white border border-slate-300 rounded-xl font-bold text-slate-700 disabled:opacity-30 hover:bg-slate-50 transition-all shadow-sm">이전</button>
            <div className="flex gap-2">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(pageNum => (
                <button key={pageNum} onClick={() => setCurrentPage(pageNum)} className={`w-10 h-10 rounded-xl font-black transition-all ${currentPage === pageNum ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' : 'bg-white border border-slate-200 text-slate-400 hover:bg-slate-50'}`}>{pageNum}</button>
              ))}
            </div>
            <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="px-4 py-2 bg-white border border-slate-300 rounded-xl font-bold text-slate-700 disabled:opacity-30 hover:bg-slate-50 transition-all shadow-sm">다음</button>
          </div>
        )}

        {deletingFileId && <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4"><div className="bg-white rounded-3xl p-6 md:p-8 max-w-sm w-full shadow-2xl"><h3 className="text-lg md:text-xl font-black text-slate-900 mb-4 text-center">파일 영구 삭제</h3><p className="text-slate-600 mb-8 leading-relaxed text-center text-sm">삭제된 데이터는 복구할 수 없습니다.</p><div className="flex gap-4"><button onClick={() => setDeletingFileId(null)} className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold">취소</button><button onClick={() => handleFileDelete(deletingFileId)} className="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold">삭제</button></div></div></div>}
      </div>
    );
  }

  return (
    <div className={`py-4 md:py-8 bg-slate-200 min-h-screen ${isPreviewing ? 'fixed inset-0 z-[100] bg-slate-900 overflow-y-auto' : ''}`}>
      <div className="max-w-[1000px] mx-auto mb-4 md:mb-6 flex flex-col md:flex-row justify-between items-start md:items-center px-4 no-print gap-4">
        {isPreviewing ? (
          <div><h2 className="text-xl md:text-2xl font-black text-white">PDF 저장 미리보기</h2></div>
        ) : (
          <div className="flex gap-2">
            <button onClick={() => setActiveOrder(null)} className="bg-white px-4 md:px-6 py-2.5 md:py-3 rounded-xl font-bold shadow-lg hover:bg-slate-50 border border-slate-300 transition-all flex items-center gap-2 text-sm">← 목록으로</button>
            <button onClick={handleUndo} disabled={undoStack.length === 0} className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-black text-xs shadow-xl transition-all ${undoStack.length > 0 ? 'bg-slate-700 text-white hover:bg-slate-900' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}>Undo ({undoStack.length})</button>
          </div>
        )}
        {selection && !isPreviewing && !activeOrder?.stamps.final && (
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
        <div className="flex flex-wrap gap-2 md:gap-3 w-full md:w-auto">
          {isPreviewing ? (
            <>
              <button onClick={() => setIsPreviewing(false)} className="flex-1 md:flex-none bg-slate-700 text-white px-4 md:px-6 py-2.5 md:py-3 rounded-xl font-bold hover:bg-slate-600 transition-all text-sm">닫기</button>
              <button onClick={handlePrint} className="flex-1 md:flex-none bg-blue-500 text-white px-6 md:px-8 py-2.5 md:py-3 rounded-xl font-black shadow-2xl hover:bg-blue-400 flex items-center justify-center gap-2 transition-all text-sm">저장 / 인쇄</button>
            </>
          ) : (
            <>
              {(activeOrder.status === OrderSubCategory.APPROVED_VIETNAM || activeOrder.location === 'VIETNAM' || sub.includes('(완료)')) && <button onClick={handleTranslateToVietnam} disabled={isTranslating} className={`flex-1 md:flex-none px-4 md:px-6 py-2.5 md:py-3 rounded-xl font-black shadow-lg flex items-center justify-center gap-2 transition-all text-[10px] md:text-xs ${isVietnameseLabels ? 'bg-amber-500 text-white hover:bg-amber-600' : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50'}`}>{isTranslating ? '...' : (isVietnameseLabels ? '한글' : 'VIET')}</button>}
              {activeOrder.status === OrderSubCategory.PENDING && <button onClick={() => { setRejectingOrder(activeOrder); setRejectReasonText(''); }} className="flex-1 md:flex-none px-4 md:px-6 py-2.5 md:py-3 bg-red-100 text-red-600 rounded-xl font-bold hover:bg-red-600 hover:text-white border border-red-200 transition-all text-[10px] md:text-xs">반송</button>}
              <button onClick={() => setIsPreviewing(true)} className="flex-1 md:flex-none bg-blue-600 text-white px-4 md:px-8 py-2.5 md:py-3 rounded-xl font-black shadow-lg hover:bg-blue-700 flex items-center justify-center gap-2 transition-all text-[10px] md:text-xs">PDF 저장 / 인쇄</button>
            </>
          )}
        </div>
      </div>
      <div className="print-area overflow-x-auto">
        <RenderDocumentTable 
          rows={activeOrder.rows} isCreate={false} order={activeOrder} isPreviewing={isPreviewing} 
          handleRowEdit={handleRowEdit} handleRowDelete={handleRowDelete} handleRowKeyDown={handleRowKeyDown} 
          handleStampAction={handleStampAction} handleFinalComplete={handleFinalComplete} userAccounts={userAccounts} 
          isVietnameseLabels={isVietnameseLabels} translatedLocation={translatedLocation} 
          selection={selection} setSelection={setSelection} handleCellMouseDown={handleCellMouseDown} handleCellMouseEnter={handleCellMouseEnter} 
          merges={merges} aligns={aligns} borders={borders} handlePaste={handlePaste} takeSnapshot={takeSnapshot}
          handleInsertRow={handleInsertRow} handleDeleteTableRow={handleDeleteTableRow}
        />
      </div>
      {rejectingOrder && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl animate-in zoom-in duration-300">
            <h3 className="text-2xl font-black text-slate-900 mb-4">반송 사유 입력</h3>
            <p className="text-slate-500 text-sm mb-6 font-medium">결재권자에게 전달할 반송 사유를 상세히 입력해 주세요.</p>
            <textarea 
              value={rejectReasonText} 
              onChange={(e) => setRejectReasonText(e.target.value)} 
              placeholder="여기에 사유를 입력하십시오..." 
              className="w-full h-40 p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-red-500 font-bold mb-8"
            />
            <div className="flex gap-4">
              <button onClick={() => { setRejectingOrder(null); setRejectReasonText(''); }} className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-xl font-black transition-all">취소</button>
              <button onClick={handleRejectAction} className="flex-1 py-4 bg-red-600 text-white rounded-xl font-black transition-all shadow-lg hover:bg-red-700">반송 처리</button>
            </div>
          </div>
        </div>
      )}
      {rowToDelete && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 md:p-8 max-w-sm w-full shadow-2xl animate-in zoom-in duration-300">
            <h3 className="text-lg md:text-xl font-black text-red-600 mb-4 text-center">수정 확인</h3>
            <p className="text-slate-600 mb-8 leading-relaxed text-center text-sm font-medium">해당 품목을 수정하시겠습니까?</p>
            <div className="flex gap-4">
              <button onClick={() => setRowToDelete(null)} className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-all">취소</button>
              <button onClick={() => executeRowDelete(rowToDelete.order, rowToDelete.rowId, rowToDelete.index)} className="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-all shadow-lg shadow-red-100">수정</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrderView;