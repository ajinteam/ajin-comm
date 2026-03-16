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
 * 특정 문서 1건만 저장 (ID 고정 버전)
 */
export const saveSingleDoc = async (tableName: string, doc: any, category?: string) => {
  if (!supabase) return;
  try {
    // [핵심 수정] doc.id(UUID 또는 고유번호)를 최우선으로 사용합니다.
    // 제목이나 수신처 이름으로 ID를 생성하면 결재 시 데이터가 중복 생성될 수 있습니다.
    const cloudId = String(doc.id);

    const payload: any = {
      id: cloudId,
      content: doc,
      status: doc.status || '결재대기'
    };

    payload.category = category || doc.type || doc.location || '일반';

    const { error } = await supabase
      .from(tableName)
      .upsert(payload, { onConflict: 'id' });

    if (error) {
      const msg = error.message || '';
      // category 컬럼이 없는 테이블 대응
      if (msg.includes('column "category" of relation') || msg.includes('column "category" does not exist')) {
        delete payload.category;
        const { error: retryError } = await supabase
          .from(tableName)
          .upsert(payload, { onConflict: 'id' });
        
        if (retryError) throw retryError;
      } else {
        throw error;
      }
    }
    console.log(`[Cloud Sync] ${tableName} 저장 성공: ${cloudId}`);
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
    
    const localAccounts = JSON.parse(localStorage.getItem('ajin_accounts') || '[]');
    const filtered = localAccounts.filter((a: any) => String(a.id) !== String(id));
    localStorage.setItem('ajin_accounts', JSON.stringify(filtered));

  } catch (err: any) {
    console.error(`[Cloud Sync Delete Error] Recipients:`, err.message || err);
  }
};

/**
 * 문서 삭제 (ID 기반으로 정확히 삭제)
 */
export const deleteSingleDoc = async (tableName: string, id: string) => {
  if (!supabase) return;
  try {
    const localKeyMap: Record<string, string> = {
      'orders': 'ajin_orders',
      'invoices': 'ajin_invoices',
      'purchase_orders': 'ajin_purchase_orders',
      'vn_purchase_orders': 'ajin_vietnam_orders',
      'nationalinvoice': 'ajin_national_invoices',
      'injectionorder': 'ajin_injection_orders'
    };
    const localKey = localKeyMap[tableName];

    // 1. Supabase에서 삭제
    const { error } = await supabase
      .from(tableName)
      .delete()
      .eq('id', String(id));

    if (error) throw error;

    // 2. 로컬 스토리지에서도 즉시 삭제
    if (localKey) {
      const localData = JSON.parse(localStorage.getItem(localKey) || '[]');
      const filteredData = localData.filter((item: any) => String(item.id) !== String(id));
      localStorage.setItem(localKey, JSON.stringify(filteredData));
    }

    console.log(`[Cloud Sync] ${tableName} 삭제 완료: ${id}`);
  } catch (err: any) {
    console.error(`[Cloud Sync Delete Error] ${tableName}:`, err.message || err);
  }
};

/**
 * 클라우드 데이터와 로컬 데이터 병합 (클라우드 마스터 방식)
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

    const [
      ordersRes, invoicesRes, pOrdersRes, vnOrdersRes, 
      nationalInvoicesRes, injectionOrdersRes, nationalEntitiesRes, accountsRes
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

    // 계정 데이터 변환
    const cloudAccounts = accountsRes.data?.map(item => ({
      id: item.id,
      loginId: item.name,
      initials: item.tel,
      allowedMenus: JSON.parse(item.remark || '[]'),
      createdAt: item.created_at || new Date().toISOString()
    })) || [];

    // [중요] 클라우드 데이터를 절대적 기준으로 삼음 (로컬과 합치지 않음)
    const merge = (localKey: string, newList: any[] = []) => {
      return newList?.map((item: any) => item.content).filter(Boolean) || [];
    };

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

    // 로컬 스토리지 업데이트
    Object.keys(finalData).forEach(key => {
      if (key !== 'updatedAt') {
        localStorage.setItem(`ajin_${key}`, JSON.stringify((finalData as any)[key]));
      }
    });
    localStorage.setItem('ajin_last_local_update', finalData.updatedAt);

    console.log('[Cloud Sync] 동기화 완료 (Cloud Master)');
    return finalData;
  } catch (err) {
    console.error('[Cloud Sync] Pull error:', err);
    return null;
  }
};

export const sendJandiNotification = async (
  target: 'KR' | 'VN' | 'KR_PO',
  type: 'REQUEST' | 'COMPLETE' | 'REJECT',
  title: string,
  recipient: string,
  date: string
) => {
  try {
    await fetch('/api/jandi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target, type, title, recipient, date })
    });
  } catch (err) {
    console.error('[JANDI API CALL ERROR]', err);
  }
};

export const pushStateToCloud = async (immediate: boolean = false) => { return; };