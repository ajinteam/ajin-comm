import React from 'react';
import { UserAccount, ViewState, OrderSubCategory } from '../types';

interface InjectionOrderViewProps {
  sub: OrderSubCategory;
  currentUser: UserAccount;
  userAccounts: UserAccount[];
  setView: (view: ViewState) => void;
  dataVersion: number;
}

const InjectionOrderView: React.FC<InjectionOrderViewProps> = ({ sub, currentUser, userAccounts, setView, dataVersion }) => {
  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Injection Order View - {sub}</h1>
      <p>Current User: {currentUser.initials}</p>
      <p>Data Version: {dataVersion}</p>
      {/* Add your Injection Order specific content here */}
    </div>
  );
};

export default InjectionOrderView;
