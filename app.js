/**
 * app.js - Main Application Controller
 * Handles all UI interactions, tab navigation, calculations,
 * form submissions, printing, and orchestration of the database layer.
 */

const App = (() => {
  // ============================================================
  // STATE
  // ============================================================
  let currentUser = null;
  let invoiceRows = [];
  let editingInvoiceId = null;

  // ============================================================
  // DOM REFS
  // ============================================================
  const $ = (id) => document.getElementById(id);
  const qs = (sel, ctx) => (ctx || document).querySelector(sel);
  const qsa = (sel, ctx) => (ctx || document).querySelectorAll(sel);

  // ============================================================
  // TOAST NOTIFICATIONS
  // ============================================================
  const showToast = (message, type = 'success') => {
    let container = qs('.toast-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'toast-container';
      document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity 0.3s'; setTimeout(() => toast.remove(), 300); }, 3000);
  };

  // ============================================================
  // UTILITY
  // ============================================================
  const formatNum = (n) => {
    if (n === undefined || n === null) return '0';
    return Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 3 });
  };

  const parseNum = (v) => {
    const n = parseFloat(v);
    return isNaN(n) ? 0 : n;
  };

  const todayStr = () => {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  };

  const nowStr = () => {
    const d = new Date();
    return d.toLocaleString('ar-IQ', { timeZone: 'Asia/Baghdad' });
  };

  // ============================================================
  // AUTH
  // ============================================================
  const initAuth = () => {
    const form = $('loginForm');
    const error = $('loginError');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      error.classList.add('hidden');
      const username = $('loginUsername').value.trim();
      const password = $('loginPassword').value.trim();

      if (!username || !password) {
        error.textContent = 'يرجى إدخال اسم المستخدم وكلمة المرور';
        error.classList.remove('hidden');
        return;
      }

      const user = await DB.authenticate(username, password);
      if (user) {
        currentUser = user;
        $('loginPage').style.display = 'none';
        $('dashboardApp').style.display = 'flex';
        updateUserInfo();
        loadAllData();
        showToast(`مرحباً بك يا ${user.name}`, 'success');
      } else {
        error.textContent = 'اسم المستخدم أو كلمة المرور غير صحيحة';
        error.classList.remove('hidden');
      }
    });

    $('logoutBtn').addEventListener('click', () => {
      currentUser = null;
      $('dashboardApp').style.display = 'none';
      $('loginPage').style.display = 'flex';
      $('loginUsername').value = '';
      $('loginPassword').value = '';
      $('loginError').classList.add('hidden');
    });
  };

  const updateUserInfo = () => {
    if (!currentUser) return;
    const initial = currentUser.name.charAt(0);
    $('sidebarAvatar').textContent = initial;
    $('sidebarUserName').textContent = currentUser.name;
    $('sidebarUserRole').textContent = currentUser.role === 'Admin' ? 'مدير النظام' : 'بائع';
    $('invSeller').value = currentUser.name;
  };

  // ============================================================
  // THEME TOGGLE (Dark Mode)
  // ============================================================
  const initThemeToggle = () => {
    const btn = $('themeToggle');
    const html = document.documentElement;
    const saved = localStorage.getItem('_darkMode');
    if (saved === 'true') {
      html.setAttribute('data-theme', 'dark');
      btn.textContent = '☀️';
      btn.title = 'الوضع النهاري';
    }
    btn.addEventListener('click', () => {
      const isDark = html.getAttribute('data-theme') === 'dark';
      if (isDark) {
        html.removeAttribute('data-theme');
        btn.textContent = '🌙';
        btn.title = 'الوضع الليلي';
        localStorage.setItem('_darkMode', 'false');
      } else {
        html.setAttribute('data-theme', 'dark');
        btn.textContent = '☀️';
        btn.title = 'الوضع النهاري';
        localStorage.setItem('_darkMode', 'true');
      }
    });
  };

  // ============================================================
  // SIDEBAR NAVIGATION
  // ============================================================
  const initNavigation = () => {
    const navItems = qsa('.nav-item');
    const tabMap = {
      sales: 'tabSales',
      purchases: 'tabPurchases',
      accounts: 'tabAccounts',
      inventory: 'tabInventory',
      data: 'tabData',
      reports: 'tabReports',
      settings: 'tabSettings',
      users: 'tabUsers',
      cash: 'tabCash',
    };
    const titleMap = {
      sales: 'المبيعات',
      purchases: 'المشتريات',
      accounts: 'الحسابات',
      inventory: 'حركة المخزون',
      data: 'الإضافة والتعديل',
      reports: 'التقارير',
      settings: 'الشركة',
      users: 'المستخدمين',
      cash: 'الصندوق',
    };

    navItems.forEach((item) => {
      item.addEventListener('click', () => {
        const tab = item.dataset.tab;

        // Protect users tab with admin password
        if (tab === 'users') {
          const users = DB.getUsersSync();
          const admin = users.find((u) => u.role === 'Admin');
          const pwd = prompt('الرجاء إدخال كلمة سر المدير للدخول إلى إدارة المستخدمين:');
          if (!pwd || pwd !== (admin ? admin.password : 'admin123')) {
            showToast('كلمة المرور غير صحيحة', 'error');
            return;
          }
        }

        // Update nav
        navItems.forEach((n) => n.classList.remove('active'));
        item.classList.add('active');
        // Update content
        Object.keys(tabMap).forEach((key) => {
          const el = $(tabMap[key]);
          if (el) el.classList.toggle('active', key === tab);
        });
        $('topbarTitle').textContent = titleMap[tab] || tab;
        // Close mobile sidebar
        $('sidebar').classList.remove('open');
        // Refresh data for tab
        if (tab === 'inventory') loadInventoryData();
        if (tab === 'purchases') loadPurchasesList();
        if (tab === 'accounts') loadAccountsData();
        if (tab === 'reports') loadReportsData();
        if (tab === 'data') loadDataManagement();
        if (tab === 'settings') loadSettingsData();
        if (tab === 'users') loadUsersData();
        if (tab === 'cash') loadCashData();
      });
    });

    // Mobile menu toggle
    $('menuToggle').addEventListener('click', () => {
      $('sidebar').classList.toggle('open');
    });
  };

  // ============================================================
  // DATA LOADING
  // ============================================================
  const loadAllData = async () => {
    await DB.init();
    await Promise.all([loadCustomers(), loadSuppliers(), loadWarehouses()]);
    await Promise.all([
      initSalesModule(),
      initPurchasesModule(),
      loadSalesList(),
      loadAccountsData(),
      loadInventoryData(),
      loadDataManagement(),
      loadReportsData(),
      loadSettingsData(),
      loadUsersData(),
      loadCashData(),
    ]);
  };

  // ============================================================
  // SEARCHABLE DROPDOWN (enhance <select> with autocomplete)
  // ============================================================
  const enhanceSelectElement = (select) => {
    if (!select || select.dataset.searchable) return;
    select.dataset.searchable = 'true';

    const wrap = document.createElement('div');
    wrap.className = 'autocomplete-wrap';
    wrap.style.width = '100%';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'form-input form-input-sm';
    input.placeholder = 'بحث...';

    const list = document.createElement('div');
    list.className = 'autocomplete-list';

    select.parentNode.insertBefore(wrap, select);
    wrap.appendChild(input);
    wrap.appendChild(list);
    wrap.appendChild(select);
    select.style.display = 'none';

    const getFiltered = (query) => {
      return Array.from(select.options).filter((o) => !query || o.text.includes(query));
    };

    const renderList = (query = '') => {
      const filtered = getFiltered(query);
      list.innerHTML = filtered
        .map((o) => `<div class="autocomplete-item" data-value="${o.value}">${o.text}</div>`)
        .join('');
      qsa('.autocomplete-item', list).forEach((el) => {
        el.addEventListener('click', () => {
          select.value = el.dataset.value;
          input.value = el.textContent;
          list.classList.remove('open');
          select.dispatchEvent(new Event('change', { bubbles: true }));
        });
      });
      list.classList.toggle('open', filtered.length > 0);
    };

    const syncInput = () => {
      const opt = select.options[select.selectedIndex];
      input.value = opt ? opt.text : '';
    };

    syncInput();

    let acTimeout;
    input.addEventListener('input', () => {
      const val = input.value.trim();
      if (!val) { list.classList.remove('open'); return; }
      clearTimeout(acTimeout);
      acTimeout = setTimeout(() => renderList(val), 200);
    });
    input.addEventListener('focus', () => renderList(''));
    input.addEventListener('blur', () => setTimeout(() => list.classList.remove('open'), 300));
    input.addEventListener('click', () => { if (!list.classList.contains('open')) renderList(''); });

    select._searchInput = input;

    // Auto-sync input when select.value is set programmatically
    const { get: origGet, set: origSet } = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
    Object.defineProperty(select, 'value', {
      get() { return origGet.call(select); },
      set(v) { origSet.call(select, v); syncInput(); },
    });
  };

  const makeDropdownSearchable = (selectId) => {
    enhanceSelectElement($(selectId));
  };
  let customersCache = [];
  let suppliersCache = [];
  let warehousesCache = [];
  let itemsCache = [];

  const loadCustomers = async () => {
    customersCache = await DB.getCustomers();
    const selects = ['invCustomer', 'receiptCustomer', 'journalCustomer', 'reportSalesCustomer', 'reportStatementCustomer'];
    selects.forEach((id) => {
      const sel = $(id);
      if (!sel) return;
      const val = sel.value;
      sel.innerHTML = '<option value="">-- اختر العميل --</option>';
      customersCache.forEach((c) => {
        sel.innerHTML += `<option value="${c.id}">${c.name}</option>`;
      });
      if (val) sel.value = val;
      makeDropdownSearchable(id);
    });
    return customersCache;
  };

  const loadSuppliers = async () => {
    suppliersCache = await DB.getSuppliers();
    const ids = ['purSupplier', 'paymentSupplier'];
    ids.forEach((id) => {
      const sel = $(id);
      if (!sel) return;
      sel.innerHTML = `<option value="">اختر المورد</option>${suppliersCache.map((s) => `<option value="${s.id}">${s.name}</option>`).join('')}`;
      makeDropdownSearchable(id);
    });
  };

  const loadWarehouses = async () => {
    warehousesCache = await DB.getWarehouses();
    // Populate and enhance warehouse dropdowns
    const sel = $('inventoryWarehouseFilter');
    if (sel) {
      sel.innerHTML = `<option value="">كل المخازن</option>${warehousesCache.map((w) => `<option value="${w.id}">${w.name}</option>`).join('')}`;
      makeDropdownSearchable('inventoryWarehouseFilter');
    }
  };

  const loadItems = async () => {
    itemsCache = await DB.getItems();
    return itemsCache;
  };

  // ============================================================
  // SALES MODULE
  // ============================================================
  let currentDocType = 'sales_invoice';

  const initSalesModule = () => {
    // Doc type toggle
    qsa('#docTypeToggle .toggle-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        qsa('#docTypeToggle .toggle-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        currentDocType = btn.dataset.doctype;
        const labels = { sales_invoice: 'فاتورة مبيعات', proforma: 'فاتورة أولية', quotation: 'عرض سعر', return_invoice: 'مرتجع' };
        $('docTypeLabel').textContent = `نوع المستند: ${labels[currentDocType]}`;
        $('salesFormTitle').textContent = `بيانات ${labels[currentDocType]}`;
        generateInvoiceNumber();
      });
    });

    // Payment type change updates remaining
    $('invPaymentType').addEventListener('change', calcRemaining);
    $('invAmountPaid').addEventListener('input', calcRemaining);
    $('invDiscountValue').addEventListener('input', recalcInvoice);
    $('invDiscountType').addEventListener('change', recalcInvoice);

    // New invoice
    $('newInvoiceBtn').addEventListener('click', resetInvoiceForm);

    // Add row
    $('addInvoiceRowBtn').addEventListener('click', () => addInvoiceRow());

    // Save invoice
    $('saveInvoiceBtn').addEventListener('click', saveInvoice);

    // Print
    $('printInvoiceBtn').addEventListener('click', printInvoice);

    // Refresh sales list
    $('refreshSalesBtn').addEventListener('click', loadSalesList);

    // Search
    $('salesSearchInput').addEventListener('input', loadSalesList);

    // Init
    generateInvoiceNumber();
    $('invDate').value = todayStr();
    addInvoiceRow(); // Start with one row
  };

  const generateInvoiceNumber = () => {
    const prefix = currentDocType === 'sales_invoice' ? 'F' : currentDocType === 'proforma' ? 'P' : currentDocType === 'quotation' ? 'Q' : 'R';
    $('invNumber').value = `${prefix}-${DB.nextNumber(prefix)}`;
  };

  const resetInvoiceForm = () => {
    editingInvoiceId = null;
    generateInvoiceNumber();
    $('invDate').value = todayStr();
    $('invCustomer').value = '';
    $('invReceiver').value = '';
    $('invPaymentType').value = 'نقدي';
    $('invCurrency').value = 'IQD';
    $('invDiscountValue').value = '0';
    $('invDiscountType').value = 'amount';
    $('invAmountPaid').value = '0';
    $('invNotes').value = '';
    invoiceRows = [];
    $('invoiceItemsBody').innerHTML = '';
    addInvoiceRow();
    recalcInvoice();
    showToast('تم إنشاء فاتورة جديدة', 'info');
  };

  const editInvoice = (inv) => {
    // Switch to sales tab
    qsa('.nav-item').forEach((n) => n.classList.remove('active'));
    const salesNav = qs('.nav-item[data-tab="sales"]');
    if (salesNav) salesNav.classList.add('active');
    qsa('.tab-content').forEach((t) => t.classList.remove('active'));
    const tabSales = $('tabSales');
    if (tabSales) tabSales.classList.add('active');
    $('topbarTitle').textContent = 'المبيعات';

    // Populate form fields
    editingInvoiceId = inv.id;
    $('invNumber').value = inv.number;
    $('invDate').value = (inv.date || '').slice(0, 10);
    $('invCustomer').value = inv.customerId || '';
    $('invReceiver').value = inv.receiver || '';
    $('invPaymentType').value = inv.paymentType || 'نقدي';
    $('invCurrency').value = inv.currency || 'IQD';
    $('invDiscountValue').value = inv.discountValue || 0;
    $('invDiscountType').value = inv.discountType || 'amount';
    $('invAmountPaid').value = inv.amountPaid || 0;
    $('invNotes').value = inv.notes || '';
    currentDocType = inv.type;
    // Update doc type toggle to match
    qsa('#docTypeToggle .toggle-btn').forEach((b) => b.classList.toggle('active', b.dataset.doctype === inv.type));
    const labels = { sales_invoice: 'فاتورة مبيعات', proforma: 'فاتورة أولية', quotation: 'عرض سعر', return_invoice: 'مرتجع' };
    $('docTypeLabel').textContent = `نوع المستند: ${labels[inv.type]}`;
    $('salesFormTitle').textContent = `بيانات ${labels[inv.type]}`;
    $('salesFormTitle').textContent = `بيانات ${labels[inv.type]}`;

    // Rebuild invoice rows
    invoiceRows = [];
    $('invoiceItemsBody').innerHTML = '';
    (inv.items || []).forEach((item) => addInvoiceRow(item));
    if ((inv.items || []).length === 0) addInvoiceRow();

    recalcInvoice();
    showToast('جاري تعديل الفاتورة', 'info');
  };

  const addInvoiceRow = (data = null) => {
    const tbody = $('invoiceItemsBody');
    const row = document.createElement('tr');
    const idx = invoiceRows.length;
    const rowId = `row_${Date.now()}_${idx}`;

    const rowData = data || { id: rowId, itemId: '', itemName: '', itemCode: '', packaging: '', weight: 0, warehouseId: '', qtyType: 'قطعة', quantity: 1, unitPrice: 0, total: 0 };

    if (data) rowData.id = rowId;
    invoiceRows.push(rowData);

    row.dataset.rowId = rowId;
    row.innerHTML = `
      <td class="row-index">${idx + 1}</td>
      <td>
        <div class="autocomplete-wrap">
          <input type="text" class="form-input form-input-sm item-search" value="${rowData.itemName}" placeholder="بحث..." style="width:100%;" />
          <div class="autocomplete-list"></div>
        </div>
      </td>
      <td><input type="text" class="form-input form-input-sm item-code" value="${rowData.itemCode}" readonly style="width:100%;" /></td>
      <td><input type="text" class="form-input form-input-sm item-packaging" value="${rowData.packaging}" readonly style="width:100%;" /></td>
      <td><input type="number" class="form-input form-input-sm item-weight" value="${rowData.weight}" step="0.001" style="width:100%;" /></td>
      <td>
        <select class="form-select form-input-sm item-warehouse" style="width:100%;">
          <option value="">--</option>
          ${warehousesCache.map((w) => `<option value="${w.id}" ${w.id === rowData.warehouseId ? 'selected' : ''}>${w.name}</option>`).join('')}
        </select>
      </td>
      <td>
        <select class="form-select form-input-sm item-qtytype" style="width:100%;">
          <option value="قطعة" ${rowData.qtyType === 'قطعة' ? 'selected' : ''}>قطعة</option>
          <option value="كرتون" ${rowData.qtyType === 'كرتون' ? 'selected' : ''}>كرتون</option>
          <option value="كيس" ${rowData.qtyType === 'كيس' ? 'selected' : ''}>كيس</option>
        </select>
      </td>
      <td><input type="number" class="form-input form-input-sm item-qty" value="${rowData.quantity}" min="0" step="1" style="width:100%;" /></td>
      <td><input type="number" class="form-input form-input-sm item-price" value="${rowData.unitPrice}" min="0" step="0.001" style="width:100%;" /></td>
      <td class="row-total font-bold" style="font-size:11px;">${formatNum(rowData.total)}</td>
      <td><span class="invoice-row-remove" style="font-size:14px;" title="حذف">✕</span></td>
    `;

    tbody.appendChild(row);

    // Enhance warehouse select for searchability
    const warehouseSelect = row.querySelector('.item-warehouse');
    if (warehouseSelect) enhanceSelectElement(warehouseSelect);

    // Row events
    const removeBtn = row.querySelector('.invoice-row-remove');
    removeBtn.addEventListener('click', () => removeInvoiceRow(rowId));

    // Autocomplete
    const searchInput = row.querySelector('.item-search');
    const acList = row.querySelector('.autocomplete-list');
    let acTimeout;

    const showAutocomplete = async (query = '') => {
      clearTimeout(acTimeout);
      acTimeout = setTimeout(async () => {
        const items = await DB.getItems();
        const filtered = query
          ? items.filter((i) => i.name.includes(query) || i.code.includes(query))
          : items;
        acList.innerHTML = filtered.map((i) =>
          `<div class="autocomplete-item" data-id="${i.id}" data-code="${i.code}" data-name="${i.name}" data-price="${i.defaultPrice}" data-weight="${i.weight}" data-packaging="${i.packaging}" data-pieces-carton="${i.piecesPerCarton || 1}" data-pieces-bag="${i.piecesPerBag || 1}">
            ${i.name} <small>${i.code} | سعر القطعة: ${formatNum(i.defaultPrice)} | الكرتون: ${i.piecesPerCarton || 1} قطعة | الكيس: ${i.piecesPerBag || 1} قطعة</small>
          </div>`
        ).join('');
        acList.classList.toggle('open', filtered.length > 0);

        acList.querySelectorAll('.autocomplete-item').forEach((el) => {
          el.addEventListener('click', () => {
            selectItemForRow(rowId, el.dataset);
            acList.classList.remove('open');
          });
        });
      }, query ? 200 : 50);
    };

    searchInput.addEventListener('input', () => {
      const val = searchInput.value.trim();
      if (val.length < 1) { acList.classList.remove('open'); return; }
      showAutocomplete(val);
    });

    searchInput.addEventListener('focus', () => {
      showAutocomplete();
    });

    searchInput.addEventListener('blur', () => {
      setTimeout(() => acList.classList.remove('open'), 300);
    });

    // Clicking on the input should also show the dropdown
    searchInput.addEventListener('click', (e) => {
      if (!acList.classList.contains('open')) {
        showAutocomplete();
      }
    });

    // Qty change
    const qtyInput = row.querySelector('.item-qty');
    const priceInput = row.querySelector('.item-price');
    const weightInput = row.querySelector('.item-weight');

    const recalc = () => {
      const rowIdx = invoiceRows.findIndex((r) => r.id === rowId);
      if (rowIdx === -1) return;
      const qty = parseNum(qtyInput.value);
      const price = parseNum(priceInput.value);
      const total = qty * price;
      invoiceRows[rowIdx].quantity = qty;
      invoiceRows[rowIdx].unitPrice = price;
      invoiceRows[rowIdx].total = total;
      invoiceRows[rowIdx].weight = parseNum(weightInput.value);
      row.querySelector('.row-total').textContent = formatNum(total);
      recalcInvoice();
    };

    qtyInput.addEventListener('input', recalc);
    priceInput.addEventListener('input', recalc);
    weightInput.addEventListener('input', recalc);

    // Warehouse change
    row.querySelector('.item-warehouse').addEventListener('change', function () {
      const rowIdx = invoiceRows.findIndex((r) => r.id === rowId);
      if (rowIdx !== -1) invoiceRows[rowIdx].warehouseId = this.value;
    });

    row.querySelector('.item-qtytype').addEventListener('change', function () {
      const rowIdx = invoiceRows.findIndex((r) => r.id === rowId);
      if (rowIdx === -1) return;
      invoiceRows[rowIdx].qtyType = this.value;
      const itemData = invoiceRows[rowIdx];
      const multiplier = getPriceMultiplier(this.value, itemData);
      const basePrice = itemData._basePiecePrice || parseNum(itemData.unitPrice) || 0;
      const newPrice = basePrice * multiplier;
      invoiceRows[rowIdx].unitPrice = newPrice;
      row.querySelector('.item-price').value = newPrice;
      const qty = parseNum(row.querySelector('.item-qty').value) || 1;
      const total = qty * newPrice;
      invoiceRows[rowIdx].total = total;
      row.querySelector('.row-total').textContent = formatNum(total);
      recalcInvoice();
    });

    // If data provided, set values
    if (data) recalc();

    // Update indices
    updateRowIndices();
  };

  const getPriceMultiplier = (qtyType, itemData) => {
    if (qtyType === 'كرتون') return parseInt(itemData.piecesCarton || itemData.piecesPerCarton) || 1;
    if (qtyType === 'كيس') return parseInt(itemData.piecesBag || itemData.piecesPerBag) || 1;
    return 1; // قطعة
  };

  const selectItemForRow = (rowId, data) => {
    const rowIdx = invoiceRows.findIndex((r) => r.id === rowId);
    if (rowIdx === -1) return;
    const row = document.querySelector(`[data-row-id="${rowId}"]`);
    if (!row) return;

    const piecesCarton = parseInt(data.piecesCarton || data.piecesPerCarton) || 1;
    const piecesBag = parseInt(data.piecesBag || data.piecesPerBag) || 1;
    const basePiecePrice = parseNum(data.price);

    invoiceRows[rowIdx].itemId = data.id;
    invoiceRows[rowIdx].itemName = data.name;
    invoiceRows[rowIdx].itemCode = data.code;
    invoiceRows[rowIdx].packaging = data.packaging;
    invoiceRows[rowIdx].piecesPerCarton = piecesCarton;
    invoiceRows[rowIdx].piecesPerBag = piecesBag;
    invoiceRows[rowIdx].weight = parseNum(data.weight);
    // Store base price per piece for recalculation when qtyType changes
    invoiceRows[rowIdx]._basePiecePrice = basePiecePrice;

    // Calculate unit price based on current qtyType
    const qtyType = row.querySelector('.item-qtytype')?.value || 'قطعة';
    const multiplier = getPriceMultiplier(qtyType, { piecesCarton, piecesBag });
    const unitPrice = basePiecePrice * multiplier;
    invoiceRows[rowIdx].unitPrice = unitPrice;
    invoiceRows[rowIdx].total = unitPrice * (invoiceRows[rowIdx].quantity || 1);

    row.querySelector('.item-search').value = data.name;
    row.querySelector('.item-code').value = data.code;
    row.querySelector('.item-packaging').value = data.packaging;
    row.querySelector('.item-weight').value = data.weight;
    row.querySelector('.item-price').value = unitPrice;

    const qty = parseNum(row.querySelector('.item-qty').value) || 1;
    const total = qty * unitPrice;
    row.querySelector('.row-total').textContent = formatNum(total);
    invoiceRows[rowIdx].total = total;
    recalcInvoice();
  };

  const removeInvoiceRow = (rowId) => {
    const idx = invoiceRows.findIndex((r) => r.id === rowId);
    if (idx === -1) return;
    invoiceRows.splice(idx, 1);
    const row = document.querySelector(`[data-row-id="${rowId}"]`);
    if (row) row.remove();
    updateRowIndices();
    recalcInvoice();
  };

  const updateRowIndices = () => {
    document.querySelectorAll('#invoiceItemsBody tr').forEach((row, i) => {
      row.querySelector('.row-index').textContent = i + 1;
    });
  };

  const recalcInvoice = () => {
    let subtotal = 0;
    let totalWeight = 0;
    invoiceRows.forEach((r) => {
      subtotal += r.total || 0;
      totalWeight += (r.weight || 0) * (r.quantity || 0);
    });

    const discountVal = parseNum($('invDiscountValue').value);
    const discountType = $('invDiscountType').value;
    let discount = 0;
    if (discountType === 'percent') {
      discount = subtotal * (discountVal / 100);
    } else {
      discount = discountVal;
    }

    const total = Math.max(0, subtotal - discount);
    $('invoiceTotalDisplay').textContent = formatNum(total);
    $('invoiceWeightDisplay').textContent = formatNum(totalWeight);
    calcRemaining();
  };

  const calcRemaining = () => {
    const total = parseNum($('invoiceTotalDisplay').textContent.replace(/,/g, ''));
    const paid = parseNum($('invAmountPaid').value);
    const remaining = Math.max(0, total - paid);
    $('invRemaining').value = formatNum(remaining);
  };

  const saveInvoice = async () => {
    const invNumber = $('invNumber').value;
    const customerId = $('invCustomer').value;
    const paymentType = $('invPaymentType').value;
    const currency = $('invCurrency').value;
    const total = parseNum($('invoiceTotalDisplay').textContent.replace(/,/g, ''));
    const amountPaid = parseNum($('invAmountPaid').value);
    const remaining = parseNum($('invRemaining').value.replace(/,/g, ''));

    if (invoiceRows.length === 0 || invoiceRows.every((r) => !r.itemId)) {
      showToast('يجب إضافة بند واحد على الأقل للفاتورة', 'error');
      return;
    }

    const validRows = invoiceRows.filter((r) => r.itemId);
    if (validRows.length === 0) {
      showToast('يجب اختيار صنف لكل بند', 'error');
      return;
    }

    const invoiceData = {
      type: currentDocType,
      number: invNumber,
      date: $('invDate').value,
      ...(editingInvoiceId ? {} : { dateTime: nowStr() }),
      customerId,
      customerName: customersCache.find((c) => c.id === customerId)?.name || '',
      receiver: $('invReceiver').value,
      paymentType,
      currency,
      discountValue: parseNum($('invDiscountValue').value),
      discountType: $('invDiscountType').value,
      seller: currentUser?.name || '',
      notes: $('invNotes').value,
      items: validRows.map((r) => ({
        ...r,
        weight: parseNum(document.querySelector(`[data-row-id="${r.id}"]`)?.querySelector('.item-weight')?.value) || r.weight,
        qtyType: document.querySelector(`[data-row-id="${r.id}"]`)?.querySelector('.item-qtytype')?.value || r.qtyType,
      })),
      total,
      amountPaid,
      remaining,
      status: amountPaid >= total ? 'مدفوعة' : amountPaid > 0 ? 'مدفوعة جزئياً' : 'غير مدفوعة',
    };

    try {
      if (editingInvoiceId) {
        invoiceData.id = editingInvoiceId;
        await DB.saveInvoice(invoiceData);
        showToast('تم تحديث الفاتورة', 'success');
      } else {
        await DB.finalizeInvoice(invoiceData);
        showToast('تم حفظ الفاتورة بنجاح', 'success');
      }
      // Refresh customer cache so balances are up-to-date for printing
      customersCache = await DB.getCustomers();
      editingInvoiceId = null;
      await loadSalesList();
      loadCashData();
      resetInvoiceForm();
    } catch (err) {
      showToast(`خطأ في حفظ الفاتورة: ${err.message}`, 'error');
    }
  };

  const loadSalesList = async () => {
    const invoices = await DB.getInvoices();
    const search = ($('salesSearchInput')?.value || '').trim().toLowerCase();
    const filtered = search
      ? invoices.filter((inv) => inv.number.toLowerCase().includes(search) || (inv.customerName || '').toLowerCase().includes(search))
      : invoices;

    filtered.sort((a, b) => new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date));

    const tbody = $('salesListBody');
    tbody.innerHTML = filtered.map((inv) => `
      <tr>
        <td class="font-medium">${inv.number || '-'}</td>
        <td>${inv.date || '-'}</td>
        <td>${inv.customerName || '-'}</td>
        <td><span class="badge badge-info">${inv.type === 'sales_invoice' ? 'مبيعات' : inv.type === 'proforma' ? 'أولية' : inv.type === 'quotation' ? 'عرض سعر' : 'مرتجع'}</span></td>
        <td>${formatNum(inv.total)}</td>
        <td>${formatNum(inv.amountPaid)}</td>
        <td>${formatNum(inv.remaining)}</td>
        <td>
          <span class="badge ${inv.status === 'مدفوعة' ? 'badge-success' : inv.status === 'مدفوعة جزئياً' ? 'badge-warning' : 'badge-danger'}">
            ${inv.status || 'غير مدفوعة'}
          </span>
        </td>
        <td>
          <button class="btn btn-outline btn-xs edit-invoice" data-id="${inv.id}">✏️</button>
          <button class="btn btn-outline btn-xs print-single-invoice" data-id="${inv.id}">🖨️</button>
          <button class="btn btn-outline btn-xs delete-invoice" data-id="${inv.id}" style="color:#ef4444;">🗑️</button>
        </td>
      </tr>
    `).join('') || '<tr><td colspan="9" class="text-center text-slate-400 py-8">لا توجد فواتير</td></tr>';

    // Print single invoice
    tbody.querySelectorAll('.print-single-invoice').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const inv = await DB.getInvoice(id);
        if (inv) {
          // Previous balance = balance of all transactions BEFORE this invoice's date
          const beforeDate = inv.createdAt || inv.dateTime || inv.date;
          inv.previousBalance = inv.customerId ? calcBalanceBefore(inv.customerId, beforeDate) : 0;
          renderPrintInvoice(inv);
        }
      });
    });

    // Edit invoice
    tbody.querySelectorAll('.edit-invoice').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const inv = await DB.getInvoice(id);
        if (inv) editInvoice(inv);
      });
    });

    // Delete invoice
    tbody.querySelectorAll('.delete-invoice').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('هل أنت متأكد من حذف هذه الفاتورة؟')) return;
        await DB.deleteInvoice(btn.dataset.id);
        showToast('تم حذف الفاتورة', 'info');
        loadSalesList();
        loadInventoryData();
        loadAccountsData();
      });
    });
  };

  // ============================================================
  // PRINT INVOICE
  // ============================================================
  const renderPrintInvoice = (inv) => {
    const printArea = $('printArea');
    const typeLabel = inv.type === 'sales_invoice' ? 'فاتورة مبيعات' : inv.type === 'proforma' ? 'فاتورة أولية' : inv.type === 'quotation' ? 'عرض سعر' : 'مرتجع';
    const currencyLabel = inv.currency === 'IQD' ? 'دينار عراقي' : 'دولار أمريكي';

    // Get customer previous balance:
    // - If inv.previousBalance is explicitly set (e.g. from saved invoice print), use it
    // - Otherwise look up from cache (current form before saving)
    const prevBalance = inv.previousBalance ?? (customersCache.find((c) => c.id === inv.customerId)?.balance || 0);
    const isReturn = inv.type === 'return_invoice';
    // For return invoices, remaining is subtracted from previous balance
    const totalRemaining = isReturn ? prevBalance - (inv.remaining || 0) : (inv.remaining || 0) + prevBalance;

    const itemsHtml = (inv.items || []).map((item, i) => `
      <tr>
        <td>${i + 1}</td>
        <td style="text-align:right;">${item.itemName || '-'}</td>
        <td>${item.quantity || 0}</td>
        <td>${item.qtyType || '-'}</td>
        <td>${formatNum(item.unitPrice)}</td>
        <td>${formatNum(item.total)}</td>
        <td>${item.weight ? formatNum(item.weight) : '-'}</td>
        <td>${item.weight ? formatNum((item.weight || 0) * (item.quantity || 0)) : '-'}</td>
      </tr>
    `).join('');

    const totalWeight = (inv.items || []).reduce((sum, it) => sum + (it.weight || 0) * (it.quantity || 0), 0);

    const company = DB.getSettingsSync();
    printArea.innerHTML = `
      <div class="print-invoice">
        <div class="invoice-header">
          <div class="company-info">
            <h2>${company.companyName || 'شركة النظام المتكامل'}</h2>
            <p>${company.companyAddress || 'العنوان: ---'}</p>
            <p>${company.companyPhone ? 'هاتف: ' + company.companyPhone : ''} ${company.companyEmail ? ' | بريد: ' + company.companyEmail : ''}</p>
            ${company.companyTax ? '<p>الرقم الضريبي: ' + company.companyTax + '</p>' : ''}
            ${company.companyReg ? '<p>السجل التجاري: ' + company.companyReg + '</p>' : ''}
          </div>
          <div class="invoice-title">
            <h1>${typeLabel}</h1>
            <p>رقم: ${inv.number || '-'}</p>
          </div>
        </div>

        <div class="invoice-meta">
          <div class="meta-item"><span class="label">رقم الفاتورة:</span><span class="value">${inv.number || '-'}</span></div>
          <div class="meta-item"><span class="label">التاريخ:</span><span class="value">${inv.date || '-'}</span></div>
          <div class="meta-item"><span class="label">العميل:</span><span class="value">${inv.customerName || '-'}</span></div>
          <div class="meta-item"><span class="label">المستلم:</span><span class="value">${inv.receiver || '-'}</span></div>
          <div class="meta-item"><span class="label">نوع الدفع:</span><span class="value">${inv.paymentType || '-'}</span></div>
          <div class="meta-item"><span class="label">العملة:</span><span class="value">${currencyLabel}</span></div>
          <div class="meta-item"><span class="label">البائع:</span><span class="value">${inv.seller || '-'}</span></div>
          <div class="meta-item"><span class="label">الخصم:</span><span class="value">${inv.discountType === 'percent' ? `${inv.discountValue}%` : formatNum(inv.discountValue || 0)}</span></div>
        </div>

        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>الصنف</th>
              <th>الكمية</th>
              <th>نوع الكمية</th>
              <th>سعر الوحدة</th>
              <th>الإجمالي</th>
              <th>الوزن (كغم)</th>
              <th>الوزن الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml || '<tr><td colspan="8" style="text-align:center;">لا توجد بنود</td></tr>'}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="7" style="text-align:left;">المجموع الكلي:</td>
              <td>${formatNum(inv.total)}</td>
            </tr>
          </tfoot>
        </table>

        <div class="invoice-summary">
          <div class="summary-box">
            <h4>ملخص الفاتورة</h4>
            <div class="summary-row"><span>المجموع الكلي:</span><span>${formatNum(inv.total)} ${inv.currency === 'IQD' ? 'د.ع' : '$'}</span></div>
            <div class="summary-row"><span>المبلغ المدفوع:</span><span>${formatNum(inv.amountPaid)} ${inv.currency === 'IQD' ? 'د.ع' : '$'}</span></div>
            <div class="summary-row"><span>${isReturn ? 'رصيد العميل السابق' : 'الطلب السابق للعميل'}:</span><span>${formatNum(prevBalance)} ${inv.currency === 'IQD' ? 'د.ع' : '$'}</span></div>
            <div class="summary-row total"><span>${isReturn ? 'الرصيد الإجمالي بعد المرتجع' : 'الرصيد الإجمالي المطلوب'}:</span><span>${formatNum(Math.abs(totalRemaining))} ${inv.currency === 'IQD' ? 'د.ع' : '$'}</span></div>
            <div class="summary-row"><span>مجموع الوزن الكلي:</span><span>${formatNum(totalWeight)} كغم</span></div>
          </div>
          <div class="summary-box">
            <h4>ملاحظات</h4>
            <p style="font-size:9pt;color:#666;">${inv.notes || 'لا توجد ملاحظات'}</p>
          </div>
        </div>

        <div class="invoice-footer">
          <div class="signature">
            <div class="line">توقيع المستلم</div>
          </div>
          <div class="signature">
            <div class="line">توقيع البائع</div>
          </div>
          <div style="font-size:8pt;color:#999;">
            تم إنشاؤها بواسطة: ${inv.seller || 'النظام'} | ${inv.dateTime || inv.date}
          </div>
        </div>
      </div>
    `;

    // Trigger print
    setTimeout(() => {
      window.print();
    }, 300);
  };

  // ============================================================
  // PRINT VOUCHER (Receipt / Payment / Journal)
  // ============================================================
  const renderPrintVoucher = (v) => {
    const printArea = $('printArea');
    const company = DB.getSettingsSync();

    const typeLabels = { receipt: 'سند قبض', payment: 'سند صرف', journal: 'قيد آجل' };
    const typeLabel = typeLabels[v.type] || 'سند';
    const journalTypeLabel = v.journalType === 'debit' ? 'مدين (عليه)' : 'دائن (له)';

    const currencyLabel = v.currency === 'IQD' ? 'دينار عراقي' : 'دولار أمريكي';
    const amountFormatted = formatNum(v.amount);
    const name = v.customerName || v.supplierName || '-';

    printArea.innerHTML = `
      <div class="print-invoice">
        <div class="invoice-header">
          <div class="company-info">
            <h2>${company.companyName || 'شركة النظام المتكامل'}</h2>
            <p>${company.companyAddress || ''}</p>
            <p>${company.companyPhone ? 'هاتف: ' + company.companyPhone : ''} ${company.companyEmail ? 'بريد: ' + company.companyEmail : ''}</p>
          </div>
          <div class="invoice-title">
            <h1>${typeLabel}</h1>
            <p>رقم: ${v.number || '-'}</p>
          </div>
        </div>

        <div class="invoice-meta">
          <div class="meta-item"><span class="label">رقم السند:</span><span class="value">${v.number || '-'}</span></div>
          <div class="meta-item"><span class="label">التاريخ:</span><span class="value">${(v.date || '').slice(0, 10) || '-'}</span></div>
          <div class="meta-item"><span class="label">الطرف:</span><span class="value">${name}</span></div>
          ${v.type === 'journal' ? `<div class="meta-item"><span class="label">نوع القيد:</span><span class="value">${journalTypeLabel}</span></div>` : ''}
          <div class="meta-item"><span class="label">العملة:</span><span class="value">${currencyLabel}</span></div>
          <div class="meta-item"><span class="label">المبلغ:</span><span class="value" style="font-size:12pt;font-weight:700;">${amountFormatted}</span></div>
          ${v.method ? `<div class="meta-item"><span class="label">وسيلة الدفع:</span><span class="value">${v.method}</span></div>` : ''}
          ${v.reference ? `<div class="meta-item"><span class="label">المرجع:</span><span class="value">${v.reference}</span></div>` : ''}
        </div>

        <div class="invoice-summary" style="margin-top:12px;">
          <div class="summary-box">
            <h4>البيان</h4>
            <p style="font-size:9pt;color:#555;">${v.notes || 'لا توجد ملاحظات'}</p>
          </div>
        </div>

        <div class="invoice-footer">
          <div class="signature">
            <div class="line">توقيع المستلم</div>
          </div>
          <div class="signature">
            <div class="line">توقيع الصراف</div>
          </div>
          <div style="font-size:8pt;color:#999;">
            تمت الطباعة: ${nowStr()}
          </div>
        </div>
      </div>
    `;

    setTimeout(() => { window.print(); }, 300);
  };

  const calcBalanceBefore = (customerId, beforeDate) => {
    let balance = 0;
    const allInvoices = DB.getInvoicesSync();
    const allVouchers = DB.getVouchersSync();
    allInvoices.filter((inv) => inv.customerId === customerId && (inv.createdAt || inv.date) < beforeDate).forEach((inv) => {
      balance += (inv.total || 0) - (inv.amountPaid || 0);
    });
    allVouchers.filter((v) => v.type === 'receipt' && v.customerId === customerId && (v.createdAt || v.date) < beforeDate).forEach((v) => {
      balance -= (v.amount || 0);
    });
    allVouchers.filter((v) => v.type === 'journal' && v.customerId === customerId && (v.createdAt || v.date) < beforeDate).forEach((v) => {
      balance += v.journalType === 'debit' ? (v.amount || 0) : -(v.amount || 0);
    });
    return balance;
  };

  const printInvoice = () => {
    const customerId = $('invCustomer').value;
    const customer = customersCache.find((c) => c.id === customerId);
    const now = nowStr();
    const previousBalance = customerId ? calcBalanceBefore(customerId, now) : 0;
    const inv = {
      type: currentDocType,
      number: $('invNumber').value,
      date: $('invDate').value,
      dateTime: now,
      customerId,
      customerName: customer?.name || '',
      receiver: $('invReceiver').value,
      paymentType: $('invPaymentType').value,
      currency: $('invCurrency').value,
      discountValue: parseNum($('invDiscountValue').value),
      discountType: $('invDiscountType').value,
      seller: currentUser?.name || '',
      notes: $('invNotes').value,
      items: invoiceRows.filter((r) => r.itemId).map((r) => {
        const rowEl = document.querySelector(`[data-row-id="${r.id}"]`);
        return {
          ...r,
          weight: parseNum(rowEl?.querySelector('.item-weight')?.value) || r.weight,
          qtyType: rowEl?.querySelector('.item-qtytype')?.value || r.qtyType,
          quantity: parseNum(rowEl?.querySelector('.item-qty')?.value) || r.quantity,
          unitPrice: parseNum(rowEl?.querySelector('.item-price')?.value) || r.unitPrice,
          total: parseNum(rowEl?.querySelector('.row-total')?.textContent.replace(/,/g, '')) || r.total,
        };
      }),
      total: parseNum($('invoiceTotalDisplay').textContent.replace(/,/g, '')),
      amountPaid: parseNum($('invAmountPaid').value),
      remaining: parseNum($('invRemaining').value.replace(/,/g, '')),
      previousBalance,
    };
    renderPrintInvoice(inv);
  };

  // ============================================================
  // PURCHASES MODULE
  // ============================================================
  let editingPurchaseId = null;
  let purchaseRows = [];

  const initPurchasesModule = () => {
    $('newPurchaseBtn').addEventListener('click', resetPurchaseForm);
    $('addPurchaseRowBtn').addEventListener('click', () => addPurchaseRow());
    $('savePurchaseBtn').addEventListener('click', savePurchase);
    $('printPurchaseBtn').addEventListener('click', printPurchase);
    $('refreshPurchasesBtn').addEventListener('click', loadPurchasesList);
    $('purchasesSearchInput').addEventListener('input', loadPurchasesList);

    generatePurchaseNumber();
    $('purDate').value = todayStr();
    addPurchaseRow();
  };

  const generatePurchaseNumber = () => {
    $('purNumber').value = `PUR-${DB.nextNumber('PUR')}`;
  };

  const resetPurchaseForm = () => {
    editingPurchaseId = null;
    generatePurchaseNumber();
    $('purDate').value = todayStr();
    $('purSupplier').value = '';
    $('purPaymentType').value = 'نقدي';
    $('purCurrency').value = 'IQD';
    $('purAmountPaid').value = '0';
    $('purNotes').value = '';
    purchaseRows = [];
    $('purchaseItemsBody').innerHTML = '';
    addPurchaseRow();
    recalcPurchase();
    showToast('تم إنشاء فاتورة مشتريات جديدة', 'info');
  };

  const addPurchaseRow = (data = null) => {
    const tbody = $('purchaseItemsBody');
    const row = document.createElement('tr');
    const idx = purchaseRows.length;
    const rowId = `pur_row_${Date.now()}_${idx}`;

    const rowData = data || { id: rowId, itemId: '', itemName: '', itemCode: '', packaging: '', warehouseId: '', qtyType: 'قطعة', quantity: 1, unitPrice: 0, total: 0 };
    if (data) rowData.id = rowId;
    purchaseRows.push(rowData);

    row.dataset.rowId = rowId;
    row.innerHTML = `
      <td class="row-index">${idx + 1}</td>
      <td>
        <div class="autocomplete-wrap">
          <input type="text" class="form-input form-input-sm item-search" value="${rowData.itemName}" placeholder="بحث..." style="width:100%;" />
          <div class="autocomplete-list"></div>
        </div>
      </td>
      <td><input type="text" class="form-input form-input-sm item-code" value="${rowData.itemCode}" readonly style="width:100%;" /></td>
      <td><input type="text" class="form-input form-input-sm item-packaging" value="${rowData.packaging}" readonly style="width:100%;" /></td>
      <td>
        <select class="form-select form-input-sm item-warehouse" style="width:100%;">
          <option value="">--</option>
          ${warehousesCache.map((w) => `<option value="${w.id}" ${w.id === rowData.warehouseId ? 'selected' : ''}>${w.name}</option>`).join('')}
        </select>
      </td>
      <td>
        <select class="form-select form-input-sm item-qtytype" style="width:100%;">
          <option value="قطعة" ${rowData.qtyType === 'قطعة' ? 'selected' : ''}>قطعة</option>
          <option value="كرتون" ${rowData.qtyType === 'كرتون' ? 'selected' : ''}>كرتون</option>
          <option value="كيس" ${rowData.qtyType === 'كيس' ? 'selected' : ''}>كيس</option>
        </select>
      </td>
      <td><input type="number" class="form-input form-input-sm item-qty" value="${rowData.quantity}" min="0" step="1" style="width:100%;" /></td>
      <td><input type="number" class="form-input form-input-sm item-price" value="${rowData.unitPrice}" min="0" step="0.001" style="width:100%;" /></td>
      <td class="row-total font-bold" style="font-size:11px;">${formatNum(rowData.total)}</td>
      <td><span class="purchase-row-remove" style="font-size:14px;" title="حذف">✕</span></td>
    `;

    tbody.appendChild(row);

    // Enhance warehouse select for searchability
    const warehouseSelect = row.querySelector('.item-warehouse');
    if (warehouseSelect) enhanceSelectElement(warehouseSelect);

    const removeBtn = row.querySelector('.purchase-row-remove');
    removeBtn.addEventListener('click', () => removePurchaseRow(rowId));

    // Autocomplete
    const searchInput = row.querySelector('.item-search');
    const acList = row.querySelector('.autocomplete-list');
    let acTimeout;

    const showAutocomplete = async (query = '') => {
      clearTimeout(acTimeout);
      acTimeout = setTimeout(async () => {
        const items = await DB.getItems();
        const filtered = query ? items.filter((i) => i.name.includes(query) || i.code.includes(query)) : items;
        acList.innerHTML = filtered.map((i) =>
          `<div class="autocomplete-item" data-id="${i.id}" data-code="${i.code}" data-name="${i.name}" data-price="${i.defaultPrice}" data-weight="${i.weight}" data-packaging="${i.packaging}" data-pieces-carton="${i.piecesPerCarton || 1}" data-pieces-bag="${i.piecesPerBag || 1}">
            ${i.name} <small>${i.code} | سعر القطعة: ${formatNum(i.defaultPrice)} | الكرتون: ${i.piecesPerCarton || 1} قطعة | الكيس: ${i.piecesPerBag || 1} قطعة</small>
          </div>`
        ).join('');
        acList.classList.toggle('open', filtered.length > 0);

        acList.querySelectorAll('.autocomplete-item').forEach((el) => {
          el.addEventListener('click', () => {
            selectPurchaseItem(rowId, el.dataset);
            acList.classList.remove('open');
          });
        });
      }, query ? 200 : 50);
    };

    searchInput.addEventListener('input', () => {
      const val = searchInput.value.trim();
      if (val.length < 1) { acList.classList.remove('open'); return; }
      showAutocomplete(val);
    });

    searchInput.addEventListener('focus', () => showAutocomplete());
    searchInput.addEventListener('blur', () => setTimeout(() => acList.classList.remove('open'), 300));
    searchInput.addEventListener('click', (e) => { if (!acList.classList.contains('open')) showAutocomplete(); });

    const qtyInput = row.querySelector('.item-qty');
    const priceInput = row.querySelector('.item-price');

    const recalc = () => {
      const rowIdx = purchaseRows.findIndex((r) => r.id === rowId);
      if (rowIdx === -1) return;
      const qty = parseNum(qtyInput.value);
      const price = parseNum(priceInput.value);
      const total = qty * price;
      purchaseRows[rowIdx].quantity = qty;
      purchaseRows[rowIdx].unitPrice = price;
      purchaseRows[rowIdx].total = total;
      row.querySelector('.row-total').textContent = formatNum(total);
      recalcPurchase();
    };

    qtyInput.addEventListener('input', recalc);
    priceInput.addEventListener('input', recalc);

    row.querySelector('.item-warehouse').addEventListener('change', function () {
      const rowIdx = purchaseRows.findIndex((r) => r.id === rowId);
      if (rowIdx !== -1) purchaseRows[rowIdx].warehouseId = this.value;
    });

    row.querySelector('.item-qtytype').addEventListener('change', function () {
      const rowIdx = purchaseRows.findIndex((r) => r.id === rowId);
      if (rowIdx === -1) return;
      purchaseRows[rowIdx].qtyType = this.value;
      const itemData = purchaseRows[rowIdx];
      const multiplier = getPriceMultiplier(this.value, itemData);
      const basePrice = itemData._basePiecePrice || parseNum(itemData.unitPrice) || 0;
      const newPrice = basePrice * multiplier;
      purchaseRows[rowIdx].unitPrice = newPrice;
      row.querySelector('.item-price').value = newPrice;
      const qty = parseNum(row.querySelector('.item-qty').value) || 1;
      const total = qty * newPrice;
      purchaseRows[rowIdx].total = total;
      row.querySelector('.row-total').textContent = formatNum(total);
      recalcPurchase();
    });

    if (data) recalc();
    updatePurchaseRowIndices();
  };

  const selectPurchaseItem = (rowId, data) => {
    const rowIdx = purchaseRows.findIndex((r) => r.id === rowId);
    if (rowIdx === -1) return;
    const row = document.querySelector(`[data-row-id="${rowId}"]`);
    if (!row) return;

    const piecesCarton = parseInt(data.piecesCarton || data.piecesPerCarton) || 1;
    const piecesBag = parseInt(data.piecesBag || data.piecesPerBag) || 1;
    const basePiecePrice = parseNum(data.price);

    purchaseRows[rowIdx].itemId = data.id;
    purchaseRows[rowIdx].itemName = data.name;
    purchaseRows[rowIdx].itemCode = data.code;
    purchaseRows[rowIdx].packaging = data.packaging;
    purchaseRows[rowIdx].piecesPerCarton = piecesCarton;
    purchaseRows[rowIdx].piecesPerBag = piecesBag;
    purchaseRows[rowIdx]._basePiecePrice = basePiecePrice;

    const qtyType = row.querySelector('.item-qtytype')?.value || 'قطعة';
    const multiplier = getPriceMultiplier(qtyType, { piecesCarton, piecesBag });
    const unitPrice = basePiecePrice * multiplier;
    purchaseRows[rowIdx].unitPrice = unitPrice;
    purchaseRows[rowIdx].total = unitPrice * (purchaseRows[rowIdx].quantity || 1);

    row.querySelector('.item-search').value = data.name;
    row.querySelector('.item-code').value = data.code;
    row.querySelector('.item-packaging').value = data.packaging;
    row.querySelector('.item-price').value = unitPrice;

    const qty = parseNum(row.querySelector('.item-qty').value) || 1;
    const total = qty * unitPrice;
    row.querySelector('.row-total').textContent = formatNum(total);
    purchaseRows[rowIdx].total = total;
    recalcPurchase();
  };

  const removePurchaseRow = (rowId) => {
    const idx = purchaseRows.findIndex((r) => r.id === rowId);
    if (idx === -1) return;
    purchaseRows.splice(idx, 1);
    const row = document.querySelector(`[data-row-id="${rowId}"]`);
    if (row) row.remove();
    updatePurchaseRowIndices();
    recalcPurchase();
  };

  const updatePurchaseRowIndices = () => {
    document.querySelectorAll('#purchaseItemsBody tr').forEach((row, i) => {
      row.querySelector('.row-index').textContent = i + 1;
    });
  };

  const recalcPurchase = () => {
    let total = 0;
    purchaseRows.forEach((r) => { total += r.total || 0; });
    $('purchaseTotalDisplay').textContent = formatNum(total);
  };

  const savePurchase = async () => {
    const purNumber = $('purNumber').value;
    const supplierId = $('purSupplier').value;
    const paymentType = $('purPaymentType').value;
    const currency = $('purCurrency').value;

    if (purchaseRows.length === 0 || purchaseRows.every((r) => !r.itemId)) {
      showToast('يجب إضافة بند واحد على الأقل', 'error');
      return;
    }
    const validRows = purchaseRows.filter((r) => r.itemId);
    if (validRows.length === 0) {
      showToast('يجب اختيار صنف لكل بند', 'error');
      return;
    }

    const total = parseNum($('purchaseTotalDisplay').textContent.replace(/,/g, ''));
    const amountPaid = parseNum($('purAmountPaid').value);
    const remaining = Math.max(0, total - amountPaid);

    const purchaseData = {
      number: purNumber,
      date: $('purDate').value,
      supplierId,
      supplierName: suppliersCache.find((s) => s.id === supplierId)?.name || '',
      paymentType,
      currency,
      notes: $('purNotes').value,
      items: validRows.map((r) => ({
        ...r,
        qtyType: document.querySelector(`[data-row-id="${r.id}"]`)?.querySelector('.item-qtytype')?.value || r.qtyType,
      })),
      total,
      amountPaid,
      remaining,
      status: amountPaid >= total ? 'مدفوعة' : amountPaid > 0 ? 'مدفوعة جزئياً' : 'غير مدفوعة',
    };

    try {
      if (editingPurchaseId) {
        purchaseData.id = editingPurchaseId;
        await DB.savePurchase(purchaseData);
        showToast('تم تحديث فاتورة المشتريات', 'success');
      } else {
        await DB.finalizePurchase(purchaseData);
        showToast('تم حفظ فاتورة المشتريات', 'success');
      }
      editingPurchaseId = null;
      await loadPurchasesList();
      loadCashData();
      resetPurchaseForm();
    } catch (err) {
      showToast(`خطأ: ${err.message}`, 'error');
    }
  };

  const editPurchase = async (id) => {
    const pur = await DB.getPurchase(id);
    if (!pur) return;

    qsa('.nav-item').forEach((n) => n.classList.remove('active'));
    const purNav = qs('.nav-item[data-tab="purchases"]');
    if (purNav) purNav.classList.add('active');
    qsa('.tab-content').forEach((t) => t.classList.remove('active'));
    const tabPur = $('tabPurchases');
    if (tabPur) tabPur.classList.add('active');
    $('topbarTitle').textContent = 'المشتريات';

    editingPurchaseId = pur.id;
    $('purNumber').value = pur.number;
    $('purDate').value = (pur.date || '').slice(0, 10);
    $('purSupplier').value = pur.supplierId || '';
    $('purPaymentType').value = pur.paymentType || 'نقدي';
    $('purCurrency').value = pur.currency || 'IQD';
    $('purAmountPaid').value = pur.amountPaid || 0;
    $('purNotes').value = pur.notes || '';

    purchaseRows = [];
    $('purchaseItemsBody').innerHTML = '';
    (pur.items || []).forEach((item) => addPurchaseRow(item));
    if ((pur.items || []).length === 0) addPurchaseRow();
    recalcPurchase();
  };

  const loadPurchasesList = async () => {
    const purchases = await DB.getPurchases();
    const search = ($('purchasesSearchInput')?.value || '').trim().toLowerCase();
    const filtered = search
      ? purchases.filter((p) => p.number.toLowerCase().includes(search) || (p.supplierName || '').toLowerCase().includes(search))
      : purchases;

    filtered.sort((a, b) => new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date));

    const tbody = $('purchasesListBody');
    tbody.innerHTML = filtered.map((p) => `
      <tr>
        <td class="font-medium">${p.number || '-'}</td>
        <td>${p.date || '-'}</td>
        <td>${p.supplierName || '-'}</td>
        <td>${formatNum(p.total)}</td>
        <td>${formatNum(p.amountPaid)}</td>
        <td>${formatNum(p.remaining)}</td>
        <td>
          <span class="badge ${p.status === 'مدفوعة' ? 'badge-success' : p.status === 'مدفوعة جزئياً' ? 'badge-warning' : 'badge-danger'}">
            ${p.status || 'غير مدفوعة'}
          </span>
        </td>
        <td>
          <button class="btn btn-outline btn-xs edit-purchase" data-id="${p.id}">✏️</button>
          <button class="btn btn-outline btn-xs print-single-purchase" data-id="${p.id}">🖨️</button>
          <button class="btn btn-outline btn-xs delete-purchase" data-id="${p.id}" style="color:#ef4444;">🗑️</button>
        </td>
      </tr>
    `).join('') || '<tr><td colspan="8" class="text-center text-slate-400 py-8">لا توجد فواتير مشتريات</td></tr>';

    tbody.querySelectorAll('.print-single-purchase').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const pur = await DB.getPurchase(id);
        if (pur) renderPrintPurchase(pur);
      });
    });

    tbody.querySelectorAll('.edit-purchase').forEach((btn) => {
      btn.addEventListener('click', () => editPurchase(btn.dataset.id));
    });

    tbody.querySelectorAll('.delete-purchase').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('هل أنت متأكد من حذف فاتورة المشتريات؟')) return;
        await DB.deletePurchase(btn.dataset.id);
        showToast('تم حذف فاتورة المشتريات', 'info');
        loadPurchasesList();
        loadInventoryData();
      });
    });
  };

  const printPurchase = () => {
    const purNumber = $('purNumber').value;
    if (!purNumber) { showToast('يرجى حفظ الفاتورة أولاً', 'error'); return; }

    const validRows = purchaseRows.filter((r) => r.itemId);
    const total = parseNum($('purchaseTotalDisplay').textContent.replace(/,/g, ''));
    const amountPaid = parseNum($('purAmountPaid').value);
    const remaining = Math.max(0, total - amountPaid);

    const pur = {
      number: purNumber,
      date: $('purDate').value,
      supplierId: $('purSupplier').value,
      supplierName: suppliersCache.find((s) => s.id === $('purSupplier').value)?.name || '',
      paymentType: $('purPaymentType').value,
      currency: $('purCurrency').value,
      notes: $('purNotes').value,
      items: validRows.map((r) => {
        const rowEl = document.querySelector(`[data-row-id="${r.id}"]`);
        return {
          itemName: r.itemName,
          itemCode: r.itemCode,
          packaging: r.packaging,
          qtyType: rowEl?.querySelector('.item-qtytype')?.value || r.qtyType,
          quantity: parseNum(rowEl?.querySelector('.item-qty')?.value) || r.quantity,
          unitPrice: parseNum(rowEl?.querySelector('.item-price')?.value) || r.unitPrice,
          total: parseNum(rowEl?.querySelector('.row-total')?.textContent.replace(/,/g, '')) || r.total,
        };
      }),
      total,
      amountPaid,
      remaining,
    };
    renderPrintPurchase(pur);
  };

  const renderPrintPurchase = (pur) => {
    const printArea = $('printArea');
    const currencyLabel = pur.currency === 'IQD' ? 'دينار عراقي' : 'دولار أمريكي';

    const itemsHtml = (pur.items || []).map((item, i) => `
      <tr>
        <td>${i + 1}</td>
        <td style="text-align:right;">${item.itemName || '-'}</td>
        <td>${item.itemCode || '-'}</td>
        <td>${item.quantity || 0}</td>
        <td>${item.qtyType || '-'}</td>
        <td>${formatNum(item.unitPrice)}</td>
        <td>${formatNum(item.total)}</td>
      </tr>
    `).join('');

    const company = DB.getSettingsSync();
    printArea.innerHTML = `
      <div class="print-invoice">
        <div class="invoice-header">
          <div class="company-info">
            <h2>${company.companyName || 'شركة النظام المتكامل'}</h2>
            <p>${company.companyAddress || ''}</p>
            <p>${company.companyPhone ? 'هاتف: ' + company.companyPhone : ''} ${company.companyEmail ? 'بريد: ' + company.companyEmail : ''}</p>
          </div>
          <div class="invoice-title">
            <h1>فاتورة مشتريات</h1>
            <p>رقم: ${pur.number || '-'}</p>
          </div>
        </div>

        <div class="invoice-meta">
          <div><strong>التاريخ:</strong> ${pur.date || '-'}</div>
          <div><strong>المورد:</strong> ${pur.supplierName || '-'}</div>
          <div><strong>نوع الدفع:</strong> ${pur.paymentType || '-'}</div>
          <div><strong>العملة:</strong> ${currencyLabel}</div>
        </div>

        <table class="invoice-items">
          <thead>
            <tr>
              <th>#</th>
              <th>الصنف</th>
              <th>الكود</th>
              <th>الكمية</th>
              <th>الوحدة</th>
              <th>سعر الوحدة</th>
              <th>المجموع</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="6" style="text-align:left;font-weight:bold;">المجموع الكلي:</td>
              <td style="font-weight:bold;">${formatNum(pur.total)}</td>
            </tr>
            <tr>
              <td colspan="6" style="text-align:left;">المدفوع:</td>
              <td>${formatNum(pur.amountPaid)}</td>
            </tr>
            <tr>
              <td colspan="6" style="text-align:left;">المتبقي:</td>
              <td>${formatNum(pur.remaining)}</td>
            </tr>
          </tfoot>
        </table>

        ${pur.notes ? `<div class="invoice-notes"><strong>ملاحظات:</strong> ${pur.notes}</div>` : ''}

        <div class="invoice-footer">
          <div class="signature-line"><span>المورد</span></div>
          <div class="signature-line"><span>المستلم</span></div>
        </div>

        <div class="invoice-footer" style="margin-top:12px;padding-top:8px;border-top:1px solid #ddd;font-size:7pt;color:#999;">
          <div>تمت الطباعة: ${nowStr()}</div>
        </div>
      </div>
    `;

    setTimeout(() => { window.print(); }, 300);
  };

  // ============================================================
  // ACCOUNTS MODULE
  // ============================================================
  const initAccounts = () => {
    // Voucher type toggle
    qsa('#voucherTypeToggle .toggle-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        qsa('#voucherTypeToggle .toggle-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        const type = btn.dataset.voucher;
        qsa('.voucher-form').forEach((f) => f.style.display = 'none');
        const target = $('voucher' + type.charAt(0).toUpperCase() + type.slice(1));
        if (target) target.style.display = 'block';
        editingVoucherId = null; // Reset editing when switching types
      });
    });

    // Set dates
    $('receiptDate').value = todayStr();
    $('paymentDate').value = todayStr();
    $('journalDate').value = todayStr();

    // Receipt
    $('saveReceiptBtn').addEventListener('click', async () => {
      const customerId = $('receiptCustomer').value;
      const amount = parseNum($('receiptAmount').value);
      if (!customerId || !amount) { showToast('يرجى اختيار العميل وإدخال المبلغ', 'error'); return; }
      const data = {
        type: 'receipt',
        customerId,
        customerName: customersCache.find((c) => c.id === customerId)?.name || '',
        date: $('receiptDate').value,
        amount,
        currency: $('receiptCurrency').value,
        method: $('receiptMethod').value,
        reference: $('receiptRef').value,
        notes: `قبض من ${customersCache.find((c) => c.id === customerId)?.name || ''}`,
      };
      if (editingVoucherId) {
        await DB.updateVoucher(editingVoucherId, data);
        showToast('تم تحديث سند القبض', 'success');
      } else {
        await DB.addVoucher(data);
        showToast('تم تسجيل سند القبض بنجاح', 'success');
      }
      editingVoucherId = null;
      $('receiptAmount').value = '';
      $('receiptRef').value = '';
      await loadCustomers();
      await loadVouchersList();
      loadAccountsStats();
    });

    // Payment
    $('savePaymentBtn').addEventListener('click', async () => {
      const supplierId = $('paymentSupplier').value;
      const amount = parseNum($('paymentAmount').value);
      if (!supplierId || !amount) { showToast('يرجى اختيار المورد وإدخال المبلغ', 'error'); return; }
      const data = {
        type: 'payment',
        supplierId,
        supplierName: (await DB.getSuppliers()).find((s) => s.id === supplierId)?.name || '',
        date: $('paymentDate').value,
        amount,
        method: $('paymentMethod').value,
        currency: $('paymentCurrency').value,
        notes: $('paymentNotes').value || 'صرف للمورد',
      };
      if (editingVoucherId) {
        await DB.updateVoucher(editingVoucherId, data);
        showToast('تم تحديث سند الصرف', 'success');
      } else {
        await DB.addVoucher(data);
        showToast('تم تسجيل سند الصرف بنجاح', 'success');
      }
      editingVoucherId = null;
      $('paymentAmount').value = '';
      $('paymentNotes').value = '';
      await loadVouchersList();
      loadAccountsStats();
    });

    // Journal
    $('saveJournalBtn').addEventListener('click', async () => {
      const customerId = $('journalCustomer').value;
      const amount = parseNum($('journalAmount').value);
      const jType = $('journalType').value;
      if (!customerId || !amount) { showToast('يرجى اختيار العميل وإدخال المبلغ', 'error'); return; }
      const data = {
        type: 'journal',
        customerId,
        customerName: customersCache.find((c) => c.id === customerId)?.name || '',
        date: $('journalDate').value,
        amount,
        currency: $('journalCurrency').value,
        journalType: jType,
        notes: $('journalNotes').value || 'قيد آجل',
      };
      if (editingVoucherId) {
        await DB.updateVoucher(editingVoucherId, data);
        showToast('تم تحديث القيد الآجل', 'success');
      } else {
        await DB.addVoucher(data);
        showToast('تم تسجيل القيد الآجل بنجاح', 'success');
      }
      editingVoucherId = null;
      $('journalAmount').value = '';
      $('journalNotes').value = '';
      await loadCustomers();
      await loadVouchersList();
      loadAccountsStats();
    });

    // Refresh
    $('refreshVouchersBtn').addEventListener('click', loadVouchersList);
  };

  const loadAccountsData = async () => {
    await loadCustomers();
    loadAccountsStats();
    loadVouchersList();
    // Load suppliers for payment
    const suppliers = await DB.getSuppliers();
    const sel = $('paymentSupplier');
    sel.innerHTML = '<option value="">-- اختر المورد --</option>';
    suppliers.forEach((s) => { sel.innerHTML += `<option value="${s.id}">${s.name}</option>`; });
  };

  const loadAccountsStats = () => {
    const vouchers = DB.getVouchersSync();
    const totalReceipts = vouchers.filter((v) => v.type === 'receipt').reduce((s, v) => s + (v.amount || 0), 0);
    const totalPayments = vouchers.filter((v) => v.type === 'payment').reduce((s, v) => s + (v.amount || 0), 0);
    const totalBalance = customersCache.reduce((s, c) => s + (c.balance || 0), 0);

    $('accountsStats').innerHTML = `
      <div class="stat-card"><div class="stat-icon" style="background:#d1fae5;color:#065f46;">💰</div><div class="stat-label">إجمالي المقبوضات</div><div class="stat-value" style="color:#065f46;">${formatNum(totalReceipts)}</div></div>
      <div class="stat-card"><div class="stat-icon" style="background:#fee2e2;color:#991b1b;">💸</div><div class="stat-label">إجمالي المدفوعات</div><div class="stat-value" style="color:#991b1b;">${formatNum(totalPayments)}</div></div>
      <div class="stat-card"><div class="stat-icon" style="background:#dbeafe;color:#1e40af;">📊</div><div class="stat-label">أرصدة العملاء</div><div class="stat-value">${formatNum(totalBalance)}</div></div>
      <div class="stat-card"><div class="stat-icon" style="background:#fef3c7;color:#92400e;">📋</div><div class="stat-label">عدد القيود</div><div class="stat-value">${vouchers.length}</div></div>
    `;
  };

  const loadVouchersList = async () => {
    const vouchers = await DB.getVouchers();
    vouchers.sort((a, b) => new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt));

    const tbody = $('vouchersListBody');
    tbody.innerHTML = vouchers.map((v) => `
      <tr>
        <td class="font-medium">${v.number || '-'}</td>
        <td>${v.date ? v.date.slice(0, 10) : '-'}</td>
        <td><span class="badge ${v.type === 'receipt' ? 'badge-success' : v.type === 'payment' ? 'badge-danger' : 'badge-info'}">${v.type === 'receipt' ? 'قبض' : v.type === 'payment' ? 'صرف' : 'قيد آجل'}</span></td>
        <td>${v.customerName || v.supplierName || '-'}</td>
        <td class="font-medium">${formatNum(v.amount)}</td>
        <td>${v.notes || v.reference || '-'}</td>
        <td>
          <button class="btn btn-outline btn-xs print-voucher" data-id="${v.id}" title="طباعة">🖨️</button>
          <button class="btn btn-outline btn-xs edit-voucher" data-id="${v.id}" title="تعديل">✏️</button>
          <button class="btn btn-outline btn-xs delete-voucher" data-id="${v.id}" style="color:#ef4444;" title="حذف">🗑️</button>
        </td>
      </tr>
    `).join('') || '<tr><td colspan="7" class="text-center text-slate-400 py-8">لا توجد قيود مالية</td></tr>';

    // Edit voucher
    tbody.querySelectorAll('.edit-voucher').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const v = await DB.getVoucher(btn.dataset.id);
        if (!v) return;
        editVoucher(v);
      });
    });

    // Delete voucher
    tbody.querySelectorAll('.delete-voucher').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('هل أنت متأكد من حذف هذا القيد؟')) return;
        await DB.deleteVoucher(btn.dataset.id);
        showToast('تم حذف القيد', 'info');
        await loadVouchersList();
        await loadCustomers();
        loadAccountsStats();
      });
    });

    // Print voucher
    tbody.querySelectorAll('.print-voucher').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const v = await DB.getVoucher(btn.dataset.id);
        if (v) renderPrintVoucher(v);
      });
    });
  };

  // Store the editing voucher id globally (in accounts scope)
  let editingVoucherId = null;

  const editVoucher = (v) => {
    editingVoucherId = v.id;

    // Switch to the correct voucher type tab
    const typeMap = { receipt: 'receipt', payment: 'payment', journal: 'journal' };
    const targetType = typeMap[v.type] || 'receipt';
    qsa('#voucherTypeToggle .toggle-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.voucher === targetType);
    });
    qsa('.voucher-form').forEach((f) => f.style.display = 'none');
    const targetForm = $('voucher' + targetType.charAt(0).toUpperCase() + targetType.slice(1));
    if (targetForm) targetForm.style.display = 'block';

    // Populate fields
    if (v.type === 'receipt') {
      $('receiptDate').value = v.date ? v.date.slice(0, 10) : todayStr();
      $('receiptCustomer').value = v.customerId || '';
      $('receiptAmount').value = v.amount || '';
      $('receiptCurrency').value = v.currency || 'IQD';
      $('receiptMethod').value = v.method || 'نقدي';
      $('receiptRef').value = v.reference || '';
    } else if (v.type === 'payment') {
      $('paymentDate').value = v.date ? v.date.slice(0, 10) : todayStr();
      $('paymentSupplier').value = v.supplierId || '';
      $('paymentAmount').value = v.amount || '';
      $('paymentCurrency').value = v.currency || 'IQD';
      $('paymentMethod').value = v.method || 'نقدي';
      $('paymentNotes').value = v.notes || '';
    } else if (v.type === 'journal') {
      $('journalDate').value = v.date ? v.date.slice(0, 10) : todayStr();
      $('journalCustomer').value = v.customerId || '';
      $('journalAmount').value = v.amount || '';
      $('journalCurrency').value = v.currency || 'IQD';
      $('journalType').value = v.journalType || 'debit';
      $('journalNotes').value = v.notes || '';
    }

    showToast('تم تحميل بيانات القيد للتعديل', 'info');
  };

  // ============================================================
  // INVENTORY MODULE
  // ============================================================
  const loadInventoryData = async () => {
    // Preserve warehouse filter value before reload (loadWarehouses resets it)
    const savedWh = $('inventoryWarehouseFilter')?.value || '';
    await loadItems();
    await loadWarehouses();

    // Populate warehouse filter dropdown
    const whFilter = $('inventoryWarehouseFilter');
    if (whFilter) {
      const currentVal = whFilter.value || savedWh;
      whFilter.innerHTML = '<option value="">كل المخازن</option>' +
        warehousesCache.map((w) => `<option value="${w.id}" ${w.id === currentVal ? 'selected' : ''}>${w.name}</option>`).join('');
    }

    // Stock stats
    const stock = await DB.getStock();
    const items = await DB.getItems();
    const totalItems = items.length;
    let totalPieces = 0;
    let totalValue = 0;
    stock.forEach((st) => {
      const item = items.find((i) => i.id === st.itemId);
      const pc = item ? (item.piecesPerCarton || 1) : 1;
      const pb = item ? (item.piecesPerBag || 1) : 1;
      const pieceEquiv = (st.qtyPieces || 0) + (st.qtyCartons || 0) * pc + (st.qtyBags || 0) * pb;
      totalPieces += pieceEquiv;
      totalValue += pieceEquiv * (item ? item.defaultPrice : 0);
    });
    const lowStock = stock.filter((st) => {
      const item = items.find((i) => i.id === st.itemId);
      const pc = item ? (item.piecesPerCarton || 1) : 1;
      const pb = item ? (item.piecesPerBag || 1) : 1;
      const pieceEquiv = (st.qtyPieces || 0) + (st.qtyCartons || 0) * pc + (st.qtyBags || 0) * pb;
      return pieceEquiv < 10;
    }).length;

    $('inventoryStats').innerHTML = `
      <div class="stat-card"><div class="stat-icon" style="background:#dbeafe;color:#1e40af;">📦</div><div class="stat-label">إجمالي الأصناف</div><div class="stat-value">${totalItems}</div></div>
      <div class="stat-card"><div class="stat-icon" style="background:#d1fae5;color:#065f46;">📊</div><div class="stat-label">إجمالي القطع</div><div class="stat-value">${formatNum(totalPieces)}</div></div>
      <div class="stat-card"><div class="stat-icon" style="background:#fef3c7;color:#92400e;">💰</div><div class="stat-label">قيمة المخزون</div><div class="stat-value">${formatNum(totalValue)}</div></div>
      <div class="stat-card"><div class="stat-icon" style="background:#fee2e2;color:#991b1b;">⚠️</div><div class="stat-label">مخزون منخفض</div><div class="stat-value" style="color:#991b1b;">${lowStock}</div></div>
    `;

    // Stock table
    let stockData = await DB.getInventoryReport();
    const selectedWarehouse = whFilter ? whFilter.value : '';

    if (selectedWarehouse) {
      stockData = stockData.filter((s) => s.warehouseId === selectedWarehouse);
    } else {
      // Aggregate by item across all warehouses
      const aggregated = {};
      stockData.forEach((s) => {
        if (aggregated[s.itemId]) {
          aggregated[s.itemId].qtyPieces += s.qtyPieces || 0;
          aggregated[s.itemId].qtyCartons += s.qtyCartons || 0;
          aggregated[s.itemId].qtyBags += s.qtyBags || 0;
          aggregated[s.itemId].pieceEquiv += s.pieceEquiv || 0;
          aggregated[s.itemId].value += s.value || 0;
        } else {
          aggregated[s.itemId] = { ...s };
        }
      });
      stockData = Object.values(aggregated);
      stockData.forEach((s) => s.warehouseName = 'جميع المخازن');
    }

    // Normalize: convert excess pieces → cartons for display
    const allItems = await DB.getItems();
    stockData.forEach((s) => {
      const item = allItems.find((i) => i.id === s.itemId);
      if (!item) return;
      const pc = item.piecesPerCarton || 1;
      const extraCartons = Math.floor((s.qtyPieces || 0) / pc);
      if (extraCartons > 0) {
        s.qtyPieces = (s.qtyPieces || 0) % pc;
        s.qtyCartons = (s.qtyCartons || 0) + extraCartons;
        s.pieceEquiv = (s.qtyPieces || 0) + (s.qtyCartons || 0) * pc + (s.qtyBags || 0) * (item.piecesPerBag || 1);
        s.value = s.pieceEquiv * (s.defaultPrice || 0);
      }
    });

    const tbody = $('inventoryBody');
    tbody.innerHTML = stockData.map((s) => `
      <tr>
        <td>${s.itemCode || '-'}</td>
        <td class="font-medium">${s.itemName || '-'}</td>
        <td>${s.warehouseName || '-'}</td>
        <td class="text-center">${formatNum(s.qtyPieces || 0)}</td>
        <td class="text-center">${formatNum(s.qtyCartons || 0)}</td>
        <td class="text-center">${formatNum(s.qtyBags || 0)}</td>
        <td class="text-center font-medium">${formatNum(s.pieceEquiv || 0)}</td>
        <td>${formatNum(s.defaultPrice)}</td>
        <td class="font-medium">${formatNum(s.value)}</td>
        <td>
          ${!selectedWarehouse ? '' : `<button class="btn btn-outline btn-xs adjust-stock-btn" data-item="${s.itemId}" data-warehouse="${s.warehouseId}" data-qty-pieces="${s.qtyPieces || 0}" data-qty-cartons="${s.qtyCartons || 0}" data-qty-bags="${s.qtyBags || 0}">تعديل</button>`}
        </td>
      </tr>
    `).join('') || '<tr><td colspan="10" class="text-center text-slate-400 py-8">لا توجد بيانات مخزون</td></tr>';

    // Adjust stock (only when a specific warehouse is selected)
    if (selectedWarehouse) {
      tbody.querySelectorAll('.adjust-stock-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const itemId = btn.dataset.item;
          const warehouseId = btn.dataset.warehouse;
          const currPieces = parseInt(btn.dataset.qtyPieces);
          const currCartons = parseInt(btn.dataset.qtyCartons);
          const currBags = parseInt(btn.dataset.qtyBags);
          const newPieces = prompt('عدد القطع:', currPieces);
          if (newPieces === null) return;
          const newCartons = prompt('عدد الكرتون:', currCartons);
          if (newCartons === null) return;
          const newBags = prompt('عدد الأكياس:', currBags);
          if (newBags === null) return;
          const p = parseInt(newPieces);
          const c = parseInt(newCartons);
          const b = parseInt(newBags);
          if (!isNaN(p) && !isNaN(c) && !isNaN(b)) {
            DB.setStockQuantity(itemId, warehouseId, p, c, b).then(() => {
              showToast('تم تحديث الكمية', 'success');
              loadInventoryData();
            });
          }
        });
      });
    }

    // Movements
    const movements = await DB.getMovements();
    movements.sort((a, b) => new Date(b.date || b.id) - new Date(a.date || a.id));
    const mBody = $('movementsBody');
    mBody.innerHTML = movements.slice(0, 50).map((m) => {
      const item = itemsCache.find((i) => i.id === m.itemId);
      const wh = warehousesCache.find((w) => w.id === m.warehouseId);
      return `
        <tr>
          <td>${m.date ? m.date.slice(0, 16) : '-'}</td>
          <td>${item?.name || '-'}</td>
          <td>${wh?.name || '-'}</td>
          <td><span class="badge ${m.type === 'in' ? 'badge-success' : 'badge-danger'}">${m.type === 'in' ? 'إدخال' : 'إخراج'}</span></td>
          <td>${formatNum(m.quantity)} ${m.qtyType || 'قطعة'}</td>
          <td>${m.reference || '-'}</td>
        </tr>
      `;
    }).join('') || '<tr><td colspan="6" class="text-center text-slate-400 py-8">لا توجد حركات مخزون</td></tr>';

    // Stock transfer form
    const fromSelect = $('transferFromWarehouse');
    const toSelect = $('transferToWarehouse');
    if (fromSelect && toSelect) {
      const whOpts = warehousesCache.map((w) => `<option value="${w.id}">${w.name}</option>`).join('');
      fromSelect.innerHTML = `<option value="">اختر المصدر</option>${whOpts}`;
      toSelect.innerHTML = `<option value="">اختر الوجهة</option>${whOpts}`;
    }
  };

  // ============================================================
  // DATA MANAGEMENT (CRUD)
  // ============================================================
  let currentDataView = 'items';
  let editingCrudId = null;

  const initDataManagement = () => {
    // Toggle views
    qsa('#dataToggle .toggle-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        qsa('#dataToggle .toggle-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        currentDataView = btn.dataset.dataview;
        qsa('.data-section').forEach((s) => s.style.display = 'none');
        const target = $('data' + currentDataView.charAt(0).toUpperCase() + currentDataView.slice(1));
        if (target) target.style.display = 'block';
        loadDataManagement();
      });
    });

    // Add buttons
    $('addItemBtn').addEventListener('click', () => openCrudModal('item'));
    $('addCustomerBtn').addEventListener('click', () => openCrudModal('customer'));
    $('addSupplierBtn').addEventListener('click', () => openCrudModal('supplier'));
    $('addWarehouseBtn').addEventListener('click', () => openCrudModal('warehouse'));

    // Modal controls
    $('crudModalClose').addEventListener('click', closeCrudModal);
    $('crudModalCancel').addEventListener('click', closeCrudModal);
    $('crudModalSave').addEventListener('click', saveCrudModal);
    $('crudModal').addEventListener('click', (e) => {
      if (e.target === $('crudModal')) closeCrudModal();
    });
  };

  const loadDataManagement = async () => {
    switch (currentDataView) {
      case 'items': await loadItemsData(); break;
      case 'customers': await loadCustomersData(); break;
      case 'suppliers': await loadSuppliersData(); break;
      case 'warehouses': await loadWarehousesData(); break;
    }
  };

  // -- Items --
  const loadItemsData = async () => {
    const items = await DB.getItems();
    const tbody = $('itemsDataBody');
    tbody.innerHTML = items.map((i) => `
      <tr>
        <td class="font-medium">${i.code}</td>
        <td>${i.name}</td>
        <td>${i.weight || 0}</td>
        <td>${formatNum(i.defaultPrice)}</td>
        <td>${i.packaging || '-'}</td>
        <td style="font-size:11px;">كرتون: ${i.piecesPerCarton || 1} قطعة<br>كيس: ${i.piecesPerBag || 1} قطعة</td>
        <td>
          <button class="btn btn-outline btn-xs edit-item" data-id="${i.id}">✏️</button>
          <button class="btn btn-outline btn-xs delete-item" data-id="${i.id}" style="color:#ef4444;">🗑️</button>
        </td>
      </tr>
    `).join('') || '<tr><td colspan="7" class="text-center text-slate-400 py-8">لا توجد أصناف</td></tr>';

    tbody.querySelectorAll('.edit-item').forEach((btn) => {
      btn.addEventListener('click', () => openCrudModal('item', btn.dataset.id));
    });
    tbody.querySelectorAll('.delete-item').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('هل أنت متأكد من حذف هذا الصنف؟')) return;
        await DB.deleteItem(btn.dataset.id);
        showToast('تم حذف الصنف', 'info');
        loadDataManagement();
        loadInventoryData();
      });
    });
  };

  // -- Customers --
  const loadCustomersData = async () => {
    const customers = await DB.getCustomers();
    const tbody = $('customersDataBody');
    tbody.innerHTML = customers.map((c) => `
      <tr>
        <td class="font-medium">${c.name}</td>
        <td>${c.phone || '-'}</td>
        <td>${c.address || '-'}</td>
        <td class="font-medium">${formatNum(c.balance)}</td>
        <td>
          <button class="btn btn-outline btn-xs edit-customer" data-id="${c.id}">✏️</button>
          <button class="btn btn-outline btn-xs delete-customer" data-id="${c.id}" style="color:#ef4444;">🗑️</button>
        </td>
      </tr>
    `).join('') || '<tr><td colspan="5" class="text-center text-slate-400 py-8">لا يوجد عملاء</td></tr>';

    tbody.querySelectorAll('.edit-customer').forEach((btn) => {
      btn.addEventListener('click', () => openCrudModal('customer', btn.dataset.id));
    });
    tbody.querySelectorAll('.delete-customer').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('هل أنت متأكد من حذف هذا العميل؟')) return;
        await DB.deleteCustomer(btn.dataset.id);
        showToast('تم حذف العميل', 'info');
        await loadCustomers();
        loadDataManagement();
      });
    });
  };

  // -- Suppliers --
  const loadSuppliersData = async () => {
    const suppliers = await DB.getSuppliers();
    const tbody = $('suppliersDataBody');
    tbody.innerHTML = suppliers.map((s) => `
      <tr>
        <td class="font-medium">${s.name}</td>
        <td>${s.phone || '-'}</td>
        <td>${s.address || '-'}</td>
        <td>
          <button class="btn btn-outline btn-xs edit-supplier" data-id="${s.id}">✏️</button>
          <button class="btn btn-outline btn-xs delete-supplier" data-id="${s.id}" style="color:#ef4444;">🗑️</button>
        </td>
      </tr>
    `).join('') || '<tr><td colspan="4" class="text-center text-slate-400 py-8">لا يوجد موردين</td></tr>';

    tbody.querySelectorAll('.edit-supplier').forEach((btn) => {
      btn.addEventListener('click', () => openCrudModal('supplier', btn.dataset.id));
    });
    tbody.querySelectorAll('.delete-supplier').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('هل أنت متأكد من حذف هذا المورد؟')) return;
        await DB.deleteSupplier(btn.dataset.id);
        showToast('تم حذف المورد', 'info');
        loadDataManagement();
      });
    });
  };

  // -- Warehouses --
  const loadWarehousesData = async () => {
    const whs = await DB.getWarehouses();
    const tbody = $('warehousesDataBody');
    tbody.innerHTML = whs.map((w) => `
      <tr>
        <td class="font-medium">${w.name}</td>
        <td>
          <button class="btn btn-outline btn-xs delete-warehouse" data-id="${w.id}" style="color:#ef4444;">🗑️</button>
        </td>
      </tr>
    `).join('') || '<tr><td colspan="2" class="text-center text-slate-400 py-8">لا توجد مخازن</td></tr>';

    tbody.querySelectorAll('.delete-warehouse').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('هل أنت متأكد من حذف هذا المخزن؟')) return;
        await DB.deleteWarehouse(btn.dataset.id);
        showToast('تم حذف المخزن', 'info');
        await loadWarehouses();
        loadDataManagement();
      });
    });
  };

  // -- CRUD Modal --
  const openCrudModal = async (type, id = null) => {
    editingCrudId = id;
    const modal = $('crudModal');
    const title = $('crudModalTitle');
    const body = $('crudModalBody');

    modal.dataset.type = type;

    let data = {};
    if (id) {
      switch (type) {
        case 'item': data = await DB.getItem(id); break;
        case 'customer': data = await DB.getCustomer(id); break;
        case 'supplier': {
          const suppliers = await DB.getSuppliers();
          data = suppliers.find((s) => s.id === id) || {};
          break;
        }
        case 'warehouse': {
          const whs = await DB.getWarehouses();
          data = whs.find((w) => w.id === id) || {};
          break;
        }
      }
    }

    const labels = { item: 'صنف', customer: 'عميل', supplier: 'مورد', warehouse: 'مخزن' };
    title.textContent = id ? `تعديل ${labels[type]}` : `إضافة ${labels[type]}`;

    let html = '';
    switch (type) {
      case 'item':
        html = `
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><label class="form-label">كود الصنف</label><input type="text" id="crudCode" class="form-input" value="${data.code || ''}" /></div>
            <div><label class="form-label">اسم الصنف</label><input type="text" id="crudName" class="form-input" value="${data.name || ''}" /></div>
            <div><label class="form-label">الوزن للقطعة (كغم)</label><input type="number" id="crudWeight" class="form-input" step="0.001" value="${data.weight || 0}" /></div>
            <div><label class="form-label">سعر القطعة</label><input type="number" id="crudPrice" class="form-input" step="0.001" value="${data.defaultPrice || 0}" /></div>
            <div><label class="form-label">نوع التعبئة الافتراضي</label>
              <select id="crudPackaging" class="form-select">
                <option value="قطعة" ${data.packaging === 'قطعة' ? 'selected' : ''}>قطعة</option>
                <option value="كرتون" ${data.packaging === 'كرتون' ? 'selected' : ''}>كرتون</option>
                <option value="كيس" ${data.packaging === 'كيس' ? 'selected' : ''}>كيس</option>
              </select>
            </div>
            <div><label class="form-label">عدد القطع في الكرتون</label><input type="number" id="crudPiecesCarton" class="form-input" min="1" value="${data.piecesPerCarton || 1}" /></div>
            <div><label class="form-label">عدد القطع في الكيس</label><input type="number" id="crudPiecesBag" class="form-input" min="1" value="${data.piecesPerBag || 1}" /></div>
          </div>
        `;
        break;
      case 'customer':
        html = `
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><label class="form-label">اسم العميل</label><input type="text" id="crudName" class="form-input" value="${data.name || ''}" /></div>
            <div><label class="form-label">رقم الهاتف</label><input type="text" id="crudPhone" class="form-input" value="${data.phone || ''}" /></div>
            <div><label class="form-label">العنوان</label><textarea id="crudAddress" class="form-textarea">${data.address || ''}</textarea></div>
          </div>
        `;
        break;
      case 'supplier':
        html = `
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><label class="form-label">اسم المورد</label><input type="text" id="crudName" class="form-input" value="${data.name || ''}" /></div>
            <div><label class="form-label">رقم الهاتف</label><input type="text" id="crudPhone" class="form-input" value="${data.phone || ''}" /></div>
            <div><label class="form-label">العنوان</label><textarea id="crudAddress" class="form-textarea">${data.address || ''}</textarea></div>
          </div>
        `;
        break;
      case 'warehouse':
        html = `
          <div><label class="form-label">اسم المخزن</label><input type="text" id="crudName" class="form-input" value="${data.name || ''}" /></div>
        `;
        break;
    }

    body.innerHTML = html;
    modal.classList.add('open');
  };

  const closeCrudModal = () => {
    $('crudModal').classList.remove('open');
    editingCrudId = null;
  };

  const saveCrudModal = async () => {
    const type = $('crudModal').dataset.type;
    let data = {};
    let result;

    try {
      switch (type) {
        case 'item': {
          const code = document.getElementById('crudCode')?.value?.trim();
          const name = document.getElementById('crudName')?.value?.trim();
          if (!code || !name) { showToast('الكود والاسم مطلوبان', 'error'); return; }
          data = {
            code, name,
            weight: parseNum(document.getElementById('crudWeight')?.value),
            defaultPrice: parseNum(document.getElementById('crudPrice')?.value),
            packaging: document.getElementById('crudPackaging')?.value,
            piecesPerCarton: parseInt(document.getElementById('crudPiecesCarton')?.value) || 1,
            piecesPerBag: parseInt(document.getElementById('crudPiecesBag')?.value) || 1,
          };
          result = editingCrudId ? await DB.updateItem(editingCrudId, data) : await DB.addItem(data);
          break;
        }
        case 'customer': {
          const name = document.getElementById('crudName')?.value?.trim();
          if (!name) { showToast('اسم العميل مطلوب', 'error'); return; }
          data = { name, phone: document.getElementById('crudPhone')?.value?.trim(), address: document.getElementById('crudAddress')?.value?.trim() };
          result = editingCrudId ? await DB.updateCustomer(editingCrudId, data) : await DB.addCustomer(data);
          break;
        }
        case 'supplier': {
          const name = document.getElementById('crudName')?.value?.trim();
          if (!name) { showToast('اسم المورد مطلوب', 'error'); return; }
          data = { name, phone: document.getElementById('crudPhone')?.value?.trim(), address: document.getElementById('crudAddress')?.value?.trim() };
          result = editingCrudId ? await DB.updateSupplier(editingCrudId, data) : await DB.addSupplier(data);
          break;
        }
        case 'warehouse': {
          const name = document.getElementById('crudName')?.value?.trim();
          if (!name) { showToast('اسم المخزن مطلوب', 'error'); return; }
          data = { name };
          result = await DB.addWarehouse(data);
          break;
        }
      }

      showToast(`تم ${editingCrudId ? 'تحديث' : 'إضافة'} بنجاح`, 'success');
      closeCrudModal();
      await loadDataManagement();
      await loadCustomers();
      await loadWarehouses();
      await loadItems();

      // Refresh invoices if needed
      if (type === 'item') {
        await DB.getItems(); // refresh cache
      }
    } catch (err) {
      showToast(`خطأ: ${err.message}`, 'error');
    }
  };

  // ============================================================
  // REPORTS
  // ============================================================
  const initReports = () => {
    // Toggle report types
    qsa('#reportsToggle .toggle-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        qsa('#reportsToggle .toggle-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        const type = btn.dataset.report;
        qsa('.report-section').forEach((s) => s.style.display = 'none');
        const target = $('report' + type.charAt(0).toUpperCase() + type.slice(1));
        if (target) target.style.display = 'block';
      });
    });

    // Sales report
    $('generateSalesReportBtn').addEventListener('click', generateSalesReport);
    $('printSalesReportBtn').addEventListener('click', () => window.print());

    // Customer statement
    $('generateStatementBtn').addEventListener('click', generateCustomerStatement);
    $('printStatementBtn').addEventListener('click', printCustomerStatement);
  };

  const loadReportsData = async () => {
    await loadCustomers();
    // Populate customer dropdowns for reports
    ['reportSalesCustomer', 'reportStatementCustomer'].forEach((id) => {
      const sel = $(id);
      if (!sel) return;
      const val = sel.value;
      sel.innerHTML = '<option value="">كل العملاء</option>';
      if (id === 'reportStatementCustomer') sel.innerHTML = '<option value="">اختر العميل</option>';
      customersCache.forEach((c) => {
        sel.innerHTML += `<option value="${c.id}">${c.name}</option>`;
      });
      if (val) sel.value = val;
    });
    // Set default dates
    const d = new Date();
    $('reportSalesTo').value = todayStr();
    d.setMonth(d.getMonth() - 1);
    $('reportSalesFrom').value = d.toISOString().slice(0, 10);
  };

  const generateSalesReport = async () => {
    const from = $('reportSalesFrom').value;
    const to = $('reportSalesTo').value;
    const customerId = $('reportSalesCustomer').value;
    const invoices = await DB.getSalesReport(from, to, customerId || undefined);

    const tbody = $('reportSalesBody');
    let totalSum = 0, paidSum = 0, remainingSum = 0;

    tbody.innerHTML = invoices.map((inv) => {
      totalSum += inv.total || 0;
      paidSum += inv.amountPaid || 0;
      remainingSum += inv.remaining || 0;
      return `
        <tr>
          <td>${inv.number || '-'}</td>
          <td>${inv.date || '-'}</td>
          <td>${inv.customerName || '-'}</td>
          <td>${inv.type === 'sales_invoice' ? 'مبيعات' : inv.type === 'proforma' ? 'أولية' : 'عرض سعر'}</td>
          <td>${formatNum(inv.total)}</td>
          <td>${formatNum(inv.amountPaid)}</td>
          <td>${formatNum(inv.remaining)}</td>
        </tr>
      `;
    }).join('') || '<tr><td colspan="7" class="text-center text-slate-400 py-8">لا توجد فواتير في هذا النطاق</td></tr>';

    $('reportSalesTotal').textContent = formatNum(totalSum);
    $('reportSalesPaid').textContent = formatNum(paidSum);
    $('reportSalesRemaining').textContent = formatNum(remainingSum);
  };

  const generateCustomerStatement = async () => {
    const customerId = $('reportStatementCustomer').value;
    if (!customerId) {
      $('statementContent').innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><p>اختر العميل لعرض كشف الحساب</p></div>';
      return;
    }

    const currencyFilter = $('reportStatementCurrency').value;
    const html = await buildStatementHTML(customerId, currencyFilter);
    $('statementContent').innerHTML = html;

    // Click-to-navigate on statement links
    $('statementContent').querySelectorAll('.statement-link').forEach((a) => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        navigateToDocument(a.dataset.navType, a.dataset.navId);
      });
    });
  };

  const navigateToDocument = async (type, id) => {
    if (type === 'invoice') {
      const inv = await DB.getInvoice(id);
      if (!inv) { showToast('الفاتورة غير موجودة', 'error'); return; }
      editInvoice(inv);
    } else if (type === 'receipt' || type === 'journal') {
      const v = await DB.getVoucher(id);
      if (!v) { showToast('المستند غير موجود', 'error'); return; }
      // Switch to accounts tab
      qsa('.nav-item').forEach((n) => n.classList.remove('active'));
      const acctNav = qs('.nav-item[data-tab="accounts"]');
      if (acctNav) acctNav.classList.add('active');
      qsa('.tab-content').forEach((t) => t.classList.remove('active'));
      const tabAcct = $('tabAccounts');
      if (tabAcct) tabAcct.classList.add('active');
      $('topbarTitle').textContent = 'الحسابات';
      editVoucher(v);
    } else if (type === 'purchase') {
      editPurchase(id);
    }
  };

  const buildStatementHTML = async (customerId, currencyFilter) => {
    const { customer, invoices, vouchers } = await DB.getCustomerStatement(customerId);
    if (!customer) return '<div class="empty-state"><p>العميل غير موجود</p></div>';

    const renderStatementTable = (currency) => {
      const transactions = [];
      invoices.filter((inv) => !currency || (inv.currency || 'IQD') === currency).forEach((inv) => {
        const isReturn = inv.type === 'return_invoice';
        transactions.push({
          date: inv.date || inv.createdAt,
          desc: isReturn ? `مرتجع ${inv.number}` : `فاتورة ${inv.number}`,
          debit: isReturn ? (inv.amountPaid || 0) : (inv.total || 0),
          credit: isReturn ? (inv.total || 0) : (inv.amountPaid || 0),
          currency: inv.currency || 'IQD',
          navType: 'invoice',
          navId: inv.id,
        });
      });
      vouchers.filter((v) => (v.type === 'receipt' || v.type === 'journal') && (!currency || (v.currency || 'IQD') === currency)).forEach((v) => {
        if (v.type === 'receipt') {
          transactions.push({ date: v.date || v.createdAt, desc: `قبض ${v.number}`, debit: 0, credit: v.amount || 0, currency: v.currency || 'IQD', navType: 'receipt', navId: v.id });
        } else if (v.type === 'journal') {
          transactions.push({
            date: v.date || v.createdAt,
            desc: `قيد آجل ${v.number}`,
            debit: v.journalType === 'debit' ? (v.amount || 0) : 0,
            credit: v.journalType === 'credit' ? (v.amount || 0) : 0,
            currency: v.currency || 'IQD',
            navType: 'journal',
            navId: v.id,
          });
        }
      });

      if (transactions.length === 0) return '';

      transactions.sort((a, b) => new Date(a.date) - new Date(b.date));

      let runningBalance = 0;
      let rowsHtml = '';
      transactions.forEach((t) => {
        runningBalance += (t.debit || 0) - (t.credit || 0);
        const balanceColor = runningBalance > 0 ? 'text-red-600' : runningBalance < 0 ? 'text-green-600' : '';
        const descHtml = t.navId
          ? `<a href="#" class="statement-link" data-nav-type="${t.navType}" data-nav-id="${t.navId}">${t.desc}</a>`
          : t.desc;
        rowsHtml += `
          <tr>
            <td>${t.date ? t.date.slice(0, 10) : '-'}</td>
            <td>${descHtml}</td>
            <td class="${t.debit ? 'font-medium text-red-600' : ''}">${t.debit ? formatNum(t.debit) : '-'}</td>
            <td class="${t.credit ? 'font-medium text-green-600' : ''}">${t.credit ? formatNum(t.credit) : '-'}</td>
            <td class="font-medium ${balanceColor}">${formatNum(runningBalance)}</td>
          </tr>
        `;
      });

      const finalBalance = runningBalance;
      const balColor = finalBalance > 0 ? 'text-red-600' : finalBalance < 0 ? 'text-green-600' : 'text-slate-600';
      const balLabel = finalBalance > 0 ? '(مطلوب)' : finalBalance < 0 ? '(له رصيد)' : '';
      const curLabel = currency === 'IQD' ? 'دينار عراقي' : 'دولار أمريكي';

      return `
        <div class="mb-6">
          <h4 class="font-bold text-base mb-2" style="border-bottom:2px solid #e2e8f0;padding-bottom:4px;">
            ${curLabel}
            <span class="font-bold ${balColor} text-lg mr-2">${formatNum(Math.abs(finalBalance))} ${balLabel}</span>
          </h4>
          <div class="table-container">
            <table class="w-full">
              <thead>
                <tr>
                  <th>التاريخ</th>
                  <th>البيان</th>
                  <th>مدين (عليه)</th>
                  <th>دائن (له)</th>
                  <th>الرصيد</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml}
              </tbody>
            </table>
          </div>
        </div>
      `;
    };

    let html = `
      <div class="mb-4 p-4 bg-slate-50-dark rounded-xl">
        <h4 class="font-bold text-lg mb-2">${customer.name}</h4>
        <div class="grid grid-cols-2 gap-2 text-sm">
          <div><span class="text-slate-500">الهاتف:</span> ${customer.phone || '-'}</div>
          <div><span class="text-slate-500">العنوان:</span> ${customer.address || '-'}</div>
        </div>
      </div>
    `;

    if (currencyFilter) {
      const sectionHtml = renderStatementTable(currencyFilter);
      html += sectionHtml || '<div class="empty-state"><p>لا توجد معاملات بالعملة المحددة</p></div>';
    } else {
      const iqdHtml = renderStatementTable('IQD');
      const usdHtml = renderStatementTable('USD');
      if (!iqdHtml && !usdHtml) {
        html += '<div class="empty-state"><p>لا توجد معاملات لهذا العميل</p></div>';
      } else {
        html += iqdHtml + usdHtml;
      }
    }
    return html;
  };

  const printCustomerStatement = async () => {
    const customerId = $('reportStatementCustomer').value;
    if (!customerId) { showToast('يرجى اختيار عميل أولاً', 'error'); return; }
    const currencyFilter = $('reportStatementCurrency').value;
    const { customer } = await DB.getCustomerStatement(customerId);
    if (!customer) { showToast('العميل غير موجود', 'error'); return; }
    const html = await buildStatementHTML(customerId, currencyFilter);
    const company = DB.getSettingsSync();
    const printArea = $('printArea');
    printArea.innerHTML = `
      <div class="print-invoice">
        <div class="invoice-header">
          <div class="company-info">
            <h2>${company.companyName || 'شركة النظام المتكامل'}</h2>
            <p>${company.companyAddress || ''}</p>
            <p>${company.companyPhone ? 'هاتف: ' + company.companyPhone : ''} ${company.companyEmail ? 'بريد: ' + company.companyEmail : ''}</p>
          </div>
          <div class="invoice-title">
            <h1>كشف حساب</h1>
            <p>${customer.name}</p>
          </div>
        </div>
        ${html}
        <div class="invoice-footer" style="margin-top:12px;padding-top:8px;border-top:1px solid #ddd;font-size:7pt;color:#999;">
          <div>تمت الطباعة: ${nowStr()}</div>
        </div>
      </div>
    `;
    setTimeout(() => { window.print(); }, 300);
  };

  // ============================================================
  // SETTINGS (Company Info)
  // ============================================================
  const loadSettingsData = async () => {
    const settings = await DB.getSettings();
    $('companyName').value = settings.companyName || '';
    $('companyPhone').value = settings.companyPhone || '';
    $('companyAddress').value = settings.companyAddress || '';
    $('companyEmail').value = settings.companyEmail || '';
    $('companyTax').value = settings.companyTax || '';
    $('companyReg').value = settings.companyReg || '';
    // Show last imported file name
    const fileNameEl = $('dataFileName');
    if (fileNameEl) fileNameEl.textContent = localStorage.getItem('_lastDataFileName') || 'لم يتم اختيار ملف';
  };

  const initSettingsTab = () => {
    $('saveCompanyBtn').addEventListener('click', async () => {
      const data = {
        companyName: $('companyName').value.trim(),
        companyPhone: $('companyPhone').value.trim(),
        companyAddress: $('companyAddress').value.trim(),
        companyEmail: $('companyEmail').value.trim(),
        companyTax: $('companyTax').value.trim(),
        companyReg: $('companyReg').value.trim(),
      };
      await DB.updateSettings(data);
      showToast('تم حفظ معلومات الشركة', 'success');
    });
    // Browse data file
    $('browseDataFileBtn').addEventListener('click', () => $('dataFilePicker').click());
    $('dataFilePicker').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      $('dataFileName').textContent = `⏳ جاري تحميل ${file.name}...`;
      try {
        const text = await file.text();
        const jsonData = JSON.parse(text);
        try {
          await DB.importData(jsonData);
          // Persist file name in localStorage
          localStorage.setItem('_lastDataFileName', file.name);
          $('dataFileName').textContent = `✅ تم استيراد ${file.name} بنجاح`;
          showToast(`تم استيراد البيانات من ${file.name}`, 'success');
          // Reload data in all modules (skip init* to avoid duplicate listeners)
          await Promise.all([
            loadCustomers(), loadSuppliers(), loadWarehouses(),
            loadSalesList(), loadAccountsData(), loadInventoryData(),
            loadDataManagement(), loadReportsData(), loadSettingsData(),
            loadUsersData(), loadCashData(),
          ]);
          // Refresh current tab view
          const active = qs('.nav-item.active');
          if (active) active.click();
        } catch (importErr) {
          $('dataFileName').textContent = `❌ ${importErr.message}`;
          showToast(`فشل الاستيراد: ${importErr.message}`, 'error');
        }
      } catch (err) {
        const msg = err.message || 'خطأ غير معروف';
        $('dataFileName').textContent = `❌ ${msg}`;
        showToast(`خطأ: ${msg}`, 'error');
        console.error('Import error:', err);
      }
      e.target.value = '';
    });
    // Download data
    $('downloadDataBtn').addEventListener('click', () => {
      const stores = ['users','items','customers','suppliers','warehouses','invoices','vouchers','stock','movements','purchases','settings','cashMovements'];
      const data = {};
      stores.forEach((s) => {
        try { data[s] = JSON.parse(localStorage.getItem(s) || 'null') || []; } catch (_) { data[s] = []; }
      });
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `backup_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('تم تصدير نسخة احتياطية', 'success');
    });
  };

  // ============================================================
  // USERS MANAGEMENT
  // ============================================================
  const loadUsersData = async () => {
    const users = await DB.getUsers();
    const tbody = $('usersBody');
    tbody.innerHTML = users.map((u) => `
      <tr>
        <td><input type="text" class="form-input form-input-sm edit-name" data-id="${u.id}" value="${u.name || ''}" style="width:120px;" /></td>
        <td><input type="text" class="form-input form-input-sm edit-username" data-id="${u.id}" value="${u.username}" style="width:120px;" /></td>
        <td>
          <select class="form-select form-input-sm edit-role" data-id="${u.id}" style="width:100px;">
            <option value="Admin" ${u.role === 'Admin' ? 'selected' : ''}>مدير</option>
            <option value="Seller" ${u.role === 'Seller' ? 'selected' : ''}>بائع</option>
          </select>
        </td>
        <td><input type="text" class="form-input form-input-sm edit-password" data-id="${u.id}" value="${u.password}" style="width:120px;" /></td>
        <td><button class="btn btn-primary btn-xs save-user-btn" data-id="${u.id}">💾 حفظ</button></td>
      </tr>
    `).join('');

    tbody.querySelectorAll('.save-user-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const row = btn.closest('tr');
        const name = row.querySelector('.edit-name')?.value.trim();
        const username = row.querySelector('.edit-username')?.value.trim();
        const role = row.querySelector('.edit-role')?.value;
        const password = row.querySelector('.edit-password')?.value.trim();
        if (!name || !username || !password) {
          showToast('يرجى إدخال الاسم واسم المستخدم وكلمة المرور', 'error');
          return;
        }
        try {
          await DB.updateUser(id, { name, username, role, password });
          if (currentUser.id === id) {
            currentUser.name = name;
            currentUser.username = username;
            currentUser.role = role;
            currentUser.password = password;
            updateUserInfo();
          }
          showToast('تم تحديث بيانات المستخدم', 'success');
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    });

  };

  const initUsersTab = () => {
    $('addUserBtn').addEventListener('click', () => {
      $('usersAddRow').style.display = '';
      $('addUserBtn').style.display = 'none';
    });
    $('cancelNewUserBtn').addEventListener('click', () => {
      $('usersAddRow').style.display = 'none';
      $('addUserBtn').style.display = '';
      $('newUserName').value = '';
      $('newUserUsername').value = '';
      $('newUserPassword').value = '';
    });
    $('saveNewUserBtn').addEventListener('click', async () => {
      const name = $('newUserName').value.trim();
      const username = $('newUserUsername').value.trim();
      const role = $('newUserRole').value;
      const password = $('newUserPassword').value.trim();
      if (!name || !username || !password) {
        showToast('يرجى إدخال جميع الحقول', 'error');
        return;
      }
      try {
        await DB.addUser({ name, username, role, password });
        showToast('تم إضافة المستخدم', 'success');
        $('cancelNewUserBtn').click();
        loadUsersData();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    // Reset data
    $('resetSelectedBtn').addEventListener('click', handleResetData);
    $('resetSelectAllBtn').addEventListener('click', () => {
      qsa('#resetDataCheckboxes .reset-cb').forEach((cb) => cb.checked = true);
    });
    $('resetUnselectAllBtn').addEventListener('click', () => {
      qsa('#resetDataCheckboxes .reset-cb').forEach((cb) => cb.checked = false);
    });
  };

  // ============================================================
  // RESET / DELETE DATA
  // ============================================================
  const storeMap = {
    customers: 'customers',
    suppliers: 'suppliers',
    items: 'items',
    warehouses: 'warehouses',
    invoices: 'invoices',
    vouchers: 'vouchers',
    purchases: 'purchases',
    cash: 'cashMovements',
    stock: 'stock',
    movements: 'movements',
  };

  const handleResetData = async () => {
    const cbs = qsa('#resetDataCheckboxes .reset-cb:checked');
    const selected = Array.from(cbs).map((cb) => cb.value);
    if (selected.length === 0) {
      showToast('اختر نوع البيانات المراد حذفها أولاً', 'error');
      return;
    }
    if (!confirm(`هل أنت متأكد من حذف البيانات المحددة؟\n\nالمحدد: ${selected.join('، ')}`)) return;
    if (!confirm('هذا الإجراء لا يمكن التراجع عنه. هل أنت متأكد؟')) return;

    selected.forEach((key) => {
      const storeName = storeMap[key];
      if (storeName) DB.clearStore(storeName);
    });

    // Reset cache and reload
    customersCache = [];
    suppliersCache = [];
    warehousesCache = [];
    itemsCache = [];
    await loadAllData();
    showToast('تم حذف البيانات المحددة بنجاح', 'success');
  };

  // ============================================================
  // CASH BOX
  // ============================================================
  const loadCashData = async () => {
    // Stats
    const balance = await DB.getCashBalance();
    const today = todayStr();
    const all = await DB.getCashMovements();
    const todayMovements = all.filter((m) => (m.date || '').slice(0, 10) === today);
    const todayInIQD = todayMovements.filter((m) => m.type === 'in' && m.currency === 'IQD').reduce((s, m) => s + (m.amount || 0), 0);
    const todayOutIQD = todayMovements.filter((m) => m.type === 'out' && m.currency === 'IQD').reduce((s, m) => s + (m.amount || 0), 0);
    const todayInUSD = todayMovements.filter((m) => m.type === 'in' && m.currency === 'USD').reduce((s, m) => s + (m.amount || 0), 0);
    const todayOutUSD = todayMovements.filter((m) => m.type === 'out' && m.currency === 'USD').reduce((s, m) => s + (m.amount || 0), 0);

    $('cashStats').innerHTML = `
      <div class="stat-card"><div class="stat-icon" style="background:#dbeafe;color:#1e40af;">💰</div><div class="stat-label">رصيد الدينار</div><div class="stat-value" dir="ltr">${formatNum(balance.IQD)} د.ع</div></div>
      <div class="stat-card"><div class="stat-icon" style="background:#d1fae5;color:#065f46;">💵</div><div class="stat-label">رصيد الدولار</div><div class="stat-value" dir="ltr">${formatNum(balance.USD)} $</div></div>
      <div class="stat-card"><div class="stat-icon" style="background:#fef3c7;color:#92400e;">📥</div><div class="stat-label">قبض اليوم (دينار)</div><div class="stat-value" dir="ltr">${formatNum(todayInIQD)} د.ع</div></div>
      <div class="stat-card"><div class="stat-icon" style="background:#fee2e2;color:#991b1b;">📤</div><div class="stat-label">صرف اليوم (دينار)</div><div class="stat-value" dir="ltr">${formatNum(todayOutIQD)} د.ع</div></div>
      <div class="stat-card"><div class="stat-icon" style="background:#fef3c7;color:#92400e;">📥</div><div class="stat-label">قبض اليوم (دولار)</div><div class="stat-value" dir="ltr">${formatNum(todayInUSD)} $</div></div>
      <div class="stat-card"><div class="stat-icon" style="background:#fee2e2;color:#991b1b;">📤</div><div class="stat-label">صرف اليوم (دولار)</div><div class="stat-value" dir="ltr">${formatNum(todayOutUSD)} $</div></div>
    `;

    $('cashDate').value = todayStr();

    const actionBtns = (m) => {
      if (m.voucherId) return `<span class="text-xs text-slate-400">من اشعار</span>`;
      if (m.invoiceId) return `<span class="text-xs text-slate-400">من فاتورة</span>`;
      if (m.purchaseId) return `<span class="text-xs text-slate-400">من مشتريات</span>`;
      return `
      <div class="flex gap-1 justify-center">
        <button class="btn btn-xs btn-outline edit-cash" data-id="${m.id}">✏️</button>
        <button class="btn btn-xs btn-danger delete-cash" data-id="${m.id}">🗑️</button>
      </div>`;
    };

    // Today's movements
    $('cashTodayBody').innerHTML = todayMovements.map((m) => `
      <tr>
        <td>${(m.createdAt || m.date || '').slice(11, 19) || '-'}</td>
        <td><span class="badge ${m.type === 'in' ? 'badge-success' : 'badge-danger'}">${m.type === 'in' ? 'قبض' : 'صرف'}</span></td>
        <td>${m.currency === 'IQD' ? 'دينار' : 'دولار'}</td>
        <td class="font-medium ${m.type === 'in' ? 'text-green-600' : 'text-red-600'}">${formatNum(m.amount)}</td>
        <td>${m.description || '-'}</td>
        <td>${actionBtns(m)}</td>
      </tr>
    `).join('') || '<tr><td colspan="6" class="text-center text-slate-400 py-4">لا توجد حركات اليوم</td></tr>';

    // All movements
    $('cashAllBody').innerHTML = all.map((m) => `
      <tr>
        <td>${(m.date || m.createdAt || '').slice(0, 10) || '-'}</td>
        <td><span class="badge ${m.type === 'in' ? 'badge-success' : 'badge-danger'}">${m.type === 'in' ? 'قبض' : 'صرف'}</span></td>
        <td>${m.currency === 'IQD' ? 'دينار' : 'دولار'}</td>
        <td class="font-medium ${m.type === 'in' ? 'text-green-600' : 'text-red-600'}">${formatNum(m.amount)}</td>
        <td>${m.description || '-'}</td>
        <td>${actionBtns(m)}</td>
      </tr>
    `).join('') || '<tr><td colspan="6" class="text-center text-slate-400 py-4">لا توجد حركات نقدية</td></tr>';
  };

  const initCashTab = () => {
    let cashEditId = null;

    const resetForm = () => {
      cashEditId = null;
      $('cashAmount').value = '';
      $('cashDescription').value = '';
      $('saveCashEntryBtn').innerHTML = '💾 تسجيل';
      $('cancelCashEditBtn').style.display = 'none';
    };

    $('saveCashEntryBtn').addEventListener('click', async () => {
      const date = $('cashDate').value;
      const type = $('cashType').value;
      const currency = $('cashCurrency').value;
      const amount = parseNum($('cashAmount').value);
      const description = $('cashDescription').value.trim();
      if (!amount || amount <= 0) { showToast('يرجى إدخال مبلغ صحيح', 'error'); return; }
      if (cashEditId) {
        await DB.updateCashMovement(cashEditId, { date, type, currency, amount, description });
        showToast('تم تحديث الحركة النقدية', 'success');
      } else {
        await DB.addCashMovement({ date, type, currency, amount, description });
        showToast('تم تسجيل الحركة النقدية', 'success');
      }
      resetForm();
      loadCashData();
    });

    $('cancelCashEditBtn').addEventListener('click', resetForm);

    // Event delegation for edit/delete buttons
    $('cashTodayBody').addEventListener('click', handleCashAction);
    $('cashAllBody').addEventListener('click', handleCashAction);

    async function handleCashAction(e) {
      const btn = e.target.closest('button');
      if (!btn) return;
      if (btn.classList.contains('edit-cash')) {
        const id = btn.dataset.id;
        const all = await DB.getCashMovements();
        const m = all.find((x) => x.id === id);
        if (!m) return;
        cashEditId = id;
        $('cashDate').value = (m.date || '').slice(0, 10);
        $('cashType').value = m.type;
        $('cashCurrency').value = m.currency;
        $('cashAmount').value = m.amount;
        $('cashDescription').value = m.description || '';
        $('saveCashEntryBtn').innerHTML = '💾 تحديث';
        $('cancelCashEditBtn').style.display = 'inline-flex';
      }
      if (btn.classList.contains('delete-cash')) {
        if (!confirm('هل أنت متأكد من حذف هذه الحركة النقدية؟')) return;
        await DB.deleteCashMovement(btn.dataset.id);
        showToast('تم حذف الحركة النقدية', 'success');
        if (cashEditId === btn.dataset.id) resetForm();
        loadCashData();
      }
    }
  };

  // ============================================================
  // INVENTORY TAB INIT
  // ============================================================
  const printInventory = async () => {
    const stock = await DB.getStock();
    const items = await DB.getItems();
    const whs = await DB.getWarehouses();
    const selectedWh = $('inventoryWarehouseFilter');
    const whFilter = selectedWh ? selectedWh.value : '';
    const whLabel = selectedWh && selectedWh.options[selectedWh.selectedIndex]
      ? selectedWh.options[selectedWh.selectedIndex].text : 'جميع المخازن';

    let stockData = [];
    stock.forEach((s) => {
      const item = items.find((i) => i.id === s.itemId);
      const wh = whs.find((w) => w.id === s.warehouseId);
      if (!item || !wh) return;
      stockData.push({
        itemId: s.itemId, warehouseId: s.warehouseId,
        qtyPieces: s.qtyPieces || 0, qtyCartons: s.qtyCartons || 0, qtyBags: s.qtyBags || 0,
        itemName: item.name, itemCode: item.code,
        defaultPrice: item.defaultPrice || 0,
        piecesPerCarton: item.piecesPerCarton || 1, piecesPerBag: item.piecesPerBag || 1,
      });
    });

    if (whFilter) {
      stockData = stockData.filter((s) => s.warehouseId === whFilter);
    } else {
      const agg = {};
      stockData.forEach((s) => {
        if (agg[s.itemId]) {
          agg[s.itemId].qtyPieces += s.qtyPieces;
          agg[s.itemId].qtyCartons += s.qtyCartons;
          agg[s.itemId].qtyBags += s.qtyBags;
        } else {
          agg[s.itemId] = { ...s };
        }
      });
      stockData = Object.values(agg);
    }

    stockData.forEach((s) => {
      const pc = s.piecesPerCarton || 1;
      const pb = s.piecesPerBag || 1;
      const totalPieces = s.qtyPieces + s.qtyCartons * pc + s.qtyBags * pb;
      s._printCartons = Math.floor(totalPieces / pc);
      s._printPieces = totalPieces % pc;
      s._printValue = totalPieces * s.defaultPrice;
    });

    const company = DB.getSettingsSync();
    const totalValue = stockData.reduce((sum, s) => sum + s._printValue, 0);
    const printArea = $('printArea');
    printArea.innerHTML = `
      <div class="print-invoice">
        <div class="invoice-header">
          <div class="company-info">
            <h2>${company.companyName || 'شركة النظام المتكامل'}</h2>
            <p>${company.companyAddress || ''}</p>
            <p>${company.companyPhone ? 'هاتف: ' + company.companyPhone : ''} ${company.companyEmail ? 'بريد: ' + company.companyEmail : ''}</p>
          </div>
          <div class="invoice-title">
            <h1>تقرير المخزون الحالي</h1>
            <p>${whLabel}</p>
          </div>
        </div>
        <div style="margin-bottom:8px;font-size:7pt;color:#666;">تاريخ التقرير: ${nowStr()}</div>
        <table class="invoice-items" style="font-size:7pt;">
          <thead>
            <tr>
              <th>#</th>
              <th>اسم الصنف</th>
              <th>قطعة</th>
              <th>الكمية</th>
              <th>سعر الوحدة</th>
              <th>القيمة</th>
            </tr>
          </thead>
          <tbody>
            ${stockData.map((s, i) => `
              <tr>
                <td>${i + 1}</td>
                <td style="text-align:right;">${s.itemName || '-'}</td>
                <td>${formatNum(s._printPieces)}</td>
                <td>${formatNum(s._printCartons)}</td>
                <td>${formatNum(s.defaultPrice)}</td>
                <td>${formatNum(s._printValue)}</td>
              </tr>
            `).join('')}
          </tbody>
          <tfoot>
            <tr class="font-bold">
              <td colspan="5" style="text-align:left;">إجمالي قيمة المخزون:</td>
              <td>${formatNum(totalValue)}</td>
            </tr>
          </tfoot>
        </table>
        <div class="invoice-footer" style="margin-top:12px;padding-top:8px;border-top:1px solid #ddd;font-size:7pt;color:#999;">
          <div>تمت الطباعة: ${nowStr()}</div>
        </div>
      </div>
    `;
    setTimeout(() => { window.print(); }, 300);
  };

  const initInventoryTab = () => {
    const refreshBtn = $('refreshInventoryBtn');
    if (refreshBtn) refreshBtn.addEventListener('click', loadInventoryData);
    const whFilter = $('inventoryWarehouseFilter');
    if (whFilter) whFilter.addEventListener('change', loadInventoryData);
    const printBtn = $('printInventoryBtn');
    if (printBtn) printBtn.addEventListener('click', printInventory);

    // Stock transfer
    const transferSearch = $('transferItemSearch');
    const transferList = $('transferItemList');
    if (transferSearch && transferList) {
      let acTimeout;
      const showItems = async (query = '') => {
        clearTimeout(acTimeout);
        acTimeout = setTimeout(async () => {
          const items = await DB.getItems();
          const filtered = query ? items.filter((i) => i.name.includes(query) || i.code.includes(query)) : items;
          transferList.innerHTML = filtered
            .map((i) => `<div class="autocomplete-item" data-id="${i.id}" data-name="${i.name}">${i.name} <small>${i.code}</small></div>`)
            .join('');
          transferList.classList.toggle('open', filtered.length > 0);
          qsa('.autocomplete-item', transferList).forEach((el) => {
            el.addEventListener('click', () => {
              transferSearch.value = el.dataset.name;
              transferSearch.dataset.itemId = el.dataset.id;
              transferList.classList.remove('open');
            });
          });
        }, query ? 200 : 50);
      };
      transferSearch.addEventListener('input', () => {
        const val = transferSearch.value.trim();
        if (!val) { transferList.classList.remove('open'); return; }
        showItems(val);
      });
      transferSearch.addEventListener('focus', () => showItems(''));
      transferSearch.addEventListener('blur', () => setTimeout(() => transferList.classList.remove('open'), 300));
      transferSearch.addEventListener('click', () => { if (!transferList.classList.contains('open')) showItems(''); });
    }

    $('transferStockBtn')?.addEventListener('click', async () => {
      const fromId = $('transferFromWarehouse').value;
      const toId = $('transferToWarehouse').value;
      const itemId = transferSearch?.dataset.itemId;
      const qtyType = $('transferQtyType').value;
      const qty = parseInt($('transferQty').value);
      if (!fromId || !toId) { showToast('اختر المخازن', 'error'); return; }
      if (fromId === toId) { showToast('لا يمكن النقل لنفس المخزن', 'error'); return; }
      if (!itemId) { showToast('اختر الصنف', 'error'); return; }
      if (!qty || qty <= 0) { showToast('الكمية غير صالحة', 'error'); return; }
      if (!confirm(`نقل ${qty} ${qtyType} من المخزن المحدد إلى الآخر؟`)) return;
      try {
        await DB.transferStock(itemId, fromId, toId, qtyType, qty);
        showToast('تم النقل بنجاح', 'success');
        transferSearch.value = '';
        delete transferSearch.dataset.itemId;
        $('transferQty').value = '1';
        loadInventoryData();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  };

  // ============================================================
  // INIT
  // ============================================================
  const init = () => {
    initAuth();
    initThemeToggle();
    initNavigation();
    initSalesModule();
    initPurchasesModule();
    initAccounts();
    initDataManagement();
    initReports();
    initSettingsTab();
    initUsersTab();
    initCashTab();
    initInventoryTab();

    // Keyboard shortcut: Escape closes modal
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeCrudModal();
    });

    // Auto-refresh all tabs when DB syncs from server (multi-user)
    document.addEventListener('db-synced', async () => {
      const active = qs('.nav-item.active');
      const tab = active ? active.dataset.tab : 'sales';
      await Promise.all([
        loadCustomers(), loadSuppliers(), loadWarehouses(),
        loadSalesList(), loadAccountsData(), loadInventoryData(),
        loadDataManagement(), loadReportsData(), loadSettingsData(),
        loadUsersData(), loadCashData(),
      ]);
      if (tab === 'inventory') loadInventoryData();
      if (tab === 'accounts') loadAccountsData();
      if (tab === 'reports') loadReportsData();
      if (tab === 'data') loadDataManagement();
      if (tab === 'settings') loadSettingsData();
      if (tab === 'users') loadUsersData();
      if (tab === 'cash') loadCashData();
    });

    console.log('Accounting System initialized successfully');
  };

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return {
    // Expose for debugging
    DB,
  };
})();
