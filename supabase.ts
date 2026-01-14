
import { createClient } from '@supabase/supabase-js';

// Safe environment variable access to prevent "Cannot read properties of undefined"
const getEnvVar = (name: string): string => {
  try {
    // Check for Vite environment (import.meta.env)
    if (typeof import.meta !== 'undefined' && (import.meta as any).env) {
      return (import.meta as any).env[name] || '';
    }
    // Check for standard process.env (Node/Webpack/Common environment)
    if (typeof process !== 'undefined' && process.env) {
      return process.env[name] || '';
    }
  } catch (e) {
    // Silent fail if environment access is restricted
  }
  return '';
};

const supabaseUrl = getEnvVar('VITE_SUPABASE_URL');
const supabaseAnonKey = getEnvVar('VITE_SUPABASE_ANON_KEY');

export const supabase = (supabaseUrl && supabaseAnonKey) 
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

/**
 * 모든 LocalStorage 데이터를 Supabase의 단일 로우(id: 1)에 통합 저장합니다.
 */
export const pushStateToCloud = async () => {
  if (!supabase) {
    console.warn('Supabase client is not initialized. Skipping cloud sync.');
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
      console.error('Cloud sync failed:', error.message);
    } else {
      console.log('Cloud backup successfully synced.');
    }
  } catch (err) {
    console.error('Push error:', err);
  }
};

/**
 * Supabase에서 최신 데이터를 가져와 LocalStorage를 업데이트합니다.
 */
export const pullStateFromCloud = async () => {
  if (!supabase) return null;
  
  try {
    const { data, error } = await supabase
      .from('ajin-comm-backup')
      .select('dataload')
      .eq('id', 1)
      .single();

    if (data && data.dataload) {
      const { accounts, orders, invoices, notices } = data.dataload;
      if (accounts) localStorage.setItem('ajin_accounts', JSON.stringify(accounts));
      if (orders) localStorage.setItem('ajin_orders', JSON.stringify(orders));
      if (invoices) localStorage.setItem('ajin_invoices', JSON.stringify(invoices));
      if (notices) localStorage.setItem('ajin_notices', JSON.stringify(notices));
      return data.dataload;
    }
  } catch (err) {
    console.error('Cloud pull failed:', err);
  }
  return null;
};
