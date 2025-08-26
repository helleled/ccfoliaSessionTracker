console.log('[CCFOLIA Tracker] Content script loaded at:', new Date().toISOString());
console.log('[CCFOLIA Tracker] Current URL:', window.location.href);

// ===== 전역 상태 =====
let isInitialized = false;
let currentPath = window.location.pathname;
let retryCount = 0;
const MAX_RETRIES = 10;

// ===== 디버깅 헬퍼 =====
function debugLog(message, ...data) {
  console.log(`[CCFOLIA Tracker] ${message}`, ...data);
}

// ===== React 앱 감지 =====
async function waitForReactApp(timeout = 10000) {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    const root = document.getElementById('root');
    if (root && root.children.length > 0) {
      const hasContent = root.querySelector('div');
      if (hasContent) {
        debugLog('React app detected');
        return true;
      }
    }
    
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  
  debugLog('React app detection timeout');
  return false;
}

// ===== 홈 페이지 확인 =====
function isHomePage() {
  return window.location.pathname === '/home';
}

// ===== 세션 룸 확인 =====
function isSessionRoom() {
  const url = window.location.href;
  const pathname = window.location.pathname;
  
  const patterns = [
    /\/rooms?\/([a-zA-Z0-9\-_]+)/,
    /\/session\/([a-zA-Z0-9\-_]+)/,
    /\/play\/([a-zA-Z0-9\-_]+)/,
  ];
  
  const isRoom = patterns.some(pattern => pattern.test(pathname));
  
  debugLog('Session room check:', {
    url: url,
    pathname: pathname,
    isRoom: isRoom
  });
  
  return isRoom;
}

// ===== 룸 ID 추출 =====
function extractRoomId() {
  const pathname = window.location.pathname;
  
  const patterns = [
    /\/rooms?\/([a-zA-Z0-9\-_]+)/,
    /\/session\/([a-zA-Z0-9\-_]+)/,
    /\/play\/([a-zA-Z0-9\-_]+)/,
  ];
  
  for (const pattern of patterns) {
    const match = pathname.match(pattern);
    if (match) {
      debugLog('Room ID found:', match[1]);
      return match[1];
    }
  }
  
  debugLog('Room ID not found for pathname:', pathname);
  return null;
}

// ===== 룸 이름 추출 =====
async function extractRoomName(maxAttempts = 30) {
  debugLog('Attempting to extract room name...');
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
    debugLog(`Found ${headings.length} heading elements`);
    
    for (const heading of headings) {
      const text = heading.textContent?.trim();
      
      if (text && text.length > 2 && text.length < 100) {
        const excludePatterns = [
          /^CCFOLIA/i,
          /^ココフォリア/,
          /^ログ/,
          /^設定/,
          /^メニュー/,
          /^ホーム/,
          /^マイページ/,
          /^新規/,
          /^作成/,
          /^参加/,
        ];
        
        if (!excludePatterns.some(pattern => pattern.test(text))) {
          const rect = heading.getBoundingClientRect();
          const isVisible = rect.width > 0 && rect.height > 0;
          const fontSize = window.getComputedStyle(heading).fontSize;
          
          debugLog('Potential room name found:', {
            text: text,
            tag: heading.tagName,
            visible: isVisible,
            fontSize: fontSize
          });
          
          if (isVisible) {
            return text;
          }
        }
      }
    }
    
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  
  if (document.title) {
    const title = document.title.replace(/CCFOLIA\s*[\-\|–]\s*/, '').trim();
    if (title && title.length > 2) {
      debugLog('Room name from document title:', title);
      return title;
    }
  }
  
  debugLog('Room name not found after all attempts');
  return null;
}

// ===== 홈 화면에 세션 목록 UI 추가 =====
async function addSessionListToHome() {
  debugLog('Adding session list to home page...');
  
  // 저장된 세션 가져오기
  const result = await browser.storage.local.get('sessions');
  const sessions = result.sessions || {};
  
  if (Object.keys(sessions).length === 0) {
    debugLog('No sessions to display');
    return;
  }
  
  // 기존 UI 제거
  const existingUI = document.getElementById('ccfolia-tracker-ui');
  if (existingUI) {
    existingUI.remove();
  }
  
  // UI 컨테이너 생성
  const container = document.createElement('div');
  container.id = 'ccfolia-tracker-ui';
  container.style.cssText = `
    background: white;
    border-radius: 12px;
    padding: 20px;
    margin: 20px;
    box-shadow: 0 2px 12px rgba(0,0,0,0.1);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  `;
  
  // 헤더
  const header = document.createElement('div');
  header.style.cssText = `
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
    padding-bottom: 15px;
    border-bottom: 2px solid #f0f0f0;
  `;
  
  const title = document.createElement('h3');
  title.textContent = '🎲 최근 세션';
  title.style.cssText = `
    margin: 0;
    font-size: 20px;
    color: #333;
  `;
  
  const dashboardBtn = document.createElement('button');
  dashboardBtn.textContent = '📊 모두 보기';
  dashboardBtn.style.cssText = `
    background: #667eea;
    color: white;
    border: none;
    padding: 8px 16px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
  `;
  dashboardBtn.addEventListener('click', () => {
    browser.runtime.sendMessage({ action: 'openDashboard' });
  });
  
  header.appendChild(title);
  header.appendChild(dashboardBtn);
  container.appendChild(header);
  
  // 세션 목록
  const sessionList = document.createElement('div');
  sessionList.style.cssText = `
    display: grid;
    gap: 10px;
    max-height: 400px;
    overflow-y: auto;
  `;
  
  // 최근 10개 세션만 표시
  const sortedSessions = Object.values(sessions)
    .sort((a, b) => new Date(b.lastVisited) - new Date(a.lastVisited))
    .slice(0, 10);
  
  sortedSessions.forEach(session => {
    const sessionItem = createSessionItem(session);
    sessionList.appendChild(sessionItem);
  });
  
  container.appendChild(sessionList);
  
  // 페이지에 삽입
  insertUIIntoPage(container);
}

// ===== 세션 아이템 생성 =====
function createSessionItem(session) {
  const item = document.createElement('div');
  item.style.cssText = `
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px;
    background: #f9f9f9;
    border-radius: 8px;
    transition: all 0.2s;
    cursor: pointer;
  `;
  
  item.addEventListener('mouseenter', () => {
    item.style.background = '#f0f0f0';
    item.style.transform = 'translateX(4px)';
  });
  
  item.addEventListener('mouseleave', () => {
    item.style.background = '#f9f9f9';
    item.style.transform = 'translateX(0)';
  });
  
  // 세션 정보
  const info = document.createElement('div');
  info.style.cssText = `flex: 1;`;
  
  const name = document.createElement('div');
  name.textContent = session.roomName || `세션 ${session.roomId}`;
  name.style.cssText = `
    font-weight: 500;
    color: #333;
    margin-bottom: 4px;
  `;
  
  const meta = document.createElement('div');
  meta.style.cssText = `
    font-size: 12px;
    color: #666;
  `;
  
  const lastVisited = new Date(session.lastVisited);
  const timeAgo = formatTimeAgo(lastVisited);
  meta.textContent = `${timeAgo} • 방문 ${session.visitCount || 1}회`;
  
  info.appendChild(name);
  info.appendChild(meta);
  
  // アクションボタン
  const actions = document.createElement('div');
  actions.style.cssText = `
    display: flex;
    gap: 8px;
  `;
  
  const openBtn = document.createElement('button');
  openBtn.textContent = '열기';
  openBtn.style.cssText = `
    background: #667eea;
    color: white;
    border: none;
    padding: 6px 12px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
  `;
  
  openBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    window.location.href = session.url;
  });
  
  actions.appendChild(openBtn);
  
  item.appendChild(info);
  item.appendChild(actions);
  
  // 全体クリックでも開く
  item.addEventListener('click', () => {
    window.location.href = session.url;
  });
  
  return item;
}

// ===== 時間フォーマット =====
function formatTimeAgo(date) {
  const now = new Date();
  const diff = now - date;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  
  if (minutes < 1) return '지금';
  if (minutes < 60) return `${minutes}분 전`;
  if (hours < 24) return `${hours}시간 전`;
  if (days < 30) return `${days}일 전`;
  
  return date.toLocaleDateString('ko-KR');
}

// ===== UIをページに挿入 =====
function insertUIIntoPage(container) {
  // いくつかの可能な挿入位置を試す
  const possibleTargets = [
    'main',
    '[role="main"]',
    '.MuiContainer-root',
    '#root > div > div',
    '#root > div'
  ];
  
  for (const selector of possibleTargets) {
    const target = document.querySelector(selector);
    if (target) {
      // 最初の子要素として挿入
      if (target.firstChild) {
        target.insertBefore(container, target.firstChild);
      } else {
        target.appendChild(container);
      }
      debugLog('Session list UI inserted into:', selector);
      return;
    }
  }
  
  // フォールバック
  document.body.appendChild(container);
  debugLog('Session list UI appended to body');
}

// ===== セッション情報収集・保存 =====
async function collectAndSaveRoomInfo(force = false) {
  debugLog('collectAndSaveRoomInfo called, force:', force);
  
  if (!force && !isSessionRoom()) {
    debugLog('Not a session room, skipping');
    return;
  }
  
  const roomId = extractRoomId();
  if (!roomId) {
    debugLog('No room ID found');
    return;
  }
  
  debugLog('Collecting session info for room:', roomId);
  
  const roomName = await extractRoomName();
  
  try {
    const response = await browser.runtime.sendMessage({
      action: 'saveSession',
      data: {
        roomId: roomId,
        url: window.location.href,
        roomName: roomName || document.title || '이름 없는 세션',
        pageTitle: document.title
      }
    });
    
    debugLog('Session save response:', response);
    
    if (response && response.success) {
      showSaveNotification();
    }
    
  } catch (error) {
    debugLog('Failed to save session:', error);
  }
}

// ===== 保存通知 =====
function showSaveNotification() {
  const notification = document.createElement('div');
  notification.textContent = '✅ 세션 저장됨';
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #4caf50;
    color: white;
    padding: 10px 20px;
    border-radius: 4px;
    z-index: 10000;
    font-size: 14px;
    box-shadow: 0 2px 5px rgba(0,0,0,0.2);
  `;
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.style.opacity = '0';
    notification.style.transition = 'opacity 0.3s';
    setTimeout(() => notification.remove(), 300);
  }, 2000);
}

// ===== URL変更監視 =====
function watchRouteChanges() {
  debugLog('Setting up route change detection');
  
  let lastUrl = window.location.href;
  
  // 定期的にURL確認
  setInterval(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      debugLog('URL changed (interval):', lastUrl);
      handleRouteChange();
    }
  }, 1000);
  
  // History API
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;
  
  history.pushState = function() {
    originalPushState.apply(history, arguments);
    setTimeout(() => handleRouteChange(), 100);
  };
  
  history.replaceState = function() {
    originalReplaceState.apply(history, arguments);
    setTimeout(() => handleRouteChange(), 100);
  };
  
  window.addEventListener('popstate', handleRouteChange);
}

// ===== ルート変更処理 =====
async function handleRouteChange() {
  const newPath = window.location.pathname;
  
  debugLog('Route change detected:', {
    old: currentPath,
    new: newPath,
    url: window.location.href
  });
  
  currentPath = newPath;
  
  await new Promise(resolve => setTimeout(resolve, 1500));
  
  if (isHomePage()) {
    await addSessionListToHome();
  } else if (isSessionRoom()) {
    await collectAndSaveRoomInfo(false);
  }
}

// ===== DOM変更監視 =====
function setupMutationObserver() {
  debugLog('Setting up mutation observer');
  
  let debounceTimer;
  
  const observer = new MutationObserver(() => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      if (isSessionRoom()) {
        debugLog('DOM changed significantly, recollecting...');
        collectAndSaveRoomInfo();
      } else if (isHomePage()) {
        // ホーム画面でUIが消えた場合、再表示
        if (!document.getElementById('ccfolia-tracker-ui')) {
          addSessionListToHome();
        }
      }
    }, 2000);
  });
  
  const targetNode = document.getElementById('root') || document.body;
  observer.observe(targetNode, {
    childList: true,
    subtree: true
  });
  
  debugLog('Mutation observer attached to:', targetNode.tagName);
}

// ===== 初期化 =====
async function initialize() {
  debugLog('Initializing... Attempt:', retryCount + 1);
  
  try {
    const reactReady = await waitForReactApp();
    
    if (!reactReady && retryCount < MAX_RETRIES) {
      retryCount++;
      debugLog('React not ready, retrying in 1 second...');
      setTimeout(initialize, 1000);
      return;
    }
    
    if (!isInitialized) {
      isInitialized = true;
      
      watchRouteChanges();
      setupMutationObserver();
      
      // 現在のページに応じて処理
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      if (isHomePage()) {
        await addSessionListToHome();
      } else if (isSessionRoom()) {
        await collectAndSaveRoomInfo();
      }
      
      debugLog('Initialization complete');
    }
  } catch (error) {
    debugLog('Initialization error:', error);
    
    if (retryCount < MAX_RETRIES) {
      retryCount++;
      setTimeout(initialize, 1000);
    }
  }
}

// 메시지 리스너
browser.runtime.onMessage.addListener((message) => {
  debugLog('Received message:', message.action);
  
  if (message.action === 'pageLoaded') {
    if (isSessionRoom()) {
      collectAndSaveRoomInfo();
    }
  } else if (message.action === 'sessionsUpdated') {
    if (isHomePage()) {
      addSessionListToHome();
    }
  }
});

// 시작
debugLog('Starting initialization process...');
debugLog('Document ready state:', document.readyState);

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}

window.addEventListener('load', () => {
  if (!isInitialized) {
    debugLog('Fallback initialization on load event');
    initialize();
  }
});