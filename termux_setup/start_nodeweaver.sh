
#!/bin/bash

# !!! IMPORTANT !!!
# EDIT THE LINE BELOW to the correct path where your Node Weaver app is located in Termux.
# Example: If you cloned it directly into Termux home, it might be:
# APP_DIR="/data/data/com.termux/files/home/your-project-folder-name"
# Or if you have a 'projects' folder in Termux home:
# APP_DIR="/data/data/com.termux/files/home/projects/your-project-folder-name"

APP_DIR="/data/data/com.termux/files/home/node-weaver-app" # Default, change if needed

# --- Do not edit below this line unless you know what you are doing ---

echo "Attempting to navigate to Node Weaver app directory: ${APP_DIR}"

if [ -d "${APP_DIR}" ]; then
  cd "${APP_DIR}"
  echo "Successfully navigated to ${APP_DIR}"
  echo "Current directory: $(pwd)"

  # Check if node_modules exists, if not, remind to run npm install
  if [ ! -d "node_modules" ]; then
    echo ""
    echo "WARNING: 'node_modules' directory not found."
    echo "Please ensure you have run 'npm install' in this directory."
    echo ""
  fi
  
  echo "Starting Node Weaver application..."
  echo "To stop the server, press Ctrl+C."
  echo "Access the app at http://localhost:9002 or http://<your_phone_ip>:9002 from other devices on the same network."
  
  # The package.json dev script is configured for:
  # next dev --turbopack -H 0.0.0.0 -p 9002
  npm run dev
else
  echo "ERROR: Directory ${APP_DIR} does not exist."
  echo "Please edit this script (start_nodeweaver.sh) and set the APP_DIR variable to the correct path of your Node Weaver application."
fi
