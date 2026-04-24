const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('<h1>Hello from Mini-PaaS!</h1><p>This is a sample app deployed via the platform.</p>');
});

app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

app.listen(port, () => {
  console.log(`Sample app listening at http://localhost:${port}`);
});
