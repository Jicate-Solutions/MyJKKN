/**
 * JKKN Chatbot Widget
 *
 * Embeddable JavaScript widget for JKKN websites.
 * Self-contained, no external dependencies.
 *
 * Usage:
 * <script src="https://myjkkn.vercel.app/chatbot-widget.js"
 *         data-chatbot-id="uuid"
 *         data-institution="JKKN"></script>
 */
(function() {
  'use strict';

  // ═══════════════════════════════════════════════════════════════
  // CONFIGURATION
  // ═══════════════════════════════════════════════════════════════

  var scriptTag = document.currentScript || (function() {
    var scripts = document.getElementsByTagName('script');
    return scripts[scripts.length - 1];
  })();

  var CONFIG = {
    chatbotId: scriptTag.getAttribute('data-chatbot-id') || '',
    institution: scriptTag.getAttribute('data-institution') || 'JKKN',
    apiBase: scriptTag.src ? scriptTag.src.replace('/chatbot-widget.js', '') : window.location.origin,
    position: scriptTag.getAttribute('data-position') || 'bottom-right',
  };

  if (!CONFIG.chatbotId) {
    console.error('[JKKN Chatbot] data-chatbot-id attribute is required');
    return;
  }

  // ═══════════════════════════════════════════════════════════════
  // BRAND COLORS
  // ═══════════════════════════════════════════════════════════════

  var COLORS = {
    green: '#0b6d41',
    cream: '#fbfbee',
    yellow: '#ffde59',
    white: '#ffffff',
    text: '#1a1a1a',
    textLight: '#666666',
    border: '#e5e5e5',
  };

  // ═══════════════════════════════════════════════════════════════
  // STYLES
  // ═══════════════════════════════════════════════════════════════

  var STYLES = '\
    #jkkn-chatbot-widget * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }\
    #jkkn-chatbot-bubble {\
      position: fixed; bottom: 20px; right: 20px; z-index: 999999;\
      width: 60px; height: 60px; border-radius: 50%;\
      background: ' + COLORS.green + '; color: ' + COLORS.white + ';\
      display: flex; align-items: center; justify-content: center;\
      cursor: pointer; box-shadow: 0 4px 12px rgba(0,0,0,0.15);\
      transition: transform 0.2s, box-shadow 0.2s;\
    }\
    #jkkn-chatbot-bubble:hover { transform: scale(1.05); box-shadow: 0 6px 20px rgba(0,0,0,0.2); }\
    #jkkn-chatbot-bubble svg { width: 28px; height: 28px; }\
    #jkkn-chatbot-badge {\
      position: absolute; top: -4px; right: -4px;\
      background: ' + COLORS.yellow + '; color: ' + COLORS.text + ';\
      font-size: 11px; font-weight: 700; width: 20px; height: 20px;\
      border-radius: 50%; display: none; align-items: center; justify-content: center;\
    }\
    #jkkn-chatbot-panel {\
      position: fixed; bottom: 90px; right: 20px; z-index: 999999;\
      width: 380px; max-width: calc(100vw - 40px); height: 520px; max-height: calc(100vh - 120px);\
      background: ' + COLORS.white + '; border-radius: 16px;\
      box-shadow: 0 8px 30px rgba(0,0,0,0.12);\
      display: none; flex-direction: column; overflow: hidden;\
      border: 1px solid ' + COLORS.border + ';\
    }\
    #jkkn-chatbot-panel.open { display: flex; }\
    #jkkn-chatbot-header {\
      background: ' + COLORS.green + '; color: ' + COLORS.white + ';\
      padding: 16px 20px; display: flex; align-items: center; justify-content: space-between;\
    }\
    #jkkn-chatbot-header-info { display: flex; align-items: center; gap: 12px; }\
    #jkkn-chatbot-header-avatar {\
      width: 36px; height: 36px; border-radius: 50%;\
      background: rgba(255,255,255,0.2); display: flex; align-items: center; justify-content: center;\
    }\
    #jkkn-chatbot-header-avatar svg { width: 20px; height: 20px; }\
    #jkkn-chatbot-header-text h3 { font-size: 14px; font-weight: 600; margin-bottom: 2px; }\
    #jkkn-chatbot-header-text p { font-size: 11px; opacity: 0.85; }\
    #jkkn-chatbot-close {\
      background: none; border: none; color: ' + COLORS.white + ';\
      cursor: pointer; padding: 4px; border-radius: 4px;\
    }\
    #jkkn-chatbot-close:hover { background: rgba(255,255,255,0.15); }\
    #jkkn-chatbot-close svg { width: 20px; height: 20px; }\
    #jkkn-chatbot-messages {\
      flex: 1; overflow-y: auto; padding: 16px;\
      background: ' + COLORS.cream + ';\
    }\
    .jkkn-msg { margin-bottom: 12px; display: flex; }\
    .jkkn-msg-user { justify-content: flex-end; }\
    .jkkn-msg-bot { justify-content: flex-start; }\
    .jkkn-msg-bubble {\
      max-width: 80%; padding: 10px 14px; border-radius: 12px;\
      font-size: 14px; line-height: 1.5; word-break: break-word;\
    }\
    .jkkn-msg-user .jkkn-msg-bubble {\
      background: ' + COLORS.green + '; color: ' + COLORS.white + ';\
      border-bottom-right-radius: 4px;\
    }\
    .jkkn-msg-bot .jkkn-msg-bubble {\
      background: ' + COLORS.white + '; color: ' + COLORS.text + ';\
      border: 1px solid ' + COLORS.border + '; border-bottom-left-radius: 4px;\
    }\
    .jkkn-msg-system .jkkn-msg-bubble {\
      background: ' + COLORS.yellow + '; color: ' + COLORS.text + ';\
      font-size: 12px; text-align: center; margin: 0 auto;\
    }\
    .jkkn-typing { display: flex; gap: 4px; padding: 4px 0; }\
    .jkkn-typing span {\
      width: 6px; height: 6px; border-radius: 50%;\
      background: ' + COLORS.textLight + '; animation: jkkn-bounce 1.4s infinite;\
    }\
    .jkkn-typing span:nth-child(2) { animation-delay: 0.2s; }\
    .jkkn-typing span:nth-child(3) { animation-delay: 0.4s; }\
    @keyframes jkkn-bounce {\
      0%, 60%, 100% { transform: translateY(0); }\
      30% { transform: translateY(-8px); }\
    }\
    #jkkn-chatbot-input-area {\
      padding: 12px 16px; border-top: 1px solid ' + COLORS.border + ';\
      display: flex; gap: 8px; background: ' + COLORS.white + ';\
    }\
    #jkkn-chatbot-input {\
      flex: 1; border: 1px solid ' + COLORS.border + '; border-radius: 8px;\
      padding: 10px 14px; font-size: 14px; outline: none;\
      resize: none; height: 40px; line-height: 20px;\
    }\
    #jkkn-chatbot-input:focus { border-color: ' + COLORS.green + '; }\
    #jkkn-chatbot-send {\
      width: 40px; height: 40px; border-radius: 8px;\
      background: ' + COLORS.green + '; color: ' + COLORS.white + ';\
      border: none; cursor: pointer; display: flex;\
      align-items: center; justify-content: center;\
      transition: opacity 0.2s;\
    }\
    #jkkn-chatbot-send:disabled { opacity: 0.5; cursor: not-allowed; }\
    #jkkn-chatbot-send svg { width: 18px; height: 18px; }\
    #jkkn-chatbot-powered {\
      text-align: center; padding: 6px; font-size: 10px;\
      color: ' + COLORS.textLight + '; background: ' + COLORS.white + ';\
    }\
    @media (max-width: 480px) {\
      #jkkn-chatbot-panel {\
        bottom: 0; right: 0; left: 0; width: 100%; max-width: 100%;\
        height: 100vh; max-height: 100vh; border-radius: 0;\
      }\
      #jkkn-chatbot-bubble { bottom: 16px; right: 16px; }\
    }\
  ';

  // ═══════════════════════════════════════════════════════════════
  // SVG ICONS
  // ═══════════════════════════════════════════════════════════════

  var ICON_CHAT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 21 1.9-5.7a8.5 8.5 0 1 1 3.8 3.8z"/></svg>';
  var ICON_CLOSE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
  var ICON_SEND = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>';
  var ICON_BOT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><line x1="8" y1="16" x2="8" y2="16"/><line x1="16" y1="16" x2="16" y2="16"/></svg>';

  // ═══════════════════════════════════════════════════════════════
  // STATE
  // ═══════════════════════════════════════════════════════════════

  var state = {
    isOpen: false,
    sessionId: getStoredSessionId(),
    messages: [],
    isLoading: false,
  };

  // ═══════════════════════════════════════════════════════════════
  // STORAGE
  // ═══════════════════════════════════════════════════════════════

  function getStoredSessionId() {
    try {
      return localStorage.getItem('jkkn_chatbot_session_' + CONFIG.chatbotId) || null;
    } catch (e) {
      return null;
    }
  }

  function storeSessionId(id) {
    try {
      localStorage.setItem('jkkn_chatbot_session_' + CONFIG.chatbotId, id);
    } catch (e) { /* ignore */ }
  }

  function getVisitorId() {
    try {
      var vid = localStorage.getItem('jkkn_chatbot_visitor');
      if (!vid) {
        vid = 'v_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
        localStorage.setItem('jkkn_chatbot_visitor', vid);
      }
      return vid;
    } catch (e) {
      return 'v_' + Math.random().toString(36).substr(2, 9);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // DOM
  // ═══════════════════════════════════════════════════════════════

  function init() {
    // Inject styles
    var style = document.createElement('style');
    style.textContent = STYLES;
    document.head.appendChild(style);

    // Create container
    var container = document.createElement('div');
    container.id = 'jkkn-chatbot-widget';
    container.innerHTML = '\
      <div id="jkkn-chatbot-bubble">\
        ' + ICON_CHAT + '\
        <div id="jkkn-chatbot-badge">1</div>\
      </div>\
      <div id="jkkn-chatbot-panel">\
        <div id="jkkn-chatbot-header">\
          <div id="jkkn-chatbot-header-info">\
            <div id="jkkn-chatbot-header-avatar">' + ICON_BOT + '</div>\
            <div id="jkkn-chatbot-header-text">\
              <h3>' + CONFIG.institution + ' Admissions</h3>\
              <p>AI Assistant - Typically replies instantly</p>\
            </div>\
          </div>\
          <button id="jkkn-chatbot-close">' + ICON_CLOSE + '</button>\
        </div>\
        <div id="jkkn-chatbot-messages"></div>\
        <div id="jkkn-chatbot-input-area">\
          <input id="jkkn-chatbot-input" type="text" placeholder="Type your message..." autocomplete="off" />\
          <button id="jkkn-chatbot-send" disabled>' + ICON_SEND + '</button>\
        </div>\
        <div id="jkkn-chatbot-powered">Powered by JKKN AI</div>\
      </div>\
    ';
    document.body.appendChild(container);

    // Event listeners
    document.getElementById('jkkn-chatbot-bubble').addEventListener('click', togglePanel);
    document.getElementById('jkkn-chatbot-close').addEventListener('click', togglePanel);
    document.getElementById('jkkn-chatbot-send').addEventListener('click', sendMessage);

    var input = document.getElementById('jkkn-chatbot-input');
    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
    input.addEventListener('input', function() {
      document.getElementById('jkkn-chatbot-send').disabled = !input.value.trim();
    });
  }

  function togglePanel() {
    state.isOpen = !state.isOpen;
    var panel = document.getElementById('jkkn-chatbot-panel');
    var bubble = document.getElementById('jkkn-chatbot-bubble');

    if (state.isOpen) {
      panel.classList.add('open');
      bubble.innerHTML = ICON_CLOSE + '<div id="jkkn-chatbot-badge" style="display:none"></div>';

      // Start session if needed
      if (!state.sessionId) {
        startSession();
      }

      // Focus input
      setTimeout(function() {
        document.getElementById('jkkn-chatbot-input').focus();
      }, 100);
    } else {
      panel.classList.remove('open');
      bubble.innerHTML = ICON_CHAT + '<div id="jkkn-chatbot-badge" style="display:none"></div>';
    }
  }

  function addMessage(role, content) {
    state.messages.push({ role: role, content: content });

    var container = document.getElementById('jkkn-chatbot-messages');
    var msgClass = role === 'user' ? 'jkkn-msg-user' : role === 'system' ? 'jkkn-msg-system' : 'jkkn-msg-bot';

    var div = document.createElement('div');
    div.className = 'jkkn-msg ' + msgClass;
    div.innerHTML = '<div class="jkkn-msg-bubble">' + escapeHtml(content) + '</div>';
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  }

  function showTyping() {
    var container = document.getElementById('jkkn-chatbot-messages');
    var div = document.createElement('div');
    div.className = 'jkkn-msg jkkn-msg-bot';
    div.id = 'jkkn-typing-indicator';
    div.innerHTML = '<div class="jkkn-msg-bubble"><div class="jkkn-typing"><span></span><span></span><span></span></div></div>';
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  }

  function hideTyping() {
    var el = document.getElementById('jkkn-typing-indicator');
    if (el) el.remove();
  }

  function escapeHtml(text) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(text));
    return div.innerHTML;
  }

  // ═══════════════════════════════════════════════════════════════
  // API
  // ═══════════════════════════════════════════════════════════════

  function startSession() {
    state.isLoading = true;

    fetch(CONFIG.apiBase + '/api/chatbot/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chatbot_id: CONFIG.chatbotId,
        channel: 'website',
        visitor_id: getVisitorId(),
      }),
    })
    .then(function(res) { return res.json(); })
    .then(function(data) {
      if (data.session) {
        state.sessionId = data.session.id;
        storeSessionId(data.session.id);

        // Show welcome message
        addMessage('assistant', 'Hello! I am the ' + CONFIG.institution + ' Admissions Assistant. How can I help you today?');
      }
    })
    .catch(function(err) {
      console.error('[JKKN Chatbot] Failed to start session:', err);
      addMessage('system', 'Unable to connect. Please try again later.');
    })
    .finally(function() {
      state.isLoading = false;
    });
  }

  function sendMessage() {
    var input = document.getElementById('jkkn-chatbot-input');
    var text = input.value.trim();
    if (!text || state.isLoading) return;

    input.value = '';
    document.getElementById('jkkn-chatbot-send').disabled = true;
    state.isLoading = true;

    // Show user message
    addMessage('user', text);
    showTyping();

    var body = {
      message: text,
      chatbot_id: CONFIG.chatbotId,
      visitor_id: getVisitorId(),
    };

    if (state.sessionId) {
      body.session_id = state.sessionId;
    }

    fetch(CONFIG.apiBase + '/api/chatbot/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    .then(function(res) { return res.json(); })
    .then(function(data) {
      hideTyping();

      if (data.error) {
        addMessage('system', data.error);
        return;
      }

      // Update session ID if new one was created
      if (data.session_id && data.session_id !== state.sessionId) {
        state.sessionId = data.session_id;
        storeSessionId(data.session_id);
      }

      if (data.response) {
        addMessage('assistant', data.response);
      }

      if (data.action && data.action.type === 'handoff') {
        addMessage('system', 'You are being connected to a counselor. They will be with you shortly.');
      }
    })
    .catch(function(err) {
      hideTyping();
      console.error('[JKKN Chatbot] Error:', err);
      addMessage('system', 'Something went wrong. Please try again.');
    })
    .finally(function() {
      state.isLoading = false;
      input.focus();
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // INIT
  // ═══════════════════════════════════════════════════════════════

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
