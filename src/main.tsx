import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { installSessionPersistenceGuard } from "./lib/auth-persistence";

installSessionPersistenceGuard();

createRoot(document.getElementById("root")!).render(<App />);
