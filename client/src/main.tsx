import { createRoot } from "react-dom/client";
import App from "./App";
// Fonts are bundled locally rather than fetched from Google on every load.
import "@fontsource-variable/dm-sans";
import "@fontsource-variable/outfit";
import "@fontsource-variable/jetbrains-mono";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);
