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

// 2. 트래픽 최적화용 관리 객체
const debounceMap: Record<string, any> = {};
let lastPullTime = 0;

/**
 * 특정 문서 1건을 개별 테이블에 저장 (트래픽 최적화: 3초 디바운스)
 */
export const saveSingleDoc = async (tableName: string, doc: any, category?: string) => {
  if (!supabase) return;

  const debounceKey = `${tableName}_${doc.id}`;
  if (debounceMap[debounceKey]) clearTimeout(debounceMap[debounceKey]);

  debounceMap[debounceKey] = setTimeout(async () => {
    try {
      let cloudId = String(doc.id);

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
        if (error.message.includes('category')) {
          delete payload.category;
          await supabase.from(tableName).upsert(payload, { onConflict: 'id' });
        } else throw error;
      }
      console.log(`[Cloud Sync Success] ${tableName}: ${cloudId}`);
    } catch (err: any) {
      console.error(`[Cloud Sync Error] ${tableName}:`, err.message);
    }
  }, 3000); 
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
export const deleteSingleDoc = async (tableName: string, id: string, _doc?: any) => {
  if (!supabase) return;
  try {
    const { error } = await supabase
      .from(tableName)
      .delete()
      .eq('id', String(id));

    if (error) throw error;
    console.log(`[Cloud Sync] ${tableName} 삭제 성공: ${id}`);
  } catch (err: any) {
    console.error(`[Cloud Sync Delete Error] ${tableName}:`, err.message);
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
    console.error(`[Cloud Sync Delete Error] Recipients:`, err.message);
  }
};

/**
 * 클라우드 데이터 가져오기 (Pull) - Supabase 데이터를 우선 표시 및 트래픽 최적화
 */
export const pullStateFromCloud = async () => {
  if (!supabase) return null;
  
  // 트래픽 최적화: 10초 이내 중복 요청 방지
  const now = Date.now();
  if (now - lastPullTime < 3000) return null;
  lastPullTime = now;

  try {
    const fetchTable = async (name: string) => {
      const { data, error } = await supabase.from(name).select('content');
      return error ? [] : (data || []);
    };

    const [orders, invoices, pOrders, vnOrders, nationalInvoices, injectionOrders, recipientsRes] = await Promise.all([
      fetchTable('orders'),
      fetchTable('invoices'),
      fetchTable('purchase_orders'),
      fetchTable('vn_purchase_orders'),
      fetchTable('nationalinvoice'),
      fetchTable('Injection_Order'),
      supabase.from('recipients').select('*')
    ]);

    // Supabase 데이터를 소스로 사용 (로컬 데이터와 병합하지 않고 클라우드 상태를 반영)
    const getCloudData = (cloudList: any[]) => cloudList.map(i => i.content).filter(Boolean);
    const recipients = recipientsRes.data || [];

    // 1. 계정 데이터 매핑
    const cloudAccounts = recipients.filter(r => r.category === 'ACCOUNT').map(item => ({
      id: item.id,
      loginId: item.name,
      initials: item.tel,
      allowedMenus: JSON.parse(item.remark || '[]'),
      createdAt: item.created_at || new Date().toISOString()
    }));

    // 2. 공지사항 데이터 매핑
    const cloudNotices = recipients.filter(r => r.category === 'NOTICE').map(item => ({
      id: item.id.replace('notice-', ''),
      content: item.remark,
      date: item.created_at ? new Date(item.created_at).toLocaleDateString('ko-KR').replace(/\.$/, '') : new Date().toLocaleDateString('ko-KR').replace(/\.$/, ''),
      isNew: false
    }));

    // 3. 국가별 인보이스 수신처 매핑
    const cloudNationalEntities = recipients.filter(r => r.category === 'NATIONAL_ENTITY').map(item => {
      const remarks = (item.remark || '').split(' | ');
      return {
        id: item.id,
        type: item.id.startsWith('shipper-') ? 'SHIPPER' : 'CONSIGNEE',
        name: item.name,
        content: remarks[0] || '',
        extra: remarks[1] || '',
        taxId: item.fax,
        tel: item.tel,
        attn: remarks[2]?.replace('Attn: ', '') || ''
      };
    });

    const finalData = {
      orders: getCloudData(orders),
      invoices: getCloudData(invoices),
      purchase_orders: getCloudData(pOrders),
      vietnam_orders: getCloudData(vnOrders),
      national_invoices: getCloudData(nationalInvoices),
      injection_orders: getCloudData(injectionOrders),
      accounts: cloudAccounts,
      notices: cloudNotices,
      national_entities: cloudNationalEntities,
      updatedAt: new Date().toISOString()
    };

    // 로컬 스토리지 업데이트 (클라우드 데이터로 덮어쓰기)
    Object.entries(finalData).forEach(([key, val]) => {
      if (key !== 'updatedAt') localStorage.setItem(`ajin_${key}`, JSON.stringify(val));
    });
    
    console.log('[Cloud Sync] Pull completed (Cloud data synced)');
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