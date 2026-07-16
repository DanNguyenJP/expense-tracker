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
    categoryList: DEFAULT_CATEGORIES
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
    saveExpenses(data.expenses);
    if (data.config && typeof data.config === 'object') {
      localStorage.setItem(CONFIG_KEY, JSON.stringify({ ...DEFAULT_CONFIG, ...data.config }));
    }
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

  const setFilter = (key, value) => { state[key] = value; };
  const getFilters = () => ({ ...state });
  const resetFilters = () => { state = { month: '', category: '', paidBy: '', expenseType: '', keyword: '' }; };

  const applyFilters = (expenses) => {
    return expenses.filter((e) => {
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
  };

  return { setFilter, getFilters, resetFilters, applyFilters };
})();

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

    const sorted = [...expenses].sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt));

    tbody.innerHTML = sorted.map((e) => {
      const paidByName = e.paidBy === 'A' ? config.personA.name : config.personB.name;
      const ownerName = e.expenseType === 'Personal' ? (e.owner === 'A' ? config.personA.name : config.personB.name) : '—';
      const typeLabel = e.expenseType === 'Shared' ? 'Chung' : 'Cá nhân';
      const badgeClass = e.expenseType === 'Shared' ? 'badge-shared' : 'badge-personal';
      const catLabel = StorageModule.CATEGORY_LABELS_VI[e.category] || e.category;
      return `
        <tr data-id="${e.id}">
          <td>${e.date}</td>
          <td>${escapeHtml(e.description)}</td>
          <td>${catLabel}</td>
          <td class="amount-cell">${formatCurrency(e.amount)}</td>
          <td>${paidByName}</td>
          <td><span class="badge ${badgeClass}">${typeLabel}</span></td>
          <td>${ownerName}</td>
          <td>
            <button class="btn-table-action btn-edit" data-id="${e.id}" title="Sửa" aria-label="Sửa">✏️</button>
            <button class="btn-table-action btn-delete" data-id="${e.id}" title="Xóa" aria-label="Xóa">🗑️</button>
          </td>
        </tr>`;
    }).join('');
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
  const showToast = (message, type = 'info', duration = 3500) => {
    const container = document.getElementById('toastContainer');
    const id = `toast-${++toastCounter}`;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.id = id;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('fade-out');
      setTimeout(() => toast.remove(), 260);
    }, duration);
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
    document.getElementById('darkModeIcon').textContent = enabled ? '☀️' : '🌙';
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

  return { openAddModal, openEditModal, closeModal: () => RenderModule.closeModal('expenseModal'), handleExpenseTypeChange, handleSubmit, resetForm };
})();

/* ============================================================================
   IMPORT / EXPORT MODULE
   ============================================================================ */
const ImportExportModule = (() => {
  const exportData = () => {
    const json = StorageModule.exportJSON();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `expense-data-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    RenderModule.showToast('Đã export dữ liệu ra file JSON', 'success');
  };

  const importData = async (file) => {
    try {
      const text = await file.text();
      const proceed = await RenderModule.confirmDialog('Import sẽ ghi đè toàn bộ dữ liệu hiện tại. Tiếp tục?');
      if (!proceed) return;
      StorageModule.importJSON(text);
      RenderModule.renderAll();
      RenderModule.showToast('Đã import dữ liệu thành công', 'success');
    } catch (err) {
      RenderModule.showToast('File JSON không hợp lệ', 'error');
    }
  };

  return { exportData, importData };
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

    document.getElementById('expenseTableBody').addEventListener('click', async (e) => {
      const editBtn = e.target.closest('.btn-edit');
      const delBtn = e.target.closest('.btn-delete');
      if (editBtn) FormModule.openEditModal(editBtn.dataset.id);
      if (delBtn) {
        const ok = await RenderModule.confirmDialog('Bạn có chắc muốn xóa khoản chi này không?');
        if (ok) {
          StorageModule.deleteExpense(delBtn.dataset.id);
          RenderModule.renderAll();
          RenderModule.showToast('Đã xóa khoản chi', 'info');
        }
      }
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

  const init = () => {
    bindModalCloseTriggers();
    bindExpenseForm();
    bindFilters();
    bindSettings();
    bindDarkMode();
    bindDataManagement();
    bindConfirmDialog();
    bindKeyboardShortcuts();

    RenderModule.renderCategoryOptions(document.getElementById('filterCategory'), '', true);
  };

  return { init };
})();

/* ============================================================================
   APP INIT
   ============================================================================ */
document.addEventListener('DOMContentLoaded', () => {
  StorageModule.initDefaults();
  EventHandlers.init();
  RenderModule.renderAll();
});
