import express from 'express';
import path from 'path';
import entriesHandler from './api/entries.js';
import ratesHandler from './api/exchange-rates.js';

const app = express();
app.use(express.json());

// Mevcut API fonksiyonlarını doğrudan çalıştırır
app.all('/api/entries', (req, res) => entriesHandler(req, res));
app.all('/api/exchange-rates', (req, res) => ratesHandler(req, res));

// Ön yüz (React) dosyalarını sunar
app.use(express.static(path.join(process.cwd(), 'dist')));
app.get('*', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'dist', 'index.html'));
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Sunucu ${PORT} portunda aktif.`));
