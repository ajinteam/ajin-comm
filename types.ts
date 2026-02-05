
export enum MainCategory {
  ORDER = '주문서',
  INVOICE = '송장',
  PURCHASE = '발주서',
  VIETNAM = 'VN베트남',
  STORAGE = '파일관리'
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
  TEMPORARY = '송장임시',
  COMPLETED = '송장완료',
  SEOUL = '서울',
  DAECHEON = '대천',
  VIETNAM = '베트남'
}

export enum PurchaseOrderSubCategory {
  CREATE = 'PO 발주서작성',
  PO1 = '사출발주서',
  PO1_TEMP = '사출발주서 임시저장',
  PO2 = '인쇄발주서',
  PO2_TEMP = '인쇄발주서 임시저장',
  PO3 = '메탈발주서',
  PO3_TEMP = '메탈발주서 임시저장',
  PENDING = 'PO 결재대기',
  REJECTED = 'PO 결재반송',
  APPROVED = 'PO 결재완료',
  ARCHIVE = '수신처별 보관함',
  UPLOAD = '파일 업로드'
}

export enum VietnamSubCategory {
  CREATE_ROOT = 'VN작성',
  ORDER = 'VN주문서',
  PAYMENT = 'VN지불요청서',
  TEMPORARY = 'VN임시저장',
  PENDING = 'VN결재대기',
  REJECTED = 'VN결재반송',
  COMPLETED_ROOT = 'VN결재완료',
  ORDER_COMPLETED = 'VN주문서완료',
  PAYMENT_COMPLETED = 'VN지불요청서완료'
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
  amount?: string;
  remarks: string;
  isDeleted?: boolean;
  changedFields?: string[];
  modLog?: {
    userId: string;
    timestamp: string;
    type: 'EDIT' | 'DELETE';
  };
  s?: string;
  cty?: string;
  material?: string;
  vendor?: string;
  injectionVendor?: string;
  orderQty?: string;
}

export interface VietnamOrderRow {
  id: string;
  itemName: string;
  image?: string; // base64
  unit: string;
  qty: string;
  unitPrice: string;
  amount: string;
  remarks: string;
  changedFields?: string[];
}

export interface VietnamOrderItem {
  id: string;
  title: string;
  type: 'ORDER' | 'PAYMENT';
  date: string;
  clientName: string;
  clientAddress: string;
  taxId: string;
  deliveryAddress: string;
  beneficiary?: string;
  accountNo?: string;
  bank?: string;
  bankAddr?: string;
  vatRate?: number;
  remark?: string;
  rows: VietnamOrderRow[];
  status: VietnamSubCategory;
  authorId: string;
  createdAt: string;
  rejectReason?: string;
  rejectLog?: StampInfo;
  merges?: Record<string, { rS: number, cS: number }>;
  aligns?: Record<string, 'left' | 'center' | 'right'>;
  borders?: Record<string, { t?: string, b?: string, l?: string, r?: string }>;
  weights?: Record<string, 'normal' | 'bold'>;
  stamps: {
    writer?: StampInfo;
    head?: StampInfo;
    ceo?: StampInfo;
    final?: StampInfo;
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
  rejectReason?: string;
  rejectLog?: StampInfo;
  stamps: {
    writer?: StampInfo;
    manager?: StampInfo;
    head?: StampInfo;
    director?: StampInfo;
    final?: StampInfo;
  };
  createdAt: string;
  merges?: Record<string, { rS: number, cS: number }>;
  aligns?: Record<string, 'left' | 'center' | 'right'>;
  borders?: Record<string, { t?: string, b?: string, l?: string, r?: string }>;
}

export interface PurchaseOrderNote {
  label: string;
  content: string;
}

export interface PurchaseOrderItem {
  id: string;
  code: string; 
  title: string;
  type: string; 
  recipient?: string; 
  telFax?: string; 
  reference?: string; 
  senderName?: string; 
  senderPerson?: string; 
  status: PurchaseOrderSubCategory;
  authorId: string;
  date: string;
  createdAt: string;
  rows: OrderRow[];
  notes?: PurchaseOrderNote[];
  rejectReason?: string; 
  rejectLog?: StampInfo; 
  fileUrl?: string; 
  headerRows?: string[];
  merges?: Record<string, { rS: number, cS: number }>;
  aligns?: Record<string, 'left' | 'center' | 'right'>;
  borders?: Record<string, { t?: string, b?: string, l?: string, r?: string }>;
  weights?: Record<string, 'normal' | 'bold'>;
  isResubmitted?: boolean;
  hideInjectionColumn?: boolean;
  rejectionSnapshot?: {
    title: string;
    recipient?: string;
    telFax?: string;
    reference?: string;
    senderName?: string;
    senderPerson?: string;
    date: string;
    rows: OrderRow[];
    notes?: PurchaseOrderNote[];
    headerRows?: string[];
  };
  stamps: {
    writer?: StampInfo;   
    design?: StampInfo;   
    director?: StampInfo; 
    ceo?: StampInfo;      
    final?: StampInfo;    
  };
}

export interface InvoiceRow {
  id: string;
  model: string;
  drawingNo: string;
  itemName: string;
  qty: string;
  qtyExtra: string; 
  completionExtra: string; 
  completionStatus: string; 
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
  title: string; 
  date: string;
  recipient: 'SEOUL' | 'DAECHEON' | 'VIETNAM';
  cargoInfo: string;
  rows: InvoiceRow[];
  weight: string;
  boxQty: string;
  authorId: string;
  createdAt: string;
  isTemporary?: boolean;
  merges?: Record<string, { rS: number, cS: number }>;
  aligns?: Record<string, 'left' | 'center' | 'right'>; 
  borders?: Record<string, { t?: string, b?: string, l?: string, r?: string }>;
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
  | { type: 'PURCHASE', sub: PurchaseOrderSubCategory }
  | { type: 'VIETNAM', sub: VietnamSubCategory }
  | { type: 'STORAGE' }
  | { type: 'SETTINGS' };
