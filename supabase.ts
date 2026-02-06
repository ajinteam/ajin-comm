
import { createClient } from '@supabase/supabase-js';

const getEnvVar = (name: string): string => {
  try {
    if (typeof import.meta !== 'undefined' && (import.meta as any).env) {
      return (import.meta as any).env[name] || '';
    }
    if (typeof process !== 'undefined' && process.env) {
      return process.env[name] || '';
    }
  } catch (e) {}
  return '';
};

const supabaseUrl = getEnvVar('SUPABASE_URL') || getEnvVar('VITE_SUPABASE_URL');
const supabaseAnonKey = getEnvVar('SUPABASE_ANON_KEY') || getEnvVar('VITE_SUPABASE_ANON_KEY');

export const supabase = (supabaseUrl && supabaseAnonKey) 
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

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