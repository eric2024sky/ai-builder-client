// 클라이언트 로그 전송 서비스

class ClientLogger {
  constructor() {
    this.logQueue = [];
    this.batchSize = 20;
    this.flushInterval = 5000; // 5초
    this.apiEndpoint = '/api/logs';
    this.sessionId = this.generateSessionId();
    this.projectId = null;
    this.levelPriority = {
      'ERROR': 0,
      'WARN': 1,
      'INFO': 2,
      'DEBUG': 3
    };
    this.logLevel = import.meta.env.DEV ? 'DEBUG' : 'INFO';
    
    // 배치 전송 인터벌 시작
    this.startFlushInterval();
    
    // 전역 에러 핸들러 설정
    this.setupGlobalErrorHandlers();
  }

  generateSessionId() {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  setProjectId(projectId) {
    this.projectId = projectId;
  }

  shouldLog(level) {
    return this.levelPriority[level] <= this.levelPriority[this.logLevel];
  }

  extractCallerInfo() {
    const stack = new Error().stack;
    const stackLines = stack.split('\n');
    
    // 스택에서 실제 호출자 찾기
    for (let i = 3; i < stackLines.length; i++) {
      const line = stackLines[i];
      if (!line.includes('logger.js') && !line.includes('ClientLogger')) {
        const match = line.match(/at\s+(?:async\s+)?([^\s]+)\s+\((.+):(\d+):(\d+)\)/);
        if (match) {
          const functionName = match[1];
          const filePath = match[2];
          const fileName = filePath.split('/').pop();
          return { 
            module: fileName, 
            function: functionName === 'Object.<anonymous>' ? 'anonymous' : functionName 
          };
        }
      }
    }
    return { module: 'unknown', function: 'unknown' };
  }

  log(level, message, data = null, metadata = {}) {
    if (!this.shouldLog(level)) return;

    const callerInfo = this.extractCallerInfo();
    
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      source: 'CLIENT',
      environment: import.meta.env.MODE,
      module: metadata.module || callerInfo.module,
      function: metadata.function || callerInfo.function,
      message,
      data,
      user: {
        sessionId: this.sessionId,
        projectId: this.projectId
      },
      metadata: {
        ...metadata,
        url: window.location.href,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight
        },
        userAgent: navigator.userAgent
      }
    };

    // 콘솔에도 출력
    const consoleMessage = `[${level}] ${logEntry.module}::${logEntry.function} - ${message}`;
    if (level === 'ERROR') {
      console.error(consoleMessage, data);
    } else if (level === 'WARN') {
      console.warn(consoleMessage, data);
    } else if (level === 'DEBUG') {
      console.debug(consoleMessage, data);
    } else {
      console.log(consoleMessage, data);
    }

    // 큐에 추가
    this.logQueue.push(logEntry);
    
    // 에러는 즉시 전송
    if (level === 'ERROR' || this.logQueue.length >= this.batchSize) {
      this.flush();
    }
  }

  async flush() {
    if (this.logQueue.length === 0) return;

    const logsToFlush = [...this.logQueue];
    this.logQueue = [];

    try {
      const response = await fetch(this.apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(logsToFlush)
      });

      if (!response.ok) {
        throw new Error(`Failed to send logs: ${response.status}`);
      }
    } catch (error) {
      console.error('Failed to send logs to server:', error);
      // 실패한 로그는 다시 큐에 추가 (최대 크기 제한)
      if (this.logQueue.length < 100) {
        this.logQueue.unshift(...logsToFlush);
      }
    }
  }

  startFlushInterval() {
    this.flushIntervalId = setInterval(() => {
      this.flush();
    }, this.flushInterval);
  }

  stopFlushInterval() {
    if (this.flushIntervalId) {
      clearInterval(this.flushIntervalId);
      this.flushIntervalId = null;
    }
  }

  // 전역 에러 핸들러
  setupGlobalErrorHandlers() {
    // 처리되지 않은 에러 캐치
    window.addEventListener('error', (event) => {
      this.error('Unhandled error', {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        error: event.error ? {
          name: event.error.name,
          message: event.error.message,
          stack: event.error.stack
        } : null
      });
    });

    // Promise rejection 캐치
    window.addEventListener('unhandledrejection', (event) => {
      this.error('Unhandled promise rejection', {
        reason: event.reason,
        promise: event.promise
      });
    });

    // 페이지 언로드 시 남은 로그 전송
    window.addEventListener('beforeunload', () => {
      this.flush();
    });
  }

  // API 요청 로깅
  logApiRequest(method, url, options = {}) {
    const startTime = performance.now();
    
    this.debug(`API Request: ${method} ${url}`, {
      method,
      url,
      headers: options.headers,
      body: options.body
    });

    return { startTime };
  }

  logApiResponse(method, url, response, startTime) {
    const duration = performance.now() - startTime;
    const level = response.ok ? 'INFO' : 'ERROR';
    
    this.log(level, `API Response: ${method} ${url} - ${response.status}`, {
      method,
      url,
      status: response.status,
      statusText: response.statusText,
      duration: Math.round(duration)
    });
  }

  // 사용자 행동 로깅
  logUserAction(action, details = {}) {
    this.info(`User Action: ${action}`, details);
  }

  // 성능 메트릭 로깅
  logPerformance(metric, value, details = {}) {
    this.info(`Performance: ${metric}`, {
      metric,
      value,
      ...details
    });
  }

  // 편의 메서드들
  error(message, data = null, metadata = {}) {
    this.log('ERROR', message, data, metadata);
  }

  warn(message, data = null, metadata = {}) {
    this.log('WARN', message, data, metadata);
  }

  info(message, data = null, metadata = {}) {
    this.log('INFO', message, data, metadata);
  }

  debug(message, data = null, metadata = {}) {
    this.log('DEBUG', message, data, metadata);
  }

  // 종료 시 정리
  shutdown() {
    this.stopFlushInterval();
    this.flush();
  }
}

// 싱글톤 인스턴스
const logger = new ClientLogger();

// API 요청 래퍼
export const fetchWithLogging = async (url, options = {}) => {
  const method = options.method || 'GET';
  const { startTime } = logger.logApiRequest(method, url, options);
  
  try {
    const response = await fetch(url, options);
    logger.logApiResponse(method, url, response, startTime);
    return response;
  } catch (error) {
    logger.error(`API Request Failed: ${method} ${url}`, {
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack
      }
    });
    throw error;
  }
};

export default logger;