import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import deploymentRoutes from './routes/deployments';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.use('/api/deployments', deploymentRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(port, () => {
  console.log(`Backend API listening at http://localhost:${port}`);
});
