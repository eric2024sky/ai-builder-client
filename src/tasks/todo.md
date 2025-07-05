# AI Builder HTML Display 문제 분석 및 해결 계획

## 문제 상황
생성된 HTML이 iframe에 표시되지 않는 문제

## 분석 결과

### 1. 클라이언트 측 분석
- **App.jsx 분석 결과**:
  - iframe 업데이트 로직은 정상적으로 구현됨 (updateIframePreview 함수)
  - previewUrl이 설정되면 iframe src가 업데이트됨
  - iframe에 sandbox 속성이 제거되어 있어 제한 없음
  - iframe onLoad/onError 이벤트 핸들러가 적절히 설정됨

### 2. 서버 측 분석
- **Preview 라우트 (/preview/:projectId)**:
  - HTML을 적절히 반환하는 것으로 보임
  - Content-Type을 'text/html; charset=utf-8'로 설정
  - X-Frame-Options을 'SAMEORIGIN'으로 설정 (같은 출처에서만 iframe 허용)

### 3. 프록시 설정
- **vite.config.js**:
  - 개발 환경에서 /preview 경로를 http://localhost:4000으로 프록시
  - changeOrigin: true, secure: false로 설정됨

## 가능한 문제 원인

1. **CORS 또는 보안 정책 문제**
   - X-Frame-Options이 SAMEORIGIN으로 설정되어 있지만, 프록시를 통해 접근 시 문제 발생 가능

2. **Preview URL 형식 문제**
   - URL이 올바르게 생성되지 않았을 가능성

3. **HTML 콘텐츠 문제**
   - 생성된 HTML이 실제로 비어있거나 잘못된 형식일 가능성

4. **iframe 로드 타이밍 문제**
   - iframe이 너무 빨리 업데이트되어 서버가 아직 준비되지 않았을 가능성

## TODO 리스트

- [ ] 1. 서버의 preview 라우트에서 실제로 HTML이 반환되는지 확인
  - preview 라우트에 더 자세한 로깅 추가
  - HTML 콘텐츠가 실제로 존재하는지 확인

- [ ] 2. X-Frame-Options 헤더 수정
  - SAMEORIGIN 대신 제거하거나 ALLOWALL로 변경 테스트

- [ ] 3. 클라이언트에서 iframe 로드 디버깅 강화
  - iframe contentDocument 접근 시도
  - 실제 로드된 콘텐츠 확인

- [ ] 4. Preview URL 직접 접근 테스트
  - 브라우저에서 직접 preview URL 접근하여 HTML 확인

- [ ] 5. 서버 응답 헤더 검증
  - Content-Type, Cache-Control 등 헤더 확인

- [ ] 6. 네트워크 탭에서 실제 요청/응답 확인을 위한 로깅 추가