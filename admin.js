/* ============================================================
   FoodRush — admin.js  (Admin Panel)
   Full CRUD: foods, orders (with live status update), categories
   Backend: JSON Server @ http://localhost:3000
   ============================================================ */

const API = 'http://localhost:3000';

/* ----------------------------------------------------------
   STATE
   ---------------------------------------------------------- */
let allAdminFoods = [];      // Loaded from GET /foods
let allOrders     = [];      // Loaded from GET /orders
let pendingDeleteFn = null;  // Stored callback for confirm-modal
let deleteModal     = null;  // Bootstrap Modal instance

/* ============================================================
   DARK MODE
   ============================================================ */
function initAdminDarkMode() {
  const saved = localStorage.getItem('foodrush_theme') || 'light';
  document.documentElement.setAttribute('data-theme', saved);
  updateAdminDarkIcon(saved);
}

function toggleAdminDarkMode() {
  const cur  = document.documentElement.getAttribute('data-theme');
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('foodrush_theme', next);
  updateAdminDarkIcon(next);
}

function updateAdminDarkIcon(theme) {
  const icon = document.getElementById('adminDarkIcon');
  if (icon) icon.className = theme === 'dark' ? 'bi bi-sun-fill' : 'bi bi-moon-fill';
}

/* ============================================================
   SECTION NAVIGATION
   FIX Bug 1+3: signature is now (name, btnEl) — no event param.
   Sidebar items are <button> not <a href="#">, so no anchor
   jump and no preventDefault() is needed at all.
   ============================================================ */
function showSection(name, btnEl) {
  // Hide every section
  document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
  // Deactivate every sidebar button
  document.querySelectorAll('.sidebar-nav button').forEach(b => b.classList.remove('active'));

  // Show the target section
  const sec = document.getElementById(`section-${name}`);
  if (sec) sec.classList.add('active');
  // Activate the clicked button (if passed)
  if (btnEl) btnEl.classList.add('active');

  // Update topbar title
  const titles = {
    dashboard:  '<i class="bi bi-speedometer2 me-2"></i>Dashboard',
    foods:      '<i class="bi bi-egg-fried me-2"></i>Food Items',
    orders:     '<i class="bi bi-bag-check me-2"></i>Orders',
    categories: '<i class="bi bi-tags me-2"></i>Categories'
  };
  const titleEl = document.getElementById('pageTitle');
  if (titleEl) titleEl.innerHTML = titles[name] || name;

  // Load data for the section
  if (name === 'dashboard')  loadDashboard();
  if (name === 'foods')      loadAdminFoods();
  if (name === 'orders')     loadAllOrders();
  if (name === 'categories') loadCategories();
}

/* Mobile sidebar toggle */
function toggleMobileSidebar() {
  const sb = document.getElementById('adminSidebar');
  if (sb) sb.classList.toggle('mobile-open');
}

/* ============================================================
   SAFE HELPER — sets textContent only if element exists
   ============================================================ */
function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

/* ============================================================
   DASHBOARD — GET /foods + GET /orders in parallel
   ============================================================ */
async function loadDashboard() {
  try {
    const [foodsRes, ordersRes] = await Promise.all([
      fetch(`${API}/foods`),
      fetch(`${API}/orders`)
    ]);
    if (!foodsRes.ok || !ordersRes.ok) throw new Error('Server returned an error');

    const foods  = await foodsRes.json();
    const orders = await ordersRes.json();

    // Stat 1 — total food items
    setText('statTotalFoods', foods.length);

    // Stat 2 — total orders
    setText('statTotalOrders', orders.length);

    // Stat 3 — total revenue
    const revenue = orders.reduce((s, o) => s + (o.totalAmount || 0), 0);
    setText('statRevenue', `Rs. ${revenue.toLocaleString()}`);

    // Stat 4 — most ordered food item (by quantity across all orders)
    const itemCount = {};
    orders.forEach(order => {
      (order.items || []).forEach(item => {
        itemCount[item.name] = (itemCount[item.name] || 0) + item.quantity;
      });
    });
    const topEntry = Object.entries(itemCount).sort((a, b) => b[1] - a[1])[0];
    setText('statTopFood', topEntry ? `${topEntry[0]} (×${topEntry[1]})` : 'N/A');

    // Recent orders — last 5, newest first
    // FIX Bug 6: spread before reverse to avoid mutating allOrders
    renderRecentOrders([...orders].reverse().slice(0, 5));

  } catch (err) {
    setText('statTotalFoods', 'Error');
    setText('statTotalOrders', 'Error');
    setText('statRevenue', '—');
    showAdminAlert(
      'Could not load dashboard data. Is JSON Server running on port 3000?',
      'danger'
    );
  }
}

/* ============================================================
   RENDER RECENT ORDERS (dashboard widget — read-only view)
   ============================================================ */
function renderRecentOrders(orders) {
  const tbody = document.getElementById('recentOrdersBody');
  if (!tbody) return;

  if (orders.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="text-center py-4 text-muted">No orders yet.</td></tr>';
    return;
  }

  tbody.innerHTML = orders.map(order => {
    const items       = (order.items || []).map(i => `${i.name} ×${i.quantity}`).join(', ');
    const date        = new Date(order.orderDate).toLocaleDateString('en-PK');
    const statusClass = (order.status || 'Processing').replace(/\s+/g, '-');
    return `
      <tr>
        <td>#${order.id}</td>
        <td><strong>${order.customerName}</strong></td>
        <td>${order.city}</td>
        <td class="text-truncate" style="max-width:160px;" title="${items}">${items}</td>
        <td><strong>Rs. ${(order.totalAmount || 0).toLocaleString()}</strong></td>
        <td>${order.paymentMethod}</td>
        <td><span class="order-status-badge status-${statusClass}">${order.status}</span></td>
        <td>${date}</td>
      </tr>`;
  }).join('');
}

/* ============================================================
   FOOD ITEMS — GET /foods
   ============================================================ */
async function loadAdminFoods() {
  const tbody = document.getElementById('adminFoodsBody');
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="8" class="text-center py-4">
    <span class="spinner-border spinner-border-sm"></span> Loading…</td></tr>`;

  try {
    const res = await fetch(`${API}/foods`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    allAdminFoods = await res.json();
    renderAdminFoodsTable(allAdminFoods);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="8" class="text-center py-4 text-danger">
      <i class="bi bi-exclamation-circle me-2"></i>
      Failed to load foods. Check JSON Server.</td></tr>`;
  }
}

function renderAdminFoodsTable(foods) {
  const tbody = document.getElementById('adminFoodsBody');
  if (!tbody) return;

  if (foods.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="text-center py-4 text-muted">No food items found.</td></tr>';
    return;
  }

  tbody.innerHTML = foods.map(food => {
    const badge = food.available
      ? '<span class="badge-available">Available</span>'
      : '<span class="badge-unavailable">Unavailable</span>';

    // Properly escape name for inline onclick attribute
    const safeName = (food.name || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");

    return `
      <tr>
        <td>
          <img src="${food.image || ''}" alt="${food.name}" class="food-thumb"
               onerror="this.src='https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=80&h=80&fit=crop'" />
        </td>
        <td><strong>${food.name}</strong><br>
            <small class="text-muted">${food.description || ''}</small></td>
        <td>${food.category}</td>
        <td>${food.restaurant || '—'}</td>
        <td>Rs. ${(food.price || 0).toLocaleString()}</td>
        <td>⭐ ${food.rating}</td>
        <td>${badge}</td>
        <td>
          <button class="btn-icon edit me-1" onclick="loadFoodForEdit(${food.id})" title="Edit">
            <i class="bi bi-pencil-fill"></i>
          </button>
          <button class="btn-icon delete" onclick="confirmDeleteFood(${food.id}, '${safeName}')" title="Delete">
            <i class="bi bi-trash3-fill"></i>
          </button>
        </td>
      </tr>`;
  }).join('');
}

/* Live search within loaded foods (no extra fetch needed) */
function filterAdminFoods() {
  const q = (document.getElementById('adminFoodSearch').value || '').toLowerCase();
  const filtered = allAdminFoods.filter(f =>
    f.name.toLowerCase().includes(q) ||
    f.category.toLowerCase().includes(q) ||
    (f.restaurant || '').toLowerCase().includes(q)
  );
  renderAdminFoodsTable(filtered);
}

/* ============================================================
   FOOD FORM — Add (POST) / Edit (PATCH)
   ============================================================ */
function openAddFoodForm() {
  resetFoodForm();
  document.getElementById('foodFormTitle').innerHTML =
    '<i class="bi bi-plus-circle me-2"></i>Add New Food';
  document.getElementById('foodFormSubmitBtn').innerHTML =
    '<i class="bi bi-check-lg"></i> Add Food';
}

function loadFoodForEdit(foodId) {
  // FIX: Number() on both sides prevents strict-equality type mismatch
  const food = allAdminFoods.find(f => Number(f.id) === Number(foodId));
  if (!food) { showAdminAlert('Food item not found.', 'warning'); return; }

  document.getElementById('editFoodId').value    = food.id;
  document.getElementById('fName').value         = food.name;
  document.getElementById('fCategory').value     = food.category;
  document.getElementById('fRestaurant').value   = food.restaurant || '';
  document.getElementById('fPrice').value        = food.price;
  document.getElementById('fRating').value       = food.rating;
  document.getElementById('fImage').value        = food.image || '';
  document.getElementById('fDescription').value  = food.description || ''; // FIX Bug 2
  document.getElementById('fAvailable').value    = food.available ? 'true' : 'false';

  document.getElementById('foodFormTitle').innerHTML =
    '<i class="bi bi-pencil-fill me-2"></i>Edit Food Item';
  document.getElementById('foodFormSubmitBtn').innerHTML =
    '<i class="bi bi-check-lg"></i> Update Food';

  document.getElementById('foodFormPanel').scrollIntoView({ behavior: 'smooth' });
}

/* Inline validation — no alert() */
function validateFoodForm() {
  let valid = true;

  function check(fieldId, errorId, fail) {
    const f = document.getElementById(fieldId);
    const e = document.getElementById(errorId);
    if (!f || !e) return;
    if (fail) {
      f.classList.add('is-invalid');
      e.style.display = 'block';
      valid = false;
    } else {
      f.classList.remove('is-invalid');
      e.style.display = 'none';
    }
  }

  check('fName',      'fNameErr',     !document.getElementById('fName').value.trim());
  check('fCategory',  'fCategoryErr', !document.getElementById('fCategory').value);
  check('fRestaurant','fRestaurantErr',!document.getElementById('fRestaurant').value.trim());

  const price  = parseFloat(document.getElementById('fPrice').value);
  check('fPrice', 'fPriceErr', isNaN(price) || price <= 0);

  const rating = parseFloat(document.getElementById('fRating').value);
  check('fRating', 'fRatingErr', isNaN(rating) || rating < 1 || rating > 5);

  return valid;
}

async function submitFoodForm(e) {
  e.preventDefault();
  if (!validateFoodForm()) return;

  const editId    = document.getElementById('editFoodId').value;
  const isEditing = !!editId;
  const btn       = document.getElementById('foodFormSubmitBtn');
  const msgEl     = document.getElementById('foodFormMsg');

  btn.disabled  = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Saving…';
  msgEl.textContent = '';

  const payload = {
    name:        document.getElementById('fName').value.trim(),
    category:    document.getElementById('fCategory').value,
    restaurant:  document.getElementById('fRestaurant').value.trim(),
    price:       parseFloat(document.getElementById('fPrice').value),
    rating:      parseFloat(document.getElementById('fRating').value),
    image:       document.getElementById('fImage').value.trim() ||
                 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&h=300&fit=crop',
    description: document.getElementById('fDescription').value.trim(), // FIX Bug 2
    available:   document.getElementById('fAvailable').value === 'true'
  };

  try {
    const url    = isEditing ? `${API}/foods/${editId}` : `${API}/foods`;
    const method = isEditing ? 'PATCH' : 'POST';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    msgEl.innerHTML = `<span class="text-success">
      <i class="bi bi-check-circle me-1"></i>
      ${isEditing ? 'Updated' : 'Added'} successfully!
    </span>`;
    resetFoodForm();
    loadAdminFoods(); // Refresh table

  } catch (err) {
    msgEl.innerHTML = `<span class="text-danger">
      <i class="bi bi-x-circle me-1"></i>Failed: ${err.message}
    </span>`;
  } finally {
    btn.disabled  = false;
    btn.innerHTML = '<i class="bi bi-check-lg"></i> Save Food';
  }
}

function resetFoodForm() {
  document.getElementById('foodForm').reset();
  document.getElementById('editFoodId').value = '';
  document.querySelectorAll('#foodForm .form-control, #foodForm .form-select, #foodForm textarea')
    .forEach(f => f.classList.remove('is-invalid', 'is-valid'));
  document.querySelectorAll('#foodForm .invalid-feedback')
    .forEach(e => e.style.display = 'none');
  document.getElementById('foodFormMsg').textContent = '';
  document.getElementById('foodFormTitle').innerHTML =
    '<i class="bi bi-plus-circle me-2"></i>Add New Food';
  document.getElementById('foodFormSubmitBtn').innerHTML =
    '<i class="bi bi-check-lg"></i> Save Food';
}

/* ============================================================
   DELETE FOOD — DELETE /foods/:id
   ============================================================ */
function confirmDeleteFood(foodId, foodName) {
  document.getElementById('deleteModalMessage').textContent =
    `Are you sure you want to delete "${foodName}"? This cannot be undone.`;
  pendingDeleteFn = () => deleteFood(foodId);
  deleteModal.show();
}

async function deleteFood(foodId) {
  try {
    const res = await fetch(`${API}/foods/${foodId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    deleteModal.hide();
    loadAdminFoods();
    showAdminAlert('Food item deleted.', 'success');
  } catch (err) {
    showAdminAlert('Failed to delete food item.', 'danger');
  }
}

/* ============================================================
   ORDERS — GET /orders
   ============================================================ */
async function loadAllOrders() {
  const tbody = document.getElementById('allOrdersBody');
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="10" class="text-center py-4">
    <span class="spinner-border spinner-border-sm"></span> Loading…</td></tr>`;

  try {
    const res = await fetch(`${API}/orders`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    allOrders = await res.json();

    const countEl = document.getElementById('ordersCount');
    if (countEl) countEl.textContent = `${allOrders.length} orders`;

    // FIX Bug 6: spread before reverse — never mutate allOrders in place
    renderAllOrders([...allOrders].reverse());

  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="10" class="text-center py-4 text-danger">
      Failed to load orders. Check JSON Server.</td></tr>`;
  }
}

function renderAllOrders(orders) {
  const tbody = document.getElementById('allOrdersBody');
  if (!tbody) return;

  if (orders.length === 0) {
    tbody.innerHTML = '<tr><td colspan="10" class="text-center py-4 text-muted">No orders found.</td></tr>';
    return;
  }

  const statuses = ['Processing', 'On the Way', 'Delivered', 'Cancelled'];

  tbody.innerHTML = orders.map(order => {
    const items       = (order.items || []).map(i => `${i.name} ×${i.quantity}`).join(', ');
    const date        = new Date(order.orderDate).toLocaleDateString('en-PK');

    // Build status dropdown — pre-selected to current status
    const opts = statuses.map(s =>
      `<option value="${s}" ${order.status === s ? 'selected' : ''}>${s}</option>`
    ).join('');

    return `
      <tr>
        <td>#${order.id}</td>
        <td>
          <strong>${order.customerName}</strong><br>
          <small class="text-muted">${order.email}</small>
        </td>
        <td>${order.phone}</td>
        <td>${order.city}</td>
        <td class="text-truncate" style="max-width:140px;" title="${items}">
          <small>${items}</small>
        </td>
        <td><strong>Rs. ${(order.totalAmount || 0).toLocaleString()}</strong></td>
        <td><small>${order.paymentMethod}</small></td>
        <td>
          <!-- Live status dropdown — PATCH /orders/:id on change -->
          <select class="form-select form-select-sm order-status-select"
                  data-order-id="${order.id}"
                  style="min-width:130px;font-size:0.78rem;font-weight:600;
                         border-radius:50px;padding:3px 10px;">
            ${opts}
          </select>
        </td>
        <td><small>${date}</small></td>
        <td>
          <button class="btn-icon delete"
                  onclick="confirmDeleteOrder(${order.id})" title="Delete">
            <i class="bi bi-trash3-fill"></i>
          </button>
        </td>
      </tr>`;
  }).join('');

  // Colour all selects after they're in the DOM
  // FIX Bug 9: attach listeners once here, not inside colourStatusSelects
  document.querySelectorAll('.order-status-select').forEach(sel => {
    applyStatusColour(sel, sel.value);
    sel.addEventListener('change', function () {
      const orderId = this.dataset.orderId;
      updateOrderStatus(orderId, this.value, this);
    });
  });
}

/* Colour-code a status select element */
function applyStatusColour(el, status) {
  const map = {
    'Processing':  { bg: '#fff3cd', color: '#856404' },
    'On the Way':  { bg: '#cce5ff', color: '#004085' },
    'Delivered':   { bg: '#d4edda', color: '#155724' },
    'Cancelled':   { bg: '#f8d7da', color: '#721c24' }
  };
  const c = map[status] || { bg: '#e9ecef', color: '#495057' };
  el.style.background  = c.bg;
  el.style.color       = c.color;
  el.style.borderColor = c.bg;
}

/* ============================================================
   UPDATE ORDER STATUS — PATCH /orders/:id
   Called immediately when admin changes dropdown
   ============================================================ */
async function updateOrderStatus(orderId, newStatus, selectEl) {
  try {
    const res = await fetch(`${API}/orders/${orderId}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ status: newStatus })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    // Update local state so dashboard stats stay accurate
    const order = allOrders.find(o => Number(o.id) === Number(orderId));
    if (order) order.status = newStatus;

    applyStatusColour(selectEl, newStatus);
    showAdminAlert(`Order #${orderId} → "${newStatus}"`, 'success');

  } catch (err) {
    showAdminAlert(`Status update failed: ${err.message}`, 'danger');
    // Revert the dropdown to last known good value
    loadAllOrders();
  }
}

/* ============================================================
   DELETE ORDER — DELETE /orders/:id
   ============================================================ */
function confirmDeleteOrder(orderId) {
  document.getElementById('deleteModalMessage').textContent =
    `Are you sure you want to delete Order #${orderId}? This cannot be undone.`;
  pendingDeleteFn = () => deleteOrder(orderId);
  deleteModal.show();
}

async function deleteOrder(orderId) {
  try {
    const res = await fetch(`${API}/orders/${orderId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    deleteModal.hide();
    loadAllOrders();
    showAdminAlert('Order deleted.', 'success');
  } catch (err) {
    showAdminAlert('Failed to delete order.', 'danger');
  }
}

/* ============================================================
   CATEGORIES — GET / POST / PATCH / DELETE
   ============================================================ */
async function loadCategories() {
  const tbody = document.getElementById('categoriesBody');
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="3" class="text-center py-3">
    <span class="spinner-border spinner-border-sm"></span></td></tr>`;
  try {
    const res = await fetch(`${API}/categories`);
    if (!res.ok) throw new Error('Failed');
    renderCategoriesTable(await res.json());
  } catch {
    tbody.innerHTML =
      '<tr><td colspan="3" class="text-center py-4 text-danger">Failed to load.</td></tr>';
  }
}

function renderCategoriesTable(cats) {
  const tbody = document.getElementById('categoriesBody');
  if (!tbody) return;
  if (cats.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" class="text-center py-4 text-muted">No categories.</td></tr>';
    return;
  }
  tbody.innerHTML = cats.map(cat => {
    const safe = (cat.name || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    return `
      <tr>
        <td>${cat.id}</td>
        <td><strong>${cat.name}</strong></td>
        <td>
          <button class="btn-icon edit me-1"
                  onclick="loadCatForEdit(${cat.id}, '${safe}')" title="Edit">
            <i class="bi bi-pencil-fill"></i>
          </button>
          <button class="btn-icon delete"
                  onclick="confirmDeleteCategory(${cat.id}, '${safe}')" title="Delete">
            <i class="bi bi-trash3-fill"></i>
          </button>
        </td>
      </tr>`;
  }).join('');
}

function loadCatForEdit(id, name) {
  document.getElementById('editCatId').value = id;
  document.getElementById('catName').value   = name;
  const titleEl = document.getElementById('catFormTitle');
  if (titleEl) titleEl.innerHTML = '<i class="bi bi-pencil-fill me-2"></i>Edit Category';
  document.getElementById('catSubmitBtn').innerHTML =
    '<i class="bi bi-check-lg"></i> Update Category';
}

async function submitCategoryForm(e) {
  e.preventDefault();
  const name  = (document.getElementById('catName').value || '').trim();
  const msgEl = document.getElementById('catFormMsg');
  const btn   = document.getElementById('catSubmitBtn');

  if (!name) {
    document.getElementById('catName').classList.add('is-invalid');
    document.getElementById('catNameErr').style.display = 'block';
    return;
  }
  document.getElementById('catName').classList.remove('is-invalid');
  document.getElementById('catNameErr').style.display = 'none';

  btn.disabled    = true;
  const editId    = document.getElementById('editCatId').value;
  const isEditing = !!editId;

  try {
    const res = await fetch(
      isEditing ? `${API}/categories/${editId}` : `${API}/categories`,
      {
        method:  isEditing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name })
      }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    msgEl.innerHTML = `<span class="text-success">
      <i class="bi bi-check-circle me-1"></i>${isEditing ? 'Updated' : 'Added'}!
    </span>`;
    resetCategoryForm();
    loadCategories();
  } catch (err) {
    msgEl.innerHTML = `<span class="text-danger">Failed: ${err.message}</span>`;
  } finally {
    btn.disabled = false;
  }
}

function resetCategoryForm() {
  document.getElementById('categoryForm').reset();
  document.getElementById('editCatId').value = '';
  document.getElementById('catName').classList.remove('is-invalid');
  const titleEl = document.getElementById('catFormTitle');
  if (titleEl) titleEl.innerHTML = '<i class="bi bi-plus-circle me-2"></i>Add Category';
  document.getElementById('catSubmitBtn').innerHTML =
    '<i class="bi bi-check-lg"></i> Save Category';
}

function confirmDeleteCategory(id, name) {
  document.getElementById('deleteModalMessage').textContent =
    `Are you sure you want to delete category "${name}"?`;
  pendingDeleteFn = () => deleteCategory(id);
  deleteModal.show();
}

async function deleteCategory(id) {
  try {
    const res = await fetch(`${API}/categories/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    deleteModal.hide();
    loadCategories();
    showAdminAlert('Category deleted.', 'success');
  } catch (err) {
    showAdminAlert('Failed to delete category.', 'danger');
  }
}

/* ============================================================
   ALERT NOTIFICATION
   ============================================================ */
function showAdminAlert(message, type = 'success') {
  const existing = document.getElementById('adminAlertBox');
  if (existing) existing.remove();

  const el = document.createElement('div');
  el.id        = 'adminAlertBox';
  el.className = `alert alert-${type} alert-dismissible fade show`;
  el.style.cssText =
    'position:fixed;top:70px;right:1.5rem;z-index:9999;' +
    'min-width:280px;max-width:400px;font-size:0.88rem;' +
    'box-shadow:0 4px 12px rgba(0,0,0,0.15);';
  el.innerHTML = `${message}
    <button type="button" class="btn-close"
            onclick="this.parentElement.remove()"></button>`;
  document.body.appendChild(el);
  setTimeout(() => { if (el.parentElement) el.remove(); }, 4000);
}

/* ============================================================
   BOOT — DOMContentLoaded
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  // Dark mode
  initAdminDarkMode();
  document.getElementById('adminDarkToggle')
    .addEventListener('click', toggleAdminDarkMode);

  // Bootstrap delete confirmation modal
  deleteModal = new bootstrap.Modal(document.getElementById('deleteModal'));

  // Confirm-delete button fires the stored callback
  document.getElementById('confirmDeleteBtn').addEventListener('click', () => {
    if (typeof pendingDeleteFn === 'function') {
      pendingDeleteFn();
      pendingDeleteFn = null;
    }
  });

  // Form submit handlers
  document.getElementById('foodForm').addEventListener('submit', submitFoodForm);
  document.getElementById('categoryForm').addEventListener('submit', submitCategoryForm);

  // Start on Dashboard
  loadDashboard();
});