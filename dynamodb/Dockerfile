FROM amazon/dynamodb-local:latest

ENV TZ=America/Los_Angeles
RUN yum update -y \
    && yum install -y tzdata \
    && ln -snf /usr/share/zoneinfo/${TZ} /etc/localtime \
    && echo "${TZ}" > /etc/timezone \
    && yum clean all \
    && rm -rf /var/cache/yum

CMD ["-jar", "DynamoDBLocal.jar", "-sharedDb", "-inMemory"]
