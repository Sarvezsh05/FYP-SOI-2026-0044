# CloudVault runs as an unprivileged Node.js user; credentials are not baked into the image.
FROM node:22-alpine
WORKDIR /app
COPY package.json ./
# Install only official SDK/database/mail packages required by protected integrations.
RUN npm install --omit=dev --ignore-scripts
COPY start.js server.js API.js db.js config.js events.js helpers.js storage.js mailer.js ./
COPY public ./public
COPY db ./db
COPY scripts ./scripts
RUN mkdir -p /app/data/uploads /app/data/lab-fixtures /app/logs && chown -R node:node /app
USER node
EXPOSE 3000 8000
CMD ["node","start.js"]
