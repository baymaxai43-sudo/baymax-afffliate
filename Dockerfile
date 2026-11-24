# Baymax-Shoppey — optional standalone backend (Render / Docker)
# The same Fastify API also runs in-process inside Next.js on Vercel.
FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
RUN npm install tsx --no-save
ENV NODE_ENV=production
EXPOSE 4000
CMD ["npx", "tsx", "server/src/index.ts"]
