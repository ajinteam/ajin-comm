
export enum MainCategory {
  ORDER = '주문서',
  INVOICE = '송장'
}

export enum OrderSubCategory {
  CREATE = '주문서작성',
  PENDING = '결재대기',
  REJECTED = '결재반송',
  APPROVED = '결재완료',
  APPROVED_SEOUL = '서울(완료)',
  APPROVED_DAECHEON = '대천(완료)',
  APPROVED_VIETNAM = '베트남(완료)'
}

export enum InvoiceSubCategory {
  CREATE = '송장작성',
  COMPLETED = '송장완료',
  SEOUL = '서울',
  DAECHEON = '대천',
  VIETNAM = '베트남'
}

export interface StampInfo {
  userId: string;
  timestamp: string;
}

export interface Announcement {
  id: string;
  content: string;
  date: string;
  isNew?: boolean;
}

export interface OrderRow {
  id: string;
  dept: string;
  model: string;
  itemName: string;
  price: string;
  unitPrice: string;
  remarks: string;
  isDeleted?: boolean;
  modLog?: {
    userId: string;
    timestamp: string;
    type: 'EDIT' | 'DELETE';
  };
}

export interface OrderItem {
  id: string;
  title: string;
  location: 'SEOUL' | 'DAECHEON' | 'VIETNAM';
  status: OrderSubCategory;
  authorId: string;
  date: string;
  rows: OrderRow[];
  stamps: {
    writer?: StampInfo;
    manager?: StampInfo;
    head?: StampInfo;
    director?: StampInfo;
    final?: StampInfo;
  };
  createdAt: string;
}

export interface InvoiceRow {
  id: string;
  model: string;
  drawingNo: string;
  itemName: string;
  qty: string;
  qtyExtra: string; // 수량 우측 좁은 칸
  completionExtra: string; // 완료여부 좌측 좁은 칸
  completionStatus: string; // 완료여부 우측 넓은 칸
  qtyConfirm?: StampInfo;
  remarks: string;
  isDeleted?: boolean;
  modLog?: {
    userId: string;
    timestamp: string;
    type: 'DELETE' | 'EDIT';
  };
}

export interface InvoiceItem {
  id: string;
  title: string; // 저장 시 첫 행 기종+품명으로 생성
  date: string;
  recipient: 'SEOUL' | 'DAECHEON' | 'VIETNAM';
  cargoInfo: string;
  rows: InvoiceRow[];
  weight: string;
  boxQty: string;
  authorId: string;
  createdAt: string;
  stamps?: {
    writer?: StampInfo;
    final?: StampInfo;
  };
}

export interface UserAccount {
  id: string;
  loginId: string;
  initials: string; 
  createdAt: string;
  allowedMenus?: string[];
}

export type ViewState = 
  | { type: 'DASHBOARD' }
  | { type: 'ORDER', sub: OrderSubCategory }
  | { type: 'INVOICE', sub: InvoiceSubCategory }
  | { type: 'SETTINGS' };
