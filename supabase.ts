
import { createClient } from '@supabase/supabase-js';

const getEnvVar = (name: string): string => {
  try {
    // Vite 환경 (import.meta.env)
    if (typeof import.meta !== 'undefined' && (import.meta as any).env) {
      if ((import.meta as any).env[name]) return (import.meta as any).env[name];
    }
    // Node/Process 환경 (process.env)
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

// JANDI Webhook URLs
const JANDI_WEBHOOK_KR = getEnvVar('VITE_JANDI_WEBHOOK_KR') || getEnvVar('JANDI_WEBHOOK_KR');
const JANDI_WEBHOOK_VN = getEnvVar('VITE_JANDI_WEBHOOK_VN') || getEnvVar('JANDI_WEBHOOK_VN');

/**
 * 잔디 알림 전송 함수
 * @param target 'KR' (한국) 또는 'VN' (베트남)
 * @param type 'REQUEST' (결재요청) | 'COMPLETE' (결재완료) | 'REJECT' (반송)
 * @param title 문서 제목
 * @param recipient 이니셜 (다음 결재자 또는 작성자)
 */
export const sendJandiNotification = async (
  target: 'KR' | 'VN',
  type: 'REQUEST' | 'COMPLETE' | 'REJECT',
  title: string,
  recipient: string
) => {
  const webhookUrl = target === 'KR' ? JANDI_WEBHOOK_KR : JANDI_WEBHOOK_VN;
  
  if (!webhookUrl) {
    console.error(`[JANDI ERROR] Webhook URL for ${target} is not configured in environment variables.`);
    return;
  }

  let message = '';
  if (type === 'REQUEST') {
    message = `[${title}] / 다음 결재자: ${recipient} / 결재 요청드립니다.`;
  } else if (type === 'COMPLETE') {
    message = `[${title}] 결재 완료 / 작성자(${recipient}) 확인 부탁드립니다.`;
  } else if (type === 'REJECT') {
    message = `[${title}] 반송 처리됨 / 다음 확인자(작성자): ${recipient} / 사유 확인 후 수정 바랍니다.`;
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.tosslab.jandi-v2+json'
      },
      body: JSON.stringify({ body: message })
    });
    
    if (!response.ok) {
      throw new Error(`Jandi API responded with status ${response.status}`);
    }
    console.log(`[JANDI SUCCESS] Sent to ${target}: ${message}`);
  } catch (err) {
    console.error('[JANDI FETCH ERROR]', err);
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
        const { accounts, orders, invoices, purchase_orders, vietnam_orders, notices } = data.dataload;
        if (accounts) localStorage.setItem('ajin_accounts', JSON.stringify(accounts));
        if (orders) localStorage.setItem('ajin_orders', JSON.stringify(orders));
        if (invoices) localStorage.setItem('ajin_invoices', JSON.stringify(invoices));
        if (purchase_orders) localStorage.setItem('ajin_purchase_orders', JSON.stringify(purchase_orders));
        if (vietnam_orders) localStorage.setItem('ajin_vietnam_orders', JSON.stringify(vietnam_orders));
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
