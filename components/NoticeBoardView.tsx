import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabase';
import { UserAccount } from '../types';

interface FileAttachment {
  name: string;
  url: string;
  type: 'pdf' | 'excel' | 'image';
}

interface NoticeMessage {
  id: string;
  content: string;
  author: string; // initials or name
  files?: FileAttachment[] | string; // JSONB files array
  read_by?: string[] | string; // user loginId array
  created_at: string;
}

interface NoticeBoardViewProps {
  currentUser: UserAccount;
  dataVersion?: number;
}

export const NoticeBoardView: React.FC<NoticeBoardViewProps> = ({ currentUser }) => {
  const [messages, setMessages] = useState<NoticeMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [attachedFiles, setAttachedFiles] = useState<FileAttachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [userAccounts, setUserAccounts] = useState<UserAccount[]>([]);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messageEndRef = useRef<HTMLDivElement>(null);

  // Helper to extract fields cleanly regardless of standard schema or fallback-wrapped schema
  const parseNoticeMessage = (msg: NoticeMessage) => {
    let content = msg.content;
    let author = msg.author || '알수없음';
    let files: FileAttachment[] = [];
    let read_by: string[] = [];

    if (msg.content && msg.content.startsWith('{"__is_fallback_notice__":')) {
      try {
        const parsed = JSON.parse(msg.content);
        content = parsed.content || '';
        author = parsed.author || author;
        files = parsed.files || [];
        read_by = parsed.read_by || [];
      } catch (e) {
        // quiet fail
      }
    } else {
      try {
        if (msg.files) {
          files = typeof msg.files === 'string' ? JSON.parse(msg.files) : msg.files;
        }
      } catch (e) {}
      try {
        if (msg.read_by) {
          read_by = typeof msg.read_by === 'string' ? JSON.parse(msg.read_by) : msg.read_by;
        }
      } catch (e) {}
    }

    return {
      ...msg,
      content,
      author,
      files,
      read_by
    };
  };

  // Load user accounts for unread calculations (Total count)
  useEffect(() => {
    const saved = localStorage.getItem('ajin_accounts');
    if (saved) {
      try {
        setUserAccounts(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to parse user accounts', e);
      }
    }
  }, []);

  // Fetch all messages from Supabase notice_board
  const fetchMessages = async () => {
    if (!supabase) return;
    try {
      const { data, error } = await supabase
        .from('notice_board')
        .select('*')
        .order('created_at', { ascending: true });

      if (error) throw error;
      setMessages(data || []);

      // Automatically mark fetched messages as read by the current user
      if (data && data.length > 0) {
        await markMessagesAsRead(data);
      }
    } catch (err) {
      console.error('Error fetching notice board messages:', err);
    }
  };

  // Mark all fetched messages as read if current user hasn't read them yet
  const markMessagesAsRead = async (loadedMessages: NoticeMessage[]) => {
    if (!supabase) return;
    let updatedAny = false;

    for (const msg of loadedMessages) {
      const parsed = parseNoticeMessage(msg);
      const readByArray = [...parsed.read_by];

      if (!readByArray.includes(currentUser.loginId)) {
        readByArray.push(currentUser.loginId);
        updatedAny = true;

        if (msg.content && msg.content.startsWith('{"__is_fallback_notice__":')) {
          // Fallback structure update in content column
          try {
            const parsedObj = JSON.parse(msg.content);
            parsedObj.read_by = readByArray;
            await supabase
              .from('notice_board')
              .update({ content: JSON.stringify(parsedObj) })
              .eq('id', msg.id);
          } catch (e) {
            console.error('Failed to update fallback message read count:', e);
          }
        } else {
          // Standard columns update
          try {
            await supabase
              .from('notice_board')
              .update({ read_by: readByArray })
              .eq('id', msg.id);
          } catch (e) {
            // If fallback update fails because it was somehow treated standard, write it as standard exception ignore
          }
        }
      }
    }

    if (updatedAny) {
      // Quietly reload messages list without causing layout flicker
      const { data } = await supabase
        .from('notice_board')
        .select('*')
        .order('created_at', { ascending: true });
      if (data) setMessages(data);
    }
  };

  useEffect(() => {
    fetchMessages();

    if (!supabase) return;

    // Direct realtime updates for instant notification
    const channel = supabase
      .channel('notice_board_realtime_view')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notice_board' },
        () => {
          fetchMessages();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Auto-scroll to bottom of message logs
  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, attachedFiles]);

  // Image compressor helper for saving cloud storage footprint
  const compressImage = (file: File): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          
          const MAX_WIDTH = 1200;
          const MAX_HEIGHT = 1200;
          if (width > MAX_WIDTH || height > MAX_HEIGHT) {
            if (width > height) {
              height = Math.round((height * MAX_WIDTH) / width);
              width = MAX_WIDTH;
            } else {
              width = Math.round((width * MAX_HEIGHT) / height);
              height = MAX_HEIGHT;
            }
          }
          
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            canvas.toBlob(
              (blob) => {
                if (blob) resolve(blob);
                else resolve(file);
              },
              'image/jpeg',
              0.65 // Optimized size vs quality balance
            );
          } else {
            resolve(file);
          }
        };
        img.onerror = () => resolve(file);
      };
      reader.onerror = (err) => reject(err);
    });
  };

  // Upload attachment file handler
  const handleUploadFile = async (rawFile: File, forcedType?: 'pdf' | 'excel' | 'image') => {
    if (!supabase) return;
    setIsUploading(true);
    setUploadProgress(10);

    // Clean and sanitize filename to prevent any character-encoding errors or forbidden characters in Supabase Storage URLs
    const sanitizeFilename = (filename: string) => {
      const ext = filename.split('.').pop() || '';
      const base = filename.substring(0, filename.lastIndexOf('.')) || filename;
      // Allow only safe characters: alphabet, numbers, hangul, underscore, hyphen.
      const cleanBase = base.replace(/[^a-zA-Z0-9ㄱ-ㅎㅏ-ㅣ가-힣_\-]/g, '_');
      return `${cleanBase}.${ext}`;
    };

    try {
      let fileToSend: Blob | File = rawFile;
      let detectedType: 'pdf' | 'excel' | 'image' = 'image';

      if (forcedType) {
        detectedType = forcedType;
      } else {
        const fileExt = rawFile.name.split('.').pop()?.toLowerCase() || '';
        if (fileExt === 'pdf') {
          detectedType = 'pdf';
        } else if (['xls', 'xlsx', 'csv'].includes(fileExt)) {
          detectedType = 'excel';
        } else if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'heic'].includes(fileExt)) {
          detectedType = 'image';
        } else {
          // Fallback to pdf for other documents/archives so they render as files
          detectedType = 'pdf';
        }
      }

      // Optimize/compress if it is an image
      if (detectedType === 'image') {
        setUploadProgress(30);
        fileToSend = await compressImage(rawFile);
      }

      setUploadProgress(50);
      const folder = detectedType === 'pdf' ? 'notice_pdf' : (detectedType === 'excel' ? 'notice_excel' : 'notice_image');
      const sanitizedName = sanitizeFilename(rawFile.name);
      const uniqueFileName = `${Date.now()}_${sanitizedName}`;
      const filePath = `${folder}/${uniqueFileName}`;

      let bucket = 'ajin-notice';
      
      // Determine explicit Content-Type for the upload request
      const mimeType = fileToSend.type || rawFile.type || (detectedType === 'pdf' ? 'application/pdf' : (detectedType === 'excel' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/octet-stream'));

      const { data, error } = await supabase.storage
        .from(bucket)
        .upload(filePath, fileToSend, {
          cacheControl: '3600',
          upsert: false,
          contentType: mimeType
        });

      if (error) {
        console.warn('ajin-notice upload error, trying ajin-nocice:', error.message);
        bucket = 'ajin-nocice';
        const { error: error2 } = await supabase.storage
          .from(bucket)
          .upload(filePath, fileToSend, {
            cacheControl: '3600',
            upsert: false,
            contentType: mimeType
          });
          
        if (error2) {
          console.warn('ajin-nocice failed too, falling back to public image bucket');
          bucket = 'ajin-image';
          const { error: error3 } = await supabase.storage
            .from(bucket)
            .upload(filePath, fileToSend, {
              cacheControl: '3600',
              upsert: false,
              contentType: mimeType
            });
          if (error3) throw error3;
        }
      }

      setUploadProgress(80);
      const { data: { publicUrl } } = supabase.storage
        .from(bucket)
        .getPublicUrl(filePath);

      const newAttachment: FileAttachment = {
        name: rawFile.name,
        url: publicUrl,
        type: detectedType
      };

      setAttachedFiles(prev => [...prev, newAttachment]);
      setUploadProgress(100);
    } catch (err: any) {
      console.error('File sync upload failed:', err);
      alert(`[파일 업로드 실패]\n${err?.message || '업로드 중 오류가 발생했습니다. 파일 형식을 다시 확인해 주세요.'}`);
    } finally {
      setTimeout(() => {
        setIsUploading(false);
        setUploadProgress(0);
      }, 500);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value);
  };

  // Paste handler for screenshot or files copy-pasted directly from Clipboard (Ctrl+V)
  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    let fallbackAction = false;
    
    for (let i = 0; i < items.length; i++) {
      if (items[i].kind === 'file') {
        const file = items[i].getAsFile();
        if (file) {
          e.preventDefault();
          fallbackAction = true;
          
          // Generate a safe unique name for pasted clipboard capture (avoiding colons and spaces)
          if (file.type.indexOf('image') !== -1 && (file.name === 'image.png' || !file.name || file.name.includes('image'))) {
            const now = new Date();
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const date = String(now.getDate()).padStart(2, '0');
            const hours = String(now.getHours()).padStart(2, '0');
            const minutes = String(now.getMinutes()).padStart(2, '0');
            const seconds = String(now.getSeconds()).padStart(2, '0');
            
            const namedSnapshot = new File([file], `capture_${year}${month}${date}_${hours}${minutes}${seconds}.png`, { type: file.type || 'image/png' });
            await handleUploadFile(namedSnapshot, 'image');
          } else {
            // Document, PDF, or Excel pasted file
            await handleUploadFile(file);
          }
        }
      }
    }
  };

  // Submit Notice message
  const handleSendMessage = async () => {
    if (!inputText.trim() && attachedFiles.length === 0) return;
    if (!supabase) return;

    // Use a clean state backup to clear UI instantly for snappy feel
    const currentInput = inputText.trim();
    const currentAttached = [...attachedFiles];

    // Build standard payload
    const readByList = [currentUser.loginId];
    let payload: any = {
      content: currentInput,
      author: currentUser.initials,
      files: currentAttached,
      read_by: readByList,
      created_at: new Date().toISOString()
    };

    const tryInsert = async (currentPayload: any): Promise<{ success: boolean; error: any }> => {
      try {
        const { error } = await supabase
          .from('notice_board')
          .insert([currentPayload]);
        
        if (!error) return { success: true, error: null };
        return { success: false, error };
      } catch (err) {
        return { success: false, error: err };
      }
    };

    try {
      // 1. Try standard insert
      let result = await tryInsert(payload);
      
      // 2. If standard insert fails, attempt JSON stringification for array columns
      if (!result.success && result.error) {
        let errMessage = String(result.error.message || '').toLowerCase();
        
        if (errMessage.includes('invalid input syntax') || errMessage.includes('type') || errMessage.includes('json') || errMessage.includes('array')) {
          const stringifiedPayload = {
            ...payload,
            files: JSON.stringify(currentAttached),
            read_by: JSON.stringify(readByList)
          };
          result = await tryInsert(stringifiedPayload);
        }
      }

      // 3. Ultimate Fallback: If it still fails, it means some columns like 'author', 'files', 'read_by' don't exist in user's Supabase schema!
      // In this case, we serialize ALL metadata into the 'content' column so it's guaranteed to work on any schema with at least 'content' column!
      if (!result.success && result.error) {
        console.warn('Standard columns rejected by Supabase, attempting structural metadata fallback inside content field:', result.error);
        
        const fallbackValue = JSON.stringify({
          __is_fallback_notice__: true,
          content: currentInput,
          author: currentUser.initials,
          files: currentAttached,
          read_by: readByList
        });

        // 3a. Try with content and created_at
        const fallbackPayload = {
          content: fallbackValue,
          created_at: new Date().toISOString()
        };
        result = await tryInsert(fallbackPayload);

        // 3b. If 'created_at' column is also missing or errors, do the absolute bare minimum insertion: just 'content'
        if (!result.success) {
          console.warn('Even created_at column failed, inserting with ONLY content column specified:', result.error);
          result = await tryInsert({
            content: fallbackValue
          });
        }
      }

      if (!result.success) {
        throw result.error;
      }

      // Success cleanup
      setInputText('');
      setAttachedFiles([]);
      fetchMessages();
    } catch (err: any) {
      console.error('Failed to post to notice board:', err);
      const errorMsg = err?.message || '알 수 없는 DB 오류';
      const errorCode = err?.code ? `(오류 코드: ${err.code})` : '';
      const errorDetails = err?.details ? `\n상세 정보: ${err.details}` : '';
      
      let hint = '';
      if (errorMsg.includes('row-level security') || errorMsg.includes('policy') || err?.code === '42501') {
        hint = '\n\n💡 해결방법: Supabase 대시보드에서 notice_board 테이블의 RLS 정책을 추가하셔야 합니다. [INSERT] 권한 정책을 허용해주세요(anon 혹은 authenticated).';
      } else if (err?.code === '42P01') {
        hint = '\n\n💡 해결방법: notice_board 테이블이 public 스키마에 존재하지 않습니다. 테이블명이 정확한지 확인해주세요.';
      } else {
        hint = '\n\n💡 해결방법: 테이블에 content 컬럼이 정의되어 있는지, 데이터 형식이 올바른지 확인해주세요.';
      }

      alert(`[게시글 등록 실패]\n오류내용: ${errorMsg} ${errorCode}${errorDetails}${hint}`);
    }
  };

  const deleteAttachedFileFromStorage = async (url: string) => {
    if (!supabase) return;
    try {
      let bucketName = '';
      let filePath = '';

      const match = url.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/);
      if (match) {
        bucketName = match[1];
        filePath = match[2];
      } else {
        // Fallback: search for bucket names in URL
        const buckets = ['ajin-notice', 'ajin-nocice', 'ajin-image'];
        for (const b of buckets) {
          if (url.includes(`/${b}/`)) {
            bucketName = b;
            filePath = url.split(`/${b}/`)[1];
            break;
          }
        }
      }

      if (bucketName && filePath) {
        // Decode percent-encoded characters like %20 to raw unicode for Storage API
        const decodedFilePath = decodeURIComponent(filePath);
        console.log(`Deleting storage file from bucket: ${bucketName}, path: ${decodedFilePath}`);
        const { error } = await supabase.storage.from(bucketName).remove([decodedFilePath]);
        if (error) {
          console.error(`Failed to delete storage file ${decodedFilePath} from bucket ${bucketName}:`, error);
        } else {
          console.log(`Successfully deleted storage file ${decodedFilePath} from bucket ${bucketName}`);
        }
      }
    } catch (err) {
      console.error('Error during deleting file from storage:', err);
    }
  };

  const handleDeleteMessage = async (id: string, author: string, filesToClean?: FileAttachment[]) => {
    if (!window.confirm('이 게시글을 정말 삭제하시겠습니까?')) return;
    if (!supabase) return;
    try {
      // 1. Delete associated files from Supabase Storage first
      if (filesToClean && filesToClean.length > 0) {
        for (const file of filesToClean) {
          if (file.url) {
            await deleteAttachedFileFromStorage(file.url);
          }
        }
      }

      // 2. Delete Notice Message entry from table
      const { error } = await supabase
        .from('notice_board')
        .delete()
        .eq('id', id);

      if (error) throw error;
      fetchMessages();
    } catch (err: any) {
      console.error('Failed to delete message:', err);
      alert(`[게시글 삭제 실패]\n오류내용: ${err?.message || '알 수 없는 오류'}`);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Helper date formatter: "2026년 6월 19일 금요일"
  const formatDateHeader = (isoString: string) => {
    const date = new Date(isoString);
    const options: Intl.DateTimeFormatOptions = { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric', 
      weekday: 'long' 
    };
    return date.toLocaleDateString('ko-KR', options);
  };

  // Format message bubble time: "AM 9:21" or "PM 1:58"
  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    let hours = date.getHours();
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12; // hours '0' should be '12'
    return `${ampm} ${hours}:${minutes}`;
  };

  // Calculate remaining unread count for a message
  const getUnreadUserCount = (msg: NoticeMessage) => {
    let readByArray: string[] = [];
    try {
      if (msg.read_by) {
        readByArray = typeof msg.read_by === 'string' ? JSON.parse(msg.read_by) : msg.read_by;
      }
    } catch (e) {
      readByArray = [];
    }
    
    const totalCount = userAccounts.length > 0 ? userAccounts.length : 15;
    // Difference is unread count
    const remaining = totalCount - readByArray.length;
    return remaining > 0 ? remaining : 0;
  };

  // Group messages together by exact calendar days
  const groupMessagesByDay = () => {
    const groups: { [key: string]: NoticeMessage[] } = {};
    messages.forEach(msg => {
      const dayKey = formatDateHeader(msg.created_at);
      if (!groups[dayKey]) {
        groups[dayKey] = [];
      }
      groups[dayKey].push(msg);
    });
    return groups;
  };

  const messageGroups = groupMessagesByDay();

  return (
    <div id="notice-board-stage" className="flex flex-col h-[calc(100vh-120px)] bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
      {/* Search Header Accent */}
      <div className="bg-slate-50 border-b border-slate-100 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-500 rounded-2xl flex items-center justify-center text-white font-black shadow-lg shadow-blue-500/10">N</div>
          <div>
            <h1 className="text-sm font-black text-slate-800 tracking-tight uppercase">Notice Board & Issue Sync</h1>
            <p className="text-[10px] text-slate-400 font-bold tracking-widest uppercase">Ajin Communications ERP</p>
          </div>
        </div>
        <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-full border border-slate-100 shadow-sm text-xs text-slate-500 font-bold">
          <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-ping"></span>
          <span>공유 보드 가동 중</span>
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-8 bg-slate-50/40 custom-scrollbar">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-12">
            <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <h3 className="text-sm font-black text-slate-700">게시판에 등록된 메시지가 없습니다</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-xs">첫 글을 작성하거나 이미지를 붙여넣어 이슈 내용을 등록해 보세요.</p>
          </div>
        ) : (
          Object.entries(messageGroups).map(([dateStr, items]) => (
            <div key={dateStr} className="space-y-6">
              {/* Day Separation Indicator */}
              <div className="flex items-center justify-center my-6">
                <div className="h-[1px] bg-slate-200 flex-1"></div>
                <span className="bg-slate-100 text-slate-500 text-[11px] font-black px-4 py-1 rounded-full border border-slate-200/50 uppercase tracking-widest mx-4 shadow-sm">
                  {dateStr}
                </span>
                <div className="h-[1px] bg-slate-200 flex-1"></div>
              </div>

              {items.map((rawMsg) => {
                const msg = parseNoticeMessage(rawMsg);
                const unreadCount = getUnreadUserCount(msg);
                const fileList: FileAttachment[] = msg.files;

                return (
                  <div key={msg.id} className="group flex items-start gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    {/* User Circular Avatar Badge */}
                    <div className="w-10 h-10 rounded-full bg-slate-200 border border-slate-300 flex items-center justify-center text-slate-700 text-xs font-black shadow-inner uppercase shrink-0">
                      {msg.author.slice(0, 2)}
                    </div>

                    <div className="flex-1 flex flex-col gap-1.5 max-w-2xl">
                      {/* Writer Initials Label */}
                      <span className="text-xs font-bold text-slate-700 px-1">{msg.author}</span>

                      {/* Msg Wrap & Contents */}
                      <div className="flex items-end gap-2 group-hover:translate-x-0.5 transition-transform">
                        <div className="bg-slate-100 text-slate-800 text-sm py-3 px-4 rounded-3xl rounded-tl-sm border border-slate-200 bg-white shadow-sm flex flex-col gap-3 min-w-[120px] max-w-full">
                          {/* Inner Message Body text */}
                          {msg.content && (
                            <p className="whitespace-pre-wrap break-all leading-relaxed text-slate-700">{msg.content}</p>
                          )}

                          {/* Render Attached Files inside Message Bubble */}
                          {fileList.length > 0 && (
                            <div className="border-t border-slate-100 pt-2.5 flex flex-col gap-2.5 w-full">
                              {fileList.map((file, idx) => (
                                <div key={idx} className="w-full">
                                  {file.type === 'pdf' && (
                                    <a
                                      href={file.url}
                                      target="_blank"
                                      rel="noreferrer"
                                      download={file.name}
                                      className="flex flex-col p-3 bg-red-50 hover:bg-red-100/80 text-red-700 rounded-xl transition-all border border-red-100 w-full max-w-[340px]"
                                    >
                                      <div className="flex items-center gap-2.5">
                                        <div className="w-8 h-8 rounded-lg bg-red-500 flex items-center justify-center text-white shrink-0 font-black text-[10px] shadow-sm">PDF</div>
                                        <div className="flex-1 min-w-0">
                                          <p className="text-xs font-black truncate text-red-800 leading-tight">{file.name}</p>
                                          <p className="text-[10px] font-bold text-red-500 uppercase tracking-wider mt-0.5">문서 열기 • 다운로드</p>
                                        </div>
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4.5 w-4.5 text-red-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                        </svg>
                                      </div>
                                    </a>
                                  )}
                                  {file.type === 'excel' && (
                                    <a
                                      href={file.url}
                                      target="_blank"
                                      rel="noreferrer"
                                      download={file.name}
                                      className="flex flex-col p-3 bg-emerald-50 hover:bg-emerald-100/80 text-emerald-700 rounded-xl transition-all border border-emerald-100 w-full max-w-[340px]"
                                    >
                                      <div className="flex items-center gap-2.5">
                                        <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center text-white shrink-0 font-black text-[10px] shadow-sm font-mono">XLSX</div>
                                        <div className="flex-1 min-w-0">
                                          <p className="text-xs font-black truncate text-emerald-800 leading-tight">{file.name}</p>
                                          <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider mt-0.5">엑셀 시트 다운로드</p>
                                        </div>
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4.5 w-4.5 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                        </svg>
                                      </div>
                                    </a>
                                  )}
                                  {file.type === 'image' && (
                                    <div className="flex flex-col gap-1.5 mt-0.5 max-w-[280px] w-full">
                                      <div className="relative group/img cursor-zoom-in overflow-hidden rounded-xl border border-slate-200/60 shadow-sm">
                                        <img
                                          src={file.url}
                                          alt={file.name}
                                          onClick={() => setPreviewImage(file.url)}
                                          referrerPolicy="no-referrer"
                                          className="h-auto max-h-56 w-full object-cover hover:scale-105 transition-transform duration-300"
                                        />
                                        <div className="absolute inset-0 bg-black/45 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                                          <span className="bg-black/60 text-white text-[10px] font-black px-3 py-1 rounded-full backdrop-blur-sm tracking-wide uppercase">🔍 원본 크게보기</span>
                                        </div>
                                      </div>
                                      <a
                                        href={file.url}
                                        download={file.name}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-[10px] font-bold text-blue-500 hover:text-blue-600 hover:underline flex items-center gap-1 self-start px-0.5"
                                      >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                        </svg>
                                        <span>이미지 다운로드</span>
                                      </a>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Unread Status & Timestamp */}
                        <div className="flex flex-col items-start gap-1 text-[9px] font-black text-slate-400 select-none shrink-0 pl-1 leading-none">
                          {unreadCount > 0 && (
                            <span className="text-blue-500 font-black mb-0.5">{unreadCount}</span>
                          )}
                          <span className="text-slate-400 font-bold">{formatTime(msg.created_at)}</span>
                          {(msg.author === currentUser.initials || 
                            msg.author === currentUser.name || 
                            msg.author === currentUser.loginId || 
                            currentUser.loginId === 'master' || 
                            currentUser.role === 'admin') && (
                            <button
                              onClick={() => handleDeleteMessage(msg.id, msg.author, fileList)}
                              className="text-slate-400 hover:text-red-500 mt-1 cursor-pointer transition-all p-1 rounded-md hover:bg-slate-100 animate-in fade-in"
                              title="삭제하기"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))
        )}
        <div ref={messageEndRef} />
      </div>

      {/* Uploading Progress Accent panel overlay */}
      {isUploading && (
        <div className="bg-blue-600 text-white font-bold text-xs py-2 px-6 flex items-center justify-between animate-pulse">
          <div className="flex items-center gap-2">
            <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
            <span>미디어를 업로드하고 데이터 크기를 최적화하는 중...</span>
          </div>
          <span>{uploadProgress}%</span>
        </div>
      )}

      {/* Previewed attachment cards */}
      {attachedFiles.length > 0 && (
        <div className="bg-slate-100 border-t border-slate-200 px-6 py-3 flex flex-wrap gap-2">
          {attachedFiles.map((file, idx) => (
            <div key={idx} className="flex items-center gap-1.5 bg-white border border-slate-200 px-3 py-1.5 rounded-full shadow-sm text-xs">
              <span className={`w-2 h-2 rounded-full ${
                file.type === 'pdf' ? 'bg-red-500' : (file.type === 'excel' ? 'bg-emerald-500' : 'bg-blue-500')
              }`} />
              <span className="font-bold text-slate-700 truncate max-w-[150px]">{file.name}</span>
              <button
                onClick={() => setAttachedFiles(prev => prev.filter((_, i) => i !== idx))}
                className="text-slate-400 hover:text-red-500 ml-1.5 transition-colors font-black"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input Form Panel */}
      <div className="p-2.5 pb-3 border-t border-slate-100 flex flex-col gap-1.5 relative bg-white">
        <textarea
          value={inputText}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder="이곳에 공유할 공지나 메모 글을 남겨주세요. 클립보드 이미지 캡처 붙여넣기(Ctrl+V)도 가능합니다."
          className="w-full text-slate-700 min-h-[50px] max-h-[140px] p-3 text-sm rounded-2xl border border-slate-200 focus:outline-none focus:border-blue-500 bg-slate-50/50 resize-none custom-scrollbar"
        />

        <div className="flex flex-wrap items-center justify-between gap-3 mt-1">
          {/* Attachment buttons row */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => {
                if (fileInputRef.current) {
                  fileInputRef.current.removeAttribute('accept');
                  fileInputRef.current.click();
                }
              }}
              className="flex items-center gap-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 shadow-sm cursor-pointer hover:scale-105 active:scale-95 transition-all shrink-0"
              title="컴퓨터에서 파일(PDF, 엑셀, 사진) 선택하여 올리기"
            >
              <span>📎 첨부파일</span>
            </button>

            <span className="text-[10px] text-slate-400 font-bold select-none ml-2">Shift + Enter 로 줄바꿈</span>
            
            <input
              type="file"
              ref={fileInputRef}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  handleUploadFile(file);
                  e.target.value = ''; // Reset to allow re-upload of the same file
                }
              }}
              className="hidden"
            />
          </div>

          <button
            onClick={handleSendMessage}
            disabled={!inputText.trim() && attachedFiles.length === 0}
            className="bg-blue-600 text-white font-black text-xs px-5 py-2.5 rounded-xl shadow-md cursor-pointer hover:bg-blue-700 hover:scale-105 active:scale-95 disabled:bg-slate-200 disabled:text-slate-400 disabled:scale-100 disabled:cursor-not-allowed transition-all"
          >
            보내기
          </button>
        </div>
      </div>

      {/* Lightbox image zoom overlay modal */}
      {previewImage && (
        <div
          onClick={() => setPreviewImage(null)}
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200"
        >
          <img
            src={previewImage}
            alt="수신 고화질 사진 원본 자료"
            referrerPolicy="no-referrer"
            className="max-h-full max-w-full rounded-2xl shadow-2xl scale-95 hover:scale-100 transition-transform duration-300 pointer-events-auto"
          />
          <button
            onClick={() => setPreviewImage(null)}
            className="absolute top-6 right-6 text-white text-3xl font-black focus:outline-none"
          >
            &times;
          </button>
        </div>
      )}
    </div>
  );
};
