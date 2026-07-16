'use strict';

/* ============================================================================
   STORAGE MODULE
   ============================================================================ */
const StorageModule = (() => {
  const EXPENSES_KEY = 'expenseTracker_expenses';
  const CONFIG_KEY = 'expenseTracker_config';

  const DEFAULT_CATEGORIES = [
    'Food', 'Groceries', 'Electricity', 'Water', 'Internet',
    'Household', 'Cleaning', 'Furniture', 'Transportation',
    'Entertainment', 'Personal', 'Other'
  ];

  const CATEGORY_LABELS_VI = {
    Food: 'Đồ ăn', Groceries: 'Tạp hóa', Electricity: 'Điện', Water: 'Nước',
    Internet: 'Internet', Household: 'Gia dụng', Cleaning: 'Dọn dẹp',
    Furniture: 'Nội thất', Transportation: 'Di chuyển', Entertainment: 'Giải trí',
    Personal: 'Cá nhân', Other: 'Khác'
  };

  const DEFAULT_CONFIG = {
    personA: { id: 'A', name: 'Huỳnh', color: '#3b82f6' },
    personB: { id: 'B', name: 'Đan', color: '#f97316' },
    currency: 'VND',
    locale: 'vi-VN',
    darkMode: false,
    categoryList: DEFAULT_CATEGORIES,
    lastExportedAt: null,
    backupReminderSnoozedUntil: null
  };

  const initDefaults = () => {
    if (localStorage.getItem(EXPENSES_KEY) === null) {
      localStorage.setItem(EXPENSES_KEY, JSON.stringify([]));
    }
    if (localStorage.getItem(CONFIG_KEY) === null) {
      localStorage.setItem(CONFIG_KEY, JSON.stringify(DEFAULT_CONFIG));
    }
  };

  const getExpenses = () => {
    try {
      return JSON.parse(localStorage.getItem(EXPENSES_KEY)) || [];
    } catch (e) {
      return [];
    }
  };

  const saveExpenses = (arr) => {
    localStorage.setItem(EXPENSES_KEY, JSON.stringify(arr));
  };

  const generateId = () => {
    const today = new Date();
    const datePart = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
    const existing = getExpenses();
    const seq = existing.length + 1;
    return `EXP_${datePart}_${String(seq).padStart(3, '0')}_${Math.random().toString(36).slice(2, 6)}`;
  };

  const addExpense = (expense) => {
    const arr = getExpenses();
    const record = { ...expense, id: generateId(), createdAt: Date.now() };
    arr.push(record);
    saveExpenses(arr);
    return record;
  };

  const updateExpense = (id, updates) => {
    const arr = getExpenses();
    const idx = arr.findIndex((e) => e.id === id);
    if (idx === -1) return null;
    arr[idx] = { ...arr[idx], ...updates };
    saveExpenses(arr);
    return arr[idx];
  };

  const deleteExpense = (id) => {
    const arr = getExpenses().filter((e) => e.id !== id);
    saveExpenses(arr);
  };

  const findDuplicate = (expense, excludeId = null) => {
    return getExpenses().some((e) =>
      e.id !== excludeId &&
      e.date === expense.date &&
      e.description.trim().toLowerCase() === expense.description.trim().toLowerCase() &&
      e.amount === expense.amount &&
      e.paidBy === expense.paidBy
    );
  };

  const getConfig = () => {
    try {
      return { ...DEFAULT_CONFIG, ...(JSON.parse(localStorage.getItem(CONFIG_KEY)) || {}) };
    } catch (e) {
      return { ...DEFAULT_CONFIG };
    }
  };

  const setConfig = (partial) => {
    const merged = { ...getConfig(), ...partial };
    localStorage.setItem(CONFIG_KEY, JSON.stringify(merged));
    return merged;
  };

  const exportJSON = () => {
    return JSON.stringify({ expenses: getExpenses(), config: getConfig(), exportedAt: new Date().toISOString() }, null, 2);
  };

  const importJSON = (jsonString) => {
    const data = JSON.parse(jsonString);
    if (!Array.isArray(data.expenses)) throw new Error('Invalid file: missing expenses array');
    const merged = getExpenses();
    const isDuplicate = (expense) => merged.some((e) =>
      e.id === expense.id ||
      (e.date === expense.date &&
        e.description.trim().toLowerCase() === expense.description.trim().toLowerCase() &&
        e.amount === expense.amount &&
        e.paidBy === expense.paidBy)
    );
    let added = 0;
    let skipped = 0;
    data.expenses.forEach((expense) => {
      if (isDuplicate(expense)) {
        skipped += 1;
      } else {
        merged.push(expense);
        added += 1;
      }
    });
    saveExpenses(merged);
    if (data.config && typeof data.config === 'object') {
      setConfig(data.config);
    }
    return { added, skipped };
  };

  const clearAll = () => {
    saveExpenses([]);
  };

  return {
    initDefaults, getExpenses, saveExpenses, addExpense, updateExpense, deleteExpense,
    findDuplicate, getConfig, setConfig, exportJSON, importJSON, clearAll,
    CATEGORY_LABELS_VI
  };
})();

/* ============================================================================
   CALCULATION MODULE
   ============================================================================ */
const CalcModule = (() => {
  // Shared expenses split 50/50 regardless of payer; personal expenses are
  // owed entirely by the owner. balance = paid - owed nets to a single
  // transfer since owedA+owedB always equals paidA+paidB for two people.
  const calculateSettlement = (expenses) => {
    const paid = { A: 0, B: 0 };
    const owed = { A: 0, B: 0 };

    expenses.forEach((e) => {
      paid[e.paidBy] += e.amount;
      if (e.expenseType === 'Shared') {
        owed.A += e.amount / 2;
        owed.B += e.amount / 2;
      } else {
        owed[e.owner] += e.amount;
      }
    });

    const balanceA = paid.A - owed.A;
    const EPSILON = 0.5; // sub-VND rounding tolerance

    let from = null, to = null, amount = 0;
    if (balanceA > EPSILON) {
      from = 'B'; to = 'A'; amount = balanceA;
    } else if (balanceA < -EPSILON) {
      from = 'A'; to = 'B'; amount = -balanceA;
    }

    return { paid, owed, balanceA, from, to, amount: Math.round(amount) };
  };

  const getSummary = (expenses) => {
    const totalSpent = expenses.reduce((sum, e) => sum + e.amount, 0);
    const sharedTotal = expenses.filter((e) => e.expenseType === 'Shared').reduce((s, e) => s + e.amount, 0);
    const settlement = calculateSettlement(expenses);
    return {
      totalSpent,
      sharedTotal,
      personATotal: settlement.owed.A,
      personBTotal: settlement.owed.B,
      personAPaid: settlement.paid.A,
      personBPaid: settlement.paid.B,
      settlement
    };
  };

  const getSpendingByCategory = (expenses) => {
    const map = {};
    expenses.forEach((e) => { map[e.category] = (map[e.category] || 0) + e.amount; });
    return map;
  };

  const getSpendingByMonth = (expenses) => {
    const map = {};
    expenses.forEach((e) => {
      const month = e.date.slice(0, 7);
      map[month] = (map[month] || 0) + e.amount;
    });
    return map;
  };

  const getSpendingByPerson = (expenses) => {
    const settlement = calculateSettlement(expenses);
    return { A: settlement.owed.A, B: settlement.owed.B };
  };

  return { calculateSettlement, getSummary, getSpendingByCategory, getSpendingByMonth, getSpendingByPerson };
})();

/* ============================================================================
   FILTER MODULE
   ============================================================================ */
const FilterModule = (() => {
  let state = { month: '', category: '', paidBy: '', expenseType: '', keyword: '' };
  let sortBy = 'date';
  let sortAsc = false;

  const setFilter = (key, value) => { state[key] = value; };
  const getFilters = () => ({ ...state });
  const resetFilters = () => { state = { month: '', category: '', paidBy: '', expenseType: '', keyword: '' }; };

  const setSort = (field) => {
    if (sortBy === field) {
      sortAsc = !sortAsc;
    } else {
      sortBy = field;
      sortAsc = false;
    }
  };
  const getSort = () => ({ field: sortBy, asc: sortAsc });

  const compareBy = (a, b, field) => {
    if (field === 'date') return (a.date + a.createdAt).localeCompare(b.date + b.createdAt);
    if (field === 'amount') return a.amount - b.amount;
    if (typeof a[field] === 'string') return a[field].localeCompare(b[field]);
    return 0;
  };

  const applyFilters = (expenses) => {
    const filtered = expenses.filter((e) => {
      if (state.month && !e.date.startsWith(state.month)) return false;
      if (state.category && e.category !== state.category) return false;
      if (state.paidBy && e.paidBy !== state.paidBy) return false;
      if (state.expenseType && e.expenseType !== state.expenseType) return false;
      if (state.keyword) {
        const kw = state.keyword.trim().toLowerCase();
        const haystack = `${e.description} ${e.notes || ''}`.toLowerCase();
        if (!haystack.includes(kw)) return false;
      }
      return true;
    });
    const sorted = [...filtered].sort((a, b) => {
      const cmp = compareBy(a, b, sortBy);
      return sortAsc ? cmp : -cmp;
    });
    return sorted;
  };

  return { setFilter, getFilters, resetFilters, applyFilters, setSort, getSort };
})();

/* ============================================================================
   ICON MODULE — inline SVG icons (replaces functional emoji, keeps voice emoji)
   ============================================================================ */
const Icons = {
  moon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>',
  sun: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>',
  settings: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
  edit: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/></svg>',
  delete: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>',
  duplicate: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
  close: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>',
  export: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>',
  import: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/></svg>',
  print: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>',
  csv: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/></svg>',
  sortAsc: '▲',
  sortDesc: '▼',

  applyAll() {
    document.querySelectorAll('[data-icon]').forEach((el) => {
      const name = el.dataset.icon;
      if (this[name]) el.innerHTML = this[name];
    });
  }
};

/* ============================================================================
   CHART MODULE — pure Canvas, no libraries
   ============================================================================ */
const ChartModule = (() => {
  const PALETTE = ['#3b82f6', '#f97316', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#ef4444', '#6366f1', '#14b8a6', '#a855f7'];

  const formatCurrency = (amount) =>
    new Intl.NumberFormat('vi-VN').format(Math.round(amount)) + ' ₫';

  const getCtx = (canvasId) => {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    return { canvas, ctx };
  };

  const drawEmptyMessage = (ctx, canvas) => {
    ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--color-text-secondary').trim() || '#6b7280';
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Chưa có dữ liệu', canvas.width / 2, canvas.height / 2);
  };

  const drawBarChart = (canvasId, dataMap, labelMap) => {
    const found = getCtx(canvasId);
    if (!found) return;
    const { canvas, ctx } = found;
    const entries = Object.entries(dataMap).sort((a, b) => b[1] - a[1]);
    if (entries.length === 0) { drawEmptyMessage(ctx, canvas); return; }

    const textColor = getComputedStyle(document.body).getPropertyValue('--color-text').trim() || '#1a1d23';
    const padding = 12;
    const barHeight = 22;
    const barGap = 12;
    const labelWidth = 90;
    const rowHeight = barHeight + barGap;
    const maxValue = Math.max(...entries.map((e) => e[1]));
    const graphWidth = canvas.width - padding * 2 - labelWidth - 70;

    entries.forEach(([key, value], i) => {
      const y = padding + i * rowHeight;
      if (y + barHeight > canvas.height) return;
      const barWidth = maxValue > 0 ? (value / maxValue) * graphWidth : 0;
      const label = labelMap ? (labelMap[key] || key) : key;

      ctx.fillStyle = textColor;
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(label.length > 12 ? label.slice(0, 11) + '…' : label, padding + labelWidth, y + barHeight / 2);

      ctx.fillStyle = PALETTE[i % PALETTE.length];
      const radius = 4;
      const bw = Math.max(barWidth, 2);
      ctx.beginPath();
      ctx.roundRect(padding + labelWidth + 8, y, bw, barHeight, radius);
      ctx.fill();

      ctx.fillStyle = textColor;
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(formatCurrency(value), padding + labelWidth + 8 + bw + 6, y + barHeight / 2);
    });
  };

  const drawDonutChart = (canvasId, dataMap, colorMap) => {
    const found = getCtx(canvasId);
    if (!found) return;
    const { canvas, ctx } = found;
    const entries = Object.entries(dataMap).filter(([, v]) => v > 0);
    const total = entries.reduce((s, [, v]) => s + v, 0);
    if (total <= 0) { drawEmptyMessage(ctx, canvas); return; }

    const textColor = getComputedStyle(document.body).getPropertyValue('--color-text').trim() || '#1a1d23';
    const centerX = canvas.width / 2;
    const centerY = 100;
    const radius = 75;
    const innerRadius = 45;

    let currentAngle = -Math.PI / 2;
    entries.forEach(([key, value], i) => {
      const sliceAngle = (value / total) * 2 * Math.PI;
      const color = (colorMap && colorMap[key]) || PALETTE[i % PALETTE.length];
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.arc(centerX, centerY, radius, currentAngle, currentAngle + sliceAngle);
      ctx.closePath();
      ctx.fill();
      currentAngle += sliceAngle;
    });

    // punch inner circle to make it a donut
    ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--color-bg-secondary').trim() || '#f7f8fa';
    ctx.beginPath();
    ctx.arc(centerX, centerY, innerRadius, 0, 2 * Math.PI);
    ctx.fill();

    ctx.fillStyle = textColor;
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(formatCurrency(total), centerX, centerY);

    let legendY = centerY + radius + 24;
    entries.forEach(([key, value], i) => {
      const color = (colorMap && colorMap[key]) || PALETTE[i % PALETTE.length];
      ctx.fillStyle = color;
      ctx.fillRect(centerX - 90, legendY - 6, 12, 12);
      ctx.fillStyle = textColor;
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${key}: ${formatCurrency(value)}`, centerX - 72, legendY);
      legendY += 18;
    });
  };

  const drawMonthlyChart = (canvasId, dataMap) => {
    const found = getCtx(canvasId);
    if (!found) return;
    const { canvas, ctx } = found;
    const months = Object.keys(dataMap).sort();
    if (months.length === 0) { drawEmptyMessage(ctx, canvas); return; }

    const textColor = getComputedStyle(document.body).getPropertyValue('--color-text').trim() || '#1a1d23';
    const padding = 30;
    const bottomPadding = 30;
    const chartWidth = canvas.width - padding * 2;
    const chartHeight = canvas.height - padding - bottomPadding;
    const maxValue = Math.max(...months.map((m) => dataMap[m]));
    const barGap = 10;
    const barWidth = Math.min(50, (chartWidth - barGap * (months.length - 1)) / months.length);

    // baseline
    ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--color-border').trim() || '#e5e7eb';
    ctx.beginPath();
    ctx.moveTo(padding, padding + chartHeight);
    ctx.lineTo(canvas.width - padding, padding + chartHeight);
    ctx.stroke();

    months.forEach((month, i) => {
      const value = dataMap[month];
      const barHeight = maxValue > 0 ? (value / maxValue) * chartHeight : 0;
      const x = padding + i * (barWidth + barGap);
      const y = padding + chartHeight - barHeight;

      ctx.fillStyle = PALETTE[i % PALETTE.length];
      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, Math.max(barHeight, 2), 4);
      ctx.fill();

      ctx.fillStyle = textColor;
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(month.slice(2), x + barWidth / 2, padding + chartHeight + 16);
    });
  };

  return { drawBarChart, drawDonutChart, drawMonthlyChart, formatCurrency };
})();

/* ============================================================================
   RENDER MODULE
   ============================================================================ */
const RenderModule = (() => {
  const formatCurrency = ChartModule.formatCurrency;

  const renderCategoryOptions = (selectEl, selected = '', includeAll = false) => {
    const config = StorageModule.getConfig();
    selectEl.innerHTML = '';
    if (includeAll) {
      const opt = document.createElement('option');
      opt.value = ''; opt.textContent = 'Tất cả';
      selectEl.appendChild(opt);
    }
    config.categoryList.forEach((cat) => {
      const opt = document.createElement('option');
      opt.value = cat;
      opt.textContent = StorageModule.CATEGORY_LABELS_VI[cat] || cat;
      if (cat === selected) opt.selected = true;
      selectEl.appendChild(opt);
    });
  };

  const renderPersonLabels = () => {
    const config = StorageModule.getConfig();
    document.getElementById('personALabel').textContent = config.personA.name;
    document.getElementById('personBLabel').textContent = config.personB.name;
    document.getElementById('filterOptionA').textContent = config.personA.name;
    document.getElementById('filterOptionB').textContent = config.personB.name;
    document.getElementById('paidByOptionA').textContent = config.personA.name;
    document.getElementById('paidByOptionB').textContent = config.personB.name;
    document.getElementById('ownerOptionA').textContent = config.personA.name;
    document.getElementById('ownerOptionB').textContent = config.personB.name;
    document.getElementById('personANameInput').value = config.personA.name;
    document.getElementById('personBNameInput').value = config.personB.name;
  };

  const renderDashboard = (summary) => {
    const config = StorageModule.getConfig();
    document.getElementById('totalAmount').textContent = formatCurrency(summary.totalSpent);
    document.getElementById('sharedAmount').textContent = formatCurrency(summary.sharedTotal);
    document.getElementById('personAAmount').textContent = formatCurrency(summary.personATotal);
    document.getElementById('personBAmount').textContent = formatCurrency(summary.personBTotal);
    document.getElementById('personAPaid').textContent = `Đã trả: ${formatCurrency(summary.personAPaid)}`;
    document.getElementById('personBPaid').textContent = `Đã trả: ${formatCurrency(summary.personBPaid)}`;

    const card = document.getElementById('settlementCard');
    const text = document.getElementById('settlementText');
    const { from, to, amount } = summary.settlement;
    if (!from) {
      text.textContent = summary.totalSpent === 0 ? 'Chưa có dữ liệu' : 'Đã cân bằng — không ai nợ ai 🎉';
      card.classList.add('is-settled');
    } else {
      const fromName = from === 'A' ? config.personA.name : config.personB.name;
      const toName = to === 'A' ? config.personA.name : config.personB.name;
      text.textContent = `👉 ${fromName} cần chuyển cho ${toName}: ${formatCurrency(amount)}`;
      card.classList.remove('is-settled');
    }
  };

  const renderExpenseTable = (expenses) => {
    const config = StorageModule.getConfig();
    const tbody = document.getElementById('expenseTableBody');
    const emptyState = document.getElementById('emptyState');
    const tableWrapper = document.getElementById('tableWrapper');

    if (expenses.length === 0) {
      emptyState.style.display = 'block';
      tableWrapper.style.display = 'none';
      tbody.innerHTML = '';
      return;
    }
    emptyState.style.display = 'none';
    tableWrapper.style.display = 'block';

    tbody.innerHTML = expenses.map((e) => {
      const paidByName = e.paidBy === 'A' ? config.personA.name : config.personB.name;
      const ownerName = e.expenseType === 'Personal' ? (e.owner === 'A' ? config.personA.name : config.personB.name) : '—';
      const typeLabel = e.expenseType === 'Shared' ? 'Chung' : 'Cá nhân';
      const badgeClass = e.expenseType === 'Shared' ? 'badge-shared' : 'badge-personal';
      const catLabel = StorageModule.CATEGORY_LABELS_VI[e.category] || e.category;
      return `
        <tr data-id="${e.id}">
          <td data-label="Ngày">${e.date}</td>
          <td data-label="Mô tả">${escapeHtml(e.description)}</td>
          <td data-label="Danh mục">${catLabel}</td>
          <td data-label="Số tiền" class="amount-cell">${formatCurrency(e.amount)}</td>
          <td data-label="Người trả">${paidByName}</td>
          <td data-label="Loại"><span class="badge ${badgeClass}">${typeLabel}</span></td>
          <td data-label="Người chịu">${ownerName}</td>
          <td data-label="Hành động">
            <button class="btn-table-action btn-duplicate" data-id="${e.id}" title="Nhân bản" aria-label="Nhân bản">${Icons.duplicate}</button>
            <button class="btn-table-action btn-edit" data-id="${e.id}" title="Sửa" aria-label="Sửa">${Icons.edit}</button>
            <button class="btn-table-action btn-delete" data-id="${e.id}" title="Xóa" aria-label="Xóa">${Icons.delete}</button>
          </td>
        </tr>`;
    }).join('');

    updateSortIndicators();
  };

  const updateSortIndicators = () => {
    const { field, asc } = FilterModule.getSort();
    document.querySelectorAll('.expense-table th.sortable').forEach((th) => {
      const indicator = th.querySelector('.sort-indicator');
      if (th.dataset.sortField === field) {
        indicator.textContent = asc ? Icons.sortAsc : Icons.sortDesc;
      } else {
        indicator.textContent = '';
      }
    });
  };

  const escapeHtml = (str) => {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  };

  const renderCharts = (expenses) => {
    const config = StorageModule.getConfig();
    const byCategory = CalcModule.getSpendingByCategory(expenses);
    const labelMap = {};
    Object.keys(byCategory).forEach((k) => { labelMap[k] = StorageModule.CATEGORY_LABELS_VI[k] || k; });
    ChartModule.drawBarChart('chartCategory', byCategory, labelMap);

    const byPerson = CalcModule.getSpendingByPerson(expenses);
    const personDataMap = { [config.personA.name]: byPerson.A, [config.personB.name]: byPerson.B };
    const colorMap = { [config.personA.name]: config.personA.color, [config.personB.name]: config.personB.color };
    ChartModule.drawDonutChart('chartPerson', personDataMap, colorMap);

    const byMonth = CalcModule.getSpendingByMonth(expenses);
    ChartModule.drawMonthlyChart('chartMonthly', byMonth);
  };

  let toastCounter = 0;
  const showToast = (message, type = 'info', duration = 3500, actionLabel = null, onAction = null) => {
    const container = document.getElementById('toastContainer');
    const id = `toast-${++toastCounter}`;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.id = id;

    const text = document.createElement('span');
    text.textContent = message;
    toast.appendChild(text);

    const dismiss = () => {
      toast.classList.add('fade-out');
      setTimeout(() => toast.remove(), 260);
    };

    if (actionLabel && onAction) {
      const actionBtn = document.createElement('button');
      actionBtn.type = 'button';
      actionBtn.className = 'toast-action';
      actionBtn.textContent = actionLabel;
      actionBtn.addEventListener('click', () => {
        clearTimeout(timer);
        onAction();
        dismiss();
      });
      toast.appendChild(actionBtn);
    }

    container.appendChild(toast);
    const timer = setTimeout(dismiss, duration);
  };

  let confirmResolver = null;
  const confirmDialog = (message) => {
    const modal = document.getElementById('confirmDialog');
    document.getElementById('confirmMessage').textContent = message;
    modal.classList.add('active');
    return new Promise((resolve) => { confirmResolver = resolve; });
  };
  const resolveConfirm = (result) => {
    document.getElementById('confirmDialog').classList.remove('active');
    if (confirmResolver) { confirmResolver(result); confirmResolver = null; }
  };

  const toggleDarkMode = (enabled) => {
    document.body.setAttribute('data-theme', enabled ? 'dark' : 'light');
    document.getElementById('darkModeIcon').innerHTML = enabled ? Icons.sun : Icons.moon;
  };

  const openModal = (id) => document.getElementById(id).classList.add('active');
  const closeModal = (id) => document.getElementById(id).classList.remove('active');

  const renderAll = () => {
    const expenses = StorageModule.getExpenses();
    const filtered = FilterModule.applyFilters(expenses);
    renderPersonLabels();
    renderDashboard(CalcModule.getSummary(expenses));
    renderExpenseTable(filtered);
    renderCharts(expenses);
  };

  return {
    renderCategoryOptions, renderPersonLabels, renderDashboard, renderExpenseTable,
    renderCharts, showToast, confirmDialog, resolveConfirm, toggleDarkMode,
    openModal, closeModal, renderAll, formatCurrency
  };
})();

/* ============================================================================
   FORM MODULE
   ============================================================================ */
const FormModule = (() => {
  const form = () => document.getElementById('expenseForm');

  const resetForm = () => {
    form().reset();
    document.getElementById('expenseId').value = '';
    document.getElementById('expenseDate').value = new Date().toISOString().slice(0, 10);
    document.getElementById('ownerGroup').style.display = 'none';
    ['errDate', 'errAmount', 'errDescription'].forEach((id) => { document.getElementById(id).textContent = ''; });
    document.getElementById('modalTitle').textContent = 'Thêm chi tiêu';
  };

  const openAddModal = () => {
    RenderModule.renderCategoryOptions(document.getElementById('expenseCategory'));
    resetForm();
    RenderModule.openModal('expenseModal');
    document.getElementById('expenseDescription').focus();
  };

  const openEditModal = (id) => {
    const expense = StorageModule.getExpenses().find((e) => e.id === id);
    if (!expense) return;
    RenderModule.renderCategoryOptions(document.getElementById('expenseCategory'), expense.category);
    document.getElementById('modalTitle').textContent = 'Sửa chi tiêu';
    document.getElementById('expenseId').value = expense.id;
    document.getElementById('expenseDate').value = expense.date;
    document.getElementById('expenseDescription').value = expense.description;
    document.getElementById('expenseAmount').value = expense.amount;
    document.getElementById('expensePaidBy').value = expense.paidBy;
    document.getElementById('expenseType').value = expense.expenseType;
    document.getElementById('expenseNotes').value = expense.notes || '';
    handleExpenseTypeChange(expense.expenseType);
    if (expense.expenseType === 'Personal') {
      document.getElementById('expenseOwner').value = expense.owner;
    }
    RenderModule.openModal('expenseModal');
  };

  const openDuplicateModal = (id) => {
    const expense = StorageModule.getExpenses().find((e) => e.id === id);
    if (!expense) return;
    RenderModule.renderCategoryOptions(document.getElementById('expenseCategory'), expense.category);
    document.getElementById('modalTitle').textContent = 'Nhân bản chi tiêu';
    document.getElementById('expenseId').value = '';
    document.getElementById('expenseDate').value = new Date().toISOString().slice(0, 10);
    document.getElementById('expenseDescription').value = expense.description;
    document.getElementById('expenseAmount').value = expense.amount;
    document.getElementById('expensePaidBy').value = expense.paidBy;
    document.getElementById('expenseType').value = expense.expenseType;
    document.getElementById('expenseNotes').value = expense.notes || '';
    handleExpenseTypeChange(expense.expenseType);
    if (expense.expenseType === 'Personal') {
      document.getElementById('expenseOwner').value = expense.owner;
    }
    RenderModule.openModal('expenseModal');
    document.getElementById('expenseDescription').focus();
  };

  const handleExpenseTypeChange = (type) => {
    document.getElementById('ownerGroup').style.display = type === 'Personal' ? 'flex' : 'none';
  };

  const validateForm = (data) => {
    const errors = {};
    if (!data.date) errors.date = 'Vui lòng chọn ngày';
    if (!data.description || data.description.trim().length === 0) errors.description = 'Vui lòng nhập mô tả';
    if (!data.amount || isNaN(data.amount) || data.amount <= 0) errors.amount = 'Số tiền phải lớn hơn 0';
    return errors;
  };

  const showErrors = (errors) => {
    document.getElementById('errDate').textContent = errors.date || '';
    document.getElementById('errAmount').textContent = errors.amount || '';
    document.getElementById('errDescription').textContent = errors.description || '';
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const id = document.getElementById('expenseId').value;
    const expenseType = document.getElementById('expenseType').value;
    const data = {
      date: document.getElementById('expenseDate').value,
      description: document.getElementById('expenseDescription').value.trim(),
      category: document.getElementById('expenseCategory').value,
      amount: Number(document.getElementById('expenseAmount').value),
      paidBy: document.getElementById('expensePaidBy').value,
      expenseType,
      owner: expenseType === 'Personal' ? document.getElementById('expenseOwner').value : null,
      notes: document.getElementById('expenseNotes').value.trim()
    };

    const errors = validateForm(data);
    showErrors(errors);
    if (Object.keys(errors).length > 0) return;

    if (StorageModule.findDuplicate(data, id || null)) {
      const proceed = await RenderModule.confirmDialog(
        'Có vẻ khoản chi này đã tồn tại (cùng ngày, mô tả, số tiền, người trả). Bạn vẫn muốn lưu?'
      );
      if (!proceed) return;
    }

    if (id) {
      StorageModule.updateExpense(id, data);
      RenderModule.showToast('Đã cập nhật khoản chi', 'success');
    } else {
      StorageModule.addExpense(data);
      RenderModule.showToast('Đã thêm khoản chi mới', 'success');
    }

    RenderModule.closeModal('expenseModal');
    RenderModule.renderAll();
  };

  return { openAddModal, openEditModal, openDuplicateModal, closeModal: () => RenderModule.closeModal('expenseModal'), handleExpenseTypeChange, handleSubmit, resetForm };
})();

/* ============================================================================
   IMPORT / EXPORT MODULE
   ============================================================================ */
const ImportExportModule = (() => {
  const recordExport = () => {
    StorageModule.setConfig({ lastExportedAt: new Date().toISOString() });
  };

  const downloadBlob = (content, mimeType, filename) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const exportData = () => {
    const json = StorageModule.exportJSON();
    const stamp = new Date().toISOString().slice(0, 10);
    downloadBlob(json, 'application/json', `expense-data-${stamp}.json`);
    recordExport();
    RenderModule.showToast('Đã export dữ liệu ra file JSON', 'success');
  };

  const escapeCSV = (value) => {
    const str = value === null || value === undefined ? '' : String(value);
    if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
    return str;
  };

  const exportCSV = () => {
    const config = StorageModule.getConfig();
    const expenses = FilterModule.applyFilters(StorageModule.getExpenses());
    if (expenses.length === 0) {
      RenderModule.showToast('Không có khoản chi nào để export (theo bộ lọc hiện tại)', 'info');
      return;
    }
    const personName = (id) => (id === 'A' ? config.personA.name : config.personB.name);
    const header = ['Ngày', 'Mô tả', 'Danh mục', 'Số tiền', 'Người trả', 'Loại', 'Người chịu', 'Ghi chú'];
    const rows = expenses.map((e) => [
      e.date,
      e.description,
      StorageModule.CATEGORY_LABELS_VI[e.category] || e.category,
      e.amount,
      personName(e.paidBy),
      e.expenseType === 'Shared' ? 'Chung' : 'Cá nhân',
      e.expenseType === 'Personal' ? personName(e.owner) : '—',
      e.notes || ''
    ].map(escapeCSV).join(','));
    const csv = '﻿' + [header.map(escapeCSV).join(','), ...rows].join('\n');
    const stamp = new Date().toISOString().slice(0, 10);
    downloadBlob(csv, 'text/csv;charset=utf-8;', `expense-data-${stamp}.csv`);
    recordExport();
    RenderModule.showToast('Đã export dữ liệu ra file CSV', 'success');
  };

  const importData = async (file) => {
    try {
      const text = await file.text();
      const proceed = await RenderModule.confirmDialog('Import sẽ thêm các khoản chi mới vào danh sách hiện tại (tự bỏ qua khoản trùng lặp). Tiếp tục?');
      if (!proceed) return;
      const { added, skipped } = StorageModule.importJSON(text);
      RenderModule.renderAll();
      const msg = skipped > 0
        ? `Đã thêm ${added} khoản chi mới (bỏ qua ${skipped} khoản trùng lặp)`
        : `Đã thêm ${added} khoản chi mới`;
      RenderModule.showToast(msg, 'success');
    } catch (err) {
      RenderModule.showToast('File JSON không hợp lệ', 'error');
    }
  };

  return { exportData, exportCSV, importData, recordExport };
})();

/* ============================================================================
   EVENT HANDLERS
   ============================================================================ */
const EventHandlers = (() => {
  const bindModalCloseTriggers = () => {
    document.querySelectorAll('[data-close]').forEach((btn) => {
      btn.addEventListener('click', () => RenderModule.closeModal(btn.dataset.close));
    });
    document.querySelectorAll('.modal').forEach((modal) => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('active');
      });
    });
  };

  const bindExpenseForm = () => {
    document.getElementById('btnAddExpense').addEventListener('click', FormModule.openAddModal);
    document.getElementById('btnQuickAdd').addEventListener('click', FormModule.openAddModal);
    document.getElementById('expenseForm').addEventListener('submit', FormModule.handleSubmit);
    document.getElementById('btnResetForm').addEventListener('click', FormModule.resetForm);
    document.getElementById('expenseType').addEventListener('change', (e) => FormModule.handleExpenseTypeChange(e.target.value));

    document.getElementById('expenseTableBody').addEventListener('click', (e) => {
      const editBtn = e.target.closest('.btn-edit');
      const dupBtn = e.target.closest('.btn-duplicate');
      const delBtn = e.target.closest('.btn-delete');
      if (editBtn) FormModule.openEditModal(editBtn.dataset.id);
      if (dupBtn) FormModule.openDuplicateModal(dupBtn.dataset.id);
      if (delBtn) {
        const id = delBtn.dataset.id;
        const expense = StorageModule.getExpenses().find((exp) => exp.id === id);
        if (!expense) return;
        StorageModule.deleteExpense(id);
        RenderModule.renderAll();
        RenderModule.showToast('Đã xóa khoản chi', 'info', 6000, 'Hoàn tác', () => {
          StorageModule.saveExpenses([...StorageModule.getExpenses(), expense]);
          RenderModule.renderAll();
        });
      }
    });
  };

  const bindTableSort = () => {
    document.querySelectorAll('.expense-table th.sortable').forEach((th) => {
      th.addEventListener('click', () => {
        FilterModule.setSort(th.dataset.sortField);
        const expenses = StorageModule.getExpenses();
        RenderModule.renderExpenseTable(FilterModule.applyFilters(expenses));
      });
    });
  };

  const bindFilters = () => {
    const monthEl = document.getElementById('filterMonth');
    const categoryEl = document.getElementById('filterCategory');
    const paidByEl = document.getElementById('filterPaidBy');
    const typeEl = document.getElementById('filterExpenseType');
    const keywordEl = document.getElementById('filterKeyword');

    const applyAndRender = () => {
      const expenses = StorageModule.getExpenses();
      RenderModule.renderExpenseTable(FilterModule.applyFilters(expenses));
    };

    monthEl.addEventListener('change', () => { FilterModule.setFilter('month', monthEl.value); applyAndRender(); });
    categoryEl.addEventListener('change', () => { FilterModule.setFilter('category', categoryEl.value); applyAndRender(); });
    paidByEl.addEventListener('change', () => { FilterModule.setFilter('paidBy', paidByEl.value); applyAndRender(); });
    typeEl.addEventListener('change', () => { FilterModule.setFilter('expenseType', typeEl.value); applyAndRender(); });
    keywordEl.addEventListener('input', () => { FilterModule.setFilter('keyword', keywordEl.value); applyAndRender(); });

    document.getElementById('btnResetFilters').addEventListener('click', () => {
      FilterModule.resetFilters();
      monthEl.value = ''; categoryEl.value = ''; paidByEl.value = ''; typeEl.value = ''; keywordEl.value = '';
      applyAndRender();
    });
  };

  const bindSettings = () => {
    document.getElementById('btnSettings').addEventListener('click', () => {
      RenderModule.renderPersonLabels();
      RenderModule.openModal('settingsModal');
    });
    document.getElementById('settingsForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const config = StorageModule.getConfig();
      StorageModule.setConfig({
        personA: { ...config.personA, name: document.getElementById('personANameInput').value.trim() || 'Người A' },
        personB: { ...config.personB, name: document.getElementById('personBNameInput').value.trim() || 'Người B' }
      });
      RenderModule.closeModal('settingsModal');
      RenderModule.renderAll();
      RenderModule.showToast('Đã lưu cài đặt', 'success');
    });
  };

  const bindDarkMode = () => {
    const config = StorageModule.getConfig();
    RenderModule.toggleDarkMode(config.darkMode);
    document.getElementById('btnDarkMode').addEventListener('click', () => {
      const current = StorageModule.getConfig().darkMode;
      const next = !current;
      StorageModule.setConfig({ darkMode: next });
      RenderModule.toggleDarkMode(next);
      // redraw charts with new theme colors
      RenderModule.renderCharts(StorageModule.getExpenses());
    });
  };

  const bindDataManagement = () => {
    document.getElementById('btnExport').addEventListener('click', ImportExportModule.exportData);
    document.getElementById('btnExportCsv').addEventListener('click', ImportExportModule.exportCSV);
    document.getElementById('btnPrint').addEventListener('click', () => window.print());
    document.getElementById('btnImport').addEventListener('click', () => document.getElementById('fileInput').click());
    document.getElementById('fileInput').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) ImportExportModule.importData(file);
      e.target.value = '';
    });
    document.getElementById('btnClear').addEventListener('click', async () => {
      const ok = await RenderModule.confirmDialog('Xóa TOÀN BỘ dữ liệu chi tiêu? Hành động này không thể hoàn tác.');
      if (ok) {
        StorageModule.clearAll();
        RenderModule.renderAll();
        RenderModule.showToast('Đã xóa toàn bộ dữ liệu', 'info');
      }
    });
  };

  const bindConfirmDialog = () => {
    document.getElementById('btnConfirmOk').addEventListener('click', () => RenderModule.resolveConfirm(true));
    document.getElementById('btnConfirmCancel').addEventListener('click', () => RenderModule.resolveConfirm(false));
  };

  const bindKeyboardShortcuts = () => {
    document.addEventListener('keydown', (e) => {
      const tag = document.activeElement.tagName;
      const isTyping = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

      if (e.key === 'Escape') {
        document.querySelectorAll('.modal.active').forEach((m) => m.classList.remove('active'));
        return;
      }
      if (!isTyping && (e.key === 'n' || e.key === 'N')) {
        e.preventDefault();
        FormModule.openAddModal();
      }
    });
  };

  const checkBackupReminder = () => {
    const expenses = StorageModule.getExpenses();
    if (expenses.length === 0) return;

    const config = StorageModule.getConfig();
    const now = Date.now();
    const snoozedUntil = config.backupReminderSnoozedUntil ? new Date(config.backupReminderSnoozedUntil).getTime() : 0;
    if (now < snoozedUntil) return;

    const lastExport = config.lastExportedAt ? new Date(config.lastExportedAt).getTime() : null;
    const daysSinceExport = lastExport ? (now - lastExport) / (1000 * 60 * 60 * 24) : Infinity;
    if (daysSinceExport <= 14) return;

    StorageModule.setConfig({ backupReminderSnoozedUntil: new Date(now + 2 * 24 * 60 * 60 * 1000).toISOString() });
    RenderModule.showToast(
      'Đã lâu chưa sao lưu dữ liệu — nên Export JSON để tránh mất dữ liệu khi đổi máy/xóa cache',
      'warning',
      8000,
      'Xuất dữ liệu',
      () => ImportExportModule.exportData()
    );
  };

  const init = () => {
    bindModalCloseTriggers();
    bindExpenseForm();
    bindTableSort();
    bindFilters();
    bindSettings();
    bindDarkMode();
    bindDataManagement();
    bindConfirmDialog();
    bindKeyboardShortcuts();

    RenderModule.renderCategoryOptions(document.getElementById('filterCategory'), '', true);
  };

  return { init, checkBackupReminder };
})();

/* ============================================================================
   APP INIT
   ============================================================================ */
document.addEventListener('DOMContentLoaded', () => {
  StorageModule.initDefaults();
  Icons.applyAll();
  EventHandlers.init();
  RenderModule.renderAll();
  EventHandlers.checkBackupReminder();
});
