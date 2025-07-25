FROM node:20

WORKDIR /app

COPY backend backend
COPY frontend frontend
COPY cert cert
COPY db db
COPY package.json .

RUN npm install
RUN npx tailwindcss -i ./frontend/input.css -o ./frontend/tailwind.css --minify

EXPOSE 443

CMD ["npm", "start"]
