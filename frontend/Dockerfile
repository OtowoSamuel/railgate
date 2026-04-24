FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 5173

# Run in dev mode to support the proxy and hmr if needed, 
# or use 'npm run build' and 'npm run preview'
CMD ["npm", "run", "dev", "--", "--host"]
