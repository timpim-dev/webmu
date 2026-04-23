(function() {
  const PB_URL = 'https://pocketbase.felixx.dev';
  const SESSION_KEY = 'webmu-pocketbase-session';

  function readSession() {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (!parsed?.token || !parsed?.record?.id) return null;
      return parsed;
    } catch (_) {
      return null;
    }
  }

  const session = readSession();
  if (!session) {
    window.location.href = 'collection.html';
    return;
  }

  async function pbRequest(path, { method = 'GET', token = null, body = null } = {}) {
    const headers = { Accept: 'application/json' };
    if (token) headers.Authorization = token;

    const init = { method, headers };
    if (body !== null) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }

    const res = await fetch(`${PB_URL}${path}`, init);
    const text = await res.text();
    let data = null;
    if (text) {
      try { data = JSON.parse(text); } catch (_) { data = { message: text }; }
    }

    if (!res.ok) {
      const message = data?.message || `Request failed (${res.status})`;
      throw new Error(message);
    }
    return data;
  }

  let catalog = [];

  async function fetchCatalog() {
    try {
      const data = await pbRequest('/api/collections/catalog_games/records?perPage=200&sort=name');
      catalog = data.items || [];
      renderCatalog();
    } catch (err) {
      console.error("Failed to fetch catalog", err);
      document.getElementById('catalogList').innerHTML = `<div style="color: #f87171; font-size: 14px;">Failed to load catalog.</div>`;
    }
  }

  function renderCatalog(filterText = '') {
    const list = document.getElementById('catalogList');
    const filtered = catalog.filter(item => {
      const search = filterText.toLowerCase();
      return item.name.toLowerCase().includes(search) || 
             (item.system || '').toLowerCase().includes(search);
    });

    if (filtered.length === 0) {
      list.innerHTML = `<div style="color: var(--muted); font-size: 14px;">No games found matching your search.</div>`;
      return;
    }

    list.innerHTML = filtered.map(item => `
      <div class="catalog-item">
        ${item.coverUrl ? `<img src="${item.coverUrl}" class="catalog-thumb" alt="" />` : `<div class="catalog-thumb"></div>`}
        <div class="catalog-info">
          <div class="catalog-name">${item.name}</div>
          <div class="catalog-meta">
            <span class="system-badge">${item.system}</span>
            ${item.externalId ? `<span style="font-size:10px; color:var(--muted2)">ID: ${item.externalId}</span>` : ''}
          </div>
        </div>
      </div>
    `).join('');
  }

  document.getElementById('contributeForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('submitBtn');
    const msg = document.getElementById('successMsg');
    
    btn.disabled = true;
    btn.textContent = 'Submitting...';
    msg.style.display = 'none';

    const payload = {
      name: document.getElementById('gameName').value,
      system: document.getElementById('gameSystem').value,
      coverUrl: document.getElementById('gameCover').value,
      notes: document.getElementById('gameNotes').value,
      externalId: document.getElementById('gameExternalId').value,
    };

    try {
      await pbRequest('/api/collections/catalog_games/records', {
        method: 'POST',
        token: session.token,
        body: payload
      });
      
      msg.style.display = 'block';
      e.target.reset();
      fetchCatalog();
    } catch (err) {
      alert("Failed to submit: " + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Submit to Catalog';
    }
  });

  document.getElementById('catalogSearch').addEventListener('input', (e) => {
    renderCatalog(e.target.value);
  });

  fetchCatalog();
})();
