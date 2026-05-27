import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import "./mobile.css";
import { registerServiceWorker } from "./lib/registerServiceWorker";

createRoot(document.getElementById("root")!).render(<App />);

// Register service worker for offline support
registerServiceWorker();
