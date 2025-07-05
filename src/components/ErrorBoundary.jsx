import React from 'react';
import logger from '../services/logger';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { 
      hasError: false, 
      error: null,
      errorInfo: null
    };
  }

  static getDerivedStateFromError(error) {
    // 다음 렌더링에서 폴백 UI가 보이도록 상태를 업데이트
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    // 에러를 로깅 서비스에 전송
    logger.error('React Error Boundary caught an error', {
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack
      },
      errorInfo: {
        componentStack: errorInfo.componentStack
      }
    });

    // 상태에 에러 정보 저장
    this.setState({
      error,
      errorInfo
    });
  }

  handleReset = () => {
    this.setState({ 
      hasError: false, 
      error: null,
      errorInfo: null
    });
    
    // 페이지 새로고침
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      // 개발 환경에서는 상세 에러 정보 표시
      const isDev = import.meta.env.DEV;

      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#f5f5f5',
          padding: '20px'
        }}>
          <div style={{
            maxWidth: '600px',
            width: '100%',
            backgroundColor: 'white',
            borderRadius: '8px',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
            padding: '40px',
            textAlign: 'center'
          }}>
            <h1 style={{
              fontSize: '24px',
              color: '#333',
              marginBottom: '16px'
            }}>
              문제가 발생했습니다
            </h1>
            
            <p style={{
              fontSize: '16px',
              color: '#666',
              marginBottom: '24px'
            }}>
              예기치 않은 오류가 발생했습니다. 
              페이지를 새로고침하거나 잠시 후 다시 시도해주세요.
            </p>

            {isDev && this.state.error && (
              <details style={{
                marginTop: '24px',
                marginBottom: '24px',
                textAlign: 'left',
                backgroundColor: '#f8f9fa',
                padding: '16px',
                borderRadius: '4px',
                border: '1px solid #dee2e6'
              }}>
                <summary style={{
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  marginBottom: '8px'
                }}>
                  개발자용 에러 정보
                </summary>
                <pre style={{
                  fontSize: '12px',
                  overflow: 'auto',
                  marginTop: '8px'
                }}>
                  <strong>Error:</strong> {this.state.error.toString()}
                  {'\n\n'}
                  <strong>Stack:</strong> {this.state.error.stack}
                  {'\n\n'}
                  <strong>Component Stack:</strong>
                  {this.state.errorInfo?.componentStack}
                </pre>
              </details>
            )}

            <button
              onClick={this.handleReset}
              style={{
                backgroundColor: '#007bff',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                padding: '12px 24px',
                fontSize: '16px',
                cursor: 'pointer',
                transition: 'background-color 0.2s'
              }}
              onMouseOver={(e) => e.target.style.backgroundColor = '#0056b3'}
              onMouseOut={(e) => e.target.style.backgroundColor = '#007bff'}
            >
              페이지 새로고침
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;