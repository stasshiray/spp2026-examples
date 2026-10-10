import type { Express } from "express";
import { serve, setup } from "swagger-ui-express";
import { openApiDocument } from "../openapi/document";

export function mountOpenApi(app: Express) {
  app.get("/openapi.json", (_req, res) => {
    res.json(openApiDocument);
  });

  app.use("/docs", (req, res, next) => {
    if (req.originalUrl.split("?")[0] === "/docs") {
      res.redirect(308, "/docs/");

      return;
    }

    next();
  });

  app.use(
    "/docs",
    serve,
    setup(openApiDocument, {
      customSiteTitle: "Знакомства API",
      swaggerOptions: { persistAuthorization: true },
    }),
  );
}
