
import React, { useState } from 'react';

interface AuthViewProps {
  onLogin: (id: string) => void;
}

const AuthView: React.FC<AuthViewProps> = ({ onLogin }) => {
  const [loginId, setLoginId] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (loginId.trim()) {
      onLogin(loginId.trim().toUpperCase());
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900">
      <div className="w-full max-w-md p-8 bg-white rounded-2xl shadow-2xl">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight mb-2">AJIN COMM.</h1>
          <p className="text-slate-500">통합 관리 시스템 로그인</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              로그인 번호 (영문혼합)
            </label>
            <input
              type="text"
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              placeholder="예: AJIN-A001"
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all font-mono"
              required
            />
          </div>

          <button
            type="submit"
            className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold text-lg hover:bg-slate-800 active:scale-[0.98] transition-all shadow-lg shadow-slate-200"
          >
            로그인
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-slate-100 text-center">
          <p className="text-xs text-slate-400">
            관리자에게 승인받은 로그인 번호를 입력해 주세요.
          </p>
        </div>
      </div>
    </div>
  );
};

export default AuthView;
