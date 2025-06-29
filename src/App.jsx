// ai-builder-client/App.jsx

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

  // ─── 작업 상태 및 디버깅 ──────────────────────────────
  const [workStatus, setWorkStatus] = useState('대기 중');
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [lastActivity, setLastActivity] = useState(null);
  const [errorDetails, setErrorDetails] = useState(null);
  const [debugLogs, setDebugLogs] = useState([]);
  const [showDebugPanel, setShowDebugPanel] = useState(false);

  // ─── 계층적 생성 상태 ────────────────────────────────
  const [isHierarchicalGeneration, setIsHierarchicalGeneration] = useState(false);
  const [currentLayer, setCurrentLayer] = useState(0);
  const [totalLayers, setTotalLayers] = useState(0);
  const [layerProgress, setLayerProgress] = useState([]);
  const [hierarchicalPlan, setHierarchicalPlan] = useState(null);

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

  // ─── HTML 코드를 blob URL로 변환하는 함수 ──────────────
  const createBlobUrl = (htmlContent) => {
    try {
      const blob = new Blob([htmlContent], { type: 'text/html' });
      return URL.createObjectURL(blob);
    } catch (error) {
      console.error('Blob URL 생성 실패:', error);
      addDebugLog('error', 'Blob URL 생성 실패', error);
      return null;
    }
  };

  // ─── Blob URL 정리 함수 ─────────────────────────────────
  const [currentBlobUrl, setCurrentBlobUrl] = useState(null);
  
  const updateHtmlWithBlob = (htmlContent) => {
    // 이전 blob URL 정리
    if (currentBlobUrl) {
      URL.revokeObjectURL(currentBlobUrl);
    }
    
    // 새 blob URL 생성
    const newBlobUrl = createBlobUrl(htmlContent);
    if (newBlobUrl) {
      setCurrentBlobUrl(newBlobUrl);
      setHtmlCode(htmlContent);
      addDebugLog('success', 'Blob URL 업데이트', { 
        url: newBlobUrl.substring(0, 50) + '...', 
        length: htmlContent.length 
      });
    }
  };
  const addDebugLog = (type, message, data = null) => {
    const logEntry = {
      timestamp: new Date().toLocaleTimeString(),
      type, // 'info', 'success', 'warning', 'error'
      message,
      data
    };
    
    setDebugLogs(prev => {
      const newLogs = [...prev, logEntry];
      // 최대 50개 로그만 유지
      return newLogs.slice(-50);
    });
    
    console.log(`[${type.toUpperCase()}] ${message}`, data || '');
  };

  // ─── 작업 상태 업데이트 함수 ────────────────────────────
  const updateWorkStatus = (status, details = null) => {
    setWorkStatus(status);
    setLastActivity(new Date());
    addDebugLog('info', `작업 상태 변경: ${status}`, details);
  };

  // ─── 연결 상태 업데이트 함수 ────────────────────────────
  const updateConnectionStatus = (status) => {
    setConnectionStatus(status);
    addDebugLog('info', `연결 상태: ${status}`);
  };
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

  // ─── 특정 메시지의 요청 컨텍스트 찾기 ─────────────────────────
  const findRequestContext = (messageIndex) => {
    console.log('Finding request context for message index:', messageIndex);
    
    // 해당 메시지가 HTML을 포함하는지 확인
    const targetMessage = chatHistory[messageIndex];
    if (!targetMessage || !targetMessage.htmlContent) {
      console.warn('Target message does not contain HTML content');
      return null;
    }

    // 해당 HTML을 생성한 직전 사용자 메시지 찾기
    let userPrompt = '';
    let previousHtml = '';
    let isModification = false;

    for (let i = messageIndex - 1; i >= 0; i--) {
      if (chatHistory[i].type === 'user') {
        userPrompt = chatHistory[i].content;
        
        // 수정 요청인지 확인 (🔄로 시작하지 않는 경우만)
        if (!userPrompt.startsWith('🔄')) {
          // 이 사용자 요청 이전에 HTML이 있었는지 확인
          for (let j = i - 1; j >= 0; j--) {
            if (chatHistory[j].type === 'assistant' && chatHistory[j].htmlContent) {
              previousHtml = chatHistory[j].htmlContent;
              isModification = true;
              break;
            }
          }
        }
        break;
      }
    }

    console.log('Found context:', { userPrompt, isModification, hasPreviousHtml: !!previousHtml });
    
    return userPrompt ? {
      prompt: userPrompt,
      isModification,
      previousHtml
    } : null;
  };

  // ─── 특정 메시지 다시 생성 핸들러 ─────────────────────────
  const regenerateSpecificMessage = (messageIndex) => {
    console.log('Regenerate specific message called, message index:', messageIndex);
    
    const context = findRequestContext(messageIndex);
    
    if (context) {
      const { prompt: originalPrompt, isModification, previousHtml } = context;
      
      // 채팅 기록에 다시 생성 알림 추가
      addToChatHistory('user', `🔄 "${originalPrompt}" 다시 생성`);
      
      // 기존 HTML 초기화하고 새로 생성
      setHtmlCode('');
      
      setTimeout(() => {
        // 컨텍스트에 맞는 생성 실행
        generatePageWithContext(originalPrompt, isModification, previousHtml);
      }, 100);
    } else {
      console.warn('Could not find request context');
      alert('요청 컨텍스트를 찾을 수 없습니다.');
    }
  };

  // ─── 서버 상태 확인 함수 ────────────────────────────
  const checkServerHealth = async () => {
    try {
      updateWorkStatus('서버 상태 확인 중...');
      const response = await fetch(`${API_BASE}/api/health`);
      const health = await response.json();
      
      addDebugLog('success', '서버 상태 확인 완료', health);
      
      if (health.mongodb !== 'connected') {
        addDebugLog('warning', 'MongoDB 연결 상태 이상', { status: health.mongodb });
      }
      
      if (health.anthropic !== 'configured') {
        addDebugLog('error', 'Anthropic API 키 설정 누락');
      }
      
      updateWorkStatus('서버 정상');
      return health;
    } catch (error) {
      addDebugLog('error', '서버 상태 확인 실패', error);
      updateWorkStatus('서버 연결 실패');
      setErrorDetails({
        type: 'server_unreachable',
        message: '서버에 접근할 수 없습니다.',
        suggestion: '서버가 실행 중인지 확인하고 포트 4000이 열려있는지 확인하세요.'
      });
      throw error;
    }
  };

  // ─── 연결 테스트 함수 ───────────────────────────────
  const testConnection = async () => {
    try {
      updateWorkStatus('API 연결 테스트 중...');
      const response = await fetch(`${API_BASE}/api/test-connection`);
      const result = await response.json();
      
      if (result.success) {
        addDebugLog('success', 'API 연결 테스트 성공', result);
        updateWorkStatus('API 연결 정상');
      } else {
        addDebugLog('error', 'API 연결 테스트 실패', result);
        updateWorkStatus('API 연결 실패');
        setErrorDetails({
          type: 'api_test_failed',
          message: result.error || 'API 테스트에 실패했습니다.',
          suggestion: 'Anthropic API 키가 올바른지 확인하세요.'
        });
      }
      
      return result;
    } catch (error) {
      addDebugLog('error', 'API 연결 테스트 오류', error);
      updateWorkStatus('API 테스트 실패');
      throw error;
    }
  };

  // ─── 컴포넌트 마운트 시 서버 상태 확인 ─────────────────
  useEffect(() => {
    const initializeApp = async () => {
      addDebugLog('info', '앱 초기화 시작');
      
      try {
        await checkServerHealth();
        addDebugLog('info', '앱 초기화 완료');
        updateWorkStatus('준비 완료');
      } catch (error) {
        addDebugLog('error', '앱 초기화 실패', error);
      }
    };
    
    initializeApp();
  }, []);
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
    console.log('Adding message to chat history:', newMessage);
    
    setChatHistory(prev => {
      const newHistory = [...prev, newMessage];
      console.log('New chat history length:', newHistory.length);
      console.log('Last message:', newHistory[newHistory.length - 1]);
      return newHistory;
    });
    
    // HTML이 포함된 메시지인 경우 히스토리에 추가
    if (htmlContent) {
      setHtmlHistory(prev => {
        const newHistory = [...prev, htmlContent];
        const newIndex = newHistory.length - 1;
        setCurrentHistoryIndex(newIndex);
        console.log('HTML history updated, new index:', newIndex);
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

  // ─── 계층적 생성 초기화 ──────────────────────────────
  const initializeHierarchicalGeneration = (plan) => {
    setIsHierarchicalGeneration(true);
    setHierarchicalPlan(plan);
    setCurrentLayer(0);
    setTotalLayers(plan.layers.length);
    setLayerProgress(plan.layers.map(() => ({ completed: false, html: '' })));
    
    // 계층적 생성 시작 메시지 추가
    addToChatHistory('assistant', `🏗️ 복잡한 웹사이트를 ${plan.layers.length}단계로 나누어 생성합니다...`);
  };

  // ─── 계층적 생성 완료 처리 ──────────────────────────────
  const completeHierarchicalGeneration = (finalHtml) => {
    setIsHierarchicalGeneration(false);
    setCurrentLayer(0);
    setTotalLayers(0);
    setLayerProgress([]);
    setHierarchicalPlan(null);
    
    // 최종 완료 메시지
    addToChatHistory('assistant', '🎉 모든 계층의 생성이 완료되었습니다! 최종 결과를 확인해보세요.', new Date(), finalHtml);
  };

  // ─── 계층적 생성 진행 처리 ──────────────────────────────
  const processHierarchicalLayer = async (layerIndex, layerHtml) => {
    console.log(`Processing layer ${layerIndex + 1}/${totalLayers}`);
    
    // 현재 레이어 진행 상태 업데이트
    setLayerProgress(prev => {
      const newProgress = [...prev];
      newProgress[layerIndex] = { completed: true, html: layerHtml };
      return newProgress;
    });
    
    // 계층 완료 메시지 추가
    const layerName = hierarchicalPlan?.layers[layerIndex]?.name || `레이어 ${layerIndex + 1}`;
    addToChatHistory('assistant', `✅ ${layerName} 완료`);
    
    // 다음 레이어가 있는 경우 계속 진행
    if (layerIndex + 1 < totalLayers) {
      setCurrentLayer(layerIndex + 1);
      
      // 다음 레이어 생성 시작
      setTimeout(() => {
        generateNextLayer(layerIndex + 1);
      }, 500);
    } else {
      // 모든 레이어 완료 - 최종 HTML 조합
      const allLayers = layerProgress.map(p => p.html).join('\n');
      const finalFixedHtml = fixBrokenImages(allLayers);
      setHtmlCode(finalFixedHtml);
      completeHierarchicalGeneration(finalFixedHtml);
    }
  };

  // ─── 다음 계층 생성 ────────────────────────────────────
  const generateNextLayer = (layerIndex) => {
    if (!hierarchicalPlan || layerIndex >= hierarchicalPlan.layers.length) return;
    
    const layer = hierarchicalPlan.layers[layerIndex];
    const previousLayers = layerProgress.slice(0, layerIndex).map(p => p.html).join('\n');
    
    // 레이어별 생성 요청
    const layerPrompt = layer.prompt;
    const contextHtml = previousLayers;
    
    console.log(`Generating layer ${layerIndex + 1}: ${layer.name}`);
    addToChatHistory('assistant', `🔧 ${layer.name} 생성 중...`);
    
    // 레이어별 생성 실행
    generateLayerWithContext(layerPrompt, true, contextHtml, layerIndex);
  };

  // ─── 레이어별 컨텍스트 생성 핸들러 ─────────────────────────
  const generateLayerWithContext = (requestText, isModificationRequest = false, previousHtmlContext = '', layerIndex = 0) => {
    if (!requestText.trim()) return;

    evtRef.current?.close();
    setCharCount(0);
    setIsLoading(true);
    setIsModifying(isModificationRequest);

    console.log('Generate layer with context:', {
      requestText,
      isModificationRequest,
      hasPreviousContext: !!previousHtmlContext,
      layerIndex
    });

    // URL 파라미터로 전송 (계층적 생성 정보 포함)
    const params = new URLSearchParams({
      message: requestText,
      isModification: isModificationRequest.toString(),
      currentHtml: isModificationRequest ? previousHtmlContext : '',
      isHierarchical: 'true',
      layerIndex: layerIndex.toString(),
      totalLayers: totalLayers.toString()
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
      if (now - lastUpdateTime < 300) {
        if (updateTimer) clearTimeout(updateTimer);
        updateTimer = setTimeout(() => {
          // 계층적 생성 중에는 임시 HTML을 표시
          const tempHtml = layerProgress.slice(0, layerIndex).map(p => p.html).join('\n') + fullHtml;
          const fixedHtml = fixBrokenImages(tempHtml);
          setHtmlCode(fixedHtml);
          lastUpdateTime = Date.now();
        }, 300);
      } else {
        const tempHtml = layerProgress.slice(0, layerIndex).map(p => p.html).join('\n') + fullHtml;
        const fixedHtml = fixBrokenImages(tempHtml);
        setHtmlCode(fixedHtml);
        lastUpdateTime = now;
      }
    };
    
    evtRef.current.onmessage = e => {
      console.log('Received layer data:', e.data);
      
      // 스트림 끝
      if (e.data === '[DONE]') {
        evtRef.current.close();
        
        // 레이어 HTML 완성
        const finalLayerHtml = fixBrokenImages(fullHtml);
        
        setTimeout(() => {
          setIsLoading(false);
          setIsModifying(false);
          
          // 현재 레이어 처리 완료
          processHierarchicalLayer(layerIndex, finalLayerHtml);
          
        }, 200);
        return;
      }

      // 에러 메시지 처리
      try {
        const parsed = JSON.parse(e.data);
        if (parsed.error) {
          evtRef.current.close();
          setIsLoading(false);
          setIsModifying(false);
          addToChatHistory('error', `❌ 레이어 ${layerIndex + 1} 오류: ${parsed.error}`);
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
          setTimeout(() => {
            const tempHtml = layerProgress.slice(0, layerIndex).map(p => p.html).join('\n') + fullHtml;
            const fixedHtml = fixBrokenImages(tempHtml);
            setHtmlCode(fixedHtml);
            lastUpdateTime = Date.now();
          }, 100);
        } else if (hasStartedReceiving) {
          smoothUpdateHtml();
        }
        
        console.log('Updated layer HTML length:', fullHtml.length);
      }
    };

    evtRef.current.onerror = (error) => {
      console.error('EventSource error:', error);
      evtRef.current.close();
      setIsLoading(false);
      setIsModifying(false);
      addToChatHistory('error', `❌ 레이어 ${layerIndex + 1} 연결 오류가 발생했습니다.`);
    };

    evtRef.current.onopen = () => {
      console.log('EventSource connected for layer', layerIndex + 1);
    };
  };

  // ─── 컨텍스트를 포함한 페이지 생성 핸들러 ───────────────────────
  const generatePageWithContext = (requestText, isModificationRequest = false, previousHtmlContext = '') => {
    if (!requestText.trim()) return;

    evtRef.current?.close();
    setCharCount(0);
    setIsLoading(true);
    setIsModifying(isModificationRequest);
    setErrorDetails(null);
    
    updateWorkStatus('연결 준비 중', { requestText, isModificationRequest });

    console.log('Generate with context:', {
      requestText,
      isModificationRequest,
      hasPreviousContext: !!previousHtmlContext
    });

    // URL 파라미터로 전송
    const params = new URLSearchParams({
      message: requestText,
      isModification: isModificationRequest.toString(),
      currentHtml: isModificationRequest ? previousHtmlContext : ''
    });

    const url = `${API_BASE}/api/stream?${params.toString()}`;
    console.log('Connecting to:', url);
    addDebugLog('info', '서버 연결 시도', { url: url.substring(0, 100) + '...' });

    evtRef.current = new EventSourcePolyfill(url);

    let fullHtml = '';
    let updateTimer = null;
    let hasStartedReceiving = false;
    let lastUpdateTime = 0;
    let pingCount = 0;
    
    // 연결 타임아웃 설정
    const connectionTimeout = setTimeout(() => {
      if (!hasStartedReceiving) {
        addDebugLog('error', '연결 타임아웃 (30초)', { url });
        evtRef.current?.close();
        setIsLoading(false);
        setIsModifying(false);
        updateConnectionStatus('timeout');
        setErrorDetails({
          type: 'timeout',
          message: '서버 연결 시간이 초과되었습니다.',
          suggestion: '서버가 실행 중인지 확인하고 다시 시도해주세요.'
        });
      }
    }, 30000);
    
    // 더 부드러운 업데이트를 위한 함수
    const smoothUpdateHtml = () => {
      const now = Date.now();
      // 최소 500ms 간격으로 업데이트 (blob URL 생성 부하 고려)
      if (now - lastUpdateTime < 500) {
        if (updateTimer) clearTimeout(updateTimer);
        updateTimer = setTimeout(() => {
          const fixedHtml = fixBrokenImages(fullHtml);
          updateHtmlWithBlob(fixedHtml);
          lastUpdateTime = Date.now();
        }, 500);
      } else {
        const fixedHtml = fixBrokenImages(fullHtml);
        updateHtmlWithBlob(fixedHtml);
        lastUpdateTime = now;
      }
    };
    
    evtRef.current.onmessage = e => {
      clearTimeout(connectionTimeout);
      updateConnectionStatus('connected');
      
      console.log('Received raw data:', e.data);
      addDebugLog('info', 'Raw 데이터 수신', { data: e.data.substring(0, 100) + '...' });
      
      // 계층적 생성 계획 수신 확인
      if (e.data.startsWith('[HIERARCHICAL_PLAN]')) {
        try {
          const planData = JSON.parse(e.data.replace('[HIERARCHICAL_PLAN]', ''));
          console.log('Received hierarchical plan:', planData);
          addDebugLog('success', '계층적 생성 계획 수신', planData);
          
          updateWorkStatus('계층적 생성 계획 수립 완료');
          
          // 계층적 생성 초기화
          initializeHierarchicalGeneration(planData);
          
          // 첫 번째 레이어 생성 시작
          setTimeout(() => {
            generateNextLayer(0);
          }, 1000);
          
          return;
        } catch (err) {
          console.error('Failed to parse hierarchical plan:', err);
          addDebugLog('error', '계층적 생성 계획 파싱 실패', err);
        }
      }
      
      // 스트림 끝
      if (e.data === '[DONE]') {
        evtRef.current.close();
        updateConnectionStatus('completed');
        updateWorkStatus('생성 완료');
        
        addDebugLog('success', '스트림 완료', { 
          totalLength: fullHtml.length,
          hasContent: !!fullHtml.trim()
        });
        
        // 최종 HTML 설정 후 로딩 상태 해제 (이미지 수정 적용)
        const finalFixedHtml = fixBrokenImages(fullHtml);
        
        if (finalFixedHtml.trim()) {
          console.log('Setting final HTML with length:', finalFixedHtml.length);
          addDebugLog('success', 'HTML 최종 설정', { length: finalFixedHtml.length });
          
          updateHtmlWithBlob(finalFixedHtml);
          
          // 부드러운 완료 전환
          setTimeout(() => {
            setIsLoading(false);
            setIsModifying(false);
            
            // 완료 후 채팅 기록에 AI 응답 추가 (HTML과 함께)
            console.log('About to add completion message with HTML length:', finalFixedHtml.length);
            addToChatHistory('assistant', '✅ 완료되었습니다!', new Date(), finalFixedHtml);
            
          }, 200);
          
          // HTML이 있을 때만 저장
          updateWorkStatus('결과 저장 중');
          fetch(`${API_BASE}/api/save`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              prompt: requestText, 
              html: finalFixedHtml,
              isModification: isModificationRequest,
              originalPrompt: requestText
            })
          })
          .then(res => res.json())
          .then(data => {
            setPreviewId(data.id);
            // 새로운 미리보기 ID를 히스토리에 추가
            setPreviewIds(prev => {
              const newIds = [...prev, data.id];
              console.log('Added preview ID:', data.id, 'Total IDs:', newIds);
              addDebugLog('success', '미리보기 저장 완료', { id: data.id });
              return newIds;
            });
            updateWorkStatus('모든 작업 완료');
          })
          .catch(err => {
            console.error('Save error:', err);
            addDebugLog('error', '저장 실패', err);
            updateWorkStatus('저장 실패 (생성은 완료됨)');
          });
        } else {
          console.warn('No HTML content generated');
          addDebugLog('warning', 'HTML 내용이 생성되지 않음');
          updateWorkStatus('생성 실패 - 내용 없음');
          setErrorDetails({
            type: 'empty_response',
            message: 'AI가 빈 응답을 반환했습니다.',
            suggestion: '다른 방식으로 요청해보거나 서버 로그를 확인해주세요.'
          });
          
          // 로딩 상태 해제
          setIsLoading(false);
          setIsModifying(false);
        }
        return;
      }

      // 진행률 정보 처리
      if (e.data.startsWith('{"type":"progress"')) {
        try {
          const progressData = JSON.parse(e.data);
          updateWorkStatus(`생성 중 (${progressData.chars}자)`);
          addDebugLog('info', '진행률 업데이트', progressData);
          return;
        } catch (err) {
          // 진행률 파싱 실패는 무시
        }
      }

      // 상태 정보 처리
      if (e.data.startsWith('{"type":"status"')) {
        try {
          const statusData = JSON.parse(e.data);
          updateWorkStatus(statusData.message);
          return;
        } catch (err) {
          // 상태 파싱 실패는 무시
        }
      }

      // 에러 메시지 처리
      try {
        const parsed = JSON.parse(e.data);
        if (parsed.error) {
          evtRef.current.close();
          setIsLoading(false);
          setIsModifying(false);
          updateConnectionStatus('error');
          
          const errorMsg = `❌ 오류: ${parsed.error}`;
          addToChatHistory('error', errorMsg);
          addDebugLog('error', 'API 오류', parsed);
          updateWorkStatus('오류 발생');
          setErrorDetails({
            type: 'api_error',
            message: parsed.error,
            suggestion: 'API 키와 서버 설정을 확인해주세요.'
          });
          return;
        }
      } catch (err) {
        // JSON이 아닌 경우 계속 진행
      }

      // 실제 메시지 조각 처리
      let chunk = e.data;
      let textPiece = '';

      // ping 메시지 처리
      if (chunk.includes('"type":"ping"')) {
        pingCount++;
        updateWorkStatus(`연결 유지 중 (ping ${pingCount})`);
        addDebugLog('info', 'Ping 수신', { count: pingCount });
        return;
      }

      // OpenAI 형식의 스트리밍 데이터 파싱
      try {
        const parsed = JSON.parse(chunk);
        if (parsed.choices && parsed.choices[0] && parsed.choices[0].delta) {
          textPiece = parsed.choices[0].delta.content || '';
        }
      } catch (err) {
        // JSON 파싱 실패 시 원본 텍스트 사용 (서버에서 직접 텍스트를 보낼 수도 있음)
        console.log('JSON 파싱 실패, 원본 텍스트 사용:', chunk.substring(0, 50));
        addDebugLog('warning', 'JSON 파싱 실패, 원본 사용', { chunk: chunk.substring(0, 100) });
        
        // 특수 메시지가 아니면 HTML 콘텐츠로 취급
        if (!chunk.startsWith('[') && !chunk.startsWith('{')) {
          textPiece = chunk;
        }
      }

      if (textPiece) {
        fullHtml += textPiece;
        setCharCount(prev => prev + textPiece.length);
        
        addDebugLog('info', 'HTML 조각 수신', { 
          length: textPiece.length, 
          totalLength: fullHtml.length,
          sample: textPiece.substring(0, 50)
        });
        
        // 첫 번째 의미있는 HTML 태그가 완성될 때까지 기다림
        if (!hasStartedReceiving && fullHtml.includes('<')) {
          hasStartedReceiving = true;
          updateWorkStatus('HTML 생성 중');
          addDebugLog('success', '첫 HTML 태그 수신');
          
          // 첫 렌더링은 약간 지연시켜 더 부드럽게
          setTimeout(() => {
            const fixedHtml = fixBrokenImages(fullHtml);
            console.log('Setting initial HTML with length:', fixedHtml.length);
            updateHtmlWithBlob(fixedHtml);
            lastUpdateTime = Date.now();
          }, 100);
        } else if (hasStartedReceiving) {
          // 이후에는 부드러운 업데이트 사용
          smoothUpdateHtml();
          updateWorkStatus(`HTML 생성 중 (${fullHtml.length}자)`);
        }
        
        console.log('Updated HTML total length:', fullHtml.length);
      }
    };

    evtRef.current.onerror = (error) => {
      clearTimeout(connectionTimeout);
      console.error('EventSource error:', error);
      addDebugLog('error', 'EventSource 연결 오류', error);
      
      evtRef.current.close();
      setIsLoading(false);
      setIsModifying(false);
      updateConnectionStatus('error');
      updateWorkStatus('연결 오류');
      
      setErrorDetails({
        type: 'connection_error',
        message: '서버와의 연결에 문제가 발생했습니다.',
        suggestion: '네트워크 연결과 서버 상태를 확인해주세요.'
      });
      
      addToChatHistory('error', '❌ 연결 오류가 발생했습니다. 다시 시도해주세요.');
    };

    evtRef.current.onopen = () => {
      console.log('EventSource connected');
      updateConnectionStatus('connected');
      updateWorkStatus('서버 연결 완료, 응답 대기 중');
      addDebugLog('success', 'EventSource 연결 성공');
    };
  };

  // ─── AI 페이지 생성/수정 핸들러 ───────────────────────
  const generateOrModifyPage = (isModification = false) => {
    const requestText = isModification ? currentRequest : prompt;
    if (!requestText.trim()) return;

    // 채팅 기록에 사용자 요청 추가
    addToChatHistory('user', requestText);

    // 수정의 경우 현재 HTML을 컨텍스트로 전달
    const contextHtml = isModification ? htmlCode : '';
    
    generatePageWithContext(requestText, isModification, contextHtml);
    
    // 현재 요청 입력창 초기화
    if (isModification) {
      setCurrentRequest('');
    }
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
      
      // 계층적 생성 상태 초기화
      setIsHierarchicalGeneration(false);
      setCurrentLayer(0);
      setTotalLayers(0);
      setLayerProgress([]);
      setHierarchicalPlan(null);
      
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
              placeholder="예: HTML/CSS로 반응형 프로필 카드 만들어 줘&#10;&#10;💡 복잡한 웹사이트의 경우 자동으로 계층적 생성을 사용합니다"
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

        {/* 작업 상태 패널 */}
        <div className="work-status-panel">
          <div className="status-header">
            <h3>🔄 작업 상태</h3>
            <div className={`connection-indicator ${connectionStatus}`}>
              <span className="connection-dot"></span>
              {connectionStatus === 'connected' && '연결됨'}
              {connectionStatus === 'disconnected' && '연결 끊김'}
              {connectionStatus === 'error' && '오류'}
              {connectionStatus === 'timeout' && '시간초과'}
              {connectionStatus === 'completed' && '완료'}
            </div>
          </div>
          
          <div className="current-work">
            <div className="work-text">{workStatus}</div>
            {lastActivity && (
              <div className="last-activity">
                마지막 활동: {lastActivity.toLocaleTimeString()}
              </div>
            )}
          </div>

          {errorDetails && (
            <div className="error-details">
              <div className="error-message">❌ {errorDetails.message}</div>
              <div className="error-suggestion">💡 {errorDetails.suggestion}</div>
            </div>
          )}

          <div className="debug-controls">
            <button 
              className="btn-debug-toggle"
              onClick={() => setShowDebugPanel(!showDebugPanel)}
            >
              {showDebugPanel ? '🔍 디버그 숨기기' : '🔍 디버그 보기'}
            </button>
            
            {debugLogs.length > 0 && (
              <button 
                className="btn-clear-logs"
                onClick={() => setDebugLogs([])}
              >
                🗑️ 로그 지우기
              </button>
            )}
          </div>

          {showDebugPanel && (
            <div className="debug-panel">
              <div className="debug-header">
                <h4>디버그 로그 ({debugLogs.length})</h4>
              </div>
              <div className="debug-logs">
                {debugLogs.slice(-10).map((log, index) => (
                  <div key={index} className={`debug-log ${log.type}`}>
                    <span className="log-time">{log.timestamp}</span>
                    <span className="log-type">[{log.type.toUpperCase()}]</span>
                    <span className="log-message">{log.message}</span>
                    {log.data && (
                      <details className="log-data">
                        <summary>데이터 보기</summary>
                        <pre>{JSON.stringify(log.data, null, 2)}</pre>
                      </details>
                    )}
                  </div>
                ))}
                {debugLogs.length === 0 && (
                  <div className="no-logs">로그가 없습니다</div>
                )}
              </div>
            </div>
          )}
        </div>
        {isHierarchicalGeneration && (
          <div className="hierarchical-progress">
            <div className="hierarchical-header">
              <h3>🏗️ 계층적 생성 진행 중</h3>
              <div className="layer-counter">
                {currentLayer + 1} / {totalLayers} 단계
              </div>
            </div>
            <div className="layer-progress-list">
              {hierarchicalPlan?.layers.map((layer, index) => (
                <div 
                  key={index} 
                  className={`layer-item ${
                    index < currentLayer ? 'completed' : 
                    index === currentLayer ? 'current' : 'pending'
                  }`}
                >
                  <div className="layer-status">
                    {index < currentLayer ? '✅' : 
                     index === currentLayer ? '🔧' : '⏳'}
                  </div>
                  <div className="layer-info">
                    <div className="layer-name">{layer.name}</div>
                    <div className="layer-description">{layer.description}</div>
                  </div>
                </div>
              ))}
            </div>
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
                  <div className="history-controls">
                    {chat.htmlContent && (
                      <>
                        <span className="history-indicator">
                          {isCurrentlyViewing ? '👁️ 현재 보기' : '🔍 클릭하여 보기'}
                        </span>
                        <button
                          className="btn-regenerate-specific"
                          onClick={(e) => {
                            e.stopPropagation(); // 메시지 클릭 이벤트 방지
                            regenerateSpecificMessage(messageIndex);
                          }}
                          disabled={isLoading}
                          title="이 결과를 원본 요청과 컨텍스트로 다시 생성합니다"
                        >
                          🔄
                        </button>
                      </>
                    )}
                  </div>
                </div>
                <div className="chat-content">{chat.content}</div>
              </div>
            );
          })}
          <div ref={chatEndRef} />
        </div>

        {/* 수정 요청 입력 (페이지가 있을 때만 표시) */}
        {htmlCode && !isHierarchicalGeneration && (
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
            ? `${isHierarchicalGeneration ? `계층 ${currentLayer + 1}/${totalLayers} 생성` : isModifying ? '수정' : '생성'} 중… 받은 문자 수: ${charCount}`
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
              {isHierarchicalGeneration 
                ? `계층 ${currentLayer + 1}/${totalLayers} 생성 중...` 
                : isModifying ? '페이지를 수정하고 있습니다...' : '페이지를 생성하고 있습니다...'}
            </div>
          </div>
        )}
        {!htmlCode && !isLoading && (
          <div className="empty-preview">
            <div className="empty-preview-content">
              <h2>🎨 AI Web Builder</h2>
              <p>왼쪽에 원하는 웹사이트를 설명해주세요.</p>
              <p>AI가 실시간으로 HTML/CSS 코드를 생성합니다.</p>
              <div className="feature-highlight">
                <h3>✨ 새로운 기능</h3>
                <p><strong>계층적 생성:</strong> 복잡한 웹사이트를 여러 단계로 나누어 안정적으로 생성</p>
                <p><strong>무제한 길이:</strong> 대규모 웹사이트도 문제없이 생성 가능</p>
              </div>
            </div>
          </div>
        )}
        <iframe
          title="AI Preview"
          src={currentBlobUrl || 'about:blank'}
          sandbox="allow-scripts allow-same-origin allow-forms"
          style={{ 
            display: 'block',
            width: '100%',
            height: '100%',
            border: 'none',
            opacity: htmlCode ? 1 : 0.3,
            transition: 'opacity 0.4s ease-in-out'
          }}
          onLoad={() => {
            if (currentBlobUrl) {
              addDebugLog('success', 'iframe 로드 완료');
            }
          }}
          onError={(e) => {
            addDebugLog('error', 'iframe 로드 오류', e);
          }}
        />
        {/* 생성 중일 때 진행률 표시 */}
        {isLoading && htmlCode && (
          <div className="generation-progress">
            <div className="progress-bar">
              <div className="progress-text">
                {isHierarchicalGeneration 
                  ? `계층 ${currentLayer + 1}/${totalLayers} 생성 중...` 
                  : isModifying ? '수정 중...' : '생성 중...'} ({charCount} 문자)
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}