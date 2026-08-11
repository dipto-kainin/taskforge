# ── Stage 1: Dependency Cache ─────────────────────────────────────
# This layer is cached by Render as long as pom.xml doesn't change.
FROM eclipse-temurin:21-jdk AS build
WORKDIR /app
RUN apt-get update && apt-get install -y unzip && rm -rf /var/lib/apt/lists/*

# Copy only pom.xml + maven wrapper first — cached until pom.xml changes
COPY pom.xml .
COPY .mvn .mvn
COPY mvnw .
RUN chmod +x mvnw && ./mvnw dependency:go-offline -B

# Copy source and build — only re-runs when source changes
COPY src src
RUN ./mvnw package -DskipTests -B

# ── Stage 2: Lean Runtime Image ───────────────────────────────────
FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /app/target/*.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-Xmx256m", "-Xms128m", "-jar", "app.jar"]
