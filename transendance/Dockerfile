FROM node:20

WORKDIR /app

# Copy everything
COPY backend ./backend
COPY frontend ./frontend
COPY cert ./cert
COPY db ./db

# Install backend dependencies
WORKDIR /app/backend
RUN npm install

# Build Tailwind from backend (where tailwind is installed)
RUN npx tailwindcss -i ../frontend/input.css -o ../frontend/tailwind.css --minify

# Expose HTTPS port
EXPOSE 443

# Start the Fastify server
CMD ["npm", "start"]
