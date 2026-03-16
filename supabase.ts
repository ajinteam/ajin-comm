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
    let cloudId = String(doc.id);

    if (tableName === 'injectionorder') {
      cloudId = doc.title || String(doc.id);
    } else if (tableName !== 'recipients') {
      const recipientName = doc.recipient || doc.clientName || doc.consigneeName || doc.title;
      if (recipientName) {
        cloudId = String(recipientName);
      }
    }

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
    
    // 로컬에서도 삭제
    const localAccounts = JSON.parse(localStorage.getItem('ajin_accounts') || '[]');
    const filtered = localAccounts.filter((a: any) => String(a.id) !== String(id));
    localStorage.setItem('ajin_accounts', JSON.stringify(filtered));

    console.log(`[Cloud Sync] Recipients 삭제 성공: ${id}`);
  } catch (err: any) {
    console.error(`[Cloud Sync Delete Error] Recipients:`, err.message || err);
  }
};

/**
 * 문서 삭제 (개별 테이블 및 로컬 스토리지 동시 삭제)
 */
export const deleteSingleDoc = async (tableName: string, id: string, doc?: any) => {
  if (!supabase) return;
  try {
    let cloudId = id;
    const localKeyMap: Record<string, string> = {
      'orders': 'ajin_orders',
      'invoices': 'ajin_invoices',
      'purchase_orders': 'ajin_purchase_orders',
      'vn_purchase_orders': 'ajin_vietnam_orders',
      'nationalinvoice': 'ajin_national_invoices',
      'injectionorder': 'ajin_injection_orders'
    };
    const localKey = localKeyMap[tableName];

    // 1. 클라우드용 ID 매칭 로직
    if (doc) {
      if (tableName === 'injectionorder') {
        cloudId = doc.title || id;
      } else if (tableName !== 'recipients') {
        cloudId = doc.recipient || doc.clientName || doc.consigneeName || doc.title || id;
      }
    } else if (localKey) {
      const localData = JSON.parse(localStorage.getItem(localKey) || '[]');
      const found = localData.find((d: any) => String(d.id) === String(id));
      if (found) {
        cloudId = (tableName === 'injectionorder') ? (found.title || id) : (found.recipient || found.clientName || found.consigneeName || found.title || id);
      }
    }

    // 2. Supabase에서 삭제
    const { error } = await supabase
      .from(tableName)
      .delete()
      .eq('id', String(cloudId));

    if (error) throw error;

    // 3. 로컬 스토리지에서도 즉시 삭제 (동기화 핵심)
    if (localKey) {
      const localData = JSON.parse(localStorage.getItem(localKey) || '[]');
      const filteredData = localData.filter((item: any) => String(item.id) !== String(id));
      localStorage.setItem(localKey, JSON.stringify(filteredData));
      console.log(`[Local Sync] ${localKey}에서 항목 제거 완료`);
    }

    console.log(`[Cloud Sync] ${tableName} 삭제 성공: ${cloudId}`);
  } catch (err: any) {
    console.error(`[Cloud Sync Delete Error] ${tableName}:`, err.message || err);
  }
};

/**
 * 클라우드 데이터와 로컬 데이터 병합
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

    const cloudAccounts = accountsRes.data?.map(item => ({
      id: item.id,
      loginId: item.name,
      initials: item.tel,
      allowedMenus: JSON.parse(item.remark || '[]'),
      createdAt: item.created_at || new Date().toISOString()
    })) || [];

    // 병합 로직: 클라우드 데이터를 우선으로 함
    const merge = (localKey: string, newList: any[] = []) => {
      const cloudItems = newList?.map((item: any) => item.content).filter(Boolean) || [];
      // 삭제 동기화를 위해 클라우드에 데이터가 있다면 클라우드를 마스터로 사용합니다.
      // 만약 오프라인 저장이 중요하다면 기존 combined 방식을 유지하되 delete 시 관리를 철저히 해야 합니다.
      return cloudItems; 
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

    Object.keys(finalData).forEach(key => {
      if (key !== 'updatedAt') {
        localStorage.setItem(`ajin_${key}`, JSON.stringify((finalData as any)[key]));
      }
    });
    localStorage.setItem('ajin_last_local_update', finalData.updatedAt);

    console.log('[Cloud Sync] 개별 테이블 기반 동기화 완료');
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
    const response = await fetch('/api/jandi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target, type, title, recipient, date })
    });
    if (!response.ok) throw new Error('Jandi API error');
  } catch (err) {
    console.error('[JANDI API CALL ERROR]', err);
  }
};

export const pushStateToCloud = async (immediate: boolean = false) => { return; };