FROM node:20-alpine

WORKDIR /app

# TODO: Hoàn thiện Dockerfile cho từng môi trường triển khai sau.
COPY . .

CMD ["node", "-e", "console.log('TODO: configure monorepo container image')"]