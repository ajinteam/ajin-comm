import { createClient } from '@supabase/supabase-js';

// 환경 변수 가져오기 로직
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
 * 특정 문서 1건만 개별 테이블에 저장하는 함수
 */
export const saveSingleDoc = async (tableName: string, doc: any, category?: string) => {
  if (!supabase) return;
  try {
    const payload: any = {
      id: String(doc.id),
      content: doc,
      status: doc.status || '결재대기'
    };

    payload.category = category || doc.type || doc.location || '일반';

    const { error } = await supabase
      .from(tableName)
      .upsert(payload, { onConflict: 'id' });

    if (error) {
      const msg = error.message || '';
      if (msg.includes('column "category" of relation') || msg.includes('column "category" does not exist')) {
        console.warn(`[Supabase] ${tableName} 테이블에 'category' 컬럼이 없어 제외하고 저장합니다.`);
        delete payload.category;
        const { error: retryError } = await supabase
          .from(tableName)
          .upsert(payload, { onConflict: 'id' });
        
        if (retryError) throw retryError;
      } else {
        throw error;
      }
    }
    console.log(`[Cloud Sync] ${tableName} 저장 성공: ${doc.id}`);
  } catch (err: any) {
    console.error(`[Cloud Sync Error] ${tableName}:`, err.message || err);
  }
};

/**
 * 수신처/은행/계정 관리 저장
 */
export const saveRecipient = async (data: {
  id: string;
  name: string;
  tel?: string;
  fax?: string;
  remark?: string;
  category: string;
}) => {
  if (!supabase) return;
  try {
    const { error } = await supabase
      .from('recipients')
      .upsert({
        id: data.id,
        name: data.name,
        tel: data.tel || '',
        fax: data.fax || '',
        remark: data.remark || '',
        category: data.category
      }, { onConflict: 'id' });

    if (error) throw error;
    console.log(`[Cloud Sync] Recipients 저장 성공: ${data.name}`);
  } catch (err: any) {
    console.error(`[Cloud Sync Error] Recipients:`, err.message || err);
  }
};

/**
 * 수신처/계정 삭제
 */
export const deleteRecipient = async (id: string) => {
  if (!supabase) return;
  try {
    const { error } = await supabase
      .from('recipients')
      .delete()
      .eq('id', id);
    if (error) throw error;
    console.log(`[Cloud Sync] Recipients 삭제 성공: ${id}`);
  } catch (err: any) {
    console.error(`[Cloud Sync Delete Error] Recipients:`, err.message || err);
  }
};

/**
 * 문서 삭제 (개별 테이블에서 삭제)
 */
export const deleteSingleDoc = async (tableName: string, id: string) => {
  if (!supabase) return;
  try {
    const { error } = await supabase
      .from(tableName)
      .delete()
      .eq('id', String(id));

    if (error) throw error;
    console.log(`[Cloud Sync] ${tableName} 삭제 성공: ${id}`);
  } catch (err: any) {
    console.error(`[Cloud Sync Delete Error] ${tableName}:`, err.message || err);
  }
};

/**
 * 클라우드 데이터와 로컬 데이터 병합 (계정 동기화 포함)
 */
export const pullStateFromCloud = async () => {
  if (!supabase) return null;
  try {
    const fetchTable = async (name: string) => {
      try {
        const { data, error } = await supabase.from(name).select('content');
        if (error) return [];
        return data || [];
      } catch (e) {
        return [];
      }
    };

    // 1. 모든 테이블 데이터 및 계정(recipients) 데이터를 가져옵니다.
    const [
      ordersRes, 
      invoicesRes, 
      pOrdersRes, 
      vnOrdersRes, 
      nationalInvoicesRes, 
      injectionOrdersRes, 
      nationalEntitiesRes,
      accountsRes
    ] = await Promise.all([
      fetchTable('orders'),
      fetchTable('invoices'),
      fetchTable('purchase_orders'),
      fetchTable('vn_purchase_orders'),
      fetchTable('nationalinvoice'),
      fetchTable('injectionorder'),
      fetchTable('national_entities'),
      supabase.from('recipients').select('*').eq('category', 'ACCOUNT')
    ]);

    // 2. 클라우드 계정 데이터를 앱 형식으로 변환
    const cloudAccounts = accountsRes.data?.map(item => ({
      id: item.id,
      loginId: item.name,
      initials: item.tel,
      allowedMenus: JSON.parse(item.remark || '[]'),
      createdAt: item.created_at || new Date().toISOString()
    })) || [];

    // 3. 병합 로직 (ID 기준 중복 제거)
    const merge = (localKey: string, newList: any[] = []) => {
      const localData = JSON.parse(localStorage.getItem(`ajin_${localKey}`) || '[]');
      const cloudItems = newList?.map((item: any) => item.content).filter(Boolean) || [];
      
      const combined = [...cloudItems, ...localData];
      const map = new Map();
      combined.forEach(item => {
        if (item && item.id) map.set(item.id, item);
      });
      return Array.from(map.values());
    };

    // 4. 최종 데이터 셋 (계정은 클라우드 우선)
    const finalData = {
      accounts: cloudAccounts.length > 0 ? cloudAccounts : JSON.parse(localStorage.getItem('ajin_accounts') || '[]'),
      orders: merge('orders', ordersRes),
      invoices: merge('invoices', invoicesRes),
      purchase_orders: merge('purchase_orders', pOrdersRes),
      vietnam_orders: merge('vietnam_orders', vnOrdersRes),
      national_invoices: merge('national_invoices', nationalInvoicesRes),
      national_entities: JSON.parse(localStorage.getItem('ajin_national_entities') || '[]'),
      injection_orders: merge('injection_orders', injectionOrdersRes),
      vn_vendors: JSON.parse(localStorage.getItem('ajin_vn_vendors') || '[]'),
      vn_bank_vendors: JSON.parse(localStorage.getItem('ajin_vn_bank_vendors') || '[]'),
      notices: JSON.parse(localStorage.getItem('ajin_notices') || '[]'),
      updatedAt: new Date().toISOString()
    };

    // 5. 로컬 스토리지에 결과 쓰기
    Object.keys(finalData).forEach(key => {
      if (key !== 'updatedAt') {
        localStorage.setItem(`ajin_${key}`, JSON.stringify((finalData as any)[key]));
      }
    });
    localStorage.setItem('ajin_last_local_update', finalData.updatedAt);

    console.log('[Cloud Sync] 계정 포함 개별 테이블 기반 동기화 완료');
    return finalData;
  } catch (err) {
    console.error('[Cloud Sync] Pull error:', err);
    return null;
  }
};

/**
 * 잔디 알림 전송
 */
export const sendJandiNotification = async (
  target: 'KR' | 'VN' | 'KR_PO',
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
    if (!response.ok) throw new Error('Jandi API error');
    console.log(`[JANDI SUCCESS] Notification sent`);
  } catch (err) {
    console.error('[JANDI API CALL ERROR]', err);
  }
};

/**
 * 전체 백업 기능 중단 (빈 함수 유지로 에러 방지)
 */
export const pushStateToCloud = async (immediate: boolean = false) => {
  return; 
};