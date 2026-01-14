
import { createClient } from '@supabase/supabase-js';

const getEnvVar = (name: string): string => {
  try {
    if (typeof import.meta !== 'undefined' && (import.meta as any).env) {
      return (import.meta as any).env[name] || '';
    }
    if (typeof process !== 'undefined' && process.env) {
      return process.env[name] || '';
    }
  } catch (e) {
    // ignore
  }
  return '';
};

const supabaseUrl = getEnvVar('SUPABASE_URL') || getEnvVar('VITE_SUPABASE_URL');
const supabaseAnonKey = getEnvVar('SUPABASE_ANON_KEY') || getEnvVar('VITE_SUPABASE_ANON_KEY');

export const supabase = (supabaseUrl && supabaseAnonKey) 
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

let pushTimer: any = null;

/**
 * LocalStorage의 모든 데이터를 Supabase 클라우드에 백업합니다.
 * 디바운스(800ms)를 적용하여 연속적인 데이터 변경 시 서버 부하를 최소화합니다.
 */
export const pushStateToCloud = async () => {
  if (!supabase) return;
  
  if (pushTimer) clearTimeout(pushTimer);
  
  pushTimer = setTimeout(async () => {
    try {
      const dataload = {
        accounts: JSON.parse(localStorage.getItem('ajin_accounts') || '[]'),
        orders: JSON.parse(localStorage.getItem('ajin_orders') || '[]'),
        invoices: JSON.parse(localStorage.getItem('ajin_invoices') || '[]'),
        notices: JSON.parse(localStorage.getItem('ajin_notices') || '[]'),
        updatedAt: new Date().toISOString()
      };

      const { error } = await supabase
        .from('ajin-comm-backup')
        .upsert({ id: 1, dataload: dataload }, { onConflict: 'id' });

      if (error) {
        console.error('[Cloud Sync] Push failed:', error.message);
      } else {
        console.log('[Cloud Sync] Backup successfully synced to Supabase.');
      }
    } catch (err) {
      console.error('[Cloud Sync] Push error:', err);
    }
  }, 800);
};

/**
 * 클라우드에서 최신 데이터를 가져와 로컬 저장소를 동기화합니다.
 */
export const pullStateFromCloud = async () => {
  if (!supabase) return null;
  
  try {
    const { data, error } = await supabase
      .from('ajin-comm-backup')
      .select('dataload')
      .eq('id', 1)
      .maybeSingle();

    if (error) {
      console.error('[Cloud Sync] Pull failed:', error.message);
      return null;
    }

    if (data && data.dataload) {
      const { accounts, orders, invoices, notices } = data.dataload;
      if (accounts) localStorage.setItem('ajin_accounts', JSON.stringify(accounts));
      if (orders) localStorage.setItem('ajin_orders', JSON.stringify(orders));
      if (invoices) localStorage.setItem('ajin_invoices', JSON.stringify(invoices));
      if (notices) localStorage.setItem('ajin_notices', JSON.stringify(notices));
      console.log('[Cloud Sync] Data successfully pulled from cloud.');
      return data.dataload;
    }
  } catch (err) {
    console.error('[Cloud Sync] Pull error:', err);
  }
  return null;
};
