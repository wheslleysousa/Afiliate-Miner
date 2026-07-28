/* Affiliate Miner Content Script v1.0.5 — Fixed Price Container & Multi-Strategy Parser */

let extActive = true;
let autoMine = false;
let autoMineInterval = null;
let pdpCheckInterval = null;
let isOverlayExpanded = true;
let isOverlayHidden = false;

let qualityFilters = {
  category: '',
  categorySlug: '',
  sortOrder: 'relevance',
  selectedMarketplaces: {
    ml: true,
    shopee: true,
    amazon: true,
    shein: true,
    aliexpress: true
  },
  minPrice: 0,
  maxPrice: null,
  minDiscount: 0,
  minRating: 0,
  minSales: 0,
  noInterest: false,
  freeShipping: false
};

let minedProducts = [];
let discardedCount = 0;
let lastErrorLog = null;

/* ═══════════════════════════════════════
   GLOBAL ERROR CATCHER (AI DIAGNOSTICS)
   ═══════════════════════════════════════ */
window.addEventListener('error', (e) => {
  handleGlobalError(e.error || e.message, 'Global Script Error');
});
window.addEventListener('unhandledrejection', (e) => {
  handleGlobalError(e.reason, 'Unhandled Promise Rejection');
});

function handleGlobalError(err, context = 'Erro na Extensão') {
  lastErrorLog = {
    message: err?.message || String(err),
    stack: err?.stack || 'Sem stack trace',
    context,
    url: window.location.href,
    time: new Date().toLocaleString('pt-BR')
  };
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(['affiliateMinerState'], (res) => {
      const state = res.affiliateMinerState || {};
      state.lastError = lastErrorLog;
      chrome.storage.local.set({ affiliateMinerState: state });
    });
  }
  showDiagnosticErrorModal(lastErrorLog);
}

/* ═══════════════════════════════════════
   1. INITIAL STATE SYNC
   ═══════════════════════════════════════ */
function initContentScript() {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(['affiliateMinerState'], (res) => {
      if (res.affiliateMinerState) {
        const s = res.affiliateMinerState;
        extActive = s.extActive ?? true;
        autoMine = s.autoMine ?? false;
        minedProducts = s.minedProducts || [];
        discardedCount = s.discardedCount || 0;
        if (s.qualityFilters) {
          qualityFilters = { ...qualityFilters, ...s.qualityFilters };
        }
      }
      injectOverlayCSS();
      renderDraggableOverlay();
      renderFloatingTrigger();
      updatePageHighlighting();
      startPdpButtonWatcher();
      if (autoMine && extActive) startAutoMining();
    });
  } else {
    injectOverlayCSS();
    renderDraggableOverlay();
    renderFloatingTrigger();
    updatePageHighlighting();
    startPdpButtonWatcher();
  }
}

function saveStateToStorage() {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(['affiliateMinerState'], (res) => {
      const current = res.affiliateMinerState || {};
      const updated = {
        ...current,
        extActive,
        autoMine,
        minedProducts,
        discardedCount,
        qualityFilters,
        lastError: lastErrorLog
      };
      chrome.storage.local.set({ affiliateMinerState: updated });
    });
  }
}

/* ═══════════════════════════════════════
   2. INJECT SCOPED SOLID STYLES
   ═══════════════════════════════════════ */
function injectOverlayCSS() {
  if (document.getElementById('am-injected-styles')) return;
  const style = document.createElement('style');
  style.id = 'am-injected-styles';
  style.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600;700;800;900&display=swap');

    /* Paleta Affiliate Miner: Preto · Azul · Branco · Verde · Amarelo · Vermelho */
    #am-overlay {
      position: fixed !important;
      top: 20px !important;
      right: 20px !important;
      z-index: 2147483647 !important;
      width: 370px;
      min-width: 310px;
      max-width: 90vw;
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif !important;
      user-select: none !important;
      background-color: #07090f !important;
      border: 1px solid #2563eb !important;
      border-radius: 14px !important;
      box-shadow: 0 20px 60px rgba(0,0,0,0.9), 0 0 22px rgba(37,99,235,0.35) !important;
      overflow: hidden !important;
    }
    #am-overlay * { box-sizing: border-box !important; margin: 0; padding: 0; }

    .am-panel {
      background-color: #07090f !important;
      color: #eef2f9 !important;
      width: 100% !important;
      display: flex !important;
      flex-direction: column !important;
    }

    .am-header {
      display: flex !important;
      align-items: center !important;
      justify-content: space-between !important;
      padding: 10px 14px !important;
      background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%) !important;
      cursor: move !important; flex-shrink: 0 !important;
    }
    .am-header-left { display: flex !important; align-items: center !important; gap: 8px !important; }
    .am-logo-icon {
      width: 26px !important; height: 26px !important;
      background: rgba(255,255,255,0.2) !important;
      border-radius: 6px !important;
      display: flex !important; align-items: center !important; justify-content: center !important;
      color: #fff !important; font-weight: 900 !important; font-size: 13px !important;
    }
    .am-header-title { font-size: 13px !important; font-weight: 800 !important; color: #ffffff !important; letter-spacing: 0.5px !important; }
    .am-header-ver { font-size: 9px !important; color: #dbeafe !important; font-weight: 600 !important; }
    .am-header-actions { display: flex !important; align-items: center !important; gap: 6px !important; }
    .am-btn-icon {
      width: 24px !important; height: 24px !important;
      background: rgba(255,255,255,0.18) !important;
      border: 1px solid rgba(255,255,255,0.3) !important;
      border-radius: 6px !important; color: #fff !important;
      display: flex !important; align-items: center !important; justify-content: center !important;
      cursor: pointer !important; font-size: 11px !important; font-weight: 800 !important;
      transition: background 0.2s !important;
    }
    .am-btn-icon:hover { background: rgba(255,255,255,0.35) !important; }

    .am-body {
      padding: 12px 14px !important;
      display: flex !important; flex-direction: column !important; gap: 10px !important;
      background-color: #07090f !important;
      max-height: 500px !important; overflow-y: auto !important;
    }
    .am-body::-webkit-scrollbar { width: 5px !important; }
    .am-body::-webkit-scrollbar-thumb { background: #26304a !important; border-radius: 4px !important; }

    .am-label {
      font-size: 10px !important; font-weight: 800 !important; color: #93a0b5 !important;
      text-transform: uppercase !important; letter-spacing: 0.5px !important;
      margin-bottom: 4px !important; display: block !important;
    }

    .am-mkt-row {
      display: flex !important; flex-wrap: wrap !important; gap: 5px !important;
      background: #151a26 !important; padding: 6px 8px !important; border-radius: 8px !important;
      border: 1px solid #1e2636 !important;
    }
    .am-mkt-chip {
      display: flex !important; align-items: center !important; gap: 4px !important;
      font-size: 10px !important; font-weight: 700 !important; color: #eef2f9 !important;
      cursor: pointer !important; padding: 3px 7px !important; border-radius: 5px !important;
      background: #07090f !important; border: 1px solid #26304a !important;
    }
    .am-mkt-chip input { accent-color: #2563eb !important; cursor: pointer !important; }

    .am-select, .am-input {
      width: 100% !important;
      background: #151a26 !important; color: #ffffff !important;
      border: 1px solid #26304a !important; border-radius: 8px !important;
      padding: 7px 10px !important; font-size: 11px !important; font-weight: 700 !important;
      outline: none !important;
    }
    .am-select option { background: #151a26 !important; color: #fff !important; }
    .am-input:focus, .am-select:focus { border-color: #3b82f6 !important; box-shadow: 0 0 0 2px rgba(37,99,235,0.3) !important; }

    .am-btn-search {
      width: 100% !important; padding: 9px 12px !important;
      background: linear-gradient(135deg, #2563eb, #1d4ed8) !important;
      color: #fff !important; border: none !important; border-radius: 8px !important;
      font-size: 12px !important; font-weight: 800 !important; cursor: pointer !important;
      display: flex !important; align-items: center !important; justify-content: center !important; gap: 6px !important;
    }
    .am-btn-search:hover { background: #1d4ed8 !important; }

    .am-chips-row { display: flex !important; gap: 4px !important; overflow-x: auto !important; padding-top: 3px !important; scrollbar-width: none !important; }
    .am-chip-btn {
      background: #151a26 !important; color: #3b82f6 !important; border: 1px solid #26304a !important;
      padding: 2px 7px !important; border-radius: 10px !important; font-size: 10px !important; font-weight: 700 !important;
      cursor: pointer !important; white-space: nowrap !important; flex-shrink: 0 !important;
    }
    .am-chip-btn:hover { background: #2563eb !important; color: #fff !important; border-color: #2563eb !important; }

    .am-control-bar {
      display: flex !important; align-items: center !important; justify-content: space-between !important;
      background: #151a26 !important; padding: 8px 10px !important; border-radius: 8px !important;
      border: 1px solid #1e2636 !important;
    }
    .am-btn-automine {
      padding: 6px 12px !important; border-radius: 6px !important; border: none !important;
      font-size: 11px !important; font-weight: 800 !important; cursor: pointer !important; color: #fff !important;
    }
    .am-btn-automine.active { background: #facc15 !important; color: #07090f !important; }
    .am-btn-automine.inactive { background: #2563eb !important; }

    .am-metrics { display: grid !important; grid-template-columns: 1fr 1fr !important; gap: 6px !important; }
    .am-metric-card {
      background: #151a26 !important; border-radius: 6px !important; padding: 6px !important;
      text-align: center !important; border: 1px solid #1e2636 !important;
    }
    .am-metric-num { font-size: 16px !important; font-weight: 900 !important; }
    .am-metric-num.emerald { color: #22c55e !important; }
    .am-metric-num.rose { color: #ef4444 !important; }

    .am-check-row { display: flex !important; justify-content: space-between !important; font-size: 11px !important; font-weight: 700 !important; color: #cbd5e1 !important; }
    .am-check-row label { display: flex !important; align-items: center !important; gap: 4px !important; cursor: pointer !important; }
    .am-check-row input { accent-color: #2563eb !important; }

    #am-floating-trigger {
      position: fixed !important; bottom: 20px !important; right: 20px !important;
      z-index: 2147483647 !important;
      background: linear-gradient(135deg, #2563eb, #1d4ed8) !important;
      color: #fff !important; border: none !important; border-radius: 30px !important;
      padding: 10px 16px !important; font-size: 12px !important; font-weight: 800 !important;
      box-shadow: 0 10px 25px rgba(0,0,0,0.6), 0 0 15px rgba(37,99,235,0.45) !important;
      cursor: pointer !important; display: flex !important; align-items: center !important; gap: 6px !important;
    }

    .am-highlight-border {
      outline: 3px dashed #3b82f6 !important;
      outline-offset: -3px !important;
    }

    .am-card-mine-btn {
      width: 100% !important; margin-top: 6px !important; padding: 6px !important;
      background: linear-gradient(135deg, #22c55e, #16a34a) !important;
      color: #fff !important; border: none !important; border-radius: 6px !important;
      font-size: 11px !important; font-weight: 800 !important; cursor: pointer !important;
      display: flex !important; align-items: center !important; justify-content: center !important; gap: 4px !important;
    }

    #btn-injected-mine-pdp {
      width: 100% !important;
      margin: 10px 0 !important;
      padding: 12px 16px !important;
      background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%) !important;
      color: #ffffff !important;
      border: 2px solid #22c55e !important;
      border-radius: 12px !important;
      font-size: 13px !important;
      font-weight: 900 !important;
      cursor: pointer !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      gap: 8px !important;
      box-shadow: 0 8px 25px rgba(34, 197, 94, 0.4) !important;
      z-index: 999999 !important;
      transition: transform 0.2s, box-shadow 0.2s !important;
    }
    #btn-injected-mine-pdp:hover {
      transform: translateY(-2px) !important;
      box-shadow: 0 12px 30px rgba(34, 197, 94, 0.6) !important;
    }
  `;
  document.head.appendChild(style);
}

/* ═══════════════════════════════════════
   3. RENDER OVERLAY (FULL CATEGORIES + SEARCH)
   ═══════════════════════════════════════ */
function renderDraggableOverlay() {
  let overlay = document.getElementById('am-overlay');

  if (!extActive || isOverlayHidden) {
    if (overlay) overlay.style.display = 'none';
    return;
  }

  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'am-overlay';
    document.body.appendChild(overlay);
    makeElementDraggable(overlay);
  }

  overlay.style.display = 'block';
  const minedCount = minedProducts.length;

  if (!isOverlayExpanded) {
    overlay.style.width = '240px';
    overlay.innerHTML = `
      <div class="am-panel">
        <div class="am-header" id="am-drag-handle">
          <div class="am-header-left">
            <div class="am-logo-icon">⚡</div>
            <span class="am-header-title">MINER (${minedCount})</span>
          </div>
          <div class="am-header-actions">
            <button class="am-btn-icon" id="am-btn-expand" title="Expandir Painel">➕</button>
            <button class="am-btn-icon" id="am-btn-hide" title="Esconder">👁️</button>
          </div>
        </div>
      </div>
    `;
    overlay.querySelector('#am-btn-expand').onclick = () => { isOverlayExpanded = true; renderDraggableOverlay(); };
    overlay.querySelector('#am-btn-hide').onclick = () => { hideOverlay(); };
    return;
  }

  overlay.style.width = '370px';
  overlay.innerHTML = `
    <div class="am-panel">
      <!-- HEADER -->
      <div class="am-header" id="am-drag-handle">
        <div class="am-header-left">
          <div class="am-logo-icon">⚡</div>
          <div>
            <div class="am-header-title">AFFILIATE MINER</div>
            <div class="am-header-ver">v2.3.1</div>
          </div>
        </div>
        <div class="am-header-actions">
          <button class="am-btn-icon" id="am-btn-collapse" title="Minimizar">➖</button>
          <button class="am-btn-icon" id="am-btn-hide" title="Esconder Overlay">👁️</button>
        </div>
      </div>

      <!-- BODY -->
      <div class="am-body">
        
        <!-- Marketplace Filters -->
        <div>
          <span class="am-label">Lojas para Minerar</span>
          <div class="am-mkt-row">
            <label class="am-mkt-chip"><input type="checkbox" id="mkt-ml" ${qualityFilters.selectedMarketplaces.ml ? 'checked' : ''} /> ML</label>
            <label class="am-mkt-chip"><input type="checkbox" id="mkt-shopee" ${qualityFilters.selectedMarketplaces.shopee ? 'checked' : ''} /> Shopee</label>
            <label class="am-mkt-chip"><input type="checkbox" id="mkt-amazon" ${qualityFilters.selectedMarketplaces.amazon ? 'checked' : ''} /> Amazon</label>
            <label class="am-mkt-chip"><input type="checkbox" id="mkt-shein" ${qualityFilters.selectedMarketplaces.shein ? 'checked' : ''} /> Shein</label>
            <label class="am-mkt-chip"><input type="checkbox" id="mkt-aliexpress" ${qualityFilters.selectedMarketplaces.aliexpress ? 'checked' : ''} /> AliExpress</label>
          </div>
        </div>

        <!-- Keyword & Search Trigger -->
        <div>
          <span class="am-label">Pesquisar por Palavra-chave</span>
          <input type="text" id="am-input-kw" class="am-input" value="${qualityFilters.category || ''}" placeholder="Ex: Fone Bluetooth, iPhone, Air Fryer..." />
        </div>

        <!-- Comprehensive Category Dropdown -->
        <div>
          <span class="am-label">Categoria de Produtos</span>
          <select id="am-select-category" class="am-select">
            <option value="">🔥 Todas as Categorias</option>
            <option value="celulares">📱 Celulares e Smartphones</option>
            <option value="informatica">💻 Informática e Notebooks</option>
            <option value="eletronicos">🎧 Eletrônicos, Áudio e Vídeo</option>
            <option value="eletrodomesticos">🏠 Eletrodomésticos</option>
            <option value="beleza">💄 Beleza e Cuidado Pessoal</option>
            <option value="moda">👕 Calçados, Roupas e Bolsas</option>
            <option value="casa">🛋️ Casa, Móveis e Decoração</option>
            <option value="esportes">⚽ Esportes e Fitness</option>
            <option value="brinquedos">🧸 Brinquedos e Hobbies</option>
            <option value="ferramentas">🛠️ Ferramentas</option>
            <option value="acessorios-veiculos">🚗 Acessórios para Veículos</option>
            <option value="alimentos-bebidas">🍕 Alimentos e Bebidas</option>
            <option value="bebes">🍼 Bebês e Maternidade</option>
            <option value="games">🎮 Games e Consoles</option>
            <option value="saude">⚕️ Saúde e Suplementos</option>
            <option value="pet-shop">🐶 Pet Shop e Animais</option>
            <option value="construcao">🏗️ Construção</option>
            <option value="agro">🌾 Agro e Agricultura</option>
            <option value="antiguidades">🏺 Antiguidades e Coleções</option>
            <option value="papelaria">🎨 Arte, Papelaria e Armarinho</option>
            <option value="cameras">📷 Câmeras e Drones</option>
            <option value="festas">🎉 Festas e Lembrancinhas</option>
            <option value="industria">🏭 Indústria e Comércio</option>
            <option value="instrumentos-musicais">🎸 Instrumentos Musicais</option>
            <option value="joias-relogios">💎 Joias e Relógios</option>
            <option value="livros">📚 Livros, Revistas e Comics</option>
          </select>
        </div>

        <!-- Sort Order Selector -->
        <div>
          <span class="am-label">Ordenar Resultados Por</span>
          <select id="am-select-sort" class="am-select">
            <option value="relevance" ${qualityFilters.sortOrder === 'relevance' ? 'selected' : ''}>🌟 Mais Relevantes</option>
            <option value="sales" ${qualityFilters.sortOrder === 'sales' ? 'selected' : ''}>⭐ Mais Vendidos</option>
            <option value="price_asc" ${qualityFilters.sortOrder === 'price_asc' ? 'selected' : ''}>⬇️ Menor Preço</option>
            <option value="price_desc" ${qualityFilters.sortOrder === 'price_desc' ? 'selected' : ''}>⬆️ Maior Preço</option>
          </select>
        </div>

        <button id="am-btn-do-search" class="am-btn-search">
          🔍 Pesquisar na Loja
        </button>

        <!-- Auto Mine Control & Metrics -->
        <div class="am-control-bar">
          <div>
            <div style="font-size:11px; font-weight:800; color:#fff;">Mineração Automática</div>
            <div style="font-size:9px; color:#94a3b8;">Scroll celular & extração contínua</div>
          </div>
          <button id="am-btn-automine" class="am-btn-automine ${autoMine ? 'active' : 'inactive'}">
            ${autoMine ? '⏸ Pausar' : '▶ Iniciar'}
          </button>
        </div>

        <div class="am-metrics">
          <div class="am-metric-card">
            <span style="font-size:9px; font-weight:800; color:#94a3b8; display:block;">APROVADOS</span>
            <span class="am-metric-num emerald">${minedCount}</span>
          </div>
          <div class="am-metric-card">
            <span style="font-size:9px; font-weight:800; color:#94a3b8; display:block;">DESCARTADOS</span>
            <span class="am-metric-num rose">${discardedCount}</span>
          </div>
        </div>

        <!-- Quality Filters with Suggestion Chips -->
        <div>
          <span class="am-label">Mínimo de Vendas</span>
          <input type="number" id="am-input-minsales" class="am-input" value="${qualityFilters.minSales || ''}" placeholder="Digite ex: 100" />
          <div class="am-chips-row">
            <button class="am-chip-btn" data-target="minsales" data-val="50">50</button>
            <button class="am-chip-btn" data-target="minsales" data-val="100">100</button>
            <button class="am-chip-btn" data-target="minsales" data-val="250">250</button>
            <button class="am-chip-btn" data-target="minsales" data-val="500">500</button>
            <button class="am-chip-btn" data-target="minsales" data-val="1000">1.000</button>
            <button class="am-chip-btn" data-target="minsales" data-val="2000">2.000</button>
          </div>
        </div>

        <div>
          <span class="am-label">Desconto Mínimo (%)</span>
          <input type="number" id="am-input-mindisc" class="am-input" value="${qualityFilters.minDiscount || ''}" placeholder="Digite ex: 20" />
          <div class="am-chips-row">
            <button class="am-chip-btn" data-target="mindisc" data-val="10">10%</button>
            <button class="am-chip-btn" data-target="mindisc" data-val="15">15%</button>
            <button class="am-chip-btn" data-target="mindisc" data-val="20">20%</button>
            <button class="am-chip-btn" data-target="mindisc" data-val="25">25%</button>
            <button class="am-chip-btn" data-target="mindisc" data-val="30">30%</button>
            <button class="am-chip-btn" data-target="mindisc" data-val="40">40%</button>
            <button class="am-chip-btn" data-target="mindisc" data-val="50">50%</button>
          </div>
        </div>

        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px;">
          <div>
            <span class="am-label">Preço Max (R$)</span>
            <input type="number" id="am-input-maxprice" class="am-input" value="${qualityFilters.maxPrice ?? ''}" placeholder="Sem limite" />
          </div>
          <div>
            <span class="am-label">Avaliação Min (★)</span>
            <input type="number" step="0.1" id="am-input-minrating" class="am-input" value="${qualityFilters.minRating || ''}" placeholder="Ex: 4.5" />
          </div>
        </div>

        <div class="am-check-row">
          <label><input type="checkbox" id="am-chk-nointerest" ${qualityFilters.noInterest ? 'checked' : ''} /> Sem Juros</label>
          <label><input type="checkbox" id="am-chk-freeship" ${qualityFilters.freeShipping ? 'checked' : ''} /> Frete Grátis</label>
        </div>

      </div>
    </div>
  `;

  bindOverlayListeners(overlay);
}

function hideOverlay() {
  isOverlayHidden = true;
  const overlay = document.getElementById('am-overlay');
  if (overlay) overlay.style.display = 'none';
  renderFloatingTrigger();
}

function showOverlay() {
  isOverlayHidden = false;
  const trigger = document.getElementById('am-floating-trigger');
  if (trigger) trigger.style.display = 'none';
  renderDraggableOverlay();
}

function renderFloatingTrigger() {
  let trigger = document.getElementById('am-floating-trigger');
  if (!extActive || !isOverlayHidden) {
    if (trigger) trigger.style.display = 'none';
    return;
  }
  if (!trigger) {
    trigger = document.createElement('button');
    trigger.id = 'am-floating-trigger';
    trigger.innerHTML = `<span>⚡ Affiliate Miner</span>`;
    trigger.onclick = () => showOverlay();
    document.body.appendChild(trigger);
  }
  trigger.style.display = 'flex';
}

function enforcePageSortOrder(sort) {
  const currentUrl = window.location.href;
  if (!currentUrl.includes('mercadolivre') && !currentUrl.includes('mercadolibre')) return;

  // Remove any existing sort order parameter
  let cleanUrl = currentUrl.replace(/_Order_[a-zA-Z0-9_-]+/g, '');

  let newOrderParam = '';
  if (sort === 'sales') newOrderParam = '_Order_sales_desc';
  else if (sort === 'price_asc') newOrderParam = '_Order_price_asc';
  else if (sort === 'price_desc') newOrderParam = '_Order_price_desc';

  let targetUrl = cleanUrl;
  if (newOrderParam) {
    if (targetUrl.includes('#')) {
      const parts = targetUrl.split('#');
      targetUrl = parts[0] + newOrderParam + '#' + parts[1];
    } else if (targetUrl.includes('?')) {
      const parts = targetUrl.split('?');
      targetUrl = parts[0] + newOrderParam + '?' + parts[1];
    } else {
      targetUrl += newOrderParam;
    }
  }

  if (window.location.href !== targetUrl) {
    window.location.href = targetUrl;
  }
}

function triggerAutomatedSearch() {
  const kw   = (qualityFilters.category || '').trim();
  const cat  = qualityFilters.categorySlug || '';
  const sort = qualityFilters.sortOrder || 'relevance';
  const term = kw || cat;
  const platform = getPlatformKey();

  let targetUrl;

  switch (platform) {
    case 'amazon':
      targetUrl = term
        ? `https://www.amazon.com.br/s?k=${encodeURIComponent(term)}`
        : 'https://www.amazon.com.br/deals';
      break;
    case 'shopee':
      targetUrl = term
        ? `https://shopee.com.br/search?keyword=${encodeURIComponent(term)}`
        : 'https://shopee.com.br/daily_discover';
      break;
    case 'aliexpress':
      targetUrl = term
        ? `https://pt.aliexpress.com/wholesale?SearchText=${encodeURIComponent(term)}`
        : 'https://pt.aliexpress.com/';
      break;
    case 'shein':
      targetUrl = term
        ? `https://www.shein.com.br/pdsearch/${encodeURIComponent(term)}`
        : 'https://www.shein.com.br/';
      break;
    case 'mercadolivre':
    default: {
      // Mercado Livre suporta ordenação via sufixo _Order_
      targetUrl = term
        ? `https://lista.mercadolivre.com.br/${encodeURIComponent(term)}`
        : 'https://www.mercadolivre.com.br/ofertas';
      if (sort === 'sales')       targetUrl += '_Order_sales_desc';
      else if (sort === 'price_asc')  targetUrl += '_Order_price_asc';
      else if (sort === 'price_desc') targetUrl += '_Order_price_desc';
      break;
    }
  }

  window.location.href = targetUrl;
}

function bindOverlayListeners(overlay) {
  overlay.querySelector('#am-btn-collapse').onclick = () => { isOverlayExpanded = false; renderDraggableOverlay(); };
  overlay.querySelector('#am-btn-hide').onclick = () => { hideOverlay(); };

  overlay.querySelector('#am-btn-automine').onclick = () => {
    autoMine = !autoMine;
    saveStateToStorage();
    if (autoMine) startAutoMining(); else stopAutoMining();
    renderDraggableOverlay();
  };

  const selectCat = overlay.querySelector('#am-select-category');
  if (selectCat) {
    selectCat.value = qualityFilters.categorySlug || '';
    selectCat.onchange = () => {
      qualityFilters.categorySlug = selectCat.value;
      saveStateToStorage();
    };
  }

  const selectSort = overlay.querySelector('#am-select-sort');
  if (selectSort) {
    selectSort.onchange = () => {
      qualityFilters.sortOrder = selectSort.value;
      saveStateToStorage();
      enforcePageSortOrder(selectSort.value);
    };
  }

  const btnSearch = overlay.querySelector('#am-btn-do-search');
  if (btnSearch) {
    btnSearch.onclick = () => triggerAutomatedSearch();
  }

  ['ml', 'shopee', 'amazon', 'shein', 'aliexpress'].forEach(mkt => {
    const chk = overlay.querySelector(`#mkt-${mkt}`);
    if (chk) {
      chk.onchange = () => {
        qualityFilters.selectedMarketplaces[mkt] = !!chk.checked;
        saveStateToStorage();
      };
    }
  });

  const kwInput = overlay.querySelector('#am-input-kw');
  if (kwInput) {
    kwInput.oninput = () => { qualityFilters.category = kwInput.value.trim(); saveStateToStorage(); };
    kwInput.onkeydown = (e) => {
      if (e.key === 'Enter') triggerAutomatedSearch();
    };
  }

  const minSalesInput = overlay.querySelector('#am-input-minsales');
  if (minSalesInput) {
    minSalesInput.oninput = () => { qualityFilters.minSales = parseInt(minSalesInput.value, 10) || 0; saveStateToStorage(); };
  }

  const minDiscInput = overlay.querySelector('#am-input-mindisc');
  if (minDiscInput) {
    minDiscInput.oninput = () => { qualityFilters.minDiscount = parseFloat(minDiscInput.value) || 0; saveStateToStorage(); };
  }

  const maxPriceInput = overlay.querySelector('#am-input-maxprice');
  if (maxPriceInput) {
    maxPriceInput.oninput = () => { qualityFilters.maxPrice = maxPriceInput.value !== '' ? parseFloat(maxPriceInput.value) : null; saveStateToStorage(); };
  }

  const minRatingInput = overlay.querySelector('#am-input-minrating');
  if (minRatingInput) {
    minRatingInput.oninput = () => { qualityFilters.minRating = parseFloat(minRatingInput.value) || 0; saveStateToStorage(); };
  }

  overlay.querySelectorAll('.am-chip-btn').forEach(chip => {
    chip.onclick = () => {
      const target = chip.dataset.target;
      const val = chip.dataset.val;
      if (target === 'minsales' && minSalesInput) {
        minSalesInput.value = val;
        qualityFilters.minSales = parseInt(val, 10);
      } else if (target === 'mindisc' && minDiscInput) {
        minDiscInput.value = val;
        qualityFilters.minDiscount = parseFloat(val);
      }
      saveStateToStorage();
    };
  });

  const noIntChk = overlay.querySelector('#am-chk-nointerest');
  if (noIntChk) noIntChk.onchange = () => { qualityFilters.noInterest = !!noIntChk.checked; saveStateToStorage(); };

  const freeShipChk = overlay.querySelector('#am-chk-freeship');
  if (freeShipChk) freeShipChk.onchange = () => { qualityFilters.freeShipping = !!freeShipChk.checked; saveStateToStorage(); };
}

/* ═══════════════════════════════════════
   4. DRAGGABLE HELPER
   ═══════════════════════════════════════ */
function makeElementDraggable(elmnt) {
  let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
  const getHandle = () => elmnt.querySelector('#am-drag-handle') || elmnt;

  elmnt.addEventListener('mousedown', (e) => {
    const handle = getHandle();
    if (!handle.contains(e.target)) return;
    if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.closest('button')) return;
    e.preventDefault();
    pos3 = e.clientX;
    pos4 = e.clientY;
    document.onmouseup = () => { document.onmouseup = null; document.onmousemove = null; };
    document.onmousemove = (ev) => {
      ev.preventDefault();
      pos1 = pos3 - ev.clientX;
      pos2 = pos4 - ev.clientY;
      pos3 = ev.clientX;
      pos4 = ev.clientY;
      elmnt.style.top = (elmnt.offsetTop - pos2) + 'px';
      elmnt.style.left = (elmnt.offsetLeft - pos1) + 'px';
      elmnt.style.right = 'auto';
    };
  });
}

/* ═══════════════════════════════════════
   5. HIGHLIGHTING & INJECTED CARD BUTTONS
   ═══════════════════════════════════════ */
function updatePageHighlighting() {
  const selectors = [
    '.ui-search-result__wrapper',
    '.poly-card',
    '.shopee-search-item-result__item',
    '[data-sqe="item"]',
    '[data-component-type="s-search-result"]',
    '.product-card-item',
    '.ui-search-layout__item'
  ];
  const cards = document.querySelectorAll(selectors.join(', '));
  cards.forEach((card) => {
    if (extActive) {
      card.classList.add('am-highlight-border');
      if (!card.querySelector('.am-card-mine-btn')) {
        const btn = document.createElement('button');
        btn.className = 'am-card-mine-btn';
        btn.innerHTML = `⚡ Minerar`;
        btn.onclick = (e) => {
          e.preventDefault(); e.stopPropagation();
          mineCardProduct(card, true);
        };
        card.appendChild(btn);
      }
    } else {
      card.classList.remove('am-highlight-border');
      const b = card.querySelector('.am-card-mine-btn');
      if (b) b.remove();
    }
  });
}

/* ═══════════════════════════════════════
   6. PDP BUTTON WATCHER
   ═══════════════════════════════════════ */
function startPdpButtonWatcher() {
  if (pdpCheckInterval) clearInterval(pdpCheckInterval);
  pdpCheckInterval = setInterval(() => {
    if (!extActive) return;
    const buyContainer = document.querySelector(
      '.ui-pdp-actions, .buy-box, .shopee-buy-button-box, #buyBox, ' +
      '.ui-pdp-container__row--right, .ui-pdp-actions__container, ' +
      '[data-testid="buy-box"], form.ui-pdp-actions, .ui-pdp-price__buy'
    );
    if (buyContainer && !document.getElementById('btn-injected-mine-pdp')) {
      injectPdpButton(buyContainer);
    }
    updatePageHighlighting();
  }, 1000);
}

function injectPdpButton(buyContainer) {
  if (!extActive || document.getElementById('btn-injected-mine-pdp')) return;
  const btn = document.createElement('button');
  btn.id = 'btn-injected-mine-pdp';
  btn.innerHTML = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
    <span>⛏ Minerar Este Produto (Enviar para Afiliate)</span>
  `;
  btn.onclick = (e) => {
    e.preventDefault(); e.stopPropagation();
    mineCurrentPageProduct(true);
  };
  buyContainer.prepend(btn);
}

/* ═══════════════════════════════════════
   7. EXTRACTION ENGINE & ADVANCED MULTI-STRATEGY PARSER
   ═══════════════════════════════════════ */
function showToast(message, type = 'success') {
  let toast = document.getElementById('am-injected-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'am-injected-toast';
    document.body.appendChild(toast);
  }
  toast.className = `am-toast show ${type}`;
  toast.innerHTML = `
    <div style="display:flex; align-items:center; gap:8px;">
      <span style="font-size:16px;">⚡</span>
      <span style="font-size:12px; font-weight:800; color:#ffffff;">${message}</span>
    </div>
  `;
  setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

function extractAndesPrice(container) {
  if (!container) return 0;

  // 1) Caminho preferencial: fração do valor (preço real do Mercado Livre).
  //    Isto ignora qualquer badge de "% OFF" que exista no mesmo bloco.
  const fractionEl = container.querySelector('.andes-money-amount__fraction');
  if (fractionEl) {
    const intPart = parseInt(fractionEl.textContent.replace(/\./g, ''), 10) || 0;
    const centsEl = container.querySelector('.andes-money-amount__cents');
    if (centsEl) {
      const centsText = centsEl.textContent.replace(/\D/g, '');
      const cents = parseInt(centsText, 10) || 0;
      return intPart + (cents / 100);
    }
    return intPart;
  }

  const raw = (container.textContent || '');

  // 2) Um valor com "%" é DESCONTO, nunca preço. Evita capturar "20% OFF" como R$ 20,00.
  if (/%/.test(raw)) return 0;

  const cleaned = raw.replace(/R\$\s*/g, '').trim();

  // 3) Preço com centavos explícitos: "1.299,90" → 1299.90
  const m = cleaned.match(/(\d[\d.]*),(\d{2})/);
  if (m) return parseFloat(m[1].replace(/\./g, '') + '.' + m[2]);

  // 4) Sem centavos: só aceita se houver indício de moeda (R$) no texto original,
  //    para não confundir números soltos (quantidade, parcelas, %) com preço.
  if (/R\$/.test(raw)) {
    const m2 = cleaned.match(/(\d[\d.]*)/);
    if (m2) return parseFloat(m2[1].replace(/\./g, ''));
  }
  return 0;
}

function extractRealProductData(element) {
  try {
    let title = '', pixPrice = 0, oldPrice = 0, discountPercent = 0;
    let rating = 0, sales = 0, freeShipping = false, noInterest = false;
    let image = '', link = window.location.href;
    let coupon = null, installments = null, description = null, pixExplicit = 0;
    const id = 'prod_' + Date.now() + '_' + Math.floor(Math.random() * 9999);

    if (element) {
      const cardText = element.textContent;

      // 1. Title Extraction
      const titleEl = element.querySelector(
        '.ui-search-item__title, .poly-component__title, ' +
        '[data-testid="item-title"], .shopee-search-item-result__name, h2, h3'
      );
      if (titleEl) title = titleEl.textContent.trim();

      // 2. Old Price Extraction (Struck-through price)
      const oldEls = element.querySelectorAll('.poly-price__old, .ui-search-price__part--original, s, del');
      for (const el of oldEls) {
        const p = extractAndesPrice(el);
        if (p > oldPrice) oldPrice = p;
      }

      // 3. Pix / Cash Price Extraction (Lowest non-zero price, excluding old & credit card prices)
      const candidatePrices = [];
      const amountEls = element.querySelectorAll('.andes-money-amount, [class*="price"]');
      for (const el of amountEls) {
        // Ignora preço antigo, parcelas, preço no cartão E o badge de desconto (% OFF)
        if (el.closest('.poly-price__old, .ui-search-price__part--original, s, del, ' +
                       '.ui-search-installments, .poly-price__credit-card, [class*="installment"], ' +
                       '.poly-price__discount, .ui-search-price__discount, [class*="discount"]')) continue;
        // Segurança extra: se o texto do elemento contém "%", é desconto, não preço
        if ((el.textContent || '').includes('%')) continue;
        const p = extractAndesPrice(el);
        if (p > 0 && p !== oldPrice) {
          candidatePrices.push(p);
        }
      }

      if (candidatePrices.length > 0) {
        // Pix price is ALWAYS the lowest valid offer price
        pixPrice = Math.min(...candidatePrices);
      } else {
        const currentContainer = element.querySelector('.poly-component__price, .poly-price__current, .ui-search-price__second-line');
        pixPrice = extractAndesPrice(currentContainer);
      }

      // Sanity check: If pixPrice > oldPrice and oldPrice > 0, swap them
      if (pixPrice > oldPrice && oldPrice > 0) {
        const temp = pixPrice;
        pixPrice = oldPrice;
        oldPrice = temp;
      }

      // 4. Discount Extraction — Math calculation vs Badge
      if (oldPrice > pixPrice && pixPrice > 0) {
        discountPercent = Math.round(((oldPrice - pixPrice) / oldPrice) * 100);
      }

      if (discountPercent === 0) {
        const discountEl = element.querySelector('.poly-price__discount, .ui-search-price__discount');
        if (discountEl && !discountEl.textContent.toLowerCase().includes('cupom')) {
          const dm = discountEl.textContent.match(/(\d{1,2})%/);
          if (dm) discountPercent = parseInt(dm[1], 10);
        }
      }

      if (discountPercent > 99 || discountPercent < 0) discountPercent = 0;

      if (discountPercent > 0 && oldPrice === 0 && pixPrice > 0) {
        oldPrice = parseFloat((pixPrice / (1 - discountPercent / 100)).toFixed(2));
      }

      // 5. Rating Extraction
      const ratingSelectors = [
        '.poly-reviews__rating',
        '.ui-search-reviews__rating',
        '.ui-search-reviews__rating-number',
        '.shopee-rating-stars'
      ];
      for (const sel of ratingSelectors) {
        if (rating > 0) break;
        const el = element.querySelector(sel);
        if (el) {
          const rm = el.textContent.match(/(\d[\.,]\d)/);
          if (rm) rating = parseFloat(rm[1].replace(',', '.'));
        }
      }

      if (rating === 0) {
        const ariaEls = element.querySelectorAll('[aria-label]');
        for (const el of ariaEls) {
          const label = el.getAttribute('aria-label') || '';
          const rm = label.match(/Classifica[cç][aã]o\s*(\d[\.,]\d)/i)
                  || label.match(/(\d[\.,]\d)\s*de\s*5/i);
          if (rm) {
            rating = parseFloat(rm[1].replace(',', '.'));
            break;
          }
        }
      }

      if (rating === 0) {
        const rmText = cardText.match(/Classifica[cç][aã]o\s*(\d[\.,]\d)/i)
                    || cardText.match(/(\d[\.,]\d)\s*de\s*5\s*estrelas/i)
                    || cardText.match(/(\d[\.,]\d)\s*\|\s*\+?\s*\d/i);
        if (rmText) {
          const val = parseFloat(rmText[1].replace(',', '.'));
          if (val >= 1.0 && val <= 5.0) rating = val;
        }
      }

      // 6. Sales Extraction (parser preciso — não junta números vizinhos)
      // Prioriza os aria-labels de vendas (mais confiáveis), depois o texto do card.
      const salesAriaEls = element.querySelectorAll('[aria-label*="vendido" i], [aria-label*="comprado" i]');
      for (const el of salesAriaEls) {
        const v = parseSalesCount(el.getAttribute('aria-label') || '');
        if (v > 0) { sales = v; break; }
      }
      if (sales === 0) sales = parseSalesCount(cardText);

      // 7. Shipping & Interest
      if (cardText.toLowerCase().includes('frete grátis')) freeShipping = true;
      if (cardText.toLowerCase().includes('sem juros')) noInterest = true;

      // 8. Image & Link
      const imgEl = element.querySelector('img');
      if (imgEl) image = imgEl.src || imgEl.dataset.src || '';

      const linkEl = element.querySelector('a[href]');
      if (linkEl) link = linkEl.href;

      // 9. Parcelas, cupom e preço no Pix (a partir do texto do card)
      installments = extractInstallmentsText(cardText);
      coupon       = extractCouponText(element, cardText);
      pixExplicit  = extractPixPriceNum(cardText, 0);
    } else {
      // Single PDP Extraction (product detail page)
      const titleEl = document.querySelector(
        '.ui-pdp-title, #productTitle, .product-intro__head-name, ' +
        '.product-title, [data-pl="product-title"], h1'
      );
      if (titleEl) title = titleEl.textContent.trim();

      const pdpOldContainer = document.querySelector('.ui-pdp-price__part--original, s, del');
      oldPrice = extractAndesPrice(pdpOldContainer);

      const pdpCandidatePrices = [];
      const pdpAmountEls = document.querySelectorAll('.ui-pdp-price__part--medium .andes-money-amount, .ui-pdp-price__second-line .andes-money-amount, .ui-pdp-price__part:not(.ui-pdp-price__part--original) .andes-money-amount');
      for (const el of pdpAmountEls) {
        if (el.closest('.ui-pdp-price__part--original, s, del, .ui-pdp-price__subtitles, ' +
                       '[class*="installments"], [class*="discount"]')) continue;
        if ((el.textContent || '').includes('%')) continue;
        const p = extractAndesPrice(el);
        if (p > 0 && p !== oldPrice) pdpCandidatePrices.push(p);
      }

      if (pdpCandidatePrices.length > 0) {
        pixPrice = Math.min(...pdpCandidatePrices);
      } else {
        const pdpCurrentContainer = document.querySelector('.ui-pdp-price__part--medium, .ui-pdp-price__second-line');
        pixPrice = extractAndesPrice(pdpCurrentContainer);
      }

      if (pixPrice > oldPrice && oldPrice > 0) {
        const temp = pixPrice;
        pixPrice = oldPrice;
        oldPrice = temp;
      }

      if (oldPrice > pixPrice && pixPrice > 0) {
        discountPercent = Math.round(((oldPrice - pixPrice) / oldPrice) * 100);
      }

      if (discountPercent === 0) {
        const pdpDiscEl = document.querySelector('.ui-pdp-price__discount');
        if (pdpDiscEl && !pdpDiscEl.textContent.toLowerCase().includes('cupom')) {
          const dm = pdpDiscEl.textContent.match(/(\d{1,2})%/);
          if (dm) discountPercent = parseInt(dm[1], 10);
        }
      }

      if (discountPercent > 99 || discountPercent < 0) discountPercent = 0;

      const ratingEl = document.querySelector('.ui-pdp-review__rating, .ui-pdp-reviews__rating');
      if (ratingEl) {
        const rm = ratingEl.textContent.match(/\d+[\.,]?\d*/);
        if (rm) rating = parseFloat(rm[0].replace(',', '.'));
      }

      if (rating === 0) {
        const bodyText = document.body.textContent;
        const rmBody = bodyText.match(/Classifica[cç][aã]o\s*(\d[\.,]\d)/i)
                    || bodyText.match(/(\d[\.,]\d)\s*de\s*5\s*estrelas/i);
        if (rmBody) {
          const val = parseFloat(rmBody[1].replace(',', '.'));
          if (val >= 1.0 && val <= 5.0) rating = val;
        }
      }

      const bodyText = document.body.textContent;
      sales = parseSalesCount(bodyText);

      if (bodyText.toLowerCase().includes('frete grátis')) freeShipping = true;
      if (bodyText.toLowerCase().includes('sem juros')) noInterest = true;

      const imgEl = document.querySelector(
        '.ui-pdp-gallery__figure img, #gallery img, #landingImage, ' +
        '#imgTagWrapperId img, .crop-image-container img, .main-swiper img'
      );
      if (imgEl) image = imgEl.src || imgEl.dataset.src || '';
      if (!image) {
        const ogImg = document.querySelector('meta[property="og:image"]');
        if (ogImg) image = ogImg.getAttribute('content') || '';
      }

      // Parcelas, cupom, preço no Pix e descrição completa (PDP)
      installments = extractInstallmentsText(bodyText);
      coupon       = extractCouponText(document, bodyText);
      pixExplicit  = extractPixPriceNum(bodyText, 0);
      description  = extractDescriptionText();
    }

    return {
      // ── Campos ORIGINAIS (mantidos para não quebrar nada) ──
      id, title, pixPrice, oldPrice, discountPercent,
      rating, sales, freeShipping, noInterest,
      image, link,
      marketplace: getMarketplaceName(),
      timestamp: Date.now(),

      // ── Campos NOVOS compatíveis com o app Afiliate ──
      // Necessários para sync correto com Firestore
      platform:     getPlatformKey(),
      original_link:cleanLinkUrl(link),
      image_url:    image || null,
      pictures:     image ? [image] : [],
      price_to:     numToAppPrice(pixPrice),
      price_from:   oldPrice > 0 ? numToAppPrice(oldPrice) : null,
      pix_price:    pixExplicit > 0 ? numToAppPrice(pixExplicit)
                     : (pixPrice > 0 ? numToAppPrice(pixPrice) : null),
      installments: installments,
      coupon:       coupon,
      shipping:     freeShipping ? 'Frete grátis' : null,
      free_shipping:!!freeShipping,
      stars:        rating > 0 ? String(rating) : null,
      sales_count:  sales > 0 ? (sales >= 1000 ? `${(sales/1000).toFixed(1)}k` : String(sales)) : null,
      discount_pct: discountPercent > 0 ? discountPercent : null,
      description:  description,
      extractedAt:  new Date().toISOString(),
    };
  } catch (err) {
    handleGlobalError(err, 'Parsing de Produto');
    return null;
  }
}

// ── Helpers para campos compatíveis com o app ─────────────

function getPlatformKey() {
  const host = window.location.hostname;
  if (host.includes('mercadolivre') || host.includes('mercadolibre')) return 'mercadolivre';
  if (host.includes('shopee'))    return 'shopee';
  if (host.includes('amazon'))    return 'amazon';
  if (host.includes('aliexpress'))return 'aliexpress';
  if (host.includes('shein'))     return 'shein';
  return 'mercadolivre';
}

function cleanLinkUrl(url) {
  try {
    const u = new URL(url);
    ['tracking_id','tag','smtt','aff_id','url_from','affiliate_id',
     'utm_source','utm_medium','utm_campaign'].forEach(p => u.searchParams.delete(p));
    if (u.hash.startsWith('#D[')) u.hash = '';
    return u.toString();
  } catch { return url; }
}

function numToAppPrice(num) {
  if (!num || num <= 0) return '';
  return `R$ ${num.toFixed(2).replace('.', ',')}`;
}

// ── Parser PRECISO de nº de vendas ────────────────────────
// Lê o número imediatamente ligado a "vendidos/comprados", SEM juntar com
// números vizinhos (ex.: não confunde a avaliação "4.7" com as vendas).
// Trata "mil"/"k" e milhar/decimal pt-BR corretamente.
//   "+10 mil vendidos" → 10000 · "250 mil" → 250000 · "1.000 vendidos" → 1000
//   "1,2 mil vendidos" → 1200 · "500 vendidos" → 500 · "4.7 250 mil vend" → 250000
function parseSalesCount(text) {
  if (!text) return 0;
  const t = String(text).replace(/ /g, ' ');
  // Número "tight" (1.000 | 1000 | 10 | 1,2) + unidade opcional + termo de vendas.
  const re = /(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d+))?\s*(mil|k)?\s*(?:produtos?\s*)?(?:vendidos?|comprados?)/i;
  const m = t.match(re);
  if (!m) return 0;
  const intPart = m[1].replace(/\./g, '');   // "1.000" → "1000"
  const decPart = m[2] ? '.' + m[2] : '';     // ",2" → ".2"
  let num = parseFloat(intPart + decPart);
  if (isNaN(num) || num <= 0) return 0;
  if (m[3] && /mil|k/i.test(m[3])) num *= 1000;
  return Math.round(num);
}

// ── Extração de PARCELAS (parcelado no cartão) ────────────
// Aceita "12x de R$ 45,90 sem juros", "10x R$ 12,34", "em até 12x"
function extractInstallmentsText(scopeText) {
  if (!scopeText) return null;
  const m = scopeText.match(/(\d{1,2})\s*x\s*(?:de\s*)?R\$\s*([\d.]+,\d{2})(\s*sem\s*juros)?/i);
  if (m) {
    const base = `${m[1]}x de R$ ${m[2]}`;
    return /sem\s*juros/i.test(m[3] || '') ? `${base} sem juros` : base;
  }
  return null;
}

// ── Extração de CUPOM (código/percentual) ─────────────────
function extractCouponText(scope, scopeText) {
  try {
    if (scope && scope.querySelector) {
      const badge = scope.querySelector(
        '#couponBadge, .couponBadge, .vpc-coupon-badge, ' +
        '[class*="coupon" i], [class*="cupom" i], [class*="voucher" i]'
      );
      if (badge) {
        const t = (badge.textContent || '').replace(/\s+/g, ' ').trim();
        const code = t.match(/\b[A-Z0-9]{4,15}\b/);
        const pct  = t.match(/R\$\s*[\d.,]+|\d{1,2}%/);
        if (/cupom|coupon|voucher|desconto/i.test(t) || code) {
          return (code ? code[0] : (pct ? pct[0] : t)).slice(0, 40);
        }
      }
    }
  } catch (_) {}
  if (scopeText) {
    const m = scopeText.match(/cupom[:\s]*([A-Z0-9]{4,15})/i)
           || scopeText.match(/c[óo]digo[:\s]*([A-Z0-9]{4,15})/i)
           || scopeText.match(/([A-Z0-9]{4,15})\s*(?:de\s*)?cupom/i);
    if (m) return m[1];
  }
  return null;
}

// ── Preço à vista no PIX (explícito) ──────────────────────
// Procura "R$ X no Pix" / "Pix: R$ X"; senão devolve o fallback (menor preço).
function extractPixPriceNum(scopeText, fallback) {
  if (scopeText) {
    const m = scopeText.match(/R\$\s*([\d.]+,\d{2})\s*(?:no\s*)?pix/i)
           || scopeText.match(/pix[:\s]*R\$\s*([\d.]+,\d{2})/i);
    if (m) {
      const v = parseFloat(m[1].replace(/\./g, '').replace(',', '.'));
      if (v > 0) return v;
    }
  }
  return fallback || 0;
}

// ── Descrição (apenas em PDP / página do produto) ─────────
function extractDescriptionText() {
  let desc = '';
  const meta = document.querySelector('meta[property="og:description"], meta[name="description"]');
  if (meta) desc = (meta.getAttribute('content') || '').trim();
  const sel = document.querySelector(
    '.ui-pdp-description__content, #productDescription, #feature-bullets, ' +
    '.product-intro__description, .product-description, [class*="description" i]'
  );
  if (sel) {
    const t = (sel.textContent || '').replace(/\s+/g, ' ').trim();
    if (t.length > desc.length) desc = t;
  }
  return desc ? desc.slice(0, 1200) : null;
}

// ─────────────────────────────────────────────────────────

function getMarketplaceName() {
  const host = window.location.hostname;
  if (host.includes('mercadolivre') || host.includes('mercadolibre')) return 'Mercado Livre';
  if (host.includes('shopee')) return 'Shopee';
  if (host.includes('amazon')) return 'Amazon';
  if (host.includes('shein')) return 'Shein';
  if (host.includes('aliexpress')) return 'AliExpress';
  return 'E-commerce';
}

/* Background enrichment for cards without explicit sales or rating text */
async function enrichProductDataInBackground(product) {
  if (!product || !product.link || product.link === window.location.href) return product;
  if (product.sales > 0 && product.rating > 0 && product.discountPercent > 0) return product;

  try {
    const res = await fetch(product.link, { credentials: 'omit' });
    const htmlText = await res.text();
    const doc = new DOMParser().parseFromString(htmlText, 'text/html');

    // Extract Rating from PDP
    if (product.rating === 0) {
      const rEl = doc.querySelector('.ui-pdp-review__rating, .ui-pdp-reviews__rating, .shopee-rating-stars');
      if (rEl) {
        const rm = rEl.textContent.match(/\d+[\.,]?\d*/);
        if (rm) product.rating = parseFloat(rm[0].replace(',', '.'));
      }
    }

    // Extract Sales from PDP (parser preciso)
    if (product.sales === 0 && doc.body) {
      const v = parseSalesCount(doc.body.textContent);
      if (v > 0) product.sales = v;
    }
  } catch (e) {
    // Ignore fetch errors silently
  }
  return product;
}

/* ═══════════════════════════════════════
   8. SMART FILTERING ENGINE
   ═══════════════════════════════════════ */
async function processAndFilterProduct(product) {
  if (!product || !product.title) return;

  // Enrich product details in background if card thumbnail lacks sales/rating text
  product = await enrichProductDataInBackground(product);

  const f = qualityFilters;

  // Keyword Filter
  if (f.category && f.category.trim() !== '') {
    const kw = f.category.toLowerCase().trim();
    if (!product.title.toLowerCase().includes(kw)) return recordDiscard(`Fora da Palavra-chave "${f.category}"`);
  }

  // ── FILTROS ESTRITOS ──────────────────────────────────────────────────
  // Regra: se um filtro de mínimo está ATIVO, o produto só passa se o valor
  // for CONHECIDO e atender ao mínimo. Valor não identificado = descartado.
  // (Ex.: mínimo 1000 vendas → 999 não entra; desconhecido também não entra.)

  // Preço mínimo / máximo
  if (f.minPrice && f.minPrice > 0) {
    if (!(product.pixPrice > 0)) return recordDiscard('Preço não identificado (filtro de preço mín. ativo)');
    if (product.pixPrice < f.minPrice) return recordDiscard(`Preço < Min (R$ ${product.pixPrice} < R$ ${f.minPrice})`);
  }
  if (f.maxPrice && f.maxPrice > 0) {
    if (!(product.pixPrice > 0)) return recordDiscard('Preço não identificado (filtro de preço máx. ativo)');
    if (product.pixPrice > f.maxPrice) return recordDiscard(`Preço > Max (R$ ${product.pixPrice} > R$ ${f.maxPrice})`);
  }

  // Desconto mínimo — precisa ter desconto conhecido >= mínimo
  if (f.minDiscount && f.minDiscount > 0) {
    if (!(product.discountPercent > 0)) return recordDiscard(`Sem desconto identificado (mín. ${f.minDiscount}%)`);
    if (product.discountPercent < f.minDiscount) return recordDiscard(`Desconto insuficiente (${product.discountPercent}% < ${f.minDiscount}%)`);
  }

  // Avaliação mínima — precisa ter nota conhecida >= mínimo
  if (f.minRating && f.minRating > 0) {
    if (!(product.rating > 0)) return recordDiscard(`Sem avaliação identificada (mín. ${f.minRating}★)`);
    if (product.rating < f.minRating) return recordDiscard(`Avaliação < Min (${product.rating}★ < ${f.minRating}★)`);
  }

  // Vendas mínimas — precisa ter vendas conhecidas >= mínimo
  if (f.minSales && f.minSales > 0) {
    if (!(product.sales > 0)) return recordDiscard(`Sem nº de vendas identificado (mín. ${f.minSales})`);
    if (product.sales < f.minSales) return recordDiscard(`Vendas < Min (${product.sales} < ${f.minSales})`);
  }

  // Checkbox Filters
  if (f.freeShipping && !product.freeShipping) return recordDiscard('Exige Frete Grátis');
  if (f.noInterest && !product.noInterest) return recordDiscard('Exige Sem Juros');

  // Duplicate Check
  if (minedProducts.some((p) => p.title === product.title)) return;

  minedProducts.push(product);
  saveStateToStorage();
  renderDraggableOverlay();
  showToast(`✅ "${product.title.substring(0, 22)}…" Aprovado!`);
}

function recordDiscard(reason) {
  discardedCount++;
  saveStateToStorage();
  renderDraggableOverlay();
}

function mineCurrentPageProduct(force = true) {
  const prod = extractRealProductData(null);
  if (prod) {
    if (force) {
      if (!minedProducts.some((p) => p.title === prod.title)) {
        minedProducts.push(prod);
        saveStateToStorage();
        renderDraggableOverlay();
      }
      showToast(`✅ "${prod.title ? prod.title.substring(0, 22) : 'Produto'}…" Minerado com Sucesso!`);
    } else {
      processAndFilterProduct(prod);
    }
  }
}

function mineCardProduct(card, force = true) {
  const prod = extractRealProductData(card);
  if (prod) {
    if (force) {
      if (!minedProducts.some((p) => p.title === prod.title)) {
        minedProducts.push(prod);
        saveStateToStorage();
        renderDraggableOverlay();
      }
      showToast(`✅ "${prod.title ? prod.title.substring(0, 22) : 'Produto'}…" Minerado com Sucesso!`);
    } else {
      processAndFilterProduct(prod);
    }
  }
}

/* ═══════════════════════════════════════
   9. AUTO-SCROLL MINING
   ═══════════════════════════════════════ */
function startAutoMining() {
  if (autoMineInterval) clearInterval(autoMineInterval);
  autoMineInterval = setInterval(() => {
    if (!extActive || !autoMine) return;
    window.scrollBy({ top: 260, behavior: 'smooth' });

    const selectors = [
      '.ui-search-result__wrapper', '.poly-card',
      '.shopee-search-item-result__item', '[data-sqe="item"]',
      '[data-component-type="s-search-result"]', '.ui-search-layout__item'
    ];
    const cards = document.querySelectorAll(selectors.join(', '));
    cards.forEach((card) => {
      const rect = card.getBoundingClientRect();
      if (rect.top >= -50 && rect.bottom <= window.innerHeight + 150) {
        if (!card.dataset.amChecked) {
          card.dataset.amChecked = '1';
          mineCardProduct(card);
        }
      }
    });

    if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 250) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, 2000);
}

function stopAutoMining() {
  if (autoMineInterval) { clearInterval(autoMineInterval); autoMineInterval = null; }
}

/* ═══════════════════════════════════════
   10. DIAGNOSTIC ERROR MODAL
   ═══════════════════════════════════════ */
function showDiagnosticErrorModal(errLog) {
  let modal = document.getElementById('am-error-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'am-error-modal';
    document.body.appendChild(modal);
  }

  const report = `### ⚠️ Diagnóstico - Affiliate Miner v1.0.1\n**Hora**: ${errLog.time}\n**URL**: ${errLog.url}\n**Contexto**: ${errLog.context}\n\n**Erro**:\n\`\`\`\n${errLog.message}\n${errLog.stack}\n\`\`\`\n*Cole no chat do assistente AI!*`;

  modal.innerHTML = `
    <div class="am-err-box">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <span style="font-weight:800;color:#f59e0b;font-size:14px;">⚠️ Erro Detectado</span>
        <button id="am-err-close" style="background:none;border:none;color:#64748b;font-size:20px;cursor:pointer;">&times;</button>
      </div>
      <p style="font-size:11px;color:#94a3b8;">Copie o relatório e envie ao assistente AI para correção rápida.</p>
      <textarea id="am-err-text" readonly>${report}</textarea>
      <button class="am-err-copy-btn" id="am-err-copy">📋 Copiar Relatório para o AI</button>
    </div>
  `;
  modal.classList.add('open');
  modal.querySelector('#am-err-close').onclick = () => modal.classList.remove('open');
  modal.querySelector('#am-err-copy').onclick = () => {
    modal.querySelector('#am-err-text').select();
    document.execCommand('copy');
    showToast('📋 Relatório copiado!');
  };
}

function showToast(msg) {
  let toast = document.getElementById('am-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'am-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('visible');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove('visible'), 2800);
}

/* ═══════════════════════════════════════
   11. CHROME MESSAGE LISTENER
   ═══════════════════════════════════════ */
if (typeof chrome !== 'undefined' && chrome.runtime) {
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'SET_EXT_ACTIVE') {
      extActive = msg.active;
      renderDraggableOverlay();
      renderFloatingTrigger();
      updatePageHighlighting();
      if (!extActive) stopAutoMining();
    } else if (msg.action === 'SET_AUTO_MINE') {
      autoMine = msg.autoMine;
      renderDraggableOverlay();
      if (autoMine && extActive) startAutoMining(); else stopAutoMining();
    } else if (msg.action === 'SET_FILTERS') {
      qualityFilters = msg.filters;
      renderDraggableOverlay();
    } else if (msg.action === 'UPDATE_MINED_LIST') {
      minedProducts = msg.minedProducts;
      renderDraggableOverlay();
    }
  });
}

/* ═══════════════════════════════════════
   BOOT
   ═══════════════════════════════════════ */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initContentScript);
} else {
  initContentScript();
}
