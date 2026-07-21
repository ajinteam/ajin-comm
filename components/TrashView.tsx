import React, { useState, useEffect } from 'react';
import { 
  fetchTrashList, 
  restoreDocFromTrash, 
  permanentlyDeleteFromTrash, 
  cleanExpiredTrash 
} from '../supabase';
import { 
  Trash2, 
  RefreshCw, 
  AlertTriangle, 
  Search, 
  CheckCircle, 
  XCircle, 
  ArrowLeft,
  Clock,
  Database
} from 'lucide-react';

interface TrashViewProps {
  currentUser: any;
  setView: (view: any) => void;
  dataVersion?: number;
}

const TABLE_NAME_MAP: Record<string, string> = {
  'orders': '주문서',
  'invoices': '송장 (Invoice)',
  'purchase_orders': 'PO 발주서',
  'vn_purchase_orders': '베트남 (VN) 주문서',
  'nationalinvoice': '국제인보이스',
  'Injection_Order': '사출발주서',
  'Injection_Take': '사출인수증',
  'na_invoice_image': '출하보고서'
};

const TABLE_COLOR_MAP: Record<string, string> = {
  'orders': 'bg-blue-50 text-blue-700 border-blue-200',
  'invoices': 'bg-purple-50 text-purple-700 border-purple-200',
  'purchase_orders': 'bg-amber-50 text-amber-700 border-amber-200',
  'vn_purchase_orders': 'bg-orange-50 text-orange-700 border-orange-200',
  'nationalinvoice': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  'Injection_Order': 'bg-rose-50 text-rose-700 border-rose-200',
  'Injection_Take': 'bg-pink-50 text-pink-700 border-pink-200',
  'na_invoice_image': 'bg-teal-50 text-teal-700 border-teal-200'
};

const getDocumentSummary = (tableName: string, content: any): string => {
  if (!content) return '-';
  try {
    switch (tableName) {
      case 'orders':
        return `${content.title || '제목 없음'} / 공급: ${content.supplier || '미정'}`;
      case 'invoices':
        return `No: ${content.invoiceNo || '없음'} / Buyer: ${content.buyerName || '없음'}`;
      case 'purchase_orders':
        return `No: ${content.poNo || '없음'} / 공급: ${content.supplier || '없음'}`;
      case 'vn_purchase_orders':
        return `Vendor: ${content.vendorName || '없음'} / 금액: ${content.totalAmount || '0'}`;
      case 'nationalinvoice':
        return `No: ${content.invoiceNo || '없음'} / Shipper: ${content.shipper?.name || '없음'}`;
      case 'Injection_Order':
        return `No: ${content.orderNo || '없음'} / 품명: ${content.partName || '없음'}`;
      case 'Injection_Take':
        return `No: ${content.takeNo || '없음'} / 품명: ${content.partName || '없음'}`;
      case 'na_invoice_image':
        return `Model: ${content.model || '없음'} / ${content.rows?.length || 0}개 품목`;
      default:
        return content.description || content.title || JSON.stringify(content).slice(0, 50);
    }
  } catch (e) {
    return '데이터 파싱 에러';
  }
};

export const TrashView: React.FC<TrashViewProps> = ({ currentUser, setView }) => {
  const [trashItems, setTrashItems] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const loadTrashData = async () => {
    setIsLoading(true);
    try {
      // 1. 오래된 데이터 먼저 청소 (7일 만료)
      await cleanExpiredTrash();
      // 2. 휴지통 목록 조회
      const data = await fetchTrashList();
      setTrashItems(data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadTrashData();
  }, []);

  const showNotification = (type: 'success' | 'error', text: string) => {
    setNotification({ type, text });
    setTimeout(() => {
      setNotification(null);
    }, 4000);
  };

  const handleRestore = async (id: string, originalId: string, tableName: string) => {
    if (!window.confirm(`이 문서(${originalId})를 원래 테이블(${TABLE_NAME_MAP[tableName] || tableName})로 복구하시겠습니까?`)) {
      return;
    }
    setActionLoading(id);
    try {
      const res = await restoreDocFromTrash(id);
      if (res.success) {
        // 클라이언트 로컬 스토리지 실시간 동기화 보강
        if (res.table_name && res.content) {
          const simpleTables: Record<string, string> = {
            'orders': 'ajin_orders',
            'invoices': 'ajin_invoices',
            'purchase_orders': 'ajin_purchase_orders',
            'vn_purchase_orders': 'ajin_vietnam_orders',
            'nationalinvoice': 'ajin_national_invoices',
            'na_invoice_image': 'ajin_shipping_reports'
          };
          
          let storageKey = '';
          if (simpleTables[res.table_name]) {
            storageKey = simpleTables[res.table_name];
          } else if (res.table_name === 'Injection_Order' || res.table_name === 'Injection_Take') {
            storageKey = 'ajin_injection_orders';
          }
          
          if (storageKey) {
            try {
              let list = JSON.parse(localStorage.getItem(storageKey) || '[]');
              const doc = res.content;
              const index = list.findIndex((item: any) => String(item.id) === String(doc.id));
              if (index > -1) {
                list[index] = doc;
              } else {
                list.unshift(doc);
              }
              localStorage.setItem(storageKey, JSON.stringify(list));
              console.log(`[Local Sync restored item] Saved back to local storage key: ${storageKey}`);
            } catch (err) {
              console.error('[Local Sync Error on Restore]', err);
            }
          }
        }

        showNotification('success', '문서가 성공적으로 원래대로 복구되었습니다.');
        setTrashItems(prev => prev.filter(item => item.id !== id));
      } else {
        showNotification('error', `복구 실패: ${res.error}`);
      }
    } catch (err: any) {
      showNotification('error', `오류 발생: ${err.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handlePermanentDelete = async (id: string) => {
    if (!window.confirm('이 문서를 휴지통에서 영구적으로 삭제하시겠습니까? 삭제 후에는 어떤 방법으로도 복구할 수 없습니다.')) {
      return;
    }
    setActionLoading(id);
    try {
      const res = await permanentlyDeleteFromTrash(id);
      if (res.success) {
        showNotification('success', '문서가 영구적으로 삭제되었습니다.');
        setTrashItems(prev => prev.filter(item => item.id !== id));
      } else {
        showNotification('error', `삭제 실패: ${res.error}`);
      }
    } catch (err: any) {
      showNotification('error', `오류 발생: ${err.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  const getRemainingTimeText = (deletedAtStr: string) => {
    try {
      const deletedAt = new Date(deletedAtStr);
      const expirationDate = new Date(deletedAt.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days retention
      const now = new Date();
      
      const diffMs = expirationDate.getTime() - now.getTime();
      if (diffMs <= 0) return '만료 임박 / 자동 삭제 대기';

      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

      if (diffHours >= 24) {
        const diffDays = Math.floor(diffHours / 24);
        const remHours = diffHours % 24;
        return `${diffDays}일 ${remHours}시간 남음`;
      }
      return `${diffHours}시간 ${diffMins}분 남음`;
    } catch (e) {
      return '-';
    }
  };

  // 필터링 적용
  const filteredItems = trashItems.filter(item => {
    const tableField = item.original_table || item.table_name;
    const readableTable = TABLE_NAME_MAP[tableField] || tableField;
    const summary = getDocumentSummary(tableField, item.content);
    const itemStatus = item.content?.status || item.status || '';
    const itemCategory = item.content?.type || item.content?.location || item.category || '';
    const textToSearch = `${item.original_id} ${readableTable} ${summary} ${itemStatus} ${itemCategory}`.toLowerCase();
    return textToSearch.includes(searchTerm.toLowerCase());
  });

  return (
    <div id="trash_view_container" className="space-y-6">
      {/* 알림 토스트 */}
      {notification && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl border shadow-xl transition-all duration-300 animate-in fade-in slide-in-from-top-4 ${
          notification.type === 'success' 
            ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
            : 'bg-rose-50 text-rose-800 border-rose-200'
        }`}>
          {notification.type === 'success' ? <CheckCircle className="h-5 w-5 text-emerald-600" /> : <XCircle className="h-5 w-5 text-rose-600" />}
          <span className="text-sm font-semibold">{notification.text}</span>
        </div>
      )}

      {/* 헤더 섹션 */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setView({ type: 'DASHBOARD' })}
            className="p-2 hover:bg-slate-100 rounded-xl transition-colors border border-slate-200 text-slate-600 hover:text-slate-900"
            title="메인으로 돌아가기"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1 bg-emerald-100 text-emerald-700 rounded-lg">
                <Trash2 className="h-5 w-5" />
              </span>
              <h1 className="text-xl font-black text-slate-900 tracking-tight">휴지통 관리</h1>
            </div>
            <p className="text-slate-500 text-xs mt-1 font-medium">
              실수로 지워진 문서를 안전하게 복구할 수 있는 휴지통입니다. 삭제된 문서는 <span className="text-emerald-600 font-bold">최대 7일간 보관</span>된 후 영구히 삭제됩니다.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start md:self-auto">
          <button
            onClick={loadTrashData}
            disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-slate-700 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            새로고침
          </button>
        </div>
      </div>

      {/* 주의 사항 배너 */}
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="text-xs text-amber-800 leading-relaxed font-semibold">
          <p className="font-bold text-amber-900">⚠️ 휴지통 보관 기간 및 복구 안내</p>
          <ul className="list-disc pl-4 mt-1 space-y-1">
            <li>삭제 후 7일이 경과한 휴지통 내부의 오래된 항목들은 시스템 가동 시 자동으로 완전 삭제됩니다.</li>
            <li>문서를 복구하면 원래 관리되던 결재 단계(결재대기, 완료 등)와 데이터 내용 그대로 즉시 원래 메뉴에 복구됩니다.</li>
            <li>원격 데이터베이스(Supabase)와 연동되어 작동하며, RLS가 완벽히 적용되어 안전합니다.</li>
          </ul>
        </div>
      </div>

      {/* 검색 필터 및 리스트 */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="문서 번호, 종류, 내용으로 휴지통 검색..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
            />
          </div>
          <div className="text-xs font-bold text-slate-500">
            조회 결과: <span className="text-emerald-600">{filteredItems.length}</span>건 / 전체: {trashItems.length}건
          </div>
        </div>

        {isLoading ? (
          <div className="p-16 flex flex-col items-center justify-center text-slate-400">
            <RefreshCw className="h-8 w-8 animate-spin text-emerald-500 mb-2" />
            <p className="text-sm font-semibold">휴지통 데이터 불러오는 중...</p>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="p-16 flex flex-col items-center justify-center text-center text-slate-400">
            <Database className="h-12 w-12 text-slate-300 mb-3" />
            <p className="font-bold text-slate-700">휴지통이 비어있습니다.</p>
            <p className="text-xs mt-1 text-slate-400 max-w-xs leading-relaxed">
              최근 7일 이내에 삭제된 문서가 없거나 검색 조건과 일치하는 항목이 없습니다.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-500 text-xs font-bold uppercase border-b border-slate-100">
                  <th className="py-3.5 px-4 font-black">종류</th>
                  <th className="py-3.5 px-4 font-black">원래 문서 번호 (ID)</th>
                  <th className="py-3.5 px-4 font-black">문서 요약 정보</th>
                  <th className="py-3.5 px-4 font-black">원래 상태</th>
                  <th className="py-3.5 px-4 font-black">삭제 일시</th>
                  <th className="py-3.5 px-4 font-black">남은 보관 기간</th>
                  <th className="py-3.5 px-4 font-black text-center">액션</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs font-semibold text-slate-700">
                {filteredItems.map((item) => {
                  const tableField = item.original_table || item.table_name;
                  const readableTable = TABLE_NAME_MAP[tableField] || tableField;
                  const colorClass = TABLE_COLOR_MAP[tableField] || 'bg-slate-50 text-slate-700 border-slate-200';
                  const isPendingAction = actionLoading === item.id;
                  const itemStatus = item.content?.status || item.status || '일반';

                  return (
                    <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                      {/* 종류 */}
                      <td className="py-4 px-4">
                        <span className={`px-2.5 py-1 rounded-full text-[11px] font-black border ${colorClass}`}>
                          {readableTable}
                        </span>
                      </td>
                      {/* 문서 번호 */}
                      <td className="py-4 px-4 font-mono font-bold text-slate-800">
                        {item.original_id}
                      </td>
                      {/* 요약 */}
                      <td className="py-4 px-4 font-medium text-slate-600 max-w-sm truncate" title={getDocumentSummary(tableField, item.content)}>
                        {getDocumentSummary(tableField, item.content)}
                      </td>
                      {/* 상태 */}
                      <td className="py-4 px-4">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          itemStatus === '결재완료' || itemStatus === '송장완료'
                            ? 'bg-blue-50 text-blue-700' 
                            : itemStatus === '결재대기' 
                            ? 'bg-amber-50 text-amber-700' 
                            : 'bg-slate-100 text-slate-600'
                        }`}>
                          {itemStatus}
                        </span>
                      </td>
                      {/* 삭제 일시 */}
                      <td className="py-4 px-4 text-slate-500 font-mono">
                        {item.deleted_at ? new Date(item.deleted_at).toLocaleString('ko-KR') : '-'}
                      </td>
                      {/* 남은 시간 */}
                      <td className="py-4 px-4 text-slate-800">
                        <div className="flex items-center gap-1.5 font-bold">
                          <Clock className="h-3.5 w-3.5 text-emerald-600" />
                          <span>{getRemainingTimeText(item.deleted_at)}</span>
                        </div>
                      </td>
                      {/* 작업 */}
                      <td className="py-4 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => handleRestore(item.id, item.original_id, tableField)}
                            disabled={!!actionLoading}
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors font-bold disabled:opacity-50"
                          >
                            {isPendingAction ? '처리중' : '복구'}
                          </button>
                          <button
                            onClick={() => handlePermanentDelete(item.id)}
                            disabled={!!actionLoading}
                            className="px-3 py-1.5 bg-white hover:bg-rose-50 text-rose-600 rounded-lg border border-rose-200 hover:border-rose-300 transition-colors font-bold disabled:opacity-50"
                          >
                            {isPendingAction ? '...' : '영구 삭제'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
