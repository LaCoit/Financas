// --- 1. CONFIGURAÇÃO (COLE SUAS CHAVES AQUI) ---
const firebaseConfig = {
    apiKey: "AIzaSyATkpiODXMz-TaHhqq7pVs9qmMktbcBPcE",
        authDomain: "financas-abel.firebaseapp.com",
        projectId: "financas-abel",
        storageBucket: "financas-abel.firebasestorage.app",
        messagingSenderId: "760243071362",
        appId: "1:760243071362:web:d58bc675d1ac3cd56d079b"
};

if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// --- 2. VARIÁVEIS GLOBAIS ---
let allTransactions = [];
let DB_COLLECTION = '';
let currentUser = null;
let editMode = false; // Controla se o lixo aparece ou não

// Categorias
const defaultIncome = ["Salário 💵", "Vendas 📈", "Bónus 🎁", "Poupança (Resgate) 🐷"];
const defaultExpense = ["Alimentação 🍔", "Transporte 🚗", "Habitação 🏠", "Lazer 🎉", "Contas 💡", "Poupança (Guardar) 🐷"];

let catsIncome = JSON.parse(localStorage.getItem('cats_inc')) || defaultIncome;
let catsExpense = JSON.parse(localStorage.getItem('cats_exp')) || defaultExpense;

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
    
    // Configura inputs iniciais
    toggleFormFields();
});

// LOGIN
async function saveSetup() {
    const name = document.getElementById('input-setup-name').value.trim();
    const pin = document.getElementById('input-setup-pin').value;
    const avatar = document.querySelector('input[name="avatar"]:checked').value;

    if (!name || pin.length !== 4) return alert("Preencha nome e PIN de 4 dígitos.");
    const dbId = name.normalize("NFD").replace(/[^a-z0-9]/g, "").toLowerCase() + "_" + pin; // ID simples
    
    // Login Simulado (cria usuário localmente e no banco se não existir)
    const newUser = { name, db_key: dbId, avatar, pin };
    loginSuccess(newUser);
}

function loginSuccess(user) {
    currentUser = user;
    localStorage.setItem('fin_user_v12', JSON.stringify(user));
    document.getElementById('setup-screen').style.display = 'none';
    
    // Cor do tema
    const color = user.avatar === 'female' ? '#8e44ad' : '#2c3e50';
    document.querySelector('header').style.background = color;
    document.querySelector('.nav-btn-big').style.background = color;
    document.getElementById('user-emoji').innerText = user.avatar === 'female' ? '👩🏻' : '🧔🏻‍♂️';
    
    DB_COLLECTION = `transactions_${user.db_key}`;
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

// AJUDA
window.toggleHelp = function() {
    const modal = document.getElementById('help-modal');
    modal.style.display = (modal.style.display === 'block') ? 'none' : 'block';
}

// --- 4. APP PRINCIPAL ---
function initApp() {
    db.collection(DB_COLLECTION).orderBy('date', 'desc').onSnapshot(snap => {
        allTransactions = snap.docs.map(d => ({id: d.id, ...d.data()}));
        updateDashboard();
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
    const typeName = type === 'income' ? 'Receita' : 'Gastos';
    const list = type === 'income' ? catsIncome : catsExpense;
    const key = type === 'income' ? 'cats_inc' : 'cats_exp';

    const action = prompt(`Gerenciar Categorias de ${typeName}:\n1. Adicionar Nova\n2. Apagar Existente\n\nDigite 1 ou 2:`);

    if (action === '1') {
        const newCat = prompt("Nome da nova categoria:");
        if (newCat) {
            list.push(newCat);
            localStorage.setItem(key, JSON.stringify(list));
            updateCategorySelect();
        }
    } else if (action === '2') {
        const catToDelete = prompt("Digite o nome EXATO para apagar:\n" + list.join(", "));
        const idx = list.indexOf(catToDelete);
        if (idx > -1) {
            list.splice(idx, 1);
            localStorage.setItem(key, JSON.stringify(list));
            updateCategorySelect();
            alert("Categoria apagada!");
        } else {
            alert("Nome não encontrado.");
        }
    }
}

// --- 6. FORMULÁRIO DINÂMICO ---
window.toggleFormFields = function() {
    const type = document.querySelector('input[name="type"]:checked').value;
    const expenseInputs = document.getElementById('expense-inputs');
    const amountInput = document.getElementById('amount');
    const descInput = document.getElementById('description');

    updateCategorySelect();

    if (type === 'income') {
        // Modo Receita: Esconde Qtd, Libera Valor, Descrição Opcional
        expenseInputs.style.display = 'none';
        amountInput.readOnly = false;
        amountInput.style.background = '#fff';
        amountInput.placeholder = "0.00";
        amountInput.value = '';
        descInput.placeholder = "Salário (Opcional)";
        descInput.required = false;
    } else {
        // Modo Gastos: Mostra Qtd, Trava Valor (Calculadora), Descrição Obrigatória
        expenseInputs.style.display = 'flex';
        amountInput.readOnly = true;
        amountInput.style.background = '#eee';
        descInput.placeholder = "Ex: Arroz, Gasolina...";
        descInput.required = true;
        calculateTotal(); // Recalcula caso tenha sujeira
    }
}

window.calculateTotal = function() {
    const qty = parseFloat(document.getElementById('qty').value) || 0;
    const price = parseFloat(document.getElementById('unit-price').value) || 0;
    document.getElementById('amount').value = (qty * price).toFixed(2);
}

document.getElementById('transaction-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const type = document.querySelector('input[name="type"]:checked').value;
    const amountVal = parseFloat(document.getElementById('amount').value);
    let desc = document.getElementById('description').value;

    if (!amountVal) return alert("Insira um valor!");
    if (type === 'income' && !desc) desc = "Receita Diversa"; // Padrão se vazio

    // Se for gasto com Qtd > 1, formata nome
    if (type === 'expense') {
        const qty = document.getElementById('qty').value;
        if(qty > 1) desc = `(${qty}x) ${desc}`;
    }

    db.collection(DB_COLLECTION).add({
        item: desc,
        amount: amountVal,
        type: type,
        category: document.getElementById('category').value,
        date: document.getElementById('date').value,
        createdAt: new Date().toISOString()
    }).then(() => {
        document.getElementById('transaction-form').reset();
        document.getElementById('date').valueAsDate = new Date();
        document.getElementById('qty').value = 1;
        toggleFormFields(); // Reset visual
        alert("Salvo!");
        switchView('dashboard');
    });
});

// --- 7. DASHBOARD, AGRUPAMENTO E APAGAR ---
function updateDashboard() {
    const month = document.getElementById('monthFilter').value;
    let rec = 0, desp = 0, cofre = 0, saldoTotal = 0;
    let gastosPorCat = {};

    allTransactions.forEach(t => {
        const d = t.date.substring(0, 7);
        const val = parseFloat(t.amount);
        
        // Saldo Geral
        if (d <= month) {
             if(t.category.includes('Poupança')) {
                 saldoTotal += (t.type === 'expense') ? -val : val;
             } else {
                 saldoTotal += (t.type === 'income') ? val : -val;
             }
        }

        // Mês Atual
        if (d === month) {
            if (t.category.includes('Poupança')) {
                if(t.type === 'expense') cofre += val; else cofre -= val;
            } else if (t.type === 'income') {
                rec += val;
            } else {
                desp += val;
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

// TOGGLE DO MODO DE EDIÇÃO
window.toggleEditMode = function() {
    editMode = !editMode;
    const list = document.getElementById('transactions');
    const btn = document.getElementById('edit-btn');
    
    if(editMode) {
        list.classList.add('show-delete');
        btn.style.background = '#e74c3c';
        btn.style.color = 'white';
        btn.innerText = 'OK';
    } else {
        list.classList.remove('show-delete');
        btn.style.background = 'white';
        btn.style.color = 'black';
        btn.innerText = '✏️';
    }
}

function renderList(month) {
    const list = document.getElementById('transactions');
    list.innerHTML = '';
    const shouldGroup = document.getElementById('group-toggle').checked;
    
    // Filtra mês atual
    let items = allTransactions.filter(t => t.date.substring(0, 7) === month);

    if (shouldGroup) {
        // Lógica de Agrupar: Dicionário onde Chave = Data + Nome + Categoria
        const grouped = {};
        items.forEach(t => {
            const key = `${t.date}-${t.item}-${t.category}-${t.type}`;
            if(!grouped[key]) {
                grouped[key] = { ...t, count: 1 };
            } else {
                grouped[key].amount += t.amount;
                grouped[key].count += 1;
            }
        });
        items = Object.values(grouped);
    }
    
    // Ordena por data
    items.sort((a,b) => b.date.localeCompare(a.date));

    items.forEach(t => {
        const li = document.createElement('li');
        li.className = 'transaction-item';
        
        // Se estiver agrupado e tiver mais de 1, mostra (3 itens)
        const countBadge = (t.count && t.count > 1) ? ` <span style="background:#ddd; px; font-size:0.7rem; border-radius:4px">x${t.count}</span>` : '';
        const displayItem = t.item.replace(/\(\d+x\) /, ''); // Remove prefixo antigo visualmente se agrupar

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

// GRÁFICOS E METAS (Igual à versão anterior)
function renderChart(data, total) {
    const chart = document.getElementById('expenseChart');
    const legend = document.getElementById('chart-legend');
    legend.innerHTML = '';
    if (total === 0) { chart.style.background = '#eee'; return; }

    let gradient = [], currentDeg = 0, i = 0;
    const colors = ['#e74c3c', '#3498db', '#f1c40f', '#9b59b6', '#2ecc71'];

    for (const [cat, val] of Object.entries(data)) {
        const deg = (val / total) * 360;
        gradient.push(`${colors[i % 5]} ${currentDeg}deg ${currentDeg + deg}deg`);
        currentDeg += deg;
        legend.innerHTML += `<div class="legend-item"><div class="dot" style="background:${colors[i%5]}"></div>${cat.split(' ')[0]}</div>`;
        i++;
    }
    chart.style.background = `conic-gradient(${gradient.join(', ')})`;
}

// --- Funções Auxiliares ---
window.deleteItem = function(id) {
    if(confirm("Apagar item?")) db.collection(DB_COLLECTION).doc(id).delete();
}

// Metas Simples
let userGoals = JSON.parse(localStorage.getItem('user_goals')) || {};
window.addNewGoal = function() {
    const cat = prompt("Qual Categoria de Gasto?");
    if(cat) {
        const val = prompt("Qual o limite mensal?");
        if(val) { userGoals[cat] = parseFloat(val); localStorage.setItem('user_goals', JSON.stringify(userGoals)); renderGoals(); }
    }
}
function renderGoals() {
    const div = document.getElementById('goals-list');
    div.innerHTML = '';
    for(const [cat, val] of Object.entries(userGoals)) {
        div.innerHTML += `<div class="goal-item"><strong>${cat}</strong>: Meta ${fmt(val)} <button onclick="deleteGoal('${cat}')" style="color:red;border:none;background:none;float:right">x</button></div>`;
    }
}
window.deleteGoal = function(cat) { delete userGoals[cat]; localStorage.setItem('user_goals', JSON.stringify(userGoals)); renderGoals(); }

function fmt(v) { return v.toLocaleString('pt-PT', {style: 'currency', currency: 'EUR'}); }
