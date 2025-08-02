FROM node:20

WORKDIR /app

# Copy both package.json and package-lock.json if it exists
COPY backend/package*.json ./

# Install dependencies (including dotenv)
RUN npm install

# Copy the rest of the app
COPY backend/. .

# Ensure uploads dir exists
RUN mkdir -p /app/uploads /app/public /app/db

EXPOSE 3000

CMD ["node", "server.js"]
