// service-worker.js (Firefox 호환)
chrome.runtime.onInstalled.addListener(() => {
  console.log("CCFOLIA 확장 Service Worker 설치됨");
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'ping') {
    sendResponse({ status: 'pong' });
  }
});