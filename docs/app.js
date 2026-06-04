const STORAGE_KEY = "freedom-timeline-state";

const DEFAULT_STATE = {
  family: [
    { name: "나", birthDate: "1985-01-01" },
    { name: "배우자", birthDate: "1986-01-01" },
    { name: "자녀1", birthDate: "2015-01-01" },
    { name: "자녀2", birthDate: "2018-01-01" },
  ],
  finance: {
    currentNetWorth: 500000000,
    annualIncome: 120000000,
    annualExpense: 60000000,
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
  { key: "currentNetWorth", label: "현재 순자산(원)", min: 0, max: 3000000000, step: 1000000 },
  { key: "annualIncome", label: "연간 소득(원)", min: 0, max: 1000000000, step: 1000000 },
  { key: "annualExpense", label: "연간 지출(원)", min: 0, max: 1000000000, step: 1000000 },
  { key: "returnRate", label: "투자 기대 수익률(%)", min: 0, max: 20, step: 0.1 },
  { key: "inflationRate", label: "인플레이션(%)", min: 0, max: 20, step: 0.1 },
  { key: "incomeGrowthRate", label: "소득 증가율(%)", min: 0, max: 20, step: 0.1 },
  { key: "retirementAge", label: "은퇴 희망 나이(세)", min: 30, max: 100, step: 1 },
  { key: "lifeExpectancy", label: "기대 수명(세)", min: 40, max: 120, step: 1 },
  { key: "withdrawalRate", label: "경제적 자유 인출률(%)", min: 1, max: 10, step: 0.1 },
  { key: "pensionStartAge", label: "연금 수령 시작 나이(세)", min: 40, max: 100, step: 1 },
  { key: "annualPensionAmount", label: "연간 연금 수령액(원)", min: 0, max: 300000000, step: 1000000 },
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
        <button type="button" data-action="delete" data-index="${index}">삭제</button>
      </div>
      <div class="row">
        <label style="flex:1">
          생년월일
          <input type="date" data-type="birthDate" data-index="${index}" value="${member.birthDate}" />
        </label>
        <div>만 나이: <strong>${age}세</strong></div>
      </div>
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
  const container = document.getElementById("result-cards");
  const cards = [
    { title: "현재 기준 경제적 자유 목표 자산", value: formatMoney(base.currentFiTarget) },
    { title: "현재 연간 잉여자금", value: formatMoney(base.annualSurplus) },
    { title: "예상 경제적 자유 달성 나이", value: base.fiAge ? `${base.fiAge}세` : "미달성" },
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

  const labels = base.rows.map((row) => `${row.age}세`);
  const netWorthData = base.rows.map((row) => row.netWorth);
  const goalData = base.rows.map(() => base.currentFiTarget);
  const incomeData = base.rows.map((row) => row.income);
  const expenseData = base.rows.map((row) => row.expense);

  if (netWorthChart) netWorthChart.destroy();
  if (cashFlowChart) cashFlowChart.destroy();

  netWorthChart = new Chart(document.getElementById("networth-chart"), {
    type: "line",
    data: {
      labels,
      datasets: [
        { label: "순자산", data: netWorthData, borderColor: "#2563eb", tension: 0.2, fill: false },
        {
          label: "경제적 자유 목표 자산",
          data: goalData,
          borderColor: "#dc2626",
          borderDash: [8, 6],
          tension: 0,
          fill: false,
        },
      ],
    },
    options: { responsive: true, plugins: { legend: { position: "bottom" } } },
  });

  cashFlowChart = new Chart(document.getElementById("cashflow-chart"), {
    type: "bar",
    data: {
      labels,
      datasets: [
        { label: "소득", data: incomeData, backgroundColor: "#16a34a" },
        { label: "지출", data: expenseData, backgroundColor: "#f97316" },
      ],
    },
    options: { responsive: true, plugins: { legend: { position: "bottom" } } },
  });
}

function recalculateAndRender() {
  saveState();
  renderFamily();
  renderFinanceFields();
  const base = calculateProjection();
  renderCards(base);
  renderScenarioCards();
  renderCharts(base);
}

function attachEvents() {
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
    recalculateAndRender();
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
