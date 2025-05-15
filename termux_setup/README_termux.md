
# Node Weaver on Termux (Android)

This guide helps you set up and run the Node Weaver Next.js application on your Android device using Termux.

## Prerequisites

1.  **Termux App:** Install Termux from F-Droid or the Google Play Store. (Note: The Play Store version might be outdated; F-Droid is generally recommended for the latest version).
2.  **Internet Connection:** For downloading packages.
3.  **Your Node Weaver App Code:** You'll need to get the project files onto your device.

## Setup Steps

1.  **Open Termux.**

2.  **Update Termux Packages:**
    Run the following commands to update and upgrade Termux's package lists:
    ```bash
    pkg update
    pkg upgrade
    ```

3.  **Install Dependencies:**
    Run the `install_deps.sh` script provided in this folder, or execute the commands manually:
    ```bash
    bash install_deps.sh
    ```
    This script will install:
    *   `nodejs-lts` (Node.js Long Term Support version)
    *   `git` (for cloning your project if needed)
    *   It also runs `npm install -g npm` to ensure npm is up-to-date.

4.  **Get Your App Code:**
    You have a few options:
    *   **Using Git (Recommended):** If your project is on GitHub or another Git repository:
        ```bash
        git clone <your_repository_url> node-weaver-app
        cd node-weaver-app
        ```
        Replace `<your_repository_url>` with the actual URL.
    *   **Copying Files:** Manually copy your entire project folder to your Termux home directory (e.g., into a folder named `node-weaver-app`). You can do this via USB, cloud storage, or other file transfer methods. The path in Termux will typically be `/data/data/com.termux/files/home/node-weaver-app`.

5.  **Navigate to Project Directory:**
    Open Termux and navigate to your project folder:
    ```bash
    cd /path/to/your/node-weaver-app
    ```
    (e.g., `cd node-weaver-app` if you cloned it into the Termux home directory, or `cd /data/data/com.termux/files/home/node-weaver-app` if you copied it there directly).

6.  **Install Project Dependencies:**
    Inside your project directory, run:
    ```bash
    npm install
    ```
    This will install all the necessary packages defined in `package.json`.

## Running the Application

1.  **Ensure you are in your project directory in Termux.**

2.  **Run the Start Script:**
    Use the `start_nodeweaver.sh` script:
    ```bash
    bash start_nodeweaver.sh
    ```
    This script does the following:
    *   Navigates to a predefined project path (you **must edit `start_nodeweaver.sh`** to set the correct path to your app if it's different from `/data/data/com.termux/files/home/node-weaver-app`).
    *   Runs `npm run dev`. This command starts the Next.js development server.
    *   The `dev` script in `package.json` is configured to host on `0.0.0.0` and port `9002`, making it accessible on your local Wi-Fi network.

3.  **Accessing the App:**
    *   **On your phone:** Open a web browser and go to `http://localhost:9002`.
    *   **On other devices on the same Wi-Fi network:** Find your phone's IP address (usually in Wi-Fi settings). Then, on another device (laptop, tablet), open a web browser and go to `http://<your_phone_ip_address>:9002` (e.g., `http://192.168.1.105:9002`).

4.  **Stopping the App:**
    The `npm run dev` process will run in the foreground in your Termux session. To stop it, press `Ctrl+C` in the Termux window where it's running.

## Data Storage

*   The application now saves node and edge data to JSON files (`nodes.json`, `edges.json`) inside a `data` directory within your project folder on your phone's storage (e.g., `/data/data/com.termux/files/home/node-weaver-app/data/`).
*   This data persists as long as these files are not deleted. You can back up the entire `node-weaver-app` folder, including the `data` subfolder.
*   The "Download Data" and "Upload Data" buttons in the app provide a way to export and import your graph data as a single `node_weaver_data.json` file.

## Troubleshooting

*   **Permissions:** If scripts don't run, make them executable: `chmod +x install_deps.sh` and `chmod +x start_nodeweaver.sh`.
*   **Port in Use:** If port `9002` is already in use, you can change it in the `package.json` (`dev` script) and in `start_nodeweaver.sh`.
*   **Network Access:** Ensure your phone and other devices are on the same Wi-Fi network. Firewalls (though less common on phones) could potentially block access.
*   **Termux Storage Access:** You might need to run `termux-setup-storage` once if you have issues accessing files copied from external storage, though usually accessing files within Termux's own home directory is fine.
