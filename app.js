/* ============================================================
   FoodRush — app.js (User Panel)
   Handles: fetching foods/categories/restaurants, cart,
            checkout, restaurant filtering, dark mode
   JSON Server: http://localhost:3000
   ============================================================ */

const API = 'http://localhost:3000';

/* ----------------------------------------------------------
   STATE
   ---------------------------------------------------------- */
let allFoods      = [];   // All foods from /foods
let filteredFoods = [];   // Currently displayed subset
let cart          = [];   // [{ food, quantity }]
let selectedCategory   = 'All';
let selectedRestaurant = 'All';  // NEW: restaurant filter state
let selectedPayment    = '';
let searchDebounceTimer = null;

/* ============================================================
   DARK MODE
   ============================================================ */
function initDarkMode() {
  const saved = localStorage.getItem('foodrush_theme') || 'light';
  document.documentElement.setAttribute('data-theme', saved);
  updateDarkModeIcon(saved);
}

function toggleDarkMode() {
  const current = document.documentElement.getAttribute('data-theme');
  const next    = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('foodrush_theme', next);
  updateDarkModeIcon(next);
}

function updateDarkModeIcon(theme) {
  const icon = document.getElementById('darkModeIcon');
  if (icon) icon.className = theme === 'dark' ? 'bi bi-sun-fill' : 'bi bi-moon-fill';
}

/* ============================================================
   LOADING / ERROR STATES
   ============================================================ */
function showSkeletons(count = 8) {
  const grid = document.getElementById('foodGrid');
  grid.innerHTML = Array.from({ length: count }, () => `
    <div class="col-sm-6 col-md-4 col-lg-3">
      <div class="skeleton-card">
        <div class="skeleton skeleton-img"></div>
        <div class="skeleton-body">
          <div class="skeleton skeleton-line medium"></div>
          <div class="skeleton skeleton-line short"></div>
          <div class="skeleton skeleton-line medium"></div>
        </div>
      </div>
    </div>`).join('');
}

function showError(msg = 'Could not connect to server. Make sure JSON Server is running on port 3000.') {
  document.getElementById('foodGrid').innerHTML = `
    <div class="col-12">
      <div class="error-state">
        <div class="error-icon">⚠️</div>
        <h4>Server Unreachable</h4>
        <p>${msg}</p>
        <button class="btn btn-outline-danger mt-2" onclick="loadFoods()">
          <i class="bi bi-arrow-clockwise me-1"></i> Retry
        </button>
      </div>
    </div>`;
}

/* ============================================================
   CATEGORIES — GET /categories
   ============================================================ */
async function loadCategories() {
  try {
    const res = await fetch(`${API}/categories`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const categories = await res.json();
    renderCategoryChips(categories);
  } catch (err) {
    // Non-critical; foods still show, chips just won't appear
    console.error('Category fetch error:', err.message);
  }
}

function renderCategoryChips(categories) {
  const row = document.getElementById('categoryFilterRow');
  if (!row) return;

  const emojiMap = {
    'Biryani':'🍛','Karahi':'🥘','Burgers':'🍔','Pizza':'🍕',
    'Nihari':'🍲','BBQ':'🔥','Shawarma':'🌯','Drinks':'🥤',
    'Desserts':'🍰','Sandwiches':'🥪','Fries & Sides':'🍟'
  };

  const allActive = selectedCategory === 'All' ? 'active' : '';
  let html = `
    <div class="category-card ${allActive}" onclick="filterByCategory('All')">
      <span class="category-icon">🍽️</span>
      <div class="cat-name">All</div>
    </div>`;

  categories.forEach(cat => {
    const active = selectedCategory === cat.name ? 'active' : '';
    const emoji  = emojiMap[cat.name] || '🍴';
    html += `
      <div class="category-card ${active}" onclick="filterByCategory('${cat.name}')">
        <span class="category-icon">${emoji}</span>
        <div class="cat-name">${cat.name}</div>
      </div>`;
  });

  row.innerHTML = html;
}

/* ============================================================
   RESTAURANTS — GET /restaurants
   Renders the featured restaurant cards with live click handler
   ============================================================ */
async function loadRestaurants() {
  const container = document.getElementById('restaurantsGrid');
  if (!container) return;

  container.innerHTML = '<p class="text-muted">Loading restaurants…</p>';

  try {
    const res = await fetch(`${API}/restaurants`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const restaurants = await res.json();
    renderRestaurantCards(restaurants);
  } catch (err) {
    container.innerHTML = '<p class="text-danger">Could not load restaurants.</p>';
  }
}

function renderRestaurantCards(restaurants) {
  const container = document.getElementById('restaurantsGrid');
  if (!container) return;

  container.innerHTML = restaurants.map(r => `
    <div class="col-6 col-md-4 col-lg-2">
      <div class="restaurant-card" onclick="filterByRestaurant('${r.name.replace(/'/g, "\\'")}')"
           style="cursor:pointer;" title="View ${r.name} menu">
        <img src="${r.image}"
             alt="${r.name}"
             onerror="this.src='https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=300&h=160&fit=crop'" />
        <div class="restaurant-card-body">
          <h5>${r.name}</h5>
          <div class="restaurant-meta">
            <i class="bi bi-star-fill text-warning"></i> ${r.rating} · ${r.deliveryTime}
          </div>
          <div style="font-size:0.72rem;color:var(--text-muted);margin-top:2px;">${r.cuisine}</div>
        </div>
      </div>
    </div>`).join('');
}

/* ----------------------------------------------------------
   filterByRestaurant — scrolls to menu and filters by restaurant
   ---------------------------------------------------------- */
function filterByRestaurant(restaurantName) {
  selectedRestaurant = restaurantName;
  selectedCategory   = 'All';   // reset category when browsing by restaurant

  // Re-render category chips with All active
  loadCategories();

  // Show restaurant name as active filter above the grid
  const badge = document.getElementById('restaurantFilterBadge');
  if (badge) {
    badge.style.display = restaurantName === 'All' ? 'none' : 'flex';
    badge.querySelector('#restaurantFilterName').textContent = restaurantName;
  }

  applyFilters();

  // Scroll to the menu section
  document.getElementById('menuSection').scrollIntoView({ behavior: 'smooth' });
}

/* ============================================================
   FOODS — GET /foods
   ============================================================ */
async function loadFoods() {
  showSkeletons(8);
  try {
    const res = await fetch(`${API}/foods`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    allFoods      = await res.json();
    filteredFoods = [...allFoods];
    applyFilters();
  } catch (err) {
    showError();
  }
}

/* ============================================================
   FILTERING — category + restaurant + search (all combined)
   ============================================================ */
function filterByCategory(category) {
  selectedCategory   = category;
  // Clear restaurant filter when browsing by category
  selectedRestaurant = 'All';
  const badge = document.getElementById('restaurantFilterBadge');
  if (badge) badge.style.display = 'none';

  // FIX Bug 5: re-render chips from already-loaded data instead of
  // firing a new fetch on every click (which caused a race condition
  // where the active chip state could be overwritten by a stale response)
  const cats = [...new Set(allFoods.map(f => f.category))].map(name => ({ name }));
  renderCategoryChips(cats);

  applyFilters();
}

/* Debounced search — fires 350ms after last keystroke */
function onSearchInput() {
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(applyFilters, 350);
}

/* Master filter — combines category + restaurant + search text */
function applyFilters() {
  const query = (
    document.getElementById('menuSearchInput').value ||
    document.getElementById('heroSearch').value
  ).toLowerCase().trim();

  filteredFoods = allFoods.filter(food => {
    const matchCat        = selectedCategory   === 'All' || food.category   === selectedCategory;
    const matchRestaurant = selectedRestaurant === 'All' || food.restaurant === selectedRestaurant;
    const matchSearch     = !query ||
      food.name.toLowerCase().includes(query)                 ||
      food.category.toLowerCase().includes(query)             ||
      (food.restaurant   || '').toLowerCase().includes(query) ||
      (food.description  || '').toLowerCase().includes(query);

    return matchCat && matchRestaurant && matchSearch;
  });

  renderFoods(filteredFoods);
}

/* ============================================================
   RENDER FOODS
   ============================================================ */
function renderFoods(foods) {
  const grid = document.getElementById('foodGrid');

  if (foods.length === 0) {
    grid.innerHTML = `
      <div class="col-12">
        <div class="empty-state">
          <div class="empty-icon">🔍</div>
          <h4>No items found</h4>
          <p class="text-muted">Try a different category, restaurant, or search term.</p>
          <button class="btn btn-outline-secondary mt-2" onclick="clearAllFilters()">
            <i class="bi bi-x-circle me-1"></i> Clear Filters
          </button>
        </div>
      </div>`;
    return;
  }

  grid.innerHTML = foods.map(food => buildFoodCard(food)).join('');
}

/* Clear all active filters */
function clearAllFilters() {
  selectedCategory   = 'All';
  selectedRestaurant = 'All';
  document.getElementById('menuSearchInput').value = '';
  document.getElementById('heroSearch').value      = '';
  const badge = document.getElementById('restaurantFilterBadge');
  if (badge) badge.style.display = 'none';
  loadCategories();
  applyFilters();
}

/* ============================================================
   BUILD FOOD CARD HTML
   ============================================================ */
function buildFoodCard(food) {
  const availBtn = food.available
    ? `<button class="btn-add-cart" onclick="addToCart(${food.id})">
         <i class="bi bi-cart-plus"></i> Add to Cart
       </button>`
    : `<button class="btn-add-cart" disabled>
         <i class="bi bi-x-circle"></i> Unavailable
       </button>`;

  const unavailTag = !food.available
    ? `<span class="unavailable-tag">Sold Out</span>` : '';

  const stars = buildStars(food.rating);

  // Show description as subtitle if available, otherwise restaurant name
  const subtitle = food.description
    ? `<div class="food-desc" style="font-size:0.75rem;color:var(--text-muted);margin-bottom:0.4rem;
         white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${food.description}">
         ${food.description}
       </div>`
    : '';

  return `
    <div class="col-sm-6 col-md-4 col-lg-3">
      <div class="food-card">
        <div class="food-card-img-wrapper">
          <img src="${food.image}" alt="${food.name}" class="food-card-img"
               onerror="this.src='https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&h=300&fit=crop'" />
          <span class="food-tag">${food.category}</span>
          ${unavailTag}
        </div>
        <div class="food-card-body">
          <h5 title="${food.name}">${food.name}</h5>
          <div class="food-restaurant">
            <i class="bi bi-shop"></i>
            <span style="cursor:pointer;text-decoration:underline dotted;"
                  onclick="filterByRestaurant('${(food.restaurant || '').replace(/'/g,"\\'")}')">
              ${food.restaurant || '—'}
            </span>
          </div>
          ${subtitle}
          <div class="food-meta">
            <span class="food-price">Rs. ${food.price.toLocaleString()}</span>
            <span class="food-rating">${stars} ${food.rating}</span>
          </div>
          ${availBtn}
        </div>
      </div>
    </div>`;
}

/* Build star icons from numeric rating */
function buildStars(rating) {
  const full = Math.floor(rating);
  const half = rating % 1 >= 0.5 ? 1 : 0;
  let html = '';
  for (let i = 0; i < full; i++) html += '<i class="bi bi-star-fill"></i>';
  if (half) html += '<i class="bi bi-star-half"></i>';
  return html;
}

/* ============================================================
   CART — Add / Change Qty / Remove
   FIX: all id comparisons use Number() to avoid string vs
        number strict-equality mismatches from JSON Server
   ============================================================ */
function addToCart(foodId) {
  const id   = Number(foodId);                             // Normalise to number
  const food = allFoods.find(f => Number(f.id) === id);   // Safe comparison
  if (!food) return;

  const existing = cart.find(item => Number(item.food.id) === id);
  if (existing) {
    existing.quantity++;
  } else {
    cart.push({ food, quantity: 1 });
  }

  updateCartUI();
  openCart();
  showToast(`${food.name} added to cart! 🛒`);
}

function changeQty(foodId, delta) {
  const id   = Number(foodId);
  const item = cart.find(i => Number(i.food.id) === id);
  if (!item) return;
  item.quantity += delta;
  if (item.quantity <= 0) removeFromCart(id);
  else updateCartUI();
}

function removeFromCart(foodId) {
  const id = Number(foodId);
  cart     = cart.filter(i => Number(i.food.id) !== id);
  updateCartUI();
}

/* ============================================================
   CART UI
   ============================================================ */
function updateCartUI() {
  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
  document.getElementById('cartCount').textContent = totalItems;
  renderCartItems();
  updateCartTotals();
}

function renderCartItems() {
  const container = document.getElementById('cartItemsList');
  const footer    = document.getElementById('cartFooter');

  if (cart.length === 0) {
    container.innerHTML = `
      <div class="cart-empty-state">
        <div class="empty-icon">🛒</div>
        <p>Your cart is empty.<br>Add some delicious food!</p>
      </div>`;
    footer.style.display = 'none';
    return;
  }

  footer.style.display = 'block';
  container.innerHTML  = cart.map(item => `
    <div class="cart-item">
      <img src="${item.food.image}" alt="${item.food.name}" class="cart-item-img"
           onerror="this.src='https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=100&h=100&fit=crop'" />
      <div class="cart-item-info">
        <h6>${item.food.name}</h6>
        <div class="cart-item-price">Rs. ${(item.food.price * item.quantity).toLocaleString()}</div>
      </div>
      <div class="cart-qty-controls">
        <button class="qty-btn" onclick="changeQty(${item.food.id}, -1)">−</button>
        <span class="qty-value">${item.quantity}</span>
        <button class="qty-btn" onclick="changeQty(${item.food.id}, 1)">+</button>
      </div>
      <button class="cart-remove-btn" onclick="removeFromCart(${item.food.id})" title="Remove">
        <i class="bi bi-trash3"></i>
      </button>
    </div>`).join('');
}

/* Delivery = Rs.99 flat; Tax = 5% of subtotal */
function updateCartTotals() {
  const subtotal = cart.reduce((sum, item) => sum + item.food.price * item.quantity, 0);
  const delivery = cart.length > 0 ? 99 : 0;
  const tax      = Math.round(subtotal * 0.05);
  const grand    = subtotal + delivery + tax;

  // Cart sidebar
  setText('cartSubtotal',  `Rs. ${subtotal.toLocaleString()}`);
  setText('cartDelivery',  `Rs. ${delivery}`);
  setText('cartTax',       `Rs. ${tax.toLocaleString()}`);
  setText('cartGrandTotal',`Rs. ${grand.toLocaleString()}`);

  // Checkout summary
  setText('summarySubtotal', `Rs. ${subtotal.toLocaleString()}`);
  setText('summaryDelivery', `Rs. ${delivery}`);
  setText('summaryTax',      `Rs. ${tax.toLocaleString()}`);
  setText('summaryGrand',    `Rs. ${grand.toLocaleString()}`);
}

/* Safe helper: sets textContent only if element exists */
function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

/* ============================================================
   CART OPEN / CLOSE
   ============================================================ */
function openCart() {
  document.getElementById('cartSidebar').classList.add('open');
  document.getElementById('cartOverlay').classList.add('show');
}

function closeCart() {
  document.getElementById('cartSidebar').classList.remove('open');
  document.getElementById('cartOverlay').classList.remove('show');
}

/* ============================================================
   HERO SEARCH BUTTON
   ============================================================ */
function scrollToMenu() {
  document.getElementById('menuSection').scrollIntoView({ behavior: 'smooth' });
  const heroVal = document.getElementById('heroSearch').value;
  if (heroVal) {
    document.getElementById('menuSearchInput').value = heroVal;
    applyFilters();
  }
}

/* ============================================================
   CHECKOUT FLOW
   ============================================================ */
function proceedToCheckout() {
  if (cart.length === 0) {
    showToast('Your cart is empty!', 'warning');
    return;
  }
  closeCart();
  renderCheckoutItems();
  updateCartTotals();
  document.getElementById('menuSection').style.display       = 'none';
  document.getElementById('restaurantsSection').style.display = 'none';
  document.getElementById('checkoutSection').style.display   = 'block';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderCheckoutItems() {
  const list = document.getElementById('checkoutItemsList');
  if (!list) return;
  list.innerHTML = cart.map(item => `
    <div class="order-item-row">
      <span>${item.food.name} × ${item.quantity}</span>
      <span>Rs. ${(item.food.price * item.quantity).toLocaleString()}</span>
    </div>`).join('');
}

function backToMenu() {
  document.getElementById('checkoutSection').style.display    = 'none';
  document.getElementById('menuSection').style.display        = 'block';
  document.getElementById('restaurantsSection').style.display = 'block';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ============================================================
   PAYMENT SELECTION
   ============================================================ */
function initPaymentOptions() {
  document.querySelectorAll('.payment-option').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.payment-option').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      selectedPayment = card.dataset.method;
      const errEl = document.getElementById('paymentError');
      if (errEl) errEl.classList.remove('show');
    });
  });
}

/* ============================================================
   FORM VALIDATION (inline — no alert() boxes)
   ============================================================ */
function validateCheckoutForm() {
  let valid = true;

  function setError(fieldId, errorId, condition, message) {
    const field = document.getElementById(fieldId);
    const err   = document.getElementById(errorId);
    if (!field || !err) return;
    if (condition) {
      field.classList.add('is-invalid');
      field.classList.remove('is-valid');
      err.textContent = message;
      err.classList.add('show');
      valid = false;
    } else {
      field.classList.remove('is-invalid');
      field.classList.add('is-valid');
      err.classList.remove('show');
    }
  }

  const name = document.getElementById('custName').value.trim();
  setError('custName','custNameError', name.length < 3,
    'Please enter your full name (at least 3 characters).');

  const phone      = document.getElementById('custPhone').value.trim();
  const phoneRegex = /^03\d{9}$/;
  setError('custPhone','custPhoneError', !phoneRegex.test(phone),
    'Enter a valid Pakistani number (e.g. 03001234567).');

  const email      = document.getElementById('custEmail').value.trim();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  setError('custEmail','custEmailError', !emailRegex.test(email),
    'Please enter a valid email address.');

  const address = document.getElementById('custAddress').value.trim();
  setError('custAddress','custAddressError', address.length < 10,
    'Please provide your full delivery address (10+ characters).');

  const city = document.getElementById('custCity').value;
  setError('custCity','custCityError', !city,
    'Please select your city.');

  if (!selectedPayment) {
    const payErr = document.getElementById('paymentError');
    if (payErr) payErr.classList.add('show');
    valid = false;
  }

  return valid;
}

/* ============================================================
   PLACE ORDER — POST /orders
   ============================================================ */
async function placeOrder(e) {
  e.preventDefault();
  if (!validateCheckoutForm()) return;

  const btn = document.getElementById('placeOrderBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span> Placing Order…';

  const subtotal = cart.reduce((s, i) => s + i.food.price * i.quantity, 0);
  const delivery = 99;
  const tax      = Math.round(subtotal * 0.05);

  const orderPayload = {
    customerName:        document.getElementById('custName').value.trim(),
    phone:               document.getElementById('custPhone').value.trim(),
    email:               document.getElementById('custEmail').value.trim(),
    address:             document.getElementById('custAddress').value.trim(),
    city:                document.getElementById('custCity').value,
    specialInstructions: document.getElementById('custInstructions').value.trim(),
    paymentMethod:       selectedPayment,
    items: cart.map(item => ({
      foodId:   item.food.id,
      name:     item.food.name,
      price:    item.food.price,
      quantity: item.quantity
    })),
    totalAmount: subtotal + delivery + tax,
    status:    'Processing',
    orderDate: new Date().toISOString()
  };

  try {
    const res = await fetch(`${API}/orders`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(orderPayload)
    });
    if (!res.ok) throw new Error(`Server error: ${res.status}`);

    // Reset everything on success
    cart = [];
    updateCartUI();
    document.getElementById('checkoutForm').reset();
    document.querySelectorAll('.payment-option').forEach(c => c.classList.remove('selected'));
    document.querySelectorAll('#checkoutForm .form-control, #checkoutForm .form-select')
      .forEach(f => f.classList.remove('is-valid','is-invalid'));
    selectedPayment = '';
    backToMenu();
    showToast('🎉 Order placed! You can track it in the Admin panel.');

  } catch (err) {
    showToast('Failed to place order. Is JSON Server running?', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-bag-check-fill me-2"></i> Place Order';
  }
}

/* ============================================================
   TOAST NOTIFICATION
   ============================================================ */
function showToast(message, type = 'success') {
  const toast = document.getElementById('successToast');
  const msg   = document.getElementById('successToastMsg');
  if (!toast || !msg) return;

  msg.textContent = message;
  toast.style.background =
    type === 'error'   ? '#dc3545' :
    type === 'warning' ? '#fd7e14' : '#198754';

  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3500);
}

/* ============================================================
   BOOT — DOMContentLoaded
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  // Dark mode
  initDarkMode();
  document.getElementById('darkModeToggle').addEventListener('click', toggleDarkMode);

  // Cart sidebar
  document.getElementById('cartToggleBtn').addEventListener('click', openCart);
  document.getElementById('cartCloseBtn').addEventListener('click', closeCart);
  document.getElementById('cartOverlay').addEventListener('click', closeCart);

  // Checkout
  document.getElementById('proceedCheckoutBtn').addEventListener('click', proceedToCheckout);
  document.getElementById('backToMenuBtn').addEventListener('click', backToMenu);
  document.getElementById('checkoutForm').addEventListener('submit', placeOrder);

  // Payment options
  initPaymentOptions();

  // Search inputs — both debounced
  document.getElementById('menuSearchInput').addEventListener('input', onSearchInput);
  document.getElementById('heroSearch').addEventListener('input', e => {
    document.getElementById('menuSearchInput').value = e.target.value;
    onSearchInput();
  });

  // "Clear restaurant filter" badge button
  const clearBtn = document.getElementById('clearRestaurantFilter');
  if (clearBtn) clearBtn.addEventListener('click', () => filterByRestaurant('All'));

  // Load all data
  loadCategories();
  loadRestaurants();
  loadFoods();
});