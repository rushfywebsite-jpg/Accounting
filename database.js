/**
 * database.js - Database Layer
 * In-memory store with automatic persistence to localStorage.
 * Data can be exported/imported as JSON files for portability.
 */

const DB = (() => {
  const STORES = {
    USERS: 'users',
    ITEMS: 'items',
    CUSTOMERS: 'customers',
    SUPPLIERS: 'suppliers',
    WAREHOUSES: 'warehouses',
    INVOICES: 'invoices',
    VOUCHERS: 'vouchers',
    STOCK: 'stock',
    MOVEMENTS: 'movements',
    PURCHASES: 'purchases',
    SETTINGS: 'settings',
    CASH: 'cashMovements',
  };

  const delay = (ms = 50) => new Promise((r) => setTimeout(r, ms));

  // In-memory store (synchronous reads/writes)
  const _memory = {};

  const get = (store) => _memory[store] ?? null;
  const set = (store, data) => { _memory[store] = data; _scheduleFlush(); };

  // === Server sync ===
  let _flushTimer = null;
  const _scheduleFlush = () => {
    if (_flushTimer) clearTimeout(_flushTimer);
    _flushTimer = setTimeout(() => { _flushTimer = null; _flush(); }, 300);
  };
  const _flush = async () => {
    // Always persist to localStorage
    Object.keys(_memory).forEach((k) => {
      try { localStorage.setItem(k, JSON.stringify(_memory[k])); } catch (_) {}
    });
    // Try server sync if available
    try {
      const res = await fetch('/api/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(_memory),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.error('Server save error:', err.error || res.statusText);
      }
    } catch (e) {
      // Server not available — localStorage fallback is already done above
    }
  };

  // === Config (legacy - kept for compatibility) ===
  const getConfig = async () => ({ dataFile: '' });
  const setConfig = async () => ({ ok: true });

  // === Import data from user-selected file ===
  const importData = async (jsonData) => {
    // Validate essential stores exist
    const essential = ['users', 'items', 'warehouses'];
    const missing = essential.filter((s) => !Array.isArray(jsonData[s]));
    if (missing.length) {
      throw new Error('ملف غير صالح - البيانات الأساسية مفقودة: ' + missing.join(', '));
    }
    // Cancel any pending flush
    if (_flushTimer) { clearTimeout(_flushTimer); _flushTimer = null; }
    // Save old memory in case flush fails
    const oldMemory = Object.assign({}, _memory);
    // Replace memory with new data
    Object.keys(_memory).forEach((k) => delete _memory[k]);
    Object.keys(jsonData).forEach((k) => { _memory[k] = jsonData[k]; });
    try {
      // Flush to server immediately
      await _flush();
      return true;
    } catch (e) {
      // Restore old memory on failure to prevent data loss
      Object.keys(_memory).forEach((k) => delete _memory[k]);
      Object.keys(oldMemory).forEach((k) => { _memory[k] = oldMemory[k]; });
      throw e;
    }
  };

  let _initPromise = null;
  let init = async (force) => {
    if (force) _initPromise = null;
    if (_initPromise) return _initPromise;
    _initPromise = (async () => {
      // Load from server
      try {
        const res = await fetch('/api/data');
        if (res.ok) {
          const data = await res.json();
          if (data && typeof data === 'object' && Object.keys(data).length > 0) {
            // Only accept data that has essential stores
            const essential = ['users', 'items', 'warehouses'];
            const valid = essential.every((s) => Array.isArray(data[s]));
            if (valid) {
              // Clear old memory then assign fresh data
              Object.keys(_memory).forEach((k) => delete _memory[k]);
              Object.keys(data).forEach((k) => { _memory[k] = data[k]; });
              return;
            }
          }
        }
      } catch (e) {
        console.warn('Server not reachable, trying localStorage fallback');
      }
      // Fallback: migrate from localStorage
      let migrated = false;
      Object.values(STORES).forEach((s) => {
        const val = localStorage.getItem(s);
        if (val) { _memory[s] = JSON.parse(val); migrated = true; }
      });
      ['_balanced_migrated', '_cash_migrated_v2', '_cash_desc_migrated'].forEach((f) => {
        const val = localStorage.getItem(f);
        if (val) _memory[f] = JSON.parse(val);
      });
      if (migrated) {
        await _flush();
        return;
      }
      // Seed fresh data if still empty
      _seed();
      await _flush();
      // Run migrations
      _runMigrations();
      await _flush();
    })();
    return _initPromise;
  };

  // Periodic sync: poll server version every 5s and fire event on change
  let _lastVersion = 0;
  const _pollForUpdates = async () => {
    try {
      const res = await fetch('/api/version');
      if (res.ok) {
        const { version } = await res.json();
        if (version && version !== _lastVersion) {
          _lastVersion = version;
          const dataRes = await fetch('/api/data');
          if (dataRes.ok) {
            const data = await dataRes.json();
            if (data && typeof data === 'object') {
              Object.keys(_memory).forEach((k) => delete _memory[k]);
              Object.keys(data).forEach((k) => { _memory[k] = data[k]; });
              document.dispatchEvent(new CustomEvent('db-synced'));
            }
          }
        }
      }
    } catch (_) { /* server not available — single user mode */ }
  };
  let _pollTimer = null;
  const _startPolling = () => {
    if (_pollTimer) clearInterval(_pollTimer);
    _pollTimer = setInterval(_pollForUpdates, 5000);
    _pollForUpdates();
  };
  // Start polling after init
  const origInit = init;
  init = async (force) => {
    await origInit(force);
    _startPolling();
  };

  // Force immediate sync (exposed for critical moments)
  const flush = async () => {
    if (_flushTimer) { clearTimeout(_flushTimer); _flushTimer = null; }
    await _flush();
  };

  // Sync data readers for app.js direct localStorage calls
  const getSettingsSync = () => get(STORES.SETTINGS) || {};
  const getUsersSync = () => get(STORES.USERS) || [];
  const getInvoicesSync = () => get(STORES.INVOICES) || [];
  const getVouchersSync = () => get(STORES.VOUCHERS) || [];

  const generateId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  const nextNumber = (prefix) => {
    const s = get(STORES.SETTINGS) || {};
    const key = `seq_${prefix}`;
    s[key] = (s[key] || 0) + 1;
    set(STORES.SETTINGS, s);
    return String(s[key]).padStart(5, '0');
  };

  const todayISO = () => new Date().toISOString().slice(0, 10);
  const nowISO = () => new Date().toISOString();

  // Seed initial data if empty
  const _seed = () => {
    if (!get(STORES.USERS)) {
      set(STORES.USERS, [
        { id: 'u1', username: 'admin', password: 'admin123', role: 'Admin', name: 'المدير العام' },
        { id: 'u2', username: 'seller', password: 'seller123', role: 'Seller', name: 'محمد البائع' },
      ]);
    }
    if (!get(STORES.WAREHOUSES)) {
      set(STORES.WAREHOUSES, [
        { id: 'w1', name: 'المستودع الرئيسي' },
        { id: 'w2', name: 'مستودع المواد الغذائية' },
      ]);
    }
    if (!get(STORES.ITEMS)) {
      set(STORES.ITEMS, [
        { id: 'i1', code: 'ITM001', name: 'مادة بلاستيكية', weight: 1.5, defaultPrice: 2500, packaging: 'كيس', piecesPerCarton: 24, piecesPerBag: 50 },
        { id: 'i2', code: 'ITM002', name: 'مادة معدنية', weight: 5.0, defaultPrice: 7500, packaging: 'كرتون', piecesPerCarton: 12, piecesPerBag: 30 },
        { id: 'i3', code: 'ITM003', name: 'مادة كيميائية', weight: 2.0, defaultPrice: 3200, packaging: 'قطعة', piecesPerCarton: 20, piecesPerBag: 40 },
        { id: 'i4', code: 'ITM004', name: 'مادة خشبية', weight: 10.0, defaultPrice: 12000, packaging: 'قطعة', piecesPerCarton: 10, piecesPerBag: 25 },
      ]);
    }
    if (!get(STORES.CUSTOMERS)) {
      set(STORES.CUSTOMERS, [
        { id: 'c1', name: 'شركة الأفق', phone: '07701234567', address: 'بغداد - الكرخ', balance: 0 },
        { id: 'c2', name: 'مؤسسة النور', phone: '07707654321', address: 'بغداد - الرصافة', balance: 0 },
      ]);
    }
    if (!get(STORES.SUPPLIERS)) {
      set(STORES.SUPPLIERS, [
        { id: 's1', name: 'المورد العام', phone: '07901112233', address: 'بغداد' },
      ]);
    }
    if (!get(STORES.STOCK)) {
      const stock = [];
      const items = get(STORES.ITEMS) || [];
      const whs = get(STORES.WAREHOUSES) || [];
      items.forEach((item) => {
        whs.forEach((wh) => {
          const total = Math.floor(Math.random() * 500) + 50;
          const cartons = Math.floor(total / (item.piecesPerCarton || 24) / 2);
          const bags = Math.floor(total / (item.piecesPerBag || 50) / 3);
          const pieces = total - (cartons * (item.piecesPerCarton || 24)) - (bags * (item.piecesPerBag || 50));
          stock.push({
            id: generateId(),
            itemId: item.id,
            warehouseId: wh.id,
            qtyPieces: Math.max(0, pieces),
            qtyCartons: Math.max(0, cartons),
            qtyBags: Math.max(0, bags),
          });
        });
      });
      set(STORES.STOCK, stock);
    }
    if (!get(STORES.INVOICES)) set(STORES.INVOICES, []);
    if (!get(STORES.PURCHASES)) set(STORES.PURCHASES, []);
    if (!get(STORES.VOUCHERS)) set(STORES.VOUCHERS, []);
    if (!get(STORES.MOVEMENTS)) set(STORES.MOVEMENTS, []);
    if (!get(STORES.CASH)) set(STORES.CASH, []);
    if (!get(STORES.SETTINGS)) set(STORES.SETTINGS, {});
  };

  // Run init immediately (completes before first data access via login flow)
  init();

  // ==================== USERS ====================
  const authenticate = async (username, password) => {
    await init();
    await delay();
    const users = get(STORES.USERS) || [];
    return users.find((u) => u.username === username && u.password === password) || null;
  };

  // ==================== ITEMS ====================
  const getItems = async () => { await delay(); return get(STORES.ITEMS) || []; };
  const getItem = async (id) => { await delay(); const items = get(STORES.ITEMS) || []; return items.find((i) => i.id === id) || null; };
  const addItem = async (data) => {
    await delay();
    const items = get(STORES.ITEMS) || [];
    const item = { id: generateId(), ...data };
    items.push(item);
    set(STORES.ITEMS, items);
    // Add stock for all warehouses
    const stock = get(STORES.STOCK) || [];
    const whs = get(STORES.WAREHOUSES) || [];
    whs.forEach((wh) => {
      stock.push({ id: generateId(), itemId: item.id, warehouseId: wh.id, qtyPieces: 0, qtyCartons: 0, qtyBags: 0 });
    });
    set(STORES.STOCK, stock);
    return item;
  };
  const updateItem = async (id, data) => {
    await delay();
    const items = get(STORES.ITEMS) || [];
    const idx = items.findIndex((i) => i.id === id);
    if (idx === -1) throw new Error('Item not found');
    items[idx] = { ...items[idx], ...data };
    set(STORES.ITEMS, items);
    return items[idx];
  };
  const deleteItem = async (id) => {
    await delay();
    let items = get(STORES.ITEMS) || [];
    items = items.filter((i) => i.id !== id);
    set(STORES.ITEMS, items);
    // Remove related stock
    let stock = get(STORES.STOCK) || [];
    stock = stock.filter((s) => s.itemId !== id);
    set(STORES.STOCK, stock);
    // Remove related movements
    let movements = get(STORES.MOVEMENTS) || [];
    movements = movements.filter((m) => m.itemId !== id);
    set(STORES.MOVEMENTS, movements);
  };

  // ==================== CUSTOMERS ====================
  const getCustomers = async () => { await delay(); return get(STORES.CUSTOMERS) || []; };
  const getCustomer = async (id) => { await delay(); const c = get(STORES.CUSTOMERS) || []; return c.find((x) => x.id === id) || null; };
  const addCustomer = async (data) => {
    await delay();
    const customers = get(STORES.CUSTOMERS) || [];
    const customer = { id: generateId(), balance: 0, ...data };
    customers.push(customer);
    set(STORES.CUSTOMERS, customers);
    return customer;
  };
  const updateCustomer = async (id, data) => {
    await delay();
    const customers = get(STORES.CUSTOMERS) || [];
    const idx = customers.findIndex((c) => c.id === id);
    if (idx === -1) throw new Error('Customer not found');
    customers[idx] = { ...customers[idx], ...data };
    set(STORES.CUSTOMERS, customers);
    return customers[idx];
  };
  const deleteCustomer = async (id) => {
    await delay();
    let customers = get(STORES.CUSTOMERS) || [];
    customers = customers.filter((c) => c.id !== id);
    set(STORES.CUSTOMERS, customers);
  };

  // ==================== SUPPLIERS ====================
  const getSuppliers = async () => { await delay(); return get(STORES.SUPPLIERS) || []; };
  const addSupplier = async (data) => {
    await delay();
    const suppliers = get(STORES.SUPPLIERS) || [];
    const supplier = { id: generateId(), ...data };
    suppliers.push(supplier);
    set(STORES.SUPPLIERS, suppliers);
    return supplier;
  };
  const updateSupplier = async (id, data) => {
    await delay();
    const suppliers = get(STORES.SUPPLIERS) || [];
    const idx = suppliers.findIndex((s) => s.id === id);
    if (idx === -1) throw new Error('Supplier not found');
    suppliers[idx] = { ...suppliers[idx], ...data };
    set(STORES.SUPPLIERS, suppliers);
    return suppliers[idx];
  };
  const deleteSupplier = async (id) => {
    await delay();
    let suppliers = get(STORES.SUPPLIERS) || [];
    suppliers = suppliers.filter((s) => s.id !== id);
    set(STORES.SUPPLIERS, suppliers);
  };

  // ==================== WAREHOUSES ====================
  const getWarehouses = async () => { await delay(); return get(STORES.WAREHOUSES) || []; };
  const addWarehouse = async (data) => {
    await delay();
    const whs = get(STORES.WAREHOUSES) || [];
    const wh = { id: generateId(), ...data };
    whs.push(wh);
    set(STORES.WAREHOUSES, whs);
    // Add stock entries for all items
    const stock = get(STORES.STOCK) || [];
    const items = get(STORES.ITEMS) || [];
    items.forEach((item) => {
      if (!stock.find((s) => s.itemId === item.id && s.warehouseId === wh.id)) {
        stock.push({ id: generateId(), itemId: item.id, warehouseId: wh.id, qtyPieces: 0, qtyCartons: 0, qtyBags: 0 });
      }
    });
    set(STORES.STOCK, stock);
    return wh;
  };
  const deleteWarehouse = async (id) => {
    await delay();
    let whs = get(STORES.WAREHOUSES) || [];
    whs = whs.filter((w) => w.id !== id);
    set(STORES.WAREHOUSES, whs);
    let stock = get(STORES.STOCK) || [];
    stock = stock.filter((s) => s.warehouseId !== id);
    set(STORES.STOCK, stock);
  };

  // ==================== STOCK / INVENTORY ====================
  const getStock = async () => { await delay(); return get(STORES.STOCK) || []; };
  const getStockByItem = async (itemId) => {
    await delay();
    const stock = get(STORES.STOCK) || [];
    return stock.filter((s) => s.itemId === itemId);
  };
  const normalizeStock = (stockItem) => {
    const items = get(STORES.ITEMS) || [];
    const item = items.find((i) => i.id === stockItem.itemId);
    if (!item) return;
    const pc = item.piecesPerCarton || 1;
    // Convert excess pieces → cartons only
    while (stockItem.qtyPieces >= pc) {
      stockItem.qtyPieces -= pc;
      stockItem.qtyCartons += 1;
    }
  };

  const updateStock = async (itemId, warehouseId, qtyType, delta) => {
    await delay();
    const stock = get(STORES.STOCK) || [];
    const idx = stock.findIndex((s) => s.itemId === itemId && s.warehouseId === warehouseId);
    if (idx === -1) throw new Error('Stock record not found');
    const items = get(STORES.ITEMS) || [];
    const item = items.find((i) => i.id === itemId);
    const pc = item ? (item.piecesPerCarton || 1) : 1;
    const pb = item ? (item.piecesPerBag || 1) : 1;
    const field = qtyType === 'كرتون' ? 'qtyCartons' : qtyType === 'كيس' ? 'qtyBags' : 'qtyPieces';
    // Auto-convert larger units when deducting and not enough in target field
    if (delta < 0 && stock[idx][field] + delta < 0) {
      if (qtyType === 'قطعة') {
        const shortfall = Math.abs(stock[idx][field] + delta);
        const cartonsNeeded = Math.ceil(shortfall / pc);
        if (stock[idx].qtyCartons >= cartonsNeeded) {
          stock[idx].qtyCartons -= cartonsNeeded;
          stock[idx].qtyPieces += cartonsNeeded * pc;
        } else if (stock[idx].qtyCartons > 0) {
          stock[idx].qtyPieces += stock[idx].qtyCartons * pc;
          stock[idx].qtyCartons = 0;
        }
        if (stock[idx][field] + delta < 0) {
          const remaining = Math.abs(stock[idx][field] + delta);
          const bagsNeeded = Math.ceil(remaining / pb);
          if (stock[idx].qtyBags >= bagsNeeded) {
            stock[idx].qtyBags -= bagsNeeded;
            stock[idx].qtyPieces += bagsNeeded * pb;
          } else if (stock[idx].qtyBags > 0) {
            stock[idx].qtyPieces += stock[idx].qtyBags * pb;
            stock[idx].qtyBags = 0;
          }
        }
      } else if (qtyType === 'كرتون') {
        const shortfall = Math.abs(stock[idx][field] + delta);
        const neededPieces = shortfall * pc;
        const bagsNeeded = Math.ceil(neededPieces / pb);
        if (stock[idx].qtyBags >= bagsNeeded) {
          stock[idx].qtyBags -= bagsNeeded;
          const addedPieces = bagsNeeded * pb;
          stock[idx].qtyPieces += addedPieces % pc;
          stock[idx].qtyCartons += Math.floor(addedPieces / pc);
        } else if (stock[idx].qtyBags > 0) {
          const addedPieces = stock[idx].qtyBags * pb;
          stock[idx].qtyPieces += addedPieces % pc;
          stock[idx].qtyCartons += Math.floor(addedPieces / pc);
          stock[idx].qtyBags = 0;
        }
      }
    }
    stock[idx][field] += delta;
    if (stock[idx][field] < 0) throw new Error('Insufficient stock');
    // Normalize: convert excess pieces → cartons, excess cartons → bags
    normalizeStock(stock[idx]);
    set(STORES.STOCK, stock);
    return stock[idx];
  };
  const setStockQuantity = async (itemId, warehouseId, qtyPieces, qtyCartons, qtyBags) => {
    await delay();
    const stock = get(STORES.STOCK) || [];
    const idx = stock.findIndex((s) => s.itemId === itemId && s.warehouseId === warehouseId);
    if (idx === -1) throw new Error('Stock record not found');
    if (qtyPieces !== undefined) stock[idx].qtyPieces = qtyPieces;
    if (qtyCartons !== undefined) stock[idx].qtyCartons = qtyCartons;
    if (qtyBags !== undefined) stock[idx].qtyBags = qtyBags;
    set(STORES.STOCK, stock);
    return stock[idx];
  };

  // ==================== MOVEMENTS ====================
  const getMovements = async () => { await delay(); return get(STORES.MOVEMENTS) || []; };
  const addMovement = async (data) => {
    await delay();
    const movements = get(STORES.MOVEMENTS) || [];
    const movement = { id: generateId(), date: nowISO(), ...data };
    movements.push(movement);
    set(STORES.MOVEMENTS, movements);
    return movement;
  };

  const transferStock = async (itemId, fromWarehouseId, toWarehouseId, qtyType, quantity) => {
    await delay();
    if (fromWarehouseId === toWarehouseId) throw new Error('لا يمكن النقل لنفس المخزن');
    if (!quantity || quantity <= 0) throw new Error('الكمية غير صالحة');
    const items = get(STORES.ITEMS) || [];
    const item = items.find((i) => i.id === itemId);
    if (!item) throw new Error('الصنف غير موجود');
    // Deduct from source
    await updateStock(itemId, fromWarehouseId, qtyType, -quantity);
    await addMovement({ itemId, warehouseId: fromWarehouseId, type: 'out', quantity, qtyType, reference: `نقل مخزني` });
    // Create destination stock record if not exists
    const stock = get(STORES.STOCK) || [];
    const destIdx = stock.findIndex((s) => s.itemId === itemId && s.warehouseId === toWarehouseId);
    if (destIdx === -1) {
      stock.push({ id: generateId(), itemId, warehouseId: toWarehouseId, qtyPieces: 0, qtyCartons: 0, qtyBags: 0 });
      set(STORES.STOCK, stock);
    }
    await updateStock(itemId, toWarehouseId, qtyType, quantity);
    await addMovement({ itemId, warehouseId: toWarehouseId, type: 'in', quantity, qtyType, reference: `نقل مخزني` });
  };

  // ==================== INVOICES ====================
  const getInvoices = async () => { await delay(); return get(STORES.INVOICES) || []; };
  const getInvoice = async (id) => {
    await delay();
    const invoices = get(STORES.INVOICES) || [];
    return invoices.find((inv) => inv.id === id) || null;
  };
  const saveInvoice = async (data) => {
    await delay();
    const invoices = get(STORES.INVOICES) || [];
    const isReturn = data.type === 'return_invoice';
    if (data.id) {
      const idx = invoices.findIndex((inv) => inv.id === data.id);
      if (idx !== -1) {
        // Update cash movement on edit
        let cash = get(STORES.CASH) || [];
        cash = cash.filter((m) => m.invoiceId !== data.id);
        if ((data.amountPaid || 0) > 0) {
          cash.push({
            id: generateId(),
            createdAt: nowISO(),
            date: data.date || todayISO(),
            type: isReturn ? 'out' : 'in',
            currency: data.currency || 'IQD',
            amount: data.amountPaid || 0,
            description: isReturn ? `مرتجع ${data.number} - ${data.customerName || ''}` : `فاتورة ${data.number} - ${data.customerName || ''}`,
            invoiceId: data.id,
          });
        }
        set(STORES.CASH, cash);
        invoices[idx] = { ...invoices[idx], ...data };
        set(STORES.INVOICES, invoices);
        return invoices[idx];
      }
    }
    const inv = { id: generateId(), createdAt: nowISO(), ...data };
    invoices.push(inv);
    set(STORES.INVOICES, invoices);
    // Add cash movement on new invoice
    if ((data.amountPaid || 0) > 0) {
      const cash = get(STORES.CASH) || [];
      cash.push({
        id: generateId(),
        createdAt: nowISO(),
        date: data.date || todayISO(),
        type: isReturn ? 'out' : 'in',
        currency: data.currency || 'IQD',
        amount: data.amountPaid || 0,
        description: isReturn ? `مرتجع ${inv.number} - ${data.customerName || ''}` : `فاتورة ${inv.number} - ${data.customerName || ''}`,
        invoiceId: inv.id,
      });
      set(STORES.CASH, cash);
    }
    return inv;
  };
  const deleteInvoice = async (id) => {
    await delay();
    const invoices = get(STORES.INVOICES) || [];
    const invoice = invoices.find((inv) => inv.id === id);
    if (!invoice) return;
    const isReturn = invoice.type === 'return_invoice';
    // Restore stock for each item (reverse direction for returns)
    for (const item of invoice.items || []) {
      if (item.warehouseId && item.itemId) {
        try {
          await updateStock(item.itemId, item.warehouseId, item.qtyType || 'قطعة', isReturn ? -(item.quantity || 0) : (item.quantity || 0));
        } catch (e) {
          console.warn('Stock restore failed for item:', item.itemId, e.message);
        }
      }
    }
    // Remove associated movements
    let movements = get(STORES.MOVEMENTS) || [];
    movements = movements.filter((m) => m.invoiceId !== id);
    set(STORES.MOVEMENTS, movements);
    // Remove associated cash movement
    let cash = get(STORES.CASH) || [];
    cash = cash.filter((m) => m.invoiceId !== id);
    set(STORES.CASH, cash);
    // Recalculate customer balance if affected by invoice
    if (invoice.customerId && (invoice.paymentType === 'آجل' || invoice.type === 'return_invoice')) {
      recalculateAllBalances();
    }
    // Remove invoice
    const remaining = invoices.filter((inv) => inv.id !== id);
    set(STORES.INVOICES, remaining);
  };

  // Finalize invoice: deduct stock for sales, add stock for returns
  const finalizeInvoice = async (invoiceData) => {
    await delay();
    const inv = await saveInvoice(invoiceData);
    const isReturn = inv.type === 'return_invoice';
    const stockDelta = isReturn ? 1 : -1;
    const movType = isReturn ? 'in' : 'out';
    const refPrefix = isReturn ? 'مرتجع' : 'فاتورة';
    for (const item of inv.items || []) {
      if (item.warehouseId && item.itemId) {
        try {
          await updateStock(item.itemId, item.warehouseId, item.qtyType || 'قطعة', stockDelta * (item.quantity || 0));
          await addMovement({
            itemId: item.itemId,
            warehouseId: item.warehouseId,
            type: movType,
            quantity: item.quantity,
            qtyType: item.qtyType || 'قطعة',
            reference: `${refPrefix} ${inv.number}`,
            invoiceId: inv.id,
          });
        } catch (e) {
          console.warn('Stock update failed for item:', item.itemId, e.message);
        }
      }
    }
    // Update customer balance for deferred (آجل) or return invoices
    if ((invoiceData.paymentType === 'آجل' || isReturn) && invoiceData.customerId) {
      const customers = get(STORES.CUSTOMERS) || [];
      const cIdx = customers.findIndex((c) => c.id === invoiceData.customerId);
      if (cIdx !== -1) {
        const total = invoiceData.total || 0;
        const paid = invoiceData.amountPaid || 0;
        const balanceDelta = isReturn ? -(total - paid) : (total - paid);
        customers[cIdx].balance = (customers[cIdx].balance || 0) + balanceDelta;
        set(STORES.CUSTOMERS, customers);
      }
    }
    return inv;
  };

  // ==================== PURCHASES ====================
  const getPurchases = async () => { await delay(); return get(STORES.PURCHASES) || []; };
  const getPurchase = async (id) => {
    await delay();
    const purchases = get(STORES.PURCHASES) || [];
    return purchases.find((p) => p.id === id) || null;
  };
  const deletePurchase = async (id) => {
    await delay();
    const purchases = get(STORES.PURCHASES) || [];
    const purchase = purchases.find((p) => p.id === id);
    if (!purchase) return;
    // Remove stock for each item (reverse of adding)
    for (const item of purchase.items || []) {
      if (item.warehouseId && item.itemId) {
        try {
          await updateStock(item.itemId, item.warehouseId, item.qtyType || 'قطعة', -(item.quantity || 0));
        } catch (e) {
          console.warn('Stock reverse failed for purchase item:', item.itemId, e.message);
        }
      }
    }
    // Remove associated movements
    let movements = get(STORES.MOVEMENTS) || [];
    movements = movements.filter((m) => m.purchaseId !== id);
    set(STORES.MOVEMENTS, movements);
    // Remove associated cash movement
    let cash = get(STORES.CASH) || [];
    cash = cash.filter((m) => m.purchaseId !== id);
    set(STORES.CASH, cash);
    // Remove purchase
    const remaining = purchases.filter((p) => p.id !== id);
    set(STORES.PURCHASES, remaining);
  };
  const savePurchase = async (data) => {
    await delay();
    const purchases = get(STORES.PURCHASES) || [];
    if (data.id) {
      const idx = purchases.findIndex((p) => p.id === data.id);
      if (idx !== -1) {
        // Update cash movement on edit
        let cash = get(STORES.CASH) || [];
        cash = cash.filter((m) => m.purchaseId !== data.id);
        if ((data.amountPaid || 0) > 0) {
          cash.push({
            id: generateId(),
            createdAt: nowISO(),
            date: data.date || todayISO(),
            type: 'out',
            currency: data.currency || 'IQD',
            amount: data.amountPaid || 0,
            description: `مشتريات ${data.number} - ${data.supplierName || ''}`,
            purchaseId: data.id,
          });
        }
        set(STORES.CASH, cash);
        purchases[idx] = { ...purchases[idx], ...data };
        set(STORES.PURCHASES, purchases);
        return purchases[idx];
      }
    }
    const pur = { id: generateId(), createdAt: nowISO(), ...data };
    purchases.push(pur);
    set(STORES.PURCHASES, purchases);
    // Add cash movement on new purchase
    if ((data.amountPaid || 0) > 0) {
      const cash = get(STORES.CASH) || [];
      cash.push({
        id: generateId(),
        createdAt: nowISO(),
        date: data.date || todayISO(),
        type: 'out',
        currency: data.currency || 'IQD',
        amount: data.amountPaid || 0,
        description: `مشتريات ${pur.number} - ${data.supplierName || ''}`,
        purchaseId: pur.id,
      });
      set(STORES.CASH, cash);
    }
    return pur;
  };
  const finalizePurchase = async (purchaseData) => {
    await delay();
    const pur = await savePurchase(purchaseData);
    // Add stock for each item (reverse of sales)
    for (const item of pur.items || []) {
      if (item.warehouseId && item.itemId) {
        try {
          await updateStock(item.itemId, item.warehouseId, item.qtyType || 'قطعة', item.quantity || 0);
          await addMovement({
            itemId: item.itemId,
            warehouseId: item.warehouseId,
            type: 'in',
            quantity: item.quantity,
            qtyType: item.qtyType || 'قطعة',
            reference: `مشتريات ${pur.number}`,
            purchaseId: pur.id,
          });
        } catch (e) {
          console.warn('Stock add failed for purchase item:', item.itemId, e.message);
        }
      }
    }
    return pur;
  };

  // ==================== VOUCHERS ====================
  const getVouchers = async () => { await delay(); return get(STORES.VOUCHERS) || []; };
  const getVoucher = async (id) => {
    await delay();
    const vouchers = get(STORES.VOUCHERS) || [];
    return vouchers.find((v) => v.id === id) || null;
  };
  const addVoucher = async (data) => {
    await delay();
    const vouchers = get(STORES.VOUCHERS) || [];
    const voucher = { id: generateId(), date: nowISO(), number: data.number || nextNumber('V'), ...data };
    vouchers.push(voucher);
    set(STORES.VOUCHERS, vouchers);
    // Update customer/supplier balance
    if (data.type === 'receipt' && data.customerId) {
      const customers = get(STORES.CUSTOMERS) || [];
      const cIdx = customers.findIndex((c) => c.id === data.customerId);
      if (cIdx !== -1) {
        customers[cIdx].balance = (customers[cIdx].balance || 0) - (data.amount || 0);
        set(STORES.CUSTOMERS, customers);
      }
    }
    if (data.type === 'payment' && data.supplierId) {
      // Supplier balance tracking could be added similarly
    }
    if (data.type === 'journal' && data.customerId) {
      const customers = get(STORES.CUSTOMERS) || [];
      const cIdx = customers.findIndex((c) => c.id === data.customerId);
      if (cIdx !== -1) {
        const delta = data.journalType === 'debit' ? (data.amount || 0) : -(data.amount || 0);
        customers[cIdx].balance = (customers[cIdx].balance || 0) + delta;
        set(STORES.CUSTOMERS, customers);
      }
    }
    // Sync cash box
    if (data.type === 'receipt' || data.type === 'payment') {
      const cash = get(STORES.CASH) || [];
      cash.push({
        id: generateId(),
        createdAt: nowISO(),
        date: data.date || todayISO(),
        type: data.type === 'receipt' ? 'in' : 'out',
        currency: data.currency || 'IQD',
        amount: data.amount || 0,
        description: data.type === 'receipt' ? `قبض ${voucher.number} - ${data.customerName || ''}` : `صرف ${voucher.number} - ${data.supplierName || ''}`,
        voucherId: voucher.id,
      });
      set(STORES.CASH, cash);
    }
    return voucher;
  };
  const updateVoucher = async (id, data) => {
    await delay();
    const vouchers = get(STORES.VOUCHERS) || [];
    const idx = vouchers.findIndex((v) => v.id === id);
    if (idx === -1) throw new Error('Voucher not found');
    const oldVoucher = { ...vouchers[idx] };
    // Reverse old balance effect
    if (oldVoucher.type === 'receipt' && oldVoucher.customerId) {
      const customers = get(STORES.CUSTOMERS) || [];
      const cIdx = customers.findIndex((c) => c.id === oldVoucher.customerId);
      if (cIdx !== -1) {
        customers[cIdx].balance = (customers[cIdx].balance || 0) + (oldVoucher.amount || 0);
        set(STORES.CUSTOMERS, customers);
      }
    }
    if (oldVoucher.type === 'journal' && oldVoucher.customerId) {
      const customers = get(STORES.CUSTOMERS) || [];
      const cIdx = customers.findIndex((c) => c.id === oldVoucher.customerId);
      if (cIdx !== -1) {
        const delta = oldVoucher.journalType === 'debit' ? -(oldVoucher.amount || 0) : (oldVoucher.amount || 0);
        customers[cIdx].balance = (customers[cIdx].balance || 0) + delta;
        set(STORES.CUSTOMERS, customers);
      }
    }
    // Reverse old cash movement
    if (oldVoucher.type === 'receipt' || oldVoucher.type === 'payment') {
      let cash = get(STORES.CASH) || [];
      cash = cash.filter((m) => m.voucherId !== id);
      set(STORES.CASH, cash);
    }
    // Apply new data
    vouchers[idx] = { ...vouchers[idx], ...data };
    set(STORES.VOUCHERS, vouchers);
    // Apply new balance effect
    if (data.type === 'receipt' && data.customerId) {
      const customers = get(STORES.CUSTOMERS) || [];
      const cIdx = customers.findIndex((c) => c.id === data.customerId);
      if (cIdx !== -1) {
        customers[cIdx].balance = (customers[cIdx].balance || 0) - (data.amount || 0);
        set(STORES.CUSTOMERS, customers);
      }
    }
    if (data.type === 'journal' && data.customerId) {
      const customers = get(STORES.CUSTOMERS) || [];
      const cIdx = customers.findIndex((c) => c.id === data.customerId);
      if (cIdx !== -1) {
        const delta = data.journalType === 'debit' ? (data.amount || 0) : -(data.amount || 0);
        customers[cIdx].balance = (customers[cIdx].balance || 0) + delta;
        set(STORES.CUSTOMERS, customers);
      }
    }
    // Sync cash for updated voucher
    if (data.type === 'receipt' || data.type === 'payment') {
      const cash = get(STORES.CASH) || [];
      cash.push({
        id: generateId(),
        createdAt: nowISO(),
        date: data.date || vouchers[idx].date || todayISO(),
        type: data.type === 'receipt' ? 'in' : 'out',
        currency: data.currency || 'IQD',
        amount: data.amount || 0,
        description: data.type === 'receipt' ? `قبض ${vouchers[idx].number} - ${data.customerName || ''}` : `صرف ${vouchers[idx].number} - ${data.supplierName || ''}`,
        voucherId: id,
      });
      set(STORES.CASH, cash);
    }
    return vouchers[idx];
  };
  const deleteVoucher = async (id) => {
    await delay();
    const vouchers = get(STORES.VOUCHERS) || [];
    const idx = vouchers.findIndex((v) => v.id === id);
    if (idx === -1) return;
    const voucher = vouchers[idx];
    // Reverse balance effect
    if (voucher.type === 'receipt' && voucher.customerId) {
      const customers = get(STORES.CUSTOMERS) || [];
      const cIdx = customers.findIndex((c) => c.id === voucher.customerId);
      if (cIdx !== -1) {
        customers[cIdx].balance = (customers[cIdx].balance || 0) + (voucher.amount || 0);
        set(STORES.CUSTOMERS, customers);
      }
    }
    if (voucher.type === 'journal' && voucher.customerId) {
      const customers = get(STORES.CUSTOMERS) || [];
      const cIdx = customers.findIndex((c) => c.id === voucher.customerId);
      if (cIdx !== -1) {
        const delta = voucher.journalType === 'debit' ? -(voucher.amount || 0) : (voucher.amount || 0);
        customers[cIdx].balance = (customers[cIdx].balance || 0) + delta;
        set(STORES.CUSTOMERS, customers);
      }
    }
    // Remove linked cash movement
    if (voucher.type === 'receipt' || voucher.type === 'payment') {
      let cash = get(STORES.CASH) || [];
      cash = cash.filter((m) => m.voucherId !== id);
      set(STORES.CASH, cash);
    }
    vouchers.splice(idx, 1);
    set(STORES.VOUCHERS, vouchers);
  };

  // ==================== REPORTS ====================
  const getSalesReport = async (startDate, endDate, customerId) => {
    await delay();
    let invoices = get(STORES.INVOICES) || [];
    if (startDate) invoices = invoices.filter((inv) => inv.date >= startDate);
    if (endDate) invoices = invoices.filter((inv) => inv.date <= endDate);
    if (customerId) invoices = invoices.filter((inv) => inv.customerId === customerId);
    return invoices;
  };

  const getCustomerStatement = async (customerId) => {
    await delay();
    const invoices = (get(STORES.INVOICES) || []).filter((inv) => inv.customerId === customerId && inv.type !== 'quotation');
    const vouchers = (get(STORES.VOUCHERS) || []).filter((v) => v.customerId === customerId);
    const customer = (get(STORES.CUSTOMERS) || []).find((c) => c.id === customerId);
    return { customer, invoices, vouchers };
  };

  const getInventoryReport = async () => {
    await delay();
    const stock = get(STORES.STOCK) || [];
    const items = get(STORES.ITEMS) || [];
    const whs = get(STORES.WAREHOUSES) || [];
    return stock.map((s) => {
      const item = items.find((i) => i.id === s.itemId);
      const wh = whs.find((w) => w.id === s.warehouseId);
      const pc = item ? (item.piecesPerCarton || 1) : 1;
      const pb = item ? (item.piecesPerBag || 1) : 1;
      const pieceEquiv = (s.qtyPieces || 0) + (s.qtyCartons || 0) * pc + (s.qtyBags || 0) * pb;
      return {
        ...s,
        itemName: item ? item.name : 'Unknown',
        itemCode: item ? item.code : '-',
        defaultPrice: item ? item.defaultPrice : 0,
        warehouseName: wh ? wh.name : 'Unknown',
        pieceEquiv,
        value: pieceEquiv * (item ? item.defaultPrice : 0),
      };
    });
  };

  // Clear a specific store by name (for delete data feature)
  const clearStore = (storeName) => {
    if (Object.values(STORES).includes(storeName)) {
      _memory[storeName] = null;
      _scheduleFlush();
    }
  };

  // Clear all data (for reset)
  const clearAll = async () => {
    await delay();
    Object.values(STORES).forEach((s) => { _memory[s] = null; });
    _seed();
    await flush();
  };

  // Dynamically calculate customer balance from all invoices and vouchers
  const getCalculatedCustomerBalance = (customerId) => {
    const invoices = get(STORES.INVOICES) || [];
    const vouchers = get(STORES.VOUCHERS) || [];
    let balance = 0;
    invoices.filter((inv) => inv.customerId === customerId && inv.type !== 'quotation').forEach((inv) => {
      const delta = (inv.total || 0) - (inv.amountPaid || 0);
      balance += inv.type === 'return_invoice' ? -delta : delta;
    });
    vouchers.filter((v) => v.type === 'receipt' && v.customerId === customerId).forEach((v) => {
      balance -= (v.amount || 0);
    });
    vouchers.filter((v) => v.type === 'journal' && v.customerId === customerId).forEach((v) => {
      balance += v.journalType === 'debit' ? (v.amount || 0) : -(v.amount || 0);
    });
    return balance;
  };

  // Recalculate and persist all customer balances from transaction history
  const recalculateAllBalances = () => {
    const customers = get(STORES.CUSTOMERS) || [];
    customers.forEach((c) => {
      c.balance = getCalculatedCustomerBalance(c.id);
    });
    set(STORES.CUSTOMERS, customers);
  };

  // ==================== USERS MGMT ====================
  const getUsers = async () => { await delay(); return get(STORES.USERS) || []; };
  const updateUser = async (id, data) => {
    await delay();
    const users = get(STORES.USERS) || [];
    const idx = users.findIndex((u) => u.id === id);
    if (idx === -1) throw new Error('User not found');
    if (data.username) {
      const dup = users.find((u) => u.username === data.username && u.id !== id);
      if (dup) throw new Error('اسم المستخدم موجود بالفعل');
    }
    users[idx] = { ...users[idx], ...data };
    set(STORES.USERS, users);
    return users[idx];
  };
  const addUser = async (data) => {
    await delay();
    const users = get(STORES.USERS) || [];
    if (data.username) {
      const dup = users.find((u) => u.username === data.username);
      if (dup) throw new Error('اسم المستخدم موجود بالفعل');
    }
    const user = { id: generateId(), role: 'Seller', ...data };
    users.push(user);
    set(STORES.USERS, users);
    return user;
  };

  // ==================== SETTINGS ====================
  const getSettings = async () => { await delay(); return get(STORES.SETTINGS) || {}; };
  const updateSettings = async (data) => {
    await delay();
    const s = get(STORES.SETTINGS) || {};
    const updated = { ...s, ...data };
    set(STORES.SETTINGS, updated);
    return updated;
  };

  // ==================== CASH BOX ====================
  const getCashMovements = async (from, to) => {
    await delay();
    const all = get(STORES.CASH) || [];
    if (from || to) {
      return all.filter((m) => {
        const d = (m.date || '').slice(0, 10);
        return (!from || d >= from) && (!to || d <= to);
      });
    }
    return all;
  };
  const addCashMovement = async (data) => {
    await delay();
    const all = get(STORES.CASH) || [];
    const m = { id: generateId(), createdAt: nowISO(), ...data };
    all.unshift(m);
    set(STORES.CASH, all);
    return m;
  };
  const updateCashMovement = async (id, data) => {
    await delay();
    const all = get(STORES.CASH) || [];
    const idx = all.findIndex((m) => m.id === id);
    if (idx === -1) throw new Error('Cash movement not found');
    all[idx] = { ...all[idx], ...data };
    set(STORES.CASH, all);
    return all[idx];
  };
  const deleteCashMovement = async (id) => {
    await delay();
    let all = get(STORES.CASH) || [];
    all = all.filter((m) => m.id !== id);
    set(STORES.CASH, all);
  };
  const getCashBalance = async () => {
    await delay();
    const all = get(STORES.CASH) || [];
    let iqd = 0, usd = 0;
    all.forEach((m) => {
      const amount = m.amount || 0;
      if (m.currency === 'USD') {
        usd += m.type === 'in' ? amount : -amount;
      } else {
        iqd += m.type === 'in' ? amount : -amount;
      }
    });
    return { IQD: iqd, USD: usd };
  };

  // Run migration once on first load
  const _runMigrations = () => {
    if (!get('_balanced_migrated')) {
      recalculateAllBalances();
      set('_balanced_migrated', true);
    }
    if (!get('_cash_migrated_v2')) {
      const vouchers = get(STORES.VOUCHERS) || [];
      let cash = get(STORES.CASH) || [];
      const existingVoucherIds = new Set(cash.filter((m) => m.voucherId).map((m) => m.voucherId));
      vouchers.forEach((v) => {
        if (v.type === 'receipt' || v.type === 'payment') {
          if (!existingVoucherIds.has(v.id)) {
            cash.push({
              id: generateId(),
              createdAt: v.createdAt || nowISO(),
              date: v.date || todayISO(),
              type: v.type === 'receipt' ? 'in' : 'out',
              currency: v.currency || 'IQD',
              amount: v.amount || 0,
              description: v.type === 'receipt' ? `قبض ${v.number} - ${v.customerName || ''}` : `صرف ${v.number} - ${v.supplierName || ''}`,
              voucherId: v.id,
            });
          }
        }
      });
      set(STORES.CASH, cash);
      set('_cash_migrated_v2', true);
    }
    // Migrate cash movement descriptions to include party names
    if (!get('_cash_desc_migrated')) {
      const cash = get(STORES.CASH) || [];
      const invoices = get(STORES.INVOICES) || [];
      const vouchers = get(STORES.VOUCHERS) || [];
      let changed = false;
      cash.forEach((m) => {
        if (m.invoiceId && (!m.description || !m.description.includes(' - '))) {
          const inv = invoices.find((i) => i.id === m.invoiceId);
          if (inv && inv.customerName) {
            m.description = `فاتورة ${inv.number} - ${inv.customerName}`;
            changed = true;
          }
        }
        if (m.voucherId && (!m.description || !m.description.includes(' - '))) {
          const v = vouchers.find((x) => x.id === m.voucherId);
          if (v) {
            const name = v.customerName || v.supplierName || '';
            m.description = (v.type === 'receipt' ? 'قبض ' : 'صرف ') + (v.number || '') + ' - ' + name;
            changed = true;
          }
        }
        if (m.purchaseId && (!m.description || !m.description.includes(' - '))) {
          const purchases = get(STORES.PURCHASES) || [];
          const p = purchases.find((x) => x.id === m.purchaseId);
          if (p && p.supplierName) {
            m.description = `مشتريات ${p.number} - ${p.supplierName}`;
            changed = true;
          }
        }
      });
      if (changed) set(STORES.CASH, cash);
      set('_cash_desc_migrated', true);
    }
  };

  return {
    authenticate,
    getItems, getItem, addItem, updateItem, deleteItem,
    getCustomers, getCustomer, addCustomer, updateCustomer, deleteCustomer,
    getSuppliers, addSupplier, updateSupplier, deleteSupplier,
    getWarehouses, addWarehouse, deleteWarehouse,
    getStock, getStockByItem, updateStock, setStockQuantity,
    getMovements, addMovement, transferStock,
    getInvoices, getInvoice, saveInvoice, deleteInvoice, finalizeInvoice,
    getPurchases, getPurchase, savePurchase, deletePurchase, finalizePurchase,
    getVouchers, getVoucher, addVoucher, updateVoucher, deleteVoucher,
    getSalesReport, getCustomerStatement, getInventoryReport,
    getCalculatedCustomerBalance, recalculateAllBalances,
    getUsers, updateUser, addUser,
    getSettings, updateSettings,
    getCashMovements, addCashMovement, updateCashMovement, deleteCashMovement, getCashBalance,
    nextNumber, generateId, todayISO, nowISO, clearAll,
    init, flush,
    getSettingsSync, getUsersSync, getInvoicesSync, getVouchersSync, clearStore,
    getConfig, setConfig, importData,
  };
})();
