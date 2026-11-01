/* Afiliate miner Service Worker v2.0.0
   — Adiciona: refresh automático de token + sync de produtos ao Firestore
   — Mantém: inicialização do state padrão
*/

const FB_API_KEY   = 'AIzaSyDw59KOShDxjw0AKiQDYtHDJSVD5Ru1-KU';
const FB_PROJECT   = 'afiliateoficial2026';
const FB_DATABASE  = 'ai-studio-afiliate-06286741-5088-42ae-9702-cf4c78eb1a07';
const FS_BASE      = `https://firestore.googleapis.com/v1/projects/${FB_PROJECT}/databases/${FB_DATABASE}/documents`;

/* ═══════════════════════════════════════
   INIT — Estado padrão (idêntico ao original)
   ═══════════════════════════════════════ */
chrome.runtime.onInstalled.addListener(() => {
  console.log('[AffiliateMiner] Extensão v2.0.0 inicializada!');
  chrome.storage.local.get(['affiliateMinerState'], (res) => {
    if (!res.affiliateMinerState) {
      chrome.storage.local.set({
        affiliateMinerState: {
          isLoggedIn: false,
          userEmail: '',
          uid: '',
          idToken: '',
          refreshToken: '',
          tokenExpiresAt: 0,
          extActive: true,
          autoMine: false,
          discardedCount: 0,
          minedProducts: [],
          qualityFilters: {
            category: '', categorySlug: '', sortOrder: 'relevance',
            selectedMarketplaces: { ml: true, shopee: true, amazon: true, shein: true, aliexpress: true },
            minPrice: 0, maxPrice: null, minDiscount: 0,
            minRating: 0, minSales: 0, noInterest: false, freeShipping: false
          },
          lastError: null
        }
      });
    }
  });
});

/* ═══════════════════════════════════════
   ALARM — Refresh de token a cada 55 min
   ═══════════════════════════════════════ */
chrome.alarms.create('tokenRefresh', { periodInMinutes: 55 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== 'tokenRefresh') return;

  const res = await chrome.storage.local.get(['affiliateMinerState']);
  const s   = res.affiliateMinerState;
  if (!s?.refreshToken || !s?.isLoggedIn) return;
  if (Date.now() < (s.tokenExpiresAt || 0) - 300_000) return; // ainda válido

  try {
    const r = await fetch(
      `https://securetoken.googleapis.com/v1/token?key=${FB_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `grant_type=refresh_token&refresh_token=${s.refreshToken}`,
      }
    );
    const data = await r.json();
    if (r.ok && data.id_token) {
      s.idToken        = data.id_token;
      s.refreshToken   = data.refresh_token;
      s.tokenExpiresAt = Date.now() + parseInt(data.expires_in) * 1000;
      await chrome.storage.local.set({ affiliateMinerState: s });
      console.log('[AffiliateMiner] Token renovado com sucesso.');
    }
  } catch (e) {
    console.warn('[AffiliateMiner] Falha ao renovar token:', e);
  }
});

/* ═══════════════════════════════════════
   ENVIO AO APP — SOMENTE MANUAL
   ─────────────────────────────────────────
   O envio para o app (Firestore) acontece APENAS quando o usuário clica em
   "Enviar Todos para o Afiliate" no popup (popup.js → EXPORT_TO_AFILIATE abaixo).
   NÃO sincronizamos automaticamente ao minerar: os produtos ficam salvos apenas
   localmente na extensão até o clique explícito. (Removido o antigo auto-sync via
   chrome.storage.onChanged a pedido do usuário.)
   ═══════════════════════════════════════ */

/* ═══════════════════════════════════════
   FIRESTORE SYNC
   ═══════════════════════════════════════ */

function toFsValue(val) {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === 'string')  return { stringValue: val };
  if (typeof val === 'boolean') return { booleanValue: val };
  if (typeof val === 'number')
    return Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val };
  if (Array.isArray(val))
    return { arrayValue: { values: val.map(toFsValue) } };
  if (typeof val === 'object') {
    const fields = {};
    for (const [k, v] of Object.entries(val)) fields[k] = toFsValue(v);
    return { mapValue: { fields } };
  }
  return { nullValue: null };
}

function objToFs(obj) {
  const fields = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) fields[k] = toFsValue(v);
  }
  return fields;
}

// Plataforma: nome display → chave aceita pelo app
function normalizePlatform(raw) {
  const r = (raw || '').toLowerCase();
  if (r.includes('mercado')) return 'mercadolivre';
  if (r.includes('shopee'))  return 'shopee';
  if (r.includes('amazon'))  return 'amazon';
  if (r.includes('ali'))     return 'aliexpress';
  if (r.includes('shein'))   return 'shein';
  return 'mercadolivre';
}

// URL limpa (sem tracking params)
function cleanUrl(url) {
  try {
    const u = new URL(url);
    ['tracking_id','tag','smtt','aff_id','url_from','affiliate_id',
     'utm_source','utm_medium','utm_campaign'].forEach(p => u.searchParams.delete(p));
    if (u.hash.startsWith('#D[')) u.hash = '';
    return u.toString();
  } catch { return url; }
}

// Número → "R$ 99,90"
function formatPrice(num) {
  if (!num || num <= 0) return '';
  return `R$ ${num.toFixed(2).replace('.', ',')}`;
}

// Número de vendas → string formatada
function formatSalesCount(n) {
  if (!n || n <= 0) return null;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace('.', ',')}k`;
  return String(n);
}

// Gerar ID global do produto
function buildGlobalId(platform, url) {
  try {
    switch (platform) {
      case 'mercadolivre': {
        const m = url.match(/(MLB\d+)/i);
        if (m) return `mercadolivre_${m[1].toUpperCase()}`;
        break;
      }
      case 'amazon': {
        const m = url.match(/\/dp\/([A-Z0-9]{10})/i) || url.match(/\/gp\/product\/([A-Z0-9]{10})/i);
        if (m) return `amazon_${m[1].toUpperCase()}`;
        break;
      }
      case 'shopee': {
        const m = url.match(/[-.]i\.(\d+)\.(\d+)/);
        if (m) return `shopee_${m[1]}_${m[2]}`;
        break;
      }
      case 'aliexpress': {
        const m = url.match(/\/item\/(\d+)/);
        if (m) return `aliexpress_${m[1]}`;
        break;
      }
      case 'shein': {
        const m = url.match(/\/p-([a-z0-9]+)/i);
        if (m) return `shein_${m[1].toLowerCase()}`;
        break;
      }
    }
  } catch (_) {}
  // Fallback: hash da URL
  let h = 0;
  for (let i = 0; i < url.length; i++) h = ((h << 5) - h + url.charCodeAt(i)) | 0;
  return `${platform}_${Math.abs(h).toString(36)}`;
}

// Data de hoje no formato YYYY-MM-DD (usado pelo contador diário do app)
function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

// Incrementa users/{uid}/dailyStats/{YYYY-MM-DD}.count (read-modify-write,
// idêntico ao padrão usado pelo app em marketplaceUtils.incrementDailyMineCount)
async function incrementDailyStat(uid, headers) {
  const key = todayKey();
  const ref = `${FS_BASE}/users/${uid}/dailyStats/${key}`;
  try {
    const snap = await fetch(ref, { headers });
    if (snap.ok) {
      const data    = await snap.json();
      const current = parseInt(data.fields?.count?.integerValue || '0', 10);
      await fetch(`${ref}?updateMask.fieldPaths=count`, {
        method: 'PATCH', headers,
        body: JSON.stringify({ fields: objToFs({ count: current + 1 }) }),
      });
    } else {
      await fetch(ref, {
        method: 'PATCH', headers,
        body: JSON.stringify({ fields: objToFs({ date: key, count: 1 }) }),
      });
    }
  } catch (e) {
    console.warn('[AffiliateMiner] Falha ao atualizar contador diário:', e.message);
  }
}

// Registra uma entrada no histórico de preço products/{id}/priceHistory (auto-id)
async function addPriceHistory(globalId, priceTo, priceFrom, now, headers) {
  try {
    await fetch(`${FS_BASE}/products/${globalId}/priceHistory`, {
      method: 'POST', headers,
      body: JSON.stringify({ fields: objToFs({
        price: priceTo, price_from: priceFrom ?? null, recordedAt: now,
      }) }),
    });
  } catch (e) {
    console.warn('[AffiliateMiner] Falha ao registrar histórico de preço:', e.message);
  }
}

async function syncProductToFirestore(product, uid, idToken) {
  // Normalizar platform e link
  const platform = normalizePlatform(product.platform || product.marketplace || '');
  const url      = cleanUrl(product.original_link || product.link || '');
  if (!url) return;

  const globalId = buildGlobalId(platform, url);
  const now      = new Date().toISOString();
  const headers  = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${idToken}`,
  };

  // Montar documento compatível com o app
  const doc = {
    id:            globalId,
    platform,
    platformId:    globalId.split('_').slice(1).join('_'),
    title:         product.title || 'Sem título',
    description:   product.description || null,
    category:      product.category || null,
    image_url:     product.image_url || product.image || null,
    pictures:      product.pictures || (product.image ? [product.image] : []),
    video_url:     null,
    price_to:      product.price_to  || formatPrice(product.pixPrice || 0),
    price_from:    product.price_from || (product.oldPrice > 0 ? formatPrice(product.oldPrice) : null),
    pix_price:     product.pix_price || null,
    installments:  product.installments || null,
    installments_interest_free: !!product.installments_interest_free,
    coupon:        product.coupon || null,
    shipping:      product.freeShipping ? 'Frete grátis' : (product.shipping || null),
    free_shipping: !!(product.freeShipping || product.free_shipping),
    stars:         product.stars || (product.rating > 0 ? String(product.rating) : null),
    sales_count:   product.sales_count || formatSalesCount(product.sales),
    discount_pct:  product.discount_pct || product.discountPercent || null,
    original_link: url,
    miners:        [uid],
    mineCount:     1,
    firstMinedAt:  now,
    lastMinedAt:   now,
    lastUpdatedAt: now,
  };

  // Verificar se produto já existe
  const checkRes = await fetch(`${FS_BASE}/products/${globalId}`, { headers });

  if (checkRes.ok) {
    // Produto existe → atualizar campos + adicionar este minerador (miners/mineCount)
    const existing   = await checkRes.json();
    const oldMiners  = (existing.fields?.miners?.arrayValue?.values || [])
      .map(v => v.stringValue).filter(Boolean);
    const oldPrice   = existing.fields?.price_to?.stringValue || '';
    const oldCount   = parseInt(existing.fields?.mineCount?.integerValue || '0', 10);
    const hasMiner   = oldMiners.includes(uid);
    const newMiners  = hasMiner ? oldMiners : [...oldMiners, uid];
    const newCount   = hasMiner ? oldCount : oldCount + 1;

    const patch = {
      lastMinedAt: now, lastUpdatedAt: now,
      price_to: doc.price_to, title: doc.title, image_url: doc.image_url,
      miners: newMiners, mineCount: newCount,
    };
    // Enriquece campos opcionais só quando vierem preenchidos (não apaga o que já existe)
    if (doc.coupon)               patch.coupon = doc.coupon;
    if (doc.installments)         patch.installments = doc.installments;
    if (doc.pix_price)            patch.pix_price = doc.pix_price;
    if (doc.description)          patch.description = doc.description;
    if (doc.category)             patch.category = doc.category;
    if (doc.price_from)           patch.price_from = doc.price_from;
    if (doc.stars)                patch.stars = doc.stars;
    if (doc.sales_count)          patch.sales_count = doc.sales_count;
    if (doc.discount_pct != null) patch.discount_pct = doc.discount_pct;
    if (doc.free_shipping)        patch.free_shipping = doc.free_shipping;

    const mask = Object.keys(patch).map(f => `updateMask.fieldPaths=${f}`).join('&');
    await fetch(`${FS_BASE}/products/${globalId}?${mask}`, {
      method: 'PATCH', headers,
      body: JSON.stringify({ fields: objToFs(patch) }),
    });

    // Histórico de preço só quando o preço mudou (mesma regra do app)
    if (doc.price_to && doc.price_to !== oldPrice) {
      await addPriceHistory(globalId, doc.price_to, doc.price_from, now, headers);
    }
  } else {
    // Produto novo → criar documento completo + primeira entrada de histórico
    await fetch(`${FS_BASE}/products/${globalId}`, {
      method: 'PATCH', headers,
      body: JSON.stringify({ fields: objToFs(doc) }),
    });
    await addPriceHistory(globalId, doc.price_to, doc.price_from, now, headers);
  }

  // Registrar referência no perfil do usuário
  const minedRef = `${FS_BASE}/users/${uid}/minedProducts/${globalId}`;
  const minedCheck = await fetch(minedRef, { headers });

  if (!minedCheck.ok) {
    await fetch(minedRef, {
      method:  'PATCH',
      headers,
      body: JSON.stringify({ fields: objToFs({
        productId: globalId, platform, minedAt: now,
        favorite: false, status: 'active',
      }) }),
    });
    // Contabiliza no "Minerados hoje" apenas na PRIMEIRA vez que este usuário
    // minera este produto (evita inflar o contador em re-sincronizações).
    await incrementDailyStat(uid, headers);
  } else {
    await fetch(`${minedRef}?updateMask.fieldPaths=minedAt`, {
      method:  'PATCH',
      headers,
      body: JSON.stringify({ fields: objToFs({ minedAt: now }) }),
    });
  }

  console.log(`[AffiliateMiner] ✅ Produto sincronizado: ${globalId}`);
}

/* ═══════════════════════════════════════
   MESSAGE LISTENER (mantido do original)
   ═══════════════════════════════════════ */
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'EXPORT_TO_AFILIATE') {
    // Agora faz sync real em vez de só logar
    chrome.storage.local.get(['affiliateMinerState'], async (res) => {
      const s = res.affiliateMinerState;
      if (!s?.isLoggedIn || !s?.uid || !s?.idToken) {
        sendResponse({ success: false, error: 'Não autenticado' });
        return;
      }
      const products = msg.payload?.products || [];
      let synced = 0;
      for (const p of products) {
        try { await syncProductToFirestore(p, s.uid, s.idToken); synced++; } catch (_) {}
      }
      sendResponse({ success: true, synced });
    });
    return true; // async
  }
  if (msg.action === 'PING') {
    sendResponse({ ok: true });
    return true;
  }
  return false;
});
