import React from "react";
import "./styles.css";
import ReactDOM from "react-dom/client";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { rootRoute } from "./routes/__root";
import { indexRoute } from "./routes/index";

// 创建路由树
const routeTree = rootRoute.addChildren([indexRoute]);

// 创建路由实例
const router = createRouter({ routeTree });

// 类型声明
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);
