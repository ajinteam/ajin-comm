import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// 수정된 부분: 라이브러리 이름 대신 ESM 주소를 직접 사용합니다.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1';

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
