/* Bhavani Agencies — Fixed & Redesigned Frontend
   Fixes:
   1. Empties to lorry: no stock check needed (independent ledger)
   2. Accept from supervisor: delivery guy can accept issues addressed to them
   3. Accept from van: delivery guy sees van-issued stock to accept
   4. Supervisor can accept RETURN-to-GODOWN; van accepts ISSUE-to-VAN
   5. Pending-issue guard: delivery must fill details before accepting next
   6. Improved UI throughout
   7. Excel-matching reports
*/

const state = {
  apiBase: localStorage.getItem('bhavani_api_base') || '',
  token: localStorage.getItem('bhavani_token') || '',
  user: null,
  cylinderTypes: [],
  users: [],
  activeTab: null,
};

// ────────────────────────────────── API helper
async function api(path, { method = 'GET', body } = {}) {
  if (!state.apiBase) throw new Error('Set the API base URL first.');
  const headers = { 'Content-Type': 'application/json' };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const res = await fetch(state.apiBase.replace(/\/$/, '') + path, {
    method, headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data;
  try { data = await res.json(); } catch { data = null; }
  if (!res.ok) throw new Error((data && data.error) || `Request failed (${res.status})`);
  return data;
}

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
function todayStr() { return new Date().toISOString().slice(0, 10); }
function fmt(n) { return (n ?? 0).toString(); }
function fmtTime(d) { return d ? new Date(d).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' }) : '—'; }
function fmtDate(d) { return d ? new Date(d).toLocaleDateString('en-IN') : '—'; }
function initials(name) { return (name || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2); }

// ────────────────────────────────── API Config
$('#apiBase').value = state.apiBase;
$('#saveApiBase').addEventListener('click', async () => {
  state.apiBase = $('#apiBase').value.trim();
  localStorage.setItem('bhavani_api_base', state.apiBase);
  await checkApiHealth();
});
async function checkApiHealth() {
  const el = $('#apiStatus');
  if (!state.apiBase) { el.textContent = ''; return; }
  try {
    await fetch(state.apiBase.replace(/\/$/, '') + '/health').then(r => r.json());
    el.textContent = '● Connected';
    el.className = 'ok';
  } catch {
    el.textContent = '● Not reachable';
    el.className = 'bad';
  }
}
checkApiHealth();

// ────────────────────────────────── Auth
$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#loginError').textContent = '';
  try {
    const data = await api('/auth/login', {
      method: 'POST',
      body: { username: $('#loginUsername').value.trim(), password: $('#loginPassword').value },
    });
    state.token = data.token;
    state.user = data.user;
    localStorage.setItem('bhavani_token', data.token);
    await afterLogin();
  } catch (err) {
    const el = $('#loginError');
    el.textContent = err.message;
    el.className = 'msg-error';
  }
});

$('#logoutBtn').addEventListener('click', () => {
  state.token = ''; state.user = null;
  localStorage.removeItem('bhavani_token');
  showLogin();
});

$('#changePwBtn').addEventListener('click', () => {
  $('#pwMsg').textContent = '';
  $('#pwModal').classList.remove('hidden');
});
$('#pwCancel').addEventListener('click', () => $('#pwModal').classList.add('hidden'));
$('#pwSubmit').addEventListener('click', async () => {
  try {
    await api('/auth/change-password', {
      method: 'POST',
      body: { currentPassword: $('#pwCurrent').value, newPassword: $('#pwNew').value },
    });
    const el = $('#pwMsg');
    el.textContent = 'Password changed.';
    el.className = 'msg-success';
    state.user.mustChangePassword = false;
    setTimeout(() => $('#pwModal').classList.add('hidden'), 900);
  } catch (err) {
    const el = $('#pwMsg');
    el.textContent = err.message;
    el.className = 'msg-error';
  }
});

function showLogin() {
  $('#loginView').classList.remove('hidden');
  $('#appView').classList.add('hidden');
  $('#userBox').classList.add('hidden');
}

async function afterLogin() {
  $('#loginView').classList.add('hidden');
  $('#appView').classList.remove('hidden');
  $('#userBox').classList.remove('hidden');
  $('#whoami').textContent = state.user.name;
  $('#userRole').textContent = state.user.role;
  $('#avatarEl').textContent = initials(state.user.name);

  const [types] = await Promise.all([api('/cylinder-types')]);
  state.cylinderTypes = types;
  if (['owner', 'supervisor', 'van'].includes(state.user.role)) {
    try { state.users = await api('/users'); } catch { state.users = []; }
  }

  if (state.user.mustChangePassword) {
    setTimeout(() => {
      showToast('⚠️ Please change your default password!', 'warn');
      $('#changePwBtn').click();
    }, 300);
  }

  buildSidebar();
  await checkPendingIssueAlert();
}

// ────────────────────────────────── Pending issue guard
async function checkPendingIssueAlert() {
  const el = $('#pendingAlert');
  // Van doesn't fill in delivered/NC details (it only distributes to delivery
  // guys, tracked on their own reports), so this guard only applies to delivery guys.
  if (state.user?.role !== 'delivery') { el.classList.add('hidden'); return; }
  try {
    const all = await api('/daily-lines?date=' + todayStr());
    const hasUnsaved = all.some(g => g.lines.some(l => !l.closed && l.received > 0 && l.delivered === 0 && l.nc === 0));
    el.classList.toggle('hidden', !hasUnsaved);
  } catch { el.classList.add('hidden'); }
}

// ────────────────────────────────── Sidebar / Tabs
const TABS_BY_ROLE = {
  owner:      [['📊', 'stock', 'Stock Balances'], ['📋', 'reports', 'Reports'], ['📝', 'requests', 'Requests'], ['👥', 'users', 'Users']],
  supervisor: [['📊', 'stock', 'Stock Balances'], ['🚛', 'loadReceived', 'Load Received'], ['📦', 'emptiesToLorry', 'Empties to Lorry'], ['🔄', 'surrenderEntry', 'Surrender Entry'], ['🏷️', 'issueStock', 'Issue Stock'], ['📋', 'reports', 'Reports'], ['📝', 'requests', 'Requests']],
  van:        [['🗂️', 'vanOverview', 'Van Overview'], ['🏷️', 'issueStock', 'Issue Stock'], ['📝', 'requests', 'Requests']],
  delivery:   [['🗂️', 'myDay', 'My Day'], ['📝', 'requests', 'Requests']],
};

function buildSidebar() {
  const tabs = TABS_BY_ROLE[state.user.role] || [];
  const nav = $('#navItems');
  nav.innerHTML = '';
  tabs.forEach(([icon, id, label]) => {
    const btn = document.createElement('button');
    btn.className = 'nav-btn';
    btn.dataset.tab = id;
    btn.innerHTML = `<span class="nav-icon">${icon}</span>${label}`;
    btn.addEventListener('click', () => selectTab(id));
    nav.appendChild(btn);
  });
  selectTab(tabs[0][1]);
}

function selectTab(tab) {
  state.activeTab = tab;
  $$('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  const renderers = {
    stock: renderStockTab,
    loadReceived: renderLoadReceivedTab,
    emptiesToLorry: renderEmptiesToLorryTab,
    surrenderEntry: renderSurrenderEntryTab,
    issueStock: renderIssueStockTab,
    requests: renderRequestsTab,
    myDay: renderMyDayTab,
    vanOverview: renderVanOverviewTab,
    reports: renderReportsTab,
    users: renderUsersTab,
  };
  (renderers[tab] || (() => {}))();
}

function ctOptions() {
  return state.cylinderTypes.map(t => `<option value="${t._id}">${t.name}</option>`).join('');
}

// ────────────────────────────────── Toast
function showToast(msg, type = 'success') {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    t.style = 'position:fixed;bottom:24px;right:24px;z-index:999;padding:10px 18px;border-radius:8px;font-size:13px;font-weight:600;box-shadow:0 4px 12px rgba(0,0,0,0.2);transition:opacity 0.3s;';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.background = type === 'success' ? '#16a34a' : type === 'warn' ? '#d97706' : '#dc2626';
  t.style.color = '#fff';
  t.style.opacity = '1';
  clearTimeout(t._timeout);
  t._timeout = setTimeout(() => { t.style.opacity = '0'; }, 2500);
}

// ────────────────────────────────── STOCK TAB
async function renderStockTab() {
  const content = $('#tabContent');
  content.innerHTML = `<div class="panel"><p>Loading stock…</p></div>`;

  let formHtml = '';
  if (['owner', 'supervisor'].includes(state.user.role)) {
    formHtml = `
    <div class="panel">
      <div class="panel-title">⚙️ Set Opening Stock</div>
      <div class="panel-desc">One-time setup or manual correction of a location's starting balance.</div>
      <div class="form-row">
        <label class="field-label">Location
          <select name="locationType"><option value="GODOWN">Godown</option><option value="VAN">Van</option></select>
        </label>
        <label class="field-label">Cylinder Type <select name="cylinderType">${ctOptions()}</select></label>
        <label class="field-label">Filled <input name="filled" type="number" min="0" value="0" /></label>
        <label class="field-label">Empty <input name="empty" type="number" min="0" value="0" /></label>
        <label class="field-label">Defect <input name="defect" type="number" min="0" value="0" /></label>
        <label class="field-label">&nbsp;
          <button type="button" id="setOpeningBtn" class="btn-primary">Set Balance</button>
        </label>
      </div>
      <div id="openingMsg"></div>
    </div>`;
  }

  content.innerHTML = formHtml + `
  <div class="panel">
    <div class="panel-title">📊 Live Stock Balances</div>
    <div id="stockTables"><p class="empty-state">Loading…</p></div>
  </div>`;

  if (['owner', 'supervisor'].includes(state.user.role)) {
    $('#setOpeningBtn').addEventListener('click', async () => {
      const row = $('#setOpeningBtn').closest('.panel');
      const body = {
        locationType: row.querySelector('[name=locationType]').value,
        cylinderType: row.querySelector('[name=cylinderType]').value,
        filled: Number(row.querySelector('[name=filled]').value),
        empty: Number(row.querySelector('[name=empty]').value),
        defect: Number(row.querySelector('[name=defect]').value),
      };
      try {
        await api('/stock-locations/opening-stock', { method: 'POST', body });
        showToast('✅ Opening stock saved');
        $('#openingMsg').innerHTML = '<div class="msg-success">Saved.</div>';
        loadStockTables();
      } catch (err) {
        $('#openingMsg').innerHTML = `<div class="msg-error">${err.message}</div>`;
      }
    });
  }

  await loadStockTables();
}

async function loadStockTables() {
  const el = $('#stockTables');
  if (!el) return;
  const locations = await api('/stock-locations');
  if (!locations.length) { el.innerHTML = '<p class="empty-state">No stock locations initialized yet.</p>'; return; }
  el.innerHTML = locations.map(loc => {
    const rows = loc.balances.map(b => `
      <tr>
        <td>${b.cylinderType?.name || '—'}</td>
        <td><strong>${b.filled}</strong></td>
        <td>${b.empty}</td>
        <td>${b.defect}</td>
        <td>${b.filled + b.empty + b.defect}</td>
      </tr>`).join('');
    const locBadge = loc.locationType === 'GODOWN' ? 'badge-godown' : 'badge-van';
    return `
      <div style="margin-bottom:16px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
          <span class="badge ${locBadge}">${loc.locationType}</span>
        </div>
        <div class="table-wrap">
          <table class="datatable">
            <thead><tr><th>Cylinder Type</th><th>Filled</th><th>Empty</th><th>Defect</th><th>Total</th></tr></thead>
            <tbody>${rows || '<tr><td colspan=5>No stock set yet</td></tr>'}</tbody>
          </table>
        </div>
      </div>`;
  }).join('');
}

// ────────────────────────────────── Simple Ledger helper
function renderSimpleLedgerTab({ icon, title, desc, fields, postPath, listPath, rowFmt, roleCheck }) {
  const content = $('#tabContent');
  const fieldsHtml = fields.map(f =>
    `<label class="field-label">${f.label} <input name="${f.name}" type="number" min="0" value="0" /></label>`
  ).join('');
  content.innerHTML = `
    <div class="panel">
      <div class="panel-title">${icon} ${title}</div>
      <div class="panel-desc">${desc}</div>
      <div class="form-row">
        <label class="field-label">Cylinder Type <select name="cylinderType">${ctOptions()}</select></label>
        ${fieldsHtml}
        <label class="field-label">&nbsp;
          <button type="button" id="ledgerSubmitBtn" class="btn-primary">Submit</button>
        </label>
      </div>
      <div id="ledgerMsg"></div>
    </div>
    <div class="panel">
      <div class="panel-title">📋 Today's Entries</div>
      <div id="ledgerList"><p>Loading…</p></div>
    </div>`;

  $('#ledgerSubmitBtn').addEventListener('click', async () => {
    const panel = $('#ledgerSubmitBtn').closest('.panel');
    const body = { cylinderType: panel.querySelector('[name=cylinderType]').value };
    fields.forEach(f => { body[f.name] = Number(panel.querySelector(`[name=${f.name}]`).value); });
    try {
      await api(postPath, { method: 'POST', body });
      showToast(`✅ ${title} saved`);
      $('#ledgerMsg').innerHTML = '<div class="msg-success">Saved.</div>';
      loadLedger();
    } catch (err) {
      $('#ledgerMsg').innerHTML = `<div class="msg-error">${err.message}</div>`;
    }
  });

  async function loadLedger() {
    const list = await api(`${listPath}?date=${todayStr()}`);
    const el = $('#ledgerList');
    if (!list.length) { el.innerHTML = '<div class="empty-state"><div class="empty-icon">📭</div><p>No entries today yet.</p></div>'; return; }
    const rows = list.map(r => `<tr><td>${r.cylinderType?.name || '—'}</td><td>${rowFmt(r)}</td><td>${r.enteredBy?.name || ''}</td><td>${fmtTime(r.createdAt || r.time)}</td></tr>`).join('');
    el.innerHTML = `<div class="table-wrap"><table class="datatable">
      <thead><tr><th>Type</th><th>Details</th><th>By</th><th>Time</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;
  }
  loadLedger();
}

function renderLoadReceivedTab() {
  renderSimpleLedgerTab({
    icon: '🚛', title: 'Load Received',
    desc: 'Filled cylinders arriving from the lorry today.',
    fields: [{ name: 'filled', label: 'Filled Qty' }],
    postPath: '/load-received', listPath: '/load-received',
    rowFmt: r => `Filled: <strong>${r.filled}</strong>`,
  });
}

function renderEmptiesToLorryTab() {
  renderSimpleLedgerTab({
    icon: '📦', title: 'Empties Given to Lorry',
    desc: "Record empties/defects sent back on the outbound lorry (the Excel's 'Emty Return' ledger). Checked against today's available empty/defect balance — you can't send more than what's actually on hand.",
    fields: [{ name: 'empty', label: 'Empty Qty' }, { name: 'defect', label: 'Defect Qty' }],
    postPath: '/empties-to-lorry', listPath: '/empties-to-lorry',
    rowFmt: r => `Empty: <strong>${r.empty}</strong>  Defect: <strong>${r.defect}</strong>`,
  });
}

function renderSurrenderEntryTab() {
  renderSimpleLedgerTab({
    icon: '🔄', title: 'Surrender Entry',
    desc: 'Customer surrenders a cylinder directly at the shop (no delivery guy involved).',
    fields: [{ name: 'qty', label: 'Qty' }],
    postPath: '/surrender-entry', listPath: '/surrender-entry',
    rowFmt: r => `Qty: <strong>${r.qty}</strong>`,
  });
}

// ────────────────────────────────── ISSUE STOCK TAB
function renderIssueStockTab() {
  const content = $('#tabContent');
  const isVan = state.user.role === 'van';
  const recipientOptions = isVan
    ? state.users.filter(u => u.role === 'delivery').map(u => `<option value="${u._id}">${u.name}</option>`).join('')
    : [`<option value="__VAN__">🚐 Van (bulk transfer)</option>`]
        .concat(state.users.filter(u => u.role === 'delivery').map(u => `<option value="${u._id}">${u.name}</option>`))
        .join('');

  content.innerHTML = `
    <div class="panel">
      <div class="panel-title">🏷️ Issue Stock</div>
      <div class="panel-desc">${isVan ? 'Issue filled stock from the Van to a delivery guy.' : 'Issue filled stock from the Godown to a delivery guy or to the Van.'} A pending request is created — nothing moves until the recipient accepts.</div>
      <div class="form-row">
        <label class="field-label">Cylinder Type <select id="issueCT">${ctOptions()}</select></label>
        <label class="field-label">To <select id="issueTo">${recipientOptions}</select></label>
        <label class="field-label">Filled Qty <input id="issueFilled" type="number" min="1" value="10" /></label>
        <label class="field-label">&nbsp;
          <button type="button" id="issueBtn" class="btn-primary">Raise Issue</button>
        </label>
      </div>
      <div id="issueMsg"></div>
    </div>
    <div class="panel">
      <div class="panel-title">📋 Issues Raised by Me Today</div>
      <div id="issueList">Loading…</div>
    </div>`;

  $('#issueBtn').addEventListener('click', async () => {
    const toVal = $('#issueTo').value;
    const to = toVal === '__VAN__' ? { kind: 'VAN' } : { kind: 'USER', user: toVal };
    try {
      await api('/stock-requests', {
        method: 'POST',
        body: { type: 'ISSUE', cylinderType: $('#issueCT').value, filled: Number($('#issueFilled').value), to },
      });
      showToast('✅ Issue request raised');
      $('#issueMsg').innerHTML = '<div class="msg-success">Request raised — waiting for recipient to accept.</div>';
      loadMyIssues();
    } catch (err) {
      $('#issueMsg').innerHTML = `<div class="msg-error">${err.message}</div>`;
    }
  });

  async function loadMyIssues() {
    const list = await api('/stock-requests');
    const mine = list.filter(r => r.type === 'ISSUE' && (r.raisedBy?._id === state.user.id || r.raisedBy === state.user.id));
    $('#issueList').innerHTML = renderRequestTable(mine, { showAccept: false });
  }
  loadMyIssues();
}

// ────────────────────────────────── REQUESTS TAB
function renderRequestsTab() {
  const content = $('#tabContent');
  const canRaiseReturn = ['delivery', 'van'].includes(state.user.role);

  content.innerHTML = `
    ${canRaiseReturn ? `
    <div class="panel">
      <div class="panel-title">📤 Raise a Return</div>
      <div class="panel-desc">Hand back empty/defect cylinders collected from customers, and/or unsold filled stock at end of day.</div>
      <div class="form-row">
        <label class="field-label">Cylinder Type <select id="retCT">${ctOptions()}</select></label>
        <label class="field-label">Return To <select id="retTo">
          <option value="GODOWN">Godown</option>
          ${state.user.role !== 'van' ? '<option value="VAN">Van</option>' : ''}
        </select></label>
        <label class="field-label">Filled (unsold) <input id="retFilled" type="number" min="0" value="0" /></label>
        <label class="field-label">Empty <input id="retEmpty" type="number" min="0" value="0" /></label>
        <label class="field-label">Defect <input id="retDefect" type="number" min="0" value="0" /></label>
        <label class="field-label">&nbsp;<button type="button" id="returnBtn" class="btn-primary">Raise Return</button></label>
      </div>
      <div id="returnMsg"></div>
    </div>` : ''}
    <div class="panel">
      <div class="panel-title">⏳ Pending — Waiting on You</div>
      <div id="pendingForMe">Loading…</div>
    </div>
    <div class="panel">
      <div class="panel-title">📋 All Requests Involving You</div>
      <div id="allMine">Loading…</div>
    </div>`;

  if (canRaiseReturn) {
    $('#returnBtn').addEventListener('click', async () => {
      try {
        await api('/stock-requests', {
          method: 'POST',
          body: {
            type: 'RETURN',
            cylinderType: $('#retCT').value,
            to: { kind: $('#retTo').value },
            filled: Number($('#retFilled').value),
            empty: Number($('#retEmpty').value),
            defect: Number($('#retDefect').value),
          },
        });
        showToast('✅ Return request raised');
        $('#returnMsg').innerHTML = '<div class="msg-success">Return request raised — waiting for accept.</div>';
        loadRequests();
      } catch (err) {
        $('#returnMsg').innerHTML = `<div class="msg-error">${err.message}</div>`;
      }
    });
  }

  async function loadRequests() {
    const [pending, all] = await Promise.all([
      api('/stock-requests?status=PENDING'),
      api('/stock-requests'),
    ]);
    const mineToAccept = pending.filter(r => canAcceptThis(r));
    const pendingEl = $('#pendingForMe');
    const allEl = $('#allMine');
    if (!pendingEl || !allEl) return;

    // FIXED: Warn but NEVER block delivery guys from accepting issues (from van or godown).
    // Only show a soft warning if they have 2+ unworked lines stacking up.
    if (state.user.role === 'delivery') {
      const myLines = await api('/daily-lines?date=' + todayStr());
      const unworkedCount = myLines.reduce((acc, g) =>
        acc + g.lines.filter(l => !l.closed && l.received > 0 && l.delivered === 0 && l.nc === 0 && l.returned === 0).length, 0);

      if (unworkedCount >= 2 && mineToAccept.filter(r => r.type === 'ISSUE').length > 0) {
        pendingEl.innerHTML = `
          <div class="msg-warn">⚠️ You have ${unworkedCount} open stock batches with no delivery data entered yet. Please update "My Day" soon.</div>
          ${renderRequestTable(mineToAccept, { showAccept: true })}`;
      } else {
        pendingEl.innerHTML = renderRequestTable(mineToAccept, { showAccept: true });
      }
    } else {
      pendingEl.innerHTML = renderRequestTable(mineToAccept, { showAccept: true });
    }

    allEl.innerHTML = renderRequestTable(all, { showAccept: false });
    bindAcceptButtons();
    await checkPendingIssueAlert();
  }

  // FIX: Corrected canAcceptThis logic matching backend checkCanAccept
  function canAcceptThis(r) {
    const role = state.user.role;
    if (['owner', 'supervisor'].includes(role)) return true;

    if (r.type === 'ISSUE') {
      if (r.to.kind === 'VAN') return role === 'van';
      if (r.to.kind === 'USER') {
        const toId = r.to.user?._id || r.to.user;
        return toId === state.user.id;
      }
    } else {
      // RETURN
      if (r.to.kind === 'GODOWN') return ['supervisor', 'owner'].includes(role);
      if (r.to.kind === 'VAN') return role === 'van';
    }
    return false;
  }

  function bindAcceptButtons() {
    $$('.acceptBtn').forEach(btn =>
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        btn.textContent = 'Accepting…';
        try {
          await api(`/stock-requests/${btn.dataset.id}/accept`, { method: 'POST' });
          showToast('✅ Accepted successfully');
          loadRequests();
        } catch (err) {
          showToast('❌ ' + err.message, 'error');
          btn.disabled = false;
          btn.textContent = 'Accept';
        }
      })
    );
    $$('.rejectBtn').forEach(btn =>
      btn.addEventListener('click', async () => {
        const reason = prompt('Reason for rejecting (optional):') || '';
        try {
          await api(`/stock-requests/${btn.dataset.id}/reject`, { method: 'POST', body: { reason } });
          showToast('Rejected');
          loadRequests();
        } catch (err) {
          showToast('❌ ' + err.message, 'error');
        }
      })
    );
  }

  loadRequests();
}

function renderRequestTable(list, { showAccept }) {
  if (!list.length) return '<div class="empty-state"><div class="empty-icon">✅</div><p>Nothing here.</p></div>';
  const rows = list.map(r => {
    const isIssue = r.type === 'ISSUE';

    // Source label with icon
    const fromKind = r.from?.kind;
    const fromUser = r.from?.user?.name;
    let fromLabel;
    if (fromKind === 'VAN')    fromLabel = '<span class="loc-badge loc-van">🚐 Van</span>';
    else if (fromKind === 'GODOWN') fromLabel = '<span class="loc-badge loc-godown">🏭 Godown</span>';
    else fromLabel = `<span class="loc-badge loc-user">👤 ${fromUser || 'Guy'}</span>`;

    // Dest label with icon
    const toKind = r.to?.kind;
    const toUser = r.to?.user?.name;
    let toLabel;
    if (toKind === 'VAN')     toLabel = '<span class="loc-badge loc-van">🚐 Van</span>';
    else if (toKind === 'GODOWN') toLabel = '<span class="loc-badge loc-godown">🏭 Godown</span>';
    else toLabel = `<span class="loc-badge loc-user">👤 ${toUser || '?'}</span>`;

    // Quantities — clearly split
    const filledCell = isIssue
      ? `<span class="qty-chip qty-filled">${r.filled} F</span>`
      : (r.filled > 0 ? `<span class="qty-chip qty-filled">${r.filled} F</span>` : '—');
    const emptyCell  = !isIssue && r.empty  > 0 ? `<span class="qty-chip qty-empty">${r.empty} E</span>`  : (isIssue ? '' : '—');
    const defectCell = !isIssue && r.defect > 0 ? `<span class="qty-chip qty-defect">${r.defect} D</span>` : (isIssue ? '' : '—');

    const typeBadge = isIssue
      ? '<span class="type-badge type-issue">↓ ISSUE</span>'
      : '<span class="type-badge type-return">↑ RETURN</span>';

    const statusBadge = `<span class="badge badge-${r.status.toLowerCase()}">${r.status}</span>`;

    const actions = showAccept && r.status === 'PENDING'
      ? `<button class="btn-sm btn-success acceptBtn" data-id="${r._id}">✓ Accept</button>
         <button class="btn-sm btn-danger rejectBtn" data-id="${r._id}">✕ Reject</button>`
      : '';

    return `<tr>
      <td>${typeBadge}</td>
      <td><strong>${r.cylinderType?.name || ''}</strong></td>
      <td>${fromLabel}</td>
      <td>→</td>
      <td>${toLabel}</td>
      <td>${filledCell}</td>
      <td>${emptyCell}${defectCell}</td>
      <td>${statusBadge}</td>
      <td class="col-time">${fmtTime(r.createdAt)}</td>
      <td class="col-actions">${actions}</td>
    </tr>`;
  }).join('');
  return `<div class="table-wrap"><table class="datatable req-table">
    <thead>
      <tr class="req-group-header">
        <th colspan="2"></th>
        <th colspan="3" class="grp-flow">Stock Flow</th>
        <th colspan="2" class="grp-qty">Quantities</th>
        <th colspan="3"></th>
      </tr>
      <tr>
        <th>Type</th>
        <th>Cylinder</th>
        <th class="grp-flow">From</th>
        <th class="grp-flow"></th>
        <th class="grp-flow">To</th>
        <th class="grp-qty">Filled</th>
        <th class="grp-qty">Emp / Def</th>
        <th>Status</th>
        <th>Time</th>
        <th></th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}

// ────────────────────────────────── MY DAY TAB
async function renderMyDayTab() {
  const content = $('#tabContent');
  content.innerHTML = `
    <div class="panel">
      <div class="panel-header">
        <div class="panel-title">🗂️ My Daily Report</div>
        <input type="date" id="myDayDate" value="${todayStr()}" style="padding:6px 10px;border:1px solid var(--border);border-radius:7px;font-size:13px" />
      </div>
      <div id="myDayContent">Loading…</div>
    </div>`;
  $('#myDayDate').addEventListener('change', loadMyDay);
  await loadMyDay();

  async function loadMyDay() {
    const date = $('#myDayDate').value;
    const groups = await api(`/daily-lines?date=${date}`);
    const el = $('#myDayContent');
    if (!el) return;
    if (!groups.length) {
      el.innerHTML = '<div class="empty-state"><div class="empty-icon">📭</div><p>No stock issued to you yet for this day.</p></div>';
      return;
    }
    el.innerHTML = groups.map(g => renderGuyTypeGroup(g)).join('');
    bindSaveButtons();
  }

  function renderGuyTypeGroup(g) {
    const lineRows = g.lines.map(l => {
      const filledBal = l.received - l.delivered - l.nc - l.returned;
      // Empty Balance, matching the Excel Template sheet exactly:
      //   Emty Balance = Received - (Emty+Defect) - NC - Return   (I5 = B5-(G5+H5)-D5-E5)
      // This is why Filled Balance and Empty Balance should always match at day end —
      // both start from Received and subtract NC + Return; they only differ in the third
      // term (Delivered vs Emty+Defect collected), which should be equal once every
      // delivered cylinder has come back as either an empty or a defect.
      const emptyBal = l.received - (l.emptyCollected + l.defectCollected) - l.nc - l.returned;
      const disabled = l.closed ? 'disabled' : '';
      // Tally check: filledBal should equal emptyBal at day end
      // (only meaningful when line is closed or has some data entered)
      const hasData = l.delivered > 0 || l.nc > 0 || l.emptyCollected > 0 || l.returned > 0;
      const tallyMatch = filledBal === emptyBal;
      const tallyClass = hasData ? (tallyMatch ? 'tally-ok' : 'tally-warn') : '';
      return `<tr data-line="${l._id}" ${l.closed ? 'style="opacity:0.75"' : ''}>
        <td><span class="badge-source">${l.source}</span></td>
        <td><strong>${l.received}</strong></td>
        <td><input class="editable inline-num" data-field="delivered" type="number" min="0" value="${l.delivered}" ${disabled} style="width:65px" /></td>
        <td><input class="editable inline-num" data-field="nc" type="number" min="0" value="${l.nc}" ${disabled} style="width:55px" /></td>
        <td><input class="editable inline-num" data-field="returned" type="number" min="0" value="${l.returned}" ${disabled} style="width:60px" /></td>
        <td class="bal-filled ${filledBal > 0 ? 'text-accent' : ''}"><strong>${filledBal}</strong></td>
        <td><input class="editable inline-num" data-field="emptyCollected" type="number" min="0" value="${l.emptyCollected}" ${disabled} style="width:65px" /></td>
        <td><input class="editable inline-num" data-field="defectCollected" type="number" min="0" value="${l.defectCollected}" ${disabled} style="width:65px" /></td>
        <td class="bal-empty ${tallyClass}"><strong>${emptyBal}</strong>${hasData ? (tallyMatch ? ' <span class="tally-icon">✓</span>' : ' <span class="tally-icon">≠</span>') : ''}</td>
        <td>${l.closed
          ? '<span class="badge badge-accepted">Closed</span>'
          : `<button class="btn-sm btn-primary saveLineBtn" data-line="${l._id}">Save</button>`
        }</td>
      </tr>`;
    }).join('');

    const t = g.total;
    const totalFilled = t.received - t.delivered - t.nc - t.returned;
    const totalEmpty = t.emptyBalance; // received - (emptyCollected+defectCollected) - nc - returned
    const totalTallyMatch = totalFilled === totalEmpty;
    const tallyBadge = (t.received > 0)
      ? (totalTallyMatch
          ? '<span class="tally-badge tally-badge-ok">✓ Balanced</span>'
          : `<span class="tally-badge tally-badge-warn">⚠ Gap: ${totalFilled - totalEmpty > 0 ? '+' : ''}${totalFilled - totalEmpty} (Filled ${totalFilled} vs Empty ${totalEmpty})</span>`)
      : '';

    return `
      <div style="margin-bottom:20px">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
          <strong style="font-size:14px">${g.cylinderType.name}</strong>
          ${tallyBadge}
        </div>
        <div class="table-wrap">
          <table class="datatable myDay-table">
            <thead>
              <tr class="myDay-group-hdr">
                <th rowspan="2">Source</th>
                <th rowspan="2">Received</th>
                <th colspan="3" class="grp-deliv">📦 Delivered</th>
                <th rowspan="2" class="grp-bal">Filled<br>Bal.</th>
                <th colspan="2" class="grp-emp">↩ Empties</th>
                <th rowspan="2" class="grp-bal">Empty<br>Bal.</th>
                <th rowspan="2"></th>
              </tr>
              <tr class="myDay-sub-hdr">
                <th class="grp-deliv">Dlvrd</th>
                <th class="grp-deliv">NC</th>
                <th class="grp-deliv">Returned</th>
                <th class="grp-emp">Empty</th>
                <th class="grp-emp">Defect</th>
              </tr>
            </thead>
            <tbody>
              ${lineRows}
              <tr class="row-total">
                <td>TOTAL</td><td>${t.received}</td>
                <td>${t.delivered}</td><td>${t.nc}</td><td>${t.returned}</td>
                <td class="bal-filled ${totalTallyMatch ? 'tally-ok' : (t.received > 0 ? 'tally-warn' : '')}"><strong>${totalFilled}</strong></td>
                <td>${t.emptyCollected}</td><td>${t.defectCollected}</td>
                <td class="bal-empty ${totalTallyMatch ? 'tally-ok' : (t.received > 0 ? 'tally-warn' : '')}"><strong>${totalEmpty}</strong></td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>`;
  }

  function bindSaveButtons() {
    $$('.saveLineBtn').forEach(btn =>
      btn.addEventListener('click', async () => {
        const row = document.querySelector(`tr[data-line="${btn.dataset.line}"]`);
        const body = {};
        $$('.editable', row).forEach(inp => { body[inp.dataset.field] = Number(inp.value); });
        btn.textContent = 'Saving…';
        try {
          await api(`/daily-lines/${btn.dataset.line}`, { method: 'PATCH', body });
          showToast('✅ Line saved');
          loadMyDay();
        } catch (err) {
          showToast('❌ ' + err.message, 'error');
          btn.textContent = 'Save';
        }
      })
    );
  }
}

// ────────────────────────────────── VAN OVERVIEW TAB (read-only)
// Van doesn't fill in delivered/NC/empty/defect details itself — per the Excel
// (Van sheet: "Delivered" is pulled automatically from the Van Distribution
// total, and the Emty/Defect columns are left blank for Van). All of that detail
// lives on each delivery guy's own report instead. This tab just shows Van what
// it received from the Godown and what it has handed out to each guy today.
async function renderVanOverviewTab() {
  const content = $('#tabContent');
  content.innerHTML = `
    <div class="panel">
      <div class="panel-header">
        <div class="panel-title">🗂️ Van Overview</div>
        <input type="date" id="vanOvDate" value="${todayStr()}" style="padding:6px 10px;border:1px solid var(--border);border-radius:7px;font-size:13px" />
      </div>
      <div class="panel-desc">Read-only. Stock you've issued to each delivery guy is tracked on their own report — not here.</div>
      <div id="vanOvContent">Loading…</div>
    </div>`;
  $('#vanOvDate').addEventListener('change', load);
  await load();

  async function load() {
    const date = $('#vanOvDate').value;
    const el = $('#vanOvContent');
    const [receivedGroups, distRows] = await Promise.all([
      api(`/daily-lines?date=${date}`),
      api(`/reports/van-distribution?date=${date}`),
    ]);
    if (!el) return;

    if (!receivedGroups.length && !distRows.rows.length) {
      el.innerHTML = '<div class="empty-state"><div class="empty-icon">📭</div><p>Nothing for this day yet.</p></div>';
      return;
    }

    const receivedRows = receivedGroups.map(g => `<tr>
      <td><strong>${g.cylinderType.name}</strong></td>
      <td>${g.total.received}</td>
    </tr>`).join('');

    const byType = {};
    distRows.rows.forEach(r => {
      const key = r.cylinderType._id;
      if (!byType[key]) byType[key] = { cylinderType: r.cylinderType, rows: [], total: 0 };
      byType[key].rows.push(r);
      byType[key].total += r.filled;
    });
    const distHtml = Object.values(byType).map(g => `
      <div style="margin-bottom:12px">
        <div style="font-size:12px;font-weight:600;color:var(--muted);margin-bottom:4px">${g.cylinderType.name} — issued ${g.total}</div>
        <div class="table-wrap"><table class="datatable">
          <thead><tr><th>Delivery Guy</th><th>Filled Given</th><th>Accepted At</th></tr></thead>
          <tbody>${g.rows.map(r => `<tr><td>${r.deliveryGuy?.name || '—'}</td><td>${r.filled}</td><td style="font-size:11px;color:var(--muted)">${fmtTime(r.acceptedAt)}</td></tr>`).join('')}</tbody>
        </table></div>
      </div>`).join('') || '<p class="empty-state">Nothing issued to any delivery guy yet today.</p>';

    el.innerHTML = `
      <div style="margin-bottom:16px">
        <div style="font-size:12px;font-weight:600;color:var(--muted);margin-bottom:4px">Received by Van (from Godown)</div>
        <div class="table-wrap"><table class="datatable">
          <thead><tr><th>Cylinder Type</th><th>Received</th></tr></thead>
          <tbody>${receivedRows || '<tr><td colspan=2>Nothing received yet.</td></tr>'}</tbody>
        </table></div>
      </div>
      <div>
        <div style="font-size:12px;font-weight:600;color:var(--muted);margin-bottom:4px">Issued to Delivery Guys</div>
        ${distHtml}
      </div>`;
  }
}

// ────────────────────────────────── REPORTS TAB
function renderReportsTab() {
  const content = $('#tabContent');
  const isAdminOrSup = ['owner', 'supervisor'].includes(state.user.role);
  content.innerHTML = `
    <div class="panel">
      <div class="panel-header">
        <div class="panel-title">📋 Reports</div>
        <div class="toolbar">
          <input type="date" id="reportDate" value="${todayStr()}" style="padding:6px 10px;border:1px solid var(--border);border-radius:7px;font-size:13px" />
          <select id="reportPicker" style="padding:6px 10px;border:1px solid var(--border);border-radius:7px;font-size:13px">
            <option value="consolidated">Consolidated Report</option>
            <option value="overall-delivery">Overall Delivery Report</option>
            <option value="van-distribution">Van Stock Distribution</option>
            ${isAdminOrSup ? '<option value="delivery-boys">Delivery Boy Reports</option>' : ''}
            ${isAdminOrSup ? '<option value="reconciliation">Reconciliation</option>' : ''}
          </select>
          <button id="loadReportBtn" class="btn-primary">Load Report</button>
        </div>
      </div>
      <div id="reportOutput"><p class="empty-state">Select a report and click Load.</p></div>
    </div>`;

  $('#loadReportBtn').addEventListener('click', loadReport);
  loadReport();

  async function loadReport() {
    const date = $('#reportDate').value;
    const kind = $('#reportPicker').value;
    const out = $('#reportOutput');
    out.innerHTML = '<p style="color:var(--muted)">Loading report…</p>';
    try {
      if (kind === 'delivery-boys') {
        await renderDeliveryBoysReport(date, out);
        return;
      }
      const data = await api(`/reports/${kind}?date=${date}`);
      out.innerHTML = renderReport(kind, data, date);
    } catch (err) {
      out.innerHTML = `<div class="msg-error">${err.message}</div>`;
    }
  }
}

async function renderDeliveryBoysReport(date, container) {
  // Fetch each delivery guy's daily lines
  const deliveryGuys = state.users.filter(u => u.role === 'delivery' || u.role === 'van');
  if (!deliveryGuys.length) {
    container.innerHTML = '<div class="empty-state"><p>No delivery guys found.</p></div>';
    return;
  }

  container.innerHTML = '<p style="color:var(--muted)">Loading delivery reports…</p>';
  const results = await Promise.allSettled(
    deliveryGuys.map(u => api(`/daily-lines?guy=${u._id}&date=${date}`).then(r => ({ user: u, groups: r })))
  );

  let html = `<div class="report-header-band"><h4>Delivery Boy Reports</h4><span class="report-date-chip">${fmtDate(date)}</span></div>`;

  results.forEach(r => {
    if (r.status === 'rejected') return;
    const { user, groups } = r.value;
    if (!groups.length) return;

    html += `<div style="margin:16px 0"><div style="font-weight:700;font-size:13px;color:var(--ink);padding:8px 0;border-bottom:2px solid var(--border);margin-bottom:8px">👤 ${user.name} <span style="font-size:11px;color:var(--muted)">(${user.role})</span></div>`;
    groups.forEach(g => {
      const t = g.total;
      const rows = g.lines.map(l => {
        const fb = l.received - l.delivered - l.nc - l.returned;
        // Same Emty Balance formula as the Excel Template sheet (see My Day tab).
        const eb = l.received - (l.emptyCollected + l.defectCollected) - l.nc - l.returned;
        return `<tr>
          <td><span class="badge-source">${l.source}</span></td>
          <td>${l.received}</td><td>${l.delivered}</td><td>${l.nc}</td>
          <td>${l.returned}</td><td><strong>${fb}</strong></td>
          <td>${l.emptyCollected}</td><td>${l.defectCollected}</td>
          <td>${eb}</td>
          <td>${l.closed ? '<span class="badge badge-accepted">Closed</span>' : '<span class="badge badge-pending">Open</span>'}</td>
        </tr>`;
      }).join('');
      const totalFilled = t.received - t.delivered - t.nc - t.returned;
      html += `<div style="margin-bottom:12px">
        <div style="font-size:12px;font-weight:600;color:var(--muted);margin-bottom:4px">${g.cylinderType.name}</div>
        <div class="table-wrap">
          <table class="datatable">
            <thead>
              <tr class="rpt-group-row">
                <th class="rpt-grp-type" rowspan="2">Source</th>
                <th class="rpt-grp-load" rowspan="2">Received</th>
                <th class="rpt-grp-move" colspan="3">📦 Delivery</th>
                <th class="rpt-grp-total" rowspan="2">Filled<br>Bal</th>
                <th class="rpt-grp-ret" colspan="3">↩ Empties</th>
                <th class="rpt-grp-close" rowspan="2">Status</th>
              </tr>
              <tr class="rpt-sub-row">
                <th class="rpt-grp-move">Dlvrd</th>
                <th class="rpt-grp-move">NC</th>
                <th class="rpt-grp-move">Ret</th>
                <th class="rpt-grp-ret">Empty</th>
                <th class="rpt-grp-ret">Defect</th>
                <th class="rpt-grp-ret">Bal</th>
              </tr>
            </thead>
            <tbody>${rows}
              <tr class="row-total">
                <td>TOTAL</td><td>${t.received}</td><td>${t.delivered}</td><td>${t.nc}</td>
                <td>${t.returned}</td><td>${totalFilled}</td>
                <td>${t.emptyCollected}</td><td>${t.defectCollected}</td>
                <td>${t.emptyBalance}</td><td></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>`;
    });
    html += '</div>';
  });

  if (html.indexOf('<table') === -1) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">📭</div><p>No delivery activity for this date.</p></div>';
    return;
  }
  container.innerHTML = html;
}

function renderReport(kind, data, date) {
  const headerBand = (title) =>
    `<div class="report-header-band"><h4>${title}</h4><span class="report-date-chip">${fmtDate(date)}</span></div>`;

  if (kind === 'consolidated') {
    const rows = data.rows.map(r => `<tr>
      <td><strong>${r.cylinderType.name}</strong></td>
      <td>${r.openingStock.filled}</td><td>${r.openingStock.empty}</td><td>${r.openingStock.defect}</td>
      <td>${r.loadReceived}</td>
      <td><strong>${r.totalStock}</strong></td>
      <td>${r.delivery}</td>
      <td>${r.surrenderEntry}</td>
      <td class="rpt-live">${r.emptyCollectedInField}</td><td class="rpt-live">${r.defectCollectedInField}</td>
      <td>${r.emptiesGivenToLorry.empty}</td><td>${r.emptiesGivenToLorry.defect}</td>
      <td style="color:var(--accent)"><strong>${r.closingStock.filled}</strong></td>
      <td>${r.closingStock.empty}</td><td>${r.closingStock.defect}</td>
    </tr>`).join('');
    return headerBand('Consolidated Report') + `
    <div class="report-table-wrap"><table class="datatable rpt-consolidated">
      <thead>
        <tr class="rpt-group-row">
          <th class="rpt-grp-type" rowspan="2">Cylinder<br>Type</th>
          <th class="rpt-grp-open" colspan="3">📦 Opening Stock</th>
          <th class="rpt-grp-load" rowspan="2">🚛 Load<br>Recv</th>
          <th class="rpt-grp-total" rowspan="2">📊 Total<br>Stock</th>
          <th class="rpt-grp-move" colspan="2">🔄 Issued</th>
          <th class="rpt-grp-live" colspan="2">📲 Empties (Field, Live)</th>
          <th class="rpt-grp-lorry" colspan="2">🚚 Empties to Lorry</th>
          <th class="rpt-grp-close" colspan="3">🏁 Closing Stock</th>
        </tr>
        <tr class="rpt-sub-row">
          <th class="rpt-grp-open">F</th><th class="rpt-grp-open">E</th><th class="rpt-grp-open">D</th>
          <th class="rpt-grp-move">Delivery</th><th class="rpt-grp-move">Surrender</th>
          <th class="rpt-grp-live">Empty</th><th class="rpt-grp-live">Defect</th>
          <th class="rpt-grp-lorry">Empty</th><th class="rpt-grp-lorry">Defect</th>
          <th class="rpt-grp-close">F</th><th class="rpt-grp-close">E</th><th class="rpt-grp-close">D</th>
        </tr>
      </thead>
      <tbody>${rows || '<tr><td colspan=15>No data</td></tr>'}</tbody>
    </table></div>`;
  }

  if (kind === 'overall-delivery') {
    const rows = data.rows.map(r => `<tr>
      <td><strong>${r.cylinderType.name}</strong></td>
      <td>${r.delivered}</td><td>${r.nc}</td><td>${r.returned}</td>
      <td>${r.emptyCollected}</td><td>${r.defectCollected}</td>
      <td><strong>${r.delivered + r.nc + r.returned}</strong></td>
    </tr>`).join('');
    return headerBand('Overall Delivery & Return Report') + `
    <div class="report-table-wrap"><table class="datatable">
      <thead>
        <tr class="rpt-group-row">
          <th class="rpt-grp-type" rowspan="2">Cylinder Type</th>
          <th class="rpt-grp-move" colspan="3">📦 Delivery Activity</th>
          <th class="rpt-grp-ret" colspan="2">↩ Collected</th>
          <th class="rpt-grp-total" rowspan="2">📊 Total<br>Issued</th>
        </tr>
        <tr class="rpt-sub-row">
          <th class="rpt-grp-move">Delivered</th>
          <th class="rpt-grp-move">NC (Not Coll.)</th>
          <th class="rpt-grp-move">Returned</th>
          <th class="rpt-grp-ret">Empty Coll.</th>
          <th class="rpt-grp-ret">Defect Coll.</th>
        </tr>
      </thead>
      <tbody>${rows || '<tr><td colspan=7>No delivery activity for this date.</td></tr>'}</tbody>
    </table></div>`;
  }

  if (kind === 'van-distribution') {
    const rows = data.rows.map(r => `<tr>
      <td>${r.deliveryGuy?.name || '—'}</td>
      <td>${r.cylinderType.name}</td>
      <td><strong>${r.filled}</strong></td>
      <td style="font-size:11px;color:var(--muted)">${fmtTime(r.acceptedAt)}</td>
    </tr>`).join('');
    return headerBand('Van Stock Distribution') + `
    <div class="report-table-wrap"><table class="datatable">
      <thead><tr><th>Delivery Guy</th><th>Cylinder Type</th><th>Filled Given</th><th>Accepted At</th></tr></thead>
      <tbody>${rows || '<tr><td colspan=4>No van distributions today.</td></tr>'}</tbody>
    </table></div>`;
  }

  if (kind === 'reconciliation') {
    if (!data.mismatches.length) {
      return headerBand('Reconciliation') + `<div style="padding:20px;background:#f0fdf4;border-radius:8px;text-align:center;color:var(--green);font-weight:600">🎉 No mismatches found! All accounts balanced.</div>`;
    }
    const rows = data.mismatches.map(r => `<tr>
      <td>${r.guy.name}</td><td>${r.cylinderType.name}</td>
      <td>${r.delivered}</td><td>${r.emptyPlusDefect}</td>
      <td style="color:var(--red);font-weight:700">${r.gap}</td>
    </tr>`).join('');
    return headerBand('Reconciliation / Mismatches') + `
    <div class="report-table-wrap"><table class="datatable">
      <thead><tr><th>Delivery Guy</th><th>Type</th><th>Delivered</th><th>Empty+Defect Collected</th><th>Gap</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;
  }
  return '<p>Unknown report type.</p>';
}

// ────────────────────────────────── USERS TAB
function renderUsersTab() {
  const content = $('#tabContent');
  content.innerHTML = `
    <div class="panel">
      <div class="panel-title">➕ Add User</div>
      <div class="form-row">
        <label class="field-label">Name <input id="uName" required /></label>
        <label class="field-label">Username <input id="uUsername" required /></label>
        <label class="field-label">Role <select id="uRole">
          <option value="delivery">Delivery Guy</option>
          <option value="van">Van</option>
          <option value="supervisor">Supervisor</option>
          <option value="owner">Owner</option>
        </select></label>
        <label class="field-label">Phone <input id="uPhone" /></label>
        <label class="field-label">&nbsp;
          <button type="button" id="createUserBtn" class="btn-primary">Create</button>
        </label>
      </div>
      <div id="userMsg"></div>
    </div>
    <div class="panel">
      <div class="panel-title">👥 All Users</div>
      <div id="userList">Loading…</div>
    </div>`;

  $('#createUserBtn').addEventListener('click', async () => {
    try {
      await api('/users', {
        method: 'POST',
        body: {
          name: $('#uName').value,
          username: $('#uUsername').value,
          role: $('#uRole').value,
          phone: $('#uPhone').value,
        },
      });
      showToast('✅ User created (password: pass)');
      $('#userMsg').innerHTML = '<div class="msg-success">Created. Default password is "pass".</div>';
      loadUsers();
    } catch (err) {
      $('#userMsg').innerHTML = `<div class="msg-error">${err.message}</div>`;
    }
  });

  async function loadUsers() {
    const list = await api('/users');
    state.users = list;
    const roleColors = { owner: '#7c3aed', supervisor: '#0e7490', van: '#9d174d', delivery: '#166534' };
    const rows = list.map(u => `<tr>
      <td><strong>${u.name}</strong></td>
      <td style="color:var(--muted)">${u.username}</td>
      <td><span class="badge" style="background:${roleColors[u.role]}22;color:${roleColors[u.role]}">${u.role}</span></td>
      <td>${u.phone || '—'}</td>
      <td>${u.mustChangePassword ? '<span class="badge badge-pending">Yes</span>' : '<span style="color:var(--muted)">No</span>'}</td>
      <td><button class="btn-sm btn-secondary resetBtn" data-id="${u._id}">Reset Password</button></td>
    </tr>`).join('');
    $('#userList').innerHTML = `<div class="table-wrap"><table class="datatable">
      <thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Phone</th><th>Must Change PW?</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;
    $$('.resetBtn').forEach(btn =>
      btn.addEventListener('click', async () => {
        if (!confirm('Reset password to "pass"?')) return;
        await api(`/users/${btn.dataset.id}/reset-password`, { method: 'POST' });
        showToast('🔑 Password reset to "pass"');
        loadUsers();
      })
    );
  }
  loadUsers();
}

// ────────────────────────────────── Boot
(async function boot() {
  if (state.token) {
    try {
      state.user = await api('/auth/me');
      await afterLogin();
      return;
    } catch {
      localStorage.removeItem('bhavani_token');
    }
  }
  showLogin();
})();
