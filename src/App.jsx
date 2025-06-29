import { useState, useRef, useEffect } from 'react';
import { EventSourcePolyfill } from 'event-source-polyfill';
import './App.css';

export default function App() {
  // ─── AI & 스트림 상태 ─────────────────────────────────
  const [prompt, setPrompt] = useState('아주 간단한 일본 소개 웹사이트 만들어주세요');
  const [htmlCode, setHtmlCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [charCount, setCharCount] = useState(0);
  const evtRef = useRef(null);

  // ─── 채팅 기록 상태 ────────────────────────────────────
  const [chatHistory, setChatHistory] = useState([]);
  const [currentRequest, setCurrentRequest] = useState('');
  const [isModifying, setIsModifying] = useState(false);
  const chatEndRef = useRef(null);

  // ─── 히스토리 관리 상태 ────────────────────────────────
  const [htmlHistory, setHtmlHistory] = useState([]); // 모든 HTML 버전 저장
  const [currentHistoryIndex, setCurrentHistoryIndex] = useState(-1); // 현재 보고 있는 버전
  const [previewIds, setPreviewIds] = useState([]); // 각 버전별 미리보기 ID

  // ─── 저장된 페이지 ID (미리보기 링크) ───────────────────
  const [previewId, setPreviewId] = useState('');

  // ─── 레이아웃 리사이저 상태 ────────────────────────────
  const [leftWidth, setLeftWidth] = useState(35); // %
  const containerRef = useRef(null);
  const isResizing = useRef(false);

  // ─── 테마 토글 상태 ─────────────────────────────────────
  const [theme, setTheme] = useState('dark');
  const toggleTheme = () =>
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));

  // ─── 깨진/무관한 이미지 자동 수정 함수 ─────────────────────────
  const fixBrokenImages = (html) => {
    // 모든 깨진 이미지 URL을 제거하거나 안정적인 대안으로 교체
    return html
      .replace(/https?:\/\/source\.unsplash\.com\/random\/(\d+)x(\d+)\/\?([^"'\s>]*)/g, 
        (match, width, height, query) => {
          // 관련 없는 랜덤 이미지는 제거
          return '';
        })
      .replace(/https?:\/\/source\.unsplash\.com\/(\d+)x(\d+)\/\?([^"'\s>]*)/g, 
        (match, width, height, query) => {
          return '';
        })
      .replace(/https?:\/\/source\.unsplash\.com\/random\/(\d+)x(\d+)/g, 
        (match, width, height) => {
          return '';
        })
      .replace(/https?:\/\/via\.placeholder\.com\/([^"'\s>]*)/g, 
        (match, params) => {
          // placeholder 이미지도 제거
          return '';
        })
      // 빈 img 태그들도 정리
      .replace(/<img[^>]*src=["'][\s]*["'][^>]*>/g, '')
      .replace(/<img[^>]*>/g, (match) => {
        // src가 비어있거나 무효한 img 태그 제거
        if (!match.includes('src=') || match.includes('src=""') || match.includes("src=''")) {
          return '';
        }
        return match;
      });
  };

  // ─── API_BASE (로컬 / 배포 분기) ───────────────────────
  const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000';

  // ─── 채팅 스크롤 자동 이동 ─────────────────────────────
  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [chatHistory]);

  // ─── 채팅 기록에 메시지 추가 ──────────────────────────
  const addToChatHistory = (type, content, timestamp = new Date(), htmlContent = null) => {
    const newMessage = { type, content, timestamp, htmlContent };
    setChatHistory(prev => [...prev, newMessage]);
    
    // HTML이 포함된 메시지인 경우 히스토리에 추가
    if (htmlContent) {
      setHtmlHistory(prev => {
        const newHistory = [...prev, htmlContent];
        const newIndex = newHistory.length - 1;
        setCurrentHistoryIndex(newIndex);
        return newHistory;
      });
    }
  };

  // ─── 히스토리 아이템 클릭 핸들러 ──────────────────────
  const handleHistoryClick = (messageIndex, htmlContent) => {
    if (htmlContent) {
      setHtmlCode(htmlContent);
      
      // 메시지 인덱스에서 HTML 히스토리 인덱스 찾기
      let htmlIndex = 0;
      for (let i = 0; i <= messageIndex; i++) {
        if (chatHistory[i] && chatHistory[i].htmlContent) {
          if (i === messageIndex) break;
          htmlIndex++;
        }
      }
      
      setCurrentHistoryIndex(htmlIndex);
      console.log('Selected history index:', htmlIndex, 'Total history:', htmlHistory.length);
    }
  };

  // ─── 현재 미리보기 ID 가져오기 ────────────────────────
  const getCurrentPreviewId = () => {
    console.log('Getting preview ID - Current index:', currentHistoryIndex, 'Available IDs:', previewIds.length);
    
    // 유효한 인덱스 범위 확인
    if (currentHistoryIndex >= 0 && currentHistoryIndex < previewIds.length) {
      const selectedId = previewIds[currentHistoryIndex];
      console.log('Selected preview ID:', selectedId);
      return selectedId;
    }
    
    // fallback: 가장 최근 ID 또는 기본 ID
    const fallbackId = previewIds.length > 0 ? previewIds[previewIds.length - 1] : previewId;
    console.log('Using fallback ID:', fallbackId);
    return fallbackId;
  };

  // ─── AI 페이지 생성/수정 핸들러 ───────────────────────
  const generateOrModifyPage = (isModification = false) => {
    const requestText = isModification ? currentRequest : prompt;
    if (!requestText.trim()) return;

    evtRef.current?.close();
    setCharCount(0);
    setIsLoading(true);
    setIsModifying(isModification);

    // 채팅 기록에 사용자 요청 추가
    addToChatHistory('user', requestText);

    // URL 파라미터로 전송 (GET 방식으로 단순화)
    const params = new URLSearchParams({
      message: requestText,
      isModification: isModification.toString(),
      currentHtml: isModification ? htmlCode : ''
    });

    const url = `${API_BASE}/api/stream?${params.toString()}`;
    console.log('Connecting to:', url);

    evtRef.current = new EventSourcePolyfill(url);

    let fullHtml = '';
    let updateTimer = null;
    let hasStartedReceiving = false;
    let lastUpdateTime = 0;
    
    // 더 부드러운 업데이트를 위한 함수
    const smoothUpdateHtml = () => {
      const now = Date.now();
      // 최소 300ms 간격으로 업데이트 (더 부드럽게)
      if (now - lastUpdateTime < 300) {
        if (updateTimer) clearTimeout(updateTimer);
        updateTimer = setTimeout(() => {
          const fixedHtml = fixBrokenImages(fullHtml);
          setHtmlCode(fixedHtml);
          lastUpdateTime = Date.now();
        }, 300);
      } else {
        const fixedHtml = fixBrokenImages(fullHtml);
        setHtmlCode(fixedHtml);
        lastUpdateTime = now;
      }
    };
    
    evtRef.current.onmessage = e => {
      console.log('Received:', e.data);
      
      // 스트림 끝
      if (e.data === '[DONE]') {
        evtRef.current.close();
        
        // 최종 HTML 설정 후 로딩 상태 해제 (이미지 수정 적용)
        const finalFixedHtml = fixBrokenImages(fullHtml);
        setHtmlCode(finalFixedHtml);
        
        // 부드러운 완료 전환
        setTimeout(() => {
          setIsLoading(false);
          setIsModifying(false);
        }, 200);
        
        // 채팅 기록에 AI 응답 추가 (수정된 HTML과 함께)
        addToChatHistory('assistant', '✅ 완료되었습니다!', new Date(), finalFixedHtml);
        
        // 현재 요청 입력창 초기화
        if (isModification) {
          setCurrentRequest('');
        }

        // HTML이 있을 때만 저장 (수정된 HTML 사용)
        if (finalFixedHtml.trim()) {
          fetch(`${API_BASE}/api/save`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              prompt: requestText, 
              html: finalFixedHtml,
              isModification,
              originalPrompt: isModification ? prompt : requestText
            })
          })
          .then(res => res.json())
          .then(data => {
            setPreviewId(data.id);
            // 새로운 미리보기 ID를 히스토리에 추가
            setPreviewIds(prev => {
              const newIds = [...prev, data.id];
              console.log('Added preview ID:', data.id, 'Total IDs:', newIds);
              return newIds;
            });
          })
          .catch(console.error);
        } else {
          console.warn('No HTML content to save');
        }
        return;
      }

      // 에러 메시지 처리
      try {
        const parsed = JSON.parse(e.data);
        if (parsed.error) {
          evtRef.current.close();
          setIsLoading(false);
          setIsModifying(false);
          addToChatHistory('error', `❌ 오류: ${parsed.error}`);
          return;
        }
      } catch (err) {
        // JSON이 아닌 경우 계속 진행
      }

      // 실제 메시지 조각 처리
      let chunk = e.data;
      let textPiece = '';

      // ping 메시지 무시
      if (chunk.includes('"type":"ping"')) {
        return;
      }

      try {
        const parsed = JSON.parse(chunk);
        textPiece = parsed.choices?.[0]?.delta?.content || '';
      } catch (err) {
        console.log('Parse error:', err, chunk);
        textPiece = '';
      }

      if (textPiece) {
        fullHtml += textPiece;
        setCharCount(prev => prev + textPiece.length);
        
        // 첫 번째 의미있는 HTML 태그가 완성될 때까지 기다림
        if (!hasStartedReceiving && fullHtml.includes('<')) {
          hasStartedReceiving = true;
          // 첫 렌더링은 약간 지연시켜 더 부드럽게
          setTimeout(() => {
            const fixedHtml = fixBrokenImages(fullHtml);
            setHtmlCode(fixedHtml);
            lastUpdateTime = Date.now();
          }, 100);
        } else if (hasStartedReceiving) {
          // 이후에는 부드러운 업데이트 사용
          smoothUpdateHtml();
        }
        
        console.log('Updated HTML length:', fullHtml.length);
      }
    };

    evtRef.current.onerror = (error) => {
      console.error('EventSource error:', error);
      evtRef.current.close();
      setIsLoading(false);
      setIsModifying(false);
      addToChatHistory('error', '❌ 연결 오류가 발생했습니다. 다시 시도해주세요.');
    };

    evtRef.current.onopen = () => {
      console.log('EventSource connected');
    };
  };

  // ─── 새 페이지 생성 핸들러 ────────────────────────────
  const generatePage = () => {
    generateOrModifyPage(false);
  };

  // ─── 페이지 수정 핸들러 ────────────────────────────────
  const modifyPage = () => {
    if (!htmlCode.trim()) {
      alert('수정할 페이지가 없습니다. 먼저 페이지를 생성해주세요.');
      return;
    }
    generateOrModifyPage(true);
  };

  // ─── 새로 시작하기 핸들러 ─────────────────────────────
  const startNew = () => {
    if (confirm('새로 시작하시겠습니까? 현재 작업 내용이 사라집니다.')) {
      setHtmlCode('');
      setChatHistory([]);
      setHtmlHistory([]);
      setCurrentHistoryIndex(-1);
      setPreviewIds([]);
      setPreviewId('');
      setPrompt('');
      setCurrentRequest('');
      evtRef.current?.close();
      setIsLoading(false);
      setIsModifying(false);
    }
  };

  // ─── 리사이저 이벤트 바인딩 ────────────────────────────
  useEffect(() => {
    const onMouseMove = e => {
      if (!isResizing.current) return;
      const { left, width } = containerRef.current.getBoundingClientRect();
      let pct = ((e.clientX - left) / width) * 100;
      pct = Math.max(20, Math.min(80, pct));
      setLeftWidth(pct);
    };
    const onMouseUp = () => {
      if (isResizing.current) {
        isResizing.current = false;
        document.body.style.cursor = '';
      }
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  const startResize = e => {
    e.preventDefault();
    isResizing.current = true;
    document.body.style.cursor = 'ew-resize';
  };

  // ─── 렌더 ───────────────────────────────────────────────
  return (
    <div ref={containerRef} className={`ai-builder-container ${theme}`}>
      {/* 테마 토글 */}
      <div className="theme-toggle">
        <input
          type="checkbox"
          id="themeSwitch"
          checked={theme === 'light'}
          onChange={toggleTheme}
        />
        <label htmlFor="themeSwitch" />
      </div>

      {/* 왼쪽 입력 패널 */}
      <div className="panel input-panel" style={{ width: `${leftWidth}%` }}>
        <div className="panel-header">
          <h1 className="title">AI Web Builder</h1>
          <button className="btn-new" onClick={startNew} disabled={isLoading}>
            새로 시작
          </button>
        </div>

        {/* 초기 프롬프트 (페이지가 없을 때만 표시) */}
        {!htmlCode && (
          <div className="initial-prompt-section">
            <textarea
              className="prompt-input"
              placeholder="예: HTML/CSS로 반응형 프로필 카드 만들어 줘"
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              disabled={isLoading}
            />
            <button
              className="btn-generate"
              onClick={generatePage}
              disabled={isLoading || !prompt.trim()}
            >
              {isLoading ? '생성 중...' : '웹페이지 생성'}
            </button>
          </div>
        )}

        {/* 채팅 기록 */}
        <div className="chat-history">
          {chatHistory.map((chat, messageIndex) => {
            // 현재 메시지가 몇 번째 HTML 히스토리인지 계산
            let htmlHistoryIndex = -1;
            if (chat.htmlContent) {
              htmlHistoryIndex = 0;
              for (let i = 0; i < messageIndex; i++) {
                if (chatHistory[i] && chatHistory[i].htmlContent) {
                  htmlHistoryIndex++;
                }
              }
            }
            
            const isCurrentlyViewing = chat.htmlContent && htmlHistoryIndex === currentHistoryIndex;
            
            return (
              <div 
                key={messageIndex} 
                className={`chat-message ${chat.type} ${chat.htmlContent ? 'clickable' : ''} ${isCurrentlyViewing ? 'currently-viewing' : ''}`}
                onClick={() => chat.htmlContent && handleHistoryClick(messageIndex, chat.htmlContent)}
              >
                <div className="chat-header">
                  <span className="chat-sender">
                    {chat.type === 'user' ? '👤 사용자' : 
                     chat.type === 'assistant' ? '🤖 AI' : '⚠️ 시스템'}
                  </span>
                  <span className="chat-time">
                    {chat.timestamp.toLocaleTimeString()}
                  </span>
                  {chat.htmlContent && (
                    <span className="history-indicator">
                      {isCurrentlyViewing ? '👁️ 현재 보기' : '🔍 클릭하여 보기'}
                    </span>
                  )}
                </div>
                <div className="chat-content">{chat.content}</div>
              </div>
            );
          })}
          <div ref={chatEndRef} />
        </div>

        {/* 수정 요청 입력 (페이지가 있을 때만 표시) */}
        {htmlCode && (
          <div className="modify-section">
            <textarea
              className="modify-input"
              placeholder="수정 요청을 입력하세요 (예: 배경색을 파란색으로 바꿔줘, 글씨 크기를 크게 해줘)"
              value={currentRequest}
              onChange={e => setCurrentRequest(e.target.value)}
              disabled={isLoading}
              rows={3}
            />
            <button
              className="btn-modify"
              onClick={modifyPage}
              disabled={isLoading || !currentRequest.trim()}
            >
              {isModifying ? '수정 중...' : '페이지 수정'}
            </button>
          </div>
        )}

        <div className="status">
          {isLoading
            ? `${isModifying ? '수정' : '생성'} 중… 받은 문자 수: ${charCount}`
            : htmlCode
              ? `✅ 완료! (${htmlCode.length} 문자)`
              : ''}
        </div>

        {/* 디버깅 정보 */}
        {htmlCode && (
          <div className="debug-info">
            <details>
              <summary>HTML 코드 미리보기 (클릭하여 펼치기)</summary>
              <pre style={{
                fontSize: '10px',
                maxHeight: '200px',
                overflow: 'auto',
                background: 'rgba(255,255,255,0.1)',
                padding: '8px',
                borderRadius: '4px',
                whiteSpace: 'pre-wrap'
              }}>
                {htmlCode.substring(0, 1000)}
                {htmlCode.length > 1000 ? '\n...(더 많은 내용)' : ''}
              </pre>
            </details>
            
            {/* 이미지 수정 버튼 */}
            {(htmlCode.includes('source.unsplash.com') || htmlCode.includes('via.placeholder.com') || htmlCode.includes('picsum.photos')) && (
              <button 
                className="btn-fix-images"
                onClick={() => {
                  const fixedHtml = fixBrokenImages(htmlCode);
                  setHtmlCode(fixedHtml);
                  addToChatHistory('assistant', '🗑️ 관련 없는 이미지를 제거하여 더 깔끔한 레이아웃으로 만들었습니다!', new Date(), fixedHtml);
                }}
                style={{
                  marginTop: '8px',
                  padding: '6px 12px',
                  fontSize: '12px',
                  background: '#ff6b6b',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                🗑️ 무관한 이미지 제거하기
              </button>
            )}
          </div>
        )}

        {/* 미리보기 링크 */}
        {getCurrentPreviewId() && (
          <div className="preview-link">
            👉&nbsp;
            <a
              href={`${API_BASE}/preview/${getCurrentPreviewId()}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              {(() => {
                const isLatest = currentHistoryIndex === htmlHistory.length - 1;
                if (isLatest || currentHistoryIndex < 0) {
                  return '최신 결과물 전체보기';
                } else {
                  return `이전 결과물 전체보기 (${currentHistoryIndex + 1}/${htmlHistory.length})`;
                }
              })()}
            </a>
          </div>
        )}
      </div>

      {/* 리사이저 바 */}
      <div className="resizer-bar" onMouseDown={startResize} />

      {/* 오른쪽 프리뷰 패널 */}
      <div className="panel preview-panel" style={{ width: `${100 - leftWidth}%` }}>
        {isLoading && !htmlCode && (
          <div className="spinner-overlay">
            <div className="spinner" />
            <div className="spinner-text">
              {isModifying ? '페이지를 수정하고 있습니다...' : '페이지를 생성하고 있습니다...'}
            </div>
          </div>
        )}
        {!htmlCode && !isLoading && (
          <div className="empty-preview">
            <div className="empty-preview-content">
              <h2>🎨 AI Web Builder</h2>
              <p>왼쪽에 원하는 웹사이트를 설명해주세요.</p>
              <p>AI가 실시간으로 HTML/CSS 코드를 생성합니다.</p>
            </div>
          </div>
        )}
        <iframe
          title="AI Preview"
          srcDoc={htmlCode || '<html><body style="margin:0;padding:20px;color:#666;text-align:center;"><h3>Loading...</h3></body></html>'}
          sandbox="allow-scripts allow-same-origin"
          style={{ 
            display: 'block',
            width: '100%',
            height: '100%',
            border: 'none',
            opacity: htmlCode ? 1 : 0.3,
            transition: 'opacity 0.4s ease-in-out'
          }}
        />
        {/* 생성 중일 때 진행률 표시 */}
        {isLoading && htmlCode && (
          <div className="generation-progress">
            <div className="progress-bar">
              <div className="progress-text">
                {isModifying ? '수정 중...' : '생성 중...'} ({charCount} 문자)
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}