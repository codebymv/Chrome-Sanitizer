chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.action === 'openSanitizer') {
    const sanitizerUrl = chrome.runtime.getURL('sanitizer.html');
    void chrome.tabs.create({ url: sanitizerUrl });
    sendResponse({ ok: true });
  }
});
