const STORAGE_KEY = "freedom-timeline-state";
const THEME_KEY = "freedom-timeline-theme";

const DEFAULT_STATE = {
  family: [
    { name: "나", birthDate: "1980-01-01" },
    { name: "배우자", birthDate: "1980-01-01" },
    { name: "자녀1", birthDate: "2010-01-01" },
    { name: "자녀2", birthDate: "2012-01-01" },
  ],
  finance: {
    currentNetWorth: 500000000,
    annualIncome: 120000000,
    annualExpense: 80000000,
    returnRate: 5,
    inflationRate: 3,
    incomeGrowthRate: 3,
    retirementAge: 55,
    lifeExpectancy: 100,
    withdrawalRate: 4,
    pensionStartAge: 65,
    annualPensionAmount: 20000000,
  },
};

const FIELD_CONFIGS = [
  { key: "currentNetWorth", label: "현재 순자산(원)", min: 0, max: 3000000000, step: 1000000, unit: "money" },
  { key: "annualIncome", label: "연간 소득(원)", min: 0, max: 1000000000, step: 1000000, unit: "money" },
  { key: "annualExpense", label: "연간 지출(원)", min: 0, max: 1000000000, step: 1000000, unit: "money" },
  { key: "returnRate", label: "투자 기대 수익률(%)", min: 0, max: 20, step: 0.1, unit: "percent" },
  { key: "inflationRate", label: "인플레이션(%)", min: 0, max: 20, step: 0.1, unit: "percent" },
  { key: "incomeGrowthRate", label: "소득 증가율(%)", min: 0, max: 20, step: 0.1, unit: "percent" },
  { key: "retirementAge", label: "은퇴 희망 나이(세)", min: 30, max: 100, step: 1, unit: "age" },
  { key: "lifeExpectancy", label: "기대 수명(세)", min: 40, max: 120, step: 1, unit: "age" },
  { key: "withdrawalRate", label: "경제적 자유 인출률(%)", min: 1, max: 10, step: 0.1, unit: "percent" },
  { key: "pensionStartAge", label: "연금 수령 시작 나이(세)", min: 40, max: 100, step: 1, unit: "age" },
  { key: "annualPensionAmount", label: "연간 연금 수령액(원)", min: 0, max: 300000000, step: 1000000, unit: "money" },
];

const state = loadState();
let netWorthChart;
let cashFlowChart;

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_STATE);
    const parsed = JSON.parse(raw);
    return {
      family: Array.isArray(parsed.family) && parsed.family.length > 0 ? parsed.family : structuredClone(DEFAULT_STATE.family),
      finance: { ...structuredClone(DEFAULT_STATE.finance), ...(parsed.finance || {}) },
    };
  } catch {
    return structuredClone(DEFAULT_STATE);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function formatMoney(value) {
  return new Intl.NumberFormat("ko-KR").format(Math.round(value)) + "원";
}

function formatCompactMoney(value) {
  const abs = Math.abs(value);
  if (abs >= 100000000) return (value / 100000000).toFixed(1) + "억";
  if (abs >= 10000) return new Intl.NumberFormat("ko-KR").format(Math.round(value / 10000)) + "만";
  return new Intl.NumberFormat("ko-KR").format(Math.round(value));
}

function formatHint(field, value) {
  if (field.unit === "money") return "≈ " + formatCompactMoney(value);
  if (field.unit === "percent") return value + "%";
  if (field.unit === "age") return value + "세";
  return String(value);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getAge(birthDate) {
  if (!birthDate) return 0;
  const today = new Date();
  const birth = new Date(birthDate);
  if (Number.isNaN(birth.getTime())) return 0;
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  const dayDiff = today.getDate() - birth.getDate();
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) age -= 1;
  return Math.max(age, 0);
}

function renderFamily() {
  const list = document.getElementById("family-list");
  list.innerHTML = "";
  state.family.forEach((member, index) => {
    const wrapper = document.createElement("div");
    wrapper.className = "family-item";
    const age = getAge(member.birthDate);
    wrapper.innerHTML = `
      <div class="row">
        <label style="flex:1">
          이름
          <input type="text" data-type="name" data-index="${index}" value="${member.name}" />
        </label>
        <label style="flex:1">
          생년월일
          <input type="date" data-type="birthDate" data-index="${index}" value="${member.birthDate}" />
        </label>
        <button type="button" data-action="delete" data-index="${index}">삭제</button>
      </div>
      <div class="member-age">만 나이 ${age}세</div>
    `;
    list.appendChild(wrapper);
  });
}

function renderFinanceFields() {
  const container = document.getElementById("finance-fields");
  container.innerHTML = "";
  FIELD_CONFIGS.forEach((field) => {
    const value = Number(state.finance[field.key] ?? 0);
    const wrapper = document.createElement("div");
    wrapper.className = "field";
    wrapper.innerHTML = `
      <label>${field.label}</label>
      <div class="range-row">
        <input
          type="range"
          data-key="${field.key}"
          data-input-kind="range"
          min="${field.min}"
          max="${field.max}"
          step="${field.step}"
          value="${value}"
        />
        <input
          type="number"
          data-key="${field.key}"
          data-input-kind="number"
          min="${field.min}"
          max="${field.max}"
          step="${field.step}"
          value="${value}"
        />
      </div>
      <div class="field-hint" data-hint="${field.key}">${formatHint(field, value)}</div>
    `;
    container.appendChild(wrapper);
  });
}

function calculateProjection(overrides = {}) {
  const finance = { ...state.finance, ...overrides };
  const owner = state.family[0] || DEFAULT_STATE.family[0];
  const currentAge = getAge(owner.birthDate);
  const lifeExpectancy = Math.max(finance.lifeExpectancy, currentAge + 1);
  const retirementAge = clamp(finance.retirementAge, currentAge, lifeExpectancy);
  const pensionStartAge = clamp(finance.pensionStartAge, currentAge, lifeExpectancy);
  const returnRate = finance.returnRate / 100;
  const inflationRate = finance.inflationRate / 100;
  const incomeGrowthRate = finance.incomeGrowthRate / 100;
  const withdrawalRate = Math.max(finance.withdrawalRate / 100, 0.001);

  let netWorth = finance.currentNetWorth;
  let income = finance.annualIncome;
  let expense = finance.annualExpense;
  let fiAge = null;

  const rows = [];
  for (let age = currentAge; age <= lifeExpectancy; age += 1) {
    if (age > currentAge) {
      if (age <= retirementAge) {
        income *= 1 + incomeGrowthRate;
      } else {
        income = age >= pensionStartAge ? finance.annualPensionAmount : 0;
      }
      expense *= 1 + inflationRate;
      netWorth = netWorth * (1 + returnRate) + income - expense;
    }
    const goalAsset = expense / withdrawalRate;
    if (fiAge === null && netWorth >= goalAsset) fiAge = age;
    rows.push({ age, netWorth, income, expense, goalAsset });
  }

  const retirementRow = rows.find((row) => row.age === retirementAge) || rows[rows.length - 1];
  const finalRow = rows[rows.length - 1];

  return {
    currentAge,
    retirementAge,
    fiAge,
    rows,
    retirementNetWorth: retirementRow.netWorth,
    finalNetWorth: finalRow.netWorth,
    currentFiTarget: finance.annualExpense / withdrawalRate,
    annualSurplus: finance.annualIncome - finance.annualExpense,
  };
}

function renderCards(base) {
  const hero = document.getElementById("result-hero");
  if (base.fiAge !== null) {
    const yearsToFi = Math.max(base.fiAge - base.currentAge, 0);
    hero.className = "hero";
    hero.innerHTML = `
      <div class="label">예상 경제적 자유 달성 나이</div>
      <div class="big">${base.fiAge}세</div>
      <div class="sub">${yearsToFi === 0 ? "이미 달성" : `달성까지 ${yearsToFi}년`}</div>
    `;
  } else {
    hero.className = "hero unreached";
    hero.innerHTML = `
      <div class="label">예상 경제적 자유 달성 나이</div>
      <div class="big">미달성</div>
      <div class="sub">현재 입력값으로는 기대 수명 내에 목표 자산에 도달하지 못합니다.</div>
    `;
  }

  const container = document.getElementById("result-cards");
  const cards = [
    { title: "현재 기준 경제적 자유 목표 자산", value: formatMoney(base.currentFiTarget) },
    { title: "현재 연간 잉여자금", value: formatMoney(base.annualSurplus) },
    { title: "은퇴 시점 예상 순자산", value: formatMoney(base.retirementNetWorth) },
    { title: "기대 수명 시점 예상 순자산", value: formatMoney(base.finalNetWorth) },
  ];
  container.innerHTML = cards
    .map(
      (card) => `
        <article class="card">
          <div class="title">${card.title}</div>
          <div class="value">${card.value}</div>
        </article>
      `
    )
    .join("");
}

function renderScenarioCards() {
  const container = document.getElementById("scenario-cards");
  const base = calculateProjection();
  const conservative = calculateProjection({
    returnRate: Math.max(state.finance.returnRate - 2, 0),
    inflationRate: state.finance.inflationRate + 1,
  });
  const optimistic = calculateProjection({
    returnRate: state.finance.returnRate + 2,
    inflationRate: Math.max(state.finance.inflationRate - 1, 0),
  });

  const scenarios = [
    { name: "보수적", data: conservative },
    { name: "기본", data: base },
    { name: "낙관적", data: optimistic },
  ];

  container.innerHTML = scenarios
    .map(
      (scenario) => `
      <article class="card">
        <div class="title">${scenario.name}</div>
        <div class="value">${formatMoney(scenario.data.finalNetWorth)}</div>
        <div>FI 나이: ${scenario.data.fiAge ? `${scenario.data.fiAge}세` : "미달성"}</div>
      </article>
    `
    )
    .join("");
}

function renderCharts(base) {
  if (typeof Chart === "undefined") {
    const networthCanvas = document.getElementById("networth-chart");
    const cashflowCanvas = document.getElementById("cashflow-chart");
    const networthPanel = networthCanvas.parentElement;
    const cashflowPanel = cashflowCanvas.parentElement;
    if (!networthPanel.querySelector(".chart-fallback")) {
      const message = document.createElement("p");
      message.className = "chart-fallback";
      message.textContent = "Chart.js를 불러오지 못해 그래프를 표시할 수 없습니다.";
      networthPanel.appendChild(message);
    }
    if (!cashflowPanel.querySelector(".chart-fallback")) {
      const message = document.createElement("p");
      message.className = "chart-fallback";
      message.textContent = "Chart.js를 불러오지 못해 그래프를 표시할 수 없습니다.";
      cashflowPanel.appendChild(message);
    }
    return;
  }

  const css = getComputedStyle(document.documentElement);
  const readVar = (name, fallback) => css.getPropertyValue(name).trim() || fallback;
  const primary = readVar("--primary", "#2563eb");
  const danger = readVar("--danger", "#dc2626");
  const success = readVar("--success", "#16a34a");
  const warning = readVar("--warning", "#f97316");
  const textColor = readVar("--text", "#1e293b");
  const gridColor = readVar("--border", "#e2e8f0");

  const labels = base.rows.map((row) => `${row.age}세`);
  const netWorthData = base.rows.map((row) => row.netWorth);
  const goalData = base.rows.map(() => base.currentFiTarget);
  const incomeData = base.rows.map((row) => row.income);
  const expenseData = base.rows.map((row) => row.expense);

  const markerRadius = base.rows.map((row) =>
    row.age === base.fiAge || row.age === base.retirementAge ? 6 : 0
  );
  const markerColor = base.rows.map((row) =>
    row.age === base.fiAge ? success : row.age === base.retirementAge ? warning : primary
  );

  const moneyAxis = {
    ticks: { color: textColor, maxTicksLimit: 8, callback: (value) => formatCompactMoney(value) },
    grid: { color: gridColor },
  };
  const ageAxis = {
    ticks: { color: textColor, maxTicksLimit: 12 },
    grid: { color: gridColor },
  };
  const legend = { position: "bottom", labels: { color: textColor } };
  const moneyTooltip = {
    callbacks: { label: (ctx) => `${ctx.dataset.label}: ${formatMoney(ctx.parsed.y)}` },
  };

  if (netWorthChart) netWorthChart.destroy();
  if (cashFlowChart) cashFlowChart.destroy();

  netWorthChart = new Chart(document.getElementById("networth-chart"), {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "순자산",
          data: netWorthData,
          borderColor: primary,
          tension: 0.2,
          fill: false,
          pointRadius: markerRadius,
          pointHoverRadius: 7,
          pointBackgroundColor: markerColor,
          pointBorderColor: markerColor,
        },
        {
          label: "경제적 자유 목표 자산",
          data: goalData,
          borderColor: danger,
          borderDash: [8, 6],
          tension: 0,
          fill: false,
          pointRadius: 0,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: { legend, tooltip: moneyTooltip },
      scales: { x: ageAxis, y: moneyAxis },
    },
  });

  cashFlowChart = new Chart(document.getElementById("cashflow-chart"), {
    type: "bar",
    data: {
      labels,
      datasets: [
        { label: "소득", data: incomeData, backgroundColor: success },
        { label: "지출", data: expenseData, backgroundColor: warning },
      ],
    },
    options: {
      responsive: true,
      plugins: { legend, tooltip: moneyTooltip },
      scales: { x: ageAxis, y: moneyAxis },
    },
  });
}

function rerenderResults() {
  saveState();
  const base = calculateProjection();
  renderCards(base);
  renderScenarioCards();
  renderCharts(base);
}

function recalculateAndRender() {
  renderFamily();
  renderFinanceFields();
  rerenderResults();
}

function initThemeToggle() {
  const btn = document.getElementById("theme-toggle");
  const sync = () => {
    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    btn.textContent = isDark ? "☀️" : "🌙";
  };
  sync();
  btn.addEventListener("click", () => {
    const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem(THEME_KEY, next);
    sync();
    rerenderResults();
  });
}

function attachEvents() {
  initThemeToggle();

  document.getElementById("add-member-btn").addEventListener("click", () => {
    state.family.push({ name: `구성원${state.family.length + 1}`, birthDate: "2000-01-01" });
    recalculateAndRender();
  });

  document.getElementById("reset-btn").addEventListener("click", () => {
    state.family = structuredClone(DEFAULT_STATE.family);
    state.finance = structuredClone(DEFAULT_STATE.finance);
    recalculateAndRender();
  });

  document.body.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;

    const memberIndex = Number(target.dataset.index);
    const memberType = target.dataset.type;
    if (!Number.isNaN(memberIndex) && memberType && state.family[memberIndex]) {
      state.family[memberIndex][memberType] = target.value;
      recalculateAndRender();
      return;
    }

    const key = target.dataset.key;
    if (!key || !(key in state.finance)) return;

    const field = FIELD_CONFIGS.find((item) => item.key === key);
    const parsed = Number(target.value);
    const value = Number.isFinite(parsed) ? parsed : 0;
    const nextValue = field ? clamp(value, field.min, field.max) : value;
    state.finance[key] = nextValue;

    document.querySelectorAll(`input[data-key="${key}"]`).forEach((input) => {
      input.value = String(nextValue);
    });
    if (field) {
      const hint = document.querySelector(`[data-hint="${key}"]`);
      if (hint) hint.textContent = formatHint(field, nextValue);
    }
    rerenderResults();
  });

  document.body.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) return;
    if (target.dataset.action !== "delete") return;
    const index = Number(target.dataset.index);
    if (Number.isNaN(index)) return;
    state.family.splice(index, 1);
    if (state.family.length === 0) {
      state.family.push({ name: "나", birthDate: DEFAULT_STATE.family[0].birthDate });
    }
    recalculateAndRender();
  });
}

attachEvents();
recalculateAndRender();
