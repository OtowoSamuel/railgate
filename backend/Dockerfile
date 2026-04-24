FROM node:20-alpine

# Install Docker CLI to interact with the mounted socket
RUN apk add --no-cache docker-cli

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# Ensure data and uploads directories exist
RUN mkdir -p data uploads

EXPOSE 3000

CMD ["npm", "start"]
