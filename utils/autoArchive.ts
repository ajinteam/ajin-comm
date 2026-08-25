import {
  OrderSubCategory,
  OrderItem,
  InvoiceItem,
  PurchaseOrderSubCategory,
  PurchaseOrderItem,
  VietnamSubCategory,
  VietnamOrderItem,
  InjectionOrderSubCategory
} from '../types';
import { saveSingleDoc } from '../supabase';

const TEN_DAYS_MS = 10 * 24 * 60 * 60 * 1000;

/**
 * 날짜 문자열을 Unix Timestamp(ms)로 안전하게 파싱합니다.
 */
export const parseAnyDateToMs = (dateInput: any): number | null => {
  if (!dateInput) return null;

  if (typeof dateInput === 'number' && !isNaN(dateInput)) {
    return dateInput;
  }

  const str = String(dateInput).trim();
  if (!str) return null;

  // 1. ISO 8601 및 기본 Date 파싱 시도
  const parsedIso = Date.parse(str);
  if (!isNaN(parsedIso)) {
    return parsedIso;
  }

  // 2. 한국어 날짜 형식: "2026. 8. 24." 또는 "2026. 08. 24" 또는 "2026-08-24"
  const dateMatch = str.match(/(\d{4})[.\-\/]\s*(\d{1,2})[.\-\/]\s*(\d{1,2})/);
  if (dateMatch) {
    const year = parseInt(dateMatch[1], 10);
    const month = parseInt(dateMatch[2], 10) - 1;
    const day = parseInt(dateMatch[3], 10);

    let hours = 0;
    let minutes = 0;
    let seconds = 0;

    // 시간 파싱 (오후/오전 또는 HH:MM)
    const isPm = str.includes('오후') || str.toUpperCase().includes('PM');
    const isAm = str.includes('오전') || str.toUpperCase().includes('AM');
    const timeMatch = str.match(/(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/);

    if (timeMatch) {
      hours = parseInt(timeMatch[1], 10);
      minutes = parseInt(timeMatch[2], 10);
      seconds = timeMatch[3] ? parseInt(timeMatch[3], 10) : 0;

      if (isPm && hours < 12) hours += 12;
      if (isAm && hours === 12) hours = 0;
    }

    const d = new Date(year, month, day, hours, minutes, seconds);
    if (!isNaN(d.getTime())) {
      return d.getTime();
    }
  }

  // 3. ID 내부의 숫자 타임스탬프 추출 (예: INV-1718000000000, po-1718000000000)
  const idTimestampMatch = str.match(/(\d{12,14})/);
  if (idTimestampMatch) {
    const num = parseInt(idTimestampMatch[1], 10);
    if (!isNaN(num) && num > 1000000000000 && num < 4000000000000) {
      return num;
    }
  }

  return null;
};

/**
 * 문서의 최종 결재 완료/작성 시점 타임스탬프를 계산합니다.
 */
export const getDocApprovalOrCreationMs = (doc: any): number | null => {
  if (!doc) return null;

  // 1. stamps에 기록된 승인 일시 확인 (final -> director -> ceo -> head -> manager -> design -> writer)
  const stampCandidates = [
    doc.stamps?.final?.timestamp,
    doc.stamps?.director?.timestamp,
    doc.stamps?.ceo?.timestamp,
    doc.stamps?.head?.timestamp,
    doc.stamps?.manager?.timestamp,
    doc.stamps?.design?.timestamp,
    doc.stamps?.writer?.timestamp
  ];

  for (const stampTs of stampCandidates) {
    if (stampTs) {
      const ms = parseAnyDateToMs(stampTs);
      if (ms) return ms;
    }
  }

  // 2. createdAt 확인
  if (doc.createdAt) {
    const ms = parseAnyDateToMs(doc.createdAt);
    if (ms) return ms;
  }

  // 3. date 필드 확인
  if (doc.date) {
    const ms = parseAnyDateToMs(doc.date);
    if (ms) return ms;
  }

  // 4. doc.id 내부의 타임스탬프 확인
  if (doc.id) {
    const ms = parseAnyDateToMs(doc.id);
    if (ms) return ms;
  }

  return null;
};

/**
 * 10일이 경과되었는지 확인합니다.
 */
export const isOlderThanTenDays = (doc: any): boolean => {
  const docMs = getDocApprovalOrCreationMs(doc);
  if (!docMs) return false;
  return (Date.now() - docMs) >= TEN_DAYS_MS;
};

/**
 * 10일 경과된 결재완료/작성완료 문서들을 각 최종 보관함으로 자동 이동/저장합니다.
 * - 주문서: 구매처별 완료 폴더 (서울(완료), 대천(완료), 베트남(완료))
 * - 송장: 수신처별 완료 폴더 (서울, 대천, 베트남 수신처 폴더)
 * - 발주서: 수신처별 보관함 (ARCHIVE)
 * - 사출발주서: AJ사출발주 / 사출 수신함
 * - VN베트남: VN주문서완료 / VN METAL발주서완료 / VN지불요청서완료
 */
export const runTenDayAutoArchive = async (): Promise<{ updated: boolean; count: number }> => {
  let anyUpdated = false;
  let totalArchivedCount = 0;
  const nowIso = new Date().toISOString();

  // 1. 주문서 (Orders) 자동 이동 처리
  try {
    const ordersRaw = localStorage.getItem('ajin_orders');
    if (ordersRaw) {
      const orders: OrderItem[] = JSON.parse(ordersRaw);
      let ordersChanged = false;

      const updatedOrders = orders.map(order => {
        // 결재완료 상태이고 아직 지역별 완료 폴더로 이동하지 않은 문서 중 10일 경과 건
        const isApprovedPendingArchive = order.status === OrderSubCategory.APPROVED;
        if (isApprovedPendingArchive && isOlderThanTenDays(order)) {
          ordersChanged = true;
          anyUpdated = true;
          totalArchivedCount++;

          let nextStatus: OrderSubCategory = OrderSubCategory.APPROVED_SEOUL;
          if (order.location === 'DAECHEON') {
            nextStatus = OrderSubCategory.APPROVED_DAECHEON;
          } else if (order.location === 'VIETNAM') {
            nextStatus = OrderSubCategory.APPROVED_VIETNAM;
          }

          const updatedOrder: OrderItem = {
            ...order,
            status: nextStatus,
            stamps: {
              ...order.stamps,
              final: order.stamps?.final || { userId: 'AUTO', timestamp: nowIso }
            }
          };

          saveSingleDoc('orders', updatedOrder);
          return updatedOrder;
        }
        return order;
      });

      if (ordersChanged) {
        localStorage.setItem('ajin_orders', JSON.stringify(updatedOrders));
      }
    }
  } catch (err) {
    console.error('[Auto Archive Error - Orders]', err);
  }

  // 2. 송장 (Invoices) 자동 이동 처리
  try {
    const invoicesRaw = localStorage.getItem('ajin_invoices');
    if (invoicesRaw) {
      const invoices: InvoiceItem[] = JSON.parse(invoicesRaw);
      let invoicesChanged = false;

      const updatedInvoices = invoices.map(inv => {
        // 임시저장이 아니고, 아직 수신처별 완료(결재완료)되지 않은 작성완료/결재대기 송장 중 10일 경과 건
        const isPendingConfirm = !inv.isTemporary && inv.status !== '결재완료';
        if (isPendingConfirm && isOlderThanTenDays(inv)) {
          invoicesChanged = true;
          anyUpdated = true;
          totalArchivedCount++;

          // 모든 행 자동 수량확인 처리
          const updatedRows = (inv.rows || []).map(row => {
            if (!row.isDeleted && (row.model?.trim() || row.itemName?.trim()) && !row.qtyConfirm) {
              return {
                ...row,
                qtyConfirm: { userId: 'AUTO', timestamp: nowIso }
              };
            }
            return row;
          });

          const updatedInv: InvoiceItem = {
            ...inv,
            rows: updatedRows,
            status: '결재완료',
            stamps: {
              ...inv.stamps,
              final: inv.stamps?.final || { userId: 'AUTO', timestamp: nowIso }
            }
          };

          saveSingleDoc('invoices', updatedInv);
          return updatedInv;
        }
        return inv;
      });

      if (invoicesChanged) {
        localStorage.setItem('ajin_invoices', JSON.stringify(updatedInvoices));
      }
    }
  } catch (err) {
    console.error('[Auto Archive Error - Invoices]', err);
  }

  // 3. 발주서 (Purchase Orders) 자동 이동 처리
  try {
    const poRaw = localStorage.getItem('ajin_purchase_orders');
    if (poRaw) {
      const pOrders: PurchaseOrderItem[] = JSON.parse(poRaw);
      let poChanged = false;

      const updatedPOs = pOrders.map(po => {
        // PO 결재완료 상태이고 final stamp가 없어 아직 수신처별 보관함으로 이동 안 한 건 중 10일 경과 건
        const isApprovedPendingArchive = po.status === PurchaseOrderSubCategory.APPROVED && !po.stamps?.final;
        if (isApprovedPendingArchive && isOlderThanTenDays(po)) {
          poChanged = true;
          anyUpdated = true;
          totalArchivedCount++;

          const updatedPO: PurchaseOrderItem = {
            ...po,
            stamps: {
              ...po.stamps,
              final: { userId: 'AUTO', timestamp: nowIso }
            }
          };

          const tableName = updatedPO.code === 'INJECTION' ? 'Injection_Order' : 'purchase_orders';
          saveSingleDoc(tableName, updatedPO);
          return updatedPO;
        }
        return po;
      });

      if (poChanged) {
        localStorage.setItem('ajin_purchase_orders', JSON.stringify(updatedPOs));
      }
    }
  } catch (err) {
    console.error('[Auto Archive Error - Purchase Orders]', err);
  }

  // 4. 사출발주서 (Injection Orders: AJ사출발주, 사출 수신함 2종) 자동 이동 처리
  try {
    const injRaw = localStorage.getItem('ajin_injection_orders');
    if (injRaw) {
      const injOrders: any[] = JSON.parse(injRaw);
      let injChanged = false;

      const updatedInjOrders = injOrders.map(inj => {
        // 사출 결재완료 상태인 문서 중 10일 경과 건
        const isApprovedPendingMove = inj.status === InjectionOrderSubCategory.APPROVED;
        if (isApprovedPendingMove && isOlderThanTenDays(inj)) {
          injChanged = true;
          anyUpdated = true;
          totalArchivedCount++;

          const isTakeInbox = String(inj.id || '').startsWith('inj-');
          const nextStatus = isTakeInbox
            ? InjectionOrderSubCategory.INBOX
            : InjectionOrderSubCategory.DESTINATION;

          const updatedInj = {
            ...inj,
            status: nextStatus,
            stamps: {
              ...inj.stamps,
              final: inj.stamps?.final || { userId: 'AUTO', timestamp: nowIso }
            }
          };

          const tableName = isTakeInbox ? 'Injection_Take' : 'Injection_Order';
          saveSingleDoc(tableName, updatedInj);
          return updatedInj;
        }
        return inj;
      });

      if (injChanged) {
        localStorage.setItem('ajin_injection_orders', JSON.stringify(updatedInjOrders));
      }
    }
  } catch (err) {
    console.error('[Auto Archive Error - Injection Orders]', err);
  }

  // 5. VN베트남 (Vietnam Orders: VN주문서, VN METAL발주서, VN지불요청서) 자동 이동 처리
  try {
    const vnRaw = localStorage.getItem('ajin_vietnam_orders');
    if (vnRaw) {
      const vnOrders: VietnamOrderItem[] = JSON.parse(vnRaw);
      let vnChanged = false;

      const updatedVnOrders = vnOrders.map(vn => {
        // VN 결재완료 상태(APPROVED 또는 COMPLETED_ROOT 또는 '결재완료')인 문서 중 10일 경과 건
        const isApprovedPendingMove =
          vn.status === VietnamSubCategory.APPROVED ||
          vn.status === VietnamSubCategory.COMPLETED_ROOT ||
          (vn.status as string) === '결재완료' ||
          (vn.status as string) === 'VN결재완료';

        if (isApprovedPendingMove && isOlderThanTenDays(vn)) {
          vnChanged = true;
          anyUpdated = true;
          totalArchivedCount++;

          let nextStatus = VietnamSubCategory.ORDER_COMPLETED;
          if (vn.type === 'PAYMENT') {
            nextStatus = VietnamSubCategory.PAYMENT_COMPLETED;
          } else if (vn.type === 'METAL') {
            nextStatus = VietnamSubCategory.METAL_ORDER_COMPLETED;
          }

          const updatedVn: VietnamOrderItem = {
            ...vn,
            status: nextStatus,
            stamps: {
              ...vn.stamps,
              final: vn.stamps?.final || { userId: 'AUTO', timestamp: nowIso }
            }
          };

          saveSingleDoc('vn_purchase_orders', updatedVn);
          return updatedVn;
        }
        return vn;
      });

      if (vnChanged) {
        localStorage.setItem('ajin_vietnam_orders', JSON.stringify(updatedVnOrders));
      }
    }
  } catch (err) {
    console.error('[Auto Archive Error - Vietnam Orders]', err);
  }

  if (anyUpdated) {
    console.log(`[10-Day Auto Archive] Successfully moved ${totalArchivedCount} documents to their final archive storage.`);
  }

  return { updated: anyUpdated, count: totalArchivedCount };
};
