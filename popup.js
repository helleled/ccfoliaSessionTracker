// 팝업 초기화
document.addEventListener('DOMContentLoaded', async () => {
  // 간단한 통계 표시
  const result = await browser.storage.local.get('sessions');
  const sessions = Object.values(result.sessions || {});
  
  document.getElementById('quick-total').textContent = sessions.length;
  
  // 오늘 방문한 세션
  const today = new Date().toDateString();
  const todayCount = sessions.filter(s => 
    new Date(s.lastVisited).toDateString() === today
  ).length;
  document.getElementById('quick-today').textContent = todayCount;
  
  // 대시보드 열기
  document.getElementById('open-dashboard').addEventListener('click', () => {
    browser.tabs.create({ 
      url: browser.runtime.getURL('dashboard.html') 
    });
    window.close();
  });
  
  // CCFOLIA 열기
  document.getElementById('open-ccfolia').addEventListener('click', () => {
    browser.tabs.create({ url: 'https://ccfolia.com' });
    window.close();
  });
});