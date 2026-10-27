FROM node:22-alpine
WORKDIR /app
COPY services/order-service/package.json .
RUN npm install --omit=dev
COPY services/order-service/src ./src
EXPOSE 3002
CMD ["npm", "start"]
