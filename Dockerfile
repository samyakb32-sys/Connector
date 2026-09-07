FROM node:22-bookworm-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci

# Install the Chromium build that matches the installed Playwright version,
# plus its system libraries. Doing it this way (instead of pinning a
# mcr.microsoft.com/playwright:<version> base image) keeps the browser and the
# playwright package in sync automatically.
RUN npx playwright install --with-deps chromium

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

ENV PORT=3000
EXPOSE 3000

CMD ["node", "dist/http.js"]
