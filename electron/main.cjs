// Electron main process.
// In production it boots the bundled Express server (dist/index.cjs) on a free
// loopback port and points a window at it. In development it attaches to the
// server already started by `npm run dev`.
const { app, BrowserWindow, dialog, shell } = require("electron");
const path = require("path");
const http = require("http");
const net = require("net");

const isDev = process.env.ELECTRON_DEV === "1";

let mainWindow = null;
let appOrigin = null;

function findFreePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.unref();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

function waitForServer(port, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;

  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get({ host: "127.0.0.1", port, path: "/" }, (res) => {
        res.resume();
        resolve();
      });
      req.on("error", () => {
        if (Date.now() > deadline) {
          reject(new Error(`Server did not respond on port ${port} within ${timeoutMs}ms`));
        } else {
          setTimeout(attempt, 200);
        }
      });
    };
    attempt();
  });
}

async function startServer() {
  const port = await findFreePort();

  // The bundled server reads these at require time and starts listening immediately.
  process.env.PORT = String(port);
  process.env.HOST = "127.0.0.1"; // loopback only, never exposed to the local network
  process.env.NODE_ENV = "production";

  // Lists persist in the OS app-data folder, not inside the read-only app bundle.
  // REMAKER_DATA_DIR overrides it, e.g. to test a build without touching real lists.
  process.env.DATA_DIR = process.env.REMAKER_DATA_DIR || path.join(app.getPath("userData"), "data");

  require(path.join(__dirname, "..", "dist", "index.cjs"));
  await waitForServer(port);
  return port;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: "#ffffff",
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  // The Download button creates a blob and clicks an <a download>. Electron turns
  // that into a real download; the default handler prompts for a save location.
  mainWindow.webContents.session.on("will-download", (_event, item) => {
    item.once("done", (_e, state) => {
      if (state === "interrupted") {
        dialog.showErrorBox(
          "Download failed",
          `Could not save ${item.getFilename()}. Please try again.`,
        );
      }
    });
  });

  // Keep the window on the app's own origin; send anything else to the real browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (new URL(url).origin !== appOrigin) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  mainWindow.loadURL(appOrigin);
}

app.whenReady().then(async () => {
  try {
    const port = isDev ? parseInt(process.env.PORT || "3000", 10) : await startServer();
    appOrigin = `http://127.0.0.1:${port}`;

    if (isDev) {
      await waitForServer(port);
    }

    createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  } catch (err) {
    dialog.showErrorBox("Remaker failed to start", String(err && err.message ? err.message : err));
    app.quit();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
