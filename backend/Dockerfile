FROM node:20-alpine

# Install Docker CLI and Railpack
RUN apk add --no-cache docker-cli curl
RUN curl -sSL https://railpack.com/install.sh | sh

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# Ensure data and uploads directories exist
RUN mkdir -p data uploads

EXPOSE 3000

CMD ["npm", "start"]
