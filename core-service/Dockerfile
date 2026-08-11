FROM golang:alpine AS build
WORKDIR /app

# Copy go.mod and go.sum for caching
COPY go.mod go.sum ./
RUN go mod download

# Copy source
COPY . .

# Build static binary
RUN CGO_ENABLED=0 go build -o /app/server ./cmd/main.go

FROM alpine:3.19
RUN apk add --no-cache curl
WORKDIR /app
COPY --from=build /app/server .
EXPOSE 8081
CMD ["./server"]
