import { createClient } from '@supabase/supabase-js';

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
 * 잔디 알림 전송 함수
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
    console.log(`[JANDI SUCCESS] API call finished: ${target}, ${type}`);
  } catch (err) {
    console.error('[JANDI API CALL ERROR]', err);
  }
};

let pushTimer: any = null;
let lastPushedData: string = ''; // 마지막으로 전송한 데이터의 해시/문자열 저장

export const pushStateToCloud = async () => {
  if (!supabase) return;
  if (pushTimer) clearTimeout(pushTimer);
  
  // 1. 저장 주기를 5초로 늘려 트래픽을 아낍니다.
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

      // 2. 데이터가 실제로 변경되었는지 확인 (동일한 데이터면 업로드 안 함)
      const currentDataStr = JSON.stringify(dataload);
      if (currentDataStr === lastPushedData) {
        console.log('[Cloud Sync] No changes detected. Skip push.');
        return;
      }

      const updatedAt = new Date().toISOString();
      const finalPayload = { ...dataload, updatedAt };

      const { error } = await supabase
        .from('ajin-comm-backup')
        .upsert({ id: 1, dataload: finalPayload }, { onConflict: 'id' });

      if (!error) {
        lastPushedData = currentDataStr; // 전송 성공 시 마지막 데이터 업데이트
        localStorage.setItem('ajin_last_local_update', updatedAt);
        console.log('[Cloud Sync] Push successful at', updatedAt);
      }
    } catch (err) {
      console.error('[Cloud Sync] Push error:', err);
    }
  }, 5000); // 5초 디바운스
};

export const pullStateFromCloud = async () => {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('ajin-comm-backup')
      .select('dataload')
      .eq('id', 1)
      .maybeSingle();

    if (error) return null;

    if (data && data.dataload) {
      const cloudUpdatedAt = data.dataload.updatedAt;
      const localUpdatedAt = localStorage.getItem('ajin_last_local_update') || '';

      if (!localUpdatedAt || cloudUpdatedAt > localUpdatedAt) {
        const { accounts, orders, invoices, purchase_orders, vietnam_orders, vn_vendors, vn_bank_vendors, notices } = data.dataload;
        
        if (accounts) localStorage.setItem('ajin_accounts', JSON.stringify(accounts));
        if (orders) localStorage.setItem('ajin_orders', JSON.stringify(orders));
        if (invoices) localStorage.setItem('ajin_invoices', JSON.stringify(invoices));
        if (purchase_orders) localStorage.setItem('ajin_purchase_orders', JSON.stringify(purchase_orders));
        if (vietnam_orders) localStorage.setItem('ajin_vietnam_orders', JSON.stringify(vietnam_orders));
        if (vn_vendors) localStorage.setItem('ajin_vn_vendors', JSON.stringify(vn_vendors));
        if (vn_bank_vendors) localStorage.setItem('ajin_vn_bank_vendors', JSON.stringify(vn_bank_vendors));
        if (notices) localStorage.setItem('ajin_notices', JSON.stringify(notices));
        
        localStorage.setItem('ajin_last_local_update', cloudUpdatedAt);
        
        // Pull 받은 데이터도 마지막 전송 데이터로 기록하여 중복 Push 방지
        const { updatedAt: _, ...pureData } = data.dataload;
        lastPushedData = JSON.stringify(pureData);
        
        return data.dataload;
      }
    }
  } catch (err) {
    console.error('[Cloud Sync] Pull error:', err);
  }
  return null;
};