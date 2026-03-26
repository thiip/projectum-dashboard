// app.js

// ─── LOGIN (dynamic - works even with cached HTML) ───
const APP_PASSWORD = 'Senha153045!';

function initLogin() {
  // Hide EVERYTHING on the page immediately
  document.body.style.visibility = 'hidden';
  document.body.style.overflow = 'hidden';

  // Check if already authenticated in this session
  if (sessionStorage.getItem('projectum_auth') === 'true') {
    document.body.style.visibility = '';
    document.body.style.overflow = '';
    return true;
  }

  // Dynamically create the login overlay (works even if HTML is cached without it)
  const overlay = document.createElement('div');
  overlay.id = 'dynamic-login';
  overlay.innerHTML = `
    <div style="position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:#0d0f17;">
      <div style="width:380px;max-width:90vw;padding:48px 36px;border-radius:24px;background:rgba(22,25,43,0.45);border:1px solid rgba(255,255,255,0.08);backdrop-filter:blur(16px);text-align:center;animation:loginFade 0.6s ease;">
        <div style="color:#00f0ff;margin-bottom:16px;">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none"><path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M2 17L12 22L22 17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M2 12L12 17L22 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </div>
        <h2 style="font-family:Outfit,sans-serif;font-size:28px;font-weight:700;color:#f0f2f8;margin:0 0 8px;">Projectum Payroll</h2>
        <p style="font-size:14px;color:#8c96ae;margin:0 0 32px;">Insira a senha para acessar o dashboard</p>
        <div style="display:flex;flex-direction:column;gap:16px;">
          <div style="position:relative;">
            <input type="password" id="dyn-pwd" placeholder="Senha de acesso" autocomplete="off" style="width:100%;padding:14px 48px 14px 18px;border-radius:12px;border:1px solid rgba(255,255,255,0.08);background:rgba(22,25,43,0.6);color:#f0f2f8;font-size:15px;font-family:Inter,sans-serif;outline:none;box-sizing:border-box;">
            <button id="dyn-toggle" type="button" style="position:absolute;right:12px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;font-size:16px;opacity:0.5;">👁️</button>
          </div>
          <div id="dyn-error" style="display:none;color:#ff2a85;font-size:13px;text-align:left;">Senha incorreta. Tente novamente.</div>
          <button id="dyn-enter" style="width:100%;padding:14px;border-radius:12px;border:none;background:linear-gradient(135deg,#00f0ff,#b052ff);color:#fff;font-size:16px;font-weight:600;font-family:Outfit,sans-serif;cursor:pointer;">Entrar</button>
        </div>
      </div>
    </div>
    <style>@keyframes loginFade{from{opacity:0;transform:translateY(20px) scale(0.96)}to{opacity:1;transform:translateY(0) scale(1)}}</style>
  `;
  document.body.appendChild(overlay);
  overlay.style.visibility = 'visible';

  const pwdInput = document.getElementById('dyn-pwd');
  const btnEnter = document.getElementById('dyn-enter');
  const loginError = document.getElementById('dyn-error');
  const togglePwd = document.getElementById('dyn-toggle');

  function attemptLogin() {
    if (pwdInput.value === APP_PASSWORD) {
      sessionStorage.setItem('projectum_auth', 'true');
      overlay.remove();
      document.body.style.visibility = '';
      document.body.style.overflow = '';
      initAppAfterLogin();
    } else {
      loginError.style.display = 'block';
      pwdInput.style.animation = 'none';
      pwdInput.offsetHeight; // trigger reflow
      pwdInput.style.animation = 'shakeInput 0.4s ease';
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

  // Add shake animation style
  const style = document.createElement('style');
  style.textContent = '@keyframes shakeInput{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-8px)}40%,80%{transform:translateX(8px)}}';
  document.head.appendChild(style);

  setTimeout(() => pwdInput.focus(), 100);

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
        authority: 'https://login.microsoftonline.com/common',
        redirectUri: window.location.origin + window.location.pathname
    },
    cache: {
        cacheLocation: 'localStorage',
        storeAuthStateInCookie: true
    }
};
const msalInstance = new msal.PublicClientApplication(msalConfig);
const loginRequest = { scopes: ["User.Read", "Files.Read"], loginHint: "vendas@projectum.com.br" };

// Backup of local data so we can restore if cloud fetch fails
let localDataBackup = null;

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
  // Save local data as backup before any cloud operations
  localDataBackup = [...employeesData];

  initFilters();
  initAuth();

  // Always render local data first so dashboard is never empty
  renderApp();

  // Then try to auto-connect silently if there's a cached session
  const accounts = msalInstance.getAllAccounts();
  if (accounts.length > 0) {
     msalInstance.setActiveAccount(accounts[0]);
     fetchCloudData();
  }
}

// ─── AUTH LOGIC ───
function initAuth() {
  const btnLogin = document.getElementById('btn-login');

  // Handle redirect response (if coming back from redirect login)
  msalInstance.handleRedirectPromise().then((tokenResponse) => {
      if (tokenResponse) {
          msalInstance.setActiveAccount(tokenResponse.account);
          fetchCloudData();
      }
  }).catch((error) => console.error("Redirect error:", error));

  btnLogin.addEventListener('click', () => {
      if (!msalInstance.getActiveAccount()) {
          msalInstance.loginPopup(loginRequest).then(response => {
              msalInstance.setActiveAccount(response.account);
              fetchCloudData();
          }).catch(error => {
              console.error("Login popup failed:", error);
              const statusDiv = document.getElementById('auth-status');
              statusDiv.style.display = 'block';
              statusDiv.textContent = 'Falha no login. Tente novamente.';
              statusDiv.style.color = 'var(--neon-pink)';
          });
      } else {
          msalInstance.logoutPopup().then(() => {
              // Restore local data after logout
              if (localDataBackup) window.employeesData = [...localDataBackup];
              isCloudData = false;
              updateAuthUI();
              renderApp();
          });
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
    statusDiv.textContent = 'Conectando ao OneDrive...';
    statusDiv.style.color = 'var(--text-muted)';

    let tokenResponse;
    try {
        // Try silent token acquisition first (uses cached token)
        tokenResponse = await msalInstance.acquireTokenSilent({
            ...loginRequest,
            account: msalInstance.getActiveAccount()
        });
    } catch (silentErr) {
        console.warn("Silent token failed, trying popup:", silentErr);
        try {
            tokenResponse = await msalInstance.acquireTokenPopup(loginRequest);
            msalInstance.setActiveAccount(tokenResponse.account);
            updateAuthUI();
        } catch (popupErr) {
            console.error("Token acquisition failed:", popupErr);
            statusDiv.textContent = 'Falha na autenticação. Usando dados locais.';
            statusDiv.style.color = 'var(--neon-pink)';
            return; // Keep current data intact
        }
    }

    try {
        statusDiv.textContent = 'Buscando planilha no OneDrive...';

        // Search for the Excel file
        const searchRes = await fetch("https://graph.microsoft.com/v1.0/me/drive/root/search(q='Planilha Salários Projectum 2026')", {
            headers: { Authorization: `Bearer ${tokenResponse.accessToken}` }
        });
        const searchData = await searchRes.json();
        console.log("OneDrive search results:", searchData);

        const file = searchData.value ? searchData.value.find(f => f.name.includes('.xlsx') || f.name.includes('.xls')) : null;

        if (!file) {
            statusDiv.textContent = 'Planilha não encontrada no OneDrive. Usando dados locais.';
            statusDiv.style.color = 'var(--neon-pink)';
            console.warn("Files found:", searchData.value?.map(f => f.name));
            return; // Keep current data intact
        }

        statusDiv.textContent = 'Lendo planilha: ' + file.name + '...';

        // Get all worksheets
        const worksheetsRes = await fetch(`https://graph.microsoft.com/v1.0/me/drive/items/${file.id}/workbook/worksheets`, {
             headers: { Authorization: `Bearer ${tokenResponse.accessToken}` }
        });
        const worksheetsData = await worksheetsRes.json();

        if (!worksheetsData.value || worksheetsData.value.length === 0) {
            statusDiv.textContent = 'Erro: Nenhuma aba encontrada no Excel.';
            statusDiv.style.color = 'var(--neon-pink)';
            return;
        }

        console.log("Worksheets found:", worksheetsData.value.map(s => s.name));

        // Read all worksheets and combine data
        const allRows = [];
        let headerRow = null;

        for (const sheet of worksheetsData.value) {
            statusDiv.textContent = `Lendo aba: ${sheet.name}...`;
            const rangeRes = await fetch(`https://graph.microsoft.com/v1.0/me/drive/items/${file.id}/workbook/worksheets/${sheet.id}/usedRange`, {
                headers: { Authorization: `Bearer ${tokenResponse.accessToken}` }
            });
            const rangeData = await rangeRes.json();

            if (rangeData.values && rangeData.values.length > 1) {
                if (!headerRow) {
                    headerRow = rangeData.values[0];
                    console.log("Excel headers:", headerRow);
                }
                // Skip header row, add data rows
                for (let i = 1; i < rangeData.values.length; i++) {
                    if (rangeData.values[i].some(cell => cell !== null && cell !== '')) {
                        allRows.push(rangeData.values[i]);
                    }
                }
            }
        }

        if (allRows.length > 0) {
            const parsed = parseExcelToEmployees(headerRow, allRows);
            if (parsed.length > 0) {
                window.employeesData = parsed;
                isCloudData = true;
                statusDiv.textContent = `Conectado (${parsed.length} registros da nuvem)`;
                statusDiv.style.color = 'var(--lt-brand)';
                renderApp();
            } else {
                statusDiv.textContent = 'Planilha sem dados válidos. Usando dados locais.';
                statusDiv.style.color = 'var(--neon-pink)';
            }
        } else {
            statusDiv.textContent = 'Planilha vazia. Usando dados locais.';
            statusDiv.style.color = 'var(--neon-pink)';
        }

    } catch (err) {
        console.error("Graph API Error:", err);
        statusDiv.textContent = 'Falha ao sincronizar. Usando dados locais.';
        statusDiv.style.color = 'var(--neon-pink)';
        // Don't overwrite data — keep whatever was loaded
    }
}

function parseExcelToEmployees(headers, rows) {
    // Dynamically detect column indices by matching header names
    const h = headers.map(col => String(col || '').toLowerCase().trim());

    function findCol(...keywords) {
        return h.findIndex(header => keywords.some(kw => header.includes(kw)));
    }

    const colMap = {
        id:             findCol('id', 'código', 'codigo', 'matrícula', 'matricula', 'registro'),
        nome:           findCol('nome', 'colaborador', 'funcionário', 'funcionario'),
        cargo:          findCol('cargo', 'função', 'funcao', 'posição'),
        origem:         findCol('origem', 'setor', 'departamento', 'depto'),
        empresa:        findCol('empresa', 'companhia', 'razão', 'cnpj'),
        mes:            findCol('mês', 'mes', 'competência', 'competencia', 'período'),
        salario_base:   findCol('salário base', 'salario base', 'sal. base', 'salário', 'salario', 'base'),
        insalubridade:  findCol('insalubridade', 'insalub', 'adicional insalub'),
        hora_extra:     findCol('hora extra', 'h. extra', 'he', 'horas extras', 'hora_extra'),
        inss:           findCol('inss'),
        fgts:           findCol('fgts'),
        transporte:     findCol('transporte', 'vale transporte', 'vt', 'vale transp'),
        adiantamento:   findCol('adiantamento', 'adiant', 'antecipação'),
        total:          findCol('total', 'custo total', 'valor total', 'líquido', 'bruto')
    };

    console.log("Column mapping:", colMap);
    console.log("Headers:", headers);

    const newEmployees = [];

    for (const row of rows) {
        // Skip rows without a name
        const nome = colMap.nome >= 0 ? row[colMap.nome] : null;
        if (!nome || String(nome).trim() === '') continue;

        newEmployees.push({
            id:             colMap.id >= 0 ? String(row[colMap.id] || '') : '',
            nome:           String(nome),
            cargo:          colMap.cargo >= 0 ? String(row[colMap.cargo] || '') : '',
            origem:         colMap.origem >= 0 ? String(row[colMap.origem] || '—') : '—',
            empresa:        colMap.empresa >= 0 ? String(row[colMap.empresa] || 'N/A') : 'N/A',
            mes:            colMap.mes >= 0 ? String(row[colMap.mes] || 'Desconhecido') : 'Desconhecido',
            salario_base:   colMap.salario_base >= 0 ? parseMoney(row[colMap.salario_base]) : 0,
            insalubridade:  colMap.insalubridade >= 0 ? parseMoney(row[colMap.insalubridade]) : 0,
            hora_extra:     colMap.hora_extra >= 0 ? parseMoney(row[colMap.hora_extra]) : 0,
            inss:           colMap.inss >= 0 ? parseMoney(row[colMap.inss]) : 0,
            fgts:           colMap.fgts >= 0 ? parseMoney(row[colMap.fgts]) : 0,
            transporte:     colMap.transporte >= 0 ? parseMoney(row[colMap.transporte]) : 0,
            adiantamento:   colMap.adiantamento >= 0 ? parseMoney(row[colMap.adiantamento]) : 0,
            total:          colMap.total >= 0 ? parseMoney(row[colMap.total]) : 0
        });
    }

    console.log(`Parsed ${newEmployees.length} employees from Excel`);
    if (newEmployees.length > 0) console.log("Sample:", newEmployees[0]);

    return newEmployees;
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

