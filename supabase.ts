
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const supabase = (supabaseUrl && supabaseAnonKey) 
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

/**
 * 모든 LocalStorage 데이터를 Supabase의 단일 로우(id: 1)에 통합 저장합니다.
 */
export const pushStateToCloud = async () => {
  if (!supabase) return;
  
  const dataload = {
    accounts: JSON.parse(localStorage.getItem('ajin_accounts') || '[]'),
    orders: JSON.parse(localStorage.getItem('ajin_orders') || '[]'),
    invoices: JSON.parse(localStorage.getItem('ajin_invoices') || '[]'),
    notices: JSON.parse(localStorage.getItem('ajin_notices') || '[]'),
    updatedAt: new Date().toISOString()
  };

  try {
    await supabase
      .from('ajin-comm-backup')
      .upsert([{ id: 1, dataload: dataload }], { onConflict: 'id' });
    console.log('Cloud backup synced.');
  } catch (err) {
    console.error('Cloud sync failed:', err);
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
