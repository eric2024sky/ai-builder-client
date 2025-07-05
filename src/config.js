// API 설정
const getApiUrl = () => {
  // 환경 변수에서 API URL 가져오기
  if (import.meta.env.VITE_API_URL) {
    console.log('[CONFIG] Using VITE_API_URL:', import.meta.env.VITE_API_URL);
    return import.meta.env.VITE_API_URL;
  }
  
  // 기본값: 현재 도메인 사용 (통합 배포의 경우)
  console.log('[CONFIG] No VITE_API_URL found, using relative paths');
  return '';
};

export const API_BASE_URL = getApiUrl();

// 디버깅을 위한 환경 정보 출력
console.log('[CONFIG] Current environment:', {
  mode: import.meta.env.MODE,
  isProd: import.meta.env.PROD,
  isDev: import.meta.env.DEV,
  apiBaseUrl: API_BASE_URL,
  allEnvVars: Object.keys(import.meta.env).filter(key => key.startsWith('VITE_'))
});

// API 엔드포인트 헬퍼
export const getApiEndpoint = (endpoint) => {
  return `${API_BASE_URL}${endpoint}`;
};

// EventSource URL 생성 헬퍼
export const getEventSourceUrl = (endpoint) => {
  const baseUrl = API_BASE_URL || window.location.origin;
  return `${baseUrl}${endpoint}`;
};

// Preview URL 생성 헬퍼
export const getPreviewUrl = (path) => {
  // preview는 항상 서버에서 처리되어야 함
  // 배포 환경에서는 VITE_API_URL이 필수
  if (import.meta.env.PROD && !API_BASE_URL) {
    console.error('[CONFIG] Production environment requires VITE_API_URL to be set');
  }
  
  // API_BASE_URL이 설정되어 있으면 사용, 없으면 현재 origin 사용 (개발 환경)
  const baseUrl = API_BASE_URL || window.location.origin;
  
  // baseUrl이 이미 전체 URL이면 그대로 사용, 아니면 현재 origin과 결합
  const fullBaseUrl = baseUrl.startsWith('http') ? baseUrl : `${window.location.origin}${baseUrl}`;
  
  console.log('[CONFIG] Preview URL generation:', { path, baseUrl, fullBaseUrl });
  
  return `${fullBaseUrl}${path}`;
};