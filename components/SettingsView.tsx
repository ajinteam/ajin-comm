
import React, { useState } from 'react';
import { UserAccount, OrderSubCategory, InvoiceSubCategory, ViewState } from '../types';

interface SettingsViewProps {
  accounts: UserAccount[];
  onUpdate: (accounts: UserAccount[]) => void;
  setView: (v: ViewState) => void;
}

const SettingsView: React.FC<SettingsViewProps> = ({ accounts, onUpdate, setView }) => {
  const [newId, setNewId] = useState('');
  const [newInitials, setNewInitials] = useState('');
  const [selectedMenus, setSelectedMenus] = useState<string[]>([]);
  
  // Edit & Delete state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{loginId: string, initials: string, allowedMenus: string[]}>({
    loginId: '',
    initials: '',
    allowedMenus: []
  });

  const allMenus = [
    ...Object.values(OrderSubCategory),
    ...Object.values(InvoiceSubCategory)
  ];

  const handleToggleMenu = (menu: string, isEdit: boolean = false) => {
    if (isEdit) {
      setEditForm(prev => ({
        ...prev,
        allowedMenus: prev.allowedMenus.includes(menu) 
          ? prev.allowedMenus.filter(m => m !== menu) 
          : [...prev.allowedMenus, menu]
      }));
    } else {
      setSelectedMenus(prev => 
        prev.includes(menu) ? prev.filter(m => m !== menu) : [...prev, menu]
      );
    }
  };

  const handleAdd = () => {
    const trimmedId = newId.trim().toUpperCase();
    const trimmedInit = newInitials.trim().toUpperCase();
    
    if (!trimmedId || !trimmedInit) {
      alert('로그인 번호와 이니셜을 모두 입력해주세요.');
      return;
    }
    
    if (accounts.some(a => a.loginId === trimmedId)) {
      alert('이미 존재하는 번호입니다.');
      return;
    }

    const newAccount: UserAccount = {
      id: Math.random().toString(36).substr(2, 9),
      loginId: trimmedId,
      initials: trimmedInit,
      createdAt: new Date().toISOString(),
      allowedMenus: selectedMenus
    };

    onUpdate([...accounts, newAccount]);
    setNewId('');
    setNewInitials('');
    setSelectedMenus([]);
    alert('새 사용자가 등록되었습니다.');
  };

  const startEdit = (acc: UserAccount) => {
    if (acc.loginId === 'AJ5200') {
      alert('마스터 계정 정보는 보호를 위해 수정할 수 없습니다.');
      return;
    }
    setEditingId(acc.id);
    setConfirmingId(null);
    setEditForm({
      loginId: acc.loginId,
      initials: acc.initials,
      allowedMenus: acc.allowedMenus || []
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const saveEdit = (id: string) => {
    const trimmedId = editForm.loginId.trim().toUpperCase();
    const trimmedInit = editForm.initials.trim().toUpperCase();

    if (!trimmedId || !trimmedInit) {
      alert('모든 필드를 입력해주세요.');
      return;
    }

    const updated = accounts.map(a => 
      a.id === id ? { ...a, loginId: trimmedId, initials: trimmedInit, allowedMenus: editForm.allowedMenus } : a
    );

    onUpdate(updated);
    setEditingId(null);
    alert('사용자 정보가 수정되었습니다.');
  };

  const performDelete = (id: string, loginId: string) => {
    const filtered = accounts.filter(a => a.id !== id);
    onUpdate(filtered);
    setConfirmingId(null);
    alert(`${loginId} 사용자가 삭제되었습니다.`);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-12">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">시스템 설정</h2>
          <p className="text-slate-500 text-sm">사용자 및 권한 관리를 수행합니다.</p>
        </div>
        <button 
          onClick={() => setView({ type: 'DASHBOARD' })}
          className="flex items-center gap-2 px-5 py-2.5 bg-white border border-slate-300 rounded-xl text-slate-700 font-bold hover:bg-slate-50 shadow-sm transition-all active:scale-95"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          메인으로
        </button>
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-6 border-b border-slate-200 bg-slate-50">
          <h2 className="text-lg font-bold text-slate-900">새 사용자 등록</h2>
        </div>

        <div className="p-6">
          <div className="bg-blue-50 p-6 rounded-2xl border border-blue-100 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label className="block text-sm font-semibold text-blue-900 mb-2">로그인 번호</label>
                <input
                  type="text"
                  value={newId}
                  onChange={(e) => setNewId(e.target.value)}
                  placeholder="예: SALES-A01"
                  className="w-full px-4 py-3 rounded-xl border border-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-mono shadow-sm bg-white"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-blue-900 mb-2">이니셜 (Stamps)</label>
                <input
                  type="text"
                  value={newInitials}
                  onChange={(e) => setNewInitials(e.target.value)}
                  placeholder="예: J.DOE"
                  className="w-full px-4 py-3 rounded-xl border border-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-mono shadow-sm bg-white"
                />
              </div>
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={handleAdd}
                  disabled={!newId.trim() || !newInitials.trim()}
                  className="w-full px-8 py-3 bg-blue-600 text-white rounded-xl font-bold text-lg hover:bg-blue-700 transition-all disabled:opacity-50 shadow-lg shadow-blue-100"
                >
                  사용자 등록
                </button>
              </div>
            </div>

            <div>
              <p className="text-sm font-semibold text-blue-900 mb-3">접근 가능 메뉴 설정</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                {allMenus.map(menu => (
                  <label 
                    key={menu} 
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border cursor-pointer transition-all ${
                      selectedMenus.includes(menu) 
                        ? 'bg-blue-600 border-blue-600 text-white shadow-md scale-[1.02]' 
                        : 'bg-white border-slate-200 text-slate-600 hover:border-blue-300'
                    }`}
                  >
                    <input 
                      type="checkbox" 
                      className="hidden" 
                      checked={selectedMenus.includes(menu)}
                      onChange={() => handleToggleMenu(menu)}
                    />
                    <span className="text-xs font-bold">{menu}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-8 border-b border-slate-100">
          <h3 className="text-xl font-black text-slate-900">등록된 사용자 목록</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100">
                <th className="px-8 py-5 text-xs font-bold text-slate-400 uppercase tracking-widest">사용자 정보</th>
                <th className="px-8 py-5 text-xs font-bold text-slate-400 uppercase tracking-widest">메뉴 권한</th>
                <th className="px-8 py-5 text-xs font-bold text-slate-400 uppercase tracking-widest">등록일</th>
                <th className="px-8 py-5 text-xs font-bold text-slate-400 uppercase tracking-widest text-right">작업</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {accounts.map((acc) => {
                const isMaster = acc.loginId === 'AJ5200';
                const isEditing = editingId === acc.id;
                const isConfirming = confirmingId === acc.id;

                return (
                  <tr key={acc.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-8 py-6">
                      {isEditing ? (
                        <div className="space-y-2 max-w-[150px]">
                          <input 
                            className="w-full px-3 py-1.5 border rounded-lg text-sm font-bold" 
                            value={editForm.loginId} 
                            onChange={(e) => setEditForm({...editForm, loginId: e.target.value})}
                          />
                          <input 
                            className="w-full px-3 py-1.5 border rounded-lg text-sm font-bold text-blue-600" 
                            value={editForm.initials} 
                            onChange={(e) => setEditForm({...editForm, initials: e.target.value})}
                          />
                        </div>
                      ) : (
                        <div className="flex flex-col">
                          <span className="text-base font-black text-slate-900 tracking-tight">{acc.loginId}</span>
                          <span className="text-sm text-blue-600 font-bold">{acc.initials}</span>
                        </div>
                      )}
                    </td>
                    <td className="px-8 py-6">
                      {isMaster ? (
                        <span className="text-amber-600 font-bold italic text-sm tracking-tight">전체 권한 (SYSTEM MASTER)</span>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {(isEditing ? editForm.allowedMenus : (acc.allowedMenus || [])).map(m => (
                            <span key={m} className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-600 font-bold shadow-sm">
                              {m}
                            </span>
                          ))}
                          {isEditing && (
                            <div className="w-full mt-4 p-4 bg-white border border-dashed border-slate-200 rounded-xl grid grid-cols-2 gap-2">
                              {allMenus.map(m => (
                                <button
                                  type="button"
                                  key={m}
                                  onClick={() => handleToggleMenu(m, true)}
                                  className={`px-2 py-1 rounded text-[10px] font-bold border transition-all ${
                                    editForm.allowedMenus.includes(m)
                                      ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                                      : 'bg-white border-slate-200 text-slate-400 hover:border-blue-300'
                                  }`}
                                >
                                  {m}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-8 py-6 text-slate-500 font-medium text-sm tabular-nums">
                      {new Date(acc.createdAt).toLocaleDateString('ko-KR', { year: 'numeric', month: 'numeric', day: 'numeric' }).replace(/\.$/, '.')}
                    </td>
                    <td className="px-8 py-6 text-right">
                      {isMaster ? (
                        <span className="text-slate-400 text-sm font-medium">변경 불가</span>
                      ) : isEditing ? (
                        <div className="flex justify-end gap-4">
                          <button type="button" onClick={() => saveEdit(acc.id)} className="text-blue-600 font-black hover:underline text-sm">저장</button>
                          <button type="button" onClick={cancelEdit} className="text-slate-400 font-black hover:underline text-sm">취소</button>
                        </div>
                      ) : isConfirming ? (
                        <div className="flex justify-end gap-3 items-center">
                          <span className="text-[11px] text-red-600 font-bold animate-pulse">정말 삭제하시겠습니까?</span>
                          <button 
                            type="button"
                            onClick={() => performDelete(acc.id, acc.loginId)} 
                            className="px-3 py-1 bg-red-600 text-white rounded-lg text-[11px] font-black shadow-sm"
                          >
                            확인
                          </button>
                          <button 
                            type="button"
                            onClick={() => setConfirmingId(null)} 
                            className="text-slate-400 font-black text-[11px] hover:underline"
                          >
                            취소
                          </button>
                        </div>
                      ) : (
                        <div className="flex justify-end gap-6 items-center">
                          <button 
                            type="button"
                            onClick={() => startEdit(acc)} 
                            className="text-blue-600 font-black hover:underline text-sm"
                          >
                            수정
                          </button>
                          <button 
                            type="button"
                            onClick={() => { setConfirmingId(acc.id); setEditingId(null); }} 
                            className="text-red-500 font-black hover:underline text-sm"
                          >
                            삭제
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default SettingsView;
