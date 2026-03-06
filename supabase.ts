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
    // [보완] upsert 시 id가 문자열이므로 테이블의 id 컬럼이 text/varchar여야 합니다.
    const { error } = await supabase
      .from(tableName)
      .upsert({
        id: doc.id, 
        content: doc,
        category: category || doc.type || doc.location || null,
        status: doc.status || '결재대기'
      }, { onConflict: 'id' });

    if (error) {
      console.error(`[Supabase Upsert Error] Table: ${tableName}, ID: ${doc.id}`, error);
      return;
    }
    console.log(`[Cloud Sync] ${tableName} 저장 성공: ${doc.id}`);
  } catch (err) {
    console.error(`[Cloud Sync Exception] ${tableName}:`, err);
  }
};

/**
 * [안전장치] 클라우드(백업+분산) 데이터와 현재 로컬 데이터를 지능적으로 병합
 */
export const pullStateFromCloud = async () => {
  if (!supabase) return null;
  try {
    // 1. 각 테이블 데이터를 개별적으로 로드 (하나가 실패해도 나머지는 진행)
    const fetchTable = async (name: string) => {
      try {
        const { data, error } = await supabase.from(name).select('content');
        if (error) {
          console.warn(`[Supabase Fetch Warning] ${name}:`, error.message);
          return [];
        }
        return data || [];
      } catch (e) {
        return [];
      }
    };

    const [legacyRes, ordersRes, invoicesRes, pOrdersRes, vnOrdersRes] = await Promise.all([
      supabase.from('ajin-comm-backup').select('dataload').eq('id', 1).maybeSingle(),
      fetchTable('orders'),
      fetchTable('invoices'),
      fetchTable('purchase_orders'),
      fetchTable('vn_purchase_orders')
    ]);

    const legacyData = legacyRes.data?.dataload || {};
    
    // 2. 병합 함수: [기존 백업 < 클라우드 개별 < 로컬] 순으로 우선순위 부여
    const merge = (localKey: string, legacyList: any[] = [], newList: any[] = []) => {
      const localData = JSON.parse(localStorage.getItem(`ajin_${localKey}`) || '[]');
      const cloudItems = newList?.map((item: any) => item.content).filter(Boolean) || [];
      
      // 우선순위: legacy(가장 낮음) -> cloudItems -> localData(가장 높음)
      const combined = [...(legacyList || []), ...cloudItems, ...localData];
      
      const map = new Map();
      combined.forEach(item => {
        if (item && item.id) map.set(item.id, item);
      });
      return Array.from(map.values());
    };

    const finalData = {
      accounts: legacyData.accounts || JSON.parse(localStorage.getItem('ajin_accounts') || '[]'),
      orders: merge('orders', legacyData.orders, ordersRes),
      invoices: merge('invoices', legacyData.invoices, invoicesRes),
      purchase_orders: merge('purchase_orders', legacyData.purchase_orders, pOrdersRes),
      vietnam_orders: merge('vietnam_orders', legacyData.vietnam_orders, vnOrdersRes),
      vn_vendors: legacyData.vn_vendors || JSON.parse(localStorage.getItem('ajin_vn_vendors') || '[]'),
      vn_bank_vendors: legacyData.vn_bank_vendors || JSON.parse(localStorage.getItem('ajin_vn_bank_vendors') || '[]'),
      notices: legacyData.notices || JSON.parse(localStorage.getItem('ajin_notices') || '[]'),
      updatedAt: legacyData.updatedAt || new Date().toISOString()
    };

    // 3. 로컬 스토리지 업데이트
    Object.keys(finalData).forEach(key => {
      if (key !== 'updatedAt') {
        localStorage.setItem(`ajin_${key}`, JSON.stringify((finalData as any)[key]));
      }
    });
    localStorage.setItem('ajin_last_local_update', finalData.updatedAt);

    console.log('[Cloud Sync] 데이터 지능적 병합 및 로컬 동기화 완료');
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