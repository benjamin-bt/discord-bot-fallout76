# 1. Base Image: Use an official Node.js runtime. Choose a version suitable for your project.
FROM node:18-slim

# 2. Set Working Directory
WORKDIR /usr/src/app

# 3. Install Chrome and Dependencies for Puppeteer
# Based on Puppeteer troubleshooting docs and best practices for Docker
RUN apt-get update \
    && apt-get install -y wget gnupg ca-certificates procps \
    # Add Google Chrome repository
    && wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' \
    # Install Google Chrome Stable
    && apt-get update \
    && apt-get install -y google-chrome-stable \
      --no-install-recommends \
    # Clean up APT caches to reduce image size
    && rm -rf /var/lib/apt/lists/* \
    # Add user for running Puppeteer without root privileges (recommended)
    && groupadd -r pptruser && useradd -r -g pptruser -G audio,video pptruser \
    && mkdir -p /home/pptruser/Downloads \
    && chown -R pptruser:pptruser /home/pptruser \
    && chown -R pptruser:pptruser /usr/src/app

# 4. Copy package files
COPY package.json package-lock.json* ./

# 5. Install Node.js dependencies (as the non-root user)
# Ensure correct permissions for npm install
RUN chown -R pptruser:pptruser .
USER pptruser
# Install only production dependencies
RUN npm install --production

# 6. Copy application code (as the non-root user)
COPY --chown=pptruser:pptruser . .

# 7. Expose the port the app runs on (for health checks)
# This should match the 'port' variable in your index.js (default 8080)
EXPOSE 8080

# 8. Set the default command to run the bot (as the non-root user)
CMD [ "node", "index.js" ]
