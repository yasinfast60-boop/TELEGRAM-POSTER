self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(clients.claim()));

const SCHEDULED_POSTS_KEY = 'scheduled_posts';

self.addEventListener('message', async (event) => {
  const { type, post } = event.data;
  
  if (type === 'SCHEDULE_POST') {
    const cache = await caches.open('scheduled');
    const existing = await cache.match(SCHEDULED_POSTS_KEY);
    let posts = existing ? await existing.json() : [];
    posts = posts.filter(p => p.id !== post.id);
    posts.push(post);
    await cache.put(SCHEDULED_POSTS_KEY, new Response(JSON.stringify(posts)));
    scheduleCheck();
  }
  
  if (type === 'CANCEL_POST') {
    const cache = await caches.open('scheduled');
    const existing = await cache.match(SCHEDULED_POSTS_KEY);
    let posts = existing ? await existing.json() : [];
    posts = posts.filter(p => p.id !== post.id);
    await cache.put(SCHEDULED_POSTS_KEY, new Response(JSON.stringify(posts)));
  }
  
  if (type === 'GET_POSTS') {
    const cache = await caches.open('scheduled');
    const existing = await cache.match(SCHEDULED_POSTS_KEY);
    const posts = existing ? await existing.json() : [];
    event.source.postMessage({ type: 'POSTS_LIST', posts });
  }
});

let checkInterval = null;

function scheduleCheck() {
  if (checkInterval) return;
  checkInterval = setInterval(checkAndSend, 30000);
  checkAndSend();
}

async function checkAndSend() {
  const cache = await caches.open('scheduled');
  const existing = await cache.match(SCHEDULED_POSTS_KEY);
  if (!existing) return;
  
  let posts = await existing.json();
  const now = Date.now();
  const toSend = posts.filter(p => p.scheduledAt <= now);
  const remaining = posts.filter(p => p.scheduledAt > now);
  
  for (const post of toSend) {
    await sendPost(post);
    notifyClients({ type: 'POST_SENT', postId: post.id });
  }
  
  await cache.put(SCHEDULED_POSTS_KEY, new Response(JSON.stringify(remaining)));
  
  if (remaining.length === 0 && checkInterval) {
    clearInterval(checkInterval);
    checkInterval = null;
  }
}

async function sendPost(post) {
  const { token, channel, caption, title, imageData } = post;
  const safeTitle = encodeURIComponent(title || caption.slice(0, 30));
  const ORDER_FORM = 'https://yasinfast60-boop.github.io/TELEGRAM-POSTER/order.html?p=';
  const PRICE_FORM = 'https://yasinfast60-boop.github.io/TELEGRAM-POSTER/inquiry.html?p=';
  
  const replyMarkup = {
    inline_keyboard: [[
      { text: '· استعلام قیمت ·', url: PRICE_FORM + safeTitle },
      { text: '· ثبت سفارش ·', url: ORDER_FORM + safeTitle },
    ]]
  };

  try {
    if (imageData) {
      const byteChars = atob(imageData.base64);
      const bytes = new Uint8Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i);
      const blob = new Blob([bytes], { type: imageData.mediaType });
      const fd = new FormData();
      fd.append('chat_id', channel);
      fd.append('caption', caption);
      fd.append('photo', blob, 'photo.jpg');
      fd.append('reply_markup', JSON.stringify(replyMarkup));
      await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, { method: 'POST', body: fd });
    } else {
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: channel, text: caption, reply_markup: replyMarkup })
      });
    }
  } catch(e) {
    console.error('Send failed:', e);
  }
}

async function notifyClients(message) {
  const allClients = await clients.matchAll({ type: 'window' });
  allClients.forEach(client => client.postMessage(message));
}

scheduleCheck();
