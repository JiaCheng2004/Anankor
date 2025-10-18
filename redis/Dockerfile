FROM redis:alpine

ENV TZ=America/Los_Angeles
RUN apk add --no-cache tzdata \
    && cp /usr/share/zoneinfo/${TZ} /etc/localtime \
    && echo "${TZ}" > /etc/timezone

CMD ["redis-server", "--save", "", "--appendonly", "no"]
