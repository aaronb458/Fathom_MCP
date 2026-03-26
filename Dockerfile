FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY dist/ dist/
RUN mkdir -p data
VOLUME ["/app/data"]
EXPOSE 3000
CMD ["node", "dist/remote.js"]
