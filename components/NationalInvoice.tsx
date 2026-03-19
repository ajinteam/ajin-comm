import React from 'react';
import { NationalInvoiceSubCategory, UserAccount, ViewState } from '../types';

interface NationalInvoiceProps {
  sub: NationalInvoiceSubCategory;
  editId?: string;
  currentUser: UserAccount;
  setView: (v: ViewState) => void;
  dataVersion: number;
}

const NationalInvoice: React.FC<NationalInvoiceProps> = () => {
  return (
    <div className="p-8 bg-white rounded-xl shadow-sm">
      <h2 className="text-xl font-bold mb-4">국내 송장 (National Invoice)</h2>
      <p className="text-slate-500">이 컴포넌트는 현재 복구 중입니다.</p>
    </div>
  );
};

export default NationalInvoice;
