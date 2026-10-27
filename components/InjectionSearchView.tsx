import React, { useState, useEffect, useMemo } from 'react';
import { Search, X, Edit3, Trash2, RotateCcw, AlertCircle, Layers, CheckCircle2, Factory, Box, Tag, ArrowRight } from 'lucide-react';
import { UserAccount, ViewState, OrderRow, InjectionOrderSubCategory } from '../types';
import { saveSingleDoc } from '../supabase';

interface InjectionSearchViewProps {
  currentUser: UserAccount;
  setView: (v: ViewState) => void;
  dataVersion: number;
}

interface MoldUnit {
  key: string;
  orderId: string;
  orderTitle: string;
  orderDate: string;
  moldName: string;
  modelName: string;
  injectionVendor: string;
  moldVendor: string;
  rows: OrderRow[];
  sharedModelsForMold: string[];
  sharedModelsForParts: Record<string, string[]>; // partKey -> modelNames
}

export const InjectionSearchView: React.FC<InjectionSearchViewProps> = ({ currentUser, setView, dataVersion }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'ALL' | 'MOLD' | 'DN' | 'PART_NAME' | 'MODEL'>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL_APPROVED' | 'DESTINATION_ONLY'>('ALL_APPROVED');
  const [excludedMoldKeys, setExcludedMoldKeys] = useState<string[]>([]);
  const [showExcludedModal, setShowExcludedModal] = useState(false);
  const [editingRow, setEditingRow] = useState<{ orderId: string; moldName: string; row: OrderRow } | null>(null);
  const [editFormData, setEditFormData] = useState<Partial<OrderRow>>({});
  const [toastMessage, setToastMessage] = useState<{ text: string; undoKey?: string } | null>(null);

  // Load excluded mold keys from localStorage
  useEffect(() => {
    try {
      const savedExclusions = localStorage.getItem('ajin_injection_search_exclusions');
      if (savedExclusions) {
        setExcludedMoldKeys(JSON.parse(savedExclusions));
      }
    } catch (e) {
      console.error('Failed to load exclusions', e);
    }
  }, []);

  // Save exclusions to localStorage
  const updateExclusions = (newKeys: string[]) => {
    setExcludedMoldKeys(newKeys);
    try {
      localStorage.setItem('ajin_injection_search_exclusions', JSON.stringify(newKeys));
    } catch (e) {
      console.error('Failed to save exclusions', e);
    }
  };

  // Toast auto-dismiss
  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  // Extract raw injection orders from local storage
  const rawOrders = useMemo(() => {
    try {
      const saved = localStorage.getItem('ajin_injection_orders');
      if (!saved) return [];
      const parsed = JSON.parse(saved);
      if (!Array.isArray(parsed)) return [];
      return parsed;
    } catch (e) {
      console.error('Failed to parse injection orders', e);
      return [];
    }
  }, [dataVersion]);

  // Filter orders by approved / destination
  const validOrders = useMemo(() => {
    return rawOrders.filter((order: any) => {
      if (!order || !order.rows || !Array.isArray(order.rows)) return false;
      if (statusFilter === 'DESTINATION_ONLY') {
        return order.status === InjectionOrderSubCategory.DESTINATION;
      }
      return (
        order.status === InjectionOrderSubCategory.DESTINATION ||
        order.status === InjectionOrderSubCategory.APPROVED
      );
    });
  }, [rawOrders, statusFilter]);

  // Helper to extract clean model name from order title (e.g. "CPH-355 INJECTION -260911" -> "CPH-355")
  const extractModelName = (title: string): string => {
    if (!title) return '기종 미지정';
    const trimmed = title.trim();
    const parts = trimmed.split(/\s+/);
    if (parts.length > 0 && parts[0].length >= 2) {
      return parts[0];
    }
    return trimmed;
  };

  // Build a lookup map of all models that use each Mold or DN/Part across the entire DB
  const crossModelIndex = useMemo(() => {
    const moldToModels = new Map<string, Set<string>>();
    const partToModels = new Map<string, Set<string>>(); // key: dn or itemName

    rawOrders.forEach((order: any) => {
      const model = extractModelName(order.title);
      if (!order.rows || !Array.isArray(order.rows)) return;

      order.rows.forEach((row: OrderRow) => {
        const mold = (row.model || '').trim().toUpperCase();
        if (mold) {
          if (!moldToModels.has(mold)) moldToModels.set(mold, new Set());
          moldToModels.get(mold)!.add(model);
        }

        const dn = (row.dept || '').trim().toUpperCase();
        if (dn) {
          if (!partToModels.has(`DN:${dn}`)) partToModels.set(`DN:${dn}`, new Set());
          partToModels.get(`DN:${dn}`)!.add(model);
        }

        const itemName = (row.itemName || '').trim().toUpperCase();
        if (itemName) {
          if (!partToModels.has(`NAME:${itemName}`)) partToModels.set(`NAME:${itemName}`, new Set());
          partToModels.get(`NAME:${itemName}`)!.add(model);
        }
      });
    });

    return { moldToModels, partToModels };
  }, [rawOrders]);

  // Group orders into Mold Units
  const moldUnits = useMemo(() => {
    const units: MoldUnit[] = [];

    validOrders.forEach((order: any) => {
      const orderModel = extractModelName(order.title);
      const rows = order.rows || [];

      // Group rows by mold (row.model)
      const moldGroups = new Map<string, OrderRow[]>();
      rows.forEach((row: OrderRow) => {
        const m = (row.model || '').trim() || '미지정 MOLD';
        if (!moldGroups.has(m)) moldGroups.set(m, []);
        moldGroups.get(m)!.push(row);
      });

      moldGroups.forEach((moldRows, moldName) => {
        const key = `${order.id}__${moldName}`;
        const upperMold = moldName.trim().toUpperCase();

        // Shared models for this mold
        const sharedModelsForMold = Array.from(crossModelIndex.moldToModels.get(upperMold) || []) as string[];

        // Vendors in this mold
        const injectionVendor = moldRows.find(r => r.injectionVendor?.trim())?.injectionVendor || '';
        const moldVendor = moldRows.find(r => r.vendor?.trim())?.vendor || '';

        // Cross models for parts in this mold
        const sharedModelsForParts: Record<string, string[]> = {};
        moldRows.forEach(r => {
          const dnUpper = (r.dept || '').trim().toUpperCase();
          const nameUpper = (r.itemName || '').trim().toUpperCase();
          const modelsSet = new Set<string>();

          if (dnUpper && crossModelIndex.partToModels.has(`DN:${dnUpper}`)) {
            crossModelIndex.partToModels.get(`DN:${dnUpper}`)!.forEach(m => modelsSet.add(m));
          }
          if (nameUpper && crossModelIndex.partToModels.has(`NAME:${nameUpper}`)) {
            crossModelIndex.partToModels.get(`NAME:${nameUpper}`)!.forEach(m => modelsSet.add(m));
          }
          sharedModelsForParts[r.id] = Array.from(modelsSet) as string[];
        });

        units.push({
          key,
          orderId: order.id,
          orderTitle: order.title || '사출발주서',
          orderDate: order.date || order.createdAt || '',
          moldName,
          modelName: orderModel,
          injectionVendor,
          moldVendor,
          rows: moldRows,
          sharedModelsForMold,
          sharedModelsForParts
        });
      });
    });

    return units;
  }, [validOrders, crossModelIndex]);

  // Filter mold units based on user search term and active exclusions
  const filteredUnits = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    return moldUnits.filter(unit => {
      // Check if excluded
      if (excludedMoldKeys.includes(unit.key)) return false;

      if (!query) return true; // Show all if search is empty

      const moldMatch = unit.moldName.toLowerCase().includes(query);
      const modelMatch = unit.modelName.toLowerCase().includes(query) || unit.orderTitle.toLowerCase().includes(query);

      // Check if any row in this mold matches DN or Part Name
      const rowMatches = unit.rows.filter(row => {
        const dnMatch = (row.dept || '').toLowerCase().includes(query);
        const nameMatch = (row.itemName || '').toLowerCase().includes(query);
        const materialMatch = (row.material || '').toLowerCase().includes(query);
        const vendorMatch = (row.vendor || '').toLowerCase().includes(query);
        const injectionVendorMatch = (row.injectionVendor || '').toLowerCase().includes(query);

        if (filterType === 'DN') return dnMatch;
        if (filterType === 'PART_NAME') return nameMatch;
        if (filterType === 'MOLD') return moldMatch;
        if (filterType === 'MODEL') return modelMatch;

        return dnMatch || nameMatch || materialMatch || vendorMatch || injectionVendorMatch;
      });

      if (filterType === 'MOLD') return moldMatch;
      if (filterType === 'MODEL') return modelMatch;
      if (filterType === 'DN' || filterType === 'PART_NAME') return rowMatches.length > 0;

      // FilterType === 'ALL'
      return moldMatch || modelMatch || rowMatches.length > 0;
    });
  }, [moldUnits, searchTerm, filterType, excludedMoldKeys]);

  // Quick exclusion handler
  const handleExcludeMold = (unitKey: string, moldName: string) => {
    if (!excludedMoldKeys.includes(unitKey)) {
      const next = [...excludedMoldKeys, unitKey];
      updateExclusions(next);
      setToastMessage({
        text: `"${moldName}" 몰드가 검색 결과에서 제외되었습니다.`,
        undoKey: unitKey
      });
    }
  };

  // Undo exclusion
  const handleUndoExclude = (keyToUndo: string) => {
    const next = excludedMoldKeys.filter(k => k !== keyToUndo);
    updateExclusions(next);
    setToastMessage(null);
  };

  // Restore all exclusions
  const handleRestoreAll = () => {
    if (confirm('제외된 모든 몰드를 다시 복원하시겠습니까?')) {
      updateExclusions([]);
      setShowExcludedModal(false);
      setToastMessage({ text: '모든 몰드가 복원되었습니다.' });
    }
  };

  // Start editing a row
  const handleStartEdit = (orderId: string, moldName: string, row: OrderRow) => {
    setEditingRow({ orderId, moldName, row });
    setEditFormData({
      dept: row.dept,
      itemName: row.itemName,
      material: row.material,
      vendor: row.vendor,
      injectionVendor: row.injectionVendor,
      qty: row.qty,
      remarks: row.remarks
    });
  };

  // Save row edits
  const handleSaveEdit = async () => {
    if (!editingRow) return;

    try {
      const saved = localStorage.getItem('ajin_injection_orders');
      if (!saved) return;
      const allOrders = JSON.parse(saved);

      const targetOrderIndex = allOrders.findIndex((o: any) => o.id === editingRow.orderId);
      if (targetOrderIndex === -1) {
        alert('해당 발주서 문서를 찾을 수 없습니다.');
        return;
      }

      const targetOrder = allOrders[targetOrderIndex];
      const updatedRows = targetOrder.rows.map((r: OrderRow) => {
        if (r.id === editingRow.row.id) {
          return {
            ...r,
            ...editFormData
          };
        }
        return r;
      });

      const updatedOrder = {
        ...targetOrder,
        rows: updatedRows,
        updatedAt: new Date().toISOString()
      };

      allOrders[targetOrderIndex] = updatedOrder;
      localStorage.setItem('ajin_injection_orders', JSON.stringify(allOrders));

      // Sync with cloud
      await saveSingleDoc('injection_orders', updatedOrder.id, updatedOrder);

      setEditingRow(null);
      setToastMessage({ text: '부품 정보가 성공적으로 수정 및 저장되었습니다.' });
    } catch (e: any) {
      alert(`저장 중 오류가 발생했습니다: ${e.message}`);
    }
  };

  // Check if a row matches the search keyword (for highlighting)
  const isRowHighlighted = (row: OrderRow): boolean => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return false;
    return (
      (row.dept || '').toLowerCase().includes(q) ||
      (row.itemName || '').toLowerCase().includes(q) ||
      (row.model || '').toLowerCase().includes(q)
    );
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header & Title */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 md:p-6 shadow-xl relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0 shadow-inner">
              <Search className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl md:text-2xl font-black text-white tracking-wider">INJECTION SEARCH</h1>
                <span className="px-2 py-0.5 text-[11px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/30 rounded-full">
                  사출 검색
                </span>
                <span className="px-2 py-0.5 text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded-full">
                  단가 비공개 모드
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                AJ사출발주 및 결재완료된 금형/부품 데이터를 몰드(MOLD) 단위로 검색하고 적용 기종을 확인합니다.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {excludedMoldKeys.length > 0 && (
              <button
                onClick={() => setShowExcludedModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-slate-800 text-amber-400 border border-amber-500/30 hover:bg-slate-700 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>제외된 몰드 ({excludedMoldKeys.length})</span>
              </button>
            )}

            <button
              onClick={() => setView({ type: 'DASHBOARD' })}
              className="px-3.5 py-1.5 text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700 transition-all"
            >
              홈으로
            </button>
          </div>
        </div>

        {/* Search Bar & Options */}
        <div className="mt-6 space-y-3">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
              <Search className="w-5 h-5 text-blue-400" />
            </div>
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="몰드번호(MOLD), 도번(DN), 품명(PART NAME), 기종(MODEL)을 입력하여 검색하세요..."
              className="w-full pl-11 pr-10 py-3 bg-slate-950/80 border border-slate-700 focus:border-blue-500 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all font-medium"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Filter Pills */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-bold text-slate-400 mr-1">검색 항목:</span>
              {(['ALL', 'MOLD', 'DN', 'PART_NAME', 'MODEL'] as const).map(type => (
                <button
                  key={type}
                  onClick={() => setFilterType(type)}
                  className={`px-2.5 py-1 text-xs font-bold rounded-lg border transition-all ${
                    filterType === type
                      ? 'bg-blue-600 text-white border-blue-500 shadow-sm'
                      : 'bg-slate-800/80 text-slate-400 border-slate-700 hover:text-white hover:bg-slate-700'
                  }`}
                >
                  {type === 'ALL' && '전체 통합'}
                  {type === 'MOLD' && '몰드 (MOLD)'}
                  {type === 'DN' && '도번 (DN)'}
                  {type === 'PART_NAME' && '품명 (PART NAME)'}
                  {type === 'MODEL' && '기종 (MODEL)'}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span>상태:</span>
              <button
                onClick={() =>
                  setStatusFilter(prev =>
                    prev === 'ALL_APPROVED' ? 'DESTINATION_ONLY' : 'ALL_APPROVED'
                  )
                }
                className="px-2.5 py-1 font-semibold rounded-lg bg-slate-800 border border-slate-700 hover:border-slate-600 text-slate-200 transition-colors"
              >
                {statusFilter === 'ALL_APPROVED' ? 'AJ사출발주 + 결재완료' : 'AJ사출발주만'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Toast Notification */}
      {toastMessage && (
        <div className="bg-slate-900 border border-blue-500/40 text-blue-200 px-4 py-3 rounded-xl shadow-2xl flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-2 text-sm font-medium">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{toastMessage.text}</span>
          </div>
          {toastMessage.undoKey && (
            <button
              onClick={() => handleUndoExclude(toastMessage.undoKey!)}
              className="text-xs font-bold text-blue-400 hover:text-blue-300 underline underline-offset-2 shrink-0"
            >
              실행 취소
            </button>
          )}
        </div>
      )}

      {/* Search Stats Header */}
      <div className="flex items-center justify-between px-1">
        <div className="text-xs md:text-sm text-slate-500 font-medium">
          {searchTerm ? (
            <span>
              <strong className="text-blue-600 font-bold">"{searchTerm}"</strong> 검색 결과:{' '}
              <strong className="text-slate-800 font-bold">{filteredUnits.length}</strong>개 몰드
            </span>
          ) : (
            <span>전체 등록된 몰드: {filteredUnits.length}개</span>
          )}
        </div>
      </div>

      {/* Results List: Rendered by MOLD Unit */}
      {filteredUnits.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center shadow-sm">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
            <Search className="w-8 h-8" />
          </div>
          <h3 className="text-base font-bold text-slate-800">일치하는 사출 몰드 데이터가 없습니다</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
            {searchTerm
              ? '다른 도번, 품명, 또는 몰드 번호로 다시 검색해 보세요.'
              : '현재 저장된 사출발주서 데이터가 없습니다.'}
          </p>
          {excludedMoldKeys.length > 0 && (
            <button
              onClick={() => setShowExcludedModal(true)}
              className="mt-4 px-4 py-2 text-xs font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-xl transition-colors"
            >
              제외된 몰드 목록 확인 ({excludedMoldKeys.length}개)
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {filteredUnits.map(unit => {
            const hasMatchedRow = searchTerm.trim() && unit.rows.some(r => isRowHighlighted(r));

            return (
              <div
                key={unit.key}
                className="bg-white border border-slate-200 hover:border-slate-300 rounded-2xl shadow-sm transition-all overflow-hidden"
              >
                {/* Mold Card Header */}
                <div className="bg-slate-50/80 border-b border-slate-200 p-4 md:px-6 flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-xs font-black">
                        <Box className="w-3.5 h-3.5 text-blue-600" />
                        <span>MOLD: {unit.moldName}</span>
                      </div>

                      {/* Primary Order Model */}
                      <span className="px-2 py-0.5 bg-slate-100 text-slate-700 border border-slate-200 rounded text-xs font-bold">
                        기종: {unit.modelName}
                      </span>

                      {/* Source Document Title */}
                      <span className="text-xs text-slate-500">
                        ({unit.orderTitle} · {unit.orderDate})
                      </span>
                    </div>

                    {/* Shared Models Across Orders Badge Tags (Cross-Model Usage) */}
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      <span className="text-[11px] font-bold text-slate-500 flex items-center gap-1">
                        <Layers className="w-3 h-3 text-indigo-500" />
                        동일 몰드 적용 기종:
                      </span>
                      {unit.sharedModelsForMold.length > 0 ? (
                        unit.sharedModelsForMold.map(model => (
                          <span
                            key={model}
                            onClick={() => {
                              setSearchTerm(model);
                              setFilterType('MODEL');
                            }}
                            className={`px-2 py-0.5 text-[11px] font-bold rounded-md cursor-pointer transition-colors ${
                              model === unit.modelName
                                ? 'bg-indigo-50 text-indigo-700 border border-indigo-200 font-black'
                                : 'bg-slate-100 hover:bg-indigo-100 text-slate-600 hover:text-indigo-800 border border-slate-200'
                            }`}
                            title="클릭 시 이 기종으로 검색"
                          >
                            {model}
                          </span>
                        ))
                      ) : (
                        <span className="text-[11px] text-slate-400">단독 기종</span>
                      )}

                      {/* Vendor tags if present */}
                      {(unit.injectionVendor || unit.moldVendor) && (
                        <div className="flex items-center gap-2 ml-auto text-[11px] text-slate-600">
                          {unit.injectionVendor && (
                            <span className="flex items-center gap-1 bg-amber-50 text-amber-800 px-2 py-0.5 rounded border border-amber-200">
                              <Factory className="w-3 h-3 text-amber-600" />
                              사출: <strong>{unit.injectionVendor}</strong>
                            </span>
                          )}
                          {unit.moldVendor && (
                            <span className="flex items-center gap-1 bg-emerald-50 text-emerald-800 px-2 py-0.5 rounded border border-emerald-200">
                              금형: <strong>{unit.moldVendor}</strong>
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right Header Actions: Exclude Button */}
                  <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                    <button
                      onClick={() => handleExcludeMold(unit.key, unit.moldName)}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:text-white bg-rose-50 hover:bg-rose-600 border border-rose-200 hover:border-rose-600 rounded-lg transition-colors"
                      title="이 몰드를 검색 결과 목록에서 제외합니다"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>검색 제외</span>
                    </button>
                  </div>
                </div>

                {/* Parts Table (CONFIDENTIAL: UNIT PRICE & PRICE COMPLETELY EXCLUDED) */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-100/70 border-b border-slate-200 text-slate-600 font-bold">
                        <th className="py-2.5 px-3 w-12 text-center">#</th>
                        <th className="py-2.5 px-3 w-36">도번 (DN)</th>
                        <th className="py-2.5 px-4 font-black text-slate-800">품명 (PART NAME)</th>
                        <th className="py-2.5 px-3 w-28">재질 (MATERIAL)</th>
                        <th className="py-2.5 px-3 w-28">사출업체</th>
                        <th className="py-2.5 px-3 w-28">금형업체</th>
                        <th className="py-2.5 px-3 w-20 text-center">수량 (QTY)</th>
                        <th className="py-2.5 px-3">비고 / R.SP</th>
                        <th className="py-2.5 px-3">부품 공용 기종</th>
                        <th className="py-2.5 px-3 w-16 text-center">편집</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
                      {unit.rows.map((row, idx) => {
                        const isMatch = isRowHighlighted(row);
                        const sharedModels = unit.sharedModelsForParts[row.id] || [];

                        return (
                          <tr
                            key={row.id || idx}
                            className={`transition-colors ${
                              isMatch
                                ? 'bg-amber-50/90 font-semibold text-slate-900 border-l-4 border-l-amber-500'
                                : 'hover:bg-slate-50'
                            }`}
                          >
                            <td className="py-2.5 px-3 text-center text-slate-400">{idx + 1}</td>
                            <td className="py-2.5 px-3 font-mono font-bold text-slate-800">
                              {row.dept || '-'}
                            </td>
                            <td className="py-2.5 px-4 font-bold text-slate-900">
                              <div className="flex items-center gap-1.5">
                                <span>{row.itemName || '-'}</span>
                                {isMatch && (
                                  <span className="px-1.5 py-0.2 bg-amber-200 text-amber-900 text-[10px] font-black rounded">
                                    일치
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-2.5 px-3 text-slate-600">{row.material || '-'}</td>
                            <td className="py-2.5 px-3 text-slate-600">{row.injectionVendor || '-'}</td>
                            <td className="py-2.5 px-3 text-slate-600">{row.vendor || '-'}</td>
                            <td className="py-2.5 px-3 text-center font-bold text-slate-800">
                              {row.qty || row.orderQty || row.cty || '-'}
                            </td>
                            <td className="py-2.5 px-3 text-slate-500 text-[11px]">
                              {row.remarksRSP || row.remarks || '-'}
                            </td>
                            {/* Shared Models for this specific part */}
                            <td className="py-2.5 px-3">
                              {sharedModels.length > 1 ? (
                                <div className="flex flex-wrap items-center gap-1">
                                  {sharedModels.map(m => (
                                    <span
                                      key={m}
                                      onClick={() => {
                                        setSearchTerm(m);
                                        setFilterType('MODEL');
                                      }}
                                      className="px-1.5 py-0.5 text-[10px] bg-slate-100 hover:bg-blue-100 text-slate-700 hover:text-blue-800 rounded border border-slate-200 cursor-pointer"
                                      title="이 기종으로 검색"
                                    >
                                      {m}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-[11px] text-slate-400">-</span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <button
                                onClick={() => handleStartEdit(unit.orderId, unit.moldName, row)}
                                className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                title="부품 정보 수정"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mold Footer Info */}
                <div className="bg-slate-50 px-4 py-2 border-t border-slate-200 text-[11px] text-slate-500 flex flex-wrap items-center justify-between gap-2">
                  <span>
                    총 <strong>{unit.rows.length}</strong>개 부품 등록됨
                  </span>
                  <span className="text-slate-400">
                    보안 안내: 사출발주서 단가 및 금액 정보는 검색 화면에서 표시되지 않습니다.
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Edit Part Modal */}
      {editingRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-blue-600" />
                <h3 className="text-base font-black text-slate-800">사출 부품 정보 수정</h3>
              </div>
              <button
                onClick={() => setEditingRow(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="text-xs text-slate-500 bg-slate-50 p-3 rounded-xl border border-slate-200">
              MOLD: <strong className="text-slate-700">{editingRow.moldName}</strong> | 수정된 내용은 사출 발주서 원본에 안전하게 반영됩니다.
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">도번 (DN)</label>
                <input
                  type="text"
                  value={editFormData.dept || ''}
                  onChange={e => setEditFormData(prev => ({ ...prev, dept: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-800 focus:bg-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">품명 (PART NAME)</label>
                <input
                  type="text"
                  value={editFormData.itemName || ''}
                  onChange={e => setEditFormData(prev => ({ ...prev, itemName: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-800 focus:bg-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">재질 (MATERIAL)</label>
                <input
                  type="text"
                  value={editFormData.material || ''}
                  onChange={e => setEditFormData(prev => ({ ...prev, material: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-800 focus:bg-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">수량 (QTY)</label>
                <input
                  type="text"
                  value={editFormData.qty || ''}
                  onChange={e => setEditFormData(prev => ({ ...prev, qty: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-800 focus:bg-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">사출업체</label>
                <input
                  type="text"
                  value={editFormData.injectionVendor || ''}
                  onChange={e => setEditFormData(prev => ({ ...prev, injectionVendor: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-800 focus:bg-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">금형업체</label>
                <input
                  type="text"
                  value={editFormData.vendor || ''}
                  onChange={e => setEditFormData(prev => ({ ...prev, vendor: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-800 focus:bg-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="col-span-2">
                <label className="block font-bold text-slate-700 mb-1">비고 (REMARKS)</label>
                <input
                  type="text"
                  value={editFormData.remarks || ''}
                  onChange={e => setEditFormData(prev => ({ ...prev, remarks: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-800 focus:bg-white focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                onClick={() => setEditingRow(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleSaveEdit}
                className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-md shadow-blue-500/20 transition-colors"
              >
                저장하기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Excluded Molds Management Modal */}
      {showExcludedModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <RotateCcw className="w-5 h-5 text-amber-500" />
                <h3 className="text-base font-black text-slate-800">
                  제외된 몰드 관리 ({excludedMoldKeys.length})
                </h3>
              </div>
              <button
                onClick={() => setShowExcludedModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-500">
              검색 결과에서 제외(삭제) 처리된 몰드 목록입니다. 복원 버튼을 누르면 다시 검색 결과에 표시됩니다.
            </p>

            <div className="max-h-64 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
              {excludedMoldKeys.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-400">
                  제외된 몰드가 없습니다.
                </div>
              ) : (
                excludedMoldKeys.map(key => {
                  const parts = key.split('__');
                  const moldName = parts[1] || key;

                  return (
                    <div
                      key={key}
                      className="flex items-center justify-between px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <Box className="w-3.5 h-3.5 text-slate-400" />
                        <span className="font-bold text-slate-800">MOLD: {moldName}</span>
                      </div>
                      <button
                        onClick={() => handleUndoExclude(key)}
                        className="px-2.5 py-1 text-xs font-bold text-blue-600 hover:text-white bg-blue-50 hover:bg-blue-600 border border-blue-200 rounded-lg transition-colors"
                      >
                        복원
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-100">
              {excludedMoldKeys.length > 0 && (
                <button
                  onClick={handleRestoreAll}
                  className="px-3 py-1.5 text-xs font-semibold text-rose-600 hover:text-rose-700 hover:underline"
                >
                  모두 복원하기
                </button>
              )}
              <div className="ml-auto">
                <button
                  onClick={() => setShowExcludedModal(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
                >
                  닫기
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
