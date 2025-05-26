FROM node:20-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    python3 \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy root package files first
COPY package*.json ./

# Copy all package.json files from packages directory
COPY packages/ ./packages/

# Install all dependencies (including workspace dependencies)
RUN npm install

# Copy the rest of the application
COPY . .

# Make sure all packages are properly linked
RUN npm run prepare || echo "No prepare script found"
RUN npm run build || echo "No build script found"

# Expose the development server port
EXPOSE 8080

# Start the development server
CMD ["npm", "run", "dev"]