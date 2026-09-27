/* ====================================
   KARIM GADGET — Dashboard V3.2
   Application Logic (app.js)
   ==================================== */

'use strict';

// ============ UTILITIES ============
const fmt = (n) => {
  if (n == null || isNaN(n)) return 'Rp 0';
  const abs = Math.abs(n);
  return (n < 0 ? '-' : '') + 'Rp ' + new Intl.NumberFormat('id-ID').format(abs);
};
const fmtShort = (n) => {
  if (n == null) return 'Rp 0';
  const abs = Math.abs(n), sign = n < 0 ? '-' : '';
  if (abs >= 1e9) return sign + 'Rp ' + (abs / 1e9).toFixed(1) + 'M';
  if (abs >= 1e6) return sign + 'Rp ' + (abs / 1e6).toFixed(1) + 'jt';
  if (abs >= 1e3) return sign + 'Rp ' + (abs / 1e3).toFixed(0) + 'rb';
  return fmt(n);
};
const fmtDate = (s) => {
  if (!s) return '–';
  try { return new Date(s + (s.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch { return s; }
};
const fmtDateNum = (s) => {
  if (!s) return '–';
  try {
    const d = new Date(s + (s.length === 10 ? 'T00:00:00' : ''));
    if (isNaN(d)) return s;
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  } catch { return s; }
};
const el = (id) => document.getElementById(id);
const setText = (id, v) => { const e = el(id); if (e) e.textContent = v; };

const API_URL = 'https://script.google.com/macros/s/AKfycbzY3DgRFtl6zA-8jHGXvuisb_iFibh8kit-XIriSiRoEYfZvFr4W4IPAsAV4o3_kx1V/exec';

// ============ API FETCH WRAPPER ============
const apiFetch = async (url, options = {}, timeout = 10000) => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  
  const bustUrl = new URL(url);
  bustUrl.searchParams.append('_t', new Date().getTime());
  
  const finalOptions = {
    ...options,
    cache: 'no-store',
    signal: controller.signal
  };
  
  try {
    const res = await fetch(bustUrl.toString(), finalOptions);
    clearTimeout(id);
    return res;
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
};

// ============ AUTHENTICATION & RBAC ============
const Auth = {
  user: null,
  init() {
    const stored = localStorage.getItem('kg_auth_user');
    if (stored) {
      try { this.user = JSON.parse(stored); } catch(e) {}
    }
    
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
      loginForm.onsubmit = (e) => {
        e.preventDefault();
        this.login();
      };
    }
  },

  async login() {
    const userEl = document.getElementById('login-username');
    const passEl = document.getElementById('login-password');
    const btn = document.getElementById('login-btn');
    const alertEl = document.getElementById('login-alert');
    
    if (!userEl || !passEl) return;
    
    const u = userEl.value.trim().toLowerCase();
    const p = passEl.value;
    
    btn.textContent = 'Memeriksa...';
    btn.disabled = true;
    alertEl.style.display = 'none';
    
    let role = '';
    if (u === 'admin' && p === 'admin123') role = 'ADMIN';
    else if ((u === 'khairin' && p === 'khairin123') || (u === 'ridho' && p === 'ridho123')) role = 'OWNER';
    else if (u === 'user' && p === 'user123') role = 'USER';
    
    if (role) {
      this.user = { username: u, role: role };
      localStorage.setItem('kg_auth_user', JSON.stringify(this.user));
      await App.init();
    } else {
      alertEl.textContent = 'Username atau password salah!';
      alertEl.style.display = 'block';
      btn.textContent = 'Sign In';
      btn.disabled = false;
    }
  },
  
  logout() {
    localStorage.removeItem('kg_auth_user');
    this.user = null;
    window.location.reload();
  },

  hasAccess(page) {
    if (!this.user) return false;
    const r = this.user.role;
    if (r === 'ADMIN') return true;
    if (r === 'USER') return page === 'input';
    if (r === 'OWNER') return ['overview', 'transaksi', 'penjualan', 'laporan'].includes(page);
    return false;
  }
};

const BULAN_ID = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const BULAN_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

// Validate tanggal format YYYY-MM-DD
const isValidDate = (s) => {
  if (!s || typeof s !== 'string') return false;
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s + 'T00:00:00').getTime());
};

// Format YYYY-MM to "Agustus 2026"
const fmtYearMonth = (ym) => {
  if (!ym) return '–';
  const [y, m] = ym.split('-');
  return `${BULAN_ID[parseInt(m, 10) - 1]} ${y}`;
};

// ============ CALENDAR FILTER HELPER ============
function applyCalendarFilter(arr, field, filter) {
  const { mode, year, month, start, end } = filter || {};
  if (!mode || mode === 'semua') return [...arr];
  return arr.filter(item => {
    const val = item[field];
    if (!val || !isValidDate(val)) return false;
    const d = new Date(val + 'T00:00:00');
    if (mode === 'hariini') {
      const today = new Date().toISOString().split('T')[0];
      return val === today;
    }
    if (mode === 'mingguini' || mode === 'minggulalu') {
      const todayObj = new Date();
      // Adjust start of week to Monday
      const dayOfWeek = todayObj.getDay() || 7;
      const monday = new Date(todayObj);
      monday.setDate(todayObj.getDate() - dayOfWeek + 1);
      monday.setHours(0, 0, 0, 0);

      const nextMonday = new Date(monday);
      nextMonday.setDate(monday.getDate() + 7);

      const lastMonday = new Date(monday);
      lastMonday.setDate(monday.getDate() - 7);

      const itemDate = new Date(val + 'T00:00:00');
      if (mode === 'mingguini') return itemDate >= monday && itemDate < nextMonday;
      if (mode === 'minggulalu') return itemDate >= lastMonday && itemDate < monday;
    }
    if (mode === 'hari') {
      if (!filter.date) return false;
      return val === filter.date;
    }
    if (mode === 'minggu') {
      if (!filter.week) return false;
      const [y, w] = filter.week.split('-W');
      const year = parseInt(y);
      const week = parseInt(w);
      const simple = new Date(year, 0, 1 + (week - 1) * 7);
      const dayOfWeek = simple.getDay() || 7;
      const monday = new Date(simple);
      monday.setDate(simple.getDate() - dayOfWeek + 1);
      monday.setHours(0, 0, 0, 0);
      const nextMonday = new Date(monday);
      nextMonday.setDate(monday.getDate() + 7);
      const itemDate = new Date(val + 'T00:00:00');
      return itemDate >= monday && itemDate < nextMonday;
    }
    if (mode === 'bulan') return d.getFullYear() === parseInt(year) && d.getMonth() === parseInt(month) - 1;
    if (mode === 'tahun') return d.getFullYear() === parseInt(year);
    if (mode === 'custom') {
      if (!start && !end) return false;
      const from = start ? new Date(start + 'T00:00:00') : new Date('2000-01-01');
      const to = end ? new Date(end + 'T23:59:59') : new Date('2099-12-31');
      return d >= from && d <= to;
    }
    return true;
  });
}

function filterLabel(filter) {
  if (!filter || filter.mode === 'semua') return 'Semua Waktu';
  if (filter.mode === 'bulan') return fmtYearMonth(`${filter.year}-${String(filter.month).padStart(2, '0')}`);
  if (filter.mode === 'tahun') return `Tahun ${filter.year}`;
  if (filter.mode === 'hari') return filter.date ? fmtDateNum(filter.date) : 'Per Hari';
  if (filter.mode === 'minggu') {
    if (!filter.week) return 'Per Minggu';
    const [y, w] = filter.week.split('-W');
    const year = parseInt(y);
    const week = parseInt(w);
    const simple = new Date(year, 0, 1 + (week - 1) * 7);
    const dayOfWeek = simple.getDay() || 7;
    const monday = new Date(simple);
    monday.setDate(simple.getDate() - dayOfWeek + 1);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return `${fmtDateNum(monday.toISOString().split('T')[0])} - ${fmtDateNum(sunday.toISOString().split('T')[0])}`;
  }
  if (filter.mode === 'custom') {
    const s = filter.start ? fmtDateNum(filter.start) : '–';
    const e = filter.end ? fmtDateNum(filter.end) : '–';
    return `${s} - ${e}`;
  }
  return 'Semua Waktu';
}

function getPrevFilter(f) {
  if (f.mode === 'hari') {
    if (!f.date) return null;
    const d = new Date(f.date + 'T00:00:00');
    d.setDate(d.getDate() - 1);
    return { mode: 'hari', date: d.toISOString().split('T')[0] };
  }
  if (f.mode === 'minggu') {
    if (!f.week) return null;
    const [y, w] = f.week.split('-W');
    let year = parseInt(y), week = parseInt(w);
    week -= 1;
    if (week < 1) { year -= 1; week = 52; }
    return { mode: 'minggu', week: `${year}-W${String(week).padStart(2, '0')}` };
  }
  if (f.mode === 'bulan') {
    let y = parseInt(f.year), m = parseInt(f.month);
    m -= 1;
    if (m < 1) { y -= 1; m = 12; }
    return { mode: 'bulan', year: String(y), month: m };
  }
  if (f.mode === 'tahun') {
    if (!f.year) return null;
    return { mode: 'tahun', year: String(parseInt(f.year) - 1) };
  }
  if (f.mode === 'custom') {
    if (!f.start || !f.end) return null;
    const s = new Date(f.start + 'T00:00:00');
    const e = new Date(f.end + 'T00:00:00');
    const diff = e - s;
    const prevE = new Date(s.getTime() - 86400000);
    const prevS = new Date(prevE.getTime() - diff);
    return { mode: 'custom', start: prevS.toISOString().split('T')[0], end: prevE.toISOString().split('T')[0] };
  }
  return null;
}

function getAvailableYears(arr, field) {
  const years = new Set();
  arr.forEach(item => {
    const v = item[field];
    if (isValidDate(v)) years.add(v.substr(0, 4));
  });
  return [...years].sort((a, b) => b - a);
}

// ============ CATEGORY MAPPER ============
function mapCategory(raw = '', desc = '') {
  const k = raw.trim();
  const kLower = k.toLowerCase();
  
  if (kLower === 'penjualan utama' || kLower === 'pendapatan utama') return 'Penjualan Utama';
  if (kLower === 'pendapatan lainnya' || kLower === 'penjualan lainnya' || kLower === 'pendapatan') return 'Pendapatan lainnya';
  if (kLower === 'inventory' || kLower === 'hpp (inventory)' || kLower === 'invenroty') return 'Inventory';
  if (kLower === 'biaya operasional' || kLower === 'operasional' || kLower === 'expenses') return 'Biaya Operasional';
  if (kLower === 'biaya bank' || kLower === 'biaya bank & admin' || kLower === 'biaya bank dan administrasi' || kLower === 'expensess') return 'Biaya Bank';
  if (kLower === 'ekuitas & aset' || kLower === 'ekuitas dan aset' || kLower === 'ekuitas' || kLower === 'deviden' || kLower === 'investasi' || kLower === 'equity') return 'Ekuitas & aset';
  
  return k || 'Lainnya';
}

const BADGE_CLASS = {
  'Penjualan Utama': 'badge badge-penjualan',
  'Pendapatan lainnya': 'badge badge-lainnya',
  'Inventory': 'badge badge-hpp',
  'Biaya Operasional': 'badge badge-operasional',
  'Biaya Bank': 'badge badge-bank',
  'Ekuitas & aset': 'badge badge-ekuitas',
};
function catBadge(kat) {
  const cls = BADGE_CLASS[kat] || 'badge badge-slate';
  return `<span class="${cls}"><span class="dot"></span>${kat}</span>`;
}

// ============ DATA STORE ============
const Store = {
  _transactions: [],
  _sales: [],
  _networth: [],
  _invalidDates: 0,

  _CACHE_TTL_MS: 5 * 60 * 1000,

  _isCacheStale() {
    const ts = parseInt(localStorage.getItem('kg_cache_ts') || '0', 10);
    return (Date.now() - ts) > this._CACHE_TTL_MS;
  },

  _stampCache() {
    localStorage.setItem('kg_cache_ts', String(Date.now()));
  },

  async init() {
    // ================================================================
    // STEP 1: MUAT DATA LOKAL (INSTANT — tidak perlu tunggu GAS)
    // Prioritas: localStorage cache > INITIAL_DATA bundled
    // ================================================================
    this._loadLocalData();

    // Jika App sudah render, update tampilan dengan data lokal
    if (typeof App !== 'undefined' && App._rendered) {
      App.render();
    }

    // ================================================================
    // STEP 2: SYNC GAS DI BACKGROUND (tidak memblokir tampilan)
    // ================================================================
    const cacheStale = this._isCacheStale();
    const hasLocalData = this._transactions.length > 0 || this._sales.length > 0;

    if (!cacheStale && hasLocalData) {
      return; // Cache segar, tidak perlu sync
    }

    // Jalankan sync di background tanpa blokir UI
    this._syncFromGAS();
  },

  // Muat data dari localStorage atau INITIAL_DATA (sinkron, cepat)
  _loadLocalData() {
    const hasCacheTx    = !!localStorage.getItem('kg_tx_cache');
    const hasCacheSales = !!localStorage.getItem('kg_sales_cache');
    const hasCacheNw    = !!localStorage.getItem('kg_nw_cache');

    // Transaksi
    if (hasCacheTx) {
      try { this._transactions = JSON.parse(localStorage.getItem('kg_tx_cache')); } catch { this._transactions = []; }
    } else if (typeof INITIAL_DATA !== 'undefined') {
      const rawInitTx = Array.isArray(INITIAL_DATA) ? INITIAL_DATA : (INITIAL_DATA.transactions || []);
      let skipped = 0;
      this._transactions = rawInitTx.map((t, i) => {
        const tanggal = t.tanggal || '';
        const validTanggal = isValidDate(tanggal) ? tanggal : null;
        if (!validTanggal && (t.deskripsi || t.uangMasuk || t.uangKeluar)) skipped++;
        return { ...t, sheetIndex: i, id: t.id || Math.random().toString(36).substr(2, 8), tanggal: validTanggal, kategori: mapCategory(t.kategoriLama || t.kategori || '', t.deskripsi || ''), kategoriRaw: t.kategori || '' };
      }).filter(t => t.tanggal !== null);
      this._invalidDates = skipped;
    }

    // Penjualan
    if (hasCacheSales) {
      try { this._sales = JSON.parse(localStorage.getItem('kg_sales_cache')); } catch { this._sales = []; }
    } else if (typeof INITIAL_DATA !== 'undefined' && INITIAL_DATA.sales) {
      this._sales = (INITIAL_DATA.sales || []).map(s => {
        const validMasuk = isValidDate(s.tanggalMasuk) ? s.tanggalMasuk : null;
        const validKeluar = isValidDate(s.tanggalKeluar) ? s.tanggalKeluar : null;
        let turnoverDays = null;
        if (validMasuk && validKeluar) {
          const days = Math.round((new Date(validKeluar + 'T00:00:00') - new Date(validMasuk + 'T00:00:00')) / 86400000);
          turnoverDays = days >= 0 ? days : null;
        }
        // ID stabil: jika sudah punya id komposit (mengandung '_'), pakai itu; jika tidak buat dari nota+tanggalMasuk
        const stableId = (s.id && s.id !== s.nota) ? s.id : ((s.nota ? String(s.nota) : 'x') + '_' + (s.tanggalMasuk || 'x') + '_gs');
        return { ...s, id: stableId, notaNum: isNaN(parseInt(s.nota, 10)) ? 0 : parseInt(s.nota, 10), tipe: s.tipeModel || s.tipe || '', tipeModel: s.tipeModel || s.tipe || '', tanggalMasuk: validMasuk, tanggalKeluar: validKeluar, turnoverDays };
      });
    }

    // Networth
    if (hasCacheNw) {
      try { this._networth = JSON.parse(localStorage.getItem('kg_nw_cache')); } catch { this._networth = []; }
    } else if (typeof INITIAL_DATA !== 'undefined' && INITIAL_DATA.networth) {
      this._networth = INITIAL_DATA.networth || [];
    } else {
      this._networth = [];
    }
  },

  // Sync dari Google Sheets di BACKGROUND — tidak blokir UI
  async _syncFromGAS() {
    // Tampilkan badge kecil "sinkronisasi" di pojok layar
    const badge = this._showSyncBadge();

    try {
      const res = await apiFetch(API_URL, { redirect: 'follow' }, 20000);
      if (!res.ok) throw new Error('HTTP error: ' + res.status);
      const data = await res.json();

      if (data && (data.transactions || data.sales)) {
        let skipped = 0;

        // Proses transaksi
        const gsTx = (data.transactions || []).filter(t => {
          return (t.uangMasuk > 0 || t.uangKeluar > 0 || (t.deskripsi && t.deskripsi.trim() !== '') || t.saldo > 0);
        }).map((t, i) => {
          const tanggal = t.tanggal || '';
          const validTanggal = isValidDate(tanggal) ? tanggal : null;
          if (!validTanggal) skipped++;
          return { ...t, sheetIndex: t.sheetIndex !== undefined ? t.sheetIndex : i, id: t.id || Math.random().toString(36).substr(2, 8), tanggal: validTanggal, kategori: mapCategory(t.kategoriLama || t.kategori || '', t.deskripsi || ''), kategoriRaw: t.kategori || '' };
        }).filter(t => t.tanggal !== null);
        this._invalidDates = skipped;

        // Merge pending
        const pendingTx = this._getPendingTx();
        this._transactions = [...gsTx];
        pendingTx.forEach(p => { if (!this._transactions.find(t => t.id === p.id)) this._transactions.push(p); });
        this._transactions.sort((a, b) => {
          const c = (a.tanggal || '').localeCompare(b.tanggal || '');
          return c !== 0 ? c : (a.sheetIndex || 0) - (b.sheetIndex || 0);
        });
        this._recalcAllSaldo();
        this._saveTxLocal();

        // Proses penjualan
        const gsSales = (data.sales || []).map(s => {
          const validMasuk = isValidDate(s.tanggalMasuk) ? s.tanggalMasuk : null;
          const validKeluar = isValidDate(s.tanggalKeluar) ? s.tanggalKeluar : null;
          let turnoverDays = null;
          if (validMasuk && validKeluar) {
            const days = Math.round((new Date(validKeluar + 'T00:00:00') - new Date(validMasuk + 'T00:00:00')) / 86400000);
            turnoverDays = days >= 0 ? days : null;
          }
          // ID stabil per baris GS: nota + tanggalMasuk + '_gs' → unik meski nota sama selama tanggal berbeda
          // Jika sudah ada id komposit tersimpan di GS (mengandung '_'), gunakan langsung
          const gsId = (s.id && s.id !== s.nota) ? s.id : ((s.nota ? String(s.nota) : 'x') + '_' + (validMasuk || 'x') + '_gs');
          return { ...s, id: gsId, notaNum: isNaN(parseInt(s.nota, 10)) ? 0 : parseInt(s.nota, 10), tipe: s.tipeModel || s.tipe || '', tipeModel: s.tipeModel || s.tipe || '', tanggalMasuk: validMasuk, tanggalKeluar: validKeluar, turnoverDays };
        });
        const pendingSales = this._getPendingSales();
        this._sales = [...gsSales];
        // Merge pending berdasarkan id unik, bukan nota (hindari duplikasi nota yang berbeda entri)
        pendingSales.forEach(p => { if (!this._sales.find(s => s.id === p.id)) this._sales.push(p); });
        this._saveSalesLocal();

        this._networth = data.networth || [];
        this._saveNetworthLocal();
        this._stampCache();

        // Update badge: berhasil
        this._updateSyncBadge(badge, 'success');
        // Re-render dashboard secara halus di background
        if (typeof App !== 'undefined' && App._rendered) {
          setTimeout(() => App.render(), 300);
        }
      }
    } catch (e) {
      console.warn('[KG] Background sync gagal:', e.message);
      this._updateSyncBadge(badge, 'error');
    }
  },

  // Badge sinkronisasi kecil di pojok kanan atas
  _showSyncBadge() {
    let badge = document.getElementById('kg-sync-badge');
    if (!badge) {
      badge = document.createElement('div');
      badge.id = 'kg-sync-badge';
      badge.style.cssText = 'position:fixed;top:70px;right:12px;z-index:9998;background:#1295ae;color:white;font-size:11px;font-weight:600;padding:5px 10px;border-radius:20px;box-shadow:0 2px 8px rgba(0,0,0,0.15);display:flex;align-items:center;gap:6px;transition:all 0.3s;font-family:Inter,sans-serif;';
      document.body.appendChild(badge);
    }
    badge.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="animation:spin 1s linear infinite"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10"/><path d="M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg> Sinkronisasi...';
    badge.style.opacity = '1';
    return badge;
  },

  _updateSyncBadge(badge, status) {
    if (!badge) return;
    if (status === 'success') {
      badge.style.background = '#10B981';
      badge.innerHTML = '✓ Tersinkronisasi';
    } else {
      badge.style.background = '#64748b';
      badge.innerHTML = '⚡ Mode Offline';
    }
    setTimeout(() => {
      badge.style.opacity = '0';
      setTimeout(() => badge.remove(), 400);
    }, 2500);
  },

  _saveNetworthLocal() {
    try { localStorage.setItem('kg_nw_cache', JSON.stringify(this._networth)); } catch (e) {}
  },

  // ---- Local Storage — Transaksi Kas ----
  _saveTxLocal() {
    try { localStorage.setItem('kg_tx_cache', JSON.stringify(this._transactions)); } catch (e) { }
  },
  _getPendingTx() {
    try { return JSON.parse(localStorage.getItem('kg_pending_tx') || '[]'); } catch { return []; }
  },
  _setPendingTx(list) {
    try { localStorage.setItem('kg_pending_tx', JSON.stringify(list)); } catch (e) { }
  },

  // ---- Local Storage — Penjualan ----
  _saveSalesLocal() {
    try { localStorage.setItem('kg_sales_cache', JSON.stringify(this._sales)); } catch (e) { }
  },
  _getPendingSales() {
    try { return JSON.parse(localStorage.getItem('kg_pending_sales') || '[]'); } catch { return []; }
  },
  _setPendingSales(list) {
    try { localStorage.setItem('kg_pending_sales', JSON.stringify(list)); } catch (e) { }
  },

  // ---- Transaction Methods ----
  getTx({ filter = null, kat = '', search = '', sortBy = 'tanggal', sortDir = 'desc' } = {}) {
    let r = filter ? applyCalendarFilter(this._transactions, 'tanggal', filter) : [...this._transactions];
    if (kat) r = r.filter(t => t.kategori === kat);
    if (search) {
      const terms = search.toLowerCase().split(/\s+/).filter(Boolean);
      r = r.filter(t => {
        const text = String(t.deskripsi || '').toLowerCase();
        return terms.every(term => text.includes(term));
      });
    }
    r.sort((a, b) => {
      let va = a[sortBy], vb = b[sortBy];
      if (va === vb && a.sheetIndex !== undefined && b.sheetIndex !== undefined) {
         return sortDir === 'asc' ? a.sheetIndex - b.sheetIndex : b.sheetIndex - a.sheetIndex;
      }
      if (typeof va === 'string') return sortDir === 'asc' ? va.localeCompare(vb || '') : (vb || '').localeCompare(va);
      return sortDir === 'asc' ? (va || 0) - (vb || 0) : (vb || 0) - (va || 0);
    });
    return r;
  },

  async addTx(tx) {
    tx.id = Math.random().toString(36).substr(2, 8);
    tx.sheetIndex = Date.now();
    this._transactions.push(tx);
    this._transactions.sort((a, b) => (a.tanggal || '').localeCompare(b.tanggal || ''));
    this._recalcAllSaldo();
    // Simpan ke localStorage agar tidak hilang saat refresh
    this._saveTxLocal();
    // Tandai sebagai pending
    const pending = this._getPendingTx();
    pending.push(tx);
    this._setPendingTx(pending);
    // Kirim ke Google Sheets
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        redirect: 'follow',
        body: JSON.stringify({ action: 'addTransaction', data: tx })
      });
      const result = await res.json();
      if (result.success) {
        // Hapus dari pending setelah berhasil
        this._setPendingTx(this._getPendingTx().filter(p => p.id !== tx.id));
      }
    } catch (e) {
      console.warn('[KG] Offline — transaksi tersimpan lokal:', e.message);
    }
  },

  async updateTx(id, updates) {
    const idx = this._transactions.findIndex(t => String(t.id) === String(id));
    if (idx === -1) return false;
    const merged = { ...this._transactions[idx], ...updates };
    this._transactions[idx] = merged;
    this._transactions.sort((a, b) => (a.tanggal || '').localeCompare(b.tanggal || ''));
    this._recalcAllSaldo();
    this._saveTxLocal();
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        redirect: 'follow',
        body: JSON.stringify({ action: 'updateTransaction', id: id, data: merged })
      });
      const result = await res.json();
      if (result.success) {
        toast('✅ Transaksi berhasil diupdate di Google Sheets!', 'success');
      }
    } catch (e) { console.warn('[KG] Offline update tx — tersimpan lokal:', e.message); }
    return true;
  },

  deleteTx(id) {
    const tx = this._transactions.find(t => String(t.id) === String(id));
    this._transactions = this._transactions.filter(t => String(t.id) !== String(id));
    this._recalcAllSaldo();
    this._saveTxLocal();
    if (tx) {
      // Hapus dari pending queue jika ada
      this._setPendingTx(this._getPendingTx().filter(p => String(p.id) !== String(id)));
      // Kirim request hapus ke Google Sheets
      try {
        fetch(API_URL, {
          method: 'POST',
          redirect: 'follow',
          body: JSON.stringify({ action: 'deleteTransaction', id: tx.id, tanggal: tx.tanggal, deskripsi: tx.deskripsi })
        });
      } catch (e) { console.warn('[KG] Gagal hapus tx dari GS:', e.message); }
    }
  },

  _recalcAllSaldo() {
    let currentSaldo = 0;
    this._transactions.forEach((t, i) => {
      // Jika baris pertama memiliki saldo awal yang diinput manual, gunakan itu
      if (i === 0 && t.saldo != null && !t.uangMasuk && !t.uangKeluar) {
        currentSaldo = parseFloat(t.saldo) || 0;
      } else {
        currentSaldo += (parseFloat(t.uangMasuk) || 0) - (parseFloat(t.uangKeluar) || 0);
      }
      t.calcSaldo = currentSaldo;
      // JANGAN timpa t.saldo, biarkan sesuai Google Sheets agar tidak melenceng!
    });
  },

  getLatestSaldo() {
    if (!this._transactions.length) return 0;
    const last = this._transactions[this._transactions.length - 1];
    return last.saldo != null ? parseFloat(last.saldo) : (last.calcSaldo || 0);
  },

  getDescriptions() {
    return [...new Set(this._transactions.map(t => t.deskripsi).filter(Boolean))].sort();
  },

  getGroupedStats(filter, groupMode = 'bulan') {
    const filtered = applyCalendarFilter(this._transactions, 'tanggal', filter || { mode: 'semua' });
    const groups = {};
    filtered.forEach(t => {
      if (!t.tanggal || !isValidDate(t.tanggal)) return;
      let key = '', label = '';
      const d = new Date(t.tanggal + 'T00:00:00');
      
      if (groupMode === 'hari') {
        key = t.tanggal;
        label = fmtDate(t.tanggal);
      } else if (groupMode === 'minggu') {
        const dayOfWeek = d.getDay() || 7;
        const monday = new Date(d);
        monday.setDate(d.getDate() - dayOfWeek + 1);
        
        // Gunakan getFullYear, getMonth, getDate agar tidak terkena pergeseran zona waktu UTC
        const y = monday.getFullYear();
        const m = String(monday.getMonth() + 1).padStart(2, '0');
        const day = String(monday.getDate()).padStart(2, '0');
        key = `${y}-${m}-${day}`;
        label = `Minggu ${fmtDateNum(key)}`;
      } else if (groupMode === 'bulan') {
        key = t.tanggal.substr(0, 7);
        label = fmtYearMonth(key);
      } else if (groupMode === 'tahun') {
        key = t.tanggal.substr(0, 4);
        label = `Tahun ${key}`;
      } else if (groupMode === 'dasawarsa') {
        const year = d.getFullYear();
        const decade = Math.floor(year / 10) * 10;
        key = String(decade);
        label = `Era ${decade}an`;
      }
      
      if (!groups[key]) groups[key] = { sortKey: key, bulan: label, masuk: 0, keluar: 0, saldo: 0, count: 0 };
      groups[key].masuk += t.uangMasuk || 0;
      groups[key].keluar += t.uangKeluar || 0;
      if (t.saldo != null) groups[key].saldo = parseFloat(t.saldo);
      groups[key].count++;
    });
    return Object.values(groups)
      .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
      .map(g => ({ ...g, profit: g.masuk - g.keluar }));
  },

  getMonthlyStats() {
    return this.getGroupedStats({mode: 'semua'}, 'bulan');
  },


  getTrendStats(filter) {
    const filtered = applyCalendarFilter(this._transactions, 'tanggal', filter || { mode: 'semua' });
    const mode = (filter || {}).mode || 'semua';
    const groupByDay = ['hari', 'minggu', 'bulan', 'custom'].includes(mode);

    const map = {};
    filtered.forEach(t => {
      if (!t.tanggal || !isValidDate(t.tanggal)) return;
      const key = groupByDay ? t.tanggal : t.tanggal.substr(0, 7);
      if (!map[key]) map[key] = { label: groupByDay ? fmtDateNum(key) : fmtYearMonth(key), masuk: 0, keluar: 0, count: 0, saldo: 0 };
      map[key].masuk += t.uangMasuk || 0;
      map[key].keluar += t.uangKeluar || 0;
      if (t.saldo != null) map[key].saldo = parseFloat(t.saldo);
      map[key].count++;
    });
    return Object.keys(map).sort().map(k => ({
      bulan: map[k].label,
      profit: map[k].masuk - map[k].keluar,
      masuk: map[k].masuk,
      keluar: map[k].keluar,
      saldo: map[k].saldo,
      count: map[k].count
    }));
  },

  getYearlyStats() {
    const years = {};
    this._transactions.forEach(t => {
      if (!t.tanggal || !isValidDate(t.tanggal)) return;
      const key = t.tanggal.substr(0, 4);
      if (!years[key]) years[key] = { tahun: key, masuk: 0, keluar: 0, saldo: 0, count: 0 };
      years[key].masuk += t.uangMasuk || 0;
      years[key].keluar += t.uangKeluar || 0;
      if (t.saldo != null) years[key].saldo = parseFloat(t.saldo);
      years[key].count++;
    });
    return Object.values(years).sort((a, b) => a.tahun.localeCompare(b.tahun)).map(y => ({ ...y, profit: y.masuk - y.keluar }));
  },

  getStatsByFilter(filter) {
    const filtered = applyCalendarFilter(this._transactions, 'tanggal', filter || { mode: 'semua' });
    let masuk = 0, keluar = 0, countMasuk = 0, countKeluar = 0, saldo = 0;
    filtered.forEach(t => {
      if ((t.uangMasuk || 0) > 0) { masuk += t.uangMasuk; countMasuk++; }
      if ((t.uangKeluar || 0) > 0) { keluar += t.uangKeluar; countKeluar++; }
      if (t.saldo != null) saldo = parseFloat(t.saldo);
    });
    return { masuk, keluar, profit: masuk - keluar, count: filtered.length, countMasuk, countKeluar, saldo };
  },

  getCategorySpend(filter) {
    const filtered = applyCalendarFilter(this._transactions, 'tanggal', filter || { mode: 'semua' });
    const cats = {};
    const validExpense = ['Inventory', 'Biaya Operasional', 'Biaya Bank', 'Ekuitas & aset'];
    filtered.forEach(t => {
      if ((t.uangKeluar || 0) > 0) {
        const k = validExpense.includes(t.kategori) ? t.kategori : 'Lainnya';
        cats[k] = (cats[k] || 0) + t.uangKeluar;
      }
    });
    Object.keys(cats).forEach(k => { if (cats[k] <= 0) delete cats[k]; });
    return cats;
  },

  getDynamicNetworth() {
    const dates = new Set();
    this._transactions.forEach(t => { if (t.tanggal && isValidDate(t.tanggal)) dates.add(t.tanggal); });
    this._sales.forEach(s => { 
      if (s.tanggalMasuk && isValidDate(s.tanggalMasuk)) dates.add(s.tanggalMasuk); 
      if (s.tanggalKeluar && isValidDate(s.tanggalKeluar)) dates.add(s.tanggalKeluar); 
    });
    
    if (!dates.size) return [];
    const sortedDates = Array.from(dates).sort();
    
    const nwData = [];
    let txIdx = 0;
    let currentKas = 0;
    const sortedTxs = [...this._transactions].sort((a,b) => (a.tanggal||'').localeCompare(b.tanggal||''));
    
    sortedDates.forEach(date => {
      while(txIdx < sortedTxs.length && sortedTxs[txIdx].tanggal <= date) {
         const t = sortedTxs[txIdx];
         currentKas = (t.saldo != null && t.saldo !== '') ? parseFloat(t.saldo) : (t.calcSaldo || 0);
         txIdx++;
      }
      
      let stok = 0;
      this._sales.forEach(s => {
        if (s.tanggalMasuk && s.tanggalMasuk <= date) {
          if (!s.tanggalKeluar || s.tanggalKeluar > date) {
            stok += parseFloat(s.hargaBeli || 0);
          }
        }
      });
      
      nwData.push({ tanggal: date, kas: currentKas, stok, networth: currentKas + stok });
    });
    return nwData;
  },

  getIncomeSpend(filter) {
    const filtered = applyCalendarFilter(this._transactions, 'tanggal', filter || { mode: 'semua' });
    const cats = {};
    const validIncome = ['Penjualan Utama', 'Pendapatan lainnya', 'Ekuitas & aset'];
    filtered.forEach(t => {
      if ((t.uangMasuk || 0) > 0) {
        const k = validIncome.includes(t.kategori) ? t.kategori : 'Lainnya';
        cats[k] = (cats[k] || 0) + t.uangMasuk;
      }
    });
    Object.keys(cats).forEach(k => { if (cats[k] <= 0) delete cats[k]; });
    return cats;
  },

  getTopProducts(limit = 7, filter = null, sortBy = 'profit') {
    const map = {};
    const filteredSales = applyCalendarFilter(this._sales, 'tanggalKeluar', filter || { mode: 'semua' });
    filteredSales.forEach(s => {
      if (!s.tanggalKeluar) return;
      const name = s.tipeModel || s.tipe || '';
      if (!name) return;
      
      let baseModel = name;
      let detailStr = 'Lainnya';
      
      const iphoneMatch = name.match(/iPhone\s+(?:\d+|SE|X[RS]?)(?:\s+(?:Pro Max|Pro|Plus|Mini))?/i);
      const ipadMatch = name.match(/iPad(?:\s+(?:Pro|Air|mini))?(?:\s+\d+(?:\.\d+)?(?:\"|inch)?)?(?:\s+(?:Gen|Generasi)\s*\d+)?/i);
      const watchMatch = name.match(/Apple\s+Watch(?:\s+(?:Series\s+\d+|SE|Ultra(?:\s+\d+)?))?/i);

      if (iphoneMatch) {
        baseModel = iphoneMatch[0];
        detailStr = name.substring(iphoneMatch.index + iphoneMatch[0].length).trim();
      } else if (ipadMatch) {
        baseModel = ipadMatch[0];
        detailStr = name.substring(ipadMatch.index + ipadMatch[0].length).trim();
      } else if (watchMatch) {
        baseModel = watchMatch[0];
        detailStr = name.substring(watchMatch.index + watchMatch[0].length).trim();
      } else {
        const capMatch = name.search(/\b(?:64|128|256|512)\s*GB|\b1\s*TB\b/i);
        if (capMatch > -1) {
          baseModel = name.substring(0, capMatch).trim();
          detailStr = name.substring(capMatch).trim();
        }
      }
      
      detailStr = detailStr.replace(/^\s*[-:]\s*/, '').trim();
      if (!detailStr) detailStr = 'Lainnya';
      
      baseModel = baseModel.replace(/\s*(iBox|Inter|inter|ibox|WIFI|Cellular|Wi-Fi)\s*/gi, ' ').replace(/\s*\(.*?\)\s*/g, '').trim();
      const k = baseModel;

      if (!map[k]) map[k] = { name: k, profit: 0, count: 0, details: {} };
      map[k].profit += s.profit || 0;
      map[k].count++;
      
      if (!map[k].details[detailStr]) map[k].details[detailStr] = { count: 0, profit: 0 };
      map[k].details[detailStr].count++;
      map[k].details[detailStr].profit += s.profit || 0;
    });

    const arr = Object.values(map);
    arr.forEach(p => {
       p.detailList = Object.entries(p.details)
         .map(([nm, val]) => ({ nm, ...val }))
         .sort((a,b) => b[sortBy] - a[sortBy]);
    });

    return arr.sort((a, b) => b[sortBy] - a[sortBy]).slice(0, limit);
  },

  getLifetimeTotals() { return this.getStatsByFilter({ mode: 'semua' }); },

  // ---- Sales Methods ----
  getSales({ filter = null, search = '', sortBy = 'tanggalMasuk', sortDir = 'desc' } = {}) {
    let r = filter ? applyCalendarFilter(this._sales, 'tanggalMasuk', filter) : [...this._sales];
    if (!filter || filter.mode === 'semua') r = [...this._sales];
    if (search) {
      const terms = search.toLowerCase().split(/\s+/).filter(Boolean);
      r = r.filter(s => {
        const text1 = String(s.tipeModel || s.tipe || '').toLowerCase();
        const text2 = String(s.nota || '').toLowerCase();
        return terms.every(term => text1.includes(term) || text2.includes(term));
      });
    }
    r.sort((a, b) => {
      let va = a[sortBy], vb = b[sortBy];
      if (va === vb && a.notaNum !== undefined && b.notaNum !== undefined) {
         return sortDir === 'asc' ? a.notaNum - b.notaNum : b.notaNum - a.notaNum;
      }
      if (!va && !vb) return 0;
      if (!va) return sortDir === 'asc' ? 1 : -1;
      if (!vb) return sortDir === 'asc' ? -1 : 1;
      if (typeof va === 'string') return sortDir === 'asc' ? va.localeCompare(vb || '') : (vb || '').localeCompare(va);
      return sortDir === 'asc' ? (va || 0) - (vb || 0) : (vb || 0) - (va || 0);
    });
    return r;
  },

  getSalesByFilter(filter, dateField = 'tanggalKeluar') {
    if (!filter || filter.mode === 'semua') return [...this._sales];
    return applyCalendarFilter(this._sales, dateField, filter);
  },

  getUnsoldUnits() {
    return this._sales.filter(s => !s.tanggalKeluar || s.hargaJual === 0);
  },

  getNextNota() {
    let max = 0;
    this._sales.forEach(s => {
      const n = parseInt(s.nota);
      if (!isNaN(n) && n > max) max = n;
    });
    return max + 1;
  },

  async addSale(sale) {
    // ID unik per entri: gabungkan nota + timestamp agar tidak terjadi duplikasi
    sale.id = (sale.nota ? String(sale.nota) : '') + '_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    sale.notaNum = isNaN(parseInt(sale.nota, 10)) ? 0 : parseInt(sale.nota, 10);
    this._sales.push(sale);
    this._saveSalesLocal();
    // Tandai sebagai pending
    const pending = this._getPendingSales();
    pending.push(sale);
    this._setPendingSales(pending);
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        redirect: 'follow',
        body: JSON.stringify({ action: 'addSale', data: sale })
      });
      const result = await res.json();
      if (result.success) {
        this._setPendingSales(this._getPendingSales().filter(p => p.id !== sale.id));
        toast('✅ Unit tersimpan ke Google Sheets!', 'success');
      }
    } catch (e) { console.warn('[KG] Offline — sale tersimpan lokal:', e.message); }
  },

  async updateSale(id, updates) {
    const idx = this._sales.findIndex(s => String(s.id) === String(id));
    if (idx === -1) return false;
    const merged = { ...this._sales[idx], ...updates };
    if (merged.tanggalMasuk && merged.tanggalKeluar && isValidDate(merged.tanggalMasuk) && isValidDate(merged.tanggalKeluar)) {
      const days = Math.round((new Date(merged.tanggalKeluar + 'T00:00:00') - new Date(merged.tanggalMasuk + 'T00:00:00')) / 86400000);
      merged.turnoverDays = days >= 0 ? days : null;
    }
    if (merged.hargaBeli != null && merged.hargaJual != null) {
      if (!merged.tanggalKeluar || (merged.hargaJual || 0) === 0) {
        merged.profit = 0;
      } else {
        merged.profit = (merged.hargaJual || 0) - (merged.hargaBeli || 0);
      }
    }
    merged.tipe = merged.tipeModel || merged.tipe || '';
    merged.tipeModel = merged.tipe;
    this._sales[idx] = merged;
    this._saveSalesLocal();
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        redirect: 'follow',
        body: JSON.stringify({ action: 'updateSale', nota: merged.nota, data: updates })
      });
      const result = await res.json();
      if (result.success) toast('✅ Data penjualan diperbarui di Google Sheets!', 'success');
    } catch (e) { console.warn('[KG] Offline update sale — tersimpan lokal:', e.message); }
    return true;
  },

  async deleteSale(id) {
    const sale = this._sales.find(s => String(s.id) === String(id));
    if (!sale) return false;
    this._sales = this._sales.filter(s => String(s.id) !== String(id));
    this._saveSalesLocal();
    // Hapus dari pending hanya yang id-nya sama (bukan berdasarkan nota)
    this._setPendingSales(this._getPendingSales().filter(p => String(p.id) !== String(id)));
    try {
      fetch(API_URL, {
        method: 'POST',
        redirect: 'follow',
        // Kirim id unik agar server bisa membedakan baris dengan nota sama
        body: JSON.stringify({ action: 'deleteSale', nota: sale.nota, saleId: sale.id })
      });
    } catch (e) { console.warn('[KG] Gagal hapus sale dari GS:', e.message); }
    return true;
  },

  getSaleById(id) { return this._sales.find(s => String(s.id) === String(id)); },
  getTxById(id) { return this._transactions.find(t => String(t.id) === String(id)); },

  getAvailableTxYears() { return getAvailableYears(this._transactions, 'tanggal'); },
  getAvailableSalesYears() {
    const all = [
      ...getAvailableYears(this._sales, 'tanggalMasuk'),
      ...getAvailableYears(this._sales, 'tanggalKeluar'),
    ];
    return [...new Set(all)].sort((a, b) => b - a);
  },
};

// ============ CALENDAR FILTER WIDGET ============
const CalendarFilter = {
  buildHTML(id, opts = {}) {
    const { showSemua = true } = opts;
    return `
      <div class="cal-filter" id="calf-${id}">
        <div class="cal-filter-row">
          <select class="cal-mode-sel form-select-sm" id="calf-${id}-mode" onchange="CalendarFilter.onModeChange('${id}')">
            ${showSemua ? '<option value="semua">Semua Waktu</option>' : ''}
            <option value="hari">Hari</option>
            <option value="minggu">Minggu</option>
            <option value="bulan">Bulan</option>
            <option value="tahun">Tahun</option>
            <option value="custom">Custom</option>
          </select>
          <span class="cal-filter-label" id="calf-${id}-label">Semua Waktu</span>
        </div>
        <div class="cal-filter-extra" id="calf-${id}-extra" style="display:none"></div>
      </div>`;
  },

  onModeChange(id) {
    const modeEl = el(`calf-${id}-mode`);
    if (!modeEl) return;
    const mode = modeEl.value;
    const extraEl = el(`calf-${id}-extra`);
    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = now.getMonth() + 1;

    if (mode === 'semua') {
      extraEl.style.display = 'none';
      extraEl.innerHTML = '';
    } else if (mode === 'bulan') {
      const monthOptions = BULAN_ID.map((n, i) => `<option value="${i + 1}" ${i + 1 === curMonth ? 'selected' : ''}>${n}</option>`).join('');
      const yearList = this._getYearsForId(id);
      const yearOptions = yearList.map(y => `<option value="${y}" ${y == curYear ? 'selected' : ''}>${y}</option>`).join('');
      extraEl.innerHTML = `
        <select class="form-select-sm" id="calf-${id}-month" onchange="CalendarFilter.onParamChange('${id}')">${monthOptions}</select>
        <select class="form-select-sm" id="calf-${id}-year" onchange="CalendarFilter.onParamChange('${id}')">${yearOptions}</select>`;
      extraEl.style.display = 'flex';
    } else if (mode === 'tahun') {
      const yearList = this._getYearsForId(id);
      const yearOptions = yearList.map(y => `<option value="${y}" ${y == curYear ? 'selected' : ''}>${y}</option>`).join('');
      extraEl.innerHTML = `<select class="form-select-sm" id="calf-${id}-year" onchange="CalendarFilter.onParamChange('${id}')">${yearOptions}</select>`;
      extraEl.style.display = 'flex';
    } else if (mode === 'hari') {
      extraEl.innerHTML = `<input type="date" class="form-input-sm" id="calf-${id}-date" onchange="CalendarFilter.onParamChange('${id}')">`;
      extraEl.style.display = 'flex';
      if (el(`calf-${id}-date`)) el(`calf-${id}-date`).value = now.toISOString().split('T')[0];
    } else if (mode === 'minggu') {
      extraEl.innerHTML = `<input type="week" class="form-input-sm" id="calf-${id}-week" onchange="CalendarFilter.onParamChange('${id}')">`;
      extraEl.style.display = 'flex';
      const firstDayOfYear = new Date(curYear, 0, 1);
      const pastDaysOfYear = (now - firstDayOfYear) / 86400000;
      const weekNum = Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
      if (el(`calf-${id}-week`)) el(`calf-${id}-week`).value = `${curYear}-W${weekNum.toString().padStart(2, '0')}`;
    } else if (mode === 'custom') {
      extraEl.innerHTML = `
        <input type="date" class="form-input-sm" id="calf-${id}-start" onchange="CalendarFilter.onParamChange('${id}')">
        <span style="color:var(--text-muted);font-size:13px">→</span>
        <input type="date" class="form-input-sm" id="calf-${id}-end" onchange="CalendarFilter.onParamChange('${id}')">`;
      extraEl.style.display = 'flex';
    }

    this.onParamChange(id);
  },

  onParamChange(id) {
    const filter = this.getFilter(id);
    const labelEl = el(`calf-${id}-label`);
    if (labelEl) labelEl.textContent = filterLabel(filter);
    if (this._callbacks[id]) this._callbacks[id](filter);
  },

  getFilter(id) {
    const modeEl = el(`calf-${id}-mode`);
    if (!modeEl) return { mode: 'semua' };
    const mode = modeEl.value;
    if (mode === 'semua') return { mode: 'semua' };
    if (mode === 'bulan') {
      const month = el(`calf-${id}-month`) ? parseInt(el(`calf-${id}-month`).value) : new Date().getMonth() + 1;
      const year = el(`calf-${id}-year`) ? el(`calf-${id}-year`).value : String(new Date().getFullYear());
      return { mode: 'bulan', year, month };
    }
    if (mode === 'tahun') {
      const year = el(`calf-${id}-year`) ? el(`calf-${id}-year`).value : String(new Date().getFullYear());
      return { mode: 'tahun', year };
    }
    if (mode === 'hari') {
      const date = el(`calf-${id}-date`) ? el(`calf-${id}-date`).value : '';
      return { mode: 'hari', date };
    }
    if (mode === 'minggu') {
      const week = el(`calf-${id}-week`) ? el(`calf-${id}-week`).value : '';
      return { mode: 'minggu', week };
    }
    if (mode === 'custom') {
      const start = el(`calf-${id}-start`) ? el(`calf-${id}-start`).value : '';
      const end = el(`calf-${id}-end`) ? el(`calf-${id}-end`).value : '';
      return { mode: 'custom', start, end };
    }
    return { mode: 'semua' };
  },

  setFilter(id, filter) {
    const modeEl = el(`calf-${id}-mode`);
    if (!modeEl) return;
    modeEl.value = filter.mode || 'semua';
    this.onModeChange(id);
    if (filter.mode === 'bulan') {
      if (el(`calf-${id}-month`)) el(`calf-${id}-month`).value = filter.month;
      if (el(`calf-${id}-year`)) el(`calf-${id}-year`).value = filter.year;
    } else if (filter.mode === 'tahun') {
      if (el(`calf-${id}-year`)) el(`calf-${id}-year`).value = filter.year;
    } else if (filter.mode === 'hari') {
      if (el(`calf-${id}-date`)) el(`calf-${id}-date`).value = filter.date || '';
    } else if (filter.mode === 'minggu') {
      if (el(`calf-${id}-week`)) el(`calf-${id}-week`).value = filter.week || '';
    } else if (filter.mode === 'custom') {
      if (el(`calf-${id}-start`)) el(`calf-${id}-start`).value = filter.start || '';
      if (el(`calf-${id}-end`)) el(`calf-${id}-end`).value = filter.end || '';
    }
    const labelEl = el(`calf-${id}-label`);
    if (labelEl) labelEl.textContent = filterLabel(filter);
  },

  _callbacks: {},
  _yearSources: {},

  register(id, callback, yearSource) {
    this._callbacks[id] = callback;
    this._yearSources[id] = yearSource || (() => [new Date().getFullYear().toString()]);
  },

  _getYearsForId(id) {
    if (this._yearSources[id]) return this._yearSources[id]();
    return [String(new Date().getFullYear())];
  },
};

// ============ CHART MANAGER ============
const Charts = {
  _c: {},
  destroy(k) { if (this._c[k]) { this._c[k].destroy(); delete this._c[k]; } },

  _defaults(tooltipExtra = {}) {
    return {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        tooltip: {
          backgroundColor: 'rgba(15,23,42,0.92)',
          titleFont: { family: 'Inter', weight: '700', size: 12 },
          bodyFont: { family: 'JetBrains Mono', size: 12 },
          padding: 12, cornerRadius: 8,
          intersect: false, mode: 'index',
          ...tooltipExtra,
        },
        legend: {
          labels: { font: { family: 'Inter', size: 11 }, padding: 14, usePointStyle: true, pointStyle: 'circle' }
        }
      },
      interaction: {
        mode: 'index',
        intersect: false,
      }
    };
  },
  _scales(gridColor = 'rgba(0,0,0,0.03)') {
    return {
      x: { grid: { display: false }, ticks: { color: '#64748b', font: { family: 'Inter', size: 11 } } },
      y: { grid: { color: gridColor, drawBorder: false, borderDash: [5, 5] }, ticks: { color: '#64748b', font: { family: 'JetBrains Mono', size: 11 }, callback: v => fmtShort(v) }, border: { display: false } }
    };
  },

  renderNetWorth(data, granularity = 'hari') {
    this.destroy('networth');
    const ctx = el('chart-networth'); if (!ctx || !data || !data.length) return;

    let result = [];
    const safeData = data.filter(d => d.tanggal && isValidDate(d.tanggal));
    
    if (granularity === 'harian' || granularity === 'hari') {
      result = safeData.map(d => ({
        label: fmtDateNum(d.tanggal),
        kas: d.kas, stok: d.stok, networth: d.networth
      }));
    } else if (granularity === 'mingguan' || granularity === 'minggu') {
      const map = {};
      safeData.forEach(d => {
        const date = new Date(d.tanggal + 'T00:00:00');
        const dayOfWeek = date.getDay() || 7;
        const monday = new Date(date);
        monday.setDate(date.getDate() - dayOfWeek + 1);
        
        const y = monday.getFullYear();
        const m = String(monday.getMonth() + 1).padStart(2, '0');
        const day = String(monday.getDate()).padStart(2, '0');
        const weekKey = `${y}-${m}-${day}`;
        
        map[weekKey] = { label: `Mgg ${fmtDateNum(weekKey).substr(0, 5)}`, kas: d.kas, stok: d.stok, networth: d.networth };
      });
      result = Object.keys(map).sort().map(k => map[k]);
    } else if (granularity === 'bulanan' || granularity === 'bulan') {
      const map = {};
      safeData.forEach(d => {
        const monthKey = d.tanggal.substr(0, 7);
        map[monthKey] = { label: fmtYearMonth(monthKey), kas: d.kas, stok: d.stok, networth: d.networth };
      });
      result = Object.keys(map).sort().map(k => map[k]);
    } else if (granularity === 'tahun') {
      const map = {};
      safeData.forEach(d => {
        const yearKey = d.tanggal.substr(0, 4);
        map[yearKey] = { label: yearKey, kas: d.kas, stok: d.stok, networth: d.networth };
      });
      result = Object.keys(map).sort().map(k => map[k]);
    } else if (granularity === 'dasawarsa') {
      const map = {};
      safeData.forEach(d => {
        const year = parseInt(d.tanggal.substr(0, 4), 10);
        const decade = Math.floor(year / 10) * 10;
        const decKey = String(decade);
        map[decKey] = { label: `Era ${decade}an`, kas: d.kas, stok: d.stok, networth: d.networth };
      });
      result = Object.keys(map).sort().map(k => map[k]);
    } else {
      result = safeData.map(d => ({ label: fmtDateNum(d.tanggal), kas: d.kas, stok: d.stok, networth: d.networth }));
    }

    const d = this._defaults({
      callbacks: { label: c => ` ${c.dataset.label}: ${fmt(c.raw)}` }
    });
    d.plugins.legend.display = true;

    this._c.networth = new Chart(ctx, {
      type: 'line',
      data: {
        labels: result.map(r => r.label),
        datasets: [
          {
            type: 'line',
            label: 'Net Worth',
            data: result.map(r => r.networth),
            borderColor: '#f59e0b',
            backgroundColor: (context) => {
              const ctx = context.chart.ctx;
              const gradient = ctx.createLinearGradient(0, 0, 0, 300);
              gradient.addColorStop(0, 'rgba(245,158,11,0.25)');
              gradient.addColorStop(1, 'rgba(245,158,11,0.0)');
              return gradient;
            },
            borderWidth: 2,
            tension: 0.4,
            pointRadius: 0, pointHoverRadius: 6, pointBackgroundColor: '#ffffff', pointBorderColor: '#f59e0b', pointBorderWidth: 2,
            fill: true,
            stack: 'line',
            order: 0
          },
          {
            type: 'bar',
            label: 'Stok Aset',
            data: result.map(r => r.stok),
            backgroundColor: '#3b82f6',
            borderWidth: 0,
            borderRadius: { topLeft: 3, topRight: 3, bottomLeft: 0, bottomRight: 0 },
            barPercentage: 0.25,
            stack: 'bars',
            hidden: true,
            order: 1
          },
          {
            type: 'bar',
            label: 'Kas (Liquid)',
            data: result.map(r => r.kas),
            backgroundColor: '#10b981',
            borderWidth: 0,
            borderRadius: 0,
            barPercentage: 0.25,
            stack: 'bars',
            hidden: true,
            order: 2
          }
        ]
      },
      options: {
        ...d,
        scales: {
          x: { stacked: true, grid: { display: false }, ticks: { color: '#64748b', font: { family: 'Inter', size: 11 } }, border: { display: false } },
          y: { stacked: true, grid: { color: 'rgba(0,0,0,0.03)', borderDash: [5, 5] }, ticks: { color: '#64748b', font: { family: 'JetBrains Mono', size: 11 }, callback: v => fmtShort(v) }, border: { display: false } }
        }
      }
    });
  },

  renderTrend(months) {
    this.destroy('trend');
    const ctx = el('chart-trend'); if (!ctx) return;
    const d = this._defaults({ callbacks: { label: c => ` ${c.dataset.label}: ${fmt(c.raw)}` } });
    d.plugins.legend.display = true;
    this._c.trend = new Chart(ctx, {
      type: 'line', data: {
        labels: months.map(m => m.bulan),
        datasets: [
          { 
            label: 'Saldo', 
            data: months.map(m => m.saldo), 
            borderColor: '#3b82f6', 
            backgroundColor: (context) => {
              const ctx = context.chart.ctx;
              const gradient = ctx.createLinearGradient(0, 0, 0, 300);
              gradient.addColorStop(0, 'rgba(59,130,246,0.3)');
              gradient.addColorStop(1, 'rgba(59,130,246,0.0)');
              return gradient;
            },
            borderWidth: 2, fill: true, tension: 0.45, pointRadius: 0, pointHoverRadius: 6, pointBackgroundColor: '#ffffff', pointBorderColor: '#3b82f6', pointBorderWidth: 2
          }
        ]
      },
      options: { ...d, scales: this._scales() }
    });
  },

  renderDonut(cats) {
    this.destroy('donut');
    const ctx = el('chart-donut'); if (!ctx) return;
    const colors = { 'Inventory': '#EF4444', 'Biaya Operasional': '#F97316', 'Biaya Bank': '#EAB308', 'Ekuitas & aset': '#EC4899', 'Lainnya': '#64748B' };
    const labels = Object.keys(cats);
    const wrapper = ctx.closest('.chart-h280') || ctx.parentElement;
    let msgEl = document.getElementById('donut-empty-msg');
    const card = ctx.closest('.chart-card');
    if (card) {
      let oldLeg = card.querySelector('.custom-legend');
      if (oldLeg) oldLeg.remove();
    }

    if (!labels.length) {
      if (!msgEl) {
        msgEl = document.createElement('div');
        msgEl.id = 'donut-empty-msg';
        msgEl.style = 'display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-muted);font-size:13px';
        msgEl.textContent = 'Belum ada data pengeluaran';
        wrapper.appendChild(msgEl);
      }
      msgEl.style.display = 'flex';
      ctx.style.display = 'none';
      return;
    }
    if (msgEl) msgEl.style.display = 'none';
    ctx.style.display = 'block';
    
    // Modify wrapper height to make space for custom legend without making the card too tall
    wrapper.style.height = '230px';

    const d = this._defaults({ callbacks: { label: c => ` ${c.label}: ${fmt(c.raw)}` } });
    this._c.donut = new Chart(ctx, {
      type: 'doughnut', data: {
        labels, datasets: [{ data: Object.values(cats), backgroundColor: labels.map(l => colors[l] || '#94a3b8'), borderWidth: 0, hoverOffset: 8 }]
      },
      options: { ...d, cutout: '75%', plugins: { ...d.plugins, legend: { display: false } } }
    });

    // Build custom HTML legend with percentages
    if (card) {
      const leg = document.createElement('div');
      leg.className = 'custom-legend';
      leg.style = 'display:flex; flex-wrap:wrap; justify-content:center; gap:12px; margin-top:20px; padding-top:16px; border-top:1px solid var(--border-subtle);';
      
      let total = 0;
      Object.values(cats).forEach(v => total += v);

      labels.forEach((l, i) => {
        const val = cats[l] || 0;
        let pctStr = '0%';
        if (total > 0) {
           const calcPct = (val / total) * 100;
           if (calcPct > 0 && calcPct < 1) {
             pctStr = '<1%';
           } else if (calcPct >= 1) {
             pctStr = parseFloat(calcPct.toFixed(1)) + '%';
           }
        }
        
        const item = document.createElement('div');
        item.style = 'display:flex; align-items:center; gap:6px; font-size:12.5px; color:var(--text-secondary); cursor:pointer; user-select:none; transition:opacity 0.2s;';
        item.innerHTML = `<span style="width:10px;height:10px;border-radius:50%;background:${colors[l]||'#94a3b8'}"></span>${l} <span style="font-weight:700;color:var(--text-primary)">${pctStr}</span>`;
        item.onclick = () => {
           const chart = this._c.donut;
           if (!chart) return;
           chart.toggleDataVisibility(i);
           chart.update();
           item.style.opacity = chart.getDataVisibility(i) ? '1' : '0.4';
        };
        leg.appendChild(item);
      });
      card.appendChild(leg);
    }
  },

  renderIncomeDonut(cats) {
    this.destroy('donutIncome');
    const ctx = el('chart-donut-income'); if (!ctx) return;
    const colors = { 'Penjualan Utama': '#10B981', 'Pendapatan lainnya': '#3B82F6', 'Ekuitas & aset': '#EC4899', 'Lainnya': '#64748B' };
    const labels = Object.keys(cats);
    const wrapper = ctx.closest('.chart-h280') || ctx.parentElement;
    let msgEl = document.getElementById('donut-income-empty-msg');
    const card = ctx.closest('.chart-card');
    if (card) {
      let oldLeg = card.querySelector('.custom-legend');
      if (oldLeg) oldLeg.remove();
    }

    if (!labels.length) {
      if (!msgEl) {
        msgEl = document.createElement('div');
        msgEl.id = 'donut-income-empty-msg';
        msgEl.style = 'display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-muted);font-size:13px';
        msgEl.textContent = 'Belum ada data pemasukan';
        wrapper.appendChild(msgEl);
      }
      msgEl.style.display = 'flex';
      ctx.style.display = 'none';
      return;
    }
    if (msgEl) msgEl.style.display = 'none';
    ctx.style.display = 'block';
    
    wrapper.style.height = '230px';

    const d = this._defaults({ callbacks: { label: c => ` ${c.label}: ${fmt(c.raw)}` } });
    this._c.donutIncome = new Chart(ctx, {
      type: 'doughnut', data: {
        labels, datasets: [{ data: Object.values(cats), backgroundColor: labels.map(l => colors[l] || '#10b981'), borderWidth: 0, hoverOffset: 8 }]
      },
      options: { ...d, cutout: '75%', plugins: { ...d.plugins, legend: { display: false } } }
    });

    if (card) {
      const leg = document.createElement('div');
      leg.className = 'custom-legend';
      leg.style = 'display:flex; flex-wrap:wrap; justify-content:center; gap:12px; margin-top:20px; padding-top:16px; border-top:1px solid var(--border-subtle);';
      
      let total = 0;
      Object.values(cats).forEach(v => total += v);

      labels.forEach((l, i) => {
        const val = cats[l] || 0;
        let pctStr = '0%';
        if (total > 0) {
           const calcPct = (val / total) * 100;
           if (calcPct > 0 && calcPct < 1) {
             pctStr = '<1%';
           } else if (calcPct >= 1) {
             pctStr = parseFloat(calcPct.toFixed(1)) + '%';
           }
        }
        
        const item = document.createElement('div');
        item.style = 'display:flex; align-items:center; gap:6px; font-size:12.5px; color:var(--text-secondary); cursor:pointer; user-select:none; transition:opacity 0.2s;';
        item.innerHTML = `<span style="width:10px;height:10px;border-radius:50%;background:${colors[l]||'#10b981'}"></span>${l} <span style="font-weight:700;color:var(--text-primary)">${pctStr}</span>`;
        item.onclick = () => {
           const chart = this._c.donutIncome;
           if (!chart) return;
           chart.toggleDataVisibility(i);
           chart.update();
           item.style.opacity = chart.getDataVisibility(i) ? '1' : '0.4';
        };
        leg.appendChild(item);
      });
      card.appendChild(leg);
    }
  },

  renderTopProducts(products, mode = 'profit') {
    this.destroy('top');
    // Restore canvas if it was replaced by empty state
    let ctx = el('chart-topproduct');
    if (!ctx) {
      const wrapper = document.querySelector('.chart-h260');
      if (wrapper) {
        wrapper.innerHTML = '<canvas id="chart-topproduct"></canvas>';
        ctx = el('chart-topproduct');
      }
      if (!ctx) return;
    }
    const COLORS = ['#3b82f6', '#6366f1', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4', '#ef4444'];
    const titleEl = el('title-topproduct');
    if (titleEl) titleEl.textContent = mode === 'count' ? '🏆 Top Produk (Terjual)' : '🏆 Top Produk (Profit)';

    // Handle empty data — show message instead of blank chart
    if (!products || products.length === 0) {
      const parent = ctx.parentElement;
      if (parent) {
        parent.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;min-height:200px;color:var(--text-muted);gap:8px;">
          <div style="font-size:36px;">📭</div>
          <div style="font-size:14px;font-weight:500;">Belum ada data ${mode === 'count' ? 'unit terjual' : 'profit'}</div>
          <div style="font-size:12px;color:var(--text-tertiary);">Coba ubah periode filter untuk melihat data</div>
        </div>`;
      }
      return;
    }

    const isMobile = window.innerWidth < 600;
    const shortFmt = (v) => {
      if (Math.abs(v) >= 1000000) return 'Rp ' + (v / 1000000).toFixed(1).replace('.0', '') + 'jt';
      if (Math.abs(v) >= 1000) return 'Rp ' + (v / 1000).toFixed(0) + 'rb';
      return fmt(v);
    };

    const d = this._defaults({ 
      titleFont: { family: 'Inter', size: isMobile ? 11 : 12, weight: '700' },
      bodyFont: { family: 'JetBrains Mono', size: isMobile ? 10 : 12 },
      padding: isMobile ? 8 : 12,
      callbacks: { 
        label: c => mode === 'count' 
          ? ` Terjual: ${products[c.dataIndex].count}x (Profit: ${shortFmt(products[c.dataIndex].profit)})` 
          : ` Profit: ${fmt(c.raw)} (${products[c.dataIndex].count}x)`,
        afterLabel: c => {
          const p = products[c.dataIndex];
          if (!p.detailList || (p.detailList.length <= 1 && p.detailList[0].nm === 'Lainnya')) return '';
          return p.detailList.map(dt => {
            const shortName = dt.nm.replace(/titanium/gi, 'T.');
            return `  • ${shortName}: ${mode === 'count' ? dt.count + 'x' : shortFmt(dt.profit)}`;
          });
        }
      } 
    });
    d.plugins.legend.display = false;
    this._c.top = new Chart(ctx, {
      type: 'bar', data: {
        labels: products.map(p => p.name.length > 35 ? p.name.substr(0, 33) + '…' : p.name),
        datasets: [{ 
          data: products.map(p => mode === 'count' ? p.count : p.profit), 
          backgroundColor: products.map((_, i) => COLORS[i % COLORS.length]), 
          borderRadius: 8,
          barPercentage: 0.6
        }]
      },
      options: { 
        ...d, 
        indexAxis: 'y', 
        scales: { 
          x: { 
            grid: { color: 'rgba(0,0,0,0.03)', borderDash: [5, 5] }, 
            ticks: { 
              color: '#64748b', 
              font: { family: 'JetBrains Mono', size: 11 }, 
              callback: v => mode === 'count' ? v + 'x' : fmtShort(v) 
            },
            border: { display: false }
          }, 
          y: { 
            grid: { display: false }, 
            ticks: { color: '#334155', font: { family: 'Inter', size: 11 } },
            border: { display: false }
          } 
        } 
      }
    });
  },

  renderMonthlyBars(months) {
    this.destroy('mbars');
    const ctx = el('chart-monthly-bars'); if (!ctx) return;
    const d = this._defaults({ callbacks: { label: c => ` ${c.dataset.label}: ${fmt(c.raw)}` } });
    this._c.mbars = new Chart(ctx, {
      type: 'bar', data: {
        labels: months.map(m => m.bulan),
        datasets: [
          { label: 'Pemasukan', data: months.map(m => m.masuk), backgroundColor: 'rgba(16,185,129,0.9)', borderColor: '#10b981', borderWidth: 0, borderRadius: { topLeft: 6, topRight: 6, bottomLeft: 0, bottomRight: 0 }, barPercentage: 0.6 },
          { label: 'Pengeluaran', data: months.map(m => m.keluar), backgroundColor: 'rgba(239,68,68,0.9)', borderColor: '#ef4444', borderWidth: 0, borderRadius: { topLeft: 6, topRight: 6, bottomLeft: 0, bottomRight: 0 }, barPercentage: 0.6 }
        ]
      },
      options: { 
        ...d, 
        scales: {
          x: { grid: { display: false }, ticks: { color: '#64748b', font: { family: 'Inter', size: 11 } }, border: { display: false } },
          y: { grid: { color: 'rgba(0,0,0,0.03)', borderDash: [5, 5] }, ticks: { color: '#64748b', font: { family: 'JetBrains Mono', size: 11 }, callback: v => fmtShort(v) }, border: { display: false } }
        }
      }
    });
  },

  renderProfitTrend(months) {
    this.destroy('profit');
    const ctx = el('chart-profit-trend'); if (!ctx) return;
    const d = this._defaults({ callbacks: { label: c => ` Profit: ${fmt(c.raw)}` } });
    d.plugins.legend.display = false;
    this._c.profit = new Chart(ctx, {
      type: 'line', data: {
        labels: months.map(m => m.bulan),
        datasets: [{ 
          label: 'Profit', 
          data: months.map(m => m.profit), 
          borderColor: '#f59e0b', 
          backgroundColor: (context) => {
              const ctx = context.chart.ctx;
              const gradient = ctx.createLinearGradient(0, 0, 0, 300);
              gradient.addColorStop(0, 'rgba(245,158,11,0.3)');
              gradient.addColorStop(1, 'rgba(245,158,11,0.0)');
              return gradient;
          }, 
          borderWidth: 3, fill: true, tension: 0.45, pointRadius: 0, pointHoverRadius: 6, pointBackgroundColor: '#ffffff', pointBorderColor: '#f59e0b', pointBorderWidth: 2
        }]
      },
      options: { ...d, scales: this._scales() }
    });
  },
};

// ============ PAGINATION ============
function makePagination(containerId, current, total, onPage) {
  const c = el(containerId); if (!c) return;
  if (total <= 1) { c.innerHTML = ''; return; }
  let h = `<button class="pg-btn" ${current <= 1 ? 'disabled' : ''} onclick="(${onPage})(${current - 1})">‹</button>`;
  for (let i = 1; i <= total; i++) {
    if (i === 1 || i === total || (i >= current - 1 && i <= current + 1)) {
      h += `<button class="pg-btn ${i === current ? 'active' : ''}" onclick="(${onPage})(${i})">${i}</button>`;
    } else if (i === current - 2 || i === current + 2) {
      h += `<button class="pg-btn" disabled style="border:none;pointer-events:none">…</button>`;
    }
  }
  h += `<button class="pg-btn" ${current >= total ? 'disabled' : ''} onclick="(${onPage})(${current + 1})">›</button>`;
  c.innerHTML = h;
}

// ============ TOAST ============
function toast(msg, type = 'success') {
  const c = el('toast-wrap');
  if (!c) return;
  const d = document.createElement('div');
  d.className = `toast ${type}`;
  d.innerHTML = `<span>${type === 'success' ? '✅' : type === 'info' ? 'ℹ️' : '❌'}</span><span>${msg}</span>`;
  c.appendChild(d);
  setTimeout(() => { d.style.opacity = '0'; d.style.transition = 'opacity 0.3s'; setTimeout(() => d.remove(), 350); }, 3000);
}

// ============ MODAL HELPERS ============
function openModal(id) {
  const m = el(id);
  if (m) { m.style.display = 'flex'; requestAnimationFrame(() => m.classList.add('open')); }
}
function closeModal(id) {
  const m = el(id);
  if (m) { m.classList.remove('open'); setTimeout(() => { m.style.display = 'none'; }, 250); }
}

// ============ APP CONTROLLER ============
const App = {
  tx: { filter: { mode: 'semua' }, kat: '', search: '', sortBy: 'tanggal', sortDir: 'desc', page: 1 },
  sales: { filter: { mode: 'semua' }, search: '', sortBy: 'notaNum', sortDir: 'desc', page: 1 },
  overview: { filter: { mode: 'bulan', year: String(new Date().getFullYear()), month: new Date().getMonth() + 1 } },
  laporan: { filter: { mode: 'semua' } },
  inputTab: 'kas',
  _rendered: false,
  _activePage: 'overview',

  render() {
    if (!this._rendered) return;
    const renderers = {
      overview: () => this._renderOverview(),
      transaksi: () => this._renderTx(),
      penjualan: () => this._renderSales(),
      input: () => this._renderInput(),
      laporan: () => this._renderLaporan()
    };
    (renderers[this._activePage] || (() => {}))();
    setText('badge-tx', Store._transactions.length);
  },

  async init() {
    Auth.init();
    
    if (!Auth.user) {
      const loginContainer = document.getElementById('login-container');
      const dashContainer = document.getElementById('dashboard-container');
      if (loginContainer) loginContainer.style.display = 'flex';
      if (dashContainer) dashContainer.style.display = 'none';
      return; 
    }
    
    // ---- Step 1: Sembunyikan login, tampilkan loader full-screen ----
    const loginContainer = document.getElementById('login-container');
    const dashContainer = document.getElementById('dashboard-container');
    const loader = document.getElementById('global-loader');
    if (loginContainer) loginContainer.style.display = 'none';
    // Dashboard BELUM ditampilkan — loader dulu
    if (dashContainer) dashContainer.style.display = 'none';
    if (loader) {
      loader.style.display = 'flex';
      loader.style.opacity = '1';
      loader.classList.remove('fade-out');
      const lText = document.getElementById('loader-text');
      const lSub = document.getElementById('loader-subtext');
      if (lText) lText.textContent = 'Memuat Data...';
      if (lSub) lSub.textContent = 'Sinkronisasi dari Google Sheets...';
    }
    
    // ---- Step 2: Setup identitas user (navbar, role) ----
    const u = Auth.user;
    const navAvatar = document.getElementById('nav-avatar');
    const navUsername = document.getElementById('nav-username');
    const navRoleBadge = document.getElementById('nav-role-badge');
    if (navAvatar)    navAvatar.textContent    = u.username.charAt(0).toUpperCase();
    if (navUsername)  navUsername.textContent  = u.username.charAt(0).toUpperCase() + u.username.slice(1);
    if (navRoleBadge) {
      navRoleBadge.textContent = u.role;
      navRoleBadge.className   = 'nav-role-badge ' + u.role.toLowerCase();
    }
    
    document.querySelectorAll('.nav-link[data-page]').forEach(btn => {
      if (!Auth.hasAccess(btn.dataset.page)) btn.remove();
    });

    if (u.role === 'USER') {
      document.body.classList.add('user-mode');
      const chip = document.getElementById('nav-user-chip');
      if (chip) chip.style.display = 'none';
      this._activePage = 'input';
    } else {
      this._activePage = 'overview';
    }

    // ---- Step 3: Muat data LOKAL dulu (INSTANT — tidak tunggu GAS) ----
    Store._loadLocalData();
    this._setupNav();
    this._setupCalendarFilters();
    this._setupTxFilters();
    this._setupForm();
    this._setupModals();

    this._rendered = true;

    // ---- Step 4: Langsung tampilkan dashboard dengan data lokal ----
    if (loader) {
      loader.classList.add('fade-out');
      setTimeout(() => { loader.style.display = 'none'; }, 350);
    }
    if (dashContainer) dashContainer.style.display = 'block';

    // ---- Step 5: Route ke halaman yang benar ----
    this.go(this._activePage);
    setText('badge-tx', Store._transactions.length);

    // ---- Step 6: Sync GAS di background (tidak blokir UI) ----
    const cacheStale = Store._isCacheStale();
    const hasData = Store._transactions.length > 0 || Store._sales.length > 0;
    if (!hasData || cacheStale) {
      Store._syncFromGAS(); // Fire-and-forget background sync
    }

    // Auto-refresh setiap 5 menit (background)
    if (this._autoRefreshTimer) clearInterval(this._autoRefreshTimer);
    this._autoRefreshTimer = setInterval(() => {
      if (document.hidden) return;
      Store._syncFromGAS();
    }, 5 * 60 * 1000);
  },

  _setupNav() {
    document.querySelectorAll('.nav-link[data-page]').forEach(btn => {
      btn.onclick = (e) => {
        e.preventDefault();
        this.go(btn.dataset.page);
        const menu = el('navMenu');
        if (menu) menu.classList.remove('show');
      };
    });
    const navToggle = el('navToggle');
    if (navToggle) navToggle.onclick = () => el('navMenu').classList.toggle('show');
    
    document.addEventListener('click', (e) => {
      const menu = el('navMenu');
      const toggle = el('navToggle');
      if (menu && toggle && !menu.contains(e.target) && !toggle.contains(e.target)) {
        menu.classList.remove('show');
      }
    }, true);
  },

  go(page) {
    if (!Auth.hasAccess(page)) {
      toast('Akses Ditolak: Anda tidak memiliki izin untuk halaman ini.', 'error');
      return;
    }
    this._activePage = page;
    document.querySelectorAll('.nav-link[data-page]').forEach(b => b.classList.toggle('active', b.dataset.page === page));
    document.querySelectorAll('.page-section').forEach(s => s.classList.toggle('active', s.id === `page-${page}`));
    window.scrollTo({ top: 0, behavior: 'smooth' });
    const r = {
      overview: () => this._renderOverview(),
      transaksi: () => this._renderTx(),
      penjualan: () => this._renderSales(),
      input: () => this._renderInput(),
      laporan: () => this._renderLaporan()
    };
    (r[page] || (() => { }))();
  },

  _setupCalendarFilters() {
    const ovWrap = el('ov-filter-wrap');
    if (ovWrap) {
      ovWrap.innerHTML = CalendarFilter.buildHTML('ov');
      CalendarFilter.register('ov', (f) => { this.overview.filter = f; this._renderOverview(); }, () => Store.getAvailableTxYears());
      CalendarFilter.setFilter('ov', this.overview.filter);
    }

    const salesWrap = el('sales-filter-wrap');
    if (salesWrap) {
      salesWrap.innerHTML = CalendarFilter.buildHTML('sales');
      CalendarFilter.register('sales', (f) => { this.sales.filter = f; this.sales.page = 1; this._renderSales(); }, () => Store.getAvailableSalesYears());
    }

    const lapWrap = el('lap-filter-wrap');
    if (lapWrap) {
      lapWrap.innerHTML = CalendarFilter.buildHTML('lap');
      CalendarFilter.register('lap', (f) => { this.laporan.filter = f; this._renderLaporan(); }, () => Store.getAvailableTxYears());
    }
  },

  // ---- Overview ----
  _renderOverview() {
    const filter = this.overview.filter;
    const saldo = Store.getLatestSaldo();
    setText('kpi-saldo', fmt(saldo));

    const stats = Store.getStatsByFilter(filter);
    const label = filterLabel(filter);
    setText('ov-period', label);

    const kpiMasukLabel = el('kpi-masuk-label');
    const kpiKeluarLabel = el('kpi-keluar-label');
    if (kpiMasukLabel) kpiMasukLabel.textContent = `Pemasukan — ${label}`;
    if (kpiKeluarLabel) kpiKeluarLabel.textContent = `Pengeluaran — ${label}`;

    setText('kpi-masuk', fmt(stats.masuk));
    setText('kpi-keluar', fmt(stats.keluar));

    const prevFilter = getPrevFilter(filter);
    if (prevFilter && filter.mode !== 'semua') {
      const prevStats = Store.getStatsByFilter(prevFilter);
      this._setChange('kpi-masuk-sub', stats.masuk, prevStats.masuk);
      this._setChange('kpi-keluar-sub', stats.keluar, prevStats.keluar);
    } else {
      if (filter.mode === 'semua') {
        setText('kpi-masuk-sub', `${stats.countMasuk} transaksi masuk`);
        setText('kpi-keluar-sub', `${stats.countKeluar} transaksi keluar`);
        if (el('kpi-masuk-sub')) el('kpi-masuk-sub').style.color = 'var(--green)';
        if (el('kpi-keluar-sub')) el('kpi-keluar-sub').style.color = 'var(--red)';
      } else {
        setText('kpi-masuk-sub', `${stats.count} transaksi`);
        setText('kpi-keluar-sub', '–');
        if (el('kpi-masuk-sub')) el('kpi-masuk-sub').style.color = 'var(--text-muted)';
        if (el('kpi-keluar-sub')) el('kpi-keluar-sub').style.color = 'var(--text-muted)';
      }
    }

    const trendData = Store.getTrendStats(filter);
    Charts.renderTrend(trendData);
    Charts.renderDonut(Store.getCategorySpend(filter));
    if (Charts.renderIncomeDonut) Charts.renderIncomeDonut(Store.getIncomeSpend(filter));
    
    const topProdModeEl = el('topproduct-mode');
    const topProdMode = topProdModeEl ? topProdModeEl.value : 'profit';
    Charts.renderTopProducts(Store.getTopProducts(7, filter, topProdMode), topProdMode);

    const recent = Store.getTx({ filter, sortDir: 'desc' }).slice(0, 8);
    const wrap = el('recent-tx-wrap');
    if (wrap) {
      if (!recent.length) {
        wrap.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📭</div><div class="empty-state-text">Belum ada transaksi</div></div>`;
        return;
      }
      wrap.innerHTML = `<table class="data-table"><thead><tr><th>Tanggal</th><th>Deskripsi</th><th>Kategori</th><th>Masuk</th><th>Keluar</th><th>Saldo</th></tr></thead><tbody>
        ${recent.map(t => `<tr>
          <td class="cell-date">${fmtDate(t.tanggal)}</td>
          <td class="cell-desc">${t.deskripsi || '–'}</td>
          <td>${catBadge(t.kategori)}</td>
          <td class="cell-in">${t.uangMasuk ? fmt(t.uangMasuk) : '–'}</td>
          <td class="cell-out">${t.uangKeluar ? fmt(t.uangKeluar) : '–'}</td>
          <td class="cell-saldo">${fmt(t.saldo)}</td>
        </tr>`).join('')}
      </tbody></table>`;
    }
  },

  _setChange(id, cur, prev) {
    if (!prev && prev !== 0) return;
    if (prev === 0) { setText(id, cur > 0 ? '↑ baru' : '–'); return; }
    const pct = ((cur - prev) / Math.abs(prev) * 100).toFixed(1);
    const up = cur >= prev;
    setText(id, `${up ? '↑' : '↓'} ${Math.abs(pct)}% vs periode lalu`);
    const e = el(id); if (e) e.style.color = up ? 'var(--green)' : 'var(--red)';
  },

  // ---- Transaksi (Buku Besar) ----
  _setupTxFilters() {
    const katSel = document.getElementById('filter-kategori');
    if (katSel) {
      const cats = [...new Set(Store._transactions.map(t => t.kategori).filter(Boolean))].sort();
      cats.forEach(c => {
        const o = document.createElement('option');
        o.value = c; o.textContent = c;
        katSel.appendChild(o);
      });
      katSel.onchange = e => { this.tx.kat = e.target.value === 'semua' ? '' : e.target.value; this.tx.page = 1; this._renderTx(); };
    }

    const srch = document.getElementById('filter-search');
    if (srch) {
      srch.oninput = e => { this.tx.search = e.target.value; this.tx.page = 1; this._renderTx(); };
      srch.addEventListener('keyup', e => { if (e.key === 'Enter') e.target.blur(); });
      srch.addEventListener('search', e => e.target.blur());
    }

    const txFilterWrap = el('tx-filter-wrap');
    if (txFilterWrap) {
      txFilterWrap.innerHTML = CalendarFilter.buildHTML('tx');
      CalendarFilter.register('tx', (f) => { this.tx.filter = f; this.tx.page = 1; this._renderTx(); }, () => Store.getAvailableTxYears());
    }

    const salesSrch = document.getElementById('sales-search');
    if (salesSrch) {
      salesSrch.oninput = e => { this.sales.search = e.target.value; this.sales.page = 1; this._renderSales(); };
      salesSrch.addEventListener('keyup', e => { if (e.key === 'Enter') e.target.blur(); });
      salesSrch.addEventListener('search', e => e.target.blur());
    }
  },

  sortTx(field) {
    this.tx.sortDir = this.tx.sortBy === field ? (this.tx.sortDir === 'asc' ? 'desc' : 'asc') : 'desc';
    this.tx.sortBy = field;
    this.tx.page = 1;
    document.querySelectorAll('[id^="tx-arr-"]').forEach(e => e.textContent = '↕');
    const arrEl = el(`tx-arr-${field}`); if (arrEl) arrEl.textContent = this.tx.sortDir === 'asc' ? '↑' : '↓';
    this._renderTx();
  },

  _renderTx() {
    const PER_PAGE = 15;
    const data = Store.getTx({ filter: this.tx.filter, kat: this.tx.kat, search: this.tx.search, sortBy: this.tx.sortBy, sortDir: this.tx.sortDir });

    let tMasuk = 0, tKeluar = 0;
    data.forEach(t => { tMasuk += t.uangMasuk || 0; tKeluar += t.uangKeluar || 0; });
    setText('qs-count', data.length);
    setText('qs-masuk', fmt(tMasuk));
    setText('qs-keluar', fmt(tKeluar));

    const total = Math.ceil(data.length / PER_PAGE) || 1;
    const p = Math.min(this.tx.page, total);
    this.tx.page = p;
    const slice = data.slice((p - 1) * PER_PAGE, p * PER_PAGE);

    const tbody = el('tx-tbody');
    if (!tbody) return;
    if (!slice.length) {
      tbody.innerHTML = `<tr><td colspan="7" class="empty-state" style="padding:40px">Tidak ada data untuk filter ini.</td></tr>`;
    } else {
      tbody.innerHTML = slice.map(t => `<tr>
        <td class="cell-date">${fmtDate(t.tanggal)}</td>
        <td class="cell-desc">${t.deskripsi || '–'}${t.quantity ? ` <span style="font-size:11px;color:var(--text-muted);background:var(--bg-input);padding:2px 6px;border-radius:4px;margin-left:6px;white-space:nowrap">Qty: ${t.quantity}</span>` : ''}</td>
        <td>${catBadge(t.kategori)}</td>
        <td class="cell-in">${t.uangMasuk ? fmt(t.uangMasuk) : '–'}</td>
        <td class="cell-out">${t.uangKeluar ? fmt(t.uangKeluar) : '–'}</td>
        <td class="cell-saldo">${fmt(t.saldo)}</td>
        <td class="cell-action">
          <button class="btn-icon-edit" title="Edit" onclick="App.editTx('${t.id}')">✏️</button>
          <button class="btn-icon-del" title="Hapus" onclick="App.confirmDeleteTx('${t.id}')">🗑️</button>
        </td>
      </tr>`).join('');
    }

    setText('tx-pinfo', `Hal ${p} / ${total} • ${data.length} transaksi`);
    makePagination('tx-pages', p, total, `(pg) => { App.tx.page = pg; App._renderTx(); }`);
  },

  editTx(id) {
    const t = Store.getTxById(id);
    if (!t) return;
    el('etx-id').value = id;
    el('etx-tanggal').value = t.tanggal || '';
    el('etx-kategori').value = mapCategory(t.kategori);
    el('etx-desc').value = t.deskripsi || '';
    if (el('etx-qty')) el('etx-qty').value = t.quantity || t.jumlah || '';
    el('etx-masuk').value = t.uangMasuk || '';
    el('etx-keluar').value = t.uangKeluar || 0;
    el('etx-saldo').value = t.saldo || 0;
    openModal('modal-edit-tx');
  },

  async saveTxEdit() {
    const id = el('etx-id').value;
    const updates = {
      tanggal: el('etx-tanggal').value,
      kategori: el('etx-kategori').value,
      deskripsi: el('etx-desc').value.trim(),
      quantity: el('etx-qty') ? el('etx-qty').value.trim() : '',
      uangMasuk: parseFloat(el('etx-masuk').value) || 0,
      uangKeluar: parseFloat(el('etx-keluar').value) || 0,
      saldo: parseFloat(el('etx-saldo').value) || 0,
    };

    // Disable tombol saat menyimpan
    const submitBtn = el('modal-edit-tx').querySelector('.btn-primary');
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Menyimpan...'; }

    const success = await Store.updateTx(id, updates);
    if (success) {
      toast('Transaksi berhasil diupdate!', 'success');
      closeModal('modal-edit-tx');
      this._renderTx();
      setText('badge-tx', Store._transactions.length);
    }

    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/></svg> Simpan Perubahan`;
    }
  },

  confirmDeleteTx(id) {
    const t = Store.getTxById(id);
    if (!t) return;
    if (confirm(`Hapus transaksi:\n"${t.deskripsi}" (${t.tanggal})?\n\nAksi ini tidak bisa dibatalkan.`)) {
      Store.deleteTx(id);
      toast('Transaksi dihapus.', 'success');
      this._renderTx();
      setText('badge-tx', Store._transactions.length);
    }
  },

  // ---- Sales ----
  _renderSales() {
    const data = Store.getSales({ filter: this.sales.filter, search: this.sales.search, sortBy: this.sales.sortBy, sortDir: this.sales.sortDir });

    let tOmset = 0, tProfit = 0;
    let turnoverSum = 0, turnoverCount = 0;
    const sold = data.filter(s => s.tanggalKeluar && s.hargaJual > 0);
    sold.forEach(s => {
      tOmset += s.hargaJual || 0;
      tProfit += s.profit || 0;
      if (s.turnoverDays != null && s.turnoverDays >= 0) {
        turnoverSum += s.turnoverDays;
        turnoverCount++;
      }
    });
    const avgTurnover = turnoverCount ? Math.round(turnoverSum / turnoverCount) : null;
    const marginProfit = tOmset > 0 ? ((tProfit / tOmset) * 100).toFixed(1) : 0;

    setText('sales-kpi-unit', `${sold.length} / ${data.length}`);
    setText('sales-kpi-revenue', fmt(tOmset));
    setText('sales-kpi-total-profit', fmt(tProfit));
    setText('sales-kpi-margin', `${marginProfit}%`);
    setText('sales-kpi-avg-profit', fmt(sold.length ? Math.round(tProfit / sold.length) : 0));
    setText('sales-kpi-turnover', avgTurnover != null ? `${avgTurnover} hari` : '– hari');

    const PER_PAGE = 20;
    const total = Math.ceil(data.length / PER_PAGE) || 1;
    const p = Math.min(this.sales.page, total);
    this.sales.page = p;
    const slice = data.slice((p - 1) * PER_PAGE, p * PER_PAGE);

    const tbody = el('sales-table-body');
    if (!tbody) return;

    if (!slice.length) {
      tbody.innerHTML = `<tr><td colspan="10" class="empty-state" style="padding:40px">Belum ada data penjualan untuk periode ini.</td></tr>`;
    } else {
      tbody.innerHTML = slice.map(s => {
        const days = s.turnoverDays;
        let turnoverBadge;
        if (days == null || days < 0) {
          turnoverBadge = '<span style="color:var(--text-muted)">–</span>';
        } else if (days <= 14) {
          turnoverBadge = `<span class="turnover-badge fast">${days}h ⚡</span>`;
        } else if (days <= 30) {
          turnoverBadge = `<span class="turnover-badge medium">${days}h</span>`;
        } else {
          turnoverBadge = `<span class="turnover-badge slow">${days}h</span>`;
        }
        const isLaku = !!s.tanggalKeluar;
        const displayProfit = isLaku ? (s.profit || 0) : 0;
        const profitClass = displayProfit >= 0 ? 'profit-positive' : 'profit-negative';

        let profitPct = '';
        if (s.hargaBeli > 0 && isLaku) {
          const pct = ((displayProfit / s.hargaBeli) * 100).toFixed(1);
          const color = displayProfit >= 0 ? '#059669' : '#dc2626';
          const bg = displayProfit >= 0 ? '#d1fae5' : '#fee2e2';
          profitPct = `<div style="font-size:11px;color:${color};background:${bg};padding:2px 4px;border-radius:4px;display:inline-block;margin-top:2px;font-weight:600">${pct}%</div>`;
        }

        const statusBadge = isLaku
          ? '<span class="status-badge sold">Terjual</span>'
          : '<span class="status-badge stok">Stok</span>';
        return `<tr>
          <td style="font-weight:700;color:var(--accent-blue)">${s.nota || '–'}</td>
          <td class="cell-date">${fmtDate(s.tanggalMasuk)}</td>
          <td class="cell-date">${isLaku ? fmtDate(s.tanggalKeluar) : statusBadge}</td>
          <td class="cell-desc" style="max-width:220px">${s.tipeModel || s.tipe || '–'}</td>
          <td class="cell-money expense">${fmt(s.hargaBeli)}</td>
          <td class="cell-money income">${fmt(s.hargaJual)}</td>
          <td class="cell-money ${profitClass}" style="line-height:1.2">${fmt(displayProfit)}<br>${profitPct}</td>
          <td>${turnoverBadge}</td>
          <td style="color:var(--text-muted);font-size:12px;max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${s.keterangan || '–'}</td>
          <td class="cell-action">
            <button class="btn-icon-edit" title="Edit" onclick="App.editSale('${s.id}')">✏️</button>
            <button class="btn-icon-del" title="Hapus" onclick="App.confirmDeleteSale('${s.id}')">🗑️</button>
          </td>
        </tr>`;
      }).join('');
    }

    const filterLbl = filterLabel(this.sales.filter);
    setText('sales-page-info', `${sold.length} terjual / ${data.length} total (${filterLbl})`);
    makePagination('sales-pages', p, total, `(pg) => { App.sales.page = pg; App._renderSales(); }`);
  },

  editSale(id) {
    const s = Store.getSaleById(id);
    if (!s) return;
    el('es-id').value = id;
    el('es-nota').value = s.nota || '';
    el('es-tanggal-masuk').value = s.tanggalMasuk || '';
    el('es-tanggal-keluar').value = s.tanggalKeluar || '';
    el('es-tipe').value = s.tipeModel || s.tipe || '';
    el('es-harga-beli').value = s.hargaBeli || 0;
    el('es-harga-jual').value = s.hargaJual || 0;
    el('es-keterangan').value = s.keterangan || '';
    this._updateSaleEditPreview();
    openModal('modal-edit-sale');
  },

  _updateSaleEditPreview() {
    const beli = parseFloat(el('es-harga-beli').value) || 0;
    const jual = parseFloat(el('es-harga-jual').value) || 0;
    const profit = jual - beli;
    const profitEl = el('es-profit-preview');
    if (profitEl) {
      let pct = '';
      if (beli > 0) pct = ` (${((profit / beli) * 100).toFixed(1)}%)`;
      profitEl.textContent = fmt(profit) + pct;
      profitEl.style.color = profit >= 0 ? 'var(--green)' : 'var(--red)';
    }
  },

  saveSaleEdit() {
    const id = el('es-id').value;
    const updates = {
      nota: el('es-nota').value.trim(),
      tanggalMasuk: el('es-tanggal-masuk').value || null,
      tanggalKeluar: el('es-tanggal-keluar').value || null,
      tipeModel: el('es-tipe').value.trim(),
      tipe: el('es-tipe').value.trim(),
      hargaBeli: parseFloat(el('es-harga-beli').value) || 0,
      hargaJual: parseFloat(el('es-harga-jual').value) || 0,
      keterangan: el('es-keterangan').value.trim(),
    };
    if (Store.updateSale(id, updates)) {
      toast('Data penjualan berhasil diupdate!', 'success');
      closeModal('modal-edit-sale');
      this._renderSales();
    }
  },

  async confirmDeleteSale(id) {
    const s = Store.getSaleById(id);
    if (!s) return;
    if (confirm(`Hapus unit HP:\n#${s.nota} – ${s.tipeModel || s.tipe}?\n\nData akan dihapus dari Google Sheets.\nAksi ini tidak bisa dibatalkan.`)) {
      await Store.deleteSale(id);
      toast(`Unit #${s.nota} berhasil dihapus!`, 'success');
      this._renderSales();
      this._refreshSellUnitOptions();
    }
  },

  // ---- Input Form ----
  _setupForm() {
    const today = new Date().toISOString().split('T')[0];
    if (el('f-tanggal')) el('f-tanggal').value = today;
    if (el('f-buy-tanggal')) el('f-buy-tanggal').value = today;
    if (el('f-sell-tanggal')) el('f-sell-tanggal').value = today;
    this._updateSaldoDisplay();

    if (el('f-kategori')) el('f-kategori').onchange = () => this._updateMoneyFields();
    if (el('f-masuk') && el('f-keluar')) {
      el('f-masuk').oninput = el('f-keluar').oninput = () => this._updatePreview();
    }
    if (el('f-desc')) {
      el('f-desc').oninput = () => { this._autocomplete(); this._updatePreview(); };
      document.addEventListener('click', e => {
        if (el('f-desc-ac') && !e.target.closest('#f-desc')) el('f-desc-ac').style.display = 'none';
      });
    }

    if (el('input-form')) el('input-form').onsubmit = (e) => { e.preventDefault(); this._submitTx(); };
    if (el('buy-form')) el('buy-form').onsubmit = (e) => { e.preventDefault(); this._submitBuy(); };
    if (el('sell-form')) el('sell-form').onsubmit = (e) => { e.preventDefault(); this._submitSell(); };

    if (el('f-buy-harga-beli')) el('f-buy-harga-beli').oninput = () => this._updateBuyPreview();
    ['f-sell-unit', 'f-sell-harga-jual'].forEach(fid => {
      if (el(fid)) el(fid).oninput = () => this._updateSellPreview();
    });
  },

  _renderInput() {
    this._updateSaldoDisplay();
    this._refreshSellUnitOptions();
    if (el('f-buy-nota')) el('f-buy-nota').value = Store.getNextNota();
  },

  switchInputTab(tab) {
    this.inputTab = tab;
    document.querySelectorAll('.input-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    document.querySelectorAll('.input-tab-panel').forEach(p => p.classList.toggle('active', p.dataset.tab === tab));
    if (tab === 'jual') this._refreshSellUnitOptions();
  },

  _refreshSellUnitOptions() {
    const sel = el('f-sell-unit');
    if (!sel) return;
    const unsold = Store.getUnsoldUnits();
    sel.innerHTML = '<option value="">Pilih unit yang dijual...</option>' +
      unsold.map(s => `<option value="${s.id}" data-beli="${s.hargaBeli || 0}">${s.nota ? `#${s.nota} — ` : ''}${s.tipeModel || s.tipe || '?'} (beli: ${fmt(s.hargaBeli || 0)})</option>`).join('');
    this._updateSellPreview();
  },

  _updateSaldoDisplay() { setText('f-saldo-val', fmt(Store.getLatestSaldo())); },

  _updateMoneyFields() {
    const kat = el('f-kategori') ? el('f-kategori').value : '';
    // Penjualan Utama & Pendapatan lainnya → hanya uang masuk
    const income = ['Penjualan Utama', 'Pendapatan lainnya'];
    // Inventory, Biaya Operasional & Biaya Bank → hanya uang keluar
    const expense = ['Inventory', 'Biaya Operasional', 'Biaya Bank'];
    // Ekuitas & aset, Lainnya → both (default behavior, not in either list)
    if (el('fg-masuk')) el('fg-masuk').style.display = expense.includes(kat) ? 'none' : 'flex';
    if (el('fg-keluar')) el('fg-keluar').style.display = income.includes(kat) ? 'none' : 'flex';
    if (income.includes(kat) && el('f-keluar')) el('f-keluar').value = '';
    if (expense.includes(kat) && el('f-masuk')) el('f-masuk').value = '';
    this._updatePreview();
  },

  _updatePreview() {
    const kat = el('f-kategori') ? el('f-kategori').value : '';
    const masuk = parseFloat(el('f-masuk') ? el('f-masuk').value : 0) || 0;
    const keluar = parseFloat(el('f-keluar') ? el('f-keluar').value : 0) || 0;
    const box = el('preview-box');
    if (!box) return;
    if (!kat && !masuk && !keluar) { box.classList.remove('show'); return; }
    box.classList.add('show');
    setText('pv-kat', kat || '–');
    setText('pv-masuk', masuk ? fmt(masuk) : '–');
    setText('pv-keluar', keluar ? fmt(keluar) : '–');
    setText('pv-saldo', fmt(Store.getLatestSaldo() + masuk - keluar));
  },

  _updateBuyPreview() {
    const beli = parseFloat(el('f-buy-harga-beli') ? el('f-buy-harga-beli').value : 0) || 0;
    const prev = el('buy-preview');
    if (!prev) return;
    if (beli > 0) {
      prev.classList.add('show');
      setText('buy-pv-harga', fmt(beli));
    } else { prev.classList.remove('show'); }
  },

  _updateSellPreview() {
    const sel = el('f-sell-unit');
    const jualEl = el('f-sell-harga-jual');
    const prev = el('sell-preview');
    if (!sel || !jualEl || !prev) return;
    const selOpt = sel.options[sel.selectedIndex];
    const hargaBeli = selOpt ? parseFloat(selOpt.dataset.beli || 0) : 0;
    const hargaJual = parseFloat(jualEl.value) || 0;
    const profit = hargaJual - hargaBeli;
    if (hargaJual > 0 && sel.value) {
      prev.classList.add('show');
      setText('sell-pv-beli', fmt(hargaBeli));
      setText('sell-pv-jual', fmt(hargaJual));
      const profitEl = el('sell-pv-profit');
      if (profitEl) {
        let pct = '';
        if (hargaBeli > 0) pct = ` (${((profit / hargaBeli) * 100).toFixed(1)}%)`;
        profitEl.textContent = fmt(profit) + pct;
        profitEl.style.color = profit >= 0 ? 'var(--green)' : 'var(--red)';
      }
    } else { prev.classList.remove('show'); }
  },

  _autocomplete() {
    const q = el('f-desc').value.trim();
    const ac = el('f-desc-ac');
    if (!ac) return;
    if (q.length < 2) { ac.style.display = 'none'; return; }
    const matches = Store.getDescriptions().filter(d => d.toLowerCase().includes(q.toLowerCase())).slice(0, 8);
    if (!matches.length) { ac.style.display = 'none'; return; }
    ac.innerHTML = matches.map(m => `<div class="autocomplete-item" onclick="el('f-desc').value='${m.replace(/'/g, "\\'")}'; el('f-desc-ac').style.display='none'; App._updatePreview();">${m}</div>`).join('');
    ac.style.display = 'block';
  },

  quickFill(desc, kat, masuk, keluar) {
    if (el('f-desc')) el('f-desc').value = desc;
    if (el('f-qty')) el('f-qty').value = '';
    if (el('f-kategori')) el('f-kategori').value = kat;
    this._updateMoneyFields();
    if (masuk > 0 && el('f-masuk')) el('f-masuk').value = masuk;
    if (keluar > 0 && el('f-keluar')) el('f-keluar').value = keluar;
    this._updatePreview();
  },

  resetForm() {
    if (el('input-form')) el('input-form').reset();
    const today = new Date().toISOString().split('T')[0];
    if (el('f-tanggal')) el('f-tanggal').value = today;
    if (el('preview-box')) el('preview-box').classList.remove('show');
    if (el('fg-masuk')) el('fg-masuk').style.display = 'flex';
    if (el('fg-keluar')) el('fg-keluar').style.display = 'flex';
  },

  async _submitTx() {
    const kat = el('f-kategori').value;
    const masuk = parseFloat(el('f-masuk').value) || 0;
    const keluar = parseFloat(el('f-keluar').value) || 0;
    const tanggal = el('f-tanggal').value;
    if (!isValidDate(tanggal)) { toast('Tanggal tidak valid!', 'error'); return; }
    if (!kat) { toast('Pilih kategori dulu!', 'error'); return; }
    if (!el('f-desc').value.trim()) { toast('Isi deskripsi transaksi!', 'error'); return; }
    const newSaldo = Store.getLatestSaldo() + masuk - keluar;
    // Disable tombol submit selama proses
    const submitBtn = el('input-form') ? el('input-form').querySelector('button[type="submit"]') : null;
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Menyimpan...'; }

    let sheetKat = kat;
    if (kat === 'Penjualan Utama' || kat === 'Pendapatan Lainnya') sheetKat = 'Pendapatan';

    await Store.addTx({
      tanggal, deskripsi: el('f-desc').value.trim(), kategori: kat, kategoriRaw: sheetKat,
      quantity: el('f-qty') ? el('f-qty').value.trim() : '',
      uangMasuk: masuk, uangKeluar: keluar, saldo: newSaldo
    });
    if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Simpan Transaksi`; }
    setText('badge-tx', Store._transactions.length);
    toast('✅ Transaksi kas berhasil disimpan!', 'success');
    this.resetForm();
    this._updateSaldoDisplay();
  },

  async _submitBuy() {
    const tanggal = el('f-buy-tanggal').value;
    const nota = el('f-buy-nota').value.trim();
    const tipe = el('f-buy-tipe').value.trim();
    const hargaBeli = parseFloat(el('f-buy-harga-beli').value) || 0;
    const keterangan = el('f-buy-keterangan').value.trim();
    if (!isValidDate(tanggal)) { toast('Tanggal tidak valid!', 'error'); return; }
    if (!tipe) { toast('Isi tipe/model HP!', 'error'); return; }
    if (hargaBeli <= 0) { toast('Harga beli harus lebih dari 0!', 'error'); return; }
    // Disable tombol submit selama proses untuk mencegah double-klik
    const buyBtn = el('buy-form') ? el('buy-form').querySelector('button[type="submit"]') : null;
    if (buyBtn) { buyBtn.disabled = true; buyBtn.textContent = 'Menyimpan...'; }
    await Store.addSale({ nota: nota || `NOTA-${Date.now()}`, tanggalMasuk: tanggal, tanggalKeluar: null, tipeModel: tipe, tipe, hargaBeli, hargaJual: 0, profit: 0, keterangan, turnoverDays: null });
    if (buyBtn) { buyBtn.disabled = false; buyBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Simpan Pembelian`; }
    if (el('buy-form')) el('buy-form').reset();
    if (el('f-buy-tanggal')) el('f-buy-tanggal').value = new Date().toISOString().split('T')[0];
    if (el('f-buy-nota')) el('f-buy-nota').value = Store.getNextNota();
    if (el('buy-preview')) el('buy-preview').classList.remove('show');
    this._refreshSellUnitOptions();
  },

  async _submitSell() {
    const saleId = el('f-sell-unit').value;
    const tanggal = el('f-sell-tanggal').value;
    const hargaJual = parseFloat(el('f-sell-harga-jual').value) || 0;
    const keterangan = el('f-sell-keterangan') ? el('f-sell-keterangan').value.trim() : '';
    if (!saleId) { toast('Pilih unit yang dijual!', 'error'); return; }
    if (!isValidDate(tanggal)) { toast('Tanggal tidak valid!', 'error'); return; }
    if (hargaJual <= 0) { toast('Harga jual harus lebih dari 0!', 'error'); return; }
    const sale = Store.getSaleById(saleId);
    if (!sale) { toast('Unit tidak ditemukan!', 'error'); return; }
    // Disable tombol submit selama proses untuk mencegah double-klik
    const sellBtn = el('sell-form') ? el('sell-form').querySelector('button[type="submit"]') : null;
    if (sellBtn) { sellBtn.disabled = true; sellBtn.textContent = 'Menyimpan...'; }
    await Store.updateSale(saleId, { tanggalKeluar: tanggal, hargaJual, keterangan: keterangan || sale.keterangan });
    toast(`✅ Penjualan "${sale.tipeModel || sale.tipe}" berhasil disimpan!`, 'success');
    if (sellBtn) { sellBtn.disabled = false; sellBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Simpan Penjualan`; }
    if (el('sell-form')) el('sell-form').reset();
    if (el('f-sell-tanggal')) el('f-sell-tanggal').value = new Date().toISOString().split('T')[0];
    if (el('sell-preview')) el('sell-preview').classList.remove('show');
    this._refreshSellUnitOptions();
  },

  // ---- Laporan ----
  _renderLaporan() {
    const filter = this.laporan.filter;
    const groupMode = el('lap-group-mode') ? el('lap-group-mode').value : 'bulan';
    
    const stats = Store.getStatsByFilter(filter);
    setText('r-masuk', fmt(stats.masuk));
    setText('r-keluar', fmt(stats.keluar));
    setText('r-period-label', filterLabel(filter));

    const grouped = Store.getGroupedStats(filter, groupMode);
    
    const groupSelect = el('lap-group-mode');
    const groupName = groupSelect ? groupSelect.options[groupSelect.selectedIndex].text : 'Per Bulan';
    const filterLabelText = filterLabel(filter);
    const ext = filterLabelText === 'Semua Waktu' ? '(Semua Waktu)' : `(${filterLabelText})`;
    
    const chartTitle = document.getElementById('lap-chart-title');
    if (chartTitle) chartTitle.textContent = `📊 Pemasukan vs Pengeluaran ${groupName} ${ext}`;
    const tableTitle = document.getElementById('lap-table-title');
    if (tableTitle) tableTitle.textContent = `📅 Ringkasan ${groupName} ${ext}`;

    Charts.renderMonthlyBars(grouped);

    const nwTitle = document.getElementById('nw-chart-title');
    if (nwTitle) nwTitle.textContent = `📈 Net Worth Growth ${groupName} ${ext}`;

    const filteredNw = applyCalendarFilter(Store.getDynamicNetworth(), 'tanggal', filter);
    if (Charts.renderNetWorth) Charts.renderNetWorth(filteredNw, groupMode);

    const tbody = el('monthly-tbody');
    if (tbody) {
      if (!grouped.length) {
        tbody.innerHTML = `<tr><td colspan="5" class="empty-state" style="padding:40px">Tidak ada data untuk periode ini.</td></tr>`;
      } else {
        tbody.innerHTML = grouped.map(m => `<tr>
          <td style="font-weight:700">${m.bulan}</td>
          <td class="cell-mono">${m.count}</td>
          <td class="cell-in">${fmt(m.masuk)}</td>
          <td class="cell-out">${fmt(m.keluar)}</td>
          <td class="cell-saldo">${fmt(m.saldo)}</td>
        </tr>`).join('');
      }
    }
  },

  // ---- Modal Setup ----
  _setupModals() {
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(overlay.id); });
    });
    ['es-harga-beli', 'es-harga-jual'].forEach(fid => {
      if (el(fid)) el(fid).oninput = () => this._updateSaleEditPreview();
    });
  },

  // ---- Export ----
  exportTx() {
    const data = Store.getTx({ filter: this.tx.filter, kat: this.tx.kat, search: this.tx.search });
    if (!data.length) { toast('Tidak ada data untuk diexport.', 'error'); return; }
    const rows = [['Tanggal', 'Deskripsi', 'Kategori', 'Uang Masuk', 'Uang Keluar', 'Saldo', 'Qty'],
    ...data.map(t => [t.tanggal, t.deskripsi, t.kategori, t.uangMasuk || 0, t.uangKeluar || 0, t.saldo || 0, t.quantity || ''])];
    this._downloadXLSX(rows, 'BukuBesar_KarimGadget');
  },

  exportSales() {
    const data = Store.getSales({ filter: this.sales.filter, search: this.sales.search });
    if (!data.length) { toast('Tidak ada data penjualan.', 'error'); return; }
    const rows = [['Nota', 'Tgl Masuk', 'Tgl Terjual', 'Model', 'Harga Beli', 'Harga Jual', 'Profit', 'Waktu Putar', 'Keterangan'],
    ...data.map(s => [s.nota, s.tanggalMasuk, s.tanggalKeluar, s.tipeModel || s.tipe, s.hargaBeli || 0, s.hargaJual || 0, s.profit || 0, s.turnoverDays, s.keterangan])];
    this._downloadXLSX(rows, 'DataPenjualan_KarimGadget');
  },

  exportReportXLSX() {
    const months = Store.getMonthlyStats();
    const rows = [['Bulan', 'Jumlah Tx', 'Pemasukan', 'Pengeluaran', 'Saldo Akhir'],
    ...months.map(m => [fmtYearMonth(m.bulan), m.count, m.masuk, m.keluar, m.saldo])];
    this._downloadXLSX(rows, 'Laporan_KarimGadget');
  },

  exportReportCSV() {
    const months = Store.getMonthlyStats();
    const header = ['Bulan', 'Jumlah Tx', 'Pemasukan', 'Pengeluaran', 'Saldo Akhir'];
    const rows = months.map(m => [fmtYearMonth(m.bulan), m.count, m.masuk, m.keluar, m.saldo]);
    const csv = [header, ...rows].map(r => r.join(',')).join('\n');
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,\uFEFF' + encodeURIComponent(csv);
    a.download = `Laporan_KarimGadget_${Date.now()}.csv`;
    a.click();
  },

  _downloadXLSX(rows, name) {
    if (typeof XLSX === 'undefined') { toast('Library XLSX belum dimuat.', 'error'); return; }
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Data');
    XLSX.writeFile(wb, `${name}_${Date.now()}.xlsx`);
    toast('File Excel berhasil diunduh!', 'success');
  },

  resetAllData() {
    if (!confirm('⚠️ HAPUS SEMUA DATA lokal dan reload dari Google Sheets?\nAksi ini TIDAK BISA dibatalkan!')) return;
    ['kg_tx_cache', 'kg_pending_tx', 'kg_sales_cache', 'kg_pending_sales'].forEach(k => localStorage.removeItem(k));
    location.reload();
  },
};

// ============ BOOTSTRAP ============
document.addEventListener('DOMContentLoaded', () => App.init());
