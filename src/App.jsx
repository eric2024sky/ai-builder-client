// ai-builder-client/App.jsx
// 수정하기 하얀 화면 문제 해결 버전

import React, { useState, useEffect, useRef } from 'react';
import './App.css';

function App() {
  const [chatInput, setChatInput] = useState('');
  const [htmlContent, setHtmlContent] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');
  const [status, setStatus] = useState('');
  const [chatHistory, setChatHistory] = useState([]);
  const [leftPanelWidth, setLeftPanelWidth] = useState(35);
  const [isResizing, setIsResizing] = useState(false);
  const [generatedChars, setGeneratedChars] = useState(0);
  const [currentViewIndex, setCurrentViewIndex] = useState(-1);
  const [iframeError, setIframeError] = useState(false);
  
  const [generationPlan, setGenerationPlan] = useState(null);
  const [currentProgress, setCurrentProgress] = useState({
    type: null,
    current: 0,
    total: 0,
    results: []
  });
  
  const [projectId, setProjectId] = useState(null);
  
  const [workStatus, setWorkStatus] = useState({
    isConnected: false,
    currentWork: '',
    lastActivity: null,
    error: null
  });
  
  const [showDebug, setShowDebug] = useState(false);
  const [debugLogs, setDebugLogs] = useState([]);
  
  const resizeRef = useRef(null);
  const eventSourceRef = useRef(null);
  const iframeRef = useRef(null);
  const lastPromptRef = useRef('');
  const currentPlanRef = useRef(null);
  const currentProjectIdRef = useRef(null);
  const currentPageIdRef = useRef(null);
  const isModificationRef = useRef(false);
  const isExecutingPlanRef = useRef(false);

  const log = {
    info: (message, data = null) => {
      console.log(`[INFO] ${message}`, data || '');
      addDebugLog('info', message, data);
    },
    error: (message, data = null) => {
      console.error(`[ERROR] ${message}`, data || '');
      addDebugLog('error', message, data);
    },
    warn: (message, data = null) => {
      console.warn(`[WARN] ${message}`, data || '');
      addDebugLog('warning', message, data);
    },
    debug: (message, data = null) => {
      if (showDebug) {
        console.log(`[DEBUG] ${message}`, data || '');
        addDebugLog('debug', message, data);
      }
    }
  };

  const addDebugLog = (type, message, data = null) => {
    const logEntry = {
      id: Date.now() + Math.random(),
      time: new Date().toLocaleTimeString(),
      type,
      message,
      data
    };
    setDebugLogs(prev => [...prev.slice(-50), logEntry]);
  };

  const downloadLogs = async () => {
    try {
      const response = await fetch('/api/logs/download');
      if (!response.ok) {
        throw new Error('로그 다운로드 실패');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ai-builder-logs-${new Date().toISOString().split('T')[0]}.txt`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      log.info('로그 다운로드 완료');
    } catch (error) {
      log.error('로그 다운로드 오류', error);
      alert('로그 다운로드 중 오류가 발생했습니다.');
    }
  };

  useEffect(() => {
    testConnection();
  }, []);

  useEffect(() => {
    log.info('previewUrl 변경됨', {
      newUrl: previewUrl,
      hasIframe: !!iframeRef.current,
      currentIframeSrc: iframeRef.current?.src
    });
    
    if (previewUrl && iframeRef.current) {
      const currentSrc = iframeRef.current.src;
      const newFullUrl = previewUrl.startsWith('http') 
        ? previewUrl 
        : `${window.location.origin}${previewUrl}`;
      
      if (currentSrc !== newFullUrl) {
        log.info('iframe src 업데이트 필요', {
          currentSrc,
          newFullUrl
        });
        updateIframePreview(previewUrl);
      }
    }
  }, [previewUrl]);

  useEffect(() => {
    if (iframeRef.current) {
      const handleLoad = (e) => {
        const iframe = e.target;
        log.info('iframe 로드 완료', { 
          src: iframe.src,
          contentWindow: !!iframe.contentWindow,
          readyState: iframe.contentDocument?.readyState,
          location: iframe.contentWindow?.location?.href
        });
        
        try {
          const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
          if (iframeDoc) {
            log.info('iframe 문서 정보', {
              title: iframeDoc.title,
              bodyLength: iframeDoc.body?.innerHTML?.length,
              hasContent: !!iframeDoc.body?.innerHTML
            });
          }
        } catch (error) {
          log.warn('iframe 내용 접근 불가 (CORS)', { error: error.message });
        }
        
        setIframeError(false);
      };

      const handleError = (e) => {
        log.error('iframe 로드 실패', { 
          src: iframeRef.current.src,
          error: e
        });
        setIframeError(true);
      };

      iframeRef.current.addEventListener('load', handleLoad);
      iframeRef.current.addEventListener('error', handleError);

      log.debug('iframe 마운트', {
        src: iframeRef.current.src,
        sandbox: iframeRef.current.sandbox.toString()
      });

      return () => {
        if (iframeRef.current) {
          iframeRef.current.removeEventListener('load', handleLoad);
          iframeRef.current.removeEventListener('error', handleError);
        }
      };
    }
  }, [previewUrl]);

  const testConnection = async () => {
    try {
      const response = await fetch('/api/test-connection');
      const data = await response.json();
      
      if (data.success) {
        setWorkStatus(prev => ({ ...prev, isConnected: true }));
        log.info('API 연결 성공', data);
      } else {
        setWorkStatus(prev => ({ 
          ...prev, 
          isConnected: false, 
          error: data.error 
        }));
        log.error('API 연결 실패', data);
      }
    } catch (error) {
      setWorkStatus(prev => ({ 
        ...prev, 
        isConnected: false, 
        error: error.message 
      }));
      log.error('연결 테스트 실패', { error: error.message });
    }
  };

  const startStreaming = async (message, config = {}) => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    setIsGenerating(true);
    setGeneratedChars(0);
    setIframeError(false);
    isModificationRef.current = config.isModification || false;
    
    log.info('startStreaming 시작', {
      isModification: config.isModification,
      currentProjectId: currentProjectIdRef.current,
      currentPageId: currentPageIdRef.current,
      modificationScope: config.modificationScope,
      hasCurrentHtml: !!config.currentHtml,
      currentHtmlLength: config.currentHtml?.length || 0
    });
    
    let workMessage = '생성 중...';
    if (config.isModification) {
      workMessage = '수정 중...';
    } else if (config.planType === 'multi') {
      workMessage = `페이지 ${config.pageIndex + 1}/${config.totalPages} 생성 중... (${config.pageName})`;
      
      // 멀티 페이지 생성 진행 상황 업데이트
      if (config.pageIndex > 0) {
        setChatHistory(prev => {
          const lastMessage = prev[prev.length - 1];
          if (lastMessage && lastMessage.isProgressUpdate && !lastMessage.isModificationPlan) {
            return [...prev.slice(0, -1), {
              ...lastMessage,
              content: `📄 멀티 페이지 생성 진행 중...\n\n🔄 현재 작업: ${config.pageName} 페이지\n📋 진행률: ${config.pageIndex + 1}/${config.totalPages} (${Math.round(((config.pageIndex + 1) / config.totalPages) * 100)}%)`,
              timestamp: new Date().toLocaleTimeString()
            }];
          }
          return prev;
        });
      }
    } else if (config.planType === 'long') {
      workMessage = `섹션 ${config.sectionIndex + 1}/${config.totalSections} 생성 중...`;
    } else if (config.planType === 'hierarchical') {
      workMessage = `레이어 ${config.layerIndex + 1}/${config.totalLayers} 생성 중...`;
    }
    
    setWorkStatus(prev => ({ 
      ...prev, 
      currentWork: workMessage,
      lastActivity: new Date()
    }));

    log.info('스트리밍 시작', { 
      message: message ? message.substring(0, 50) : 'No message',
      config,
      currentProjectId: currentProjectIdRef.current,
      currentPageId: currentPageIdRef.current
    });

    const params = new URLSearchParams({
      message: message || '',
      isModification: config.isModification?.toString() || 'false',
      currentHtml: config.currentHtml || '',
      planType: config.planType || '',
      projectId: currentProjectIdRef.current || projectId || '',
      pageId: currentPageIdRef.current || '',  // pageId 추가
      pageName: config.pageName || 'index',
      pageIndex: config.pageIndex || 0,
      totalPages: config.totalPages || 1,
      sectionIndex: config.sectionIndex || 0,
      totalSections: config.totalSections || 1,
      layerIndex: config.layerIndex || 0,
      totalLayers: config.totalLayers || 1,
      modificationScope: config.modificationScope || '',
      targetPageName: config.targetPageName || ''
    });
    
    // Base44 모드에서는 modificationPlan 사용하지 않음

    try {
      const eventSource = new EventSource(`/api/stream?${params}`);
      eventSourceRef.current = eventSource;

      let accumulatedHtml = '';
      let streamTimeout = null;

      const resetTimeout = () => {
        if (streamTimeout) clearTimeout(streamTimeout);
        streamTimeout = setTimeout(() => {
          setWorkStatus(prev => ({ 
            ...prev, 
            currentWork: '응답 대기 중... (시간 초과)',
            error: 'Stream timeout - 10분 이상 응답 없음'
          }));
          log.warn('스트림 타임아웃');
          
          if (confirm('응답 시간이 초과되었습니다. 다시 시도하시겠습니까?')) {
            eventSource.close();
            startStreaming(message, config);
          } else {
            eventSource.close();
            setIsGenerating(false);
          }
        }, 600000);
      };

      resetTimeout();

      eventSource.onopen = () => {
        setWorkStatus(prev => ({ ...prev, isConnected: true, error: null }));
        log.debug('스트리밍 연결 열림');
      };

      eventSource.onmessage = (event) => {
        resetTimeout();
        setWorkStatus(prev => ({ ...prev, lastActivity: new Date() }));

        if (event.data === '[DONE]') {
          eventSource.close();
          if (streamTimeout) clearTimeout(streamTimeout);
          
          // 생성 완료 처리
          handleGenerationComplete(accumulatedHtml, message, config);
          return;
        }

        // 2단계 plan 진행 상황 처리
        if (event.data.startsWith('[PLAN_PROGRESS]')) {
          const progressData = JSON.parse(event.data.substring(15));
          log.info('2단계 plan 진행 상황', progressData);
          
          if (progressData.type === 'stage') {
            setChatHistory(prev => [...prev, {
              type: 'assistant',
              content: `🔄 ${progressData.data.message}`,
              timestamp: new Date().toLocaleTimeString(),
              isPlanProgress: true
            }]);
          } else if (progressData.type === 'needsAnalysis') {
            setChatHistory(prev => [...prev, {
              type: 'assistant',
              content: `✅ 니즈 분석 완료\n\n📋 프로젝트: ${progressData.data.projectName}\n🎯 타입: ${progressData.data.siteType}\n🎨 주요 기능: ${progressData.data.features.join(', ')}`,
              timestamp: new Date().toLocaleTimeString(),
              isPlanProgress: true
            }]);
          } else if (progressData.type === 'architecturePhase') {
            setChatHistory(prev => [...prev, {
              type: 'assistant',
              content: `📐 아키텍처 설계 - ${progressData.data.phase} (${progressData.data.current}/${progressData.data.total})`,
              timestamp: new Date().toLocaleTimeString(),
              isPlanProgress: true,
              isProgressUpdate: true
            }]);
          } else if (progressData.type === 'architecture') {
            setChatHistory(prev => [...prev, {
              type: 'assistant',
              content: `✅ 아키텍처 설계 완료\n\n🏗️ 레이아웃: ${progressData.data.layout.type}\n📄 페이지 수: ${progressData.data.pages.length}`,
              timestamp: new Date().toLocaleTimeString(),
              isPlanProgress: true
            }]);
          } else if (progressData.type === 'component') {
            setChatHistory(prev => [...prev, {
              type: 'assistant',
              content: `🔧 컴포넌트 생성 중... (${progressData.data.current}/${progressData.data.total})\n📦 ${progressData.data.name}`,
              timestamp: new Date().toLocaleTimeString(),
              isPlanProgress: true,
              isProgressUpdate: true
            }]);
          }
          return;
        }

        if (event.data.startsWith('[GENERATION_PLAN]')) {
          const planData = event.data.substring(17);
          const plan = JSON.parse(planData);
          log.info('생성 계획 수신', plan);
          
          currentPlanRef.current = plan;
          setGenerationPlan(plan);
          
          // EventSource 닫기
          eventSource.close();
          if (streamTimeout) clearTimeout(streamTimeout);
          
          executeGenerationPlan(plan);
          return;
        }

        try {
          const data = JSON.parse(event.data);
          
          if (data.type === 'progress') {
            setGeneratedChars(data.chars || 0);
            log.debug(`진행 중: ${data.chars}자`);
          }
          else if (data.choices?.[0]?.delta?.content) {
            accumulatedHtml += data.choices[0].delta.content;
            setGeneratedChars(accumulatedHtml.length);
          }
          else if (data.type === 'completion') {
            setWorkStatus(prev => ({ 
              ...prev, 
              currentWork: '생성 완료!',
              isConnected: true 
            }));
            log.info('생성 완료', data);
          }
          else if (data.error) {
            throw new Error(data.error);
          }
        } catch (error) {
          if (event.data.includes('<!DOCTYPE html>') || event.data.includes('<html')) {
            accumulatedHtml += event.data;
            setGeneratedChars(accumulatedHtml.length);
          } else {
            log.error('Stream 파싱 오류', { error: error.message, data: event.data });
          }
        }
      };

      eventSource.onerror = (error) => {
        log.error('EventSource 오류', error);
        eventSource.close();
        if (streamTimeout) clearTimeout(streamTimeout);
        
        setIsGenerating(false);
        setWorkStatus(prev => ({ 
          ...prev, 
          isConnected: false,
          currentWork: '연결 끊김',
          error: 'Streaming connection lost'
        }));
        
        setChatHistory(prev => [...prev, {
          type: 'error',
          content: '연결 오류가 발생했습니다. 다시 시도해주세요.',
          timestamp: new Date().toLocaleTimeString()
        }]);
      };
    } catch (error) {
      log.error('startStreaming 오류', error);
      setIsGenerating(false);
    }
  };

  const executeGenerationPlan = (plan) => {
    const progress = {
      type: plan.type,
      current: 0,
      total: 0,
      results: []
    };

    // Base44 범용 계획 처리
    if (plan.plan && plan.plan.conversationSeed) {
      // Base44 방식: 범용 계획에서 초기 대화 시드 사용
      const userPrompt = plan.plan.conversationSeed.find(msg => msg.role === 'user')?.content || plan.description;
      progress.total = plan.plan.layers ? plan.plan.layers.length : 1;
      setCurrentProgress(progress);
      
      log.info('Base44 범용 계획 실행', {
        complexity: plan.plan.complexity,
        totalLayers: plan.plan.layers?.length || 1,
        estimatedPages: plan.plan.estimatedPages
      });
      
      // 생성 진행 상황 채팅 버블
      setChatHistory(prev => [...prev, {
        type: 'assistant',
        content: `🚀 ${plan.plan.siteType} 생성 시작\n\n🎯 복잡도: ${plan.plan.complexity}\n📄 예상 페이지: ${plan.plan.estimatedPages}개\n🔄 계층: ${plan.plan.layers?.length || 1}개`,
        timestamp: new Date().toLocaleTimeString(),
        isProgressUpdate: true
      }]);
      
      startStreaming(userPrompt, {
        planType: plan.type || 'single',
        universalPlan: plan.plan
      });
      
    } else {
      // 기존 방식 (backward compatibility)
      switch (plan.type) {
        case 'single':
          progress.total = 1;
          setCurrentProgress(progress);
          startStreaming(plan.plan?.prompt || plan.description || '', { planType: 'single' });
          break;
          
        case 'multi':
          progress.total = plan.plan?.pages?.length || 1;
          setCurrentProgress(progress);
          log.info('멀티 페이지 생성 시작', { total: progress.total });
          
          // 멀티 페이지 생성 진행 상황 채팅 버블
          setChatHistory(prev => [...prev, {
            type: 'assistant',
            content: `📄 멀티 페이지 생성 시작\n\n📃 총 ${plan.plan?.pages?.length || 0}개 페이지 생성 예정\n🔄 현재 작업: ${plan.plan?.pages?.[0]?.pageName || 'index'} 페이지`,
            timestamp: new Date().toLocaleTimeString(),
            isProgressUpdate: true
          }]);
          
          if (plan.plan?.pages?.[0]) {
            startStreaming(plan.plan.pages[0].prompt || plan.description || '', {
              planType: 'multi',
              pageIndex: 0,
              totalPages: plan.plan.pages.length,
              pageName: plan.plan.pages[0].pageName
            });
          }
          break;
          
        case 'long':
          progress.total = plan.plan?.sections?.length || 1;
          setCurrentProgress(progress);
          if (plan.plan?.sections?.[0]) {
            startStreaming(plan.plan.sections[0].prompt || plan.description || '', {
              planType: 'long',
              sectionIndex: 0,
              totalSections: plan.plan.sections.length
            });
          }
          break;
          
        case 'hierarchical':
          progress.total = plan.plan?.layers?.length || 1;
          setCurrentProgress(progress);
          if (plan.plan?.layers?.[0]) {
            startStreaming(plan.plan.layers[0].prompt || plan.description || '', {
              planType: 'hierarchical',
              layerIndex: 0,
              totalLayers: plan.plan.layers.length
            });
          }
          break;
      }
    }
  };

  
  const executeModificationPlan = async (plan, modificationRequest) => {
    log.info('수정 계획 실행 시작', plan);
    
    setWorkStatus(prev => ({ 
      ...prev, 
      currentWork: `수정 중... (범위: ${plan.scope}, 복잡도: ${plan.estimatedComplexity})`
    }));
    
    let projectInfo = null;
    if (projectId || currentProjectIdRef.current) {
      try {
        const response = await fetch(`/api/project/${projectId || currentProjectIdRef.current}`);
        if (response.ok) {
          const data = await response.json();
          projectInfo = data.project;
        }
      } catch (error) {
        log.error('프로젝트 정보 조회 실패', error);
      }
    }
    
    // 수정 타입과 구체적인 값들 저장
    const modificationType = plan.modificationType || 'general';
    const specificValues = plan.modifications?.[0]?.specificValues || null;
    
    // 수정 타입 한글 변환 (한 번만 정의)
    const modTypeKorean = {
      'color': '색상',
      'layout': '레이아웃',
      'content': '콘텐츠',
      'style': '스타일',
      'structure': '구조',
      'navigation': '네비게이션',
      'responsive': '반응형',
      'functionality': '기능',
      'mixed': '복합',
      'general': '일반'
    }[modificationType] || '일반';
    
    if (plan.scope === 'all' && projectInfo && projectInfo.generationType === 'multi') {
      log.info('모든 페이지 수정 시작', { 
        pageCount: projectInfo.pages.length,
        modificationType,
        hasSpecificValues: !!specificValues
      });
      
      // 수정 진행 상태 설정
      setCurrentProgress({
        type: 'modification',
        current: 0,
        total: projectInfo.pages.length,
        modificationType,
        modificationPages: projectInfo.pages.map(p => ({
          pageName: p.pageName,
          description: `${p.pageName} 페이지 ${modTypeKorean} 수정`
        }))
      });
      
      // 모든 페이지에 대해 수정 실행
      for (let i = 0; i < projectInfo.pages.length; i++) {
        const pageInfo = projectInfo.pages[i];
        
        setWorkStatus(prev => ({ 
          ...prev, 
          currentWork: `페이지 ${i + 1}/${projectInfo.pages.length} 수정 중... (${pageInfo.pageName})`
        }));
        
        setCurrentProgress(prev => ({
          ...prev,
          current: i
        }));
        
        // 진행 상황을 채팅 버블로 업데이트
        setChatHistory(prev => {
          const lastMessage = prev[prev.length - 1];
          if (lastMessage && lastMessage.isProgressUpdate) {
            // 기존 진행 상황 메시지 업데이트
            return [...prev.slice(0, -1), {
              ...lastMessage,
              content: `🔄 ${modTypeKorean} 수정 진행 중...\n\n📄 현재 작업: ${pageInfo.pageName} 페이지\n📋 진행률: ${i + 1}/${projectInfo.pages.length} (${Math.round(((i + 1) / projectInfo.pages.length) * 100)}%)\n⏱️ 시작 시간: ${lastMessage.timestamp}`,
              timestamp: new Date().toLocaleTimeString()
            }];
          } else {
            // 새 진행 상황 메시지 추가
            return [...prev, {
              type: 'assistant',
              content: `🔄 ${modTypeKorean} 수정 진행 중...\n\n📄 현재 작업: ${pageInfo.pageName} 페이지\n📋 진행률: ${i + 1}/${projectInfo.pages.length} (${Math.round(((i + 1) / projectInfo.pages.length) * 100)}%)`,
              timestamp: new Date().toLocaleTimeString(),
              isProgressUpdate: true
            }];
          }
        });
        
        try {
          const pageResponse = await fetch(`/api/get-page/${projectInfo.id}/${pageInfo.pageName}`);
          if (!pageResponse.ok) {
            throw new Error(`페이지 로드 실패: ${pageInfo.pageName}`);
          }
          
          const pageData = await pageResponse.json();
          
          await new Promise((resolve) => {
            const params = new URLSearchParams({
              message: modificationRequest,
              isModification: 'true',
              currentHtml: pageData.html,
              modificationScope: 'all',
              targetPageName: pageInfo.pageName,
              projectId: projectInfo.id,
              pageName: pageInfo.pageName
            });
            
            // 수정 계획 전체를 전달
            if (plan) {
              params.append('modificationPlan', JSON.stringify(plan));
            }
            
            const modificationEventSource = new EventSource(`/api/stream?${params}`);
            
            let modifiedHtml = '';
            
            modificationEventSource.onmessage = (event) => {
              if (event.data === '[DONE]') {
                modificationEventSource.close();
                handleModificationComplete(modifiedHtml, modificationRequest, pageInfo, projectInfo.id);
                resolve();
                return;
              }
              
              try {
                const data = JSON.parse(event.data);
                if (data.choices?.[0]?.delta?.content) {
                  modifiedHtml += data.choices[0].delta.content;
                }
              } catch (error) {
                if (event.data.includes('<!DOCTYPE html>') || event.data.includes('<html')) {
                  modifiedHtml += event.data;
                }
              }
            };
            
            modificationEventSource.onerror = () => {
              modificationEventSource.close();
              resolve();
            };
          });
          
          await new Promise(resolve => setTimeout(resolve, 500));
          
        } catch (error) {
          log.error(`페이지 수정 실패: ${pageInfo.pageName}`, error);
        }
      }
      
      // 모든 수정 완료
      setCurrentProgress(prev => ({
        ...prev,
        current: projectInfo.pages.length
      }));
      
      setIsGenerating(false);
      isExecutingPlanRef.current = false;
      setWorkStatus(prev => ({ 
        ...prev, 
        currentWork: '모든 페이지 수정 완료!'
      }));
      
      // 진행 상황 메시지 제거
      setChatHistory(prev => prev.filter(msg => !msg.isProgressUpdate));
      
      // index 페이지의 HTML을 가져와서 htmlContent 업데이트
      let indexHtml = '';
      try {
        const indexResponse = await fetch(`/api/get-page/${projectInfo.id}/index`);
        if (indexResponse.ok) {
          const indexData = await indexResponse.json();
          indexHtml = indexData.html;
          setHtmlContent(indexHtml);
          log.info('멀티페이지 수정 후 index HTML 설정', {
            projectId: projectInfo.id,
            htmlLength: indexHtml.length,
            firstChars: indexHtml.substring(0, 100)
          });
        }
      } catch (error) {
        log.error('index 페이지 가져오기 실패', error);
      }
      
      setChatHistory(prev => [...prev, {
        type: 'assistant',
        content: `✅ 모든 페이지가 성공적으로 수정되었습니다!\n\n🎨 수정 타입: ${modTypeKorean}\n📄 수정된 페이지: ${projectInfo.pages.length}개\n⏱️ 완료 시간: ${new Date().toLocaleTimeString()}`,
        timestamp: new Date().toLocaleTimeString(),
        previewUrl: `/preview/${projectInfo.id}`,
        projectId: projectInfo.id,
        generationType: 'multi',
        modificationType,
        htmlContent: indexHtml // index HTML을 저장하여 다음 수정에 사용
      }]);
      
      setPreviewUrl(`/preview/${projectInfo.id}`);
      updateIframePreview(`/preview/${projectInfo.id}`);
      
      // 멀티페이지 수정 완료 후 ref 관리
      // currentProjectIdRef.current는 유지 (다음 수정을 위해)
      // currentPageIdRef.current는 null로 설정 (멀티페이지이므로)
      currentPageIdRef.current = null;
      isModificationRef.current = false;
      
      log.info('멀티페이지 수정 완료 - 상태 확인', {
        projectId: currentProjectIdRef.current,
        htmlContentLength: htmlContent?.length || 0,
        hasHtmlContent: !!htmlContent
      });
      isModificationRef.current = false;
      
    } else if (plan.scope === 'specific' && plan.affectedPages.length > 0) {
      log.info('특정 페이지 수정', { 
        pages: plan.affectedPages,
        modificationType
      });
      
      // 특정 페이지들에 대해서도 동일한 방식으로 수정
      // ... (위와 유사한 로직을 plan.affectedPages에 대해 적용)
      
    } else {
      log.info('현재 페이지만 수정', { modificationType });
      
      // 단일 페이지 수정 진행 상태 표시
      setCurrentProgress({
        type: 'modification',
        current: 0,
        total: 1,
        modificationType,
        modificationPages: [{
          pageName: '현재 페이지',
          description: `${modTypeKorean} 수정 중...`
        }]
      });
      
      // 단일 페이지 수정 진행 상황 채팅 버블 추가
      setChatHistory(prev => [...prev, {
        type: 'assistant',
        content: `🔄 ${modTypeKorean} 수정 진행 중...\n\n📄 현재 작업: 현재 페이지\n📋 진행률: 1/1 (100%)`,
        timestamp: new Date().toLocaleTimeString(),
        isProgressUpdate: true
      }]);
      
      // 직접 수정 실행 (계획 재수립 방지)
      const params = new URLSearchParams({
        message: modificationRequest,
        isModification: 'true',
        currentHtml: htmlContent,
        modificationScope: 'single',
        projectId: currentProjectIdRef.current || '',
        pageId: currentPageIdRef.current || '',
        pageName: 'index',
        modificationPlan: JSON.stringify(plan)
      });
      
      startStreaming(modificationRequest, {
        isModification: true,
        currentHtml: htmlContent,
        modificationScope: 'single',
        modificationPlan: plan
      });
      
      isExecutingPlanRef.current = false;
    }
  };

  const handleModificationComplete = async (html, prompt, pageInfo, projectId) => {
    try {
      const saveResponse = await fetch('/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          html,
          projectId,
          pageName: pageInfo.pageName,
          isModification: true,
          generationType: 'multi'
        })
      });
      
      if (!saveResponse.ok) {
        throw new Error('페이지 저장 실패');
      }
      
      log.info(`페이지 수정 완료: ${pageInfo.pageName}`);
      
    } catch (error) {
      log.error('페이지 저장 오류', error);
    }
  };

  const handleGenerationComplete = async (html, prompt, config) => {
    try {
      log.info('생성 완료 처리', { 
        planType: config.planType,
        pageIndex: config.pageIndex,
        currentProjectId: currentProjectIdRef.current,
        isModification: config.isModification
      });

      const plan = currentPlanRef.current;
      
      const saveResponse = await fetch('/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          html,
          projectId: currentProjectIdRef.current || null,
          pageId: config.isModification ? currentPageIdRef.current : null,
          projectName: plan?.projectName || 'Untitled Project',
          projectDescription: plan?.description || 'Generated website',
          generationType: config.planType || 'single',
          pageName: config.pageName || 'index',
          pageType: config.pageIndex === 0 ? 'main' : 'sub',
          sectionIndex: config.sectionIndex,
          totalSections: config.totalSections,
          plannedPages: plan?.plannedPages || [],
          isModification: config.isModification || false
          // Base44 모드에서는 modificationPlan 사용하지 않음
        })
      });

      if (!saveResponse.ok) {
        const errorData = await saveResponse.json();
        throw new Error(errorData.error || `HTTP error! status: ${saveResponse.status}`);
      }

      const saveData = await saveResponse.json();
      
      if (saveData.success) {
        if (!currentProjectIdRef.current && saveData.projectId) {
          currentProjectIdRef.current = saveData.projectId;
          setProjectId(saveData.projectId);
          log.info(`프로젝트 ID 설정: ${saveData.projectId}`);
        }

        const finalProjectId = currentProjectIdRef.current || saveData.projectId;
        const finalPageId = saveData.id;
        
        // 수정 작업인 경우
        if (config.isModification) {
          setHtmlContent(html);
          setIsGenerating(false);
          setWorkStatus(prev => ({ 
            ...prev, 
            currentWork: '수정 완료!',
            lastActivity: new Date()
          }));
          
          // 수정된 결과를 채팅 기록에 추가
          const modPlan = config.modificationPlan;
          const modTypeKorean = modPlan ? {
            'color': '색상',
            'layout': '레이아웃',
            'content': '콘텐츠',
            'style': '스타일',
            'structure': '구조',
            'navigation': '네비게이션',
            'responsive': '반응형',
            'functionality': '기능',
            'mixed': '복합',
            'general': '일반'
          }[modPlan.modificationType || 'general'] || '일반' : '일반';
          
          setChatHistory(prev => [...prev, {
            type: 'assistant',
            content: `✅ HTML 페이지가 성공적으로 수정되었습니다!\n\n🎨 수정 타입: ${modTypeKorean}\n⏱️ 완료 시간: ${new Date().toLocaleTimeString()}`,
            timestamp: new Date().toLocaleTimeString(),
            generationType: config.planType || 'single',
            projectId: finalProjectId,
            pageId: finalPageId,
            previewUrl: currentPageIdRef.current ? `/preview/${currentPageIdRef.current}` : `/preview/${finalPageId}`,
            htmlContent: html,
            modificationType: modPlan?.modificationType
          }]);
          
          // 미리보기 URL 업데이트
          const modifiedPreviewUrl = currentPageIdRef.current 
            ? `/preview/${currentPageIdRef.current}` 
            : `/preview/${finalPageId}`;
          
          log.info('수정 완료 후 미리보기 URL 설정', { 
            modifiedPreviewUrl,
            currentPageId: currentPageIdRef.current,
            finalPageId 
          });
          
          setPreviewUrl(modifiedPreviewUrl);
          
          // iframe 업데이트
          setTimeout(() => {
            updateIframePreview(modifiedPreviewUrl);
          }, 500);
          
          // 수정 작업 완료 후 진행 상황 리셋
          setCurrentProgress({
            type: null,
            current: 0,
            total: 0,
            results: []
          });
          
          // 진행 상황 메시지 제거
          setChatHistory(prev => prev.filter(msg => !msg.isProgressUpdate));
          
          // 수정 작업 완료 후에도 계속 수정 가능하도록 ref 유지
          // 단일 페이지의 경우 currentPageIdRef 유지
          isModificationRef.current = false;
          
          return; // 수정 작업은 여기서 종료
        }
        
        // 새 생성 작업인 경우
        if (!currentPageIdRef.current) {
          currentPageIdRef.current = finalPageId;
        }
        
        if (config.planType === 'multi' && plan) {
          const isLastPage = config.pageIndex === plan.plan.pages.length - 1;
          if (isLastPage) {
            try {
              const indexResponse = await fetch(`/api/get-page/${finalProjectId}/index`);
              if (indexResponse.ok) {
                const indexData = await indexResponse.json();
                setHtmlContent(indexData.html);
              }
            } catch (error) {
              log.error('index 페이지 가져오기 실패', error);
            }
          }
        } else if (!config.planType || config.planType === 'single') {
          setHtmlContent(html);
        }
        
        setCurrentProgress(prev => {
          const newResults = [...prev.results, {
            index: prev.current,
            id: saveData.id,
            html,
            prompt,
            pageName: config.pageName
          }];
          
          const updatedProgress = {
            ...prev,
            current: prev.current + 1,
            results: newResults
          };
          
          log.info('진행 상황 업데이트', {
            current: updatedProgress.current,
            total: updatedProgress.total
          });
          
          return updatedProgress;
        });

        if (config.planType === 'multi' && plan) {
          const nextIndex = config.pageIndex + 1;
          if (nextIndex < plan.plan.pages.length) {
            setTimeout(() => {
              startStreaming(plan.plan.pages[nextIndex].prompt, {
                planType: 'multi',
                pageIndex: nextIndex,
                totalPages: plan.plan.pages.length,
                pageName: plan.plan.pages[nextIndex].pageName
              });
            }, 100);
          } else {
            finalizeGeneration(finalProjectId, 'multi');
          }
        } else if (config.planType === 'long' && plan) {
          const nextIndex = config.sectionIndex + 1;
          if (nextIndex < plan.plan.sections.length) {
            setTimeout(() => {
              startStreaming(plan.plan.sections[nextIndex].prompt, {
                planType: 'long',
                sectionIndex: nextIndex,
                totalSections: plan.plan.sections.length,
                currentHtml: html
              });
            }, 100);
          } else {
            finalizeGeneration(saveData.id, 'long', html);
          }
        } else if (config.planType === 'hierarchical' && plan) {
          const nextIndex = config.layerIndex + 1;
          if (nextIndex < plan.plan.layers.length) {
            setTimeout(() => {
              startStreaming(plan.plan.layers[nextIndex].prompt, {
                planType: 'hierarchical',
                layerIndex: nextIndex,
                totalLayers: plan.plan.layers.length,
                currentHtml: html
              });
            }, 100);
          } else {
            finalizeGeneration(saveData.id, 'hierarchical', html);
          }
        } else {
          finalizeGeneration(saveData.id, config.planType || 'single', html);
        }
      } else {
        throw new Error(saveData.error || '저장 실패');
      }
    } catch (error) {
      log.error('생성 완료 처리 오류', {
        error: error.message
      });
      
      setIsGenerating(false);
      setStatus(`오류 발생: ${error.message}`);
      setChatHistory(prev => [...prev, {
        type: 'error',
        content: `처리 중 오류가 발생했습니다: ${error.message}`,
        timestamp: new Date().toLocaleTimeString()
      }]);
    }
  };

  const finalizeGeneration = async (finalId, generationType, html = null) => {
    log.info('finalizeGeneration 시작', {
      finalId,
      generationType,
      hasHtml: !!html,
      htmlLength: html?.length
    });
    
    setIsGenerating(false);
    setWorkStatus(prev => ({ 
      ...prev, 
      currentWork: '완료!',
      lastActivity: new Date()
    }));
    
    // 진행 상황 메시지 제거
    setChatHistory(prev => prev.filter(msg => !msg.isProgressUpdate));

    const timestamp = new Date().toLocaleTimeString();
    let previewLink = '';
    let statusMessage = '';
    
    const finalProgress = { ...currentProgress };
    
    // 멀티페이지의 경우 index HTML 가져오기
    let multiPageIndexHtml = null;
    
    switch (generationType) {
      case 'multi':
        previewLink = `/preview/${finalId}`;
        statusMessage = `멀티 페이지 웹사이트가 생성되었습니다! 총 ${finalProgress.total}개 페이지가 생성되었습니다.`;
        
        // 멀티페이지 생성 완료 시 index HTML 가져오기
        try {
          const indexResponse = await fetch(`/api/get-page/${finalId}/index`);
          if (indexResponse.ok) {
            const indexData = await indexResponse.json();
            multiPageIndexHtml = indexData.html;
            setHtmlContent(multiPageIndexHtml);
            log.info('멀티페이지 생성 완료 후 index HTML 설정', {
              projectId: finalId,
              htmlLength: multiPageIndexHtml.length,
              firstChars: multiPageIndexHtml.substring(0, 100)
            });
          }
        } catch (error) {
          log.error('멀티페이지 생성 후 index HTML 로드 실패', error);
        }
        break;
      case 'long':
        previewLink = `/preview/${finalId}`;
        statusMessage = `긴 페이지가 생성되었습니다! 총 ${finalProgress.total}개 섹션으로 구성되었습니다.`;
        break;
      case 'hierarchical':
        previewLink = `/preview/${finalId}`;
        statusMessage = `계층적 생성이 완료되었습니다! 총 ${finalProgress.total}개 레이어로 생성되었습니다.`;
        break;
      default:
        previewLink = `/preview/${finalId}`;
        statusMessage = 'HTML 페이지가 생성되었습니다!';
        if (html) {
          setHtmlContent(html);
        }
    }
    
    log.info('미리보기 링크 생성', {
      generationType,
      finalId,
      previewLink
    });
    
    setPreviewUrl(previewLink);
    setStatus(statusMessage);
    
    setTimeout(() => {
      log.info('미리보기 업데이트 시도', { previewLink });
      updateIframePreview(previewLink);
    }, 1000);
    
    log.info('생성 완료', {
      type: generationType,
      id: finalId,
      previewUrl: previewLink,
      totalGenerated: finalProgress.total
    });
    
    setChatHistory(prev => [...prev, {
      type: 'assistant',
      content: statusMessage,
      timestamp,
      generationType,
      projectId: generationType === 'multi' ? finalId : null,
      pageId: generationType !== 'multi' ? finalId : null,
      previewUrl: previewLink,
      htmlContent: generationType === 'multi' ? multiPageIndexHtml : html,
      progress: finalProgress,
      originalPrompt: lastPromptRef.current // 원본 프롬프트 저장
    }]);

    setGenerationPlan(null);
    setCurrentProgress({
      type: null,
      current: 0,
      total: 0,
      results: []
    });
    currentPlanRef.current = null;
    // finalizeGeneration에서 ref 초기화 제거 - 수정 작업을 위해 유지
    // currentProjectIdRef.current = null;
    // currentPageIdRef.current = null;
  };

  const updateIframePreview = (url) => {
    log.info('updateIframePreview 시작', { 
      url,
      hasIframe: !!iframeRef.current,
      currentSrc: iframeRef.current?.src
    });
    
    if (!iframeRef.current) {
      log.error('iframe ref가 없습니다');
      return;
    }
    
    log.debug('iframe 초기화');
    iframeRef.current.src = 'about:blank';
    
    setTimeout(() => {
      if (iframeRef.current) {
        let fullUrl;
        if (url.startsWith('http')) {
          fullUrl = url;
        } else if (import.meta.env.DEV) {
          fullUrl = `${window.location.origin}${url}`;
        } else {
          fullUrl = `${window.location.origin}${url}`;
        }
        
        log.info('iframe src 설정', { 
          url,
          fullUrl,
          origin: window.location.origin,
          isDev: import.meta.env.DEV
        });
        
        iframeRef.current.src = fullUrl;
        log.info('iframe src 설정 완료', { fullUrl });
        
        setTimeout(() => {
          if (iframeRef.current && iframeRef.current.src === fullUrl) {
            const iframeDoc = iframeRef.current.contentDocument || iframeRef.current.contentWindow?.document;
            if (iframeDoc && iframeDoc.title === 'Only Idea') {
              log.warn('React 앱이 로드됨 - 프록시 설정 확인 필요');
              setIframeError(true);
            }
          }
        }, 2000);
      }
    }, 100);
    
    setTimeout(() => {
      if (iframeError && url) {
        log.warn('iframe 로드 실패, 새 창에서 열기 제안', { url });
      }
    }, 3000);
  };

  const handleSend = () => {
    if (!chatInput.trim() || isGenerating) return;
    
    const timestamp = new Date().toLocaleTimeString();
    const isModification = !!htmlContent && currentProgress.type === null;
    
    log.info('handleSend 호출', {
      isModification,
      hasHtmlContent: !!htmlContent,
      htmlContentLength: htmlContent?.length || 0,
      currentProjectId: currentProjectIdRef.current,
      currentPageId: currentPageIdRef.current,
      currentProgressType: currentProgress.type,
      chatInput: chatInput.substring(0, 50) + '...'
    });
    
    setChatHistory(prev => [...prev, {
      type: 'user',
      content: chatInput,
      timestamp
    }]);
    
    if (isModification) {
      // 수정 모드 - 이전 프롬프트와 함께 재생성
      log.info('수정 모드 - 재생성 시작', {
        request: chatInput,
        hasOriginalPrompt: !!lastPromptRef.current
      });
      
      // 원본 프롬프트 찾기
      let originalPrompt = lastPromptRef.current || '';
      
      // chatHistory에서 가장 최근 성공한 생성의 원본 프롬프트 찾기
      for (let i = chatHistory.length - 1; i >= 0; i--) {
        const item = chatHistory[i];
        if (item.type === 'assistant' && item.originalPrompt) {
          originalPrompt = item.originalPrompt;
          break;
        }
      }
      
      if (!originalPrompt) {
        // 원본 프롬프트를 찾을 수 없는 경우
        setChatHistory(prev => [...prev, {
          type: 'error',
          content: '원본 요청을 찾을 수 없습니다. 새로운 요청으로 시작해주세요.',
          timestamp: new Date().toLocaleTimeString()
        }]);
        setChatInput('');
        return;
      }
      
      // 수정 요청 안내 메시지
      setChatHistory(prev => [...prev, {
        type: 'assistant',
        content: '이전 요청과 수정사항을 반영하여 재생성합니다...',
        timestamp: new Date().toLocaleTimeString(),
        isProgressUpdate: true
      }]);
      
      // 원본 프롬프트와 수정 요청을 결합
      const combinedPrompt = `${originalPrompt}\n\n다음 수정사항을 적용해주세요:\n${chatInput}`;
      
      // 재생성 시작
      lastPromptRef.current = combinedPrompt;
      setCurrentViewIndex(-1);
      setIframeError(false);
      isModificationRef.current = false;
      isExecutingPlanRef.current = false;
      
      // 원본 프롬프트도 함께 전달
      startStreaming(combinedPrompt, {
        originalPrompt: originalPrompt,
        modificationRequest: chatInput,
        isRegeneration: true
      });
    } else {
      // 생성 모드 - 하지만 새 프로젝트가 아니라면 추가 요청일 수 있음
      lastPromptRef.current = chatInput;
      setCurrentViewIndex(-1);
      setIframeError(false);
      isModificationRef.current = false;
      isExecutingPlanRef.current = false;
      
      // 새 프로젝트 버튼을 누른 경우가 아니라면 ref 유지
      // 사용자가 명시적으로 새 프로젝트를 시작한 경우에만 초기화
      log.info('생성 모드 - 기존 ref 유지', {
        currentProjectId: currentProjectIdRef.current,
        currentPageId: currentPageIdRef.current
      });
      
      startStreaming(chatInput);
    }
    
    setChatInput('');
  };

  const handleChatItemClick = async (item, index) => {
    log.info('채팅 항목 클릭', {
      index,
      type: item.type,
      hasPreviewUrl: !!item.previewUrl,
      hasHtmlContent: !!item.htmlContent,
      generationType: item.generationType
    });
    
    if (item.type === 'assistant') {
      setCurrentViewIndex(index);
      
      if (item.previewUrl) {
        log.info('이전 결과 미리보기 URL 설정', { 
          previewUrl: item.previewUrl 
        });
        setPreviewUrl(item.previewUrl);
        updateIframePreview(item.previewUrl);
      }
      
      // 멀티페이지 프로젝트의 경우 index 페이지 HTML 가져오기
      if (item.generationType === 'multi' && item.projectId) {
        // 멀티페이지는 htmlContent가 있어도 항상 최신 index HTML을 가져옴
        try {
          const indexResponse = await fetch(`/api/get-page/${item.projectId}/index`);
          if (indexResponse.ok) {
            const indexData = await indexResponse.json();
            setHtmlContent(indexData.html);
            log.info('멀티페이지 프로젝트 index HTML 로드', {
              projectId: item.projectId,
              htmlLength: indexData.html.length
            });
          }
        } catch (error) {
          log.error('index 페이지 로드 실패', error);
          // 실패해도 저장된 htmlContent가 있으면 사용
          if (item.htmlContent) {
            setHtmlContent(item.htmlContent);
          } else {
            setHtmlContent('');
          }
        }
      } else if (item.htmlContent) {
        setHtmlContent(item.htmlContent);
        log.info('HTML 콘텐츠 설정', { 
          length: item.htmlContent.length 
        });
      } else {
        // htmlContent가 없는 경우 빈 문자열로 설정
        setHtmlContent('');
      }
      
      // 페이지 ID 업데이트
      if (item.pageId) {
        currentPageIdRef.current = item.pageId;
      } else {
        currentPageIdRef.current = null;
      }
      
      if (item.projectId) {
        currentProjectIdRef.current = item.projectId;
      } else {
        currentProjectIdRef.current = null;
      }
      
      log.info('이전 결과 미리보기 완료', { 
        type: item.generationType,
        previewUrl: item.previewUrl,
        pageId: item.pageId,
        projectId: item.projectId,
        hasHtmlContent: !!item.htmlContent || (item.generationType === 'multi' && item.projectId)
      });
    }
  };

  const handleDownload = async (item) => {
    try {
      let downloadUrl = '';
      
      if (item.generationType === 'multi' && item.projectId) {
        downloadUrl = `/api/download/project/${item.projectId}`;
      } else if (item.pageId) {
        downloadUrl = `/api/download/${item.pageId}`;
      }
      
      if (!downloadUrl) {
        log.error('다운로드 URL을 생성할 수 없습니다');
        return;
      }
      
      log.info('다운로드 시작', { url: downloadUrl });
      
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = item.generationType === 'multi' ? 'website.zip' : 'index.html';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
    } catch (error) {
      log.error('다운로드 오류', error);
      alert('다운로드 중 오류가 발생했습니다.');
    }
  };

  const handleNewProject = () => {
    if (isGenerating) return;
    
    setChatInput('');
    setHtmlContent('');
    setPreviewUrl('');
    setStatus('');
    setChatHistory([]);
    setGeneratedChars(0);
    setCurrentViewIndex(-1);
    setGenerationPlan(null);
    setCurrentProgress({
      type: null,
      current: 0,
      total: 0,
      results: []
    });
    setProjectId(null);
    setIframeError(false);
    currentPlanRef.current = null;
    currentProjectIdRef.current = null;
    currentPageIdRef.current = null;
    isModificationRef.current = false;
    isExecutingPlanRef.current = false;
    
    if (iframeRef.current) {
      iframeRef.current.src = 'about:blank';
    }
    
    log.info('새 프로젝트 시작');
  };

  const clearDebugLogs = () => {
    setDebugLogs([]);
  };

  const handleMouseDown = (e) => {
    setIsResizing(true);
    e.preventDefault();
  };

  const handleMouseMove = (e) => {
    if (!isResizing) return;
    
    const containerWidth = document.querySelector('.ai-builder-container').offsetWidth;
    const newWidth = (e.clientX / containerWidth) * 100;
    
    if (newWidth >= 20 && newWidth <= 80) {
      setLeftPanelWidth(newWidth);
    }
  };

  const handleMouseUp = () => {
    setIsResizing(false);
  };

  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isResizing]);

  const renderProgress = () => {
    if (!currentProgress.type || currentProgress.total === 0) return null;

    const items = [];
    let title = '';
    let itemType = '';
    let progressClass = currentProgress.type;

    switch (currentProgress.type) {
      case 'multi':
        title = '멀티 페이지 생성 진행 중';
        itemType = '페이지';
        items.push(...(generationPlan?.plan?.pages || []));
        break;
      case 'long':
        title = '긴 페이지 생성 진행 중';
        itemType = '섹션';
        items.push(...(generationPlan?.plan?.sections || []));
        break;
      case 'hierarchical':
        title = '계층적 생성 진행 중';
        itemType = '레이어';
        items.push(...(generationPlan?.plan?.layers || []));
        break;
      case 'modification':
        const modType = currentProgress.modificationType || 'general';
        const modTypeKorean = {
          'color': '색상',
          'layout': '레이아웃',
          'content': '콘텐츠',
          'style': '스타일',
          'structure': '구조',
          'navigation': '네비게이션',
          'responsive': '반응형',
          'functionality': '기능',
          'mixed': '복합',
          'general': '일반'
        }[modType] || '일반';
        
        title = `${modTypeKorean} 수정 작업 진행 중`;
        itemType = '페이지';
        items.push(...(currentProgress.modificationPages || []));
        break;
    }

    return (
      <div className={`${progressClass}-progress`}>
        <div className={`${progressClass}-header`}>
          <h3>{title}</h3>
          <div className={`${itemType.toLowerCase()}-counter`}>
            {currentProgress.current + 1} / {currentProgress.total}
          </div>
        </div>
        <div className={`${itemType.toLowerCase()}-progress-list`}>
          {items.map((item, index) => (
            <div 
              key={index} 
              className={`${itemType.toLowerCase()}-item ${
                index < currentProgress.current ? 'completed' :
                index === currentProgress.current ? 'current' : 'pending'
              }`}
            >
              <div className={`${itemType.toLowerCase()}-status`}>
                {index < currentProgress.current ? '✅' :
                 index === currentProgress.current ? '🔄' : '⏳'}
              </div>
              <div className={`${itemType.toLowerCase()}-info`}>
                <div className={`${itemType.toLowerCase()}-name`}>
                  {item.title || item.sectionName || item.name || item.pageName}
                  {item.pageName && ` (${item.pageName})`}
                </div>
                <div className={`${itemType.toLowerCase()}-description`}>
                  {item.description || ''}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="ai-builder-container">
      <div className="panel input-panel" style={{ width: `${leftPanelWidth}%` }}>
        <div className="panel-header">
          <h1 className="title">Only Idea</h1>
          <button 
            className="btn-new" 
            onClick={handleNewProject}
            disabled={isGenerating}
          >
            새 프로젝트
          </button>
        </div>

        <div className="work-status-panel">
          <div className="status-header">
            <h3>작업 상태</h3>
            <div className={`connection-indicator ${
              workStatus.isConnected ? 'connected' : 
              workStatus.error ? 'error' : 'disconnected'
            }`}>
              <span className="connection-dot"></span>
              {workStatus.isConnected ? '연결됨' : 
               workStatus.error ? '오류' : '연결 끊김'}
            </div>
          </div>

          {workStatus.currentWork && (
            <div className="current-work">
              <div className="work-text">{workStatus.currentWork}</div>
              {workStatus.lastActivity && (
                <div className="last-activity">
                  마지막 활동: {workStatus.lastActivity.toLocaleTimeString()}
                </div>
              )}
            </div>
          )}

          {workStatus.error && (
            <div className="error-details">
              <div className="error-message">오류: {workStatus.error}</div>
              <div className="error-suggestion">
                API 키 설정을 확인하거나 서버 연결을 확인해주세요.
              </div>
            </div>
          )}

          <div className="debug-controls">
            <button 
              className="btn-debug-toggle"
              onClick={() => setShowDebug(!showDebug)}
            >
              디버그 {showDebug ? '숨기기' : '보기'}
            </button>
            {showDebug && (
              <>
                <button 
                  className="btn-clear-logs"
                  onClick={clearDebugLogs}
                >
                  로그 지우기
                </button>
                <button 
                  className="btn-download-logs"
                  onClick={downloadLogs}
                >
                  로그 다운로드
                </button>
              </>
            )}
            <button 
              className="btn-test-connection"
              onClick={testConnection}
              disabled={isGenerating}
            >
              연결 테스트
            </button>
          </div>

          {showDebug && (
            <div className="debug-panel">
              <div className="debug-header">
                <h4>디버그 로그</h4>
              </div>
              <div className="debug-logs">
                {debugLogs.length === 0 ? (
                  <div className="no-logs">로그가 없습니다</div>
                ) : (
                  debugLogs.map(log => (
                    <div key={log.id} className={`debug-log ${log.type}`}>
                      <span className="log-time">{log.time}</span>
                      <span className="log-type">[{log.type.toUpperCase()}]</span>
                      <div className="log-message">
                        {log.message}
                        {log.data && (
                          <details className="log-data">
                            <summary>상세 정보</summary>
                            <pre>{JSON.stringify(log.data, null, 2)}</pre>
                          </details>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* 진행 상황은 이제 채팅 버블로 표시됩니다 */}

        <div className="chat-history">
          {chatHistory.map((item, index) => (
            <div 
              key={index} 
              className={`chat-message ${item.type} ${
                item.type === 'assistant' && (item.htmlContent || item.previewUrl) ? 'clickable' : ''
              } ${currentViewIndex === index ? 'currently-viewing' : ''} ${
                item.isModificationPlan ? 'modification-plan' : ''
              } ${
                item.isProgressUpdate ? 'progress-update' : ''
              } ${
                item.isPlanProgress ? 'plan-progress' : ''
              }`}
              onClick={() => handleChatItemClick(item, index)}
            >
              <div className="chat-header">
                <span className="chat-sender">
                  {item.type === 'user' ? '사용자' : 
                   item.type === 'assistant' ? 'AI' : '시스템'}
                </span>
                <span className="chat-time">{item.timestamp}</span>
                {item.type === 'assistant' && item.previewUrl && (
                  <div className="chat-actions">
                    <button
                      className="btn-download"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDownload(item);
                      }}
                      title="다운로드"
                    >
                      💾
                    </button>
                  </div>
                )}
              </div>
              <div className="chat-content">
                {item.content}
                {item.generationType && (
                  <div className={`history-indicator ${item.generationType}-indicator`}>
                    {item.generationType === 'multi' && `멀티 페이지 (${item.progress?.total || 0}개 페이지)`}
                    {item.generationType === 'long' && `긴 페이지 (${item.progress?.total || 0}개 섹션)`}
                    {item.generationType === 'hierarchical' && `계층적 생성 (${item.progress?.total || 0}개 레이어)`}
                  </div>
                )}
                {item.isModificationPlan && (
                  <div className="modification-plan-indicator">
                    🔧 수정 계획
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="chat-input-section">
          <textarea
            className="chat-input"
            placeholder={
              isGenerating ? '작업이 진행 중입니다...' :
              htmlContent ? '웹사이트를 어떻게 개선할까요? (예: 색상을 더 밝게, 레이아웃 변경 등)' :
              '원하는 웹페이지를 설명해주세요... (예: 모던한 포트폴리오 사이트)'
            }
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            disabled={isGenerating}
          />
          <button 
            className="btn-send" 
            onClick={handleSend}
            disabled={!chatInput.trim() || isGenerating}
          >
            {isGenerating ? 
              (htmlContent && isModificationRef.current ? '재생성 중...' : '생성 중...') : 
              '전송'
            }
          </button>
        </div>

        {status && (
          <div className="status">{status}</div>
        )}

        {previewUrl && (
          <div className="preview-link">
            <a href={previewUrl} target="_blank" rel="noopener noreferrer">
              새 창에서 미리보기 →
            </a>
            {iframeError && (
              <div className="iframe-error-notice">
                iframe 로드 실패. 새 창에서 확인해주세요.
              </div>
            )}
          </div>
        )}

        {showDebug && (
          <div className="debug-info">
            <details>
              <summary>세션 정보</summary>
              <pre>{JSON.stringify({
                isGenerating,
                projectId,
                currentProjectId: currentProjectIdRef.current,
                currentPageId: currentPageIdRef.current,
                isModification: isModificationRef.current,
                isExecutingPlan: isExecutingPlanRef.current,
                currentProgress,
                chatHistoryLength: chatHistory.length,
                htmlLength: htmlContent.length,
                generatedChars,
                hasGenerationPlan: !!generationPlan,
                previewUrl,
                iframeError
              }, null, 2)}</pre>
            </details>
          </div>
        )}
      </div>

      <div 
        ref={resizeRef}
        className="resizer-bar"
        onMouseDown={handleMouseDown}
      />

      <div className="panel preview-panel" style={{ width: `${100 - leftPanelWidth}%` }}>
        {isGenerating && (
          <div className="spinner-overlay">
            <div className="spinner"></div>
            <div className="spinner-text">
              {workStatus.currentWork}
              {generatedChars > 0 && (
                <div>{generatedChars.toLocaleString()}자 생성됨</div>
              )}
            </div>
          </div>
        )}
        
        {generatedChars > 0 && isGenerating && (
          <div className="generation-progress">
            <div className="progress-bar">
              <span className="progress-text">
                {generatedChars.toLocaleString()}자 생성 중...
              </span>
            </div>
          </div>
        )}
        
        {!previewUrl && !isGenerating ? (
          <div className="empty-preview">
            <div className="empty-preview-content">
              <h2>Only Idea</h2>
              <p>왼쪽 패널에서 원하는 웹페이지를 설명하면</p>
              <p>AI가 즉시 HTML을 생성해드립니다.</p>
              
              <div className="feature-highlight">
                <h3>✨ 주요 기능</h3>
                <p>• 자동으로 최적의 생성 전략 선택</p>
                <p>• 단일 페이지부터 멀티 페이지까지</p>
                <p>• 긴 문서도 섹션별로 생성</p>
                <p>• 복잡한 디자인은 계층적 생성</p>
                <p>• 생성된 페이지 대화형 재생성</p>
                <p>• 💾 생성된 웹사이트 다운로드</p>
              </div>
            </div>
          </div>
        ) : (
          <>
            <iframe
              ref={iframeRef}
              title="Preview"
              // sandbox 속성 제거 - iframe 내부 네비게이션을 완전히 허용
              // 보안을 위해 나중에 필요한 최소한의 권한만 추가 가능
              style={{ 
                width: '100%', 
                height: '100%', 
                border: 'none',
                display: previewUrl ? 'block' : 'none'
              }}
              onLoad={(e) => {
                const iframe = e.target;
                log.debug('iframe onLoad 이벤트', {
                  src: iframe.src,
                  readyState: iframe.contentDocument?.readyState
                });
                
                // iframe 내부 디버깅 설정
                try {
                  const iframeWindow = iframe.contentWindow;
                  if (iframeWindow) {
                    // 에러 이벤트 캡처
                    iframeWindow.addEventListener('error', (error) => {
                      log.error('iframe 내부 JavaScript 에러:', {
                        message: error.message,
                        filename: error.filename,
                        lineno: error.lineno,
                        colno: error.colno
                      });
                    });
                    
                    // 콘솔 로그 캡처
                    const originalConsole = iframeWindow.console;
                    ['log', 'warn', 'error'].forEach(method => {
                      iframeWindow.console[method] = function(...args) {
                        log.debug(`iframe console.${method}:`, args);
                        originalConsole[method].apply(originalConsole, args);
                      };
                    });
                    
                    // 클릭 이벤트 모니터링
                    iframeWindow.document.addEventListener('click', (e) => {
                      const target = e.target;
                      if (target.tagName === 'A' || target.tagName === 'BUTTON') {
                        log.debug('iframe 내부 클릭 이벤트:', {
                          tagName: target.tagName,
                          href: target.href,
                          onclick: target.onclick ? 'defined' : 'undefined',
                          innerText: target.innerText
                        });
                      }
                    });
                  }
                } catch (error) {
                  log.warn('iframe 디버깅 설정 실패:', error);
                }
              }}
              onError={(e) => {
                log.error('iframe onError 이벤트', e);
              }}
            />
            {iframeError && previewUrl && (
              <div className="iframe-error-fallback">
                <h3>미리보기를 로드할 수 없습니다</h3>
                <p>아래 버튼을 클릭하여 새 창에서 확인하세요.</p>
                <button 
                  className="btn-open-preview"
                  onClick={() => {
                    // 개발 환경에서는 Express 서버(4000번 포트)로 직접 열기
                    const isDev = window.location.hostname === 'localhost' && window.location.port === '5173';
                    const url = isDev ? `http://localhost:4000${previewUrl}` : previewUrl;
                    window.open(url, '_blank');
                  }}
                >
                  새 창에서 열기
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default App;