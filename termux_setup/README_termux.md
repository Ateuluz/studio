
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
    *   **Recommended Location:** Store your Node Weaver app folder within your Termux home directory. This simplifies access and avoids potential issues with Android's scoped storage. Examples:
        *   Directly in home: `/data/data/com.termux/files/home/node-weaver-app`
        *   Inside a subfolder like 'projects': `/data/data/com.termux/files/home/projects/node-weaver-app`
    *   **Methods to get the code:**
        *   **Using Git (Recommended):** If your project is on GitHub or another Git repository:
            ```bash
            # Navigate to where you want to store the app, e.g., Termux home
            cd ~ 
            git clone <your_repository_url> node-weaver-app
            cd node-weaver-app
            ```
            Replace `<your_repository_url>` with the actual URL of your Node Weaver project.
        *   **Copying Files:** Manually copy your entire project folder to your chosen Termux location. You can do this via USB, cloud storage, or other file transfer methods.

5.  **Navigate to Project Directory:**
    Open Termux and navigate to your project folder (e.g., `cd ~/node-weaver-app` or `cd ~/projects/node-weaver-app`). Make sure to edit the `APP_DIR` variable in `start_nodeweaver.sh` to match this location.

6.  **Install Project Dependencies:**
    Inside your project directory, run:
    ```bash
    npm install
    ```
    This will install all the necessary packages defined in `package.json`.

## Running the Application

1.  **Ensure you are in your project directory in Termux OR ensure `start_nodeweaver.sh` points to the correct directory.**

2.  **Run the Start Script:**
    Use the `start_nodeweaver.sh` script:
    ```bash
    bash start_nodeweaver.sh
    ```
    This script does the following:
    *   Navigates to the predefined project path (you **must edit `start_nodeweaver.sh`** to set the correct `APP_DIR` if it's different from the default).
    *   Runs `npm run dev`. This command starts the Next.js development server.
    *   The `dev` script in `package.json` is configured to host on `0.0.0.0` and port `9002`, making it accessible on your local Wi-Fi network.
    *   After a short delay, it attempts to automatically open `http://localhost:9002` in your phone's default browser using `termux-open-url`.

3.  **Accessing the App:**
    *   **On your phone:** If `termux-open-url` works, it should open automatically. Otherwise, open a web browser and go to `http://localhost:9002`.
    *   **On other devices on the same Wi-Fi network:** Find your phone's IP address (usually in Wi-Fi settings). Then, on another device (laptop, tablet), open a web browser and go to `http://<your_phone_ip_address>:9002` (e.g., `http://192.168.1.105:9002`).

4.  **Stopping the App:**
    The `npm run dev` process will run in the foreground in your Termux session. To stop it, press `Ctrl+C` in the Termux window where it's running.

## Using Termux Shortcuts for Quick Launch (Optional)

Termux allows you to create home screen widgets that run scripts. This can be a convenient way to launch Node Weaver.

1.  **Create the Shortcut Directory (if it doesn't exist):**
    ```bash
    mkdir -p ~/.shortcuts
    ```
    The `~/.shortcuts` path is equivalent to `/data/data/com.termux/files/home/.shortcuts/`.

2.  **Place your `start_nodeweaver.sh` script (or a copy/symlink) in this directory.**
    *   Ensure the `start_nodeweaver.sh` script inside `~/.shortcuts/` has the correct `APP_DIR` path pointing to your actual Node Weaver application folder.
    *   Make sure the script is executable: `chmod +x ~/.shortcuts/start_nodeweaver.sh`.

3.  **Add Termux Widget:**
    *   Long-press on your Android home screen, select "Widgets," and find the "Termux shortcut" widget.
    *   Place it on your home screen. It should then list the scripts available in your `~/.shortcuts/` directory. Select `start_nodeweaver.sh`.

Now, tapping this widget will execute the script, start your Node Weaver server, and attempt to open it in your browser.

## Data Storage

*   The application now saves node and edge data to JSON files (`nodes.json`, `edges.json`) inside a `data` directory within your project folder on your phone's storage (e.g., `/data/data/com.termux/files/home/node-weaver-app/data/`).
*   This data persists as long as these files are not deleted. You can back up the entire `node-weaver-app` folder, including the `data` subfolder.
*   The "Download Data" and "Upload Data" buttons in the app provide a way to export and import your graph data as a single `node_weaver_data.json` file.

## Troubleshooting

*   **Permissions:** If scripts don't run, make them executable: `chmod +x install_deps.sh` and `chmod +x start_nodeweaver.sh`.
*   **Port in Use:** If port `9002` is already in use, you can change it in the `package.json` (`dev` script) and in `start_nodeweaver.sh`.
*   **Network Access:** Ensure your phone and other devices are on the same Wi-Fi network. Firewalls (though less common on phones) could potentially block access.
*   **Termux Storage Access:** You might need to run `termux-setup-storage` once if you have issues accessing files copied from external storage, though usually accessing files within Termux's own home directory is fine.
*   **`termux-open-url`:** This command relies on your Android system having a default browser set up and Termux being able to interact with it. If it doesn't open automatically, you can always manually open the browser to `http://localhost:9002`.

