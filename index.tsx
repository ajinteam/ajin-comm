import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Supabase 라이브러리를 importmap을 통해 안전하게 불러옵니다.
import { createClient } from '@supabase/supabase-js';

// Vercel 설정값 불러오기
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// 클라이언트 생성
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// 백업 함수
export const saveToSupabase = async (data: any) => {
  try {
    const { error } = await supabase
      .from('ajin-comm-backup')
      .insert([{ dataload: data }]);
    
    if (error) throw error;
    console.log("백업 완료!");
  } catch (err) {
    console.error("백업 에러:", err);
  }
};

const rootElement = document.getElementById('root');
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
