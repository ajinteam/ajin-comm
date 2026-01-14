
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
  // 1. 클라이언트 초기화 확인
  if (!supabase) {
    console.error('Supabase 연결에 실패했습니다. 환경 변수(VITE_...)를 확인하세요.');
    return;
  }
  
  // 2. 저장할 데이터 구성
  const dataload = {
    accounts: JSON.parse(localStorage.getItem('ajin_accounts') || '[]'),
    orders: JSON.parse(localStorage.getItem('ajin_orders') || '[]'),
    invoices: JSON.parse(localStorage.getItem('ajin_invoices') || '[]'),
    notices: JSON.parse(localStorage.getItem('ajin_notices') || '[]'),
    updatedAt: new Date().toISOString()
  };

  console.log('데이터 전송 시도:', dataload);

  // 3. Supabase에 데이터 업서트(저장/수정)
  const { error } = await supabase
    .from('ajin-comm-backup')
    .upsert(
      { id: 1, dataload: dataload }, 
      { onConflict: 'id' }
    );

  // 4. 결과 확인 및 상세 에러 출력
  if (error) {
    console.error('클라우드 저장 실패 원인:', error.message); // 여기에 401, 403 등의 진짜 이유가 찍힙니다.
  } else {
    console.log('클라우드 동기화 성공!');
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
