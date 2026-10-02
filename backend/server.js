const express = require('express');
const cors = require('cors');
const WebSocket = require('ws');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Route de vérification (Santé du serveur)
app.get('/', (req, res) => {
  res.json({ status: 'OK', message: 'Serveur Matheixt en cours d\'exécution' });
});

// Route d'API pour les signaux
app.get('/api/signals', (req, res) => {
  res.json({
    timestamp: new Date().toISOString(),
    pair: 'EUR/USD OTC',
    signal: 'BUY',
    timeframe: '1m',
    accuracy: '88%'
  });
});

const server = app.listen(PORT, () => {
  console.log(`Serveur démarré sur le port ${PORT}`);
});
