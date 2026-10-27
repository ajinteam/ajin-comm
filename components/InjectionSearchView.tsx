import React, { useState, useEffect, useMemo } from 'react';
import { Search, X, RotateCcw, Box, Layers, Factory, CheckCircle2, Trash2 } from 'lucide-react';
import { UserAccount, ViewState, OrderRow, InjectionOrderSubCategory } from '../types';

interface InjectionSearchViewProps {
  currentUser: UserAccount;
  setView: (v: ViewState) => void;
  dataVersion: number;
}

export interface MoldUnit {
  key: string;
  orderId: string;
  orderTitle: string;
  orderDate: string;
  moldName: string;          // Resolved full mold name, e.g. "355#6", "355#2", "355#3-1"
  displayMoldName: string;   // Clean display name
  modelName: string;         // e.g. "CPH-355" or "355"
  injectionVendor: string;
  moldVendor: string;
  rows: OrderRow[];
  sharedModelsForMold: string[];
  sharedModelsForParts: Record<string, string[]>; // rowId -> modelNames
}

export const InjectionSearchView: React.FC<InjectionSearchViewProps> = ({ currentUser, setView, dataVersion }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'ALL' | 'DN' | 'PART_NAME' | 'MOLD' | 'MODEL'>('ALL');
  const [excludedMoldKeys, setExcludedMoldKeys] = useState<string[]>([]);
  const [showExcludedModal, setShowExcludedModal] = useState(false);
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
      const timer = setTimeout(() => setToastMessage(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  // Extract raw injection orders from local storage - ONLY AJ사출발주 (DESTINATION)
  const ajOrders = useMemo(() => {
    try {
      const saved = localStorage.getItem('ajin_injection_orders');
      if (!saved) return [];
      const parsed = JSON.parse(saved);
      if (!Array.isArray(parsed)) return [];

      // Requirement 1: Only load from "AJ사출발주"
      return parsed.filter((order: any) => {
        if (!order || !order.rows || !Array.isArray(order.rows)) return false;
        return order.status === InjectionOrderSubCategory.DESTINATION;
      });
    } catch (e) {
      console.error('Failed to parse injection orders', e);
      return [];
    }
  }, [dataVersion]);

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

  // Helper to extract base numeric or code prefix from model (e.g. "CPH-355" -> "355", "355#2" -> "355")
  const extractPrefixFromText = (text: string): string => {
    if (!text) return '';
    const match = text.match(/\d+/);
    return match ? match[0] : text.trim();
  };

  // Build Cross-Model Index across all AJ사출발주 documents
  const crossModelIndex = useMemo(() => {
    const moldToModels = new Map<string, Set<string>>();
    const partToModels = new Map<string, Set<string>>(); // key: "DN:..." or "NAME:..."

    ajOrders.forEach((order: any) => {
      const model = extractModelName(order.title);
      if (!order.rows || !Array.isArray(order.rows)) return;

      let currentPrefix = extractPrefixFromText(model);

      order.rows.forEach((row: OrderRow) => {
        const rawModel = (row.model || '').trim();
        if (rawModel) {
          if (rawModel.includes('#')) {
            const [p] = rawModel.split('#');
            if (p.trim()) currentPrefix = p.trim();
          }
          const upperMold = rawModel.toUpperCase();
          if (!moldToModels.has(upperMold)) moldToModels.set(upperMold, new Set());
          moldToModels.get(upperMold)!.add(model);
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
  }, [ajOrders]);

  // Group rows into Mold Units using the horizontal border block rule
  // Rule:
  // 1. Mold appears on first line of block (e.g. 355#6). Subsequent rows with blank mold column belong to that same mold!
  // 2. If a mold label lacks '#' prefix (e.g. '2' or '3-1' under 355#2), inherit model prefix (355 -> 355#2, 355#3-1).
  const moldUnits = useMemo(() => {
    const units: MoldUnit[] = [];

    ajOrders.forEach((order: any) => {
      const orderModel = extractModelName(order.title);
      let defaultPrefix = extractPrefixFromText(orderModel);
      const rows: OrderRow[] = order.rows || [];

      let currentMoldName = '';
      let currentDisplayMoldName = '';
      let currentMoldRows: OrderRow[] = [];
      let currentInjectionVendor = '';
      let currentMoldVendor = '';

      const finalizeCurrentMold = () => {
        if (currentMoldName && currentMoldRows.length > 0) {
          const upperMold = currentMoldName.toUpperCase();
          const sharedModelsForMold = Array.from(crossModelIndex.moldToModels.get(upperMold) || []) as string[];

          // Shared models for each part row
          const sharedModelsForParts: Record<string, string[]> = {};
          currentMoldRows.forEach(r => {
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
            key: `${order.id}__${currentMoldName}`,
            orderId: order.id,
            orderTitle: order.title || 'AJ사출발주',
            orderDate: order.date || order.createdAt || '',
            moldName: currentMoldName,
            displayMoldName: currentDisplayMoldName || currentMoldName,
            modelName: orderModel,
            injectionVendor: currentInjectionVendor,
            moldVendor: currentMoldVendor,
            rows: currentMoldRows,
            sharedModelsForMold,
            sharedModelsForParts
          });
        }
      };

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rawModel = (row.model || '').trim();
        const rawDn = (row.dept || '').trim();
        const rawItemName = (row.itemName || '').trim();

        // Skip completely empty spacer rows
        if (!rawModel && !rawDn && !rawItemName && !row.qty && !row.orderQty) {
          continue;
        }

        if (rawModel) {
          // A new mold identifier is encountered! Finalize previous mold
          finalizeCurrentMold();

          // Resolve mold name and model inheritance
          let resolvedMold = rawModel;
          let displayMold = rawModel;

          if (rawModel.includes('#')) {
            const [prefix, num] = rawModel.split('#');
            if (prefix.trim()) {
              defaultPrefix = prefix.trim();
            }
            resolvedMold = rawModel;
            displayMold = rawModel;
          } else {
            // Lacks '#' (e.g. "2", "3-1", "4") -> inherit prefix e.g. "355#2", "355#3-1"
            if (defaultPrefix) {
              resolvedMold = `${defaultPrefix}#${rawModel}`;
              displayMold = `${defaultPrefix}#${rawModel} (${rawModel})`;
            } else {
              resolvedMold = rawModel;
              displayMold = rawModel;
            }
          }

          currentMoldName = resolvedMold;
          currentDisplayMoldName = displayMold;
          currentMoldRows = [row];
          currentInjectionVendor = (row.injectionVendor || '').trim();
          currentMoldVendor = (row.vendor || '').trim();
        } else {
          // Empty mold column: inherits the current active mold (border block)
          if (!currentMoldName) {
            // If the very first rows lack a mold name, assign a default
            currentMoldName = defaultPrefix ? `${defaultPrefix}#기본` : '미지정 MOLD';
            currentDisplayMoldName = currentMoldName;
          }
          currentMoldRows.push(row);
          if (!currentInjectionVendor && (row.injectionVendor || '').trim()) {
            currentInjectionVendor = (row.injectionVendor || '').trim();
          }
          if (!currentMoldVendor && (row.vendor || '').trim()) {
            currentMoldVendor = (row.vendor || '').trim();
          }
        }
      }

      // Finalize the last mold in this order
      finalizeCurrentMold();
    });

    return units;
  }, [ajOrders, crossModelIndex]);

  // Check if a row matches the active search query
  const isRowMatch = (row: OrderRow, query: string, type: 'ALL' | 'DN' | 'PART_NAME' | 'MOLD' | 'MODEL'): boolean => {
    if (!query) return false;
    const dn = (row.dept || '').toLowerCase();
    const itemName = (row.itemName || '').toLowerCase();
    const material = (row.material || '').toLowerCase();

    if (type === 'DN') return dn.includes(query);
    if (type === 'PART_NAME') return itemName.includes(query);
    if (type === 'ALL') return dn.includes(query) || itemName.includes(query) || material.includes(query);
    return false;
  };

  // Filter mold units based on user search term and active exclusions
  const filteredUnits = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    return moldUnits.filter(unit => {
      // Excluded from results
      if (excludedMoldKeys.includes(unit.key)) return false;

      if (!query) return true; // Show all if search term is empty

      const moldMatch =
        unit.moldName.toLowerCase().includes(query) ||
        unit.displayMoldName.toLowerCase().includes(query);
      const modelMatch =
        unit.modelName.toLowerCase().includes(query) ||
        unit.orderTitle.toLowerCase().includes(query);

      // Check rows for DN or Part Name match
      const hasMatchingRow = unit.rows.some(row => isRowMatch(row, query, filterType));

      if (filterType === 'MOLD') {
        // Only return when the mold matches
        return moldMatch;
      }

      if (filterType === 'MODEL') {
        return modelMatch;
      }

      if (filterType === 'DN' || filterType === 'PART_NAME') {
        // Return molds that contain this DN or Part Name
        return hasMatchingRow;
      }

      // FilterType === 'ALL'
      return moldMatch || modelMatch || hasMatchingRow;
    });
  }, [moldUnits, searchTerm, filterType, excludedMoldKeys]);

  // Quick exclusion handler (제외/삭제)
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
      setToastMessage({ text: '모든 몰드가 정상 복원되었습니다.' });
    }
  };

  return (
    <div className="space-y-5 pb-12">
      {/* Top Header & Search Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg relative">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-cyan-400 shrink-0">
              <Search className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-black text-white tracking-wider">INJECTION SEARCH</h1>
                <span className="px-2 py-0.5 text-[11px] font-bold bg-blue-500/10 text-cyan-400 border border-blue-500/30 rounded-md">
                  사출 검색
                </span>
                <span className="px-2 py-0.5 text-[11px] font-bold bg-slate-800 text-slate-300 border border-slate-700 rounded-md">
                  AJ사출발주 전용
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                도번, 품명, 몰드번호로 검색하여 소속된 몰드 전체와 공용 적용 모델을 확인합니다.
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

        {/* Search Input Box */}
        <div className="mt-4 space-y-3">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
              <Search className="w-4.5 h-4.5 text-cyan-400" />
            </div>
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="도번(DN), 품명(PART NAME), 몰드번호(MOLD), 기종(MODEL)을 입력하세요..."
              className="w-full pl-11 pr-10 py-2.5 bg-slate-950/90 border border-slate-700 focus:border-blue-500 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all font-medium"
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
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            <span className="text-[11px] font-bold text-slate-400 mr-1">검색 기준:</span>
            {(['ALL', 'DN', 'PART_NAME', 'MOLD', 'MODEL'] as const).map(type => (
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
                {type === 'DN' && '도번 (DN)'}
                {type === 'PART_NAME' && '품명 (PART NAME)'}
                {type === 'MOLD' && '몰드 (MOLD)'}
                {type === 'MODEL' && '기종 (MODEL)'}
              </button>
            ))}
            {searchTerm && (
              <button
                onClick={() => {
                  setSearchTerm('');
                  setFilterType('ALL');
                }}
                className="ml-auto text-xs text-slate-400 hover:text-slate-200 underline underline-offset-2"
              >
                검색어 초기화
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Toast Notification */}
      {toastMessage && (
        <div className="bg-slate-900 border border-blue-500/40 text-blue-200 px-4 py-2.5 rounded-xl shadow-xl flex items-center justify-between gap-3 animate-in fade-in duration-200">
          <div className="flex items-center gap-2 text-xs font-medium">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{toastMessage.text}</span>
          </div>
          {toastMessage.undoKey && (
            <button
              onClick={() => handleUndoExclude(toastMessage.undoKey!)}
              className="text-xs font-bold text-cyan-400 hover:text-cyan-300 underline underline-offset-2 shrink-0"
            >
              실행 취소
            </button>
          )}
        </div>
      )}

      {/* Search Result Count */}
      <div className="flex items-center justify-between px-1">
        <div className="text-xs text-slate-600 font-medium">
          {searchTerm ? (
            <span>
              <strong className="text-blue-600 font-bold">"{searchTerm}"</strong> 검색 결과:{' '}
              <strong className="text-slate-900 font-bold">{filteredUnits.length}</strong>개 몰드 일치
            </span>
          ) : (
            <span>AJ사출발주 등록 몰드: <strong>{filteredUnits.length}</strong>개</span>
          )}
        </div>
      </div>

      {/* Results List: Rendered by MOLD Unit */}
      {filteredUnits.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center shadow-sm">
          <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
            <Search className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-slate-800">일치하는 몰드 데이터가 없습니다</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
            {searchTerm
              ? '다른 도번, 품명, 또는 몰드 번호로 다시 검색해 보세요.'
              : '현재 저장된 AJ사출발주 데이터가 없습니다.'}
          </p>
          {excludedMoldKeys.length > 0 && (
            <button
              onClick={() => setShowExcludedModal(true)}
              className="mt-4 px-3.5 py-1.5 text-xs font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg transition-colors"
            >
              제외된 몰드 확인 및 복원 ({excludedMoldKeys.length}개)
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-5">
          {filteredUnits.map(unit => {
            const query = searchTerm.trim().toLowerCase();

            return (
              <div
                key={unit.key}
                className="bg-white border border-slate-200 hover:border-slate-300 rounded-xl shadow-sm transition-all overflow-hidden"
              >
                {/* Mold Card Header */}
                <div className="bg-slate-50/90 border-b border-slate-200 px-4 py-3 flex flex-col md:flex-row md:items-center justify-between gap-2.5">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {/* Mold Badge */}
                      <div className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 text-blue-800 border border-blue-200 rounded-lg text-xs font-black">
                        <Box className="w-3.5 h-3.5 text-blue-600" />
                        <span>MOLD: {unit.displayMoldName}</span>
                      </div>

                      {/* Model Tag */}
                      <span className="px-2 py-0.5 bg-slate-100 text-slate-700 border border-slate-200 rounded text-xs font-bold">
                        기종: {unit.modelName}
                      </span>

                      {/* Source Document */}
                      <span className="text-[11px] text-slate-500">
                        ({unit.orderTitle})
                      </span>
                    </div>

                    {/* Mold Vendor & Injection Vendor info */}
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-600 pt-0.5">
                      {unit.moldVendor && (
                        <span className="flex items-center gap-1 bg-emerald-50 text-emerald-800 px-2 py-0.5 rounded border border-emerald-200">
                          금형업체: <strong>{unit.moldVendor}</strong>
                        </span>
                      )}
                      {unit.injectionVendor && (
                        <span className="flex items-center gap-1 bg-amber-50 text-amber-800 px-2 py-0.5 rounded border border-amber-200">
                          <Factory className="w-3 h-3 text-amber-600" />
                          사출업체: <strong>{unit.injectionVendor}</strong>
                        </span>
                      )}
                      {unit.sharedModelsForMold.length > 1 && (
                        <div className="flex items-center gap-1 text-[11px]">
                          <Layers className="w-3 h-3 text-indigo-500" />
                          <span className="text-slate-500">몰드 공용 기종:</span>
                          {unit.sharedModelsForMold.map(m => (
                            <span
                              key={m}
                              onClick={() => {
                                setSearchTerm(m);
                                setFilterType('MODEL');
                              }}
                              className="px-1.5 py-0.2 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded text-[10px] font-bold cursor-pointer hover:bg-indigo-100"
                              title="이 기종으로 검색"
                            >
                              {m}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Exclude / Dismiss Button */}
                  <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                    <button
                      onClick={() => handleExcludeMold(unit.key, unit.moldName)}
                      className="flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-rose-600 hover:text-white bg-rose-50 hover:bg-rose-600 border border-rose-200 hover:border-rose-600 rounded-lg transition-colors"
                      title="이 몰드가 아니면 클릭하여 결과에서 제외합니다"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>결과에서 제외</span>
                    </button>
                  </div>
                </div>

                {/* Parts Table (CONFIDENTIAL: UNIT PRICE & PRICE COMPLETELY HIDDEN) */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-100/70 border-b border-slate-200 text-slate-600 font-bold">
                        <th className="py-2 px-3 w-10 text-center">NO</th>
                        <th className="py-2 px-3 w-32">도번 (DN)</th>
                        <th className="py-2 px-3 font-black text-slate-800">품명 (PART NAME)</th>
                        <th className="py-2 px-3 w-16 text-center">S</th>
                        <th className="py-2 px-3 w-20 text-center">Q'TY</th>
                        <th className="py-2 px-3 w-32">재질 (MATERIAL)</th>
                        <th className="py-2 px-3">비고 / R.SP</th>
                        <th className="py-2 px-3 w-52">타 기종 적용 여부</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
                      {unit.rows.map((row, idx) => {
                        const isMatch = isRowMatch(row, query, filterType);
                        const sharedModels = unit.sharedModelsForParts[row.id] || [];
                        const otherModels = sharedModels.filter(m => m !== unit.modelName);

                        return (
                          <tr
                            key={row.id || idx}
                            className={`transition-colors ${
                              isMatch
                                ? 'bg-amber-50/90 font-semibold text-slate-900 border-l-4 border-l-amber-500'
                                : 'hover:bg-slate-50'
                            }`}
                          >
                            <td className="py-2 px-3 text-center text-slate-400">{idx + 1}</td>
                            <td className="py-2 px-3 font-mono font-bold text-slate-800">
                              <span className={isMatch && filterType === 'DN' ? 'bg-amber-200 px-1 py-0.5 rounded' : ''}>
                                {row.dept || '-'}
                              </span>
                            </td>
                            <td className="py-2 px-3 font-bold text-slate-900">
                              <div className="flex items-center gap-1.5">
                                <span className={isMatch && filterType === 'PART_NAME' ? 'bg-amber-200 px-1 py-0.5 rounded' : ''}>
                                  {row.itemName || '-'}
                                </span>
                                {isMatch && (
                                  <span className="px-1.5 py-0.2 bg-amber-300 text-amber-950 text-[10px] font-black rounded">
                                    일치
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-2 px-3 text-center text-slate-600">{row.s || '-'}</td>
                            <td className="py-2 px-3 text-center font-bold text-slate-800">
                              {row.qty || row.orderQty || row.cty || '-'}
                            </td>
                            <td className="py-2 px-3 text-slate-600">{row.material || '-'}</td>
                            <td className="py-2 px-3 text-slate-500 text-[11px]">
                              {row.remarksRSP || row.remarks || '-'}
                            </td>

                            {/* Cross-model usage tags */}
                            <td className="py-2 px-3">
                              {otherModels.length > 0 ? (
                                <div className="flex flex-wrap items-center gap-1">
                                  <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded">
                                    공용: {otherModels.join(', ')}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-[10px] text-slate-400">단독 적용</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Card Bottom: Summary */}
                <div className="bg-slate-50/60 px-4 py-1.5 border-t border-slate-200 text-[11px] text-slate-500 flex items-center justify-between">
                  <span>총 {unit.rows.length}개 부품 구성</span>
                  <span className="text-slate-400">AJ사출발주 데이터</span>
                </div>
              </div>
            );
          })}
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
                  제외된 몰드 목록 ({excludedMoldKeys.length})
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
              검색 화면에서 제외된 몰드입니다. [복원] 버튼을 누르면 다시 검색 목록에 나타납니다.
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
