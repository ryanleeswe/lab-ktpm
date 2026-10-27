FROM node:22-alpine
WORKDIR /app
COPY services/gateway/package.json .
RUN npm install --omit=dev
COPY services/gateway/src ./src
EXPOSE 8080
CMD ["npm", "start"]
