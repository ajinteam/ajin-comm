
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
 * 잔디 알림 전송 함수 (프론트엔드 전용)
 * 직접 웹훅을 쏘지 않고, 서버 핸들러(/api/jandi)를 통해 전송하여 CORS를 우회합니다.
 * @param target 'KR' (한국) 또는 'VN' (베트남)
 * @param type 'REQUEST' (결재요청) | 'COMPLETE' (결재완료) | 'REJECT' (반송)
 * @param title 문서 제목
 * @param recipient 이니셜 (다음 결재자 또는 작성자)
 * @param date 문서 작성일자
 */
export const sendJandiNotification = async (
  target: 'KR' | 'VN',
  type: 'REQUEST' | 'COMPLETE' | 'REJECT',
  title: string,
  recipient: string,
  date: string
) => {
  try {
    // 본인의 서버 API 엔드포인트 호출
    const response = await fetch('/api/jandi', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ target, type, title, recipient, date })
    });
    
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || 'Unknown API error');
    }
    console.log(`[JANDI SUCCESS] API call finished: ${target}, ${type}`);
  } catch (err) {
    console.error('[JANDI API CALL ERROR]', err);
    // 개발 환경 편의를 위해 알림이 안 가더라도 시스템이 멈추지는 않게 처리
  }
};

let pushTimer: any = null;

export const pushStateToCloud = async () => {
  if (!supabase) return;
  if (pushTimer) clearTimeout(pushTimer);
  
  pushTimer = setTimeout(async () => {
    try {
      const updatedAt = new Date().toISOString();
      localStorage.setItem('ajin_last_local_update', updatedAt);

      const dataload = {
        accounts: JSON.parse(localStorage.getItem('ajin_accounts') || '[]'),
        orders: JSON.parse(localStorage.getItem('ajin_orders') || '[]'),
        invoices: JSON.parse(localStorage.getItem('ajin_invoices') || '[]'),
        purchase_orders: JSON.parse(localStorage.getItem('ajin_purchase_orders') || '[]'),
        vietnam_orders: JSON.parse(localStorage.getItem('ajin_vietnam_orders') || '[]'),
        vn_vendors: JSON.parse(localStorage.getItem('ajin_vn_vendors') || '[]'),
        vn_bank_vendors: JSON.parse(localStorage.getItem('ajin_vn_bank_vendors') || '[]'),
        notices: JSON.parse(localStorage.getItem('ajin_notices') || '[]'),
        updatedAt: updatedAt
      };

      await supabase
        .from('ajin-comm-backup')
        .upsert({ id: 1, dataload: dataload }, { onConflict: 'id' });
    } catch (err) {
      console.error('[Cloud Sync] Push error:', err);
    }
  }, 800);
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
        return data.dataload;
      }
    }
  } catch (err) {
    console.error('[Cloud Sync] Pull error:', err);
  }
  return null;
};
