// --- 1. CONFIGURAÇÃO (⚠️ COLE A SUA KEY ANTIGA AQUI) ---
const firebaseConfig = {
    apiKey: "AIzaSyATkpiODXMz-TaHhqq7pVs9qmMktbcBPcE",
        authDomain: "financas-abel.firebaseapp.com",
        projectId: "financas-abel",
        storageBucket: "financas-abel.firebasestorage.app",
        messagingSenderId: "760243071362",
        appId: "1:760243071362:web:d58bc675d1ac3cd56d079b"
};

// Iniciar Firebase
if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);

firebase.firestore().enablePersistence()
    .catch(function(err) {
        console.error("Erro ao ativar offline:", err.code);
    });

const db = firebase.firestore();

// --- 2. VARIÁVEIS GLOBAIS ---
let allTransactions = [];
let DB_COLLECTION = '';
let currentUser = null;
let editMode = false;
let chartInterval = null;
let userGoals = {}; // Vai guardar as metas vindas do banco de dados

// Categorias (Incluindo a nova "Ajuste de Saldo")
const defaultIncome = ["Salário 💵", "Vendas 📈", "Bónus 🎁", "Poupança (Resgate) 🐷", "Saldo Inicial 🏁", "Ajuste de Saldo ⚖️"];
const defaultExpense = ["Alimentação 🍔", "Transporte 🚗", "Habitação 🏠", "Lazer 🎉", "Contas 💡", "Poupança (Guardar) 🐷", "Ajuste de Saldo ⚖️"];

// FORMA CORRETA (Carrega da memória ou usa o padrão)
// Tenta ler do LocalStorage. Se não houver nada lá, usa o default.
let catsIncome = JSON.parse(localStorage.getItem('user_income_cats')) || defaultIncome;
let catsExpense = JSON.parse(localStorage.getItem('user_expense_cats')) || defaultExpense;

// --- 3. INICIALIZAÇÃO ---
document.addEventListener('DOMContentLoaded', () => {
    const savedUser = JSON.parse(localStorage.getItem('fin_user_v12')); 
    if (!savedUser) {
        document.getElementById('setup-screen').style.display = 'flex';
    } else {
        loginSuccess(savedUser);
    }
    
    document.getElementById('date').valueAsDate = new Date();
    document.getElementById('monthFilter').value = new Date().toISOString().substring(0, 7);
    toggleFormFields();
});

// LOGIN E SETUP SEGURO
async function saveSetup() {
    const name = document.getElementById('input-setup-name').value.trim();
    const pin = document.getElementById('input-setup-pin').value;
    const avatar = document.querySelector('input[name="avatar"]:checked').value;

    if (!name || pin.length !== 4) return alert("Preencha nome e PIN de 4 dígitos.");
    
    // GERA ID ÚNICO (Nome + PIN)
    const dbId = name.normalize("NFD").replace(/[^a-z0-9]/g, "").toLowerCase() + "_" + pin;
    
    const newUser = { name, db_key: dbId, avatar, pin };
    loginSuccess(newUser);
}

function loginSuccess(user) {
    currentUser = user;
    localStorage.setItem('fin_user_v12', JSON.stringify(user));
    document.getElementById('setup-screen').style.display = 'none';
    
    const color = user.avatar === 'female' ? '#8e44ad' : '#2c3e50';
    document.querySelector('header').style.background = color;
    document.querySelector('.nav-btn-big').style.background = color;
    document.getElementById('user-emoji').innerText = user.avatar === 'female' ? '👩🏻' : '🧔🏻‍♂️';
    
    DB_COLLECTION = `transactions_${user.db_key}`;
    console.log("Conectado a:", DB_COLLECTION);
    

    loadGoals();
    loadCategoriesFromFirebase();

    initApp();
    updateCategorySelect();
    renderGoals();
}

function logoutProfile() {
    if(confirm("Sair do app?")) {
        localStorage.removeItem('fin_user_v12');
        location.reload();
    }
}

window.toggleHelp = function() {
    const modal = document.getElementById('help-modal');
    modal.style.display = (modal.style.display === 'block') ? 'none' : 'block';
}

// --- 4. LÓGICA PRINCIPAL ---
function initApp() {
    db.collection(DB_COLLECTION).orderBy('date', 'desc').onSnapshot(snap => {
        allTransactions = snap.docs.map(d => ({id: d.id, ...d.data()}));
        updateDashboard();
    }, err => {
        console.error(err);
        alert("Erro de conexão! Verifique sua internet.");
    });
}

window.switchView = function(viewName) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(`view-${viewName}`).classList.add('active');
    if(viewName !== 'add') document.getElementById(`nav-${viewName}`).classList.add('active');
}

// --- 5. CATEGORIAS ---
function updateCategorySelect() {
    const type = document.querySelector('input[name="type"]:checked').value;
    const select = document.getElementById('category');
    select.innerHTML = "";
    const list = type === 'income' ? catsIncome : catsExpense;
    list.forEach(c => {
        const op = document.createElement('option');
        op.value = c; op.innerText = c;
        select.appendChild(op);
    });
}

window.manageCategories = function() {
    const type = document.querySelector('input[name="type"]:checked').value;
    const list = type === 'income' ? catsIncome : catsExpense;
    const key = type === 'income' ? 'user_income_cats' : 'user_expense_cats';
    const action = prompt(`1. Adicionar Nova\n2. Apagar Existente`);

    if (action === '1') {
        const newCat = prompt("Nome da nova categoria:");
        if (newCat) {
            list.push(newCat);
            localStorage.setItem(key, JSON.stringify(list));
            
            updateCategorySelect();
            updateFilterSelect();
            saveCategoriesToFirebase()
        }
    } else if (action === '2') {
        const catToDelete = prompt("Nome EXATO para apagar:\n" + list.join(", "));
        const idx = list.indexOf(catToDelete);
        if (idx > -1) {
            list.splice(idx, 1);
            localStorage.setItem(key, JSON.stringify(list));
            
            updateCategorySelect();
            updateFilterSelect();
            saveCategoriesToFirebase()
            
            alert("Apagada!");
        }
    }
}

// --- 6. FORMULÁRIO ---
window.toggleFormFields = function() {
    const type = document.querySelector('input[name="type"]:checked').value;
    const expenseInputs = document.getElementById('expense-inputs');
    const amountInput = document.getElementById('amount');
    const descInput = document.getElementById('description');

    updateCategorySelect();

    if (type === 'income') {
        expenseInputs.style.display = 'none';
        amountInput.readOnly = false;
        amountInput.style.background = '#fff';
        amountInput.placeholder = "0.00";
        amountInput.value = '';
        descInput.placeholder = "Salário (Opcional)";
        descInput.required = false;
    } else {
        expenseInputs.style.display = 'flex';
        amountInput.readOnly = true;
        amountInput.style.background = '#eee';
        descInput.placeholder = "Ex: Arroz, Gasolina...";
        descInput.required = true;
        calculateTotal();
    }
    
    // Atualiza o autocompletar para a categoria atual
    const currentCat = document.getElementById('category').value;
    updateAutocomplete(currentCat);
}

window.calculateTotal = function() {
    const qty = parseFloat(document.getElementById('qty').value) || 0;
    const price = parseFloat(document.getElementById('unit-price').value) || 0;
    document.getElementById('amount').value = (qty * price).toFixed(2);
}

document.getElementById('transaction-form').addEventListener('submit', (e) => {
    e.preventDefault();
    
    // 1. Captura os valores
    const type = document.querySelector('input[name="type"]:checked').value;
    const amountVal = parseFloat(document.getElementById('amount').value);
    let desc = document.getElementById('description').value;

    // 2. Validações básicas
    if (!amountVal) return alert("Insira um valor!");
    if (type === 'income' && !desc) desc = "Receita Diversa";
    if (type === 'expense') {
        const qty = document.getElementById('qty').value;
        if(qty > 1) desc = `(${qty}x) ${desc}`;
    }

    // 3. Envia para o Banco de Dados (Firebase)
    // NOTA: Removemos o .then() aqui. O código não espera mais pela internet.
    db.collection(DB_COLLECTION).add({
        item: desc,
        amount: amountVal,
        type: type,
        category: document.getElementById('category').value,
        date: document.getElementById('date').value,
        createdAt: new Date().toISOString()
    });

    

    // 4. Limpa o formulário e volta ao início IMEDIATAMENTE
    // O código já não fica "travado" à espera da confirmação
    document.getElementById('transaction-form').reset();
    document.getElementById('date').valueAsDate = new Date();
    document.getElementById('qty').value = 1;
    toggleFormFields();
    
    alert("Salvo!"); // Aparece logo, mesmo sem internet
    switchView('dashboard');
});

// --- 7. DASHBOARD E GRÁFICO ---
function updateDashboard() {
    const month = document.getElementById('monthFilter').value;
    let rec = 0, desp = 0, cofre = 0, saldoTotal = 0;
    let gastosPorCat = {};

    allTransactions.forEach(t => {
        const d = t.date.substring(0, 7);
        const val = parseFloat(t.amount);
        
        // Saldo Geral (Acumulado desde sempre)
        if (d <= month) {
             // O "Ajuste de Saldo" entra na conta do saldo, mas não no cofre
             if(t.category.includes('Poupança')) {
                 saldoTotal += (t.type === 'expense') ? -val : val;
             } else {
                 saldoTotal += (t.type === 'income') ? val : -val;
             }
        }

        // Dados do Mês Selecionado
        if (d === month) {
            if (t.category.includes('Poupança')) {
                if(t.type === 'expense') cofre += val; else cofre -= val;
            } else if (t.type === 'income') {
                rec += val;
            } else {
                desp += val;
                // Prepara dados para o gráfico
                if(!gastosPorCat[t.category]) gastosPorCat[t.category] = 0;
                gastosPorCat[t.category] += val;
            }
        }
    });

    document.getElementById('display-balance').innerText = fmt(saldoTotal);
    document.getElementById('display-income').innerText = fmt(rec);
    document.getElementById('display-expense').innerText = fmt(desp);
    document.getElementById('display-savings').innerText = fmt(cofre);
    
    renderChart(gastosPorCat, desp);
    renderList(month);
}

function renderChart(data, total) {
    const chart = document.getElementById('expenseChart');
    const legend = document.getElementById('chart-legend');
    legend.innerHTML = '';
    
    // --- FILTRO: Remove "Ajuste de Saldo" do Gráfico para não poluir ---
    if (data["Ajuste de Saldo ⚖️"]) {
        total -= data["Ajuste de Saldo ⚖️"];
        delete data["Ajuste de Saldo ⚖️"];
    }
    // ------------------------------------------------------------------

    if (total <= 0) { chart.style.background = '#eee'; startChartCarousel([], 0); return; }

    let gradient = [], currentDeg = 0, i = 0;
    const colors = ['#e74c3c', '#3498db', '#f1c40f', '#9b59b6', '#2ecc71', '#e67e22'];

    for (const [cat, val] of Object.entries(data)) {
        const deg = (val / total) * 360;
        gradient.push(`${colors[i % colors.length]} ${currentDeg}deg ${currentDeg + deg}deg`);
        currentDeg += deg;
        legend.innerHTML += `<div class="legend-item"><div class="dot" style="background:${colors[i%colors.length]}"></div>${cat.split(' ')[0]}</div>`;
        i++;
    }
    chart.style.background = `conic-gradient(${gradient.join(', ')})`;
    startChartCarousel(data, total);
}

function startChartCarousel(data, totalExpense) {
    const hole = document.querySelector('.hole');
    if (chartInterval) clearInterval(chartInterval);
    
    let slides = [];
    let totalGoals = 0;
    for(let val of Object.values(userGoals)) totalGoals += val;
    
    if (totalGoals > 0) {
        const pct = Math.round((totalExpense / totalGoals) * 100);
        let status = pct > 100 ? 'status-danger' : (pct > 80 ? 'status-warning' : 'status-good');
        slides.push({ label: 'ORÇAMENTO', value: fmt(totalExpense), percent: `${pct}% da Meta`, statusClass: status });
    } else {
        slides.push({ label: 'TOTAL GASTO', value: fmt(totalExpense), percent: '', statusClass: '' });
    }

    for (const [cat, val] of Object.entries(data)) {
        const goal = userGoals[cat];
        let pctText = '', status = '';
        if (goal) {
            const pct = Math.round((val / goal) * 100);
            pctText = `${pct}% da Meta`;
            status = pct > 100 ? 'status-danger' : (pct > 80 ? 'status-warning' : 'status-good');
        } else {
            const share = Math.round((val / totalExpense) * 100);
            pctText = `${share}% dos Gastos`;
            status = 'status-good';
        }
        slides.push({ label: cat.split(' ')[0], value: fmt(val), percent: pctText, statusClass: status });
    }

    let currentSlide = 0;
    const showSlide = () => {
        if (slides.length === 0) { hole.innerHTML = `<div class="chart-info"><h5>Nada Gasto</h5></div>`; return; }
        const s = slides[currentSlide];
        hole.innerHTML = `
            <div class="chart-info">
                <div class="chart-label">${s.label}</div>
                <div class="chart-value">${s.value}</div>
                ${s.percent ? `<div class="chart-percent ${s.statusClass}">${s.percent}</div>` : ''}
            </div>
        `;
        currentSlide = (currentSlide + 1) % slides.length;
    };
    showSlide();
    if(slides.length > 1) chartInterval = setInterval(showSlide, 3500); 
}

// --- 8. FERRAMENTAS ---
window.toggleEditMode = function() {
    editMode = !editMode;
    const list = document.getElementById('transactions');
    const btn = document.getElementById('edit-btn');
    const tools = document.getElementById('maintenance-tools');
    
    if(editMode) {
        list.classList.add('show-delete');
        btn.style.background = '#e74c3c'; btn.style.color = 'white'; btn.innerText = 'OK';
        tools.style.display = 'flex';
    } else {
        list.classList.remove('show-delete');
        btn.style.background = 'white'; btn.style.color = 'black'; btn.innerText = '✏️';
        tools.style.display = 'none';
    }
}

// FUNÇÃO DE AJUSTE DE SALDO (NOVO) ⚖️
window.adjustBalance = function() {
    const currentBalanceText = document.getElementById('display-balance').innerText;
    // Limpa formatação (remove " dh", pontos e troca virgula por ponto)
    let currentBalance = parseFloat(currentBalanceText.replace(' dh', '').replace(/\./g, '').replace(',', '.'));
    
    const realMoneyStr = prompt(`O App calcula: ${currentBalanceText}\nQuanto dinheiro tens REALMENTE na carteira?`);
    
    if (realMoneyStr !== null && realMoneyStr.trim() !== "") {
        // Aceita input com virgula ou ponto
        let realMoney = parseFloat(realMoneyStr.replace(',', '.'));
        
        if (isNaN(realMoney)) return alert("Valor inválido.");

        const difference = realMoney - currentBalance;
        
        if (Math.abs(difference) < 0.01) return alert("O saldo já está correto!");

        const type = difference > 0 ? 'income' : 'expense';
        const val = Math.abs(difference);
        
        db.collection(DB_COLLECTION).add({
            item: "Ajuste de Saldo (Correção)",
            amount: val,
            type: type,
            category: "Ajuste de Saldo ⚖️",
            date: new Date().toISOString().split('T')[0],
            createdAt: new Date().toISOString()
        }).then(() => {
            alert("Saldo corrigido! ✅");
            toggleEditMode();
        });
    }
}

window.downloadBackup = function() {
    if(!allTransactions.length) return alert("Nada para salvar.");
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(allTransactions));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `Backup_MyFinancas_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
}

window.clearAppCache = function() {
    if(confirm("Limpar cache e atualizar o app?")) {
        if ('caches' in window) {
            caches.keys().then((names) => {
                names.forEach((name) => caches.delete(name));
            }).then(() => location.reload(true));
        } else {
            location.reload(true);
        }
    }
}

// --- AUXILIARES ---
function renderList(month) {
    const list = document.getElementById('transactions');
    list.innerHTML = '';
    const shouldGroup = document.getElementById('group-toggle').checked;
    const filterCat = document.getElementById('filter-category').value; // <--- 1. LER O FILTRO
    
    // Filtra pelo mês
    let items = allTransactions.filter(t => t.date.substring(0, 7) === month);

    // --- CORREÇÃO AQUI ---
    // 2. Se o filtro NÃO for vazio ("Todas"), mantém apenas itens dessa categoria
    if (filterCat && filterCat !== "") {
        items = items.filter(t => t.category === filterCat);
    }
    // ---------------------

    if (shouldGroup) {
        const grouped = {};
        items.forEach(t => {
            // 1. Limpa o nome para garantir que "(2x) Arroz" agrupa com "Arroz"
            const cleanName = t.item ? t.item.replace(/\(\d+x\) /, '').trim() : 'Sem Descrição';
            
            // 2. A CHAVE MÁGICA: Removemos o "t.date" daqui!
            // Agora agrupa apenas por: Nome + Categoria + Tipo (Receita/Despesa)
            const key = `${cleanName}-${t.category}-${t.type}`;

            if(!grouped[key]) { 
                // Primeira vez que encontra este item
                grouped[key] = { 
                    ...t, 
                    item: cleanName, // Usa o nome limpo
                    date: 'Vários Dias', // Texto para mostrar na data
                    count: 1 
                }; 
            } else { 
                // Já existe! Soma o valor e aumenta o contador
                grouped[key].amount += t.amount;
                grouped[key].count += 1; 
            }
        });
        items = Object.values(grouped);
    }
    
    items.sort((a,b) => b.date.localeCompare(a.date));

    // Atualiza o texto do Total (opcional, mas útil para saber o total filtrado)
    const totalFiltrado = items.reduce((acc, t) => t.type === 'income' ? acc + t.amount : acc - t.amount, 0);
    const totalEl = document.getElementById('total-month');
    if(totalEl) totalEl.innerText = fmt(totalFiltrado);

    if (items.length === 0) {
        list.innerHTML = '<li style="text-align:center; padding:20px; color:#999;">Nenhuma transação encontrada.</li>';
        return;
    }

    items.forEach(t => {
        const li = document.createElement('li');
        li.className = 'transaction-item';
        const countBadge = (t.count && t.count > 1) ? ` <span style="background:#ddd; padding:0 5px; font-size:0.7rem; border-radius:4px">x${t.count}</span>` : '';
        // Limpa texto da descrição se tiver (Qtd)
        const displayItem = t.item ? t.item.replace(/\(\d+x\) /, '') : 'Sem descrição'; 

        li.innerHTML = `
            <div class="item-info">
                <strong>${displayItem} ${countBadge}</strong>
                <small>${t.category} • ${t.date.split('-')[2]}/${t.date.split('-')[1]}</small>
            </div>
            <div style="display:flex; align-items:center">
                <span class="${t.type==='income'?'amount-income':'amount-expense'}">
                    ${t.type==='income'?'+':'-'} ${fmt(t.amount)}
                </span>
                <span class="delete-btn" onclick="deleteItem('${t.id}')">🗑</span>
            </div>
        `;
        list.appendChild(li);
    });
}

window.deleteItem = function(id) { if(confirm("Apagar este item?")) db.collection(DB_COLLECTION).doc(id).delete(); }

// let userGoals = JSON.parse(localStorage.getItem('user_goals')) || {};

window.addNewGoal = function() {
    // 1. Prepara a lista de categorias de despesa para mostrar no prompt
    // Adiciona números (1. Alimentação, 2. Transporte...)
    let optionsText = "Escolha o NÚMERO da categoria:\n";
    catsExpense.forEach((cat, index) => {
        optionsText += `${index + 1}. ${cat}\n`;
    });

    // 2. Pergunta o número
    const selection = prompt(optionsText);
    
    // 3. Valida se o usuário cancelou ou escreveu algo inválido
    if (!selection) return;

    const index = parseInt(selection) - 1; // Converte para índice do array (0, 1, 2...)

    if (index >= 0 && index < catsExpense.length) {
        const selectedCat = catsExpense[index]; // Pega o nome exato com emoji
        
        // 4. Pergunta o valor
        const val = prompt(`Definir meta para "${selectedCat}" (em dh):`);
        
        if (val) {
            userGoals[selectedCat] = parseFloat(val.replace(',', '.')); // Garante formato numérico
            localStorage.setItem('user_goals', JSON.stringify(userGoals));
            renderGoals();
            updateDashboard();
            alert(`Meta definida para ${selectedCat}! 🎯`);
        }
    } else {
        alert("Número inválido! Tente novamente.");
    }
}

function renderGoals() {
    const div = document.getElementById('goals-list');
    div.innerHTML = '';
    for(const [cat, val] of Object.entries(userGoals)) {
        div.innerHTML += `<div class="goal-item"><strong>${cat}</strong>: Meta ${fmt(val)} <button onclick="deleteGoal('${cat}')" style="color:red;border:none;background:none;float:right">x</button></div>`;
    }
}
window.deleteGoal = function(cat) { delete userGoals[cat]; localStorage.setItem('user_goals', JSON.stringify(userGoals)); renderGoals(); updateDashboard(); }

// --- FORMATADOR DE MOEDA (MARROCOS) ---
function fmt(v) { 
    return v.toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' dh'; 
}

/* --- SISTEMA DE SUGESTÕES INTELIGENTES --- */

// 1. Quando muda a Categoria
document.getElementById('category').addEventListener('change', function() {
    suggestDescriptions(this.value);
});

// 2. Quando clica no campo Descrição
document.getElementById('description').addEventListener('focus', function() {
    const currentCat = document.getElementById('category').value;
    if(currentCat) suggestDescriptions(currentCat);
});

function suggestDescriptions(categoryName) {
    const container = document.getElementById('smart-suggestions');
    if(!container) return; // Segurança caso não encontre a div
    
    container.innerHTML = ''; // Limpa as sugestões anteriores

    if (!categoryName) return;

    // A. APRENDER: Filtra o histórico (allTransactions já existe no seu script.js)
    const relevant = allTransactions.filter(t => t.category === categoryName);

    // B. CONTAR: Vê quais as descrições mais usadas
    const frequency = {};
    relevant.forEach(t => {
        // Garante que existe descrição e remove espaços extra
        const text = t.description ? t.description.trim() : ""; 
        if(text.length > 1) {
            frequency[text] = (frequency[text] || 0) + 1;
        }
    });

    // C. CLASSIFICAR (Pega o TOP 5)
    const topSuggestions = Object.keys(frequency)
        .sort((a, b) => frequency[b] - frequency[a])
        .slice(0, 5);

    // D. MOSTRAR OS BOTÕES
    if (topSuggestions.length > 0) {
        topSuggestions.forEach(text => {
            const chip = document.createElement('div');
            chip.className = 'suggestion-chip';
            chip.innerText = text;
            
            // Ao clicar no botão...
            chip.onclick = () => {
                const input = document.getElementById('description');
                input.value = text;
                input.focus(); // Mantém o foco para editar se precisar
                container.innerHTML = ''; // Limpa as sugestões depois de escolher
            };
            
            container.appendChild(chip);
        });
    }
}

/* --- KIT DE RECUPERAÇÃO (Filtros, Metas e Agrupamento) --- */

// 1. Preenche o menu de categorias automaticamente ao iniciar
// Inicia o filtro corretamente quando o app abre
document.addEventListener('DOMContentLoaded', () => {
    updateFilterSelect();
});

// 2. Função que aplica o filtro de categoria e atualiza a barra de meta
function applyCategoryFilter(transactions) {
    const filterSelect = document.getElementById('filter-category');
    const panel = document.getElementById('category-goal-panel');
    
    if (!filterSelect || !filterSelect.value) {
        if(panel) panel.style.display = 'none'; // Esconde barra de meta
        return transactions; // Retorna tudo se não houver filtro
    }

    const selectedCat = filterSelect.value;
    
    // Filtra a lista
    const filtered = transactions.filter(t => t.category === selectedCat);

    // Atualiza a Barra de Progresso (se a função existir)
    if (panel) updateCategoryGoalPanel(selectedCat, filtered);

    return filtered;
}

// 3. Função que desenha a barra de meta/progresso
function updateCategoryGoalPanel(category, transactions) {
    const panel = document.getElementById('category-goal-panel');
    const nameEl = document.getElementById('goal-cat-name');
    const valsEl = document.getElementById('goal-cat-values');
    const barEl = document.getElementById('goal-cat-bar');
    const msgEl = document.getElementById('goal-cat-msg');

    panel.style.display = 'block';
    nameEl.innerText = category;

    // Calcula gasto total na categoria (apenas despesas)
    const totalSpent = transactions.reduce((acc, t) => t.type === 'expense' ? acc + t.amount : acc, 0);
    
    // Pega a meta (se existir no userGoals)
    const goal = (typeof userGoals !== 'undefined' && userGoals[category]) ? userGoals[category] : 0;

    barEl.className = 'progress-fill'; // Reseta cor

    if (goal === 0) {
        valsEl.innerText = `${totalSpent.toFixed(2)} dh (Sem Meta)`;
        barEl.style.width = '0%';
        msgEl.innerText = "Sem meta definida.";
    } else {
        const percent = (totalSpent / goal) * 100;
        valsEl.innerText = `${totalSpent.toFixed(2)} / ${goal.toFixed(2)} dh`;
        barEl.style.width = `${Math.min(percent, 100)}%`;

        if (percent >= 100) {
            barEl.classList.add('red');
            msgEl.innerText = "⚠️ Passaste o limite!";
            msgEl.style.color = "#e74c3c";
        } else if (percent >= 80) {
            barEl.classList.add('yellow');
            msgEl.innerText = "Perto do limite.";
            msgEl.style.color = "#f39c12";
        } else {
            barEl.classList.add('green');
            msgEl.innerText = "Dentro da meta. 👍";
            msgEl.style.color = "#27ae60";
        }
    }
}

// 4. SUBSTITUIÇÃO: Renderizar Lista (Com suporte a Agrupar)
// ATENÇÃO: Se já tiver uma função renderTransactions no código, APAGUE-A e use esta.
function renderTransactions(listToRender) {
    const listEl = document.getElementById('transaction-list');
    const totalEl = document.getElementById('total-month');
    listEl.innerHTML = '';

    // Verifica se está agrupado
    const isGrouped = document.getElementById('group-toggle') && document.getElementById('group-toggle').checked;

    if (isGrouped) {
        // --- MODO AGRUPADO ---
        const groups = {};
        listToRender.forEach(t => {
            if (!groups[t.category]) groups[t.category] = 0;
            // Se for despesa, soma como negativo para o cálculo, mas mostraremos positivo visualmente se quiser
            // Aqui assumo que 'amount' é sempre positivo. 
            // Se for receita (+), soma. Se for despesa (-), subtrai? Depende da sua lógica.
            // Vou somar os VALORES brutos por categoria.
            groups[t.category] += parseFloat(t.amount);
        });

        Object.keys(groups).sort().forEach(cat => {
            const li = document.createElement('li');
            li.className = 'transaction-item';
            li.innerHTML = `<strong>${cat}</strong> <span>${groups[cat].toFixed(2)} dh</span>`;
            listEl.appendChild(li);
        });

    } else {
        // --- MODO DETALHADO (Normal) ---
        listToRender.forEach(t => {
            const li = document.createElement('li');
            li.className = 'transaction-item';
            const color = t.type === 'income' ? 'var(--success)' : 'var(--danger)';
            const sign = t.type === 'income' ? '+' : '';
            
            li.innerHTML = `
                <div>
                    <strong>${t.category}</strong><br>
                    <small>${t.description || t.desc || ''} • ${t.date}</small>
                </div>
                <div style="display:flex; align-items:center; gap:10px;">
                    <span style="color:${color}; font-weight:bold;">
                        ${sign}${parseFloat(t.amount).toFixed(2)}
                    </span>
                    <span class="delete-btn" onclick="deleteItem('${t.id}')">🗑️</span>
                </div>
            `;
            listEl.appendChild(li);
        });
    }

    // Calcula Total do que está na tela
    // Receitas - Despesas
    const totalVal = listToRender.reduce((acc, t) => {
        return t.type === 'income' ? acc + parseFloat(t.amount) : acc - parseFloat(t.amount);
    }, 0);
    
    if(totalEl) totalEl.innerText = `${totalVal.toFixed(2)} dh`;
}

// --- FUNÇÃO DE AUTOCOMPLETAR PRECISA (NOVO) ---
function updateAutocomplete(categoryFilter) {
    const datalist = document.getElementById('history-list');
    if (!datalist) return;

    datalist.innerHTML = ''; // Limpa as sugestões antigas

    // 1. Filtra: Pega apenas transações da categoria que selecionou agora
    const relevantItems = allTransactions.filter(t => t.category === categoryFilter);

    // 2. Limpa: Tira a quantidade "(2x)" e pega só o nome
    const cleanNames = relevantItems.map(t => {
        return t.item ? t.item.replace(/^\(\d+x\) /, '') : null;
    }).filter(t => t);

    // 3. Remove Duplicatas: Para ter uma lista limpa de itens únicos
    const uniqueNames = [...new Set(cleanNames)];

    // 4. Preenche a lista do HTML
    uniqueNames.sort().forEach(name => {
        const option = document.createElement('option');
        option.value = name; // Valor exato que está no banco
        datalist.appendChild(option);
    });
}

// --- O ESCUTADOR DE MUDANÇA ---
// Isto fica "vigilante". Sempre que mudar a Categoria, ele faz isto:
document.getElementById('category').addEventListener('change', function() {
    
    // 1. Vê qual categoria você escolheu agora
    const categoriaEscolhida = this.value;

    // 2. Chama a função para atualizar a lista de sugestões imediatamente
    updateAutocomplete(categoriaEscolhida);

});

// --- 1. CONTROLE DO MODAL E EDIÇÃO ---
let isEditingGoals = false; 

function toggleGoalsModal() {
    const modal = document.getElementById('goals-modal');
    if (modal.style.display === 'none') {
        modal.style.display = 'flex';
        renderGoalsInModal();
    } else {
        modal.style.display = 'none';
        isEditingGoals = false; // Reseta modo edição ao fechar
    }
}

// --- 2. RENDERIZAR METAS (COM MODO EDIÇÃO) ---
function renderGoalsInModal() {
    const container = document.getElementById('goals-list-modal');
    container.innerHTML = '';

    // Cabeçalho com Botão
    const headerAction = document.createElement('div');
    headerAction.style.marginBottom = '15px';
    headerAction.style.textAlign = 'right';
    
    if (isEditingGoals) {
        headerAction.innerHTML = `<button class="btn-icon-small" style="background:#27ae60; color:white; border:none;" onclick="saveGoalsToFirebase()">💾 Salvar</button>`;
    } else {
        headerAction.innerHTML = `<button class="btn-icon-small" onclick="{isEditingGoals=true; renderGoalsInModal();}">✏️ Editar Metas</button>`;
    }
    container.appendChild(headerAction);

    // Cálculos
    let gastosAtuais = {};
    const mesAtual = document.getElementById('monthFilter').value;
    const transacoesMes = allTransactions.filter(t => t.date.startsWith(mesAtual) && t.type === 'expense');

    transacoesMes.forEach(t => {
        if(!gastosAtuais[t.category]) gastosAtuais[t.category] = 0;
        gastosAtuais[t.category] += t.amount;
    });

    // Loop Categorias
    defaultExpense.forEach(cat => {
        if(cat.includes("Poupança") || cat.includes("Ajuste")) return;

        const metaDefinida = userGoals[cat] || 0; 
        const gasto = gastosAtuais[cat] || 0;
        const nomeVisual = cat.split(' ')[0]; 

        const div = document.createElement('div');
        div.className = 'goal-item';

        if (isEditingGoals) {
            // MODO EDIÇÃO
            div.innerHTML = `
                <div style="margin-bottom:5px; font-weight:bold;">${nomeVisual}</div>
                <input type="number" id="input-goal-${cat}" value="${metaDefinida}" placeholder="0" 
                    style="width:100%; padding:8px; border:1px solid #ccc; border-radius:5px;">
            `;
        } else {
            // MODO VISUALIZAÇÃO
            let pct = 0;
            if (metaDefinida > 0) pct = (gasto / metaDefinida) * 100;
            else if (gasto > 0) pct = 100;

            let largura = pct > 100 ? 100 : pct;
            let cor = pct >= 100 ? 'bg-danger' : (pct >= 75 ? 'bg-warn' : 'bg-ok');

            div.innerHTML = `
                <div class="goal-info">
                    <strong>${nomeVisual}</strong>
                    <span style="color:${pct>=100?'red':'#555'}">
                        ${fmt(gasto)} / ${fmt(metaDefinida)}
                    </span>
                </div>
                <div class="track">
                    <div class="fill ${cor}" style="width: ${largura}%"></div>
                </div>
                ${pct >= 100 && metaDefinida > 0 ? '<small style="color:red; font-size:0.7rem;">Orçamento excedido</small>' : ''}
            `;
        }
        container.appendChild(div);
    });
}

// --- 3. SALVAR NO FIREBASE ---
function saveGoalsToFirebase() {
    const novasMetas = {};
    defaultExpense.forEach(cat => {
        const input = document.getElementById(`input-goal-${cat}`);
        if (input) {
            const valor = parseFloat(input.value);
            if (valor > 0) novasMetas[cat] = valor;
        }
    });

    userGoals = novasMetas; // Atualiza localmente

    db.collection(DB_COLLECTION).doc('config_metas').set(novasMetas)
    .then(() => {
        alert("Metas salvas!");
        isEditingGoals = false;
        renderGoalsInModal();
    })
    .catch(err => {
        console.error(err);
        alert("Erro ao salvar.");
    });
}

function loadGoals() {
    if (!DB_COLLECTION) return;
    db.collection(DB_COLLECTION).doc('config_metas').get()
    .then((doc) => {
        if (doc.exists) userGoals = doc.data();
        else userGoals = {};
    });
}

// Nova função para atualizar o filtro do histórico
function updateFilterSelect() {
    const filterSelect = document.getElementById('filter-category');
    if (!filterSelect) return;

    // Guarda a categoria que está selecionada agora (para não perder o filtro)
    const currentSelection = filterSelect.value;

    // Limpa a lista e adiciona a opção "Todas"
    filterSelect.innerHTML = '<option value="">Todas</option>';

    // Usa as listas REAIS (catsIncome e catsExpense) em vez das default
    const allCats = [...catsIncome, ...catsExpense];
    
    // Remove duplicados (caso haja nomes iguais) e organiza por ordem alfabética
    const uniqueCats = [...new Set(allCats)];
    uniqueCats.sort().forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat;
        opt.innerText = cat;
        filterSelect.appendChild(opt);
    });

    // Tenta selecionar de volta o que estava antes
    filterSelect.value = currentSelection;
}

// Função para salvar categorias no Firebase
function saveCategoriesToFirebase() {
    if (!DB_COLLECTION) return; // Só salva se o utilizador estiver logado
    
    db.collection(DB_COLLECTION).doc('config_categorias').set({
        income: catsIncome,
        expense: catsExpense
    })
    .then(() => console.log("Categorias sincronizadas com a nuvem!"))
    .catch(err => console.error("Erro ao salvar categorias:", err));
}

// Função para carregar categorias da Nuvem ao entrar
function loadCategoriesFromFirebase() {
    if (!DB_COLLECTION) return;

    // Fica "à escuta" de mudanças nas categorias na nuvem
    db.collection(DB_COLLECTION).doc('config_categorias').onSnapshot((doc) => {
        if (doc.exists) {
            const data = doc.data();
            
            // Se existirem listas salvas, substitui as locais
            if (data.income) {
                catsIncome = data.income;
                // Atualiza também a memória local para funcionar offline depois
                localStorage.setItem('user_income_cats', JSON.stringify(catsIncome));
            }
            if (data.expense) {
                catsExpense = data.expense;
                localStorage.setItem('user_expense_cats', JSON.stringify(catsExpense));
            }

            // Atualiza o visual do app com as novas listas
            updateCategorySelect();
            updateFilterSelect();
        }
    });
}
