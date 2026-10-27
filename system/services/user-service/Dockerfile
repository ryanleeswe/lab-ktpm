FROM node:22-alpine
WORKDIR /app
COPY services/user-service/package.json .
RUN npm install --omit=dev
COPY services/user-service/src ./src
EXPOSE 3001
CMD ["npm", "start"]
