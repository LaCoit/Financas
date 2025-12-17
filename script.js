// --- 1. CONFIGURAÇÃO (COLE SUAS CHAVES AQUI) ---
const firebaseConfig = {
    apiKey: "SUA_API_KEY_AQUI",
    authDomain: "SEU_ID.firebaseapp.com",
    projectId: "SEU_ID",
    storageBucket: "SEU_ID.appspot.com",
    messagingSenderId: "SEU_NUMERO",
    appId: "SEU_ID"
};

// Inicializa Firebase
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore();

// --- 2. VARIÁVEIS GLOBAIS ---
let allTransactions = [];
let DB_COLLECTION = ''; 

// --- 3. SISTEMA DE LOGIN (AUTH) ---

document.addEventListener('DOMContentLoaded', () => {
    const savedUser = JSON.parse(localStorage.getItem('my_financas_user_v10'));
    
    if (!savedUser) {
        document.getElementById('setup-screen').style.display = 'flex';
    } else {
        loadProfile(savedUser);
    }

    // Configurações de data
    document.getElementById('date').valueAsDate = new Date();
    document.getElementById('monthFilter').value = new Date().toISOString().substring(0, 7);
});

// A. Função Auxiliar: Gera ID limpo (joão da silva -> joao_da_silva)
function generateDbId(name) {
    return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/[^a-z0-9]/g, "_");
}

// B. Botão Entrar/Criar
async function saveSetup() {
    const nameInput = document.getElementById('input-setup-name').value.trim();
    const pinInput = document.getElementById('input-setup-pin').value.trim();
    const avatarType = document.querySelector('input[name="avatar"]:checked').value;

    if (!nameInput) return alert("Digite seu nome.");
    if (pinInput.length !== 4) return alert("O PIN deve ter 4 dígitos.");

    const btn = document.getElementById('btn-login');
    const originalText = btn.innerText;
    btn.innerText = "Verificando...";
    btn.disabled = true;

    const dbId = generateDbId(nameInput);
    
    if (dbId.length < 3) {
        btn.innerText = originalText; btn.disabled = false;
        return alert("Nome muito curto.");
    }

    try {
        // Busca na coleção de usuários
        const userDoc = await db.collection('app_users').doc(dbId).get();

        if (userDoc.exists) {
            // LOGIN: Usuário já existe, verifica PIN
            const data = userDoc.data();
            if (data.pin === pinInput) {
                finishLogin(data);
            } else {
                alert(`O nome "${nameInput}" já existe. Se é você, o PIN está errado.\nSe não é você, use um nome diferente (ex: ${nameInput} Silva).`);
                btn.innerText = "Tente outro nome";
                btn.disabled = false;
            }
        } else {
            // CADASTRO: Novo usuário
            const newUser = {
                name: nameInput,
                db_key: dbId,
                avatar: avatarType,
                pin: pinInput,
                createdAt: new Date().toISOString()
            };
            await db.collection('app_users').doc(dbId).set(newUser);
            finishLogin(newUser);
        }
    } catch (e) {
        console.error(e);
        alert("Erro de conexão. Verifique a internet ou as Regras do Firebase.");
        btn.innerText = originalText; btn.disabled = false;
    }
}

function finishLogin(user) {
    localStorage.setItem('my_financas_user_v10', JSON.stringify(user));
    document.getElementById('setup-screen').style.display = 'none';
    loadProfile(user);
}

// C. Carrega o Perfil (Cores e Banco de Dados)
function loadProfile(user) {
    // Define qual coleção de transações usar
    DB_COLLECTION = `transactions_${user.db_key}`;
    console.log(`Conectado em: ${DB_COLLECTION}`);

    // Muda o visual
    const header = document.getElementById('main-header');
    const display = document.getElementById('user-display');
    
    if (user.avatar === 'female') {
        header.style.backgroundColor = '#8e44ad'; // Roxo
        display.innerHTML = `<span style="font-size:1.5rem">👩🏻</span> Olá, ${user.name}`;
    } else {
        header.style.backgroundColor = '#2c3e50'; // Azul
        display.innerHTML = `<span style="font-size:1.5rem">🧔🏻‍♂️</span> Olá, ${user.name}`;
    }

    initApp();
}

function logoutProfile() {
    if(confirm("Sair deste perfil?")) {
        localStorage.removeItem('my_financas_user_v10');
        location.reload();
    }
}

// --- 4. APP PRINCIPAL (Banco de Dados) ---

function initApp() {
    // Escuta em tempo real
    db.collection(DB_COLLECTION).orderBy('date', 'desc').onSnapshot(snapshot => {
        allTransactions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        updateDashboard();
        renderList();
    });
}

// Adicionar
document.getElementById('transaction-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const item = {
        item: document.getElementById('description').value,
        amount: parseFloat(document.getElementById('amount').value),
        type: document.querySelector('input[name="type"]:checked').value,
        category: document.getElementById('category').value,
        date: document.getElementById('date').value,
        createdAt: new Date()
    };
    
    db.collection(DB_COLLECTION).add(item)
    .then(() => {
        document.getElementById('transaction-form').reset();
        document.getElementById('date').valueAsDate = new Date();
        alert("Salvo!");
    })
    .catch(err => alert("Erro ao salvar: " + err));
});

// Deletar
window.deleteTransaction = function(id) {
    if(confirm("Apagar item?")) db.collection(DB_COLLECTION).doc(id).delete();
}

// --- 5. LÓGICA DO DASHBOARD ---
function updateDashboard() {
    const month = document.getElementById('monthFilter').value;
    let rec = 0, desp = 0, poup = 0, ant = 0;

    allTransactions.forEach(t => {
        const d = t.date.substring(0, 7);
        
        if (d < month) {
            // Saldo Anterior
            if (t.type === 'income') ant += t.amount;
            else ant -= t.amount;
        } else if (d === month) {
            // Mês Atual
            if (t.type === 'income') rec += t.amount;
            else if (t.category === 'Poupança') poup += t.amount;
            else desp += t.amount;
        }
    });

    const saldo = ant + rec - desp - poup;
    
    document.getElementById('display-previous').innerText = fmt(ant);
    document.getElementById('display-savings').innerText = fmt(poup);
    document.getElementById('display-income').innerText = fmt(rec);
    document.getElementById('display-expense').innerText = fmt(desp);
    document.getElementById('display-balance').innerText = fmt(saldo);
    document.getElementById('display-balance').style.color = saldo >= 0 ? '#2c3e50' : '#c0392b';
}

function renderList() {
    const list = document.getElementById('transactions');
    list.innerHTML = '';
    const month = document.getElementById('monthFilter').value;

    allTransactions.forEach(t => {
        if (t.date.substring(0, 7) !== month) return;
        
        const li = document.createElement('li');
        li.className = 'transaction-item';
        li.innerHTML = `
            <div><strong>${t.item}</strong><br><small>${t.category} • ${t.date.split('-')[2]}/${t.date.split('-')[1]}</small></div>
            <div><span class="${t.type === 'income' ? 'amount-income' : 'amount-expense'}">
                ${t.type === 'income' ? '+' : '-'} ${fmt(t.amount)}
            </span> <span class="delete-btn" onclick="deleteTransaction('${t.id}')">🗑️</span></div>
        `;
        list.appendChild(li);
    });
}

function fmt(v) { return v.toLocaleString('pt-PT', {style: 'currency', currency: 'EUR'}); }

// --- 6. CHATBOT ---
function toggleChat() {
    const c = document.getElementById('chatWindow');
    c.style.display = c.style.display === 'flex' ? 'none' : 'flex';
}
function sendMessage() {
    const inp = document.getElementById('chatInput');
    const msg = inp.value.trim().toLowerCase();
    const chat = document.getElementById('chatMessages');
    if (!msg) return;

    chat.innerHTML += `<div class="msg-user">${inp.value}</div>`;
    inp.value = '';
    
    let resp = "Não entendi, desculpe.";
    if (msg.includes('pizza') || msg.includes('comida')) resp = "Categoria: <b>Alimentação</b> 🍔";
    else if (msg.includes('uber') || msg.includes('carro')) resp = "Categoria: <b>Transporte</b> 🚗";
    else if (msg.includes('luz') || msg.includes('casa')) resp = "Categoria: <b>Habitação</b> 🏠";
    else if (msg.includes('guardar')) resp = "Categoria: <b>Poupança</b> 🐷";

    setTimeout(() => {
        chat.innerHTML += `<div class="msg-bot">${resp}</div>`;
        chat.scrollTop = chat.scrollHeight;
    }, 500);
}

// Reset
function forceUpdate() {
    if(confirm("Limpar cache e reiniciar?")) {
        localStorage.clear();
        if('caches' in window){
            caches.keys().then((names) => {
                names.forEach(name => caches.delete(name));
            });
        }
        window.location.reload(true);
    }
}