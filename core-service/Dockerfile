FROM golang:alpine AS build
WORKDIR /build

# Copy kai framework source (local dependency)
COPY kai/ /build/kai/

# Copy core-service source under Capstone/core-service so relative replace directive ../../kai resolves correctly
COPY Capstone/core-service/ /build/Capstone/core-service/

WORKDIR /build/Capstone/core-service
RUN go mod tidy && CGO_ENABLED=0 go build -o /build/server ./cmd/main.go

FROM alpine:3.19
RUN apk add --no-cache curl
WORKDIR /app
COPY --from=build /build/server .
EXPOSE 8081
CMD ["./server"]
