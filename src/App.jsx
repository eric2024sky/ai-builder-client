import { useState, useRef, useEffect } from 'react';
import { EventSourcePolyfill } from 'event-source-polyfill';
import './App.css';

export default function App() {
  // ─── AI & 스트림 상태 ─────────────────────────────────
  const [prompt,    setPrompt   ] = useState('아주 간단한 일본 소개 웹사이트 만들어주세요');
  const [model,     setModel    ] = useState('gpt');  // 선택된 모델
  const [htmlCode,  setHtmlCode ] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [charCount, setCharCount] = useState(0);
  const evtRef = useRef(null);

  // ─── 저장된 페이지 ID (미리보기 링크) ───────────────────
  const [previewId, setPreviewId] = useState('');

  // ─── 레이아웃 리사이저 상태 ────────────────────────────
  const [leftWidth, setLeftWidth] = useState(35); // %
  const containerRef = useRef(null);
  const isResizing    = useRef(false);

  // ─── 테마 토글 상태 ─────────────────────────────────────
  const [theme, setTheme] = useState('dark');
  const toggleTheme = () =>
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));

  // ─── API_BASE (로컬 / 배포 분기) ───────────────────────
  const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000';

  // ─── AI 페이지 생성 핸들러 ─────────────────────────────
  const generatePage = () => {
    if (!prompt.trim()) return;
    evtRef.current?.close();
    setHtmlCode('');
    setCharCount(0);
    setPreviewId('');
    setIsLoading(true);

    // 선택된 모델을 쿼리 파라미터에 포함
    const url = `${API_BASE}/api/stream?message=${encodeURIComponent(prompt)}&model=${model}`;
    evtRef.current = new EventSourcePolyfill(url);

    let fullHtml = '';
    evtRef.current.onmessage = e => {
      // 스트림 끝
      if (e.data === '[DONE]') {
        evtRef.current.close();
        setIsLoading(false);
        // ➊ 스트림이 끝나면 저장 호출
        fetch(`${API_BASE}/api/save`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt, html: fullHtml })
        })
        .then(res => res.json())
        .then(data => setPreviewId(data.id))
        .catch(console.error);
        return;
      }

      // 실제 메시지 조각 처리
      let chunk = e.data;
      let textPiece = '';

      if (model === 'gpt') {
        // OpenAI: e.data 자체가 HTML 조각
        textPiece = chunk;
      } else {
        // Anthropic: e.data 가 JSON 문자열이므로 파싱
        try {
          const parsed = JSON.parse(chunk);
          // chat.completion.chunk 형태: delta.content 안에 텍스트
          textPiece = parsed.choices?.[0]?.delta?.content || '';
        } catch (err) {
          // 파싱 실패 시 무시
          textPiece = '';
        }
      }

      if (textPiece) {
        fullHtml += textPiece;
        setHtmlCode(fullHtml);
        setCharCount(prev => prev + textPiece.length);
      }
    };

    evtRef.current.onerror = () => {
      evtRef.current.close();
      setIsLoading(false);
    };
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
        <h1 className="title">AI Web Builder</h1>

        {/* 모델 선택 드롭다운 */}
        <select
          className="model-selector"
          value={model}
          onChange={e => setModel(e.target.value)}
          disabled={isLoading}
        >
          <option value="gpt">ChatGPT (OpenAI)</option>
          <option value="claude">Claude (Anthropic)</option>
        </select>

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
        <div className="status">
          {isLoading
            ? `로딩 중… 받은 문자 수: ${charCount}`
            : htmlCode
              ? '✅ 생성 완료!'
              : ''}
        </div>

        {/* ➋ 미리보기 링크 */}
        {previewId && (
          <div className="preview-link">
            👉&nbsp;
            <a
              href={`${API_BASE}/preview/${previewId}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              생성된 페이지 전체보기
            </a>
          </div>
        )}
      </div>

      {/* 리사이저 바 */}
      <div className="resizer-bar" onMouseDown={startResize} />

      {/* 오른쪽 프리뷰 패널 */}
      <div className="panel preview-panel" style={{ width: `${100 - leftWidth}%` }}>
        {isLoading && (
          <div className="spinner-overlay">
            <div className="spinner" />
          </div>
        )}
        <iframe
          title="AI Preview"
          srcDoc={htmlCode}
          sandbox="allow-scripts"
        />
      </div>
    </div>
  );
}
