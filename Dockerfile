# Use Node.js LTS version
FROM node:20-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    python3 \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY packages/*/package*.json ./packages/

# Install dependencies
RUN npm install

# Copy the rest of the application
COPY . .

# Expose the development server port
EXPOSE 8080

# Start the development server
CMD ["npm", "run", "dev"] 