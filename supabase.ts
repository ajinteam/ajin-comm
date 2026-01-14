
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
 * LocalStorage의 데이터를 Supabase 클라우드에 백업합니다.
 */
export const pushStateToCloud = async () => {
  if (!supabase) return;
  
  if (pushTimer) clearTimeout(pushTimer);
  
  pushTimer = setTimeout(async () => {
    try {
      const updatedAt = new Date().toISOString();
      // 로컬 타임스탬프 기록
      localStorage.setItem('ajin_last_local_update', updatedAt);

      const dataload = {
        accounts: JSON.parse(localStorage.getItem('ajin_accounts') || '[]'),
        orders: JSON.parse(localStorage.getItem('ajin_orders') || '[]'),
        invoices: JSON.parse(localStorage.getItem('ajin_invoices') || '[]'),
        notices: JSON.parse(localStorage.getItem('ajin_notices') || '[]'),
        updatedAt: updatedAt
      };

      const { error } = await supabase
        .from('ajin-comm-backup')
        .upsert({ id: 1, dataload: dataload }, { onConflict: 'id' });

      if (error) {
        console.error('[Cloud Sync] Push failed:', error.message);
      } else {
        console.log('[Cloud Sync] Backup synced with timestamp:', updatedAt);
      }
    } catch (err) {
      console.error('[Cloud Sync] Push error:', err);
    }
  }, 800);
};

/**
 * 클라우드에서 데이터를 가져오되, 로컬보다 최신인 경우에만 갱신합니다.
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
      const cloudUpdatedAt = data.dataload.updatedAt;
      const localUpdatedAt = localStorage.getItem('ajin_last_local_update') || '';

      // 클라우드 데이터가 로컬보다 최신이거나 같은 경우에만 업데이트
      if (!localUpdatedAt || cloudUpdatedAt > localUpdatedAt) {
        const { accounts, orders, invoices, notices } = data.dataload;
        if (accounts) localStorage.setItem('ajin_accounts', JSON.stringify(accounts));
        if (orders) localStorage.setItem('ajin_orders', JSON.stringify(orders));
        if (invoices) localStorage.setItem('ajin_invoices', JSON.stringify(invoices));
        if (notices) localStorage.setItem('ajin_notices', JSON.stringify(notices));
        localStorage.setItem('ajin_last_local_update', cloudUpdatedAt);
        console.log('[Cloud Sync] Local updated with fresher cloud data:', cloudUpdatedAt);
        return data.dataload;
      } else {
        console.log('[Cloud Sync] Local data is already up-to-date or newer. Pull skipped.');
      }
    }
  } catch (err) {
    console.error('[Cloud Sync] Pull error:', err);
  }
  return null;
};
