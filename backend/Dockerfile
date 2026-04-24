FROM node:20-bookworm-slim

# Install Docker CLI and Railpack
RUN apt-get update \
  && apt-get install -y --no-install-recommends curl ca-certificates gnupg git unzip \
  && install -m 0755 -d /etc/apt/keyrings \
  && curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc \
  && chmod a+r /etc/apt/keyrings/docker.asc \
  && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian bookworm stable" > /etc/apt/sources.list.d/docker.list \
  && apt-get update \
  && apt-get install -y --no-install-recommends docker-ce-cli \
  && rm -rf /var/lib/apt/lists/*

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
