// ===== 전역 상태 =====
let allSessions = {};
let filteredSessions = [];
let currentFilter = 'all';
let currentSort = 'recent';

// ===== 초기화 =====
document.addEventListener('DOMContentLoaded', async () => {
  await loadSessions();
  setupEventListeners();
  updateStats();
  renderSessions();
});

// ===== 데이터 로드 =====
async function loadSessions() {
  try {
    const result = await browser.storage.local.get('sessions');
    allSessions = result.sessions || {};
    filteredSessions = Object.values(allSessions);
    
    // 로딩 상태 숨기기
    document.getElementById('loading-state').style.display = 'none';
    
    // 빈 상태 확인
    if (Object.keys(allSessions).length === 0) {
      document.getElementById('empty-state').style.display = 'block';
      document.getElementById('sessions-container').style.display = 'none';
    } else {
      document.getElementById('empty-state').style.display = 'none';
      document.getElementById('sessions-container').style.display = 'grid';
    }
  } catch (error) {
    console.error('세션 로드 실패:', error);
  }
}

// ===== 통계 업데이트 =====
function updateStats() {
  const sessions = Object.values(allSessions);
  
  // 총 세션 수
  document.getElementById('stat-total').textContent = sessions.length;
  
  // 총 방문 횟수
  const totalVisits = sessions.reduce((sum, s) => sum + (s.visitCount || 1), 0);
  document.getElementById('stat-visits').textContent = totalVisits;
  
  // 오늘 방문한 세션
  const today = new Date().toDateString();
  const todaySessions = sessions.filter(s => 
    new Date(s.lastVisited).toDateString() === today
  );
  document.getElementById('stat-today').textContent = todaySessions.length;
  
  // 가장 많이 방문한 세션
  if (sessions.length > 0) {
    const favorite = sessions.reduce((prev, current) => 
      (prev.visitCount || 1) > (current.visitCount || 1) ? prev : current
    );
    const favoriteName = favorite.roomName || favorite.roomId;
    document.getElementById('stat-favorite').textContent = 
      favoriteName.length > 15 ? favoriteName.substring(0, 15) + '...' : favoriteName;
    document.getElementById('stat-favorite').title = favoriteName;
  }
}

// ===== 세션 렌더링 =====
function renderSessions() {
  const container = document.getElementById('sessions-container');
  
  // 필터링 및 정렬
  let sessions = filterSessions(filteredSessions);
  sessions = sortSessions(sessions);
  
  // 렌더링
  container.innerHTML = sessions.map(session => createSessionCard(session)).join('');
  
  // 카드 이벤트 리스너 추가
  setupCardEventListeners();
}

// ===== 필터링 =====
function filterSessions(sessions) {
  const searchTerm = document.getElementById('search-input').value.toLowerCase();
  
  return sessions.filter(session => {
    // 검색어 필터
    if (searchTerm) {
      const roomName = (session.roomName || '').toLowerCase();
      const roomId = (session.roomId || '').toLowerCase();
      if (!roomName.includes(searchTerm) && !roomId.includes(searchTerm)) {
        return false;
      }
    }
    
    // 시간 필터
    if (currentFilter === 'today') {
      const today = new Date().toDateString();
      return new Date(session.lastVisited).toDateString() === today;
    } else if (currentFilter === 'week') {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      return new Date(session.lastVisited) > weekAgo;
    } else if (currentFilter === 'month') {
      const monthAgo = new Date();
      monthAgo.setMonth(monthAgo.getMonth() - 1);
      return new Date(session.lastVisited) > monthAgo;
    }
    
    return true;
  });
}

// ===== 정렬 =====
function sortSessions(sessions) {
  const sorted = [...sessions];
  
  switch (currentSort) {
    case 'recent':
      return sorted.sort((a, b) => 
        new Date(b.lastVisited) - new Date(a.lastVisited)
      );
    case 'visits':
      return sorted.sort((a, b) => 
        (b.visitCount || 1) - (a.visitCount || 1)
      );
    case 'name':
      return sorted.sort((a, b) => {
        const nameA = (a.roomName || a.roomId).toLowerCase();
        const nameB = (b.roomName || b.roomId).toLowerCase();
        return nameA.localeCompare(nameB);
      });
    case 'created':
      return sorted.sort((a, b) => 
        new Date(a.timestamp) - new Date(b.timestamp)
      );
    default:
      return sorted;
  }
}

// ===== 세션 카드 생성 =====
function createSessionCard(session) {
  const displayName = session.roomName || `세션 ${session.roomId}`;
  const lastVisited = formatDate(new Date(session.lastVisited));
  const created = formatDate(new Date(session.timestamp));
  
  return `
    <div class="session-card" data-room-id="${session.roomId}">
      <div class="session-header">
        <div>
          <div class="session-title" title="${displayName}">${displayName}</div>
          <span class="session-id">${session.roomId}</span>
        </div>
        <div class="session-actions">
          <button class="session-btn" data-action="open" title="열기">
            🔗
          </button>
          <button class="session-btn" data-action="copy" title="URL 복사">
            📋
          </button>
          <button class="session-btn danger" data-action="delete" title="삭제">
            🗑️
          </button>
        </div>
      </div>
      <div class="session-meta">
        <div class="session-meta-item">
          <span class="session-meta-icon">👁️</span>
          <span>방문 ${session.visitCount || 1}회</span>
        </div>
        <div class="session-meta-item">
          <span class="session-meta-icon">🕐</span>
          <span>${lastVisited}</span>
        </div>
        <div class="session-meta-item">
          <span class="session-meta-icon">📅</span>
          <span>생성: ${created}</span>
        </div>
      </div>
    </div>
  `;
}

// ===== 날짜 포맷 =====
function formatDate(date) {
  const now = new Date();
  const diff = now - date;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  
  if (minutes < 1) return '방금 전';
  if (minutes < 60) return `${minutes}분 전`;
  if (hours < 24) return `${hours}시간 전`;
  if (days < 7) return `${days}일 전`;
  
  return date.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

// ===== 이벤트 리스너 설정 =====
function setupEventListeners() {
  // 새로고침 버튼
  document.getElementById('btn-refresh').addEventListener('click', async () => {
    await loadSessions();
    updateStats();
    renderSessions();
  });
  
  // 내보내기 버튼
  document.getElementById('btn-export').addEventListener('click', exportSessions);
  
  // CCFOLIA로 이동 버튼
  const goCCFOLIA = document.getElementById('btn-go-ccfolia');
  if (goCCFOLIA) {
    goCCFOLIA.addEventListener('click', () => {
      browser.tabs.create({ url: 'https://ccfolia.com' });
    });
  }
  
  // 검색
  document.getElementById('search-input').addEventListener('input', () => {
    renderSessions();
  });
  
  // 필터 버튼
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      currentFilter = e.target.dataset.filter;
      renderSessions();
    });
  });
  
  // 정렬
  document.getElementById('sort-select').addEventListener('change', (e) => {
    currentSort = e.target.value;
    renderSessions();
  });
  
  // 모달 닫기
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal').addEventListener('click', (e) => {
    if (e.target.id === 'modal') closeModal();
  });
}

// ===== 카드 이벤트 리스너 =====
function setupCardEventListeners() {
  document.querySelectorAll('.session-card').forEach(card => {
    const roomId = card.dataset.roomId;
    const session = allSessions[roomId];
    
    // 카드 클릭 (상세 보기)
    card.addEventListener('click', (e) => {
      if (!e.target.closest('.session-btn')) {
        showSessionDetail(session);
      }
    });
    
    // 버튼 액션
    card.querySelectorAll('.session-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        
        switch (action) {
          case 'open':
            browser.tabs.create({ url: session.url });
            break;
          case 'copy':
            await navigator.clipboard.writeText(session.url);
            btn.textContent = '✓';
            setTimeout(() => btn.textContent = '📋', 1000);
            break;
          case 'delete':
            if (confirm(`"${session.roomName || session.roomId}"를 삭제하시겠습니까?`)) {
              await deleteSession(roomId);
            }
            break;
        }
      });
    });
  });
}

// ===== 세션 삭제 =====
async function deleteSession(roomId) {
  delete allSessions[roomId];
  await browser.storage.local.set({ sessions: allSessions });
  await loadSessions();
  updateStats();
  renderSessions();
}

// ===== 세션 상세 보기 =====
function showSessionDetail(session) {
  const modal = document.getElementById('modal');
  const modalTitle = document.getElementById('modal-title');
  const modalBody = document.getElementById('modal-body');
  
  modalTitle.textContent = session.roomName || `세션 ${session.roomId}`;
  
  modalBody.innerHTML = `
    <div class="session-detail">
      <div class="detail-row">
        <strong>세션 ID:</strong>
        <span>${session.roomId}</span>
      </div>
      <div class="detail-row">
        <strong>URL:</strong>
        <a href="${session.url}" target="_blank">${session.url}</a>
      </div>
      <div class="detail-row">
        <strong>첫 방문:</strong>
        <span>${new Date(session.timestamp).toLocaleString('ko-KR')}</span>
      </div>
      <div class="detail-row">
        <strong>마지막 방문:</strong>
        <span>${new Date(session.lastVisited).toLocaleString('ko-KR')}</span>
      </div>
      <div class="detail-row">
        <strong>총 방문 횟수:</strong>
        <span>${session.visitCount || 1}회</span>
      </div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-primary" onclick="browser.tabs.create({url: '${session.url}'})">
        세션 열기
      </button>
    </div>
  `;
  
  modal.style.display = 'flex';
}

// ===== 모달 닫기 =====
function closeModal() {
  document.getElementById('modal').style.display = 'none';
}

// ===== 내보내기 =====
async function exportSessions() {
  const dataStr = JSON.stringify(allSessions, null, 2);
  const dataBlob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(dataBlob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `ccfolia-sessions-${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// 추가 스타일 (모달 상세 정보)
const style = document.createElement('style');
style.textContent = `
  .session-detail {
    margin-bottom: 20px;
  }
  
  .detail-row {
    padding: 10px 0;
    border-bottom: 1px solid #f0f0f0;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  
  .detail-row:last-child {
    border-bottom: none;
  }
  
  .detail-row strong {
    color: #2c3e50;
    font-weight: 500;
  }
  
  .detail-row a {
    color: #667eea;
    text-decoration: none;
  }
  
  .detail-row a:hover {
    text-decoration: underline;
  }
  
  .modal-actions {
    display: flex;
    gap: 10px;
    justify-content: flex-end;
    padding-top: 20px;
    border-top: 1px solid #f0f0f0;
  }
`;
document.head.appendChild(style);