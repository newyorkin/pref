import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App.js";
import LocalTestTable from "./LocalTestTable.js";

const root = document.getElementById("root");
if (root === null) {
  throw new Error("Root element is missing");
}

createRoot(root).render(
  <StrictMode>
    {window.location.pathname === "/testing" ? <LocalTestTable /> : <App />}
  </StrictMode>,
);
