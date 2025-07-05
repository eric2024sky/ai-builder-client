import React, { useState, useEffect, useRef } from 'react';
import { fetchWithLogging } from '../services/logger';
import { getApiEndpoint } from '../config';
import './LogDashboard.css';

const LogDashboard = ({ show, onClose }) => {
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState(null);
  const [filters, setFilters] = useState({
    level: '',
    source: '',
    module: '',
    startDate: '',
    endDate: ''
  });
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [limit] = useState(100);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  
  const refreshIntervalRef = useRef();

  useEffect(() => {
    if (show) {
      loadLogs();
      loadStats();
    }
  }, [show, filters, offset]);

  useEffect(() => {
    if (autoRefresh && show) {
      refreshIntervalRef.current = setInterval(() => {
        loadLogs();
        loadStats();
      }, 5000);
    } else {
      clearInterval(refreshIntervalRef.current);
    }
    
    return () => clearInterval(refreshIntervalRef.current);
  }, [autoRefresh, show]);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit,
        offset,
        ...Object.entries(filters).reduce((acc, [key, value]) => {
          if (value) acc[key] = value;
          return acc;
        }, {})
      });
      
      const response = await fetchWithLogging(`${getApiEndpoint()}/api/logs?${params}`);
      const data = await response.json();
      
      setLogs(data.logs);
      setTotal(data.total);
    } catch (error) {
      console.error('Failed to load logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const response = await fetchWithLogging(`${getApiEndpoint()}/api/logs/stats`);
      const data = await response.json();
      setStats(data);
    } catch (error) {
      console.error('Failed to load stats:', error);
    }
  };

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
    setOffset(0);
  };

  const formatTimestamp = (timestamp) => {
    return new Date(timestamp).toLocaleString();
  };

  const getLevelClass = (level) => {
    switch (level) {
      case 'ERROR': return 'log-level-error';
      case 'WARN': return 'log-level-warn';
      case 'INFO': return 'log-level-info';
      case 'DEBUG': return 'log-level-debug';
      default: return '';
    }
  };

  const handlePageChange = (direction) => {
    if (direction === 'prev' && offset >= limit) {
      setOffset(offset - limit);
    } else if (direction === 'next' && offset + limit < total) {
      setOffset(offset + limit);
    }
  };

  if (!show) return null;

  return (
    <div className="log-dashboard-overlay">
      <div className="log-dashboard">
        <div className="log-dashboard-header">
          <h2>로그 모니터링 대시보드</h2>
          <div className="log-dashboard-controls">
            <label>
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
              />
              자동 새로고침 (5초)
            </label>
            <button onClick={loadLogs} disabled={loading}>
              새로고침
            </button>
            <button onClick={onClose}>닫기</button>
          </div>
        </div>

        {stats && (
          <div className="log-stats">
            <div className="stats-grid">
              {stats.levelStats.map(stat => (
                <div key={stat._id} className={`stat-card ${getLevelClass(stat._id)}`}>
                  <div className="stat-label">{stat._id}</div>
                  <div className="stat-value">{stat.count}</div>
                </div>
              ))}
            </div>
            {stats.moduleErrors.length > 0 && (
              <div className="error-modules">
                <h3>에러 발생 모듈 (Top 10)</h3>
                <ul>
                  {stats.moduleErrors.map(item => (
                    <li key={item._id}>
                      {item._id || 'unknown'}: {item.count}건
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <div className="log-filters">
          <select
            name="level"
            value={filters.level}
            onChange={handleFilterChange}
          >
            <option value="">모든 레벨</option>
            <option value="ERROR">ERROR</option>
            <option value="WARN">WARN</option>
            <option value="INFO">INFO</option>
            <option value="DEBUG">DEBUG</option>
          </select>
          
          <select
            name="source"
            value={filters.source}
            onChange={handleFilterChange}
          >
            <option value="">모든 소스</option>
            <option value="SERVER">SERVER</option>
            <option value="CLIENT">CLIENT</option>
          </select>
          
          <input
            type="text"
            name="module"
            placeholder="모듈 필터..."
            value={filters.module}
            onChange={handleFilterChange}
          />
          
          <input
            type="datetime-local"
            name="startDate"
            value={filters.startDate}
            onChange={handleFilterChange}
          />
          
          <input
            type="datetime-local"
            name="endDate"
            value={filters.endDate}
            onChange={handleFilterChange}
          />
        </div>

        <div className="log-list">
          {loading ? (
            <div className="loading">로그를 불러오는 중...</div>
          ) : logs.length === 0 ? (
            <div className="no-logs">로그가 없습니다.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>시간</th>
                  <th>레벨</th>
                  <th>소스</th>
                  <th>모듈</th>
                  <th>메시지</th>
                  <th>상세</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(log => (
                  <tr key={log._id} className={getLevelClass(log.level)}>
                    <td>{formatTimestamp(log.timestamp)}</td>
                    <td>{log.level}</td>
                    <td>{log.source}</td>
                    <td>{log.module}</td>
                    <td>{log.message}</td>
                    <td>
                      {log.error && (
                        <details>
                          <summary>에러 상세</summary>
                          <pre>{JSON.stringify(log.error, null, 2)}</pre>
                        </details>
                      )}
                      {log.data && (
                        <details>
                          <summary>데이터</summary>
                          <pre>{JSON.stringify(log.data, null, 2)}</pre>
                        </details>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="log-pagination">
          <button
            onClick={() => handlePageChange('prev')}
            disabled={offset === 0}
          >
            이전
          </button>
          <span>
            {offset + 1} - {Math.min(offset + limit, total)} / {total}
          </span>
          <button
            onClick={() => handlePageChange('next')}
            disabled={offset + limit >= total}
          >
            다음
          </button>
        </div>
      </div>
    </div>
  );
};

export default LogDashboard;