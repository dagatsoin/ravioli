FROM mhart/alpine-node:13

WORKDIR /usr/src/app

COPY . .

RUN yarn --pure-lockfile && yarn run build

COPY ["/dist", "./"]

CMD [ "node", "." ]