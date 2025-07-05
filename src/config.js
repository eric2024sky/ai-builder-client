// API 설정
const getApiUrl = () => {
  // 프로덕션 환경에서는 현재 도메인 사용
  if (import.meta.env.PROD) {
    return '';
  }
  
  // 개발 환경에서는 Vite 프록시 사용
  return '';
};

export const API_BASE_URL = getApiUrl();

// API 엔드포인트 헬퍼
export const getApiEndpoint = (endpoint) => {
  return `${API_BASE_URL}${endpoint}`;
};

// EventSource URL 생성 헬퍼
export const getEventSourceUrl = (endpoint) => {
  const baseUrl = API_BASE_URL || window.location.origin;
  return `${baseUrl}${endpoint}`;
};