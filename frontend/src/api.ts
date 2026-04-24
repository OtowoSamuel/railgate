import axios from 'axios';

const API_BASE_URL = '/api'; // Proxied by Vite in dev, or handled by Caddy in prod

export const api = axios.create({
  baseURL: API_BASE_URL,
});

export const getDeployments = async () => {
  const { data } = await api.get('/deployments');
  return data;
};

export const getDeployment = async (id: string) => {
  const { data } = await api.get(`/deployments/${id}`);
  return data;
};

export const createDeployment = async (payload: { gitUrl?: string; file?: File }) => {
  const formData = new FormData();
  if (payload.gitUrl) formData.append('gitUrl', payload.gitUrl);
  if (payload.file) formData.append('file', payload.file);

  const { data } = await api.post('/deployments', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  return data;
};

export const getBuilds = async (deploymentId: string) => {
  const { data } = await api.get(`/deployments/${deploymentId}/builds`);
  return data;
};

export const rollbackDeployment = async (deploymentId: string, buildId: string) => {
  const { data } = await api.post(`/deployments/${deploymentId}/rollback`, { build_id: buildId });
  return data;
};
