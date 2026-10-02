const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let usersDB = {};
let priceHistory = { 'EUR/USD': [], 'XAU/USD': [] };

// --- INDICATEURS TECHNIQUES ---
function calculateSMA(data, period) {
  if (data.length < period) return null;
  return data.slice(-period).reduce((a, b) => a + b, 0) / period;
}

function calculateEMA(data, period) {
  if (data.length < period) return null;
  const k = 2 / (period + 1);
  let ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < data.length; i++) {
    ema = (data[i] * k) + (ema * (1 - k));
  }
  return ema;
}

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
  return 100 - (100 / (1 + (avgGain / avgLoss)));
}

function calculateBollingerBands(data, period = 20, multiplier = 2) {
  const sma = calculateSMA(data, period);
  if (!sma) return null;
  const slice = data.slice(-period);
  const variance = slice.reduce((a, b) => a + Math.pow(b - sma, 2), 0) / period;
  const stdDev = Math.sqrt(variance);
  return { middle: sma, upper: sma + (multiplier * stdDev), lower: sma - (multiplier * stdDev) };
}

function calculateZigZag(data, deviation = 0.0005) {
  if (data.length < 5) return 'NEUTRAL';
  const change = (data[data.length - 1] - data[data.length - 5]) / data[data.length - 5];
  if (change >= deviation) return 'BULLISH';
  if (change <= -deviation) return 'BEARISH';
  return 'NEUTRAL';
}

// --- ROUTES API ---
app.get('/', (req, res) => {
  res.json({ status: 'OK', message: 'Plateforme Matheixt Opérationnelle' });
});

// Connexion / Création de compte (Démo 10,000$ automatique)
app.post('/api/auth', (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email requis' });

  if (!usersDB[email]) {
    usersDB[email] = {
      email,
      balanceDemo: 10000.00, // Démo fixe à 10 000 $
      balanceReal: 0.00,     // Compte Réel
      trades: []
    };
  }
  res.json({ success: true, user: usersDB[email] });
});

// Dépôt Compte Réel
app.post('/api/account/deposit', (req, res) => {
  const { email, amount } = req.body;
  const user = usersDB[email];
  if (!user || !amount || amount <= 0) return res.status(400).json({ error: 'Dépôt invalide' });
  user.balanceReal += parseFloat(amount);
  res.json({ success: true, balanceReal: user.balanceReal });
});

// Retrait Compte Réel
app.post('/api/account/withdraw', (req, res) => {
  const { email, amount } = req.body;
  const user = usersDB[email];
  if (!user || !amount || amount <= 0 || user.balanceReal < amount) {
    return res.status(400).json({ error: 'Solde réel insuffisant' });
  }
  user.balanceReal -= parseFloat(amount);
  res.json({ success: true, balanceReal: user.balanceReal });
});

// Exécution Trade (Compte 'demo' ou 'real')
app.post('/api/trade/ai', (req, res) => {
  const { email, stake, accountType = 'demo', symbol = 'EUR/USD', timeframe = 60 } = req.body;
  const user = usersDB[email];
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });

  const isReal = accountType === 'real';
  const balanceKey = isReal ? 'balanceReal' : 'balanceDemo';

  if (user[balanceKey] < stake) {
    return res.status(400).json({ error: `Solde insuffisant sur le compte ${isReal ? 'Réel' : 'Démo'}` });
  }

  user[balanceKey] -= parseFloat(stake);

  const prices = priceHistory[symbol] || [];
  const rsi = calculateRSI(prices);
  const bb = calculateBollingerBands(prices);
  const zigzag = calculateZigZag(prices);

  let decision = 'CALL';
  if (rsi > 70 || (bb && prices[prices.length - 1] > bb.upper)) decision = 'PUT';
  else if (rsi < 30 || (bb && prices[prices.length - 1] < bb.lower)) decision = 'CALL';
  else decision = zigzag === 'BULLISH' ? 'CALL' : 'PUT';

  const durationMs = Math.min(Math.max(timeframe, 3), 300) * 1000;

  setTimeout(() => {
    const isWin = Math.random() > 0.38;
    const payout = isWin ? parseFloat(stake) * 1.85 : 0;
    user[balanceKey] += payout;

    const tradeResult = { id: Date.now(), symbol, accountType, decision, stake: parseFloat(stake), isWin, payout };
    user.trades.push(tradeResult);

    res.json({ status: 'completed', isWin, payout, newBalance: user[balanceKey], trade: tradeResult });
  }, durationMs);
});

// --- WEBSOCKET PRIX EN DIRECT ---
let currentPrices = { 'EUR/USD': 1.08500, 'XAU/USD': 2650.50 };

wss.on('connection', (ws) => {
  const interval = setInterval(() => {
    currentPrices['EUR/USD'] += (Math.random() - 0.495) * 0.00010;
    currentPrices['XAU/USD'] += (Math.random() - 0.495) * 0.25;

    priceHistory['EUR/USD'].push(currentPrices['EUR/USD']);
    priceHistory['XAU/USD'].push(currentPrices['XAU/USD']);
    if (priceHistory['EUR/USD'].length > 100) priceHistory['EUR/USD'].shift();

    const eurPrices = priceHistory['EUR/USD'];
    ws.send(JSON.stringify({
      timestamp: Date.now(),
      data: {
        'EUR/USD': { price: currentPrices['EUR/USD'].toFixed(5), rsi: calculateRSI(eurPrices).toFixed(2) },
        'XAU/USD': { price: currentPrices['XAU/USD'].toFixed(2) }
      }
    }));
  }, 1000);

  ws.on('close', () => clearInterval(interval));
});

server.listen(PORT, () => console.log(`Matheixt prêt sur le port ${PORT}`));
