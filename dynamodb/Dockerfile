FROM amazon/dynamodb-local:latest

ENV TZ=America/Los_Angeles
USER root
RUN ln -snf /usr/share/zoneinfo/${TZ} /etc/localtime \
    && echo "${TZ}" > /etc/timezone
USER dynamodblocal

CMD ["-jar", "DynamoDBLocal.jar", "-sharedDb", "-inMemory"]
