
#!/bin/bash

echo "Updating Termux package lists..."
pkg update -y
pkg upgrade -y

echo "Installing Node.js (LTS), npm, and git..."
pkg install nodejs-lts git -y

echo "Ensuring npm is up to date..."
npm install -g npm

echo ""
echo "Installation complete."
echo "Node version:"
node -v
echo "npm version:"
npm -v
echo ""
echo "Next steps:"
echo "1. Get your Node Weaver app code onto your device (e.g., using 'git clone')."
echo "2. Navigate to your app directory: cd /path/to/your/node-weaver-app"
echo "3. Install project dependencies: npm install"
echo "4. Run the app: bash start_nodeweaver.sh (or edit start_nodeweaver.sh first to set the correct project path)."
