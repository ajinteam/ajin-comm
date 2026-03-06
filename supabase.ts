import { createClient } from '@supabase/supabase-js';

// 환경 변수 가져오기 로직 (기존 유지)
const getEnvVar = (name: string): string => {
  try {
    if (typeof import.meta !== 'undefined' && (import.meta as any).env) {
      if ((import.meta as any).env[name]) return (import.meta as any).env[name];
    }
    if (typeof process !== 'undefined' && process.env) {
      if (process.env[name]) return process.env[name] || '';
    }
  } catch (e) {}
  return '';
};

const supabaseUrl = getEnvVar('SUPABASE_URL') || getEnvVar('VITE_SUPABASE_URL');
const supabaseAnonKey = getEnvVar('SUPABASE_ANON_KEY') || getEnvVar('VITE_SUPABASE_ANON_KEY');

export const supabase = (supabaseUrl && supabaseAnonKey) 
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

/**
 * [트래픽 절감 핵심] 특정 문서(발주서, 송장 등) 1건만 분산 저장하는 함수
 * 새로 작성하거나 수정하는 문서는 이 함수를 통해 각각의 새 테이블로 들어갑니다.
 */
export const saveSingleDoc = async (tableName: string, doc: any, category?: string) => {
  if (!supabase) return;
  try {
    const { error } = await supabase
      .from(tableName)
      .upsert({
        id: doc.id, // 문서의 고유 고유 ID를 PK로 사용
        content: doc,
        category: category || doc.type || null,
        status: doc.status || '결재대기'
      });

    if (error) throw error;
    console.log(`[Cloud Sync] ${tableName} 1건 분산 저장 성공 (트래픽 최소화)`);
  } catch (err) {
    console.error(`[Cloud Sync Error] ${tableName}:`, err);
  }
};

/**
 * [안전장치] 기존 전체 백업과 새 분산 데이터를 모두 합쳐서 불러오는 함수
 * 현재 결재 대기 중인 문서들을 잃어버리지 않도록 양쪽에서 모두 읽어옵니다.
 */
export const pullStateFromCloud = async () => {
  if (!supabase) return null;
  try {
    // 1. 기존 통짜 백업 데이터 가져오기 (결재대기 문서 포함됨)
    const { data: legacy, error: legacyError } = await supabase
      .from('ajin-comm-backup')
      .select('dataload')
      .eq('id', 1)
      .maybeSingle();

    if (legacyError) throw legacyError;

    // 2. 새 분산 테이블들에서 개별 데이터 가져오기
    const [orders, invoices, p_orders, vn_orders] = await Promise.all([
      supabase.from('orders').select('content'),
      supabase.from('invoices').select('content'),
      supabase.from('purchase_orders').select('content'),
      supabase.from('vn_purchase_orders').select('content')
    ]);

    const legacyData = legacy?.dataload || {};
    
    // 3. 데이터 병합 로직 (ID 중복 제거)
    const merge = (legacyList: any[] = [], newList: any[] = []) => {
      const newItems = newList?.map(item => item.content) || [];
      const combined = [...newItems, ...legacyList];
      // 동일 ID가 있을 경우 최신 데이터(새 테이블) 우선
      return Array.from(new Map(combined.map(item => [item.id, item])).values());
    };

    const finalData = {
      accounts: legacyData.accounts || [],
      orders: merge(legacyData.orders, orders.data),
      invoices: merge(legacyData.invoices, invoices.data),
      purchase_orders: merge(legacyData.purchase_orders, p_orders.data),
      vietnam_orders: merge(legacyData.vietnam_orders, vn_orders.data),
      vn_vendors: legacyData.vn_vendors || [],
      vn_bank_vendors: legacyData.vn_bank_vendors || [],
      notices: legacyData.notices || [],
      updatedAt: legacyData.updatedAt || new Date().toISOString()
    };

    // 4. 로컬 스토리지에 즉시 반영
    Object.keys(finalData).forEach(key => {
      if (key !== 'updatedAt') {
        localStorage.setItem(`ajin_${key}`, JSON.stringify((finalData as any)[key]));
      }
    });
    localStorage.setItem('ajin_last_local_update', finalData.updatedAt);

    console.log('[Cloud Sync] 모든 데이터 통합 로드 완료');
    return finalData;
  } catch (err) {
    console.error('[Cloud Sync] Pull error:', err);
    return null;
  }
};

/**
 * 잔디 알림 전송 함수 (기존 유지)
 */
export const sendJandiNotification = async (
  target: 'KR' | 'VN',
  type: 'REQUEST' | 'COMPLETE' | 'REJECT',
  title: string,
  recipient: string,
  date: string
) => {
  try {
    const response = await fetch('/api/jandi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target, type, title, recipient, date })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Unknown API error');
    console.log(`[JANDI SUCCESS] Notification sent: ${target}, ${type}`);
  } catch (err) {
    console.error('[JANDI API CALL ERROR]', err);
  }
};

// 기존 pushStateToCloud는 당분간 유지하되 호출을 최소화합니다.
let pushTimer: any = null;
let lastPushedData: string = '';

export const pushStateToCloud = async () => {
  if (!supabase) return;
  if (pushTimer) clearTimeout(pushTimer);
  
  pushTimer = setTimeout(async () => {
    try {
      const dataload = {
        accounts: JSON.parse(localStorage.getItem('ajin_accounts') || '[]'),
        orders: JSON.parse(localStorage.getItem('ajin_orders') || '[]'),
        invoices: JSON.parse(localStorage.getItem('ajin_invoices') || '[]'),
        purchase_orders: JSON.parse(localStorage.getItem('ajin_purchase_orders') || '[]'),
        vietnam_orders: JSON.parse(localStorage.getItem('ajin_vietnam_orders') || '[]'),
        vn_vendors: JSON.parse(localStorage.getItem('ajin_vn_vendors') || '[]'),
        vn_bank_vendors: JSON.parse(localStorage.getItem('ajin_vn_bank_vendors') || '[]'),
        notices: JSON.parse(localStorage.getItem('ajin_notices') || '[]'),
      };

      const currentDataStr = JSON.stringify(dataload);
      if (currentDataStr === lastPushedData) return;

      const updatedAt = new Date().toISOString();
      const { error } = await supabase
        .from('ajin-comm-backup')
        .upsert({ id: 1, dataload: { ...dataload, updatedAt } });

      if (!error) {
        lastPushedData = currentDataStr;
        localStorage.setItem('ajin_last_local_update', updatedAt);
        console.log('[Cloud Sync] Full backup successful.');
      }
    } catch (err) {
      console.error('[Cloud Sync] Push error:', err);
    }
  }, 10000); // 전체 백업은 10초 주기로 늦춰 트래픽 방어
};