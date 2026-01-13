
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { createClient } from '@supabase/supabase-js';

// 1. Supabase 연결 설정
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// 2. 백업 함수 정의 (데이터를 받아서 테이블에 넣음)
export const saveToSupabase = async (data: any) => {
  try {
    const { error } = await supabase
      .from('ajin-comm-backup')
      .insert([{ dataload: data }]); // 테이블의 dataload 칸에 저장
    
    if (error) throw error;
    console.log("백업 완료!");
  } catch (err) {
    console.error("백업 실패:", err);
  }
};

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
