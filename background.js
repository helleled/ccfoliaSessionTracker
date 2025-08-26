// ===== 메시지 처리 (응답 추가) =====
browser.runtime.onMessage.addListener(async (message, sender) => {
  console.log('[Background] Received message:', message.action);
  
  if (message.action === 'saveSession') {
    const { roomId, url, roomName, pageTitle } = message.data;
    console.log('[Background] Saving session:', { roomId, roomName, url });
    
    const result = await saveSessionRoom(url, roomName, pageTitle, roomId);
    
    // 모든 CCFOLIA 탭에 업데이트 알림
    const tabs = await browser.tabs.query({ url: "*://ccfolia.com/*" });
    tabs.forEach(tab => {
      if (tab.id !== sender.tab.id) {
        browser.tabs.sendMessage(tab.id, { 
          action: 'sessionsUpdated' 
        }).catch(err => {
          console.log('Tab not ready:', tab.id);
        });
      }
    });
    
    // 응답 반환 (중요!)
    return { success: result, message: result ? '저장 성공' : '저장 실패' };
    
  } else if (message.action === 'openDashboard') {
    openDashboard();
    return { success: true };
    
  } else if (message.action === 'getStats') {
    return await getSessionStats();
    
  } else if (message.action === 'clearAllSessions') {
    return await clearAllSessions();
    
  } else if (message.action === 'exportSessions') {
    return await exportSessions();
  }
  
  return { success: false, message: 'Unknown action' };
});

// ===== 세션 저장 함수 (로그 추가) =====
async function saveSessionRoom(url, roomName, pageTitle, roomId) {
  try {
    console.log('[Background] saveSessionRoom called:', { url, roomName, roomId });
    
    const sessionData = {
      roomId: roomId,
      url: url,
      roomName: roomName || null,
      title: pageTitle || null,
      timestamp: new Date().toISOString(),
      lastVisited: new Date().toISOString()
    };
    
    // 기존 세션 가져오기
    const result = await browser.storage.local.get('sessions');
    let sessions = result.sessions || {};
    
    // 업데이트 또는 신규 추가
    if (sessions[roomId]) {
      sessions[roomId].lastVisited = new Date().toISOString();
      sessions[roomId].visitCount = (sessions[roomId].visitCount || 1) + 1;
      
      if (roomName && !sessions[roomId].roomName) {
        sessions[roomId].roomName = roomName;
      }
      console.log('[Background] Updated existing session:', sessions[roomId]);
    } else {
      sessions[roomId] = { 
        ...sessionData, 
        visitCount: 1 
      };
      console.log('[Background] Created new session:', sessions[roomId]);
    }
    
    // 저장
    await browser.storage.local.set({ sessions: sessions });
    
    // 배지 업데이트
    updateBadge(Object.keys(sessions).length);
    
    console.log('[Background] Session saved successfully');
    return true;
  } catch (error) {
    console.error('[Background] Error saving session:', error);
    return false;
  }
}

// ===== 대시보드 열기 =====
async function openDashboard() {
  const dashboardUrl = browser.runtime.getURL('dashboard.html');
  const tabs = await browser.tabs.query({});
  
  for (const tab of tabs) {
    if (tab.url === dashboardUrl) {
      await browser.tabs.update(tab.id, { active: true });
      await browser.windows.update(tab.windowId, { focused: true });
      return;
    }
  }
  
  browser.tabs.create({ url: dashboardUrl });
}

// ===== 통계 정보 =====
async function getSessionStats() {
  const result = await browser.storage.local.get('sessions');
  const sessions = result.sessions || {};
  
  const totalSessions = Object.keys(sessions).length;
  const totalVisits = Object.values(sessions).reduce(
    (sum, session) => sum + (session.visitCount || 1), 0
  );
  
  const recentSessions = Object.values(sessions)
    .sort((a, b) => new Date(b.lastVisited) - new Date(a.lastVisited))
    .slice(0, 5);
  
  return {
    totalSessions,
    totalVisits,
    recentSessions
  };
}

// ===== 데이터 관리 =====
async function clearAllSessions() {
  try {
    await browser.storage.local.set({ sessions: {} });
    updateBadge(0);
    return true;
  } catch (error) {
    console.error('[Background] Error clearing sessions:', error);
    return false;
  }
}

async function exportSessions() {
  const result = await browser.storage.local.get('sessions');
  return result.sessions || {};
}

// ===== 배지 업데이트 =====
function updateBadge(count) {
  if (count > 0) {
    browser.browserAction.setBadgeText({ 
      text: count > 99 ? '99+' : count.toString() 
    });
    browser.browserAction.setBadgeBackgroundColor({ 
      color: '#667eea' 
    });
  } else {
    browser.browserAction.setBadgeText({ text: '' });
  }
}

// ===== 초기화 =====
async function initialize() {
  const result = await browser.storage.local.get('sessions');
  const sessions = result.sessions || {};
  updateBadge(Object.keys(sessions).length);
  
  console.log('[Background] CCFOLIA Session Tracker initialized');
  console.log('[Background] Stored sessions:', Object.keys(sessions).length);
}

// ===== 설치/업데이트 시 =====
browser.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('[Background] Extension installed');
    openDashboard();
  } else if (details.reason === 'update') {
    console.log('[Background] Extension updated');
  }
});

// 시작
initialize();