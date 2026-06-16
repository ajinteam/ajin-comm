import { createClient } from '@supabase/supabase-js';

// 1. 환경 변수 설정
const getEnvVar = (name: string): string => {
  try {
    if (typeof import.meta !== 'undefined' && (import.meta as any).env) {
      if ((import.meta as any).env[name]) return (import.meta as any).env[name];
    }
    if (typeof process !== 'undefined' && process.env) {
      if (process.env[name]) return process.env[name] || '';
    }
  } catch (e) {}
  return '';
};

const supabaseUrl = getEnvVar('SUPABASE_URL') || getEnvVar('VITE_SUPABASE_URL');
const supabaseAnonKey = getEnvVar('SUPABASE_ANON_KEY') || getEnvVar('VITE_SUPABASE_ANON_KEY');

export const supabase = (supabaseUrl && supabaseAnonKey) 
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

/**
 * base64 Data URL을 Blob으로 변환
 */
export const base64ToBlob = (base64Str: string): Blob => {
  const parts = base64Str.split(';base64,');
  const contentType = parts[0].split(':')[1];
  const raw = window.atob(parts[1]);
  const rawLength = raw.length;
  const uInt8Array = new Uint8Array(rawLength);
  for (let i = 0; i < rawLength; ++i) {
    uInt8Array[i] = raw.charCodeAt(i);
  }
  return new Blob([uInt8Array], { type: contentType });
};

/**
 * 이미지를 Supabase Storage에 업로드하고 public URL 반환
 */
export const uploadImageToStorage = async (folder: 'vnorder' | 'shipment', base64Str: string): Promise<string> => {
  if (!supabase) {
    console.warn('[Supabase Storage] Supabase client is not initialized, falling back to base64');
    return base64Str;
  }
  // base64가 아니거나 이미 http URL인 경우 그대로 반환
  if (!base64Str.startsWith('data:image/')) {
    return base64Str;
  }

  try {
    const blob = base64ToBlob(base64Str);
    const fileExt = 'jpg';
    const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 10)}.${fileExt}`;
    const filePath = `${folder}/${fileName}`;

    const { data, error } = await supabase.storage
      .from('ajin-image')
      .upload(filePath, blob, {
        contentType: 'image/jpeg',
        cacheControl: '3600',
        upsert: false
      });

    if (error) {
      throw error;
    }

    const { data: { publicUrl } } = supabase.storage
      .from('ajin-image')
      .getPublicUrl(filePath);

    console.log(`[Supabase Storage] Uploaded successfully: ${publicUrl}`);
    return publicUrl;
  } catch (err: any) {
    console.error('[Supabase Storage Upload Error]', err);
    return base64Str; // 오류 발생 시 안전하게 기존 base64로 폴백
  }
};

/**
 * 기존에 저장된 base64 이미지들을 Supabase Storage로 자동으로 마이그레이션(업로드 및 데이터베이스 업데이트)합니다.
 */
export const migrateLegacyImagesToStorage = async (
  shippingReports: any[],
  vnOrders: any[]
) => {
  if (!supabase) return;

  let hasChanges = false;

  // 1. Shipment Report 이미지 마이그레이션
  for (const report of shippingReports) {
    if (!report.content || !Array.isArray(report.content.rows)) continue;
    let reportUpdated = false;
    const updatedRows = [...report.content.rows];

    for (let i = 0; i < updatedRows.length; i++) {
      const row = updatedRows[i];
      if (row.image && row.image.startsWith('data:image/')) {
        try {
          console.log(`[Migration] Migrating Shipment Image for report ${report.id}, row ${row.id}...`);
          const publicUrl = await uploadImageToStorage('shipment', row.image);
          if (publicUrl !== row.image) {
            updatedRows[i] = { ...row, image: publicUrl };
            reportUpdated = true;
          }
        } catch (err) {
          console.error(`[Migration Error] shipment row ${row.id}:`, err);
        }
      }
    }

    if (reportUpdated) {
      report.content.rows = updatedRows;
      const updatedDoc = { ...report.content };
      // 데이터베이스 및 로컬 스토리지 업데이트
      await saveSingleDoc('na_invoice_image', updatedDoc);
      hasChanges = true;
    }
  }

  // 2. VN주문서 이미지 마이그레이션
  for (const order of vnOrders) {
    if (!order.content || !Array.isArray(order.content.rows)) continue;
    let orderUpdated = false;
    const updatedRows = [...order.content.rows];

    for (let i = 0; i < updatedRows.length; i++) {
      const row = updatedRows[i];
      if (row.image && row.image.startsWith('data:image/')) {
        try {
          console.log(`[Migration] Migrating VN Order Image for order ${order.id}, row ${row.id}...`);
          const publicUrl = await uploadImageToStorage('vnorder', row.image);
          if (publicUrl !== row.image) {
            updatedRows[i] = { ...row, image: publicUrl };
            orderUpdated = true;
          }
        } catch (err) {
          console.error(`[Migration Error] vnorder row ${row.id}:`, err);
        }
      }
    }

    if (orderUpdated) {
      order.content.rows = updatedRows;
      const updatedDoc = { ...order.content };
      // 데이터베이스 및 로컬 스토리지 업데이트
      await saveSingleDoc('vn_purchase_orders', updatedDoc);
      hasChanges = true;
    }
  }

  if (hasChanges) {
    console.log('[Migration] All legacy images successfully migrated and updated!');
  }
};

// 2. 트래픽 최적화용 관리 객체
const debounceMap: Record<string, any> = {};
let lastPullTime = 0;

/**
 * 특정 문서 1건을 개별 테이블에 저장 (트래픽 최적화: 1초 디바운스)
 */
export const saveSingleDoc = async (tableName: string, doc: any, category?: string) => {
  if (!supabase) return;

  const debounceKey = `${tableName}_${doc.id}`;
  if (debounceMap[debounceKey]) clearTimeout(debounceMap[debounceKey]);

  debounceMap[debounceKey] = setTimeout(async () => {
    try {
      let cloudId = String(doc.id);

      const payload: any = {
        id: cloudId,
        content: doc,
        status: doc.status || '결재대기',
        category: category || doc.type || doc.location || '일반'
      };

      const { error } = await supabase
        .from(tableName)
        .upsert(payload, { onConflict: 'id' });

      if (error) {
        if (error.message.includes('category')) {
          delete payload.category;
          await supabase.from(tableName).upsert(payload, { onConflict: 'id' });
        } else throw error;
      }
      console.log(`[Cloud Sync Success] ${tableName}: ${cloudId}`);
    } catch (err: any) {
      console.error(`[Cloud Sync Error] ${tableName}:`, err.message);
    }
  }, 250); 
};

/**
 * 수신처/은행/계정 관리 저장
 */
export const saveRecipient = async (data: any) => {
  if (!supabase) return;
  try {
    const { error } = await supabase
      .from('recipients')
      .upsert({
        id: data.id,
        name: data.name,
        tel: data.tel || '',
        fax: data.fax || '',
        remark: data.remark || '',
        category: data.category
      }, { onConflict: 'id' });

    if (error) throw error;
    console.log(`[Cloud Sync] Recipients 저장 성공: ${data.name}`);
  } catch (err: any) {
    console.error(`[Cloud Sync Error] Recipients:`, err.message);
  }
};

/**
 * 데이터 삭제
 */
export const deleteSingleDoc = async (tableName: string, id: string, _doc?: any) => {
  if (!supabase) return;
  try {
    const { error } = await supabase
      .from(tableName)
      .delete()
      .eq('id', String(id));

    if (error) throw error;
    console.log(`[Cloud Sync] ${tableName} 삭제 성공: ${id}`);
  } catch (err: any) {
    console.error(`[Cloud Sync Delete Error] ${tableName}:`, err.message);
  }
};

/**
 * 수신처/계정 삭제
 */
export const deleteRecipient = async (id: string) => {
  if (!supabase) return;
  try {
    const { error } = await supabase
      .from('recipients')
      .delete()
      .eq('id', id);
    if (error) throw error;
    console.log(`[Cloud Sync] Recipients 삭제 성공: ${id}`);
  } catch (err: any) {
    console.error(`[Cloud Sync Delete Error] Recipients:`, err.message);
  }
};

/**
 * 클라우드 데이터 가져오기 (Pull) - Supabase 데이터를 우선 표시 및 트래픽 최적화
 */
export const pullStateFromCloud = async () => {
  if (!supabase) return null;
  
  // 트래픽 최적화: 250ms 이내 중복 요청 방지
  const now = Date.now();
  if (now - lastPullTime < 250) return null;
  lastPullTime = now;

  try {
    const fetchTable = async (name: string) => {
      const { data, error } = await supabase.from(name).select('content, status');
      return error ? [] : (data || []);
    };

    const [orders, invoices, pOrders, vnOrders, nationalInvoices, injectionOrders, injectionTakes, shippingReports, recipientsRes] = await Promise.all([
      fetchTable('orders'),
      fetchTable('invoices'),
      fetchTable('purchase_orders'),
      fetchTable('vn_purchase_orders'),
      fetchTable('nationalinvoice'),
      fetchTable('Injection_Order'),
      fetchTable('Injection_Take'),
      fetchTable('na_invoice_image'),
      supabase.from('recipients').select('*')
    ]);

    // Supabase 데이터를 소스로 사용 (로컬 데이터와 병합하지 않고 클라우드 상태를 반영)
    const getCloudData = (cloudList: any[]) => cloudList.map(i => {
      if (!i.content) return null;
      return {
        ...i.content,
        status: i.status || i.content.status // Use DB status as priority
      };
    }).filter(Boolean);
    const recipients = recipientsRes.data || [];

    const finalInjectionOrders = [...getCloudData(injectionOrders), ...getCloudData(injectionTakes)];

    // 1. 계정 데이터 매핑
    const cloudAccounts = recipients.filter(r => r.category === 'ACCOUNT').map(item => ({
      id: item.id,
      loginId: item.name,
      initials: item.tel,
      allowedMenus: JSON.parse(item.remark || '[]'),
      createdAt: item.created_at || new Date().toISOString()
    }));

    // 2. 공지사항 데이터 매핑
    const cloudNotices = recipients.filter(r => r.category === 'NOTICE').map(item => ({
      id: item.id.replace('notice-', ''),
      content: item.remark,
      date: item.created_at ? new Date(item.created_at).toLocaleDateString('ko-KR').replace(/\.$/, '') : new Date().toLocaleDateString('ko-KR').replace(/\.$/, ''),
      authorInitials: item.name !== 'NOTICE' ? item.name : undefined,
      isNew: false
    }));

    // 3. 국가별 인보이스 수신처 매핑
    const cloudNationalEntities = recipients.filter(r => r.category === 'NATIONAL_ENTITY').map(item => {
      const remarks = (item.remark || '').split(' | ');
      return {
        id: item.id,
        type: item.id.startsWith('shipper-') ? 'SHIPPER' : (item.id.startsWith('signature-') ? 'SIGNATURE' : 'CONSIGNEE'),
        name: item.name,
        content: remarks[0] || '',
        extra: remarks[1] || '',
        taxId: item.fax,
        tel: item.tel,
        attn: remarks[2]?.replace('Attn: ', '') || ''
      };
    });

    const cloudInjectionRecipients = recipients.filter(r => r.category === 'INJECTION_RECIPIENT').map(item => ({
      id: item.id,
      name: item.name,
      telFax: item.tel,
      reference: item.fax,
      remarks: item.remark
    }));

    const cloudInvoices = getCloudData(invoices);
    const editingInvoiceId = typeof window !== 'undefined' ? localStorage.getItem('ajin_editing_invoice_id') : null;
    let finalInvoices = cloudInvoices;
    if (editingInvoiceId) {
      const localInvoicesRaw = typeof window !== 'undefined' ? localStorage.getItem('ajin_invoices') : null;
      if (localInvoicesRaw) {
        try {
          const localInvoices = JSON.parse(localInvoicesRaw);
          const localEditingInvoice = localInvoices.find((inv: any) => String(inv.id) === String(editingInvoiceId));
          if (localEditingInvoice) {
            console.log(`[Cloud Sync] Preserving active editing invoice ${editingInvoiceId}`);
            finalInvoices = cloudInvoices.map((inv: any) => 
              String(inv.id) === String(editingInvoiceId) ? localEditingInvoice : inv
            );
            if (!finalInvoices.some((inv: any) => String(inv.id) === String(editingInvoiceId))) {
              finalInvoices.unshift(localEditingInvoice);
            }
          }
        } catch (e) {
          console.error('[Cloud Sync] Failed to merge active editing invoice', e);
        }
      }
    }

    const finalData = {
      orders: getCloudData(orders),
      invoices: finalInvoices,
      purchase_orders: getCloudData(pOrders),
      vietnam_orders: getCloudData(vnOrders),
      national_invoices: getCloudData(nationalInvoices),
      injection_orders: finalInjectionOrders,
      shipping_reports: getCloudData(shippingReports),
      accounts: cloudAccounts,
      notices: cloudNotices,
      national_entities: cloudNationalEntities,
      injection_recipients: cloudInjectionRecipients,
      updatedAt: new Date().toISOString()
    };

    // 로컬 스토리지 업데이트 (클라우드 데이터로 덮어쓰기)
    Object.entries(finalData).forEach(([key, val]) => {
      if (key !== 'updatedAt') localStorage.setItem(`ajin_${key}`, JSON.stringify(val));
    });
    
    // Background migration of legacy base64 images to Supabase Storage
    setTimeout(() => {
      migrateLegacyImagesToStorage(shippingReports, vnOrders).catch(err => {
        console.error('[Background Migration Error]', err);
      });
    }, 1500);

    console.log('[Cloud Sync] Pull completed (Cloud data synced)');
    return finalData;
  } catch (err) {
    console.error('[Cloud Sync Pull Error]', err);
    return null;
  }
};

/**
 * 실시간 동기화 (Realtime) 설정
 * 수정된 데이터만 수신하여 로컬 상태 업데이트
 */
export const subscribeToRealtime = (onUpdate: () => void) => {
  if (!supabase) return null;

  const channel = supabase
    .channel('erp-realtime-changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public' },
      async (payload) => {
        const { table, eventType, new: newRecord, old: oldRecord } = payload;
        console.log(`[Realtime Change] ${table} ${eventType}`, payload);

        try {
          // 1. 단순 테이블 처리 (orders, invoices, purchase_orders, vn_purchase_orders, nationalinvoice)
          const simpleTables: Record<string, string> = {
            'orders': 'ajin_orders',
            'invoices': 'ajin_invoices',
            'purchase_orders': 'ajin_purchase_orders',
            'vn_purchase_orders': 'ajin_vietnam_orders',
            'nationalinvoice': 'ajin_national_invoices',
            'na_invoice_image': 'ajin_shipping_reports'
          };

          if (simpleTables[table]) {
            const storageKey = simpleTables[table];
            let list = JSON.parse(localStorage.getItem(storageKey) || '[]');
            
            if (eventType === 'INSERT' || eventType === 'UPDATE') {
              const doc = (newRecord as any).content;
              const status = (newRecord as any).status;
              if (doc) {
                const updatedDoc = { ...doc, status: status || doc.status };
                const editingInvoiceId = localStorage.getItem('ajin_editing_invoice_id');
                if (storageKey === 'ajin_invoices' && editingInvoiceId && String(doc.id) === String(editingInvoiceId)) {
                  console.log(`[Realtime Sync] Skipping overwrite for active editing invoice ${doc.id}`);
                } else {
                  const index = list.findIndex((item: any) => item.id === doc.id);
                  if (index > -1) list[index] = updatedDoc;
                  else list.unshift(updatedDoc);
                }
              }
            } else if (eventType === 'DELETE') {
              const id = (oldRecord as any).id;
              list = list.filter((item: any) => String(item.id) !== String(id));
            }
            
            localStorage.setItem(storageKey, JSON.stringify(list));
          }

          // 2. 사출 관리 (Injection_Order, Injection_Take) - ajin_injection_orders로 통합 관리
          else if (table === 'Injection_Order' || table === 'Injection_Take') {
            let list = JSON.parse(localStorage.getItem('ajin_injection_orders') || '[]');
            
            if (eventType === 'INSERT' || eventType === 'UPDATE') {
              const doc = (newRecord as any).content;
              const status = (newRecord as any).status;
              if (doc) {
                const updatedDoc = { ...doc, status: status || doc.status };
                const index = list.findIndex((item: any) => item.id === doc.id);
                if (index > -1) list[index] = updatedDoc;
                else list.unshift(updatedDoc);
              }
            } else if (eventType === 'DELETE') {
              const id = (oldRecord as any).id;
              list = list.filter((item: any) => String(item.id) !== String(id));
            }
            
            localStorage.setItem('ajin_injection_orders', JSON.stringify(list));
          }

          // 3. Recipients 테이블 (Accounts, Notices, National Entities, Injection Recipients)
          else if (table === 'recipients') {
            if (eventType === 'INSERT' || eventType === 'UPDATE') {
              const item = newRecord as any;
              
              if (item.category === 'ACCOUNT') {
                let accounts = JSON.parse(localStorage.getItem('ajin_accounts') || '[]');
                const mapped = {
                  id: item.id,
                  loginId: item.name,
                  initials: item.tel,
                  allowedMenus: JSON.parse(item.remark || '[]'),
                  createdAt: item.created_at
                };
                const idx = accounts.findIndex((a: any) => a.id === mapped.id);
                if (idx > -1) accounts[idx] = mapped;
                else accounts.push(mapped);
                localStorage.setItem('ajin_accounts', JSON.stringify(accounts));
              } 
              else if (item.category === 'NOTICE') {
                let notices = JSON.parse(localStorage.getItem('ajin_notices') || '[]');
                const mapped = {
                  id: item.id.replace('notice-', ''),
                  content: item.remark,
                  date: new Date(item.created_at).toLocaleDateString('ko-KR').replace(/\.$/, ''),
                  authorInitials: item.name !== 'NOTICE' ? item.name : undefined,
                  isNew: true
                };
                const idx = notices.findIndex((n: any) => n.id === mapped.id);
                if (idx > -1) notices[idx] = mapped;
                else notices.unshift(mapped);
                localStorage.setItem('ajin_notices', JSON.stringify(notices));
              }
              else if (item.category === 'NATIONAL_ENTITY') {
                let entities = JSON.parse(localStorage.getItem('ajin_national_entities') || '[]');
                const remarks = (item.remark || '').split(' | ');
                const mapped = {
                  id: item.id,
                  type: item.id.startsWith('shipper-') ? 'SHIPPER' : (item.id.startsWith('signature-') ? 'SIGNATURE' : 'CONSIGNEE'),
                  name: item.name,
                  content: remarks[0] || '',
                  extra: remarks[1] || '',
                  taxId: item.fax,
                  tel: item.tel,
                  attn: remarks[2]?.replace('Attn: ', '') || ''
                };
                const idx = entities.findIndex((e: any) => e.id === mapped.id);
                if (idx > -1) entities[idx] = mapped;
                else entities.push(mapped);
                localStorage.setItem('ajin_national_entities', JSON.stringify(entities));
              }
              else if (item.category === 'INJECTION_RECIPIENT') {
                let recipients = JSON.parse(localStorage.getItem('ajin_injection_recipients') || '[]');
                const mapped = {
                  id: item.id,
                  name: item.name,
                  telFax: item.tel,
                  reference: item.fax,
                  remarks: item.remark
                };
                const idx = recipients.findIndex((r: any) => r.id === mapped.id);
                if (idx > -1) recipients[idx] = mapped;
                else recipients.push(mapped);
                localStorage.setItem('ajin_injection_recipients', JSON.stringify(recipients));
              }
            } else if (eventType === 'DELETE') {
              const id = (oldRecord as any).id;
              // Recipients는 ID 패턴으로 구분
              if (id.startsWith('notice-')) {
                let notices = JSON.parse(localStorage.getItem('ajin_notices') || '[]');
                notices = notices.filter((n: any) => n.id !== id.replace('notice-', ''));
                localStorage.setItem('ajin_notices', JSON.stringify(notices));
              } else {
                // 다른 카테고리들은 ID로 직접 필터링 (중복 가능성이 낮으므로 모든 리스트에서 제거 시도)
                ['ajin_accounts', 'ajin_national_entities', 'ajin_injection_recipients'].forEach(key => {
                  let list = JSON.parse(localStorage.getItem(key) || '[]');
                  list = list.filter((i: any) => i.id !== id);
                  localStorage.setItem(key, JSON.stringify(list));
                });
              }
            }
          }

          // UI 업데이트 알림
          onUpdate();
        } catch (err) {
          console.error('[Realtime Update Error]', err);
        }
      }
    )
    .subscribe();

  return channel;
};

/**
 * 잔디 알림
 */
export const sendJandiNotification = async (target: string, type: string, title: string, recipient: string, date: string) => {
  try {
    await fetch('/api/jandi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target, type, title, recipient, date })
    });
  } catch (err) {
    console.error('[JANDI ERROR]', err);
  }
};

/**
 * 전체 백업 기능 (트래픽 방지를 위해 사용 중단)
 */
export const pushStateToCloud = async () => { return; };