FROM alpine:latest

ARG PB_VERSION=0.39.0

RUN apk add --no-cache \
    unzip \
    ca-certificates \
    tzdata \
    || (apk update && apk add --no-cache \
    unzip \
    ca-certificates \
    tzdata)

ADD https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_amd64.zip /tmp/pb.zip
RUN unzip /tmp/pb.zip -d /pb/ \
    && chmod +x /pb/pocketbase

EXPOSE 8090

CMD ["/pb/pocketbase", "serve", "--http=0.0.0.0:8090"]