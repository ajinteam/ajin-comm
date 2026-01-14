
import { createClient } from '@supabase/supabase-js';

// 다양한 환경(Vite, Node, Browser process.env)에서 변수를 안전하게 가져옵니다.
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

// 표준 Supabase 키 및 Vite 접두사가 붙은 키를 모두 확인합니다.
const supabaseUrl = getEnvVar('SUPABASE_URL') || getEnvVar('VITE_SUPABASE_URL');
const supabaseAnonKey = getEnvVar('SUPABASE_ANON_KEY') || getEnvVar('VITE_SUPABASE_ANON_KEY');

export const supabase = (supabaseUrl && supabaseAnonKey) 
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

/**
 * 모든 LocalStorage 데이터를 Supabase의 단일 로우(id: 1)에 통합 저장합니다.
 */
export const pushStateToCloud = async () => {
  if (!supabase) {
    console.warn('[Cloud Sync] Supabase client is not initialized. Sync skipped.');
    return;
  }
  
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
      .upsert(
        { id: 1, dataload: dataload },
        { onConflict: 'id' }
      );

    if (error) {
      console.error('[Cloud Sync] Push failed:', error.message, error.details);
    } else {
      console.log('[Cloud Sync] Backup successfully synced to Supabase.');
    }
  } catch (err) {
    console.error('[Cloud Sync] Push logic error:', err);
  }
};

/**
 * Supabase에서 최신 데이터를 가져와 LocalStorage를 업데이트합니다.
 */
export const pullStateFromCloud = async () => {
  if (!supabase) {
    console.warn('[Cloud Sync] Supabase client is not initialized. Pull skipped.');
    return null;
  }
  
  try {
    const { data, error } = await supabase
      .from('ajin-comm-backup')
      .select('dataload')
      .eq('id', 1)
      .maybeSingle(); // single() 대신 maybeSingle()로 데이터 없을 때 에러 방지

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
    console.error('[Cloud Sync] Pull logic error:', err);
  }
  return null;
};
