
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
  if (!supabase) {
    console.error('Supabase client is not initialized. Check your Environment Variables.');
    return;
  }
  
  const dataload = {
    accounts: JSON.parse(localStorage.getItem('ajin_accounts') || '[]'),
    orders: JSON.parse(localStorage.getItem('ajin_orders') || '[]'),
    invoices: JSON.parse(localStorage.getItem('ajin_invoices') || '[]'),
    notices: JSON.parse(localStorage.getItem('ajin_notices') || '[]'),
    updatedAt: new Date().toISOString()
  };

  // 데이터가 제대로 구성되었는지 브라우저 콘솔에서 확인하기 위함입니다.
  console.log('Sending data to Supabase:', dataload);

  const { error } = await supabase
    .from('ajin-comm-backup')
    .upsert(
      { id: 1, dataload: dataload },
      { onConflict: 'id' }
    );

  if (error) {
    // 401, 403, 406 등의 에러 원인을 정확히 출력합니다.
    console.error('Cloud sync failed details:', error.message);
  } else {
    console.log('Cloud backup successfully synced.');
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
