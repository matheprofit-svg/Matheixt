const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// Servir la page HTML directement à la racine
app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Matheixt - Trading Platform</title>
  <style>
    body { background-color: #0d1117; color: #c9d1d9; font-family: Arial, sans-serif; margin: 0; padding: 10px; }
    h1 { color: #58a6ff; font-size: 20px; text-align: center; }
    .card { background: #161b22; padding: 15px; margin-bottom: 10px; border-radius: 8px; border: 1px solid #30363d; }
    button { background: #238636; color: white; border: none; padding: 10px; width: 100%; border-radius: 5px; font-weight: bold; cursor: pointer; margin-top: 5px; }
    button.put { background: #da3633; }
    input, select { width: 100%; padding: 8px; margin: 5px 0 10px 0; background: #0d1117; border: 1px solid #30363d; color: white; border-radius: 5px; box-sizing: border-box; }
    .price-box { font-size: 24px; font-weight: bold; color: #3fb950; text-align: center; }
    .balances { display: flex; justify-content: space-between; font-size: 14px; background: #21262d; padding: 8px; border-radius: 5px; }
  </style>
</head>
<body>

  <h1>Matheixt Trading</h1>

  <!-- AUTHENTIFICATION -->
  <div class="card" id="auth-section">
    <h3>Connexion</h3>
    <input type="email" id="email" placeholder="Votre email (ex: trader@mail.com)">
    <button onclick="loginUser()">Se connecter / S'inscrire</button>
  </div>

  <!-- PLATEFORME DE TRADING -->
  <div id="trading-section" style="display:none;">
    <div class="balances">
      <span>Demo: <b id="bal-demo">10000.00</b> $</span>
      <span>Réel: <b id="bal-real">0.00</b> $</span>
    </div>

    <div class="card">
      <h3>Marché en Direct</h3>
      <select id="symbol" onchange="changeSymbol()">
        <option value="EUR/USD">EUR/USD OTC</option>
        <option value="XAU/USD">Gold (XAU/USD)</option>
      </select>
      <div class="price-box" id="live-price">Chargement...</div>
      <p style="font-size: 12px; text-align: center; margin: 5px 0;">RSI: <span id="rsi-val">--</span></p>
    </div>

    <div class="card">
      <h3>Passer un Ordre</h3>
      <label>Compte à utiliser :</label>
      <select id="account-type">
        <option value="demo">Compte Démo (10 000$ fictifs)</option>
        <option value="real">Compte Réel</option>
      </select>

      <label>Montant de la mise ($) :</label>
      <input type="number" id="stake" value="10" min="1">

      <label>Durée :</label>
      <select id="timeframe">
        <option value="5">5 Secondes</option>
        <option value="60" selected>1 Minute</option>
        <option value="300">5 Minutes</option>
      </select>

      <button onclick="executeTrade('CALL')">📈 ACHETER (CALL)</button>
      <button class="put" onclick="executeTrade('PUT')">📉 VENDRE (PUT)</button>
    </div>

    <div class="card">
      <h3>Gestion Compte Réel</h3>
      <input type="number" id="deposit-amount" placeholder="Montant du dépôt">
      <button onclick="depositReal()">Déposer sur Réel</button>
    </div>
  </div>

  <script>
    const BACKEND_URL = window.location.origin;
    let currentUserEmail = "";
    let ws;

    function loginUser() {
      const email = document.getElementById('email').value;
      if (!email) return alert('Entrez un email valide');

      fetch(\`\${BACKEND_URL}/api/auth\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      })
      .then(res => res.json())
      .then(data => {
        if(data.success) {
          currentUserEmail = email;
          document.getElementById('auth-section').style.display = 'none';
          document.getElementById('trading-section').style.display = 'block';
          updateBalances(data.user);
          connectWebSocket();
        }
      });
    }

    function updateBalances(user) {
      document.getElementById('bal-demo').innerText = user.balanceDemo.toFixed(2);
      document.getElementById('bal-real').innerText = user.balanceReal.toFixed(2);
    }

    function connectWebSocket() {
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(\`\${proto}//\${window.location.host}\`);
      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        const currentSymbol = document.getElementById('symbol').value;
        if(msg.data && msg.data[currentSymbol]) {
          document.getElementById('live-price').innerText = msg.data[currentSymbol].price;
          if(msg.data[currentSymbol].rsi) {
            document.getElementById('rsi-val').innerText = msg.data[currentSymbol].rsi;
          }
        }
      };
    }

    function depositReal() {
      const amount = parseFloat(document.getElementById('deposit-amount').value);
      if(!amount || amount <= 0) return alert('Montant invalide');

      fetch(\`\${BACKEND_URL}/api/account/deposit\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: currentUserEmail, amount })
      })
      .then(res => res.json())
      .then(data => {
        if(data.success) {
          document.getElementById('bal-real').innerText = data.balanceReal.toFixed(2);
          alert('Dépôt réussi !');
        }
      });
    }

    function executeTrade(direction) {
      const stake = parseFloat(document.getElementById('stake').value);
      const accountType = document.getElementById('account-type').value;
      const symbol = document.getElementById('symbol').value;
      const timeframe = parseInt(document.getElementById('timeframe').value);

      fetch(\`\${BACKEND_URL}/api/trade/ai\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: currentUserEmail, stake, accountType, symbol, timeframe })
      })
      .then(res => res.json())
      .then(data => {
        if(data.error) {
          alert(data.error);
        } else {
          alert(\`Trade terminé ! Résultat : \${data.isWin ? 'GAGNÉ (+' + data.payout + '$)' : 'PERDU'}\`);
          loginUser();
        }
      });
    }
  </script>
</body>
</html>`);
});

const PORT = process.env.PORT || 3000;
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let usersDB = {};
let priceHistory = { 'EUR/USD': [], 'XAU/USD': [] };

// Indicateurs techniques
function calculateRSI(data, period = 14) {
  if (data.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = data.length - period; i < data.length; i++) {
    const diff = data[i] - data[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return (100 - (100 / (1 + rs))).toFixed(2);
}

// Routes API Backend
app.post('/api/auth', (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email requis' });

  if (!usersDB[email]) {
    usersDB[email] = {
      email,
      balanceDemo: 10000.00,
      balanceReal: 0.00,
      trades: []
    };
  }
  res.json({ success: true, user: usersDB[email] });
});

app.post('/api/account/deposit', (req, res) => {
  const { email, amount } = req.body;
  if (!usersDB[email]) return res.status(404).json({ error: 'Utilisateur non trouvé' });

  usersDB[email].balanceReal += parseFloat(amount);
  res.json({ success: true, balanceReal: usersDB[email].balanceReal });
});

app.post('/api/trade/ai', (req, res) => {
  const { email, stake, accountType, symbol, timeframe } = req.body;
  const user = usersDB[email];
  if (!user) return res.status(404).json({ error: 'Utilisateur non trouvé' });

  const balanceKey = accountType === 'demo' ? 'balanceDemo' : 'balanceReal';
  if (user[balanceKey] < stake) {
    return res.status(400).json({ error: 'Solde insuffisant !' });
  }

  // Déduction de la mise
  user[balanceKey] -= stake;

  // Simulation du trade avec la logique algorithmique
  setTimeout(() => {
    const isWin = Math.random() > 0.45;
    const payout = isWin ? stake * 1.85 : 0;
    user[balanceKey] += payout;

    user.trades.push({ id: Date.now(), symbol, stake, isWin, payout });

    res.json({ success: true, isWin, payout: payout.toFixed(2), newBalance: user[balanceKey] });
  }, Math.min(timeframe * 1000, 5000));
});

// WebSocket Flux Prix en Direct
let currentPrices = { 'EUR/USD': 1.08500, 'XAU/USD': 2350.50 };

wss.on('connection', (ws) => {
  const interval = setInterval(() => {
    currentPrices['EUR/USD'] += (Math.random() - 0.49) * 0.0002;
    currentPrices['XAU/USD'] += (Math.random() - 0.49) * 0.50;

    priceHistory['EUR/USD'].push(currentPrices['EUR/USD']);
    priceHistory['XAU/USD'].push(currentPrices['XAU/USD']);

    if (priceHistory['EUR/USD'].length > 50) priceHistory['EUR/USD'].shift();
    if (priceHistory['XAU/USD'].length > 50) priceHistory['XAU/USD'].shift();

    ws.send(JSON.stringify({
      timestamp: Date.now(),
      data: {
        'EUR/USD': {
          price: currentPrices['EUR/USD'].toFixed(5),
          rsi: calculateRSI(priceHistory['EUR/USD'])
        },
        'XAU/USD': {
          price: currentPrices['XAU/USD'].toFixed(2),
          rsi: calculateRSI(priceHistory['XAU/USD'])
        }
      }
    }));
  }, 1000);

  ws.on('close', () => clearInterval(interval));
});

server.listen(PORT, () => {
  console.log(`Serveur et plateforme Matheixt en ligne sur le port ${PORT}`);
});
