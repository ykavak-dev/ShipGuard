FROM node:20-alpine
WORKDIR /app
COPY . .
RUN npm ci --omit=dev
EXPOSE 3000
EXPOSE 5432
CMD ["node", "src/app.js"]
