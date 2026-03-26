// app.js

// ─── LOGIN ───
const APP_PASSWORD = 'Senha153045!';

function initLogin() {
  const loginScreen = document.getElementById('login-screen');
  const appContainer = document.getElementById('app-container');
  const pwdInput = document.getElementById('login-password');
  const btnEnter = document.getElementById('btn-enter');
  const loginError = document.getElementById('login-error');
  const togglePwd = document.getElementById('toggle-password');

  // Check if already authenticated in this session
  if (sessionStorage.getItem('projectum_auth') === 'true') {
    loginScreen.style.display = 'none';
    appContainer.style.display = '';
    return true;
  }

  function attemptLogin() {
    if (pwdInput.value === APP_PASSWORD) {
      sessionStorage.setItem('projectum_auth', 'true');
      loginScreen.style.display = 'none';
      appContainer.style.display = '';
      initAppAfterLogin();
    } else {
      loginError.style.display = 'block';
      pwdInput.classList.add('shake');
      setTimeout(() => pwdInput.classList.remove('shake'), 400);
    }
  }

  btnEnter.addEventListener('click', attemptLogin);
  pwdInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') attemptLogin();
    loginError.style.display = 'none';
  });

  togglePwd.addEventListener('click', () => {
    const isPassword = pwdInput.type === 'password';
    pwdInput.type = isPassword ? 'text' : 'password';
    togglePwd.textContent = isPassword ? '🙈' : '👁️';
  });

  return false;
}

// ─── STATE ───
let currentCompanyFilter = 'all';
let currentMonthFilter = 'all';
let currentSearch = '';
let isCloudData = false;

// ─── MSAL CONFIG ───
const msalConfig = {
    auth: {
        clientId: '7f49a4a7-b0d6-4da6-ae59-af44e2947d40',
        authority: 'https://login.microsoftonline.com/common'
    }
};
const msalInstance = new msal.PublicClientApplication(msalConfig);
const loginRequest = { scopes: ["User.Read", "Files.Read"] };

// Contains charts instances
let barChartInst = null;
let doughnutInst = null;

// ─── UTILS ───
const formatMoney = (val) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
const parseMoney = (val) => typeof val === 'number' ? val : 0;

// ─── INIT ───
document.addEventListener('DOMContentLoaded', async () => {
  await msalInstance.initialize();

  const alreadyAuth = initLogin();
  if (alreadyAuth) {
    initAppAfterLogin();
  }
});

function initAppAfterLogin() {
  initFilters();
  initAuth();

  // Try to use cloud data if logged in, otherwise use local data.js
  const activeAccount = msalInstance.getActiveAccount();
  if (activeAccount) {
     fetchCloudData();
  } else {
     renderApp();
  }
}

// ─── AUTH LOGIC ───
function initAuth() {
  const btnLogin = document.getElementById('btn-login');
  
  msalInstance.handleRedirectPromise().then((tokenResponse) => {
      if (tokenResponse) {
          msalInstance.setActiveAccount(tokenResponse.account);
          fetchCloudData();
      } else {
          const currentAccounts = msalInstance.getAllAccounts();
          if (currentAccounts && currentAccounts.length > 0) {
              msalInstance.setActiveAccount(currentAccounts[0]);
              fetchCloudData();
          }
      }
  }).catch((error) => console.error(error));

  btnLogin.addEventListener('click', () => {
      if (!msalInstance.getActiveAccount()) {
          msalInstance.loginPopup(loginRequest).then(response => {
              msalInstance.setActiveAccount(response.account);
              fetchCloudData();
          }).catch(error => console.error("Login popup failed:", error));
      } else {
          msalInstance.logoutPopup();
      }
  });
}

function updateAuthUI() {
    const account = msalInstance.getActiveAccount();
    const btnLogin = document.getElementById('btn-login');
    const userName = document.getElementById('user-display-name');
    
    if (account) {
        btnLogin.innerHTML = '<span class="nav-icon" style="font-size: 14px; margin-right: 6px;">🚪</span> Desconectar';
        btnLogin.style.background = 'rgba(255,42,133,0.15)';
        btnLogin.style.borderColor = 'var(--neon-pink)';
        userName.textContent = account.name || 'Usuário OneDrive';
    } else {
        btnLogin.innerHTML = '<span class="nav-icon" style="font-size: 14px; margin-right: 6px;">☁️</span> Conectar OneDrive';
        btnLogin.style.background = 'rgba(79,142,247,0.15)';
        btnLogin.style.borderColor = 'var(--js-brand)';
        userName.textContent = 'Administrador (Local)';
    }
}

// ─── GRAPH API LOGIC ───
async function fetchCloudData() {
    updateAuthUI();
    const statusDiv = document.getElementById('auth-status');
    statusDiv.style.display = 'block';
    statusDiv.textContent = 'Buscando planilha no OneDrive...';

    try {
        const tokenResponse = await msalInstance.acquireTokenSilent(loginRequest);
        
        // Find the Excel file in the root
        const searchRes = await fetch("https://graph.microsoft.com/v1.0/me/drive/root/search(q='Planilha Salários Projectum 2026')", {
            headers: { Authorization: `Bearer ${tokenResponse.accessToken}` }
        });
        const searchData = await searchRes.json();
        const file = searchData.value.find(f => f.name.includes('.xlsx'));
        
        if (!file) {
            statusDiv.textContent = 'Erro: Planilha Excel não encontrada.';
            return;
        }

        statusDiv.textContent = 'Lendo dados da planilha...';
        // Needs a known table or worksheet name. We'll try to read the first worksheet's usedRange.
        const worksheetsRes = await fetch(`https://graph.microsoft.com/v1.0/me/drive/items/${file.id}/workbook/worksheets`, {
             headers: { Authorization: `Bearer ${tokenResponse.accessToken}` }
        });
        const worksheetsData = await worksheetsRes.json();
        
        if (!worksheetsData.value || worksheetsData.value.length === 0) {
            statusDiv.textContent = 'Erro: Nenhuma aba encontrada no Excel.';
            return;
        }
        
        const sheetId = worksheetsData.value[0].id;
        const rangeRes = await fetch(`https://graph.microsoft.com/v1.0/me/drive/items/${file.id}/workbook/worksheets/${sheetId}/usedRange`, {
            headers: { Authorization: `Bearer ${tokenResponse.accessToken}` }
        });
        
        const rangeData = await rangeRes.json();
        if (rangeData.values && rangeData.values.length > 1) {
             parseExcelToEmployees(rangeData.values);
             isCloudData = true;
             statusDiv.textContent = 'Conectado e Atualizado (Nuvem)';
             statusDiv.style.color = 'var(--lt-brand)';
             renderApp();
        } else {
             statusDiv.textContent = 'Erro: Planilha vazia.';
        }
        
    } catch (err) {
        console.error("Graph API Error:", err);
        statusDiv.textContent = 'Falha ao sincronizar. Usando dados locais.';
        statusDiv.style.color = 'var(--neon-pink)';
        renderApp();
    }
}

function parseExcelToEmployees(rows) {
    // Basic heuristic parser: mapping the typical columns we've seen
    // Columns might differ, but assuming standard format:
    // [ID, Nome, Cargo, Origem, Empresa, Mes, Base, Insalub, Extra, INSS, FGTS, Transp, Adiant, Total]
    
    // We expect the first row to be headers
    const newEmployees = [];
    
    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row[0]) continue; // Skip empty rows
        
        // Map based on the structure we created in data.js
        // If the user's Excel column order is different, they'll need to adjust this.
        newEmployees.push({
             id: row[0],
             nome: row[1],
             cargo: row[2],
             origem: row[3] || '—',
             empresa: row[4] || 'N/A',
             mes: row[5] || 'Desconhecido',
             salario_base: parseMoney(row[6]),
             insalubridade: parseMoney(row[7]),
             hora_extra: parseMoney(row[8]),
             inss: parseMoney(row[9]),
             fgts: parseMoney(row[10]),
             transporte: parseMoney(row[11]),
             adiantamento: parseMoney(row[12]),
             total: parseMoney(row[13])
        });
    }
    
    // Overwrite the global variable that came from data.js
    window.employeesData = newEmployees;
}

// ─── FILTER LOGIC ───
function initFilters() {
  const chips = document.querySelectorAll('.chip');
  chips.forEach(chip => {
    chip.addEventListener('click', (e) => {
      chips.forEach(c => c.classList.remove('active'));
      e.target.classList.add('active');
      currentCompanyFilter = e.target.dataset.filter;
      renderApp();
    });
  });

  const monthSelect = document.getElementById('month-filter');
  monthSelect.addEventListener('change', (e) => {
    currentMonthFilter = e.target.value;
    renderApp();
  });

  const searchInput = document.getElementById('emp-search');
  searchInput.addEventListener('input', (e) => {
    currentSearch = e.target.value.toLowerCase();
    renderApp(); // using table rendering instead of full app render if needed to optimize
  });

  const exportBtn = document.getElementById('btn-export');
  if (exportBtn) {
    exportBtn.addEventListener('click', exportToCSV);
  }
}

function getFilteredData() {
  return employeesData.filter(emp => {
    const matchCompany = currentCompanyFilter === 'all' || emp.empresa === currentCompanyFilter;
    const matchMonth = currentMonthFilter === 'all' || emp.mes === currentMonthFilter;
    const matchSearch = currentSearch === '' || 
                        emp.nome.toLowerCase().includes(currentSearch) || 
                        emp.cargo.toLowerCase().includes(currentSearch);
    
    return matchCompany && matchMonth && matchSearch;
  });
}


// ─── RENDER ───
function renderApp() {
  const data = getFilteredData();
  
  updateKPIs(data);
  renderTable(data);
  renderCharts(getFilteredDataForCharts());
}

// Separate getter since search shouldn't affect charts
function getFilteredDataForCharts() {
  return employeesData.filter(emp => {
    const matchCompany = currentCompanyFilter === 'all' || emp.empresa === currentCompanyFilter;
    const matchMonth = currentMonthFilter === 'all' || emp.mes === currentMonthFilter;
    return matchCompany && matchMonth;
  });
}

// ─── KPIs ───
function updateKPIs(data) {
  let totalFolha = 0;
  let totalEncargos = 0;
  let totalBeneficios = 0;
  
  // Use a map to track unique contracts (ID + Empresa combination if needed, but ID seems unique per company panel in source)
  const uniqueContracts = new Set();
  
  data.forEach(emp => {
    totalFolha += parseMoney(emp.total);
    totalEncargos += parseMoney(emp.inss) + parseMoney(emp.fgts);
    totalBeneficios += parseMoney(emp.transporte) + parseMoney(emp.insalubridade) + parseMoney(emp.adiantamento);
    uniqueContracts.add(`${emp.id}-${emp.empresa}-${emp.mes}`);
  });

  document.getElementById('kpi-total-folha').innerText = formatMoney(totalFolha);
  document.getElementById('kpi-colaboradores').innerText = uniqueContracts.size.toString();
  document.getElementById('kpi-encargos').innerText = formatMoney(totalEncargos);
  document.getElementById('kpi-beneficios').innerText = formatMoney(totalBeneficios);
}

// ─── TABLE ───
function renderTable(data) {
  const tbody = document.getElementById('emp-tbody');
  const emptyState = document.getElementById('empty-state');
  
  tbody.innerHTML = '';
  
  if (data.length === 0) {
    emptyState.style.display = 'block';
    return;
  }
  
  emptyState.style.display = 'none';

  // Sort by Total Descending
  const sorted = [...data].sort((a,b) => parseMoney(b.total) - parseMoney(a.total));

  sorted.forEach(emp => {
    const tr = document.createElement('tr');
    
    const badgeClass = emp.empresa === 'Just Smile' ? 'badge-js' : 'badge-lt';
    
    // Aggregations
    const base = parseMoney(emp.salario_base);
    const extras = parseMoney(emp.insalubridade) + parseMoney(emp.hora_extra) + parseMoney(emp.adiantamento) + parseMoney(emp.transporte);
    const impostos = parseMoney(emp.inss) + parseMoney(emp.fgts);
    const total = parseMoney(emp.total);
    
    tr.innerHTML = `
      <td>
        <div class="emp-name">${emp.nome}</div>
        <div class="emp-id">${emp.id}</div>
      </td>
      <td>
        <div class="emp-role">${emp.cargo}</div>
        ${emp.origem && emp.origem !== '—' ? `<div class="emp-dept">${emp.origem}</div>` : ''}
      </td>
      <td>
        <span class="${badgeClass}">${emp.empresa}</span>
      </td>
      <td>
        <span style="color:var(--text-muted); font-size:13px">${emp.mes.substring(0,3)}/26</span>
      </td>
      <td class="text-right val-num">
        ${base > 0 ? formatMoney(base) : '—'}
      </td>
      <td class="text-right val-num">
        <span class="val-num" style="color:var(--neon-blue)">${extras > 0 ? '+'+formatMoney(extras) : '—'}</span>
        ${extras > 0 ? `<span class="val-sub">VT, HE, Insal.</span>` : ''}
      </td>
      <td class="text-right val-num">
        <span class="val-num" style="color:var(--neon-pink)">${impostos > 0 ? '-'+formatMoney(impostos) : '—'}</span>
        ${impostos > 0 ? `<span class="val-sub">INSS+FGTS</span>` : ''}
      </td>
      <td class="text-right val-num cost-total">
        ${formatMoney(total)}
      </td>
    `;
    tbody.appendChild(tr);
  });
}


// ─── CHARTS ───

// Default options for ChartJS dark theme
Chart.defaults.color = '#8c96ae';
Chart.defaults.font.family = 'Inter, sans-serif';
Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(22, 25, 43, 0.9)';
Chart.defaults.plugins.tooltip.titleColor = '#fff';
Chart.defaults.plugins.tooltip.bodyColor = '#8c96ae';
Chart.defaults.plugins.tooltip.borderColor = 'rgba(255, 255, 255, 0.1)';
Chart.defaults.plugins.tooltip.borderWidth = 1;
Chart.defaults.plugins.tooltip.padding = 12;

function renderCharts(data) {
  // Aggregate Data for Charts
  let jsTotal = 0; let jsEncargos = 0; let jsBase = 0;
  let ltTotal = 0; let ltEncargos = 0; let ltBase = 0;
  
  let totInss = 0; let totFgts = 0; let totVt = 0; let totInsalub = 0; let totExtra = 0; let totBase = 0;
  
  data.forEach(emp => {
    // Sum by enterprise
    if (emp.empresa === 'Just Smile') {
       jsTotal += emp.total || 0;
       jsEncargos += (emp.inss || 0) + (emp.fgts || 0);
       jsBase += emp.salario_base || 0;
    } else {
       ltTotal += emp.total || 0;
       ltEncargos += (emp.inss || 0) + (emp.fgts || 0);
       ltBase += emp.salario_base || 0;
    }
    
    // Sum components
    totInss += emp.inss || 0;
    totFgts += emp.fgts || 0;
    totVt += emp.transporte || 0;
    totInsalub += emp.insalubridade || 0;
    totExtra += emp.hora_extra || 0;
    totBase += emp.salario_base || 0;
  });

  // --- Bar Chart ---
  const ctxBar = document.getElementById('barChart');
  if (barChartInst) barChartInst.destroy();
  
  barChartInst = new Chart(ctxBar, {
    type: 'bar',
    data: {
      labels: ['Just Smile', 'LT Decorações'],
      datasets: [
        {
          label: 'Salário Base',
          data: [jsBase, ltBase],
          backgroundColor: 'rgba(0, 240, 255, 0.7)',
          borderRadius: 4
        },
        {
          label: 'Encargos / Impostos',
          data: [jsEncargos, ltEncargos],
           backgroundColor: 'rgba(255, 42, 133, 0.7)',
          borderRadius: 4
        },
        {
          label: 'Extras & Benefícios',
          data: [jsTotal - jsBase - jsEncargos, ltTotal - ltBase - ltEncargos],
          backgroundColor: 'rgba(57, 255, 20, 0.7)',
          borderRadius: 4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { stacked: true, grid: { color: 'rgba(255,255,255,0.05)' } },
        y: { stacked: true, grid: { color: 'rgba(255,255,255,0.05)' } }
      },
      plugins: {
        legend: { position: 'bottom' },
        tooltip: {
          callbacks: {
            label: (ctx) => ' ' + ctx.dataset.label + ': ' + formatMoney(ctx.raw)
          }
        }
      }
    }
  });

  // --- Doughnut Chart ---
  const ctxDoughnut = document.getElementById('doughnutChart');
  if (doughnutInst) doughnutInst.destroy();
  
  // Only show components if > 0
  const dLabels = ['Salário Base', 'INSS', 'FGTS', 'Insalubridade', 'Vale Transporte', 'H. Extras'];
  const dData = [totBase, totInss, totFgts, totInsalub, totVt, totExtra];
  
  doughnutInst = new Chart(ctxDoughnut, {
    type: 'doughnut',
    data: {
      labels: dLabels,
      datasets: [{
        data: dData,
        backgroundColor: [
          'rgba(0, 240, 255, 0.8)',   // neon blue
          'rgba(255, 42, 133, 0.8)',  // neon pink
          'rgba(176, 82, 255, 0.8)',  // neon purple
          'rgba(255, 215, 0, 0.8)',   // gold
          'rgba(57, 255, 20, 0.8)',   // neon green
          'rgba(255, 127, 80, 0.8)'   // coral
        ],
        borderWidth: 0,
        hoverOffset: 10
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '65%',
      plugins: {
        legend: { display: false },
        tooltip: {
           callbacks: {
            label: (ctx) => ' ' + ctx.label + ': ' + formatMoney(ctx.raw)
          }
        }
      }
    }
  });
}

// ─── EXPORT CSV ───
function exportToCSV() {
  const data = getFilteredData();
  if (data.length === 0) {
    alert("Nenhum dado para exportar.");
    return;
  }
  
  const headers = [
    "ID", "Nome", "Cargo", "Setor/Origem", "Empresa", "Mês", 
    "Salário Base", "Insalubridade", "Hora Extra", 
    "INSS", "FGTS", "Transporte", "Adiantamento", "Total"
  ];
  
  const csvRows = [];
  csvRows.push(headers.join(","));
  
  data.forEach(emp => {
    const row = [
      emp.id,
      `"${emp.nome}"`,
      `"${emp.cargo}"`,
      `"${emp.origem || ''}"`,
      `"${emp.empresa}"`,
      emp.mes,
      parseMoney(emp.salario_base),
      parseMoney(emp.insalubridade),
      parseMoney(emp.hora_extra),
      parseMoney(emp.inss),
      parseMoney(emp.fgts),
      parseMoney(emp.transporte),
      parseMoney(emp.adiantamento),
      parseMoney(emp.total)
    ];
    csvRows.push(row.join(","));
  });
  
  const csvString = csvRows.join("\n");
  const blob = new Blob(["\uFEFF" + csvString], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", "folha_pagamento_export.csv");
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

