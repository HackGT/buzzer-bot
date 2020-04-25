FROM node:10-alpine

WORKDIR /usr/src/buzzer-bot
COPY . /usr/src/buzzer-bot
RUN npm install

EXPOSE 80
CMD ["npm", "start"]
