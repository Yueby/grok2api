// Playground Chat - 对话管理

let API_KEY = '';
let conversations = [];
let currentConversationId = null;
let isStreaming = false;

// 初始化
document.addEventListener('DOMContentLoaded', async () => {
  // 先配置 marked.js
  configureMarked();
  
  API_KEY = await ensureApiKey();
  if (!API_KEY) return;
  
  await loadConversations();
  renderConversationsList();
  
  // 如果没有对话，创建一个新对话
  if (conversations.length === 0) {
    newConversation();
  } else {
    loadConversation(conversations[0].id);
  }
});

// 加载对话列表（从服务器）
async function loadConversations() {
  try {
    const response = await fetch('/api/v1/admin/conversations', {
      headers: {
        'Authorization': API_KEY
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      conversations = data.conversations || [];
    } else {
      conversations = [];
      showToast('加载对话记录失败', 'error');
    }
  } catch (e) {
    conversations = [];
    console.error('加载对话记录失败:', e);
  }
}

// 保存对话列表（到服务器）
async function saveConversations() {
  try {
    const response = await fetch('/api/v1/admin/conversations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': API_KEY
      },
      body: JSON.stringify({ conversations })
    });
    
    if (!response.ok) {
      console.error('保存对话记录失败');
    }
  } catch (e) {
    console.error('保存对话记录失败:', e);
  }
}

// 新建对话
function newConversation() {
  const conversation = {
    id: Date.now().toString(),
    title: '新对话',
    messages: [],
    model: 'grok-4',
    stream: true,
    thinking: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  conversations.unshift(conversation);
  saveConversations();
  renderConversationsList();
  loadConversation(conversation.id);
}

// 渲染对话列表
function renderConversationsList() {
  const container = document.getElementById('conversations-list');
  
  if (conversations.length === 0) {
    container.innerHTML = '<div class="text-center py-8 text-[var(--accents-4)] text-xs">暂无对话</div>';
    return;
  }
  
  container.innerHTML = conversations.map(conv => {
    const preview = conv.messages.length > 0 
      ? conv.messages[conv.messages.length - 1].content.substring(0, 50) 
      : '暂无消息';
    
    const time = formatTime(conv.updatedAt);
    
    return `
      <div class="conversation-item ${conv.id === currentConversationId ? 'active' : ''}" onclick="loadConversation('${conv.id}')">
        <div class="conversation-title">${escapeHtml(conv.title)}</div>
        <div class="conversation-preview">${escapeHtml(preview)}</div>
        <div class="conversation-time">${time}</div>
        <div class="conversation-actions">
          <button class="geist-button-outline text-xs px-2 h-6" onclick="event.stopPropagation(); renameConversation('${conv.id}')">重命名</button>
          <button class="geist-button-outline text-xs px-2 h-6" onclick="event.stopPropagation(); deleteConversation('${conv.id}')">删除</button>
        </div>
      </div>
    `;
  }).join('');
}

// 加载对话
function loadConversation(id) {
  currentConversationId = id;
  const conversation = conversations.find(c => c.id === id);
  
  if (!conversation) return;
  
  // 更新标题
  document.getElementById('chat-title').textContent = conversation.title;
  
  // 更新设置
  document.getElementById('model-select').value = conversation.model || 'grok-4';
  
  // 渲染消息
  renderMessages();
  renderConversationsList();
  
  // 滚动到底部
  setTimeout(() => {
    const container = document.getElementById('messages-container');
    container.scrollTop = container.scrollHeight;
  }, 100);
}

// 渲染消息列表
function renderMessages() {
  const conversation = conversations.find(c => c.id === currentConversationId);
  if (!conversation) return;
  
  const container = document.getElementById('messages-container');
  
  if (conversation.messages.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-[var(--accents-3)]">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
        </svg>
        <p class="text-sm text-[var(--accents-4)] mt-3">开始新对话</p>
      </div>
    `;
    return;
  }
  
  container.innerHTML = conversation.messages.map((msg, index) => {
    const time = formatTime(msg.timestamp);
    const isLast = index === conversation.messages.length - 1;
    const streamingClass = isLast && isStreaming ? 'streaming' : '';
    
    // 简单的字母头像
    const avatar = msg.role === 'user' ? 'U' : 'AI';
    
    const formattedContent = formatMessageContent(msg.content);
    
    return `
      <div class="message ${msg.role}">
        <div class="message-avatar">${avatar}</div>
        <div class="message-content">
          <div class="message-bubble ${streamingClass}">${formattedContent}</div>
          <div class="message-time">${time}</div>
        </div>
      </div>
    `;
  }).join('');
}

// 配置 marked
function configureMarked() {
  if (typeof marked === 'undefined') {
    console.error('marked.js is not loaded!');
    return false;
  }
  
  marked.setOptions({
    breaks: true,
    gfm: true,
    headerIds: false,
    mangle: false,
    sanitize: false,  // 允许 HTML
    pedantic: false
  });
  
  const renderer = new marked.Renderer();
  
  // 自定义图片渲染 - 过滤无效链接
  renderer.image = function(href, title, text) {
    if (href.endsWith('/image/') || href.endsWith('/video/')) {
      return '';
    }
    return `<img src="${href}" alt="${text}" title="${title || ''}" loading="lazy">`;
  };
  
  // 自定义链接渲染 - 新标签页打开
  renderer.link = function(href, title, text) {
    return `<a href="${href}" target="_blank" rel="noopener noreferrer" title="${title || ''}">${text}</a>`;
  };
  
  marked.use({ renderer });
  console.log('marked.js configured successfully');
  return true;
}

// 简单的 Markdown 降级解析器
function fallbackMarkdown(content) {
  let html = escapeHtml(content);
  
  // 处理 <think> 标签
  html = html.replace(/&lt;think&gt;([\s\S]*?)&lt;\/think&gt;/g, (match, thinking) => {
    return `<details class="thinking-block">
<summary>💭 思维过程</summary>
<div class="thinking-content">${thinking.trim()}</div>
</details>`;
  });
  
  // 处理图片 ![alt](url)
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, alt, url) => {
    if (url.endsWith('/image/') || url.endsWith('/video/')) {
      return '';
    }
    return `<img src="${url}" alt="${alt}" loading="lazy">`;
  });
  
  // 处理链接 [text](url)
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, text, url) => {
    return `<a href="${url}" target="_blank" rel="noopener noreferrer">${text}</a>`;
  });
  
  // 处理换行
  html = html.replace(/\n/g, '<br>');
  
  return html;
}

// 格式化消息内容
function formatMessageContent(content) {
  if (typeof marked !== 'undefined') {
    try {
      // 1. 先用 HTML 注释占位符替换 <think> 标签（marked 会保留 HTML 注释）
      const thinkingBlocks = [];
      let processed = content.replace(/<think>([\s\S]*?)<\/think>/g, (match, thinking) => {
        const placeholder = `<!--THINKING_BLOCK_${thinkingBlocks.length}-->`;
        thinkingBlocks.push(thinking.trim());
        return placeholder;
      });
      
      // 2. 用 marked 渲染 Markdown
      processed = marked.parse(processed);
      
      // 3. 将 HTML 注释占位符替换回 <details> 标签
      thinkingBlocks.forEach((thinking, index) => {
        const placeholder = `<!--THINKING_BLOCK_${index}-->`;
        const detailsHtml = `<details class="thinking-block">
<summary>💭 思维过程</summary>
<div class="thinking-content">${escapeHtml(thinking).replace(/\n/g, '<br>')}</div>
</details>`;
        processed = processed.replace(placeholder, detailsHtml);
      });
      
      return processed;
    } catch (e) {
      console.error('Markdown parse error:', e);
      return fallbackMarkdown(content);
    }
  }
  console.warn('marked.js not loaded, using fallback parser');
  return fallbackMarkdown(content);
}

// 发送消息
async function sendMessage() {
  const input = document.getElementById('message-input');
  const content = input.value.trim();
  
  if (!content || isStreaming) return;
  
  const conversation = conversations.find(c => c.id === currentConversationId);
  if (!conversation) return;
  
  // 添加用户消息
  const userMessage = {
    role: 'user',
    content: content,
    timestamp: new Date().toISOString()
  };
  
  conversation.messages.push(userMessage);
  conversation.updatedAt = new Date().toISOString();
  
  // 更新标题（使用第一条消息）
  if (conversation.messages.length === 1) {
    conversation.title = content.substring(0, 30) + (content.length > 30 ? '...' : '');
  }
  
  saveConversations();
  renderMessages();
  renderConversationsList();
  
  // 清空输入框
  input.value = '';
  input.style.height = 'auto';
  
  // 滚动到底部
  scrollToBottom();
  
  // 发送请求
  await requestCompletion(conversation);
}

// 请求补全
async function requestCompletion(conversation) {
  isStreaming = true;
  document.getElementById('send-btn').disabled = true;
  
  // 添加助手消息占位
  const assistantMessage = {
    role: 'assistant',
    content: '',
    timestamp: new Date().toISOString()
  };
  
  conversation.messages.push(assistantMessage);
  renderMessages();
  scrollToBottom();
  
  try {
    const model = conversation.model || 'grok-4';
    const stream = conversation.stream !== false;
    const thinking = conversation.thinking || '';
    
    // 构建消息历史
    const messages = conversation.messages
      .filter(m => m.content)
      .map(m => ({ role: m.role, content: m.content }));
    
    const payload = {
      model: model,
      messages: messages,
      stream: stream
    };
    
    if (thinking) {
      payload.thinking = thinking;
    }
    
    if (stream) {
      await handleStreamResponse(payload, assistantMessage, conversation);
    } else {
      const response = await apiRequest('/v1/chat/completions', payload);
      assistantMessage.content = response.choices[0].message.content;
      conversation.updatedAt = new Date().toISOString();
      saveConversations();
      renderMessages();
      scrollToBottom();
    }
  } catch (error) {
    assistantMessage.content = `❌ 错误: ${error.message}`;
    saveConversations();
    renderMessages();
    showToast(error.message, 'error');
  } finally {
    isStreaming = false;
    document.getElementById('send-btn').disabled = false;
  }
}

// 处理流式响应
async function handleStreamResponse(payload, assistantMessage, conversation) {
  const response = await fetch('/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': API_KEY
    },
    body: JSON.stringify(payload)
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || '请求失败');
  }
  
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();
    
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') {
          conversation.updatedAt = new Date().toISOString();
          saveConversations();
          renderMessages();
          renderConversationsList();
          scrollToBottom();
          return;
        }
        
        try {
          const json = JSON.parse(data);
          if (json.choices?.[0]?.delta?.content) {
            assistantMessage.content += json.choices[0].delta.content;
            updateLastMessage(assistantMessage.content);
            scrollToBottom();
          }
        } catch (e) {
          console.error('Parse error:', e);
        }
      }
    }
  }
}

// 更新最后一条消息
function updateLastMessage(content) {
  const container = document.getElementById('messages-container');
  const lastBubble = container.querySelector('.message:last-child .message-bubble');
  if (lastBubble) {
    lastBubble.innerHTML = formatMessageContent(content);
    lastBubble.classList.add('streaming');
  }
}

// API 请求
async function apiRequest(endpoint, data, timeout = 120000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': API_KEY
      },
      body: JSON.stringify(data),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || `HTTP ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('请求超时');
    }
    throw error;
  }
}

// 清空当前对话
function clearCurrentConversation() {
  const conversation = conversations.find(c => c.id === currentConversationId);
  if (!conversation) return;
  
  if (!confirm('确定要清空当前对话吗？')) return;
  
  conversation.messages = [];
  conversation.updatedAt = new Date().toISOString();
  saveConversations();
  renderMessages();
  renderConversationsList();
  showToast('对话已清空', 'success');
}

// 删除对话
function deleteConversation(id) {
  if (!confirm('确定要删除这个对话吗？')) return;
  
  conversations = conversations.filter(c => c.id !== id);
  saveConversations();
  renderConversationsList();
  
  if (id === currentConversationId) {
    if (conversations.length > 0) {
      loadConversation(conversations[0].id);
    } else {
      newConversation();
    }
  }
  
  showToast('对话已删除', 'success');
}

// 重命名对话
function renameConversation(id) {
  const conversation = conversations.find(c => c.id === id);
  if (!conversation) return;
  
  const newTitle = prompt('请输入新标题:', conversation.title);
  if (!newTitle || newTitle.trim() === '') return;
  
  conversation.title = newTitle.trim();
  conversation.updatedAt = new Date().toISOString();
  saveConversations();
  renderConversationsList();
  
  if (id === currentConversationId) {
    document.getElementById('chat-title').textContent = newTitle.trim();
  }
  
  showToast('标题已更新', 'success');
}

// 切换设置面板
function toggleSettings() {
  const panel = document.getElementById('settings-panel');
  panel.classList.toggle('active');
}

// 更新模型
function updateModel() {
  const conversation = conversations.find(c => c.id === currentConversationId);
  if (!conversation) return;
  
  const model = document.getElementById('model-select').value;
  conversation.model = model;
  
  saveConversations();
}

// 应用快速示例
function applyQuickExample(text) {
  document.getElementById('message-input').value = text;
  document.getElementById('message-input').focus();
}

// 处理输入框按键
function handleInputKeydown(event) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    sendMessage();
  }
}

// 自动调整输入框高度
function autoResizeTextarea(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
}

// 滚动到底部
function scrollToBottom() {
  const container = document.getElementById('messages-container');
  container.scrollTop = container.scrollHeight;
}

// 格式化时间
function formatTime(isoString) {
  if (!isoString) return '';
  
  const date = new Date(isoString);
  const now = new Date();
  const diff = now - date;
  
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  if (days < 7) return `${days}天前`;
  
  return date.toLocaleDateString('zh-CN', { 
    month: 'short', 
    day: 'numeric' 
  });
}

// HTML 转义
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
