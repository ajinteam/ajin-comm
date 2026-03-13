import { createClient } from '@supabase/supabase-js';

// 1. 환경 변수 설정
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

// 2. 트래픽 최적화용 디바운스 관리 객체
const debounceMap: Record<string, any> = {};

/**
 * 특정 문서 1건을 개별 테이블에 저장 (트래픽 최적화 버전)
 */
export const saveSingleDoc = async (tableName: string, doc: any, category?: string) => {
  if (!supabase) return;

  // 테이블명과 문서 ID를 조합해 고유 키 생성
  const debounceKey = `${tableName}_${doc.id}`;
  
  // 2초 이내에 동일한 문서 저장 요청이 오면 이전 대기열 취소
  if (debounceMap[debounceKey]) clearTimeout(debounceMap[debounceKey]);

  debounceMap[debounceKey] = setTimeout(async () => {
    try {
      let cloudId = String(doc.id);

      // ID 결정 로직 (기존 로직 유지)
      if (tableName === 'injectionorder') {
        cloudId = doc.title || String(doc.id);
      } else if (tableName !== 'recipients') {
        const recipientName = doc.recipient || doc.clientName || doc.consigneeName || doc.title;
        if (recipientName) cloudId = String(recipientName);
      }

      const payload: any = {
        id: cloudId,
        content: doc,
        status: doc.status || '결재대기',
        category: category || doc.type || doc.location || '일반'
      };

      const { error } = await supabase
        .from(tableName)
        .upsert(payload, { onConflict: 'id' });

      if (error) {
        // category 컬럼 누락 에러 처리
        if (error.message.includes('category')) {
          delete payload.category;
          const { error: retryError } = await supabase
            .from(tableName)
            .upsert(payload, { onConflict: 'id' });
          if (retryError) throw retryError;
        } else {
          throw error;
        }
      }
      console.log(`[Cloud Sync Success] ${tableName}: ${cloudId}`);
    } catch (err: any) {
      console.error(`[Cloud Sync Error] ${tableName}:`, err.message || err);
    }
  }, 2000); // 2초 디바운스 대기 시간
};

/**
 * 수신처/은행/계정 관리 저장
 */
export const saveRecipient = async (data: any) => {
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
    console.error(`[Cloud Sync Error] Recipients:`, err.message);
  }
};

/**
 * 데이터 삭제
 */
export const deleteSingleDoc = async (tableName: string, id: string, doc?: any) => {
  if (!supabase) return;
  try {
    let cloudId = id;
    // (삭제용 cloudId 유추 로직은 기존 코드와 동일하여 생략 가능하지만 유지하는 것이 안전합니다)
    const { error } = await supabase
      .from(tableName)
      .delete()
      .eq('id', String(cloudId));

    if (error) throw error;
    console.log(`[Cloud Sync] ${tableName} 삭제 성공: ${cloudId}`);
  } catch (err: any) {
    console.error(`[Cloud Sync Delete Error] ${tableName}:`, err.message);
  }
};

/**
 * 클라우드 데이터 가져오기 (Pull)
 */
export const pullStateFromCloud = async () => {
  if (!supabase) return null;
  try {
    // 필요한 데이터만 최소한으로 Select (id와 content 위주)
    const fetchTable = async (name: string) => {
      const { data, error } = await supabase.from(name).select('content');
      return error ? [] : (data || []);
    };

    const [orders, invoices, pOrders, vnOrders, nationalInvoices, injectionOrders, accountsRes] = await Promise.all([
      fetchTable('orders'),
      fetchTable('invoices'),
      fetchTable('purchase_orders'),
      fetchTable('vn_purchase_orders'),
      fetchTable('nationalinvoice'),
      fetchTable('injectionorder'),
      supabase.from('recipients').select('*').eq('category', 'ACCOUNT')
    ]);

    // 로컬 스토리지와 병합 로직 (Map 기반 중복 제거)
    const merge = (localKey: string, cloudList: any[]) => {
      const localData = JSON.parse(localStorage.getItem(`ajin_${localKey}`) || '[]');
      const cloudData = cloudList.map(i => i.content).filter(Boolean);
      const map = new Map();
      [...localData, ...cloudData].forEach(item => {
        if (item?.id) map.set(String(item.id), item);
      });
      return Array.from(map.values());
    };

    const finalData = {
      orders: merge('orders', orders),
      invoices: merge('invoices', invoices),
      purchase_orders: merge('purchase_orders', pOrders),
      vietnam_orders: merge('vietnam_orders', vnOrders),
      national_invoices: merge('national_invoices', nationalInvoices),
      injection_orders: merge('injection_orders', injectionOrders),
      accounts: accountsRes.data || [],
      updatedAt: new Date().toISOString()
    };

    // 로컬 스토리지 일괄 저장
    Object.entries(finalData).forEach(([key, val]) => {
      if (key !== 'updatedAt') localStorage.setItem(`ajin_${key}`, JSON.stringify(val));
    });
    
    return finalData;
  } catch (err) {
    console.error('[Cloud Sync Pull Error]', err);
    return null;
  }
};

/**
 * 잔디 알림
 */
export const sendJandiNotification = async (target: string, type: string, title: string, recipient: string, date: string) => {
  try {
    await fetch('/api/jandi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target, type, title, recipient, date })
    });
  } catch (err) {
    console.error('[JANDI ERROR]', err);
  }
};

/**
 * 전체 백업 기능 (트래픽 방지를 위해 사용 중단)
 */
export const pushStateToCloud = async () => { return; };