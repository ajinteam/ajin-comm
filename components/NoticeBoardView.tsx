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
      let readByArray: string[] = [];
      try {
        if (msg.read_by) {
          readByArray = typeof msg.read_by === 'string' ? JSON.parse(msg.read_by) : msg.read_by;
        }
      } catch (e) {
        readByArray = [];
      }

      if (!readByArray.includes(currentUser.loginId)) {
        readByArray.push(currentUser.loginId);
        updatedAny = true;

        // Perform quiet update
        await supabase
          .from('notice_board')
          .update({ read_by: readByArray })
          .eq('id', msg.id);
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

    try {
      let fileToSend: Blob | File = rawFile;
      let detectedType: 'pdf' | 'excel' | 'image' = 'image';

      if (forcedType) {
        detectedType = forcedType;
      } else {
        const fileExt = rawFile.name.split('.').pop()?.toLowerCase();
        if (fileExt === 'pdf') detectedType = 'pdf';
        else if (['xls', 'xlsx'].includes(fileExt || '')) detectedType = 'excel';
      }

      // Optimize/compress if it is an image
      if (detectedType === 'image') {
        setUploadProgress(30);
        fileToSend = await compressImage(rawFile);
      }

      setUploadProgress(50);
      const folder = detectedType === 'pdf' ? 'notice_pdf' : (detectedType === 'excel' ? 'notice_excel' : 'notice_image');
      const uniqueFileName = `${Date.now()}_${rawFile.name}`;
      const filePath = `${folder}/${uniqueFileName}`;

      let bucket = 'ajin-notice';
      
      const { data, error } = await supabase.storage
        .from(bucket)
        .upload(filePath, fileToSend, {
          cacheControl: '3600',
          upsert: false
        });

      if (error) {
        console.warn('ajin-notice upload error, trying ajin-nocice:', error.message);
        bucket = 'ajin-nocice';
        const { error: error2 } = await supabase.storage
          .from(bucket)
          .upload(filePath, fileToSend, {
            cacheControl: '3600',
            upsert: false
          });
          
        if (error2) {
          console.warn('ajin-nocice failed too, falling back to public image bucket');
          bucket = 'ajin-image';
          const { error: error3 } = await supabase.storage
            .from(bucket)
            .upload(filePath, fileToSend, {
              cacheControl: '3600',
              upsert: false
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
    } catch (err) {
      console.error('File sync upload failed:', err);
      alert('파일 업로드 중 오류가 발생했습니다.');
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

  // Paste handler for screenshot or captured image copy-paste directly
  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          e.preventDefault();
          const namedSnapshot = new File([file], `캡처_${new Date().toLocaleTimeString('ko-KR').replace(/ /g, '_')}.png`, { type: file.type });
          await handleUploadFile(namedSnapshot, 'image');
        }
      }
    }
  };

  // Submit Notice message
  const handleSendMessage = async () => {
    if (!inputText.trim() && attachedFiles.length === 0) return;
    if (!supabase) return;

    try {
      const readByList = [currentUser.loginId];
      const payload = {
        content: inputText.trim(),
        author: currentUser.initials,
        files: attachedFiles,
        read_by: readByList,
        created_at: new Date().toISOString()
      };

      // Query to check if insert with raw object succeeds, if database column is JSON or TEXT based
      const { error } = await supabase
        .from('notice_board')
        .insert([payload]);

      if (error) {
        // Retry logic with stringified objects just in case columns require serialization strings
        console.warn('Upserting raw payload failed, trying stringified column payload:', error.message);
        const fallbackPayload = {
          ...payload,
          files: JSON.stringify(attachedFiles),
          read_by: JSON.stringify(readByList)
        };
        const { error: error2 } = await supabase
          .from('notice_board')
          .insert([fallbackPayload]);
          
        if (error2) throw error2;
      }

      setInputText('');
      setAttachedFiles([]);
      fetchMessages();
    } catch (err) {
      console.error('Failed to post to notice board:', err);
      alert('오류가 발생하여 등록하지 못했습니다.');
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

              {items.map((msg) => {
                const unreadCount = getUnreadUserCount(msg);
                const fileList: FileAttachment[] = (() => {
                  try {
                    if (!msg.files) return [];
                    return typeof msg.files === 'string' ? JSON.parse(msg.files) : msg.files;
                  } catch (e) {
                    return [];
                  }
                })();

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
                            <div className="border-t border-slate-100 pt-2 flex flex-col gap-2">
                              {fileList.map((file, idx) => (
                                <div key={idx} className="flex items-center gap-2">
                                  {file.type === 'pdf' && (
                                    <a
                                      href={file.url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="flex items-center gap-2 px-3 py-2 bg-red-50 text-red-600 rounded-xl hover:bg-red-100 transition-colors border border-red-100/50 w-full"
                                    >
                                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                      </svg>
                                      <span className="text-xs font-bold truncate max-w-[180px]">{file.name}</span>
                                    </a>
                                  )}
                                  {file.type === 'excel' && (
                                    <a
                                      href={file.url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="flex items-center gap-2 px-3 py-2 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-100 transition-colors border border-emerald-100/50 w-full"
                                    >
                                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                      </svg>
                                      <span className="text-xs font-bold truncate max-w-[180px]">{file.name}</span>
                                    </a>
                                  )}
                                  {file.type === 'image' && (
                                    <div className="relative group/img cursor-zoom-in overflow-hidden rounded-xl border border-slate-100 max-w-[280px]">
                                      <img
                                        src={file.url}
                                        alt={file.name}
                                        onClick={() => setPreviewImage(file.url)}
                                        referrerPolicy="no-referrer"
                                        className="h-auto max-h-48 w-full object-cover rounded-xl hover:scale-105 transition-transform"
                                      />
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Unread Status & Timestamp */}
                        <div className="flex flex-col items-start gap-0.5 text-[9px] font-black text-slate-400 select-none shrink-0 pl-1 leading-none">
                          {unreadCount > 0 && (
                            <span className="text-blue-500 font-black mb-0.5">{unreadCount}</span>
                          )}
                          <span className="text-slate-400 font-bold">{formatTime(msg.created_at)}</span>
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
      <div className="p-4 border-t border-slate-100 flex flex-col gap-2 relative bg-white">
        <textarea
          value={inputText}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder="이곳에 공유할 공지나 메모 글을 남겨주세요. 클립보드 이미지 캡처 붙여넣기(Ctrl+V)도 가능합니다."
          className="w-full text-slate-700 min-h-[50px] max-h-[140px] p-3 text-sm rounded-2xl border border-slate-200 focus:outline-none focus:border-blue-500 bg-slate-50/50 resize-none custom-scrollbar"
        />

        <div className="flex items-center justify-between mt-1">
          {/* Attachment buttons row */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (fileInputRef.current) {
                  fileInputRef.current.accept = '.pdf,application/pdf';
                  fileInputRef.current.click();
                }
              }}
              title="PDF 파일 첨부"
              className="p-2 text-slate-400 hover:text-red-500 hover:bg-slate-50 rounded-xl transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
            </button>
            <button
              onClick={() => {
                if (fileInputRef.current) {
                  fileInputRef.current.accept = '.xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
                  fileInputRef.current.click();
                }
              }}
              title="엑셀 파일 첨부"
              className="p-2 text-slate-400 hover:text-emerald-500 hover:bg-slate-50 rounded-xl transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </button>
            <button
              onClick={() => {
                if (fileInputRef.current) {
                  fileInputRef.current.accept = 'image/*';
                  fileInputRef.current.click();
                }
              }}
              title="이미지 사진 첨부"
              className="p-2 text-slate-400 hover:text-blue-500 hover:bg-slate-50 rounded-xl transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleUploadFile(file);
              }}
              className="hidden"
            />
            <span className="text-[10px] text-slate-400 font-bold select-none">Shift + Enter 로 줄바꿈</span>
          </div>

          <button
            onClick={handleSendMessage}
            disabled={!inputText.trim() && attachedFiles.length === 0}
            className="bg-blue-600 text-white font-black text-xs px-5 py-2 rounded-2xl shadow-md cursor-pointer hover:bg-blue-700 hover:scale-105 active:scale-95 disabled:bg-slate-200 disabled:text-slate-400 disabled:scale-100 disabled:cursor-not-allowed transition-all"
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
