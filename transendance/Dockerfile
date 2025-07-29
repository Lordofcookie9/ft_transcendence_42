# Base image
FROM node:20

# Install tini for proper signal handling (e.g. Ctrl+C)
RUN apt-get update && apt-get install -y tini \
python3 \
make \
g++ \
&& rm -rf /var/lib/apt/lists/*

# Set tini as the init system
ENTRYPOINT ["/usr/bin/tini", "--"]

# Set working directory
WORKDIR /app

# Copy source files
COPY backend ./backend
COPY frontend ./frontend
COPY cert ./cert
COPY db ./db

# Move into backend and install dependencies
WORKDIR /app/backend
RUN npm install
RUN npm rebuild sqlite3

WORKDIR /app/frontend
RUN npm install
RUN npm run build

# Expose HTTPS port
EXPOSE 443

WORKDIR /app/backend
# Start the Fastify server
CMD ["npm", "start"]
